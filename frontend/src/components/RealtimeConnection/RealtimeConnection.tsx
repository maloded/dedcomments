"use client";

import { useEffect } from "react";
import { useApolloClient } from "@apollo/client/react";
import { io } from "socket.io-client";
import { getBackendOrigin } from "@/lib/backendOrigin";
import { useSetConnectionStatus } from "@/lib/connectionStatus";

const COMMENT_CREATED_EVENT = "commentCreated";

/** Only the fields this component actually needs from the broadcast `CommentModel`. */
interface CommentCreatedPayload {
  parentId: string | null;
}

/**
 * Headless — owns the one Socket.IO connection for the app's lifetime and
 * turns `commentCreated` broadcasts into Apollo refetches. No auth on the
 * connection (matches the backend gateway — it only ever broadcasts data
 * that's already public via the GraphQL API).
 *
 * **Refetch, not a raw cache prepend** — deliberately, for two reasons:
 *  1. `rootComments`/`commentThread` are sorted/paginated/tree-shaped; a
 *     manual cache splice would have to duplicate that logic client-side to
 *     land a new item in the right spot (or not, if it doesn't belong on the
 *     page/sort currently in view) — refetching just re-asks the server,
 *     which already knows.
 *  2. It sidesteps the "don't double-count a comment I just posted myself"
 *     problem structurally, not by adding dedup logic: without a custom
 *     `merge` function (none is configured — see `lib/apolloClient.ts`),
 *     Apollo's `InMemoryCache` *replaces* an object-typed query field
 *     wholesale on each fetch rather than appending to it. So if
 *     `CommentForm`'s own post-submit `refetchQueries` and this socket
 *     handler both fire for the same new comment, the second refetch simply
 *     overwrites the field with the same (correct, non-duplicated) list the
 *     first one already wrote — confirmed against Apollo's documented
 *     default field-merge behavior, not assumed.
 *
 * A reply's `CommentThread` refetch only actually updates anything if its
 * root's thread is currently mounted (i.e. expanded) — `refetchQueries` is a
 * no-op for a query with no active watcher, so nothing else needs checking.
 *
 * `RootComments` is refetched for *every* new comment, reply included — found
 * via manual testing, not anticipated up front: a reply directly on a root
 * bumps that root's `repliesCount` in the table, which lives in `RootComments`,
 * not `CommentThread`. Mirrors what `CommentForm`'s own post-submit
 * `refetchQueries` already does for the poster's own reply; this just extends
 * that same reasoning to replies arriving from *other* users over the socket.
 */
export function RealtimeConnection() {
  const client = useApolloClient();
  const setStatus = useSetConnectionStatus();

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
      void client.refetchQueries({
        include: comment.parentId === null ? ["RootComments"] : ["RootComments", "CommentThread"],
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [client, setStatus]);

  return null;
}
