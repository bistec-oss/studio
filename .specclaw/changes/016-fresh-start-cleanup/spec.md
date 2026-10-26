# Spec: Fresh-start cleanup — remove code that only serves old data

**Change:** 016-fresh-start-cleanup · **Size:** bounded · **Proposal:** [proposal.md](proposal.md)

## Overview

The new system starts with fresh teams, users and data (user decision, 2026-10-13). This change does two things:

- removes the code that exists only to repair, convert, carry or roll back data written by older versions;
- makes a fresh database start with no team, with a sensible first-run screen for the super admin.

The inventory is in the proposal. These user decisions are binding:

- remove the pre-made team;
- remove the rollbacks to before 012 and 008;
- remove the `copyText` alias.

## Approach

**One decision: legacy code is deleted, never feature-flagged.** Applied migrations are never edited. The two new migrations each guard themselves.

The file map:

- `scripts/{export-posts,import-posts,fix-data-uri-logos,migrate-to-teams,reseed-single-admin}.mjs`: deleted.
- `prisma/schema.prisma`, plus a new migration `prisma/migrations/2026101312…_drop_legacy_captions`: drop `Draft.copyText`, `Draft.captionMigration`, `DraftCaption.needsReview` and the enum `CaptionMigration`. The migration raises when any legacy caption is still unmigrated.
- A new migration `…_drop_empty_default_team`: delete `team_bistec_default` only when it is empty.
- `prisma/rollback/016-fresh-start-cleanup.down.sql`: new. `prisma/rollback/{012-per-channel-captions,008-model-selection}.down.sql`: deleted.
- **Captions:** `src/lib/captions/{store,migrationPlan,backfill}.ts`, `src/scripts/backfill-captions.ts`, `package.json`, `docker-entrypoint.sh`, `Dockerfile`, `src/lib/api-types.ts`, `src/app/api/drafts/[id]/route.ts`, `src/components/drafts/CaptionPanel.tsx`.
- **Drafts:** `src/lib/drafts/recovery.ts`, `src/app/api/drafts/[id]/{regenerate-design,refine}/route.ts`.
- **The `copyText` alias:** `src/mcp/tools/generate.ts` (and the MCP `get_draft` path), `src/app/api/generate/copy/route.ts`.
- **The zero-team dashboard:** `src/app/(app)/page.tsx`.
- **Tests:** the unit and E2E files named per task. **Docs:** `CLAUDE.md`, `docs/handoff.md`, `docs/e2e-test-plan.md`, `docs/mcp-acp-guide.md`.

## Requirements

### Functional Requirements

- **FR-01 — Transfer and one-off scripts removed.** `export-posts.mjs`, `import-posts.mjs`, `fix-data-uri-logos.mjs`, `migrate-to-teams.mjs` and `reseed-single-admin.mjs` are deleted.
  - Live docs no longer tell anyone to run them. History stays as it is: `.specclaw/changes/**`, `.specclaw/learnings.md` and `docs/superpowers/**`.
  - The runtime `data:` logo guards stay.
- **FR-02 — The legacy caption columns are dropped.** A new migration drops `Draft."copyText"`, `Draft."captionMigration"`, `DraftCaption."needsReview"` and the type `"CaptionMigration"`.
  - **Guard:** before dropping anything, the migration raises when any `Draft` has a non-null `copyText` and no `DraftCaption` rows. A fresh DB never trips this; an old DB fails the deploy loudly instead of losing caption text.
  - The exception message names the fix: this system is fresh-start only; reset the database, or backfill on a pre-016 build first.
- **FR-03 — The caption loader has no migrate-on-read path.**
  - `loadDraftCaptions` reads the rows, and fills a missing registry channel with an empty READY row (existing behaviour, kept per NFR-02; the T2 review agreed), as `store.ts:177-186` does today. Nothing else.
  - `migrationPlan.ts`, `backfill.ts`, `src/scripts/backfill-captions.ts`, the `captions:backfill` / `captions:report` scripts, the boot step in `docker-entrypoint.sh` and the esbuild step in `Dockerfile` are removed.
  - `needsReview` and `captionMigration` leave the API types, the draft GET and `CaptionPanel` (the "migrated from the old single caption" notice).
- **FR-04 — The copy-edit status heal is removed.** `hasFinishedDesign`, `isStatusClobbered`, `healStatus` and the fields only they use are removed from `recovery.ts`, along with the call site in the draft GET.
  - `STUCK_GENERATION_MS`, `STUCK_REASON`, `STUCK_ACTION_REASON`, `failStuckGeneration`, `clearStuckAction` and `settlePendingCaptions` are unchanged. TC-ASYNC-10 stays.
- **FR-05 — Two legacy guards are removed.**
  - The null-pointer `htmlContent` snapshot in `regenerate-design/route.ts`.
  - The `pending.model === undefined` branch in `refine/route.ts` (`overrideModelStamp`).
- **FR-06 — The rollbacks to before 012 and 008 are removed.** That covers `prisma/rollback/012-per-channel-captions.down.sql`, `prisma/rollback/008-model-selection.down.sql`, TC-CAP-13 and TC-MODEL-12, and their runbook sections.
- **FR-07 — The `copyText` alias is removed.** MCP `get_draft`, MCP/ACP `generate_post` and `POST /api/generate/copy` no longer return `copyText`. `headline` and `captions` are unchanged.
- **FR-08 — No pre-made team on a fresh database.**
  - A new migration deletes `Team` `team_bistec_default`, and does so **only when** it has:
    - no `TeamMembership` rows;
    - no rows in any team-owned table: Project, Campaign, BrandKit, Brief, Draft, Post, ScheduledGeneration, BriefDraft, CampaignDocument, BrandKitDocument, AvailableProvider, ChannelToken, ApiKey and TeamModelPolicy.
  - The seeds (`seed-teams`, `seed-brandkit`, `seed-hearts-talk`, `seed-cli-provider`) already create "Bistec" when it is missing. Only their comments that claim the migration creates it change.
- **FR-09 — The zero-team first-run screen.** When the signed-in user is a super admin and resolves to `no-team`, the dashboard says there are no teams yet and links to `/admin/teams` to create the first one. Everyone else keeps today's message.
- **FR-10 — A down script for this change.** `prisma/rollback/016-fresh-start-cleanup.down.sql`:
  - re-adds the enum and the three columns, nullable or with their old defaults, so a pre-016 image boots;
  - un-records both 016 migrations (L24);
  - does not restore dropped data or the deleted team.

### Non-Functional Requirements

- **NFR-01:** no applied migration under `prisma/migrations/` is edited or deleted.
- **NFR-02:** no behaviour change for fresh data. The Keep list in the proposal is untouched, and every E2E case that isn't legacy-only still passes unchanged, except TC-CAP-16, which is reworked to null the headline directly.
- **NFR-03:** no real model calls while testing.

## Acceptance Criteria

- **AC-01 (FR-01):** the five scripts are gone. `git grep` for their names outside `.specclaw/changes`, `.specclaw/learnings.md` and `docs/superpowers` finds nothing that tells anyone to run them.
- **AC-02 (FR-02):** `prisma migrate deploy` on a freshly created DB succeeds, and the four schema items are gone. On a scratch DB holding a draft with `copyText` and no caption rows, the migration raises with the FR-02 message. Prove both, and record the output in the task report.
- **AC-03 (FR-03):** `captionStore` unit tests cover:
  - reading existing rows;
  - filling a missing channel;
  - that no code path reads `copyText`. `git grep -n copyText src/` returns no hit outside comments describing the removal, if any.
- **AC-04 (FR-03):** `docker-entrypoint.sh` and the `Dockerfile` no longer reference the backfill. CI's `docker build` passes.
- **AC-05 (FR-04/FR-05):** the `draftRecovery` unit tests pass with the heal removed. TC-ASYNC-10, the §Q suite, the refine suites and regenerate-design pass.
- **AC-06 (FR-07):** unit tests assert that `copyText` is absent from MCP `get_draft`, `generate_post` and `/api/generate/copy` responses, and that `headline` and `captions` are present.
- **AC-07 (FR-06):** both down scripts, TC-CAP-13 and TC-MODEL-12 are gone, and `docs/e2e-test-plan.md` §W/§Y and the AC maps match.
- **AC-08 (FR-08):** on a freshly created DB, after `migrate deploy` and before seeding, `SELECT count(*) FROM "Team"` is 0. On a DB where that team has a member, the migration keeps it. Prove both and record them in the report. After `npm run test:e2e:db`, the Bistec and ClientX fixtures exist and the full E2E suite passes.
- **AC-09 (FR-09):** a test proves the super-admin zero-team message links to `/admin/teams`, and that the non-super-admin message is unchanged.
- **AC-10 (FR-10):** the down script applied to a migrated scratch DB re-adds the columns and removes both 016 rows from `_prisma_migrations`. Record the proof in the report.
- **AC-11:** tsc clean; lint 0 errors; unit all pass; build passes; **a full clean mock E2E passes with 0 failures**; fork CI green after the push.
- **AC-12:** `CLAUDE.md`, `docs/handoff.md`, `docs/e2e-test-plan.md` and `docs/mcp-acp-guide.md` no longer describe the removed machinery as live, and they record the fresh-start rules and the 016 deploy note.

## Edge Cases

- **A dev DB with unmigrated legacy drafts:** the FR-02 guard fails `migrate deploy` there. That is intended: the fix is a reset, which is the fresh start. The handoff says so.
- **A dev DB whose Bistec team has members:** FR-08 keeps the team. Only an empty pre-made team is removed.
- **`npm run db:seed`** (the dev demo seed) still creates a "Bistec" team through `seed-brandkit`. It is a manual demo seed, not part of a fresh system's boot; the docs say so.
- **A super admin with exactly one team:** this is unchanged; `resolveActiveTeam` picks that team.

## Dependencies

None. 017–019 build on this change.
