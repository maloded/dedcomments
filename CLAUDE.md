# Comments SPA — dZENcode Test Assignment

## Context

Technical test assignment for a job application at dZENcode. Target level: **Middle**.
Deadline: **09.09.2026**.
The result is reviewed by a QA specialist against a checklist, then by technical specialists.

## Original Assignment (translated from the source brief)

### General description
SPA "Comments" application. Users can leave comments in a tree-like forum structure
(similar in spirit to Habr/Disqus), without mandatory registration. All comments are stored
in a relational database together with author data that helps identify the client
(username + email).

### Comment submission form
Required fields:
1. **User Name** — Latin letters and digits only, required
2. **E-mail** — valid email format, required
3. **Home page** — valid URL, **optional**
4. **CAPTCHA** — digits and Latin letters, image-based, required
5. **Text** — the message body itself, required. ONLY these tags are allowed:
   `<a href="" title="">`, `<code>`, `<i>`, `<strong>`. All other HTML is disallowed.
   Markup must be valid XHTML (tags must be properly closed).

### Home page
1. Cascading display — any comment can have an unlimited number of replies
   (tree of unlimited depth)
2. Top-level comments (not replies) are shown in a **table**, sortable by:
   User Name, E-mail, date added (both ascending and descending)
3. Pagination: **25 messages per page** (pagination applies only to top-level comments)
4. Must be protected against **XSS** and **SQL injection**
5. Default sort order — **LIFO** (newest first)
6. A simple, clean CSS design is encouraged

### Tree display (clarified during planning discussion)
- The main table shows ONLY top-level comments + a reply count (`repliesCount`),
  without nested data — to keep the list lightweight
- Clicking "Expand" on a specific root comment loads its entire subtree in one request
  (not loaded level by level)
- Within a thread, replies are sorted LIFO regardless of the root table's sort order
- Visual nesting: indentation grows with depth up to a cap of ~5-6 levels, then stays fixed,
  using a left border ("thread line") instead of pure margin so deep threads don't run off
  screen, especially on mobile

### File handling (JavaScript)
1. A comment can have ONE attachment: an image OR a text file
2. Image: max 320×240px; if larger, it must be proportionally resized; formats: JPG, GIF, PNG
3. Text file: max 100KB, format TXT
4. Viewing attachments should use a visual effect (lightbox — see lightbox2 as a reference)

### Regular expressions / sanitization
1. Allowed HTML tags in the text: `<a href="" title="">`, `<code>`, `<i>`, `<strong>`
2. Must validate that tags are properly closed — valid XHTML

### JavaScript and AJAX
1. Validation on both client and server
2. Live preview of the message without a page reload
3. A button toolbar for HTML tags ([i], [strong], [code], [a])
4. Visual effects are encouraged

### Required tools (all levels)
- NestJS (chosen over ExpressJS)
- ORM (Prisma)
- Frontend: React (chosen from Vue/React/Angular)
- Git
- Docker
- WebSocket (WS)

### Junior+ (included in Middle scope)
- Queue
- Cache
- Events
- JWT

### Middle (our target level)
- Graph (GraphQL — chosen from the options)
- Message broker (RabbitMQ — chosen from RabbitMQ/Kafka)
- NoSQL (Redis — chosen from Elasticsearch/Redis/Mongo)
- Cloud — deployed to a cloud/VDS

### Middle+ (NOT in target scope, but architecture should not preclude it)
- Designed for 1,000,000 messages, 100k users per 24h
- Load testing
(Not implementing this, but architectural decisions should not be dead ends — e.g. separating
reads/writes via cache and queue already partially lays the groundwork.)

### Delivery format
- Deployed application (hosting/VDS)
- Git repository (one, monorepo — see "Repository structure")
- Docker — entire app and environment containerized
- README.md — what the project is, what features are implemented, how to run it from scratch
- Database schema file, openable in MySQL Workbench
- Video — a short demo of the deployed application, showcasing the implemented functionality
  as fully as possible

Self-check before submitting: be able to spin up the project from scratch strictly following
the README, from a clean clone of the repository.

---

## Domain model

### Author
An anonymous comment author — NOT a full account with login/password. Identified by
username + email at the time of submission. The same email may appear across multiple
comments (not a single account with a profile), but we store it as a separate entity for
aggregation purposes (sorting/counting by author).

### Comment
The core of the domain. Immutable after publishing (creation only, no editing — the brief
doesn't require edits). Either a root comment (`parentId = null`) or a reply to another
comment (`parentId != null`) — a tree of unlimited depth.

### Attachment
Optional attachment on a comment: an image (after resizing) or a text file. Max one per comment.

### Moderator (role for JWT)
The brief has no explicit "admin," but JWT is required from Junior+ level. A meaningful use
of it in this domain is moderation: hiding spam comments, banning by email/username. A
separate protected role, authenticated via JWT, with access to moderation mutations.

### CAPTCHA challenge (not a DB entity)
A one-time token generated when the comment form is opened, verified on submit, then
invalidated. Stored in **Redis** (key = token, value = expected answer, with a TTL) — not
in Postgres. There is deliberately no `CaptchaChallenge` table.

---

## Stack

**Backend:** NestJS + TypeScript + GraphQL (Apollo Server) + Prisma + PostgreSQL
**Cache:** Redis (caches the top-level comments list)
**Queue:** RabbitMQ (attachment processing — async image resizing)
**Auth:** JWT (Moderator role only)
**Real-time:** WebSocket (NestJS Gateway) — `commentCreated` event for live list updates
**Frontend:** React + Next.js (App Router), Apollo Client + GraphQL Codegen, plain CSS/Tailwind
**Infra:** Docker, Docker Compose (postgres, redis, rabbitmq, backend, frontend), Nginx
(optional reverse proxy on deploy), deployed to a VDS or Vercel(front)+VDS(back)/Render

---

## Repository structure (monorepo)

```
dedcomments/
├── backend/                    # NestJS + Prisma + GraphQL
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts       # imports CoreModule + every feature module
│   │   ├── schema.gql          # generated (code-first, committed)
│   │   ├── core/               # cross-cutting infrastructure, wired once
│   │   │   ├── core.module.ts  # config + GraphQL + Prisma + global exception filter
│   │   │   ├── config/         # app-config.module, env.validation, graphql.config
│   │   │   ├── prisma/         # PrismaModule (@Global) + PrismaService
│   │   │   ├── filters/        # graphql-exception.filter (global APP_FILTER)
│   │   │   ├── decorators/     # @CurrentUser()
│   │   │   └── guards/         # JWT / Moderator guards (added in step 4)
│   │   ├── shared/             # reusable, feature-agnostic building blocks
│   │   │   ├── dto/            # pagination.args (page + sortOrder base @ArgsType)
│   │   │   ├── enums/          # sort-order.enum (SortOrder)
│   │   │   └── constants/      # username regex, allowed HTML tags, file-size limits,
│   │   │   │                   # page size (25) — centralised, never inlined
│   │   └── modules/            # one folder per feature (module/service/resolver
│   │       │                   #   + models/ + inputs/)
│   │       ├── auth/           # JWT, Moderator guard
│   │       ├── authors/        # Author entity
│   │       ├── comments/       # Comment CRUD, resolvers, tree logic
│   │       ├── attachments/    # Upload, resize, queue producer/consumer
│   │       ├── captcha/        # CAPTCHA generation and verification
│   │       ├── sanitizer/      # HTML tag whitelist, XHTML validation
│   │       ├── cache/          # Redis wrapper
│   │       └── gateway/        # WebSocket Gateway
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── docs/
│   │   └── code-style-reference.md
│   ├── Dockerfile
│   ├── prisma.config.ts
│   └── package.json
├── frontend/                   # Next.js (build AFTER backend API is stable)
├── docker-compose.yml          # postgres, redis, rabbitmq, backend (frontend added later)
├── README.md
└── docs/
    └── db-schema.mwb           # for MySQL Workbench
```

**Important:** backend and frontend do NOT share an npm workspace — they only communicate over
the network (GraphQL API). Shared types come from codegen against `schema.graphql`, not from
package linking.

---

## Prisma schema (draft, reference)

```prisma
model Author {
  id        String    @id @default(uuid())
  username  String
  email     String
  homepage  String?
  comments  Comment[]
}

model Comment {
  id         String      @id @default(uuid())
  text       String
  authorId   String
  author     Author      @relation(fields: [authorId], references: [id])
  parentId   String?
  parent     Comment?    @relation("Replies", fields: [parentId], references: [id])
  replies    Comment[]   @relation("Replies")
  attachment Attachment?
  createdAt  DateTime    @default(now())
}

model Attachment {
  id           String          @id @default(uuid())
  commentId    String          @unique
  comment      Comment         @relation(fields: [commentId], references: [id])
  type         AttachmentType  // IMAGE | TEXT
  url          String
  originalName String
  size         Int
}

enum AttachmentType {
  IMAGE
  TEXT
}

model Moderator {
  id           String  @id @default(uuid())
  username     String  @unique
  passwordHash String
}
```

---

## Core GraphQL endpoints (priority 1 implementation order)

- `rootComments(page: Int, sortBy: RootCommentSortField, sortOrder: SortOrder): RootCommentsPage!`
  — **implemented**. Top-level comments only (`parentId IS NULL`, `isHidden = false`),
  25/page. `RootCommentSortField = USERNAME | EMAIL | CREATED_AT` (default `CREATED_AT`,
  `sortOrder` default `DESC` → LIFO). Returns `RootCommentsPage { items: [CommentModel!]!,
  totalCount, page, totalPages }`; each item carries `repliesCount` (direct, non-hidden
  replies via Prisma `_count`) and **no** nested replies. Result cached in Redis
  (`rootComments:{page}:{sortBy}:{sortOrder}`, 45 s TTL); the whole `rootComments:*`
  keyspace is busted on every `createComment`.
- `commentThread(rootId: ID!): ThreadCommentModel!` — **implemented**. One recursive CTE
  (`$queryRaw`, parameterized) fetches the root + all descendants at any depth in one
  round-trip, JOINing author and attachment; the service reassembles the flat rows into a
  nested `ThreadCommentModel { …, attachment, replies: [ThreadCommentModel!]! }` with each
  level ordered newest-first (LIFO). 404 if `rootId` is unknown or is itself a reply
  (the CTE anchor requires `parentId IS NULL`). SQL-injection-safe: a metacharacter id
  just yields an empty result → clean 404.
- `createComment(input: CreateCommentInput!): CommentModel!` — **implemented**.
  `CreateCommentInput { username, email, homepage?, text, parentId?, captchaToken,
  captchaAnswer, attachmentId? }`. Flow: verify CAPTCHA (one-time) → field validation
  (username regex `^[a-zA-Z0-9]+$`, `@IsEmail`, `@IsUrl`) → sanitize/validate body
  (tag whitelist + explicit-close XHTML check, **rejects** rather than strips) → parent
  must exist if `parentId` set → find-or-create `Author` by (username,email) → create
  `Comment` (links `attachmentId` in the same transaction). Returns `CommentModel
  { id, text, parentId, author, repliesCount, createdAt }`.
- `captchaChallenge: CaptchaChallengeModel!` — **implemented**. Returns
  `{ token, image (SVG data URL), expiresAt }`; the expected answer is stored in Redis
  under the token with a TTL (`CAPTCHA_TTL_SECONDS`). Verified once, then invalidated.
- `uploadAttachment(input: UploadAttachmentInput!): AttachmentModel!` — **implemented**.
  `UploadAttachmentInput { filename, mimeType, data }` — `data` is the file bytes
  **base64-encoded** (not multipart `Upload`; a `data:` URL prefix is accepted). One
  image (JPG/GIF/PNG) or a `.txt` ≤ 100 KB. Validates MIME + extension + magic bytes
  before writing. Images: stored as-is, an `Attachment` row is created with
  `processedAt = null`, and a job is published to the `attachment.resize` RabbitMQ queue;
  the consumer (same process) resizes proportionally to fit **320×240** with `sharp`,
  overwrites the file and stamps `processedAt` + `size`. Text: validated + stored
  synchronously, `processedAt` set immediately. Files are served read-only at
  `/uploads/*`. Returns `AttachmentModel { id, type, url, originalName, size, processedAt }`;
  its `id` goes into `createComment(attachmentId:)`.
- `moderatorLogin(input: ModeratorLoginInput!): AuthPayload!` — **implemented**.
  `{ username, password }` → `{ accessToken (JWT), moderator }`. bcrypt-checked against the
  `Moderator` table; same error for bad user / bad password. Rate-limited 5/min. Seed an
  account with `npm run seed:moderator`.
- `hideComment(commentId: ID!): CommentModel!` — **implemented**. Moderator only
  (`Authorization: Bearer <jwt>`). Sets `isHidden = true`; the comment (and, in a thread,
  its whole subtree) then vanishes from `rootComments` and `commentThread`.
- `banAuthor(authorId: ID!): AuthorModel!` — **implemented**. Moderator only. Sets
  `Author.isBanned = true`; that `(username, email)` identity's future `createComment`
  calls are rejected with `FORBIDDEN` (checked in `AuthorsService.findOrCreate`). Existing
  comments stay.
- **WebSocket** (`modules/gateway`, Socket.IO at `/socket.io/`) — `createComment`
  broadcasts a `commentCreated` event carrying the new `CommentModel` (id, text, author,
  parentId, createdAt, …) to every connected client. No auth, one room.

**Explicit decision:** do NOT start the frontend until the core endpoints (`rootComments`,
`commentThread`, `createComment`, `captchaChallenge`) are implemented and tested via
GraphQL Playground/Postman.

---

## Tree rendering on the frontend (for the future frontend session)

- Home page — table of roots only + reply count + "Expand" button
- Clicking "Expand" loads `commentThread(rootId)`; the tree renders via a recursive React
  component
- Indentation: `Math.min(depth, 6) * 24px`, plus a left "thread line" border for deep
  branches instead of pure margin
- On mobile, the depth cap is lower (3-4 levels) via a media query
- Expanded/collapsed state — plain React state, no repeated requests needed on collapse

---

## Reference implementations for inspiration

These are **architectural/UX references only** — study the patterns, do not copy code,
text, or design assets (see copyright note below).

- **Reddit comment threading** — the canonical example of deeply nested, collapsible comment
  trees with indentation caps and thread lines on deep branches. Useful reference for how to
  cap visual indentation and use collapse/expand state per subtree. Reddit's default sort is
  a ranking algorithm ("Best"), not chronological — our brief explicitly wants plain LIFO
  (newest first), so we deliberately diverge from Reddit here: no voting, no ranking algorithm.
- **Hacker News comment threads** — much simpler visual model (fixed-width indent per level,
  no cap, works because threads are rarely extremely deep) — useful as a "what NOT to do at
  scale" reference, and a good illustration of why a depth cap matters for a general-purpose
  comment system.
- **Disqus** — closest functional analog to this assignment: anonymous-friendly commenting
  widget, nested replies, lazy-loaded threads, spam moderation tooling. Good reference for the
  Author/Moderator split in the domain model and for how third-party comment widgets handle
  unauthenticated identity (name + email, no password).
- **Habr comments** — similar tree-based comment system in a dev-community context, closest
  cultural analog to what this brief is describing; useful for the "load full subtree on
  expand" interaction pattern.
- **lightbox2** (https://lokeshdhakar.com/projects/lightbox2/) — explicitly referenced in the
  original brief as the expected style for attachment preview effects.

Do not fetch or reproduce any live HTML/CSS/JS from these sites — use them only as behavioral/UX
references when reasoning about interaction design, exactly as the assignment brief itself points
to lightbox2 as a UX reference, not a code source.

---

## Code style references (from the author's own prior projects)

- **DedStream** (dedstream.in.ua) — NestJS + GraphQL (Apollo) + Prisma + PostgreSQL + Redis,
  Next.js App Router + Apollo Client + GraphQL Codegen, deployed to a VPS with
  Docker/Nginx/Let's Encrypt — the closest stack match; reuse its module structure and
  approach to auth/GraphQL resolvers
- **DedCinema** — microservice architecture over gRPC, full observability
  (Prometheus/Grafana/Jaeger/Loki) — overkill for this test (a monolith is sufficient), but
  its Docker Compose pattern with multiple services plus a queue (RabbitMQ) can be reused
  directly
- **WordWeave** — REST + Feature-Sliced Design on the frontend — not a primary reference here
  (this project uses GraphQL and the frontend comes later), but its form validation patterns
  (React Hook Form + Zod) are worth reusing

---

## Work order

1. Backend skeleton: repository, Docker Compose (postgres/redis/rabbitmq), Prisma schema,
   base NestJS modules (auth, authors, comments, attachments, captcha)
2. Core GraphQL endpoints (see above) + validation + CAPTCHA
3. Attachments: resizing via queue, limits, Redis cache for the comments list
4. WebSocket (`commentCreated`) + JWT/Moderator + XSS/SQL-injection protection +
   pagination/sorting/LIFO
5. Frontend: form, table, tree, live preview, tag button toolbar, lightbox — ONLY after the
   API from steps 2-4 is stable
6. Polish UI/CSS, README, database schema file for MySQL Workbench
7. Deploy to VDS/cloud, verify "from scratch" per README
8. Record demo video

## Deadline: 09.09.2026

---

## Progress log

### Step 1 — backend skeleton + core/shared/modules structure (done)

**Implemented**
- Monorepo: `backend/` (NestJS) + empty `frontend/` placeholder.
- NestJS project (TypeScript, npm, CommonJS), code-first GraphQL via `@nestjs/apollo`
  (Apollo driver) — schema generated to `backend/src/schema.gql`.
- Prisma + PostgreSQL: schema for Author, Comment (self-relation), Attachment,
  `AttachmentType`, Moderator, **+ CaptchaChallenge** (see deviations). Indexes added on
  `Comment.createdAt` / `parentId` / `(parentId, createdAt)` and `Author.username` /
  `email`. Initial migration `20260902120143_init` created + applied.
- 8 feature module skeletons under `src/modules/`: auth, authors, comments, attachments,
  captcha, sanitizer, cache, gateway. `comments` exposes a placeholder `health` query so
  the schema is non-empty.
- `src/core/`: `CoreModule` (config + GraphQL + Prisma + global exception filter),
  `AppConfigModule` with **env-var validation** (`env.validation.ts`, class-validator),
  `graphql.config.ts`, `PrismaModule/Service`, global `GraphqlExceptionFilter`,
  `@CurrentUser()` decorator, empty `guards/` for the future JWT guard.
- `src/shared/`: `PaginationArgs` base `@ArgsType` (page + sortOrder), `SortOrder` enum,
  and `constants/` centralising the username regex, allowed-HTML-tag whitelist, image
  320×240 / text 100 KB limits, and the 25-per-page constant.
- Root `docker-compose.yml`: postgres 16, redis 7, rabbitmq 3-management (5672 + 15672),
  and a `backend` service (multi-stage `node:20-alpine` Dockerfile, runs
  `prisma migrate deploy` then boots). Healthchecks + `depends_on: service_healthy`.
- `backend/.env.example` + gitignored `backend/.env`; root + backend `.gitignore`.
- `backend/docs/code-style-reference.md` — conventions distilled from DedStream/DedCinema
  (one-time scan; not to be revisited).

**Deviations from the original plan (with reasons)**
- **`src/core` + `src/shared` + `src/modules`** instead of flat feature folders directly
  under `src/` (as the original tree showed). Matches DedStream's real layout and keeps
  cross-cutting infra / reusable primitives / features cleanly separated. The Repository
  structure tree above has been updated to match.
- **`CaptchaChallenge` model added** — it's a first-class entity in the Domain model
  section though not in the bare field list; the captcha flow needs a one-time token row.
  Also added `Comment.isHidden` (moderation) and `Attachment.processedAt` (queue worker).
- **Version pins, not latest majors**: NestJS 11 (CLI 12 scaffold breaks conventions),
  `@nestjs/graphql`/`@nestjs/apollo` 13 (+ `@as-integrations/express5`), `@nestjs/config` 4
  (v12 is ESM-only, breaks ts-jest), **Prisma 6** (v7 forces driver adapters; classic
  engine + `DATABASE_URL` matches the brief's checklist). `prisma` + `dotenv` are runtime
  deps so `migrate deploy` works in the container.
- **GraphQL Playground**: the legacy playground plugin is dead on Apollo Server 5, so the
  embedded **Apollo Sandbox** is served at `GET /graphql` (loads in a browser; a non-HTML
  request there returns 400 by design).
- **No `git init` in the earlier pass** — done now as part of this step's wrap-up.

**Verified**: `docker compose up -d postgres redis rabbitmq` → healthy; `prisma migrate dev`
→ applied; `npm run start:dev` → boots clean, `POST /graphql { health }` → `ok`,
`GET /graphql` → Apollo Sandbox (HTTP 200); `npm run build` / `lint` / `test:e2e` green;
full Docker image builds and the containerised backend boots + serves `/graphql`.

**Pending — next: read-side queries**
- `rootComments(page, sortBy, sortOrder)` — 25/page, sort by username/email/date, LIFO
  default, returns `repliesCount` without nested data (Redis-cached).
- `commentThread(rootId)` — full subtree in one request (recursive CTE).
- Then attachments (`uploadAttachment` + RabbitMQ resize) and the JWT/Moderator guard.

---

### Step 2 — CAPTCHA, sanitizer, createComment (done)

**Implemented**
- **`modules/cache`** — real `CacheService` over `ioredis` (`get`/`set`+TTL/`del` + JSON
  helpers). `@Global`.
- **`modules/captcha`** — `svg-captcha` generation (`captchaChallenge` query →
  `{ token, image: SVG data URL, expiresAt }`); answer stored in Redis under the token
  with `CAPTCHA_TTL_SECONDS` TTL. `CaptchaService.verify(token, answer)` — internal,
  case-insensitive, one-time (deletes the key on every attempt, success or not).
- **`modules/sanitizer`** — `SanitizerService.sanitize(text)`: `htmlparser2` whitelist +
  explicit-close XHTML check, then `sanitize-html`. **Rejects** disallowed tags/attrs,
  unsafe `href`, and malformed markup with a clear `BadRequestException` (no silent
  stripping / auto-closing). See docs/code-style-reference.md → "Sanitizer".
- **`modules/comments`** — `createComment` mutation + `CommentModel` + `CreateCommentInput`
  (class-validator: username regex, `@IsEmail`, `@IsUrl`, UUIDs). Flow described in
  "Core GraphQL endpoints" above. Placeholder `health` query removed.
- **`modules/authors`** — `AuthorsService.findOrCreate({username,email,homepage})` via
  `upsert` on the new `@@unique([username, email])`.
- Migration `..._author_identity_unique_and_nullable_attachment`: `Author` gets
  `@@unique([username,email])`; `Attachment.commentId` becomes **nullable** (upload
  first, link on `createComment`).
- Tests: 30 unit (`sanitizer` 15, `captcha` 6, `comments.service` 5, + config 4) and
  9 e2e (`createComment` happy paths + reply + bad field / bad CAPTCHA / XSS / bad
  username / ghost parent / token-replay). e2e reads the CAPTCHA answer from Redis.

**Deviations from the plan (with reasons)**
- CAPTCHA answers stored in **Redis only**, not the `CaptchaChallenge` Prisma model
  (step brief said Redis). That model is now unused — keep for later audit/rate-limit or
  drop.
- `Attachment.commentId` made nullable + `Author` unique constraint added — needed for
  the "upload separately, link on create" flow and duplicate-free author aggregation.
- Exact-pinned `sanitize-html@2.16.0` + `htmlparser2@8.0.2`: 2.17 → `htmlparser2@12`
  (ESM-only) breaks the CJS Jest runner.
- Sanitizer **rejects** bad markup instead of stripping (documented choice — better UX +
  security). Bare `&` / `<` in text are escaped to valid XHTML (`&amp;`), which is
  normalisation, not structural auto-fixing.
- 1 known `npm audit` high (`deepmerge`-family, transitive of `sanitize-html`) — config
  is a static object, not user-controlled deep merge; acceptable for now.

**Verified**: `npm run build` / `lint` / `test` (30) / `test:e2e` (9) all green.
Manual GraphQL check: `captchaChallenge` → solve → `createComment` creates the comment;
wrong CAPTCHA, `<script>`, `<img onerror>`, `javascript:` href, unclosed/mis-nested tags,
bad username/email, and replies to a missing parent all rejected with clear coded errors.

---

### Step 3 — rootComments (paginated/sorted/cached) + commentThread (recursive CTE) (done)

**Implemented**
- **`rootComments`** query — see "Core GraphQL endpoints" above. New:
  `RootCommentsArgs extends PaginationArgs` (+ `sortBy`), `RootCommentSortField` enum,
  `RootCommentsPage` model. Sort by date / `author.username` / `author.email` (Prisma
  related-field `orderBy`), 25/page from `ROOT_COMMENTS_PER_PAGE`, `_count` filtered to
  non-hidden replies.
- **Redis caching** — `CacheService.delByPattern` (SCAN-based) added; new
  `shared/constants/cache.constants.ts` (`rootComments:` prefix, 45 s TTL). Cache hit
  path revives ISO strings back to `Date` (`reviveRootPage`). `createComment` busts
  `rootComments:*` after every successful create.
- **`commentThread`** query — `getCommentThread` runs one recursive CTE via
  parameterized `$queryRaw`, JOIN author + LEFT JOIN attachment, `ORDER BY depth ASC,
  createdAt DESC`; service reassembles flat rows into a nested `ThreadCommentModel`
  (recursive), LIFO per level. New models: `ThreadCommentModel`, `AttachmentModel`,
  `AttachmentType` GraphQL enum (`modules/attachments/{models,enums}`).
- `includeStacktraceInErrorResponses: false` added to the Apollo config (was leaking
  stack traces in error `extensions`).
- `test/jest-e2e.json`: `maxWorkers: 1` (DB-backed e2e must be serial).
- Tests: **46 unit** (was 30; +16 for rootComments sort/pagination/cache-hit-miss and
  commentThread tree/recursion/injection-param/404) and **19 e2e** (was 9; new
  `comments-read.e2e-spec.ts` truncates the DB, seeds a 4-level tree, checks LIFO order,
  every sort field + direction, empty page past the end, cache populate + bust,
  thread nesting/LIFO, 404 for unknown id and for a reply id, and an injection-string
  rootId that 404s cleanly with the table intact afterward).

**Deviations from the plan (with reasons)**
- `repliesCount` = **direct** replies (Prisma `_count` on the `replies` relation), as the
  step brief specified — not the whole-subtree count. Applies to both `rootComments`
  items and `ThreadCommentModel` nodes.
- Cache is busted on **every** `createComment`, not only new roots — a reply changes its
  root's `repliesCount` in the cached list. Still "flush `rootComments:*`", still cheap.
- `rootComments` excludes `isHidden` comments; `commentThread` does **not** filter
  `isHidden` (keeps the tree intact). Moot until moderation exists; revisit in step 4.
- `commentThread` has no recursion depth cap — brief says unlimited depth, and cycles are
  unconstructable (immutable `parentId`).

**Verified**: build / lint / 46 unit / 19 e2e green. Manual: seeded a 4-level thread,
`rootComments` returns LIFO + correct `repliesCount` + working sort/pagination + cache
populate/bust; `commentThread` returns the full nested tree LIFO-ordered; a reply id and
`'1) OR 1=1; DROP TABLE authors;--'` both return a clean `NOT_FOUND` with the DB intact.

**Pending — next**
- `uploadAttachment` (file upload → Attachment row) + RabbitMQ worker for image resize
  (320×240) / text-file validation (100 KB); link into `commentThread`/`createComment`.
- JWT/Moderator guard in `core/guards/` + `hideComment` / `banAuthor` mutations; then
  apply `isHidden` filtering consistently.
- WebSocket `commentCreated` event (`modules/gateway`).

---

### Step 4 — attachment upload + RabbitMQ resize; drop CaptchaChallenge (done)

**Cleanup**
- Removed the unused `CaptchaChallenge` Prisma model (CAPTCHA state lives in Redis).
  Migration `20260902153834_drop_captcha_challenge` drops `captcha_challenges`. No code
  referenced it (the GraphQL `CaptchaChallengeModel` is a separate, still-used type).
  Domain model section updated.

**Implemented — `modules/attachments`**
- `uploadAttachment(input): AttachmentModel!` — see "Core GraphQL endpoints". Full
  validation (MIME + extension + image magic bytes + text UTF-8/size) *before* touching
  disk; all failures → `BadRequestException`.
- `AttachmentStorageService` — local disk (`UPLOADS_DIR`, flat `<id><ext>`), served at
  `/uploads/*` (`useStaticAssets` in `main.ts`).
- `ImageProcessingService` — `sharp` wrapper (`fit: 'inside'`, `withoutEnlargement`,
  EXIF-rotate); unit-tested in isolation.
- `AttachmentsConsumer` — `@EventPattern('attachment.resize')` on a `@Controller`;
  manual ack, `nack` w/o requeue on unrecoverable errors. Same process as the API
  (monolith) via `app.connectMicroservice` + `startAllMicroservices` (added to `main.ts`
  and `createTestApp`). Producer: `ClientsModule.registerAsync` → `ClientProxy`.
- Text files: validated + stored synchronously, `processedAt` set on upload (no queue).
- `createComment(attachmentId:)` linking was already correct (Step 2) — verified: links
  an unlinked attachment in the create transaction, `NOT_FOUND` for an unknown id,
  `BAD_REQUEST` for an already-linked one.
- `main.ts`: `useBodyParser('json', { limit: '12mb' })` — Express's 100 KB default 413s
  every image upload.
- Deps added: `@nestjs/microservices`, `amqplib`, `amqp-connection-manager`, `sharp`.
- Env: `RABBITMQ_ATTACHMENTS_QUEUE` default renamed to `attachment.resize`; new
  `UPLOADS_DIR`.

**Deviations (with reasons)**
- **base64-in-GraphQL upload, not `graphql-upload`/multipart.** `graphql-upload@16+` is
  ESM-only and breaks the CJS + ts-jest setup (same wall as `htmlparser2` / old
  `@nestjs/config`). File limits here are tiny, so base64 overhead is irrelevant, and it
  keeps upload a first-class GraphQL mutation that's trivially testable. Signature is
  `uploadAttachment(input: UploadAttachmentInput!)` rather than `(file: Upload!)`.
- Monolith consumer (same process), not a separate service — matches the "monolith is
  sufficient" note in the brief.
- `amqplib@2` + `amqp-connection-manager@5` (both current latest) — verified working in
  dev and in the alpine Docker image.
- e2e must run with the dev server **stopped** (shared RabbitMQ queue). Noted in
  `create-test-app.ts` and code-style-reference.

**Verified**: build / lint / **64 unit** / **29 e2e** green. Docker image builds on
`node:20-alpine` and boots (sharp + amqp load fine). Manual before/after:
1920×1080 → 320×180, 600×900 → 160×240, 240×180 → unchanged (all fit 320×240, aspect
preserved); upload → queue → `processedAt` stamped → `createComment` links the id →
`commentThread` shows the attachment.

**Pending — next**
- JWT/Moderator guard in `core/guards/` + `hideComment` / `banAuthor`; apply `isHidden`
  filtering consistently.
- WebSocket `commentCreated` event (`modules/gateway`).
- Deployment + XSS/SQLi security pass + README.

---

### Step 5 — WebSocket gateway, JWT/Moderator auth, rate limiting, security pass (done)

**This is the last backend step. The backend is now feature-complete for the
Middle-level scope** — every required tool (NestJS, Prisma, GraphQL, Redis, RabbitMQ,
JWT, WebSocket, Docker) is in place and exercised. Next up is the **frontend**.

**WebSocket** (`modules/gateway`)
- Socket.IO gateway (`@nestjs/platform-socket.io`) on the app's HTTP port, `/socket.io/`.
  `CommentsGateway.emitCommentCreated(comment)` broadcasts `commentCreated` (the full
  `CommentModel`) to all clients; called by `CommentsService.createComment`. No auth,
  one room, `cors: { origin: true }` (only public data, no credentials).

**JWT / Moderator** (`modules/auth` + `core/guards`)
- `moderatorLogin` → JWT (`@nestjs/jwt`, global `JwtModule`; bcrypt via `bcryptjs`).
- `JwtAuthGuard` (`core/guards/jwt-auth.guard.ts`, provided by `AuthModule`) — verifies
  the bearer token, loads the `Moderator`, sets `req.user`. Applied per-resolver with
  `@UseGuards`, never globally.
- `hideComment` (comments), `banAuthor` (authors) — both `@UseGuards(JwtAuthGuard)`.
- `Author.isBanned` added (migration `20260902160159_author_is_banned`).
  `AuthorsService.findOrCreate` rejects a banned identity (`FORBIDDEN`) before any write.
- Seed: `npm run seed:moderator` (`prisma/seed-moderator.ts`) — dev creds
  `moderator` / `moderator-dev-password` in `.env.example`.

**`isHidden` enforced everywhere**
- `commentThread` CTE now filters `isHidden = false` at every level (Step 3 deferred
  this). Hiding a comment hides its subtree. `rootComments` + `_count` already filtered.
  No moderator-can-see-hidden path — deliberately simple.

**Rate limiting** (`@nestjs/throttler`)
- Global `GqlThrottlerGuard` (`APP_GUARD`). Limits: global 120/min, `createComment`
  10/min, `moderatorLogin` 5/min (keyed by IP, in-memory). e2e disables it via
  `THROTTLE_DISABLED`; `security.e2e-spec.ts` re-enables it for its own block.

**Security review findings/fixes**
- CTE parameterization re-confirmed via 4 injection payloads → clean `NOT_FOUND`.
- Sanitizer confirmed against `<ScRiPt>`, `data:`/`JavaScript:` hrefs, `on*` attrs;
  entity-encoded payloads stored inert. Added `COMMENT_TEXT_MAX_LENGTH` (20 000) constant.
- Body-parser limit **reduced** 12 MB → **8 MB** (`MAX_UPLOAD_BYTES` 8 → 5 MB) to shrink
  the large-body attack surface; `createComment.text` is separately capped + rate-limited.
- CORS: `ALLOWED_ORIGIN` pins to the frontend; documented that it must be set in prod.
- Stack traces already off in error responses (Step 3).

**Deviations (with reasons)**
- `bcryptjs` (pure-JS) not native `bcrypt` — one less native build in the Alpine image;
  same API.
- Moderation mutations live on the **feature** resolvers (`hideComment` in comments,
  `banAuthor` in authors), not a separate `ModerationResolver` — avoids an
  `auth ↔ comments/authors` import cycle.
- `hideComment`/`banAuthor` return the updated entity (not a `Boolean`) so a client can
  reflect the new state without a refetch.
- e2e `test:e2e` now runs with `--forceExit` (throttler's in-memory store keeps a timer).
- `tsconfig.build.json` also excludes `prisma/**` (the new seed script was lifting
  tsc's rootDir and pushing the build output to `dist/src/`).

**Verified**: build / lint / **78 unit** / **50 e2e** green. Manual: `moderatorLogin`
→ token; `hideComment` without token → `UNAUTHORIZED`, with token → hidden + gone from
both queries; `banAuthor` → banned identity blocked (`FORBIDDEN`), other identities fine;
a live socket client receives `commentCreated` on `createComment`; rapid `createComment`
→ `THROTTLER` after 10.

**Pending — frontend** (separate session): form + live preview + tag toolbar + CAPTCHA,
root table (sort/paginate), recursive tree with "Expand", lightbox attachments,
`commentCreated` socket subscription, moderator login + hide/ban UI.

---

### Post-step-5 bug fix — `GqlThrottlerGuard` breaking the RabbitMQ consumer (done)

Found via manual GraphQL Sandbox testing (uploading an image with the dev server running
normally, i.e. `THROTTLE_DISABLED` unset) — not caught by the existing test suite, because
every e2e spec runs with `THROTTLE_DISABLED=true`, which short-circuits the throttler via
`skipIf` before it ever touches a request context, masking the bug.

**Root cause**: `GqlThrottlerGuard` is registered globally (`APP_GUARD` in `CoreModule`), so
Nest runs it in front of *every* handler behind a guard — including the RabbitMQ
`AttachmentsConsumer`'s `@EventPattern('attachment.resize')` handler, which is an RPC
execution context, not GraphQL. Its `getRequestResponse` unconditionally did
`GqlExecutionContext.create(context).getContext().req` — `undefined` in an RPC context — so
every attempt to process a resize job threw `TypeError: Cannot read properties of undefined
(reading 'req')` before reaching the resize logic. The message was never ack'd or nack'd, so
it sat in RabbitMQ's Unacked state forever (`Ready 0, Unacked 1` in the management UI).

**Fix**: `GqlThrottlerGuard` now overrides `shouldSkip` (the base `ThrottlerGuard`'s
first check in `canActivate`, run *before* `getRequestResponse`) to skip — i.e. let the
request through unthrottled — for any execution context whose `getType()` isn't
`'graphql'`. RPC/microservice contexts (and any future non-GraphQL context) now bypass the
guard entirely instead of reaching the GraphQL-only `getRequestResponse` path. Rate limiting
was only ever meant to cover `createComment`/`moderatorLogin` (both GraphQL mutations), so
this doesn't change intended behaviour, just stops it from misfiring where it was never meant
to apply.

**Regression test**: `attachments.e2e-spec.ts` gained a
`resize queue survives the global throttler guard (regression)` block, modeled on
`security.e2e-spec.ts`'s pattern of deleting `THROTTLE_DISABLED` for one describe block —
it drives a real image through `uploadAttachment` → the real RabbitMQ consumer with
throttling actually enabled, and asserts `processedAt` gets set and the image is resized to
320×240. This is the scenario the existing suite's `THROTTLE_DISABLED=true` default was
silently skipping.

**Audit of other global providers** (`APP_GUARD`/`APP_INTERCEPTOR`/`APP_FILTER` in
`core.module.ts`) for the same class of bug:
- `JwtAuthGuard` — applied per-resolver via `@UseGuards`, never global; not at risk.
- `GraphqlExceptionFilter` (`APP_FILTER`, `@Catch()`) — also GraphQL-labelled, but
  `GqlArgumentsHost.getInfo()` on an RPC context's 2-arg `getArgs()` just returns
  `undefined` (`fieldName` defaults to `'?'`) rather than throwing, so it degrades safely
  instead of crashing. Not currently reached in practice either, since the consumer catches
  its own errors and never lets one escape to a global filter. Left as-is; flagged as
  something to narrow (e.g. `@Catch()` → GraphQL-only) if it ever grows real RPC-specific
  behaviour.
- No other `APP_GUARD`/`APP_INTERCEPTOR`/`APP_FILTER` providers exist.

**Verified**: build / lint / **78 unit** / **51 e2e** green (unit count unchanged; e2e +1
for the regression test). Manual: RabbitMQ management UI showed `Ready 0, Unacked 0` on
`attachment.resize` before this fix was tested (no message was actually stuck at fix time —
confirmed instead by re-running the exact repro: `uploadAttachment` a 640×480 PNG with
`THROTTLE_DISABLED` unset against a fresh server instance) — the consumer log showed the
`resize:` success line (no `TypeError`), the file on disk was resized to 320×240, and
`processedAt` was stamped in Postgres; the queue stayed at `Ready 0, Unacked 0` throughout.

---

### Post-step-5 bug fix — case-insensitive `rootComments` sorting (done)

Found during manual testing: `rootComments(sortBy: USERNAME | EMAIL)` sorted by
Postgres's default (case-sensitive) collation, so e.g. `"TestUser1"` sorted before
`"alpha"` — every uppercase-leading string before every lowercase one — instead of the
expected alphabetical order (`"alpha"`, `"TestUser1"`, `"zeta"`).

**Investigated**: Prisma's `orderBy` has no `mode: 'insensitive'` — that option only
exists on `where` filter types (`StringFilter`/`StringNullableFilter`); the generated
`AuthorOrderByWithRelationInput` types `username`/`email` as plain `SortOrder`
(`'asc' | 'desc'`), confirmed against the pinned Prisma 6.19.3 client. So the
Prisma-native `orderBy` route the ticket suggested checking first isn't available.

**Fix chosen: app-maintained lowercase mirror columns**, not a Postgres
`GENERATED ALWAYS AS (...) STORED` column:
- `Author.usernameLower` / `Author.emailLower` — ordinary Prisma `String` fields, set
  once in `AuthorsService.findOrCreate` (the **only** place `username`/`email` are ever
  written — an identity's username/email never change post-creation, since
  `@@unique([username, email])` makes that pair the identity itself).
  `CommentsService.buildRootOrderBy` now sorts on these instead of `username`/`email`.
- A real DB-generated column would guarantee sync at the Postgres level rather than by
  convention, but Prisma has no schema syntax for `GENERATED ALWAYS AS` — every future
  migration touching `authors` would need hand-written DDL to avoid Prisma's migration
  diffing clobbering it, for a table with exactly one write path today. Not worth the
  ongoing friction; noted in code-style-reference.md as the thing to revisit if a second
  `Author`-creating path ever appears.
- Fully injection-safe by construction — no raw SQL anywhere in the query path, just a
  normal Prisma field populated via `.toLowerCase()` and sorted on via `orderBy`.
- Migration `20260903122801_author_lowercase_sort_columns`: adds both columns nullable,
  backfills existing rows (`UPDATE ... SET x = lower(y)`), then sets `NOT NULL` — needed
  because the table already had rows and neither column has a meaningful constant
  default. New `@@index([usernameLower])` / `@@index([emailLower])` for sort performance.
  Documented in code-style-reference.md → "Case-insensitive sorting".

**Tests**:
- `comments.service.spec.ts`: the `sorts by %s %s` table now asserts `orderBy` targets
  `author.usernameLower` / `author.emailLower`, not `username`/`email`.
- `authors.service.spec.ts`: new case asserting `findOrCreate({ username: 'TestUser1',
  email: 'TestUser1@Example.COM' })` upserts `usernameLower: 'testuser1'` /
  `emailLower: 'testuser1@example.com'`.
- `comments-read.e2e-spec.ts`: seeded roots now include a mixed-case `TestUser1` (4 roots
  total: zeta, alpha, mike, TestUser1). `sorts by USERNAME ascending and descending` and
  `sorts by EMAIL ascending` assert the real, case-insensitive Postgres order (`alpha`,
  `mike`, `TestUser1`, `zeta` ascending) — this is the regression test: it runs against
  the real DB collation, so it would have caught the original bug. Adjusted the
  now-stale hardcoded counts (`totalCount: 3 → 4`, and `4 → 5` after the cache-bust
  test's extra seeded root) accordingly.

**Verified**: build / lint / **79 unit** / **51 e2e** green (unit +1 for the
`findOrCreate` lowercasing case; e2e count unchanged — existing sort tests got a 4th
seeded root and stricter assertions, no tests added or removed). One transient e2e
failure was seen on the first
full-suite run of this session (`banAuthor` test: a `spammer` identity left **banned**
in the dev Postgres from earlier ad-hoc/manual runs today, unrelated to this fix —
`moderation.e2e-spec.ts` doesn't truncate `authors` itself); a later spec file's
`deleteMany({})` cleared it and three consecutive full runs since have been clean.
Pre-existing test-isolation gap, not touched by this change — worth a follow-up ticket
if it recurs.
