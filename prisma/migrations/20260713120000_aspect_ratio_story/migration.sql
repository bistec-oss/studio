-- Add the 9:16 STORY size to the AspectRatio enum.
-- (SQUARE=1080x1080, PORTRAIT=1080x1350 [labelled 4:5], STORY=1080x1920.)
-- Postgres 12+ permits ALTER TYPE ... ADD VALUE inside a transaction.
ALTER TYPE "AspectRatio" ADD VALUE IF NOT EXISTS 'STORY';
