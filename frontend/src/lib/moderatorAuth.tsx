"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface ModeratorSession {
  token: string;
  username: string;
}

interface ModeratorAuthValue {
  session: ModeratorSession | null;
  isLoggedIn: boolean;
  login: (session: ModeratorSession) => void;
  logout: () => void;
}

const ModeratorAuthContext = createContext<ModeratorAuthValue | null>(null);

/**
 * Holds the moderator's JWT in plain React state — deliberately not
 * `sessionStorage`, though the brief allows either. This is a small,
 * secondary feature (a link most visitors never touch), not a real admin
 * panel: in-memory is the simpler of the two allowed options, and the
 * trade-off (a page reload logs the moderator out) costs nothing here — it's
 * not a workflow anyone leaves and returns to mid-session.
 */
export function ModeratorAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ModeratorSession | null>(null);

  const value: ModeratorAuthValue = {
    session,
    isLoggedIn: session !== null,
    login: setSession,
    logout: () => setSession(null),
  };

  return (
    <ModeratorAuthContext.Provider value={value}>{children}</ModeratorAuthContext.Provider>
  );
}

export function useModeratorAuth(): ModeratorAuthValue {
  const ctx = useContext(ModeratorAuthContext);
  if (!ctx) {
    throw new Error("useModeratorAuth must be used within ModeratorAuthProvider");
  }
  return ctx;
}
