# Tasks: Make the adopted fork code deployable over company prod data

**Change:** 022-prod-data-and-deploy-restore · **Size:** bounded

## Summary

This change has **4 tasks in 3 waves**. Run them one at a time:

1. an implementer subagent does the task;
2. `specclaw:code-reviewer` reviews it;
3. the orchestrator re-runs tsc, lint and unit, then commits.

No real model calls. Never run two implementers in this checkout. Use `export MSYS_NO_PATHCONV=1` before any docker command that takes a container path.

## Tasks

### Wave 1 — Migration, boot and CI

- [x] `T1` — The carry-over migration, the archive model and the upgrade-path test
  - Files: `prisma/migrations/20261012130000_legacy_caption_carryover/migration.sql` (new), `prisma/schema.prisma`, `scripts/test-upgrade-path.mjs` (new), `package.json`, `.github/workflows/e2e.yml`
  - Estimate: large
  - Kind: migration
  - Depends: none
  - Notes:
    - **Covers:** FR-01, FR-02 and FR-03; AC-01–AC-05.
    - **Seed SQL:** build it against `main`'s schema (`git show origin/main:prisma/schema.prisma`) for the step-2 rows, and against `20261012120000` for the step-3 rows.
    - **Atomicity:** prove it with scenario 3. Do not assume it.
    - **Commands:**
      - run `npm run test:upgrade` locally against the docker Postgres;
      - then `npx prisma migrate deploy` on the dev and test databases, which must be a no-op apply (scenario 2's shape);
      - then the targeted E2E captions suite.
    - **Report:** paste the scenario PASS lines and the scenario-3 guard message into `reports/T1.md`.
    - Add the CI step to the `e2e` job only.

- [x] `T2` — The env preflight before migrate, the catalogue comment and the restored deploy workflow
  - Files: `src/scripts/env-preflight.ts` (new), `Dockerfile`, `docker-entrypoint.sh`, `src/lib/models/catalogue.ts`, `.github/workflows/docker-publish.yml` (restored), `.github/workflows/e2e.yml`
  - Estimate: medium
  - Kind: config
  - Depends: T1
  - Notes:
    - **Covers:** FR-04, FR-05 and FR-06; AC-06–AC-08.
    - **Restore the workflow** with `git checkout a3cecda^ -- .github/workflows/docker-publish.yml`. Do not edit it.
    - **In `e2e.yml`:** rewrite the header comment, and add the preflight step to the `build` job after "Docker image build".
    - **Prove the preflight two ways:**
      - locally, bundle with esbuild to the scratch folder and run it with both `CLAUDE_CLI_MODEL` values;
      - build the image (`docker build -t bistec-studio:022 .`) and run the FR-04 container checks, if docker is available.
    - **Run actionlint** through docker.

### Wave 2 — Docs

- [x] `T3` — The repo rules, the fork history and the pre-merge prod checklist
  - Files: `CLAUDE.md`, `docs/handoff.md`, `docs/fork-history.md` (new)
  - Estimate: medium
  - Kind: docs
  - Depends: T2
  - Notes:
    - **Covers:** FR-07 and FR-08; AC-09 and AC-10.
    - **What to move:**
      - `CLAUDE.md`: the entries from "🍴 2026-10-07 — THIS REPO IS NOW THE FORK" (about line 177) up through "⏸️ 2026-10-14" (line 7);
      - `docs/handoff.md`: the sections from "🍴 2026-10-07 — moved to the fork" (about line 822) up through "⏸️ 2026-10-14" (line 10), except the 008 and 016 runbooks, which stay. The 012 runbook moves.

      Prefix each moved heading with "[fork context, superseded]", and change nothing else in the moved text.

    - **Keep in `CLAUDE.md`:** the "Key reference documents" and "Architecture decisions" sections.
    - **The remotes are as `git remote -v` shows them:** `origin` = `bistec-oss/studio` (push allowed to `v2` only), `fork` = `EnderGuardian25/ai-studio` (push `DISABLED`). There is no `upstream`.
    - **The new top entry states:**
      - the pick-up point: 022 built, waiting on the FR-08 operator steps and the user's go-ahead;
      - the 018 resume point (T1 FR-04, `reports/T1-wip.md`) and the 019/020/021 queue.
    - **Run the AC-09 greps** and paste them into the report.

### Wave 3 — Gate

- [x] `T4` — Full gate and CI
  - Files: `docs/handoff.md`, `CLAUDE.md`
  - Estimate: small
  - Kind: test
  - Depends: T3
  - Notes:
    - **Covers:** AC-11.
    - **Prepare for the full run:**
      - stop stray node processes;
      - `rm -rf .next`;
      - drop and recreate the test database (`npm run test:e2e:db`).
    - **Then run:**
      - `npm run test:e2e:serve` and `npm run test:e2e:mock`, for a full clean mock E2E with 0 failures;
      - tsc, `npm run lint`, `npm run test:unit`, `npm run build` and `npm run test:upgrade`;
      - `rm -rf .next` after the build.
    - **Push `v2` to `origin`** (never `main`), and watch CI until it is green, including the new upgrade-path and preflight steps. Record the run ID and gate numbers in `CLAUDE.md` and `docs/handoff.md`.
