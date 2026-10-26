# Proposal: Scheduler heartbeat

**Created:** 2026-10-21
**Status:** ✅ Approved (2026-10-21, bounded)

## Problem

The scheduler worker never reports that it is alive.

**B4 went unnoticed for about 11 days.** The scheduled-generation worker was not running on prod, and it was found only by watching a `ScheduledGeneration` row fail to change (CLAUDE.md, B4; `docs/scheduler-b4-diagnosis-2026-08-03.md`).

- **Nothing shows the worker is down.** The campaign queue panel shows PENDING entries the same way whether the worker is running or not.
- **A retrying entry hides its reason.** `ScheduledQueueSection.tsx:142` shows `errorReason` only when `status === 'FAILED'`. An entry that failed on credentials stays PENDING with "retry N" for about 2 hours (20/40/60-minute backoff) before its reason appears.

**Prod is exposed to this right now.** B4 is still open, and neither prod team has a team Claude token, so the next scheduled run fails on credentials. **010 (WhatsApp) depends on this fix.** A missed handoff is a missed post, and the ROADMAP lists "006 item 7 → 010" as a dependency.

The roadmap moves this item ahead of the rest of 006 (Stage 1: "Pull forward … 006 item 7 (scheduler heartbeat). … small and independent … remove silent failures").

## Proposed Solution

**006 item 7 becomes its own change.** The rest of 006 stays where it is: PostHog, traces, the admin analytics view and the stale-export badge.

1. **A `WorkerHeartbeat` row per poll loop.** It is keyed by the loop name: `scheduler` (publishing) and `generation`. The worker upserts `lastTickAt` at the end of every tick, success or error.
   - **Additive migration:** one new table, with no change to existing tables.
   - **No crash on failure:** a failed heartbeat write is logged and never stops the loop. It uses the same per-tick catch as `worker.ts:16`.
2. **A pure staleness helper.** A loop is offline when its `lastTickAt` is missing or older than 3 minutes.
   - With the 60 s poll, that threshold is three missed ticks.
   - The generation loop may run for many minutes per tick (`worker.ts:8-10`). The heartbeat therefore also writes when a tick **starts**, so a long run is not reported as offline.
3. **One read route.** It returns each loop's last tick and whether it is offline. It is team-authenticated. The worker is shared across all teams, so the route carries no tenant data.
4. **A "Scheduler offline" banner on the campaign queue panel.** It names which loop is down and how long ago it last ticked. The panel shows nothing extra while both loops are healthy.
5. **`errorReason` shown while an entry is still retrying.** This applies to PENDING entries with `retryCount > 0`, beside the existing "retry N" chip.

## Scope

### In Scope

- the `WorkerHeartbeat` model, its migration and a down script;
- the worker writes;
- the staleness helper, with unit tests;
- the read route;
- the banner;
- `errorReason` shown while an entry is retrying;
- E2E coverage for the banner and the retry reason, using the existing mock seams (there is a `POST /api/test/scheduler-tick` seam);
- docs: `docs/handoff.md` (the checklist line and status), `CLAUDE.md`, and the B4 diagnosis doc ("check the banner first");
- **`.specclaw/ROADMAP.md` refresh:**
  - fix the stale 011 row;
  - add rows for 013–022;
  - record that 006 item 7 moved to 023.

### Out of Scope

- everything else in 006: PostHog, analytics events, traces, session replay, the admin analytics view, and the stale-export indicator;
- alerting outside the app (email, Slack);
- fixing B4 itself, which is Coolify config and an operator task;
- a heartbeat for the web app.

## Impact

- **Size:** bounded (spike / bounded / architectural)
- **Files affected:** about 12 (estimated): the schema, the migration and the down script, `worker.ts`, a new helper and route, `ScheduledQueueSection.tsx`, tests and docs.
- **Complexity:** small
- **Risk:** low. The change is additive, and the worker treats heartbeat writes as best-effort.

## Open Questions

**Resolved 2026-10-21 by the user:** both defaults stand (the queue panel only; 3 minutes). The party panel was skipped by the user's choice: only `party/panel.json` and `party/classification.json` were written.

- **The banner's placement.** Is the campaign queue panel enough, or should the dashboard show the banner too? **Default: the queue panel only.** That is where scheduled work is planned and read.
- **The 3-minute threshold.** **Default: 3 min, as CLAUDE.md recommends.**
