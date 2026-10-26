# Tasks: Product observability (in-app event store and insights page)

**Change:** 006-product-observability · **Size:** architectural
**Created:** 2026-10-23
**Total Tasks:** 6

## Summary

This change has **6 tasks in 6 waves**. Each depends on the one before it, so there is no parallel work:

1. the schema, the catalogue, `track` and `redactText`, with unit tests;
2. the server emitters (generation, draft actions with the refine trace, swept, revisions, publish, scheduled generation), the delete rules and the test seam;
3. retention, the purge script, the query module, the insights API and page, and E2E section AD (wave-1 cases);
4. the wizard wave: `POST /api/events`, the wizard step events, `brief.submitted` and `brief.abandoned`, the funnel section;
5. the token wave: the usage accumulator, API-mode usage, the token section;
6. the docs, the full gate and CI.

Waves 4 and 5 are the user's staged scope (2026-10-23): each is independently shippable after wave 3.

## Process / Gates

- **One task at a time:**
  1. an implementer subagent does the task;
  2. `specclaw:code-reviewer` reviews it;
  3. the orchestrator re-runs tsc, `npm run lint` and `npm run test:unit`, then commits.

  Never run two implementers in this checkout.

- **No real model calls.** Every test runs on the `MOCK_AI` seam or faked model functions.
- **The databases are shared.** Never run a prisma or DB command without an explicit `DATABASE_URL` that points at `bistec_studio_test` or a named scratch database (for this change, `bistec_studio_006`). `bistec_studio` and `bistec_studio_op1` (the 009 OP-1 environment) are never touched. Use `export MSYS_NO_PATHCONV=1` before any docker command with a container path.
- **The OP-1 dev server may be running on :3002** (it uses `.next`). Before any build or E2E run, ask the orchestrator; do not kill it yourself.
- **Baselines (007 verify, 2026-10-23):** unit 3147/3147; render 47/47; lint 0 errors / 7 warnings; full clean mock E2E 442/3/0/0. A task may add cases; it may not lower a pass count or add a lint warning.
- **Base commit for the diff checks:** `3c9b593` (the 006 proposal approval).

## Tasks

### Wave 1 — Schema, catalogue, wrapper

- [x] `T1` — The tables, the catalogue, `track`, the drop counter and `redactText`
  - Files: `prisma/schema.prisma`, `prisma/migrations/20261024120000_analytics_events/migration.sql` (new), `prisma/rollback/006-product-observability.down.sql` (new), `src/lib/analytics/{catalogue,track,trace}.ts` (new), `src/lib/text/redact.ts` (new), `src/lib/drafts/backgroundNotice.ts` (`redactSkipDetail` re-exports `redactText`), `tests/unit/{analyticsTrack,analyticsCatalogue,analyticsCoverage,redactText}.test.ts` (new)
  - Estimate: medium
  - Kind: migration
  - Depends: none
  - Notes:
    - **Covers:** FR-01, FR-02, FR-03, FR-13 (the guard), NFR-03, NFR-04, NFR-06 (the payload-size assertion); AC-01, AC-02, AC-03, AC-04 (unit half).
    - The catalogue holds every event of FR-04, FR-08 and FR-09 now (wave 2 and 3 fields optional), so later tasks only emit. Vocabularies are imported (design "The catalogue and its vocabularies"); `ActionTrace` and `newActionTrace()` in `trace.ts` (the usage accumulator waits for T5).
    - `redactText` keeps `redactSkipDetail`'s exact rules; the existing `backgroundNotice` unit tests pass unchanged.
    - **Migration proof on a scratch database** `bistec_studio_006` (explicit `DATABASE_URL`): deploy, run the down script, re-apply, `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <scratch2> --exit-code` clean, drop the scratch databases. Record it in `reports/T1.md`.
    - **Gate:** tsc, lint, unit (3147 plus the new cases), `git diff --name-only 3c9b593 -- prisma/migrations` lists only the new migration.

### Wave 2 — Server emitters

- [x] `T2` — Generation, draft-action (with the refine trace), swept, revision, publish and scheduled-generation events; delete rules; the test seam
  - Files: `src/lib/agent/{generateDraft,backgroundGeneration}.ts`, `src/lib/scheduler/{generationRunner,jobRunner}.ts`, `src/mcp/tools/{generate,publish}.ts`, `src/lib/drafts/{draftActions,refineAttempt,refineVerify}.ts`, `src/app/api/drafts/[id]/{route,refine/route,regenerate-design/route,regenerate-copy/route,inline-edit/route}.ts`, `src/app/api/drafts/[id]/rejected/[revisionId]/adopt/route.ts`, `src/app/api/drafts/[id]/revisions/[rev]/restore/route.ts`, `src/lib/publish/{publishDraft,trackPublish}.ts`, `src/app/api/posts/route.ts`, `src/app/api/posts/[id]/publish/route.ts`, `src/app/api/admin/teams/[id]/route.ts`, `src/app/api/test/analytics-events/route.ts` (new), `tests/unit/{analyticsEmitters,analyticsRefineTrace,analyticsDeletes}.test.ts` (new); existing unit tests whose prisma fakes need `analyticsEvent` (adapt, never delete)
  - Estimate: large
  - Kind: impl
  - Depends: T1
  - Notes:
    - **Covers:** FR-04, FR-05, FR-06, FR-07, FR-12 (team and draft deletes), NFR-01, NFR-02; AC-05 to AC-08 (unit halves), AC-14 (unit half), AC-15.
    - Follow design "Emitters" exactly: one emitter per event name; `GenerationActor.source` and `createAndPublishPost`'s `source` passed by every caller; `startDraftAction`'s trailing `trace`; the `accepted` result's `attempts`; `VERIFIER_PROMPT_VERSION = '2026-10-24.1'` with the `VERIFIER_SYSTEM` text unchanged (golden test); emission only after a successful settle write.
    - **Unit tests:** each emitter writes exactly one event per operation and outcome (fake prisma capturing `analyticsEvent.create`); `track` failing (insert rejects) leaves each action's domain writes and return value identical (AC-08 unit half); the refine trace on accepted and not-applied; swept events; team soft-delete removes only that team's events; draft delete nulls `draftId`; a CLI-free check that no new `createMessage`, `runClaudeCli` or `recordModelCall` call site was added (`git grep` count against `3c9b593`).
    - **The seam:** GET (filters), DELETE, POST `{ seed: [...] }` (rows with explicit `at`), POST `{ failNext: n }`, POST `{ sweep: true }` (wired in T3; return 501 until then), gated like `model-calls`.
    - **Gate:** tsc, lint, unit, `npm run build` (then `rm -rf .next`; check with the orchestrator about :3002 first). Then the targeted E2E suites that cover these paths, against a fresh `:3001` test server and test DB: `generation`, `refine`/`agui-refinement`, `async-draft-actions`, `publish`, `campaign-scheduling`, `model-selection`, `hero-imagery`, `team-isolation` (check the exact file names) — all green, none edited unless an assertion reads a response shape that changed (none should).
    - **Check at the end:** `git diff --name-only 3c9b593 -- src/lib/agent/prompts src/lib/agent/claudeCli.ts src/lib/scheduler/heartbeatStatus.ts src/app/api/scheduler/status/route.ts` lists nothing.

### Wave 3 — Retention, purge, the page and E2E

- [x] `T3` — Retention loop, purge script, `queries.ts`, the insights API and page, nav, and E2E section AD
  - Files: `src/lib/analytics/{queries,retention}.ts` (new), `src/scheduler/worker.ts`, `scripts/purge-analytics.mjs` (new), `src/app/api/test/analytics-events/route.ts` (wire `sweep`), `src/app/api/admin/insights/route.ts` (new), `src/app/(app)/admin/insights/page.tsx` (new), `src/components/admin/insights/*` (new), `src/components/layout/AppShell.tsx`, `tests/unit/analyticsQueries.test.ts` (new), `tests/e2e/analytics.test.ts` (new)
  - Estimate: large
  - Kind: impl
  - Depends: T2
  - Notes:
    - **Covers:** FR-10 (sections 1 to 4, team activity, events lost, retention health), FR-11, FR-12 (purge), NFR-05, NFR-07, NFR-08; AC-05 to AC-08 (E2E halves), AC-11, AC-12, AC-13, AC-14, AC-16.
    - **Read DESIGN_SYSTEM.md first**; reuse `src/components/ui/` atoms; no raw colour, no new `// ui-exception`; the in-page super-admin gate like `/admin/users`.
    - `queries.ts` uses tagged-template `$queryRaw` only. Unit-test the pure shaping helpers.
    - **E2E section AD (`analytics.test.ts`):** serial, skip without `MOCK_AI`; `DELETE` the seam in `beforeEach`. Cases TC-OBS-01 onward: one event per operation for generation (ok and failed), refine (ok, not-applied, conflict), regenerate design and copy, inline edit, override, adopt, restore, publish, scheduled generation (via `POST /api/test/generation-tick`); no event payload holds the brief text, a caption, the headline or HTML; `failNext` leaves a generation, a refine and a publish with the same final state and grows `dropped`; seeded data → every page figure equals the hand count (applied rate per class with two verifier models, failure trend, top reasons, styles, durations, team activity, events lost, oldest age); retention at 181/179 days and the 5 000 batch cap; draft delete unlinks; team delete removes only that team's events; access (editor and team admin gated, API 403, no session 401); the "Scheduler offline" banner unaffected by the retention loop.
    - **Purge script:** run once with `--dry-run` against `bistec_studio_test` (explicit `DATABASE_URL`) and once without `DATABASE_URL` (exits non-zero); record both.
    - **Run** `analytics.test.ts` three times alone, plus the T2 targeted list, against a fresh `:3001` server (stop stray node processes except the :3002 OP-1 server, `rm -rf .next`, recreate the test DB).
    - **Screenshots** of the page at 390 px and 1440 px, light and dark, into the gitignored `ui-captures/006/`; look at them; note the result in `reports/T3.md`.
    - **Gate:** tsc, lint, unit, build, the E2E above.

### Wave 4 — Wizard events

- [x] `T4` — `POST /api/events`, wizard step events, `brief.submitted`, `brief.abandoned` and the funnel section
  - Files: `src/app/api/events/route.ts` (new), `src/lib/analytics/rateLimit.ts` (new), `src/components/brief/useBriefWizard.ts`, `src/app/api/briefs/route.ts`, `src/lib/brief/briefDrafts.ts`, `src/lib/analytics/queries.ts` (`funnel`), `src/components/admin/insights/*` (funnel section), `tests/unit/{analyticsEventsRoute,analyticsRateLimit}.test.ts` (new), `tests/e2e/analytics.test.ts` (wizard cases)
  - Estimate: medium
  - Kind: impl
  - Depends: T3
  - Notes:
    - **Covers:** FR-08, FR-10 (funnel); AC-09, AC-11 (funnel figures).
    - Server-set `teamId`/`userId`/`source`; ownership check on `briefDraftId`; 2 KB on the raw body (413); 60 per user per minute, excess counted; client calls are fire-and-forget and never block navigation.
    - E2E: wizard steps, Generate, Discard, an expired brief draft seeded old and swept by the dashboard read, the route's 400/401/413 and rate-limit cases, and the funnel figures against a hand count.
    - **Gate:** tsc, lint, unit, build, `analytics.test.ts` plus `brief-draft-recovery` and `brief`/`wizard` suites (check names).

### Wave 5 — Token counts

- [x] `T5` — The usage accumulator, API-mode token counts and the token section
  - Files: `src/lib/analytics/trace.ts` (`withUsage`, `addUsage`), `src/lib/models/anthropicCall.ts`, `src/lib/agent/generateDraft.ts`, `src/lib/drafts/draftActions.ts`, `src/lib/analytics/queries.ts` (`durations` tokens), `src/components/admin/insights/*` (token columns), `tests/unit/analyticsUsage.test.ts` (new), `tests/e2e/analytics.test.ts` (token case)
  - Estimate: small
  - Kind: impl
  - Depends: T4
  - Notes:
    - **Covers:** FR-09, FR-10 (tokens); AC-10.
    - `createMessage` adds usage only when an accumulator is active; no CLI change (`git diff --name-only 3c9b593 -- src/lib/agent/claudeCli.ts` empty). Null tokens mean "not reported"; totals exclude them and the page shows the not-reported share.
    - If the `MOCK_AI` seam bypasses `createMessage` (likely), the E2E token case seeds events through the seam; the summing is proven by the unit test.
    - **Gate:** tsc, lint, unit, build, `analytics.test.ts`.

### Wave 6 — Docs and the gate

- [x] `T6` — The docs, the full gate and CI
  - Files: `docs/handoff.md`, `docs/e2e-test-plan.md`, `CLAUDE.md`, `.specclaw/ROADMAP.md`
  - Estimate: small
  - Kind: docs
  - Depends: T5
  - Notes:
    - **Covers:** AC-17 and the documentation of every FR.
    - **handoff:** the 006 section (what is recorded and what is not; the four decisions and where each is read; the limits: the lazy stuck sweep, CLI tokens not reported, the verifier grades itself (split by verifier); the PostHog note (replace or dual-feed `queries.ts`); the purge script with its `DATABASE_URL` rule; retention and how to read its health) and a "Check before the merge" line (one additive migration `20261024120000_analytics_events` with its down script; no env var; the retention loop starts with the next worker deploy; no blocking step).
    - **e2e-test-plan:** section AD (TC-OBS-…), an AC-to-case table, the seam and its gates.
    - **CLAUDE.md:** the top entry (006 state, gates, run IDs; next is 025 after OP-1, plus the split-out stale-headline badge as a proposal), an "Analytics (006)" note under "Architecture decisions to remember" (one emitter per event, `track` never throws in prod, imported vocabularies, the read seam, the coverage guard; the "Check before the merge" migration).
    - **ROADMAP:** the 006 row; the stale-headline badge and CLI tokens as proposals.
    - **Full gate:** stop stray node processes (ask about :3002), `rm -rf .next`, drop and recreate `bistec_studio_test`, then `npm run test:e2e:serve` and `npm run test:e2e:mock` (0 failed, 0 flaky against 442/3/0/0 plus section AD; wait for `MOCK_EXIT`), tsc, lint, unit, `npm run test:render`, `npm run build`, `npm run test:upgrade`, `rm -rf .next`.
    - **Push `v2`** (never `main`) and watch `gh run list --branch v2` until green; record the run IDs.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
- `[>]` Deferred

## Open questions

None.
