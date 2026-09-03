"use client";

import { useConnectionStatus, type ConnectionStatus } from "@/lib/connectionStatus";
import { classNames } from "@/shared/lib/classNames";
import cls from "./ConnectionStatusIndicator.module.scss";

const LABELS: Record<ConnectionStatus, string> = {
  connecting: "Connecting…",
  connected: "Live",
  reconnecting: "Reconnecting…",
  disconnected: "Offline",
};

/** A small dot + label reflecting the WebSocket connection's state — reads
 * it, never drives it (Socket.IO handles reconnection on its own; see
 * `RealtimeConnection`). */
export function ConnectionStatusIndicator() {
  const status = useConnectionStatus();

  return (
    <span className={cls.ConnectionStatusIndicator} title={`Live updates: ${LABELS[status]}`}>
      <span className={classNames(cls.dot, { [cls[status]]: true })} aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}
