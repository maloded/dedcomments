import type { HTMLAttributes, ReactNode } from "react";
import { classNames } from "@/shared/lib/classNames";
import cls from "./Card.module.scss";

export type CardPadding = "0" | "8" | "16" | "24";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: CardPadding;
}

const paddingClass: Record<CardPadding, string> = {
  "0": cls.gap_0,
  "8": cls.gap_8,
  "16": cls.gap_16,
  "24": cls.gap_24,
};

/** Base surface primitive — a bordered, rounded container. */
export function Card(props: CardProps) {
  const { className, children, padding = "16", ...rest } = props;

  return (
    <div
      className={classNames(cls.Card, {}, [className, paddingClass[padding]])}
      {...rest}
    >
      {children}
    </div>
  );
}
