"use client";

import { useState } from "react";
import { useMutation } from "@apollo/client/react";
import { CombinedGraphQLErrors } from "@apollo/client/errors";
import { useModeratorAuth } from "@/lib/moderatorAuth";
import { BanAuthorDocument, HideCommentDocument } from "@/graphql/generated";

/** True if any error in a mutation's `CombinedGraphQLErrors` was UNAUTHORIZED
 * — an expired/invalid JWT, meaning the moderator session should be dropped
 * rather than left looking logged-in while every action silently fails. */
function isUnauthorized(err: unknown): boolean {
  return (
    CombinedGraphQLErrors.is(err) &&
    err.errors.some((e) => e.extensions?.code === "UNAUTHORIZED")
  );
}

interface UseModerationActionsArgs {
  commentId: string;
  authorId: string;
}

interface UseModerationActionsResult {
  /** Whether a moderator is logged in — call sites gate the whole controls
   * block on this (same `useModeratorAuth()` context that gates it elsewhere). */
  isLoggedIn: boolean;
  hide: () => Promise<void>;
  ban: () => Promise<void>;
  hiding: boolean;
  banning: boolean;
  /** Sticky once the ban succeeds — the call site swaps the button for a
   * "Banned" label. */
  banned: boolean;
  /** A user-facing message for the most recent failed action, or `null`. */
  error: string | null;
}

/**
 * Shared moderator hide/ban logic — the `hideComment` / `banAuthor` mutation
 * calls, JWT header wiring, error handling, and the `banned` latch — used by
 * both `CommentThreadNode` (replies, and re-rooted "Continue this thread"
 * view roots) and `RootCommentsTable`'s rows (every top-level comment,
 * whether or not it has an expandable reply thread). Extracted so the two
 * call sites don't carry two copies of this; each still renders its own
 * buttons where its own layout wants them.
 *
 * **`hide` deliberately refetches only `CommentThread`, never `RootComments`:**
 * - Hiding a *reply* needs the open thread to drop the node; the parent
 *   root's `repliesCount` is adjusted by a relative `cache.modify` in
 *   `RealtimeConnection`'s `commentHidden` handler, so a redundant absolute
 *   `RootComments` refetch here could double-apply against that `-1` delta.
 * - Hiding a *root* needs the table to drop the row — which
 *   `RealtimeConnection.handleRootCommentHidden` does via a targeted
 *   `cache.updateQuery` on receiving the `commentHidden` broadcast (every
 *   client gets it, including this one). A `RootComments` refetch instead
 *   would flip `RootCommentsTable`'s `loading` and tear the whole table
 *   down to skeleton rows and back — the flicker fixed in the
 *   cache-optimization sessions (CLAUDE.md Steps 17-18). The `CommentThread`
 *   refetch is a harmless no-op once the row (and any thread it mounted) is
 *   gone.
 */
export function useModerationActions({
  commentId,
  authorId,
}: UseModerationActionsArgs): UseModerationActionsResult {
  const { session, isLoggedIn, logout } = useModeratorAuth();
  const [hideCommentMutation, { loading: hiding }] = useMutation(HideCommentDocument);
  const [banAuthorMutation, { loading: banning }] = useMutation(BanAuthorDocument);
  const [error, setError] = useState<string | null>(null);
  const [banned, setBanned] = useState(false);

  async function hide() {
    if (!session) return;
    setError(null);
    try {
      await hideCommentMutation({
        variables: { commentId },
        context: { headers: { Authorization: `Bearer ${session.token}` } },
        refetchQueries: ["CommentThread"],
      });
    } catch (err) {
      if (isUnauthorized(err)) {
        logout();
        setError("Your session expired — please log in again.");
        return;
      }
      setError("Could not hide this comment. Please try again.");
    }
  }

  async function ban() {
    if (!session) return;
    setError(null);
    try {
      await banAuthorMutation({
        variables: { authorId },
        context: { headers: { Authorization: `Bearer ${session.token}` } },
      });
      setBanned(true);
    } catch (err) {
      if (isUnauthorized(err)) {
        logout();
        setError("Your session expired — please log in again.");
        return;
      }
      setError("Could not ban this author. Please try again.");
    }
  }

  return { isLoggedIn, hide, ban, hiding, banning, banned, error };
}
