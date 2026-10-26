# Design: Model selection per surface (Haiku / Sonnet / Opus)

**Change:** 008-model-selection
**Created:** 2026-10-12
**Spec:** [`spec.md`](spec.md) · **Proposal:** [`proposal.md`](proposal.md) (its "Panel rulings" and "Panel resolutions" sections are binding) · **Panel:** [`party-report.md`](party-report.md)

## 1. Survey: every model choice in the code today (2026-10-12, `v2` at `b0fb88b3`)

These are found by grepping `src/` for `claude-(haiku|sonnet|opus)`, quoted `haiku`/`sonnet`/`opus`, `modelFor`, `modelForBackground` and `CLAUDE_CLI_MODEL`, plus every `runClaudeCli*`, `runVisionModel` and `messages.create` call.

| #   | Site                                                               | What it does today                                                                                                                                                                              | Surface (008)                                                  |
| --- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | `src/lib/agent/config.ts:23-46`                                    | `API_MODELS` / `CLI_MODELS` / `BACKGROUND_MODELS` tables; `modelFor`, `modelForBackground`                                                                                                      | deleted, replaced by the catalogue + resolver                  |
| 2   | `src/lib/agent/claudeCli.ts:155-185`                               | `claudeModelArgs`: `CLAUDE_CLI_MODEL` beats the per-call model; `"haiku"` fallback; `"default"` omits `--model`; `pinModel`                                                                     | the CLI boundary (FR-07)                                       |
| 3   | `src/providers/implementations/copy/claude-cli.ts:12-15`           | caption call, **no model** → the `"haiku"` fallback; timeout 120 s                                                                                                                              | `CAPTION`                                                      |
| 4   | `src/providers/implementations/copy/anthropic.ts:9,23`             | `claude-haiku-4-5-20251001` constructor default; reads `content[0]`                                                                                                                             | `CAPTION`                                                      |
| 5   | `src/lib/agent/pathA.ts:93-106`                                    | `modelFor('A', …)` → Haiku                                                                                                                                                                      | `DESIGN_TEMPLATE`                                              |
| 6   | `src/lib/agent/pathB.ts:105-110`                                   | `modelFor('B', …)` → Sonnet (generation and regenerate-design)                                                                                                                                  | `DESIGN_FREEFORM`                                              |
| 7   | `src/lib/agent/designAgent.ts:94,98,270,272`                       | `claude-sonnet-4-6` defaults; `deadlineMs = 300_000` checked only at loop start                                                                                                                 | `DESIGN_*`, `REFINE` (API)                                     |
| 8   | `src/lib/agent/designAgentCli.ts:38,89`                            | `timeoutMs: 300_000` for design and refine                                                                                                                                                      | `DESIGN_*`, `REFINE` (CLI)                                     |
| 9   | `src/app/api/drafts/[id]/refine/route.ts:128-130,167`              | `modelFor(pathForDesignMode(…), mode)`                                                                                                                                                          | `REFINE`                                                       |
| 10  | `src/lib/drafts/refineVerify.ts:131-133,368-389`                   | `VERIFIER_MODEL` literals, `pinModel: true`, 60 s                                                                                                                                               | `INTERNAL_VERIFIER`                                            |
| 11  | `src/lib/agent/background.ts:88-107`                               | `modelForBackground`, 90 s                                                                                                                                                                      | `INTERNAL_BACKGROUND`                                          |
| 12  | `src/lib/agent/userToken.ts:126-131`                               | literal `'haiku'`, 60 s, explicit `authToken`                                                                                                                                                   | `INTERNAL_TOKEN_PING`                                          |
| 13  | `src/lib/campaign/briefingAssistant.ts:32-62` (`runBriefingModel`) | `modelFor('B', …)`, 120 s. Shared by the briefing chat, both Enhances and the brand-kit chat's text turns                                                                                       | `ASSISTANT_BRIEFING` / `ASSISTANT_BRANDKIT` (caller passes it) |
| 14  | `src/lib/agent/vision.ts:53-115` (`runVisionModel`)                | `modelFor('B', …)`, 180 s. Called by the briefing chat (`briefingAssistant.ts:201`), the brand-kit chat (`brandkit/assistant.ts:221`) and image → template (`brandkit/templateFromImage.ts:45`) | caller passes it                                               |
| 15  | `src/lib/brandkit/voiceDraft.ts:7,36-43`                           | `claude-sonnet-4-6`, **SDK only** (no CLI path)                                                                                                                                                 | `ASSISTANT_BRANDKIT`                                           |
| 16  | `src/lib/env.ts:56`                                                | `CLAUDE_CLI_MODEL: z.string().optional()`, free-form                                                                                                                                            | validated system default (FR-04)                               |
| 17  | `scripts/cli-sandbox-check.mjs:87`                                 | `VISION_MODEL = "sonnet"`, pinned to `claudeCli.ts` by a drift test                                                                                                                             | re-pinned to the catalogue (FR-15)                             |

**Not Claude, left alone:** `providers/implementations/copy/openai.ts:9` (`gpt-4o`) and the image providers. A team whose COPY provider is OpenAI is spec open question 1.

**Timing facts the budget rests on** (§5):

- `STUCK_GENERATION_MS = 15 min` (`drafts/recovery.ts:8`). Both sweeps compare `now − Draft.updatedAt` (`recovery.ts:82`): the IN_PROGRESS generation sweep and the `pendingAction` sweep.
- `touchDraftAction` (`drafts/draftActions.ts:45`) bumps `updatedAt` while a claim is held. Refine calls it at each attempt's start (`refine/route.ts:192`).
- `GENERATION_LEASE_MS = 15 min` (`scheduler/generationRunner.ts:14`). `leaseUntil` is computed **once per tick** (`:114`) for up to `CLAIM_BATCH = 2` entries that then run **sequentially**, so the second entry's lease runs while the first one works. That is a latent bug today: 2 × (120 + 90 + 300 + 60) s = 1,140 s > 900 s.
- `SET_CONTENT_TIMEOUT_MS = 60 s` (`renderer/puppeteer.ts:99`). The verifier takes 60 s and the background decision 90 s.
- The OpenAI image client (`providers/implementations/image/openai.ts:9`) uses the SDK defaults: 10 min per attempt and 2 retries. It is effectively unbounded against a 15-minute sweep.
- API-mode SDK calls use the default 10-minute timeout and 2 retries. The verifier is the exception, at `maxRetries: 0, timeout: 60 s` (`refineVerify.ts:378`).

## 2. Modules

Everything new lives in `src/lib/models/`. The rule is the one `recovery.ts` and `captions/resolve.ts` already follow: pure deciding code is client-safe, and I/O wrappers sit beside it.

```
src/lib/models/
  catalogue.ts     PURE, client-safe. ModelKey, Surface, the CATALOGUE, SYSTEM_DEFAULTS,
                   modelTier(), entryForStamp(). The ONLY file in src/ allowed a model literal.
  resolve.ts       PURE, client-safe. decideModel(), internalModel(), regenerateStampTier(),
                   effectiveSet(). Wave 2's picker imports this.
  policyRules.ts   PURE. validatePolicy() (FR-05 rules 1-4), DEFAULT_POLICY.
  budget.ts        PURE. STEP_BUDGETS, actionSegments(), actionBudgetViolations().
  policy.ts        server-only. loadTeamPolicy(), saveTeamPolicy(), resolveModel(), credentialTier(),
                   the once-per-process CLAUDE_CLI_MODEL boot line.
  anthropicCall.ts server-only. createMessage(), textOf(), ModelRefusalError.
  modelCalls.ts    recordModelCall() + the pluggable sink (no-op | MOCK_AI ring buffer | test).
```

`config.ts` keeps `isCliMode`, `pipelineMode`, `pathForDesignMode` and the `DesignPath`/`PipelineMode` types. Everything model-related leaves it (FR-03).

**Why a new directory rather than `agent/config.ts`** (the proposal says "catalogue in `config.ts`"): `env.ts` must validate `CLAUDE_CLI_MODEL` against the catalogue (FR-04), and `config.ts` imports `env.ts`. A pure `catalogue.ts` with no imports breaks the cycle, and the picker can import it on the client. This is a placement change only; the proposal's intent, one catalogue, holds.

### Adding a model (the procedure, party-visionary WARN)

1. Add one `CATALOGUE` entry. That covers its key, `apiId`, `cliArg`, prices with a dated `priceSource`, speed, eligible `surfaces` with their timeouts, and the two decisions `defaultAllowed` and `personalTokenGated`.
2. If the key is new (a new family, for example `FABLE`), add a migration with `ALTER TYPE "ModelKey" ADD VALUE 'FABLE';` **alone in its file** (Postgres can't use a new enum value inside the transaction that adds it).
3. `npm run test:unit`. The catalogue invariants (AC-01), the budget (AC-09) and the boundary (AC-12) all re-run against the new entry. A timeout that breaks a sweep fails here.
4. Existing teams with a **saved** policy don't get the model until an admin ticks it, where it shows as "New" (A2). Teams with no saved policy get it if `defaultAllowed`.

Upgrading a family (Sonnet 5.5 → 6) is step 1 alone: change `apiId` and `cliArg`, and push the old ID onto `previousApiIds`. Old stamps keep the exact ID that ran.

## 3. The resolver

```
explicit request ─┐
(stamp)          ─┤   each tier checked against effectiveSet(surface) = eligible ∩ allowed − gated
team default     ─┼─▶ first hit wins ─▶ ResolvedModel { key, entry, source, substitutedFrom, arg, timeoutMs }
system default   ─┤                           │
fallback         ─┘                           ▼
                               boundary: claudeCli argv `--model arg` | createMessage({ model: arg })
                               recorder: recordModelCall(...)          stamps: arg + substitutedFrom
```

- **Tier 1 fails; tiers 2–4 fall through.** Only tier 1 is a caller's live intent, so only it can be refused (400). A stored or stamped value that is no longer valid is history, so it is substituted and recorded, never thrown (security BLOCK + WARN).
- **`substitutedFrom` keeps the first refused value,** so the stamp names what the user or admin would have expected.
- **The fallback tier** guarantees that a non-empty effective set always resolves, even when every configured value is stale. The effective set itself is empty only through a hand-edited row (FR-05 makes it unreachable through the API), and then every caller fails closed with `NO_ALLOWED_MODEL`.
- **`credentialTier(userId)`** is one query: `UserClaudeToken where { userId, status: ACTIVE }` joined to `User.disabled = false`. `userId: null` is always `team`. In API mode it is `n/a` and no query runs.
- **Where resolution happens.** Resolution is always on the request path, **before** any claim, so a wave-2 400 claims nothing (FR-17). The `ResolvedModel` then travels **by value** into the background closure. Nothing resolves inside the background run, which avoids reading a policy that changed mid-action (edge case 1).
  - **The exception is async generation,** `runGenerationForDraft`. It is also entered by retry, so it resolves at its start from `Brief` + policy. It runs in the background, but its inputs are stored values only, never an explicit request.

### Call-site wiring (how a `ResolvedModel` reaches each boundary)

Plain parameters, no AsyncLocalStorage. The claude-auth ALS exists because the token must follow the call implicitly. A model is a visible argument and should stay one.

| Call path                               | Resolved at                                                                               | Passed through                                                                                                                                                                                                           |
| --------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Async generation                        | `runGenerationForDraft` start (Brief → team → system)                                     | `writeCaptions(provider, brief, targets, captionModel)` → `CopyProvider.generateCaptions(…, model)`; `produceDesign(…, designModel)` → `runPathADesign` / `runPathBDesign(…, model)` → `runDesignAgent{,Cli}({ model })` |
| Sync generation (scheduler, MCP, ACP)   | `generateDraftForBrief` start, `userId: null`                                             | same                                                                                                                                                                                                                     |
| `regenerate-copy`                       | route, before `claimCaptionAction` (stamp per FR-09)                                      | closure → `writeCaptions(…, model)`                                                                                                                                                                                      |
| `regenerate-design`                     | route, before `claimDraftAction`                                                          | closure → `runPathBDesign(…, model)`                                                                                                                                                                                     |
| `refine`                                | route, before `claimDraftAction` (`designPath` from the brief)                            | `runRefineAttempts({ model })` (exists) → `runDesignAgent{,Cli}Refine`                                                                                                                                                   |
| Verifier, background, token ping        | inside their own modules: `internalModel(surface, mode)`                                  | —                                                                                                                                                                                                                        |
| Briefing chat, both Enhances            | the lib function (`runBriefingChat`, `enhanceBriefing`, `enhancePostBrief`) from `teamId` | `runBriefingModel(system, messages, teamId, model)` / `runVisionModel({ …, model })`                                                                                                                                     |
| Brand-kit chat, image → template, voice | the lib function (`runBrandKitChat`, `generateTemplateFromImage`, `draftBrandVoice`)      | same                                                                                                                                                                                                                     |

`CopyProvider.generateCaptions(brief, targets, model: ResolvedModel)` is a widened interface. The OpenAI provider ignores `model` and returns its own ID for the stamp (open question 1). To carry the stamp, the provider returns `{ raw, modelId }`, and `writeCaptions` returns the stamp beside the fields: `{ fields, stamp: { model, substitutedFrom } }`.

## 4. Schema, migration and rollback

`prisma/migrations/20261012120000_model_selection/migration.sql` (hand-written):

```sql
CREATE TYPE "ModelKey" AS ENUM ('HAIKU', 'SONNET', 'OPUS');
CREATE TYPE "ModelSurface" AS ENUM ('CAPTION', 'DESIGN_TEMPLATE', 'DESIGN_FREEFORM', 'REFINE',
                                    'ASSISTANT_BRIEFING', 'ASSISTANT_BRANDKIT');

CREATE TABLE "TeamModelPolicy" (
  "teamId" TEXT PRIMARY KEY REFERENCES "Team"("id") ON DELETE CASCADE,
  "allowedModels" "ModelKey"[] NOT NULL,
  "requirePersonalTokenForGated" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "TeamModelDefault" (
  "teamId" TEXT NOT NULL REFERENCES "TeamModelPolicy"("teamId") ON DELETE CASCADE,
  "surface" "ModelSurface" NOT NULL,
  "model" "ModelKey" NOT NULL,
  PRIMARY KEY ("teamId", "surface")
);

ALTER TABLE "Brief" ADD COLUMN "captionModel" "ModelKey", ADD COLUMN "designModel" "ModelKey";
ALTER TABLE "Draft" ADD COLUMN "headlineModel" TEXT, ADD COLUMN "headlineModelSubstitutedFrom" TEXT,
                    ADD COLUMN "designModel" TEXT,   ADD COLUMN "designModelSubstitutedFrom" TEXT;
ALTER TABLE "DraftRevision" ADD COLUMN "model" TEXT, ADD COLUMN "modelSubstitutedFrom" TEXT;
ALTER TABLE "DraftCaption"  ADD COLUMN "model" TEXT, ADD COLUMN "modelSubstitutedFrom" TEXT;
```

- **Only additions.** Every new `Draft`/`DraftRevision`/`DraftCaption` column is nullable `TEXT`, so pre-008 rows read as "unknown", which is 004's stamp rule.
- **Why the stamps are `TEXT`, not `ModelKey`:** they record exactly what crossed the boundary, including a retired ID (`claude-sonnet-4-6`) or a non-Claude provider's (`gpt-4o`). History is never rewritten.
- **`Team` gains no column.** The policy is its own 1:1 table, absent until first saved.
- **The `RenderStamp` naming.** `DraftRevision.model` is the proposal's name. `RenderStamp` spreads onto both tables (`revisions.ts:36-45`), and their column names differ (`Draft.designModel` against `DraftRevision.model`). So `RenderStamp` gains `model` and `modelSubstitutedFrom`, and one helper, `draftStampFields(stamp)`, maps them to `designModel` / `designModelSubstitutedFrom` for the draft writes. This is one helper, used at every draft write that spreads a stamp today: `finalizeDraftV1`, the sync create, regenerate-design, `commitDraftRevision`, restore and adopt.

`prisma/rollback/008-model-selection.down.sql`:

```sql
-- 008 FR-06: manual full removal, run only to take 008 out entirely. The previous image does NOT
-- need it (it never reads these columns). Outside prisma/migrations/: never applied by migrate deploy.
ALTER TABLE "DraftCaption"  DROP COLUMN IF EXISTS "model", DROP COLUMN IF EXISTS "modelSubstitutedFrom";
ALTER TABLE "DraftRevision" DROP COLUMN IF EXISTS "model", DROP COLUMN IF EXISTS "modelSubstitutedFrom";
ALTER TABLE "Draft" DROP COLUMN IF EXISTS "headlineModel", DROP COLUMN IF EXISTS "headlineModelSubstitutedFrom",
                    DROP COLUMN IF EXISTS "designModel",   DROP COLUMN IF EXISTS "designModelSubstitutedFrom";
ALTER TABLE "Brief" DROP COLUMN IF EXISTS "captionModel", DROP COLUMN IF EXISTS "designModel";
DROP TABLE IF EXISTS "TeamModelDefault";
DROP TABLE IF EXISTS "TeamModelPolicy";
DROP TYPE IF EXISTS "ModelSurface";
DROP TYPE IF EXISTS "ModelKey";
-- L24: un-record the migration so a later 008 redeploy re-applies it by itself.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261012120000_model_selection';
```

**`export-posts.mjs` / `import-posts.mjs`** copy the two `Brief` keys and the eight stamp columns verbatim. Stamps are plain text, and the keys are enum values valid on both machines.

## 5. Timeouts and the action budget

### Per-model, per-surface timeouts (seconds) — **measured placeholders** (A9, AC-32)

| Surface               | Haiku 4.5 | Sonnet 5.5 | Opus 5.5 | Today                |
| --------------------- | --------- | ---------- | -------- | -------------------- |
| `CAPTION`             | 120       | 180        | 240      | 120                  |
| `DESIGN_TEMPLATE`     | 300       | 360        | —        | 300                  |
| `DESIGN_FREEFORM`     | 300       | 360        | 600      | 300                  |
| `REFINE`              | 300       | 360        | 540      | 300                  |
| `ASSISTANT_BRIEFING`  | 180       | 180        | 300      | 120 text, 180 vision |
| `ASSISTANT_BRANDKIT`  | 180       | 180        | 300      | 120 text, 180 vision |
| `INTERNAL_BACKGROUND` | 90        | —          | —        | 90                   |
| `INTERNAL_VERIFIER`   | 60        | —          | —        | 60                   |
| `INTERNAL_TOKEN_PING` | 60        | —          | —        | 60                   |

- **Sonnet goes up from 300 to 360 s.** Sonnet 5.5 thinks by default, adaptively, and Sonnet 4.6 did not, so the first deploy should not shorten the margin. The 2026-07-01 measurement (Sonnet 4.6 Path B at 61 s) predates thinking.
- **Opus REFINE is 540, not 600.** The API-mode refine segment below puts 600 over the limit, and the budget test was used to pick the number.
- **Assistants take one value per surface:** the vision timeout, which is the longer of the two today. They are synchronous requests with no sweep, so the cost of the higher value is only a longer wait before a hung request fails.

### Fixed step budgets (`budget.ts` `STEP_BUDGETS`, imported from their real homes where one exists)

| Step                                      | Seconds | Source                                                                                                                    |
| ----------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| background decision                       | 90      | `INTERNAL_BACKGROUND` timeout (catalogue)                                                                                 |
| image generation                          | 120     | **new** `IMAGE_GENERATION_TIMEOUT_MS`, OpenAI client `timeout` + `maxRetries: 0`; Gemini's existing value                 |
| render (setContent + screenshot + upload) | 90      | `SET_CONTENT_TIMEOUT_MS` (60) + 30 s screenshot/upload allowance                                                          |
| verifier                                  | 60      | `INTERNAL_VERIFIER` timeout                                                                                               |
| transaction                               | 10      | `TX_MAX_WAIT_MS` (`revisions.ts`)                                                                                         |
| API tool tail (design)                    | 210     | image + render: the tool work a design-loop turn can start just before its deadline (`renderHtml`, `generateImage` tools) |
| API tool tail (refine)                    | 120     | image only (the refine tool list has no `renderHtml`, `designAgent.ts:259`)                                               |
| margin                                    | 60      | `MARGIN_MS`                                                                                                               |

**Not bounded, as today:** the renderer queue wait under `PUPPETEER_MAX_CONCURRENCY`. The margin absorbs a short wait, and this is the same posture 004 T17 documented at `refine/route.ts:185-186`.

### Liveness segments (worst case = max over eligible models, both modes; limit 900 s)

| Action               | Segment (between liveness writes)                                    | Worst case at the placeholders                                                                   | + margin | Limit |
| -------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------- | ----- |
| Async generation     | create → captions saved (headline write)                             | CAPTION Opus 240                                                                                 | 300      | 900   |
|                      | captions saved → **pre-design touch** (new)                          | background 90 + image 120 = 210                                                                  | 270      | 900   |
|                      | pre-design touch → finalize                                          | API: design 600 + tool tail 210 + tx 10 = 820; CLI: 600 + render 90 + tx 10 = 700                | 880      | 900   |
| Regenerate design    | claim → **pre-design touch** (new)                                   | 210                                                                                              | 270      | 900   |
|                      | pre-design touch → settle                                            | 820                                                                                              | 880      | 900   |
| Refine               | claim → attempt-1 touch                                              | background 90 + image 120 = 210                                                                  | 270      | 900   |
|                      | attempt touch → next touch                                           | API: refine 540 + tail 120 + after-facts render 90 + verifier 60 = 810; CLI: 540 + 90 + 60 = 690 | 870      | 900   |
|                      | **pre-commit touch** (new) → settle                                  | render 90 + tx 10 = 100                                                                          | 160      | 900   |
| Regenerate copy      | claim → settle                                                       | CAPTION Opus 240 + tx 10 = 250                                                                   | 310      | 900   |
| Scheduled generation | **lease renew at entry start** (new) → **renew before design** (new) | caption 240 + background 90 + image 120 = 450                                                    | 510      | 900   |
|                      | renew before design → complete                                       | 820 + post-action + tx 10 ≈ 840                                                                  | 900      | 900   |

The last scheduler row lands exactly on the limit. `actionBudgetViolations` uses `worst + margin > limit`, so it passes, but with no headroom. **Decision:** the post-action step (`executePostAction`, up to 3 `Post` inserts) is given 0 s in the model, since it is DB-only and fast, and the scheduler segment's limit is the lease. If a real Opus run (AC-32) shows design near 600 s, the first lever is lowering Opus `DESIGN_FREEFORM`, not raising the lease.

**How the hooks reach the pipeline.** `runPathBDesign(brief, kit, headline, briefing, actor, model, opts?: { onBeforeDesign?: () => Promise<void> })` calls `onBeforeDesign` after the background step, immediately before the design-agent call. `runPathADesign` has no background step, so its single segment is create/claim → finalize (design.template max 360 + render 90 + tx 10). `produceDesign`, `generateDraftForBrief` and `runGenerationForDraft` pass the hook through:

- async generation: `() => touchGeneration(draftId)`, an `updateMany where { id, status: 'IN_PROGRESS' }` bumping `updatedAt`;
- regenerate-design: `() => touchDraftAction(id, 'REGENERATE_DESIGN')`;
- the scheduler: `() => renewGenerationLease(entry.id)`, an `updateMany where { id, status: 'RUNNING' } set nextRetryAt = now + lease`.

Refine's pre-commit touch is a `touchDraftAction` call inside the `commit` callback, before `commitDraftRevision`.

**API-mode deadlines.** `runDesignAgent` / `runDesignAgentRefine` take `deadlineMs = model.timeoutMs`. Every SDK call inside the loop passes `signal: AbortSignal.timeout(deadline − elapsed)`, so one slow turn can't run past the deadline. Single-shot calls pass `AbortSignal.timeout(model.timeoutMs)`. SDK 0.30.1's `RequestOptions` has `signal` (`node_modules/@anthropic-ai/sdk/core.d.ts:199`), so the open-question-3 fallback is not needed. Retries stay at the SDK default, inside the signal's wall clock.

## 6. The boundary

### CLI (`claudeCli.ts`)

```ts
interface ClaudeCliOptions { model: ResolvedModel; timeoutMs?: number; label?: string; authToken?: string; maxBuffer?: number }
function claudeModelArgs(model: ResolvedModel): string[] {
  if (!MODEL_NAME_RE.test(model.arg)) throw new Error(…)   // kept, defence in depth (win32 shell)
  return ['--model', model.arg]
}
```

- `pinModel`, the `env.CLAUDE_CLI_MODEL` read and the `"default"` branch are deleted.
- `timeoutMs` defaults to `model.timeoutMs`.
- `recordModelCall` runs inside `runClaudeCliOnce` / `runClaudeCliStreamJsonOnce` **just before `spawnClaude`**, so a retried auth attempt records twice, which is correct: two spawns happened.
- The existing debug log line `model=${resolvedModel}` (`:653`) prints `model.arg` and `model.source`.

### SDK (`anthropicCall.ts`)

```ts
export async function createMessage(
  client: Anthropic,
  params: Omit<MessageCreateParamsNonStreaming, 'model'>,
  model: ResolvedModel,
  opts?: { deadlineAt?: number; label?: string },
): Promise<Message>
```

1. `recordModelCall(...)`;
2. `client.messages.create({ ...params, model: model.arg, max_tokens: Math.max(params.max_tokens, model.entry.apiMaxTokensFloor ?? 0) }, { signal })`;
3. `stop_reason === 'refusal'` (compared as a string, since 0.30.1's type union predates it) → `ModelRefusalError`, which `humanizeGenerationError` passes through.

- **`textOf(message)`** joins the `text` blocks. It replaces every `content[0]` and `find(b => b.type === 'text')` at the 7 SDK sites (survey #4, #7, #10, #11, #13, #14, #15).
- **`thinking` blocks** are kept in the design-agent loop's `messages.push({ role: 'assistant', content: response.content })`, as they are today, because that loop is append-only. Preserved thinking only needs the blocks echoed back unchanged.
- **`apiMaxTokensFloor` is 16,000 on Sonnet 5.5 and Opus 5.5 and null on Haiku 4.5.** Adaptive thinking spends from the same `max_tokens` (open question 4). At 16k, a non-streaming request is well under the SDK's 10-minute expected-time ceiling.

### Recorder (`modelCalls.ts`)

```ts
type ModelCallRecord = {
  at: number
  surface
  key
  arg
  mode: 'api' | 'cli'
  source
  substitutedFrom
  label
}
setModelCallSink(sink) / recordModelCall(rec) / readModelCalls() / clearModelCalls()
```

- **The default sink** is a no-op in production. With `MOCK_AI`, it is a ring buffer of 200 entries on `globalThis.__bistecModelCalls`, the same pattern as the Prisma client, so separately compiled `next dev` route modules share one buffer.
- **`/api/test/model-calls`** (GET reads, DELETE clears) copies `/api/test/scheduler-tick`'s double gate and admin check.

## 7. `MOCK_AI` branches that must record (FR-16)

Under `MOCK_AI` these short-circuit **before** the boundary, so each records the `ResolvedModel` it was given, then returns its mock:

| Branch                                                     | File                                        | Surface                               |
| ---------------------------------------------------------- | ------------------------------------------- | ------------------------------------- |
| mock `CopyProvider` from `resolveCopyProvider`             | `providers/registry.ts:57-59`               | `CAPTION`                             |
| `runDesignAgent` mock                                      | `agent/designAgent.ts:106-118`              | `DESIGN_TEMPLATE` / `DESIGN_FREEFORM` |
| `runDesignAgentRefine` mock                                | `agent/designAgent.ts:283-296`              | `REFINE`                              |
| `callVerifierModel` mock                                   | `drafts/refineVerify.ts:367`                | `INTERNAL_VERIFIER`                   |
| background seam (`mockSeam` decision)                      | `agent/background.ts:156`                   | `INTERNAL_BACKGROUND`                 |
| `runBriefingChat` / `enhanceBriefing` / `enhancePostBrief` | `campaign/briefingAssistant.ts:159,213,248` | `ASSISTANT_BRIEFING`                  |
| brand-kit chat mock                                        | `brandkit/assistant.ts` (`runBrandKitChat`) | `ASSISTANT_BRANDKIT`                  |
| `generateTemplateFromImage` mock                           | `brandkit/templateFromImage.ts`             | `ASSISTANT_BRANDKIT`                  |
| `draftBrandVoice` mock                                     | `brandkit/voiceDraft.ts:32`                 | `ASSISTANT_BRANDKIT`                  |
| `validateClaudeToken` mock                                 | `agent/userToken.ts:120`                    | `INTERNAL_TOKEN_PING`                 |

**Two exceptions.**

- **CLI mode never runs under `MOCK_AI`** (`env.ts` fails fast on that combination), so the CLI boundary is proven by the unit test AC-12 alone. The E2E is API mode.
- **The background decision with no `__MOCK_BG__` sentinel** returns before anything is resolved (`background.ts:145`). That matches today's behaviour (no call, nothing to record). The E2E covers `INTERNAL_BACKGROUND` through the sentinel only.

## 8. Usage-limit classification (FR-11)

```ts
const USAGE_LIMIT_RE =
  /usage limit (reached|exceeded)|claude ai usage limit|\brate[_ ]limit(ed|[_ ]error)?\b|\b429\b/i
export function isClaudeUsageLimit(err: unknown): boolean
```

It is true for:

- an `Anthropic.RateLimitError`;
- a `ClaudeCliError` with `apiErrorStatus === 429`;
- a `ClaudeCliError` with `exitCode !== 0` whose `stderr` or `stdout` matches `USAGE_LIMIT_RE`.

It reads exactly the fields `isClaudeAuthFailure` reads (the `ClaudeCliError` field contract, `claudeCli.ts:203-217`): never `diagnostic`, never model text (L8). Auth is checked first, so a 401 is never reported as a usage limit.

**The phrase list is unverified against the pinned CLI** (A11). The T2 operator report records what CLI 2.1.287 prints on a usage-limited account if one is available, and otherwise says so. A miss only leaves `errorReason` unprefixed, as today.

## 9. Wave 2 UI

- **`ModelPicker`** (`src/components/ui/ModelPicker.tsx`) wraps `Select` with `FieldLabel`, the hint line (`text-ink-3`, `text-xs`) and an optional `Notice tone="warning"`. Its props:
  - `surface`, `context: { stamp?, designPath? }`, `value: ModelKey | undefined`, `onChange`, `label`, `disabled`.
  - It computes the pre-selection and the options with `decideModel` / `effectiveSet` over `useModels()` data, and adds no rule of its own.
- **`useModels()`:** React Query, key `['models']`, `staleTime` 60 s. `/team` invalidates it on save.
- **Placement:** the wizard Review step (`components/brief/ReviewStep.tsx`), the refine box (`components/drafts/RefinementPanel.tsx`), the caption and headline panel tails (`CaptionPanel.tsx`, `HeadlinePanel.tsx`), "Regenerate all" (`CaptionPanels.tsx`), the design regenerate control (`app/(app)/drafts/[id]/page.tsx`), and the two assistant panel headers.
- **No new settle logic.** Each control already posts and then awaits the refetch (015, L25). The picker only adds a body field.

## 10. File changes map

| File                                                                                                                                                                                                                                                                                                                                                                    | Change                                  | Task |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---- |
| `src/lib/models/{catalogue,resolve,policyRules}.ts`                                                                                                                                                                                                                                                                                                                     | new                                     | T1   |
| `tests/unit/{modelCatalogue,modelResolve,regenerateStamp}.test.ts`                                                                                                                                                                                                                                                                                                      | new                                     | T1   |
| `.specclaw/changes/008-model-selection/reports/T2.md`                                                                                                                                                                                                                                                                                                                   | new (operator)                          | T2   |
| `prisma/schema.prisma`, `prisma/migrations/20261012120000_model_selection/`, `prisma/rollback/008-model-selection.down.sql`                                                                                                                                                                                                                                             | schema                                  | T3   |
| `src/lib/env.ts`, `.env.example`, `tests/unit/envModel.test.ts`                                                                                                                                                                                                                                                                                                         | `CLAUDE_CLI_MODEL` validation           | T3   |
| `src/lib/models/policy.ts`, `src/app/api/team/model-policy/route.ts`, `src/app/api/models/route.ts`, `src/lib/api-types.ts`, `tests/unit/modelPolicy.test.ts`                                                                                                                                                                                                           | resolver I/O and APIs                   | T4   |
| `src/lib/models/{anthropicCall,modelCalls}.ts`, `src/lib/agent/claudeCli.ts`, `src/app/api/test/model-calls/route.ts`, `tests/unit/{anthropicCall,usageLimit,claudeCliArgs}.test.ts`                                                                                                                                                                                    | the boundary                            | T5   |
| `src/providers/interfaces/CopyProvider.ts`, `src/providers/implementations/copy/*.ts`, `src/providers/registry.ts`, `src/lib/captions/{generate,store}.ts`, `src/lib/agent/{generateDraft,pathA,pathB,designAgent,designAgentCli,background,backgroundGeneration}.ts`, `src/lib/drafts/revisions.ts`, `src/app/api/generate/copy/route.ts`, `src/mcp/tools/generate.ts` | generation on the resolver, with stamps | T6   |
| `src/app/api/drafts/[id]/{regenerate-copy,regenerate-design,refine,inline-edit,retry}/route.ts`, `.../revisions/[rev]/restore/route.ts`, `.../rejected/[revisionId]/adopt/route.ts`, `src/lib/drafts/{refineVerify,draftActions}.ts`, `src/lib/captions/{requests,store}.ts`, `src/app/api/drafts/[id]/route.ts` (GET fields)                                           | draft actions                           | T7   |
| `src/lib/campaign/briefingAssistant.ts`, `src/lib/agent/{vision,userToken}.ts`, `src/lib/brandkit/{assistant,templateFromImage,voiceDraft}.ts`                                                                                                                                                                                                                          | assistants + internal ping              | T8   |
| `src/lib/models/budget.ts`, `src/lib/scheduler/generationRunner.ts`, `src/providers/implementations/image/openai.ts`, `src/lib/drafts/draftActions.ts` (`touchGeneration`), `tests/unit/{actionBudget,generationRunner,draftActions}.test.ts`                                                                                                                           | budget and liveness                     | T9   |
| `src/lib/agent/config.ts`, `tests/unit/{modelLiteralGuard,modelBoundary}.test.ts`, `scripts/cli-sandbox-check.mjs` + its drift test                                                                                                                                                                                                                                     | close the boundary                      | T10  |
| `src/app/(app)/team/page.tsx`, `src/components/team/ModelsCard.tsx` (new)                                                                                                                                                                                                                                                                                               | `/team` → Models                        | T11  |
| `tests/e2e/model-selection.test.ts` (new), edited pre-existing E2E, `scripts/export-posts.mjs`, `scripts/import-posts.mjs`                                                                                                                                                                                                                                              | wave-1 E2E + gate                       | T12  |
| `src/app/api/briefs/route.ts`, `src/lib/brief/briefDraftPayload.ts`, the six FR-17 routes, `src/lib/models/requests.ts` (new), `tests/unit/modelRequests.test.ts`                                                                                                                                                                                                       | wave-2 body fields                      | T13  |
| `src/components/ui/ModelPicker.tsx`, `src/lib/hooks/useModels.ts`, `src/lib/models/pickerState.ts` (`teamTokenNotice`, hint text), `tests/unit/modelPicker.test.ts`, `tests/unit/uiPrimitives.test.ts`                                                                                                                                                                  | picker                                  | T14  |
| `src/components/brief/ReviewStep.tsx`, `src/components/brief/useBriefWizard.ts`, `src/components/brief/types.ts`                                                                                                                                                                                                                                                        | wizard                                  | T15  |
| `src/components/drafts/{RefinementPanel,CaptionPanel,CaptionPanels,HeadlinePanel}.tsx`, `src/app/(app)/drafts/[id]/page.tsx`                                                                                                                                                                                                                                            | draft page                              | T16  |
| `src/components/campaigns/BriefingAssistantPanel.tsx`, `src/components/admin/brandkits/BrandKitAssistantPanel.tsx`                                                                                                                                                                                                                                                      | chat headers + team-token notice        | T17  |
| `tests/e2e/model-selection.test.ts` (wave 2 cases)                                                                                                                                                                                                                                                                                                                      | wave-2 E2E + gate                       | T18  |
| `CLAUDE.md`, `docs/handoff.md`, `docs/mcp-acp-guide.md`, `docs/ui-reference/DESIGN_SYSTEM.md`, `docs/e2e-test-plan.md`, `.specclaw/ROADMAP.md`                                                                                                                                                                                                                          | docs                                    | T19  |

Component file names were checked against the tree on 2026-10-12. The Versions sheet and the design regenerate control live in `src/app/(app)/drafts/[id]/page.tsx`.

## 11. Key decisions

| #   | Decision                                                               | Why                                                                                                                   |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| D1  | Catalogue in `src/lib/models/catalogue.ts`, not `agent/config.ts`      | Breaks the `env.ts` ↔ `config.ts` cycle; client-safe for the picker (§2)                                              |
| D2  | `ResolvedModel` passed as a parameter, never via ALS                   | Visible, testable, and resolution stays before the claim (§3)                                                         |
| D3  | Stamps are `TEXT`, keys are enums                                      | Stamps are history (retired and non-Claude IDs); keys are a closed vocabulary (NFR-05)                                |
| D4  | `RenderStamp.model` + `draftStampFields()`                             | Keeps 004's one-stamp-per-render rule while honouring the `DraftRevision.model` name (§4)                             |
| D5  | Liveness segments, not whole-action sums                               | That is what the sweeps measure (`recovery.ts:82`); the heartbeat pattern exists (004 T17)                            |
| D6  | Heartbeats via an `onBeforeDesign` hook                                | One seam shared by async generation, regenerate-design and the scheduler, without the pipeline knowing who is calling |
| D7  | `AbortSignal` per SDK call                                             | Bounds retries inside the deadline without changing retry behaviour (SDK 0.30.1 supports it)                          |
| D8  | Voice draft through `runBriefingModel`                                 | It gains a CLI path and the boundary seam (spec open question 2); the prompt text is unchanged                        |
| D9  | One migration                                                          | Wave 2 only writes columns wave 1 adds (`Brief.*Model`); one forward step, one down script                            |
| D10 | `/api/models` (any member) apart from `/api/team/model-policy` (admin) | Pickers need the effective-set inputs; only admins see the editable policy                                            |

## 12. Risks

| Risk                                                                               | Mitigation                                                                                                                                                  |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI 2.1.287 rejects a full ID                                                      | T2 operator check before the wave-1 gate. Fallback: `cliArg` = alias for that entry, recorded (AC-14)                                                       |
| Sonnet 5.5's adaptive thinking slows the default freeform path                     | Sonnet timeouts are raised to 360 s; the 16k `max_tokens` floor; AC-32 measures                                                                             |
| A refusal (`stop_reason: refusal`) on a benign marketing prompt                    | `ModelRefusalError` gives a readable failure; no silent fallback (A13). Logged with category                                                                |
| A missed call site keeps a literal                                                 | The literal guard (AC-11) plus the required `model` type at both boundaries (T10)                                                                           |
| The budget is right on paper but a real run exceeds a step budget (renderer queue) | 60 s margin; the first symptom is the existing "interrupted" message, not silent spend. AC-32                                                               |
| `CLAUDE_CLI_MODEL=default` deployments stop booting                                | Intentional (FR-04); the boot message names the fix; release note                                                                                           |
| A wide T6/T7 diff (generation and actions touch many files)                        | Split by call path: T6 generation, T7 actions, T8 assistants; each task compiles and passes unit tests on its own (transitional optional `model` until T10) |

## 13. Panel findings → where addressed

| Finding (party-report.md)                                                   | Sev   | Addressed in                                                                                                                                                                                          |
| --------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| architect — two stores answer "which model does regenerate use"             | BLOCK | FR-09 (stamps own it; Brief = initial request only), FR-10, AC-06, AC-18                                                                                                                              |
| architect — regenerate picker decided but not scoped                        | BLOCK | FR-17 (body fields on all three `regenerate-copy` forms and `regenerate-design`), FR-20, AC-27, AC-29, T13, T16                                                                                       |
| architect — fate of `modelFor` and the `CLAUDE_CLI_MODEL` read              | WARN  | FR-03 (deleted), FR-04 (system default, CLI only), FR-07, T10                                                                                                                                         |
| architect — allow-list only on tier 1; empty set                            | WARN  | FR-03 (every tier, effective set, fallback, `NO_ALLOWED_MODEL`), FR-05 rules 2–3, AC-03, AC-05                                                                                                        |
| architect — timeout covers single calls, sweeps measure the chain           | WARN  | FR-12, §5 (segments, model × surface table), AC-09                                                                                                                                                    |
| architect — `ScheduledGeneration` pin half-scoped                           | WARN  | Proposal ruling: no pin. FR-11                                                                                                                                                                        |
| architect — no boundary test; no sweep test                                 | WARN  | FR-07 recorder, AC-12 (both modes, env set and unset), AC-09, AC-10                                                                                                                                   |
| architect NOTE — sites with no picker                                       | NOTE  | A7, FR-02 picker column                                                                                                                                                                               |
| architect NOTE — stamp can't replace remembered choice on new posts         | NOTE  | Proposal ruling: no remembered choice; new posts pre-select the team default (A5, FR-18)                                                                                                              |
| ba — no stated pain                                                         | WARN  | spec Overview problem table (evidence column; "no observed complaint" stated)                                                                                                                         |
| ba — quality premise has no AC                                              | WARN  | NFR-09 (states what gates verify and what they don't); AC-15–21 (the chosen model is the one that ran); AC-32                                                                                         |
| ba — full-ID premise unverified                                             | WARN  | AC-14 / T2 operator check; `cliArg` fallback                                                                                                                                                          |
| ba — the 600 s figure has no source                                         | WARN  | §5: placeholders, stated as such; AC-32                                                                                                                                                               |
| ba — team default vs remembered choice interplay                            | WARN  | A5 (send rule), FR-09, FR-18; remembered choice removed                                                                                                                                               |
| ba NOTE — `caption` covers headline; `assistant.brandkit` spans three tasks | NOTE  | FR-02 (coverage table; split procedure), A7                                                                                                                                                           |
| po — no cheaper variant priced                                              | BLOCK | spec "The cheaper variant" table; waves 1/2 cut line                                                                                                                                                  |
| po — ID upgrade ships separately                                            | WARN  | Wave 1 is shippable alone (T1–T12, one gate)                                                                                                                                                          |
| po — Opus-for-all cost unquantified                                         | WARN  | spec "Cost per post"; the `/team` switch; §5 wall clock                                                                                                                                               |
| po — scope with no value (pin, per-surface timeout, Fable plumbing)         | WARN  | Pin dropped (ruling). Per-surface timeouts kept (assistants and refine differ); Fable not added                                                                                                       |
| po NOTE — defer remembered choice                                           | NOTE  | Adopted by the ruling                                                                                                                                                                                 |
| security — allow-list bypass via stored values                              | BLOCK | FR-03 tiers 2–4 checked at call time, AC-03 (exhaustive), AC-17                                                                                                                                       |
| security — model string into argv                                           | BLOCK | FR-01 closed catalogue, FR-07 `ResolvedModel` only, `MODEL_NAME_RE` kept, FR-04 boot error, NFR-03/05                                                                                                 |
| security — per-call timeout vs multi-call sweep                             | WARN  | FR-12, §5, AC-09, AC-10                                                                                                                                                                               |
| security — invalid stored model unspecified                                 | WARN  | FR-03 (substitute + record + log), FR-08 `…SubstitutedFrom`, FR-18 hint, edge cases                                                                                                                   |
| security — demoting `CLAUDE_CLI_MODEL` removes a ceiling silently           | WARN  | FR-04 boot line; release note; the `/team` allow-list is the per-team ceiling. **Declined:** a separate `CLAUDE_MODEL_ALLOW` operator ceiling (not in the rulings; the allow-list covers it per team) |
| security — Opus on the team token starves the scheduler                     | WARN  | Ruling: the `/team` switch (FR-05, A3) + usage-limit `errorReason` (FR-11, §8) + the notice (FR-22)                                                                                                   |
| security NOTE — successor mapping is a substitution                         | NOTE  | FR-03 tier 2 (`previousApiIds` → `substitutedFrom`, still checked against the effective set), AC-03                                                                                                   |
| visionary — preference rows store model identity                            | WARN  | Keys stored, IDs only in stamps (FR-01, FR-06, D3); `previousApiIds`                                                                                                                                  |
| visionary — ordering invariant kept by hand                                 | WARN  | `actionBudgetViolations` unit gate (AC-09); constants imported, not copied                                                                                                                            |
| visionary — "one entry" isn't true                                          | WARN  | §2 procedure; `defaultAllowed`, `personalTokenGated`, per-surface eligibility on the entry; A2                                                                                                        |
| visionary — internal steps stay scattered literals                          | WARN  | FR-15 internal surfaces + literal guard (AC-11)                                                                                                                                                       |
| visionary — cost tiers are a hand copy                                      | WARN  | FR-01 numeric prices + `priceSource`; `modelTier` computed (AC-01b)                                                                                                                                   |
| visionary — surface names are a persisted vocabulary                        | WARN  | FR-02 closed enum + split procedure                                                                                                                                                                   |
| visionary NOTE — per-credential axis widens the matrix                      | NOTE  | Adopted by the ruling: one boolean, no per-credential allow-list                                                                                                                                      |

## 13a. Grounding sources

- **`CLAUDE.md`** (2026-07-01 entry): "The old Path B timeouts were the **Opus default**, not Sonnet — Sonnet finishes ~5× under the 300s budget". This sets Opus's larger placeholders and the AC-32 measurement.
- **`CLAUDE.md`** (Gotchas): "Before a full E2E run: stop stray node processes, `rm -rf .next`, and drop/recreate the test DB"; "`npm run test:e2e:db` does NOT drop the test DB". These are the per-wave gate steps in tasks.md.
- **`CLAUDE.md`** (012 entry): "Rolling back: run `prisma/rollback/012-per-channel-captions.down.sql` … It also un-records migration 3". This is the L24 shape for §4's down script.
- **`CLAUDE.md`** (2026-08-03 lesson): "a prompt rule is not an invariant … Validate model output by **extracting what you need**". This is why `textOf` reads blocks by type instead of `content[0]` (§6).
- **`CLAUDE.md`** (2026-07-28 lesson): "don't overload a state field with a second meaning". This is why stamps (`…Model`) and substitutions (`…SubstitutedFrom`) are separate columns, and why `Brief.*Model` means only the initial request.
- **`docs/handoff.md`** (008 planner brief): "Pricing comes from the `claude-api` skill, not memory"; "Opus 5.5 timeouts are measured placeholders, with the per-action budget unit test as the hard gate"; "Migrations: hand-written SQL with a `prisma/rollback/` file that also un-records the migration (lesson L24)"; "Plan a mock seam so the E2E can see the resolved model". These map to FR-01, §5/AC-09, §4 and §6/§7 respectively.
- **The `claude-api` skill** (model table, cached 2026-09-25):
  - Haiku 4.5 `claude-haiku-4-5` $1/$5; Sonnet 5.5 `claude-sonnet-5-5` $2/$10; Opus 5.5 `claude-opus-5-5` $4/$20 (Fable 5.1 $10/$50, not added).
  - Sonnet 5.5 and Opus 5.5 run adaptive thinking when `thinking` is omitted; on Opus 5.5 it "can't be disabled".
  - Both reject non-default sampling parameters, forced `tool_choice` and assistant prefill. The survey found none of these in `src/` (grep for `temperature|top_p|tool_choice|budget_tokens|thinking:`: only the OpenAI provider sets `temperature`).
  - `stop_reason: "refusal"` is a possible stop reason.
