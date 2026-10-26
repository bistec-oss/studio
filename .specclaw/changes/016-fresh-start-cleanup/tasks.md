# Tasks: Fresh-start cleanup — remove code that only serves old data

**Change:** 016-fresh-start-cleanup · **Size:** bounded

## Summary

This change has **5 tasks in 3 waves**, all built on `v2`. Each task is implemented by a subagent, reviewed by `specclaw:code-reviewer`, and committed by the orchestrator after it re-runs tsc, lint and unit. Run the tasks one at a time. No real model calls.

## Tasks

### Wave 1 — Removals

- [x] `T1` — Delete the transfer and one-off data scripts
  - Files: `scripts/export-posts.mjs`, `scripts/import-posts.mjs`, `scripts/fix-data-uri-logos.mjs`, `scripts/migrate-to-teams.mjs`, `scripts/reseed-single-admin.mjs` (all deleted)
  - Estimate: small
  - Kind: refactor
  - Depends: none
  - Notes:
    - **Covers:** FR-01, AC-01 (code half; T5 does the docs).
    - Delete the five files, then `git grep` every name, and fix any live **code** reference (package.json, other scripts, comments in `src/`).
    - Leave live docs to T5, and list every doc hit in the report.
    - Fix the pre-tenancy null-`teamId` comments named in the inventory: `src/mcp/tools/generate.ts:82-84,121`, `src/mcp/tools/publish.ts:20`, `src/lib/publish/publishDraft.ts:90-91`. **Only if** they describe code being removed or a state a fresh DB can't reach; otherwise leave them.

- [x] `T2` — Drop the 012 legacy caption machinery (schema, loader, boot, API, UI, tests)
  - Files: `prisma/schema.prisma`, `prisma/migrations/<ts>_drop_legacy_captions/migration.sql` (new), `prisma/rollback/012-per-channel-captions.down.sql` (deleted), `src/lib/captions/store.ts`, `src/lib/captions/migrationPlan.ts` (deleted), `src/lib/captions/backfill.ts` (deleted), `src/scripts/backfill-captions.ts` (deleted), `package.json`, `docker-entrypoint.sh`, `Dockerfile`, `src/lib/api-types.ts`, `src/app/api/drafts/[id]/route.ts`, `src/app/api/drafts/[id]/regenerate-copy/route.ts`, `src/app/api/drafts/[id]/retry/route.ts`, `src/components/drafts/CaptionPanel.tsx`, `tests/unit/captionMigrationPlan.test.ts` (deleted), `tests/unit/captionBackfill.test.ts` (deleted), `tests/unit/legacyCaptionGuard.test.ts` (deleted), `tests/unit/captionStore.test.ts`, `tests/unit/captionRoutes.test.ts`, `tests/unit/captionWriters.test.ts`, `tests/e2e/captions.test.ts`, `tests/helpers/db.ts`
  - Estimate: large
  - Kind: migration
  - Depends: T1
  - Notes:
    - **Covers:** FR-02, FR-03, FR-06 (the 012 half), AC-02, AC-03, AC-04, AC-07 (the 012 half).
    - **Line pointers** are in the proposal's inventory (`store.ts` 46-49, 63-126, 138-175, 214-270 out; **keep 177-186**). Re-read the files first, because line numbers drift.
    - **The migration:**
      - a guarded `DO $$ … RAISE EXCEPTION … $$` first (FR-02 message);
      - then `ALTER TABLE "Draft" DROP COLUMN "copyText", DROP COLUMN "captionMigration"`, `ALTER TABLE "DraftCaption" DROP COLUMN "needsReview"`, `DROP TYPE "CaptionMigration"`.
      - Check the actual column and type names in the applied 012 migrations.
      - Run `npx prisma generate` and fix the type fallout.
    - **Prove AC-02 on a scratch DB** (a `*_scratch` DB name, created and dropped by you, never the dev or test DB):
      1. create it;
      2. `migrate deploy` up to the migration before this one (or apply all, then craft the legacy row before re-running);
      3. show the guard raising;
      4. show a clean apply on an empty DB.
         Record the commands and output.
    - **E2E:**
      - remove the §W legacy block (TC-CAP-11/12/13 with its helpers) and TC-CAP-19;
      - rework TC-CAP-16 to set the headline to null directly through the test DB helper instead of `makeLegacyDraft`;
      - remove `makeLegacyDraft`, and the "no copyText" / `needsReview:false` asserts.
    - Run the caption unit tests and `tests/e2e/captions.test.ts` against a server; the T5 gate runs everything.

- [x] `T3` — Remove the copy-edit heal, two legacy guards, the `copyText` alias and the 008 rollback
  - Files: `src/lib/drafts/recovery.ts`, `src/app/api/drafts/[id]/route.ts`, `src/app/api/drafts/[id]/regenerate-design/route.ts`, `src/app/api/drafts/[id]/refine/route.ts`, `src/mcp/tools/generate.ts`, `src/app/api/generate/copy/route.ts`, `prisma/rollback/008-model-selection.down.sql` (deleted), `tests/unit/draftRecovery.test.ts`, `tests/unit/mcpGetDraft.test.ts`, `tests/unit/jobRunner.test.ts`, `tests/e2e/model-selection.test.ts`, `tests/e2e/rejected-revisions.test.ts`
  - Estimate: medium
  - Kind: refactor
  - Depends: T2
  - Notes:
    - **Covers:** FR-04, FR-05, FR-06 (the 008 half), FR-07, AC-05, AC-06, AC-07 (the 008 half).
    - **Keep the stuck sweeps (FR-04).** `src/lib/models/budget.ts` imports `STUCK_GENERATION_MS`.
    - **The `copyText` alias:** find every place it is returned, including the ACP run path through `generatePost`. Assert its absence in unit tests (AC-06).
    - **Remove TC-MODEL-12 completely,** with any helper only it uses.
    - Update the comment at `rejected-revisions.test.ts:111-112`.

### Wave 2 — Fresh first run

- [x] `T4` — No pre-made team; the super-admin zero-team screen; the 016 down script
  - Files: `prisma/migrations/<ts>_drop_empty_default_team/migration.sql` (new), `prisma/rollback/016-fresh-start-cleanup.down.sql` (new), `scripts/seed-teams.mjs`, `scripts/seed-brandkit.mjs`, `scripts/seed-hearts-talk.mjs`, `scripts/seed-cli-provider.mjs`, `scripts/setup-test-db.mjs`, `src/app/(app)/page.tsx`, a unit or E2E test for FR-09
  - Estimate: medium
  - Kind: migration
  - Depends: T3
  - Notes:
    - **Covers:** FR-08, FR-09, FR-10, AC-08, AC-09, AC-10.
    - **The migration:** `DELETE FROM "Team" WHERE id = 'team_bistec_default' AND NOT EXISTS (…)` for every table FR-08 lists. Verify the table list against `schema.prisma`: every model with a `teamId`, plus `TeamMembership` and `TeamModelPolicy`.
    - **Seeds:** comment-only changes, unless a seed actually depends on the fixed id. Grep for `team_bistec_default`.
    - **FR-09:** prefer a small presentational component, or a pure helper, that is unit-testable in this repo's vitest setup. If the unit setup can't render it, use an E2E case and say why in the report.
    - **The down script (FR-10):** re-add the enum and columns so the pre-016 Prisma client boots, then `DELETE FROM "_prisma_migrations"` for both 016 migration names. Follow the convention of the deleted 008 down script (read it from git history: `git show HEAD~:prisma/rollback/008-model-selection.down.sql`, or from the commit before T3).
    - **Prove AC-08 and AC-10 on a scratch DB** and record the output.

### Wave 3 — Docs and gate

- [x] `T5` — Docs sweep, the full gate and CI
  - Files: `CLAUDE.md`, `docs/handoff.md`, `docs/e2e-test-plan.md`, `docs/mcp-acp-guide.md`, `docs/cold-start.md` (if needed), `.specclaw/ROADMAP.md`
  - Estimate: medium
  - Kind: docs
  - Depends: T4
  - Notes:
    - **Covers:** AC-11, AC-12, and AC-01's docs half.
    - **Update the live docs only.** In CLAUDE.md, append "(removed by 016)" notes rather than rewriting history entries. In `docs/handoff.md`, mark the 012 runbook, the transfer section, the 008 rollback and the copy-edit heal as removed by 016, and add a **016 deploy note**:
      - fresh systems only;
      - an old DB with unmigrated legacy captions fails the migration by design;
      - the down script exists.
    - **`docs/e2e-test-plan.md`:** update §W, §Y, the AC maps and the header totals to match the suite.
    - **Full clean mock E2E** (the standard procedure: drop the test DB, `rm -rf .next`, `test:e2e:db`, one :3001 server, `test:e2e:mock`). Expect fewer cases than 391, 0 failed. Record the new totals.
    - Then push `v2` and watch CI (L21).
