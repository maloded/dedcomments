import { useMemo, type ImgHTMLAttributes } from "react";
import { classNames } from "@/shared/lib/classNames";
import { identiconDataUri } from "@/shared/lib/identicon";
import cls from "./Avatar.module.scss";

interface AvatarProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt" | "width" | "height"> {
  /** Stable per-author string — we pass `username + " " + email`. */
  seed: string;
}

/**
 * A deterministic identicon avatar (see `shared/lib/identicon`). Purely
 * decorative — `alt=""` / `aria-hidden`, since the username sits right next to
 * it. Display size is controlled by CSS (`.Avatar`, overridable per call site
 * via `className`), not a prop, so the comment tree can shrink it on mobile
 * from one media query.
 *
 * Forwards arbitrary props (`...rest`) to the `<img>` — `CommentThreadNode`
 * uses this to attach `data-node-id`/`data-connector-avatar`, the hooks the
 * thread's connector-line overlay measures real rendered positions from (see
 * `useConnectorLines`).
 */
export function Avatar({ seed, className, ...rest }: AvatarProps) {
  const src = useMemo(() => identiconDataUri(seed), [seed]);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- an inline data: URI, not a static asset
    <img
      src={src}
      alt=""
      aria-hidden
      width={40}
      height={40}
      className={classNames(cls.Avatar, {}, [className])}
      {...rest}
    />
  );
}
