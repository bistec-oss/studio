-- 012 FR-04, migration 3: the legacy caption column becomes nullable. In code it
-- is now Draft.legacyCaptionText (@map("copyText")), read-only, and new drafts
-- leave it null. The column is NOT renamed (A1): the previous container selects
-- "copyText" until cutover. Rollback is prisma/rollback/012-per-channel-captions.down.sql.

-- AlterTable
ALTER TABLE "Draft" ALTER COLUMN "copyText" DROP NOT NULL;
