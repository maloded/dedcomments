"use client";

import { useState, type CSSProperties } from "react";
import { useMutation } from "@apollo/client/react";
import { CombinedGraphQLErrors } from "@apollo/client/errors";
import { Button } from "@/shared/ui/Button";
import { CommentForm } from "@/components/CommentForm";
import { AttachmentPreview } from "@/components/AttachmentPreview";
import { previewCommentHtml } from "@/shared/lib/commentPreview";
import { classNames } from "@/shared/lib/classNames";
import { useModeratorAuth } from "@/lib/moderatorAuth";
import { BanAuthorDocument, HideCommentDocument } from "@/graphql/generated";
import cls from "./CommentThread.module.scss";

/** True if any error in a mutation's `CombinedGraphQLErrors` was UNAUTHORIZED
 * — an expired/invalid JWT, meaning the moderator session should be dropped
 * rather than left looking logged-in while every action silently fails. */
function isUnauthorized(err: unknown): boolean {
  return CombinedGraphQLErrors.is(err) && err.errors.some((e) => e.extensions?.code === "UNAUTHORIZED");
}

/**
 * The render-friendly shape `CommentThreadNode` recurses over. Structurally
 * satisfied by `CommentThreadQuery["commentThread"]` (and each level of its
 * `replies`) — see `CommentThread.tsx`, which does the one bounded cast where
 * the generated type (fetched to a fixed depth — see commentThread.graphql)
 * meets this self-referential interface.
 */
export interface ThreadNode {
  id: string;
  text: string;
  parentId: string | null;
  createdAt: string;
  repliesCount: number;
  author: { id: string; username: string; email: string };
  attachment: {
    id: string;
    type: "IMAGE" | "TEXT";
    url: string;
    originalName: string;
  } | null;
  replies: ThreadNode[];
}

/**
 * Matches CLAUDE.md → "Tree rendering on the frontend": indentation grows with
 * depth up to this cap, then stays fixed (a left "thread line" border carries
 * the rest of the visual nesting so deep threads don't run off screen). Halved
 * on mobile via `$breakpoint-mobile` — see CommentThread.module.scss.
 */
const MAX_VISUAL_DEPTH = 6;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

interface CommentThreadNodeProps {
  node: ThreadNode;
  depth: number;
  /** Bubbled up to `CommentThread`'s `refetch()` after a reply is posted. */
  onReplyPosted: () => void;
}

/**
 * One comment plus its replies, rendered recursively. Depth-capped indentation
 * (see `MAX_VISUAL_DEPTH`); replies render in the order the backend already
 * returns them (LIFO per level — no client-side re-sorting). Collapsing a
 * subtree is plain React state, not a re-fetch — the data's already in hand.
 */
export function CommentThreadNode(props: CommentThreadNodeProps) {
  const { node, depth, onReplyPosted } = props;
  const [collapsed, setCollapsed] = useState(false);
  const [replying, setReplying] = useState(false);
  const [moderationError, setModerationError] = useState<string | null>(null);
  const [banned, setBanned] = useState(false);

  const { session, isLoggedIn, logout } = useModeratorAuth();
  const [hideCommentMutation, { loading: hiding }] = useMutation(HideCommentDocument);
  const [banAuthorMutation, { loading: banning }] = useMutation(BanAuthorDocument);

  const visualDepth = Math.min(depth, MAX_VISUAL_DEPTH);
  const hasReplies = node.replies.length > 0;

  async function handleHide() {
    if (!session) return;
    setModerationError(null);
    try {
      await hideCommentMutation({
        variables: { commentId: node.id },
        context: { headers: { Authorization: `Bearer ${session.token}` } },
        // Whichever of these is actually mounted picks up the change: the
        // root row (and its repliesCount) if this was a reply, or the whole
        // row disappearing from the list if this was the root itself — same
        // refetch-by-name pattern as CommentForm/RealtimeConnection.
        refetchQueries: ["RootComments", "CommentThread"],
      });
    } catch (err) {
      if (isUnauthorized(err)) {
        logout();
        setModerationError("Your session expired — please log in again.");
        return;
      }
      setModerationError("Could not hide this comment. Please try again.");
    }
  }

  async function handleBan() {
    if (!session) return;
    setModerationError(null);
    try {
      await banAuthorMutation({
        variables: { authorId: node.author.id },
        context: { headers: { Authorization: `Bearer ${session.token}` } },
      });
      setBanned(true);
    } catch (err) {
      if (isUnauthorized(err)) {
        logout();
        setModerationError("Your session expired — please log in again.");
        return;
      }
      setModerationError("Could not ban this author. Please try again.");
    }
  }

  // `--depth` drives the indent in CSS (`calc(var(--depth) * var(--space-N))`)
  // — a per-instance value CSS Modules can't express as a static class, same
  // pattern as `Skeleton`'s inline `width`/`height`.
  const style = { "--depth": visualDepth } as CSSProperties;

  return (
    <div
      className={classNames(cls.CommentThreadNode, { [cls.root]: depth === 0 })}
      style={style}
    >
      <div className={cls.body}>
        <div className={cls.meta}>
          {hasReplies && (
            <Button
              size="sm"
              variant="clear"
              className={cls.collapseToggle}
              onClick={() => setCollapsed((c) => !c)}
              aria-expanded={!collapsed}
            >
              {collapsed ? `+ ${node.repliesCount}` : "−"}
            </Button>
          )}
          <span className={cls.username}>{node.author.username}</span>
          <span className={cls.date}>{formatDate(node.createdAt)}</span>
          {isLoggedIn && (
            <span className={cls.banStatus}>
              {banned ? (
                "Banned"
              ) : (
                <Button size="sm" variant="clear" color="danger" onClick={() => void handleBan()} disabled={banning}>
                  {banning ? "Banning…" : "Ban author"}
                </Button>
              )}
            </span>
          )}
        </div>

        {/* Collapsing hides replies, not this comment's own text — the toggle
            summarizes a subtree, it isn't a way to hide the comment itself. */}
        <div
          className={cls.text}
          // previewCommentHtml is the same allowlist renderer the form's live
          // preview uses — safe here too: it only ever un-escapes the exact
          // tags the backend already validated this text against on submit.
          dangerouslySetInnerHTML={{ __html: previewCommentHtml(node.text) }}
        />
        {node.attachment && (
          <div className={cls.attachment}>
            <AttachmentPreview
              type={node.attachment.type}
              url={node.attachment.url}
              originalName={node.attachment.originalName}
            />
          </div>
        )}
        <div className={cls.actions}>
          <Button size="sm" variant="clear" onClick={() => setReplying((r) => !r)}>
            {replying ? "Cancel" : "Reply"}
          </Button>
          {isLoggedIn && (
            <Button size="sm" variant="clear" color="danger" onClick={() => void handleHide()} disabled={hiding}>
              {hiding ? "Hiding…" : "Hide"}
            </Button>
          )}
        </div>
        {moderationError && <span className={cls.moderationError}>{moderationError}</span>}
        {replying && (
          <div className={cls.replyForm}>
            <CommentForm
              parentId={node.id}
              onSuccess={() => {
                setReplying(false);
                onReplyPosted();
              }}
            />
          </div>
        )}
      </div>

      {!collapsed && hasReplies && (
        <div className={cls.replies}>
          {node.replies.map((reply) => (
            <CommentThreadNode
              key={reply.id}
              node={reply}
              depth={depth + 1}
              onReplyPosted={onReplyPosted}
            />
          ))}
        </div>
      )}
    </div>
  );
}
