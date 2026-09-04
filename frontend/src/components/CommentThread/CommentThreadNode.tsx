"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@apollo/client/react";
import { CombinedGraphQLErrors } from "@apollo/client/errors";
import { Button } from "@/shared/ui/Button";
import { Avatar } from "@/shared/ui/Avatar";
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
 * depth up to this cap, then stays fixed (the thread connector carries the rest
 * of the visual nesting so deep threads don't run off screen). Tightened on
 * mobile via the `--connector-*` custom properties — see CommentThread.module.scss.
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
 * returns them (LIFO per level — no client-side re-sorting).
 *
 * Collapsing a subtree is plain React state (the data's already in hand) — the
 * replies stay mounted and the height animates via a CSS grid `1fr → 0fr`
 * transition. The inline reply form animates open on mount and plays a close
 * animation before unmounting (`replyClosing`).
 */
export function CommentThreadNode(props: CommentThreadNodeProps) {
  const { node, depth, onReplyPosted } = props;
  const [collapsed, setCollapsed] = useState(false);
  const [replying, setReplying] = useState(false);
  const [replyClosing, setReplyClosing] = useState(false);
  const [moderationError, setModerationError] = useState<string | null>(null);
  const [banned, setBanned] = useState(false);

  const { session, isLoggedIn, logout } = useModeratorAuth();
  const [hideCommentMutation, { loading: hiding }] = useMutation(HideCommentDocument);
  const [banAuthorMutation, { loading: banning }] = useMutation(BanAuthorDocument);

  const hasReplies = node.replies.length > 0;
  // Past this depth the nesting container stops adding indent (the connector
  // still draws) so deep threads don't march off the right edge — see
  // CommentThread.module.scss `.indentCapped`.
  const indentCapped = depth >= MAX_VISUAL_DEPTH;

  // `replyClosing` swaps in the CSS collapse animation, then a short timer
  // unmounts the form once it's played. A timer (not `animationend`) because
  // the form's own children fire stray animation events, and this stays
  // predictable under `prefers-reduced-motion` (globals.scss shortens the CSS
  // to ~1ms; the 200ms here just briefly outlives it).
  const REPLY_CLOSE_MS = 200;
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  function closeReply() {
    if (closeTimer.current) return; // already closing
    setReplyClosing(true);
    closeTimer.current = setTimeout(() => {
      setReplying(false);
      setReplyClosing(false);
      closeTimer.current = null;
    }, REPLY_CLOSE_MS);
  }

  function toggleReply() {
    if (replying && !replyClosing) {
      closeReply();
    } else {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      setReplyClosing(false);
      setReplying(true);
    }
  }

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

  return (
    <div className={classNames(cls.CommentThreadNode, { [cls.root]: depth === 0 })}>
      <div className={cls.body}>
        <div className={cls.meta}>
          <Avatar
            className={cls.metaAvatar}
            seed={`${node.author.username} ${node.author.email}`}
          />
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
          {hasReplies && (
            <Button
              size="sm"
              variant="clear"
              className={cls.collapseToggle}
              onClick={() => setCollapsed((c) => !c)}
              aria-expanded={!collapsed}
            >
              {collapsed
                ? `[+] ${node.repliesCount} ${node.repliesCount === 1 ? "reply" : "replies"}`
                : "[–] collapse"}
            </Button>
          )}
          <Button size="sm" variant="clear" onClick={toggleReply}>
            {replying && !replyClosing ? "Cancel" : "Reply"}
          </Button>
          {isLoggedIn && (
            <Button size="sm" variant="clear" color="danger" onClick={() => void handleHide()} disabled={hiding}>
              {hiding ? "Hiding…" : "Hide"}
            </Button>
          )}
        </div>
        {moderationError && <span className={cls.moderationError}>{moderationError}</span>}
        {replying && (
          <div className={classNames(cls.replyForm, { [cls.replyClosing]: replyClosing })}>
            <CommentForm
              parentId={node.id}
              onSuccess={() => {
                closeReply();
                onReplyPosted();
              }}
            />
          </div>
        )}
      </div>

      {hasReplies && (
        <div
          className={classNames(cls.replies, {
            [cls.indentCapped]: indentCapped,
            [cls.collapsed]: collapsed,
          })}
        >
          <div className={cls.repliesInner}>
            {node.replies.map((reply) => (
              <CommentThreadNode
                key={reply.id}
                node={reply}
                depth={depth + 1}
                onReplyPosted={onReplyPosted}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
