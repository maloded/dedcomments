"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

const StatusContext = createContext<ConnectionStatus>("connecting");
const SetStatusContext = createContext<(status: ConnectionStatus) => void>(() => {});

/**
 * Holds the Socket.IO connection's status so `RealtimeConnection` (which owns
 * the actual socket) and any UI that wants to display it (a status dot) can
 * both reach it without prop drilling. Split into a read context and a write
 * context so a status-indicator component re-renders on change without also
 * needing to know how to change it.
 */
export function ConnectionStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  return (
    <StatusContext.Provider value={status}>
      <SetStatusContext.Provider value={setStatus}>{children}</SetStatusContext.Provider>
    </StatusContext.Provider>
  );
}

export function useConnectionStatus(): ConnectionStatus {
  return useContext(StatusContext);
}

export function useSetConnectionStatus(): (status: ConnectionStatus) => void {
  return useContext(SetStatusContext);
}
