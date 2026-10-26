# Design: Image looks (027b)

**Change:** 028-image-looks
**Created:** 2026-10-25
**Spec:** [`spec.md`](spec.md) · **Proposal:** [`proposal.md`](proposal.md) (binding where it is specific) · **Panel:** [`party-report.md`](party-report.md)

Read at HEAD `4053cfe` on 2026-10-25.

## 1. Technical approach

009's one idea still holds: **the layout contract is data, and every reader uses the one copy.** This change adds rows to that data and makes three small code changes so the new rows are safe:

1. a validator, so a bad row fails at load and in a test (`designData/validate.ts`);
2. two optional fields: `Region.use` (which band holds what, for Spotlight) and `Contract.variantOf` (validation only);
3. the resolver's `retired-classic` note, and the wizard's STORY literals replaced by the data the picker already reads.

Nothing in the generation pipeline changes shape. `planComposition` reads the current version, the art-director and design prompts read the plan's contract, the sampler samples every region, `evaluateRegions` checks every region, the layout observation compares every box to every text region, and `settleComposition` stamps the version that ran. Unattended runs stay classic in the resolver.

The second half is tooling: a fixture set that proves the check discriminates for every contract, and a capped runner for the one real-image check that gates the default moves.

```
composition.ts (rows) ──► validate.ts (load-time + unit)        lookFixtureTable.ts (pure) ──► lookFixtures.ts ──► look-fixtures.test.ts (Chromium)
        │                                                            └──► lookFixtureCompleteness.test.ts (unit)
        ├──► imageStyleOptions ──► wizard picker, resolvePostStyle (interactive: any look, any declared size; unattended: classic)
        ├──► planComposition ──► art-director ──► image ──► sampler ──► evaluateRegions ──► design ──► layout observation ──► stamp
        └──► contractAt (stamped version) ──► refine

scripts/look-check/run-look-check.mjs ──(HTTP, localhost only)──► local server ──► results.json + ledger.jsonl (committed after OP-028)
        └── lookCheck.mjs (pure: cap, ledger, refusals, verdicts) ◄── tests/unit/lookCheck.test.ts
                                                       results.json ◄── tests/unit/lookCheckResults.test.ts (T7) ──► postStyles versions[2]
```

## 2. The dataset (`src/lib/designData/composition.ts`)

### Types

```ts
export type ArchetypeKey = 'product-showcase' | 'editorial-split' | 'full-bleed-scene' | 'spotlight'
export interface Region {
  rect: Rect
  purpose: Purpose
  minAreaPct: number
  use?: string // what goes in this region, for the design and refine prompts (Spotlight only)
}
export interface Contract {
  role: 'hero'
  textTone: TextTone
  sizes: Partial<Record<AspectRatio, SizeContract>>
  variantOf?: { key: string; version: number } // a variant pins its base version; validation only
}
```

A v1 contract has neither optional field, so `JSON.stringify(archetypes[k].versions[1])` is unchanged and the pinned hashes (`tests/unit/designData.test.ts:98-102`) still match. The `region keys` test (`designData.test.ts:49-60`) changes to allow `use` as an optional fourth key.

### The header (the key rule)

The file header gains, in the words of `src/lib/postStyles/styles.ts:5-14`:

```
// THE LOOK KEY RULE (permanent):
//  - a look key is never renamed and never reused for a different meaning;
//  - a retired look (`status: 'retired'`) stays in this dataset and stays
//    resolvable for stamps, labels and refine; it is hidden from the picker;
//  - a variant is marked by `variantOf: { key, version }`, never parsed from
//    the hyphens in its key (validate.ts);
//  - a post-style version that names a retired look resolves to classic with
//    the note `retired-classic` (postStyles/resolve.ts).
// THE VERSION RULE: a released version is never edited. A change adds
// versions[n+1] and moves `current`. "Released" = the change that adds it is
// VERIFIED PASS. tests/unit/lookDataset.test.ts pins a hash per (key, version).
```

### The rows

Helpers: the existing `textRegion(x, y, w, h)` (`composition.ts:61-65`) plus `band(x, y, w, h, use)` which returns a text region with `use`. The four records, in this order (the picker's order is `Object.values`):

- `product-showcase`: `current: 2`; `versions[1]` unchanged; `versions[2] = { role, textTone: 'light', sizes: { SQUARE: <v1 SQUARE>, PORTRAIT: <v1 PORTRAIT>, STORY } }`. The SQUARE and PORTRAIT entries are written as literal copies, not references to the v1 objects (a shared object would be frozen once and is harmless, but literal copies keep each version readable on its own and make the deep-equal test meaningful).
- `editorial-split`: the same shape.
- `full-bleed-scene`: `current: 1`, `versions[1]` with the three sizes.
- `spotlight`: `current: 1`, `versions[1]` with two `band` regions per size.

The rects, subjects, labels and summaries are spec FR-02 verbatim.

### Lookups

`getArchetype`, `isActiveKey`, `contractAt`, `contractVersionOf`, `styleLabel`, `IMAGE_STYLES` and `imageStyleOptions` (`composition.ts:124-186`) are unchanged. One helper is added for the wizard:

```ts
// True when the look's current contract declares the size (classic always).
export function supportsSize(
  key: string,
  size: AspectRatio,
  source: ArchetypeMap = archetypes,
): boolean
```

It is `imageStyleOptions(size, source).find((o) => o.key === key)?.supported ?? false`, so the picker and the wizard can never disagree.

## 3. Region math for STORY

The cover fit (`regions.ts:22-26`) needs no change. Worked case for the provider's STORY image (`imageCapabilities.ts:60`): a `1024x1536` image on a `1080x1920` canvas: `scale = max(1080/1024, 1920/1536) = max(1.0547, 1.25) = 1.25`; scaled `1280 x 1920`; `offset = (-100, 0)`. The image's left and right 80 px (100 canvas px) are cropped; no row is cropped. A full-width band `{0, 65, 100, 35}` is canvas `0..1080 x 1248..1920`, which maps to image `x 80..944, y 998.4..1536`. Every STORY region in FR-02 is full width, so the crop only trims the sides of each band. A unit case in `designRegions.test.ts` pins this mapping.

Gemini returns a native `9:16` image (`imageCapabilities.ts:61`), so its cover fit is the identity up to rounding.

## 4. Validation (`src/lib/designData/validate.ts`, new)

```ts
export const VARIANT_SUFFIXES = ['light'] as const
export const LOOK_KEY_PATTERN = /^[a-z]+(-[a-z]+)*$/
export function lookDatasetProblems(source: ArchetypeMap): string[]
```

One message per violation, each naming the key, version and size where it applies (`spotlight@1:STORY: no text region`). The rules are spec FR-03 1 to 6. Details:

- **Variant regions.** For each size of a variant version, `JSON.stringify(variant.sizes[s].regions) === JSON.stringify(base.versions[v].sizes[s].regions)`; a size the base version lacks is a problem.
- **Prefix rule.** For every ordered pair of keys `(a, b)` with `b.startsWith(a + '-')`, every version of `b` must carry `variantOf.key === a`. On the shipped dataset no key is a prefix of another.
- **Run at load.** `designData/index.ts` imports it and, when `process.env.NODE_ENV !== 'production'`, throws `design data: <problems>` if the list is not empty (the `styles.ts:351-354` pattern). Production never throws at import; the unit test is the gate.

Purity: type-only imports from `./composition`; no other import. `designData.test.ts`'s "finds the eight module files" becomes nine.

## 5. The resolver (`src/lib/postStyles/resolve.ts`)

```ts
export type ResolveNote =
  | 'default-unavailable'
  | 'unattended-classic'
  | 'path-a-classic'
  | 'size-classic'
  | 'campaign-tone-ignored'
  | 'retired-classic'

export function resolvePostStyle(
  input: ResolveInput,
  source?: Readonly<Record<string, PostStyle>>,
  looks?: ArchetypeMap, // tests only: a fixture look dataset
): ResolveResult
```

The image-style block (`resolve.ts:89-106`) becomes, in order:

```
if imageStyle !== 'classic':
  if UNATTENDED.has(surface)               -> classic, 'unattended-classic'   (unchanged)
  else if path === 'A'                     -> classic, 'path-a-classic'       (unchanged)
  else if getArchetype(key, looks)?.status === 'retired' -> classic, 'retired-classic'   (new)
  else if no option for key                -> classic, 'default-unavailable'  (unchanged)
  else if !option.supported                -> classic, 'size-classic'         (unchanged)
```

`imageStyleOptions(aspectRatio, looks)` and `getArchetype(key, looks)` take the injected dataset; production passes nothing.

`defaultImageStyleProblems` (`styles.ts:338-350`) checks `k === 'classic' || getArchetype(k) !== null` (any status) and its message reads "is not classic or a look in the dataset". Its unit test gains a retired-look fixture that passes the check and a missing key that fails it.

**Readers of the notes.** `grep -rn "\.notes\|ResolveNote" src` lists only `postStyles/resolve.ts` and its index re-export at `4053cfe`. The wizard uses `imageStyle` and `imageStyleFromStyle`, not notes. So the new note needs no reader change; tests read it.

## 6. The wizard

- **`src/lib/brief/wizardStyleState.ts`** gains:

  ```ts
  // The image style to keep after a size change: the current pick if the new
  // size supports it, else classic (and the pick is dropped, untouched).
  export function styleAfterSizeChange(
    imageStyle: string,
    size: AspectRatio,
    looks?: ArchetypeMap,
  ): { imageStyle: string; reset: boolean }
  ```

- **`useBriefWizard.ts:194-199`.** `setAspectRatio(ratio)` calls it with the current `imageStyleValue` and calls `resetImageStyle()` when `reset` is true. The `ratio === 'STORY'` literal goes.
- **`useBriefWizard.ts:398-399`.** The stored image style is classic when `p.designMode === 'TEMPLATE'` or `!supportsSize(resumeImageStyle(p.imageStyle), p.aspectRatio)`; else `resumeImageStyle(p.imageStyle)`.
- **`ReviewStep.tsx:100`** and the comments in `briefs/route.ts:113, :243-244` and `brief/imageStyle.ts:9`: wording only (spec FR-06).
- **`SizeDesignStep.tsx`** is unchanged: it already maps `imageStyleOptions(aspectRatio)`.

## 7. Prompts (`src/lib/designData/promptText.ts`)

A region with no `use` renders exactly as today in both builders:

- `designContractText`: each text region line is `- <where> (<px>)` then `: <use>` when set. Spotlight SQUARE reads:

  ```
  - the top 24% of the frame, full width (x 0 to 1080, y 0 to 259): the headline
  - the bottom 24% of the frame, full width (x 0 to 1080, y 821 to 1080): the call to action and the logo
  ```

- `refineContractText`: each text region is `<where>` then ` (<use>)` when set, joined by `; ` as today.
- `imageContractText`: unchanged (the image prompt describes where the image must be calm, not what text goes there).

Golden strings for the 8 new contracts go in `heroPrompts.test.ts`; the existing v1 and classic goldens must pass untouched (NFR-05). `PROMPT_VERSION` is not changed (assumption A9).

## 8. Fixtures

### The table (`tests/render/lookFixtureTable.ts`, pure)

```ts
export type FixtureKind = 'pass' | 'busy' | 'contrast'
export type Backdrop = 'dark' | 'light'
export const INTENDED_BACKDROP: Record<string, Backdrop> = {
  'product-showcase': 'dark',
  'editorial-split': 'dark',
  'full-bleed-scene': 'dark',
  spotlight: 'dark',
}
export interface FixtureSpec {
  id: string /* key@version:size */
  key: string
  version: number
  size: AspectRatio
  kind: FixtureKind
}
export function fixtureId(key: string, version: number, size: AspectRatio): string
export const LOOK_FIXTURES: readonly FixtureSpec[] // the 36 entries, written out, not generated
export function fixtureCompletenessProblems(
  source: ArchetypeMap,
  table: readonly FixtureSpec[],
): string[]
```

`LOOK_FIXTURES` is written as a literal list (36 rows), not generated from the dataset, so a new size in the dataset without new rows fails `fixtureCompletenessProblems`. `INTENDED_BACKDROP` is a literal and is never derived from `textTone`.

### The images (`tests/render/lookFixtures.ts`)

```ts
export async function lookFixture(spec: FixtureSpec, source = archetypes): Promise<string> // a data: URL
```

1. Image size: SQUARE `1024x1024`; PORTRAIT and STORY `1024x1536` (the OpenAI sizes, `imageCapabilities.ts:60`). Canvas from `ASPECT_DIMENSIONS`.
2. For each text region of the contract, `mapRegionToImage(rect, canvas, img)` gives the image-px rect.
3. Paint with absolutely positioned divs in a page rasterized at half size through `renderHtmlToPng` (the `heroFixtures.ts:29-35` method):
   - base layer: `STRIPES` (`heroFixtures.ts:39`) over the whole image;
   - backdrop layer for every text region, expanded by 1% of the canvas on each side (clipped to the image): `CALM` for `dark`, `#f2f2f2` for `light`;
   - `busy`: `STRIPES` inside the **last** text region, inset by 1% so no backdrop edge blends in;
   - `contrast`: `#808080` inside the **first** text region, expanded like the backdrop. (For a `light` backdrop the contrast colour would be `#333333`; no shipped look needs it, but the function handles both so the tone agreement test is meaningful.)

`heroFixtures.ts` gains `STORY` in `Shape`, `IMAGE_PX` (`1024x1536`) and `CANVAS` (`1080x1920`), and exports `CALM` and `STRIPES`.

### The render test (`tests/render/look-fixtures.test.ts`)

`describe.each(LOOK_FIXTURES)` with one `it` per fixture: rasterize, `sampleRegionLuminance(url, regions, canvas)`, `evaluateRegions(samples, regions, contract.textTone)`, then the expectation of spec FR-08, including `region` equal to the expected region. The suite throws if `MOCK_PUPPETEER` is on (the existing harness rule). 36 cases; render total 47 → 83.

### The unit tests (`tests/unit/lookFixtureCompleteness.test.ts`)

- `fixtureCompletenessProblems(archetypes, LOOK_FIXTURES)` is `[]`;
- with a fixture dataset that adds a size, the function names the missing ids;
- for each look, `INTENDED_BACKDROP[key] === 'dark'` exactly when `archetypes[key].versions[current].textTone === 'light'`.

## 9. The real-image check runner (`scripts/look-check/`)

### `lookCheck.mjs` (pure; no fs, no network, no prisma)

```js
export const SLOTS = [
  { slot: 'product-showcase:STORY', key: 'product-showcase', size: 'STORY', postStyle: 'launch' },
  { slot: 'editorial-split:STORY',  key: 'editorial-split',  size: 'STORY', postStyle: 'announcement' },
  { slot: 'full-bleed-scene:SQUARE',   key: 'full-bleed-scene', size: 'SQUARE',   postStyle: 'event' },
  { slot: 'full-bleed-scene:PORTRAIT', key: 'full-bleed-scene', size: 'PORTRAIT', postStyle: 'hiring' },
  { slot: 'full-bleed-scene:STORY',    key: 'full-bleed-scene', size: 'STORY',    postStyle: 'event' },
  { slot: 'spotlight:SQUARE',   key: 'spotlight', size: 'SQUARE',   postStyle: 'promotion' },
  { slot: 'spotlight:PORTRAIT', key: 'spotlight', size: 'PORTRAIT', postStyle: 'milestone' },
  { slot: 'spotlight:STORY',    key: 'spotlight', size: 'STORY',    postStyle: 'promotion' },
]
export const MAX_ATTEMPTS_PER_SLOT = 2
export function capFor(slots)                       // 2 * slots.length
export function parseLedger(text)                   // JSONL -> entries; a malformed line is an attempt too (counted, never dropped)
export function attemptsFor(entries, slot)
export function lastResult(results, slot)
export function slotPassed(result)                  // result?.styleKept === true && result?.accepted === true
export function planNext(entries, results, slot, cap)
  // -> { ok: true, attempt } | { ok: false, reason: 'cap' | 'max-attempts' | 'already-passed' | 'awaiting-verdict' }
export function lookVerdicts(results, slots = SLOTS) // -> { [key]: { passed: boolean, slots: { [slot]: 'pass'|'fail'|'pending'|'not-run' } } }
export function totalLine(n, cap)                   // "[look-check] call 3 of 16"
export function checkBase(url)                      // -> { ok: true } | { ok: false, error } ; localhost / 127.0.0.1, http only
export function parseVerdictArg(s)                  // "spotlight:SQUARE=accept" -> { slot, accepted: true }
```

Rules in `planNext`, in order: total ledger entries `>= cap` is `cap`; attempts for the slot `>= 2` is `max-attempts`; a slot whose last result passed is `already-passed`; a slot with a last result whose `accepted` is `null` (and `styleKept` is true) is `awaiting-verdict`; else ok with `attempt = attempts + 1`. A first run has no result, so it is ok. A last result that did not keep its style needs no verdict to be re-run.

### `run-look-check.mjs` (the I/O)

```
node scripts/look-check/run-look-check.mjs --base http://localhost:3002 --out <dir> [--only <slot> ...] [--dry-run]
node scripts/look-check/run-look-check.mjs --out <dir> --verdict <slot>=accept|reject
env: LOOK_CHECK_USERNAME, LOOK_CHECK_PASSWORD, LOOK_CHECK_TEAM, LOOK_CHECK_KIT   (required for a run; not for --verdict or --dry-run)
```

1. `checkBase(--base)`; refuse (exit 1) on failure. Missing env: exit 2.
2. Read `<out>/ledger.jsonl` and `<out>/results.json` (absent = empty). If the ledger is at the cap, print the total and exit 3 before signing in.
3. Sign in, set the active team (the OP-1 calls, `run-op1.mjs:92-95`).
4. For each requested slot (all 8 by default), one at a time: `planNext`; on a refusal print the reason and skip. Otherwise **`appendFileSync(ledger, line + '\n')`** with `{ at, runId, slot, attempt }`, print `totalLine`, then `POST /api/briefs` (topic and description from the slot's brief, `designMode: 'GENERATE'`, `aspectRatio`, `imageStyle`, `postStyle`, `channels`, `brandKitId`), `POST /api/generate/assemble-b`, poll `GET /api/drafts/:id` every 10 s up to 20 min (`run-op1.mjs:69-76`), download the export PNG to `<out>/renders/`, and append the result entry to `results.json` (rewritten whole after each slot). A thrown error or a timeout writes a result with `error` and `styleKept: false`.
5. `--verdict`: set `accepted` on the slot's last result; no network.
6. `--dry-run`: print the slots with their `planNext` answers, the cap and the ledger total; no network.

### The briefs (one per slot, in `run-look-check.mjs`)

Each brief is a realistic Bistec or Hearts Academy post of the slot's post style, with no invented date, price or number (so 027's facts check stays clear), and a description that says what the post is for. The task writes the eight texts and the reviewer checks them against the post styles. Example: `full-bleed-scene:SQUARE`, Event: "Meet Bistec Global at a Colombo technology meetup", "Invite engineers to meet the Bistec Global team at a technology meetup in Colombo to talk about cloud projects and careers. Do not invent a date or venue. Call to action: say hello at the event."

### Result entry

```json
{
  "slot": "spotlight:SQUARE",
  "key": "spotlight",
  "size": "SQUARE",
  "attempt": 1,
  "runId": "…",
  "briefId": "…",
  "draftId": "…",
  "render": "spotlight_SQUARE_1.png",
  "requestedArchetype": "spotlight",
  "appliedArchetype": "spotlight",
  "contractVersion": 1,
  "styleKept": true,
  "fallbackReason": null,
  "observations": [],
  "error": null,
  "accepted": null
}
```

`render` names the PNG in `<out>/renders/`; the PNGs are not committed (they were about 45 MB for OP-1). The committed directory is `.specclaw/changes/028-image-looks/look-check/` with `ledger.jsonl` and `results.json`; `renders/` is listed in that directory's `.gitignore`.

## 10. E2E §AF (`tests/e2e/image-looks.test.ts`)

The cases are spec "Mock E2E plan". Helpers copied from `hero-image.test.ts` (`generate`, the stamp builders) with `KEPT(key)` reading the expected version from the dataset (`archetypes[key].current`) rather than a literal. TC-LOOK-11 seeds a queue entry through the campaign queue API and runs `POST /api/test/generation-tick` as §AE does. TC-LOOK-12 writes the v1 stamp with the test DB helper (`tests/helpers/db`), skipped without DB access as TC-HERO-10 is. TC-LOOK-10 creates every `waitForResponse` before the click that triggers it (the 023 TC-HB-01 lesson).

Existing suites that change:

- `hero-image.test.ts`: `KEPT` (`:135`) reads the current version; TC-HERO-09 (`:272-282`) becomes "a look at 9:16 is kept with v2"; TC-HERO-12's STORY line (`:356`) is unchanged (accepted); TC-HERO-13 (`:439-470`) asserts the cards are enabled at 9:16 and a pick is kept.
- `post-styles.test.ts`: TC-PS-31 (`:780-810`) and the Review case at `:841-846`: at 9:16, Launch reads Product showcase (from the post style); Path A still reads Classic.

Unit tests that encode "STORY unsupported" or a literal v1 kept version and change with T1 or T2: `designData.test.ts` (`:26-29`, `:62-74`, `:140-150`), `compositionPlan.test.ts` (`:59-65`, `:140`), `heroSeams.test.ts` (`:551` and the layout-box case), `postStylesResolve.test.ts` (`:171-174`), `postStylesWizard.test.ts` (`:53-56`), `briefImageStyle.test.ts` (`:38`, wording). Each `unsupported-size` or `size-classic` case moves to a fixture look dataset; none is deleted.

## 11. T7: post-style versions[2] (after OP-028)

- `src/lib/postStyles/styles.ts`: for each moved style, `current: 2` and `versions[2] = { ...v1 fields, defaultImageStyle: '<look>' }`, written as a literal copy (same checklist objects' content, same rule ids).
- `tests/unit/postStylesDataset.test.ts`: the new hashes in `COMMITTED_HASHES`; the rule-id test becomes per version, plus "an id seen in two versions of one style has the same scope, text and check"; the `ids.size` total changes to a count of distinct ids, which stays 26.
- `tests/unit/lookCheckResults.test.ts` (new): reads `.specclaw/changes/028-image-looks/look-check/results.json`, runs `lookVerdicts` (imported from `scripts/look-check/lookCheck.mjs`), and for every post-style version with `n >= 2` whose `defaultImageStyle` is `full-bleed-scene` or `spotlight`, asserts the look passed. For each passing slot it also asserts `contractAt(key, result.contractVersion, size)` deep-equals `contractAt(key, current, size)`. A doctored copy (a slot set to `accepted: false`) makes the check fail.
- E2E: one case added to §AF for each moved style (wizard pre-fill at SQUARE and 9:16; a queue entry still classic).
- Docs: the handoff 028 section's verdicts and moved defaults; the release note (the wizard now pre-fills the look for those styles); CLAUDE.md.

## 12. File changes map

| File                                                                                                                                                                                                                    | Action | Description                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| `src/lib/designData/composition.ts`                                                                                                                                                                                     | Modify | key rule header, types (`ArchetypeKey`, `use`, `variantOf`), v2 of two looks, two new looks, `supportsSize` |
| `src/lib/designData/validate.ts`                                                                                                                                                                                        | Create | `lookDatasetProblems`, `VARIANT_SUFFIXES`, `LOOK_KEY_PATTERN`                                               |
| `src/lib/designData/index.ts`                                                                                                                                                                                           | Modify | re-export `validate`, the load-time assertion                                                               |
| `src/lib/designData/promptText.ts`                                                                                                                                                                                      | Modify | region `use` in the design and refine text                                                                  |
| `src/lib/postStyles/resolve.ts`                                                                                                                                                                                         | Modify | `retired-classic`, the `looks` test parameter                                                               |
| `src/lib/postStyles/styles.ts`                                                                                                                                                                                          | Modify | `defaultImageStyleProblems` accepts any dataset key; T7: `versions[2]` of the moved styles                  |
| `src/lib/brief/wizardStyleState.ts`                                                                                                                                                                                     | Modify | `styleAfterSizeChange`                                                                                      |
| `src/components/brief/useBriefWizard.ts`, `ReviewStep.tsx`                                                                                                                                                              | Modify | STORY literals out (FR-06)                                                                                  |
| `src/lib/brief/imageStyle.ts`, `src/app/api/briefs/route.ts`                                                                                                                                                            | Modify | comments only                                                                                               |
| `src/lib/testHooks.ts`                                                                                                                                                                                                  | Modify | `mockLayoutBoxes` outside-cell search                                                                       |
| `tests/render/heroFixtures.ts`                                                                                                                                                                                          | Modify | STORY shape; export `CALM`, `STRIPES`                                                                       |
| `tests/render/{lookFixtureTable,lookFixtures,look-fixtures.test}.ts`                                                                                                                                                    | Create | the fixture set (section 8)                                                                                 |
| `tests/unit/{lookDataset,lookFixtureCompleteness,lookCheck}.test.ts`                                                                                                                                                    | Create | validation, hashes, key list; completeness and tone; the runner's logic                                     |
| `tests/unit/{designData,compositionPlan,heroSeams,heroPrompts,designRegions,postStylesResolve,postStylesWizard,postStylesDataset,briefImageStyle,compositionNotice,background,refinePrompt,designDataBoundary}.test.ts` | Modify | adapt and extend (section 10)                                                                               |
| `tests/e2e/image-looks.test.ts`                                                                                                                                                                                         | Create | §AF                                                                                                         |
| `tests/e2e/{hero-image,post-styles}.test.ts`                                                                                                                                                                            | Modify | the STORY and version assertions                                                                            |
| `scripts/look-check/{lookCheck,run-look-check}.mjs`                                                                                                                                                                     | Create | the runner (section 9)                                                                                      |
| `.specclaw/changes/028-image-looks/look-check/{.gitignore,ledger.jsonl,results.json}`                                                                                                                                   | Create | OP-028 output (the `.gitignore` in T5; the other two by the operator run)                                   |
| `tests/unit/lookCheckResults.test.ts`                                                                                                                                                                                   | Create | T7: defaults tied to results                                                                                |
| `docs/handoff.md`, `docs/e2e-test-plan.md`, `CLAUDE.md`, `.specclaw/ROADMAP.md`                                                                                                                                         | Modify | docs                                                                                                        |

## 13. Data model and API changes

- **Data model: none.** `Brief.imageStyle` is `String @default("classic")` (`prisma/schema.prisma:517`), plain TEXT validated in code; the composition stamp is `Json?` on `Draft` (`:609`) and `DraftRevision` (`:833`), and its `contractVersion` is any positive integer (`stamp.ts:26`). New look keys and new versions need no column. No migration, no down script, no env var.
- **API: no shape change.** `POST /api/briefs` accepts the two new keys through the existing `validateImageStyle` (`imageStyle.ts:15-24`, it reads `isActiveKey`). `GET /api/drafts/[id]` returns the same `composition` and `compositionNotice`. MCP, ACP and the queue routes are untouched. The analytics `imageStyle` enum grows with the dataset (`catalogue.ts:34-37`); that is additive and needs no `schemaVersion` bump (006's rule for an imported vocabulary).

## 14. Key decisions

1. **Data first, code second.** The new looks are rows. The only new runtime code is the validator, the optional `use` text and one resolver note.
2. **Validation runs at load and in a test**, so a bad row can never reach a generation in dev or CI, and production never throws at import.
3. **`variantOf` is data with rules, not a grammar.** A variant pins its base version and must keep the base's regions; the prefix rule stops a future base key from silently turning an existing look into a "variant".
4. **The fixture table is a literal list with a declared backdrop.** Generating it from the dataset would let a new size or a wrong tone pass unnoticed.
5. **Spotlight's band roles live on the region (`use`)**, so the design prompt can say where the headline goes without a schema change and without touching v1's text.
6. **The runner's spend control is a file written before each call**, counted by a pure function, so a crash or restart can only over-count.
7. **Defaults move in a later task, tied to committed evidence by a test.** The main build verifies without OP-028; T7 cannot name a look that did not pass.
8. **Unattended stays exactly as it was.** No allow-list, no note, no branch, so there is nothing new to fail open.
9. **No `PROMPT_VERSION` bump** (A9): v1 and classic text is unchanged, and the stamp records the contract version.

## 15. Risks and mitigations

| Risk                                                                                              | Mitigation                                                                                                                           |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| A band over a real scene rarely passes the strict raw-image check, so Full-bleed falls back often | the subject wording asks for a plain dark foreground; OP-028 measures it; a failing look stays opt-in and moves no default           |
| The design model puts text outside the bands                                                      | the bands and their uses are in the design prompt; the layout observation records it and the draft notice shows it                   |
| Changing the mock layout box breaks §AA's TC-HERO-15                                              | the search returns a cell outside every text region of every contract (unit-tested); TC-HERO-15 asserts the observation, not the box |
| Existing tests encoded "STORY unsupported" and "v1"                                               | listed by file in section 10; `unsupported-size` and `size-classic` move to fixture datasets, never deleted                          |
| The OP-028 spend runs past the cap                                                                | ledger before each call, pure counter, refusal at 16 (FR-14, AC-15)                                                                  |
| Tuning after OP-028 edits a released version                                                      | NFR-04: after verify a change is a new version; T7's test compares contract content so unchanged sizes keep their renders            |
| 9:16 Launch and Announcement change at merge (A4)                                                 | interactive only; a failed check falls back; release note; the user can ask for the alternative                                      |
| Five cards crowd the picker at 390 px                                                             | screenshots at 390 px in T4 (AC-18); 027 already noted the post-style picker's height                                                |
| The shared databases                                                                              | no task runs a DB command; OP-028 runs on a scratch database (NFR-08)                                                                |

## 16. Grounding sources

**Code (read at `4053cfe`):** `src/lib/designData/{composition,evaluate,regions,layout,plan,promptText,stamp,index}.ts`; `src/lib/postStyles/{types,styles,resolve,stamp,promptText,index}.ts`; `src/lib/brief/{wizardStyleState,imageStyle,briefDraftPayload}.ts`; `src/components/brief/{useBriefWizard.ts,SizeDesignStep.tsx,ReviewStep.tsx,constants.ts}`; `src/app/api/briefs/route.ts`; `src/lib/drafts/compositionNotice.ts`; `src/lib/testHooks.ts:415-477`; `src/lib/analytics/{catalogue.ts:20-40,queries.ts:285-320}`; `src/lib/scheduler/generationRunner.ts:75-120`; `src/mcp/tools/generate.ts:60-90`; `src/providers/imageCapabilities.ts:55-65`; `src/lib/aspectRatio.ts`; `prisma/schema.prisma`.

**Tests:** `tests/render/{heroFixtures,hero-sampler.test,hero-layout.test,rasterize}.ts`; `tests/unit/{designData,evaluateRegions,heroSeams,postStylesDataset,postStylesResolve,postStylesWizard,briefImageStyle,compositionPlan,compositionNotice,pngDecode}.test.ts`; `tests/e2e/{hero-image,post-styles}.test.ts`; `vitest.config.ts`, `vitest.render.config.ts`, `eslint.config.mjs`, `tsconfig.json`.

**Tools and records:** `.specclaw/changes/009-hero-image-design/op1/{run-op1.mjs,picks.md,results-batch.json}`; `scripts/glyph-check/` and `scripts/purge-analytics.mjs` (the maintained-script precedents).

**Documents:** `CLAUDE.md` (Hero imagery (009), Post styles (027), Gotchas); `docs/handoff.md` (the pre-merge checklist); `docs/e2e-test-plan.md` (sections AA and AE); 009 and 027 `spec.md`, `design.md` and `tasks.md`; this change's `proposal.md` and `party-report.md`.
