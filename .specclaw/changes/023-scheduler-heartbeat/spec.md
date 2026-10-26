# Spec: Scheduler heartbeat

**Change:** 023-scheduler-heartbeat · **Size:** bounded · **Proposal:** [proposal.md](proposal.md)
**Created:** 2026-10-21
**Status:** 🟡 Draft

## Overview

The scheduler worker (`src/scheduler/worker.ts`) runs two poll loops, `scheduler` (publishing) and `generation`. Nothing reports that either is alive. B4 left scheduled work silently unprocessed for about 11 days, and it was found only by watching a `ScheduledGeneration` row fail to change. A retrying entry also hides its reason: `ScheduledQueueSection.tsx:142` shows `errorReason` only when `status === 'FAILED'`, so a credential failure stays invisible behind "retry N" for about 2 hours (20/40/60-minute backoff).

This change makes the worker self-reporting:

- a `WorkerHeartbeat` row per loop, written best-effort by the worker;
- a pure function that decides online, offline or never-seen from (now, row);
- one team-authenticated read route;
- a "Scheduler offline" banner on the campaign queue panel;
- `errorReason` shown while an entry is PENDING and retrying.

This is 006's item 7, moved out of 006 into its own change. The rest of 006 is untouched. Every proposal fact was re-derived against HEAD `d2eda29` on 2026-10-21; the corrections are under Notes.

## Approach

**One decision: a loop's health is a pure function of its row, `loopHealth(now, row, loop)`.** The worker writes the tick's start and its end separately, so a long generation tick is "in a tick" and judged against a ceiling, not against the 3-minute idle threshold. A loop with no row is `never`, and `never` is treated as down.

File map:

- **New:** `prisma/migrations/20261021120000_worker_heartbeat/migration.sql`, `prisma/rollback/023-scheduler-heartbeat.down.sql`, `src/lib/scheduler/heartbeatStatus.ts` (pure), `src/lib/scheduler/heartbeat.ts` (the best-effort writers and `runTick`), `src/app/api/scheduler/status/route.ts`, `src/app/api/test/worker-heartbeat/route.ts` (test seam), `tests/unit/{heartbeatStatus,heartbeat,schedulerStatusRoute}.test.ts`, `tests/e2e/scheduler-heartbeat.test.ts`.
- **Modified:** `prisma/schema.prisma`, `src/scheduler/worker.ts`, `src/components/campaigns/ScheduledQueueSection.tsx`, `src/lib/api-types.ts` (the response type).
- **Docs:** `docs/handoff.md`, `CLAUDE.md`, `docs/scheduler-b4-diagnosis-2026-08-03.md`, `docs/e2e-test-plan.md`, `.specclaw/ROADMAP.md`.

## Requirements

### Functional Requirements

- **FR-01 — The model, the migration and the down script.**
  - **Schema.** `prisma/schema.prisma` gets:

    ```
    model WorkerHeartbeat {
      loop              String    @id            // 'scheduler' | 'generation'
      lastTickStartedAt DateTime
      lastTickEndedAt   DateTime?
      updatedAt         DateTime  @updatedAt
    }
    ```

    The comment says the table is global, not per team (the worker serves every team), that the start and end are kept apart so a long tick is not read as offline, and that `lastTickEndedAt < lastTickStartedAt`, or null, means "inside a tick".

  - **Migration** `20261021120000_worker_heartbeat`. It sorts after the current head, `20261020120000_draft_action_claim_id`. It runs one `CREATE TABLE "WorkerHeartbeat" (...)` with the primary key on `"loop"`, and nothing else: no change to an existing table. Its header says, as 008's and 019's did, that it is additive only, so the previous image keeps working against the migrated schema (it never reads or writes the table), and it names the down script.
  - **Down script** `prisma/rollback/023-scheduler-heartbeat.down.sql`, in the 016 shape: a manual header (it sits outside `prisma/migrations/` on purpose, and an image rollback does not need it), `DROP TABLE IF EXISTS "WorkerHeartbeat";`, and the L24 `DELETE FROM "_prisma_migrations"` for `20261021120000_worker_heartbeat`, so a later redeploy re-applies the migration on its own.
- **FR-02 — The pure health function** (`src/lib/scheduler/heartbeatStatus.ts`, no imports from `prisma` or `next`).
  - **Constants.** `OFFLINE_THRESHOLD_MS = 180_000` (3 minutes: three missed 60 s polls). `TICK_CEILING_MS = { scheduler: 300_000, generation: 1_800_000 }`.
    - The `scheduler` ceiling is the publish claim lease (`CLAIM_LEASE_MS`, 5 minutes, `jobRunner.ts:14`).
    - The `generation` ceiling is two generation leases (`2 * GENERATION_LEASE_MS`, 30 minutes). `generationRunner.ts:14-18` says the 15-minute lease bounds each of a run's two segments (copy plus background, then design), so one healthy entry cannot exceed two. A unit test asserts `TICK_CEILING_MS.generation >= 2 * GENERATION_LEASE_MS`, so a lease change cannot silently invalidate it.
  - **The type.** `LoopHealth = { state: 'online' | 'offline' | 'never'; lastSeenAt: Date | null }`.
  - **The rule.** `loopHealth(now: Date, row: { lastTickStartedAt: Date; lastTickEndedAt: Date | null } | null, loop: 'scheduler' | 'generation'): LoopHealth`:
    - `row` null: `{ state: 'never', lastSeenAt: null }`.
    - `lastSeenAt = max(lastTickStartedAt, lastTickEndedAt ?? lastTickStartedAt)`.
    - `inTick = lastTickEndedAt === null || lastTickEndedAt < lastTickStartedAt`.
    - If `inTick`: `online` when `now - lastTickStartedAt <= TICK_CEILING_MS[loop]`, else `offline`.
    - If not `inTick`: `online` when `now - lastSeenAt <= OFFLINE_THRESHOLD_MS`, else `offline`.
    - Both boundaries are inclusive (exactly the limit is still online). A `lastSeenAt` in the future (clock skew) is online.
  - **Why this handles long ticks.** The generation loop starts a tick, runs for up to many minutes, and ends it. While it is inside the tick it is judged against the 30-minute ceiling. Once the tick ends it is judged against the 3-minute threshold, and the next tick starts about 60 s later.
  - **Also exported:** `schedulerOffline(healths)`, true when any loop is not `online`, for the banner.
- **FR-03 — The worker writes, best-effort.**
  - `src/lib/scheduler/heartbeat.ts` exports `recordTickStart(loop)`, `recordTickEnd(loop)` and `runTick(loop, run)`.
    - `recordTickStart` upserts the row: create with `lastTickStartedAt = now` and a null end, or update `lastTickStartedAt = now` and leave the end alone.
    - `recordTickEnd` upserts the row with `lastTickEndedAt = now` (on create, the start is also `now`).
    - Each wraps its own `try/catch`, logs `[heartbeat] <loop> write failed (non-fatal): …` and never rethrows. A hung or failing heartbeat write must not stall or stop the loop.
  - `runTick(loop, run)` calls `recordTickStart`, then `run()` inside its own `try/finally`-safe structure, then `recordTickEnd`. The end is written whether `run` resolved or threw ("success or error"); a throw from `run` is rethrown after the end write, so `worker.ts`'s existing per-tick catch (`worker.ts:14-17`) still logs it.
  - `worker.ts`'s `loop()` calls `runTick(name, run)` in place of `run()`. The poll interval, the two independent loops, `runScheduledJobs` and `runGenerationJobs` are unchanged. The loop name is the row key: `scheduler` or `generation`.
  - The worker's clock stamps the row. The read route compares against its own clock. A skew of a few seconds is accepted against a 3-minute threshold.
- **FR-04 — The read route.**
  - **`GET /api/scheduler/status`**, `withTeamAuth` (any role on a resolved team; no `teamRole` option). It is not admin-only: editors see the planned-posts panel.
  - **Response** (`SchedulerStatus` in `src/lib/api-types.ts`):

    ```
    { loops: [
        { loop: 'scheduler',  state: 'online'|'offline'|'never', lastSeenAt: string|null },
        { loop: 'generation', state: 'online'|'offline'|'never', lastSeenAt: string|null }
      ],
      offline: boolean }
    ```

    Both loops are always present, in that order. `lastSeenAt` is an ISO string. `offline` is `schedulerOffline(...)`.

  - **No tenant data.** The table is global and the route selects only `loop`, `lastTickStartedAt` and `lastTickEndedAt`. It reads no team, user or entry row, and echoes no request input. It sends `Cache-Control: no-store`.
  - **Failure.** A DB error is a 500 through the standard handler. The panel treats it as "no banner" (FR-05).
- **FR-05 — The banner on the campaign queue panel.**
  - **Placement.** `ScheduledQueueSection` only. It sits at the top of the panel, under the `SectionHead`. The dashboard and the other pages get nothing (user decision, 2026-10-21).
  - **Data.** `useQuery(['scheduler', 'status'])` with `apiFetch<SchedulerStatus>('/api/scheduler/status')` and `refetchInterval: 60_000`. While loading, or on error, no banner shows: an unreachable status route must not read as "scheduler offline".
  - **Shown when** `offline` is true, which means a loop is `offline` or `never`. Nothing extra renders while both loops are `online`.
  - **The component.** The shared `Notice` (`tone="warning"`, `AlertTriangle` icon at `ICON_SM`, `aria-hidden`), with `role="status"` and `data-testid="scheduler-offline-banner"`. It uses no raw colour and no new class string, so `tests/unit/uiTokenGuard.test.ts` passes without an exception.
  - **The text** names each down loop and says what stops, using `relativeTime` (`src/lib/format.ts`) for the age:
    - **Title:** "Scheduler offline".
    - **`generation` offline:** "The generation loop was last seen {relative}. Planned posts will not generate until it is running."
    - **`scheduler` offline:** "The publishing loop was last seen {relative}. Scheduled posts will not publish until it is running."
    - **`never` (either loop):** "The {generation|publishing} loop has not reported in. It is not running, or it has only just restarted." Where both loops are down the lines are listed, one per loop.
    - The text never contains the words "Queued", "Planned Posts" or "retry", because existing E2E locators match them (`campaign-scheduling.test.ts:228-229`).
  - **Why `never` shows the banner.** A worker that was never started, or that runs the wrong start command (B4's most likely cause), writes nothing, so "no row" is exactly the B4 state on a freshly migrated prod. The cost is a banner for about one poll after each deploy and on every local or E2E run with no worker. That is true (no worker is running) and additive, and the E2E suites are checked for it (AC-09).
- **FR-06 — `errorReason` while retrying.**
  - In the topic cell of `ScheduledQueueSection.tsx`, the reason shows when `entry.errorReason` is set and either `entry.status === 'FAILED'` or `entry.status === 'PENDING' && entry.retryCount > 0`.
  - It keeps today's truncation (80 characters then an ellipsis) and `title={entry.errorReason}`.
  - **Tone.** FAILED keeps `text-status-failed`. A retrying entry uses `text-status-scheduled` (the amber that marks warning and queued states, DESIGN_SYSTEM.md §3), because it has not failed yet.
  - The "retry N" line in the status cell is unchanged. A COMPLETED entry clears `errorReason` at completion (`generationRunner.ts`), so it never shows.
  - No API change: `errorReason` and `retryCount` are already in `ScheduledGeneration` (`api-types.ts:147`).
- **FR-07 — The test seam and the E2E.**
  - **`POST /api/test/worker-heartbeat`** is gated like its neighbours: hard 404 when `NODE_ENV === 'production'`, 404 unless `MOCK_AI`, admin-gated by `requireRole('admin')`. The body is one of:
    - `{ loop: 'scheduler' | 'generation', startedAgoMs: number, endedAgoMs: number | null }`, which upserts that loop's row at those offsets from now;
    - `{ clear: true }`, which deletes every row.

    It exists because the existing tick seams call `runScheduledJobs` / `runGenerationJobs` directly and never go through the worker's `loop()`, so they write no heartbeat, and no worker runs in E2E.

  - **`tests/e2e/scheduler-heartbeat.test.ts`** (a new section, §Z; see AC-08) runs serially (`test.describe.configure({ mode: 'serial' })`), because the table is global. It clears the rows in `beforeEach` and `afterAll`, so the default state for every other suite stays "no rows".
  - **The retry-reason case** seeds a PENDING entry with `retryCount: 1` and an `errorReason` through `prisma` (gated on `dbAvailable`), the same way `campaign-scheduling.test.ts` seeds entries.
- **FR-08 — The prod checklist line.** The "Check before the merge" list in `docs/handoff.md` gets one 023 line:
  - the migration `20261021120000_worker_heartbeat` is additive: one new table, no change to an existing one;
  - the previous image runs against it, so an image rollback needs no down script (`prisma/rollback/023-scheduler-heartbeat.down.sql`);
  - **after the deploy, the operator confirms the banner:** with the scheduler resource running, the banner clears within about a minute of its first tick. A banner that stays means the scheduler resource is not running (B4) and the B4 diagnosis applies.

  It adds no blocking step.

- **FR-09 — The other docs and the ROADMAP.**
  - **`CLAUDE.md`:** the top "Outstanding work" entry records 023 (state, gates, the new migration). The B4 "Recommended hardening (not built)" bullet is marked **built by 023**, with its `ScheduledQueueSection.tsx:131` pointer corrected, and the rest of that bullet kept as history.
  - **`docs/scheduler-b4-diagnosis-2026-08-03.md`:** one "Check the banner first" line near the top: since 023 the campaign queue panel shows a "Scheduler offline" banner, which names the loop that is down and when it was last seen, so it tells the operator the worker is not ticking before they open Coolify.
  - **`docs/e2e-test-plan.md`:** a new section for the new cases (AC-08), and the `POST /api/test/worker-heartbeat` seam added to the seam notes.
  - **`.specclaw/ROADMAP.md`** is refreshed (AC-10):
    - the 011 row is corrected: it is superseded and finished by 021 Graphite (011's own verify, 2026-10-09, passed; the user picked Graphite on 2026-10-18 and 021 re-themed the app);
    - rows 013–022 are added with their real states, read from each change's `verify-report.md`;
    - a 023 row is added;
    - the 006 row says that item 7 moved to 023;
    - the "006 item 7 → 010" soft dependency now names 023;
    - the status banner at the top is refreshed.

### Non-Functional Requirements

- **NFR-01: the worker never fails on a heartbeat.** A heartbeat write that throws, rejects or hangs on a DB error logs once and never propagates. `runTick` still runs the loop's job. A unit test proves it for both writes.
- **NFR-02: no tenant data in the route.** No team, user, campaign or entry field is read or returned, and the response shape is exactly FR-04's. A unit test asserts the keys.
- **NFR-03: applied migrations are never edited.** `git diff --name-only d2eda29 -- prisma/migrations` lists only the new directory.
- **NFR-04: shared databases.** No prisma or DB command runs without an explicit `DATABASE_URL` that points at `bistec_studio_test` or a named scratch database. `bistec_studio` is never touched (CLAUDE.md gotchas). `export MSYS_NO_PATHCONV=1` before any docker command with a container path.
- **NFR-05: no real model calls.**
- **NFR-06: scope stays out.**
  - `runScheduledJobs`, `runGenerationJobs`, the claim SQL, the leases, the 60 s poll interval and the backoff are unchanged.
  - `src/app/api/test/scheduler-tick` and `generation-tick` are unchanged.
  - No alerting outside the app, no heartbeat for the web app, no dashboard banner, none of 006's other items.
- **NFR-07: Graphite.** The banner uses `Notice` and existing atoms only (DESIGN_SYSTEM.md §8.18). It adds no colour, class string or atom copy.
- **NFR-08: existing tests are adapted, never deleted.**

## Acceptance Criteria

- **AC-01 (FR-01, NFR-03): the migration and the down script.**
  - `npx prisma validate` passes.
  - **On a scratch database `bistec_studio_023_scratch`,** with an explicit `DATABASE_URL`, created and dropped through `docker exec designer-postgres-1 psql -U bistec -d postgres`:
    1. `migrate deploy` creates the table;
    2. the down script drops it and deletes the migration row (`DELETE 1`);
    3. `migrate deploy` re-applies it (the L24 roll-forward);
    4. `prisma migrate diff --from-url <scratch> --to-schema-datamodel prisma/schema.prisma --exit-code` exits 0.
  - `npm run test:upgrade` prints PASS for all 3 scenarios.
  - `git diff --name-only d2eda29 -- prisma/migrations` lists only the new directory.
  - Everything is recorded in `reports/T1.md`, with the `pg_database` check showing the scratch database is gone.
- **AC-02 (FR-02): the health function** (`tests/unit/heartbeatStatus.test.ts`).
  - No row gives `never` with a null `lastSeenAt`.
  - Idle (the end at or after the start): online at 0 s, at 179 s and at exactly 180 s; offline at 181 s.
  - In a tick (null end, or an end before the start): the generation loop at 10 min and at exactly 30 min is online, and at 31 min is offline. The scheduler loop at 4 min is online and at 6 min is offline.
  - A generation loop in a 10-minute tick is online, where the idle rule would call it offline. This is the long-tick case.
  - A future `lastSeenAt` is online. `lastSeenAt` is the later of the two timestamps.
  - `TICK_CEILING_MS.generation >= 2 * GENERATION_LEASE_MS`.
  - `schedulerOffline` is false only when every loop is `online`.
- **AC-03 (FR-03, NFR-01): the worker writes, best-effort** (`tests/unit/heartbeat.test.ts`, prisma faked).
  - `runTick` writes the start, runs the job, then writes the end, in that order.
  - When the job throws, the end is still written and the error is rethrown.
  - When either write rejects, `runTick` still runs the job, resolves, and logs, and nothing is thrown out of it.
  - The upsert for the start does not touch the end, and the upsert for the end does not touch the start.
- **AC-04 (FR-04, NFR-02): the route** (`tests/unit/schedulerStatusRoute.test.ts`).
  - The response has exactly the keys `loops` and `offline`, each loop has exactly `loop`, `state` and `lastSeenAt`, and both loops are listed in order.
  - No rows gives both loops `never` and `offline: true`. Two fresh rows give `offline: false`.
  - The route is wrapped in `withTeamAuth`, and it reads no team, user or entry model. An unauthenticated request is 401 (also in AC-08).
- **AC-05 (FR-05, NFR-07): the banner** (E2E, AC-08; `uiTokenGuard`).
  - With both loops fresh there is no banner.
  - With a stale generation loop the banner shows, names the generation loop and says planned posts will not generate. With a stale publishing loop it names the publishing loop.
  - With no rows the banner shows the never-reported text.
  - `npm run test:unit` passes, including `uiTokenGuard`, `uiPrimitives` and `contrast`, with no `// ui-exception` added.
- **AC-06 (FR-06): the retry reason** (E2E).
  - A PENDING entry with `retryCount: 1` and an `errorReason` shows the reason in the panel, truncated at 80 characters, beside its "retry 1" chip.
  - A PENDING entry with `retryCount: 0` shows no reason, and a FAILED entry still shows its reason as before.
- **AC-07 (FR-07, NFR-06): the seam.**
  - Without `MOCK_AI` the seam answers 404, and a non-admin gets 403. `grep -rn "worker-heartbeat" src` finds only the seam and (as a string) the tests.
  - `git diff --name-only d2eda29` shows no change to `src/lib/scheduler/jobRunner.ts`, `src/lib/scheduler/generationRunner.ts`, `src/app/api/test/scheduler-tick/` or `src/app/api/test/generation-tick/`.
- **AC-08 (FR-07, FR-09): the E2E section and the plan.** `tests/e2e/scheduler-heartbeat.test.ts` has these cases, and `docs/e2e-test-plan.md` lists them under a new section Z:
  - **TC-HB-01:** fresh heartbeats for both loops, no banner.
  - **TC-HB-02:** a generation loop idle for 4 minutes, banner naming the generation loop.
  - **TC-HB-03:** a publishing loop idle for 4 minutes, banner naming the publishing loop.
  - **TC-HB-04:** no rows, the never-reported banner.
  - **TC-HB-05:** a PENDING entry with `retryCount` 1 and an `errorReason` shows the reason.
  - **TC-HB-06:** the route is 401 with no session, and with a session its body has only the FR-04 keys.
  - TC-HB-01 also covers a generation loop that is inside a 10-minute tick (no banner).
- **AC-09 (FR-05): the other suites stay green.** In the full clean mock E2E no case outside §Z fails or flakes because the banner is present (the default state is "no rows"). In particular `campaign-scheduling.test.ts` (the `Queued` and `Planned Posts` locators) and the UI and a11y suites that load `/campaigns/<id>` pass.
- **AC-10 (FR-08, FR-09): the docs and the ROADMAP.**
  - A review confirms the 023 line in the handoff checklist (no blocking step), the `CLAUDE.md` entry, the B4 bullet marked built, the "check the banner first" line in the diagnosis doc, and the §Z entry in the e2e plan.
  - In `.specclaw/ROADMAP.md`: the 011 row no longer says "awaiting pick"; there is a row for each of 013–022 whose state matches that change's `verify-report.md` verdict; there is a 023 row; the 006 row says item 7 moved to 023.
- **AC-11: the gate.**
  - tsc is clean, and `npm run lint` gives 0 errors and no more than the 7-warning baseline.
  - `npm run test:unit` passes in full, with at least the 2681 baseline plus the new cases.
  - `npm run build` passes (the worker bundle in the Dockerfile imports `heartbeat.ts`, which imports only `prisma`; `rm -rf .next` after the build).
  - A full clean mock E2E gives 0 failed and 0 flaky, against the 399/3/0/0 baseline (020 T2, 2026-10-20), plus the new §Z cases.
  - `gh run list --branch v2` shows CI green at the change's last commit.

## Edge Cases

- **A worker that crashes mid-generation-tick.** The row says "in a tick" and reads online until the 30-minute ceiling passes. The entry's own 15-minute lease makes the work reclaimable sooner, and a restarted container writes a new start within one poll. This is accepted: a shorter ceiling would call a healthy two-entry tick offline.
- **A hung heartbeat write** blocks nothing beyond its own await in the loop; Prisma's own connection timeout bounds it. It is not wrapped in a separate timer.
- **A DB outage.** Both writes fail and are logged, so the heartbeat goes stale and the banner shows. That is the right signal, because the app is also unhealthy.
- **Two scheduler containers** (a rolling deploy) upsert the same row. The later write wins; the row can read "in a tick" if the end write came from the other container. That is harmless: a fresh start is online either way.
- **The first poll after a deploy.** The new web container may serve the banner as `never` for up to a minute before the scheduler's first tick.
- **Clock skew** between the worker and the web container is seconds, against a 3-minute threshold.
- **Local dev with no worker** shows the banner on the campaign page. That is true: scheduled posts will not generate. It is the documented cost of FR-05's `never` choice.
- **An unreachable status route** shows no banner (FR-05), never a false alarm.

## Assumptions

- **A1:** the web app and the scheduler worker share one database in every deployment (they do on prod, and in `docker-compose.yml`), so the worker's rows are readable by the app. If the scheduler were pointed at a different `DATABASE_URL`, one of B4's four causes, the banner would read `never`, which is the correct alarm.
- **A2:** `loop()` in `worker.ts` is the only place the two loops run, so wrapping it covers both.
- **A3:** the E2E env sets `MOCK_AI`, so the seam is live there; CI runs `next dev` (CLAUDE.md, testing section), where the seam is not inert.
- **A4:** `relativeTime` (`src/lib/format.ts`) is client-safe. The queue panel is a client component whose data arrives through React Query, so there is no SSR hydration mismatch.

## Open Questions

None. The user resolved both proposal questions on 2026-10-21: the banner goes on the campaign queue panel only, and the threshold is 3 minutes.

## Dependencies

- 019 owns the migration head `20261020120000_draft_action_claim_id`, which this migration sorts after, and the 016/019 migration and down-script conventions.
- 022: `npm run test:upgrade` and the merge checklist.
- 021: the Graphite `Notice` atom and the token guard.
- **010 (WhatsApp channel posting) depends on this change** (ROADMAP: "006 item 7 → 010").
- Merging to `main` and fixing B4 itself (Coolify config) are out of scope.

## Notes

**Corrections to the proposal (2026-10-21), re-derived at `d2eda29`:**

- **One timestamp became two.** The proposal's Solution 1 says the worker upserts `lastTickAt` at the end of every tick, and Solution 2 says it also writes at the start. The model keeps `lastTickStartedAt` and `lastTickEndedAt` separately, with no `lastTickAt`. A loop is "inside a tick" when the end is missing or before the start.
- **The generation ceiling.** The proposal gives only the 3-minute threshold. A generation tick can run for tens of minutes (`worker.ts:8-10`; two segments of up to one 15-minute lease each, per `generationRunner.ts:14-18`), so FR-02 adds a per-loop in-tick ceiling: 30 minutes for generation and 5 minutes for publishing.
- **`never` shows the banner.** The proposal is silent on a loop with no row. FR-05 treats it as down, because a worker that never started is B4's state and writes nothing.
- **Line pointers.**
  - `ScheduledQueueSection.tsx:142` is correct for the FAILED-only gate. CLAUDE.md's `:131` is stale.
  - The worker's per-tick catch is `worker.ts:14-17`, not `:16`, and the long-tick comment is `worker.ts:8-10`.
  - The migration head is `20261020120000_draft_action_claim_id` (019), so the new migration is `20261021120000`.
- **The test seams.** The proposal says "use the existing mock seams". `scheduler-tick` is gated on `MOCK_SOCIAL` and `generation-tick` on `MOCK_AI`, and both call the runner directly, bypassing `worker.ts`'s `loop()`, so neither writes a heartbeat. A new seam, `POST /api/test/worker-heartbeat`, seeds the rows (FR-07). The existing seams are untouched.
- **The reason's placement.** The proposal says "beside the existing retry chip". The chip lives in the narrow status cell, and the FAILED reason lives in the topic cell. FR-06 puts the retrying reason in the topic cell next to the FAILED one, with the same truncation and tooltip, and leaves the chip where it is. One conditional serves both.
- **Files.** "About 12" is now 9 new and 4 modified code, schema and test-seam files, plus 5 docs. The new files are mostly small.
- **`lastError`.** Not kept. An error text could carry entry or team detail, the route must carry none, and the worker already logs tick errors.
- **ROADMAP rows.** The 011 row says "wave 1 built — awaiting pick"; its state file shows verify PASS on 2026-10-09 and the user picked Graphite on 2026-10-18 (021). Rows 013–022 are all verified PASS.
