-- A moderator can ban an author identity from commenting (banAuthor).

-- AlterTable
ALTER TABLE "authors" ADD COLUMN "isBanned" BOOLEAN NOT NULL DEFAULT false;
