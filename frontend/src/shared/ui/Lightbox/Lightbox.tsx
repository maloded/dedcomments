"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import cls from "./Lightbox.module.scss";

interface LightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

/**
 * A single-image lightbox: dimmed overlay, image centered, closes on overlay
 * click or Escape. No gallery/next-prev — a comment has at most one attachment,
 * so there's nothing to navigate between. Portaled to `document.body` (a fixed
 * overlay shouldn't depend on where in the tree it was mounted), and locks
 * background scroll while open.
 */
export function Lightbox(props: LightboxProps) {
  const { src, alt, onClose } = props;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div className={cls.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <button type="button" className={cls.close} onClick={onClose} aria-label="Close">
        ×
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- an arbitrary backend-hosted image, not a static asset */}
      <img
        className={cls.image}
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
  );
}
