# core/guards

Placeholder for global / reusable guards.

Planned (step 4 — JWT / Moderator):

- `gql-auth.guard.ts` — `CanActivate` that reads the `Authorization: Bearer <jwt>`
  header out of the GraphQL context, verifies it with `JwtService`, loads the
  `Moderator`, and attaches it to `req.user` (consumed by
  `@CurrentUser()` in `core/decorators/`).
- `moderator.guard.ts` (or a role check inside the auth guard) — gates the
  `hideComment` / `banAuthor` mutations.

Pair with a `@Authorization()` decorator (`applyDecorators(UseGuards(GqlAuthGuard))`),
following the DedStream pattern noted in `docs/code-style-reference.md`.
