# Design: Brand-kit design rules, detector and upgrade

**Change:** 007-brandkit-design-system
**Created:** 2026-10-23
**Spec:** [spec.md](spec.md) (FR/NFR/AC numbers below refer to it)

## Technical Approach

**One finder, deterministic.** `detectVagueDesign(text)` (pure) turns the editor text into candidates: a quote, a position and a dataset entry key. The live panel shows them at once with the dataset's own suggestion. The AI upgrade sends the same candidates to the model, which only writes the measurable wording for each, inside the entry's allowed ranges. The model never picks an anchor, a kind, an entry key or a provenance (FR-06, FR-08). Code builds every `Edit` from the candidate and validates the model's wording (FR-07).

**Authoring data is a separate module.** `src/lib/designData/authoring/` is not re-exported by `designData/index.ts`. Generation prompt builders import `@/lib/designData` and so can never reach the authoring keys; a guard test also scans the generation-side directories for a direct import (FR-16, AC-16).

**The editor is the commit point.** Accepting an edit writes into the textarea. The existing Save creates and activates a version through the unchanged route. The server therefore never sees an accept, which is why uptake is measured by version count (FR-17) and why a base-version check on Save is client-side only (FR-13).

**The review logic is a pure reducer** (`src/lib/kitUpgrade/review.ts`), so the repo (which has no jsdom or React testing library) can unit-test staleness, apply and dismiss, and a non-kit host can reuse it (AC-15). The hook and panel are thin.

**Improve with AI** gains one additive response field, `lostRules`, computed by the same pure `measurableTokens` the detector family uses (FR-15).

## Architecture

### Flow (text)

```
KitDetail ─ PromptSection (New Version view)
   textarea text ──(300 ms debounce, browser)──► detectVagueDesign(text)  [authoring/detect.ts, pure]
                                                      │ candidates + suggestionFor()
                                                      ▼
                                              RuleReviewPanel: flagged rows (live, free)
   click "Upgrade"  (disabled while a request is in flight or text empty)
        │  request(text) = POST /api/admin/brandkits/[id]/prompts/upgrade { text, baseVersion }
        ▼
   withTeamAdmin ─ kit by id, kit.teamId === user.teamId (404)
        ├─ active.version !== baseVersion ──► 409 STALE_BASE            (no model call)
        ├─ detectVagueDesign(text) = [] ────► 200 none/no-candidates     (no model call)
        ├─ resolveAssistantModel('ASSISTANT_BRANDKIT') ─► 422 on AssistantModelError
        ├─ build prompt: system + roles + candidates + fenceUntrusted(text)
        ├─ MOCK_AI ? buildMockKitUpgradeReply : runBriefingModel (withClaudeAuth)
        ├─ extractFencedJson(reply, 'kitedits', schema)
        │       !ok ─► log raw reply (2000 chars) ─► 502 UPGRADE_PARSE_FAILED
        ├─ validateProposals(candidates, proposals, kit, text) ─► edits[], rejected[]
        ├─ setProvenance(edit)  (code)
        └─ edits.length ? 200 edits : 200 none (model-proposed-none | all-rejected)
        ▼
   reducer: proposed(edits) ─ per edit: locateEdit(currentText) exactly once ? pending : stale
   accept(id) ─ applyEdit(text) ─ setText ─ textChanged(newText) re-checks the rest
   Save (existing) ─ client: refetch GET prompts; active.version != baseVersion ? confirm : save
        ▼
   POST /prompts (unchanged) ─ new active BrandKitPrompt version
```

### The authoring dataset

`src/lib/designData/authoring/`:

| File            | Content                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------- |
| `index.ts`      | the only entry point: re-exports the rest and an `authoring` object `{ entries }`             |
| `entries.ts`    | the seven `AuthoringEntry` records (FR-01) and `getEntry(key)`                                |
| `measurable.ts` | `isMeasurable`, `measurableTokens`, the unit and reference-object tables (FR-02)              |
| `detect.ts`     | `detectVagueDesign`, `suggestionFor`, `Candidate` (FR-03)                                     |
| `validate.ts`   | `validateProposals`, `setProvenance`, the `Edit` and `Rejection` types, limits (FR-07, FR-08) |
| `roles.ts`      | `buildRoleList(kit)` and `containsForbidden(text, kit)` (FR-09)                               |

```ts
export type Category = 'size' | 'spacing' | 'proportion' | 'colour-share'
export interface SlotRange {
  min: number
  max: number
  unit: string
} // unit: '%','px','x','letters', ...
export interface AuthoringEntry {
  key: string // 'logo-clear-space'
  category: Category
  label: string // 'Clear space'
  triggers: readonly RegExp[] // whole-phrase, case-insensitive, source strings kept as data
  nouns?: readonly string[] // for ambiguous single-word triggers: a design noun within 3 words
  form: 'replace' | 'insert'
  template: string // 'Keep {gap} of clear space on every side of the logo lockup.'
  defaults: Record<string, number>
  ranges: Record<string, SlotRange>
  rationale: string
  mockReplacement: string // test seam only
  source: string // provenance note
}
```

`triggers` are stored as regex source strings with the `iu` flags applied at compile time, so the dataset stays serialisable and unit-testable as data. The detector runs each over the original string with `matchAll` (never a lower-cased copy; AC-02's `İ` case). The ambiguous single words (`generous`, `ample`, `balanced`, `large`, `soft`) carry a `nouns` list and match only with one of those nouns within three words either side.

**The measurable check** (`measurable.ts`):

```
QUANTITY  = ~?\s*(\d+(\.\d+)?)(\s*(-|–|to)\s*\d+(\.\d+)?)?  |  one..ten (word)
UNIT      = %|px|pt|em|rem|vw|vh|n:n|x|×     (a following \s? is allowed)
REF       = wordmark letter(s) | wordmark capital(s) | cap height | canvas width | canvas height | logo height | logo width
measurable(t) = ∃ QUANTITY immediately followed by UNIT, or QUANTITY followed within 3 words by REF
tokens(t)     = each such span, lower-cased, spaces and ~ removed, en dash → hyphen
```

A bare number ("60", "the 2026 launch", "2 apples") is not measurable. It checks text only; no render is consulted.

**Detector exemption.** After a match, the sentence around it (split on `. ! ? \n`) is tested with `isMeasurable`; a measurable sentence means no candidate. Candidates are sorted by start; an overlapping later match is dropped unless longer, in which case it replaces the earlier (earlier-then-longer, AC-03).

### The upgrade route

`src/app/api/admin/brandkits/[id]/prompts/upgrade/route.ts`, beside `improve/route.ts`, modelled on it (kit lookup, 404, `withClaudeAuth`, `AssistantModelError` to 422). The core is `src/lib/kitUpgrade/upgrade.ts` (`runKitUpgrade({ kit, text, baseVersion, teamId, userId })`), so the route stays thin and the unit tests call the module with a faked model.

```ts
type UpgradeResponse =
  | {
      outcome: 'edits'
      baseVersion: number
      edits: Edit[]
      rejected: Rejection[]
      candidates: number
    }
  | {
      outcome: 'none'
      reason: 'no-candidates' | 'model-proposed-none' | 'all-rejected'
      rejected: Rejection[]
      candidates: number
    }
// errors: 400 zod, 404, 409 {code:'STALE_BASE', activeVersion}, 422 {code,message}, 502 {code:'UPGRADE_PARSE_FAILED', message}
```

**Prompt shape** (`kitUpgrade/prompt.ts`, a pure builder, golden-tested):

````
system:
  You turn vague design instructions in a brand kit prompt into measurable rules.
  For each CANDIDATE below, write the replacement text for its entry. Use only numbers inside the entry's range.
  Refer to fonts and colours ONLY by these role names: <roles>.  Never write a hex value, a URL, a font name or HTML.
  Reply with ONLY a ```kitedits block: [ { "candidateId": string, "replacement": string } ]. You may omit a candidate. You may not add one.
  UNTRUSTED_CONTENT_GUARD
  # Candidates
  - id: logo-clear-space:140 | quote: "generous clear space" | entry: Clear space | template: ... | range: gap 1 to 2 wordmark letters | why: ...
  ...
user:
  # Kit prompt text (UNTRUSTED)
  fenceUntrusted(text)
````

**Validation** (`validate.ts`), in order for each proposal: unknown candidate id; duplicate (first wins); length (8 to 400); sentences (at most 2, split on `. ! ?`); forbidden content (hex `#[0-9a-f]{3,8}`, `https?://`, `<tag>`, a code fence, any kit font name case-insensitive); measurable. Then the **exactly-once check** on the candidate's quote against the posted text (zero or more than one occurrence: `stale-quote`). Passing proposals become an `Edit` built from the candidate (kind from the entry's `form`, quote and entry key from the candidate, the rationale from the entry).

**Provenance** (`setProvenance`): parse every number in the replacement (a range counts both ends) and compare against the entry's `ranges` for matching units (percent against `%` slots, `wordmark letter` against `letters`, `px` against `px`); all inside, and the entry key exists in `getEntry`: `dataset`; otherwise `unverified`. A replacement with numbers that match no slot's unit is `unverified`. The type is `'dataset' | 'unverified'`; `sampled` is absent (spec A3).

**Roles** (`roles.ts`): `buildRoleList(kit)` from `kit.fonts` (`[{name,url}]`: first is "the headline font", second "the body font") and `kit.colors` (`brand colour 1..N`). `containsForbidden(text, kit)` checks the replacement against the font names and all hex strings of `kit.colors`, besides the generic hex check.

**Logging.** One `console.info` line per call with `team`, `kit`, `candidates`, `edits`, `rejected` and the entry keys (no text). The parse-failure line adds `reason` and the first 2000 characters of the reply with newlines escaped. This is the only place a reply is retained (a short, team-scoped server log, as `[captions]` and `[claude-cli]` lines are today).

### The fenced-block helper

`src/lib/agent/fencedBlock.ts`:

```ts
export type FencedResult<T> =
  { ok: true; data: T } | { ok: false; reason: 'missing' | 'invalid-json' | 'schema' }
export function extractFencedJson<T>(
  text: string,
  tag: string,
  schema: z.ZodType<T>,
): FencedResult<T>
```

It builds ` ```<tag>\s*\n([\s\S]*?)``` ` (the tag escaped), takes the **last** match, and returns the three failure reasons distinctly. `extractBrandKitBlock` becomes `const r = extractFencedJson(text, 'brandkit', schema); return r.ok ? r.data : null`. Its behaviour is pinned by a parity test against the existing fixtures before the swap. The briefing and schedule extractors keep their own code (follow-up).

### The review core, the hook and the panel

`src/lib/kitUpgrade/review.ts` (pure; imports only types and `authoring/detect` for the live flags):

```ts
export type EditStatus = 'pending' | 'accepted' | 'rejected' | 'stale'
export interface ReviewState { baseText: string; edits: Array<{ edit: Edit; status: EditStatus }>; dismissed: ReadonlySet<string> }
locateEdit(text, edit): { start: number; end: number } | null     // quote occurs exactly once, else null
applyEdit(text, edit): string                                     // replace: swap the quote; insert: add edit.replacement after the sentence containing the quote
reviewReducer(state, action): ReviewState                         // proposed | accept | reject | textChanged | dismiss | reset
dismissKey(entryKey, quote): string
```

`accept` is a no-op on a `stale` edit. `textChanged(text)` re-runs `locateEdit` for every `pending` edit and marks the unmatched ones `stale`, and drops a dismissal whose quote no longer occurs.

`src/components/textUpgrade/useRuleReview.ts`:

```ts
useRuleReview({ text, setText, request }: { text: string; setText(t: string): void; request(text: string): Promise<UpgradeResponse> })
  => { flags, upgrading, error, outcome, edits, upgrade(), accept(id), reject(id), dismiss(key) }
```

The hook owns the 300 ms debounce for `flags`, the in-flight guard, and the rule that a response is applied only if the text it carried equals the current text. It takes no kit id: the kit host builds `request`.

`src/components/textUpgrade/RuleReviewPanel.tsx` renders from the hook: a labelled region (`role="region"`, `aria-label="Design rules"`) listing flags (quote, label, suggestion, Dismiss), the "Upgrade" button, then the edit cards (removed text struck through beside inserted text, provenance chip, rationale, Accept and Reject) and the outcome messages. It uses `Button`, `Notice`, `PILL_BADGE` and the other atoms from `src/components/ui/`; no raw colour, no new class string.

**`PromptSection.tsx` changes:** an "Improve this version" button on the Active view seeds the editor and `baseVersion`; the New Version view mounts the panel under the textarea; the Save note and the stale-base confirm wrap the existing `saveVersion`; the Improve handler reads `lostRules` and shows the warning. The existing `generate`, `improve` request bodies and the `saveVersion` request are unchanged.

### Improve with AI, lost rules

`improve/route.ts` adds, after `draft` is obtained: `const lostRules = lostMeasurableRules(currentPrompt, draft)` and returns `{ draft, lostRules }`. `lostMeasurableRules(before, after)` (in `authoring/measurable.ts`) returns the original span text (not the normalised token) for each token of `before` whose normalised form is absent from `measurableTokens(after)`. The route's prompt string and mock draft are unchanged.

### Boundary guard

`tests/unit/designDataBoundary.test.ts` walks the file tree:

- generation side: `src/lib/agent/**`, `src/lib/brandkit/systemContext.ts`, `src/lib/captions/**`, `src/lib/drafts/**`, `src/scheduler/**`, `src/app/api/{briefs,drafts,generate,acp}/**`, `src/mcp/**` must not match `designData/authoring` in any import specifier (absolute or relative);
- `src/lib/designData/index.ts` must not mention `authoring`;
- the pure files (`authoring/*`, `kitUpgrade/review.ts`) import only `zod`, other pure files and types, never `prisma`, `minio`, `fs`, `puppeteer`, `@/lib/env`;
- `kitUpgrade/review.ts`, `components/textUpgrade/*` import nothing from `@/lib/brandkit`, `components/admin`, `@/lib/prisma`;
- every `AuthoringEntry.template`, `defaults` text and `mockReplacement` is free of placement words and `ArchetypeKey` literals.

## File Changes Map

| File                                                                                                                                                                                                         | Change                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `src/lib/designData/authoring/{index,entries,measurable,detect,validate,roles}.ts`                                                                                                                           | new (T1)                                                                 |
| `src/lib/agent/fencedBlock.ts`                                                                                                                                                                               | new (T1)                                                                 |
| `src/lib/brandkit/assistant.ts`                                                                                                                                                                              | `extractBrandKitBlock` rewritten on the helper, behaviour unchanged (T1) |
| `src/lib/kitUpgrade/{upgrade,prompt,review}.ts`                                                                                                                                                              | new (`review.ts` T1, `upgrade.ts` and `prompt.ts` T2)                    |
| `src/app/api/admin/brandkits/[id]/prompts/upgrade/route.ts`                                                                                                                                                  | new (T2)                                                                 |
| `src/app/api/admin/brandkits/[id]/prompts/improve/route.ts`                                                                                                                                                  | additive `lostRules` (T2)                                                |
| `src/lib/testHooks.ts`                                                                                                                                                                                       | `buildMockKitUpgradeReply` and the four sentinels (T2)                   |
| `src/lib/api-types.ts`                                                                                                                                                                                       | `UpgradeResponse`, `Edit`, `Rejection` types (T2)                        |
| `src/components/textUpgrade/{useRuleReview.ts,RuleReviewPanel.tsx}`                                                                                                                                          | new (T3)                                                                 |
| `src/components/admin/brandkits/PromptSection.tsx`                                                                                                                                                           | seed button, panel, Save note, stale confirm, lost-rule warning (T3)     |
| `tests/unit/{designAuthoring,designMeasurable,designDetect,designLostRules,kitUpgradeValidate,kitUpgradePrompt,kitUpgradeRoute,kitUpgradeReview,fencedBlock,designDataBoundary,generationUntouched}.test.ts` | new (T1, T2)                                                             |
| `tests/unit/fixtures/hearts-kit-adjectives.ts`                                                                                                                                                               | new (T1)                                                                 |
| `tests/e2e/kit-upgrade.test.ts`                                                                                                                                                                              | new, section AC (T3)                                                     |
| `docs/handoff.md`, `docs/e2e-test-plan.md`, `CLAUDE.md`, `.specclaw/ROADMAP.md`                                                                                                                              | docs (T4)                                                                |

**Unchanged on purpose:** `prompts/route.ts`, `prompts/[promptId]/activate/route.ts`, `src/lib/agent/prompts/**`, `src/lib/brandkit/systemContext.ts`, `src/lib/designData/index.ts` and the composition files, `prisma/**`.

## Data Model Changes

None. No migration, no down script, no env var. The accepted edits save as an ordinary `BrandKitPrompt` version.

## API Changes

| Route                                                     | Change                                                  |
| --------------------------------------------------------- | ------------------------------------------------------- |
| `POST /api/admin/brandkits/[id]/prompts/upgrade`          | new; `withTeamAdmin`; contract in FR-05                 |
| `POST /api/admin/brandkits/[id]/prompts/improve`          | response gains `lostRules: string[]`; `draft` unchanged |
| `POST /api/admin/brandkits/[id]/prompts` and `…/activate` | unchanged                                               |

## Key Decisions

- **Detector picks anchors; the model fills wording.** One finder, one accept path, a quote that is exact by construction. The cost, a phrase outside the word list gets no edit, is accepted and visible in the live list. Alternative (the model finds phrases) rejected: two finders and an unverifiable quote.
- **Authoring data is outside `designData/index.ts`.** A guard test is weaker than a module boundary; both are used. The proposal's wording ("extend the `designData` object") is amended.
- **Provenance has two values.** The sampler returns hex colours with no counts, so a `sampled` share cannot be computed without changing it. Not worth a sampler change for v1; colour-share edits are `dataset` or `unverified`.
- **Accept writes the textarea; Save is today's route.** Keeps the save route and its E2E untouched and makes review-before-activate the author's reading of the full text. The server cannot see accepts; the client stale-base confirm narrows but cannot close the race.
- **`improve` computes `lostRules` on the server.** It is testable without a browser and any other client of the route gets it; the client only displays.
- **Review logic is a reducer, not component state.** No jsdom in the repo; the reducer carries the stale, apply and dismiss rules and is the host-agnostic seam.
- **Exactly-once quotes.** A phrase repeated verbatim in two places makes both stale. The rule is simple and safe; the edge case is documented.
- **Sentinels in the text, not a new `/api/test` route.** The recorder route already exists; a sentinel in the posted text selects the mock outcome in the existing seam style (hero imagery does the same).
- **Role names by position.** The kit has no font role field (spec A2).

## Risks & Mitigations

| Risk                                                          | Mitigation                                                                                                                                         |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Detector noise (flags prose that is not a design instruction) | design-noun requirement on ambiguous words, whole-phrase patterns, measurable-sentence exemption, session dismiss, the brand-voice fixture (AC-02) |
| Detector misses a phrase the author cares about               | the list is data; the live panel makes misses visible; follow-up                                                                                   |
| A model proposal is wrong or unsafe                           | FR-07 validation, `unverified` label, the author reads every edit and the full text before Save                                                    |
| A measurable-looking number is still wrong for the render     | stated limit: text check only; the dataset ranges are the defence                                                                                  |
| Save puts text live at once                                   | the Save note, the stale-base confirm, the version history and Restore (future posts only), all stated in the UI                                   |
| Two admins save at once                                       | unchanged save route; the confirm narrows it; documented (A4)                                                                                      |
| Prompt injection through the kit text                         | fenced text, guard text, the model cannot set quote, kind, key or provenance, and the replacement checks (NFR-05)                                  |
| Improve with AI still erodes rules                            | `lostRules` flag before Save; it does not block (the user's call)                                                                                  |
| A lost-rule false positive on a reworded rule                 | normalisation of case, spaces, en dash and `~`; a reworded rule shows as lost and the author decides                                               |
| Dataset ranges conflict with a team's house style             | the author edits any number before saving; the number is advisory text                                                                             |
| `extractBrandKitBlock` regression                             | parity test before and after; existing suites unchanged                                                                                            |

## Grounding sources

- `src/lib/brandkit/assistant.ts` (the fenced block, `fenceUntrusted` use, `samplePalette`, `collectBrandKitGrounding`).
- `src/lib/renderer/puppeteer.ts:272` (`sampleImageColors` returns `string[]` hex, no shares; the mock palette).
- `src/app/api/admin/brandkits/[id]/prompts/{route,improve/route}.ts` (the save transaction and 409, the improve flow and the 422 mapping).
- `src/components/admin/brandkits/PromptSection.tsx` (Active, History and New Version views, `saveVersion`).
- `src/lib/brandkit/voiceDraft.ts`, `src/lib/campaign/briefingAssistant.ts` (`resolveAssistantModel`, `runBriefingModel`).
- `src/lib/agent/untrusted.ts` (`fenceUntrusted`, `UNTRUSTED_CONTENT_GUARD`).
- `src/lib/designData/index.ts`, `composition.ts` (the purity rule and guard), `tests/unit/designData.test.ts`.
- `src/lib/testHooks.ts` (`buildMockBrandKitReply` and the seam style), `src/lib/models/modelCalls.ts`, `src/app/api/test/model-calls/route.ts`.
- `CLAUDE.md` (the Hearts table of adjective to measurable, the open drift, the 2026-08-03 `İ` lesson).
- `.specclaw/changes/024-caption-credential-route/{spec,design,tasks}.md` (format), `009-hero-image-design/design.md` (the `designData` module).
