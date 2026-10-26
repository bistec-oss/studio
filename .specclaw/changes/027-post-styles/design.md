# Design: Post styles, phase a

**Change:** 027-post-styles
**Created:** 2026-10-24
**Spec:** [spec.md](spec.md) (FR/NFR/AC numbers below refer to it)

## 1. Technical approach

Two pure modules and a handful of thin call sites.

```
                    src/lib/postStyles/ (pure, client-safe)
 wizard ─┐          ┌─ styles.ts   the dataset (frozen, immutable versions, hash guard)
 briefs ─┤          ├─ resolve.ts  resolvePostStyle(input) → goal, tone, imageStyle, checklist, stamp
 queue ──┼─────────►├─ stamp.ts    { key, version, revision }, parse, POST_STYLES_REVISION
 runner ─┤          ├─ promptText.ts  checklistPromptText(style, version, scope)
 MCP/ACP ┤          └─ types.ts    keys, Rule, ToneKey, matchToneOption
 regen ──┘                          │ imports designData (keys, sizes) — one direction
                                    ▼
 generation ──► buildBriefInput (captionRules) ──► caption prompt
            ──► Path A/B/background/refine builders (image rules)
            ──► writeCaptions → fields ─┐
                                        ▼
                    src/lib/factsCheck/ (extract, normalize, compare: pure)
                    sources.ts, refresh.ts (prisma) ──► Draft.factsCheck
                                        │
              scheduler runner ◄────────┘  flagged | error → no post action, heldReason
              draft page, MCP, ACP ◄──────  notice / result field
```

Nothing here calls a model or an image provider. The checklist is text added to prompts that already run. The facts check is regular expressions over text already in hand.

**Why the dataset is not in `designData`.** `designData` holds layout contracts and is extended by 007's authoring part, kept apart from the generation side by `designDataBoundary.test.ts`. A style's rules are read by the caption prompt, the queue runner and MCP, none of which should import a layout module for a checklist; and a style is not a layout. A sibling module keeps the 007 boundary rule untouched and mirrors the 009 pattern: deep-freeze, immutable versions, a hash guard test, a stamp validated in code. The one dependency edge is `postStyles → designData` (image-style keys and supported sizes). `designData` never imports `postStyles` (tested).

**Why the resolver takes `surface`.** The proposal's party-architect BLOCK was that the style-to-defaults mapping would be written twice (the wizard's pre-fill and a server derivation). One function with an explicit surface makes the per-surface rule (unattended means classic) a line of data in one file, not a convention.

## 2. Module layout

| Path                                         | Content                                                                                                                                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/postStyles/types.ts`                | `PostStyleKey`, `ToneKey`, `TONE_KEYS`, `Rule`, `StyleVersion`, `PostStyle`, `matchToneOption`                                                                                            |
| `src/lib/postStyles/styles.ts`               | the eight styles, `deepFreeze`, `activeStyles()`, `getStyle()`, `isStyleKey()`, `POST_STYLES_REVISION`, the key-rule header, a module-load default-image-style assertion (non-production) |
| `src/lib/postStyles/resolve.ts`              | `resolvePostStyle`, `ResolveInput`, `ResolveResult`, `Surface`, `ResolveNote`                                                                                                             |
| `src/lib/postStyles/stamp.ts`                | `postStyleStampSchema`, `parsePostStyleStamp`, `stampFor(key, version)`                                                                                                                   |
| `src/lib/postStyles/promptText.ts`           | `checklistPromptText`, `PREAMBLE`                                                                                                                                                         |
| `src/lib/postStyles/index.ts`                | the public surface (re-exports everything except `styles.ts` internals)                                                                                                                   |
| `src/lib/factsCheck/types.ts`                | `FactsCheck`, `Flag`, `Kind`, `CheckInput`, the zod schema                                                                                                                                |
| `src/lib/factsCheck/normalize.ts`            | digit mapping, number parsing, multipliers                                                                                                                                                |
| `src/lib/factsCheck/extract.ts`              | `extractValues(text, { strip, exempt })` returning `{ kind, key, value, index }[]`                                                                                                        |
| `src/lib/factsCheck/compare.ts`              | `checkFacts(input)`: builds the source set, applies the support rule, builds the result                                                                                                   |
| `src/lib/factsCheck/sources.ts`              | `loadFactsSources(brief)` (prisma)                                                                                                                                                        |
| `src/lib/factsCheck/refresh.ts`              | `refreshFactsCheck(draftId)` (prisma; best-effort)                                                                                                                                        |
| `src/lib/factsCheck/index.ts`                | re-exports                                                                                                                                                                                |
| `src/components/brief/PostStylePicker.tsx`   | the picker (a radio-card group built from `src/components/ui/` atoms)                                                                                                                     |
| `src/components/drafts/FactsCheckNotice.tsx` | the amber notice                                                                                                                                                                          |

`index.ts` of `postStyles` exports `activeStyles`, `getStyle`, `isStyleKey`, `resolvePostStyle`, the stamp helpers, `checklistPromptText` and the types. It does **not** export the raw `styles` record, so the boundary test can ban imports of `postStyles/styles` outside the directory (NFR-02). Purity: both modules import no prisma, env, fs, minio, puppeteer or `@prisma/client` value; `AspectRatio` and `Channel` are type-only imports, as in `aspectRatio.ts`. `sources.ts` and `refresh.ts` are the two prisma files and are excluded from the purity walk by name.

## 3. The dataset

```ts
// styles.ts (shape)
export const POST_STYLE_KEYS = [
  'general',
  'launch',
  'promotion',
  'event',
  'hiring',
  'announcement',
  'tip',
  'milestone',
] as const
export const styles: Readonly<Record<PostStyleKey, PostStyle>> = deepFreeze({
  promotion: {
    key: 'promotion',
    label: 'Promotion / deal',
    summary: 'An offer, a discount or a deal.',
    status: 'active',
    current: 1,
    versions: {
      1: {
        goal: 'conversion',
        defaultTone: 'bold',
        defaultImageStyle: 'classic',
        checklist: [
          { id: 'promotion.offer-if-stated', scope: 'caption', check: 'facts-check', text: '…' },
          { id: 'promotion.open-cta', scope: 'caption', text: '…' },
          { id: 'promotion.image-values', scope: 'image', check: 'facts-check', text: '…' },
        ],
      },
    },
  },
  // …
})
export const POST_STYLES_REVISION = Object.values(styles).reduce((n, s) => n + s.current, 0)
```

The rule text is the table in spec FR-03 verbatim.

**The guard tests** (`postStylesDataset.test.ts`):

- eight keys; the committed key list is a subset of the dataset's keys; keys match `^[a-z]+(-[a-z]+)*$`;
- every `defaultImageStyle` is `classic` or `archetypes[key].status === 'active'`;
- rule ids are unique, start with their style key and a dot, and are `[a-z0-9.-]+`;
- every style has at least one `caption` and one `image` rule;
- a committed table `{ 'key@version': sha256(JSON.stringify(versionContent)) }` matches (the `designData.test.ts` method, `createHash`); the failure message says "add `versions[n+1]`, never edit a released version";
- a fixture dataset with one edited released version fails the same guard function (the guard is a pure function over a dataset, so the test passes a doctored copy and asserts it reports a mismatch, not by editing the source);
- `POST_STYLES_REVISION` equals the sum, and adding a version to a fixture raises it.

**Retiring a style** (not done in this phase; the path is defined): set `status: 'retired'`. `activeStyles()` omits it; `getStyle` and `isStyleKey` still answer; stored briefs, entries, campaigns and stamps keep resolving.

## 4. The resolver

```ts
export function resolvePostStyle(input: ResolveInput): ResolveResult {
  // explicit key -> legacy goal mapping (hiring, announcement) -> campaign default -> general
  const keyIn =
    input.style ??
    legacyGoalStyle(input.legacyGoal) ??
    input.campaign?.defaultPostStyle ??
    'general'
  const style = getStyle(keyIn)
  if (!style)
    return { ok: false, code: 'UNKNOWN_POST_STYLE', message: `Unknown post style '${keyIn}'` }
  const version = input.version ?? style.current
  const v = style.versions[version]
  if (!v)
    return {
      ok: false,
      code: 'UNKNOWN_POST_STYLE',
      message: `Post style '${keyIn}' has no version ${version}`,
    }

  const notes: ResolveNote[] = []
  // tone: explicit → campaign (only if it matches an option) → style default
  const explicitTone = input.explicit?.tone?.trim()
  const campaignTone = matchToneOption(input.campaign?.defaultTone)
  if (input.campaign?.defaultTone && !campaignTone) notes.push('campaign-tone-ignored')
  const tone = explicitTone || campaignTone || v.defaultTone

  // image style: explicit → style default → classic; classic wherever it cannot run
  let imageStyle = input.explicit?.imageStyle || v.defaultImageStyle
  if (imageStyle !== 'classic') {
    if (UNATTENDED.has(input.surface)) {
      imageStyle = 'classic'
      notes.push('unattended-classic')
    } else if (input.path === 'A') {
      imageStyle = 'classic'
      notes.push('path-a-classic')
    } else if (!supportsSize(imageStyle, input.aspectRatio)) {
      imageStyle = 'classic'
      notes.push('size-classic')
    } else if (!isActiveKey(imageStyle)) {
      imageStyle = 'classic'
      notes.push('default-unavailable')
    }
  }
  return {
    ok: true,
    key: style.key,
    goal: v.goal,
    tone,
    imageStyle,
    checklist: v.checklist,
    stamp: stampFor(style.key, version),
    notes,
  }
}
```

- `supportsSize` is `imageStyleOptions(aspectRatio).some(o => o.key === imageStyle)` from `designData` (the same call the wizard's picker uses, `SizeDesignStep.tsx:166`), so the resolver and the picker cannot disagree about STORY.
- `UNATTENDED = new Set(['queue','mcp','acp'])`. The wizard and `briefs-api` are attended. `regenerate` is attended (the user clicked it) and reads the brief's stored `imageStyle` through the existing 009 path, not through this resolver's image output; the resolver call in a regenerate is for the checklist and the stamp.
- An explicit non-classic image style that the API validator accepted but the resolver reduces (Path A) cannot happen on `briefs-api`, because `validateImageStyle` already refuses a non-classic style for TEMPLATE (`imageStyle.ts:21-23`). The resolver's reduction is for defaults.
- **`matchToneOption`** is the wizard's current rule moved here: `TONE_OPTIONS.find(t => text.toLowerCase().includes(t.value))?.value`, null on empty. The wizard's `TONE_OPTIONS` (labels) stay in `constants.ts`, built from `TONE_KEYS`.
- `legacyGoal` is the one place a pre-027 goal is read: `LEGACY_GOAL_STYLE = { hiring: 'hiring', announcement: 'announcement' }` and `legacyGoalStyle(raw)` (trim, lower-case, lookup; anything else returns `undefined`). An explicit `style` short-circuits it. Callers pass the request's `goal` (briefs API, queue routes, MCP, ACP) as `legacyGoal`; nothing else maps a goal. Decided by the user, 2026-10-24.
- The result is a pure function of its input; `notes` are not stored.

**Call sites.**

| Surface                                   | Call                                                                                                                                                                         | Writes                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Wizard (client)                           | on style change / campaign select / touched flags                                                                                                                            | form state only                                                          |
| `POST /api/briefs`                        | `surface: 'briefs-api'`, `explicit: { tone, imageStyle }` from the body                                                                                                      | `Brief.postStyle, goal, tone, imageStyle`                                |
| `POST/PATCH …/queue`, `…/queue/batch`     | `surface: 'queue'`                                                                                                                                                           | `ScheduledGeneration.postStyle, goal, tone` (snapshots for display)      |
| `ensureBrief` (runner)                    | `surface: 'queue'`, explicit tone = the entry's stored tone, latest version                                                                                                  | `Brief.postStyle, goal, tone, imageStyle`; fails the entry on `ok:false` |
| `generatePost` (MCP, ACP)                 | `surface: 'mcp' \| 'acp'`                                                                                                                                                    | `Brief.postStyle, goal, tone`                                            |
| Regenerate design / copy, `generate/copy` | reads `brief.postStyle`, `surface: 'regenerate'`, current version                                                                                                            | the checklist in the prompt; the stamp                                   |
| Refine                                    | no resolver call: it reads the draft's stamped `(key, version)` and calls `getStyle(key).versions[version].checklist` through a `rulesAtStamp(stamp)` helper in `postStyles` | the image rules in the prompt                                            |

A grep guard (NFR-02): outside `src/lib/postStyles/` no file imports `postStyles/styles`, and none references a style key literal outside `tests/` and the dataset.

## 5. The stamp and the derived prompt versions

```ts
export const postStyleStampSchema = z
  .object({
    key: z.string().min(1).max(40),
    version: z.number().int().positive(),
    revision: z.number().int().positive(), // POST_STYLES_REVISION at the run
  })
  .strict()
export type PostStyleStamp = z.infer<typeof postStyleStampSchema>
export function parsePostStyleStamp(raw: unknown): PostStyleStamp | null // tolerant, never throws
```

`RenderStamp` (`src/lib/drafts/revisions.ts:51`) gains `postStyle: PostStyleStamp | null` with no default. `currentRenderStamp(model, composition, postStyle)` takes it as a third required parameter; the two existing call sites (`generateDraft.ts:158,169`, `regenerate-design/route.ts:120`) pass the resolver's stamp (or null for a null-style brief). `revisionStampFields` and `draftStampFields` add `postStyle` through the same `toJsonColumn`-style helper (`Prisma.DbNull` for null). The carry-forward writers (refine, inline edit, override, adopt, restore) read the draft's current stamp through `draftPostStyleStamp(draft)` (the sibling of `draftCompositionStamp`, `revisions.ts:117`), so a type error forces each to choose.

Regenerate copy writes `Draft.postStyle` in its settle transaction (`settleCaptionAction`) with the stamp of the run, guarded on the claim like the other writes in that transaction.

**Prompt versions.**

```ts
// prompts/shared.ts
export const PROMPT_VERSION = `2026-10-25.1+ps${POST_STYLES_REVISION}`
// prompts/caption.ts
export const CAPTION_PROMPT_VERSION = `2026-10-25.1+ps${POST_STYLES_REVISION}`
```

`Draft.promptVersion` is `TEXT` (`prisma/schema.prisma`, the 004 stamp column), so a longer string needs no migration. The 006 catalogue's `promptVersion` field is `z.string().max(40)` (`catalogue.ts:94`); `2026-10-25.1+ps8` is 16 characters. A unit test asserts both constants end with the suffix and that a fixture dataset with one more version yields a different string.

## 6. The facts check

### Pipeline

```
checkFacts({ texts, sources }):
  sourceKeys = new Set( extractValues(each source, { strip:false, exempt:false }).map(v => v.key) )
  numericValues = set of numeric parts of every source key of kind cur|pct|num
  for each checked text:
    cleaned = stripUrlsEmailsHandlesHashtags(text)            // not sources
    cleaned = blankExemptTokens(cleaned)                      // 24/7, ratios, sizes, list markers, Step n, © year
    values = extractValues(cleaned)                           // ordered: tel, date, time, currency, pct, num
    for v of values: supported = sourceKeys.has(v.key) || (v.kind==='num' && numericValues.has(v.numeric))
                     plus the small-integer exemption (0..10, kind num only)
  dedupe on (where, key), cap 20, status = flagged|clear
```

Everything is wrapped in one try/catch returning `{ status: 'error', reason }` (never throws).

### Extraction details

Patterns are written as an ordered list of `{ kind, regex, toKey }`. Each match is **consumed** (replaced by spaces of equal length) before the next pattern runs, so `$50` is never also a `num` and `15 March 2027` is never also two `num`s.

- Boundary for a bare number: `(?<![\p{L}\p{N}])` before and `(?![\p{L}\p{N}])` after (with `u` flag), so `Q3`, `COVID19` and `#Top10` (already stripped) never match.
- `tel`: `/\+?\d[\d\s().-]{5,}\d/` followed by a digit-count check (7 or more digits after removing separators) and a check that the candidate is not a date or time already consumed (dates run first).
- `date`: two regex families (day-month and month-day) with an optional year, and a numeric family. Month names: `jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?`, case-insensitive. Day 1 to 31 only. `May` needs an adjacent day to match, so the modal verb is safe.
- `time`: `/\b([01]?\d|2[0-3]):([0-5]\d)\s?(am|pm)?\b/i` and `/\b(1[0-2]|0?[1-9])\s?(am|pm)\b/i`.
- `currency`: symbol-first, code-first and trailing-code/word families; the number part uses the shared number grammar (thousands commas, decimal point, `k|m|bn|thousand|million|billion`).
- `pct`: `/(\d+(?:[.,]\d+)?)\s?(%|percent|per cent)/i`.
- `num`: the shared number grammar.

**Normalisation** (`normalize.ts`): `toAsciiDigits(s)` maps the six listed digit blocks (a `Map<codePoint, digit>` built from the block starts); `parseNumber(raw)` removes commas, parses, applies the multiplier and returns a canonical string (`String(Number(...))`, so `5,000` and `5000.0` are both `5000`). Keys are lower-case.

**Exempt tokens** are blanked, not parsed, in checked texts only: `\b24\s?[/x]\s?(7|365)\b`, the five aspect literals and `\d{1,4}\s?[x×]\s?\d{1,4}`, `^\s*(\(?\d{1,2}[.)])\s` per line, `\b(?:step|tip|part)\s+\d+\b`, `(?:©|\(c\)|copyright)\s*\d{4}`. Small integers 0 to 10 are exempt at comparison time (kind `num`, an integer value 0 to 10).

### Why these choices

- **Kind-strict for money, percent, dates, times and phones.** A caption "30% off" against a brief that says "30 days" must flag; those are the invented facts that hurt. A bare number is looser (any numeric kind with the same value supports it) because "50 students" against "50%" is rarely the harm and a flag there is noise.
- **Sources are not stripped or exempted.** More source keys can only reduce false positives.
- **Numeric dates are not reinterpreted.** Day-first versus month-first cannot be known; keying on the digits as written is safe (a mismatch flags).
- **The result stores no text.** `value` is the matched span (a number, date or time) cut to 40 characters.

### Sources and write points

`loadFactsSources(brief)` returns `string[]`:

```
[ brief.topic, brief.description,
  await getActiveCampaignBriefing(brief.campaignId),
  (await resolveBrandKit(teamId, campaignId, brandKitId))?.voicePrompt,
  ...campaignDocuments.map(d => d.parsedText) ]      // prisma.campaignDocument.findMany({ where: { campaignId, teamId } })
```

nulls dropped, cut at 200 000 characters. The kit and the briefing are already resolved in `resolveGenerationInputs` (`generateDraft.ts:93-119`); the sync path passes them in rather than reading them twice. `refreshFactsCheck(draftId)` loads the draft with its brief and READY captions, calls `loadFactsSources`, runs `checkFacts`, and does `prisma.draft.updateMany({ where: { id: draftId }, data: { factsCheck } })`. It catches every error, logs `[facts-check] draft <id>: <message>` (the message passed through `redactText`, `src/lib/text/redact.ts`), and on failure tries once to write `{ v: 1, status: 'error', reason, checkedAt, flagged: [] }`.

| Write point                             | How it computes                                                       | Atomic with the write     |
| --------------------------------------- | --------------------------------------------------------------------- | ------------------------- |
| `generateDraftForBriefInner` (sync)     | `checkFacts` over `fields` + headline, sources from `inputs`          | yes, in `tx.draft.create` |
| `saveGenerationCaptions` (interactive)  | `refreshFactsCheck` after the transaction                             | no (best-effort)          |
| `settleCaptionAction` (regenerate copy) | `refreshFactsCheck` after the transaction, only if the claim was held | no                        |
| `saveCaptionEdit`, `saveHeadlineEdit`   | `refreshFactsCheck` after a successful write                          | no                        |

The interactive paths are not atomic because no unattended decision depends on them; the notice can lag the text by one request. The scheduler's decision reads the sync path's check, which is atomic with the draft it describes.

## 7. Data model and migration

```prisma
model Brief               { postStyle String? }
model ScheduledGeneration { postStyle String?  heldReason String? }
model Campaign            { defaultPostStyle String? }
model Draft               { postStyle Json?  factsCheck Json? }
model DraftRevision       { postStyle Json? }
```

Migration `prisma/migrations/20261025120000_post_styles/migration.sql`:

```sql
-- Additive only (027): the previous image runs against this schema; it never reads or writes these columns.
-- Manual down script: prisma/rollback/027-post-styles.down.sql
ALTER TABLE "Brief"               ADD COLUMN "postStyle" TEXT;
ALTER TABLE "ScheduledGeneration" ADD COLUMN "postStyle" TEXT;
ALTER TABLE "ScheduledGeneration" ADD COLUMN "heldReason" TEXT;
ALTER TABLE "Campaign"            ADD COLUMN "defaultPostStyle" TEXT;
ALTER TABLE "Draft"               ADD COLUMN "postStyle" JSONB;
ALTER TABLE "Draft"               ADD COLUMN "factsCheck" JSONB;
ALTER TABLE "DraftRevision"       ADD COLUMN "postStyle" JSONB;
```

Down script: the seven `DROP COLUMN IF EXISTS`, then `DELETE FROM "_prisma_migrations" WHERE migration_name = '20261025120000_post_styles';`, with the manual-use header. Proof on a scratch database `bistec_studio_027` (explicit `DATABASE_URL`): deploy, down, re-apply, `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <scratch2> --exit-code`, drop both. `npm run test:upgrade` also passes.

No index is added: nothing queries by these columns except the insights `queries.ts` over `AnalyticsEvent`, not these tables.

## 8. Routes and surfaces

- **`POST /api/briefs`** (`briefs/route.ts`): the `body` type gains `postStyle?: unknown`. The required checks for `goal` and `tone` (`route.ts:73-78`) are removed. After the campaign row is loaded (`route.ts:162-190`), the route calls `resolvePostStyle({ style: body.postStyle, campaign: { defaultPostStyle, defaultTone }, explicit: { tone, imageStyle: body.imageStyle }, path, aspectRatio, surface: 'briefs-api' })`. `validateImageStyle` still runs first (so an explicit invalid look is the existing 400). `ok: false` → `400 { error, code: 'UNKNOWN_POST_STYLE' }`. A non-string `postStyle` → 400 `postStyle must be a string`. The `brief.create` data takes the resolver's values. The `brief.submitted` event adds `postStyle`.
- **`queueEntrySchema`** (`campaign/queue.ts`): `goal` → `z.string().trim().optional()`; `tone` → optional; `postStyle: z.string().trim().max(40).optional().nullable()`. The routes (create, PATCH, batch) call a shared `resolveEntryStyle(campaign, entry)` helper in `queue.ts` that wraps `resolvePostStyle` (surface `queue`), returns the 400 response on `ok: false`, and feeds `toEntryCreateData`, which grows the resolved `postStyle`, `goal` and `tone` parameters. The batch route reports the failing index: `Entry 3: Unknown post style 'x'`.
- **Campaign routes:** `defaultPostStyle: z.string().trim().max(40).nullish()` (create) and `.nullable().optional()` (PATCH), checked with `isStyleKey` (retired allowed only if unchanged: the PATCH compares to the stored value).
- **MCP and ACP:** `GeneratePostArgs` gains `postStyle?: string`; `goal` and `tone` become optional (`goal` is passed as `legacyGoal`; the tool descriptions say it picks a style only when no `postStyle` is given). `src/mcp/server.ts` schema: `required: ['topic','channels','designMode']`, a `postStyle` property with the enum of active keys (`activeStyles().map(s => s.key)`), and descriptions that say `goal` is ignored. `src/app/api/acp/run/route.ts:65`'s required list drops `goal` and `tone`. The manifest (`acp/agent.ts`) gets the same, `version: '1.2.0'`, and `postStyle` and `factsCheck` in `output`. `generatePost` resolves with the campaign it already loads for the team check (`generate.ts:43-52`, widened to select `defaultPostStyle` and `defaultTone`).
- **Draft GET** (`drafts/[id]/route.ts:190-202`): adds `factsCheck: parseFactsCheck(draft.factsCheck)` and `postStyle: styleSummary(parsePostStyleStamp(draft.postStyle))` (`{ key, label, version }` or null). `src/lib/api-types.ts` gains both on the draft type and `postStyle`/`defaultPostStyle` on `Campaign` and the queue entry type (`heldReason`).

## 9. Prompts

`checklistPromptText(key, version, scope)` returns `''` for an empty scope and otherwise:

```
Content rules for this post (post style: <label>). They outrank the brand voice and the campaign briefing where they conflict. "Stated in the brief" means the value appears in the topic, the description, the campaign briefing or the brand voice text. If a value is not stated, do not write it.
- <rule.text>
- …
```

| Builder                                                     | Change                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BriefInput` (`providers/interfaces/CopyProvider.ts`)       | new optional `captionRules?: string`                                                                                                                                                                                                                                                                                                            |
| `buildBriefInput` (`agent/briefInput.ts`)                   | reads `brief.postStyle`; null → no rules; else `resolvePostStyle({ style: brief.postStyle, path, aspectRatio, surface: 'regenerate' })` and sets `captionRules = checklistPromptText(key, version, 'caption')`. Unresolvable key → throws `Post style "x" is not available` (fails the generation or the action with that message; fail closed) |
| `buildCaptionPrompt` (`prompts/caption.ts:66-73`)           | after the `Tone:` line, `\n\n${brief.captionRules}` when present, before "Write the following"                                                                                                                                                                                                                                                  |
| `buildPathAUserMessage` (`prompts/pathA.ts:53-86`)          | optional `imageRules?: string`, placed after the brief fields                                                                                                                                                                                                                                                                                   |
| `buildPathBUserMessage` (`prompts/pathB.ts:100-126`)        | optional `imageRules`, placed after the headline block and the image section                                                                                                                                                                                                                                                                    |
| background decision prompt (`prompts/background.ts:95-108`) | optional `imageRules`, after `Tone:`                                                                                                                                                                                                                                                                                                            |
| refine system prompt (`prompts/refine.ts`)                  | optional `imageRules`, from `rulesAtStamp(draft stamp, 'image')`                                                                                                                                                                                                                                                                                |

`runPathADesign` and `runPathBDesign` (`pathA.ts:52`, `pathB.ts:79`) compute `imageRules` from the brief (the same `postStyle` read as above; one `imageRulesFor(brief)` helper next to `buildBriefInput`) so first generation, scheduled generation and regenerate design share one path. A null-style brief passes `undefined` and the builders emit exactly today's text (golden test at the base commit).

**Precedence statement and the briefing.** The preamble says the rules outrank the voice and the briefing. That is a request to the model and not an invariant; the facts check is the invariant. A briefing that itself states a price makes that price a stated value, which the rules and the check both honour.

`PROMPT_VERSION` and `CAPTION_PROMPT_VERSION` change (section 5). `modelArgParity.test.ts` and the model-calls recorder are untouched.

## 10. The scheduler

```ts
// generationRunner.ts, after generateDraftForBrief returns
const check = parseFactsCheck(draft.factsCheck) // the sync path always wrote one
const gated = entry.postAction !== 'HOLD' && (!check || check.status !== 'clear')
if (gated) {
  heldReason = heldReasonFor(check) // fixed sentences, ≤ 300 chars
} else {
  await executePostAction(entry, draft)
}
await prisma.scheduledGeneration.update({
  where: { id: entry.id },
  data: {
    status: 'COMPLETED',
    draftId: draft.id,
    errorReason: null,
    nextRetryAt: null,
    heldReason: heldReason ?? null,
  },
})
```

- A missing or unparsable check on an auto-publish entry is gated (fail closed); it cannot occur on the sync path by construction, and the guard is there for a future refactor.
- `heldReasonFor` is pure and unit-tested: up to five values, "and N more", fixed prefix, cut at 300 characters.
- `executePostAction` keeps its signature (`generationRunner.ts:97-128`); the gate sits at its call site, so the 023 unit tests of it do not change.
- `ensureBrief` (`generationRunner.ts:70-96`): resolves (FR-12), throws the named error on `ok:false`, writes the four fields. It takes the campaign through `prisma.campaign.findUnique` for its defaults (one query, only when `entry.postStyle` is null, since a stored key does not need the campaign's default; the campaign's tone default is read in both cases).
- The `scheduled_generation.settled` event gains `postStyle` and `held`.
- `POST /api/campaigns/[id]/queue/[gid]/rerun` clears `heldReason` with the other reset fields.

## 11. UI

- **`PostStylePicker`**: (on step 1) a radio-card group (`role="radiogroup"`, one card per `activeStyles()` entry: label and summary, selected state with the Graphite accent ring), built from existing atoms; keyboard arrow navigation like the aspect-ratio picker in `SizeDesignStep.tsx`. It is rendered in `SizeDesignStep.tsx` (step 1); the Goal `Select` in `ContentStep.tsx` is removed and Tone stays there, as today.
- **`useBriefWizard`**: new state `postStyle` (initial: campaign default if `isStyleKey`, else `general`), `toneTouched`, `imageStyleTouched`. `setPostStyle(key)` calls `resolvePostStyle` (surface `wizard`) and sets tone and imageStyle for the untouched fields. `selectCampaign` sets `postStyle` from the campaign's `defaultPostStyle` and re-resolves the same way (replacing `useBriefWizard.ts:441-450`'s own tone matching). `handleGenerate` sends `postStyle`, and `tone`/`imageStyle` only when touched; `goal` is dropped from the body. `UseBriefWizardResult` drops `goal`/`setGoal` and adds `postStyle`/`setPostStyle`. `app/(app)/brief/page.tsx:80-83,109` is updated. `useCurrentUser`, `useCaptionRoute` and the rest are untouched.
- **Where the picker lives (decided 2026-10-24):** `PostStylePicker` is rendered by `SizeDesignStep` at the top of step 1, above the size and design choices. `useBriefWizard` re-resolves the untouched image style whenever the style, the size or the design path changes, so the image-style picker on the same step shows the style's default (with a "from the post style" hint) until the user picks. Tone is pre-filled for step 2 from the same call. `ContentStep` loses the Goal `Select` and keeps Tone. Wizard E2E suites that step through step 1 may need their interaction updated (the picker is new on that step; General is preselected).
- **`ContentStep`**: the "Enhance with AI" call (`/api/briefs/enhance`) still sends `goal` (`enhance` body, `ContentStep.tsx:46-48`); it now sends the resolved goal from the selected style's current version (the route's `goal` is an optional string, `briefs/enhance/route.ts:13`; unchanged).
- **`ReviewStep`**: rows "Post style", "Tone" (resolved), "Image style" (resolved, with the "(from the post style)" hint when untouched). The `Goal` row goes.
- **`briefDraftPayload.ts`**: `postStyle: z.string().max(40).optional()`; `goal` stays as `z.string().max(100)` but becomes `.optional()` with a default of `awareness` on read, so old rows parse and new autosaves omit it. The `isTrivialBriefDraft` helper is unchanged.
- **Campaign pages**: the detail page's inline `Select` (admin-only, `PATCH`), the create modal field, and a label chip on the list card (an existing `TAG` style). `QueueEntryModal.tsx` replaces the Goal `Input` with a `Select` of `activeStyles()` (initial: the campaign default or `general`), keeps Tone as an `Input`, and sends `postStyle`. `ScheduledQueueSection.tsx:184` gains the held line; `BriefingAssistantPanel.tsx` is unchanged (its rows keep `goal` and `tone`).
- **`FactsCheckNotice`**: `Notice tone="warning"`, `role="status"`, `data-testid="facts-check-notice"`, an icon from the existing `ICON` set, the sentence from the spec, each value in `<code>`-style mono text with its place. Rendered beside `CompositionNotice` (`drafts/[id]/page.tsx:517-520`). `GeneratedWith` gets a sibling `PostStyleLine`.

## 12. Analytics

`catalogue.ts` additions, all optional:

```ts
// brief.submitted
postStyle: z.enum(POST_STYLE_KEYS).optional(),
// generation.finished
postStyle: z.enum(POST_STYLE_KEYS).nullable().optional(),
factsStatus: z.enum(['clear','flagged','error']).nullable().optional(),
factsFlagCount: z.number().int().min(0).max(20).optional(),
// scheduled_generation.settled
postStyle: z.enum(POST_STYLE_KEYS).nullable().optional(),
held: z.boolean().optional(),
```

`POST_STYLE_KEYS` is imported from `postStyles` (the 006 rule: vocabularies are imported, never copied); `analyticsCoverage.test.ts` is extended to cover it. `emitGenerationFinished` (`generateDraft.ts:225`) reads `postStyle` from `brief.postStyle` and the check from `trace.design`/the written draft (the sync path has the object; the async lifecycle reads `draft.factsCheck` after `refreshFactsCheck`, so the interactive event is emitted after the refresh). `queries.ts` gains `postStyles(range)`, using tagged-template `$queryRaw` like its neighbours, and a pure `shapePostStyles(rows)` that fills one row per dataset style (zeros for unchosen) and computes `flagRate = ratio(flagged, generations)`. `sections.tsx` gets `PostStylesSection` with `InsightSection`, `DataTable` and `RateBar` (the 006 atoms), id `post-styles`.

## 13. Mock seams and the test plan

**`testHooks.ts`**: `buildMockCaptionReply(topic, targets)` appends, per sentinel found in `topic`, an invented value to every caption (and, for `__MOCK_FACT_HEADLINE__`, only to the headline). The values are constants: `$49`, `35% off`, `30 March 2027`, `1,250 customers`. No sentinel contains a digit (so a sentinel never becomes its own supported value). A topic with no sentinel yields the byte-identical reply of today. A new check-failure seam, `__MOCK_FACT_ERROR__` in the topic, makes `refreshFactsCheck` / the sync path store `status: 'error'` (a thrown error inside the check, caught by the wrapper).

**Unit** (`npm run test:unit`, browser-free; baseline 3283):

- `postStylesDataset`, `postStylesResolve` (the AC-03 table, run per surface), `postStylesStamp`, `postStylesPrompts` (exact text per style and scope; the golden comparison of the null-style prompts against the pre-027 builders, stored as fixture strings captured from the base commit; the refine-at-stamped-version case), `postStylesBoundary` (NFR-02, NFR-10).
- `factsCheckExtract` (per family and per exemption; digit sets; never throws), `factsCheckCompare` (the support rule; kind-strictness; the widening), `factsCheckCorpus` (the 24-plus case exact-set bar), `factsCheckRefresh` (fake prisma: the write points, `error` on failure, PENDING skipped, other actions leave it alone), a timing test for NFR-06.
- `postStylesApi` (briefs, queue, batch, campaign, MCP, ACP validation and old-payload acceptance), `postStylesHold` (`heldReasonFor`, the gate, `ensureBrief` failure), `postStylesAnalytics` (the catalogue fields and `shapePostStyles`).
- Existing tests adapted, never deleted: `designDataBoundary` (walks `src/lib/postStyles` and `src/lib/factsCheck` too), `mcpGetDraft` (the manifest drift test: new keys, version), `captionWriters` (the version constant), the prisma fakes that build a `brief` or a `draft` (new optional columns), `briefDraftPayload`/`briefImageStyle` tests (optional `goal`).

**Real render** (`npm run test:render`, 47): unchanged; nothing in this phase touches the renderer.

**E2E §AE** (`tests/e2e/post-styles.test.ts`, mock mode, serial; `docs/e2e-test-plan.md` gets the section). Cases TC-PS-01 onward:

- the wizard: the picker on step 1 above the size choices (General or the campaign default preselected) and no Goal select on the Content step; the image-style picker on step 1 pre-filled from the style; style pre-fills tone and the image style; the touched rule (tone and image style); campaign default selected; the Review rows; 9:16 and Path A show Classic; the request body (via a response listener created **before** the action, the 023 lesson); resume with a stored and an unknown key;
- the inputs: `POST /api/briefs` with and without `postStyle`, unknown key 400, legacy body 201; the queue and batch validation; campaign PATCH (admin 200, editor 403);
- generation and the check: the seeded set of briefs (a price, a percentage, a date, a number, a headline-only value, each a separate brief) shows the notice with exactly those values; clean briefs (values stated in the topic, in the description, in the campaign briefing, in a campaign document) show none; the exemptions brief (24/7, a list marker) shows none; a regenerate-copy and a manual caption edit recompute;
- the scheduler (`POST /api/test/generation-tick`): SCHEDULE_PUBLISH and PUBLISH_NOW held with no Post row and the queue line shown; the clean pair publishes; HOLD unaffected; the forced-error entry held; rerun clears the reason; an entry with an unknown stored key (seeded through the DB seam the 023 suite uses) fails with the named reason;
- MCP and ACP generate with and without `postStyle`: the result fields; the manifest;
- analytics and the insights page: seeded events, hand-counted figures, zero rows for unchosen styles, access;
- a screenshot sweep (not a case): step 1 with the picker, the Content and Review steps, the notice, the queue line and the insights section at 390 px and 1440 px, light and dark, into the gitignored `ui-captures/027/`.

**Baselines and the gate.** unit 3283/3283; render 47/47; lint 0 errors / 7 warnings; full clean mock E2E 473 passed / 3 skipped / 0 failed / 1 flaky as given for the base; a task may add cases and may not lower a pass count or add a lint warning. Base commit for diff checks: `e283005`.

## 14. File changes map

**New:** the files of the spec's file map: `src/lib/postStyles/*` (6), `src/lib/factsCheck/*` (7), `src/components/brief/PostStylePicker.tsx`, `src/components/drafts/FactsCheckNotice.tsx`, the migration, the down script, 12 unit test files, one fixture, one E2E file.

**Modified**, by task:

- T1 (schema): `prisma/schema.prisma`.
- T2 (resolver, stamp, text): `src/lib/designData/` is **not** modified; `src/components/brief/constants.ts` (tone list moves; labels stay).
- T4 (prompts, stamps, check write points): `src/lib/agent/{briefInput,generateDraft,pathA,pathB,background}.ts`, `src/lib/agent/prompts/{caption,pathA,pathB,background,refine,shared}.ts`, `src/providers/interfaces/CopyProvider.ts`, `src/lib/drafts/revisions.ts`, the five revision writers, `src/lib/captions/store.ts`, `src/app/api/drafts/[id]/{regenerate-design,regenerate-copy,refine}/route.ts`, `src/lib/testHooks.ts`.
- T5 (surfaces and scheduler): `src/app/api/briefs/route.ts`, `src/app/api/campaigns/{route,[id]/route}.ts`, `src/app/api/campaigns/[id]/queue/{route,[gid]/route,batch/route,[gid]/rerun/route}.ts`, `src/lib/campaign/queue.ts`, `src/lib/scheduler/generationRunner.ts`, `src/mcp/{server.ts,tools/generate.ts}`, `src/acp/agent.ts`, `src/app/api/acp/run/route.ts`, `src/app/api/drafts/[id]/route.ts`, `src/lib/api-types.ts`.
- T6 (UI): the wizard files, `src/lib/brief/briefDraftPayload.ts`, the campaign pages and queue components, `src/app/(app)/drafts/[id]/page.tsx`, `GeneratedWith.tsx`.
- T7 (analytics): `src/lib/analytics/{catalogue,queries}.ts`, `src/components/admin/insights/sections.tsx`, the three emitters.
- T8 (docs): `docs/handoff.md`, `docs/e2e-test-plan.md`, `CLAUDE.md`, `.specclaw/ROADMAP.md`.

**Must not change:** `src/lib/designData/**` (no layout, region, contract or stamp change), `src/lib/renderer/**`, `src/lib/agent/claudeCli.ts`, `src/lib/scheduler/heartbeatStatus.ts`, `src/app/api/scheduler/status/route.ts`, the verifier prompt (`VERIFIER_SYSTEM` golden test). `git diff --name-only e283005 -- src/lib/designData src/lib/renderer src/lib/agent/claudeCli.ts` lists nothing.

## 15. Key decisions

1. **A sibling module, not `designData`.** Different readers and a different change cadence; keeps 007's boundary rule untouched (section 1).
2. **Facts are checked in code, with kind-strict matching for the values that hurt.** Cheap, deterministic, testable with a seeded corpus; false positives land on the safe side.
3. **The check runs for every generation, styled or not.** The guard must not depend on the thing that might be missing (a null style).
4. **The scheduler holds only the post action, and still settles `COMPLETED`.** The generation succeeded and a retry would waste model time; the draft is there for a person.
5. **The stored result holds no text.** Numbers and places only; the notice is built from them; analytics never gets them.
6. **`goal` stays a snapshot column with a server-only writer.** Removing it is out of scope; `postStyle` tells snapshot rows from user-chosen rows.
7. **Prompt versions derive from `POST_STYLES_REVISION`.** One edit, one bump, with no manual step to forget.
8. **Interactive checks are best-effort and non-atomic; the scheduled check is atomic.** The cost of a stale notice is low; the cost of a stale scheduled decision is not.
9. **Resolver `surface` is data.** Per-surface behaviour is one `Set` in one file.
10. **No image-look change.** Defaults use today's two looks and `classic`; phase b owns the rest.

## 16. Risks and mitigations

| Risk                                                     | Mitigation                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The check flags too much and holds good scheduled posts  | The safe direction; the "Post styles" section shows the flag rate and held count; the support rule is deliberately generous (sources unstripped, bare numbers matched across kinds); exemptions are data in one file. The first operator review of the rate is in the handoff |
| The check misses an invented fact with no number         | Stated limit L6; the checklist rules and the preamble address it; a real-model look (OP-1) is optional                                                                                                                                                                        |
| A pre-027 queued auto-publish entry is held after deploy | Intended; release note in the handoff checklist (FR-16)                                                                                                                                                                                                                       |
| `PROMPT_VERSION` string change touches tests or stamps   | The column is TEXT; the catalogue cap is 40; a unit test pins the suffix                                                                                                                                                                                                      |
| `currentRenderStamp` gains a required parameter          | A type error at the two call sites, fixed in T4; the carry-forward writers use `draftPostStyleStamp`                                                                                                                                                                          |
| MCP/ACP clients that sent `goal`                         | `hiring` and `announcement` map to their styles, anything else to `general`; an explicit style wins; manifest minor bump; release note                                                                                                                                        |
| The wizard's touched-flag logic drifts from the resolver | The wizard calls the resolver; the server resolves again on submit from the same function; E2E asserts the stored values equal the Review step's                                                                                                                              |
| Regex cost on huge inputs                                | Caps (200 000 / 20 000) and a 50 ms unit assertion; the patterns avoid nested quantifiers                                                                                                                                                                                     |
| Shared databases                                         | Every DB command carries an explicit `DATABASE_URL` (NFR-08)                                                                                                                                                                                                                  |

## 17. Panel findings

Each of the 27 upheld findings is traced to a requirement, to 027b, or to "out of scope" in the spec's "Panel findings → where addressed" table. The design-level answers: findings 1 and 2 are sections 4 and 8; 3 is sections 5, 6 and 9; 6 is section 3's guard; 18 to 20 are sections 6, 8 and 10; 22 is section 7; 23 to 25 are sections 3 and 5; 27 is section 3's rule shape.

## 18. Grounding sources

`src/components/brief/{constants,ContentStep,SizeDesignStep,ReviewStep,useBriefWizard}.ts(x)`; `src/lib/brief/{imageStyle,briefDraftPayload}.ts`; `src/app/api/briefs/route.ts`; `src/lib/agent/{generateDraft,briefInput,pathA,pathB,background}.ts`; `src/lib/agent/prompts/{caption,pathA,pathB,background,refine,shared}.ts`; `src/lib/designData/{index,composition,stamp}.ts`; `tests/unit/{designData,designDataBoundary}.test.ts`; `src/lib/drafts/{revisions,draftActions}.ts`; `src/lib/captions/{store,headline}.ts`; `src/lib/scheduler/generationRunner.ts`; `src/lib/campaign/{queue,briefing,documents}.ts`; `src/mcp/{server.ts,tools/generate.ts}`; `src/acp/agent.ts`; `src/app/api/acp/run/route.ts`; `src/lib/analytics/{catalogue,queries}.ts`; `src/components/admin/insights/sections.tsx`; `src/components/drafts/{CompositionNotice,GeneratedWith}.tsx`; `src/lib/testHooks.ts`; `prisma/schema.prisma`; the 006, 009 and 024 specs and designs for house style.
