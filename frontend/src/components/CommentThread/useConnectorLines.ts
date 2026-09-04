"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import type { ThreadNode } from "./CommentThreadNode";

export interface ConnectorSegment {
  parentId: string;
  childId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Why this exists (see CLAUDE.md's post-Step-13 fix entries): two separate
 * pure-CSS attempts at drawing the "spine + elbow" connector between a
 * comment's avatar and its replies' avatars both drifted — the first from an
 * accumulating chain of rounded per-level offsets, the second (after fixing
 * that) from a structural gap no static CSS offset can close at all: a
 * comment's `.replies` spine runs the full height of its `.repliesInner` flex
 * box, but a `:last-child` mask can only blank out the spine below *that*
 * child's own box — if an *earlier* sibling has its own nested replies (an
 * unavoidable shape for any organically grown thread), that sibling's subtree
 * is taller than "one row", and the parent's spine stays visible running
 * through it, because the mask has no way to know where a sibling's own
 * content ends and its nested children begin. Nothing expressible in static
 * CSS geometry can fix that — it depends on the actual rendered shape of an
 * arbitrary, data-driven tree.
 *
 * So: measure it. Every avatar carries `data-node-id` (see `Avatar`'s
 * pass-through props, used in `CommentThreadNode`); this hook finds them all,
 * reads their real `getBoundingClientRect()` centres, and pairs them up using
 * the *actual* parent→child edges in the fetched thread — not an assumed
 * geometry. `CommentThread` renders one SVG `<path>` per edge, so each line
 * segment is exactly as long as it needs to be and nothing more; there's no
 * "spine" that could run past where it belongs, because there's no shared
 * spine at all — every edge is independent.
 */
function collectEdges(node: ThreadNode, out: { parentId: string; childId: string }[] = []) {
  // `replies` is missing (not just empty) at the query's fixed fetch-depth
  // boundary — see the matching guard + comment in CommentThreadNode.tsx.
  for (const child of node.replies ?? []) {
    out.push({ parentId: node.id, childId: child.id });
    collectEdges(child, out);
  }
  return out;
}

export function useConnectorLines(
  containerRef: RefObject<HTMLElement | null>,
  root: ThreadNode | null,
): ConnectorSegment[] {
  const [segments, setSegments] = useState<ConnectorSegment[]>([]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !root) {
      setSegments([]);
      return;
    }

    function measure() {
      const el = containerRef.current;
      if (!el || !root) return;

      const containerRect = el.getBoundingClientRect();
      const centers = new Map<string, { x: number; y: number }>();

      el.querySelectorAll<HTMLElement>("[data-connector-avatar]").forEach((avatar) => {
        // Still mounted (so the collapse height-transition has something to
        // animate) but not visually present — skip it, and anything under it.
        if (avatar.closest('[data-connector-collapsed="true"]')) return;
        const id = avatar.dataset.nodeId;
        if (!id) return;
        const rect = avatar.getBoundingClientRect();
        centers.set(id, {
          x: rect.left + rect.width / 2 - containerRect.left,
          y: rect.top + rect.height / 2 - containerRect.top,
        });
      });

      const next: ConnectorSegment[] = [];
      for (const { parentId, childId } of collectEdges(root)) {
        const p = centers.get(parentId);
        const c = centers.get(childId);
        if (!p || !c) continue; // one end is hidden (collapsed) or off-tree
        next.push({ parentId, childId, x1: p.x, y1: p.y, x2: c.x, y2: c.y });
      }
      setSegments(next);
    }

    measure();

    // Catches every case that can move an avatar after the first paint:
    // collapse/expand and reply-form open/close animating the container's
    // height (fires on every frame of those transitions, keeping the lines in
    // sync rather than just snapping at the end), attachment images loading,
    // text reflow on window resize — one mechanism for all of it, rather than
    // hooking each trigger individually.
    const observer = new ResizeObserver(measure);
    observer.observe(container);

    return () => observer.disconnect();
  }, [containerRef, root]);

  return segments;
}
