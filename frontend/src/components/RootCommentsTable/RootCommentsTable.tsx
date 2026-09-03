"use client";

import { Fragment, useState } from "react";
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
import { CommentThread } from "@/components/CommentThread";
import cls from "./RootCommentsTable.module.scss";

const SORTABLE_COLUMNS: { field: RootCommentSortField; label: string }[] = [
  { field: "USERNAME", label: "Username" },
  { field: "EMAIL", label: "Email" },
  { field: "CREATED_AT", label: "Date" },
];

const SKELETON_ROWS = 5;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

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

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

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
                return (
                  <th key={field}>
                    <button
                      type="button"
                      className={classNames(cls.sortButton, { [cls.active]: active })}
                      onClick={() => handleSort(field)}
                    >
                      {label}
                      {active && (
                        <span className={cls.sortArrow} aria-hidden="true">
                          {sortOrder === "ASC" ? "▲" : "▼"}
                        </span>
                      )}
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
              items.map((item) => {
                const expanded = expandedIds.has(item.id);
                return (
                  <Fragment key={item.id}>
                    <tr>
                      <td>{item.author.username}</td>
                      <td>{item.author.email}</td>
                      <td>{formatDate(item.createdAt)}</td>
                      <td>{item.repliesCount}</td>
                      <td>
                        <Button
                          size="sm"
                          variant="clear"
                          aria-expanded={expanded}
                          onClick={() => toggleExpanded(item.id)}
                        >
                          {expanded ? "Collapse" : "Expand"}
                        </Button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className={cls.threadRow}>
                        <td colSpan={5} className={cls.threadCell}>
                          <CommentThread rootId={item.id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
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
