"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@apollo/client/react";
import { CombinedGraphQLErrors } from "@apollo/client/errors";
import {
  CaptchaChallengeDocument,
  CreateCommentDocument,
} from "@/graphql/generated";
import {
  CAPTCHA_REGEX,
  COMMENT_TEXT_MAX_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_REGEX,
} from "@/lib/validation";
import { previewCommentHtml } from "@/shared/lib/commentPreview";
import { Card } from "@/shared/ui/Card";
import { Button } from "@/shared/ui/Button";
import { TagToolbar, type WrapTag } from "@/components/TagToolbar";
import cls from "./CommentForm.module.scss";

const commentFormSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Username is required.")
    .max(USERNAME_MAX_LENGTH, `Max ${USERNAME_MAX_LENGTH} characters.`)
    .regex(USERNAME_REGEX, "Latin letters and digits only."),
  email: z.email("Enter a valid e-mail address."),
  homepage: z.union([
    z.literal(""),
    z.httpUrl("Home page must be a valid http(s) URL."),
  ]),
  captchaAnswer: z
    .string()
    .trim()
    .min(1, "Enter the CAPTCHA text.")
    .regex(CAPTCHA_REGEX, "Latin letters and digits only."),
  text: z
    .string()
    .trim()
    .min(1, "Comment text is required.")
    .max(COMMENT_TEXT_MAX_LENGTH, "Comment is too long."),
});

type CommentFormValues = z.infer<typeof commentFormSchema>;

const DEFAULT_VALUES: CommentFormValues = {
  username: "",
  email: "",
  homepage: "",
  captchaAnswer: "",
  text: "",
};

const WRAP_TAGS: Record<WrapTag, [string, string]> = {
  i: ["<i>", "</i>"],
  strong: ["<strong>", "</strong>"],
  code: ["<code>", "</code>"],
};

/** Loosely matches the backend's coded error messages back to a form field. */
function fieldForErrorMessage(message: string): keyof CommentFormValues | null {
  const m = message.toLowerCase();
  if (m.includes("user name") || m.includes("username")) return "username";
  if (m.includes("e-mail") || m.includes("email")) return "email";
  if (m.includes("home page") || m.includes("url")) return "homepage";
  if (
    m.includes("tag") ||
    m.includes("xhtml") ||
    m.includes("attribute") ||
    m.includes("href") ||
    m.includes("comment text")
  ) {
    return "text";
  }
  return null;
}

interface CommentFormProps {
  /** Omit for a root comment; pass a comment id to post a reply to it. Reply
   * UI itself isn't wired up yet (CLAUDE.md — next session), but the component
   * is ready to be reused for it. */
  parentId?: string;
  onSuccess?: () => void;
  className?: string;
}

/**
 * The comment submission form: username/email/homepage/CAPTCHA/text, a tag
 * toolbar, a live preview, and full client + server error handling. Uses the
 * `Card`/`Button` primitives from `shared/ui` per CLAUDE.md → "Styling
 * approach".
 */
export function CommentForm(props: CommentFormProps) {
  const { parentId, onSuccess, className } = props;

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CommentFormValues>({
    resolver: zodResolver(commentFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const { ref: textRhfRef, ...textField } = register("text");
  const text = watch("text");

  const {
    data: captchaData,
    loading: captchaLoading,
    refetch: refetchCaptcha,
  } = useQuery(CaptchaChallengeDocument, { fetchPolicy: "no-cache" });

  const [createComment] = useMutation(CreateCommentDocument);

  /** Wraps the current textarea selection in a tag, or inserts at the cursor. */
  function wrapSelection(before: string, after: string) {
    const el = textareaRef.current;
    if (!el) return;

    const { selectionStart, selectionEnd, value } = el;
    const selected = value.slice(selectionStart, selectionEnd);
    const next = value.slice(0, selectionStart) + before + selected + after + value.slice(selectionEnd);
    setValue("text", next, { shouldValidate: true, shouldDirty: true });

    // Re-focus + re-select after the value commits, so typing continues naturally.
    requestAnimationFrame(() => {
      el.focus();
      const cursorStart = selectionStart + before.length;
      el.setSelectionRange(cursorStart, cursorStart + selected.length);
    });
  }

  function handleWrap(tag: WrapTag) {
    const [before, after] = WRAP_TAGS[tag];
    wrapSelection(before, after);
  }

  function handleInsertLink() {
    const href = window.prompt("Link URL (https://...)");
    if (!href) return;
    const title = window.prompt("Link title (optional)") ?? "";
    const el = textareaRef.current;
    const selected = el ? el.value.slice(el.selectionStart, el.selectionEnd) : "";
    const titleAttr = title ? ` title="${title}"` : "";
    wrapSelection(`<a href="${href}"${titleAttr}>`, "</a>");
    if (!selected && el) {
      // Nothing was selected — leave the cursor between the tags rather than
      // wrapping empty text, so the reader has somewhere to type link text.
      requestAnimationFrame(() => el.focus());
    }
  }

  async function onSubmit(values: CommentFormValues) {
    setFormError(null);
    setSuccessMessage(null);

    const token = captchaData?.captchaChallenge.token;
    if (!token) {
      setFormError("CAPTCHA hasn't loaded yet — please wait a moment and try again.");
      return;
    }

    try {
      await createComment({
        variables: {
          input: {
            username: values.username,
            email: values.email,
            text: values.text,
            captchaToken: token,
            captchaAnswer: values.captchaAnswer,
            ...(values.homepage ? { homepage: values.homepage } : {}),
            ...(parentId ? { parentId } : {}),
          },
        },
        // Keeps the root table's list + counts in sync without any prop wiring
        // to RootCommentsTable. For a reply, also refetch the open thread — by
        // *name*, not a specific rootId: Apollo refetches every currently
        // active `CommentThread` watcher using its own variables, and since a
        // reply's Reply button only exists inside an already-expanded thread,
        // there's exactly one such watcher (the one being replied in). Naming
        // it unconditionally would be a harmless no-op when nothing's expanded
        // (Apollo just skips it), but scoping it to replies keeps the intent
        // — "a reply invalidates its own thread" — obvious at the call site.
        refetchQueries: parentId ? ["RootComments", "CommentThread"] : ["RootComments"],
      });

      reset(DEFAULT_VALUES);
      setSuccessMessage("Comment posted.");
      onSuccess?.();
      await refetchCaptcha();
    } catch (err) {
      await handleSubmitError(err);
    }
  }

  async function handleSubmitError(err: unknown) {
    if (!CombinedGraphQLErrors.is(err)) {
      setFormError("Something went wrong. Please try again.");
      return;
    }

    const [first] = err.errors;
    const code = first?.extensions?.code as string | undefined;
    const message = first?.message ?? err.message;

    if (code === "THROTTLER") {
      setFormError("Too many attempts — please wait a minute before trying again.");
      return;
    }

    if (code === "BAD_REQUEST" && /captcha/i.test(message)) {
      setError("captchaAnswer", { message: "Incorrect CAPTCHA — a new one has been loaded." });
      setValue("captchaAnswer", "");
      await refetchCaptcha();
      return;
    }

    if (code === "BAD_REQUEST") {
      const field = fieldForErrorMessage(message);
      if (field) {
        setError(field, { message });
        return;
      }
    }

    // FORBIDDEN (banned author), NOT_FOUND (bad parentId), or anything else
    // unmapped — surface as a general, non-field error.
    setFormError(message);
  }

  return (
    <Card padding="24" className={className}>
      <form
        className={cls.CommentForm}
        onSubmit={(e) => {
          void handleSubmit(onSubmit)(e);
        }}
        noValidate
      >
        <h2 className={cls.heading}>{parentId ? "Reply" : "Leave a comment"}</h2>

        <div className={cls.row}>
          <label className={cls.field}>
            <span className={cls.label}>User Name</span>
            <input className={cls.input} type="text" {...register("username")} />
            {errors.username && <span className={cls.fieldError}>{errors.username.message}</span>}
          </label>

          <label className={cls.field}>
            <span className={cls.label}>E-mail</span>
            <input className={cls.input} type="email" {...register("email")} />
            {errors.email && <span className={cls.fieldError}>{errors.email.message}</span>}
          </label>
        </div>

        <label className={cls.field}>
          <span className={cls.label}>Home page (optional)</span>
          <input
            className={cls.input}
            type="text"
            placeholder="https://example.com"
            {...register("homepage")}
          />
          {errors.homepage && <span className={cls.fieldError}>{errors.homepage.message}</span>}
        </label>

        <div className={cls.field}>
          <span className={cls.label}>Text</span>
          <TagToolbar onWrap={handleWrap} onInsertLink={handleInsertLink} disabled={isSubmitting} />
          <textarea
            className={cls.textarea}
            rows={6}
            {...textField}
            ref={(el) => {
              textRhfRef(el);
              textareaRef.current = el;
            }}
          />
          {errors.text && <span className={cls.fieldError}>{errors.text.message}</span>}
        </div>

        <div className={cls.field}>
          <span className={cls.label}>Preview</span>
          <div
            className={cls.preview}
            // previewCommentHtml only ever un-escapes the exact allowed tags —
            // see its own doc comment for why this is safe.
            dangerouslySetInnerHTML={{ __html: previewCommentHtml(text || "") }}
          />
        </div>

        <div className={cls.captchaRow}>
          <label className={cls.field}>
            <span className={cls.label}>CAPTCHA</span>
            <input className={cls.input} type="text" autoComplete="off" {...register("captchaAnswer")} />
            {errors.captchaAnswer && (
              <span className={cls.fieldError}>{errors.captchaAnswer.message}</span>
            )}
          </label>

          <div className={cls.captchaImageBox}>
            {captchaLoading || !captchaData ? (
              <div className={cls.captchaPlaceholder}>Loading…</div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- a data: URL, not a static asset
              <img
                className={cls.captchaImage}
                src={captchaData.captchaChallenge.image}
                alt="CAPTCHA challenge"
              />
            )}
            <Button
              type="button"
              size="sm"
              variant="clear"
              disabled={captchaLoading}
              onClick={() => {
                setValue("captchaAnswer", "");
                void refetchCaptcha();
              }}
              title="Get a new CAPTCHA"
            >
              ↻ New
            </Button>
          </div>
        </div>

        {formError && <p className={cls.formError}>{formError}</p>}
        {successMessage && <p className={cls.formSuccess}>{successMessage}</p>}

        <Button type="submit" variant="filled" disabled={isSubmitting || captchaLoading}>
          {isSubmitting ? "Posting…" : "Post comment"}
        </Button>
      </form>
    </Card>
  );
}
