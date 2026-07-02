-- T1 (pipeline consolidation): record which prompt revision produced a draft's
-- current design, so output quality can be correlated with prompt changes.
ALTER TABLE "Draft" ADD COLUMN "promptVersion" TEXT;
