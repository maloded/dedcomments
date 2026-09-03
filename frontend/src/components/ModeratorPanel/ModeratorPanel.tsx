"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "@apollo/client/react";
import { CombinedGraphQLErrors } from "@apollo/client/errors";
import { ModeratorLoginDocument } from "@/graphql/generated";
import { useModeratorAuth } from "@/lib/moderatorAuth";
import { Card } from "@/shared/ui/Card";
import { Button } from "@/shared/ui/Button";
import cls from "./ModeratorPanel.module.scss";

/**
 * Reachable via a small "Moderator" toggle (not a prominent nav item — this
 * isn't a feature regular commenters need). Plain controlled inputs, not
 * React Hook Form/Zod like `CommentForm` — two fields with no client-side
 * validation beyond "don't submit empty" isn't worth the extra machinery;
 * the backend is the real authority on credentials anyway.
 */
export function ModeratorPanel() {
  const { session, isLoggedIn, login, logout } = useModeratorAuth();
  const [formOpen, setFormOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [moderatorLoginMutation, { loading }] = useMutation(ModeratorLoginDocument);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      const result = await moderatorLoginMutation({
        variables: { input: { username, password } },
      });
      const payload = result.data?.moderatorLogin;
      if (payload) {
        login({ token: payload.accessToken, username: payload.moderator.username });
        setFormOpen(false);
        setUsername("");
        setPassword("");
      }
    } catch (err) {
      setError(
        CombinedGraphQLErrors.is(err)
          ? (err.errors[0]?.message ?? "Login failed.")
          : "Login failed. Please try again.",
      );
    }
  }

  if (isLoggedIn && session) {
    return (
      <div className={cls.ModeratorPanel}>
        <span className={cls.loggedInAs}>Moderator: {session.username}</span>
        <Button type="button" size="sm" variant="clear" onClick={logout}>
          Log out
        </Button>
      </div>
    );
  }

  if (!formOpen) {
    return (
      <button type="button" className={cls.toggleLink} onClick={() => setFormOpen(true)}>
        Moderator
      </button>
    );
  }

  return (
    <Card padding="16" className={cls.loginCard}>
      <form
        className={cls.form}
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
      >
        <input
          className={cls.input}
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
        />
        <input
          className={cls.input}
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className={cls.formActions}>
          <Button type="submit" size="sm" variant="filled" disabled={loading}>
            {loading ? "Logging in…" : "Log in"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="clear"
            onClick={() => {
              setFormOpen(false);
              setError(null);
            }}
          >
            Cancel
          </Button>
        </div>
        {error && <span className={cls.error}>{error}</span>}
      </form>
    </Card>
  );
}
