# Design: Product observability (in-app event store and insights page)

**Change:** 006-product-observability
**Created:** 2026-10-23
**Spec:** [spec.md](spec.md) (FR/NFR/AC numbers below refer to it)

## Technical Approach

An append-only `AnalyticsEvent` table, written only through `track()`, read only through `queries.ts`, shown only on a super-admin page. Emission sits at the settle points that already exist, one emitter per event name. Nothing in the write path can fail the action; every loss is counted where the numbers are read.

```
generateDraft.ts ─┐                      ┌─ catalogue.ts (zod per name, schemaVersion,
draftActions.ts ──┤                      │   imported vocabularies, caps, redactText)
revision routes ──┼─► track(name, f) ────┤
trackPublish ─────┤   (2 s race,         └─► INSERT "AnalyticsEvent"
generationRunner ─┤    never throws            │ fail/timeout/invalid
recoverIfStuck ───┤    in prod)                └─► UPSERT "AnalyticsDrop" (best effort)
POST /api/events ─┘
                                worker loop "retention" (runTick, every 60 s)
                                  └─► DELETE … WHERE at < now() - 180 days LIMIT 5000
/admin/insights ─► GET /api/admin/insights (withSuperAdmin) ─► queries.ts ─► SQL
```

## Architecture

### Module layout

| Path                                         | Content                                                                                                     |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/lib/analytics/catalogue.ts`             | event names, zod payload schemas, `schemaVersion`, `CLIENT_EVENTS`, caps, the header rule for later changes |
| `src/lib/analytics/track.ts`                 | `track`, `AnalyticsSchemaError`, the 2 s race, the drop counter                                             |
| `src/lib/analytics/trace.ts`                 | `ActionTrace` type and `newActionTrace()`; the usage accumulator (wave 3)                                   |
| `src/lib/analytics/queries.ts`               | every insights read (the read seam, NFR-08)                                                                 |
| `src/lib/analytics/retention.ts`             | `sweepAnalytics()` (the SQL delete)                                                                         |
| `src/lib/analytics/rateLimit.ts`             | the in-process per-user window for `POST /api/events` (wave 2)                                              |
| `src/lib/text/redact.ts`                     | `redactText` (moved from `backgroundNotice.ts`; `redactSkipDetail` becomes a re-export so 005 is untouched) |
| `src/lib/publish/trackPublish.ts`            | `trackPublish(outcome, ctx)`                                                                                |
| `src/app/api/admin/insights/route.ts`        | `GET`, `withSuperAdmin`, zod `range`                                                                        |
| `src/app/(app)/admin/insights/page.tsx`      | the page (client; `useCurrentUser` gate; React Query)                                                       |
| `src/components/admin/insights/*`            | section components (tables, bar rows)                                                                       |
| `src/app/api/events/route.ts`                | the client events route (wave 2)                                                                            |
| `src/app/api/test/analytics-events/route.ts` | the test seam (GET/DELETE/POST seed, plus `failNext` for AC-08)                                             |
| `scripts/purge-analytics.mjs`                | the operator purge                                                                                          |

`src/lib/analytics/*` imports no React and no `@/components`; `track.ts` and `queries.ts` import `@/lib/prisma`. The catalogue is pure (zod plus type imports and Prisma enums from `@prisma/client`), so the coverage test can read it without a database.

### Schema (migration `20261024120000_analytics_events`)

```prisma
enum AnalyticsSource { web scheduler mcp }

model AnalyticsEvent {
  id            String          @id @default(cuid())
  at            DateTime        @default(now()) @db.Timestamptz(3)
  name          String
  schemaVersion Int
  source        AnalyticsSource
  teamId        String
  userId        String?
  draftId       String?
  durationMs    Int?
  outcome       String?
  payload       Json
  @@index([at])
  @@index([name, at])
  @@index([teamId, at])
  @@index([draftId])
}

model AnalyticsDrop {
  name       String   @id
  dropped    Int      @default(0)
  rejected   Int      @default(0)
  lastAt     DateTime @db.Timestamptz(3)
  lastReason String
}
```

No relations (spec A1). The down script drops both tables and the type and deletes the `_prisma_migrations` row, as 023's does.

### `track`

```ts
export async function track(name: EventName, f: TrackFields): Promise<void>
// 1. parse f.payload with CATALOGUE[name].schema (caps applied by the schema's .transform)
//    invalid → isTestSeam() ? throw new AnalyticsSchemaError(name, issues) : count('rejected', name, summary)
// 2. Promise.race([prisma.analyticsEvent.create(...), timeout(2000)])
//    reject/timeout → count('dropped', name, reason)
// 3. count() = prisma.analyticsDrop.upsert(... increment ...) inside try/catch; log '[analytics] …' once
```

`isTestSeam()` is `process.env.MOCK_AI === 'true' || process.env.NODE_ENV === 'test'`, read directly (the `modelCalls.ts` precedent, to avoid an import cycle with `testHooks`). The seam's `failNext(n)` sets a module-level counter that makes the next `n` inserts reject, only under `MOCK_AI`.

`track` is **awaited** at every emitter. All emitters except `trackPublish` on the web publish route and `POST /api/events` run off the request path (background generation, the action's `work`, the worker), so awaiting costs the user nothing; on the two request-path sites the 2 s bound is the worst case. Awaiting makes the E2E deterministic: an event exists once the action has settled.

### The catalogue and its vocabularies

Each entry: `{ schemaVersion: 1, source: readonly AnalyticsSource[], outcomes: readonly string[], schema: z.ZodType }`. Shared fragments (`modelFields`, `failureReason`, `refineAttempt`) are defined once. Imported vocabularies:

| Field                     | Source of truth                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| action                    | `z.nativeEnum(DraftAction)` (`@prisma/client`)                                                                 |
| channel                   | `z.nativeEnum(Channel)`                                                                                        |
| caption route             | `z.nativeEnum(CaptionRoute)` plus the 024 stamp strings (`SERVER_KEY`, `OTHER`) from `src/lib/models/route.ts` |
| design mode, aspect ratio | `z.nativeEnum(DesignMode)`, `z.nativeEnum(AspectRatio)`                                                        |
| model key / model id      | the catalogue keys and ids exported by `src/lib/models/catalogue.ts`                                           |
| archetype                 | `ARCHETYPE_KEYS` from `@/lib/designData` (plus `classic`)                                                      |

The header comment states the additive-only rule and that a later change adding an action, channel, generation path or publish path owns its events (FR-13).

### Emitters

**Generation** (`generateDraft.ts`). `GenerationActor` becomes `{ userId: string | null; teamId: string; source: AnalyticsSource }`. `runGenerationForDraft` records `t0` at entry, and after `finalizeDraftV1` (success) or in its existing catch (failure) calls `track('generation.finished', …)` with the fields in scope (`draft.brief`, `models`, `captionStamp`, `design.stamp`, `design.backgroundSkip`). `generateDraftForBrief` wraps its body in `try { … track ok … return } catch (e) { track failed; throw e }`. Fields not yet computed when a throw happens early are null. Callers: `backgroundGeneration.ts` passes `source: 'web'`, `generationRunner.ts` `'scheduler'`, `mcp/tools/generate.ts` `'mcp'`.

**Draft actions** (`draftActions.ts`). `startDraftAction(draftId, userId, teamId, claim, work, onError?, trace?)` gains a trailing optional `trace: ActionTrace` (the three routes pass one; nothing else calls it). It sets `trace.startedAt` at entry. At its single settle point, after the settle write succeeded, it emits `draft_action.settled` with `durationMs = now - startedAt`, the outcome (`ok` from `completeDraftAction`, `not-applied` from the `'not-applied'` completion, `conflict` when `trace.outcome === 'conflict'` was set by the conflict sink, `failed` from the catch with the redacted message) and `trace.fields`. If the settle write lost its claim (019), no event is emitted (the swept event already covered it).

`ActionTrace = { startedAt: number; outcome?: 'conflict'; fields: Partial<DraftActionPayload> }` — a plain mutable object closed over by `work`; no ambient state in wave 1.

**Refine data.** `RefineAttemptResult`'s `accepted` variant gains `attempts: AttemptSummary[]` (classes, effectiveClasses, verdict, reasons count), built from the `a.diag` values the loop already holds at `refineAttempt.ts:307-309`; the `not-applied` variant already carries `diagnostics.attempts`. The refine route copies them into `trace.fields`, with `instruction`, `model` (the resolved REFINE model), `verifierModel` (`internalModel('INTERNAL_VERIFIER', mode).arg`) and `VERIFIER_PROMPT_VERSION` (new exported constant in `refineVerify.ts`, value `'2026-10-24.1'`; `VERIFIER_SYSTEM` text unchanged, golden-tested). Regenerate design and regenerate copy fill only `model`.

**Swept** (`recoverIfStuck`). After its guarded `updateMany` reports one row changed, it emits `generation.swept` (with `ageMs`) or `draft_action.swept` (with `action`). `durationMs` null.

**Revisions.** One `track` call in each of the four routes after the write succeeds: inline-edit (both modes, payload `mode`), the refine Override branch, adopt, restore (payload `from`, `to`). `commitDraftRevision` is not changed.

**Publish.** `trackPublish({ source, teamId, userId, draftId, channel, outcome, terminal, retryCount, errorReason, startedAt })` in `src/lib/publish/trackPublish.ts`, called at: `createAndPublishPost` (success and both failure branches; it gains `source`, passed by `posts/route.ts` `'web'` and `mcp/tools/publish.ts` `'mcp'`), `posts/[id]/publish/route.ts` (web), and the three `jobRunner.ts` branches (`'scheduler'`; `retry-scheduled` for the backoff branch).

**Scheduled generation.** `generationRunner.ts` emits `scheduled_generation.settled` at its COMPLETED, retry and FAILED writes.

### Deletes

- `DELETE /api/admin/teams/[id]`: its `team.update` becomes a `$transaction([team.update, analyticsEvent.deleteMany({ where: { teamId } })])`.
- `DELETE /api/drafts/[id]`: its existing transaction gains `analyticsEvent.updateMany({ where: { draftId }, data: { draftId: null } })`.
- `scripts/purge-analytics.mjs`: `--team | --user | --draft`, `--dry-run`; exits 2 without `DATABASE_URL`; prints `new URL(DATABASE_URL).pathname` and the count; uses `@prisma/client` with `deleteMany`.

### Retention

`sweepAnalytics(): Promise<number>` runs one `$executeRaw`:

```sql
DELETE FROM "AnalyticsEvent" WHERE id IN (
  SELECT id FROM "AnalyticsEvent" WHERE "at" < now() - interval '180 days' ORDER BY "at" LIMIT 5000)
```

`worker.ts` adds `loop("retention", sweepAnalytics)` to its `Promise.all`. The loop writes a `WorkerHeartbeat` row named `retention` through `runTick`; `heartbeatStatus.ts`, the status route and the test seam's loop enum are **not** changed, so the 023 banner is unaffected (the status route iterates its own `LOOPS`). The worker is esbuild-bundled with relative imports only, so `retention.ts` imports prisma relatively in the worker graph, as `heartbeat.ts` does. Testing needs no clock seam: the cutoff is in SQL, and E2E seeds rows at 181 and 179 days through the seam and calls a test route that runs `sweepAnalytics()` once (`POST /api/test/analytics-events` with `{ sweep: true }`).

### The insights page

`queries.ts` exports one function per section, each `(range: { from: Date; to: Date }) => Promise<…>`, using `prisma.$queryRaw` with tagged templates (no string building):

- `refineAppliedRate` — grouped by ISO week, class (unnested from the payload's attempt classes; a refine counts once per class it carries), verifier model, verifier prompt version.
- `failureTrend` — per day, by prompt version and design model; `topFailureReasons(limit 10)`; swept counts.
- `imageStyles` — per requested archetype: generations, applied-as-requested rate, fallback reason counts, mean refines per draft (a join of `generation.finished` and `draft_action.settled` on `draftId`).
- `durations` — `percentile_cont(0.5/0.9)` by name, model, route; token totals and the not-reported share (wave 3).
- `funnel` (wave 2), `teamActivity`, `lostEvents` (reads `AnalyticsDrop`), `retentionHealth` (oldest `at`, the `retention` heartbeat row).

`GET /api/admin/insights?range=7d|30d|90d` returns one JSON with every section. The page renders each section with `Card`/`FieldLabel`/table atoms and percentage bars from existing token classes; no charting library.

### Wave 2: wizard events

- `useBriefWizard.ts`: on a forward step change, `void apiFetch('/api/events', { method: 'POST', body: { name: 'wizard.step', payload: { step, briefDraftId } } })` (fire-and-forget; errors ignored).
- `POST /api/events` (`withTeamAuth`): body ≤ 2 KB (checked on the raw text before parse, 413); zod `{ name: z.enum(CLIENT_EVENTS), payload }`; `briefDraftId` kept only if `briefDraft.findFirst({ id, userId })` finds it; `rateLimit.allow(userId)` (60 per rolling minute, a `Map` of timestamps pruned on each call), excess counted as `dropped` with reason `rate-limit`; then `track` with session fields. Returns 204.
- `brief.submitted` in `POST /api/briefs` after create (it knows whether `resume` was set).
- `brief.abandoned` in `sweepExpiredBriefDrafts` (reason `expired`) and in `deleteBriefDraft` when `keepImages` is false (reason `discarded`), with `step` read from the row's parsed payload (null if it no longer parses).

### Wave 3: tokens

`trace.ts` adds `withUsage(fn)` (an `AsyncLocalStorage<{ input: number; output: number; calls: number }>`) and `addUsage(u)`. `createMessage` calls `addUsage(message.usage)` when a store is active. `startDraftAction` and the generation emitters run their work inside `withUsage` and put `inputTokens`/`outputTokens` (or null when `calls === 0`) in the payload. The CLI path calls nothing, so CLI-mode events carry null (spec A3).

## File Changes Map

| File                                                                                                                                                                                    | Change                                             | Task |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---- |
| `prisma/schema.prisma`, `prisma/migrations/20261024120000_analytics_events/`, `prisma/rollback/006-product-observability.down.sql`                                                      | new tables, enum, down script                      | T1   |
| `src/lib/analytics/{catalogue,track,trace}.ts`, `src/lib/text/redact.ts`, `src/lib/drafts/backgroundNotice.ts` (re-export)                                                              | new; redact moved                                  | T1   |
| `tests/unit/{analyticsTrack,analyticsCatalogue,analyticsCoverage,redactText}.test.ts`                                                                                                   | new                                                | T1   |
| `src/lib/agent/{generateDraft,backgroundGeneration}.ts`, `src/lib/scheduler/generationRunner.ts`, `src/mcp/tools/generate.ts`                                                           | `source`, generation events                        | T2   |
| `src/lib/drafts/{draftActions,refineAttempt,refineVerify}.ts`, the refine, regenerate-design, regenerate-copy routes                                                                    | trace, settle event, refine data, verifier version | T2   |
| `src/app/api/drafts/[id]/route.ts` (`recoverIfStuck`, `DELETE`), inline-edit, adopt, restore routes                                                                                     | swept, revision events, draft-delete unlink        | T2   |
| `src/lib/publish/{publishDraft,trackPublish}.ts`, `src/lib/scheduler/jobRunner.ts`, `src/app/api/posts/route.ts`, `src/app/api/posts/[id]/publish/route.ts`, `src/mcp/tools/publish.ts` | publish events                                     | T2   |
| `src/app/api/admin/teams/[id]/route.ts`                                                                                                                                                 | team delete removes events                         | T2   |
| `src/app/api/test/analytics-events/route.ts`                                                                                                                                            | the seam                                           | T2   |
| `tests/unit/{analyticsEmitters,analyticsRefineTrace,analyticsDeletes}.test.ts`, fakes in existing tests as needed                                                                       | new / adapted                                      | T2   |
| `src/lib/analytics/{queries,retention}.ts`, `src/scheduler/worker.ts`, `scripts/purge-analytics.mjs`                                                                                    | reads, retention, purge                            | T3   |
| `src/app/api/admin/insights/route.ts`, `src/app/(app)/admin/insights/page.tsx`, `src/components/admin/insights/*`, `src/components/layout/AppShell.tsx`                                 | page, API, nav                                     | T3   |
| `tests/unit/analyticsQueries.test.ts`, `tests/e2e/analytics.test.ts` (section AD)                                                                                                       | new                                                | T3   |
| `src/app/api/events/route.ts`, `src/lib/analytics/rateLimit.ts`, `src/components/brief/useBriefWizard.ts`, `src/app/api/briefs/route.ts`, `src/lib/brief/briefDrafts.ts`                | wizard wave                                        | T4   |
| `src/lib/analytics/trace.ts` (usage), `src/lib/models/anthropicCall.ts`, the emitters                                                                                                   | token wave                                         | T5   |
| `docs/handoff.md`, `docs/e2e-test-plan.md`, `CLAUDE.md`, `.specclaw/ROADMAP.md`                                                                                                         | docs                                               | T6   |

**Unchanged on purpose:** `src/lib/agent/prompts/**`, `VERIFIER_SYSTEM`'s text, `src/lib/agent/claudeCli.ts`, `src/lib/scheduler/heartbeatStatus.ts`, `src/app/api/scheduler/status/route.ts`, `commitDraftRevision`'s signature.

## Data Model Changes

Two new tables and one enum (above). No existing table or column changes.

## API Changes

| Route                                        | Change                                                         |
| -------------------------------------------- | -------------------------------------------------------------- |
| `GET /api/admin/insights`                    | new, `withSuperAdmin`                                          |
| `POST /api/events`                           | new (wave 2), `withTeamAuth`, 204 / 400 / 401 / 413            |
| `GET/DELETE/POST /api/test/analytics-events` | new test seam (404 in production and without `MOCK_AI`; admin) |
| everything else                              | unchanged responses                                            |

## Key Decisions

- **Plain-string ids, explicit delete behaviour** over FKs: the table never blocks a delete, and the user's delete rules are three explicit lines (FR-12).
- **Awaited `track` with a 2 s race** over fire-and-forget: deterministic tests, a bounded worst case, and almost every emitter is off the request path anyway.
- **One indexed delete per minute** over a once-a-day gate: no gate state to store or test; the cost is one cheap query.
- **Retention loop outside 023's monitored set**: its health shows on the insights page instead, so the "Scheduler offline" banner keeps its meaning.
- **`trace` argument** over ambient state for wave 1: explicit and testable; ambient `AsyncLocalStorage` is used only for token usage (wave 3), which is produced too deep to thread.
- **Revision events in the four routes** over a `kind` on `commitDraftRevision`: restore does not use it, and one call per route is clearer than a new parameter on a shared writer.
- **No CLI parser change**: CLI tokens are "not reported" (spec A3).

## Panel findings, and where each is answered

| Finding (seat)                                                       | Answer                                                                                                                                    |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Cheaper variant never priced (po, BLOCK)                             | The user chose the staged event store; the per-row variant collides with 004's CHECK (architect NOTE). Waves are the cut line (tasks.md). |
| Do-nothing never priced (po)                                         | FR-10 names the four decisions the page serves.                                                                                           |
| Badge is unrelated scope (po); badge BLOCKs (security ×2, architect) | Split out by the user; not in this change.                                                                                                |
| Runtime cost unquantified (po)                                       | NFR-06 counts rows; `track` is awaited with a 2 s bound.                                                                                  |
| Tokens feed no decision; double retention (po)                       | Tokens are wave 3 for decision 4; one retention mechanism (FR-11).                                                                        |
| Cut line not named (po NOTE)                                         | Waves 1 to 3 plus docs (tasks.md).                                                                                                        |
| No acceptance criteria for the applied rate (ba)                     | AC-05, AC-11, AC-12, AC-08.                                                                                                               |
| "Applied" and "abandoned" undefined (ba)                             | FR-05, FR-08.                                                                                                                             |
| Token panel may be empty for CLI (ba NOTE)                           | FR-09, AC-10: null = not reported, share shown.                                                                                           |
| Lost events read as healthy (security)                               | `AnalyticsDrop`, the page's "events lost", the 2 s bound (FR-02, FR-10).                                                                  |
| `POST /api/events` abuse (security)                                  | FR-08: session-set fields, ownership check, 2 KB, 60/min.                                                                                 |
| Free text caps, redaction, purge (security)                          | FR-03, FR-12.                                                                                                                             |
| GET runs an unbounded DELETE (security NOTE)                         | The page never deletes; SQL-only cutoff, batches of 5 000 (FR-11).                                                                        |
| Verifier grades itself (security NOTE)                               | Verifier model id and prompt version recorded and split (FR-05, FR-10).                                                                   |
| Lazy-only sweep fails open (security, visionary rebuttals)           | Worker loop only, oldest-event age shown (FR-11, FR-10).                                                                                  |
| No carrier for trace fields (architect)                              | `ActionTrace` argument; `accepted` carries attempts; usage via ALS in wave 3.                                                             |
| Overlapping emitters (architect)                                     | The one-emitter table (FR-04) and the `source` parameter.                                                                                 |
| Third loop vs 023 heartbeat (architect)                              | Not added to `HeartbeatLoop`/`LOOPS`; health on the page.                                                                                 |
| Gate state and clock seam (architect)                                | No gate; SQL cutoff; seeded rows plus a sweep seam.                                                                                       |
| FK / on-delete unspecified (architect)                               | No FKs; FR-12 delete rules.                                                                                                               |
| Duplicated vocabularies (visionary)                                  | Imported enums; throw under test seams (FR-02, FR-13).                                                                                    |
| Coverage guard (visionary)                                           | `analyticsCoverage.test.ts` (FR-13).                                                                                                      |
| Payload versioning (visionary)                                       | `schemaVersion` column and the additive-only rule (FR-02).                                                                                |
| PostHog door is write-side only (visionary)                          | `queries.ts` read seam, stated in NFR-08.                                                                                                 |
| Style chart missing (visionary NOTE)                                 | FR-10 section 3.                                                                                                                          |
| Don't cut to domain columns (visionary NOTE)                         | Not cut to columns.                                                                                                                       |

## Risks & Mitigations

| Risk                                                    | Mitigation                                                                          |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| An emitter's `track` slows or breaks an action          | never throws in prod, 2 s race, AC-08 failure-injection E2E                         |
| A later change adds an action or channel without events | coverage guard test (FR-13)                                                         |
| Vocabulary drift silently drops events                  | imported enums; throws under test seams; `rejected` counter on the page             |
| Refine-diagnostics plumbing changes refine behaviour    | additive field on `accepted`; existing refine unit and E2E suites unchanged         |
| Insights SQL is wrong                                   | E2E seeds a known set and compares every figure to a hand count (AC-11, AC-12)      |
| Refine text leaks client data to the global store       | 2 000-char cap, super-admin-only reads, 180 days, purge script, team delete removes |
| The retention loop dies unnoticed                       | the page shows the oldest event's age and the loop's last tick                      |

## Grounding sources

- The 006 code surveys (2026-10-23): `draftActions.ts` (`startDraftAction` is the single settle point for all three actions; no context object exists), `refineAttempt.ts:104-113, 270-311` (the `accepted` result drops attempts), `refineVerify.ts:90, 304, 370-397` (no verifier prompt version; `internalModel('INTERNAL_VERIFIER', mode)`), `generateDraft.ts:62-360` (fields in scope; no source today), `revisions.ts:413` (`commitDraftRevision` has no caller kind; four writers bypass it), `publishDraft.ts:39-102` and `jobRunner.ts:46-139` (outcomes decided at several sites), `heartbeatStatus.ts:11-19` and `scheduler/status/route.ts` (hard-coded loops and a 3-minute rule), `admin/teams/[id]/route.ts:60` (soft delete), `drafts/[id]/route.ts:301-317` (hard delete), `backgroundNotice.ts:48-53` (redaction rules), `claudeCli.ts` (text mode has no `--output-format`), `anthropicCall.ts:52-93` (`message.usage` reachable), `briefDraftPayload.ts:19` (step in the payload), `package.json` (no charting library).
- `prisma/schema.prisma` `LegacyCaptionArchive` ("must survive a draft delete and must never block one") as the no-FK precedent.
- `src/lib/models/modelCalls.ts` (reading `MOCK_AI` from `process.env` directly to avoid an import cycle).
- `.specclaw/changes/023-scheduler-heartbeat/` (the down-script and checklist format), `.specclaw/changes/007-brandkit-design-system/` (format).
- CLAUDE.md: "Never run a prisma or DB command without an explicit `DATABASE_URL`"; "A `page.waitForResponse` must be created before the action that triggers the request".
