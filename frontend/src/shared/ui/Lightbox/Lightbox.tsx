"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { classNames } from "@/shared/lib/classNames";
import cls from "./Lightbox.module.scss";

interface LightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

// Roughly the scrim-out / image-out keyframe duration (see Lightbox.module.scss);
// a touch longer so the exit animation always finishes before we unmount. Under
// `prefers-reduced-motion` the CSS is ~1ms and this just adds an unnoticeable
// beat before close.
const CLOSE_MS = 180;

/**
 * A single-image lightbox: dimmed overlay, image centered, closes on overlay
 * click or Escape. No gallery/next-prev — a comment has at most one attachment,
 * so there's nothing to navigate between. Portaled to `document.body` (a fixed
 * overlay shouldn't depend on where in the tree it was mounted), and locks
 * background scroll while open.
 *
 * Open/close are animated (scrim fade + image scale — the brief's "visual
 * effects" for attachment viewing). `requestClose` swaps in the exit animation
 * class and unmounts via a short timer.
 */
export function Lightbox(props: LightboxProps) {
  const { src, alt, onClose } = props;
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestClose = useCallback(() => {
    if (timer.current) return;
    setClosing(true);
    timer.current = setTimeout(onClose, CLOSE_MS);
  }, [onClose]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        requestClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [requestClose]);

  return createPortal(
    <div
      className={classNames(cls.overlay, { [cls.closing]: closing })}
      onClick={requestClose}
      role="dialog"
      aria-modal="true"
    >
      <button type="button" className={cls.close} onClick={requestClose} aria-label="Close">
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
