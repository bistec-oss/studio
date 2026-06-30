-- CreateEnum
CREATE TYPE "AspectRatio" AS ENUM ('SQUARE', 'PORTRAIT');

-- AlterTable
ALTER TABLE "BrandKitTemplate" ADD COLUMN     "aspectRatio" "AspectRatio" NOT NULL DEFAULT 'SQUARE';

-- AlterTable
ALTER TABLE "Brief" ADD COLUMN     "aspectRatio" "AspectRatio" NOT NULL DEFAULT 'SQUARE';
