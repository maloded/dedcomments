"use client";

import { useState } from "react";
import { CommentForm } from "@/components/CommentForm";
import { Card } from "@/shared/ui/Card";
import { classNames } from "@/shared/lib/classNames";
import cls from "./CollapsibleCommentForm.module.scss";

interface CollapsibleCommentFormProps {
  className?: string;
}

/**
 * Wraps the root `CommentForm` behind a collapsed, single-line
 * "Leave a comment…" prompt — expands to the full form on click, collapses
 * back on Cancel or a successful post. Reply forms don't use this:
 * `CommentThreadNode` already has its own expand/collapse affordance (the
 * "Reply"/"Cancel" toggle button).
 *
 * Both the prompt row and the form row are always mounted; only which one's
 * `grid-template-rows` is `1fr` (the other's `0fr`) changes — the exact same
 * "animate to/from real content height" technique
 * CommentThread.module.scss's `.replies`/`.collapsed` already uses for
 * collapsing a reply subtree, reused here rather than reinvented. The first
 * cut of this component instead (a) conditionally *mounted/unmounted* the
 * prompt vs. the form — two unrelated DOM subtrees hard-swapping with
 * nothing to animate between them — and (b) animated `max-height` via
 * `@keyframes` to an arbitrary fixed ceiling, which plateaus early or
 * overshoots depending on the form's real rendered height. Both caused the
 * visible jump/snap; see CLAUDE.md's fix entry for the full diagnosis.
 *
 * Keeping `CommentForm` permanently mounted is a deliberate side effect, not
 * a new requirement: a typed-but-uncollapsed draft now survives a collapse/
 * re-expand cycle (it's only ever visually clipped, never torn down), and
 * the CAPTCHA is fetched once instead of on every expand.
 */
export function CollapsibleCommentForm(props: CollapsibleCommentFormProps) {
  const { className } = props;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={classNames(cls.CollapsibleCommentForm, {}, [className])}>
      <div className={classNames(cls.row, { [cls.rowCollapsed]: expanded })}>
        <div className={cls.rowInner}>
          <Card padding="0" className={cls.prompt}>
            <button type="button" className={cls.promptButton} onClick={() => setExpanded(true)}>
              Leave a comment…
            </button>
          </Card>
        </div>
      </div>
      <div className={classNames(cls.row, { [cls.rowCollapsed]: !expanded })}>
        <div className={cls.rowInner}>
          <CommentForm onCancel={() => setExpanded(false)} onSuccess={() => setExpanded(false)} />
        </div>
      </div>
    </div>
  );
}
