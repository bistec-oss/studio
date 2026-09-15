-- FR-22 (design instruction fidelity): record WHICH FONT SET was installed on the
-- host that rendered a draft, beside the existing promptVersion stamp, so a
-- render's glyph environment is attributable after the fact (a post full of tofu
-- boxes is a font-coverage question, not a prompt question).
--
-- Nullable with no backfill by design: drafts rendered before this column
-- existed have no stamp, and so does any host whose font directories are
-- unreadable. Absent, not wrong — readers must tolerate null.
ALTER TABLE "Draft" ADD COLUMN "fontSetId" TEXT;
