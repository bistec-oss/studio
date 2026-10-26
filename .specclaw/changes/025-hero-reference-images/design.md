# Design: Hero product screenshots (009 Phase 2)

**Change:** 025-hero-reference-images · **Spec:** [spec.md](spec.md)
**Created:** 2026-10-25

Facts read at HEAD `45fae1a`. Line numbers are from that tree.

## 1. Technical approach

One rule drives the whole design: **the model never sees or writes the screenshot.** It sees a rect it must leave empty. Code inserts one canonical element with a token, and code resolves the token at render time. Every render that carries the token also checks it.

```
image model ──> hero image ──> blank check (composite rect) ── fail ─> classic + image (composite-not-blank)
                                     │ ok
design model ──> HTML (rect left empty) ──> insertComposite (token) ──> render(resolve token → data: URI, check)
                                                                          │ fail → delete export, re-run design classic, no image
                                                                          │ ok   → store tokenized HTML + stamp.composites
```

Three layers, each with one job:

| Layer                                                 | Where                           | Pure?                                                       |
| ----------------------------------------------------- | ------------------------------- | ----------------------------------------------------------- |
| Geometry, check verdicts, stamp, prompt words         | `src/lib/designData/`           | yes                                                         |
| Insert, strip, tokens, render argument, image headers | `src/lib/composite/`            | `insert.ts` and `imageHeader.ts` pure; `assets.ts` does I/O |
| Token substitution and in-page measurement            | `src/lib/renderer/puppeteer.ts` | no                                                          |

`designData` never imports `composite` (the boundary guard is extended).

## 2. The dataset (`composition.ts`)

```ts
export type Purpose = 'text' | 'clear' | 'composite'
export type ArchetypeKey =
  'product-showcase' | 'editorial-split' | 'full-bleed-scene' | 'spotlight' | 'device-screen'
export type LookInput = 'composite-source'
export interface Archetype {
  /* … */ requires?: LookInput
}
```

- **The row** is spec FR-02 verbatim. A helper `screen(x, y, w, h)` builds `{ rect, purpose: 'composite', minAreaPct: 20 }`. Property order is fixed, because the hash covers `JSON.stringify` order.
- **The header** gains a "PERMANENT NAMES (025)" paragraph listing `composite`, `requires`, `composite-source` and the three reasons.
- **`imageStyleOptions(aspectRatio, source, opts?: { hasCompositeSource?: boolean })`** returns `supported: false` and a new optional `unavailableReason: 'needs-screenshot'` for a look with `requires` when `!opts?.hasCompositeSource`. Size support is computed as before, and the size reason wins when both apply. `supportsSize` keeps its meaning (size only).
- **Getting the rect:** `compositeRegionOf(sizeContract)` returns the composite region or null. Code outside the dataset gets the rect only through it.

## 3. Validation (`validate.ts`)

These are added to the per-size loop:

- `composites.length > 1` gives "more than one composite region";
- a look with `requires` and `composites.length !== 1` gives "requires composite-source but has N composite regions";
- a look without `requires` and `composites.length > 0` gives "has a composite region but no requires";
- a composite rect that intersects any text rect (open intervals) gives "composite region overlaps a text region".

The existing "at least one text region" rule stands.

## 4. The check (`evaluate.ts`, `plan.ts`)

```ts
export const BLANK_STDDEV_MAX = 0.04
export type HeroVerdict =
  | { ok: true }
  | {
      ok: false
      reason: 'busy' | 'contrast' | 'region-invalid' | 'composite-not-blank'
      region: Region
    }
```

In `evaluateRegions`, a `composite` region runs: invalid, then `lightnessStdDev > BLANK_STDDEV_MAX` gives `composite-not-blank`. There is no contrast step. `HeroCheckResult` in `plan.ts` gains `'composite-not-blank'`, and `settleComposition` passes it through unchanged (it already copies `check.reason`).

- **`planComposition(input & { hasCompositeSource?: boolean })`:** for a `requires` look with no source it returns `{ kind: 'classic', fallbackReason: 'composite-source-missing' }`. `ClassicPlan.fallbackReason` widens to include that reason.
- **`settleComposition(plan, background, composite?)`** gains an optional third argument:
  - `{ ok: true, source }` adds `composites: [{ region: 0, source }]` to a kept stamp;
  - `{ ok: false, reason }` turns a kept plan into classic with that reason.

  This is the only place `composites` is written at generation (one writer).

**The sampler is unchanged.** `sampleRegionLuminance` samples every region of the size contract. The composite region joins the list through the same `mapRegionToImage` cover-fit.

## 5. The stamp (`stamp.ts`)

```ts
export const FALLBACK_REASONS = [...existing 8, 'composite-not-blank', 'composite-not-rendered', 'composite-source-missing'] as const
const compositeEntry = z.object({
  region: z.literal(0),
  source: z.object({ kind: z.literal('brief-upload'), key: z.string().regex(SCREENSHOT_KEY_RE) }),
}).strict()
// in the object: composites: z.array(compositeEntry).length(1).optional()
```

`SCREENSHOT_KEY_RE = /^screenshots\/[^/]+\/[^/]+\/[^/]+$/` lives in `stamp.ts`, a pure module, and `composite/` imports it. `superRefine` adds two rules:

- `composites` present and the applied archetype is classic gives an error;
- `composites` present and the applied look lacks `requires` gives an error.

The look is read from the dataset via `getArchetype(appliedArchetype)`. A kept `requires` look with **no** `composites` also fails, so a kept device-screen stamp is never half-written. `refineReplacedStamp` builds a fresh object, so `composites` is dropped.

## 6. Prompt text (`promptText.ts`)

- **`imageContractText`** gets a `composite` branch, the spec FR-07 sentence with `describeRegion(r.rect)`.
- **`designContractText`** adds, after the text-region list, one line per composite region: `Leave ${describeRegion} (${describeRegionPx}) completely empty: no text, shape, image, overlay or scrim. The product screenshot is placed there automatically.`
- **`refineContractText`** adds the same sentence.
- **`imageGeometryPin`** (added during OP-025, 2026-10-25, on the user's decision): for a size with a composite region it returns `Exact composition, follow these measurements:` followed by `imageContractText`, and `runBackgroundStep` appends it to the art-director's image prompt after a blank line. The art-director paraphrased the contract lines (OP-025 attempt 1 drew the laptop centred and high), and a placed screenshot needs the screen exactly where the region is, so code carries the measurements to the image model word for word. A size without a composite region returns null, and its prompt is unchanged.

All existing goldens are unchanged, because no current look has a composite region.

## 7. Resolver, briefs route and notice

- **`resolve.ts`:** `ResolveNote` gains `'missing-input-classic'`. `ResolveInput` gains `hasCompositeSource?: boolean`. In the image-style chain, after `retired-classic`: if `getArchetype(imageStyle)?.requires && !input.hasCompositeSource`, the result is classic with `missing-input-classic`. Wizard, briefs-api and regenerate pass the flag. Queue, MCP and ACP never reach it (`unattended-classic` is first).
- **`src/lib/brief/imageStyle.ts` `validateImageStyle`:** unchanged. The pairing rule is a separate pure function, `compositePairingError(imageStyle, compositeSource)`, in `src/lib/brief/compositeSource.ts`. It returns `IMAGE_STYLE_NEEDS_SCREENSHOT` or `SCREENSHOT_NEEDS_IMAGE_STYLE`.
- **`POST /api/briefs`** (`route.ts` ~`:115` and ~`:154`):
  - parse `compositeSource` with a zod schema;
  - check the key prefix `screenshots/${teamId}/${userId}/`;
  - `headObject` (new helper) on `BUCKET_DOCS`;
  - apply the pairing rule;
  - store it.

  In Group A the schema is not yet accepted, so any `requires` look is 400 `IMAGE_STYLE_NEEDS_SCREENSHOT`.

- **`compositionNotice.ts`** gains three cases. The two "without the hero image" reasons say so.

## 8. The probe (Group A) and OP-025

**Route `POST /api/admin/look-probe`** (`withTeamAuth`; a non-super-admin gets 403; `NODE_ENV === 'production'` gets 404):

1. `planComposition({ imageStyle: key, aspectRatio: size, hasCompositeSource: true })`. A non-hero plan gives 400.
2. `runBackgroundStep` with the hero plan and a fixed probe brief topic ("Product screen probe"). It resolves the team's image provider exactly as generation does, and returns `{ url, check }`.
3. It returns `{ verdict: check, fallbackReason, threshold: BLANK_STDDEV_MAX, promptHash: sha256(imagePrompt), image: url }`. `runBackgroundStep` exposes the prompt it sent through an optional `onPrompt` callback.

It writes no row. The persisted IMAGES object is deleted after the response is built. Under `MOCK_AI` it uses the mock provider and mock samples.

**Runner (`run-look-check.mjs --probe`):**

- **Slots:** `PROBE_SLOTS = ['device-screen:SQUARE', 'device-screen:PORTRAIT', 'device-screen:STORY']` in `lookCheck.mjs`.
- **Cap:** `capFor(PROBE_SLOTS, 3)` gives 9. `capFor` gains an optional per-slot maximum, and the 028 default stays 2.
- **Run:** in probe mode, for each slot it calls `planNext`, appends the ledger line `{ at, runId, slot, attempt, mode: 'probe', threshold, promptHash }` (written **before** the request, as 028 does), POSTs to the probe route, saves `renders/<slot>_<attempt>.png` from the `data:` URL, and writes `results.json` `{ slot, attempt, styleKept: verdict.ok, fallbackReason, accepted: null }`.
- **Verdict:** `--verdict <slot>#<attempt>=accept|reject` records the user's verdict per attempt.
- **Pass rule (`probeVerdicts`):** a slot passes with 2 attempts that are each `styleKept && accepted`.
- **The 028 path is untouched.**

## 9. Fixtures (Group A)

- **`lookFixtureTable.ts`:**
  - `FixtureKind` gains `'screen'`. Rows are required only for contracts with a composite region.
  - `INTENDED_BACKDROP['device-screen'] = 'dark'`.
  - 12 new rows: pass, busy, contrast and screen per size.
  - `fixtureCompletenessProblems` requires a `screen` row exactly when the contract has a composite region.
  - The completeness test's 36 becomes 48.
- **`lookFixtures.ts`:**
  - **pass:** paints the composite rect a flat `#dcdcdc` (an evenly lit blank screen), padded by 1 point.
  - **screen:** paints `STRIPES` inside the composite rect (shrunk by 1).
  - **busy and contrast:** unchanged; they hit text regions.
  - **Assertions:** `screen` expects `{ reason: 'composite-not-blank', region: composite }`, and `pass` expects ok.

## 10. The composite engine (Group B)

**`src/lib/composite/insert.ts`** (pure, string-level, no DOM library):

```ts
export const COMPOSITE_TOKEN = '__COMPOSITE_0__'
export function compositeElement(rectPx: {
  left: number
  top: number
  width: number
  height: number
}): string
export function stripComposite(html: string): string // removes every <div data-composite …>…</div>
export function insertComposite(
  html: string,
  region: Region,
  canvas: { width: number; height: number },
): string
export function compositeHtmlProblems(html: string, region: Region, canvas): string[] // exactly one, canonical, at the rect
```

- **Stripping** matches the canonical element by a strict regex on the exact attribute set it writes. It also removes any other element carrying a `data-composite` attribute, using a tolerant tag scan (open tag to its matching close, nesting-aware for `div`). This makes insert idempotent and drops model-written impostors.
- **Insertion** goes before the last `</body>`, or appends when there is none.
- **Pixels** are `rect% × canvas / 100`, rounded to 0.1 px. The element:

```html
<div
  data-composite="0"
  style="position:fixed;left:Lpx;top:Tpx;width:Wpx;height:Hpx;z-index:2147483647;background:#0b0b0b;overflow:hidden;margin:0;padding:0;border:0"
>
  <img
    data-composite-img="0"
    src="__COMPOSITE_0__"
    alt=""
    style="display:block;width:100%;height:100%;object-fit:contain"
  />
</div>
```

**`src/lib/composite/imageHeader.ts`** (pure): `readImageHeader(bytes): { format: 'png'|'jpeg'|'webp'; width; height } | null`.

- **PNG:** the signature, then the IHDR chunk.
- **JPEG:** `FFD8`, then a scan to the first SOF0 to SOF15 marker (excluding DHT `C4`, JPG `C8` and DAC `CC`).
- **WebP:** `RIFF….WEBP`, then the `VP8 `, `VP8L` or `VP8X` dimensions.

Anything else, or a truncated file, gives null.

**`src/lib/composite/assets.ts`** (I/O):

```ts
export interface CompositeRender {
  token: string
  dataUri: string
  rectPx: RectPx
}
export async function compositeRenderFor(
  stamp: CompositionStamp | null,
  teamId: string,
  size: AspectRatio,
): Promise<CompositeRender | null>
export async function compositeRenderForSource(
  source,
  teamId,
  region,
  canvas,
): Promise<CompositeRender>
export class CompositeRenderError extends Error {
  reason: 'composite-not-rendered' | 'composite-source-missing'
}
```

`compositeRenderFor` returns null when the stamp has no `composites`. It throws `CompositeRenderError('composite-source-missing')` when:

- the key's team segment is not `teamId`;
- `getObjectBytes` fails;
- the bytes fail `readImageHeader`.

The rect comes from `contractAt(applied, contractVersion, size)` and `compositeRegionOf`.

**`minio.ts`** gains `getObjectBytes(bucket, key): Promise<Buffer>` and `headObject(bucket, key): Promise<boolean>`.

## 11. The renderer (Group B)

`renderHtmlToPng(html, width, height, composites: CompositeRender | null)` and `evaluateInRenderedPage(html, width, height, fn, composites: CompositeRender | null)`. The argument is **required**, so tsc lists every caller.

Inside `withRenderedPage`, when `composites` is set:

1. `const resolved = html.split(composites.token).join(composites.dataUri)`. The token is replaced only inside the canonical `src`; `compositeHtmlProblems` has already guaranteed exactly one occurrence.
2. `setContent(resolved, networkidle0)`.
3. `page.evaluate` collects facts for `[data-composite="0"]`:
   - `{ found, complete, naturalWidth, box: getBoundingClientRect(), hits: [5 points].map(p => el.contains(document.elementFromPoint(x, y))) }`
4. `evaluateCompositeFacts(facts, rectPx, COMPOSITE_TOLERANCE_PX)` (pure, in `designData/composite.ts`, new) decides. A failure throws `CompositeRenderError('composite-not-rendered')`.
5. Then the existing `fn(page)` (the screenshot).

**Under `MOCK_PUPPETEER`**, `renderHtmlToPng` returns early as today, but first runs `compositeHtmlProblems` when `composites` is set, and `shouldMockCompositeFail(html)` (`__MOCK_COMPOSITE_FAIL__` in the HTML, which the mock design HTML copies from the brief topic). Either throws `CompositeRenderError('composite-not-rendered')`. That is how E2E reaches the failure paths.

The egress allowlist is unchanged; `data:` is already allowed.

## 12. Wiring (Group B)

**Generation (`pathB.ts`):**

- **Plan:** `planComposition({ …, hasCompositeSource: !!brief.compositeSource })`.
- **Kept look with a composite region:** build `cr = await compositeRenderForSource(brief.compositeSource, teamId, region, canvas)`. A throw settles as classic `composite-source-missing` **without** the hero image: `backgroundImageUrl` is set to null for the design.
- **Design agents:** pass `postProcess: (h) => insertComposite(h, region, canvas)` and `composites: cr`.
  - **CLI** (`designAgentCli.ts`): `postProcess` runs after extract and restore (~`:60-66`), then render with `composites` (`:69`).
  - **API** (`designAgent.ts` ~`:214-223`): `postProcess` runs where inline assets are restored, before `executeTool`. `tools.ts` `toolRenderHtml` takes `composites` from the agent options. `lastHtml` is the post-processed HTML.
- **Render failure:** `runPathBDesign` catches `CompositeRenderError`, deletes any export it uploaded, and re-runs the design once as classic with no hero image. The stamp comes from `settleComposition(plan, background, { ok: false, reason })`.
- **Success:** `settleComposition(plan, background, { ok: true, source })`.
- **Regenerate-design** calls `runPathBDesign`, so it is covered.

**Every other render** passes `await compositeRenderFor(stamp, teamId, brief.aspectRatio)`:

- **`commitDraftRevision`** (`revisions.ts:480`): the args gain `composites` (required, may be null). The callers build it from the stamp they commit.
- **`recordRejectedRender`** (`:838`): the same.
- **restore route** (`:69`), **export route** (`:38`), **`extractDomFacts`** (`domFacts.ts:100`, an option) and **`observeLayout`** (`layoutFacts.ts:119`, an option).

**Refine (`refine/route.ts`):**

- **Prompt input:** `slimHtml = extractInlineAssets(stripComposite(draft.htmlContent))`.
- **After the model returns:** `refineAttempt` restores inline assets, then `postProcess` runs `insertComposite` when the commit stamp keeps a composite look, or `stripComposite` when it does not (`refine-replaced-image`).
- **Failure:** a `CompositeRenderError` from the commit render is caught in the draft-action runner and settles `pendingActionError` with the spec's named message. No revision is written: the commit's transaction is not entered, because the render precedes it.

**Override** re-renders through `commitDraftRevision`, so it is covered the same way.

**Inline edit (`inline-edit/route.ts:76`, `:190`):** `html = stamp has composites ? insertComposite(sanitized, region, canvas) : stripComposite(sanitized)`, then commit. A `CompositeRenderError` gives 409 with the named message.

**Editor (`InlineEditModal.tsx`):**

- **Display:** after load, the iframe's `[data-composite-img]` `src` is set to `/api/briefs/screenshots?key=…&draftId=…`, a display copy only. The element is marked `contenteditable=false`, `pointer-events:none`, with an outline label.
- **Save:** `stripEditingChrome` resets the `src` to the token. The server canonicalizes anyway.
- **Preview route:** it also accepts `draftId`. The draft must be visible to the caller (`visibility.ts`), and the key must equal the draft stamp's key.

**Brief drafts:**

- `briefDraftPayload.ts` gains `compositeSource` (the same zod schema).
- `briefDrafts.ts` `deleteBriefDraftImages` also deletes a `compositeSource.key` under `screenshots/${teamId}/${userId}/` in `BUCKET_DOCS`. The row stores `teamId`; if it does not, the prefix check uses the key's own segments plus the session user.
- `keepImages` keeps it as well.

**Draft delete** (`drafts/[id]/route.ts:350`): when the orphaned brief is deleted, `deleteObject(BUCKET_DOCS, brief.compositeSource.key)` runs after the transaction, logging any failure.

## 13. The wizard (Group B)

- **`SizeDesignStep.tsx`:** under the image-style cards, a "Product screenshot" field (existing `FileInput`/`Button` primitives) for `designMode === 'GENERATE'`.
  - **Upload:** it POSTs to `/api/briefs/screenshots`.
  - **After upload:** a thumbnail via the preview route, Remove, and the advisory line.
  - **Picker:** the `device-screen` card is disabled with "Needs a product screenshot" until one is uploaded, through `imageStyleOptions(…, { hasCompositeSource })`.
- **`useBriefWizard.ts`:** `compositeSource` state, the submit body, the autosave payload, resume, and reset on `setDesignMode('TEMPLATE')`.
  - **Removing the screenshot** while `device-screen` is picked resets the pick through the existing `styleAfterSizeChange` path, generalised to `styleAfterInputChange`.
- **`ReviewStep.tsx`:** one line, "Product screenshot: <width>×<height>".

## 14. Migration

- **`prisma/schema.prisma`:** `Brief.compositeSource Json?`.
- **Migration** `20261026120000_composite_source`: `ALTER TABLE "Brief" ADD COLUMN "compositeSource" JSONB;`.
- **Down script:** `ALTER TABLE "Brief" DROP COLUMN IF EXISTS "compositeSource";`.
- **`test:upgrade`** picks it up.

## 15. Mock seams (`testHooks.ts`)

- `COMPOSITE_MOCK_SENTINEL = '__MOCK_COMPOSITE_FAIL__'` and `shouldMockCompositeFail(html)`, both gated on `MOCK_AI`.
- `mockRegionSamples` gains a per-region branch. The new sentinel `__MOCK_HERO_SCREEN__` gives busy samples to `composite` regions only and calm samples to text regions, so `composite-not-blank` is reachable. `__MOCK_HERO_BUSY__` and the other sentinels keep their exact meaning; the regions run in dataset order with text first, so busy still reports `busy`.
- `buildMockHtml` copies `__MOCK_COMPOSITE_FAIL__` from the topic into a comment.

## 16. E2E §AG

`tests/e2e/product-screenshots.test.ts`, TC-SHOT-01 to TC-SHOT-14:

| Case | What it checks                                                                  |
| ---- | ------------------------------------------------------------------------------- |
| 01   | No-source 400                                                                   |
| 02   | Upload PNG gives a key                                                          |
| 03   | SVG-as-PNG 400                                                                  |
| 04   | Too small 400                                                                   |
| 05   | Foreign preview 404                                                             |
| 06   | `POST /api/briefs` pairing 400s                                                 |
| 07   | Kept generation: token, stamp, no URL                                           |
| 08   | `__MOCK_COMPOSITE_FAIL__` gives classic `composite-not-rendered` and the notice |
| 09   | Busy screen gives `composite-not-blank`                                         |
| 10   | Refine keeps the composite                                                      |
| 11   | Inline edit canonicalizes                                                       |
| 12   | Refine with the fail sentinel gives the named error and no revision             |
| 13   | Wizard flow and autosave resume                                                 |
| 14   | Discard deletes the object (MinIO)                                              |

## 17. File changes map

| Group                      | Files                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: dataset                 | `src/lib/designData/{composition,validate,evaluate,plan,stamp,promptText,index}.ts`, `designData/composite.ts` (new, `evaluateCompositeFacts` and `COMPOSITE_TOLERANCE_PX`)                                                                                                                                                                                                            |
| A: resolver, route, notice | `src/lib/postStyles/{resolve,types}.ts`, `src/lib/brief/compositeSource.ts` (new), `src/app/api/briefs/route.ts`, `src/lib/drafts/compositionNotice.ts`, `src/components/brief/SizeDesignStep.tsx` (unavailable reason text only)                                                                                                                                                      |
| A: fixtures                | `tests/render/{lookFixtureTable,lookFixtures,look-fixtures.test}.ts`, `tests/unit/lookFixtureCompleteness.test.ts`                                                                                                                                                                                                                                                                     |
| A: probe                   | `src/app/api/admin/look-probe/route.ts` (new), `src/lib/agent/background.ts` (`onPrompt`), `scripts/look-check/{lookCheck,run-look-check}.mjs`                                                                                                                                                                                                                                         |
| B: engine                  | `src/lib/composite/{insert,imageHeader,assets}.ts` (new), `src/lib/renderer/{puppeteer,layoutFacts,domFacts}.ts`, `src/lib/storage/minio.ts`, `src/lib/testHooks.ts`                                                                                                                                                                                                                   |
| B: pipeline                | `src/lib/agent/{pathB,designAgentCli,designAgent,tools,refineAttempt}.ts`, `src/lib/drafts/{revisions,draftActions}.ts`, `src/app/api/drafts/[id]/{route,refine/route,inline-edit/route,revisions/[rev]/restore/route}.ts`, `src/app/api/generate/export/route.ts`                                                                                                                     |
| B: storage and brief       | `prisma/schema.prisma`, the migration, the down script, `src/app/api/briefs/screenshots/route.ts` (new), `src/app/api/briefs/route.ts`, `src/lib/brief/{briefDraftPayload,briefDrafts}.ts`                                                                                                                                                                                             |
| B: UI                      | `src/components/brief/{SizeDesignStep,ReviewStep}.tsx`, `src/components/brief/useBriefWizard.ts`, `src/lib/brief/wizardStyleState.ts`, `src/components/drafts/InlineEditModal.tsx`                                                                                                                                                                                                     |
| Tests                      | `tests/unit/{composite,compositeInsert,imageHeader,lookProbe}.test.ts` (new), `tests/render/composite.test.ts` (new), `tests/e2e/product-screenshots.test.ts` (new); existing tests that enumerate looks and reasons (`lookDataset`, `designData`, `designDataBoundary`, `postStylesResolve`, `postStylesWizard`, `compositionStamp`, `compositionNotice`, `lookCheck`, `heroPrompts`) |
| Docs                       | `docs/handoff.md`, `docs/e2e-test-plan.md`, `CLAUDE.md`, `.specclaw/ROADMAP.md`                                                                                                                                                                                                                                                                                                        |

## 18. Key decisions

1. **A `data:` URI at render, not a signed URL** (spec Overview). There is no expiry, no egress host, and nothing to log.
2. **A required `composites` argument on the renderer.** tsc then forces every one of the six render callers and two evaluate callers to decide, which is the mechanical answer to "every render checks".
3. **Fallback for a render failure drops the hero image.** Otherwise a classic post shows an empty laptop.
4. **The probe route instead of an image-only script.** It reuses the team's provider credentials, the shipped prompt, the sampler and the check, through the app OP-1 and OP-028 already used. It is 404 in production.
5. **`contain` on black.** The real UI is never cropped.
6. **Per-attempt verdicts in probe mode.** The pass rule needs 2 accepted attempts per size, while 028 had 1 per slot.

## 19. Risks and mitigations

| Risk                                                     | Mitigation                                                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| The model can't draw a blank screen at some size         | OP-025 before Group B; the failing sizes are removed before release                                          |
| A string-level strip misses an odd model-written element | Tolerant scan plus the render check's topmost test; the canonical element is last in `body` with max z-index |
| A large `data:` URI slows `setContent`                   | Caps of 10 MB and 25 MP; measured in the render test (recorded in the report)                                |
| A caller forgets `composites`                            | The required argument; NFR-05's grep; AC-14                                                                  |
| `mockRegionSamples` change alters 009 cases              | A new sentinel keeps the old busy-text meaning; the 009 suites run in the T4 gate                            |

## 21. Amendment A1: screen detection (2026-10-25, after OP-025 attempts 1 to 4)

Spec "Amendment A1" is the requirement; this is the shape.

- **Sampler (`puppeteer.ts`):** `sampleLuminanceGrid(dataUrl, window, canvas)` maps the window (canvas percent) to the image with the existing cover-fit mapping (`mapRegionToImage`), draws it on a canvas with smoothing off at one point per 2 canvas px, and returns `{ cols, rows, x0, y0, step, values }` in canvas px with L\*/100 values. Same network-blocked page, timeout and `HeroCheckError` rules as `sampleRegionLuminance`; under `MOCK_PUPPETEER` it returns a synthetic grid (below).
- **Detector (`designData/composite.ts`, pure):** `detectScreenRect(grid, region, textRegions, canvas)` returns `{ ok: true, rect }` or `{ ok: false, detail }`, with the constants `DETECT_MARGIN_PCT`, `SCREEN_EDGE_DELTA`, `MIN_SCREEN_AREA_RATIO` beside `BLANK_STDDEV_MAX`. `detectionWindow(region, canvas)` gives the window. `detail` names the failed rule for logs and tests; the reason is always `composite-not-blank`.
- **The check:** the hero check samples the text regions as today and, for the composite region, the grid. `evaluateRegions` keeps its text-region behaviour; the composite branch moves to the detector. `HeroCheckResult`'s ok form gains `composites?: Array<{ region: number; rect: Rect }>`, and `settleComposition` copies the rect into the stamp's `composites` entry (with the source from its third argument).
- **Stamp:** `composites[].rect` and the FR-06 invariants (required, inside the canvas, 16:10 within 5%, no text-region intersection).
- **Mock seams:** under `MOCK_PUPPETEER`/`MOCK_AI` the grid has a flat screen exactly on the region and a dark surround, so the existing sentinels keep their meaning; `__MOCK_HERO_SCREEN__` makes the seed patch textured (still `composite-not-blank`); a new `__MOCK_HERO_SCREEN_OFFSET__` moves the flat screen within the margin, so the stamp's rect differs from the region (for the Group B E2E).
- **Probe and runner:** the probe response adds `rect`. `run-look-check.mjs --probe --recheck` re-runs the shipped detector on each saved render (no network, no image call: it decodes the PNG and runs the same grid and detector in Node via the compiled module or a small `tsx` entry), writes `recheck` into each result, and prints a verdict page path with the detected rect drawn on each render.
- **Group B:** T8 inserts at the stamped rect; T9's re-render paths read it from the stamp.

## 20. Grounding sources

- `CLAUDE.md`: "**A prompt rule is not an invariant.** 'No commentary' is a request; the parse boundary is the only place that can enforce it." This drives code-owned placement (decision 2).
- `CLAUDE.md` 028 note: "a retired look … stays in the dataset … **The version rule:** a released version … is never edited". This gives a new key rather than `product-showcase` v3.
- `CLAUDE.md` gotchas: "**Never run a prisma or DB command without an explicit `DATABASE_URL`**". This sets the task rules for the migration.
- `src/lib/storage/minio.ts:33-38`: "EXPORTS bucket is intentionally NOT here — final PNGs stay private and are signed per read". This is the private-object precedent for screenshots.
