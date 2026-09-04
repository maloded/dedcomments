import { useMemo } from "react";
import { classNames } from "@/shared/lib/classNames";
import { identiconDataUri } from "@/shared/lib/identicon";
import cls from "./Avatar.module.scss";

interface AvatarProps {
  /** Stable per-author string — we pass `username + " " + email`. */
  seed: string;
  className?: string;
}

/**
 * A deterministic identicon avatar (see `shared/lib/identicon`). Purely
 * decorative — `alt=""` / `aria-hidden`, since the username sits right next to
 * it. Display size is controlled by CSS (`.Avatar`, overridable per call site
 * via `className`), not a prop, so the comment tree can shrink it on mobile
 * from one media query.
 */
export function Avatar({ seed, className }: AvatarProps) {
  const src = useMemo(() => identiconDataUri(seed), [seed]);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- an inline data: URI, not a static asset
    <img src={src} alt="" aria-hidden width={40} height={40} className={classNames(cls.Avatar, {}, [className])} />
  );
}
