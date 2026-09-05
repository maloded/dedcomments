-- ============================================================================
-- Comments SPA — MySQL Workbench schema export
-- ============================================================================
--
-- IMPORTANT — read before using this file:
--
--   The application's ACTUAL runtime database is PostgreSQL. This file is a
--   hand-translated, MySQL-syntax copy of the same logical schema, provided
--   ONLY to satisfy the brief's requirement for "a database schema file,
--   openable in MySQL Workbench." It is for schema review / ER-diagram
--   visualization purposes only.
--
--   - Do NOT run this against any environment the application actually uses.
--   - It is not wired into any migration tooling and will not automatically
--     stay in sync with backend/prisma/schema.prisma — if the Prisma schema
--     changes, this file must be updated by hand.
--   - The authoritative, live schema is backend/prisma/schema.prisma, applied
--     via `prisma migrate deploy` (see backend/prisma/migrations/).
--
--   Why PostgreSQL and not MySQL at runtime — see README.md → "Database
--   schema" for the full rationale (short version: `commentThread` fetches an
--   entire, arbitrarily deep reply tree via one recursive CTE, a query
--   pattern Postgres supports more maturely than MySQL for this use case).
--
-- Import into MySQL Workbench: File → Import → Reverse Engineer MySQL Create
-- Script (or File → Open SQL Script to inspect as plain DDL).
--
-- Translation notes (Postgres/Prisma → MySQL):
--   - Prisma's `String @id @default(uuid())` → CHAR(36), with a MySQL 8.0.13+
--     expression default (`DEFAULT (UUID())`) standing in for Prisma's
--     application-side UUID generation — the app itself always supplies the
--     id explicitly, so this default only matters if a row is ever inserted
--     directly in SQL (e.g. while exploring this file in Workbench).
--   - Prisma's `Boolean @default(false)` → TINYINT(1) DEFAULT 0 (MySQL has no
--     native boolean type; TINYINT(1) is the conventional equivalent).
--   - Prisma's `DateTime @default(now())` → DATETIME(3) DEFAULT
--     CURRENT_TIMESTAMP(3) (millisecond precision, matching Prisma's default).
--   - Prisma's `enum AttachmentType { IMAGE TEXT }` → a native MySQL ENUM.
--   - All tables use InnoDB (required for foreign keys) and utf8mb4 (full
--     Unicode, including emoji in comment text).
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------------------------
-- Table: authors
-- Prisma model: Author (@@map("authors"))
-- An anonymous comment author, identified by (username, email) rather than a
-- password-based account. The same identity commenting again reuses its row.
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `authors`;
CREATE TABLE `authors` (
  `id`             CHAR(36)      NOT NULL DEFAULT (UUID()),
  `username`       VARCHAR(255)  NOT NULL,
  `email`          VARCHAR(255)  NOT NULL,
  `homepage`       VARCHAR(2048) NULL,
  -- Lowercased mirrors of username/email, maintained by the app on the one
  -- write path (AuthorsService.findOrCreate) so root-table sorting by
  -- username/email is case-insensitive without relying on a MySQL/Postgres
  -- collation choice. See README.md and CLAUDE.md for the full rationale.
  `usernameLower`  VARCHAR(255)  NOT NULL,
  `emailLower`     VARCHAR(255)  NOT NULL,
  -- Set by a moderator (banAuthor mutation). A banned identity is rejected
  -- from posting further comments; existing comments are left untouched.
  `isBanned`       TINYINT(1)    NOT NULL DEFAULT 0,
  `createdAt`      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  -- One row per (username, email) identity.
  UNIQUE KEY `authors_username_email_unique` (`username`, `email`),
  KEY `authors_username_idx` (`username`),
  KEY `authors_email_idx` (`email`),
  KEY `authors_usernameLower_idx` (`usernameLower`),
  KEY `authors_emailLower_idx` (`emailLower`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Anonymous comment authors, identified by (username, email).';

-- ----------------------------------------------------------------------------
-- Table: comments
-- Prisma model: Comment (@@map("comments"))
-- The core entity — immutable after creation. A root comment has parentId
-- NULL; a reply points at any other comment, forming a self-referencing tree
-- of unlimited depth (enforced application-side, not by this schema).
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `comments`;
CREATE TABLE `comments` (
  `id`         CHAR(36)     NOT NULL DEFAULT (UUID()),
  -- Sanitized/whitelisted body (only <a href="" title="">, <code>, <i>,
  -- <strong> survive validation) — see backend's sanitizer module.
  -- TEXT (64 KB) comfortably covers the app's own 20,000-char input cap.
  `text`       TEXT         NOT NULL,
  `authorId`   CHAR(36)     NOT NULL,
  `parentId`   CHAR(36)     NULL,
  -- Moderation flag (JWT-protected hideComment mutation). Hidden comments
  -- stay in the tree structurally but are filtered out of public queries.
  `isHidden`   TINYINT(1)   NOT NULL DEFAULT 0,
  `createdAt`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `comments_createdAt_idx` (`createdAt`),
  KEY `comments_parentId_idx` (`parentId`),
  KEY `comments_parentId_createdAt_idx` (`parentId`, `createdAt`),
  CONSTRAINT `comments_authorId_fkey`
    FOREIGN KEY (`authorId`) REFERENCES `authors` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  -- Self-referencing: a reply's parent is another row in this same table.
  -- Deleting a comment cascades to its replies (mirrors Prisma's
  -- onDelete: Cascade on Comment.parent).
  CONSTRAINT `comments_parentId_fkey`
    FOREIGN KEY (`parentId`) REFERENCES `comments` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Comments — a self-referencing tree of unlimited depth.';

-- ----------------------------------------------------------------------------
-- Table: attachments
-- Prisma model: Attachment (@@map("attachments"))
-- At most one attachment per comment: a resized image or a small text file.
-- Nullable/unlinked commentId reflects the app's "upload first, link on
-- createComment" flow (an attachment can briefly exist with no comment yet).
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `attachments`;
CREATE TABLE `attachments` (
  `id`           CHAR(36)                  NOT NULL DEFAULT (UUID()),
  `commentId`    CHAR(36)                  NULL,
  `type`         ENUM('IMAGE', 'TEXT')     NOT NULL,
  `url`          VARCHAR(1024)             NOT NULL,
  `originalName` VARCHAR(255)              NOT NULL,
  `size`         INT UNSIGNED              NOT NULL,
  -- Stamped once the RabbitMQ worker has resized (images) or validated
  -- (text) the file. NULL while an image resize job is still in flight.
  `processedAt`  DATETIME(3)               NULL,
  `createdAt`    DATETIME(3)               NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  -- At most one attachment per comment.
  UNIQUE KEY `attachments_commentId_unique` (`commentId`),
  CONSTRAINT `attachments_commentId_fkey`
    FOREIGN KEY (`commentId`) REFERENCES `comments` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='One optional image or text attachment per comment.';

-- ----------------------------------------------------------------------------
-- Table: moderators
-- Prisma model: Moderator (@@map("moderators"))
-- The only entity with a real password-based login. Authenticated via JWT;
-- used for the hideComment / banAuthor mutations. Seed-only in this project
-- (see README.md → "Moderator access") — no self-registration UI.
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `moderators`;
CREATE TABLE `moderators` (
  `id`           CHAR(36)     NOT NULL DEFAULT (UUID()),
  `username`     VARCHAR(255) NOT NULL,
  -- bcrypt hash (bcryptjs) — never the plaintext password.
  `passwordHash` VARCHAR(255) NOT NULL,
  `createdAt`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `moderators_username_unique` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Moderator accounts (JWT-protected hide/ban actions). Seed-only.';

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- Not represented here: CAPTCHA challenges.
-- Deliberately NOT a database table in either the Postgres runtime schema or
-- this MySQL translation — CAPTCHA tokens/answers are one-time, short-lived
-- (TTL'd), and live entirely in Redis. See README.md / CLAUDE.md → "Domain
-- model" for the reasoning.
-- ============================================================================
