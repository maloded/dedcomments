"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

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

// `sessionStorage`, deliberately not `localStorage`: a moderator session
// should survive a page reload during active work (the original
// plain-React-state version lost it on every refresh — annoying for real
// use and for demoing moderation), but it has no reason to persist
// indefinitely or bleed into a fresh browser session. `sessionStorage` is
// scoped to the tab and cleared when it closes — exactly that middle ground.
const STORAGE_KEY = "dedcomments.moderatorSession";

/**
 * Decode a JWT's `exp` (seconds since epoch) *without* verifying the
 * signature — signature verification is the backend's job. Used only to
 * avoid restoring a token we can already tell is stale. A token that passes
 * this check can still be rejected server-side; that path is handled by
 * `useModerationActions` (UNAUTHORIZED → `logout()`). Returns `null` for an
 * unparseable token or one with no `exp`.
 */
function jwtExpiryMs(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const { exp } = JSON.parse(json) as { exp?: number };
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Read a still-valid session from `sessionStorage`, or `null`. Removes the
 * stored value if it's malformed or already past its `exp`, so a bad entry
 * can't linger and get re-evaluated on every load. Safe during a server
 * render (no `window`) and in privacy modes where touching `sessionStorage`
 * throws.
 */
function readStoredSession(): ModeratorSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<ModeratorSession>;
    if (!parsed.token || !parsed.username) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }

    const expiry = jwtExpiryMs(parsed.token);
    if (expiry !== null && expiry <= Date.now()) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return { token: parsed.token, username: parsed.username };
  } catch {
    return null;
  }
}

function writeStoredSession(session: ModeratorSession): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage disabled or full — the in-memory session still works for this
    // page load, it just won't survive a reload. Not worth surfacing.
  }
}

function clearStoredSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing actionable — logout still cleared the in-memory state.
  }
}

/**
 * Holds the moderator's JWT in React state for in-page reactivity, mirrored
 * into `sessionStorage` so an active session survives a page reload (it does
 * NOT survive closing the tab — see `STORAGE_KEY`'s comment). The session is
 * restored on mount via `useState`'s lazy initializer; reading storage there
 * is safe because the whole interactive tree is client-only (`HomeView`'s
 * `dynamic(..., { ssr: false })`), so there's no server-rendered logged-in
 * UI for this to hydration-mismatch against.
 *
 * An invalid/expired restored token is handled in two places:
 * `readStoredSession` drops one that's already past its `exp` before it's
 * ever restored, and `useModerationActions` calls `logout()` (which clears
 * storage too, below) if the backend rejects a token on an actual
 * moderation call — so the UI never stays stuck showing a broken
 * "logged in" state.
 */
export function ModeratorAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ModeratorSession | null>(readStoredSession);

  const login = useCallback((next: ModeratorSession) => {
    setSession(next);
    writeStoredSession(next);
  }, []);

  const logout = useCallback(() => {
    setSession(null);
    clearStoredSession();
  }, []);

  const value = useMemo<ModeratorAuthValue>(
    () => ({ session, isLoggedIn: session !== null, login, logout }),
    [session, login, logout],
  );

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
