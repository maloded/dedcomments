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
  id: string;
  parentId: string | null;
}

interface AuthorBannedPayload {
  username: string;
}

/**
 * Adjusts one comment's `repliesCount` in place via `cache.modify` on its
 * normalized `CommentModel` entity — used for a *reply* being created
 * (delta `+1`) or hidden (delta `-1`). This is the fix for the flicker this
 * session investigated: see `handleReplyCommentEvent`'s doc comment for the
 * full story of why a relative `cache.modify` replaces what used to be a
 * `refetchQueries(["RootComments", ...])` call here.
 *
 * Silently does nothing if the parent isn't a normalized entity in the cache
 * (e.g. its `RootComments` page was never fetched in this tab) — `modify`
 * returns `false` in that case, which is fine, there's nothing to update.
 */
function bumpRepliesCount(client: ApolloClient, parentId: string, delta: number): void {
  client.cache.modify({
    id: client.cache.identify({ __typename: "CommentModel", id: parentId }),
    fields: {
      repliesCount(existing: number) {
        return existing + delta;
      },
    },
  });
}

/**
 * Handles a *reply* `commentCreated`/`commentHidden` (parentId !== null).
 *
 * **This session's actual root cause, confirmed via a `MutationObserver` on
 * the table body (a scriptable, ground-truth stand-in for React DevTools'
 * Profiler/Paint-Flashing — this environment has no interactive DevTools
 * panel to read from), not assumed:** the old code called
 * `client.refetchQueries({ include: ["RootComments", "CommentThread"] })`
 * for every reply event. `RootCommentsTable`'s `useQuery` has
 * `notifyOnNetworkStatusChange: true`, so that refetch flips `loading` back
 * to `true` mid-flight — and the component's JSX gates on that flag
 * (`{loading && <5 skeleton rows>}` / `{!loading && <25 real rows>}`), so
 * the *entire* table tears down to skeleton placeholders and rebuilds with
 * 25 brand-new row elements once the refetch resolves. Measured directly:
 * 30 `<tr>` elements removed and 30 added for a single reply post (25 real
 * rows out, 5 skeleton rows in, 5 skeleton rows out, 25 new real rows in) —
 * not "every row re-renders with the same content", an actual full
 * teardown/rebuild, and the true cause of the reported flicker.
 *
 * Fixed by never refetching `RootComments` for this event at all:
 * `bumpRepliesCount` adjusts the affected comment's normalized entity
 * directly, which every active `RootComments` view already picks up
 * automatically (Apollo re-reads any query whose result depended on that
 * entity) — no network round-trip, no `loading` flip, no skeleton swap.
 * `CommentThread` is still refetched (a no-op unless that root's thread
 * happens to be open) — unlike `rootComments`' flat list, correctly
 * patching a `ThreadCommentModel` node at arbitrary depth in a tree isn't
 * worth it for this pass, same reasoning Step 17 used to leave it alone.
 *
 * **Why this had to be a relative `cache.modify`, and why that required
 * touching `CommentForm`/`CommentThreadNode` too, not just this file:**
 * Step 17's root-comment insert is safe to coexist with the poster's own
 * `refetchQueries: ["RootComments"]` in *either* firing order, because
 * "insert this id if it's not already present" is idempotent — a redundant
 * full refetch just reconfirms the same correct list. A relative `+1`/`-1`
 * is not: if the poster's own mutation's refetch resolves *after* this
 * handler's `cache.modify` already applied the delta, nothing breaks (the
 * refetch's absolute value simply reconfirms it); but if it resolves
 * *before*, the delta then applies a second time on top of an already-
 * correct count. There's no reliable way to detect "was this specific
 * delta already reflected by a fetch" from inside `cache.modify` alone, so
 * the actual fix is structural: `CommentForm`'s reply `onSuccess` and
 * `CommentThreadNode`'s reply-hide `onSuccess` no longer refetch
 * `RootComments` themselves — this socket handler is now the *only* code
 * path that ever touches a comment's `repliesCount` in the cache, for
 * every tab including the poster's/hider's own (which also receives its
 * own broadcast).
 */
function handleReplyCommentEvent(client: ApolloClient, delta: number, parentId: string): void {
  bumpRepliesCount(client, parentId, delta);
  void client.refetchQueries({ include: ["CommentThread"] });
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
        // prevents a duplicate row regardless of which one lands first —
        // safe specifically *because* an insert is idempotent that way,
        // unlike the relative repliesCount adjustment in
        // `handleReplyCommentEvent` above (see that function's doc comment
        // for why a reply's cache write couldn't rely on the same trick).
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
 * Handles a *root* `commentHidden` (parentId === null) with a targeted
 * removal instead of a refetch — same flicker mechanism and same fix shape
 * as `handleRootCommentCreated`, just removing instead of inserting.
 *
 * Unlike an insert, a removal doesn't need "does this belong on the
 * currently-viewed page/sort" logic at all: filtering a hidden id out of
 * whatever's cached is correct regardless of sort order, so *every* active
 * `RootComments` observable is patched directly here — no non-default-sort
 * fallback to `observable.refetch()` needed. Filtering an id that isn't in
 * a given view's cached page is a safe no-op (nothing to remove); this
 * still decrements that view's `totalCount`/`totalPages`, since those are
 * global counts unaffected by which page happens to be open.
 */
function handleRootCommentHidden(client: ApolloClient, id: string): void {
  for (const observable of client.getObservableQueries("active")) {
    if (observable.queryName !== "RootComments") continue;
    const variables = observable.variables as RootCommentsQueryVariables;

    client.cache.updateQuery<RootCommentsQuery, RootCommentsQueryVariables>(
      { query: RootCommentsDocument, variables },
      (data) => {
        if (!data) return data;

        const items = data.rootComments.items.filter((item) => item.id !== id);
        // Nothing to do if this id was never in this view's cached page —
        // still fine to have decremented nothing, since the totalCount
        // adjustment below only makes sense once, and re-running it for
        // every already-hidden id would drift the count. Bail here so a
        // redundant delivery (e.g. this handler somehow running twice for
        // the same id) can't double-decrement.
        if (items.length === data.rootComments.items.length) return data;

        const totalCount = Math.max(0, data.rootComments.totalCount - 1);

        return {
          rootComments: {
            ...data.rootComments,
            items,
            totalCount,
            totalPages: Math.max(1, Math.ceil(totalCount / ROOT_COMMENTS_PER_PAGE)),
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
 * Every `commentCreated`/`commentHidden` event now resolves to a targeted
 * cache write — `handleRootCommentCreated`/`handleRootCommentHidden` for a
 * root (parentId === null), `handleReplyCommentEvent` for a reply — and
 * `RootComments` is never refetched from here or from `CommentForm`'s/
 * `CommentThreadNode`'s own mutation success handlers anymore. See each
 * function's doc comment for the specifics; `handleReplyCommentEvent`'s in
 * particular explains why a relative count adjustment needed those other
 * two files changed too, not just this one.
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
        handleReplyCommentEvent(client, 1, comment.parentId);
      }
    });

    socket.on(COMMENT_HIDDEN_EVENT, (comment: CommentHiddenPayload) => {
      if (comment.parentId === null) {
        handleRootCommentHidden(client, comment.id);
      } else {
        handleReplyCommentEvent(client, -1, comment.parentId);
      }
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
