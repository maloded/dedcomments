import type { CSSProperties } from "react";
import { classNames } from "@/shared/lib/classNames";
import cls from "./Skeleton.module.scss";

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  radius?: string;
}

/**
 * Loading placeholder — a static shimmer animation (module class) plus inline
 * `style` for the per-instance dimensions CSS Modules can't parameterize. See
 * CLAUDE.md → "Styling approach"; adapted from WordWeave's `Skeleton`.
 */
export function Skeleton(props: SkeletonProps) {
  const { className, width = "100%", height = "16px", radius = "var(--radius-sm)" } = props;

  const style: CSSProperties = {
    width,
    height,
    borderRadius: radius,
  };

  return <div className={classNames(cls.Skeleton, {}, [className])} style={style} />;
}
