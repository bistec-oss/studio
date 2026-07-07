-- Username sign-in (better-auth username plugin): lowercase unique handle +
-- display casing. Email remains internally but is no longer the login.
ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "displayUsername" TEXT;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");