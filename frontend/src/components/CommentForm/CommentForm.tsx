"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@apollo/client/react";
import { CombinedGraphQLErrors } from "@apollo/client/errors";
import {
  AttachmentDocument,
  CaptchaChallengeDocument,
  CreateCommentDocument,
  UploadAttachmentDocument,
  type UploadAttachmentMutation,
} from "@/graphql/generated";
import {
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_TEXT_EXTENSIONS,
  CAPTCHA_REGEX,
  COMMENT_TEXT_MAX_LENGTH,
  MAX_UPLOAD_BYTES,
  TEXT_FILE_MAX_BYTES,
  USERNAME_MAX_LENGTH,
  USERNAME_REGEX,
} from "@/lib/validation";
import { previewCommentHtml } from "@/shared/lib/commentPreview";
import { Card } from "@/shared/ui/Card";
import { Button } from "@/shared/ui/Button";
import { Skeleton } from "@/shared/ui/Skeleton";
import { TagToolbar, type WrapTag } from "@/components/TagToolbar";
import { AttachmentPreview } from "@/components/AttachmentPreview";
import cls from "./CommentForm.module.scss";

type UploadedAttachment = UploadAttachmentMutation["uploadAttachment"];

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

// Only images ever need this — text attachments come back from
// `uploadAttachment` with `processedAt` already set (synchronous, no queue).
const ATTACHMENT_POLL_INTERVAL_MS = 1500;
const ATTACHMENT_POLL_TIMEOUT_MS = 15_000;

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

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

/** A `data:<mime>;base64,...` URL — the backend accepts this prefix directly. */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

/** Some browsers/OSes leave `file.type` empty for a plain .txt — fall back to extension. */
function inferMimeType(file: File, isImage: boolean): string {
  if (file.type) return file.type;
  switch (extensionOf(file.name)) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    default:
      return isImage ? "application/octet-stream" : "text/plain";
  }
}

interface CommentFormProps {
  /** Omit for a root comment; pass a comment id to post a reply to it —
   * `CommentThreadNode` reuses this component for inline replies. */
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [attachment, setAttachment] = useState<UploadedAttachment | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [uploadAttachmentMutation] = useMutation(UploadAttachmentDocument);

  // Set once an uploaded image comes back with `processedAt: null` (queued for
  // resize) — `null` the rest of the time, including for text attachments,
  // which are already fully processed in the upload response.
  const [pollingAttachmentId, setPollingAttachmentId] = useState<string | null>(null);
  const { data: polledAttachment, stopPolling } = useQuery(AttachmentDocument, {
    variables: { id: pollingAttachmentId ?? "" },
    skip: !pollingAttachmentId,
    pollInterval: ATTACHMENT_POLL_INTERVAL_MS,
    fetchPolicy: "network-only",
  });

  // Poll → success: the resize finished, swap in the final (resized) attachment.
  useEffect(() => {
    const polled = polledAttachment?.attachment;
    if (polled?.processedAt) {
      setAttachment(polled);
      setPollingAttachmentId(null);
      stopPolling();
    }
  }, [polledAttachment, stopPolling]);

  // Poll → timeout: give up after ATTACHMENT_POLL_TIMEOUT_MS so the user isn't
  // stuck forever — clear the attachment so submit isn't blocked on it.
  useEffect(() => {
    if (!pollingAttachmentId) return undefined;

    const timeout = setTimeout(() => {
      stopPolling();
      setPollingAttachmentId(null);
      setAttachment(null);
      clearFileInput();
      setAttachmentError("Could not process the attachment in time. Please try a different file.");
    }, ATTACHMENT_POLL_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [pollingAttachmentId, stopPolling]);

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

  function clearFileInput() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleRemoveAttachment() {
    setAttachment(null);
    setAttachmentError(null);
    setPollingAttachmentId(null);
    stopPolling();
    clearFileInput();
  }

  /**
   * Uploads immediately on selection — matches the manual GraphQL Sandbox
   * testing flow (upload first, link on submit), not "stage a file, upload on
   * submit". Validates client-side first (type + the text 100 KB cap +
   * the general upload-size ceiling) purely to avoid a pointless base64 +
   * round trip for a file that's certain to be rejected — the backend
   * re-validates everything (MIME + extension + magic bytes) regardless.
   */
  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setAttachmentError(null);
    const ext = extensionOf(file.name);
    const isImage =
      ALLOWED_IMAGE_MIME_TYPES.includes(
        file.type as (typeof ALLOWED_IMAGE_MIME_TYPES)[number],
      ) || ALLOWED_IMAGE_EXTENSIONS.includes(ext as (typeof ALLOWED_IMAGE_EXTENSIONS)[number]);
    const isText =
      file.type === "text/plain" ||
      ALLOWED_TEXT_EXTENSIONS.includes(ext as (typeof ALLOWED_TEXT_EXTENSIONS)[number]);

    if (!isImage && !isText) {
      setAttachmentError("Only JPG/PNG/GIF images or a .txt file are allowed.");
      clearFileInput();
      return;
    }
    if (isText && file.size > TEXT_FILE_MAX_BYTES) {
      setAttachmentError(`Text files must be ${TEXT_FILE_MAX_BYTES / 1024} KB or smaller.`);
      clearFileInput();
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setAttachmentError(`File must be ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB or smaller.`);
      clearFileInput();
      return;
    }

    setAttachmentUploading(true);
    try {
      const data = await readFileAsDataUrl(file);
      const result = await uploadAttachmentMutation({
        variables: {
          input: {
            filename: file.name,
            mimeType: inferMimeType(file, isImage),
            data,
          },
        },
      });
      if (result.data) {
        const uploaded = result.data.uploadAttachment;
        setAttachment(uploaded);
        if (uploaded.type === "IMAGE" && !uploaded.processedAt) {
          // Queued for resize — start polling attachment(id) for processedAt.
          setPollingAttachmentId(uploaded.id);
        }
      }
    } catch (err) {
      setAttachmentError(
        CombinedGraphQLErrors.is(err)
          ? (err.errors[0]?.message ?? "Upload failed. Please try again.")
          : "Upload failed. Please try again.",
      );
      clearFileInput();
    } finally {
      setAttachmentUploading(false);
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
            ...(attachment ? { attachmentId: attachment.id } : {}),
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
      handleRemoveAttachment();
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

        <div className={cls.field}>
          <span className={cls.label}>Attachment (optional)</span>

          {!attachment && (
            <input
              ref={fileInputRef}
              className={cls.fileInput}
              type="file"
              accept=".jpg,.jpeg,.png,.gif,.txt,image/jpeg,image/png,image/gif,text/plain"
              onChange={(e) => {
                void handleFileChange(e);
              }}
              disabled={attachmentUploading}
            />
          )}

          {attachmentUploading && (
            <div className={cls.attachmentPending}>
              <Skeleton width={120} height={16} />
              <span className={cls.attachmentStatus}>Uploading…</span>
            </div>
          )}

          {!attachmentUploading && pollingAttachmentId && (
            <div className={cls.attachmentPending}>
              <Skeleton width={120} height={90} />
              <span className={cls.attachmentStatus}>Processing image…</span>
            </div>
          )}

          {attachment && !attachmentUploading && !pollingAttachmentId && (
            <div className={cls.attachmentDone}>
              <AttachmentPreview
                type={attachment.type}
                url={attachment.url}
                originalName={attachment.originalName}
              />
              <Button type="button" size="sm" variant="clear" onClick={handleRemoveAttachment}>
                Remove
              </Button>
            </div>
          )}

          {attachmentError && <span className={cls.fieldError}>{attachmentError}</span>}
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

        <Button
          type="submit"
          variant="filled"
          className={cls.submit}
          disabled={
            isSubmitting || captchaLoading || attachmentUploading || Boolean(pollingAttachmentId)
          }
        >
          {isSubmitting ? "Posting…" : "Post comment"}
        </Button>
      </form>
    </Card>
  );
}
