# Verification Report: 023-scheduler-heartbeat

**Verified:** 2026-10-21
**Model:** Sonnet 5.5 (claude-sonnet-5-5)
**Verdict:** PASS (11/11 ACs)

The report is at HEAD `df65aa0`. The last code commit is `f43669a`; `1b0dde7` and `df65aa0` change only docs and specclaw files. The verifier read the code, the migration, the down script, the component diff and the docs, and ran the scope diff. It ran no DB command and no tests. The lint, build, unit and E2E results come from the orchestrator's runs.

## Acceptance Criteria

- ✅ **AC-01: the migration and the down script.**
  - `20261021120000_worker_heartbeat/migration.sql` is one `CREATE TABLE "WorkerHeartbeat"` with a primary key on `"loop"`. Its header says "Additive only".
  - `prisma/rollback/023-scheduler-heartbeat.down.sql` has `DROP TABLE IF EXISTS` and the L24 `_prisma_migrations` delete.
  - `git diff --name-only d2eda29 -- prisma/migrations` lists only the new migration.
  - The scratch-DB proof is in `reports/T1.md`:
    - deploy;
    - the down script (`DROP TABLE`, `DELETE 1`);
    - re-apply;
    - `migrate diff --exit-code`: "No difference detected.", exit 0;
    - the dropped DB shows `(0 rows)` in `pg_database`.
  - `test:upgrade` reports ALL PASS (`reports/T3.md`).
- ✅ **AC-02: the health function.**
  - `heartbeatStatus.ts` follows the spec's rule line by line:
    - `OFFLINE_THRESHOLD_MS = 180_000`;
    - `TICK_CEILING_MS = { scheduler: 300_000, generation: 1_800_000 }`;
    - no row → `never`;
    - `lastSeenAt = max(start, end ?? start)`;
    - `inTick = end === null || end < start`;
    - both limits inclusive (`<=`).
  - `schedulerOffline` is "some loop is not online".
  - The unit tests pass.
- ✅ **AC-03: the worker writes, best-effort.**
  - `recordTickStart` upserts only the start, and `recordTickEnd` upserts only the end.
  - Each write has its own try/catch that logs and never rethrows.
  - `runTick` writes the start, then runs the job in `try`, then writes the end in `finally`. A job error still reaches the existing catch.
  - `worker.ts` changes only `await runTick(name, run)` and its import.
- ✅ **AC-04: the route.**
  - It uses `withTeamAuth` with no role.
  - Its `findMany` selects three columns and reads no other model.
  - The response is `{ loops, offline }`, with both loops in a fixed order and each loop as `{ loop, state, lastSeenAt }`.
  - It sets `Cache-Control: no-store`. TC-HB-06 covers the 401.
- ✅ **AC-05: the banner.**
  - The query uses `refetchInterval: 60_000`. While it is loading or has failed, no banner shows.
  - The banner is a shared `Notice` with `tone="warning"`, `role="status"` and `data-testid="scheduler-offline-banner"`, titled "Scheduler offline". It shows one line per down loop, in the spec's exact text.
  - Its text has no "Queued", "Planned Posts" or "retry".
  - It uses no raw colour and no `ui-exception`, and `uiTokenGuard` is green.
  - TC-HB-01 to TC-HB-04 cover it.
- ✅ **AC-06: the reason while an entry retries.**
  - The reason shows when `errorReason && (FAILED || (PENDING && retryCount > 0))`.
  - FAILED uses `text-status-failed` and retrying uses `text-status-scheduled`, with the same 80-character truncation and `title`.
  - The "retry N" chip is untouched. TC-HB-05 covers it.
- ✅ **AC-07: the seam and the scope.**
  - The seam returns 404 in production and 404 without `MOCK_AI`, then calls `requireRole('admin')`. It validates its input with a zod union.
  - `worker-heartbeat` is referenced only by its own route.
  - None of `jobRunner.ts`, `generationRunner.ts` or the existing tick seams changed.
  - The changed `src` files are exactly the seven in the file map.
- ✅ **AC-08: the E2E section and the plan.**
  - `tests/e2e/scheduler-heartbeat.test.ts` has TC-HB-01..06. TC-HB-01 covers the 10-minute in-tick generation loop.
  - `docs/e2e-test-plan.md` has §Z, an AC-to-case table and the seam note.
- ✅ **AC-09: other suites stay green.** The full clean mock E2E gives 405/3/0/0 at `f43669a`, which is the 399 baseline plus six §Z cases.
- ✅ **AC-10: the docs and the ROADMAP.**
  - The handoff's "Check before the merge" has a 023 line, which is a check and not a blocking step.
  - In `CLAUDE.md`, the top entry records 023, and the B4 hardening bullet is marked "BUILT by 023", with its pointer corrected to `:184`.
  - The B4 diagnosis doc has "Check the banner first (since 023)".
  - In the ROADMAP:
    - the 011 row is fixed;
    - rows 013–023 are present, and each of 013–022 matches its verify report (all PASS);
    - 006 item 7 is shown as moved to 023, and the 010 dependency now names 023;
    - the status banner is refreshed.
- ✅ **AC-11: the gate.**
  - Lint: 0 errors, 7 warnings. Build: passes. Unit: 2706/2706.
  - E2E: 405/3/0/0. `test:upgrade`: ALL PASS.
  - CI at `f43669a`: 39493017393 (push) and 39493027033 (pull_request), both success.
  - The worker bundle imports `heartbeat.ts`, which imports `../prisma` relatively.

## Test Results

- **Lint:** 0 errors, 7 warnings (the baseline).
- **Build:** passes.
- **Unit:** 2706/2706.
- **E2E:** there is no `e2e_command`, so the evidence is the T3 full clean mock run at `f43669a`: 405 passed, 3 skipped, 0 failed, 0 flaky (`reports/T3.md`). The targeted T2 runs are in `reports/T2.md`.
- **`npm run test:upgrade`:** ALL PASS.
- **CI:** green at `f43669a`.

## Per-task reviews

- T1 — NOTE (orchestrator review)
- T2 — NOTE (5 notes, with a Resolution section)
- T3 — no review (docs and gate)

## Issues Found

There are no blocking issues. Two observations:

1. The seam's 403 and 404 paths have no test of their own. The code gates them correctly, and the route is test-only, so a unit test is optional.
2. The AC-01 DB steps and the E2E counts rest on the T1 and T3 reports, which is what the spec's AC wording asks for.

## Summary

**Passed:** 11/11 criteria
**Failed:** 0/11 criteria
**Verdict:** PASS
