ALTER TABLE "Account"
ADD COLUMN "lastSignedInAt" TIMESTAMP(3);

UPDATE "Account"
SET "lastSignedInAt" = COALESCE("lastSeenAt", "createdAt")
WHERE "lastSignedInAt" IS NULL;

CREATE INDEX "Account_lastSignedInAt_idx" ON "Account"("lastSignedInAt");
