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
**Frontend:** React + Next.js (App Router), Apollo Client + GraphQL Codegen, SCSS Modules
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

## Styling approach

SCSS Modules, adapted from a scouting pass over WordWeave's `shared/ui` kit (see
"Code style references" above) — reusing its conventions where they fit a project this
size, skipping everything that's there for FSD's sake rather than the styling itself.

### Folder structure

```
frontend/src/
├── styles/
│   ├── tokens.scss      # all design tokens, as CSS custom properties on :root
│   └── globals.scss     # reset + global element styles; imports tokens.scss
├── shared/
│   ├── lib/
│   │   └── classNames.ts   # the (cls, mods, additional) helper — see below
│   └── ui/                 # only the primitives this project actually needs:
│       ├── Button/
│       │   ├── Button.tsx
│       │   ├── Button.module.scss
│       │   └── index.ts
│       ├── Card/
│       │   ├── Card.tsx
│       │   ├── Card.module.scss
│       │   └── index.ts
│       └── Skeleton/
│           ├── Skeleton.tsx
│           ├── Skeleton.module.scss
│           └── index.ts
└── components/              # comment-domain components (CommentCard, CommentForm,
    └── .../                 # CommentTree, TagToolbar, …), same colocation pattern:
                              # Component.tsx + Component.module.scss + index.ts
```

No `shared/ui/index.ts` barrel — each primitive is imported from its own path
(`from '@/shared/ui/Button'`), matching WordWeave; a kit-wide barrel isn't worth it for
three components and just risks dragging in unused code.

### What we're reusing from WordWeave, and why

- **CSS custom properties for tokens, not SCSS `$variables`.** `tokens.scss` declares
  everything as `--token-name` on `:root`, exactly like WordWeave's
  `variables/global.scss`. This is what actually gets used at the component level
  (`color: var(--text)`) — SCSS variables would only be a compile-time indirection with
  no runtime benefit here, and CSS custom properties are what a future theme toggle (if
  ever added) would hang off anyway.
- **The `classNames()` helper** — same signature as WordWeave's
  `shared/lib/classNames/classNames.ts`: `(base: string, mods: Record<string, boolean>,
  additional?: (string | undefined)[]) => string`. Small, dependency-free, and it's the
  backbone of every variant-composition component below.
- **Colocation**: one `Component.tsx` + one `Component.module.scss` + one `index.ts`
  (`export * from './Component'`) per component, no separate `styles/` tree mirroring the
  component tree.
- **Naming conventions**: PascalCase for the root/block class (`.Button`, `.Card`,
  `.CommentCard`), camelCase for boolean modifier classes (`.disabled`, `.fullWidth`),
  `word_value` for enumerated-value classes (`.gap_0`, `.gap_8`, `.size_s`). Variant
  props map to classes either directly (`cls[size]` when the prop value already matches
  the class name) or via an explicit `Record<Variant, string>` lookup when it doesn't —
  both patterns as seen in `Button`/`Card` vs. `Flex` in WordWeave.
- **Shallow nesting** — one or two levels of `&` at most (`&:hover`, `&.modifier`), never
  deep BEM-style `&__element` chains.
- **The `Skeleton` loading pattern** — a static shimmer-animation module class
  (`@keyframes` gradient sweep) plus inline `style={{ width, height, borderRadius }}` for
  the per-instance dimensions CSS Modules can't parameterize. Directly useful here for
  the attachment-processing polling state (`processedAt: null` while the RabbitMQ
  consumer resizes an image) and for the root comments table while `rootComments` loads.

### What we're doing BETTER than WordWeave

- **An actual spacing/radius token scale.** WordWeave hardcodes `border-radius` ad hoc
  per component (8, 12, 16, 18, 20, 32, 34, 40, 48px, 50% — no shared scale at all) and
  has only two one-off `box-shadow` declarations in the whole codebase. `tokens.scss`
  defines a real scale instead — `--radius-sm/md/lg/pill`, `--space-1` through
  `--space-6` (or similar), `--shadow-sm/md` — so every component draws from the same
  small set of values instead of picking new numbers each time.
- **Real breakpoints.** WordWeave has *zero* `@media` queries anywhere in its source —
  it isn't responsive at all. This project needs one: the comment tree's indentation cap
  drops from ~5-6 levels to 3-4 on mobile (see "Tree rendering on the frontend" above),
  so `tokens.scss` also defines breakpoint values (e.g. `--breakpoint-mobile: 640px`) used
  in a small number of deliberate `@media` queries — not a full responsive grid system,
  just enough for the one place the brief actually calls for it.

### What's deliberately NOT reused

- **FSD layers** (`app/entity/features/pages/shared/widgets`, per-slice
  `model/{selectors,services,slices,types}` folders) — this is a single-page comments
  app, not a multi-page platform; a flat `components/` + `shared/` split is enough.
- **Redux Toolkit + `DynamicModuleLoader`** (FSD's lazy-reducer-injection pattern) — no
  global state store needed here; component state + Apollo Client's cache cover
  everything this app does.
- **i18n (`react-i18next`)** — not in the brief, single-language app.
- **A full Storybook + Cypress harness per component** — reasonable for a real product's
  design system, disproportionate for three UI primitives in a test assignment. Manual
  QA + the existing GraphQL-level e2e coverage are enough.

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
  (this project uses GraphQL, and FSD itself is overkill for this scope), but its
  `shared/ui` SCSS Modules conventions (CSS-custom-property tokens, colocated
  `Component.tsx` + `Component.module.scss` + `index.ts`, the `classNames()` helper, naming
  conventions) are worth reusing — see "Styling approach" below. (Its form validation is
  a hand-rolled TS validator wired through Redux selectors, not React Hook Form/Zod — this
  project's use of React Hook Form + Zod is our own choice, not borrowed from WordWeave.)

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

---

### Post-step-5 fix — full e2e isolation via consistent DB/cache truncation (done)

Follow-up to the transient `moderation.e2e-spec.ts` failure noted above: audited every
`.e2e-spec.ts` file for the same class of gap (a spec assuming a clean/specific starting
DB state that isn't actually guaranteed).

**Audit findings**: only `comments-read.e2e-spec.ts` truncated anything
(`attachment`/`comment`/`author`, inline in its own `beforeAll`) — and even that missed
`moderators` and the Redis `rootComments` cache. The other five specs (`app`,
`attachments`, `comments`, `gateway`, `moderation`, `security`) did no cleanup at all,
relying entirely on unique-per-run usernames (`Date.now()` suffixes) to avoid collisions
— which sidesteps duplicate-row errors but does nothing about a **banned** identity, a
stale cached `rootComments` page, or any other state some earlier run (a previous e2e
run, a previous *failed* run, or manual GraphQL Sandbox testing) left behind. That's
exactly what bit `moderation.e2e-spec.ts`'s `spammer` identity.

**Fix**: every spec calls `createTestApp()` exactly once, in its own `beforeAll` — so
that's the one choke point that can guarantee a clean slate without relying on each spec
remembering to clean up, or on file-run order. `createTestApp()`
(`test/create-test-app.ts`) now ends with a new `resetTestState(app)` step, run right
after `app.init()`:
- **Postgres**: one statement —
  `TRUNCATE TABLE "comments", "authors", "attachments", "moderators" RESTART IDENTITY
  CASCADE`. Naming every table in one `TRUNCATE` (with `CASCADE` as a safety net) sidesteps
  the FK dependency graph entirely (`comments` self-references *and* FKs to
  `authors`/`attachments`; `attachments` FKs back to `comments`) — no need to work out or
  hand-maintain a deletion order.
- **Redis**: `CacheService.delByPattern('rootComments:*')` — a manually-populated
  `rootComments` cache entry uses the exact same key scheme
  (`rootComments:{page}:{sortBy}:{sortOrder}`) an e2e run would, so it can leak stale
  data into a test that never touched it otherwise.
- `moderation.e2e-spec.ts` is unaffected: it `upsert`s its own `MOD_USER` row in its own
  `beforeAll`, right after `createTestApp()` returns — truncating `moderators` first and
  re-creating it second, in the same `beforeAll`, is exactly the sequence needed. No e2e
  spec depends on the fixed `npm run seed:moderator` dev account (that's a manual/local
  convenience only), so nothing needed to special-case preserving it.
- Removed the now-redundant inline `deleteMany` calls from `comments-read.e2e-spec.ts`'s
  `beforeAll` — consolidated onto the shared helper instead of keeping a second copy of
  truncate logic.
- `jest-e2e.json`'s `maxWorkers: 1` means spec files never race each other, so this only
  ever has to protect against state left over from *before* the current file started,
  not concurrent writers.

**Verified — against actual pre-existing dirty state, not just repeated clean runs**:
booted a standalone server (`node dist/main.js`), then through it: seeded the dev
moderator, created a comment as `dirtyuser`, browsed `rootComments` (populating the
Redis cache, as a human in the Sandbox would), created a second comment as `spammer`
(the exact identity from the original bug), and banned both authors via `banAuthor`.
Confirmed the dirty state landed (2 comments, 2 banned authors, a
`rootComments:1:CREATED_AT:desc` Redis key, a `moderators` row) — then, with that state
still in place and the standalone server stopped, ran `npm run test:e2e` immediately:
**51/51 green**. Confirmed the DB was actually the reason (not luck): after the run,
`dirtyuser`/`spammer` were gone from `authors`, `moderators` was empty, and the Redis
`rootComments:*` keyspace was empty. Ran the full suite two more times back-to-back
afterward — 51/51 both times, no flakiness. Re-seeded the dev moderator account
afterward (`npm run seed:moderator`) purely as a courtesy, since running e2e truncates it
— that account is dev-only and isn't depended on by anything.

**Verified**: build / lint / **79 unit** (unchanged) / **51 e2e** green, three clean
consecutive full-suite runs plus the dirty-state run above (4 total in a row, all green).

---

### Step 6 — Frontend setup, root comments table, comment submission form (done)

First frontend session — backend treated as a stable contract (schema.gql +
51 e2e tests), no backend changes this step.

**Implemented — project setup**
- Next.js 16 (App Router, TypeScript, Turbopack) scaffolded into `frontend/`
  (`create-next-app --typescript --eslint --no-tailwind --src-dir --app`), React 19.
  Default Tailwind/`globals.css`/sample assets removed — this project uses SCSS
  Modules (CLAUDE.md → "Styling approach"), not Tailwind.
- **Apollo Client v4** (`@apollo/client` + `@apollo/client/react` — v4 split core
  and React hooks into separate entry points, a real structural change from v3).
  `src/lib/apolloClient.ts` builds one browser-only client (`HttpLink` +
  `InMemoryCache`) from `NEXT_PUBLIC_GRAPHQL_URL`; `src/app/providers.tsx` wraps it
  in `<ApolloProvider>`. `.env.example` + gitignored `.env.local`
  (`NEXT_PUBLIC_GRAPHQL_URL=http://localhost:4000/graphql`); fixed `frontend/.gitignore`
  to keep `.env.example` committed like the backend's (create-next-app's default
  `.env*` pattern would have ignored it too).
- **GraphQL Codegen**, schema source = the backend's committed `schema.gql` (not
  live introspection — works without the backend running, can't drift from what's
  checked in). `src/graphql/operations/*.graphql` (RootComments, CaptchaChallenge,
  CreateComment) → `src/graphql/generated.ts`, committed like `schema.gql` is.
  `npm run codegen` / `codegen:watch`.
- Styling foundation exactly per CLAUDE.md's plan: `styles/tokens.scss` (CSS custom
  properties — typography, semantic color, `--space-1..6`, `--radius-sm/md/lg/pill`,
  `--shadow-sm/md`, `--z-*`) + `styles/globals.scss` (minimal reset, imports
  tokens), `shared/lib/classNames.ts` (WordWeave's `(base, mods, additional)`
  helper, ported), `shared/ui/{Button,Card,Skeleton}` — each
  `Component.tsx` + `Component.module.scss` + `index.ts`, no kit-wide barrel.
- `frontend/Dockerfile` (multi-stage; `next.config.ts` sets `output: "standalone"`
  for a lean runtime image) + `frontend` service added to the root
  `docker-compose.yml`, `depends_on: backend`, port 3000.

**Implemented — root comments table** (`components/RootCommentsTable`)
- Owns its own `useQuery(RootCommentsDocument, { variables: { page, sortBy,
  sortOrder } })` — no prop wiring to the form (see below). Columns: Username,
  Email, Date, Replies, and a disabled "Expand" placeholder button (thread view is
  next session). Clickable Username/Email/Date headers toggle ASC/DESC, with an
  arrow indicator; switching columns resets to page 1 and picks a sensible default
  direction (DESC/newest-first for Date, ASC for Username/Email). 25/page from the
  backend, Prev/Next + "Page X of Y", both buttons correctly disabled at the ends.
  Skeleton placeholder rows while loading, a plain-language empty state, an error
  banner on query failure.

**Implemented — comment submission form** (`components/CommentForm` +
`components/TagToolbar`)
- Username / E-mail / Home page (optional) / Text, validated with React Hook Form +
  Zod mirroring the backend's rules (`lib/validation.ts` duplicates
  `USERNAME_REGEX`/`CAPTCHA_REGEX`/`COMMENT_TEXT_MAX_LENGTH` from
  `backend/src/shared/constants` by hand — no shared workspace, see "Repository
  structure" — commented as such; the backend re-validates everything regardless).
  Zod v4's `z.email()`/`z.httpUrl()` (not the deprecated `.email()`/`.url()` chain
  methods).
- CAPTCHA: `useQuery(CaptchaChallengeDocument, { fetchPolicy: "no-cache" })` so
  every mount and every "↻ New" click gets a genuinely fresh, uncached challenge;
  the SVG (`data:image/svg+xml;base64,…`) renders directly in an `<img>`.
- `TagToolbar`: `[i] [strong] [code] [Link]` buttons. Wrapping logic lives in
  `CommentForm` (it owns the textarea ref) — wraps the current selection or inserts
  at the cursor; `Link` prompts for href + optional title via `window.prompt`
  (no modal component built for this — proportional to what a test assignment
  needs) and emits `<a href="" title="">`.
- Live preview: `shared/lib/commentPreview.ts` — escapes the whole string first,
  then selectively un-escapes *only* the exact allowed tag shapes (`<a href="" 
  title="">`, `<code>`, `<i>`, `<strong>`, with an href scheme check), rendered via
  `dangerouslySetInnerHTML`. Deliberately not a full parser (doesn't need to be —
  the backend is the real sanitizer); safe because it's the user's own input,
  previewed only in their own browser, and the allowlist regexes are anchored
  narrowly enough that any unexpected attribute or malformed tag just fails to
  match and stays escaped/inert rather than rendering.
- Error handling keys off `CombinedGraphQLErrors` (Apollo v4's replacement for the
  old `ApolloError`) and the backend's `extensions.code`: `THROTTLER` → a
  rate-limit message; `BAD_REQUEST` mentioning "captcha" → inline field error +
  auto-refresh challenge; other `BAD_REQUEST` → routed to the relevant field by a
  small message-content heuristic (falls back to a general error banner);
  `FORBIDDEN` (banned author) and anything else → general error banner.
- On success: `useMutation(CreateCommentDocument, { refetchQueries: ["RootComments"]
  })` — refetches the table via Apollo's operation-name tracking, no ref/callback
  wiring needed between the two sibling components. Form resets, a new CAPTCHA
  loads, a brief success message shows.
- `parentId?: string` prop, threaded straight into the mutation input and into the
  "Reply" vs. "Leave a comment" heading — not wired to any reply UI yet (next
  session), but ready to be reused for it.

**Deviations from the plan (with reasons)**
- **`ssr: false` on the whole page** (`app/page.tsx` dynamically imports
  `components/HomeView`). This app is a SPA per the brief and fetches everything
  client-side; without this, Next's App Router would still attempt a server-side
  render of the Apollo-querying tree on every request, and inside Docker that
  server-side fetch would hit `http://localhost:4000` from *inside the frontend
  container*, which doesn't reach the backend container (they're separate network
  namespaces) — `localhost` there means the frontend container itself. Rather than
  add a second, server-only `GRAPHQL_URL` purely to paper over that, opting out of
  SSR for this tree sidesteps the problem entirely, and costs nothing for a SPA
  that doesn't need SSR's benefits (no SEO/first-paint requirement in the brief).
  Confirmed in the production build: `/` prerenders with a `BAILOUT_TO_CLIENT_SIDE_RENDERING`
  marker, no server-side fetch attempted.
- **No base `typescript` codegen plugin** — combining it with `typescript-operations`
  in one output file (the standard textbook setup) turned out to redeclare every
  input/enum type used as an operation *variable* type (`CreateCommentInput`,
  `RootCommentSortField`, `SortOrder` all came out twice — a real duplicate-export
  TS error), traced to `typescript-operations`'s `_usedSchemaTypes` gating in
  `visitor-plugin-common` 7.2.5. `typescript-operations` is self-sufficient for
  everything this app needs (operation result/variable types + the input/enum
  types they reference), so the fix was dropping the base plugin rather than
  fighting the duplication — documented inline in `codegen.ts`.
- **No hook-generating codegen plugin** (`typescript-react-apollo`) — used
  `typed-document-node` instead, giving plain `TypedDocumentNode<Result,
  Variables>` consts passed straight into `useQuery`/`useMutation`. Sidesteps any
  version-compatibility risk between the hook-generator plugin and Apollo Client
  v4's restructured import paths (`@apollo/client/react`), and is the more current
  Apollo-recommended pattern regardless.
- **Home page (optional) is validated when present, not skipped via
  `@IsOptional()`-equivalent laxness** — `z.union([z.literal(""), z.httpUrl(...)])`,
  and only the non-empty case is sent to the mutation at all (an empty field is
  omitted from the GraphQL variables object entirely, not sent as `""`, so the
  backend's `@IsOptional() @IsUrl()` sees it as genuinely absent rather than an
  invalid empty string).
- **Breakpoints are SCSS `$variables`, not CSS custom properties** — the original
  "Styling approach" section's example (`--breakpoint-mobile: 640px`) doesn't
  actually work: CSS custom properties can't appear inside a `@media` condition
  (media features must be literal at parse time). `tokens.scss` keeps a
  `$breakpoint-mobile` SCSS variable alongside the `:root` custom-property block
  instead, documented inline as the one deliberate exception to "tokens are custom
  properties, not SCSS variables." Not yet used by any component — the tree view's
  mobile depth cap (next session) will be the first consumer.

**Verified manually** (via a live browser against the full `docker compose up -d
--build` stack — postgres/redis/rabbitmq/backend/frontend, not just against unit
tests): page loads with an empty root table + working CAPTCHA; posted a comment
with the [strong] toolbar button (selection correctly wrapped, live preview
rendered it bold in real time) → success message, form cleared, new CAPTCHA
loaded, table refetched and showed the new row; submitted a wrong CAPTCHA answer →
inline field error, a fresh CAPTCHA auto-loaded, username/email/text preserved, no
row created; posted two more comments (`Zed`, `amy`) and sorted by Username
ascending/descending — confirmed case-insensitive order (`alice, amy, Zed`
ascending, matching the backend fix from the previous session) with the arrow
indicator flipping correctly; no console errors/warnings throughout. Pagination's
Prev/Next disabled-state logic was verified structurally (3 comments = 1 page) but
not against a 26+-comment second page — flagged rather than force-generated for
this pass.

**Pending — next session**: recursive tree view (`commentThread`, expand/collapse,
depth-capped indentation + thread-line, the `$breakpoint-mobile` mobile cap),
attachment upload + lightbox (with polling for `processedAt` while the RabbitMQ
consumer resizes an image — the `Skeleton` component is already in place for
this), the `commentCreated` WebSocket subscription for live updates, and moderator
login + hide/ban UI.

---

### Step 7 — recursive comment thread view, inline reply (done)

Structure/functionality only this pass, deliberately — see the "styling scope"
note carried into the wrap-up below. A dedicated visual pass (Reddit-like compact
threading) is explicitly deferred, not forgotten; tracked in this entry's
"Pending" list.

**Implemented — `commentThread` query + tree**
- `src/graphql/operations/commentThread.graphql`: a `CommentThreadFields`
  fragment + the query, nested 10 `replies` levels deep by hand. GraphQL has no
  recursive-fragment construct (a fragment can't spread itself), so an
  arbitrary-depth tree has to be selected out to a fixed depth — 10 is generous
  headroom over the UI's own 6-level visual cap (3-4 on mobile), documented
  inline as a known, deliberate limit rather than a silent one.
- `components/CommentThread/` — two components sharing one module:
  - `CommentThread.tsx`: owns `useQuery(CommentThreadDocument, { variables:
    { rootId } })`, `Skeleton` while loading, an error banner, renders the root
    via `CommentThreadNode`.
  - `CommentThreadNode.tsx`: the recursive renderer — author, date, sanitized
    text, a `Reply` button, and (if any) a `replies` block mapping itself over
    each child. Replies render in the order the backend already returns them
    (LIFO per level) — no client-side re-sort. Text rendering reuses
    `previewCommentHtml` (the form's live-preview sanitizer) rather than a
    second helper — same allowlist logic is correct for read-only display too,
    and it's already proven safe.
  - Indentation: `--depth` (capped at 6 in JS) set as an inline custom property
    per node — same per-instance-value pattern as `Skeleton`'s inline
    `width`/`height` — consumed in SCSS as `calc(min(var(--depth), 6) *
    var(--space-3))`, with a `@media (max-width: tokens.$breakpoint-mobile)`
    override dropping the cap to 4 and the per-level unit to `--space-2`. First
    real consumer of `$breakpoint-mobile`, sitting unused since Step 6.
  - Thread line: every non-root node gets `border-left` + `padding-left`
    instead of relying on margin alone at depth.
  - Subtree collapse is a local `useState<boolean>` — no re-fetch, the data's
    already in hand. Collapsing hides the `replies` block only, not the node's
    own author/date/text — a comment stays legible when its subtree is
    collapsed; only the replies underneath disappear (see Deviations below).
- **`RootCommentsTable`**: the "Expand" button is real now. `expandedIds:
  Set<string>` tracks which rows have their thread open; toggling adds/removes
  the id and mounts/unmounts an extra `<tr><td colSpan={5}><CommentThread
  rootId /></td></tr>` right after the row. Unmounting on collapse and
  remounting on re-expand costs nothing over the network for the same
  `rootId` — Apollo's default `cache-first` fetch policy serves the remount
  from cache (confirmed manually, see below).

**Implemented — inline reply**
- `CommentThreadNode` toggles an inline `<CommentForm parentId={node.id}
  onSuccess={...} />` per node (one at a time per node, but nothing stops two
  different nodes from having their reply form open simultaneously — simplest
  thing that works, not restricted further).
- `CommentForm`'s `onSubmit` now passes `refetchQueries: parentId ?
  ["RootComments", "CommentThread"] : ["RootComments"]`. Naming `"CommentThread"`
  by operation name (not a specific `rootId`) is sufficient: Apollo refetches
  every currently *active* watcher of that query using **its own** variables,
  and a reply's `Reply` button only exists inside an already-expanded thread —
  so there's exactly one active `CommentThread` watcher, the one being replied
  in. No ref/callback wiring needed between `CommentForm` and `CommentThread`.
  `onSuccess` also collapses the reply form itself.

**Deviations from the plan (with reasons)**
- **The root's own text renders when its row is expanded**, not just its
  replies. The root table has no "text" column at all (username/email/date/
  replies only), so this is the only place a reader ever sees a root comment's
  actual text — treating depth-0 as "just another node in the tree" instead of
  skipping straight to `replies` was a deliberate reading, not an oversight.
- **Collapse semantics were corrected mid-session.** First draft hid the
  collapsed node's own text/actions along with its replies — indistinguishable
  from the comment vanishing. Fixed to the conventional behavior (collapse a
  *subtree*, not the comment): text/actions always render, only the nested
  `replies` block is conditional on `collapsed`.
- **The task's assumption of a pre-existing 3-level thread from earlier manual
  testing didn't hold** — checked the actual DB (`select ... from comments`)
  before starting and found only root-level comments (the Step 6 session's
  `alice`/`Zed`/`amy`, no `parentId` set on any of them); whatever nested test
  data existed earlier didn't survive the intervening e2e-isolation work's
  repeated truncation. Built a fresh 3-level thread through the running app
  instead (see Verified below) — which doubled as the actual reply-flow test.

**Verified manually** (full `docker compose up -d --build` stack, live browser):
expanded a 0-reply root (`alice` / "hello") — its own text rendered inline, no
crash on an empty `replies` array; replied to it as `bob`, confirmed the row's
`repliesCount` bumped to 1 *and* the open thread refetched to show `bob` nested
under `alice` without a page reload; replied to `bob` as `carol` — 3 levels deep,
correctly nested, thread-line borders visibly growing per level (screenshot);
replied to `alice` again as `dave` and confirmed `dave` (newer) rendered *above*
`bob` (older) as siblings — LIFO, un-re-sorted, exactly as the backend returns
it. Collapsed `bob`'s subtree — `bob`'s own text stayed visible, `carol`
disappeared, **network request count unchanged** (checked via the browser's
network log before/after). Collapsed and re-expanded the whole row via the
table's Expand/Collapse button — **network request count unchanged** on
re-expand too, confirming Apollo's cache serves the remount. Resized to a
375px mobile viewport — indentation visibly tightens (screenshot), thread
still readable, no layout break. Zero console errors/warnings throughout.

**Verified — build/lint**: `tsc --noEmit`, `next build`, `eslint` all clean (one
pre-existing informational React Compiler warning on `CommentForm`'s `watch()`,
unrelated to this step, same as Step 6).

**Pending — next session**:
- Attachment upload + lightbox, with polling for `processedAt` while the
  RabbitMQ consumer resizes an image (`Skeleton` already in place for this).
- The `commentCreated` WebSocket subscription for live updates.
- Moderator login + hide/ban UI.
- **A dedicated visual styling pass** — this step and Step 6 both stayed
  deliberately minimal/functional (existing tokens, basic spacing/borders).
  The aimed-for look is Reddit-like: compact threading, clearer visual
  hierarchy, subtler collapse controls than the current text-label toggle —
  restyling the existing DOM/component structure, not rebuilding it.
- **Pagination self-check reminder, explicitly tracked (not just mentioned in
  passing) per this session's instructions**: Prev/Next across a real second
  page (26+ comments) has still only been verified structurally (`page >=
  totalPages`-style logic read, not exercised against real multi-page data,
  now in two sessions running). Deliberately deferred to the pre-submission
  self-check pass, when the DB gets seeded with enough comments for the demo
  video anyway — don't let that pass skip actually clicking Next once real
  paginated data exists.

---

### Step 8 — attachment upload, processedAt polling, lightbox (done)

Structure/functionality this pass, same minimal-styling note as Step 7 —
existing tokens, basic spacing/borders, no Reddit-style polish yet (still
tracked below).

**Schema investigation (Step 2.1) — a real gap, resolved by a small backend
change, not a frontend workaround.** Checked `backend/src/schema.gql` and
`AttachmentsResolver` before writing any polling code: only
`Mutation.uploadAttachment` existed. `ThreadCommentModel.attachment` is only
reachable via `commentThread(rootId)`, which needs the attachment already
linked to a comment — too late for the pre-submit case (upload happens before
the comment, or any linking, exists). Text attachments were never affected
(`processedAt` is stamped synchronously in the upload response); this was an
images-only gap. Stopped and asked rather than guessing — offered three
options (add a backend query / skip real polling and treat upload-response as
done / a fake timer standing in for a signal it can't give); **chose to add
the backend query**. Implemented:
- `AttachmentsService.findById(id)` (new) — plain `prisma.attachment.findUnique`
  + `NotFoundException`, same shape/style as `assertAttachmentLinkable`.
- `AttachmentsResolver`: new `Query.attachment(id: ID!): AttachmentModel!`.
  `schema.gql` regenerated (had to actually boot the app once — `autoSchemaFile`
  writes it at Nest bootstrap, not at `tsc` build time — briefly on a spare
  port with the docker `backend` container stopped, to avoid a port clash and
  queue-consumer contention with the e2e run right after).
- Tests: **2 new unit** (found / 404) + **3 new e2e** (reachable immediately
  post-upload with `processedAt: null`, reflects the resize once
  `waitProcessed` confirms it server-side, works for an already-linked
  attachment too, 404 for an unknown id) — **81 unit / 54 e2e**, both green,
  e2e run twice back-to-back for stability.

**Implemented — frontend, Step 1 (upload)**
- `CommentForm` (both root and reply — it's the same component): a file input,
  client-side validation mirroring backend constants (now also mirrored into
  `lib/validation.ts`: allowed image/text MIME+extensions, `TEXT_FILE_MAX_BYTES`
  100 KB, `MAX_UPLOAD_BYTES` 5 MB — the 320×240 resize itself stays
  server-only, nothing to reject client-side for that). On selection: read as
  a `data:` URL (`FileReader.readAsDataURL` — the backend accepts that prefix
  directly, no need to strip it) and call `uploadAttachment` immediately,
  before the comment form is submitted — matches the manual Sandbox testing
  flow, not "stage then upload on submit".
- `attachmentId` flows into `createComment`'s variables when set; cleared
  (along with the file input) on successful submit or explicit removal.
  Submit is disabled while the upload mutation is in flight **or** while
  polling (see Step 2) is active — a comment can't be linked to an attachment
  that hasn't finished processing.

**Implemented — frontend, Step 2 (polling)**
- New `attachment.graphql` operation. `CommentForm` only starts polling when
  `uploadAttachment` comes back `type: IMAGE` and `processedAt: null` (never
  for text). Uses Apollo's built-in `pollInterval` (1500 ms) on
  `useQuery(AttachmentDocument, { skip: !pollingAttachmentId, fetchPolicy:
  "network-only" })` rather than a hand-rolled `setInterval` loop — an effect
  watching the polled result calls `stopPolling()` and swaps in the final
  (resized) attachment once `processedAt` is non-null; a second effect holds a
  15 s `setTimeout` that gives up, clears the attachment (so submit isn't
  blocked), and shows "Could not process the attachment in time."
- `Skeleton` for both phases: a thin bar while the upload mutation is in
  flight, a larger block while polling ("Processing image…"). Once resolved:
  `AttachmentPreview` (thumbnail or file link) + a Remove button.

**Implemented — frontend, Step 3 (lightbox)**
- `shared/ui/Lightbox` — dimmed overlay, image centered, portaled to
  `document.body` (`createPortal`), closes on overlay click, Escape, or a
  close button; locks background scroll while open. No gallery/next-prev —
  one attachment per comment, nothing to navigate between, per the brief.
- `components/AttachmentPreview` — the shared renderer for both the form's own
  pending/done preview and an already-posted comment: a clickable thumbnail
  opening `Lightbox` for images, a download link + filename for text (no
  lightbox treatment needed there, per the brief). Attachment URLs are
  root-relative (`/uploads/<id>.ext`, served by the *backend*) — new
  `lib/attachmentUrl.ts` resolves them against the backend's origin (derived
  from `NEXT_PUBLIC_GRAPHQL_URL`), not the frontend's own, or they'd 404
  against Next's dev/prod server instead.
- `commentThread.graphql`'s fragment now also selects `attachment { id type
  url originalName size processedAt }` at every level; `CommentThreadNode`
  renders it via `AttachmentPreview` between the comment text and the
  reply/collapse actions.

**Deviations from the plan (with reasons)**
- The backend query's description explicitly says why it exists (pre-submit
  polling on an unlinked attachment) rather than reading as a generic
  "get attachment by id" — the kind of endpoint that's easy to misuse later
  without that context.
- Polling uses Apollo's native `pollInterval`/`stopPolling` instead of a
  manual timer loop — less code, and it's a mechanism the client already
  ships, built for exactly this purpose.
- `AttachmentPreview` is one shared component for three call sites (form
  pending state, form done state, thread display) rather than duplicating
  thumbnail/link rendering — the previous session's `previewCommentHtml` reuse
  (form preview ↔ thread text rendering) set the precedent.

**Verified manually** (full `docker compose up -d --build` stack, live
browser, `AttachmentsService.findById` unit + the 3 new e2e all independently
confirming the query itself works before ever touching the UI): uploaded a
150 KB `.txt` — **rejected client-side** with no network request at all
(checked the browser's network log: 0 new GraphQL calls); uploaded a 640×480
PNG — thumbnail resolved to the **actual resized 320×240 file on disk**
(checked via the served bytes' IHDR chunk), and the network log showed
`uploadAttachment` followed by **multiple** `attachment(id)` poll ticks before
resolving, confirming real polling happened rather than a lucky first-response
match; clicked the thumbnail in the form → lightbox opened, Escape closed it;
submitted the comment → attachment appeared correctly in the root table's
expanded thread, thumbnail click → lightbox again, confirmed working there
too; replied to that comment with a `.txt` attachment → rendered as a
`📄 filename` download link resolving to the backend's origin, correctly
nested under the parent. Zero console errors/warnings throughout.

**Pending — next session**:
- The `commentCreated` WebSocket subscription for live updates.
- Moderator login + hide/ban UI.
- **Dedicated visual styling pass** (Reddit-like — compact threading, clearer
  hierarchy, subtler collapse controls), still deliberately deferred, now
  three sessions running (Steps 6-8 all stayed functional-only).
- **Pagination self-check reminder — still open**: Prev/Next across a real
  second page (26+ comments) has *still* only been verified structurally, not
  against real multi-page data (three sessions running now). Same plan as
  before: deliberately deferred to the pre-submission self-check pass when the
  DB gets seeded for the demo video — don't let that pass skip it.

---

### Step 9 — WebSocket live updates, moderator login/hide/ban UI (done)

**This closes the core functional scope.** Every endpoint and real-time
feature from CLAUDE.md's "Core GraphQL endpoints" / WebSocket / JWT sections
now has frontend UI. What's left is explicitly the deferred non-functional
items (pagination self-check, the Reddit-style visual pass) plus deployment /
README / demo video prep — see "Pending" below.

**Implemented — WebSocket live updates**
- `socket.io-client` (same major version, 4.8.3, as the backend's `socket.io`
  — checked before installing). `components/RealtimeConnection` — headless,
  mounted once in `Providers` — owns the one Socket.IO connection for the
  app's lifetime (`getBackendOrigin()`, the same backend-origin helper
  `attachmentUrl.ts` used, now factored out into `lib/backendOrigin.ts` so
  both share it).
- `lib/connectionStatus.tsx`: a small split read/write context (`'connecting'
  | 'connected' | 'reconnecting' | 'disconnected'`), fed by the socket's
  `connect`/`disconnect`/`connect_error` events and the underlying Manager's
  `reconnect_attempt`/`reconnect` events (`socket.io.on(...)` — Socket.IO
  reserves those on the Manager, not the Socket, confirmed against the
  installed package's own `.d.ts` rather than assumed). `components/
  ConnectionStatusIndicator` — a small dot + label reading it. Reconnection
  itself stays entirely Socket.IO's own job (default backoff); this only ever
  reflects state, never drives a retry, per the plan.
- **Refetch, not a raw cache prepend**, for `commentCreated` — deliberately,
  for two reasons documented inline in `RealtimeConnection.tsx`: (1)
  `rootComments`/`commentThread` are sorted/paginated/tree-shaped, so a manual
  cache splice would have to re-implement that placement logic client-side;
  refetching just re-asks the server, which already has it right; (2) it
  sidesteps the "don't double-count my own post" dedup problem *structurally*
  rather than by adding dedup code — verified, not assumed: `lib/
  apolloClient.ts` configures no custom `merge` function, so Apollo's
  `InMemoryCache` default behavior is to *replace* an object-typed query
  field wholesale on each fetch. `CommentForm`'s own post-submit
  `refetchQueries` and this socket handler both firing for the same new
  comment just means the field gets (correctly, non-duplicated) overwritten
  twice — checked against the installed `@apollo/client` core types, not
  taken on faith.
- **A real bug found via the two-window manual test, not anticipated up
  front**: the first cut only refetched `CommentThread` for a reply event.
  Manually watching a second window while replying directly to a root in the
  first showed the reply itself appearing live (correct) but the root row's
  `repliesCount` in the table staying stale at the old count — that field
  lives in `RootComments`, not `CommentThread`. Fixed by refetching
  `RootComments` for *every* new comment, root or reply (mirrors what
  `CommentForm`'s own `refetchQueries` already did for the poster's own
  reply — this just extends the same reasoning to replies arriving from other
  users over the socket). Re-verified after the fix: a direct reply now bumps
  the table's count live in the other window; a *nested* reply (reply-to-a-
  reply) correctly leaves the root's count untouched, matching
  `repliesCount`'s documented "direct replies only" semantics.

**Implemented — moderator login + hide/ban**
- `lib/moderatorAuth.tsx`: a small context holding the JWT in plain React
  state (not `sessionStorage`, though the brief allowed either) — the simpler
  of the two allowed options, and a page reload logging the moderator out
  costs nothing for a feature this secondary. Documented as a deliberate
  choice, not an oversight.
- `components/ModeratorPanel`: a small "Moderator" text link (not a
  prominent nav item) that reveals a compact login form (plain controlled
  inputs, not React Hook Form/Zod — two fields with no client-side validation
  beyond "don't submit empty" didn't justify the extra machinery). Logged in:
  "Moderator: {username}" + Log out.
- `CommentThreadNode` grew Hide (in the actions row, next to Reply) and Ban
  author (next to the username) buttons, visible only when
  `useModeratorAuth().isLoggedIn` — covers both root and reply comments
  through the one component, since a root's own text only ever renders there
  too (Step 7). Both mutations pass the JWT via `context: { headers:
  { Authorization: \`Bearer ${token}\` } }` on the individual `useMutation`
  call, not a global Apollo auth link — simpler when only two mutations in
  the whole app ever need it.
- `hideComment` success: `refetchQueries: ["RootComments", "CommentThread"]`
  — same by-name pattern as everywhere else; correctly handles both "hid a
  root" (row disappears from the table entirely once refetched) and "hid a
  reply" (vanishes from the tree, direct-parent's `repliesCount` decrements)
  without the component needing to know which case it's in.
- `banAuthor` success: no comments disappear (existing ones stay, per the
  backend) — just a transient "Banned" label swapped in for the button.
- Both actions check for a GraphQL `UNAUTHORIZED` code
  (`CombinedGraphQLErrors`, same pattern as `CommentForm`'s error handling)
  and call `logout()` + show "Your session expired — please log in again."
  rather than failing silently — an expired/invalid JWT drops the session
  instead of leaving the UI looking logged-in while every action quietly 401s.

**Deviations from the plan (with reason) — one real, worth flagging clearly**
- **Hiding/banning does *not* live-propagate to other connected browsers.**
  The backend gateway (`modules/gateway`) only ever broadcasts
  `commentCreated` — there is no `commentHidden`/`authorBanned` socket event
  (confirmed by reading `comments.gateway.ts`; Step 5's progress log also only
  documents `commentCreated`). Adding one would be a backend change beyond
  what this frontend-only session was scoped to touch unprompted (the
  precedent from Step 8: backend changes happen only when explicitly decided,
  not assumed). So: the *moderator's own* window updates immediately (its own
  mutation's `refetchQueries` fires locally); a second, unrelated window keeps
  showing the hidden comment / unbanned author until it has its own reason to
  refetch (reloading the page, or any other `RootComments`/`CommentThread`
  refetch it happens to trigger). Verified precisely, not glossed over: hid a
  comment in window A → gone there immediately; checked window B *without*
  reloading → still showed it (confirming no live broadcast exists);
  reloaded window B → gone there too (confirming the hide is genuinely
  effective server-side, just not push-propagated). If live moderation
  propagation across windows turns out to matter, the fix is a small backend
  addition (broadcast on `hideComment`/`banAuthor` the same way
  `createComment` already does) — flagging as a known gap, not fixing it here.
- One unrelated small fix made while verifying: the moderator login
  form's password input was missing `autoComplete="current-password"`
  (`autoComplete="username"` on the username field too) — the browser's own
  console flagged it during manual testing; fixed immediately since it was a
  two-line, zero-risk change already staged in a file this step touched.

**Verified manually** (full `docker compose up -d --build` stack, two real
browser tabs — no reload between actions except where explicitly noted
above): posted a root comment in tab 1 → appeared live in tab 0 (untouched,
never reloaded) with the count ticking up; expanded a thread in tab 0,
replied to it from tab 1 → the reply appeared live, correctly positioned
(LIFO — newer above older sibling) in tab 0's already-open thread, no reload;
replied to a nested reply (reply-to-a-reply) from tab 1 → appeared live at
the correct depth in tab 0, and — as it should — did *not* change the root's
`repliesCount` (only a *direct* reply does, per the bug found and fixed
above, re-verified after the fix). Logged in with the seeded dev account
(`moderator` / `moderator-dev-password` — CLAUDE.md → Step 5; had to reseed
it, `npm run seed:moderator`, since e2e runs since Step 5 had truncated the
`moderators` table). Hid a reply → gone from that window immediately,
parent's `repliesCount` decremented; confirmed the *other* window needed a
reload to reflect it (see Deviations). Banned an author, then tried posting
again as that exact username + email → rejected with the backend's own
"has been banned from commenting" message shown as a general form error, no
comment created. Logged out → Hide/Ban buttons and the logged-in state
disappeared immediately, back to the plain "Moderator" link. Zero console
errors throughout (one browser-console *info* note about a missing
`autocomplete` attribute, fixed — see Deviations).

**Verified — build/lint**: `tsc --noEmit`, `next build`, `eslint` all clean
(the one pre-existing informational React Compiler warning on `CommentForm`'s
`watch()`, unrelated to this step, same as Steps 6-8).

**Pending — next**:
- **Dedicated visual styling pass** (Reddit-like), now four sessions
  deliberately deferred (Steps 6-9 all stayed functional-only per each
  session's explicit "styling scope" note).
- **Pagination self-check** — still open, four sessions running: Prev/Next
  across a real second page (26+ comments) has never been exercised against
  real multi-page data. Same plan as every prior session: deliberately
  deferred to the pre-submission self-check pass, when the DB gets seeded
  with enough comments for the demo video anyway.
- **Deployment, README, DB schema file for MySQL Workbench, demo video** —
  everything in the brief's "Delivery format" section is still outstanding;
  with this step done, the app is functionally complete enough that these
  become the real next milestones rather than more feature work.
- The known hide/ban-doesn't-live-broadcast gap noted above, if it ever
  turns out to matter enough to justify the small backend addition.

---

### Step 10 — commentHidden/authorBanned WebSocket broadcasts (done)

Closes the live-propagation gap Step 9 flagged and deliberately deferred:
hiding a comment or banning an author updated only the moderator's own
window; a second, unrelated window needed a manual reload to see it.

**Implemented — backend**
- `modules/gateway/comments.gateway.ts`: two new broadcasts, same pattern as
  `emitCommentCreated` (no auth on the socket connection, one room,
  `cors: { origin: true }`, `this.server.emit(EVENT, payload)`) —
  `emitCommentHidden({ id, parentId })` and
  `emitAuthorBanned({ id, username })`. Payload shapes are deliberately
  minimal: `commentHidden`'s `{ id, parentId }` exactly mirrors
  `commentCreated`'s shape (lets the frontend reuse one refetch function for
  both); `authorBanned` doesn't need to touch any comment data (banning
  doesn't retroactively hide anything — "existing comments stay").
- `CommentsService.hideComment()` calls `emitCommentHidden` right before
  returning, mirroring where `createComment` calls `emitCommentCreated`.
- `AuthorsService.ban()` now takes `CommentsGateway` as a constructor
  dependency (`AuthorsModule` imports `GatewayModule`) and calls
  `emitAuthorBanned` before returning the banned author.
- Unit tests: `comments.gateway.spec.ts` (+2, one per new event, via a shared
  `gatewayWithFakeServer()` helper), `comments.service.spec.ts` (+2, asserting
  `emitCommentHidden`'s payload for a root hide and a reply hide),
  `authors.service.spec.ts` (+1, asserting `emitAuthorBanned`'s payload).
- e2e: `gateway.e2e-spec.ts` rewritten with a shared `createComment()` helper
  and moderator seeding/login in `beforeAll`; two new cases confirm a
  connected Socket.IO client actually receives `commentHidden` (after
  `hideComment`) and `authorBanned` (after `banAuthor`), each asserting the
  full payload.

**Implemented — frontend**
- `components/RealtimeConnection`: now also listens for `commentHidden` and
  `authorBanned`. Extracted `refetchForCommentEvent(client, parentId)` —
  the same `RootComments`/(`CommentThread` if a reply) refetch-by-name logic
  Step 9 used for `commentCreated` — and reused it verbatim for
  `commentHidden`, since a hide is the inverse of a create with respect to
  what a client needs to update (root row disappearing/`repliesCount`
  decrementing, or a node vanishing from an open thread).
- `authorBanned` needs no comment-data update; added a small reusable toast
  system for it instead of a one-off: `lib/toast.tsx` (`ToastProvider` +
  `useShowToast`/`useToastMessage`, same split-context shape as
  `connectionStatus.tsx`/`moderatorAuth.tsx`) + `components/Toast`, wired
  into `app/providers.tsx`. Shows "`<username>` was banned by a moderator."
  for 4 seconds.

**Verified manually** (full `docker compose up -d --build` stack, two
independent browser tabs, window B never reloaded): posted a root comment
and a direct reply in window A, confirmed both windows showed
`repliesCount: 1`; logged into window A as moderator; hid the reply in
window A → **window B updated live, without a reload** — the reply
disappeared from the open thread and `repliesCount` dropped to `0`,
matching window A exactly (this is the specific gap the task called out,
confirmed actually closed, not just implemented). Banned the root comment's
author from window A → window B received the event with zero console
errors (no crash, no unhandled rejection); the toast itself had already
auto-cleared by the time it was checked (4 s window vs. the tool round-trip
between windows), so its *arrival* is confirmed via a clean console rather
than a caught screenshot — acceptable since the toast was explicitly a
nice-to-have, not the requirement being verified.

**Verified — automated**: backend build/lint clean; unit **86/86** passed
(was 78, +8: 2 gateway, 2 comments.service, 1 authors.service, others
pre-existing renumbered); e2e **56/56** passed (was 50, +6 gateway); e2e run
with the dockerized `backend` container stopped, per convention, then
restarted afterward (moderator table truncated by the e2e run, reseeded via
`npm run seed:moderator`). Frontend `next build`/`eslint`/`tsc --noEmit`
clean (same one pre-existing, unrelated React Compiler info-warning on
`CommentForm`'s `watch()` as every prior frontend step).

**Deviations**: none — this step was scoped tightly to the one flagged gap
and stayed inside it; no unrelated fixes were needed or made this time.

**Pending — next**: unchanged except the hide/ban broadcast gap is now
closed. What's left: the dedicated Reddit-style visual polish pass (five
sessions deferred: Steps 6-10), and the pagination self-check against real
multi-page data (five sessions open, same reason each time — deferred to the
pre-submission pass once the DB is seeded for the demo video). Everything
else — every core GraphQL endpoint, CAPTCHA, sanitizer, attachments +
resize queue, JWT/moderator auth + moderation mutations, and now live
WebSocket propagation for creates, hides, *and* bans — is functionally
complete. Deployment, README, the MySQL Workbench schema file, and the demo
video (the brief's "Delivery format" section) remain the real outstanding
milestones.

---

### Step 11 — Reddit-inspired visual polish pass (done)

Closes the long-deferred styling item (deliberately deferred across Steps
6-10, every frontend session so far having stayed functional-only). A pure
CSS/SCSS-Modules pass over **every** component built to date — no changes to
component logic, data flow, or GraphQL operations; the only `.tsx` edits are
class-name hooks and `data-label` attributes that exist solely to support the
styling (plus dropping one now-unused inline-style var in `CommentThreadNode`
— see below).

Two aesthetic calls were put to the user up front:
- **Accent colour → Reddit blue (`#0079d3`)** for the single sparingly-used
  accent (links, the primary Post/Log-in button, the "Live" indicator green
  stays green). Not Reddit's classic orange — a hot colour even used sparingly
  competes with the red of Hide/Ban.
- **Timestamps stay absolute** (`Sep 4, 2026, 1:26 PM`), just restyled
  smaller/muted — keeps this a strictly CSS pass (relative "5h ago" would have
  meant a date-format helper).

**`styles/tokens.scss` — refined, not rewritten**
- Palette pulled toward warm-neutral grayscale: softer `--color-bg`/borders,
  a new `--color-border-subtle` for internal dividers, `--color-row-hover`,
  `--color-accent-subtle` / `--color-danger-subtle` (the wash behind a ghost
  control on hover + focus rings), `--thread-line-color` /
  `--thread-line-color-active`.
- `--space-0: 2px` added — the dense comment layout needed a step below 4px.
- Radii tightened (`--radius-md` 8→6, `--radius-lg` 12→8); shadows softened
  and reserved (cards now use a border, not a shadow); type scale nudged down
  (`--font-size-md` 16→15, `--font-size-xl` 28→22).

**`shared/ui` primitives**
- **Button**: all variants are pills now. `filled` = the one prominent
  accent action per view; `outline` = quiet secondary (pagination, tag
  toolbar); `clear` = the Reddit-style lightweight action — muted-grey text
  that only gains a soft rounded background on hover (Reply/Hide/Ban/Expand/
  Remove all use this).
- **Card**: border only, no shadow.
- **Skeleton**: shimmer colours already token-based; left as-is.
- **Lightbox**: darker backdrop (`rgba(0,0,0,0.82)`), subtle bordered close
  affordance.

**Comment-domain components**
- **RootCommentsTable**: kept as a real `<table>` (the brief says "in a
  table, sortable by …" — semantics + the sort affordance matter), but
  restyled to read as a compact scannable list: no outer box, no vertical
  rules, thin row dividers, a slim uppercase sort header with the active
  column in accent. **Below `$breakpoint-mobile` the same `<table>` collapses
  to stacked rows** (classic responsive-table pattern via `display: block` +
  `data-label` pseudo-content, sortable headers kept as a slim "sort by" bar
  using `th:not(:has(.sortButton))` to drop the non-sort columns) — five
  columns never force a horizontal scroll on a phone. Also fixed a latent
  flex bug: the scroll wrapper lacked `min-width: 0`, so on a narrow viewport
  the table stretched the page instead of scrolling inside its own box.
- **CommentThread / CommentThreadNode**: the centrepiece. The thread line +
  indentation moved off the individual node onto the `.replies` wrapper, so
  indentation now accumulates **linearly** (a fixed step per level) and caps
  cleanly (`.indentCapped`, driven by `depth >= MAX_VISUAL_DEPTH`) instead of
  the old per-node `depth * step` margin that compounded triangularly and
  never actually stopped growing past the "cap". Thin low-contrast grey line
  per level; compact vertical rhythm; de-emphasised meta line (small, muted,
  `username · timestamp`); Reply/Hide as small muted ghost buttons below the
  text; Ban author inline on the meta line right after the timestamp
  (moderator-only). The expanded thread panel gets a white surface + a 2px
  accent bar on its left edge as a "you are here" marker. Removed the
  now-dead `--depth` inline custom property and its `CSSProperties` import.
- **CommentForm + TagToolbar**: compact toolbar in a small inset container,
  monospace glyph buttons; inputs get an accent focus ring; the live preview
  now reads as *output* — a solid tinted panel (was a dashed box) with an
  empty-state hint; the file input's `::file-selector-button` restyled to a
  pill; Post button is a left-aligned accent pill (was full-width).
- **AttachmentPreview**: smaller contained thumbnail (140×105) with an accent
  hover border; text attachment is a compact pill/chip, not a bare underline.
- **ModeratorPanel / ConnectionStatusIndicator / Toast**: unchanged in intent
  — small, muted, corner/inline. Login card gets a real drop shadow + focus
  rings; toast is a rounded pill with a short slide-in.
- **globals.scss**: narrower content column (860→820), a shared
  `:focus-visible` ring, `a` underline-on-hover, mobile page padding.

**Deviations**
- RootCommentsTable kept its `<table>` element (did *not* restructure to a
  `<ul>`/`<div>` list) — the brief explicitly frames the root view as a
  sortable table, and the responsive-collapse pattern gives the compact
  list *look* on mobile without giving up table semantics or the a11y of
  real `<th scope>` sort controls.
- Three `.tsx` files gained styling-only hooks: `data-label` attrs +
  `.expandCell`/column classes on `RootCommentsTable` rows, `.btn` on
  `TagToolbar` buttons, `.submit` on the form button, and the
  `.indentCapped` class toggle on `CommentThreadNode`'s `.replies`. No
  behavioural change.
- The lightbox backdrop renders semi-transparent in Playwright's headless
  screenshots despite a computed `rgba(0,0,0,0.82)` and correct DOM
  stacking — confirmed a screenshot-compositing quirk (computed style +
  `elementFromPoint` both correct), not a real bug.

**Verified manually** (full `docker compose up -d --build` stack — backend
container running, frontend run via `next dev` on :3000 so CORS'
`ALLOWED_ORIGIN=http://localhost:3000` is satisfied — seeded a fresh
4-level thread + an image attachment + a couple of `<code>`/`<strong>`
roots): root table, an expanded 4-level thread (LIFO order intact, thread
lines + linear indentation, image thumbnail), the live preview rendering
bold/italic/code/link, the lightbox, inline reply, and the moderator panel
(login → Hide/Ban buttons appear, styled as red ghost actions) all checked
at 1280px desktop **and** 375px mobile. `document.documentElement.scrollWidth
=== clientWidth` at 375px (no horizontal overflow anywhere). Zero console
errors; the one pre-existing socket reconnect *warning* and the one
pre-existing React Compiler *info* on `CommentForm`'s `watch()` are the only
console output, unchanged from prior steps.

**Verified — build/lint**: `tsc --noEmit`, `next build`, `eslint` all clean
(the single pre-existing React Compiler info-warning on `CommentForm`'s
`watch()`, same as Steps 6-10). No backend changes this step; backend test
suite untouched.

**Pending — next**:
- **Pagination self-check with real multi-page data** — still open (six
  sessions now): Prev/Next across a real 26+-comment second page has only
  ever been verified structurally. Deferred to the pre-submission pass, when
  the DB gets seeded for the demo video.
- **README, DB-schema export for MySQL Workbench, deployment to a VDS/cloud,
  demo video** — the brief's "Delivery format" section. With the visual pass
  done, the app is feature- *and* polish-complete; these delivery artefacts
  are all that remain.

---

### Step 12 — pagination verified against real multi-page data (done)

Closes the pagination self-check that had been deferred through every
frontend session (Steps 6-11). No app-code changes — a dev seed utility plus
manual + scripted browser verification.

**Seed utility** — `backend/scripts/seed-comments.mjs` (kept; `npm run
seed:comments -- [count]`, default 35). Bulk-creates root comments through
the real `createComment` mutation, solving CAPTCHA the same way the e2e suite
does (`backend/test/comments.e2e-spec.ts` → `solvedCaptcha()`: request a
challenge, read the answer from Redis under `captcha:<token>`). Usernames are
mixed-case and inserted out of alphabetical order (`Zed`, `amy`, `Bob`,
`charlie`, …) so username sorting visibly reorders across the page boundary
and re-exercises the case-insensitive-sort fix. `createComment` is
rate-limited 10/min per IP, so the script backs off 60 s and resumes on a
`THROTTLER` error. Dev-only (needs Redis access to read CAPTCHA answers); not
linted/built (outside `src/`).

**Data seeded**: DB went from 6 → **56 root comments → 3 pages** (25 / 25 /
6). Left in place at the user's request — a curated dataset for the demo
video is a separate pre-submission task, and `seed:comments` can rebuild a
demo DB anyway.

**Verified in the browser** (full `docker compose` stack, `next dev` on
:3000, both 1280px desktop and 375px mobile):
- Load → `Page 1 of 3`, Prev disabled, Next enabled.
- Next → page 2: 25 rows, **both** Prev and Next enabled (middle page).
- Next → page 3: 6 rows, Prev enabled, **Next disabled**.
- Prev ×2 → page 1, state identical to initial load.
- Sort → Username ASC: resets to page 1; walking all three pages gives
  `aaron…golf` / `Hotel…whiskey` / `Xray…Zulu` — **case-insensitive,
  monotonic, no duplicates or gaps at either page boundary** (`golf → Hotel`,
  `whiskey → Xray`). Same check on mobile via the slim sort bar.
- Back to Date DESC (LIFO) default: resets to page 1, dates descending within
  and across pages, pagination still works.
- Mobile: the pagination footer (`56 comments · Prev · Page N of 3 · Next`)
  stays in-bounds and usable in the stacked-row layout;
  `document.documentElement.scrollWidth === clientWidth` on every page.

**Scripted cross-check** (`backend`, via GraphQL directly): 3-6 trials of a
full 3-page sweep for `USERNAME ASC/DESC`, `EMAIL ASC`, `CREATED_AT DESC` —
**every ID set was complete and duplicate-free**, ordering monotonic across
boundaries in every trial.

**Observations (not fixed — outside a verification task's scope, flagged for
later)**:
- `CommentsService.buildRootOrderBy` emits a single `orderBy` key with **no
  secondary tiebreaker** (e.g. `{ id: 'asc' }`). Tied sort keys (duplicate
  usernames/emails, or same-millisecond `createdAt` under bulk seeding) then
  rely on Postgres returning a consistent order for the same query — stable
  in every trial here, but a real (if low-risk) fragility. A one-line
  addition if pagination drift is ever seen.
- Next/Prev doesn't scroll the viewport back to the top of the list — mildly
  awkward on mobile, where the buttons are at the page bottom.

**Verified — build/lint**: no frontend changes; `backend` `lint` unaffected
(`scripts/**` isn't in its lint glob), `package.json` gained one script
entry. Backend test suite untouched.

**Pending — next**: this was the last deferred functional/QA item. What
remains is purely the brief's "Delivery format" section — the original plan's
day 7-9 work:
- **README** — what the project is, implemented features, run-from-scratch
  instructions.
- **DB schema export for MySQL Workbench** (`docs/db-schema.mwb` or a
  Workbench-openable `.sql`).
- **Deployment** to a VDS/cloud, then a from-a-clean-clone verification
  against the README.
- **Demo video** — short screen recording of the deployed app, with a
  curated dataset.

---

### Step 13 — full dark theme, avatars, thread connector graphics, motion pass (done)

A second visual refinement on top of Step 11's (light) Reddit-style pass —
driven by real Reddit dark-mode reference screenshots the user supplied under
`docs/reference-screenshots/` (dark post toolbar, a dark reply thread with
avatars + curved connector lines, a dark sort dropdown). Used directly as the
visual target. Scope was explicitly confirmed: switch the theme wholesale to
dark (no toggle), keep the clickable-column sort (not Reddit's dropdown) but
add icon + motion, and **no** voting UI (the reference shows vote arrows —
there's no voting feature here, fake controls would mislead a reviewer).

**Dark theme (`tokens.scss` + `globals.scss`)**
- Palette redefined for dark: three background layers (`--color-bg #0e1113` →
  `--color-surface #17191d` → `--color-surface-muted #212429`) for depth,
  light-gray text (`--color-text #e2e4e7`, muted `#9aa0a8`), low-contrast
  borders. Accent lightened to `#4a9eea` (was `#0079d3` — poor contrast on
  near-black) with a separate lighter `--color-link #74b8f7` for body-text
  links and a dark `--color-accent-contrast` (text sits on the bright fill).
  Danger/success/warning re-toned; deeper shadows; `--color-code-bg`,
  `--color-row-hover`, `--thread-line-color` (lighter — must read on dark).
- New tokens: `--skeleton-base`/`--skeleton-highlight` (faint sweep, not hard
  white), `--overlay-scrim` (0.72 — page is already dark), `--color-success-subtle`,
  the `--avatar-size` + `--connector-*` geometry group, and a motion group
  (`--dur-fast/base/slow`, `--ease-out`, `--ease-in-out`).
- `globals.scss`: `html { color-scheme: dark }` (native controls/scrollbars),
  and a single global `@media (prefers-reduced-motion: reduce)` that clamps
  every `animation-duration`/`transition-duration` to 1ms (kept at 1ms, not 0,
  so `animationend`/timer-driven unmounts still fire promptly).
- Swept every component styled in Step 11; the few hardcoded colours found by
  `grep` (Skeleton shimmer, Lightbox rgba, a form success border) were
  tokenised. The CAPTCHA image keeps its own light background (baked into the
  `svg-captcha` output server-side) — it reads fine as a small light chip on
  dark, framed with a token border; not "broken".

**Identicon avatars (`shared/lib/identicon.ts` + `shared/ui/Avatar`)**
- Pure client-side, zero network: FNV-1a hash of `username + " " + email` →
  a GitHub-style 5×5 symmetric grid rendered as an inline SVG `data:` URI.
  Hue from the hash, fixed S/L tuned for the dark bg (muted dark fill + a
  brighter same-hue foreground), pill-clipped to a circle. Deterministic —
  same author always the same avatar.
- Shown in `RootCommentsTable` (20px, next to the username) and
  `CommentThreadNode` (`--avatar-size`, 24px desktop / 20px mobile, first on
  the meta line — also the connector's anchor point).

**Thread connector graphics (`CommentThread.module.scss`)**
- Replaced the flat left-border-per-level with a Reddit-style connector: a
  vertical **spine** under each comment's avatar centre (a stub on
  `.body:has(~ .replies)` bridges avatar → replies, then `.repliesInner::before`
  carries it down), and a rounded **elbow** per reply (`::before`,
  `border-bottom` + `border-bottom-left-radius`) branching off the spine into
  that reply's avatar. `:last-child::after` masks the spine below the final
  elbow so it stops at the last reply.
- All coordinates are `>= 0` inside `.repliesInner` on purpose — that element
  needs `overflow: hidden` for the collapse animation, and negative offsets
  would be clipped. The whole `.replies` block is then shifted left by
  `calc(var(--avatar-size)/2 - var(--connector-spine-x))` to sit under the
  parent avatar.
- Geometry is 100% `--connector-*` custom properties; the mobile media query
  retunes them (`--avatar-size`, `--connector-gutter`, `--connector-elbow-y`)
  in one place. Works unchanged past the depth cap (`.indentCapped` just
  shrinks the per-level indent; the connector still draws).
- Hovering a node's `[–] collapse` toggle highlights *that node's* connector
  (`--thread-line-color-active`) via a `:has()` scoped to the direct child —
  no ancestor-chain bubbling.

**Animations (plain CSS, no library)**
- **Reply form**: slide/fade + `max-height` open on mount; `replyClosing`
  swaps in the reverse keyframe, then a 200ms timer unmounts.
- **Thread collapse/expand**: CSS grid `grid-template-rows: 1fr → 0fr`
  transition on `.replies` (with `.repliesInner { overflow: hidden; min-height: 0 }`)
  — the modern height-auto accordion; replies stay mounted, just clipped.
- **Lightbox**: scrim fade-in + image scale-up on open; `.closing` plays the
  reverse, then a 180ms timer calls `onClose`. Serves the brief's "visual
  effects" for attachment viewing.
- **Sort**: a chevron `<SortIcon>` per column — faint/muted when inactive,
  accent + full-strength when active, `transform: rotate(180deg)` (transition)
  between DESC/ASC, plus an animated `scaleX` underline on the active header.
- **Hover micro-interactions**: `translateY(-1px)` on the primary button,
  `scale(1.03)` on attachment thumbnails, row-hover colour transitions, a
  90° close-button rotate, a pulsing "ping" ring on the live-connection dot.

**Deviations (with reasons)**
- **Reply-form / lightbox close use a `setTimeout`, not `onAnimationEnd`.**
  `animationend` proved unreliable when swapping `animation-name` on an
  element whose entrance animation had already finished (and stray child
  animation events muddy it further). A duration-matched timer is predictable
  and still correct under `prefers-reduced-motion` (the CSS is ~1ms, the
  timer just briefly outlives it). Timers are cleared on unmount.
- **Entrance animations use `animation-fill-mode: backwards`** (not `both`) —
  `forwards` on an entrance can strand an element on its `from` frame if the
  animation is interrupted; `backwards` gives a clean start and reverts to the
  base (visible) style after.
- **Collapse toggle moved from the meta line into the actions row** (`[–] collapse`
  / `[+] N replies`) so the avatar is always first on the meta line — the
  connector spine needs a predictable avatar x to align to.
- **`grid-template-rows` transition** for collapse needs a fairly recent
  browser (Chrome 107+, Firefox 129 / mid-2024, Safari 16+). Acceptable for a
  modern-browser review; documented here.
- The lightbox scrim renders semi-transparent in Playwright's **headless
  screenshots** (computed `opacity: 1`, correct DOM) — same harness quirk noted
  in Step 11, and here it also affects other entrance-animated overlays in
  screenshots unless rAF is pumped first. Not a real-browser issue.

**Verified** (full `docker compose up -d --build` stack, 1280px + 375px):
dark theme reads consistently across the root table, an expanded 8-level
thread, the form, the lightbox, and the moderator panel; identicon avatars
are distinct and legible on dark; the connector spine/elbows align to avatars
and still draw correctly at (and past) the depth cap without overlap; the
CAPTCHA is legible; collapse / reply-open / reply-close / lightbox
open-close / sort-icon-rotate all work and, with `prefers-reduced-motion:
reduce` emulated, are clamped to ~1ms while every interaction still completes
(collapse → `0px`, reply form unmounts, lightbox closes); no horizontal
overflow at 375px (`scrollWidth === clientWidth`); **zero console errors**
(the one pre-existing socket-reconnect *warning* and the React Compiler
*info* on `CommentForm`'s `watch()` remain, unchanged). `tsc --noEmit` /
`next build` / `eslint` all clean.

**Pending — next** (unchanged in scope — the brief's "Delivery format" plus
two housekeeping items):
- **README** — what it is, implemented features, run-from-scratch steps.
- **DB schema export for MySQL Workbench**.
- **Moderator password rotation** — the dev creds (`moderator` /
  `moderator-dev-password`) are in `.env.example`; a real one must be set
  before deploy.
- **Demo data curation** — the DB currently holds ~59 test/seed comments
  (bulk pagination seed + the `Aurora` connector-demo thread); needs a
  clean, curated set for the video.
- **Deployment** to a VDS/cloud, then a from-a-clean-clone README check.
- **Demo video**.

---

### Post-Step-13 bug fix — connector-line drift at deeper nesting levels (done)

Found via manual review of a real multi-level thread (the `Aurora` thread from
Step 13, 5+ levels deep) — screenshotted at the user's actual display scale
(not 1x), where it was visible that each level's connector spine/elbow sat
increasingly off-centre from its avatar the deeper the thread went.

**Root cause — two separate things, both in the "geometry built from an
accumulating chain of small offsets" family Step 13's own write-up warned
about**:

1. **The real drift**: `.replies` carried `margin-left: calc(var(--avatar-size)/2
   - var(--connector-spine-x))` (11px) *in addition to* `.repliesInner`'s
   `padding-left: var(--connector-gutter)` (24px) — two roundable offsets
   applied per nesting level. At an integer device-pixel ratio (Playwright's
   default) both offsets snap cleanly and `getBoundingClientRect()` shows zero
   error, which is why Step 13's own verification (run only at DPR 1) missed
   it. At the fractional DPRs real displays commonly use (1.25/1.5x — confirmed
   by reproducing with `deviceScaleFactor: 1.5`), the 11px offset (16.5 device
   px) has to round on every level, while the avatar's own position is offset
   by a *different* accumulating rounding path. The two chains diverge a little
   more each level → the "cumulative drift" the user described.
2. **A second, smaller bug found while fixing the first**: `--connector-x`
   and `--connector-elbow-y` (introduced this fix, see below) are declared once
   in `tokens.scss` as `calc(var(--avatar-size) / 2)` / `calc(var(--space-1) +
   var(--avatar-size) / 2)`. A custom property's `var()` references are
   substituted using the cascade *where that property is declared* — since
   they're declared on `:root`, they permanently bake in `:root`'s
   `--avatar-size` (24px), and don't recompute just because a descendant
   (`.CommentThread`'s mobile media query) redeclares `--avatar-size: 20px`.
   Result: the mobile connector geometry silently kept using the desktop
   avatar radius, a flat +2px offset at every level (not accumulating, but
   still wrong).

**Fix**:
- Removed `.replies`'s `margin-left` entirely. The per-level indent is now
  applied exactly once, as `.repliesInner`'s `padding-left`.
- Introduced a single custom property, `--connector-x` (`avatar-size / 2`),
  as *the* horizontal anchor for the whole connector graphic — the spine,
  every elbow, the collapse stub, and the last-child mask all position
  themselves from it, all relative to boxes that share the same node-left
  origin. There is now exactly one offset (`--connector-gutter`, a plain
  value with no rounding-prone subtraction) between one level and the next,
  instead of two.
- The elbow now runs all the way to the child's avatar *centre* (previously
  it stopped at the avatar's left edge, ~12px short) — safe because
  `.CommentThreadNode::before` is earlier in box-tree order than `.body`, so
  it paints underneath the avatar rather than over it; the line now visibly
  tucks behind each avatar instead of pointing at its edge.
- Fixed the `--connector-x`/`--connector-elbow-y` staleness by redeclaring
  both inside `.CommentThread`'s mobile media query, alongside `--avatar-size`
  and `--connector-gutter`, so they rebake correctly for that subtree.
- Net effect: indentation per level dropped from 35px to 24px (desktop) — a
  side benefit, not the goal; the graphic reads tighter and closer to the
  Reddit reference now that the redundant `.replies` offset is gone.

**Verified** (full `docker compose up -d --build` stack): rebuilt the 8-level
`Aurora` connector-demo thread from Step 13. Measured `spine-centre −
avatar-centre` in the browser at every level (1 through 6, plus the
depth-capped 7th) at `deviceScaleFactor` 1, 1.25, 1.5, and 2 — **0px delta at
every level, at every scale factor**, both desktop (1280px) and mobile
(375px). Re-measured after collapsing and re-expanding a mid-thread subtree
(`bornholm`) — deltas stayed at 0, confirming the alignment isn't
render-path-dependent. Reproduced the original bug first (confirmed non-zero,
per-level-constant-but-visually-compounding drift at DPR 1.5 on the
pre-fix code, worst at delacroix/Esme/fenwick — levels 2-4) so the fix is
verified against an actual reproduction, not just re-derived math. No
horizontal overflow at 375px. Zero console errors. `tsc --noEmit` / `next
build` / `eslint` clean.

**Deviation**: none beyond the `--connector-x`/`--connector-elbow-y`
media-query fix bundled in, since it's the same root cause class and was
found while fixing the reported issue in the same file.

---

### Post-Step-13 bug fix, round 2 — connector lines rebuilt as a measured SVG overlay (done)

The round-1 fix above ("correct connector-line drift") was real but
insufficient — the user came back with a screenshot of an actual 7-level
thread still showing drift, milder than before but present. This entry is
the thorough re-investigation that was explicitly asked for instead of a
third round of static-CSS patching.

**Measured first, before touching anything.** At 2–3 depths, in the live
browser: each `.replies` wrapper's `border-left`/padding (there was no
`border-left` at all, contrary to one working theory), each avatar's real
`getBoundingClientRect()` centre, and where the connector `::before`/`::after`
boxes actually drew. Per-node, spine-vs-own-avatar was exact (0px) at every
depth in plain CSS-pixel terms — round 1's fix genuinely held for a simple,
linear reply chain. So the deeper investigation had to go looking for what a
straight chain doesn't exercise: **a debug build with the spine/elbow/mask
pseudo-elements recoloured** (red/green/yellow outlines) on the user's actual
branching shape (`haddock` with three children — `carla`, `Juno`, `ingram` —
where `Juno` itself has its own nested replies) made the real bug visible
immediately: haddock's spine (bright red) ran straight through `Juno`'s own
nested subtree (`dave`, `carla`, `carol`), clearly to the side of their
avatars — not the constant-offset kind of drift, a scope bug.

**Root cause.** `:last-child::after` can only mask a parent's spine below
*its own* box — from its own elbow down to its own bottom. That's correct
**only** when the last-rendered sibling is also the tallest, i.e. the thread
never branches. As soon as an *earlier* sibling (`Juno`, not `haddock`'s
`:last-child`) has its own nested replies, that sibling's flex item becomes
taller than a single row, and the parent's spine — which runs the *full
height* of `.repliesInner`, unconditionally — stays visible running straight
through that sibling's nested content, because nothing in the CSS knows
where "Juno's own row" ends and "Juno's children" begin. This is not a
number you can fix with a better `calc()`: it depends on the actual rendered
shape of an arbitrary, data-driven, unevenly-branching tree, which static CSS
geometry cannot see. Confirmed by hitting exactly this shape organically —
the user's own manual testing between sessions had grown the `Aurora` thread
a second sibling under `haddock` (`Juno` → `dave`), which is precisely the
case round 1's fix never exercised.

**This is the case the task's instructions anticipated** ("if a robust,
exact-pixel-accurate result isn't achievable with pure CSS … switch to a more
reliable method"). Third-time pure-CSS patching was explicitly ruled out, so:

**New approach — measured, not calculated.** The connector graphic is now an
absolutely-positioned SVG (`.connectorLayer`) overlaying `.CommentThread`,
with one independent `<path>` per parent→reply edge — no shared spine, so
there's nothing for one edge to accidentally run through another's territory.
- `Avatar` forwards arbitrary props now, so each avatar in the thread carries
  `data-node-id`/`data-connector-avatar` (`CommentThreadNode`).
- A new hook, `useConnectorLines` (`useLayoutEffect` + `ResizeObserver` on the
  container), measures every visible avatar's real `getBoundingClientRect()`
  centre, walks the *actual* fetched tree (`ThreadNode.replies`, not an
  assumed shape) to get the real parent→child id pairs, and pairs them up —
  skipping any avatar under a collapsed subtree (`data-connector-collapsed`)
  so hidden nodes don't get phantom lines.
- `CommentThread` renders one quadratic-Bézier-cornered `<path>` per edge:
  straight down from the parent avatar centre, a quarter turn, straight
  across into the child avatar centre. Painted *before* the comment content
  in DOM order (both are `position: relative`, so paint order follows DOM
  order within that stacking bucket) — lines tuck behind avatars, not over
  them.
- `ResizeObserver` re-measures on every layout change that could move an
  avatar — collapse/expand and reply-form open/close animating the
  container's height, an attachment image loading, window resize/reflow —
  one mechanism instead of hooking each trigger individually. It fires
  continuously during a CSS transition, so lines stay in sync as a subtree
  animates open or closed, not just snapping at the end.
- Removed from `CommentThread.module.scss`: the spine/elbow/mask
  pseudo-elements, the `.body` collapse-stub, and the hover-highlight
  `:has()` rule (a cosmetic bonus from Step 13 — dropped rather than rebuilt
  with the new architecture, to keep this fix's surface area focused on
  correctness). `--connector-x`/`--connector-elbow-y`/`--connector-radius`
  removed from `tokens.scss` (the curve radius is now a plain JS constant);
  `--avatar-size`/`--connector-gutter`/`--connector-color` stay — indentation
  spacing and the SVG stroke colour still read them.

**Incidental fix, found while verifying, needed to even test this.** Pushing
the test thread deep enough to reproduce the branching shape (10+ levels)
hit a **pre-existing, unrelated hard crash**: `commentThread.graphql` nests
`replies` exactly 10 levels deep, so a comment at that exact depth boundary
has no `replies` key in the response at all — not an empty array, absent.
`CommentThreadNode` (`node.replies.length`) and the new `collectEdges`
(`for...of node.replies`) both assumed it always exists and threw
`TypeError: Cannot read properties of undefined (reading 'length')`,
white-screening the whole page. This is unrelated to connector positioning,
but it happened to be organically triggered by the same manual testing that
surfaced the branching-drift bug, and it blocked verifying the fix above, so
it was fixed in the same pass: `ThreadNode.replies` is now typed `?:` (was
`:`, a lie about what the API actually returns), and every reader treats a
missing value as `[]`.

**Verified** (full `docker compose up -d --build` stack, the same `Aurora`
thread the user's screenshot came from, now with `haddock`'s real
`carla`/`Juno`(→`dave`→`carla`→`carol`)/`ingram` branching intact — not
simplified back to a linear chain): programmatically matched every rendered
`<path>` endpoint against every visible avatar's real centre — **0px delta
for all 13 edges** across 14 avatars, depths 1 through the 10-deep test data
(past the 6-level visual cap). Repeated at 375px mobile (also 0px delta,
`scrollWidth === clientWidth`, no overflow). Collapsed and re-expanded a
mid-thread subtree (`bornholm`, which contains the deep branch) and
re-measured — still 0px delta, confirming it isn't render-path-dependent.
Re-checked under `prefers-reduced-motion: reduce` — collapse/expand and
reply-form open/close still correctly show/hide the right avatars and
converge to 0px delta (settling can lag a build-up of *back-to-back*
resize-triggering interactions by up to roughly a second before the
`ResizeObserver` catches up — noted as a minor, self-correcting
characteristic, not a positioning-accuracy issue, and not something a normal
single-click-at-a-time user would notice). Zero console errors/page errors
on the branching thread that used to crash. `tsc --noEmit` / `next build` /
`eslint` all clean.

**Deviations**
- **Pure CSS → measured JS positioning**, as the task explicitly authorized
  once two static-CSS rounds proved the geometry isn't expressible statically
  for an arbitrary branching tree.
- **Dropped the hover-highlight-connector cosmetic** from Step 13 rather than
  reimplementing it against the new per-edge-path architecture (would need
  hover state lifted out of each `CommentThreadNode` to `CommentThread` to
  pick the right `<path>`) — a bonus flourish, not core to the connector's
  job, and out of scope for a correctness fix.
- **Fixed the depth-10 `undefined` `.replies` crash** alongside the intended
  fix, since it blocked verifying it and was trivially guarded — flagged
  distinctly here rather than folded silently into the connector fix.

---

### Post-Step-13 bug fix — replies at depth 11+ silently vanished (done)

**Reported as**: replying to a comment 11 levels deep "fails" — the reply
doesn't get created. Diagnosed before touching anything, per the task's own
instructions, because three genuinely different bugs were on the table
(reply form broken at that depth, the mutation erroring, or the mutation
succeeding but not rendering) and each needs a different fix.

**Diagnosis.** Reproduced against the real UI, network tab open: clicked
Reply on a depth-10 comment, solved the CAPTCHA, submitted. The
`createComment` mutation returned **200 with a clean success payload** —
`{ id, text, parentId, ... }`, no GraphQL error. Confirmed independently in
Postgres: the row exists, correct `parentId`. So the write path (mutation,
backend, DB) was never broken, exactly as the bug report suspected. But the
new reply **never appeared anywhere in the tree**, before or after the
in-flight `refetchQueries` settled, and the reply form closed as if
successful (because, from the client's perspective, it was). That's the
"succeeds but doesn't render" branch — not a mutation failure, and nothing
to do with `useConnectorLines` (no console/page errors at any point in the
flow; that code simply had nothing to measure for a node that was never in
the fetched data in the first place).

**Root cause**: `commentThread.graphql`'s hand-unrolled fragment (GraphQL has
no recursive-fragment construct — see that file's own header comment) nested
`replies` exactly **10 levels deep**. A comment at exactly that depth
boundary has no `replies` field in the response *at all* — not empty, absent
— so **nothing whose parent sits at the boundary can ever appear**, no
matter how many times the query is refetched. The "Reply" button itself is
unconditional (doesn't check whether `replies` was fetched), so nothing
stopped a user from replying at the boundary; the result just had nowhere to
go. This is the same class of gap the previous two fix entries kept
surfacing pieces of — a fixed unroll depth silently discarding anything past
it — just hit from the write side this time instead of a rendering
artifact.

**Fix**:
- Regenerated `commentThread.graphql` with the fragment unrolled to **30
  levels** (a generated file now — the previous 10 levels were hand-typed;
  30 by hand invites exactly the kind of transcription slip this bug already
  came from, so a one-off script emitted the nested structure and
  `npm run codegen` regenerated `generated.ts` from it, same as always).
  30 is a large multiple of both the UI's visual depth cap (6) and the
  deepest thread exercised in testing so far (this fix's own verification
  reached 20) — not "unlimited" (GraphQL genuinely can't express that in one
  query), but comfortably past anything this brief's scope will organically
  produce.
- **Also added an honest fallback**, so this specific failure mode — data
  existing but silently, indistinguishably not showing up — can't recur even
  if a thread someday does outgrow 30 levels: `repliesCount` (an
  unconditional direct-reply count, fetched at every level regardless of
  depth) is compared against whether `replies` was actually fetched.
  `hiddenByFetchDepth` (`CommentThreadNode`) is true exactly when a node has
  real replies the query couldn't reach; it renders a small muted notice —
  "N more replies past this point aren't shown here … they still exist and
  can be replied to" — instead of the previous silence.

**Verified** (full `docker compose up -d --build` stack): reproduced the
exact reported failure first (depth-10 reply invisible after a real,
UI-driven submit — confirmed via the mutation's own network response *and*
a direct DB read that the row existed all along). After the fix: that same
already-created reply appeared immediately once the page reloaded the
(now-30-deep) query; built the chain out to **depth 20** (mixing direct
mutation calls, the same way the app's own network requests work, with one
fully UI-driven Reply→fill→CAPTCHA→submit at the deepest point) — the depth
20 reply appeared **immediately, no reload**, mutation response clean, zero
console/page errors. Programmatically matched every connector `<path>`
against its avatar across all 29 edges of the 30-node tree — **0px delta at
every one**, depths 0 through 20, and confirmed visually that indentation
still caps correctly past `MAX_VISUAL_DEPTH` (6) rather than marching off
screen. Repeated at 375px mobile (30 avatars, 29 paths, 0px delta, no
horizontal overflow). **Regression check**: replied to a depth-2 comment
(`delacroix`) — worked exactly as before, appeared immediately, its
`repliesCount`/collapse-toggle state correct. `tsc --noEmit` / `next build`
/ `eslint` all clean.

**Deviation**: none — scope stayed to the one reported failure mode (plus
the honest-fallback notice, which is the direct fix for *why* it read as a
silent failure rather than a visible error, not a separate feature).

---

### Step 14 — layer-by-layer reply reveal within the depth cap, "Continue
this thread" stack-based re-rooting past it (done)

**Two prior experiments on top of `ede6761` were reset out before this step,
not carried forward**: a "restore the flat depth cap" fix and a dashed
connector-line boundary marker. Neither gave the UX actually wanted, so the
branch was reset to `ede6761` and this step replaces both with a different
design entirely — there is no dashed line anywhere in the app, and the
depth-cap problem is solved with a different mechanism (below), not a
flattened-indent CSS rule. Entirely client-side, using data
`commentThread` already fetches in one request to 30 levels (confirmed
still true at `ede6761`) — no backend change.

**Layer-by-layer reveal within the cap** (`CommentThreadNode.tsx`) — this is
the original Step 7 design, restored: `collapsed` defaults to `false` only
at the panel's current depth-0 view root, and to `true` at every deeper
depth, so expanding a root only ever surfaces its *direct* replies; each
reply's own nested replies stay behind its own "[+] N replies" toggle,
clicked one branch/one level at a time. State is local `useState` per
mounted node instance (not a lifted `Set`) — since a collapsed subtree's
children stay mounted (the CSS grid `1fr → 0fr` collapse animation needs
that), sibling branches are independent by construction and collapsing a
node never discards whatever was already revealed underneath it, satisfying
the "don't reset on collapse" requirement without extra bookkeeping.

**"Continue this thread →" past the cap** — a node at exactly
`MAX_VISUAL_DEPTH` (6, unchanged) with replies now renders a
"Continue this thread →" link instead of the normal reveal toggle, and its
`.replies` block isn't rendered at all (not flattened-indent, not present in
the DOM). Clicking it calls `CommentThread`'s new `continueThread(id)`,
which pushes the id onto `rerootStack: string[]` (`useState<string[]>([])`).
`CommentThread` resolves the stack's top id against the *already-fetched*
tree via a small recursive `findNode`, and renders that node as the new
depth-0 `<CommentThreadNode>` — `key={viewRoot.id}` forces a fresh mount so
its (and its descendants') local reveal state starts clean, exactly like a
freshly-expanded root. Its own children get their own fresh layer-by-layer
reveal and their own depth cap, so a deep enough re-rooted view can itself
show a further "Continue this thread". `useConnectorLines` is now driven by
`viewRoot` instead of the absolute fetched root, so the SVG overlay only
ever measures avatars that are actually in the current view — no cap-aware
logic needed there, since past-cap nodes were never in the DOM in the first
place and are silently skipped by the existing "one end missing" guard.

**"← Back to parent thread"** — shown above the thread only when
`rerootStack.length > 0`; pops one entry
(`setRerootStack(s => s.slice(0, -1))`). Since the stack holds every
intermediate re-root, not just the true original root, N "Continue this
thread" clicks need exactly N "Back" clicks to undo, retracing one step at
a time rather than jumping straight back to the top — verified below.

**Removed as dead code**: `.indentCapped`/`indentCapped` and its
`.repliesInner { padding-left: ... }` override — nothing ever renders past
`MAX_VISUAL_DEPTH` in a single view anymore, so there's no "past the cap"
indentation case left to special-case; the deepest node in any one view is
always exactly at the cap, indented normally like every level before it.

**Deviation**: the task's phrasing suggested "e.g. a Set of revealed
comment ids" for reveal-state tracking; local per-instance `useState`
(depth-dependent default) was used instead, since it already satisfies
every stated requirement — independent sibling branches, collapse without
discarding deeper reveals — without threading extra props through every
recursion level, and it's the mechanism this exact feature already used
before `ede6761` (Step 7 in this log). No other deviations — mobile keeps
the same fixed `MAX_VISUAL_DEPTH = 6` as desktop (only the CSS spacing
tokens are smaller there), matching every prior session; no new responsive
JS cap was introduced.

**Verified manually** (full `docker compose up -d --build` stack — the
frontend container is a production build with no source volume mount, so it
needed an actual rebuild to pick up each source change, confirmed by
re-checking behavior only after rebuilding — desktop 1280px + 375px
mobile, the existing 20+-level `Aurora` test thread):
- Expanding the root revealed exactly its direct replies (`Cassius`,
  `bornholm`); `bornholm`'s own nested reply stayed behind its own
  "[+] 1 reply" toggle. Walked one click at a time down to depth 6
  (`haddock`) — every intermediate level required its own click, plain
  solid connector lines throughout, normal per-level indentation, zero
  dashed styling anywhere (confirmed both by screenshot and that no
  dash-related CSS/class exists in the stylesheet at all).
- At `haddock` (depth 6), "Continue this thread →" appeared instead of a
  reveal toggle. Clicking it re-rooted the panel on `haddock` — "← Back to
  parent thread" appeared, `haddock` rendered as the new depth-0 node with
  its own direct replies (`carla`, `Juno`, `ingram`) shown immediately and
  `Juno`'s own nested reply freshly collapsed behind its own toggle (not
  inheriting any prior reveal state — confirms the `key`-forced remount).
- Walked down again from the re-rooted view to a second cap boundary
  (`depthchain12`, absolute depth 12) and re-rooted a second time; walked
  down again to a third boundary (`depthchain18`, absolute depth 18) and
  re-rooted a third time. Clicked "← Back to parent thread" three times,
  reading the view-root username after each click:
  `depthchain18 → depthchain12 → haddock → Aurora` — each click retraced
  exactly one step, never jumping straight to the original root; the "Back"
  link itself correctly disappeared once the stack emptied.
- **Depth-11-fix regression check**: replied to `haddock` (absolute depth
  6) through the real UI (Reply → fill → read the CAPTCHA answer from Redis
  → submit). The mutation succeeded and the new reply was correctly present
  in the very next `commentThread` refetch — but invisible in the
  *current* (non-re-rooted) view, exactly as designed, since `haddock` sits
  at the cap there and its children aren't rendered in that view at all.
  Clicking "Continue this thread" on `haddock` immediately showed the new
  reply with no reload, confirming the write path from the original
  depth-11 fix is untouched and works correctly under the new cap UI.
- **Connector-line-drift regression check**: after re-expanding to a cap
  boundary, matched every rendered SVG `<path>` endpoint against its
  avatar's real `getBoundingClientRect()` center — **0px delta on all
  edges**. Repeated at 375px mobile — same result, no horizontal overflow
  (`scrollWidth === clientWidth`).
- Zero console errors throughout every step above. `tsc --noEmit` and
  `eslint` both clean.

**Pending**: unchanged from prior sessions — README, DB schema export for
MySQL Workbench, moderator password rotation, demo data curation,
deployment, and the demo video (CLAUDE.md's "Delivery format" section).

---

### Step 15 — revert layer-by-layer reveal; show the full subtree at once
within the depth cap (done)

**Reported from hands-on testing, not a code-review finding**: Step 14's
layer-by-layer reveal (one click per depth level, `collapsed` defaulting to
`true` below the view root) interacted badly with "Continue this thread"
navigation. `key={viewRoot.id}` (needed so a re-root gets fresh local state)
forces a remount on every "← Back" too — so going back to a parent thread
didn't restore it as the user had left it, it restored it to
*freshly-mounted-and-mostly-collapsed*, since that was `collapsed`'s default
below depth 0. Concretely: expand a root, click through several layers to
reach a "Continue this thread" link, re-root, then click "Back" — the parent
view came back collapsed to depth-1-only, forcing the user to re-click
through every layer again just to get back to where they'd already been
looking. Reverted rather than patched around, per the session's own framing
of this as the wrong direction, not a bug in the layer-reveal mechanism
itself.

**Fix**: `CommentThreadNode`'s `collapsed` now defaults to `false`
unconditionally (was `depth > 0`) — the whole fetched subtree renders at
once on mount, all the way down to `MAX_VISUAL_DEPTH`, exactly how it
worked before Step 14. The per-node "[–] collapse" / "[+] N replies" toggle
button is unchanged in every other respect — it still exists, still hides/
shows one branch via the same CSS grid `1fr → 0fr` animation, still keeps
descendants mounted so nothing is lost — it's just no longer the only way to
see content in the first place. This incidentally also fixes the back-nav
complaint for free: `key={viewRoot.id}`'s forced remount on "Back" now
lands on a `collapsed: false` default, so the parent view always re-renders
fully expanded within its own cap, never partially collapsed, without
needing to special-case "Back" or preserve state across the remount at all.

Nothing else from Step 14 changed: `MAX_VISUAL_DEPTH` (6) is the same,
"Continue this thread →" at the cap boundary and `rerootStack`-based
re-rooting are untouched, `.indentCapped` stays removed (still dead code —
nothing renders past the cap in a single view either way), and there is
still no dashed connector-line styling anywhere.

**Deviation**: none — a straight revert of one `useState` default plus the
doc-comment updates that description change implies (`CommentThreadNode`'s
top comment, `MAX_VISUAL_DEPTH`'s comment, and `CommentThread`'s
`rerootStack` comment, which now explains *why* the forced remount also
fixes the back-navigation complaint).

**Verified manually** (full `docker compose up -d --build` stack — rebuilt
the frontend image, since the container is a production build with no
source volume mount — desktop 1280px + 375px mobile, the same 20+-level
`Aurora` test thread):
- Expanding the root immediately showed every level from 0 through 6
  (`haddock`, "Continue this thread →") in one click — confirmed via
  screenshot and via `document.querySelectorAll` finding **zero** `[+]`
  ("collapsed branch") buttons anywhere in the freshly-expanded tree.
- Re-rooted three times in a row (`haddock → depthchain12 → depthchain18`,
  each via its own "Continue this thread") — each re-rooted view *also*
  showed its full subtree at once (zero `[+]` buttons after each re-root,
  not just after the initial Expand).
- Clicked "← Back to parent thread" three times, checking both the view
  root's username and the collapsed-button count after each click:
  `depthchain18 → depthchain12 → haddock → Aurora`, **zero `[+]` buttons at
  every step** — confirms both the one-step-at-a-time stack behaviour
  (unchanged from Step 14) and the actual fix (no re-collapsing on Back).
  The "Back" link itself correctly disappeared once the stack emptied.
- **Depth-11-fix regression check**: replied to `haddock` (absolute depth
  6, at the cap in the true-root view) through the real UI (Reply → fill →
  read the CAPTCHA answer from Redis → submit). Succeeded, invisible in the
  current (non-re-rooted) view exactly as designed (haddock's children
  aren't rendered there), and appeared immediately — fully expanded,
  no reload — on re-rooting onto `haddock`.
- **Connector-line-drift regression check**: matched every rendered SVG
  `<path>` endpoint against its avatar's real `getBoundingClientRect()`
  center at a fully-expanded cap boundary — **0px delta on all edges**.
- Zero console errors throughout. No horizontal overflow at 375px
  (`scrollWidth === clientWidth`). `tsc --noEmit` and `eslint` both clean.

**Pending**: unchanged — README, DB schema export for MySQL Workbench,
moderator password rotation, demo data curation, deployment, and the demo
video.

---

### Investigation — "Choose File" button reported unclickable (no code
change; false alarm)

A file-picker click issue was reported from manual testing, with a request
to diagnose before touching anything (possibly a regression from the
Step 14/15 thread-view work bleeding into `CommentForm`). Diagnosed
thoroughly before concluding anything: on a fresh page load, the
`<input type="file">` was confirmed genuinely enabled
(`disabled: false`, `pointer-events: auto`), `document.elementFromPoint()`
at its center returned the input itself (no overlay, including the
connector-line SVG, which is `pointer-events: none` anyway), a real trusted
click opened the native OS file chooser in both the root and a reply form,
and a full upload → select → `uploadAttachment` → attachment-set → input-
hides-itself flow completed with zero console errors. `git log` confirmed
`CommentForm.tsx` hasn't been touched by any commit since `df985cc` — none
of the recent `rerootStack`/reveal-state work in `CommentThreadNode` had a
code path into it, ruling out the suspected state-bleed. No global click
interceptors exist anywhere in the app either.

Reported back with the full diagnosis and asked the user to help close the
gap between the report and what could be reproduced — turned out to be a
false alarm: it worked correctly in the user's own actual browser tab, and
whatever blocked it in the tab they'd been testing in earlier (suspected:
cache, an extension, or zoom level specific to that one tab) wasn't a
defect in the code. **No code change made.**

---

### Step 16 — collapsible root comment form (done)

New feature, not a fix: the root comment form (`HomeView`) now loads
**collapsed** by default — a single-line "Leave a comment…" prompt instead
of the full field set — and expands to the complete form on click. Reply
forms (opened via "Reply" on a specific comment in `CommentThreadNode`) are
explicitly unaffected: they already have their own expand/collapse
affordance (the "Reply"/"Cancel" toggle button), so wrapping them in a
second collapse layer would just be redundant chrome.

**Implementation**
- New `components/CollapsibleCommentForm/` (`.tsx` + `.module.scss` +
  `index.ts`, standard colocation) — the only new component. Owns
  `expanded`/`closing` state and renders either a `Card`-wrapped
  `<button>` reading "Leave a comment…" (collapsed) or the real
  `<CommentForm>` (expanded). `HomeView.tsx` swaps its direct `<CommentForm>`
  usage for this wrapper; nothing else in `HomeView` changed.
- `CommentForm.tsx` gained one small, backward-compatible addition: an
  optional `onCancel?: () => void` prop. When set, a small "Cancel" button
  renders next to the "Leave a comment"/"Reply" heading (disabled while
  submitting, so a mid-flight mutation isn't left updating an unmounted
  component). `CommentThreadNode`'s reply usage doesn't pass it — confirmed
  by re-reading that call site — so reply forms render exactly as before,
  no new button appears there. `onSuccess` (already an existing prop) is
  reused as the "return to collapsed" hook after a real post — no new prop
  needed for that half.
- **Animation reused, not reinvented**, per the task's own instruction:
  `CollapsibleCommentForm.module.scss`'s `form-open`/`form-close` keyframes
  and the mount/unmount timing (`useState` + a `setTimeout`-driven "closing"
  class before actually collapsing) are a direct copy of
  `CommentThreadNode`'s inline-reply-form pattern — same properties
  (opacity + `translateY` + `max-height`), same tokens
  (`--dur-base`/`--dur-fast`, `--ease-out`/`--ease-in-out`), same 800px
  ceiling, same `CLOSE_MS = 200` reasoning (long enough to safely outlast
  the CSS animation under both normal and `prefers-reduced-motion`-clamped
  conditions). Different keyframe *names* only, since CSS Modules scope
  `@keyframes` per file — the values themselves are identical on purpose.

**Deviation / judgment call**: Cancel-with-typed-content just collapses
immediately, no confirmation prompt. The task explicitly allowed either
"simplest" option for this; adding a confirmation dialog for a test
assignment's comment box would be over-engineering a case with no real
cost to getting wrong (worst case: retype a comment, same as accidentally
closing any ordinary text box). No other deviations — the collapsed bar
uses the existing `Card`/`Button`-adjacent styling conventions (muted text,
row-hover highlight on hover) rather than introducing a new visual style.

**Verified manually** (full `docker compose up -d --build` stack — rebuilt
the frontend image, production build with no source volume mount — desktop
1280px + 375px mobile):
- Fresh page load: form renders collapsed ("Leave a comment…" bar), full
  root comments table directly below it — confirmed via screenshot.
- Clicking the bar expands to the complete form (all fields, CAPTCHA,
  attachment, Post button) with a "Cancel" link next to the heading.
- Cancel collapses back to the bar (`input[name="username"]` gone from the
  DOM, prompt text back).
- Filled and posted a real comment (CAPTCHA answer read from Redis, same
  method as every prior session's manual verification) — the comment
  appeared in the table and the form returned to its collapsed state
  automatically, matching "collapsed by default" even right after a
  successful post.
- Expanded a reply form on an existing thread — appears inline immediately
  as before, exactly **one** "Cancel"-labelled button on the page (the
  pre-existing external toggle), confirming no duplicate/second Cancel
  affordance leaked into replies.
- Repeated the collapsed/expanded states at 375px mobile — same behaviour,
  no horizontal overflow (`scrollWidth === clientWidth`).
- Zero console errors through every step above. `tsc --noEmit` and `eslint`
  both clean (only the same pre-existing, unrelated React Compiler
  info-warning on `CommentForm`'s `watch()` seen in every prior session).

**Pending**: unchanged — README, DB schema export for MySQL Workbench,
moderator password rotation, demo data curation, deployment, and the demo
video.

---

### Post-Step-16 fix — collapsible root comment form's collapse animation
was janky (done)

**Diagnosed before touching anything.** Read Step 16's own implementation
fresh rather than assuming which of the three suspected causes was at
fault — turned out to be two of them at once, not one:

1. **The collapsed prompt and the expanded form were two entirely different
   JSX branches returned conditionally** (`if (!expanded) return <Card>…
   </Card>; return <div>…<CommentForm/></div>;`). Expanding *unmounted* the
   prompt bar and *mounted* a brand-new form div in the same render — an
   instant, un-animatable content swap with nothing shared between the two
   states for the browser to interpolate. This is why "the container may be
   animating" while "the text inside jumps": the newly-mounted form div did
   play its own entrance animation, but the prompt text it replaced had
   already vanished in the same frame, with no crossfade between them.
2. **`max-height` was animated via `@keyframes` to a fixed, guessed ceiling
   (800px)**, not `height: auto` directly (so not quite the classic
   `height: auto` trap as originally suspected) — but the same family of
   problem: once the real content's height passes whatever ceiling is
   picked, the box's visible height plateaus early while the timeline
   keeps running, and if the real content is *shorter* than the ceiling
   (measured at 692px for this form — see below) the animation still walks
   `max-height` all the way to 800px, doing nothing visible for the last
   stretch while `opacity`/`transform` finish on their own schedule —
   exactly hypothesis (c), a desync between the container's size and the
   content's own fade, just caused by (b)'s ceiling rather than a literal
   `auto` transition.

**Root cause of *why* Step 16 ended up here**: it explicitly copied
`CommentThreadNode`'s inline-reply-form animation (`.replyForm`/
`.replyClosing`, fixed-`max-height` keyframes + a `setTimeout`-deferred
unmount) for "consistency." That pattern was the wrong one to copy for
*this* UI: a reply form has only one visual state (present or absent) with
nothing else taking its place, so the swap-based approach never had a
second, competing piece of content to jump against. The collapsed root form
needed the *other* animation pattern already in the same codebase —
`CommentThread.module.scss`'s `.replies`/`.collapsed`
(`grid-template-rows: 1fr` ↔ `0fr` on an always-mounted element, no mount/
unmount at all) — which exists specifically because it doesn't need a
guessed ceiling and has real content to transition the whole time.

**Fix**: rewrote `CollapsibleCommentForm` around that exact pattern instead.
Both the prompt row and the form row are now **always mounted**, each its
own single-row CSS Grid container transitioning `grid-template-rows`
between `1fr` (its real content height) and `0fr` (fully clipped via
`overflow: hidden` on a `.rowInner` child, mirroring `.repliesInner`'s
`overflow: hidden; min-height: 0`) — the two rows animate in opposite
directions at once, so the transition reads as one continuous resize
instead of a content replacement. No `@keyframes`, no fixed height guess,
no JS timer, no mount/unmount — `CommentForm` itself never unmounts now,
`expanded` is the only state `CollapsibleCommentForm` still owns.

**Side effects of the fix, not new requirements — flagged rather than
silently accepted**:
- A typed-but-uncollapsed draft now survives a collapse/re-expand (it's
  only ever visually clipped, never torn down). Arguably better UX than
  Step 16's original "Cancel discards" framing, not worse — but a real
  behavior change worth naming.
- The CAPTCHA is fetched once on first mount instead of on every expand
  (previously, unmounting/remounting `CommentForm` on every collapse↔expand
  cycle re-ran its `no-cache` `captchaChallenge` query each time) — an
  incidental efficiency win, confirmed by observing exactly one
  `captchaChallenge` network request across an expand → cancel → expand →
  post cycle in this session's manual verification.

**Verified manually** (full `docker compose up -d --build` stack — rebuilt
the frontend image — desktop 1280px + 375px mobile):
- Confirmed the mechanism directly before trusting it visually: read
  computed `grid-template-rows` and `getBoundingClientRect().height` on
  both rows at rest — prompt row `46px`/`46px` (collapsed default), form
  row `0px`/`0px`, while the actual `CommentForm` `Card` underneath
  measured its real **692px** — proving the technique clips to true content
  height with no ceiling guessing, unlike the fixed-800px approach it
  replaced.
- Sampled row heights every 30ms through a full expand: prompt
  `46→0`, form `0→692`, a smooth monotonic ease-out curve settling exactly
  at 692px with no plateau or overshoot. Repeated for collapse (the exact
  reverse curve) — equally smooth.
- Full functional flow still works: expanded, filled in a real comment
  (CAPTCHA answer read from Redis, same method as every prior session),
  posted successfully, and the form auto-collapsed afterward (`animfix`
  appeared in the table; form row back to 0px, prompt row back to 46px).
- Repeated at 375px mobile — same behavior, no horizontal overflow
  (`scrollWidth === clientWidth`).
- Zero console errors throughout every step above. `tsc --noEmit` and
  `eslint` both clean.

**Pending**: unchanged — README, DB schema export for MySQL Workbench,
moderator password rotation, demo data curation, deployment, and the demo
video.

---

### Step 17 — targeted Apollo cache update for live root-comment insertion,
replacing the full `rootComments` refetch (done)

**Reported from two-tab manual testing**: a `commentCreated` broadcast
triggered `client.refetchQueries({ include: ["RootComments"] })`, which
replaces the whole `rootComments` field wholesale — every row in the table
re-renders, not just the new one, visibly flickering against the 56+-seed
dataset. Scoped tightly per the task: only root-comment creates on
`rootComments` got the optimization; `commentHidden` and reply creates
(`CommentThread` + the `repliesCount` bump on `RootComments`) are untouched,
still refetch-based, exactly as before.

**Design** (`RealtimeConnection.tsx`, new `handleRootCommentCreated`):
- Only the currently-*active* `RootComments` observable query(ies) are
  touched, via `client.getObservableQueries("active")` — nothing needs doing
  for a page nobody's watching.
- **Only the default LIFO view (page 1, `sortBy: CREATED_AT`,
  `sortOrder: DESC`) gets a real cache write.** Every other active
  page/sort combination is refetched instead via `ObservableQuery.refetch()`
  — scoped to that one query, not a broad `refetchQueries` by name — per the
  task's own explicit permission to skip client-side positioning logic for
  sort modes where "where does a new comment go" isn't a one-line answer
  (a later page, or username/email order). This was a deliberate choice, not
  a limitation discovered after the fact: reimplementing the backend's
  sort/pagination server-side logic in the client for every mode wasn't
  worth it for what the two-tab report was actually about.
- For the LIFO-default case: `client.cache.updateQuery` reads the exact
  cached `{ page: 1, sortBy: CREATED_AT, sortOrder: DESC }` result, prepends
  the new comment (built from the broadcast's `CommentModel` payload, with
  `__typename: "CommentModel"`/`"AuthorModel"` added by hand — the socket
  payload is raw JSON, not a GraphQL response, so it has none), truncates
  back to `ROOT_COMMENTS_PER_PAGE` (25, hand-mirrored from the backend
  constant, same pattern as `lib/validation.ts`) if the page was already
  full, and bumps `totalCount`/recomputes `totalPages` to match what a real
  refetch would return.
- **Dedup by id**, explicitly required by the task and genuinely necessary
  under this design (unlike the old refetch-based approach, whose "two
  refetches just each overwrite the field with the same result" argument no
  longer applies once the create path does a targeted array *mutation*
  rather than a wholesale *replacement*): the poster's own tab always has
  two independent triggers for the same new comment — `CommentForm`'s own
  `refetchQueries: ["RootComments"]` on mutation success, and this socket
  handler receiving the broadcast of that same comment — arriving in either
  order. `updateQuery`'s callback checks `items.some(item => item.id ===
  comment.id)` and no-ops if already present, so whichever of the two lands
  second is always a safe no-op regardless of race order.

**A real bug found and fixed during verification, not anticipated up
front**: the first cut matched the target observable via
`observable.query !== RootCommentsDocument`, which never matched anything —
confirmed against the installed Apollo Client's own compiled source that
`ObservableQuery.query` returns `this.lastQuery`, assigned from an internal
`transformDocument` call (e.g. `addTypenameToDocument`), never the raw
document passed to `useQuery`. Fixed by matching on `observable.queryName`
(derived from the GraphQL operation's own `name.value`, stable across that
transform) instead — the same thing `refetchQueries({ include: [...] })`
already matches by internally, so this is the idiomatically-correct way to
identify a query, not a workaround.

**Verified manually** (full `docker compose up -d --build` stack — rebuilt
the frontend image after each fix — two real browser tabs, tab B parked on
the default date-descending view of a 63+-seed-comment table):
- **DOM-identity check, not just visual inspection**: tagged all 25 of tab
  B's existing rows with a unique random `data-stable-marker` attribute
  before posting from tab A. After the broadcast landed, **24 of the 25
  original markers were still present on the exact same row elements**,
  each shifted down by exactly one position with unchanged content — proof
  React reused the same DOM nodes rather than re-rendering them, not just an
  absence of visible flicker. The one row that lost its marker was the
  25th/oldest, correctly dropped off the now-26-item page. The new top row
  (the just-posted comment) correctly had no marker — a genuinely new node,
  as expected.
- **Dedup, both sides**: after tab A posted, tab A's own table showed
  exactly one row for that comment (its own `refetchQueries` and the
  socket's cache write both fired, no duplicate); tab B (socket-only, no
  local mutation) also showed exactly one row.
- **Counts**: `totalCount`/`Page X of Y` updated correctly after two
  consecutive live inserts (63 → 64 → 65, `Page 1 of 3` throughout, matching
  `ceil(65/25)`).
- **Pagination/sorting unaffected**: clicking Next (page 2) and clicking the
  Username column header (switching sort + resetting to page 1) each still
  triggered a normal fresh network request and rendered correctly — the
  live-update path only changes what happens on a socket event, not the
  table's own query behavior.
- **Non-default-sort fallback path**: with tab B sorted by Username
  ascending, posting from tab A produced exactly one new GraphQL request in
  tab B (confirmed by request count going from 4 → 5) — the
  `ObservableQuery.refetch()` fallback firing as designed, scoped to that
  one active query rather than a broad refetch-by-name.
- Zero console errors throughout every step above. `tsc --noEmit` and
  `eslint` both clean.

**Pending**: unchanged — README, DB schema export for MySQL Workbench,
moderator password rotation, demo data curation, deployment, and the demo
video.

---

### Step 18 — targeted Apollo cache update for live reply-count updates,
replacing the full `rootComments`/`CommentThread` refetch (done)

**Reported precisely, with an exact success criterion**: if tab A has a
thread *collapsed* and a reply is posted to a comment inside it from tab B,
the only thing that should change in tab A's DOM is the `repliesCount`
number on that root's row — nothing else should re-render or repaint.

**No React DevTools Profiler or Chrome Paint-Flashing UI is available in
this headless-Playwright-automation context** (both are interactive
DevTools panels). Used a `MutationObserver` attached to `document.body`
(`childList`/`attributes`/`characterData`, with old-value tracking) as a
scriptable, ground-truth substitute — it records exactly which DOM nodes
were touched and how, which is what Profiler/Paint-Flashing would show
visually. Every row was also tagged with a unique random
`data-stable-marker` attribute before each trigger, so "did this exact DOM
node survive" is a fact, not an inference from re-render count.

**Root cause, confirmed via the observer, not assumed**: `RootCommentsTable`
runs its `useQuery` with `notifyOnNetworkStatusChange: true`. Both
`CommentForm`'s own post-submit `refetchQueries` and
`RealtimeConnection`'s socket handler called a full
`client.refetchQueries({ include: ["RootComments", ...] })` for *every*
`commentCreated`/`commentHidden` event, reply or root. A full refetch flips
`loading` back to `true` mid-flight (that's what
`notifyOnNetworkStatusChange` is for), and `RootCommentsTable` renders
`SKELETON_ROWS` (5) placeholder `<tr>`s while `loading` is true, then swaps
back to the 25 real rows once the refetch resolves. Measured directly: this
produced 195 mutation records (30 `<tr>` removed + 30 added, both sets
containing `Skeleton`-classed elements, confirming the whole table swapped
element *types* — real rows to skeletons and back) and **0 of 25** tagged
markers survived. This is not a memoization problem — swapping element types
under a `loading`-gated conditional discards and recreates the DOM
regardless of whether the row component is `memo`'d, since React can't
reconcile a `<Skeleton>` against a previous `<tr>` with real content.

**Fix** (`RealtimeConnection.tsx`, the primary fix):
- New `bumpRepliesCount(client, parentId, delta)` — a `cache.modify` write
  targeting exactly one normalized `CommentModel` entity's `repliesCount`
  field, a relative `existing + delta` adjustment.
- New `handleReplyCommentEvent(client, delta, parentId)` — calls
  `bumpRepliesCount` and then `client.refetchQueries({ include:
  ["CommentThread"] })` only (never `"RootComments"`) — an open thread still
  needs the new/removed reply itself, but the root table's count comes from
  the targeted cache write, not a refetch.
- `commentCreated`/`commentHidden` handlers now branch on `parentId`: `null`
  → the existing Step 17 root-insert/root-remove cache logic; non-null →
  `handleReplyCommentEvent` with `delta: +1`/`-1` respectively.

**Why a relative delta needed the redundant refetches removed, not just
added-to** (the insert case's "two triggers just overwrite the same value
twice" argument from Step 17 does *not* extend to a relative adjustment):
`CommentForm`'s own `refetchQueries` and this socket handler are two
independent triggers for the poster's own reply. An idempotent write
(insert-if-id-absent, remove-if-id-present) is safe under either firing
order or both firing. A `+1`/`-1` delta is not — if both a refetch (which
reads the server's already-correct count) and a `cache.modify` delta fire
for the same event, the count double-applies. So the redundant
`"RootComments"` refetches were removed at their source instead of adding
dedup logic on top:
- `CommentForm.tsx`: `refetchQueries: parentId ? ["RootComments",
  "CommentThread"] : ["RootComments"]` → `parentId ? ["CommentThread"] :
  ["RootComments"]` — a reply's own poster no longer refetches the table;
  `RealtimeConnection`'s socket handler (which fires for the poster's own
  post too, same as every other client) is now the *only* code path that
  ever touches a root's `repliesCount`.
- `CommentThreadNode.tsx`'s `handleHide`: unconditional `refetchQueries:
  ["RootComments", "CommentThread"]` → `node.parentId ? ["CommentThread"] :
  ["RootComments", "CommentThread"]` — hiding a reply no longer refetches
  the table either, for the same reason.

**Defense-in-depth, explicitly requested regardless of primary root cause**:
`RootCommentsTable.tsx` extracts row rendering into a `React.memo`-wrapped
`RootCommentRow`, with `toggleExpanded` wrapped in `useCallback` so it stays
a stable prop reference. This doesn't fix the skeleton-swap bug above (a
type swap defeats `memo` regardless), but it's a correct, low-cost guard
against a *different*, real risk: if some future change makes the cache
write recreate the `items` array (Apollo's normalized cache already keeps
unaffected entity references stable, so this doesn't happen today),
unaffected rows still won't re-render without it.

**Verified — the exact success criterion, with before/after evidence**
(full `docker compose up -d --build` stack, two real tabs, a thread
collapsed in tab A, all 25 rows tagged with a fresh `data-stable-marker`
before each trigger):
- **Before the fix** (reply posted from tab B to a comment inside tab A's
  collapsed thread): 195 mutation records, dominated by 30 `<tr>` removed +
  30 added (skeleton swap both ways); **0 of 25** markers survived.
- **After the fix**, same exact scenario: **1** mutation record — a single
  `characterData` change on the affected row's own `repliesCount` `<td>`
  text node (`oldValue` the old count) — and **25 of 25** markers survived
  on their original DOM nodes. This is the literal success criterion the
  task specified, confirmed by instrumentation rather than visual
  impression.
- **Re-confirmed the poster's own tab** (the reply's own author, not just a
  passive second tab): exactly one increment, no double-count, from the two
  triggers (own `refetchQueries` + own socket echo) now being disjoint
  (`CommentThread` vs. the cache-modify) instead of both touching
  `repliesCount`.
- **Re-confirmed reply-hide** (same collapsed-thread scenario, moderator
  hides a reply via `hideComment`): **1** mutation (`characterData`,
  `repliesCount` decrementing), **25 of 25** markers survived — the hide
  path shares `handleReplyCommentEvent` with `delta: -1`, and the evidence
  confirms it behaves identically to the create case.
- **Re-confirmed root-comment insert** (Step 17's case, unchanged by this
  fix — `handleRootCommentCreated` was not touched): a new root comment
  posted from tab B appeared correctly at the top of tab A's table via the
  socket event. 4 mutations total — 1 `<tr>` removed (the 25th/oldest row
  correctly falling off the page), 1 `<tr>` added (the new row), 1
  `characterData` change (the total-count text), and 1 avatar `<img>`
  `src` attribute change on an otherwise-unaffected row (isolated to that
  one node; not investigated further since it neither reproduces a
  full-table re-render nor regresses anything this session touched —
  flagged below as a minor open item rather than silently dropped). 24 of
  25 markers survived (the 25th correctly dropped, matching Step 17's own
  prior measurement).
- **Re-confirmed root-comment hide**: hiding a root comment removed exactly
  that row (1 `childList` removal) and updated the total-count text (1
  `characterData` change) — 2 mutations total, **24 of 24** remaining
  rows' markers survived untouched. Some reflow here is inherently correct
  (a row disappearing shifts the rows below it up one visual position) —
  the evidence confirms that shift cost zero DOM-node re-creation, not zero
  layout change.
- An earlier verification attempt for the root-insert case produced an
  ambiguous, seemingly-failed result (the new comment didn't appear in tab
  A, and a CAPTCHA error was visible in tab B's form) — traced to a wrong
  CAPTCHA answer being submitted (a test-setup mistake: the answer was read
  from Redis for a stale token), not a regression. Re-run with a freshly
  fetched CAPTCHA token/answer pair succeeded cleanly, confirmed above. Also
  hit, and diagnosed, a `MutationObserver` self-pollution artifact during
  this same verification pass: setting `data-stable-marker` on all rows and
  clearing `window.__mut.length = 0` in the *same* synchronous script
  produced spurious `attributes` mutations, because the observer's callback
  is asynchronous (microtask-queued) and fired *after* the clear, recording
  the marker-set itself into the just-emptied array. Fixed the test
  methodology (flush `__mut` in a separate round-trip after any marker
  reset, before triggering the real event) rather than the (nonexistent)
  app bug this looked like at first.
- Zero console errors throughout. `tsc --noEmit` / `next build` / `eslint`
  all clean (frontend rebuilt via Docker after every source change, per the
  no-source-mount setup).

**Deviation from the user's suggested commit message**: the user's example,
"perf: memoize table rows to prevent unrelated re-renders on repliesCount
cache updates," names the defense-in-depth memoization as if it were the
fix. The measured root cause was the `notifyOnNetworkStatusChange`-driven
skeleton swap from a full refetch, not a missing-memoization re-render —
`memo` alone cannot prevent a `loading`-gated element-type swap. The actual
commit message reflects the cache-modify fix as primary, per the user's own
explicit instruction to adjust it once the real cause was confirmed.

**Pending — one minor open item, not investigated further this session**:
the single avatar `<img src>` mutation observed on an unaffected row during
root-comment-insert re-verification. It didn't reproduce a full-table
re-render and every other measurement (24/25 markers, no `Skeleton`
elements, no console errors) confirms the insert path stayed correct, but
its cause (why one existing row's `Avatar` recomputed its `src` when neither
its `username` nor `email` seed changed) wasn't root-caused — flagged here
rather than silently ignored, in case it recurs somewhere more visible.

**Pending — unchanged otherwise**: README, DB schema export for MySQL
Workbench, moderator password rotation, demo data curation, deployment, and
the demo video.

---

### Step 19 — README.md and MySQL Workbench DB schema export (done)

Pure delivery/documentation work — no application code changed. Closes two
of the brief's "Delivery format" items.

**`README.md` (project root)** — comprehensive, organized for a reviewer
opening the repo cold: what the project is, a feature overview mapped
directly onto the brief's own tiers (base requirements / Junior+ / Middle /
beyond-brief polish) so a reviewer can check requirements off against
implementation, the actual tech stack (cross-checked against this Progress
log for real deviations — base64 attachment upload instead of multipart,
SCSS Modules instead of Tailwind, no shared npm workspace, SSR opted out of
— rather than restating the original plan), an architecture overview
(monorepo layout, the Author/Comment/Attachment/Moderator domain model, and
short "why RabbitMQ" / "why WebSocket" explanations pulled from this log's
own reasoning), complete from-scratch setup instructions
(`docker compose up -d --build`, env var setup for both `backend/.env` and
`frontend/.env`, verification URLs, stop/reset commands), test commands with
current pass counts (86/86 unit, 56/56 e2e — last recorded in Step 10; no
backend changes since), moderator access (seed script, not a hardcoded
password), a "known limitations / deliberate scope decisions" section (no
voting, comments immutable, the 30-level `commentThread` fetch depth with
its honest past-the-cap notice, "Continue this thread" re-rooting, seed-only
moderator accounts), and clearly marked `TODO` placeholders for the live
deployment URL and demo video link — no invented URLs.

**`docs/db-schema-mysql-workbench.sql`** — the brief requires "a database
schema file, openable in MySQL Workbench," but this project's runtime
database is PostgreSQL (a deliberate choice — `commentThread`'s recursive
CTE, documented in the Domain model / README sections). Rather than leaving
that ambiguous, hand-translated the full `schema.prisma` (all four tables —
`authors`, `comments`, `attachments`, `moderators` — every column, index,
unique constraint, and foreign key, including the self-referencing
`comments.parentId → comments.id` cascade) into MySQL 8-syntax DDL, with a
header comment explaining explicitly that this file is for schema
review/visualization only, is not runtime-connected, and will not
auto-sync with future `schema.prisma` changes. Translation notes recorded
inline: `String @id @default(uuid())` → `CHAR(36) DEFAULT (UUID())`,
`Boolean @default(false)` → `TINYINT(1) DEFAULT 0`, `DateTime @default(now())`
→ `DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)`, the `AttachmentType` enum →
a native MySQL `ENUM('IMAGE','TEXT')`. CAPTCHA is correctly absent here too
(Redis-only, no table in either database).

**Verified, not just written** — actually ran the DDL against a real MySQL
server rather than eyeballing syntax: spun up a throwaway `mysql:8.0` Docker
container, copied the file in, and ran it with `mysql ... -e "source
schema.sql"` — **clean exit, zero errors**. Then went further than syntax
validity: inserted a real author/root-comment/reply/attachment row set and
confirmed `DELETE` on the root comment correctly **cascades** to both its
reply and its attachment (mirroring Prisma's `onDelete: Cascade` on
`Comment.parent` and the attachment relation) — `remaining_comments: 0`,
`remaining_attachments: 0` after the delete. Also confirmed all three
foreign keys exist with the right referenced table/column
(`attachments.commentId → comments.id`, `comments.authorId → authors.id`,
`comments.parentId → comments.id`) via `information_schema.KEY_COLUMN_USAGE`,
and that an em-dash in a table comment round-trips correctly under
`utf8mb4` (an earlier check without `--default-character-set=utf8mb4` on
the client showed mojibake — confirmed via a second query with the correct
client flag that this was a display-only artifact, not a real encoding bug
in the stored data). Container removed after validation — nothing left
behind.

**README cross-reference**: the "Database schema" section explains the
Postgres-vs-MySQL split so a reviewer isn't left wondering why two schema
representations exist, and points at this file's exact path and how to open
it in Workbench (Reverse Engineer MySQL Create Script, or plain
File → Open SQL Script).

**Deviations**: none — both deliverables were scoped exactly as asked.

**Pending — updated**: moderator password rotation before deploy, demo data
curation, deployment, and the demo video. README and the MySQL Workbench
schema export are done.

---

### Step 20 — backend deployed to comments-api.dedstream.in.ua (done)

Backend-only production deployment, on the same VPS that already hosts
DedStream (`server0890.server-vps.com`, `194.28.84.180`), to a brand-new
isolated subdomain — DedStream's own containers, Nginx config, and SSL
certificate were never modified. The frontend is deployed separately to
Vercel (not part of this step) and will point at
`https://comments-api.dedstream.in.ua/graphql` once live.

**DedStream stopped for the review period — restore procedure (read this
first if you're bringing DedStream back)**

At the user's explicit request, DedStream's 3 containers were stopped
(`docker stop`, never `docker rm`) so this deployment's build/compile work
had the VPS's limited RAM to itself. They are **not running** as of this
entry. Restore with:

```
docker start postgres redis dedstream-app
```

(exact container IDs, in case names ever collide: `postgres` =
`0b372e110bf5`, `redis` = `6c0b21dae807`, `dedstream-app` = `2226d82d91b8`.
`docker start <id>` works identically to `docker start <name>`.)

**Important — DedStream's `restart: always` policy means it comes back on
its own after any VPS reboot**, even though it was manually stopped first;
this bit us twice during this session (see below) — both times the fix was
just re-running the `docker stop` above. If DedStream is meant to stay down
across a reboot, its compose file's restart policy would need changing to
`unless-stopped` (`no` semantics on manual stop) — not done here, since the
brief only asked for a temporary pause, not a policy change to a project
outside this one's scope.

**Reconnaissance (read-only, before touching anything)**: confirmed
`comments-api.dedstream.in.ua` resolves to `194.28.84.180` via `dig` from
the server itself; confirmed DedStream's containers publish host ports 4000
(app), 5432 (postgres), 6379 (redis) — all of which the committed
`docker-compose.yml` also wants, so a deploy-specific override was needed
(see below); found free candidate ports (4001, 4002, 4010, 8080); read
`/etc/nginx/sites-available/dedstream` to match its exact certbot-managed
vhost style; confirmed only `docker-compose` v1.29.2 (no v2 plugin) is
installed.

**Swap file added** — this VPS has **969Mi RAM and, before this step, zero
swap**. A `docker-compose.prod.yml` sharp-from-source compile (see below)
needs headroom a sub-1GB box doesn't have on its own.
`fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile &&
swapon /swapfile`, persisted via `/etc/fstab` (`/swapfile none swap sw 0
0`) so it survives a reboot. Left in place — not removed after the
deploy — since the underlying constraint (a <1GB VPS) doesn't go away once
the container is built; a future rebuild of this image directly on the VPS
would need it again. Revisit only if disk space ever gets tight (2G on a
25G disk, currently ~30% used).

**Deploy-specific compose setup (not committed — gitignored)**:
- `/opt/dedcomments/.env` — root-level dotenv, **only** for
  `docker-compose`'s own `${VAR}` substitution (distinct from
  `backend/.env`, which only affects the container's runtime environment
  via `env_file:`) — `POSTGRES_USER/PASSWORD/DB` and
  `RABBITMQ_DEFAULT_USER/PASS`, mirroring `backend/.env`'s values exactly.
  Necessary because `docker-compose.yml`'s `DATABASE_URL`/`RABBITMQ_URL`
  overrides interpolate these via `${POSTGRES_PASSWORD:-comments}`-style
  compose-file-level substitution, which reads a root dotenv or the shell
  environment — **not** `backend/.env` — a real gotcha that would otherwise
  silently connect the backend to Postgres with the wrong (default)
  password.
- `backend/.env` — production values from `.env.example`: freshly
  generated `JWT_SECRET` (32-byte hex), `POSTGRES_PASSWORD`/
  `RABBITMQ_DEFAULT_PASS` (16-byte hex each, matching the root `.env`
  above), `NODE_ENV=production`, and **`ALLOWED_ORIGIN=*`** — deliberately
  temporary (see "Pending" below), and a freshly generated
  `MODERATOR_PASSWORD` (given to the user separately, never committed —
  see chat, not this file).
- `docker-compose.prod.yml` — a **standalone** file, not a
  `docker-compose.override.yml` merged with the base file. First attempt
  used an override setting `ports: []` on postgres/redis/rabbitmq and a
  rebound `ports:` on backend — `docker-compose config` revealed this old
  `docker-compose` (v1.29.2) **merges/concatenates** list-type keys like
  `ports:` across `-f` files rather than replacing them, so the override
  silently added ports instead of removing the base file's. A standalone
  file sidesteps the merge behavior entirely. It: drops `ports:` from
  `postgres`/`redis`/`rabbitmq` entirely (the backend reaches them over the
  compose-internal `comments` network by service name, which is all it
  ever needed — nothing forced them onto the host in the first place, this
  deploy just doesn't opt into it), binds `backend` to
  `127.0.0.1:4001:4000` (not `0.0.0.0:4000`, which DedStream already
  holds, and not exposed publicly — Nginx is the only public entry point),
  and omits the `frontend` service entirely (deployed separately to
  Vercel).

**Repo cloned to `/opt/dedcomments`** (matching DedStream's own
`/opt/dedstream` convention) via HTTPS (`git clone
https://github.com/maloded/dedcomments.git` — the SSH clone failed, no
deploy key configured on this VPS for a public repo that doesn't need one).

**The sharp/CPU-microarchitecture bug — the actual bulk of this step's
time** (full technical detail in the `fix:` commit alongside this entry,
`backend/Dockerfile`): the first `docker-compose up -d --build` produced a
container that crash-looped instantly with `TypeError: Cannot read
properties of undefined (reading 'endsWith')` inside
`sharp/dist/sharp.cjs`. Root-caused through several layers:
1. This VPS's CPU (`QEMU Virtual CPU version 2.5+`, confirmed via
   `/proc/cpuinfo` missing `sse4_1`/`sse4_2`/`ssse3`/`popcnt`) doesn't meet
   the x86-64-v2 microarchitecture level sharp's prebuilt
   linux-x64/linuxmusl-x64 binaries require (`sharp._isUsingX64V2()`
   returns `false`). Sharp's own WASM fallback then also failed (`Wasm
   SIMD unsupported`), and *that* failure's error object has no `.code`
   property — tripping a real bug in sharp's own error-formatting code
   (`err.code.endsWith(...)` with no optional chaining) that turned a
   legitimate "no compatible binary" situation into the confusing crash
   above.
2. **First fix attempt — `npm_config_build_from_source=true` — did
   nothing**: sharp >= 0.33 dropped its custom install/postinstall
   lifecycle script entirely in favour of pure `optionalDependencies`
   platform-package resolution; there's no install-time hook left to check
   that env var. The actual from-source path is `sharp/install/build.js`,
   an opt-in script wired into no npm lifecycle at all — has to be invoked
   explicitly, and needs `node-gyp`/`node-addon-api` present (sharp
   deliberately doesn't bundle them, per that script's own error
   messages).
3. Getting that script to actually work took several rounds, now baked
   into `backend/Dockerfile`'s builder stage: `node-gyp`'s CLI needs
   `node_modules/.bin` on `PATH` (its require-resolution alone isn't
   enough); `install/build.js` must be run with `cwd` = `node_modules/sharp`
   (its internal `--directory=src` is relative to that, not the app's own
   `/app`); the compile then failed on a missing `glib-object.h` (needs
   `glib-dev`, not just `vips-dev`) and then on `libvips version 8.18.6+
   is required` — Alpine 3.23's stable `vips-dev` is only 8.17.3, so
   `vips-dev`/`vips`/`vips-cpp` are all pinned to Alpine's **edge** repo
   via a `@edge` repository alias (cherry-picking just these packages from
   edge, not switching the whole image, which caused real
   `openssl-dev`/`libcrypto3` conflicts when tried).
4. A last, sneaky bug: after fixing all of the above, `require('sharp')`
   appeared to work **locally** (`sharp.versions.vips: "8.18.6"`) but the
   exact same image still crashed on the VPS. Root cause: the runtime
   stage only installed the apk `vips` package, which ships just the plain
   C API (`libvips.so`) — the C++ bindings sharp actually links against
   live in a **separate** `vips-cpp` package. Locally, sharp's `require()`
   silently fell through to the bundled `@img/sharp-linuxmusl-x64`
   prebuilt binary (which works fine on a modern CPU) when the from-source
   build's `libvips-cpp.so.42` was missing — masking the bug entirely.
   Confirmed via `ldd` directly on the compiled `.node` file (not just
   `require('sharp')`, which can silently mask a broken global-libvips
   build by falling back to the bundled one) that all symbols resolve
   cleanly only once `vips-cpp` was added to the runtime stage too, and
   that `sharp.versions` then reports **only** `{vips, sharp}` (not the
   full bundled sub-library list) — the tell that global-libvips mode is
   genuinely active, not a masked fallback.

**This VPS's Docker build engine itself hangs on long `RUN` steps —
building the image directly on the VPS was abandoned, not fixed**: even
with the swap file in place (memory stayed healthy throughout, confirmed
via `dmesg`, zero OOM-kills), two separate `docker-compose build --no-cache
backend` attempts on the VPS **hung indefinitely** — an intermediate
build-step container would cleanly exit, then spontaneously flip to a
`Dead` status, with the outer `docker build` process left sitting at 0%
CPU forever. Reproduced twice, at two different steps (`npm ci` once,
`COPY . .` the other time) — not tied to any specific step's content or
duration, pointing at a Docker/containerd-level bug in this host's old
Docker (v29.1.3 daemon + `docker-compose` v1.29.2), not a resource issue.
**Workaround**: build the image on the dev machine instead (same `x86_64`
architecture) — `docker build`, `docker save | gzip`, `scp` the ~187 MB
tarball, `docker load` on the VPS. Confirmed working, no further hangs.
Also hit, separately, a `docker-compose` v1.29.2 bug
(`KeyError: 'ContainerConfig'`) when trying to *recreate* a container from
a `docker load`-ed image on top of an existing one — current BuildKit
image metadata is missing a legacy field v1.29.2's Python code expects.
Fixed by `docker rm -f`-ing the old container first so compose does a
fresh `create` instead of a `recreate` (which never hits that code path).

**A second, unnoticed VPS reboot happened mid-session** (`uptime` showed
"up 17 min" partway through — likely the hosting provider's platform,
possibly related to the swap-file change, though never confirmed) — caught
only because DedStream's containers had silently come back via their
`restart: always` policy (see the restore-procedure note above); re-ran
`docker stop postgres redis dedstream-app` once noticed. Unrelated to the
Docker-build-hang issue above (that was reproduced independently, with the
server never losing SSH responsiveness either time).

**Nginx + certbot**: `/etc/nginx/sites-available/comments-api`, styled
identically to `sites-available/dedstream` (same certbot-managed
`server { listen 443 ssl; ... }` + `server { listen 80; return 301
https://...; }` pair, same `proxy_set_header Upgrade`/`Connection
'upgrade'` pair already needed for Socket.IO), proxying to
`127.0.0.1:4001`. `certbot --nginx -d comments-api.dedstream.in.ua`
obtained a **separate** certificate (`/etc/letsencrypt/live/comments-api.dedstream.in.ua/`,
expires 2026-12-05) and auto-rewrote only this one vhost file — confirmed
`api.dedstream.in.ua`'s own certificate and vhost file were never touched
(`certbot certificates` lists both as independent entries).

**Verified — real end-to-end checks, not just "container didn't crash"**:
`docker logs comments_backend` shows a full clean Nest boot (`🚀 Backend
ready at http://localhost:4000/graphql`), stable (no restart-loop);
`captchaChallenge` query works both directly on `127.0.0.1:4001` and
through `https://comments-api.dedstream.in.ua/graphql`; **uploaded a real
640×480 PNG via `uploadAttachment`**, polled `attachment(id)` until
`processedAt` was set (near-instant), then `docker cp`'d the actual file
off the container and ran `file` on it from the VPS host — confirmed
genuine **320×240** output, proving the RabbitMQ resize consumer and the
now-fixed sharp both work for real, not just "the module loaded". `GET
/graphql` with an HTML `Accept` header returns the Apollo Sandbox (200)
both directly and through the new HTTPS domain. `api.dedstream.in.ua`
currently returns `502` — expected and correct, not a regression: its own
backend container is the one intentionally stopped for the review period
(see restore procedure above); the vhost/proxy config itself is untouched
and would work the moment that container is started again.

**Deviations from the original plan (with reasons)** — all covered in
more detail above, summarized: standalone `docker-compose.prod.yml`
instead of an override file (old compose's list-merging behavior);
`docker-compose.prod.yml`/root `.env` are deploy-local and gitignored, not
committed (server topology, not app config); build-locally-and-transfer
instead of building on the VPS (reproducible Docker-engine hang on this
host); `vips-dev`/`vips`/`vips-cpp` pinned to Alpine edge (stable is too
old for sharp's minimum libvips).

**Pending**:
- **`ALLOWED_ORIGIN=*` needs tightening** once the Vercel frontend URL is
  known — currently wide open, fine for pre-launch verification, not for
  real traffic. Update `backend/.env` on the VPS and
  `docker-compose -f docker-compose.prod.yml up -d backend` to pick it up
  (no rebuild needed, it's just an env var).
- **DedStream is stopped** — see the restore procedure at the top of this
  entry. Restart it whenever the review period is over.
- Demo data curation, the demo video, and a final full run-through of the
  README's "from scratch" steps against this live deployment remain from
  the brief's "Delivery format" section.
