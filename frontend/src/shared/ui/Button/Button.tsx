import { forwardRef, type ButtonHTMLAttributes } from "react";
import { classNames, type Mods } from "@/shared/lib/classNames";
import cls from "./Button.module.scss";

export type ButtonVariant = "filled" | "outline" | "clear";
export type ButtonSize = "sm" | "md";
export type ButtonColor = "normal" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  color?: ButtonColor;
  fullWidth?: boolean;
}

/**
 * Base button primitive. Variant/size/color props map to SCSS Modules classes —
 * see CLAUDE.md → "Styling approach" for the naming convention this follows.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(props, ref) {
    const {
      className,
      variant = "outline",
      size = "md",
      color = "normal",
      fullWidth,
      disabled,
      type = "button",
      ...rest
    } = props;

    const mods: Mods = {
      [cls.fullWidth]: fullWidth,
    };

    const additional = [className, cls[variant], cls[size], cls[color]];

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        className={classNames(cls.Button, mods, additional)}
        {...rest}
      />
    );
  },
);
