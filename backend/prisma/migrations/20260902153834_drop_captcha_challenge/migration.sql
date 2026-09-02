-- CAPTCHA challenges live in Redis, not Postgres — drop the unused table.

-- DropTable
DROP TABLE "captcha_challenges";
