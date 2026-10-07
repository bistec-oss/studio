-- T8 (change 004 Phase 1, FR-22): record the installed font-set digest that
-- produced a draft's current render, alongside promptVersion, so a font
-- install/upgrade (which changes rendering globally, with no per-draft
-- override) is attributable after the fact. Nullable, no backfill — drafts
-- rendered before this exists are absent, not wrong.
ALTER TABLE "Draft" ADD COLUMN "fontSet" TEXT;
