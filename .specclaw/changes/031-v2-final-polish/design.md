# Design: v2 final polish before the merge to main

**Change:** 031-v2-final-polish · **Size:** architectural
**Created:** 2026-10-26
**Reads with:** `spec.md` (FR and AC numbers below refer to it), `proposal.md` (User Decisions), `wording-scan.md`.

## 1. Shape of the change

Eight groups, built in the order H → G → C → B → E → F → A → D, one task at a time. Each group stands on code that is already on `v2`. The new seams are:

| Group | New module or seam                                                                                                                                   | Existing code it plugs into                                                                                                                |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| H     | `discardOnLostClaim` (exported from `src/lib/drafts/revisions.ts`)                                                                                   | `commitDraftRevision`, `recordRejectedRender`, `regenerate-design/route.ts`; `spawnCwd` in `claudeCli.ts`                                  |
| G     | `DESIGN_SYSTEM.md` §12, `tests/unit/uiWordingGuard.test.ts`                                                                                          | the strings in W-01 to W-41                                                                                                                |
| C     | `src/providers/keyPrefix.ts`; `resolveImageProviderWithSource`                                                                                       | `registry.ts`, `background.ts`, `/api/me/openai-key`, `/team`, `admin/providers`                                                           |
| B     | `src/lib/fonts/{catalogue.json,catalogue.ts,url.ts,inject.ts,plan.ts,merge.ts}`, `GET /api/fonts`                                                    | kit routes, MCP brandkit tool, `systemContext.ts`, `pathA.ts`, `pathB.ts`, refine route, `renderPost`, `RenderStamp`                       |
| E     | `authoring/typography.ts`, three entries, `runRuleUpgrade`, `POST /api/campaigns/[id]/briefing/upgrade`                                              | `entries.ts`, `kitUpgrade/upgrade.ts`, `CampaignBriefingSection.tsx`                                                                       |
| F     | the new block grammars; `POST /api/admin/brandkits/[id]/assistant/apply`                                                                             | `briefingAssistant.ts`, `BriefingAssistantPanel.tsx`, `brandkit/assistant.ts`, `BrandKitAssistantPanel.tsx`, queue batch route (unchanged) |
| A     | `src/lib/applyText/{vocab,candidates,splice,noticeText,track,index}.ts`; `acceptRender` on `commitDraftRevision`; `POST /api/drafts/[id]/apply-text` | 030 `renderedText`, `collectHeadlineFacts`, `claim.ts`, `draftActions.ts`, `HeadlineImageNotice`                                           |
| D     | `spotlight` v2; probe `version`; `op031Verdict`; `recheck.ts --regions`                                                                              | `composition.ts`, `plan.ts`, `look-probe/route.ts`, `run-look-check.mjs`, `lookCheck.mjs`, `postStyles/styles.ts`                          |

Three migrations (NFR-02), in build order: C `20261028120000_personal_image_key_provider`, B `20261029120000_post_fonts`, A `20261030120000_apply_text_action`. One down script, `prisma/rollback/031-v2-final-polish.down.sql`, with one section per migration in reverse order.

## 2. Group H

### 2.1 Temp dirs (FR-01)

`claudeCli.ts` keeps `let createdCwd: string | null`. `spawnCwd` sets it when `mkdtemp` creates the directory. On the first creation, it registers `process.once('exit', () => { if (createdCwd) rmSync(createdCwd, { recursive: true, force: true }) })`. `freshSpawnCwd` (which re-creates the directory when it is gone) updates the variable, so a re-created directory is the one removed. The handler is wrapped in try/catch: an exit handler must never throw. The unit test calls an exported `cleanupSpawnCwd()` that the handler uses, and asserts that `rmSync` gets exactly the created path.

### 2.2 One lost-claim cleanup (FR-02)

```ts
// revisions.ts
export async function discardOnLostClaim(
  err: unknown,
  uploadedKey: string | null,
  why: string,
): Promise<void>
// deletes uploadedKey when err is DraftClaimLostError or RevisionConflictError and uploadedKey is set
```

`commitDraftRevision` (`:595-607`) and `recordRejectedRender` (`:1004`) call it instead of their inline branches. `regenerate-design/route.ts` wraps the `withNextRevisionNumber` block (`:142-172`) in `try { … } catch (err) { await discardOnLostClaim(err, result.exportUrl, 'a lost claim'); throw err }`.

`result.exportUrl` is the key `runPathBDesign` uploaded in this run. It is never read from the draft row. The task confirms `exportKey()` uniqueness (spec A4) by reading its definition.

### 2.3 AC-17 (FR-03)

The commands are `docker build -t bistec-studio:031 .`, saved to a log, then `grep -c EBADENGINE` on the log, then `docker run --rm --entrypoint claude bistec-studio:031 --version`. The Dockerfile is already on `node:22-alpine` (runner at `:72`), so no Dockerfile change is expected.

## 3. Group G

### 3.1 The guard (FR-06)

`uiWordingGuard.test.ts` reuses `uiTokenGuard.test.ts`'s walker (`sourceFiles`). It extracts candidate text per line with two regexes: string literals (`'…'`, `"…"`, `` `…` `` with no `${` inside the matched part), and JSX text (text between `>` and `<` on one line). Comments are removed first: `//…` up to the end of the line when it is outside a string, and `/* … */` and `{/* … */}`.

Patterns, matched case-sensitively unless noted, on whole words:

```
Path A, Path B, Brand Kit, Brandkits, Brand-kit, /copy provider/i, COPY provider, colour, Organise, New Brief
(T5 adds: OpenAI key)
```

A line holding `wording-exception:` is skipped. The scope is `src/app/(app)/**` and `src/components/**`; `src/lib` user messages are fixed by hand (W-08, W-09, W-20, W-22, W-26) but are not scanned, because they also hold prompt text.

### 3.2 The fixes (FR-07)

Two tasks:

- **T2: the MEDIUM items and the docs.** W-03 to W-12, W-14, W-17, W-18, W-20 to W-26 and W-39 to W-41. W-19 is fixed here as wording; group A adds the Apply clause later.
- **T3: the glossary, the LOW naming sweep, the guard and the early full E2E run.** W-15 and W-27 to W-38.

W-01 and W-02 are left to C, and W-13 and W-16 to F. T3's report holds the full W table, with the rows owned by later tasks marked "owned by Tn"; the final task fills them in.

## 4. Group C

### 4.1 Detector (FR-09)

```ts
// src/providers/keyPrefix.ts (pure, no imports from server code)
export type KeyProvider = 'anthropic' | 'openai' | 'gemini'
export function detectKeyProvider(key: string): KeyProvider | null
export const KEY_PROVIDER_LABEL: Record<KeyProvider, string> // 'Claude (Anthropic)', 'OpenAI', 'Gemini (Google)'
export function validImageKey(key: string): 'openai' | 'gemini' | null // FR-11 regexes
```

The team page imports the label map; the admin providers route maps the result to `{ providerName, autoLabel }` locally.

### 4.2 Schema and route (FR-10, FR-11)

```sql
ALTER TABLE "UserOpenAiKey" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'openai';
ALTER TABLE "Draft" ADD COLUMN "imageSource" JSONB;
```

The route's `putSchema` refines with `validImageKey`. The upsert writes `provider`. `OpenAiKeyInfo` gains `provider?: 'openai' | 'gemini'`.

### 4.3 Resolve and fall back (FR-12, FR-13)

```ts
// registry.ts
export interface ResolvedImageProvider {
  provider: ImageProvider
  tier: 'personal' | 'team'
  providerName: ImageProviderName
}
export async function resolveImageProviderWithSource(
  ctx,
  providerKey?,
): Promise<ResolvedImageProvider | null>
export async function resolveImageProvider(ctx, providerKey?) {
  return (await resolveImageProviderWithSource(ctx, providerKey))?.provider ?? null
}
```

In `background.ts`, `resolveProvider` returns the resolved object. The image call site becomes `generateWithFallback(resolved, ctx, prompt, …)`:

```
try generate on resolved
catch err:
  if resolved.tier !== 'personal' -> rethrow (today's PROVIDER_ERROR path)
  if isAuthRejection(err) -> markUserOpenAiKeyInvalid(userId)
  team = resolveImageProviderWithSource({ teamId, userId: null }, providerKey)
  if !team -> throw PersonalKeyFailed(resolved.providerName, err)   // PROVIDER_ERROR + personal message
  result = generate on team (an error here is today's PROVIDER_ERROR)
  source = { tier: 'team', provider: team.providerName, personalFailed: true }
```

`isAuthRejection` checks `err.status` (OpenAI SDK) and the Gemini provider's thrown status, 401 or 403. The `imageSource` value flows out with the background result to the writers that already persist `backgroundSkip*`: `generateDraft.ts` (both writers) and `refine/route.ts` through `refineSkipFields`. It is a plain draft field, not part of `RenderStamp`.

Under `MOCK_AI` the existing `mockImageProvider` wraps whichever provider resolved. For AC-12, a new sentinel `__MOCK_BG_PERSONAL_FAIL__` makes the mock throw only when the wrapped provider came from the personal tier. `mockImageProvider` gets the tier.

### 4.4 Notice (FR-14)

`src/lib/drafts/imageSourceNotice.ts` holds the pure `imageSourceNoticeFor(source)`. The GET adds `imageSourceNotice`. The draft page renders `Notice tone="warning" role="status" data-testid="image-source-notice"` beside `BackgroundNotice`.

## 5. Group B

### 5.1 The catalogue (FR-16 to FR-18)

```ts
// src/lib/fonts/types.ts (client-safe)
export interface FontFamily {
  family: string
  category: FontCategory
  weights: number[]
  italics: boolean
  scripts: string[]
  delisted?: true
}
export interface FontCatalogue {
  snapshotDate: string
  source: string
  families: FontFamily[]
}
export const OFFERED_SCRIPTS = ['sinhala'] as const

// src/lib/fonts/merge.ts (pure)
export function mergeCatalogue(
  previous: FontCatalogue | null,
  fetched: FontFamily[],
  date: string,
): FontCatalogue

// src/lib/fonts/catalogue.ts (server-only: `import 'server-only'`)
export const CATALOGUE_DATE: string
export function findFamily(name: string): FontFamily | null
export function searchFamilies(q: string, limit = 20): FontFamily[] // case-insensitive prefix first, then substring
export function familiesForScript(script: string): FontFamily[]
```

`scripts/refresh-google-fonts.mjs` fetches `https://fonts.google.com/metadata/fonts`, strips the `)]}'` guard prefix, and maps each `familyMetadataList` entry: `family`, `category` (lower-cased, spaces to dashes), `fonts` keys (weights from `"400"`, `"400i"`; `italics` if any key ends in `i`), and `subsets` minus `menu`. It reads the previous `catalogue.json`, calls `mergeCatalogue` (re-implemented in the `.mjs` by importing a built copy is awkward, so the script imports `merge.ts` through `tsx`, the way `scripts/look-check/recheck.ts` runs), and writes sorted JSON with 2-space indent.

**Picker reads:** `GET /api/fonts` (`withTeamAuth`; query `q` up to 60 characters, `script` in `OFFERED_SCRIPTS`), limit 20.

### 5.2 The URL (FR-19)

```ts
// src/lib/fonts/url.ts (pure; takes the lookup as an argument so it is client-safe and testable)
export function googleFontsUrl(families: string[], lookup: (n: string) => FontFamily | null): string
```

Per family:

- unknown → `family=Name+With+Plus`;
- `weights` intersected with `[400,500,600,700]`, falling back to the family's own weights when the intersection is empty;
- one weight and no italics → no axis;
- otherwise `:wght@a;b;c`, or `:ital,wght@0,a;0,b;1,a;1,b` when there are italics.

Families are de-duplicated, keep their order, and are joined with `&family=`. The URL ends with `&display=swap`.

### 5.3 Save validation (FR-20, FR-21)

`src/lib/fonts/validateKitFonts.ts` holds `validateKitFonts(submitted, stored, lookup)`, which returns `{ ok: true, fonts } | { ok: false, error }`. It also holds `validateScriptFonts(submitted, lookup)`. Both are used by the kit POST and PATCH routes, the MCP tool and the assistant apply route. The PATCH schema gains `scriptFonts: z.record(z.string()).nullable().optional()`.

### 5.4 Injection (FR-22)

```ts
// src/lib/fonts/plan.ts (server)
export function postFontPlan(kit: { fonts: unknown; scriptFonts: unknown } | null): {
  families: string[]
  scriptFamilies: string[]
}
// families: catalogue-known names from kit.fonts (unknown names are skipped from the link; the model's own @import still covers them)

// src/lib/fonts/inject.ts (pure)
export function applyPostFonts(
  html: string,
  plan: PostFontPlan,
  url: (families: string[]) => string,
): string
```

**The CSS rewrite** is a small tokenizer, not a regex over the whole document:

- it finds each `<style>…</style>` body and each `style="…"` / `style='…'` attribute value in the source;
- within each, it scans declarations `prop: value` up to `;` or `}`, skipping comments and strings;
- it handles `font-family` and custom properties matching `/^--[\w-]*font[\w-]*$/i`;
- the value is split on top-level commas; a family is inserted before a final generic keyword, or appended. A family name with spaces is quoted with `'…'`.

Idempotent: a value that already contains the family (normalised: quotes stripped, case-insensitive) is left as it is.

**Call sites:**

- `pathA.ts`, on the filled HTML before render or upload;
- `pathB.ts`, on the agent's HTML before render or upload;
- the refine route, on the refined HTML before `commitDraftRevision`.

`fontInjectionSites.test.ts` reads those three files and fails if the `applyPostFonts(` call is gone. This is the 030 writer-guard pattern.

### 5.5 Prompt and version (FR-23)

`systemContext.ts` maps `fonts` through `googleFontsUrl([name], findFamily)` for catalogue names and keeps the stored URL for the rest (FONT artifacts). It adds one line per script font. `SCRIPT_SUPPORT_NOTE` adds one sentence: the app adds the brand's Sinhala font to every font stack. `PROMPT_VERSION_BASE` is set to `2026-10-29.1` with a history line.

### 5.6 Render note (FR-24)

In `renderPost`, after the 025 and 030 checks:

1. `collectFontFacts(page, families)` runs `page.evaluate` with `await document.fonts.ready`, then `families.filter(f => !document.fonts.check('16px "' + f + '"'))`;
2. it is bounded by `FONT_CHECK_TIMEOUT_MS = 3000`; a throw or timeout gives `[]` and a log line.

The families are read in the page from the `link[data-post-fonts]` href (`URLSearchParams.getAll('family')`, with the axis stripped), so `renderPost` needs no new argument.

`renderPost` returns `{ png, headlineCheck, fontsMissing }`. The mock path returns the families whose names contain `__MOCK_FONT_MISSING__`.

`RenderStamp` gains `renderNotes: RenderNotes | null` (`{ fontsMissing: string[] }`, zod-validated, null when the list is empty). `currentRenderStamp(model, composition, postStyle, renderedText, renderNotes)` makes the new argument required. The 030 writers table applies unchanged; restore and adopt carry the stored value. `renderStampWriters.test.ts` (030's `renderedTextWriters.test.ts`, extended) covers `renderNotes`.

`src/lib/drafts/fontNotice.ts` holds `fontNoticeFor(notes)`, and the GET adds `fontNotice`.

### 5.7 Picker UI (FR-25)

`FontEditor` drops the `GOOGLE_FONTS` import and fetches `/api/fonts?q=` through React Query, keyed `['fonts', q]`, with a 200 ms debounce. Results show the family and a category tag (the shared `Tag` atom). Chips show "Heading" and "Body" as small labels on positions 0 and 1. A new `ScriptFontPicker` (a `Select` over `/api/fonts?script=sinhala`, with "None (system font)" first) sits under it. `KitDetail` saves `scriptFonts` in the same PATCH. The date comes from the GET of the kit, which gains `fontCatalogueDate`.

## 6. Group E

### 6.1 Entries and coded rules (FR-26, FR-27)

`Category` gains `'typography'`. The three entries go in `entries.ts` after `edge-blend`. `measurable.ts` already accepts `px` and `x`/`×`; the task adds `×` if only `x` is accepted, with a unit test.

```ts
// authoring/typography.ts (pure; takes the lookup)
export const MIN_BODY_PX_BY_WIDTH: Record<number, number> = { 1080: 28 }
export type TypographyFinding = {
  code: 'too-many-families' | 'same-category' | 'unknown-family'
  detail: string
}
export function checkKitTypography(
  kit: { fonts: { name: string }[]; scriptFonts: Record<string, string> | null },
  lookup,
): TypographyFinding[]
```

`detail` names the fonts, for the editor. The kit editor fetches the findings from the kit GET, which gains `typographyFindings`, so the lookup stays on the server.

### 6.2 One runner, two hosts (FR-28, FR-29)

```ts
export async function runRuleUpgrade(args: {
  roleKit: RoleKit
  text: string
  teamId: string
  userId: string
  surface: 'ASSISTANT_BRANDKIT' | 'ASSISTANT_BRIEFING'
  label: 'kit-upgrade' | 'briefing-upgrade'
})
```

The kit route passes its current values. The new route `src/app/api/campaigns/[id]/briefing/upgrade/route.ts` mirrors the kit route:

- `withTeamAdmin`;
- the campaign team check;
- a strict zod body;
- the active `CampaignBriefing` version for `STALE_BASE`;
- `withClaudeAuth(user.userId, user.teamId, …)`;
- the same error mapping.

`RoleKit` comes from `resolveBrandKit(campaignId)` through `buildRoleList`. The `MOCK_AI` reply is the same `buildMockKitUpgradeReply`.

In `CampaignBriefingSection`, the `request` posts `{ text, baseVersion: activeVersion }`. The panel shows `STALE_BASE` as "The briefing changed since you started; reload it." That text is passed as a prop, so the panel stays host-neutral.

## 7. Group F

### 7.1 Schedule (FR-30 to FR-32)

```ts
schedulePlanItemSchema = z.object({ topic, postStyle: z.string().trim().max(40).optional(), goal: z.string().optional(), tone: z.string().optional(), daysFromNow, postAction })
export function normalisePlan(items, ctx: { defaultStyle: string | null, styles = activeStyles() }): PlanItem[]  // sets postStyle and styleReplaced
```

`runBriefingChat` loads the campaign's `defaultPostStyle` (it already loads the campaign) and calls `normalisePlan`. The prompt's grammar section renders `activeStyles().map(s => \`- ${s.key}: ${s.label}. ${styleSummary(s)}\`)`. The mock reply gains `postStyle`on two rows and the bad key`"flash-sale"` on one.

### 7.2 Brand-kit block and apply (FR-33, FR-34)

```ts
brandKitBlockSchema.fonts = z
  .union([
    z
      .array(z.string())
      .max(6)
      .transform(([h, b]) => ({ heading: h, body: b })),
    z.object({ heading: z.string().optional(), body: z.string().optional() }),
  ])
  .default({})
brandKitBlockSchema.scriptFonts = z.record(z.string()).optional()
```

The panel looks up each proposed name with `/api/fonts?q=` and keeps an exact match only. The apply route body is `{ voice?, colors?, fonts?, scriptFonts? }`, and it validates through §5.3. In one `prisma.$transaction`:

1. when `voice`, or a font change, is present: the next `BrandKitPrompt` version (the same allocation as `prompts/route.ts`, extracted to `createPromptVersion(tx, kitId, content, userId, previousFonts?)`). `content` defaults to the active version's content when only fonts change;
2. `brandKit.update({ colors?, fonts?, scriptFonts? })`.

P2002 is a 409. The prompts GET returns `previousFonts`, and the History list renders the line.

## 8. Group A

### 8.1 Pure module (FR-36 to FR-39)

```ts
// candidates.ts
export interface TextCandidate {
  tagName: string
  start: number
  startTagEnd: number
  endTagStart: number
  end: number
  hasChildElements: boolean
  descendantCount: number
}
export function findTextCandidates(html: string, text: string): TextCandidate[]
export function precheckApply(
  html: string,
  oldText: string,
  newText: string,
): { ok: true; candidate: TextCandidate } | { ok: false; failure: ApplyFailure }
// splice.ts
export function spliceText(
  html: string,
  c: TextCandidate,
  newText: string,
): { ok: true; html: string } | { ok: false; failure: 'splice-mismatch' }
```

parse5's `parse(html, { sourceCodeLocationInfo: true })` gives `startTag.endOffset` and `endTag.startOffset` for each element. An element with no end tag (an implied close) is skipped as a candidate, because there is no safe range. Text content is built by walking the child nodes:

- `#text` nodes are taken as their parse5 value, with entities already decoded;
- `br` becomes a space;
- `template` and `script` are skipped.

### 8.2 The render check (FR-40)

```ts
// revisions.ts
interface CommitRevisionArgs { …; acceptRender?: (r: RenderedForCommit) => ApplyFailure | null; checkText?: string; absentText?: string }
export class RenderRejectedError extends Error { constructor(public code: ApplyFailure) }
```

`renderDraftHtml` passes `absentText` through to `renderPost`. `renderPost`'s check option becomes `{ headline: string; absent?: string[] }`. It returns `headlineCheck` for the headline as today, plus `absentPainted: number` (the painted candidates across the `absent` texts, from the same `collectHeadlineFacts` and `evaluateHeadlineFacts`).

Apply's `acceptRender` is:

```
r.headlineCheck === 'painted' ? (r.absentPainted === 0 ? null : 'old-still-painted') : 'not-painted'
```

A thrown render is caught in the action and mapped to `render-failed`.

The mock stand-in reads the sentinels from the HTML:

- `__MOCK_APPLY_NOT_PAINTED__` → `not-visible`;
- `__MOCK_APPLY_OLD_PAINTED__` → `absentPainted: 1`;
- `__MOCK_APPLY_RENDER_FAIL__` makes the mock `renderPost` throw.

### 8.3 The route (FR-41 to FR-43)

The route follows `regenerate-design/route.ts` (section 2 of the survey): parse, load with brief, `canAccessContent`, readiness. It computes the state with `headlineState(parseRenderedText(draft.renderedText), draft.headline)` and runs `precheckApply`. On a refusal it calls `trackTextApplied({ field, method: 'splice', failure })` and returns 422 `{ code, message }`. Then it claims, returns 202 and runs the work:

```
splice → commitDraftRevision({ draftId, instruction: 'Apply headline to image', html, width, height,
  claim, model: draft stamp model, composition: stored, postStyle: stored, acceptRender, absentText: oldText })
catch RenderRejectedError -> track failure, release with sentence
catch DraftClaimLostError | RevisionConflictError -> 'conflict'
```

On success it emits `trackTextApplied(ok)`, then `trackHeadlineEdited({ via: 'apply', … })`.

The commit reads the headline at its start (`draftHeadlineText`). Apply passes the expected headline explicitly through `checkText`, so the stamp is for the text that was spliced.

### 8.4 UI (FR-44)

The draft page gets `handleApplyText`. It opens the `useConfirm()` dialog with the FR-44 text. On confirm it captures `designUndo`, posts, and then `fetchDraft()`. A 422 shows `noticeText(code)` in a toast. The poll shows the overlay "Applying headline". `HeadlineImageNotice` gets `canApply` and `onApply` props. Its button has the aria-label "Apply the new headline to the image" (the 030 lesson: a contextual accessible name).

## 9. Group D

### 9.1 Evidence (FR-46)

`recheck.ts --regions <png> <key>@<version>:<size>` loads the PNG, samples it with the production sampler, and prints a table per region: `purpose`, `stddev`, `BUSY_STDDEV_MAX`, `contrastFraction`. The output goes to `.specclaw/changes/031-v2-final-polish/look-check/evidence.md`.

### 9.2 Version override (FR-47, FR-48)

`planComposition(…, opts?: { version?: number })` uses `opts.version ?? archetype.current`. Only the probe route passes it, and `planOverrideBoundary.test.ts` greps `src/` for `version:` passed to `planComposition` and allows only `look-probe/route.ts`. The probe route's zod body adds `version: z.number().int().positive().optional()`, refined to `≤ max(Object.keys(versions))`. The route's super-admin gate is unchanged.

### 9.3 Runner (FR-48, FR-49)

`lookCheck.mjs` gains:

- `OP031_SLOTS = ['spotlight@2:SQUARE']`;
- `OP031_CAP = 4`;
- `OP031_COUNTED = 2`;
- `op031Verdict(results)`;
- `planNextOp031(ledger, results)`.

A result row gains `infra: true` when the call returned no image. `run-look-check.mjs --probe --slot-set op031` uses them and passes `version: 2` to the probe route. The `--out` directory is fixed by the operator to `.specclaw/changes/031-v2-final-polish/look-check`. The runner refuses an `--out` whose ledger holds slots from another slot set.

### 9.4 Apply the result (FR-50)

On a pass:

- `current: 2`;
- move the three candidate rows into `LOOK_FIXTURES` and add the copied PORTRAIT and STORY rows at version 2 (six more), replacing the v1 spotlight rows, so the completeness count stays 57;
- add the `promotion` and `milestone` `versions[2]` and their hash rows;
- `lookCheckResults.test.ts`: `RESULTS_PATHS` holds both files; `namedLooks()` expects `['full-bleed-scene','full-bleed-scene','spotlight','spotlight']`; spotlight `passed === true`, using the latest results per slot.

On a fail:

- `results.json` records the verdict;
- `lookCheckResults.test.ts` asserts `spotlight.current === 1` and that the 031 results hold `passed: false`.

## 10. Tests

| Kind                   | New or extended                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                   | `claudeCliTempDir`, `lostClaimCleanup`, `uiWordingGuard`, `keyPrefix`, `personalImageKey` (route), `imageProviderResolution` (tier and fallback), `imageSourceNotice`, `fontsMerge`, `fontsUrl`, `fontsValidate`, `applyPostFonts`, `fontInjectionSites`, `renderStampWriters`, `designAuthoring` (edited), `kitTypography`, `ruleUpgrade` (both hosts), `briefingUpgradeRoute`, `schedulePlan`, `brandKitBlock`, `brandKitApply`, `applyTextCandidates`, `applyTextSplice`, `applyTextRoute`, `applyTextCoverage`, `planOverrideBoundary`, `op031Verdict`, `lookDataset` (hash row), `lookCheckResults` (edited) |
| Render (real Chromium) | script-font fallback (AC-21), font-missing (AC-23), Apply check fixtures (AC-37), spotlight v2 candidate fixtures (AC-42)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| E2E (mock)             | §AI to §AM (spec "Mock E2E plan"), plus the locator adaptations from G                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Upgrade                | `scripts/test-upgrade-path.mjs` scenario 4 (AC-10)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## 11. File map

**New:**

- `src/providers/keyPrefix.ts`
- `src/lib/drafts/imageSourceNotice.ts`, `src/lib/drafts/fontNotice.ts`
- `src/lib/fonts/{types,catalogue.json,catalogue,url,merge,plan,inject,validateKitFonts,index}.ts`
- `scripts/refresh-google-fonts.mjs`
- `src/app/api/fonts/route.ts`
- `src/components/admin/brandkits/ScriptFontPicker.tsx`
- `src/lib/designData/authoring/typography.ts`
- `src/app/api/campaigns/[id]/briefing/upgrade/route.ts`
- `src/app/api/admin/brandkits/[id]/assistant/apply/route.ts`
- `src/lib/applyText/{vocab,candidates,splice,noticeText,track,index}.ts`
- `src/app/api/drafts/[id]/apply-text/route.ts`
- the three migrations, `prisma/rollback/031-v2-final-polish.down.sql`
- `.specclaw/changes/031-v2-final-polish/{measure/,look-check/}`
- the unit, render and E2E files in §10

**Changed:**

- **H:** `claudeCli.ts`, `revisions.ts`, `regenerate-design/route.ts`.
- **G:** the components and pages named in W-01 to W-38, `DESIGN_SYSTEM.md`, `docs/PRD.md`, `docs/cold-start.md`, `docs/mcp-acp-guide.md`, `scripts/seed-portrait-template.mjs`, `prisma/schema.prisma` (comment), the E2E files with adapted locators.
- **C:** `schema.prisma`, `api-types.ts`, `registry.ts`, `background.ts`, `openAiKey.ts`, `me/openai-key/route.ts`, `admin/providers/route.ts`, `team/page.tsx`, `OpenAiKeyCard.tsx`, `backgroundNotice.ts`, `generateDraft.ts`, `refine/route.ts`, `drafts/[id]/route.ts`, `drafts/[id]/page.tsx`, `testHooks.ts`, `scripts/test-upgrade-path.mjs`.
- **B:** `schema.prisma`, the kit POST and PATCH routes, `mcp/server.ts`, `mcp/tools/brandkit.ts`, `systemContext.ts`, `prompts/shared.ts`, `pathA.ts`, `pathB.ts`, `refine/route.ts`, `puppeteer.ts`, `revisions.ts` (stamp), `generateDraft.ts`, `regenerate-design/route.ts`, `FontEditor.tsx`, `KitDetail.tsx`, `uiTokenGuard.test.ts`; `googleFonts.ts` is deleted.
- **E:** `entries.ts`, `measurable.ts` (if needed), `kitUpgrade/upgrade.ts`, `prompts/upgrade/route.ts`, `CampaignBriefingSection.tsx`, `RuleReviewPanel.tsx` (stale-text prop), `designAuthoring.test.ts`.
- **F:** `briefingAssistant.ts`, `BriefingAssistantPanel.tsx`, `brandkit/assistant.ts`, `BrandKitAssistantPanel.tsx`, `prompts/route.ts` (extracted helper), `PromptSection.tsx` (History line), `testHooks.ts`.
- **A:** `package.json`, `schema.prisma`, `api-types.ts`, `revisions.ts`, `puppeteer.ts`, `renderedText/mockCheck.ts`, `analytics/catalogue.ts`, `HeadlineImageNotice.tsx`, `HeadlinePanel.tsx` (W-19), `drafts/[id]/page.tsx`.
- **D:** `composition.ts`, `plan.ts`, `look-probe/route.ts`, `lookCheck.mjs`, `run-look-check.mjs`, `recheck.ts`, `lookFixtureTable.ts`, `lookDataset.test.ts`, `lookCheckResults.test.ts`, and on a pass `postStyles/styles.ts` and its hash table.
- **Docs:** `docs/handoff.md`, `CLAUDE.md`, `docs/e2e-test-plan.md`, `.specclaw/ROADMAP.md`, the 005 verify-report follow-up line, and `docs/ui-reference/screen-{light,dark}.png`.

## 12. Key decisions

The user accepted decisions 1 to 6 as written on 2026-10-26, with T7 on opus and OP-031 on `bistec_studio_op1` (see the handoff 031 section).

1. **The personal key keeps its table and route names** (FR-10). The scope line forbids DB and route renames. The UI word "Image generation key" sits on top of them, and the glossary records the mapping.
2. **The font injection is code-owned at write time, not render time.** The stored HTML is what every later render, refine and inline edit starts from. Injecting once where model output enters keeps all re-render paths correct with no new `renderPost` argument. The cost is three call sites, guarded by a test.
3. **Script fonts go into existing stacks, not a new CSS variable.** Per-glyph fallback in the browser needs the family in the declaration that paints the text, so a variable the model may ignore is not enough (architect BLOCK).
4. **Apply confirms the target without a marker,** because `new-text-present` (FR-38) makes the spliced element the only one that can show the new text. This avoids rendering one HTML and storing another.
5. **Apply is claimed and asynchronous,** like refine and regenerate. It blocks the other actions while it renders, and the claim machinery already handles the sweep, the heartbeat and lost claims.
6. **Spotlight v2 is in the dataset but not current until OP-031 passes.** Only the probe route can plan it, so a fail leaves the served behaviour exactly as today (P6).
7. **The font check reads the families from the marked link in the page,** so the render needs no kit argument and stays one function.
8. **`imageSource` is a draft field, not a render stamp.** It describes the image step, not the render, and follows `backgroundSkip*`.

## 13. Risks

| Risk                                                                          | Mitigation                                                                                                           |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| The CSS tokenizer corrupts a design                                           | Pure, fixture-tested (AC-19), idempotent, touches only declaration values; render suite AC-21                        |
| The wording sweep breaks E2E locators                                         | The full run right after G (FR-08); adapted, never deleted                                                           |
| `ALTER TYPE … ADD VALUE` cannot run inside a transaction on Postgres below 12 | The task reads `SELECT version()` on the test database and records it; the migration holds only that statement       |
| The catalogue fetch is blocked                                                | Spec A1: stop and report; no hand-made list                                                                          |
| The `renderNotes` argument ripples through every writer                       | The same mechanical pattern as 030 T3; a type error catches a missed writer                                          |
| OP-031 burns calls on infra failures                                          | The ledger is written before each call; the cap is 4; infra attempts are not counted for the verdict but use the cap |
| A personal Gemini key that is never live-tested                               | The fallback (FR-13) and the notice make a failure visible; known limit L1                                           |

## 14. Grounding sources

- `CLAUDE.md`, the "Process" bullet: "An implementer subagent does the work, `specclaw:code-reviewer` reviews it, and the orchestrator re-runs tsc, lint and unit and commits. A full clean mock E2E and a CI check close each change. No real model calls." This gives the task process and NFR-01.
- `CLAUDE.md` "Shared Docker databases": "**Never run a prisma or DB command without an explicit `DATABASE_URL`** that points at `bistec_studio_test` or a scratch database." This applies to every DB task and to FR-35.
- `CLAUDE.md` "Image looks (028)": "**The version rule:** a released version (the change that adds it is VERIFIED PASS) is never edited; a change is a new version." This gives FR-47 (v2, v1 unchanged).
- `CLAUDE.md` "Post styles (027)": "**The version rule:** a released version is never edited; add `versions[n+1]`." This gives FR-50 (Promotion and Milestone v2).
- `CLAUDE.md` "Analytics (006)": "**One emitter per event name** … vocabularies … are **imported, not copied**." This gives FR-36 and FR-43.
- `CLAUDE.md` "Brand-kit design rules (007)": "It is **not** re-exported by `designData/index.ts`, and `designDataBoundary.test.ts` fails if a generation-side file imports it." `typography.ts` stays inside `authoring/`.
- `CLAUDE.md` gotcha: "**A `page.waitForResponse` must be created before the action that triggers the request.**" This applies to every new E2E.
- `docs/handoff.md`, 031 section, "Lessons from 030": "A mock that replaces `renderHtmlToPng` but not `renderPost` launches a real Chromium in unit tests"; and "A notice button that repeats a page action needs a contextual accessible name". These give §8.4 and the unit-test mocks for B and A.
- `.specclaw/changes/030-stale-headline-badge/spec.md` FR-04 and FR-07: the writer table and the candidate rule. Apply and `renderNotes` reuse both.
