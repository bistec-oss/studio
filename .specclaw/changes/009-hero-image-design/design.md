# Design: Hero imagery and product-showcase design (Phase 1, thin slice)

**Change:** 009-hero-image-design
**Created:** 2026-10-21
**Spec:** [`spec.md`](spec.md) · **Proposal:** [`proposal.md`](proposal.md) (binding where it is specific) · **Panel:** [`party-report.md`](party-report.md)

## 1. Technical approach

One idea: **the layout contract is data, and everything reads the one copy.** An archetype is a keyed, versioned record of regions (canvas percent) with a text tone. The image prompt, the design prompt, the pixel check, the layout observation, the refine prompt and the stamp are all generated from, or checked against, that record. Nothing the model returns can supply or move a region.

The pipeline for a non-classic brief (Path B only):

```
Brief.imageStyle ──► planComposition(style, size) ───────────────► classic plan  (unknown / unsupported)
                              │ hero plan                              │
                              ▼                                        │
 art-director (Haiku, INTERNAL_BACKGROUND): hero prompt  ──► decision {needed, prompt}  (closed schema)
                              ▼
 image provider (options.quality if IMAGE_QUALITY)  ──► data: URL ──► persist (public IMAGES bucket)
                              ▼
 sampler (Chromium, fixed timeout): luminance samples per region, through the cover-fit mapping
                              ▼
 evaluateRegions (pure): busy / contrast / region-invalid         any error ──► check-error
                              ▼ ok                                       ▼ fail
 design prompt: hero contract                                design prompt: CLASSIC, same image URL
                              ▼                                        ▼
 design agent ──► final HTML ──► layout observation (DOM, recorded only)   (no layout observation)
                              ▼
 settleComposition ──► composition stamp ──► Draft + DraftRevision (same writer as promptVersion/model)
```

Classic skips every box except the unchanged classic prompts and image call. The check is pixel-based and runs **before** the design call (seconds). The layout observation is geometry-based and runs **after** it, and only records.

## 2. Architecture: the `src/lib/designData/` module

Pure and client-safe: no prisma, minio, env, fs or puppeteer import (a guard test enforces it, AC-02). The wizard imports the option list from it.

```
src/lib/designData/
  index.ts        export const designData = { composition: { archetypes } }  + re-exports.
                  007 adds designData.typography / designData.kitRules beside composition.
  composition.ts  types (ArchetypeKey, Archetype, Contract, SizeContract, Region, TextTone),
                  the two archetype records, IMAGE_STYLES (the picker's source),
                  lookups: getArchetype, contractAt(key, version, size), isActiveKey, styleLabel.
  regions.ts      coverFit(), mapRegionToImage()                       (section 3)
  evaluate.ts     relativeLuminance(), lightness(), contrastRatio(), the threshold
                  constants, evaluateRegions()                          (section 4)
  layout.ts       evaluateLayout() (the pure box comparison)           (section 6)
  plan.ts         planComposition(), settleComposition(), CompositionPlan, HeroCheck types
  stamp.ts        CompositionStamp type + zod schema + invariants, parseCompositionStamp(),
                  classicStamp(), refineReplacedStamp(), the FALLBACK_REASONS vocabulary
  promptText.ts   describeRegion(), imageContractText(), designContractText(),
                  refineContractText(), PRECEDENCE_LINE    (all generated from the data)
```

### Dataset types

```ts
export type TextTone = 'light' | 'dark'
export type Purpose = 'text' | 'clear' // 'composite' arrives with Phase 2: a new literal, no schema change
export interface Region {
  rect: { x: number; y: number; w: number; h: number }
  purpose: Purpose
  minAreaPct: number
}
export interface SizeContract {
  regions: readonly Region[]
}
export interface Contract {
  role: 'hero'
  textTone: TextTone
  subject: string // what the image model is asked to draw (image prompt)
  sizes: Partial<Record<AspectRatio, SizeContract>> // an archetype declares only the sizes it supports
}
export interface Archetype {
  key: ArchetypeKey
  label: string
  summary: string
  status: 'active' | 'retired'
  current: number
  versions: Readonly<Record<number, Contract>> // immutable: deep-frozen at module load
}
```

`AspectRatio` comes from `@prisma/client` as a **type** only (as `aspectRatio.ts` does), so the module stays client-safe. `ArchetypeKey` is `string` in storage and `'product-showcase' | 'editorial-split'` in the dataset literal; lookups take `string`.

### The starting contracts (version 1, tuned on the T3 fixtures)

| Archetype          | Size       | Regions (canvas %)         | Tone  | Subject                                                                                                     |
| ------------------ | ---------- | -------------------------- | ----- | ----------------------------------------------------------------------------------------------------------- |
| `product-showcase` | `SQUARE`   | text `{0,0,45,100}` min 20 | light | a device or object as the hero subject in the right 55%, lit with depth                                     |
| `product-showcase` | `PORTRAIT` | text `{0,0,100,38}` min 20 | light | the same subject in the lower 62%                                                                           |
| `editorial-split`  | `SQUARE`   | text `{0,0,50,100}` min 20 | light | a photographic scene confined to the right 40%, fading softly into the flat area across the 50 to 60% strip |
| `editorial-split`  | `PORTRAIT` | text `{0,0,100,50}` min 20 | light | a photographic scene confined to the bottom 40%, fading across the 50 to 60% strip                          |

`STORY` is absent from both (unsupported). The PORTRAIT rows are stacked layouts, written on their own (the proposal's "not scaled copies"). Both archetypes are dark-area, light-text at version 1; a light-area variant is a later contract version. There is no `clear` region in version 1; the purpose exists because the dataset shape must hold the next archetype (`hero-centre` keeps two clear bands) without a schema change.

### Lookups and lifecycle

- `contractAt(key, version, size)` returns the exact immutable `SizeContract` (or `null`), for any key including a retired one. Refine uses it with the **stamped** version.
- `planComposition` resolves the **current** version of an **active** key. A change to a contract adds `versions[n+1]` and sets `current: n+1`; an existing version is never edited (a test deep-freezes and compares a hash of version 1 to a literal, so an accidental edit fails).
- `retire` is `status: 'retired'`. The picker lists active archetypes only (`IMAGE_STYLES`), and the API refuses a retired key at creation. A stored retired key resolves to classic at generation (`unknown-archetype`).

## 3. Region math: canvas percent to image pixels

The design prompt tells the model to paint the image as `background-size: cover; background-position: center` over the `W x H` canvas. The check assumes the same, so the mapping is the CSS cover fit:

```ts
coverFit(canvas: {w, h}, img: {w, h}) =>
  scale = max(canvas.w / img.w, canvas.h / img.h)
  scaled = { w: img.w * scale, h: img.h * scale }
  offset = { x: (canvas.w - scaled.w) / 2, y: (canvas.h - scaled.h) / 2 }      // <= 0

mapRegionToImage(rect: Rect, canvas, img): { px: Rect, areaPct: number } | null
  c = rect scaled to canvas px                       // rect% * canvas / 100
  v = c ∩ { x: offset.x, y: offset.y, w: scaled.w, h: scaled.h }   // the part of the canvas the image covers
  if (!finite || img.w <= 0 || img.h <= 0 || v.w <= 0 || v.h <= 0) return null
  px = { x: (v.x - offset.x) / scale, y: (v.y - offset.y) / scale, w: v.w / scale, h: v.h / scale }
  areaPct = v.w * v.h / (canvas.w * canvas.h) * 100
```

Worked case (AC-09): `1024x1536` on `1080x1350`: `scale = max(1.0547, 0.8789) = 1.0547`; scaled `1080 x 1620`; `offset.y = -135`. The left 45% region `{0,0,45,100}` is canvas `0..486 x 0..1350`, which maps to image `x 0..460.8, y 128.0..1408.0`: the top and bottom 128 image px are cropped off the canvas and are **not** sampled. Square `1024x1024` on `1080x1080`: scale `1.0547`, offset 0, no crop.

The function takes the **natural dimensions the page reports**, never a size the provider "should" have returned (Gemini's `4:5` is not `1024x1536`).

## 4. The pure check: `evaluateRegions`

```ts
export interface RegionSample { luminance: readonly number[]; areaPct: number }   // WCAG relative luminance 0..1
export type HeroVerdict =
  | { ok: true }
  | { ok: false; reason: 'busy' | 'contrast' | 'region-invalid'; region: Region }

evaluateRegions(
  sampled: ReadonlyArray<RegionSample | null>,   // index-aligned with regions; null = unresolved
  regions: ReadonlyArray<Region>,
  textTone: TextTone,
): HeroVerdict
```

Constants, exported and named (tests reference them):

| Constant                 | Value                                | Meaning                                              |
| ------------------------ | ------------------------------------ | ---------------------------------------------------- |
| `BUSY_STDDEV_MAX`        | `0.12`                               | busy when the std. deviation of `L*/100` is above it |
| `CONTRAST_MIN`           | `4.5`                                | WCAG ratio a sample must reach (text regions only)   |
| `CONTRAST_PASS_FRACTION` | `0.95`                               | the share of samples that must reach it              |
| `MIN_SAMPLES`            | `64`                                 | fewer usable samples is `region-invalid`             |
| `SAMPLE_GRID_MAX`        | `4000`                               | points per region (the sampler)                      |
| `TEXT_TONE_LUMINANCE`    | light `1`, dark `0.0056` (`#111111`) | the text colour's relative luminance                 |

- **Per region, in dataset order:** invalid (null, `areaPct < minAreaPct`, `< MIN_SAMPLES`) first; then busy; then, for `purpose: 'text'` only, contrast. The first failure returns.
- **`L*` for the busy rule:** `lightness(L) = L <= 0.008856 ? 9.033 L : 1.16 L^(1/3) - 0.16` (CIE `L*/100`). Correction 1 of the spec: in linear luminance a dark region cannot exceed a standard deviation of about 0.09, so the proposal's 0.12 would never fire. On `L*`, 0.12 is about 12 lightness units; it is the starting value, tuned in T3.
- **Contrast thresholds in luminance terms:** light text needs `L <= (1.05 / 4.5) - 0.05 = 0.183`; dark text (`0.0056`) needs `L >= 4.5 * 0.0556 - 0.05 = 0.200`. The test asserts both numbers.
- **Sampling points are point samples,** not an average: smoothing is off in the page (A3), so a textured region reads as textured.

## 5. The sampler (`src/lib/renderer/puppeteer.ts`)

```ts
export const HERO_CHECK_TIMEOUT_MS = 20_000
export class HeroCheckError extends Error {} // every failure of the sampler path
export async function sampleRegionLuminance(
  dataUrl: string,
  regions: ReadonlyArray<Region>,
  canvas: { width: number; height: number },
): Promise<Array<RegionSample | null>> // null for a region the mapping rejects
```

Steps, on a network-blocked page like `dimensionsOnce` (only `data:` and `about:blank` pass): reject a non-`data:` URL with `HeroCheckError`; `setContent` an empty document; `evaluate` to decode the image and return `naturalWidth/Height`; in Node map each region with `mapRegionToImage` (FR-07); `evaluate` again with the px rects: for each, pick a grid of at most `SAMPLE_GRID_MAX` points (`gw = round(sqrt(MAX * w/h))`, `gh = round(MAX / gw)`, each at most the rect's px size), `ctx.imageSmoothingEnabled = false`, `drawImage(img, sx, sy, sw, sh, 0, 0, gw, gh)`, `getImageData`; return flat `r,g,b,a` bytes. Node drops `alpha < 128` points and converts each to `relativeLuminance(r, g, b)` (the pure function, so the page carries no formula copy that could drift). The whole body runs under `Promise.race` with `HERO_CHECK_TIMEOUT_MS` and inside `limit(...)` (the renderer cap). Any throw, including the timeout, becomes `HeroCheckError`; the caller maps it to `check-error`.

**Mock.** Under `MOCK_PUPPETEER` the sampler returns calm synthetic samples for the regions (dark, `L = 0.02`, low variance), so a calm result passes `evaluateRegions` for tone `light`. The sentinel-driven busy, contrast and error cases are produced upstream (section 11), not inside the sampler.

## 6. The layout observation

**Pure** (`designData/layout.ts`): `evaluateLayout(boxes, textRegions, tolerancePct = 2) => { ok: true } | { ok: false; outside: number }`. `boxes` are canvas-percent rects; a box is inside when it lies fully within at least one `purpose: 'text'` region expanded by the tolerance on every side. No boxes is `ok`.

**In page** (`src/lib/renderer/layoutFacts.ts`, through `evaluateInRenderedPage`, the same load, viewport and egress allowlist as the export): returns canvas-pixel boxes for

- every **text node** with non-blank text whose parent is visible (`display`, `visibility`, `opacity`, non-zero size), by `Range.selectNodeContents(node).getBoundingClientRect()`: a tight box, not the block's width (correction 10);
- every `<img>` whose `src` is in the kit's logo URL set (`kit.logoUrl` plus its LOGO artifacts, passed in), by `getBoundingClientRect()`.

Not measured: the background image (its URL, and any element covering over 60% of the canvas), brief images, decoration, shadows, inline-SVG logos. Node converts the boxes to percent and calls `evaluateLayout`; `outside > 0` records `layout-violation`. Any measurement error records nothing and logs (an observation, not a gate).

**Mock.** Under `MOCK_PUPPETEER` the measurement is not run; the caller asks `mockLayoutBoxes(seamText, textRegions)` (section 11), which returns in-region boxes, or one box outside the regions for `__MOCK_HERO_LAYOUT__`, and feeds the real `evaluateLayout`.

**Where.** `runPathBDesign`, after the design result, only when the applied archetype is non-classic. It costs one more page load (about 1 to 2 s; bounded by `SET_CONTENT_TIMEOUT_MS`).

## 7. The stamp: a JSON column, chosen over columns

**Choice: one nullable `Json` column named `composition` on `Draft` and on `DraftRevision`** (the proposal's choice, and the right one):

|                                                                                                              | JSON column                                          | Columns                                                                                               |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| New columns                                                                                                  | 2 (one per table)                                    | 5 per table (requested, applied, version, reason, quality) plus an array for observations: 10 or more |
| A new fallback reason or observation (Phase 2 adds `composite`, a later change promotes the layout fallback) | a code change                                        | a code change, and an enum or a column                                                                |
| One stamp copied as a unit (restore, "Use anyway", inline edit carry)                                        | one field of `RenderStamp`                           | six fields in every spread and every `select`                                                         |
| Validation                                                                                                   | zod at write, tolerant parse at read                 | the database, for free                                                                                |
| Evidence counts                                                                                              | `composition->>'fallbackReason'`, enough for a count | plain `GROUP BY`                                                                                      |

The existing precedent for a vocabulary that grows is plain TEXT validated in code (`backgroundSkipReason`, with its own header explaining why). The weaker database-level check is paid for by `compositionStampSchema` with its invariants, run at every write (`revisionStampFields` / `draftStampFields` call `compositionStampSchema.parse`) and a **tolerant parse at read** (`parseCompositionStamp(raw): CompositionStamp | null`, null on failure, never a throw). The evidence query in section 9 runs fine on the JSON.

**Shape (binding):**

```ts
export const FALLBACK_REASONS = [
  'busy',
  'contrast',
  'region-invalid',
  'check-error',
  'no-image',
  'unknown-archetype',
  'unsupported-size',
  'refine-replaced-image',
] as const
export const OBSERVATIONS = ['layout-violation'] as const
export const IMAGE_QUALITIES = ['default', 'standard', 'high'] as const
interface CompositionStamp {
  requestedArchetype: string // 'classic' | a key
  appliedArchetype: string // 'classic' | a key
  contractVersion: number | null
  fallbackReason?: (typeof FALLBACK_REASONS)[number]
  observations?: (typeof OBSERVATIONS)[number][]
  imageQuality: (typeof IMAGE_QUALITIES)[number]
}
```

**Invariants** (`superRefine`, unit-tested): `appliedArchetype !== 'classic'` implies `contractVersion` is set, `fallbackReason` is absent and `requestedArchetype === appliedArchetype`; `appliedArchetype === 'classic'` implies `contractVersion` is null and no observations; `fallbackReason` is absent when both are classic.

**Writing it.** `RenderStamp` gains `composition: CompositionStamp | null`:

- `currentRenderStamp(model, composition)` takes it as a second argument (every caller passes it; no default, so a missed caller is a type error);
- `draftStampFields(stamp)` adds `composition: toJsonColumn(stamp.composition)`;
- a new `revisionStampFields(stamp)` returns the revision row's four existing fields plus `composition`, and replaces the five `...stamp` spreads (correction 7);
- `toJsonColumn(null)` is `Prisma.DbNull` (SQL NULL, not a JSON `null`), otherwise the validated object;
- `restoredRenderStamp(revision, rerendered)` returns `composition: parseCompositionStamp(revision.composition)`;
- `rejectedRenderStamp(draftId, revisionId)` selects and returns the row's `composition`;
- `commitDraftRevision` gains a required `composition: CompositionStamp | null` (ignored for an adopt, which uses the rejected row's). Inline edit and Override pass the draft's current stamp (`draftCompositionStamp(draft)`, beside `draftModelStamp`); the refine commit passes the carried stamp, or the `refine-replaced-image` stamp (section 8);
- `recordRejectedRender` carries the draft's current composition (its render is a refine of the current design).

**Where the stamp comes from.** `runPathBDesign` returns `composition: CompositionStamp` (from `settleComposition` plus the observation). `produceDesign` (Path B) puts it in `ProducedDesign.stamp`; Path A uses `classicStamp()`. `regenerate-design/route.ts` passes it to `currentRenderStamp`.

## 8. Prompts, and the fallback and co-change behaviour

### Prompt changes (`src/lib/agent/prompts/`)

All new text is generated from the dataset by `designData/promptText.ts`. `describeRegion(rect)` renders a rect as words: a rect with `x = 0, h = 100` is "the left W% of the frame, full height"; `x + w = 100, h = 100` "the right W%"; `y = 0, w = 100` "the top H%"; `y + h = 100, w = 100` "the bottom H%"; anything else "the area from X% to X+W% across and Y% to Y+H% down". Golden strings in `heroPrompts.test.ts`.

- **`prompts/background.ts`.** `buildBackgroundDecisionPrompt` gains an optional `hero?: { contract, label }`. When absent (classic), the output is byte-identical. When present: `IMAGE_PROMPT_RULES` is replaced by `HERO_IMAGE_RULES(contract)`: the subject (`contract.subject`), each region's measurement ("the left 45% of the frame, full height, must be an empty, calm, dark area with no detail"), the brand palette and mood line, "NO text, NO logos, NO letters or numbers", "keep it under 600 characters"; the "default to needed: true" paragraph is replaced by "the user chose the <label> style, so an image is required: answer needed: true"; and `PRECEDENCE_LINE` follows the brand context. `OUTPUT_PROTOCOL` is unchanged. `buildRefineBackgroundDecisionPrompt` is unchanged (a refine's image is not checked).
- **`prompts/pathB.ts`.** `buildPathBSystemPrompt` gains `composition?: { contract, label }` (present only when the archetype was **kept**). It replaces `backgroundLine` with a hero block: the URL, "full-canvas background, `background-size: cover; background-position: center`", the `text` regions in percent and in canvas pixels, "headline, body text and the logo go only inside these regions", the tone ("text colour: white" or "near-black #111111"), "no scrim or overlay: that is for the classic path only", and `PRECEDENCE_LINE`. With a hero image under a **fallback**, `composition` is absent and `backgroundLine` is the unchanged classic line (FR-10). `buildPathBUserMessage` gains `heroPrecedence?: boolean`; when set, the campaign-briefing header reads "(layout instructions in it yield to the image-style layout contract in the system prompt)".
- **`prompts/refine.ts`.** `RefinePromptOptions` gains `compositionContract?: { contract, label, version }`; both the CLI and the API prompt append `refineContractText(...)`: "This post uses the <label> layout (contract v<n>). Keep headline, body text and the logo inside: <regions>. Keep these regions of the background clear: <clear regions>." Absent for classic: byte-identical.
- **`PRECEDENCE_LINE`** (one constant): "When an image style is chosen, its layout contract below outranks any layout instruction in the brand voice prompt or the campaign briefing. The brand's colours, fonts, logo and wording rules still apply."
- **`PROMPT_VERSION`** in `shared.ts`: a new `YYYY-MM-DD.1` value (the build date; the example in the plan is `2026-10-22.1`) with a comment line: "hero image styles (009): the image-style contract in the art-director, Path B and refine prompts". Tests import the constant.

### The art-director's closed decision (`agent/background.ts`)

`decisionSchema` stays `z.object({ needed, prompt })`; zod's default object parsing strips unknown keys, so `archetype`, `safeArea`, `regions` and `role` are discarded (a test feeds them). In `runBackgroundStep`, for a hero plan the `needed` flag is ignored and an empty `prompt` returns `skip('NOT_NEEDED')`, which `settleComposition` reads as `no-image`.

### `agent/background.ts` and `agent/pathB.ts` wiring

- `generateBackgroundForBrief(brief, kit, headline, campaignBriefing, actor, hero?)`: `hero` is the plan's `{ contract, label, textTone }` for a hero plan, else undefined. `runBackgroundStep` gets `hero?` and `quality?` (from `env.IMAGE_QUALITY`, passed only when `hero` is set).
- After `generateImage` (one call, `options: { quality }` only for a hero plan with a tier set), the step persists the data URL as today, then, for a hero plan, runs `checkHero(dataUrl, hero, canvas, seamText)`: it obtains samples (the real sampler, or the mock seam when `mockSeam`), runs `evaluateRegions`, and maps a `HeroCheckError`, a timeout or any throw to `check-error`. The result variant becomes `{ url: string; quality?: ImageTier; check?: HeroCheckResult }` (`HeroCheckResult = { ok: true } | { ok: false; reason: 'busy' | 'contrast' | 'region-invalid' | 'check-error' }`). A skip variant is unchanged.
- `runPathBDesign` computes `plan = planComposition(...)`, calls the background step, `stamp = settleComposition(plan, background)`, builds the system prompt with `composition` only when `stamp.appliedArchetype !== 'classic'`, runs the design, then (applied non-classic only) the layout observation, and returns `{ ...result, backgroundImageUrl, background, composition: stampWithObservation }`.

### The fallback table (as built)

`settleComposition(plan, background)` (pure):

| Exit                                                                                      | `appliedArchetype` | `contractVersion` | `fallbackReason`    | Image / prompt                                                    |
| ----------------------------------------------------------------------------------------- | ------------------ | ----------------- | ------------------- | ----------------------------------------------------------------- |
| Hero plan, URL, `check.ok`                                                                | the key            | plan's version    | none                | hero image, hero prompt                                           |
| Hero plan, URL, `check.reason` busy / contrast / region-invalid / check-error             | `classic`          | null              | that reason         | the same image, **classic prompt**, no second image call          |
| Hero plan, URL, no `check` (cannot happen; fail closed)                                   | `classic`          | null              | `check-error`       | as above                                                          |
| Hero plan, no URL (no provider, provider error, empty prompt, `MOCK_AI` without the seam) | `classic`          | null              | `no-image`          | none; CSS/SVG; the existing background notice shows its own cause |
| Classic plan from an unknown or retired key                                               | `classic`          | null              | `unknown-archetype` | the normal classic image and prompt                               |
| Classic plan from an unsupported size                                                     | `classic`          | null              | `unsupported-size`  | the normal classic image and prompt                               |
| Classic plan, `imageStyle: 'classic'`                                                     | `classic`          | null              | none                | today's behaviour                                                 |

`requestedArchetype` is the brief's `imageStyle` in every row (`'classic'` for a classic request). `imageQuality` is the tier the provider reported (`background.quality`), else `default`.

### Refine and regenerate

- **Refine** (`refine/route.ts`). Read the draft's `composition` (the Draft mirror of the current revision's stamp), parse it. If `appliedArchetype !== 'classic'`, resolve `contractAt(applied, contractVersion, brief.aspectRatio)` and pass it to `buildRefineSystemPrompt`; a stamp that no longer resolves (cannot happen, versions are immutable) logs and omits the block. After the background pre-step: if `background.url` is non-null and the applied archetype was non-classic, the commit's stamp is `refineReplacedStamp(prev)` (`appliedArchetype: 'classic'`, `contractVersion: null`, `fallbackReason: 'refine-replaced-image'`, requested and quality kept); otherwise the commit carries `prev` unchanged. `recordRejectedRender` carries the same stamp the commit would (`commitStamp`: `refineReplacedStamp(prev)` when the background was replaced, else `prev`), so "Use anyway" adopts a stamp that describes the render (amended in build, T5). Override and inline edit carry the draft's current stamp.
- **Regenerate design** (`regenerate-design/route.ts`). It already calls `runPathBDesign`, which now re-resolves from `brief.imageStyle`. The route passes `result.composition` to `currentRenderStamp(model, result.composition)`, used for the revision row and the draft write. A retired key or a newer `contractVersion` is the recorded outcome.
- **Restore** (`restore/route.ts`) gets the row's own stamp through `restoredRenderStamp`; **"Use anyway"** through `rejectedRenderStamp`.

## 9. Data model, API and evidence

### Schema and migration

```prisma
model Brief          { ... imageStyle String @default("classic") ... }      // plain TEXT: a retired key needs no migration
model Draft          { ... composition Json? ... }                           // the composition stamp; null = before 009
model DraftRevision  { ... composition Json? ... }
```

`prisma/migrations/20261022120000_hero_composition/migration.sql` (hand-written, header in the 008 and 019 style):

```sql
ALTER TABLE "Brief" ADD COLUMN "imageStyle" TEXT NOT NULL DEFAULT 'classic';
ALTER TABLE "Draft" ADD COLUMN "composition" JSONB;
ALTER TABLE "DraftRevision" ADD COLUMN "composition" JSONB;
```

A constant default on `ADD COLUMN` is metadata-only in Postgres 11 and later: no table rewrite. The previous image's `brief.create` omits `imageStyle`, so the default applies, and it never reads the other two (the 008/019 additive guarantee). `prisma/rollback/009-hero-image-design.down.sql`: the 016 shape (manual header, three `DROP COLUMN IF EXISTS`, the L24 `DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261022120000_hero_composition'`). It states that it discards every stored style choice and every stamp.

The proof (T1) runs only on `bistec_studio_009_scratch`, created and dropped through `docker exec designer-postgres-1 psql -U bistec -d postgres` (`export MSYS_NO_PATHCONV=1` first), with an explicit `DATABASE_URL`: `migrate deploy`, the down script (`psql -v ON_ERROR_STOP=1`), `migrate deploy` again, then `prisma migrate diff --from-url ... --to-schema-datamodel prisma/schema.prisma --exit-code`, then `npx prisma generate`, `npx prisma validate` and `npm run test:upgrade`. `bistec_studio` is never touched.

### API

- `POST /api/briefs`: `imageStyle` (optional string). `validateImageStyle(raw, designMode)` is pure (`src/lib/brief/imageStyle.ts`): returns `{ ok: true, value }` or `{ ok: false, error }`; absent is `classic`; a non-string, an unknown or a retired key, and a non-classic style on `TEMPLATE` are 400s. The value is stored as given.
- `GET /api/drafts/[id]`: adds `composition: CompositionStamp | null` and `compositionNotice: { reason, message } | null` to `DraftDetail` (`src/lib/api-types.ts`). No other route changes shape. MCP, ACP and the scheduler are untouched.

### The evidence query (goes in the handoff, T6)

```sql
-- How often a non-classic request was kept, and why not. Run read-only against prod after OP-1.
SELECT "composition"->>'requestedArchetype' AS requested,
       "composition"->>'appliedArchetype'   AS applied,
       "composition"->>'fallbackReason'     AS reason,
       "composition"->>'imageQuality'       AS quality,
       ("composition"->'observations') ? 'layout-violation' AS layout_violation,
       count(*)
FROM "Draft"
WHERE "composition" IS NOT NULL AND "composition"->>'requestedArchetype' <> 'classic'
GROUP BY 1,2,3,4,5 ORDER BY count(*) DESC;
```

## 10. The draft notice and the wizard

- **`src/lib/drafts/compositionNotice.ts`** (pure): `compositionNoticeFor(stamp, label)` returns `{ reason, message } | null`. Wording (the label is the archetype's, so a retired key still has one; an unknown label reads "that image style"):
  - `busy`: "<Label> could not be used for this post (the image was too busy where the text goes), so the classic style was used."
  - `contrast`: "... (the image was not clear enough behind the text to keep it readable) ..."
  - `region-invalid`: "... (the text area could not be checked) ..."; `check-error`: "... (the image check could not run) ..."
  - `no-image`: "<Label> needs an image and none was made, so the classic style was used."
  - `unknown-archetype`: "That image style is no longer available, so the classic style was used."
  - `unsupported-size`: "<Label> is not available for the 9:16 size, so the classic style was used."
  - `refine-replaced-image`: "The new background replaced the <Label> image, so the classic style now applies."
  - observation `layout-violation`: "Some text or the logo sits outside the area <Label> reserves for it. The post is unchanged; check it before publishing."
  - Null for a null stamp, and for a classic request with no reason and no observation.
- **`src/components/drafts/CompositionNotice.tsx`** (new): the `Notice` atom, `tone="warning"`, `role="status"`, `data-testid="composition-notice"` and `data-reason`, a `LayoutTemplate` icon from `lucide-react` through `ICON`; no link. Placed beside `BackgroundNotice` in `drafts/[id]/page.tsx`. Amber, non-blocking, the same posture as the background notice; both can show (a `no-image` with a `NO_PROVIDER` skip).
- **The wizard.** `SizeDesignStep.tsx` gets an "Image style" section, shown when `designMode === 'GENERATE'`, using the same `cardCls` cards and `aria-pressed` pattern as Post Size, fed by `imageStyleOptions(aspectRatio)` from `designData` (`{ key, label, summary, supported }`; classic first). Unsupported cards are `disabled` with the line "Not available for the 9:16 size". `useBriefWizard.ts` holds `imageStyle`, resets it to `'classic'` on a switch to `STORY` or to Path A, sends it in the brief body only when it is not `classic`, and includes it in the autosave payload and the resume. `briefDraftPayload.ts` gains `imageStyle: z.string().max(40).optional()`. `ReviewStep.tsx` gets one row. Three files under `src/components/brief/` plus `useBriefWizard.ts` and `src/components/drafts/CompositionNotice.tsx` are the only `src/components/` files touched (AC-23).

## 11. Quality, mock seams and the budget

### Quality (`IMAGE_QUALITY`)

- `src/providers/imageCapabilities.ts` (pure, client-safe) gains `IMAGE_TIERS = ['standard', 'high']`, `type ImageTier`, `parseImageTier(raw): ImageTier | undefined` (trim, lower-case; unset, blank or unknown is `undefined`) and `openAiQuality(tier): 'medium' | 'high'`.
- `src/lib/env.ts`: `IMAGE_QUALITY: z.string().optional().transform(parseImageTier)`. An unknown value is treated as unset; it never fails the boot (it is a tuning knob, unlike `CLAUDE_CLI_MODEL`). `.env.example` documents it, with the OP-1 note.
- `ImageProvider.generateImage(prompt, brandKitId?, size?, options?: { quality?: ImageTier }): Promise<{ url: string; quality?: ImageTier }>`.
- `OpenAIImageProvider` adds `quality: openAiQuality(options.quality)` to `images.generate` only when a tier is passed, and returns `{ url, quality }`. `GeminiImageProvider` accepts and ignores it and returns `{ url }`. `mockImageProvider` keeps its signature and ignores the option.
- `runBackgroundStep` passes `{ quality: env.IMAGE_QUALITY }` only for a hero plan with a tier set; the classic call has no fourth argument (AC-13). `tools.ts` and `/api/generate/image` are unchanged.

### Mock seams (`src/lib/testHooks.ts`, all gated by `MOCK_AI`)

The existing `__MOCK_BG__` family is the master switch. Added sentinels, read from `backgroundSeamText(instruction, topic)`:

| Sentinel (with `__MOCK_BG__`)       | Effect                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------- |
| none                                | calm synthetic samples: the check passes                                    |
| `__MOCK_HERO_BUSY__`                | synthetic samples that alternate dark and light (high lightness variance)   |
| `__MOCK_HERO_CONTRAST__`            | flat mid-grey samples (`L = 0.4`; low variance, fails the light tone)       |
| `__MOCK_HERO_CHECK_ERROR__`         | the sample step throws a `HeroCheckError`                                   |
| `__MOCK_HERO_LAYOUT__`              | the layout boxes include one outside every text region                      |
| `__MOCK_BG_FAIL__` (existing)       | the provider throws: `no-image`                                             |
| `__MOCK_BG_NOT_NEEDED__` (existing) | `{ needed: false, prompt: '' }`: ignored for hero, empty prompt: `no-image` |

`mockRegionSamples(seamText, regions, textTone)` and `mockLayoutBoxes(seamText, textRegions)` return data that flows through the **real** `evaluateRegions` and the **real** `evaluateLayout`, so the E2E runs the pure logic, not a stub of its verdict. All are dormant outside `MOCK_AI` (a unit test sets `MOCK_AI` off and asserts every seam returns the "no seam" answer).

### The budget (`src/lib/models/budget.ts`)

`StepBudgets` gains `heroCheckMs: HERO_CHECK_TIMEOUT_MS` and `layoutMeasureMs: SET_CONTENT_TIMEOUT_MS + RENDER_ALLOWANCE_MS`, imported from where they are enforced. They are added to:

- "Async generation: captions saved to pre-design touch" (`[backgroundDecision, image, heroCheck]`);
- "Async generation: pre-design touch to finalize" (design, render, **layoutMeasure**, tx; API: design, tool tail, layoutMeasure, tx);
- "Regenerate design": the same two segments.

The scheduler and MCP rows are unchanged: their briefs are always classic, which skips both steps. Worst case adds 20 s and 90 s to segments with 60 s margin under 900 s; the unit gate decides, and T4 reports the numbers.

## 12. Test plan

### Unit (browser-free, `npm run test:unit`)

New files: `designData.test.ts` (invariants, frozen versions, purity guard), `compositionPlan.test.ts` (resolution, every table row, fail closed), `designRegions.test.ts` (mapping), `evaluateRegions.test.ts` (thresholds and edges), `layoutObservation.test.ts` (pure comparison), `compositionStamp.test.ts` (schema, invariants, tolerant parse, helpers), `heroPrompts.test.ts` (golden strings, the classic golden, precedence), `compositionNotice.test.ts`, `imageQuality.test.ts` (the parser, the OpenAI mapping, the option), `briefImageStyle.test.ts` (the validator). Extended: `background.test.ts` (closed decision, ignored `needed`, one image call, options, check wiring), `renderStamps.test.ts`, `draftRevisions.test.ts` (every writer carries the stamp, DbNull), `draftActionModels.test.ts` (regenerate), `refinePrompt.test.ts`, `prompts.test.ts`, `geminiImage.test.ts`, `toolGenerateImage.test.ts`, `briefDraftPayload.test.ts`, `testHooks.test.ts` (dormant seams), `actionBudget.test.ts`, `draftDetailGet.test.ts` (new fields). Existing cases are adapted for the new signatures, never deleted.

### Real render (`npm run test:render`, 15 baseline)

`tests/render/heroFixtures.ts` holds the fixture HTML (calm, busy stripes, low-contrast grey, a `1024x1536` image with busy content only in its cropped rows, a page with text and logos). `hero-sampler.test.ts` and `hero-layout.test.ts` add the `[real]` cases of AC-11 and AC-14. The suite throws if `MOCK_PUPPETEER` is on, as the harness already does. Thresholds are tuned here: if a calm fixture fails, change the **fixture or the constant with a recorded reason**, never the assertion's direction.

### E2E §AA (`tests/e2e/hero-image.test.ts`, mock mode; docs/e2e-test-plan.md gets the section)

| Case       | Covers                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TC-HERO-01 | a classic Path B brief: stamp requested and applied classic, `imageQuality: 'default'`, no notice                                                      |
| TC-HERO-02 | `product-showcase`, `SQUARE`, `__MOCK_BG__`: kept, `contractVersion` 1, `imageUrl` set, the same stamp on the draft and the v1 revision, no notice     |
| TC-HERO-03 | `editorial-split`, `PORTRAIT`: kept                                                                                                                    |
| TC-HERO-04 | `__MOCK_HERO_BUSY__`: classic, `busy`, notice shown, `imageUrl` still set (the hero image reused)                                                      |
| TC-HERO-05 | `__MOCK_HERO_CONTRAST__`: classic, `contrast`                                                                                                          |
| TC-HERO-06 | `__MOCK_HERO_CHECK_ERROR__`: classic, `check-error` (fail closed)                                                                                      |
| TC-HERO-07 | `__MOCK_BG_FAIL__`: `no-image`, the composition and the background notices both show                                                                   |
| TC-HERO-08 | `__MOCK_BG_NOT_NEEDED__` (empty prompt) with a hero style: `no-image`                                                                                  |
| TC-HERO-09 | `STORY` + a style through the API: accepted, `unsupported-size`, classic image path                                                                    |
| TC-HERO-10 | a retired key set in the test DB, then regenerate-design: new revision, `unknown-archetype`, v1 keeps its stamp                                        |
| TC-HERO-11 | refine on a kept draft: stamp carried; a refine whose instruction carries `__MOCK_BG__`: `refine-replaced-image`; refine on a classic draft: unchanged |
| TC-HERO-12 | `POST /api/briefs` validation: an unknown key, a `TEMPLATE` brief with a style, a non-string (400); absent stores `classic`                            |
| TC-HERO-13 | the wizard: picker on Path B only, the `STORY` disabled state and reset, the Review row, the request body, autosave and resume                         |
| TC-HERO-14 | restore to v1 copies v1's stamp; a legacy null stamp stays null                                                                                        |
| TC-HERO-15 | `__MOCK_HERO_LAYOUT__`: the archetype is **kept**, `observations: ['layout-violation']`, the notice shows                                              |
| TC-HERO-16 | the draft GET payload exposes `composition` and `compositionNotice`; an axe pass of `/drafts/[id]` with the notice shown                               |

Seeding uses the test DB helper (`tests/helpers/db`, which reads `.env.test` first), as the existing suites do. Each case that polls uses `waitForDraft` / `waitForAction`.

### Baselines and the gate

Unit 2706/2706, lint 0 errors / 7 warnings, full clean mock E2E 405/3/0/0 (023 T3), render 15/15 (6 `dom-facts` plus 9 `render-fidelity`). Every task that touches `src/` ends with its targeted E2E; the last task runs the full clean mock E2E.

## 13. File changes map

| File                                                                                                                                                        | Action          | Description                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------ |
| `prisma/schema.prisma`                                                                                                                                      | Modify          | `Brief.imageStyle`, `Draft.composition`, `DraftRevision.composition`                 |
| `prisma/migrations/20261022120000_hero_composition/migration.sql`                                                                                           | Create          | the three additive columns                                                           |
| `prisma/rollback/009-hero-image-design.down.sql`                                                                                                            | Create          | the manual down script (016 shape, L24)                                              |
| `src/lib/designData/{index,composition,regions,evaluate,layout,plan,stamp,promptText}.ts`                                                                   | Create          | the module (section 2)                                                               |
| `src/lib/renderer/puppeteer.ts`                                                                                                                             | Modify          | `sampleRegionLuminance`, `HERO_CHECK_TIMEOUT_MS`, `HeroCheckError`                   |
| `src/lib/renderer/layoutFacts.ts`                                                                                                                           | Create          | the in-page layout extraction and its mock branch                                    |
| `src/lib/agent/prompts/{background,pathB,refine,shared}.ts`                                                                                                 | Modify          | hero blocks, precedence, `PROMPT_VERSION`                                            |
| `src/lib/agent/background.ts`                                                                                                                               | Modify          | closed decision (hero), the check, `options.quality`, result variant                 |
| `src/lib/agent/pathB.ts`                                                                                                                                    | Modify          | plan, settle, hero prompt, layout observation, `composition` result                  |
| `src/lib/agent/generateDraft.ts`                                                                                                                            | Modify          | Path B stamp from the result, Path A `classicStamp()`                                |
| `src/lib/drafts/revisions.ts`                                                                                                                               | Modify          | `RenderStamp.composition`, `revisionStampFields`, carries, `commitDraftRevision` arg |
| `src/lib/drafts/compositionNotice.ts`                                                                                                                       | Create          | the pure notice                                                                      |
| `src/app/api/drafts/[id]/{route,refine/route,regenerate-design/route,inline-edit/route,revisions/[rev]/restore/route,rejected/[revisionId]/adopt/route}.ts` | Modify          | payload, stamp carry, contract block, re-stamp                                       |
| `src/app/api/briefs/route.ts`, `src/lib/brief/imageStyle.ts` (create)                                                                                       | Modify / Create | validation, storage                                                                  |
| `src/lib/brief/briefDraftPayload.ts`                                                                                                                        | Modify          | optional `imageStyle`                                                                |
| `src/components/brief/{SizeDesignStep,ReviewStep,useBriefWizard,types}`                                                                                     | Modify          | the picker, review row, state                                                        |
| `src/components/drafts/CompositionNotice.tsx`, `src/app/(app)/drafts/[id]/page.tsx`                                                                         | Create / Modify | the notice                                                                           |
| `src/lib/api-types.ts`                                                                                                                                      | Modify          | `DraftDetail.composition`, `compositionNotice`                                       |
| `src/providers/imageCapabilities.ts`, `interfaces/ImageProvider.ts`, `implementations/image/{openai,gemini}.ts`                                             | Modify          | tier, option, return type                                                            |
| `src/lib/env.ts`, `.env.example`                                                                                                                            | Modify          | `IMAGE_QUALITY`                                                                      |
| `src/lib/testHooks.ts`                                                                                                                                      | Modify          | the sentinel seams                                                                   |
| `src/lib/models/budget.ts`                                                                                                                                  | Modify          | the two step bounds                                                                  |
| `tests/unit/*` (10 new, about 18 extended), `tests/render/{heroFixtures,hero-sampler,hero-layout}.ts`, `tests/e2e/hero-image.test.ts`                       | Create / Modify | section 12                                                                           |
| `docs/e2e-test-plan.md`, `docs/handoff.md`, `CLAUDE.md`, `.specclaw/ROADMAP.md`                                                                             | Modify          | docs                                                                                 |

## 14. Key decisions

1. **The stamp is a JSON column** (section 7): two columns, one `RenderStamp` field, a vocabulary that grows without a migration, validated in code. The cost (no database-level check) is paid by the schema and the tolerant read.
2. **Regions live in the dataset and nowhere else.** The decision schema is closed; the sampler, the prompts and the stamp read one lookup. This answers the panel's one structural BLOCK and its security BLOCK together.
3. **The pixel check fails closed; the layout observation does not fall back.** Only an explicit pass keeps the archetype. The layout rule has no real-render data behind it and a fallback would cost a second design call, so it records `layout-violation` and shows a notice. The stamp is the evidence to promote it later. (This is the writer's call, flagged in the proposal.)
4. **The fallback reuses the hero image.** No second paid call, accepted cost: a busy subject under a scrim. OP-1 decides whether it is acceptable.
5. **The busy rule is on CIE lightness** (correction 1), because linear luminance cannot express "busy" inside a dark region.
6. **Contracts are versioned and immutable.** A change is a new version; a stamp always resolves; retiring stops selection only.
7. **Classic is untouched and proven so.** A golden test pins the classic prompt output, one image call without options, and no new steps.
8. **Quality is an operator env value, not a team setting.** No in-app permission is needed because there is no in-app control; the closed tier set is validated; the applied tier is stamped.
9. **No "auto".** The art-director never chooses an archetype; the person who requires "flashy" picks it.
10. **Prompts, check and stamp ship together (T4).** Nothing ships the hero prompt without the check and the record (the panel's security NOTE).

## 15. Risks and mitigations

| Risk                                                                                      | Mitigation                                                                                                               |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Thresholds too tight: the fallback fires on every post and looks like the feature working | tuned on T3 fixtures; the stamp, the notice and the evidence query make the rate visible; OP-1 step 5 reads it           |
| Thresholds too loose: a busy region passes                                                | the layout observation is a second, independent signal; the stamp keeps the numbers findable                             |
| Synthetic fixtures do not predict real model images                                       | stated as a limit (correction 5); OP-1 is the real test                                                                  |
| The design model ignores `cover` / `center` or the regions                                | the layout observation records text and logo outside the regions; the image placement itself is a known unverified limit |
| `high` quality exceeds the 120 s image bound or cost                                      | env-gated, off by default; a timeout is a recorded `no-image`; OP-1 step 6                                               |
| A stale `PROMPT_VERSION` consumer                                                         | tests import the constant; one grep in AC-08                                                                             |
| The five `...stamp` spreads miss one writer                                               | `currentRenderStamp` has no default for `composition`, so a missed caller is a type error; AC-15 lists every writer      |
| The shared databases                                                                      | NFR-03: explicit `DATABASE_URL` on the scratch or test database only                                                     |
| The sampler holds a renderer slot                                                         | one bounded page, 20 s timeout, same cap as renders; the budget models it                                                |
| Revert after use                                                                          | the stored `imageStyle` and stamps stay as inert data; the down script drops them; the previous image ignores them       |

## 16. Grounding sources

Read at HEAD `2ad7431` on 2026-10-21.

**Code (pointers re-derived):**

- `src/lib/agent/prompts/background.ts` (`IMAGE_PROMPT_RULES`, `OUTPUT_PROTOCOL`, both decision builders), `prompts/pathB.ts` (`backgroundLine`), `prompts/refine.ts`, `prompts/shared.ts` (`PROMPT_VERSION = '2026-10-11.1'`, `onImageHeadline`).
- `src/lib/agent/background.ts` (`decisionSchema`, `runBackgroundStep`, `generateBackgroundForBrief/Refine`), `src/lib/agent/pathB.ts` (`runPathBDesign`), `src/lib/agent/generateDraft.ts` (`produceDesign`, `finalizeDraftV1`).
- `src/lib/drafts/revisions.ts` (`RenderStamp`, `currentRenderStamp`, `draftStampFields`, `restoredRenderStamp`, `commitDraftRevision`, `rejectedRenderStamp`, `recordRejectedRender`, `restoreDraftToRevision`), `src/lib/drafts/backgroundNotice.ts`.
- `src/app/api/drafts/[id]/{route,refine/route,regenerate-design/route}.ts`, `src/app/api/briefs/route.ts`, `src/lib/api-types.ts` (`DraftDetail`).
- `src/lib/renderer/puppeteer.ts` (`sampleImageColors`, `dimensionsOnce`, `evaluateInRenderedPage`, `SET_CONTENT_TIMEOUT_MS`, `limit`), `src/lib/renderer/domFacts.ts` (the MOCK_PUPPETEER precedent).
- `src/providers/interfaces/ImageProvider.ts`, `implementations/image/{openai,gemini}.ts`, `imageCapabilities.ts` (`IMAGE_SIZES`, `IMAGE_GENERATION_TIMEOUT_MS`).
- `src/lib/aspectRatio.ts` (`ASPECT_DIMENSIONS`), `src/lib/testHooks.ts` (`shouldMockBackground`, `backgroundSeamText`, `mockBackgroundDecision`, `mockImageProvider`), `src/lib/env.ts`, `src/lib/models/budget.ts`.
- `src/components/brief/{SizeDesignStep,useBriefWizard,ReviewStep}.tsx`, `src/lib/brief/briefDraftPayload.ts`, `src/components/drafts/BackgroundNotice.tsx`, `src/components/ui/Notice.tsx`.
- `tests/render/{rasterize,render-fidelity.test,dom-facts.test}.ts` (15 cases), `vitest.render.config.ts`, `tests/unit/actionBudget.test.ts`, `scripts/test-upgrade-path.mjs`.
- `prisma/schema.prisma` (`Brief`, `Draft`, `DraftRevision`), `prisma/migrations/20261020120000_draft_action_claim_id`, `prisma/rollback/019-draft-action-claim-token.down.sql`.

**Documents:** `CLAUDE.md` (the 2026-08-03 lesson, the IRP Editorial Split rules, the gotchas), `docs/ui-reference/DESIGN_SYSTEM.md` and `tests/unit/uiTokenGuard.test.ts`, `docs/e2e-test-plan.md` (suite letters, seams), `.specclaw/changes/008-model-selection/design.md` and `019-draft-action-claim-token/{spec,tasks}.md` (style and the migration conventions), `proposal.md` and `party-report.md` of this change.

**External (checked 2026-10-21):** OpenAI image generation guide, `https://developers.openai.com/api/docs/guides/image-generation`: `quality` accepts `low`, `medium`, `high`, `auto` (and `xhigh`, `max` on two newer models); `gpt-image-2` is not named on the page; complex prompts may take up to two minutes. WCAG 2.x contrast ratio and relative luminance definitions (the `0.05` offsets and the `4.5:1` AA threshold) and CIE `L*` (the lightness formula) are standard; no live source was needed.
