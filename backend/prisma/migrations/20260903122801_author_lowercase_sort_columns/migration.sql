-- Case-insensitive sorting for rootComments(sortBy: USERNAME | EMAIL): Prisma's
-- `orderBy` has no `mode: 'insensitive'` (only `where` filters do), so we sort on a
-- lowercased mirror column instead, kept in sync by AuthorsService.findOrCreate.
-- See CLAUDE.md → Progress log and docs/code-style-reference.md → "Case-insensitive
-- sorting" for why.

-- AlterTable: add nullable first — the table already has rows, so a NOT NULL column
-- can't be added in one step without a (wrong) constant default.
ALTER TABLE "authors" ADD COLUMN "emailLower" TEXT;
ALTER TABLE "authors" ADD COLUMN "usernameLower" TEXT;

-- Backfill existing rows from their current username/email.
UPDATE "authors" SET "usernameLower" = lower("username"), "emailLower" = lower("email");

-- Now every row has a value — safe to enforce NOT NULL.
ALTER TABLE "authors" ALTER COLUMN "usernameLower" SET NOT NULL;
ALTER TABLE "authors" ALTER COLUMN "emailLower" SET NOT NULL;

-- CreateIndex
CREATE INDEX "authors_usernameLower_idx" ON "authors"("usernameLower");

-- CreateIndex
CREATE INDEX "authors_emailLower_idx" ON "authors"("emailLower");
