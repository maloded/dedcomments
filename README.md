# Comments SPA

A single-page "Comments" application — anonymous, tree-structured comment threads in
the spirit of Habr/Disqus, built as a technical test assignment for a **Middle**-level
job application at dZENcode. Users leave comments without registration (identified by
username + email), reply to any comment at unlimited depth, sort/paginate the root-level
table, attach a single image or text file, and preview their formatted comment live
before posting.

See [`CLAUDE.md`](./CLAUDE.md) for the full original brief, architectural decision log,
and a step-by-step build history (every deviation from the original plan is documented
there with its reasoning).

---

## Table of contents

- [Feature overview](#feature-overview)
- [Tech stack](#tech-stack)
- [Architecture overview](#architecture-overview)
- [Running from scratch](#running-from-scratch)
- [Running tests](#running-tests)
- [Moderator access](#moderator-access)
- [Database schema](#database-schema)
- [Known limitations / deliberate scope decisions](#known-limitations--deliberate-scope-decisions)
- [Live deployment / demo video](#live-deployment--demo-video)

---

## Feature overview

Organized by the brief's own tiers, so implementation maps directly onto requirements.

### Base requirements

- **Comment submission form** — Username (Latin letters + digits only), E-mail, optional
  Home page (URL), and a Text body. Only `<a href="" title="">`, `<code>`, `<i>`,
  `<strong>` are allowed in the text; anything else is **rejected** (not silently
  stripped), and malformed/unclosed markup is rejected too (valid-XHTML check).
- **Image CAPTCHA** — generated per form load, one-time, verified server-side, backed by
  Redis (not a database table).
- **Cascading replies of unlimited depth** — any comment can be replied to; the backend
  has no recursion limit at all (a single recursive SQL CTE fetches an entire subtree,
  however deep it goes, in one round-trip).
- **Sortable, paginated root-comment table** — top-level comments only, 25/page, sortable
  by Username / E-mail / Date (both directions), default sort **LIFO** (newest first).
  Replies within an expanded thread are always LIFO regardless of the table's sort order.
- **XSS / SQL-injection protection** — see [Architecture overview](#architecture-overview)
  below for specifics.
- **File attachments** — one optional attachment per comment: an image (JPG/GIF/PNG,
  proportionally resized to fit 320×240 if larger) or a `.txt` file (≤100 KB). Viewed via
  a lightbox effect for images.
- **Live preview** — the comment body renders live, with the same tag whitelist applied,
  as you type — no page reload.
- **Formatting toolbar** — `[i]` `[strong]` `[code]` `[Link]` buttons that wrap the current
  selection or insert at the cursor.

### Junior+ additions (included in Middle scope)

- **Queue** — RabbitMQ, used to resize uploaded images asynchronously (upload returns
  immediately; the frontend polls until the resize completes).
- **Cache** — Redis, caching the paginated root-comments list (short TTL + explicit
  invalidation on every new comment).
- **Events** — the CAPTCHA/attachment/moderation flows are all event-driven internally;
  see also the WebSocket events below.
- **JWT** — protects the Moderator role (login, hide comment, ban author).

### Middle additions (target scope)

- **GraphQL** — the entire API (Apollo Server via NestJS), not REST.
- **RabbitMQ** — see Queue above.
- **Redis** — see Cache above.
- **Cloud deployment** — see [Live deployment / demo video](#live-deployment--demo-video)
  (pending — tracked as a TODO below).

### Beyond-brief polish

Built on top of the required scope, not instead of it:

- **Dark theme** — a full dark palette (not a toggle — the whole app is dark by design),
  modeled on Reddit's dark mode.
- **Identicon avatars** — deterministic, hash-based GitHub-style avatars per author,
  generated client-side with zero network calls.
- **Reddit-style thread connector graphics** — a measured SVG overlay draws the
  spine/elbow lines connecting each reply to its parent's avatar, pixel-accurate even on
  arbitrarily-branching trees (a pure-CSS approach was tried first and proved impossible
  to get exact on a branching, data-driven tree — see CLAUDE.md's connector-line fix
  entries for the full investigation).
- **Motion** — reply/thread-collapse/lightbox/sort animations throughout, all clamped to
  ~1ms under `prefers-reduced-motion: reduce`.
- **WebSocket live updates** — new comments, hides, and bans push to every connected
  client instantly, via **targeted Apollo cache updates** rather than blunt refetches, so
  an unrelated part of the UI never re-renders or flickers when something elsewhere
  changes (see [Architecture overview](#architecture-overview)).
- **"Continue this thread →"** — Reddit-style re-rooting for threads that exceed the
  visual indentation cap, instead of either truncating them or letting indentation run
  off-screen.
- **Collapsible comment form** — the root comment form loads collapsed ("Leave a
  comment…") and expands on click, keeping the page's first impression to just the table.

---

## Tech stack

**Backend:** NestJS (TypeScript) + GraphQL (Apollo Server, code-first) + Prisma ORM +
PostgreSQL
**Cache:** Redis (`ioredis`) — caches the paginated root-comments list
**Queue:** RabbitMQ (`amqplib` / `amqp-connection-manager`) — async image resizing
(`sharp`), consumed in the same process (a monolith, per the brief's own scale target)
**Auth:** JWT (`@nestjs/jwt`, `bcryptjs`) — Moderator role only; anonymous commenters need
no account
**Real-time:** WebSocket (Socket.IO via `@nestjs/platform-socket.io`) — `commentCreated`,
`commentHidden`, `authorBanned` events
**Frontend:** React 19 + Next.js 16 (App Router, client-rendered — this is a SPA, not an
SSR app) + Apollo Client v4 + GraphQL Codegen (typed-document-node) + SCSS Modules
**Infra:** Docker + Docker Compose (postgres, redis, rabbitmq, backend, frontend)

A few deliberate deviations from the original plan worth calling out (full reasoning for
each is in `CLAUDE.md`'s Progress log):

- **Attachment upload is base64-over-GraphQL**, not multipart `graphql-upload` — the
  current `graphql-upload` major is ESM-only and breaks this project's CJS/ts-jest
  toolchain; file size limits here are small enough that the base64 overhead doesn't
  matter.
- **SCSS Modules, not Tailwind** — a deliberate styling choice from the start (see
  CLAUDE.md → "Styling approach"), not a fallback.
- **No shared npm workspace** between `backend/` and `frontend/` — they only ever talk
  over the network (GraphQL); shared types come from GraphQL Codegen against the
  backend's committed `schema.gql`, not package linking.
- **The frontend is `next build` with client-side rendering opted out of SSR**
  (`ssr: false` on the page), since this is a SPA per the brief and doesn't need SSR —
  and SSR would otherwise try to fetch GraphQL from inside the frontend's own Docker
  container, which can't reach the backend container's network namespace.

---

## Architecture overview

### Monorepo layout

```
dedcomments/
├── backend/        # NestJS + Prisma + GraphQL API
│   ├── src/
│   │   ├── core/      # cross-cutting infra: config, GraphQL, Prisma, guards, filters
│   │   ├── shared/    # feature-agnostic constants/DTOs (validation rules, page size, …)
│   │   └── modules/   # one folder per feature: auth, authors, comments, attachments,
│   │                   captcha, sanitizer, cache, gateway
│   └── prisma/        # schema.prisma + migrations
├── frontend/        # Next.js SPA
│   └── src/
│       ├── components/   # comment-domain components (CommentForm, CommentThread, …)
│       ├── shared/       # UI primitives (Button, Card, Avatar, Lightbox, Skeleton, …)
│       └── graphql/      # operations + Codegen-generated typed documents
├── docs/            # DB schema export, reference screenshots
├── docker-compose.yml
└── CLAUDE.md        # full brief + architectural decision log
```

Backend and frontend are two independently deployable services that only communicate
over the GraphQL API — there's no shared build step or npm workspace between them.

### Domain model

- **Author** — an anonymous identity, keyed by `(username, email)`. Not an account with
  a password; the same person commenting again reuses their existing `Author` row (found
  via upsert) so the root table can sort/aggregate by author correctly.
- **Comment** — the core entity. Immutable after creation. Either a root comment
  (`parentId = null`) or a reply (`parentId` pointing at any other comment) — a
  self-referencing tree of unlimited depth.
- **Attachment** — an optional single attachment (image or text file) on a comment,
  uploaded independently and then linked at comment-creation time.
- **Moderator** — a separate, real-login entity (JWT-protected) with no equivalent in the
  brief's base domain, added specifically to give JWT a meaningful use in this domain:
  hiding comments and banning authors.

### Why RabbitMQ

Image resizing is CPU-bound and doesn't need to block the HTTP response the user is
waiting on. `uploadAttachment` returns as soon as the file is validated and saved,
publishes a resize job to RabbitMQ, and a consumer (in the same process, since this is a
monolith at this scale) resizes the image asynchronously and stamps `processedAt` when
done. The frontend polls the attachment by id until that flips, showing a "processing"
skeleton in the meantime. This also lays groundwork the brief explicitly asks for without
requiring it — a queue is the natural place to add backpressure or a dedicated worker
process if load ever demanded it, without changing the request-handling code path.

### Why WebSocket

Comments are a naturally multi-viewer, real-time medium — a page loaded a while ago
should reflect an unrelated visitor's new comment/reply without the current user
refreshing. A `commentCreated`/`commentHidden`/`authorBanned` broadcast over Socket.IO
covers this. The interesting engineering constraint here wasn't adding the socket (that
part is simple) but keeping a live push from causing UI churn: an early version refetched
the whole root-comments table on every event, which briefly swapped every row to a
loading skeleton and back — visible, and pointless, for viewers whose part of the page
wasn't affected by the event. This was replaced with targeted Apollo cache writes
(`cache.modify` for a relative `repliesCount` delta, `cache.updateQuery` for inserting or
removing a root row) so a reply's live update to a collapsed thread now touches exactly
one DOM text node system-wide, confirmed via `MutationObserver`-based DOM-mutation
tracking during development (see CLAUDE.md's Step 17/18 entries for the full
measurement).

### XSS / SQL-injection protection

- **XSS**: comment text goes through a whitelist sanitizer (`htmlparser2` +
  `sanitize-html`) that only allows `<a href="" title="">`, `<code>`, `<i>`, `<strong>`,
  checks tags are explicitly closed (valid XHTML), and **rejects** anything else outright
  — a `<script>` tag, an `onerror` handler, or a `javascript:`/`data:` href fails the
  request rather than being silently stripped.
- **SQL injection**: Prisma's query builder is parameterized everywhere by default; the
  one raw SQL query (`commentThread`'s recursive CTE, needed because Prisma has no
  built-in recursive-query support) uses Prisma's tagged-template `$queryRaw`, which
  parameterizes automatically — an injection payload passed as `rootId` just fails to
  match any row and returns a clean 404, confirmed against several injection payloads in
  the e2e suite.

---

## Running from scratch

### Prerequisites

- Docker and Docker Compose (v2 CLI, i.e. `docker compose`, not the standalone
  `docker-compose`)
- Nothing else needs to be installed on the host — Node, Postgres, Redis, and RabbitMQ
  all run inside containers.

### 1. Clone and configure environment

```bash
git clone <this-repository-url>
cd dedcomments

cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

`backend/.env` — the defaults in `.env.example` work as-is for a local run. The only
values worth reviewing before a real deployment:

- `JWT_SECRET` — replace the placeholder with a long random string.
- `MODERATOR_USERNAME` / `MODERATOR_PASSWORD` — the account created by
  `npm run seed:moderator` (see [Moderator access](#moderator-access)); rotate the
  password before any real deployment.
- `ALLOWED_ORIGIN` — must match wherever the frontend is actually served from (CORS).

`frontend/.env` — one variable, `NEXT_PUBLIC_GRAPHQL_URL`, already defaults to
`http://localhost:4000/graphql`, correct for the default `docker compose` setup below.

### 2. Build and start the full stack

```bash
docker compose up -d --build
```

This starts five containers: `postgres`, `redis`, `rabbitmq`, `backend`, `frontend`.
The backend container runs `prisma migrate deploy` automatically on boot before
starting the API, so the database schema is created for you — no manual migration step.

**First boot takes a few minutes** — building the backend and frontend images (installing
dependencies, compiling), then waiting for Postgres/Redis/RabbitMQ health checks before
the backend starts, then the backend's own migration + boot. Subsequent
`docker compose up -d` runs (without `--build`, no source changes) are fast — seconds.

### 3. Verify it's working

- **Frontend**: [http://localhost:3000](http://localhost:3000) — the comments page,
  starting with an empty table.
- **Backend GraphQL Sandbox**: [http://localhost:4000/graphql](http://localhost:4000/graphql)
  — Apollo Sandbox, browsable in a browser (a non-browser request there returns 400 by
  design — it's not a JSON API root).
- **RabbitMQ management UI**: [http://localhost:15672](http://localhost:15672)
  (`guest`/`guest` by default) — useful to confirm the `attachment.resize` queue exists
  and is draining after an image upload.

Post a comment through the UI (solve the CAPTCHA, fill the form) — it should appear in
the table immediately, and reloading a second browser tab pointed at the same URL should
show it too (confirming the WebSocket live-update path).

### Stopping / resetting

```bash
docker compose down          # stop containers, keep data volumes
docker compose down -v       # stop containers AND wipe postgres/redis/rabbitmq data
```

---

## Running tests

Backend tests run against a real Postgres/Redis/RabbitMQ — either the ones started by
`docker compose up -d postgres redis rabbitmq` (dev, unmigrated schema — run
`npm run prisma:migrate` inside `backend/` once) or against the full `docker compose`
stack with the dockerized `backend` container **stopped** first (e2e tests share the
same RabbitMQ queue as the running app, so both can't be consuming it at once).

```bash
cd backend
npm install

npm run test        # unit tests — 86/86 passing
npm run test:e2e    # e2e tests — 56/56 passing (requires postgres/redis/rabbitmq up,
                     # and the containerized `backend` service stopped)
```

Frontend has no automated test suite (feature/QA verification for this project was done
manually against the running app, live-browser, at every step — logged in `CLAUDE.md`'s
Progress log). `tsc --noEmit`, `next build`, and `eslint` are all clean.

```bash
cd frontend
npm install
npx tsc --noEmit
npm run build
npm run lint
```

---

## Moderator access

A Moderator role (JWT-protected) can hide individual comments (and their whole subtree)
and ban an author's `(username, email)` identity from posting further comments. There's
no public sign-up for this role — it's a single seeded account, intended for
demonstrating the moderation feature, not multi-moderator administration.

Seed the account (needs the backend's database migrated and reachable):

```bash
cd backend
npm run seed:moderator
```

This creates the account from `backend/.env`'s `MODERATOR_USERNAME` /
`MODERATOR_PASSWORD` values (defaults are in `.env.example`, meant for local
development only — **rotate the password before any real deployment**; this is tracked
as an open item, see below). Log in via the "Moderator" link in the app's header.

---

## Database schema

The runtime database is **PostgreSQL** (see `backend/prisma/schema.prisma` for the
authoritative, live schema) — a deliberate choice, not an oversight relative to the
brief's mention of MySQL Workbench:

- `commentThread` fetches an entire, arbitrarily deep reply tree in a single round-trip
  using one **recursive CTE** (`WITH RECURSIVE`) — a feature Postgres supports natively
  and MySQL's equivalent (recursive CTEs, added in MySQL 8.0) is comparatively less
  mature and less commonly battle-tested for this kind of tree-traversal query.
- Prisma's PostgreSQL support (case-insensitive collation handling, native `UUID`, JSON
  operators if ever needed) is generally the more idiomatic pairing.
- This aligns with the author's own prior production stack (see `CLAUDE.md`'s "Code
  style references") — same database, same ORM version, less unknown surface area for a
  timed test assignment.

To satisfy the brief's explicit requirement for "a database schema file, openable in
MySQL Workbench," a **separate, MySQL-syntax translation** of the same logical schema
(same tables, columns, relations, and indexes — Author/Comment/Attachment/Moderator) is
provided at:

```
docs/db-schema-mysql-workbench.sql
```

This file is for **schema review/visualization in MySQL Workbench only** — it is not
used anywhere at runtime, is not kept in migration lock-step with `schema.prisma`
automatically, and should not be imported into any environment this app actually runs
against. Open it in MySQL Workbench via **File → Import → Reverse Engineer MySQL Create
Script**, or `File → Open SQL Script` to inspect it as plain DDL.

---

## Known limitations / deliberate scope decisions

Noted upfront so a reviewer doesn't mistake an intentional boundary for a bug:

- **No voting/ranking system.** The brief doesn't ask for one, and Reddit-style visual
  references used during the styling pass show vote arrows — those are deliberately
  **not** implemented (faking a control with no backing feature would mislead a
  reviewer). Sort order within the root table is username/email/date only, and thread
  replies are always LIFO.
- **Comments are not editable or deletable** by their author — the brief only requires
  creation; a Moderator can *hide* a comment (soft-delete, moderation-only), not edit one.
- **Reply depth is fetched to 30 levels per `commentThread` request**, not truly
  unlimited in a single query — GraphQL has no recursive-fragment construct, so an
  arbitrary-depth tree has to be unrolled to a fixed depth in the query document itself.
  The *backend* has no depth limit at all (the recursive CTE walks however deep a thread
  actually is); 30 is a generous multiple of the UI's own visual indentation cap (6
  levels, 3–4 on mobile) and of anything exercised in testing. If a thread ever
  legitimately exceeds 30 levels, the UI shows an explicit "N more replies past this
  point aren't shown here" notice rather than silently omitting them.
- **Deep threads re-root via "Continue this thread →"** once they hit the visual
  indentation cap (6 levels), rather than letting indentation run off-screen or flattening
  it — a deliberate UX choice modeled on Reddit, not a workaround for a bug.
- **Hiding a comment / banning an author does not push to every viewer's local moderation
  state beyond the WebSocket broadcast already covers** — i.e. it *does* live-propagate
  (see `commentHidden`/`authorBanned` events above), but a moderator's own action always
  reflects instantly in their own tab via a direct cache write, while other tabs update on
  receiving the broadcast, same as any other live update.
- **Moderator accounts are seed-only** — no self-registration, no moderator management
  UI. One account, meant to demonstrate the feature.
- **No horizontal scaling / load testing** — out of the brief's target scope (see
  CLAUDE.md's "Middle+" section), though the cache/queue split is deliberately structured
  so it isn't a dead end if that were ever needed.

---

## Live deployment / demo video

- **Live URL**: _TODO — not yet deployed._
- **Demo video**: _TODO — recorded once a deployment and curated demo dataset are in
  place._

Both are the last remaining items before submission — see `CLAUDE.md`'s Progress log for
current status.
