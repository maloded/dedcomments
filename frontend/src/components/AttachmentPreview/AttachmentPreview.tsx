"use client";

import { useState } from "react";
import { Lightbox } from "@/shared/ui/Lightbox";
import { resolveAttachmentUrl } from "@/lib/attachmentUrl";
import cls from "./AttachmentPreview.module.scss";

interface AttachmentPreviewProps {
  type: "IMAGE" | "TEXT";
  url: string;
  originalName: string;
}

/**
 * Renders one comment's attachment: a clickable thumbnail (opens a `Lightbox`)
 * for an image, or a download link + filename for a text file — per the brief,
 * text attachments don't need the lightbox treatment. Used both in an
 * already-posted comment (`CommentThreadNode`) and the form's own pending
 * upload preview (`CommentForm`).
 */
export function AttachmentPreview(props: AttachmentPreviewProps) {
  const { type, url, originalName } = props;
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const resolvedUrl = resolveAttachmentUrl(url);

  if (type === "IMAGE") {
    return (
      <>
        <button
          type="button"
          className={cls.thumbnailButton}
          onClick={() => setLightboxOpen(true)}
          aria-label={`View ${originalName}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary backend-hosted image, not a static asset */}
          <img className={cls.thumbnail} src={resolvedUrl} alt={originalName} />
        </button>
        {lightboxOpen && (
          <Lightbox src={resolvedUrl} alt={originalName} onClose={() => setLightboxOpen(false)} />
        )}
      </>
    );
  }

  return (
    <a
      className={cls.fileLink}
      href={resolvedUrl}
      download={originalName}
      target="_blank"
      rel="noreferrer"
    >
      📄 {originalName}
    </a>
  );
}
