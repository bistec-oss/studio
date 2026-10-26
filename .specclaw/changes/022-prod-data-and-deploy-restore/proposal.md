# Proposal: Make the adopted fork code deployable over company prod data

**Created:** 2026-10-18
**Status:** 🟡 Draft

## Problem

On 2026-10-18 this repo (`bistec-oss/studio`) adopted the fork `EnderGuardian25/ai-studio` `v2` by fast-forward (`c82fdb08` → `1c38dbb9`). The fork was built for a **fresh, separate system** with no deploy target. This repo deploys to company prod (`studio.bistecglobal.com`), which holds real data (the Hearts Academy team, kit and IRP campaign posts). The user decided on 2026-10-18 to **keep prod data working**. Four fork decisions conflict with that.

1. **Legacy captions would block the deploy.** Prod drafts store their caption in `Draft.copyText`. Fork 012 converted these at boot: `prisma migrate deploy` added `DraftCaption` and then `docker-entrypoint.sh` ran `dist/scripts/backfill-captions.js` (the TypeScript split planner). Fork 016 T2 (`4900682`) removed that backfill and added migration `20261013120000_drop_legacy_captions`. That migration raises an exception when any draft has `copyText` and no `DraftCaption` rows. On prod, `migrate deploy` applies 012 and 016 in one run, before any boot step, so every legacy draft trips the guard. The entrypoint's `set -e` then fails the boot, and the deploy never comes up.
2. **No deploy workflow.** Fork 013 T1 (`a3cecda`) deleted `.github/workflows/docker-publish.yml`: the GHCR push, the Coolify redeploy of both resources and the `/api/health` commit check (004 Phase 0, PR #42). When `v2` merges to `main`, nothing would build or deploy.
3. **The docs forbid this repo.** `CLAUDE.md` and `docs/handoff.md` now say this repo is the fork, `origin` is the fork, and `bistec-oss/studio` must never be pushed to. Here `origin` is `bistec-oss/studio`, and the user allows pushes to `v2` (never `main`). The company prod items (B4, team tokens, Coolify token, MinIO → silo) are marked "company history, not to-dos", but here they are live.
4. **Other fresh-start assumptions may hit prod.** These need a check before merge:
   - 008 makes `CLAUDE_CLI_MODEL` a validated system default. `default` or any value that is not a catalogue key or current ID **fails the boot**. Prod's value is not known.
   - 016 removed the read-time copy-edit status heal (`src/lib/drafts/recovery.ts`). Migration `20260728120000` already healed prod in bulk, so this is probably safe.
   - 016 removed the `copyText` alias from MCP `get_draft`/`generate_post` and `POST /api/generate/copy`. External MCP/ACP callers that read it would break.
   - 016's `20261013130000_drop_empty_default_team` deletes the "Bistec" team only when it has no members and no rows. Prod's team has both, so it stays.

## Proposed Solution

1. **Convert legacy captions before the drop.** Planning picks one mechanism, after reading the removed 012 planner (`git show 4900682^:src/lib/captions/backfill.ts` and `migrationPlan.ts`). Candidates:
   - **(a)** A new SQL migration, ordered before `20261013120000`, that writes `DraftCaption` rows from `copyText`. It must be a no-op where `copyText` is already gone, so databases that already applied 016 stay valid.
   - **(b)** Restore the TypeScript backfill and run it between two `migrate deploy` stages, or make the drop migration's guard a separate step that runs after the backfill.

   Either way, no caption text is lost. The 016 guard stays as the last line of defence. A dry-run on a copy of prod data proves it before any deploy.

2. **Restore `docker-publish.yml`** from `a3cecda^`, with its main-only trigger, the main-only dispatch guard, the Coolify redeploy of both resources and the `/api/health` commit verification. Revert 013's `GIT_SHA` comment rewording in `Dockerfile`, `src/app/api/health/route.ts` and `src/lib/env.ts` to name the workflow. Keep `e2e.yml` running on `v2`.
3. **Rewrite the repo rules in the docs.** `CLAUDE.md` and `docs/handoff.md` get a new top entry:
   - this repo is `bistec-oss/studio`, and `origin` points to it;
   - development continues on `v2` and pushes to `origin v2` are allowed;
   - never commit or push to `main`; `v2` → `main` is one PR, merged only on the user's go-ahead;
   - the fork `EnderGuardian25/ai-studio` is the source of the adopted code, fetched as `fork/*`;
   - the company prod items (B4, team tokens, Coolify token, MinIO → silo, PR #43 never merged) are live again.

   The fork's history entries stay, marked as fork context.

4. **Pre-merge prod checklist** in `docs/handoff.md`: the `CLAUDE_CLI_MODEL` value, external `copyText` callers, the migration list since `main`, and the 005 NFR-03 release note.

## Scope

### In Scope

Items 1–4, with tests for the caption conversion (unit and an E2E case built on a legacy-shaped draft) and the docs.

### Out of Scope

- Merging `v2` into `main`, or deploying. That waits on the user's go-ahead.
- Rotating the Coolify token or swapping prod MinIO. Those are ops tasks for the Coolify administrator.
- Reverting other 016 removals beyond what item 1 needs, unless the item-4 check finds a real prod caller.
- The Graphite re-theme (change 021).

## Impact

- **Size:** bounded. It alters existing flows: the migration chain, the boot path, a workflow file and docs. No new subsystem.
- **Files affected:** about 12 (estimated).
- **Complexity:** medium
- **Risk:** high. A wrong caption conversion loses prod text, and a wrong migration fails the prod deploy. The dry-run on prod-shaped data is the gate.

## Open Questions

1. **Conversion mechanism:** SQL migration (a) or restored TypeScript backfill (b)? (a) keeps one `migrate deploy`, but SQL cannot easily repeat the 012 channel-split planner, so it may only copy the whole caption to each channel. (b) keeps the split quality but changes the boot sequence. Default: (b), if planning confirms the planner splits real prod captions better.
2. **Prod data copy:** can the user provide a `pg_dump` of prod (or the Hearts Academy rows) for the dry-run? Without it, the test uses synthetic legacy drafts only.
3. **`CLAUDE_CLI_MODEL` on prod:** what is it set to in Coolify? If it is `default`, the deploy needs an env change at the same time.
4. **The fork remote:** keep `fork` as a named remote for future pulls, or drop it once adopted? Default: keep it.

### Party panel (2026-10-18, tier deep, CHANGES_REQUESTED, advisory) — upheld findings

- (party-po, BLOCK) Cheaper variant (a) not priced; the do-nothing option is not priced either.
- (party-po) The workflow restore has no cut line, and the `GIT_SHA` comment reverts have no value.
- (party-po) Item 4 is open-ended; cap it at a checklist.
- (party-po, NOTE) Open questions 3 and 4 are cheap to answer now.
- (party-ba, BLOCK) Prod's data shape is asserted, not observed.
- (party-ba) "Correct conversion" is undefined.
- (party-ba) The item-4 checks have no evidence source.
- (party-ba) No acceptance criteria.
- (party-ba, NOTE) The decision has no source and "working" is undefined.
- (party-security, BLOCK) The guard checks presence, not content, and the drop is irreversible.
- (party-security, BLOCK) The dry-run silently falls back to synthetic data.
- (party-security, BLOCK) A boot failure after the destructive migration leaves no working rollback.
- (party-security) A staged backfill runs outside the migration lock.
- (party-security) The fork stays a standing pull source into an auto-deploy repo.
- (party-security, NOTE) Kept fork entries still read as instructions.
- (party-security, rebuttals) Keep `CLAUDE_CLI_MODEL` fail-closed; "keep the remote" needs a condition.
- (party-architect, BLOCK) Option (b)'s co-changes are not named.
- (party-architect) The conversion and guard predicates are not tied together.
- (party-architect) The legacy-draft test has no seam.
- (party-architect) Contradicting doc rules stay below the new entry.
- (party-architect, NOTE) (a) converts prod differently from 012; items 1 and 2 must ship together.
- (party-architect, rebuttals) The workflow restore is not independent; (a) needs a part-way-migrate harness.
- (party-visionary) Lifetime cost of each mechanism on the migration chain.
- (party-visionary) Dropping `copyText` after a split makes the split rule permanent.
- (party-visionary) Fork imports need a reusable procedure.
- (party-visionary) `CLAUDE_CLI_MODEL` ties Coolify env to the catalogue long term.
- (party-visionary) The repo rules live in two files.
- (party-visionary) A hand-kept migration list goes stale.
- (party-visionary, NOTE) Build an upgrade-from-`main` CI step.

### Panel rulings (orchestrator, 2026-10-18, under the user's delegation to make judgement calls)

1. **Mechanism: (a), a SQL carry-over migration.** It sorts before `20261013120000` and is conditional on `Draft.copyText` existing (a `DO` block on `information_schema.columns`), so a database that already dropped the column skips it. It writes one `DraftCaption` row per channel the plan defines, with the whole `copyText`. It is chosen over (b) because the boot sequence stays one `migrate deploy`, there is no generated-client drift (visionary), it runs under Prisma's own migration lock (security), and the original text stays recoverable (visionary). The migration header records why it is back-dated and that it is conditional. Prod is deliberately converted by copy, not by the 012 split (architect NOTE). Users can edit each channel afterwards.
2. **Content guard and archive.** The same migration copies `(draftId, copyText)` into a retained `LegacyCaptionArchive` table, which is never dropped. It raises if any converted draft has a channel row whose text is not exactly `copyText`. The selection predicate is "`copyText` is not null and the draft has zero `DraftCaption` rows". That is exactly 016's guard predicate, so after this migration 016's guard cannot trip. A draft with an empty `copyText` gets empty READY rows; the plan decides this against the 012 planner's EMPTY case. Applied migration files are never edited.
3. **Test seam:** `scripts/test-upgrade-path.mjs` creates a scratch DB and applies the migrations up to the carry-over migration. It then seeds legacy drafts with raw SQL, including multi-channel, hashtag, Sinhala, empty and already-captioned cases. Next it runs `migrate deploy` to head and asserts that the captions equal the source, the archive is complete and 016's drop succeeded. It becomes a CI step in `e2e.yml` (visionary NOTE).
4. **Boot order:** the entrypoint runs a bundled env preflight (the same zod validation as `src/lib/env.ts`) before `migrate deploy`, so a bad `CLAUDE_CLI_MODEL` or any other env error stops the boot before any schema change. It stays fail-closed (security rebuttal). A comment beside `src/lib/models/catalogue.ts` says that removing or renaming a catalogue entry requires checking prod's `CLAUDE_CLI_MODEL`.
5. **Prod data (user, 2026-10-18):** no dump, so the dry-run is synthetic. That is recorded as a **named waiver** in `docs/handoff.md`, by the user, 2026-10-18. The pre-merge checklist **requires** three operator steps before the merge, and the merge stays blocked until they are done:
   - take a `pg_dump` backup of prod;
   - run the legacy-count query on prod;
   - state the recovery: restore the backup and redeploy the previous SHA, because rolling back the image alone does not work.
6. **`CLAUDE_CLI_MODEL` (user, 2026-10-18):** prod sets a catalogue key, so the boot passes.
7. **Workflow:** restore `docker-publish.yml` only. The `GIT_SHA` comment reverts are dropped. Its first real run is the `v2` → `main` merge, which also carries item 1, so its acceptance is a YAML/actionlint check, not a deploy.
8. **Item 4 is a checklist only.** Any revert of a 016 removal becomes its own change. The migration list is produced by `git diff --name-only main v2 -- prisma/migrations`, never kept by hand.
9. **Docs:** `CLAUDE.md` is authoritative for the repo rules, and `docs/handoff.md` links to it. The fork-era entries move to `docs/fork-history.md`, each heading prefixed "[fork context, superseded]", and `CLAUDE.md` links that file without inlining it.
10. **Fork remote:** keep it, push disabled. Fork code arrives only as a reviewed PR into `v2`, never by fast-forward. A reusable "importing from the fork" procedure in `docs/fork-history.md` names the checks by class: drop or guard migrations, workflow deletions, boot-validated env, removed API fields. The 2026-10-18 fast-forward was the one-time adoption, done on the user's explicit instruction.
11. **Do-nothing cost:** prod stays on `main` and never gets 008–020. The user rejected that by asking to continue the build on `v2`.
