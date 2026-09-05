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
 *
 * `replies` is genuinely optional, not just possibly-empty: the query nests
 * it 10 levels deep, so a node at exactly that depth boundary has no
 * `replies` key in the response at all. Every reader must treat a missing
 * `replies` the same as an empty one (`node.replies ?? []`) — see
 * CommentThreadNode's `hasReplies` and `useConnectorLines`'s `collectEdges`.
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
  replies?: ThreadNode[];
}

/**
 * Matches CLAUDE.md → "Tree rendering on the frontend": indentation grows
 * with depth up to this cap. Past it, a comment's own replies are never
 * rendered inline at all — instead of the normal "[-] collapse" toggle, a
 * node at this depth with replies shows a "Continue this thread →" link
 * that re-roots the whole panel on that comment (see `CommentThread`'s
 * `rerootStack`), so indentation never actually has to represent more than
 * these levels in any single view — no flattened/reduced-indent styling
 * needed past the cap, because nothing renders past it. Tightened further on
 * mobile via `--avatar-size`/`--connector-gutter` (indentation *within* the
 * cap is narrower there, the cap depth itself is the same).
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
  /** Called with this node's own id when its "Continue this thread →" link
   * (shown only at `MAX_VISUAL_DEPTH` with replies) is clicked — pushes onto
   * `CommentThread`'s `rerootStack` so that node becomes the new depth-0 view. */
  onContinueThread: (id: string) => void;
}

/**
 * One comment plus its replies, rendered recursively. The whole fetched
 * subtree renders at once, all the way down to `MAX_VISUAL_DEPTH` — no
 * per-level reveal clicking. (An earlier session tried layer-by-layer reveal,
 * one click per depth; it was reverted after hands-on testing showed it fought
 * with "Continue this thread" back-navigation — going "← Back" to a parent
 * view re-collapsed everything to depth-1-only, forcing the user to re-click
 * through every layer just to get back to where they'd already been looking.
 * See CLAUDE.md's fix entry.)
 *
 * `collapsed` still exists, but only as a manual "hide this branch I've
 * already seen" toggle — it defaults to `false` for every node, not
 * depth-dependent, so nothing needs revealing on mount. Replies stay mounted
 * while collapsed (only the *container*'s CSS grid row collapses to `0fr`),
 * so a descendant's own `collapsed` state is untouched by an ancestor's
 * toggle — collapsing and re-expanding a branch never loses anything.
 *
 * Past `MAX_VISUAL_DEPTH` nothing renders inline at all — see `atCap` below
 * and `CommentThread`'s re-rooting stack.
 */
export function CommentThreadNode(props: CommentThreadNodeProps) {
  const { node, depth, onReplyPosted, onContinueThread } = props;
  const [collapsed, setCollapsed] = useState(false);
  const [replying, setReplying] = useState(false);
  const [replyClosing, setReplyClosing] = useState(false);
  const [moderationError, setModerationError] = useState<string | null>(null);
  const [banned, setBanned] = useState(false);

  const { session, isLoggedIn, logout } = useModeratorAuth();
  const [hideCommentMutation, { loading: hiding }] = useMutation(HideCommentDocument);
  const [banAuthorMutation, { loading: banning }] = useMutation(BanAuthorDocument);

  // `node.replies` can genuinely be `undefined` here, not just empty: the
  // fetched query nests `replies` 30 levels deep (see commentThread.graphql),
  // so a comment at exactly that depth boundary has no `replies` field in the
  // response at all, however few or many real children it has past that
  // point. `repliesCount` (a direct, unconditional count from the backend)
  // is fetched at every level regardless, so it's the one reliable signal
  // for "there's more below that this query just can't reach" — see
  // `hiddenByFetchDepth` below, which turns that into an honest notice
  // instead of the silent data loss this used to be (a reply posted past the
  // fetch boundary used to succeed on the backend and then never appear
  // anywhere, indistinguishable from the mutation having failed — see
  // CLAUDE.md's fix entry for the full story).
  const repliesFetched = node.replies !== undefined;
  const hasReplies = (node.replies?.length ?? 0) > 0;
  const hiddenByFetchDepth = !repliesFetched && node.repliesCount > 0;
  // At this depth, a normal reveal toggle would need to render a further
  // level of indentation that has nowhere to go — show "Continue this
  // thread →" instead (re-roots the panel on this node) rather than
  // rendering its replies inline at all. Mutually exclusive with
  // `hiddenByFetchDepth`: that one only fires when `replies` is genuinely
  // absent (the 30-level *absolute* fetch boundary, unrelated to this
  // *relative*, per-view cap), in which case there's no data to re-root into
  // either, so the existing "thread too deep to fetch" notice still applies.
  const atCap = depth >= MAX_VISUAL_DEPTH;

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
        // Hiding a root: refetch RootComments too — safe to coexist with
        // RealtimeConnection's own socket-driven removal (received from our
        // own broadcast too), since "remove this id if present" is
        // idempotent regardless of which one lands first.
        //
        // Hiding a reply: deliberately *not* included — only "CommentThread"
        // is. That decrements the parent's `repliesCount` by a *relative* -1
        // via RealtimeConnection's `cache.modify`, and unlike the idempotent
        // root-removal above, a relative adjustment isn't safe to double-
        // apply if this refetch's absolute count landed first. Same
        // reasoning as CommentForm's reply-create path — see
        // RealtimeConnection's `handleReplyCommentEvent` doc comment.
        refetchQueries: node.parentId ? ["CommentThread"] : ["RootComments", "CommentThread"],
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
            // The two hooks `useConnectorLines` measures from — see its doc
            // comment for why the connector line is positioned this way
            // instead of by static CSS offsets.
            data-node-id={node.id}
            data-connector-avatar="true"
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
          {hasReplies && !atCap && (
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
          {hasReplies && atCap && (
            <Button size="sm" variant="clear" onClick={() => onContinueThread(node.id)}>
              Continue this thread →
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
        {hiddenByFetchDepth && (
          <p className={cls.depthNotice}>
            {node.repliesCount} more {node.repliesCount === 1 ? "reply" : "replies"} past this
            point aren&apos;t shown here (thread too deep to fetch in one request) — they still
            exist and can be replied to, just not viewed nested this far down.
          </p>
        )}
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

      {hasReplies && !atCap && (
        <div
          className={classNames(cls.replies, { [cls.collapsed]: collapsed })}
          // Read by `useConnectorLines` — a collapsed subtree stays mounted
          // (for the height animation) but its avatars shouldn't get a
          // connector line drawn to them while they're not visible.
          data-connector-collapsed={collapsed ? "true" : undefined}
        >
          <div className={cls.repliesInner}>
            {node.replies?.map((reply) => (
              <CommentThreadNode
                key={reply.id}
                node={reply}
                depth={depth + 1}
                onReplyPosted={onReplyPosted}
                onContinueThread={onContinueThread}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
