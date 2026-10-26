# Spec: Make the adopted fork code deployable over company prod data

**Change:** 022-prod-data-and-deploy-restore · **Size:** bounded · **Proposal:** [proposal.md](proposal.md) (the "Panel rulings (orchestrator, 2026-10-18)" 1–11 are binding)

## Overview

`v2` now carries the fork's 008–020 work, which assumed a fresh database and no deploy target. Company prod (`studio.bistecglobal.com`) runs `main` (`671ad6e9`, migration head `20260728120000_heal_copy_edit_clobbered_drafts`) and holds real drafts whose caption lives in `Draft.copyText`. Merged as-is, `v2` would fail prod's boot in two ways, and nothing would deploy it:

1. **016's guard.** `20261013120000_drop_legacy_captions` raises on any draft that has `copyText` and no `DraftCaption` rows. On prod that is every draft, because the 012 boot backfill that used to convert them was removed by 016.
2. **No deploy workflow.** 013 deleted `docker-publish.yml`.
3. **The docs forbid this repo.** `CLAUDE.md` and `docs/handoff.md` still say `origin` is the fork and `bistec-oss/studio` must never be pushed to.
4. **An env value can fail the boot after the schema has changed.** 008 validates `CLAUDE_CLI_MODEL` at boot, but the entrypoint migrates first.

This change converts legacy captions in SQL before 016's drop, keeps the original text in an archive, runs the env check before any migration, restores the deploy workflow, rewrites the repo rules, and adds a pre-merge prod checklist. It does not merge or deploy.

## Approach

**One decision: a back-dated, conditional SQL carry-over migration (ruling 1), proven by a scripted upgrade from `main`'s schema (ruling 3).** It copies the whole `copyText` to Instagram and LinkedIn, the two channels a `main` publish sends it to, exactly as the 012 planner's fallback did. It runs inside the one `migrate deploy`, under Prisma's lock.

File map:

- **New:** `prisma/migrations/20261012130000_legacy_caption_carryover/migration.sql`, `scripts/test-upgrade-path.mjs`, `src/scripts/env-preflight.ts` and `docs/fork-history.md`.
- **Restored:** `.github/workflows/docker-publish.yml`, from `a3cecda^`. It is byte-identical to `origin/main`'s copy.
- **Modified:** `prisma/schema.prisma`, `package.json`, `.github/workflows/e2e.yml`, `Dockerfile`, `docker-entrypoint.sh`, `src/lib/models/catalogue.ts`, `CLAUDE.md` and `docs/handoff.md`.

## Requirements

### Functional Requirements

- **FR-01 — The carry-over migration** `20261012130000_legacy_caption_carryover`. It sorts after `20261012120000_model_selection` and before `20261013120000_drop_legacy_captions`.
  - **Header.** It says that the migration is back-dated on purpose (so it lands before 016's drop on a database coming from `main`), that it is conditional, and that prod is converted by copying, not by the 012 split (ruling 1).
  - **Archive table.** It creates `LegacyCaptionArchive` every time it runs, whatever the database's state:
    - `"draftId" TEXT` is the primary key, named `LegacyCaptionArchive_pkey`;
    - `"copyText" TEXT NOT NULL`;
    - `"archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`;
    - **no foreign key to `Draft`.** The archive is a recovery record, so it must survive a draft delete and must never block one. Nothing ever drops it.
  - **Conditional.** Everything below runs only when `information_schema.columns` shows `"Draft"."copyText"` in the current schema. On a database that already dropped the column, the migration only creates the empty table.
  - **Archive copy.** Every draft whose `copyText` is not null gets one `(draftId, copyText)` row. That is all the text 016 is about to drop, including a draft that already has caption rows.
  - **Selection.** The drafts to convert are those where `copyText` is not null and that have **zero** `DraftCaption` rows. This is exactly 016's guard predicate, so after this migration 016's guard cannot trip.
  - **Rows written.** Each selected draft gets one row per `Channel` value: `INSTAGRAM`, `LINKEDIN` and `WHATSAPP`.
    - **Non-blank `copyText`:** Instagram and LinkedIn get `copyText` verbatim. It is not trimmed, because that is exactly what `main` publishes today. WhatsApp gets `''`.
    - **Blank `copyText`** (empty, or whitespace only: `~ '^\s*$'`): all three rows get `''`. This matches 012's EMPTY outcome. These include the `''` that `main` writes on a pending or failed draft.
    - **Other columns:** `status` is `'READY'`. `model` and `modelSubstitutedFrom` are NULL, meaning "unknown" (the pre-008 rule). `needsReview` and `Draft.captionMigration` keep their defaults, because 016 drops both next. The `id` is `md5('022:' || draftId || ':' || channel)`: deterministic, unique under `(draftId, channel)`, and free of any extension or Postgres-version dependency.
  - **Content guard.** After writing, it raises (`RAISE EXCEPTION '022 legacy_caption_carryover: …'`) unless all of these hold:
    - the archive has one row per non-null `copyText`, with equal text;
    - every converted draft has exactly 3 rows;
    - each row's text equals what the rule above expects, compared against the archived text.
  - **Atomic.** A raised guard leaves no rows and no archive. Either put the whole file in one transaction, or put the writes and the guard in one `DO` block; scenario 3 proves it.
- **FR-02 — The Prisma model.** `prisma/schema.prisma` gains `model LegacyCaptionArchive { draftId String @id; copyText String @db.Text; archivedAt DateTime @default(now()) }`, with a comment pointing at the migration. `Draft` gets no relation field. A head database then diffs clean against the schema.
- **FR-03 — The upgrade-path test,** `scripts/test-upgrade-path.mjs`, run as `npm run test:upgrade`.
  - **Setup.**
    - It takes the server from `DATABASE_URL` (CI's env, or the `.env.test` line parse that `setup-test-db.mjs` uses) and swaps in the database name `bistec_studio_upgrade`. It refuses to run, with a non-zero exit, if the resulting name is anything else.
    - It creates the scratch database through the `postgres` maintenance database, using `@prisma/client` raw SQL. There is no `docker exec`, so it works in CI.
    - It drops the scratch database (`WITH (FORCE)`) before each scenario and in a `finally`.
    - It never touches `bistec_studio` or `bistec_studio_test`.
  - **Partial migrate.** To apply only some migrations, it copies `schema.prisma`, `migration_lock.toml` and the chosen migration directories into a temporary folder. It then runs `npx prisma migrate deploy --schema <tmp>/schema.prisma`.
  - **Scenario 1, the prod path.**
    1. Migrate to `main`'s head, `20260728120000` (a named constant).
    2. Seed prod-shaped rows with raw SQL: a team (`team_bistec_default`), a user, briefs and drafts. The drafts cover:
       - a caption with "Instagram:" and "LinkedIn:" headers (which 012 would have split);
       - hashtags and emoji;
       - Sinhala;
       - a CRLF caption with trailing whitespace;
       - one of about 3,000 characters;
       - `''` on an `IN_PROGRESS` draft;
       - whitespace only;
       - one draft with a `SCHEDULED` post.
    3. Migrate to `20261012120000`. Seed one draft that already has captions (`copyText` plus 3 rows) and one post-012 draft (`copyText` NULL plus rows).
    4. Run the full `migrate deploy` to head.
    5. Assert, in JavaScript against the seeded source strings:
       - every legacy draft has exactly 3 READY rows, with the expected text per FR-01 and a null `model`;
       - the archive has one row per non-null `copyText`, each equal to its source;
       - the already-captioned and post-012 drafts' rows are unchanged, and the post-012 draft has no archive row;
       - the post is untouched;
       - `Draft.copyText` is gone;
       - `20261013120000` and `20261013130000` are recorded with `finished_at` set;
       - `team_bistec_default` still exists, because it has rows;
       - the head Prisma client reads every draft with `captions` and no error.
  - **Scenario 2, already dropped.** Apply every migration except the carry-over, then run the full deploy. It exits 0, the carry-over is recorded as applied, and the archive exists and is empty.
  - **Scenario 3, the guard bites.**
    1. Migrate to `main`'s head and seed one legacy draft.
    2. Deploy to head with a temporary copy of the carry-over, patched by one exact string replacement (asserted to hit once) so that it writes the wrong text.
    3. Assert that the deploy exits non-zero with the `022 legacy_caption_carryover` message, `copyText` still exists, the draft has zero `DraftCaption` rows and there are no archive rows (atomic), and `20261013120000` is not applied.
  - **Schema diff.** After scenario 1, `npx prisma migrate diff --from-url <scratch> --to-schema-datamodel prisma/schema.prisma --exit-code` exits 0.
  - **Output.** It prints one PASS or FAIL line per scenario and exits non-zero on any failure.
  - **CI.** `e2e.yml`'s `e2e` job runs it as a step after "Prisma generate + migrate" (ruling 3).
- **FR-04 — The env preflight runs before any migration** (ruling 4).
  - `src/scripts/env-preflight.ts` imports `@/lib/env`, the same zod schema and production checks the app runs. It prints `[preflight] environment ok`. On any validation error it prints the error and exits 1.
  - The `Dockerfile` bundles it with the same esbuild flags as the worker, to `dist/scripts/env-preflight.js`, which the existing `COPY dist` step carries.
  - `docker-entrypoint.sh` runs `node dist/scripts/env-preflight.js` **before** the `SKIP_MIGRATIONS` branch, so it runs every time, under `set -e`. The script header says why.
  - It stays fail-closed, with no skip flag.
  - The CI `build` job gains one step on the built image, with `--network none` and validly shaped dummy env:
    - with `CLAUDE_CLI_MODEL=default`, the container exits non-zero, its output names `CLAUDE_CLI_MODEL`, and it does **not** contain `[entrypoint] applying pending Prisma migrations`;
    - with `CLAUDE_CLI_MODEL=sonnet`, its output has the preflight ok line before the applying line. The migrate then fails on the unreachable database, which the step expects.
- **FR-05 — The catalogue comment.** The header of `src/lib/models/catalogue.ts` says that the env preflight blocks prod's boot when prod's `CLAUDE_CLI_MODEL` names a key or `apiId` that is no longer accepted. So removing or renaming a key, or retiring an `apiId` into `previousApiIds`, requires checking prod's Coolify `CLAUDE_CLI_MODEL` first.
- **FR-06 — The deploy workflow is restored as-is** (ruling 7).
  - `.github/workflows/docker-publish.yml` is restored from `a3cecda^`, with every job and step unchanged: main-only trigger and dispatch guard, GHCR push with `GIT_SHA`, both Coolify redeploys, and the `/api/health` and scheduler verification.
  - The `GIT_SHA` comment rewordings are not reverted.
  - `e2e.yml`'s header comment drops the fork wording ("In the fork… the fork's only workflow"). It says instead that `e2e.yml` gates PRs and pushes to `v2` and `main`, and that `docker-publish.yml` deploys `main`.
- **FR-07 — The repo rules** (rulings 9 and 10).
  - **`CLAUDE.md` gets a new top entry, which is authoritative.** It says:
    - this repo is `bistec-oss/studio`, and `origin` points to it;
    - work continues on `v2`, and pushes to `origin v2` are allowed;
    - never commit or push to `main`; `v2` → `main` is one PR, merged only on the user's go-ahead, after the FR-08 checklist;
    - `fork` (`EnderGuardian25/ai-studio`) is fetch-only, with push `DISABLED`, and fork code arrives only as a reviewed PR into `v2`, never by fast-forward. The 2026-10-18 fast-forward was the one-time adoption, done on the user's explicit instruction;
    - the company prod items are live again: B4, team tokens, the Coolify token, MinIO → silo, and the rule that draft PR #43 is never merged.

    It also carries the current pick-up state (018 resume point, gates) and links `docs/fork-history.md` without inlining it.

  - **Moved to `docs/fork-history.md`:**
    - the `CLAUDE.md` entries from "🍴 2026-10-07 — THIS REPO IS NOW THE FORK" through "⏸️ 2026-10-14";
    - the `docs/handoff.md` sections from "🍴 2026-10-07 — moved to the fork" through "⏸️ 2026-10-14", and the obsolete 012 runbook.

    Each moved heading starts with "[fork context, superseded]". Moved content is not edited beyond that.

  - **Stay in `docs/handoff.md`:** the 008 runbook and the 016 runbook. The 016 runbook's "FRESH SYSTEMS ONLY" text is rewritten: a database coming from `main` is converted by the carry-over first.
  - **`docs/handoff.md` header.** Its lines 3–6 (repo, branch, production) are rewritten to match, and it links to `CLAUDE.md` for the repo rules.
  - **Import procedure.** `docs/fork-history.md` opens with a reusable "Importing from the fork" procedure. It lists the checks by class: migrations that drop or guard data, workflow deletions, env validated at boot, and removed API fields.
- **FR-08 — The pre-merge prod checklist** in `docs/handoff.md` (rulings 5, 6 and 8).
  - **The named waiver:** "No prod dump; the dry-run used synthetic data only (scenarios 1–3)". Waived by the user, 2026-10-18.
  - **Three operator steps that block the merge:**
    1. a `pg_dump` backup of prod;
    2. the legacy-count query, given verbatim:

       ```sql
       SELECT count(*) FILTER (WHERE "copyText" IS NOT NULL) AS legacy,
              count(*) FILTER (WHERE status = 'IN_PROGRESS' OR "pendingAction" IS NOT NULL) AS in_flight
       FROM "Draft";
       ```

       `in_flight` must be 0 at deploy time;

    3. the recovery: restore the backup and redeploy the previous SHA, because rolling back the image alone does not work once `copyText` is dropped. If the carry-over migration itself fails, the previous container keeps serving. Then run `prisma migrate resolve --rolled-back 20261012130000_legacy_caption_carryover` before retrying.
  - **After the deploy:** archive count = `legacy`, and caption rows = 3 × `legacy`.
  - **`CLAUDE_CLI_MODEL`:** the user said on 2026-10-18 that it is a catalogue key. Re-read it in Coolify at merge time.
  - **External `copyText` callers:** the removed fields are listed (MCP `get_draft` and `generate_post`, ACP `generate_post`, `POST /api/generate/copy`). The operator confirms there is no external caller, using the `/team` API keys and their last use. Any revert of these removals is its own change.
  - **The migration list** comes from `git diff --name-only origin/main origin/v2 -- prisma/migrations`, never kept by hand.
  - **The 005 NFR-03 release note.**
  - **The deploy window.** Between the drop and cutover, the old container's draft reads fail. Deploy at a quiet time.

### Non-Functional Requirements

- **NFR-01:** no change to app runtime behaviour. Only the migration, the archive model, the boot preflight, the workflows, one comment and the docs change. `src/lib/captions/*` is untouched.
- **NFR-02:** no real model calls anywhere, including the tests.
- **NFR-03:** applied migration files are never edited. `git diff --name-only 8cbd78c -- prisma/migrations` lists only the new directory.
- **NFR-04:** the boot stays: preflight, then one `migrate deploy`, then `exec`. There are no new env vars, and `SKIP_MIGRATIONS` means what it did.
- **NFR-05:** the upgrade test leaves no scratch database and no temporary folder behind, whether it passes or fails. It runs in under 2 minutes locally.
- **NFR-06:** after this change, no doc line tells an agent to avoid pushing to `origin v2` or calls `origin` the fork.

## Acceptance Criteria

- **AC-01 (FR-01, FR-03):** `npm run test:upgrade` exits 0, and scenario 1 prints PASS with every assertion in FR-03 scenario 1.
- **AC-02 (FR-01):** scenario 2 prints PASS: the carry-over is a no-op on a database that already dropped `copyText`.
- **AC-03 (FR-01):** scenario 3 prints PASS: the patched migration fails the deploy with the 022 message and leaves no partial write, and 016 is not applied. Record the guard message in the task report.
- **AC-04 (FR-02):** `npx prisma validate` passes, and the in-script `prisma migrate diff … --exit-code` exits 0.
- **AC-05 (FR-03, NFR-03, NFR-05):**
  - a review confirms the script hard-codes `bistec_studio_upgrade` and asserts the derived name before it connects;
  - after a run, `SELECT 1 FROM pg_database WHERE datname = 'bistec_studio_upgrade'` returns no rows;
  - `git diff --name-only 8cbd78c -- prisma/migrations` shows only the new directory.
- **AC-06 (FR-04):**
  - locally, with esbuild bundling the preflight to a scratch file and `NODE_ENV=production` with validly shaped env: `CLAUDE_CLI_MODEL=default` exits non-zero, and its stderr contains `CLAUDE_CLI_MODEL`; `CLAUDE_CLI_MODEL=sonnet` exits 0;
  - `sh -n docker-entrypoint.sh` passes;
  - the CI `build` job's preflight step passes both cases in FR-04.
- **AC-07 (FR-05):** a review confirms the catalogue comment.
- **AC-08 (FR-06):**
  - `git diff --exit-code origin/main -- .github/workflows/docker-publish.yml` exits 0;
  - `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.7` exits 0 over `.github/workflows/` (with `MSYS_NO_PATHCONV=1` on Windows);
  - `grep -ci fork .github/workflows/e2e.yml` prints 0.
- **AC-09 (FR-07, NFR-06):**
  - `grep -n -i "never push\|must never be pushed\|fetch-only\|DISABLED-company\|origin\` = the fork" CLAUDE.md docs/handoff.md`matches nothing outside the new rules entry. The new entry's "fetch-only" for`fork` is allowed;
  - every `^#` heading in `docs/fork-history.md` below the procedure starts with `[fork context, superseded]`;
  - the procedure names the four check classes;
  - `CLAUDE.md` and `docs/handoff.md` each link `docs/fork-history.md`, and `docs/handoff.md` links `CLAUDE.md` for the rules.
- **AC-10 (FR-08):** a review confirms the checklist:
  - the named waiver, with "user, 2026-10-18";
  - the three blocking operator steps, with the SQL verbatim;
  - the post-deploy counts;
  - the `CLAUDE_CLI_MODEL`, `copyText` and migration-list items, the release note and the deploy-window note.
- **AC-11 (gate):**
  - tsc clean; lint 0 errors; unit all pass; `npm run build` passes;
  - a full clean mock E2E with 0 failures;
  - CI green on `v2`, including the new upgrade-path and preflight steps.

## Edge Cases

- **A draft with captions and a `copyText`** (a database that ran 012's boot backfill): it is not converted, its rows are unchanged, and its text is still archived.
- **A post-012 draft** (`copyText` NULL): not touched and not archived.
- **An `IN_PROGRESS` draft or a pending `REGENERATE_COPY`.** 012 deferred these, and SQL converts them. The checklist requires `in_flight = 0` at deploy. A run that was cut off is swept to FAILED by the existing 15-minute rule and can be retried.
- **A Brief whose `channels` is only one feed** still gets both feed rows, as in 012. Users edit each channel afterwards.
- **A whitespace-only caption** becomes `''` on every channel. The publish resolver already refuses blank text, and the archive keeps the original.
- **`Draft.headline` stays NULL,** so design falls back to the brief topic. That is the existing rule.
- **Archive rows outlive a deleted draft,** by design (no foreign key). They hold caption text only.
- **The scheduler resource also boots through the preflight.** A scheduler with incomplete env now stops at the preflight with a readable error instead of later.
- **The fork-era dev and test databases** (this machine's, CI's) already applied 016. They get the carry-over as an out-of-order no-op on their next `migrate deploy` (scenario 2).

## Assumptions

- **A1:** `prisma migrate deploy` (Prisma 5) applies a back-dated migration that was never applied on a database that already applied later ones. Scenario 2 proves this; if it does not hold, stop and re-plan.
- **A2:** prod is at `main`'s migration head with no `DraftCaption` table. Every prod draft has a non-null `copyText`, which is `NOT NULL` on `main`. The operator's legacy-count query confirms this before the merge.
- **A3:** prod's `CLAUDE_CLI_MODEL` is a catalogue key (user, 2026-10-18). Prod's other env passes `v2`'s `env.ts`, which differs from `main`'s only in that validation.
- **A4:** a whole-caption copy is acceptable for prod's posts (ruling 1). Users can edit each channel afterwards.
- **A5:** the local and CI Postgres are version 13 or later (the test's `DROP … WITH (FORCE)`). The migration itself uses only `md5` and plpgsql.

## Waiver

**Prod-data dry-run waived (user, 2026-10-18).** No prod dump exists, so the upgrade test uses synthetic prod-shaped data only. FR-08's three operator steps are the compensating control, and they block the merge.

## Dependencies

- 016 (`20261013120000`, which the carry-over precedes) and 008 (the `CLAUDE_CLI_MODEL` validation).
- There is no code overlap with 018 or 021, but only one change builds in this checkout at a time.
- Merging and deploying are out of scope.

## Notes

- The carry-over is the only data change. 016's guard stays as the last line of defence.
- The rulings' "copy, not split" is deliberate. The archive keeps the source, so a better split could be applied later as its own change.
