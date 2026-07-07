-- CreateEnum
CREATE TYPE "ClaudeTokenStatus" AS ENUM ('ACTIVE', 'INVALID');

-- CreateTable
CREATE TABLE "UserClaudeToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "status" "ClaudeTokenStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastValidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserClaudeToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserClaudeToken_userId_key" ON "UserClaudeToken"("userId");

-- AddForeignKey
ALTER TABLE "UserClaudeToken" ADD CONSTRAINT "UserClaudeToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
