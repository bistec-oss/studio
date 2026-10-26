# Design: Per-channel captions (Instagram / LinkedIn / WhatsApp) + "copy" → "caption"

**Change:** 012-per-channel-captions
**Created:** 2026-10-10

## Technical Approach

012 replaces one opaque string with a small, typed pipeline:

```
brief ─► buildCaptionPrompt(targets) ─► CopyProvider.generateCaptions() ─► raw reply
      ─► extractCaptionReply(raw, targets)  (pure, fail-closed)
      ─► caption store: DraftCaption rows + Draft.headline   (one transaction)
      ─► design (Path A/B/background) reads the HEADLINE only
      ─► publish: resolveCaptionForPublish(channel, row)  (pure) ─► publisher
```

Four rules shape it:

1. **The model's reply is extracted, never trusted.** This is the `extractHtmlDocument` lesson. The provider returns raw text, and one pure function decides what is usable, field by field.
2. **One registry, one resolver, one loader.**
   - `CAPTION_CHANNELS` defines each channel once.
   - `resolveCaptionForPublish` is the only publish-time decision.
   - `loadDraftCaptions` is the only way any reader gets captions. It materializes legacy drafts first, so no reader ever has a "rows, or else `copyText`" branch.
3. **Nothing is destroyed on deploy.**
   - The legacy column keeps its physical name and its data.
   - The migrations only add.
   - The backfill is idempotent TypeScript, run at boot and lazily on read.
4. **Contracts keep their names.** Routes, the persisted `DraftAction` value, the MCP/ACP fields and the `COPY` slot are unchanged. Their payloads grow additively, except the in-app `PATCH`/`GET`, which are not external contracts.

**Order.** Storage, extraction, writers and the publish fix land first, in wave 1, together with a base `CaptionPanels` that edits all three captions. Wave 1 ends in a consistent, shippable state: every publish path sends the matching caption and refuses a bad one, and the draft page edits three captions. Wave 2 completes the per-channel actions and notices. Wave 3 does the wording, scripts and docs.

**Keeping every task compiling.** The per-task `tsc` gate forces this sequence. The Prisma field `copyText` keeps its name and its `NOT NULL` until every reader has moved:

- T5 moves the design readers;
- T6 moves the draft API and UI;
- T7 moves publishing;
- T8 moves MCP/ACP;
- only then does T9 rename it to `legacyCaptionText @map("copyText")` and drop `NOT NULL` (migration 3).

Between T5 and T9, new drafts write `copyText: ''` as a placeholder that nothing reads. The materializer keys on "**no caption rows**", so a placeholder never looks like a legacy draft.

## Architecture

### 1. Module layout

```
src/lib/channels.ts                       registry CAPTION_CHANNELS + derived exports (FR-01)
src/lib/agent/prompts/caption.ts          buildCaptionPrompt, CAPTION_PROMPT_VERSION, CAPTION_MAX_TOKENS (was copy.ts)
src/lib/captions/
  extract.ts        pure   extractCaptionReply(raw, targets)              (FR-08)
  headline.ts       pure   validateHeadline, designHeadline, HEADLINE_MAX (FR-09)
  migrationPlan.ts  pure   planCaptionMigration(legacyText)               (FR-05)
  resolve.ts        pure   resolveCaptionForPublish(channel, row)         (FR-14), client-safe
  actionTargets.ts  pure   captionActionTargets(draft), settleCaptionRow  (FR-11, FR-19)
  generate.ts       I/O    writeCaptions(provider, briefInput, targets) → ExtractResult
  store.ts          I/O    loadDraftCaptions (materialize), claimCaptionAction, settleCaptionAction,
                           saveGenerationCaptions, settlePendingCaptions, migrateDraft
  backfill.ts       I/O    runCaptionBackfill({ report })                 (FR-04)
src/scripts/backfill-captions.ts          CLI entry → runCaptionBackfill (tsx locally, esbuild in Docker)
src/components/drafts/CaptionPanels.tsx   section "i. Captions", Regenerate all  (replaces CopyEditor.tsx)
src/components/drafts/CaptionPanel.tsx    one channel
src/components/drafts/HeadlinePanel.tsx   the headline
```

Only `src/lib/captions/store.ts`, `backfill.ts` and `generate.ts` import Prisma or providers. Everything else is pure and unit-tested without a DB (NFR-02).

### 2. The registry (`src/lib/channels.ts`)

```ts
export type CaptionKey = 'instagram' | 'linkedin' | 'whatsapp'
export type CaptionTarget = Channel | 'HEADLINE'

export interface CaptionChannelSpec {
  channel: Channel
  label: string
  jsonKey: CaptionKey
  hardLimit: number | null
  softLimit: number | null
  publishable: boolean
  brief: string
  normalise: (text: string) => string
}

export const CAPTION_CHANNELS: readonly CaptionChannelSpec[] = [/* IG, LI, WA per spec FR-01 */]

export const CHANNEL_LABELS: Record<Channel, string> // derived
export const CHANNEL_CAPTION_LIMITS: Partial<Record<Channel, number>> // derived, hard limits
export const PUBLISHABLE_CHANNELS: Channel[] // derived: IG, LI
export const CHANNEL_VALUES = PUBLISHABLE_CHANNELS // kept name → pickers stay at 2
export function captionSpec(channel: Channel): CaptionChannelSpec
export function isPublishableChannel(v: unknown): v is Channel
export const captionLength = (t: string) => t.length
```

- **Normalisers:**
  - `stripDoubleAsterisks`: `while (t.includes('**')) t = t.replaceAll('**', '')`;
  - `whatsappBold`: `while (t.includes('**')) t = t.replaceAll('**', '*')`.

  Both terminate, because every pass shortens the string.

- The file imports `Channel` as a type only, so it stays client-safe.
- **Removed:** `channelCopyLimit` (its single consumer, `CopyEditor`, is deleted) and the `isChannel` variant that accepted any `Channel`. The input validators use `isPublishableChannel`.

### 3. The caption reply contract

**Requested keys** come from the targets: every requested channel's `jsonKey`, plus `headline` when `HEADLINE` is a target. A generation requests `['HEADLINE', 'INSTAGRAM', 'LINKEDIN', 'WHATSAPP']`.

```json
{
  "headline": "Applications are open",
  "instagram": "…≤ 2,200 chars…",
  "linkedin": "…≤ 3,000 chars…",
  "whatsapp": "…aim ≤ 1,000 chars, *bold* only…"
}
```

**The candidate scanner** (`extract.ts`):

- It walks the string with a small state machine: depth, in-string, escape.
- At depth 0, `{` opens a span. Back at depth 0, `}` closes it.
- While in-string, a raw `\n`, `\r` or `\t` is emitted as `\\n`, `\\r` or `\\t` into the span copy.
- Each closed span is `JSON.parse`d inside `try`.
- Unbalanced input yields no closed span, so a truncated reply gives zero candidates.

```ts
type FieldResult = { ok: true; text: string } | { ok: false; reason: string }
type ExtractResult =
  | { ok: true; fields: Partial<Record<CaptionTarget, FieldResult>>; discarded: string }
  | { ok: false; reason: 'no-object' | 'multiple-objects' | 'unknown-keys'; discarded: string }
```

`writeCaptions` logs `discarded`, clipped to 500 characters, whenever it is not empty, and logs every whole-reply failure as `[captions] reply rejected (<reason>)`. A whole-reply failure becomes a failed `FieldResult` for every target, so the callers have one shape to handle.

### 4. Generation flow (async)

```
POST assemble-a|b ─► createPendingDraft: tx { draft(headline null), 3× DraftCaption PENDING }
                 ─► 202 { draftId }
background runGenerationForDraft:
  result = writeCaptions(provider, briefInput, ALL_TARGETS)
  tx { rows ← READY/FAILED per field; draft.headline ← result.HEADLINE if ok }   (saveGenerationCaptions)
  if !result.HEADLINE.ok → throw HeadlineMissingError(reason) → draft FAILED, failureReason set
  design = produceDesign(brief, inputs, headline)          # Path A/B/background read headline only
  finalizeDraftV1(...)                                      # unchanged
```

**The sync `generateDraftForBrief`** runs the same calls in memory, throws `HeadlineMissingError` before the design, and creates the draft, its rows and revision 1 in one transaction. **Retry** resets the rows to `PENDING` in the same update that sets `IN_PROGRESS`.

### 5. Caption actions (regenerate-copy)

```
POST /api/drafts/[id]/regenerate-copy   body {} | {channel} | {headline:true}
  validate (404 / 409 not ready / 400 body) ─► resolve provider, kit, briefing (422 COPY_ERROR)
  claimCaptionAction(draftId, targets):
    tx { draft.updateMany(where {id, pendingAction:null}, data {pendingAction:'REGENERATE_COPY'})
         if count==1: draftCaption.updateMany(where {draftId, channel in targets}, data {status:'PENDING'}) }
  !claimed → 409 'Another action is already running on this draft'
  startDraftAction(..., 'REGENERATE_COPY', async () => {
     result = writeCaptions(provider, briefInput, targets)
     settleCaptionAction(draftId, targets, result)   # per-row rules, guarded on status PENDING
     if HEADLINE requested && !ok → throw Error(reason)  # → pendingActionError
  })
  202 { ok: true }
```

**The settle rules** live in the pure `settleCaptionRow(row, field)`:

| Field result | Row text before | New row                                                                  |
| ------------ | --------------- | ------------------------------------------------------------------------ |
| ok           | any             | `READY`, text = field text, `failureReason` null, `needsReview` false    |
| failed       | non-empty       | `READY`, text unchanged, `failureReason` = "Regenerate failed: <reason>" |
| failed       | empty           | `FAILED`, text `''`, `failureReason` = reason                            |

- **A thrown provider error** settles every target row as "failed" with the error message, inside `startDraftAction`'s catch path. That needs a small hook: `startDraftAction` gains an optional `onError(err)` callback that runs before the release.
- **The stale sweep** reuses `settleCaptionRow` with `STUCK_ACTION_REASON` or `STUCK_REASON`.

**`captionActionTargets(draft)`** (pure) tells the UI which panels are busy:

- `pendingAction !== 'REGENERATE_COPY'` → none, unless the draft is `IN_PROGRESS`, when the busy set is the rows that are `PENDING`, plus the headline while it is null;
- otherwise → the `PENDING` rows, or `['HEADLINE']` when no row is `PENDING`.

### 6. The loader and materializer (`store.ts`)

```ts
export async function loadDraftCaptions(
  draftId,
): Promise<{ captions: CaptionRow[]; deferred: boolean }> {
  const draft = await prisma.draft.findUnique({
    select: { status, pendingAction, captionMigration, legacyCaptionText, captions: true },
  })
  if (
    draft.captions.length === 0 &&
    draft.legacyCaptionText != null &&
    draft.captionMigration == null
  ) {
    if (draft.status === 'IN_PROGRESS' || draft.pendingAction === 'REGENERATE_COPY')
      return { captions: synthesizePending(), deferred: true } // never stored
    await migrateDraft(draft.id, draft.legacyCaptionText) // planner + tx, idempotent
    return loadDraftCaptions(draftId) // re-read once
  }
  // a registry channel the draft lacks (e.g. a 4th channel added later) → insert READY ''
  return { captions: orderByRegistry(rows), deferred: false }
}

async function migrateDraft(id, legacy) {
  const plan = planCaptionMigration(legacy)
  await prisma.$transaction([
    prisma.draftCaption.createMany({
      data: plan.rows.map((r) => ({ draftId: id, ...r })),
      skipDuplicates: true,
    }),
    prisma.draft.updateMany({
      where: { id, captionMigration: null },
      data: { captionMigration: plan.outcome },
    }),
  ])
  if (plan.outcome === 'UNSPLIT_FALLBACK') await logReviewIfScheduled(id) // REVIEW line, same format as backfill
}
```

- **Before T9** the field is still called `copyText`. The materializer reads it under that name, and T9 renames the reference.
- **Callers:**
  - `GET` and `PATCH` `/api/drafts/[id]` (through `loadDraft`);
  - `regenerate-copy`;
  - `loadCaptionForPublish`;
  - MCP `getDraft`;
  - the posts GET routes (the text for one channel);
  - `runCaptionBackfill`.

### 7. Publishing

```
POST /api/posts ─► channel ∈ PUBLISHABLE (400) ─► draft/export checks (404/422)
               ─► resolveCaptionForPublish(channel, loaded row) ─► !ok → 422 CAPTION_UNPUBLISHABLE (no row)
               ─► existing scheduled / immediate paths

publishToChannel(channel, exportKey, draftId, teamId):
   cap = await loadCaptionForPublish(draftId, channel)   # rule 1 (no publisher) first
   !cap.ok → throw new PublishError(channel, cap.reason, { terminal: true })
   url = await resolveExportUrl(exportKey); !url → PublishError('draft export missing')   # retryable, as today
   return publishers[channel]!.publish(url, cap.text, teamId)

jobRunner catch:  err instanceof PublishError && err.terminal → FAILED now (no retry, nextRetryAt null)
```

`PublishError` gains `terminal: boolean`, which defaults to false, and its `channel` widens to `Channel`. The Instagram and LinkedIn publishers are unchanged apart from the mock `platformId` (FR-21).

### 8. Boot backfill

`docker-entrypoint.sh`, after `migrate deploy`, inside the same `SKIP_MIGRATIONS` guard:

```sh
  echo "[entrypoint] backfilling per-channel captions…"
  node dist/scripts/backfill-captions.js
```

- **The Dockerfile** gains a second esbuild bundle, with the same flags as the worker: `src/scripts/backfill-captions.ts` → `dist/scripts/backfill-captions.js`, with `--external:@prisma/client`.
- **`runCaptionBackfill`:**
  - `SELECT pg_advisory_lock(hashtext('012-caption-backfill'))`;
  - page through eligible drafts, 100 at a time, ordered by `createdAt`;
  - `migrateDraft` each one, with a `try/catch` per draft;
  - unlock, then print the summary and `REVIEW` lines.
  - `--report` skips the writes and prints the `REVIEW` lines for drafts already marked `UNSPLIT_FALLBACK`.
- **npm scripts:**
  - `"captions:backfill": "tsx --env-file=.env src/scripts/backfill-captions.ts"`;
  - `"captions:report": "tsx --env-file=.env src/scripts/backfill-captions.ts --report"`.

  AC-23 runs them with `--env-file=.env.test` through `dotenv -e .env.test --`.

### 9. UI composition (`CaptionPanels`)

```
<section>  SectionHead numeral="i." title="Captions"  [tail: Regenerate all]
  HeadlinePanel     SectionHead level=3 id=h-headline "Headline"   [tail: state · Undo · Generate/Regenerate headline]
                    Input aria-labelledby=h-headline · counter n/100 · helper text
  CaptionPanel ×3   SectionHead level=3 id=h-<ch> "<Label>"        [tail: state · Undo · Copy <Label> caption · Generate/Regenerate]
                    Notice(review | failed | last-regenerate-failed)
                    ruled textarea aria-labelledby=h-<ch> (skeleton while PENDING)
                    counter · WhatsApp helper text
</section>
```

- **Props:** `draft: Pick<DraftDetail, 'id' | 'headline' | 'captions' | 'pendingAction' | 'pendingActionError' | 'status'>`, `onSaved()` and `onActionStarted()`. They are the same callbacks `CopyEditor` had, so `page.tsx` changes only where `copyPending` is replaced.
- **One `useUndoableAction<string>` per panel.**
- **Wave 1 builds:** the section, the three `CaptionPanel`s (textarea, save, counter, FAILED notice, skeleton) and "Regenerate all".
- **Wave 2 adds:** `HeadlinePanel`, per-panel Regenerate and Undo, Copy caption, the review and last-failed notices, and the WhatsApp guide warning.

### 10. E2E structure

- **New suite:** `tests/e2e/captions.test.ts`, catalog §W. Wave 1 covers AC-12–AC-20, AC-22, AC-23 and AC-26; wave 2 adds AC-21 and AC-24.
- **Each case:**
  - uses a unique topic;
  - uses `createExportedDraft` / `waitForDraft` / `waitForAction` from `tests/helpers/api.ts`;
  - uses `tests/helpers/db.ts` for seeding (legacy drafts, the `REGENERATE_COPY` claim, `PENDING` rows, due `scheduledAt`);
  - drives the scheduler through `POST /api/test/scheduler-tick`.
- **The `platformId` hash check** uses Node's `crypto.createHash('sha256')`.
- **Edited pre-existing cases:**

  | Case                                         | Edit                                                      | Task |
  | -------------------------------------------- | --------------------------------------------------------- | ---- |
  | `async-actions` TC-ASYNC-02                  | `done.copyText` → `done.captions` (all contain the topic) | T10  |
  | `async-actions` TC-ASYNC-10                  | rewritten to the caption contract (AC-19)                 | T10  |
  | `async-actions` validation case              | 409 message → "…caption regeneration"                     | T10  |
  | `team-isolation`                             | cross-team PATCH body → `{channel:'INSTAGRAM', text}`     | T10  |
  | `surfaces` `Post copy…` placeholder          | → "Write the Instagram caption…"                          | T10  |
  | `a11y` row 26 (014)                          | the "Copy" heading → the "Instagram" heading              | T10  |
  | `a11y` / `surfaces` "Brief & Copy Direction" | → "Brief & Caption Direction"                             | T14  |

## File Changes Map

| File                                                                                                                                                                                        | Action        | Description                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                                                                                                                                                                      | Modify        | `Channel.WHATSAPP` (T1); `CaptionStatus`, `CaptionMigration`, `DraftCaption`, `Draft.headline`/`captionMigration`/`captions` (T4); `legacyCaptionText @map("copyText")` (T9) |
| `prisma/migrations/<ts>_channel_whatsapp/migration.sql`                                                                                                                                     | Create        | `ALTER TYPE … ADD VALUE` (T1)                                                                                                                                                |
| `prisma/migrations/<ts>_draft_captions/migration.sql`                                                                                                                                       | Create        | Enums, table, FK cascade, unique, index, CHECK, two columns (T4)                                                                                                             |
| `prisma/migrations/<ts>_legacy_caption_text/migration.sql`                                                                                                                                  | Create        | `DROP NOT NULL` on `copyText` (T9)                                                                                                                                           |
| `prisma/rollback/012-per-channel-captions.down.sql`                                                                                                                                         | Create        | The manual rollback data fix (T9)                                                                                                                                            |
| `src/lib/channels.ts`                                                                                                                                                                       | Modify        | The registry and derived exports (T1)                                                                                                                                        |
| `src/lib/agent/prompts/copy.ts` → `caption.ts`                                                                                                                                              | Rename/Modify | `buildCaptionPrompt(brief, targets)`, version, max tokens (T2)                                                                                                               |
| `src/lib/captions/{extract,headline,migrationPlan,resolve,actionTargets}.ts`                                                                                                                | Create        | Pure modules (T2, T3, T6)                                                                                                                                                    |
| `src/lib/captions/{store,generate,backfill}.ts`, `src/scripts/backfill-captions.ts`                                                                                                         | Create        | The loader/materializer, claim/settle, caption call, backfill (T4, T5)                                                                                                       |
| `docker-entrypoint.sh`, `Dockerfile`, `package.json`                                                                                                                                        | Modify        | Backfill step and bundle; `captions:backfill` / `captions:report` scripts (T4)                                                                                               |
| `src/providers/interfaces/CopyProvider.ts`, `src/providers/implementations/copy/{anthropic,openai,claude-cli}.ts`                                                                           | Modify        | `generateCaptions(brief, targets)` returning the raw reply; `CAPTION_MAX_TOKENS` (T5)                                                                                        |
| `src/providers/registry.ts`                                                                                                                                                                 | Modify        | The mock provider returns `buildMockCaptionReply` (T5)                                                                                                                       |
| `src/lib/testHooks.ts`                                                                                                                                                                      | Modify        | `buildMockCaptionReply`, the drop sentinels (T5); `mockPlatformId` (T7)                                                                                                      |
| `src/lib/agent/generateDraft.ts`, `src/app/api/drafts/[id]/retry/route.ts`                                                                                                                  | Modify        | Writers: rows, headline, `HeadlineMissingError` (T5)                                                                                                                         |
| `src/lib/agent/{pathA,pathB,background}.ts`, `src/lib/agent/prompts/{pathA,pathB,background}.ts`                                                                                            | Modify        | The headline replaces `copyText`; fenced; Path A supporting text (T5)                                                                                                        |
| `src/lib/agent/prompts/shared.ts`                                                                                                                                                           | Modify        | `PROMPT_VERSION` bump (T5)                                                                                                                                                   |
| `src/app/api/drafts/[id]/regenerate-design/route.ts`                                                                                                                                        | Modify        | `designHeadline` (T5)                                                                                                                                                        |
| `src/app/api/generate/copy/route.ts`                                                                                                                                                        | Modify        | `{ copyText (IG), headline, captions }` (T8)                                                                                                                                 |
| `src/app/api/drafts/[id]/route.ts`                                                                                                                                                          | Modify        | GET shape, PATCH body, caption settle in the sweep, DELETE comment (cascade) (T6)                                                                                            |
| `src/app/api/drafts/[id]/regenerate-copy/route.ts`                                                                                                                                          | Modify        | Body, claim + PENDING, settle (T6)                                                                                                                                           |
| `src/lib/drafts/recovery.ts`, `src/lib/drafts/draftActions.ts`                                                                                                                              | Modify        | `settlePendingCaptions`; the `onError` hook in `startDraftAction` (T6)                                                                                                       |
| `src/lib/api-types.ts`                                                                                                                                                                      | Modify        | `DraftDetail` caption fields (T6)                                                                                                                                            |
| `src/components/drafts/CopyEditor.tsx`                                                                                                                                                      | Delete        | Replaced (T6)                                                                                                                                                                |
| `src/components/drafts/{CaptionPanels,CaptionPanel}.tsx`                                                                                                                                    | Create        | Base (T6); per-channel actions, notices (T11, T12)                                                                                                                           |
| `src/components/drafts/HeadlinePanel.tsx`                                                                                                                                                   | Create        | (T11)                                                                                                                                                                        |
| `src/app/(app)/drafts/[id]/page.tsx`                                                                                                                                                        | Modify        | Uses `CaptionPanels`; per-row skeleton; strings (T6)                                                                                                                         |
| `src/lib/publish/publishDraft.ts`, `src/lib/social/types.ts`, `src/lib/scheduler/jobRunner.ts`                                                                                              | Modify        | Resolver in `publishToChannel`, `terminal`, `Partial` publishers (T1 typing, T7)                                                                                             |
| `src/lib/social/{instagram,linkedin}.ts`                                                                                                                                                    | Modify        | Mock `platformId` hash (T7)                                                                                                                                                  |
| `src/app/api/posts/route.ts`, `src/app/api/posts/[id]/route.ts`, `src/app/api/posts/[id]/publish/route.ts`                                                                                  | Modify        | Publishable channel (T1); up-front 422, `draft.caption`, draft id to `publishToChannel` (T7)                                                                                 |
| `src/app/api/briefs/route.ts`, `src/lib/campaign/queue.ts`, `src/app/api/team/channels/route.ts`, `…/[channel]/route.ts`                                                                    | Modify        | Publishable channels only (T1)                                                                                                                                               |
| `src/mcp/tools/generate.ts`, `src/mcp/tools/publish.ts`                                                                                                                                     | Modify        | Channel validation (T1); outputs (T8)                                                                                                                                        |
| `src/components/brief/ContentStep.tsx`, `src/components/campaigns/CampaignBriefingSection.tsx`, `src/app/(app)/team/page.tsx`                                                               | Modify        | Wording (T14)                                                                                                                                                                |
| `scripts/seed-teams.mjs`                                                                                                                                                                    | Modify        | Native fixture drafts: three rows + headline (T9)                                                                                                                            |
| `scripts/export-posts.mjs`, `scripts/import-posts.mjs`                                                                                                                                      | Modify        | Captions + headline; old bundles → legacy (T15)                                                                                                                              |
| `tests/unit/{channels,prompts,background,campaignBriefing,renderStamps,draftRecovery,mcpGetDraft,testHooks}.test.ts`                                                                        | Modify        | Per the AC map (T1–T8)                                                                                                                                                       |
| `tests/unit/{captionExtract,captionHeadline,captionMigrationPlan,captionResolve,captionActionTargets,jobRunner,legacyCaptionGuard,captionWording}.test.ts`                                  | Create        | AC-02–AC-09 (T2, T3, T6, T7, T9, T14)                                                                                                                                        |
| `tests/e2e/captions.test.ts`                                                                                                                                                                | Create        | §W (T10, T13)                                                                                                                                                                |
| `tests/e2e/{async-actions,team-isolation,surfaces,a11y}.test.ts`                                                                                                                            | Modify        | §10 table (T10, T14)                                                                                                                                                         |
| `CLAUDE.md`, `docs/handoff.md`, `.specclaw/ROADMAP.md`, `.specclaw/changes/{008,010}-*/proposal.md`, `docs/e2e-test-plan.md`, `docs/mcp-acp-guide.md`, `docs/ui-reference/DESIGN_SYSTEM.md` | Modify        | Docs (T16)                                                                                                                                                                   |

## Data Model Changes

```prisma
enum Channel { INSTAGRAM LINKEDIN WHATSAPP }

enum CaptionStatus { PENDING READY FAILED }
enum CaptionMigration { SPLIT UNSPLIT_FALLBACK EMPTY }

model Draft {
  // …unchanged fields…
  legacyCaptionText String?          @map("copyText")   // T9; read-only, dropped in a later change
  headline          String?
  captionMigration  CaptionMigration?
  captions          DraftCaption[]
}

model DraftCaption { /* spec FR-02 */ }
```

**Migration 2, the SQL (abridged):**

```sql
CREATE TYPE "CaptionStatus" AS ENUM ('PENDING', 'READY', 'FAILED');
CREATE TYPE "CaptionMigration" AS ENUM ('SPLIT', 'UNSPLIT_FALLBACK', 'EMPTY');
CREATE TABLE "DraftCaption" (
  "id" TEXT PRIMARY KEY, "draftId" TEXT NOT NULL, "channel" "Channel" NOT NULL,
  "text" TEXT NOT NULL DEFAULT '', "status" "CaptionStatus" NOT NULL DEFAULT 'PENDING',
  "failureReason" TEXT, "needsReview" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DraftCaption_failed_has_no_text" CHECK ("status" <> 'FAILED' OR "text" = '')
);
CREATE UNIQUE INDEX "DraftCaption_draftId_channel_key" ON "DraftCaption"("draftId", "channel");
CREATE INDEX "DraftCaption_draftId_idx" ON "DraftCaption"("draftId");
ALTER TABLE "DraftCaption" ADD CONSTRAINT "DraftCaption_draftId_fkey"
  FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Draft" ADD COLUMN "headline" TEXT, ADD COLUMN "captionMigration" "CaptionMigration";
```

**The rollback data fix** (`prisma/rollback/012-per-channel-captions.down.sql`):

```sql
UPDATE "Draft" d SET "copyText" = COALESCE(
  (SELECT NULLIF(c."text", '') FROM "DraftCaption" c WHERE c."draftId" = d."id" AND c."channel" = 'INSTAGRAM'),
  (SELECT NULLIF(c."text", '') FROM "DraftCaption" c WHERE c."draftId" = d."id" AND c."channel" = 'LINKEDIN'),
  '')
WHERE d."copyText" IS NULL;
ALTER TABLE "Draft" ALTER COLUMN "copyText" SET NOT NULL;
-- Un-record migration 3 so a later 012 redeploy re-applies its DROP NOT NULL
-- (amended 2026-10-11, user decision: found while writing the T16 runbook).
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261011140000_legacy_caption_text';
-- DraftCaption, Draft.headline, Draft.captionMigration and Channel.WHATSAPP are left in place:
-- the previous image never reads them, and they are what a roll-forward resumes from.
```

## API Changes

| Surface                                              | Change                                                                                                          |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `GET /api/drafts/[id]`                               | − `copyText`; + `headline`, `captionMigration`, `captions[]` (spec FR-13). In-app contract only.                |
| `PATCH /api/drafts/[id]`                             | Body `{channel, text}` or `{headline}`; `{copyText}` → 400. 409 on PUBLISHED and on a PENDING row. In-app only. |
| `POST /api/drafts/[id]/regenerate-copy`              | Path kept. Body `{}` / `{channel}` / `{headline:true}`. 202 `{ok:true}` as today. 409 message reworded.         |
| `POST /api/generate/copy`                            | Path kept. Response `{copyText, headline, captions}`; `copyText` is the IG text (A4).                           |
| `POST /api/posts`                                    | Channel must be publishable (400). New 422 `{error, code:'CAPTION_UNPUBLISHABLE'}`, with no row.                |
| `GET /api/posts`, `GET /api/posts/[id]`              | `draft.copyText` → `draft.caption` (that channel's text).                                                       |
| `POST /api/briefs`, queue create/edit, team channels | Publishable channels only (400).                                                                                |
| MCP/ACP `get_draft`                                  | + `headline`, `captions:[{channel,text,status}]`; `copyText` kept as the IG-text alias.                         |
| MCP/ACP `generate_post`                              | + `headline`, `captions`. Non-publishable channels rejected.                                                    |
| MCP/ACP `publish_post`                               | Non-publishable channel rejected up front; a caption refusal → FAILED row + error.                              |

## Key Decisions

| #   | Decision                                                                       | Why                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | `legacyCaptionText @map("copyText")`, no physical rename (A1)                  | The old container keeps working during cutover; rollback is a data fix; the later drop change is one `DROP COLUMN`.                                                                           |
| D2  | Draft-level single-flight with per-row `PENDING` (A2)                          | Reuses the claim, the sweep, the restore 409 and action-keyed settles. Per-row status still gives per-panel skeletons and failures. Parallel per-channel runs buy little at 10–40 s each.     |
| D3  | Normalise `**` in model output; never touch user text (A3)                     | Rejecting would fail WhatsApp often, for a deterministic fix. Normalising is testable: no stored model caption contains `**`. User text is the user's decision.                               |
| D4  | External `copyText` = the Instagram caption (A4)                               | Contracts keep their names. A legacy consumer that publishes `copyText` most plausibly targets Instagram, and a combined string would re-create Problem 1 externally.                         |
| D5  | `FAILED ⇒ text = ''` (CHECK); a failed regenerate keeps good text `READY` (A7) | Failed output is never stored, so "FAILED but has text" cannot exist. The resolver's FAILED refusal stays as defence in depth.                                                                |
| D6  | Materialize inside the one loader + idempotent boot backfill (A8)              | One caption source for every reader. The boot pass gives the ruled migration-time `REVIEW` list and the prevalence count. The lazy pass covers deferred and cutover drafts.                   |
| D7  | The resolver is pure and client-safe; `publishToChannel` takes the draft id    | One rule set for `POST /api/posts` (422 up front), immediate, retry and scheduled publishing. No caller can pass the wrong text.                                                              |
| D8  | Captions for all three channels on every draft (A5)                            | Channels are chosen at publish time; one call is cheaper than a later regenerate.                                                                                                             |
| D9  | Headline required; a missing one fails the generation (A6)                     | Design never runs on nothing (the FACTS — DO NOT INVENT risk). The Topic fallback is limited to legacy drafts and is logged.                                                                  |
| D10 | `CHANNEL_VALUES` keeps its name and means "publishable"                        | Every existing picker and default (`PublishDialog`, `QueueEntryModal`, wizard defaults, the briefing assistant) stays at two with no edit, so WhatsApp cannot leak into a picker by omission. |
| D11 | `onDelete: Cascade` on `DraftCaption.draft`                                    | A caption has no meaning without its draft. The admin hard-delete needs no new statement.                                                                                                     |

## Risks & Mitigations

| Risk                                                                             | Mitigation                                                                                                                                                                                         |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A real model emits JSON the strict extractor rejects (raw newlines, two objects) | Raw control characters inside strings are escaped before parsing; the prompt asks for `\n`; a rejected reply fails visibly with a logged reason, never silently. AC-29's live sample is the check. |
| `max_tokens` truncation (API mode) fails every generation                        | `CAPTION_MAX_TOKENS = 8192`, covered in T5's provider unit tests.                                                                                                                                  |
| The planner mis-splits a real prod caption                                       | A conservative SPLIT rule (exactly one header per channel, no preamble, no empty section); everything else falls back verbatim with a review notice; the legacy text is preserved for a re-plan.   |
| A fallback draft with a queued post publishes unreviewed                         | The boot `REVIEW` lines + `captions:report`; the review notice on the draft page. The text is exactly what pre-012 would have sent, so it is not a regression.                                     |
| The backfill crashes the boot                                                    | Per-draft errors are caught and counted; only a DB-unreachable failure exits non-zero, which is the entrypoint's intended fail-loud behaviour. `SKIP_MIGRATIONS=1` skips it too.                   |
| The headline drifts from the image after "Regenerate headline"                   | The headline helper text says to regenerate the design; "Regenerate all" never touches the headline (A9).                                                                                          |
| WhatsApp leaks into a publish path                                               | Four layers: pickers use `CHANNEL_VALUES`; every input validator uses `isPublishableChannel`; the resolver's rule 1; the job runner treats it as terminal. AC-17 and AC-18 cover them.             |
| Mid-wave UI breakage (T5–T9) goes unnoticed until the gate                       | The E2E runs per wave by convention; `tsc`, lint and unit run per task; T10 owns every wave-1 E2E edit, so the gate run is the first full check and is planned as such.                            |
| 014 still open when 012 starts                                                   | A hard dependency: 012 starts only after 014 T18. T6 deletes `CopyEditor` after 014 T15 has landed its attributes, and keeps the same naming rule.                                                 |
