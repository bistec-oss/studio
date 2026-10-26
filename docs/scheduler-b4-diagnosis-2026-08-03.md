# B4 — prod scheduler not running: code audit + candidate causes

**Date:** 2026-08-03 · **Status:** open (nothing in this repo needs changing) · **Access:** written from a code audit only — no Coolify or prod access from this session, so the remaining diagnosis is one look at the scheduler resource's logs.

Companion to [`prod-e2e-findings-2026-07-24.md`](prod-e2e-findings-2026-07-24.md) §B4, which established the symptom. This doc records what has now been **ruled out**, the causes still standing, and how to tell them apart — so nobody re-audits the image again.

**Check the banner first (since 023).** The campaign page's queue panel shows a "Scheduler offline" banner when a worker loop has stopped ticking. It names the loop that is down and when it was last seen, so it tells you the worker is not ticking before you open Coolify. A banner that stays after a deploy means the scheduler resource is not running, and the rest of this doc applies.

## The symptom (from the 2026-07-24 run)

A HOLD queue entry with `generateAt` 10 minutes in the past was created (201, PENDING) and polled for **185s** — three worker poll cycles. It stayed **PENDING**, `retryCount: 0`, no draft, no `errorReason`. The app resource was demonstrably redeployed at the time.

`retryCount: 0` with no error is the load-bearing detail: a claimed-then-failed job would have incremented it and written `errorReason`. The entry was **never claimed**, which means no process executed the claim UPDATE at all.

## Ruled out — verified in the repo at `main` (2026-08-03)

Do not re-audit these; all four are correct:

| Concern                             | Verified                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The worker is actually in the image | `Dockerfile:52-57` bundles `src/scheduler/worker.ts` → `dist/scheduler/worker.js` via esbuild (`@prisma/client` external); `Dockerfile:109` copies `dist/` into the runner stage                                                                                                                                             |
| The CMD override still migrates     | `Dockerfile:127` sets `ENTRYPOINT ["/app/docker-entrypoint.sh"]` and `:131` leaves `CMD ["node","server.js"]`; `docker-compose.yml:22` overrides **`command:` only**, so the scheduler boots through the same migrating entrypoint (`docker-entrypoint.sh` — advisory-locked `migrate deploy`, then `exec "$@"`)             |
| CI redeploys the scheduler          | `.github/workflows/docker-publish.yml:64-68` calls the Coolify deploy API for UUID `warr96qhvzrie5ndwv8oteeu` after the GHCR push, alongside the app's `nck8s530pseqdcfxt50hndl5`                                                                                                                                            |
| The worker polls correctly          | `src/scheduler/worker.ts` runs `runScheduledJobs` + `runGenerationJobs` as two independent 60s loops, each with a per-tick catch (a DB hiccup can't kill the process); `src/lib/scheduler/generationRunner.ts:26-42` claims `PENDING AND generateAt <= now()` with `FOR UPDATE SKIP LOCKED` — correct for the observed entry |

So there is **no code or image defect behind B4**. It is a Coolify resource-configuration problem.

## Candidate causes, and how to tell which

One look at the **scheduler** resource's container logs in Coolify decides it. Each cause prints something distinct on boot:

| Logs show                                                                          | Cause                                                                                                                                                                       | Fix                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `▲ Next.js` / listening on port 3000                                               | **Start command not overridden** — the resource runs the default `CMD` (`node server.js`), so it is a second copy of the web app: deploys green, serves HTTP, polls nothing | Set the resource's **Start Command** to `node dist/scheduler/worker.js`. It must replace the **command**, not the entrypoint — overriding the entrypoint would also skip `migrate deploy` |
| `[scheduler] starting, poll interval: 60000 ms`                                    | The worker **is** running → it is pointed at a different database (own env set, or a stale `DATABASE_URL`)                                                                  | Make `DATABASE_URL` byte-identical to the app resource's; the whole `.env` should match                                                                                                   |
| `[entrypoint] applying pending Prisma migrations…` followed by an error, repeating | **Crash-loop.** `docker-entrypoint.sh` runs under `set -e`, so a failed `migrate deploy` exits before the worker ever starts                                                | Fix the failing migration / DB permissions. `SKIP_MIGRATIONS=1` on the resource is the emergency boot                                                                                     |
| Nothing at all                                                                     | Resource stopped, or was never created                                                                                                                                      | Start it, or create it from the same image + `.env` with the start command above                                                                                                          |

**Most likely: the first row.** It is the only cause that reports a _successful_ deploy while doing no work, which is what the 2026-07-24 run observed (webhook fired, app resource verifiably updated, no worker activity).

## Second blocker — independent of the above

Even a correctly running worker fails every scheduled job today:

- Scheduled runs call `withClaudeAuth(null, teamId, …)` (`src/lib/scheduler/generationRunner.ts:145`). `userId: null` is deliberate — an unattended run has no acting teammate — so there is **no personal-token tier**, only the team's.
- Neither prod team (Bistec, Hearts Academy) has `Team.encryptedClaudeToken` set (`/api/team/claude-token` → `{connected:false}`, checked 2026-07-27).

Result: a no-credential `ClaudeCliError` per job, caught by the retry path (`generationRunner.ts:165-195`) → 3 retries at 20/40/60-min backoff → `FAILED` about two hours later. **Fixing the Coolify resource alone converts "nothing happens" into "fails slowly".** Set a team Claude token at `/team` for both teams first.

The worker already reports this on startup: `logTeamsWithoutClaudeToken()` (`worker.ts:29-48`) logs every team with no token — a useful second confirmation that the logs you are reading belong to a real worker.

## Adjacent, non-blocking

Both prod IMAGE providers are `isEnabled: true` but `isDefault: false`. `resolveImageProvider` tier 3 requires `isDefault`, and an unattended run has no personal tier — so scheduled generations will complete but with **no AI background** (design falls back to CSS/SVG; it never throws). Mark the IMAGE row default on each team.

## Verification, once both are fixed

1. Scheduler resource logs show `[scheduler] starting, poll interval: 60000 ms`.
2. Create a HOLD queue entry with `generateAt` in the past on a campaign.
3. Within 60s it moves `PENDING → RUNNING`; a full CLI-mode generation is ~5 min (copy ≤120s + background ≤90s + design ≤300s, lease 15 min).
4. It ends `COMPLETED` with a draft. On failure, the queue table shows `errorReason` (`ScheduledQueueSection.tsx:131`).
5. Then the kept Claude Testing test data can be wiped (see the 2026-07-24 findings) — **not** the Hearts Academy prod data.

## Recommended hardening — not built

B4's real cost was not that the scheduler stopped; it is that it stopped **invisibly for ~11 days**, and was found only by watching a queue row fail to change for 185 seconds. Three changes would make it self-reporting:

1. **Heartbeat** — a `WorkerHeartbeat` row per loop (`publish`, `generation`), upserted with `lastTickAt` on every tick. One migration.
2. **Surface it** — a banner on the campaign queue panel when the newest tick is older than ~3 minutes: _"Scheduler offline — planned posts will not generate."_ Converts silent nothing into a stated fault, and gives a definitive green light after a Coolify change instead of an inferred one.
3. **Show `errorReason` while retrying, not only on `FAILED`** — `ScheduledQueueSection.tsx:131` gates the message on `status === 'FAILED'`, so an entry backing off for 20/40/60 min looks like an ordinary `PENDING` with no indication that a credential error already occurred.

Scope: one migration, one read route, a small UI change, plus a pure staleness helper with unit tests. None of it unblocks scheduled generation by itself — the Coolify resource and the team tokens are the fix — but it makes the next regression announce itself.
