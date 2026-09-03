"use client";

import { useQuery } from "@apollo/client/react";
import { CommentThreadDocument } from "@/graphql/generated";
import { Skeleton } from "@/shared/ui/Skeleton";
import { CommentThreadNode, type ThreadNode } from "./CommentThreadNode";
import cls from "./CommentThread.module.scss";

interface CommentThreadProps {
  rootId: string;
}

/**
 * Fetches and renders the full thread for one root comment — mounted only
 * while its row is expanded (see `RootCommentsTable`). Apollo's default
 * `cache-first` policy means collapsing and re-expanding the same row doesn't
 * re-fetch: unmounting and remounting this component with the same `rootId`
 * reads straight from the cache.
 */
export function CommentThread(props: CommentThreadProps) {
  const { rootId } = props;

  const { data, loading, error, refetch } = useQuery(CommentThreadDocument, {
    variables: { rootId },
  });

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

  if (!data) {
    return null;
  }

  // The query is fetched to a fixed depth (see commentThread.graphql) — the
  // deepest selected level structurally lacks a `replies` field, which is why
  // this cast exists instead of a plain assignment. See ThreadNode's own doc
  // comment.
  const root = data.commentThread as unknown as ThreadNode;

  return (
    <div className={cls.CommentThread}>
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
