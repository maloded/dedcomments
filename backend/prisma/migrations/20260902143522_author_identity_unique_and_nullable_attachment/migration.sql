-- AlterTable
ALTER TABLE "attachments" ALTER COLUMN "commentId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "authors_username_email_key" ON "authors"("username", "email");
