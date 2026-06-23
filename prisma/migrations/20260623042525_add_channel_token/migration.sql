-- CreateTable
CREATE TABLE "ChannelToken" (
    "id" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "encryptedMetadata" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelToken_channel_key" ON "ChannelToken"("channel");
