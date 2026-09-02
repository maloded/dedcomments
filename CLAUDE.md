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

### CaptchaChallenge
A one-time token: generated when the comment form is opened, verified on submit, then
invalidated.

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

- `rootComments(page, sortBy, sortOrder)` — pagination (25/page) + sorting of top-level
  comments by username/email/date; returns `repliesCount` without nested data
- `commentThread(rootId)` — the full reply tree in one request (recursive CTE in Postgres,
  since Prisma doesn't support recursive relations out of the box)
- `createComment(input)` — validation (username regex `^[a-zA-Z0-9]+$`, email, url,
  CAPTCHA check, HTML sanitization with tag whitelist + XHTML validity check)
- `captchaChallenge` — generates a CAPTCHA token and image
- `uploadAttachment` — file upload; image resizing and size validation handled via the
  RabbitMQ queue
- Moderator mutations (`hideComment`, `banAuthor`) — behind a JWT guard, after the core
  endpoints MVP

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

**Pending — next (step 2): core GraphQL endpoints**
- `rootComments(page, sortBy, sortOrder)` — 25/page, sort by username/email/date, LIFO
  default, returns `repliesCount` without nested data (Redis-cached).
- `commentThread(rootId)` — full subtree in one request (recursive CTE).
- `createComment(input)` — username/email/URL validation, CAPTCHA check, HTML sanitize
  (whitelist + XHTML well-formedness).
- `captchaChallenge` — token + image generation.
- Then wire the real GraphQL models/inputs into the empty module skeletons; add the JWT
  guard in `core/guards/`; drop the placeholder `health` query.
