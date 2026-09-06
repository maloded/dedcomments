# Code Style Reference

Conventions distilled from the author's prior NestJS projects **DedStream**
(`../DedStream/dedstream-back` — GraphQL/Apollo + Prisma + PostgreSQL + Redis, closest
stack match) and **DedCinema** (`../dedcinema/backend` — multi-service, RabbitMQ, Docker
Compose). This file is the single source of truth for style from now on — the sibling
projects are **not** to be re-read unless explicitly requested.

## Formatting (Prettier)

Mirrors DedStream's `.prettierrc`:

```json
{
  "trailingComma": "all",
  "tabWidth": 4,
  "useTabs": true,
  "semi": true,
  "singleQuote": true,
  "jsxSingleQuote": true,
  "arrowParens": "avoid"
}
```

- Tabs for indentation, width 4.
- Single quotes, semicolons, trailing commas everywhere.
- `arrowParens: avoid` → `x => x`, not `(x) => x`.

## Linting

- ESLint flat config (`eslint.config.mjs`), `typescript-eslint` recommendedTypeChecked +
  `eslint-plugin-prettier/recommended`.
- `@typescript-eslint/no-explicit-any` is **off**; several `no-unsafe-*` rules relaxed to
  `warn`/`off`. Pragmatism over purity.
- `prettier/prettier` is an error — formatting is enforced by lint.

## TypeScript

- `module` / `moduleResolution`: `nodenext`. **No `"type": "module"`** in `package.json` —
  the project compiles as CommonJS, so relative imports have **no `.js` extension**.
- `strictNullChecks: true`, but `noImplicitAny: false` and `strictBindCallApply: false`.
- Path alias in DedStream is `@/*` → project root. For this project we keep imports
  relative (small module count); revisit if nesting gets deep.

## Folder layout

`core` / `shared` / `modules`, same split DedStream uses:

```
src/
  main.ts
  app.module.ts          # imports CoreModule + every feature module
  schema.gql             # generated (code-first, committed)

  core/                  # cross-cutting infrastructure, wired once
    core.module.ts       # config + GraphQL + Prisma + global APP_FILTER
    config/
      app-config.module.ts   # ConfigModule.forRoot({ isGlobal, validate })
      env.validation.ts      # EnvironmentVariables class + validateEnv()
      graphql.config.ts      # getGraphQLConfig(configService) factory
    prisma/
      prisma.module.ts   # @Global()
      prisma.service.ts  # extends PrismaClient
    filters/
      graphql-exception.filter.ts   # global GqlExceptionFilter
    decorators/
      current-user.decorator.ts     # @CurrentUser() param decorator
    guards/              # JWT / Moderator guards land here (step 4)

  shared/                # reusable building blocks, no feature logic
    dto/
      pagination.args.ts # @ArgsType base: page + sortOrder
    enums/
      sort-order.enum.ts # SortOrder { ASC, DESC } + registerEnumType
    constants/
      pagination.constants.ts   # DEFAULT_PAGE, ROOT_COMMENTS_PER_PAGE (25)
      validation.constants.ts   # USERNAME_REGEX, ALLOWED_HTML_TAGS,
                                # IMAGE_MAX_* , TEXT_FILE_MAX_BYTES, mime lists
      index.ts                  # barrel

  modules/               # one folder per feature
    <feature>/
      <feature>.module.ts
      <feature>.service.ts
      <feature>.resolver.ts     # omitted for internal modules (sanitizer/cache/gateway)
      models/            # GraphQL @ObjectType classes -> <name>.model.ts
      inputs/            # GraphQL @InputType classes   -> <name>.input.ts
    auth/  authors/  comments/  attachments/  captcha/
    sanitizer/  cache/  gateway/
```

Rules:
- A feature module never imports from another feature module's internals — only its
  exported service. Cross-feature primitives go in `shared/`.
- `core/` is imported once (via `CoreModule` in `AppModule`); feature modules rely on
  `@Global()` providers (`PrismaService`, `ConfigService`) rather than importing `core/`.
- `shared/` must stay dependency-free of `core/` and `modules/` (leaf layer).
- Intra-module layout (`*.module/service/resolver.ts` + `models/` + `inputs/`) is exactly
  DedStream's.
- Constants that appear in more than one place (regexes, size limits, page size) live in
  `shared/constants/` — never redefined inline in a validator / sanitizer / resolver.

## Modules

- Infra modules that are needed everywhere are `@Global()` and `exports:` their service
  (see DedStream `PrismaModule`, `RedisModule`).
- A feature module lists `providers: [XxxResolver, XxxService]` and only `exports` a
  service when another module consumes it.
- Config for async module setup lives in `src/core/config/*.config.ts` as a
  `getXxxConfig(configService: ConfigService)` factory passed to `forRootAsync`.
- Env vars are validated at boot by `core/config/env.validation.ts` (a class-validator
  `EnvironmentVariables` class + `validateEnv()` passed to `ConfigModule.forRoot`).
  Missing/malformed required vars crash the process with a readable list.

## Services

- `@Injectable()`, `public constructor(private readonly xxxService: XxxService) {}`.
- Methods are explicitly `public async`.
- Talk to the DB only through `PrismaService` (extends `PrismaClient`).
- Error handling: throw Nest built-in HTTP exceptions directly from the service
  (`NotFoundException`, `UnauthorizedException`, `BadRequestException`, …) with a short
  human message — no custom exception hierarchy, no wrapping in try/catch just to rethrow.

## Resolvers

- `@Resolver()` (or `@Resolver(() => XxxModel)` when it has field resolvers).
- Query/mutation names are set explicitly: `@Query(() => XxxModel, { name: 'findXxx' })`.
- Resolver methods stay thin — one call into the service, no business logic.
- Args: single-field via `@Args('id')`; multi-field via a dedicated `@InputType()` in
  `inputs/`.

## GraphQL models & inputs

- Model: `@ObjectType()` class `XxxModel implements Xxx` (the Prisma-generated type), one
  `@Field()` per column. `@Field(() => ID)` for ids, `@Field(() => Type, { nullable: true })`
  for optional columns.
- Input: `@InputType()` class with a `@Field()` **and** class-validator decorators
  (`@IsString()`, `@IsEmail()`, `@IsOptional()`, `@IsUrl()`, `@Matches()`) on every field.
- Validation runs through a global `ValidationPipe({ transform: true })` in `main.ts`.

## Auth — JWT / Moderator (implemented)

- **`modules/auth`** owns login + the JWT machinery. `JwtModule.registerAsync({ global:
  true, … })` so `JwtService` is injectable anywhere; `AuthService.moderatorLogin`
  (bcrypt via `bcryptjs`) issues a token `{ sub, username, role: 'MODERATOR' }`;
  `AuthService.verifyModerator(token)` is the verification used by the guard.
- **`core/guards/jwt-auth.guard.ts`** — `CanActivate` that reads `Authorization: Bearer
  <jwt>` from the Gql context, calls `AuthService.verifyModerator`, and puts the
  `Moderator` on `req.user`. **Provided + exported by `AuthModule`** (the file lives in
  `core/` per convention, the provider registration lives with `JwtModule`).
- Applied **per resolver**, never globally: `@UseGuards(JwtAuthGuard)` on `hideComment`
  (comments) and `banAuthor` (authors). Those feature modules `imports: [AuthModule]`.
- `@CurrentUser()` (`core/decorators/`) reads `req.user` — available on guarded resolvers.
- Same "Invalid username or password" for a wrong user and a wrong password (no account
  enumeration).
- **Moderator seed**: `npm run seed:moderator` (`prisma/seed-moderator.js`, plain
  CommonJS — deliberately not TypeScript/`ts-node`, so it also runs in the production
  image, e.g. `docker exec <container> npm run seed:moderator`, without needing pruned
  dev dependencies) upserts one account from `MODERATOR_USERNAME` / `MODERATOR_PASSWORD`
  in `backend/.env`. Dev defaults (in `.env.example`): **`moderator` /
  `moderator-dev-password`** — change before any real deploy.
- **Ban enforcement**: `AuthorsService.findOrCreate` (the choke point every
  `createComment` passes through) rejects a banned `(username, email)` identity with
  `ForbiddenException` before any write.

## WebSocket gateway (`modules/gateway`)

- Socket.IO (`@nestjs/platform-socket.io`), auto-attached to the app's HTTP port at
  `/socket.io/`. No auth on the connection, one broadcast room — anonymous viewers just
  want the live feed.
- `CommentsGateway.emitCommentCreated(comment: CommentModel)` → `server.emit(
  'commentCreated', comment)`. Called by `CommentsService.createComment` after the row is
  committed and the cache busted. `CommentsModule imports [GatewayModule]`.
- CORS on the socket is open (`cors: { origin: true }`) — it only ever broadcasts data
  that is already public via GraphQL and carries no credentials.

## Rate limiting (`@nestjs/throttler`)

- `GqlThrottlerGuard` (`core/guards/`, extends `ThrottlerGuard`, overrides
  `getRequestResponse` for the Gql context) is registered as a global `APP_GUARD` in
  `CoreModule`.
- Limits (`shared/constants/rate-limit.constants.ts`, `ttl` in ms, keyed by client IP,
  in-memory store):
  - global: **120 / 60 s**
  - `createComment`: **10 / 60 s** (`@Throttle`)
  - `moderatorLogin`: **5 / 60 s** (`@Throttle`) — blunt brute-forcing
- e2e turns it off via `process.env.THROTTLE_DISABLED` (set in `setup-e2e.ts`) —
  `ThrottlerModule`'s `skipIf`. The limits themselves are covered by the
  `security.e2e-spec.ts` "rate limiting" block (which re-enables it) + unit tests.
- In-memory store ⇒ per-instance. Multi-instance would need the Redis storage adapter.
  Behind a proxy, set `trust proxy` so `req.ip` is the real client.

## CORS

- `main.ts`: `origin: ALLOWED_ORIGIN ?? true`. `ALLOWED_ORIGIN` (env) pins it to the
  frontend origin (`http://localhost:3000` in dev); unset falls back to reflecting the
  request origin — a dev convenience. **Set `ALLOWED_ORIGIN` in production.** Auth is a
  bearer header, not a cookie, so `credentials: true` is belt-and-braces.

## GraphQL config (`core/config/graphql.config.ts`)

- `ApolloDriver`, `autoSchemaFile` → a committed `.gql` file, `sortSchema: true`.
- Old graphql-playground plugin is incompatible with Apollo Server 5 → `playground: false`
  and the embedded Apollo Sandbox landing-page plugin instead (dev only). Served at
  `GET /graphql` for browsers.
- `context: ({ req, res }) => ({ req, res })`.

## Error handling

- Services throw Nest built-in HTTP exceptions (`NotFoundException`, `BadRequestException`,
  `UnauthorizedException`, …) with a short message.
- `core/filters/graphql-exception.filter.ts` is a global `APP_FILTER` (registered in
  `CoreModule`) that normalizes every error into a `GraphQLError` with an
  `extensions.code` (`NOT_FOUND`, `BAD_REQUEST`, `INTERNAL_SERVER_ERROR`, …). Unknown
  errors are logged server-side and returned as a generic "Internal server error".

## Sanitizer (`modules/sanitizer`)

The comment-body sanitizer is the primary XSS defence. Design decisions:

- **Reject, don't strip.** Disallowed tags/attributes and malformed markup throw
  `BadRequestException` with a human message — the author finds out their markup was
  wrong instead of silently losing content. (Silent stripping hides mistakes and is
  easier to probe for bypasses.)
- **Reject, don't auto-fix.** Unclosed tags, mis-nested tags and stray end tags are
  rejected; the sanitizer never closes tags on the author's behalf. "Valid XHTML" per
  the brief.
- Allowed: `<a href title>`, `<code>`, `<i>`, `<strong>` — from `shared/constants`
  (`ALLOWED_HTML_TAGS` / `ALLOWED_HTML_ATTRIBUTES`). `<a href>` must be a safe scheme
  (`http`/`https`/`mailto`), empty, or a fragment/relative link.
- Implementation: an `htmlparser2` pass (`xmlMode`) enforces the whitelist + tag balance
  (every open needs an **explicit** matching close — implied closes are treated as
  "not properly closed"); a source-vs-parsed `</tag>` count catches orphan end tags.
  Then `sanitize-html` runs as a final normalisation/defence-in-depth pass.
- **Accepted normalisation:** text-level entities (`&` → `&amp;`, bare `<` → `&lt;`) are
  normalised toward valid XHTML by `sanitize-html`. That is escaping, not structural
  auto-fixing, and the stored value renders identically.
- `SanitizerModule` is `@Global` (comments now, live-preview resolver later).
- **Security review (Step 5) — confirmed rejected**: mixed-case `<ScRiPt>` (parser is
  `lowerCaseTags`), `data:` and `JavaScript:` URIs in `href`, `on*` event-handler
  attributes. Entity-encoded payloads (`&lt;script&gt;`) are stored as inert text.
  Comment bodies are capped at `COMMENT_TEXT_MAX_LENGTH` (20 000) by the DTO before the
  sanitizer runs (DoS guard).

## Raw SQL / recursive queries

- Prisma has no recursive relation loading, so tree reads (`commentThread`) use a
  **recursive CTE** via `prismaService.$queryRaw` — the **tagged-template** form only, so
  every interpolated value (`${rootId}`) is a bound parameter (`$1`). **Never**
  `$queryRawUnsafe` or string concatenation for anything user-supplied (brief:
  SQL-injection protection). A junk / metacharacter id just matches nothing → clean 404.
- Column identifiers are quoted (`"parentId"`, `"createdAt"`) — Prisma keeps field names
  camelCase in Postgres, which is case-folded unless quoted. Postgres enum columns are
  cast `::text` in the SELECT so the driver returns a plain string.
- The flat rows are reassembled into the nested `@ObjectType` tree in the service
  (a `Map<id, node>` pass), ordering each level newest-first (LIFO).
- No cycle guard needed: `parentId` is only ever set at creation to an existing comment,
  and comments are immutable — a cycle is unconstructable.
- The CTE also filters `isHidden = false` at every level — hiding a comment hides its
  whole subtree from public view. `rootComments` filters `isHidden` too. There is no
  "but a moderator can see hidden" path — deliberately simple: hidden means hidden.
- **Security review (Step 5) — re-confirmed**: the only interpolation is `${rootId}` in
  the tagged `$queryRaw`, bound as `$1`. Verified in `security.e2e-spec.ts` against
  `1' OR '1'='1`, `'; DROP TABLE …`, `UNION SELECT`, `pg_sleep(5)` — all return a clean
  `NOT_FOUND`, tables intact.

## Case-insensitive sorting

- `rootComments(sortBy: USERNAME | EMAIL)` must sort case-insensitively (users expect
  "alpha", "TestUser1", "zeta", not Postgres's default collation putting every
  uppercase-leading string before every lowercase one).
- **Prisma's `orderBy` has no `mode: 'insensitive'`.** That option only exists on
  `where` filter types (`StringFilter`/`StringNullableFilter`) — check the generated
  `AuthorOrderByWithRelationInput` in `.prisma/client/index.d.ts` before assuming
  otherwise, it changes across major versions. On `orderBy`, `username`/`email` are
  typed as plain `SortOrder` (`'asc' | 'desc'`), not an object that accepts `mode`. This
  was re-verified against the pinned Prisma 6.19.3 client for this project.
- **Chosen fix: app-maintained lowercase mirror columns**, not a Postgres
  `GENERATED ALWAYS AS (...) STORED` column. `Author.usernameLower`/`emailLower` are
  ordinary Prisma `String` fields, set once in `AuthorsService.findOrCreate` — the
  **only** place `username`/`email` are ever written (an identity's username/email never
  change after its `Author` row is created — `@@unique([username, email])` makes that
  pair the identity). `rootComments`'s `orderBy` sorts on these instead of
  `username`/`email` directly.
  - A real Postgres generated column would guarantee sync at the DB level instead of by
    convention, but Prisma has no schema syntax for `GENERATED ALWAYS AS` — it would mean
    hand-written DDL in every future migration touching that table (`prisma migrate dev`
    can't diff a column it doesn't know is generated) for a single-write-path table. Not
    worth it here; revisit if a second `Author`-creating path ever appears.
  - Fully injection-safe by construction: no raw SQL, no string concatenation — just a
    normal Prisma field written from `.toLowerCase()` and sorted on via `orderBy`.
- Migration `20260903122801_author_lowercase_sort_columns` adds both columns nullable,
  backfills existing rows with `UPDATE ... SET x = lower(y)`, then sets `NOT NULL` — the
  three-step shape needed because the table already had rows and neither column has a
  meaningful constant default.

## Redis caching

- `CacheService` (`modules/cache`, `@Global`) wraps one `ioredis` connection:
  `get/set(+TTL)/del/delByPattern` + `getJson/setJson`.
- **JSON round-trip loses types.** `setJson`/`getJson` turn `Date` into an ISO string, so
  a cache *hit* must revive them (`new Date(...)`) before returning — the GraphQL
  `DateTime` scalar rejects strings. See `CommentsService.reviveRootPage`.
- Cache keys are namespaced (`rootComments:{page}:{sortBy}:{sortOrder}`). Invalidation is
  coarse: `delByPattern('rootComments:*')` on **every** `createComment` (a reply changes
  a root's `repliesCount` too, not just new roots). TTL is short (45 s) as a backstop.
- `delByPattern` uses `SCAN`, never `KEYS` (which blocks Redis).

## Attachment uploads (`modules/attachments`)

- **Transport: base64 inside a normal GraphQL mutation**, not `graphql-upload`
  (multipart). `graphql-upload@16+` is ESM-only and fights our CJS + ts-jest setup (same
  class of pain as `htmlparser2`/`@nestjs/config`); the file-size limits here are tiny
  (text ≤ 100 KB, images resized to 320×240), so the ~33% base64 overhead is a non-issue.
  `UploadAttachmentInput { filename, mimeType, data }`; a `data:` URL prefix is stripped.
- The Express JSON body limit is raised to `HTTP_BODY_LIMIT` (12 MB) in `main.ts` /
  `createTestApp` — the default 100 KB would 413 every image upload.
- **Validation happens before anything is written**: MIME must be an allowed image or
  `text/plain`; extension must match; images are magic-byte sniffed (defeats a spoofed
  MIME); text must be NUL-free valid UTF-8 and ≤ 100 KB. All failures →
  `BadRequestException`.
- **Storage** is local disk (`AttachmentStorageService`, `UPLOADS_DIR`, flat
  `<id><ext>` files), served read-only at `/uploads/*` via `useStaticAssets`. Swap for S3
  later without touching the service/consumer.
- **Async resize**: an image upload creates an unprocessed row (`processedAt = null`) and
  emits `attachment.resize` to RabbitMQ; the consumer (`AttachmentsConsumer`, same
  process — monolith) resizes with `sharp` (`fit: 'inside'`, `withoutEnlargement`),
  overwrites the file, and stamps `processedAt` + the new `size`. Text needs no
  processing — `processedAt` is set on upload.
- The upload mutation only creates the `Attachment`; `commentId` stays null until
  `createComment(attachmentId:)` links it (one-to-one, rejects an already-linked id).

## RabbitMQ / `@nestjs/microservices`

- Hybrid app: `NestFactory.create` (HTTP) + `app.connectMicroservice({ transport: RMQ })`
  + `startAllMicroservices()` in `main.ts` **and** `createTestApp` (so e2e drains the
  queue). Producer side is `ClientsModule.registerAsync` → inject `ClientProxy`.
- `@EventPattern` handlers live on a `@Controller` (`controllers: [...]`, not
  `providers`). Manual ack (`noAck: false`): `ack` on success, `nack(msg, false, false)`
  (no requeue) on an unrecoverable error — a corrupt image won't fix itself.
- Queue name from `RABBITMQ_ATTACHMENTS_QUEUE`. Run e2e with the dev server **stopped** —
  otherwise both processes pull from the shared queue.
- `sharp` is unit-tested in isolation (`ImageProcessingService`), no queue/DB needed.

## Docker Compose (DedCinema pattern)

- One `docker-compose.yml` at the repo root; each backing service gets a
  `container_name`, `restart: always`, a named volume, and lives on a shared user network.
- Service versions are pinned (`postgres:15`, `redis:6.2`, `rabbitmq:3-management`).
- RabbitMQ always uses the `-management` image and publishes `5672` + `15672`.
- Credentials come from `${VARS}` resolved from an env file, never hard-coded.
- App service: multi-stage Dockerfile (`builder` → `runner`), `runner` sets
  `NODE_ENV=production`, copies only `node_modules` + `dist` + `prisma`, runs
  `prisma generate` in the build stage, `CMD ["node", "dist/main"]`.

## Divergences from the sibling projects (deliberate)

- **Prisma 6 + classic query engine + `prisma-client-js` generator + `DATABASE_URL`**,
  not DedStream's Prisma 7 + `@prisma/adapter-pg` + `POSTGRES_URI`. The brief and the
  setup checklist call for `DATABASE_URL` and `npx prisma migrate dev`; the classic
  engine is the lower-risk choice for a "clone and run" reviewer. Can be upgraded later
  without touching call sites.
- **JWT** auth instead of Redis session cookies (brief requirement).
- Redis (via `ioredis`, `modules/cache`) holds one-time CAPTCHA answers now and will
  cache the comments list later. DedStream used the `redis` v4 client; `ioredis` chosen
  here for its simpler connection lifecycle.
- **Exact-pinned** `sanitize-html@2.16.0` + `htmlparser2@8.0.2` (not `^`): 2.17 pulls
  `htmlparser2@12` which is ESM-only and breaks the CJS Jest runner. Same reason
  `@nestjs/config` is pinned to 4.
- CAPTCHA answers live only in **Redis** (keyed by token, TTL from
  `CAPTCHA_TTL_SECONDS`), not in the `CaptchaChallenge` Prisma model — that table is
  currently unused and may be dropped or repurposed for audit/rate-limiting later.
