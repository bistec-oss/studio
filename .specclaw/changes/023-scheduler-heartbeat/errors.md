# Error Journal: 023-scheduler-heartbeat

Build errors and their resolutions.

---

## [T2] Investigation 1 — CI E2E red on v2 at f05f9bc (docs-only commit): TC-HB-01 fails on all 4 attempts with 'page.waitForResponse: Test timeout of 60000ms exceeded' (runs 39608780122, 39608789686); was green at f8f063c

**When:** 2026-10-22 17:03 UTC
**Status:** upheld
**Failure-Sig:** —
**Reproduce:** `npm run test:e2e:mock -- tests/e2e/scheduler-heartbeat.test.ts -g TC-HB-01 --retries=0 --repeat-each=3 (against a warm test:e2e:serve)` → exit 1
**Evidence:** Cold server (first run, routes compiling): TC-HB-01 passes in 21.5s. Warm server: 3/3 fail at exactly 60s. The test registered waitForResponse for /api/scheduler/status after page.goto and after the 'Planned Posts (0)' assertion; the status query fires on mount and refetches every 60_000 ms (ScheduledQueueSection.tsx:83), equal to the 60 s test timeout. No other waitForResponse in tests/e2e is registered after its trigger.
**Hypothesis 1 (upheld):** the listener is attached after the mount-time status response has already arrived, so it can only catch the 60 s refetch, which lands at the test timeout; it passed only when a cold compile made the route slower than the queue query
**Fix:** register the waitForResponse promise before page.goto and await it after the Planned Posts assertion (test-only; app code unchanged) (commit d2daa38)
**Proof:** same suite on the warm server, --repeat-each=3 --retries=0: 18 passed (36.6s), was 3/3 TC-HB-01 failed

---
