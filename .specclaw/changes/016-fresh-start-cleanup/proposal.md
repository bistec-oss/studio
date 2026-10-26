# Proposal: Fresh-start cleanup — remove code that only serves old data

**Created:** 2026-10-13
**Status:** 🟡 Draft

## Problem

The user decided (2026-10-13) that the new system starts with **fresh teams, users and data**. Nothing is imported or migrated from the company prod or the two dev machines. A large amount of code exists only to repair, convert or carry data written by older versions of the app. It costs reading time, test time and boot time. Some of it is also broken: `scripts/import-posts.mjs` has not been able to write since team tenancy (L22).

The fresh start also exposes two first-run gaps:

- Applied migration `20260721120000_team_tenancy_b` inserts a **"Bistec" team (`team_bistec_default`) into every fresh database**. The user wants no pre-made team on a fresh system.
- A super admin on a database with **zero teams** sees "You're not in a team yet — ask a super admin" on the dashboard (`src/app/(app)/page.tsx:167-179`). That message is wrong for the one person who can create teams. `/admin/teams` is reachable, because the admin layout passes super admins and `/api/admin/teams` is `withSuperAdmin`.

The inventory behind this proposal is an Explore sweep from 2026-10-13. It sorted every candidate into remove, keep or decide. The decisions below are the user's.

## Proposed Solution

**Remove (legacy-only):**

1. **Post transfer scripts:** `scripts/export-posts.mjs` and `scripts/import-posts.mjs`, with their docs.
2. **The 012 legacy caption migration.**
   - A **new migration** drops `Draft.copyText` (`legacyCaptionText`), `Draft.captionMigration`, `DraftCaption.needsReview` and the enum `CaptionMigration`.
   - In `src/lib/captions/store.ts`, remove the migrate-on-read path (`materializeStep`, `migrateDraft`, `synthesizePending`) and the review log. Keep the missing-channel fill.
   - Delete `src/lib/captions/migrationPlan.ts`, `src/lib/captions/backfill.ts` and `src/scripts/backfill-captions.ts`.
   - Remove the `captions:*` npm scripts, their boot step in `docker-entrypoint.sh` and their build step in the `Dockerfile`.
   - Remove `needsReview` and `captionMigration` from the API types, the draft GET and the CaptionPanel "migrated" notice.
   - Remove the legacy tests: the §W legacy block (TC-CAP-11/12/13), TC-CAP-19, `makeLegacyDraft`, and the legacy unit files and cases. Rework TC-CAP-16 to null the headline directly.
3. **The copy-edit status heal** in `src/lib/drafts/recovery.ts` (`hasFinishedDesign`, `isStatusClobbered`, `healStatus`) and its call site. The 15-minute sweeps stay.
4. **Two guards that only old data can trigger:** the null-pointer snapshot in `regenerate-design`, and the pre-008 conflict branch in `refine`.
5. **One-off data scripts:** `fix-data-uri-logos.mjs`, `migrate-to-teams.mjs` and `reseed-single-admin.mjs`. The runtime `data:` logo guards stay.
6. **Rollbacks to before 012 and 008** (user decision): `prisma/rollback/012-per-channel-captions.down.sql`, `prisma/rollback/008-model-selection.down.sql`, TC-MODEL-12 and the runbook sections. Future changes still ship their own down scripts.
7. **The `copyText` alias** (user decision) in MCP `get_draft`/`generate_post` and `POST /api/generate/copy`. Callers use `headline` and `captions`.

**Add (first run on a fresh system):**

8. **No pre-made team** (user decision).
   - A new migration deletes `team_bistec_default`, **but only when it has no memberships and no team-owned rows**. A dev DB with real data keeps its team.
   - The seed and test-setup scripts that build on that team create it themselves, with the same id and name, so the test fixtures don't change.
9. **The zero-team dashboard** tells a super admin to create the first team and links to `/admin/teams`. Everyone else keeps today's message.

**Keep.** These are still reached by fresh data, or are cheap guards:

- the retired-model-ID mechanism and its two current IDs;
- null-stamp handling and null revision pointers;
- the headline Topic fallback;
- the full-URL export passthrough and the restore re-render;
- the incompatible-provider filters and the email login path;
- `promote-super-admin.mjs` and `seed-cli-provider.mjs`;
- every applied migration.

**Docs to update:**

- `CLAUDE.md`;
- `docs/handoff.md`: the 012 runbook, the transfer section, the 008 rollback and the copy-edit heal;
- `docs/e2e-test-plan.md`: §W, §Y and the AC maps;
- `docs/mcp-acp-guide.md`.

## Scope

### In Scope

Items 1–9, with their tests and docs.

### Out of Scope

- Editing or deleting any applied migration. They all stay; the data-healing ones do nothing on a fresh DB.
- The demo seed content, such as Hearts Talk. It keeps working because the seeds create the team.
- Every item in the "Keep" list.

## Impact

- **Size:** bounded. Existing flows lose their legacy branches; there are two new migrations and no new subsystem.
- **Files affected:** about 45 (estimated). About half are tests and docs.
- **Complexity:** medium
- **Risk:** medium. The migration drops three columns, which is irreversible on a database that still holds legacy captions. That is why the column drop guards itself (open question 1).

## Open Questions

1. **Should the column-drop migration refuse to run (raise) when any draft still has legacy caption text and no caption rows?** The alternative is silently dropping legacy text. **Decided (orchestrator, 2026-10-13): yes.** A fresh DB never trips the check; an old DB fails the deploy loudly instead of losing captions.
