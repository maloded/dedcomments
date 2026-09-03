"use client";

import { useEffect } from "react";
import type { ApolloClient } from "@apollo/client";
import { useApolloClient } from "@apollo/client/react";
import { io } from "socket.io-client";
import { getBackendOrigin } from "@/lib/backendOrigin";
import { useSetConnectionStatus } from "@/lib/connectionStatus";
import { useShowToast } from "@/lib/toast";

const COMMENT_CREATED_EVENT = "commentCreated";
const COMMENT_HIDDEN_EVENT = "commentHidden";
const AUTHOR_BANNED_EVENT = "authorBanned";

/** Only the fields these handlers actually need from the broadcast payloads
 * (`CommentModel` for created, `{ id, parentId }` for hidden — see backend
 * `CommentHiddenPayload`, `{ id, username }` for banned). */
interface CommentEventPayload {
  parentId: string | null;
}
interface AuthorBannedPayload {
  username: string;
}

/**
 * Refetch whichever queries are affected by a comment appearing or
 * disappearing — shared by the `commentCreated` and `commentHidden` handlers,
 * since a hide is the inverse of a create with respect to what needs
 * updating (CLAUDE.md → Step 10): same `RootComments`/`CommentThread`
 * refetch-by-name logic either way. See the detailed reasoning below for why
 * refetching (not a raw cache write) is what makes this safe to call for
 * both the poster's/hider's own action *and* everyone else's, without any
 * double-counting.
 */
function refetchForCommentEvent(client: ApolloClient, parentId: string | null): void {
  void client.refetchQueries({
    include: parentId === null ? ["RootComments"] : ["RootComments", "CommentThread"],
  });
}

/**
 * Headless — owns the one Socket.IO connection for the app's lifetime and
 * turns broadcasts into Apollo refetches (or, for `authorBanned`, a toast).
 * No auth on the connection (matches the backend gateway — it only ever
 * broadcasts data that's already public via the GraphQL API).
 *
 * **Refetch, not a raw cache prepend/splice** — deliberately, for two reasons:
 *  1. `rootComments`/`commentThread` are sorted/paginated/tree-shaped; a
 *     manual cache edit would have to duplicate that placement logic
 *     client-side (and, for a hide, correctly remove a node from arbitrary
 *     depth in a tree) — refetching just re-asks the server, which already
 *     has it right.
 *  2. It sidesteps "don't double-count/double-remove a comment I acted on
 *     myself" structurally, not by adding dedup logic: without a custom
 *     `merge` function (none is configured — see `lib/apolloClient.ts`),
 *     Apollo's `InMemoryCache` *replaces* an object-typed query field
 *     wholesale on each fetch rather than appending to or patching it. So if
 *     `CommentForm`'s/`CommentThreadNode`'s own post-action `refetchQueries`
 *     and this socket handler both fire for the same event, the second
 *     refetch simply overwrites the field with the same (correct) result the
 *     first one already wrote — confirmed against Apollo's documented
 *     default field-merge behavior, not assumed.
 *
 * A reply's `CommentThread` refetch (create or hide) only actually updates
 * anything if its root's thread is currently mounted (i.e. expanded) —
 * `refetchQueries` is a no-op for a query with no active watcher.
 *
 * `RootComments` is refetched for every comment event, reply included — found
 * via manual testing in the previous session, not anticipated up front: a
 * direct reply bumps its root's `repliesCount` in the table, which lives in
 * `RootComments`, not `CommentThread`. Hiding a direct reply decrements it the
 * same way, so this applies identically to `commentHidden`.
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

    socket.on(COMMENT_CREATED_EVENT, (comment: CommentEventPayload) => {
      refetchForCommentEvent(client, comment.parentId);
    });

    socket.on(COMMENT_HIDDEN_EVENT, (comment: CommentEventPayload) => {
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
