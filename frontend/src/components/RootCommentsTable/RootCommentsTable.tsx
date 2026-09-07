"use client";

import { Fragment, memo, useCallback, useState } from "react";
import { useQuery } from "@apollo/client/react";
import {
  RootCommentsDocument,
  RootCommentSortField,
  SortOrder,
  type RootCommentsQuery,
} from "@/graphql/generated";
import { classNames } from "@/shared/lib/classNames";
import { Skeleton } from "@/shared/ui/Skeleton";
import { Button } from "@/shared/ui/Button";
import { Avatar } from "@/shared/ui/Avatar";
import { CommentThread } from "@/components/CommentThread";
import { AttachmentPreview } from "@/components/AttachmentPreview";
import { previewCommentHtml } from "@/shared/lib/commentPreview";
import cls from "./RootCommentsTable.module.scss";

// Past this many characters, a root comment's own text is clamped to a few
// lines with a "Show more" toggle — a rough heuristic (no layout measurement),
// good enough to keep one very long comment from blowing out the table's row
// rhythm without needing a ResizeObserver for something this low-stakes.
const TEXT_TRUNCATE_THRESHOLD = 280;

const SORTABLE_COLUMNS: { field: RootCommentSortField; label: string }[] = [
  { field: "USERNAME", label: "Username" },
  { field: "EMAIL", label: "Email" },
  { field: "CREATED_AT", label: "Date" },
];

const SKELETON_ROWS = 5;

/** A single chevron that rotates 180° between DESC (down) and ASC (up), fades
 * up to full strength / accent when its column is the active sort. */
function SortIcon({ state }: { state: "asc" | "desc" | "none" }) {
  return (
    <svg
      className={classNames(cls.sortIcon, {
        [cls.sortIconActive]: state !== "none",
        [cls.sortIconAsc]: state === "asc",
      })}
      viewBox="0 0 12 12"
      width="12"
      height="12"
      aria-hidden="true"
    >
      <path
        d="M2.5 4.5 L6 8 L9.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

interface RootCommentRowProps {
  item: RootCommentsQuery["rootComments"]["items"][number];
  expanded: boolean;
  onToggleExpand: (id: string) => void;
}

/**
 * One root comment's row (plus its thread row, when expanded) — extracted
 * and `memo`'d so that a targeted cache update touching only *one* comment
 * (see `RealtimeConnection`'s `handleReplyCommentEvent`/
 * `handleRootCommentCreated`/`handleRootCommentHidden`) doesn't re-render
 * every other row too. This is defense-in-depth, not the primary fix for
 * this session's flicker report — the actual root cause was a full
 * `refetchQueries` flipping `loading` and swapping the whole table to
 * skeleton placeholders and back (see `RealtimeConnection`), which
 * `React.memo` alone can't prevent (a `loading`-gated conditional swaps
 * element *types*, not just props). With that fixed, `RootCommentsTable`
 * only ever re-renders because one comment's cached object actually
 * changed — `memo`'s default shallow-prop comparison then correctly skips
 * re-invoking this component for every row whose `item` reference (and
 * `expanded`/`onToggleExpand`) didn't change, which Apollo's cache read
 * already guarantees for unaffected entities (confirmed via `MutationObserver`
 * DOM-mutation tracking, the same technique used to diagnose the bug: after
 * the fix, updating one comment's `repliesCount` produces mutations scoped
 * to that one row's own `<td>`, not a single other row touched).
 *
 * `onToggleExpand` must be a stable function reference (see
 * `RootCommentsTable`'s `useCallback`) for this memoization to actually take
 * effect — a fresh inline arrow function passed as a prop on every parent
 * render would make `memo`'s shallow comparison fail for every row, every
 * time, silently defeating the whole point.
 */
const RootCommentRow = memo(function RootCommentRow(props: RootCommentRowProps) {
  const { item, expanded, onToggleExpand } = props;
  // Purely local — collapsing/re-expanding *this row's own text* never needs
  // a network request (the text is already in hand), so it doesn't share any
  // state with `expanded` (which gates the *replies* fetch/render below).
  const [textExpanded, setTextExpanded] = useState(false);
  const hasReplies = item.repliesCount > 0;
  const isLongText = item.text.length > TEXT_TRUNCATE_THRESHOLD;

  return (
    <Fragment>
      <tr>
        <td className={cls.username}>
          <span className={cls.authorCell}>
            <Avatar className={cls.avatar} seed={`${item.author.username} ${item.author.email}`} />
            {item.author.username}
          </span>
        </td>
        <td className={cls.email} data-label="Email">
          {item.author.email}
        </td>
        <td className={cls.date} data-label="Date">
          {formatDate(item.createdAt)}
        </td>
        <td className={cls.replies} data-label="Replies">
          {item.repliesCount}
        </td>
        <td className={cls.expandCell}>
          {/* Only reveals nested replies (commentThread) — the comment's own
           * text/attachment below is always visible, no click needed. */}
          {hasReplies && (
            <Button
              size="sm"
              variant="clear"
              aria-expanded={expanded}
              onClick={() => onToggleExpand(item.id)}
            >
              {expanded ? "Collapse" : "Expand"}
            </Button>
          )}
        </td>
      </tr>

      {/* The root comment's own content — always rendered, independent of
       * `expanded`, matching the brief's reference screenshot (comment text
       * visible immediately, not gated behind a click). */}
      <tr className={cls.contentRow}>
        <td colSpan={5} className={cls.contentCell}>
          <div
            className={classNames(cls.commentText, {
              [cls.textClamped]: isLongText && !textExpanded,
            })}
            dangerouslySetInnerHTML={{ __html: previewCommentHtml(item.text) }}
          />
          {isLongText && (
            <button
              type="button"
              className={cls.textToggle}
              onClick={() => setTextExpanded((v) => !v)}
            >
              {textExpanded ? "Show less" : "Show more"}
            </button>
          )}
          {item.attachment && (
            <div className={cls.contentAttachment}>
              <AttachmentPreview
                type={item.attachment.type}
                url={item.attachment.url}
                originalName={item.attachment.originalName}
              />
            </div>
          )}
        </td>
      </tr>

      {expanded && hasReplies && (
        <tr className={cls.threadRow}>
          <td colSpan={5} className={cls.threadCell}>
            <CommentThread rootId={item.id} />
          </td>
        </tr>
      )}
    </Fragment>
  );
});

/**
 * The home-page table of top-level comments: sortable columns, pagination, an
 * "Expand" placeholder per row (thread loading is a later session — see
 * CLAUDE.md → "Tree rendering on the frontend"). Owns its own `rootComments`
 * query — `CommentForm` triggers a refetch via Apollo's `refetchQueries:
 * ['RootComments']` rather than any prop wiring between the two.
 */
export function RootCommentsTable() {
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<RootCommentSortField>("CREATED_AT");
  const [sortOrder, setSortOrder] = useState<SortOrder>("DESC");
  // Which root rows currently have their thread expanded. A row's <CommentThread>
  // unmounts on collapse and remounts on re-expand — Apollo's default cache-first
  // policy means that costs nothing extra over the network for the same rootId.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // `useCallback` with an empty dependency array (only ever touches the
  // stable `setExpandedIds` setter) — a fresh arrow function here on every
  // render would be a new prop reference for every `RootCommentRow` on
  // every render, defeating that component's `memo` regardless of whether
  // `item` itself stayed stable. See `RootCommentRow`'s doc comment.
  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const { data, loading, error } = useQuery(RootCommentsDocument, {
    variables: { page, sortBy, sortOrder },
    notifyOnNetworkStatusChange: true,
  });

  const handleSort = (field: RootCommentSortField) => {
    setPage(1);
    if (field === sortBy) {
      setSortOrder(sortOrder === "ASC" ? "DESC" : "ASC");
      return;
    }
    setSortBy(field);
    // Date defaults to newest-first (LIFO); username/email default to A→Z.
    setSortOrder(field === "CREATED_AT" ? "DESC" : "ASC");
  };

  const items: RootCommentsQuery["rootComments"]["items"] = data?.rootComments.items ?? [];
  const totalPages = data?.rootComments.totalPages ?? 1;
  const totalCount = data?.rootComments.totalCount ?? 0;

  return (
    <div className={cls.RootCommentsTable}>
      {error && <p className={cls.error}>Couldn&apos;t load comments: {error.message}</p>}

      <div className={cls.scroll}>
        <table className={cls.table}>
          <thead>
            <tr>
              {SORTABLE_COLUMNS.map(({ field, label }) => {
                const active = field === sortBy;
                const iconState = !active ? "none" : sortOrder === "ASC" ? "asc" : "desc";
                return (
                  <th
                    key={field}
                    aria-sort={!active ? "none" : sortOrder === "ASC" ? "ascending" : "descending"}
                  >
                    <button
                      type="button"
                      className={classNames(cls.sortButton, { [cls.active]: active })}
                      onClick={() => handleSort(field)}
                    >
                      {label}
                      <SortIcon state={iconState} />
                    </button>
                  </th>
                );
              })}
              <th>Replies</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {loading &&
              // Static placeholder rows, never reordered — index as key is fine.
              Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                <tr key={i}>
                  <td>
                    <Skeleton width={110} />
                  </td>
                  <td>
                    <Skeleton width={160} />
                  </td>
                  <td>
                    <Skeleton width={130} />
                  </td>
                  <td>
                    <Skeleton width={30} />
                  </td>
                  <td>
                    <Skeleton width={70} />
                  </td>
                </tr>
              ))}

            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={5} className={cls.empty}>
                  No comments yet — be the first to leave one.
                </td>
              </tr>
            )}

            {!loading &&
              items.map((item) => (
                <RootCommentRow
                  key={item.id}
                  item={item}
                  expanded={expandedIds.has(item.id)}
                  onToggleExpand={toggleExpanded}
                />
              ))}
          </tbody>
        </table>
      </div>

      <div className={cls.pagination}>
        <span className={cls.count}>{totalCount} comment{totalCount === 1 ? "" : "s"}</span>
        <div className={cls.pageControls}>
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => p - 1)}
          >
            Prev
          </Button>
          <span className={cls.pageNumber}>
            Page {page} of {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
