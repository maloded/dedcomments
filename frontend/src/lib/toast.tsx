"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";

const ToastContext = createContext<string | null>(null);
const SetToastContext = createContext<(message: string) => void>(() => {});

/**
 * A minimal transient-notification context — one message at a time, no
 * queue. Used for the `authorBanned` socket event's "nice to have" notice
 * (CLAUDE.md → Step 10); nothing else in the app needs a toast yet.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show(next: string) {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setMessage(next);
    timeoutRef.current = setTimeout(() => setMessage(null), 4000);
  }

  return (
    <ToastContext.Provider value={message}>
      <SetToastContext.Provider value={show}>{children}</SetToastContext.Provider>
    </ToastContext.Provider>
  );
}

export function useToastMessage(): string | null {
  return useContext(ToastContext);
}

export function useShowToast(): (message: string) => void {
  return useContext(SetToastContext);
}
