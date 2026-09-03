"use client";

import { CommentForm } from "@/components/CommentForm";
import { RootCommentsTable } from "@/components/RootCommentsTable";
import cls from "./HomeView.module.scss";

/**
 * The home page's actual content. Dynamically imported with `ssr: false` from
 * `app/page.tsx` — this app fetches everything client-side (it's a SPA per the
 * brief), and the backend's GraphQL URL is a `localhost` address only reachable
 * from the browser, not from inside the frontend's own Docker container, so an
 * SSR-time fetch attempt would just fail. See CLAUDE.md → Progress log.
 */
export function HomeView() {
  return (
    <div className="page">
      <h1 className={cls.title}>Comments</h1>
      <CommentForm className={cls.form} />
      <RootCommentsTable />
    </div>
  );
}
