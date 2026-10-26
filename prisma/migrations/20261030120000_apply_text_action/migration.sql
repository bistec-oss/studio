-- 031 FR-42: the draft action "Apply to image". Only this statement, so the
-- migration is safe on a Postgres that cannot run ADD VALUE in a transaction block.
ALTER TYPE "DraftAction" ADD VALUE 'APPLY_TEXT';
