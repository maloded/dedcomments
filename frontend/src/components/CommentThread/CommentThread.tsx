"use client";

import { useRef } from "react";
import { useQuery } from "@apollo/client/react";
import { CommentThreadDocument } from "@/graphql/generated";
import { Skeleton } from "@/shared/ui/Skeleton";
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
 */
export function CommentThread(props: CommentThreadProps) {
  const { rootId } = props;
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, loading, error, refetch } = useQuery(CommentThreadDocument, {
    variables: { rootId },
  });

  const root = data ? (data.commentThread as unknown as ThreadNode) : null;
  const segments = useConnectorLines(containerRef, root);

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

  if (!root) {
    return null;
  }

  return (
    <div className={cls.CommentThread} ref={containerRef}>
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
        node={root}
        depth={0}
        onReplyPosted={() => {
          void refetch();
        }}
      />
    </div>
  );
}
