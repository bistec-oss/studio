# Tasks: Scheduler heartbeat

**Change:** 023-scheduler-heartbeat · **Size:** bounded
**Created:** 2026-10-21
**Total Tasks:** 3

## Summary

This change has **3 tasks in 3 waves**:

1. the table, its migration and its down script;
2. the worker writes, the pure helper, the route, the banner, the retry reason, the test seam and the tests;
3. the docs, the ROADMAP refresh, the full gate and CI.

## Process / Gates

- **One task at a time:**
  1. an implementer subagent does the task;
  2. `specclaw:code-reviewer` reviews it;
  3. the orchestrator re-runs tsc, `npm run lint` and `npm run test:unit`, then commits.

  Never run two implementers in this checkout.

- **No real model calls.**
- **The databases are shared.** Never run a prisma or DB command without an explicit `DATABASE_URL` that points at `bistec_studio_test` or a named scratch database. `bistec_studio` is never touched. Use `export MSYS_NO_PATHCONV=1` before any docker command that takes a container path.
- **Baselines (020 T2, 2026-10-20):**
  - unit 2681/2681;
  - lint 0 errors / 7 warnings;
  - full clean mock E2E 399/3/0/0.

  A task may add unit cases; it may not lower the pass count or add a lint warning.

- **No open questions.** The user resolved the proposal's two on 2026-10-21 (queue panel only; 3 minutes).

## Tasks

### Wave 1 — Migration

- [x] `T1` — The `WorkerHeartbeat` table, its migration and the down script
  - Files: `prisma/schema.prisma`, `prisma/migrations/20261021120000_worker_heartbeat/migration.sql` (new), `prisma/rollback/023-scheduler-heartbeat.down.sql` (new)
  - Estimate: small
  - Kind: migration
  - Depends: none
  - Notes:
    - **Covers:** FR-01; AC-01.
    - **Write the migration by hand.** Follow the 008 and 019 header style (additive only; the previous image keeps working; it names the down script), and the 016 down script's shape: a manual header, `IF EXISTS`, and the L24 `DELETE FROM "_prisma_migrations"` for its own row. Copy `prisma/rollback/019-draft-action-claim-token.down.sql` for the layout.
    - **The model** is exactly the one in `spec.md` FR-01, with its comment. Do not add a `lastError` column.
    - **Prove it on `bistec_studio_023_scratch` only,** created and dropped through `docker exec designer-postgres-1 psql -U bistec -d postgres`:
      1. `migrate deploy`;
      2. the down script (`psql -v ON_ERROR_STOP=1`);
      3. `migrate deploy` again, which re-applies the migration;
      4. `prisma migrate diff … --exit-code`.
    - **Then:** `npx prisma generate`, `npx prisma validate` and `npm run test:upgrade` (3/3 PASS).
    - **Report:** paste the outputs into `reports/T1.md`, with the scratch database's `pg_database` check showing it is gone.
    - The app does not use the table yet, so tsc and unit stay green. `git diff --name-only d2eda29 -- prisma/migrations` lists only the new directory.

### Wave 2 — The heartbeat, end to end

- [x] `T2` — The worker writes, the pure health function, the route, the banner, the retry reason, the test seam and the tests
  - Files: `src/lib/scheduler/heartbeatStatus.ts` (new), `src/lib/scheduler/heartbeat.ts` (new), `src/scheduler/worker.ts`, `src/app/api/scheduler/status/route.ts` (new), `src/app/api/test/worker-heartbeat/route.ts` (new), `src/lib/api-types.ts`, `src/components/campaigns/ScheduledQueueSection.tsx`, `tests/unit/heartbeatStatus.test.ts` (new), `tests/unit/heartbeat.test.ts` (new), `tests/unit/schedulerStatusRoute.test.ts` (new), `tests/e2e/scheduler-heartbeat.test.ts` (new)
  - Estimate: medium
  - Kind: impl
  - Depends: T1
  - Notes:
    - **Covers:** FR-02 to FR-07, NFR-01, NFR-02, NFR-06, NFR-07; AC-02 to AC-09 (AC-09's full-suite half is T3's gate).
    - **`heartbeatStatus.ts` is pure:** no prisma, no Next, no `Date.now()` (it takes `now`). `loopHealth`, the two constants, `schedulerOffline`. The AC-02 table of boundaries is the unit test; copy it. The `TICK_CEILING_MS.generation >= 2 * GENERATION_LEASE_MS` test imports the exported `GENERATION_LEASE_MS`; mock `@/lib/prisma` as `generationRunner.test.ts` does.
    - **`heartbeat.ts`** holds `recordTickStart`, `recordTickEnd` and `runTick`. Each write has its own `try/catch` and logs. `runTick` writes the end in a `finally`-equivalent so a throwing job still records it, then rethrows. Import only `@/lib/prisma` (or the relative path the bundled worker already uses: `worker.ts` imports `../lib/prisma`, so use relative imports in everything the worker pulls in, as `generationRunner.ts` does, because the Dockerfile's esbuild bundle may not resolve the `@/` alias; check `Dockerfile:52-57`).
    - **`worker.ts`:** replace `await run()` with `await runTick(name, run)` in `loop()`. Change nothing else.
    - **The route** is `withTeamAuth` with no `teamRole`. It selects only the three columns, builds both loops in order, and sets `Cache-Control: no-store`. Put `SchedulerStatus` in `api-types.ts`.
    - **The seam** is gated like `generation-tick` (prod 404, `MOCK_AI`, `requireRole('admin')`). Validate the body with zod (`parseBody` needs a team context; the seam is not team-wrapped, so use `safeParse` directly).
    - **The banner** is the shared `Notice` (`tone="warning"`, `role="status"`, `data-testid="scheduler-offline-banner"`, `AlertTriangle` at `ICON_SM`). Reuse `relativeTime`. Read DESIGN_SYSTEM.md §8.18 first. **No raw colour, no new class string, no `// ui-exception`.** Do not put "Queued", "Planned Posts" or "retry" in its text.
    - **The retry reason:** one conditional for FAILED and for PENDING with `retryCount > 0`, with `text-status-failed` for FAILED and `text-status-scheduled` for retrying. Same truncation and tooltip.
    - **E2E (`scheduler-heartbeat.test.ts`, §Z):** serial; clear the rows in `beforeEach` and `afterAll`; cases TC-HB-01 to TC-HB-06 from AC-08; use the log-in helpers and `createCampaign` pattern from `campaign-scheduling.test.ts` (copy the small helpers, do not import across spec files). Skip without `MOCK_AI` and `dbAvailable`, like its neighbours.
    - **Before you finish,** run `grep -rn "scheduler/status\|ScheduledQueueSection" tests src` and report any test that asserts on the queue panel's text so T3's full run is not a surprise.
    - **Run the targeted E2E suites** against a fresh `:3001` server (stop stray node processes, `rm -rf .next`, and use the test DB only): `scheduler-heartbeat.test.ts`, `campaign-scheduling.test.ts` and `ui.test.ts`.

### Wave 3 — Docs and the gate

- [x] `T3` — The docs, the ROADMAP refresh, the full gate and CI
  - Files: `docs/handoff.md`, `CLAUDE.md`, `docs/scheduler-b4-diagnosis-2026-08-03.md`, `docs/e2e-test-plan.md`, `.specclaw/ROADMAP.md`
  - Estimate: small
  - Kind: test
  - Depends: T2
  - Notes:
    - **Covers:** FR-08, FR-09; AC-01 (the final `git diff` check), AC-07 (the diff check), AC-09, AC-10 and AC-11.
    - **The checklist line.** Add the 023 line to "Check before the merge" in the handoff's pre-merge prod checklist, as `spec.md` FR-08 words it, including the post-deploy banner check. It adds no blocking step. Add 023 to the handoff's "Where things stand" table and its top status.
    - **`CLAUDE.md`:** the top entry (023 state, gates, the new migration `20261021120000_worker_heartbeat`), and mark the B4 "Recommended hardening (not built)" bullet **built by 023**, fixing its stale `:131` pointer.
    - **The diagnosis doc:** the "Check the banner first" line.
    - **`docs/e2e-test-plan.md`:** section Z (TC-HB-01 to TC-HB-06, with a short AC-to-case table like section X) and the `POST /api/test/worker-heartbeat` seam in the seam notes.
    - **The ROADMAP refresh:**
      - fix the 011 row (superseded and finished by 021 Graphite; 011's own verify passed 2026-10-09; Graphite was picked 2026-10-18);
      - add rows for 013–022 (all verified PASS; read each `verify-report.md` for the verdict and its AC count; sizes from each proposal: 013 bounded, 014 architectural, 015 bounded, 016 bounded, 017 bounded, 018 bounded, 019 bounded, 020 bounded, 021 architectural, 022 bounded);
      - add a 023 row;
      - mark 006 item 7 as moved to 023 in the 006 row and in the soft-dependency line;
      - refresh the status banner at the top (keep the superseded ones as history).
    - **Prepare for the full run:**
      - stop stray node processes;
      - `rm -rf .next`;
      - `docker exec designer-postgres-1 psql -U bistec -d postgres -c "DROP DATABASE IF EXISTS bistec_studio_test WITH (FORCE);"`, then `npm run test:e2e:db`.
    - **Then run:**
      - `npm run test:e2e:serve` and `npm run test:e2e:mock`, for 0 failed and 0 flaky against the 399/3/0/0 baseline plus the new §Z cases;
      - tsc, `npm run lint`, `npm run test:unit`, `npm run build` and `npm run test:upgrade`;
      - `rm -rf .next` after the build.
    - **Run the AC-01, AC-07 and AC-10 checks** (`git diff --name-only d2eda29 -- prisma/migrations`, the scope diff, the ROADMAP review) and paste them into `reports/T3.md`.
    - **Push `v2` to `origin`** (never `main`), then watch `gh run list --branch v2` until CI is green.
    - **Record the run ID and the gate numbers** in `CLAUDE.md`'s top entry and the handoff's "Where things stand" table.
