-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "usernameLower" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordSalt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Player" ADD COLUMN "accountId" TEXT;
ALTER TABLE "Player" ADD COLUMN "name" TEXT;
ALTER TABLE "Player" ADD COLUMN "nameLower" TEXT;

UPDATE "Player"
SET "name" = "id",
    "nameLower" = LOWER("id")
WHERE "name" IS NULL;

ALTER TABLE "Player" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "Player" ALTER COLUMN "nameLower" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Account_username_key" ON "Account"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Account_usernameLower_key" ON "Account"("usernameLower");

-- CreateIndex
CREATE UNIQUE INDEX "Player_nameLower_key" ON "Player"("nameLower");

-- CreateIndex
CREATE INDEX "Player_accountId_idx" ON "Player"("accountId");

-- CreateIndex
CREATE INDEX "Session_accountId_idx" ON "Session"("accountId");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
