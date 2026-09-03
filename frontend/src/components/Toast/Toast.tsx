"use client";

import { useToastMessage } from "@/lib/toast";
import cls from "./Toast.module.scss";

/** Renders the current toast message, if any — see `lib/toast.tsx`. */
export function Toast() {
  const message = useToastMessage();
  if (!message) return null;

  return (
    <div className={cls.Toast} role="status">
      {message}
    </div>
  );
}
