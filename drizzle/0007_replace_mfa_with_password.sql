ALTER TABLE "user" DROP COLUMN "mfaSecret";
ALTER TABLE "user" DROP COLUMN "mfaEnabledAt";
ALTER TABLE "user" ADD COLUMN "passwordHash" text;
