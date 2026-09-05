"use client";

import { useEffect, useRef, useState } from "react";
import { CommentForm } from "@/components/CommentForm";
import { Card } from "@/shared/ui/Card";
import { classNames } from "@/shared/lib/classNames";
import cls from "./CollapsibleCommentForm.module.scss";

// Matches CommentThreadNode's REPLY_CLOSE_MS exactly — a timer, not
// `animationend` (same reasons: predictable under `prefers-reduced-motion`,
// where globals.scss shortens the CSS to ~1ms and this just briefly outlives
// it), long enough to safely outlast the CSS close animation either way.
const CLOSE_MS = 200;

interface CollapsibleCommentFormProps {
  className?: string;
}

/**
 * Wraps the root `CommentForm` behind a collapsed, single-line
 * "Leave a comment…" prompt — expands to the full form on click, and
 * collapses back on Cancel or a successful post. Reply forms don't use this:
 * `CommentThreadNode` already has its own expand/collapse affordance (the
 * "Reply"/"Cancel" toggle button), so they render `CommentForm` directly.
 *
 * Reuses `CommentThreadNode`'s inline-reply-form animation approach exactly
 * (same durations/easings, same "keep mounted through the close animation,
 * then unmount" timer pattern) rather than inventing a new one — see
 * CollapsibleCommentForm.module.scss's `form-open`/`form-close`.
 */
export function CollapsibleCommentForm(props: CollapsibleCommentFormProps) {
  const { className } = props;
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  function expand() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setClosing(false);
    setExpanded(true);
  }

  function collapse() {
    if (closeTimer.current) return; // already closing
    setClosing(true);
    closeTimer.current = setTimeout(() => {
      setExpanded(false);
      setClosing(false);
      closeTimer.current = null;
    }, CLOSE_MS);
  }

  if (!expanded) {
    return (
      <Card padding="0" className={classNames(cls.prompt, {}, [className])}>
        <button type="button" className={cls.promptButton} onClick={expand}>
          Leave a comment…
        </button>
      </Card>
    );
  }

  return (
    <div className={classNames(cls.form, { [cls.closing]: closing }, [className])}>
      {/* Cancel discards without confirmation — simplest safe behaviour for
          this scope; a typed-but-unposted draft is lost, same as closing any
          ordinary comment box. onSuccess re-collapses after a real post,
          matching "collapsed by default" even right after submitting. */}
      <CommentForm onCancel={collapse} onSuccess={collapse} />
    </div>
  );
}
