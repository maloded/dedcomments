"use client";

import { useEffect } from "react";
import type { ApolloClient } from "@apollo/client";
import { useApolloClient } from "@apollo/client/react";
import { io } from "socket.io-client";
import { getBackendOrigin } from "@/lib/backendOrigin";
import { useSetConnectionStatus } from "@/lib/connectionStatus";
import { useShowToast } from "@/lib/toast";
import {
  RootCommentsDocument,
  type RootCommentsQuery,
  type RootCommentsQueryVariables,
} from "@/graphql/generated";

const COMMENT_CREATED_EVENT = "commentCreated";
const COMMENT_HIDDEN_EVENT = "commentHidden";
const AUTHOR_BANNED_EVENT = "authorBanned";

// Mirrors the backend's `ROOT_COMMENTS_PER_PAGE`
// (backend/src/shared/constants/pagination.constants.ts) — needed here to
// decide whether inserting a new comment overflows the currently-cached
// page, same hand-mirrored-constant pattern as `lib/validation.ts`.
const ROOT_COMMENTS_PER_PAGE = 25;

/** The full `CommentModel` the backend gateway broadcasts (see
 * `emitCommentCreated`) — a raw Socket.IO JSON payload, not a GraphQL
 * response, so it carries no `__typename`s of its own. */
interface CommentCreatedPayload {
  id: string;
  text: string;
  parentId: string | null;
  createdAt: string;
  repliesCount: number;
  author: { id: string; username: string; email: string };
}

interface CommentHiddenPayload {
  parentId: string | null;
}

interface AuthorBannedPayload {
  username: string;
}

/**
 * Refetch whichever queries are affected by a comment disappearing — used
 * for `commentHidden` (both root and reply hides) and for a *reply* being
 * created (see `handleCommentCreated` below for why creates split into two
 * paths). Kept exactly as it was — see CLAUDE.md's Step 10/13-16 entries —
 * refetching a tree-shaped `commentThread` (or removing a node from
 * arbitrary depth in one) isn't worth a targeted cache edit, and there's
 * still no double-counting risk here: without a custom `merge` function,
 * `InMemoryCache` replaces an object-typed field wholesale on each fetch, so
 * two refetches for the same event just each write the same correct result.
 */
function refetchForCommentEvent(client: ApolloClient, parentId: string | null): void {
  void client.refetchQueries({
    include: parentId === null ? ["RootComments"] : ["RootComments", "CommentThread"],
  });
}

/**
 * Handles a *root* `commentCreated` (parentId === null) with a targeted
 * cache write instead of a refetch — a refetch replaces `rootComments`
 * wholesale, which re-renders every row in the table even though only one
 * changed (visible flicker, reported from two-tab testing against the
 * 56+-comment seed data).
 *
 * Only the currently-*active* `RootComments` observable(s) are touched
 * (`getObservableQueries("active")` — a query nobody is watching needs
 * nothing done to it; it'll fetch fresh whenever it next mounts). For each
 * active one:
 * - the default LIFO view (page 1, sortBy CREATED_AT, sortOrder DESC) is
 *   where a brand-new comment unambiguously belongs (at the very top) — this
 *   is the one case worth hand-writing the cache for, and the one the
 *   two-tab flicker report was actually about;
 *   - any other page/sort combination (a later page, or sorted by username/
 *   email) is refetched instead of positioned client-side — reimplementing
 *   the backend's sort/pagination logic here isn't worth it for the other
 *   less-common cases, and refetching only the *one* other active query
 *   (via `ObservableQuery.refetch()`) is still far cheaper than the old
 *   `refetchQueries` broadcasting to every `RootComments` watcher.
 */
function handleRootCommentCreated(client: ApolloClient, comment: CommentCreatedPayload): void {
  for (const observable of client.getObservableQueries("active")) {
    // Match by operation name, not `observable.query !== RootCommentsDocument`
    // — `ObservableQuery.query` returns Apollo's internally *transformed*
    // document (confirmed against the installed client's own source: it
    // returns `this.lastQuery`, assigned from a `transformDocument` call,
    // never the raw document passed to `useQuery`), so a reference check
    // against the untransformed `RootCommentsDocument` never matches. The
    // operation name is stable across that transform and is exactly what
    // `refetchQueries({ include: ["RootComments"] })` itself matches by.
    if (observable.queryName !== "RootComments") continue;

    const variables = observable.variables as RootCommentsQueryVariables;
    const isDefaultLifoFirstPage =
      variables.page === 1 && variables.sortBy === "CREATED_AT" && variables.sortOrder === "DESC";

    if (!isDefaultLifoFirstPage) {
      void observable.refetch();
      continue;
    }

    client.cache.updateQuery<RootCommentsQuery, RootCommentsQueryVariables>(
      { query: RootCommentsDocument, variables },
      (data) => {
        if (!data) return data;

        // Dedup by id: the poster's own `CommentForm` submission already
        // triggers its own `refetchQueries: ["RootComments"]` on success —
        // that refetch and this socket-driven cache write both fire for the
        // same new comment (this client receives its own broadcast too), in
        // either order. Skipping an id that's already present is what
        // prevents a duplicate row regardless of which one lands first.
        const alreadyPresent = data.rootComments.items.some((item) => item.id === comment.id);
        if (alreadyPresent) return data;

        // Cast, not annotated: the generated `RootCommentsQuery` type has no
        // `__typename` field (this codegen setup doesn't add one — see
        // CLAUDE.md's Step 6 codegen notes), but the cache needs it on every
        // normalized object to identify/merge it consistently with data that
        // *did* come from a real network response (which always carries it).
        const newItem = {
          __typename: "CommentModel",
          id: comment.id,
          text: comment.text,
          createdAt: comment.createdAt,
          repliesCount: comment.repliesCount,
          author: {
            __typename: "AuthorModel",
            id: comment.author.id,
            username: comment.author.username,
            email: comment.author.email,
          },
        } as RootCommentsQuery["rootComments"]["items"][number];

        const items = [newItem, ...data.rootComments.items];
        // A full page (already at ROOT_COMMENTS_PER_PAGE before this insert)
        // that grows past the limit has its new 26th-from-the-bottom item
        // drop off — it now belongs on page 2, which a real refetch would
        // reflect; this just keeps page 1's count matching what the server
        // would return without waiting for one. A page that started under
        // the limit (e.g. the only page there is) is left to grow normally.
        if (items.length > ROOT_COMMENTS_PER_PAGE) items.length = ROOT_COMMENTS_PER_PAGE;

        const totalCount = data.rootComments.totalCount + 1;

        return {
          rootComments: {
            ...data.rootComments,
            items,
            totalCount,
            totalPages: Math.ceil(totalCount / ROOT_COMMENTS_PER_PAGE),
          },
        };
      },
    );
  }
}

/**
 * Headless — owns the one Socket.IO connection for the app's lifetime and
 * turns broadcasts into Apollo cache updates/refetches (or, for
 * `authorBanned`, a toast). No auth on the connection (matches the backend
 * gateway — it only ever broadcasts data that's already public via the
 * GraphQL API).
 *
 * `commentCreated` splits into two paths: a *root* comment gets the targeted
 * cache write in `handleRootCommentCreated` (see its own doc comment for
 * why); a *reply* still goes through `refetchForCommentEvent` for both
 * `RootComments` (a direct reply bumps its root's `repliesCount`, found via
 * manual testing in an earlier session — see CLAUDE.md Step 9) and
 * `CommentThread` (only actually updates anything if that root's thread is
 * currently expanded — `refetchQueries` no-ops for an inactive query).
 * Deliberately not optimized the same way: unlike a brand-new root row,
 * "bump one existing row's count" and "insert into a tree at arbitrary
 * depth" aren't the flicker complaint this pass was scoped to, and
 * `commentThread`'s tree shape makes a targeted edit meaningfully harder to
 * get right than `rootComments`' flat list.
 *
 * `commentHidden` is untouched — still refetches for both root and reply
 * hides, exactly as before this session.
 */
export function RealtimeConnection() {
  const client = useApolloClient();
  const setStatus = useSetConnectionStatus();
  const showToast = useShowToast();

  useEffect(() => {
    const socket = io(getBackendOrigin(), {
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => setStatus("connected"));
    socket.on("disconnect", () => setStatus("disconnected"));
    socket.on("connect_error", () => setStatus("disconnected"));
    // Reconnection itself is Socket.IO's own job (default: enabled, with
    // backoff) — this only reflects its state, never drives the retry.
    socket.io.on("reconnect_attempt", () => setStatus("reconnecting"));
    socket.io.on("reconnect", () => setStatus("connected"));

    socket.on(COMMENT_CREATED_EVENT, (comment: CommentCreatedPayload) => {
      if (comment.parentId === null) {
        handleRootCommentCreated(client, comment);
      } else {
        refetchForCommentEvent(client, comment.parentId);
      }
    });

    socket.on(COMMENT_HIDDEN_EVENT, (comment: CommentHiddenPayload) => {
      refetchForCommentEvent(client, comment.parentId);
    });

    // No comment data to update here — banning doesn't touch any existing
    // comment (brief: "existing comments stay"). Just needs to be received
    // without erroring; the toast is the explicitly optional "nice to have".
    socket.on(AUTHOR_BANNED_EVENT, (author: AuthorBannedPayload) => {
      showToast(`${author.username} was banned by a moderator.`);
    });

    return () => {
      socket.disconnect();
    };
  }, [client, setStatus, showToast]);

  return null;
}
