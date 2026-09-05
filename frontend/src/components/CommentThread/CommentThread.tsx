"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@apollo/client/react";
import { CommentThreadDocument } from "@/graphql/generated";
import { Skeleton } from "@/shared/ui/Skeleton";
import { Button } from "@/shared/ui/Button";
import { CommentThreadNode, type ThreadNode } from "./CommentThreadNode";
import { useConnectorLines } from "./useConnectorLines";
import cls from "./CommentThread.module.scss";

interface CommentThreadProps {
  rootId: string;
}

// How far the elbow curves before running straight into the child avatar —
// matches the `--connector-radius` used by the (now-removed) pure-CSS
// attempt, kept as a plain constant since the curve is drawn in JS now.
const CONNECTOR_CURVE_RADIUS = 10;

/** Depth-first search for a node by id within the already-fetched tree —
 * used to resolve `rerootStack`'s top entry to actual node data. All data
 * needed is already in Apollo's cache from the one `commentThread` fetch;
 * re-rooting is a pure client-side view change, never a refetch. */
function findNode(node: ThreadNode, id: string): ThreadNode | null {
  if (node.id === id) return node;
  for (const child of node.replies ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

/**
 * Fetches and renders the full thread for one root comment — mounted only
 * while its row is expanded (see `RootCommentsTable`). Apollo's default
 * `cache-first` policy means collapsing and re-expanding the same row doesn't
 * re-fetch: unmounting and remounting this component with the same `rootId`
 * reads straight from the cache.
 *
 * The connector graphic (the line from a comment's avatar to each of its
 * replies') is an SVG overlay positioned from *measured* avatar coordinates
 * (`useConnectorLines`), not static CSS offsets — see that hook's doc comment
 * for why a pure-CSS version of this kept drifting.
 *
 * `rerootStack` implements "Continue this thread →" (see `CommentThreadNode`'s
 * `atCap`): pushing a comment id makes that comment the panel's new depth-0
 * view root, with its own fresh layer-by-layer reveal and its own depth cap.
 * "← Back to parent thread" pops one entry — the previous state, which may
 * itself be an intermediate re-rooted view, not necessarily the true root —
 * so N "Continue this thread" clicks need exactly N "Back" clicks to undo.
 * Nothing here ever refetches: the whole stack resolves against the one
 * already-fetched tree via `findNode`.
 */
export function CommentThread(props: CommentThreadProps) {
  const { rootId } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const [rerootStack, setRerootStack] = useState<string[]>([]);

  const { data, loading, error, refetch } = useQuery(CommentThreadDocument, {
    variables: { rootId },
  });

  const root = data ? (data.commentThread as unknown as ThreadNode) : null;

  // Falls back to `root` if the stack's top id no longer resolves (e.g. a
  // moderator hid it out from under an open re-rooted view) — self-heals on
  // the next "Back" click rather than throwing.
  const viewRoot = useMemo(() => {
    if (!root) return null;
    if (rerootStack.length === 0) return root;
    return findNode(root, rerootStack[rerootStack.length - 1]) ?? root;
  }, [root, rerootStack]);

  const segments = useConnectorLines(containerRef, viewRoot);

  function continueThread(id: string) {
    setRerootStack((stack) => [...stack, id]);
  }

  function backToParentThread() {
    setRerootStack((stack) => stack.slice(0, -1));
  }

  if (loading && !data) {
    return (
      <div className={cls.loading}>
        <Skeleton width="40%" height={18} />
        <Skeleton width="90%" />
        <Skeleton width="70%" />
      </div>
    );
  }

  if (error) {
    return <p className={cls.error}>Couldn&apos;t load this thread: {error.message}</p>;
  }

  if (!root || !viewRoot) {
    return null;
  }

  return (
    <div className={cls.CommentThread} ref={containerRef}>
      {rerootStack.length > 0 && (
        <Button size="sm" variant="clear" className={cls.backLink} onClick={backToParentThread}>
          ← Back to parent thread
        </Button>
      )}
      <svg className={cls.connectorLayer} aria-hidden="true">
        {segments.map((seg) => {
          // Vertical run down from the parent avatar, a quarter-circle turn,
          // then a straight run into the child avatar's centre. Radius is
          // clamped so it never overshoots a short/near segment.
          const r = Math.min(
            CONNECTOR_CURVE_RADIUS,
            Math.abs(seg.y2 - seg.y1) / 2,
            Math.abs(seg.x2 - seg.x1) || CONNECTOR_CURVE_RADIUS,
          );
          const turn = seg.x2 >= seg.x1 ? r : -r;
          const d = `M ${seg.x1} ${seg.y1} L ${seg.x1} ${seg.y2 - r} Q ${seg.x1} ${seg.y2} ${seg.x1 + turn} ${seg.y2} L ${seg.x2} ${seg.y2}`;
          return <path key={seg.childId} d={d} className={cls.connectorPath} />;
        })}
      </svg>
      <CommentThreadNode
        // Forces a fresh mount (fresh `collapsed`/`replying`/etc. state) each
        // time the view root actually changes — re-rooting onto a different
        // comment is conceptually a different "depth 0", not an update of the
        // same one, so it shouldn't inherit whatever local UI state the
        // previous view root happened to be in.
        key={viewRoot.id}
        node={viewRoot}
        depth={0}
        onReplyPosted={() => {
          void refetch();
        }}
        onContinueThread={continueThread}
      />
    </div>
  );
}
