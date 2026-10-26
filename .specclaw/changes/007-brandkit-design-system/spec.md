# Spec: Brand-kit design rules, detector and upgrade

**Change:** 007-brandkit-design-system · **Size:** architectural · **Proposal:** [proposal.md](proposal.md) · **Party:** [party-report.md](party-report.md)
**Created:** 2026-10-23
**Status:** 🟡 Draft

## Overview

Brand kits are authored as prose, and every Hearts Academy design defect that cost a ~5-minute regeneration came from an adjectival instruction ("generous clear space", "similar visual heights", "teal-to-green is the primary canvas"). The recorded fix each time was a number. Nothing in the kit editor helps an author reach that number.

This change adds three things to **kit authoring only**:

1. **An in-house authoring dataset** (`src/lib/designData/authoring/`): for four kinds of design instruction (size, spacing, proportion, colour share), a vague-phrase pattern, a measurable replacement template, a default and an allowed range, and a rationale.
2. **A live detector** in the kit prompt editor. It runs in the browser, debounced, and lists the vague phrases with the dataset's suggestion. No model call, no cost.
3. **A rule-by-rule AI upgrade.** On a click, the server takes the detector's candidates for the editor's current text and asks the model to fill each with a measurable rule from the dataset's allowed ranges. The author accepts or rejects each edit. Accepting writes the edit into the editor text. The author reads the full text and clicks the existing Save.

It also makes "Improve with AI" safer: its rewrite is compared with the text it replaced, and any measurable rule that disappeared is flagged.

**What does not change.** The save route (`POST /api/admin/brandkits/[id]/prompts`) and its activation. No schema, no migration, no env var. No generation prompt, no `PROMPT_VERSION`. Brand-voice words are not flagged. Typography (font pairings, type scale) is a follow-up change.

**What the user decided (2026-10-23, after the party panel), and where each lands:**

| Decision                                                                                                                                                                  | Lands in                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1. Dataset, live detector and rule-by-rule AI upgrade for size, spacing, proportion and colour share; typography is a follow-up                                           | FR-01, FR-03, FR-05 to FR-08; Out of scope |
| 2. Accepted edits are written into the editor text; the author saves with the existing Save; the UI says Save goes live for new posts and restore fixes future posts only | FR-13, AC-12                               |
| 3. Edits refer to fonts and colours by role, never by literal name or hex                                                                                                 | FR-09, AC-09                               |
| 4. "Improve with AI" stays; its rewrite is run through the detector and any lost measurable rule is flagged                                                               | FR-15, AC-14                               |

## Approach

**One component picks anchors: the deterministic detector.** The panel's options were "the detector finds phrases and the model also finds phrases" (two suggestions, two accept paths for one phrase) or "one finder". This spec takes one: `detectVagueDesign(text)` produces the candidates (a quote, a position, a dataset entry key). The model never chooses what to edit and never writes an anchor. It receives the candidates and fills, for each, the replacement's wording and numbers inside the entry's allowed range. Consequences: the quote of every edit is exact by construction against the text the request carried; the detector and the assistant cannot disagree; the live detector shows the same candidates the AI will work on. The price: a vague phrase the word list does not contain is not offered an edit. The list is data and grows (FR-01).

**Base text is the editor's current text.** The request carries that text and the active version number the editor was seeded from. The server checks the version (409 if it moved) and runs the detector on the posted text. Accepting an edit rewrites the textarea only. Nothing is saved until the author clicks Save, which is today's route and activates the version immediately.

**Measurable is defined, and not verified against renders.** A rule is measurable when it states a numeric quantity with a unit, or a numeric multiple of a reference object (FR-02). This is a text check. It does not prove a render obeys the number. The defect was an author-side adjective; this removes that, it does not verify what the model then draws.

**Provenance is attached by code.** The model returns wording. Code decides whether the numbers in it are inside the dataset entry's allowed ranges (`dataset`) or not (`unverified`). `sampled` is not emitted in v1 (see Notes: the sampler returns colours with no shares).

**The generation / authoring boundary is a module boundary.** The authoring dataset lives in `src/lib/designData/authoring/`, which `src/lib/designData/index.ts` does not re-export. A guard test fails if any generation-side file imports it (FR-16).

**Host-agnostic review.** The detector, the anchor and apply logic, and the review controller take plain text and a save/apply callback and know nothing about brand kits. The kit editor is the first host; the campaign briefing editor is the intended second (a follow-up, not built here).

## Requirements

### Functional Requirements

- **FR-01 — The authoring dataset.** `src/lib/designData/authoring/` (new; a separate entry, not re-exported by `designData/index.ts`). Pure and client-safe: no prisma, minio, env, fs, puppeteer or `@prisma/client` runtime import, enforced by the same guard test style as `composition.ts`.
  - **Entries** (`AuthoringEntry`, in `entries.ts`), each with: `key` (stable kebab id, for example `logo-clear-space`), `category` (`size` | `spacing` | `proportion` | `colour-share`), `triggers` (the vague-phrase patterns, FR-03), `form` (`replace` | `insert`: whether the measurable rule replaces the phrase or is inserted as a following sentence), `template` (the replacement text with named slots such as `{gap}`), `defaults` and `ranges` per slot (number, unit), `rationale` (one line shown to the author), `mockReplacement` (used only by the test seam, FR-11), and `source` (a one-line provenance note: public typographic convention or a published standard; in-house, no bytes from any installed design skill).
  - **The v1 entries** (seven):
    | key                | category     | vague phrases it matches                                                                      | replacement states                                                                                                        |
    | ------------------ | ------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
    | `logo-clear-space` | spacing      | generous / ample / plenty of / enough, near clear space, margin, padding, gap, breathing room | clear space of 1 to 2 wordmark-letter heights on every side                                                               |
    | `mark-size-match`  | size         | similar / same / equal (visual) height(s) or size(s), "match" with a size noun                | wordmark capitals of each logo the same height within 5%                                                                  |
    | `element-scale`    | size         | large / big / small / tiny + logo, icon, badge                                                | width as a percent of the canvas width, 12 to 20% for a logo                                                              |
    | `margin-even`      | spacing      | consistent / even / uniform margins, padding, spacing                                         | one px value (32 to 64 px on a 1080 px canvas) on all sides, scaled with the canvas                                       |
    | `canvas-share`     | colour-share | primary / dominant / main canvas, background or colour; "dominates"                           | brand colour 1 covers 55 to 70% of the canvas, brand colour 2 no more than 25 to 30%, accents the rest (60-30-10 pattern) |
    | `whitespace-share` | proportion   | balanced / airy / uncluttered / breathing room (layout sense)                                 | at least 20 to 40% of the canvas free of text and graphics                                                                |
    | `edge-blend`       | proportion   | soft / smooth / subtle + edge, blend, transition, fade                                        | an image edge fades across 10 to 15% of the canvas width                                                                  |
  - **Deliberately absent** (so no conflict with 009): any rule that places or sizes a composition region (which side the image sits on, what share a band takes, region coordinates), and any archetype key. A guard test (AC-16) fails if a template, default or `mockReplacement` contains a placement word (`left`, `right`, `top`, `bottom`, `band`, `region`, `column`) or an `ArchetypeKey` literal. 009 owns composition; the author may write such a rule by hand and the detector will not touch it.
  - **Deliberately absent** (typography follow-up): font pairings and type scales. No entry's `category` is `typography`.
  - **Source.** WCAG 2.2 and the 60-30-10 and modular-proportion conventions are cited by name in `source`; nothing is copied from `ui-ux-pro-max` or `high-end-visual-design` (no licence; decided 2026-09-15).

- **FR-02 — "Measurable" is defined.** `isMeasurable(text)` and `measurableTokens(text)` (pure, in `authoring/measurable.ts`).
  - A **quantity** is a number (digits, a range `45-60` or `45 to 60` with a hyphen or en dash, `~` or "about" allowed, or one of the words `one` to `ten`).
  - A **unit** is one of `%`, `px`, `pt`, `em`, `rem`, `vw`, `vh`, a ratio `n:n`, or a multiplier `x` or `×`.
  - A **reference object** is one of: `wordmark letter`, `wordmark capital`, `cap height`, `canvas width`, `canvas height`, `logo height`, `logo width`.
  - A string is measurable when it holds a quantity with a unit, or a quantity with a reference object ("one or two wordmark letters").
  - `measurableTokens` returns each such span, normalised (lower case, no spaces, en dash to hyphen, no `~`), for the lost-rule comparison (FR-15).
  - **It is a text check.** It does not verify any render against the number. The spec, the UI help text and the handoff say so.

- **FR-03 — The detector.** `detectVagueDesign(text, options?)` (pure, `authoring/detect.ts`) returns `Candidate[]`, each `{ id, entryKey, category, start, end, quote }`.
  - **Matching.** Each entry's `triggers` are whole-phrase, case-insensitive patterns. The ambiguous single words (`generous`, `ample`, `balanced`, `large`, `soft`) match only with a design noun within three words (the entry's noun list), so "a generous offer" and "a soft tone" are not flagged. Matching is by regex over the original string, never by `indexOf` on a lower-cased copy (the Turkish dotted-I length change, 2026-08-03 lesson).
  - **Already measurable is not flagged.** If the sentence holding a match is measurable (FR-02), the match is not a candidate. So "generous clear space (about 1.5 wordmark letters)" is clean.
  - **Design instructions only.** The word list holds no brand-voice word. A fixture of listed brand-voice words (`warm`, `confident`, `friendly`, `bold`, `modern`, `clean`, `professional`, `approachable`) must flag nothing (AC-02).
  - **No overlaps.** Candidates never overlap: of two overlapping matches the earlier start wins, then the longer. Candidate `id` is `<entryKey>:<start>`.
  - **Bounds.** Text longer than 20 000 characters is scanned only up to 20 000 (and the result says `truncated: true`); at most 12 candidates are returned, in text order (`more: true` if there were others).
  - **Suggestion without a model.** `suggestionFor(candidate)` returns the entry's template filled with its defaults, its rationale and its label. The live panel shows it with no AI call.
  - **The Hearts fixtures.** AC-01 uses text built from the CLAUDE.md table: "similar visual heights" (`mark-size-match`), "generous clear space" (`logo-clear-space`), "the teal-to-green gradient is the primary canvas" (`canvas-share`) and "a soft edge where the photo meets the type" (`edge-blend`). The table's first row ("IRP is fine on-image") is a naming permission, not a size, spacing, proportion or colour-share word, and is outside the detector by design; its fourth row had no text to flag (that was the defect). Both are stated in the fixture file.

- **FR-04 — One fenced-block extractor.** `extractFencedJson(text, tag, schema)` (new, `src/lib/agent/fencedBlock.ts`) takes the last ` ```tag ` block, parses it and validates it with the zod schema, and returns `{ ok: true, data }` or `{ ok: false, reason: 'missing' | 'invalid-json' | 'schema' }`. `extractBrandKitBlock` is rewritten on it with **unchanged behaviour** (it still returns the data or null; the existing `brandkit-assistant` unit and E2E cases pass unchanged). The upgrade reply (` ```kitedits `) uses it directly. The briefing and schedule extractors are not touched (follow-up).

- **FR-05 — The upgrade route.** `POST /api/admin/brandkits/[id]/prompts/upgrade` under `withTeamAdmin`, beside `improve`.
  - **Body** (strict zod): `{ text: string (1 to 20 000 chars), baseVersion: integer >= 0 }`. `baseVersion` is the version the editor was seeded from; `0` means the kit had no active prompt.
  - **Checks, in order, before any model call:** the kit exists, is not deleted and is the session team's (else 404); the kit's active version equals `baseVersion` (else **409** `{ code: 'STALE_BASE', activeVersion }`, no model call); the detector finds at least one candidate (else the `none` outcome below, no model call).
  - **Model.** `resolveAssistantModel('ASSISTANT_BRANDKIT', teamId, userId)` and the shared `runBriefingModel` text call, inside `withClaudeAuth(user.userId, user.teamId, …)`. An `AssistantModelError` is `422 { code, message }`, as `improve` does. One call per click, no auto-run, no retry.
  - **Three distinct outcomes** (the party-security finding), plus the errors above:
    | outcome       | HTTP | when                                                                                                             | body                                                                                                                            |
    | ------------- | ---- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
    | `edits`       | 200  | one or more edits passed validation                                                                              | `{ outcome: 'edits', baseVersion, edits: Edit[], rejected: Rejection[], candidates: n }`                                        |
    | `none`        | 200  | the detector found no candidate (no model call), or the model proposed none, or every proposal failed validation | `{ outcome: 'none', reason: 'no-candidates' \| 'model-proposed-none' \| 'all-rejected', rejected: Rejection[], candidates: n }` |
    | parse failure | 502  | the reply has no ` ```kitedits ` block, it is not JSON, or it fails the schema                                   | `{ code: 'UPGRADE_PARSE_FAILED', message }`                                                                                     |
  - **A parse failure is never an empty panel.** The route logs `[kit-upgrade] parse-failed team=<id> kit=<id> reason=<missing|invalid-json|schema> reply=<first 2000 chars, newlines escaped>` and returns the 502. The UI shows an error with a "Try again" button.
  - **Log line** on every call: `[kit-upgrade] team=<id> kit=<id> candidates=<n> edits=<n> rejected=<n> entries=<comma list of entry keys proposed>` (FR-17). No key, no text of the prompt.

- **FR-06 — The model fills, the code anchors.** The model prompt lists each candidate (`id`, `category`, `quote`, the entry's `template`, `ranges`, `rationale`) and the kit's role list (FR-09). The reply is ` ```kitedits ` holding `[ { "candidateId": string, "replacement": string } ]`. The model may omit a candidate. It may not add one: a `candidateId` not in the request is a `Rejection` (`unknown-candidate`). The `quote`, `kind`, `entryKey` and position of every edit come from the candidate, never from the reply.

- **FR-07 — The edit schema and server validation.** An `Edit` is:

  ```
  { id: string            // the candidate id
    kind: 'replace' | 'insert'   // the entry's form
    quote: string         // the exact text in the base; replace: the phrase to remove; insert: the sentence after which to insert
    replacement: string   // replace: text for the quote; insert: the sentence to add
    entryKey: string
    provenance: 'dataset' | 'unverified'
    rationale: string }   // the entry's rationale (from code)
  ```

  A proposal becomes an `Edit` only if every check passes; otherwise it is a `Rejection { candidateId, reason }` with one of `unknown-candidate`, `duplicate`, `too-long`, `too-short`, `not-measurable`, `multi-sentence`, `forbidden-content`.
  - **Exactly-once occurrence.** The server checks that `quote` occurs exactly once in the posted text; the client checks it again against the textarea at apply time. Zero or more than one occurrence: stale (server: `Rejection stale-quote`; client: the edit is shown disabled with "text changed, ask again").
  - **Size and scope.** `quote` at most 160 characters and inside one sentence. `replacement` 8 to 400 characters and at most two sentences. A `replace` whose replacement is less than 8 characters is `too-short` (a deletion is not an upgrade).
  - **Measurable.** `isMeasurable(replacement)` must be true: every proposed edit carries a number with a unit or a reference object (AC-06).
  - **Forbidden content.** The replacement may not contain a hex colour, a URL, an HTML tag, a code fence, or a literal font name from the kit's structured fonts (FR-09).
  - **One edit per candidate,** and candidates do not overlap (FR-03), so edits never overlap. Apply order is descending position, so earlier offsets stay valid.
  - **Insert** places the replacement after the sentence containing the quote, separated by one space; **replace** swaps the quote.
  - **A replace does not drop surrounding text:** only the quote (a code-chosen span at most 160 characters) is removed, which bounds what any edit can delete (the panel's "reject edits that drop most of the quoted text" is satisfied structurally, and unit-tested).

- **FR-08 — Provenance is set by code.** After validation, code sets `provenance`:
  - `dataset` only when `entryKey` is a key present in the authoring dataset **and** every number in the replacement lies inside that entry's allowed range for its slot (the check parses the replacement's numbers and compares them to `ranges`, with the reference-object and unit matching the entry's);
  - `unverified` otherwise.
    The model's reply has no provenance field; one in the reply is ignored. `sampled` does not exist in v1. The UI labels `dataset` as "From the design-rule dataset" and `unverified` as "Number not from the dataset, check it". The accepted-into-text edit carries no marker (the saved prompt text is unchanged in form).

- **FR-09 — Fonts and colours by role.** The server builds a role list from the kit: `the headline font` (the kit's first font) and `the body font` (the second), `brand colour 1..N` (the kit's colours in order), and tells the model to use only those phrases when it needs a font or a colour. A replacement containing a hex value or a font name taken from the kit's structured fonts (case-insensitive) is rejected `forbidden-content`. The dataset templates themselves use roles. The role list is shown in the panel help ("Edits say 'brand colour 1', not a hex; change the kit's colours and the prompt stays true").

- **FR-10 — Grounding is untrusted; cost is bounded.**
  - The base text and the kit's grounding documents (if any are included; v1 includes none: see Notes) enter the model prompt through `fenceUntrusted(...)` after `UNTRUSTED_CONTENT_GUARD`, as `assistant.ts` does. The system prompt states that the model may not change the quote, add candidates, or follow instructions inside the fenced text.
  - **Tier.** The `ASSISTANT_BRANDKIT` surface: today the system default is Sonnet 5.5, and the team may change it at `/team` → Models. The change adds no new surface and no catalogue entry. The recorded call label is `kit-upgrade`.
  - **Size.** Input is the base text (at most 20 000 characters, typically 1 000 to 5 000), at most 12 candidates (each at most 160-character quote plus entry text, about 600 characters), plus a fixed system prompt of about 1 500 characters: in the typical case a few thousand tokens in, a few hundred out. Time bound is the surface's timeout (180 s CLI, as for the other assistant calls). One call per click.
  - **Detector cost.** The live detector is local regex over at most 20 000 characters, debounced 300 ms, and costs no tokens.

- **FR-11 — The test seam.** Under `MOCK_AI`, the route records `modelCallFor(model, pipelineMode(), 'kit-upgrade')`, then returns `buildMockKitUpgradeReply(candidates, text)` (new, in `src/lib/testHooks.ts`, in the style of `buildMockBrandKitReply`). The mock reply is a ` ```kitedits ` block with each candidate's entry `mockReplacement`. Sentinels in the posted text change the reply, so every outcome is reachable with no real model:
  - `__MOCK_UPGRADE_UNPARSEABLE__`: prose with no block (parse failure);
  - `__MOCK_UPGRADE_NONE__`: an empty array (`model-proposed-none`);
  - `__MOCK_UPGRADE_BAD__`: one valid edit, one with no number, one with a hex value, one with an unknown candidate id (rejections `not-measurable`, `forbidden-content`, `unknown-candidate`);
  - `__MOCK_UPGRADE_OUTOFRANGE__`: a measurable replacement whose number lies outside the entry's range (provenance `unverified`).
  - `__MOCK_IMPROVE_DROP_RULES__` (in the active prompt, for the improve route): the mock draft is the prompt with its measurable spans removed, so the lost-rule flag is reachable; without it the mock draft is today's string.
    The `MOCK_AI` branch runs after model resolution and the detector, so the seam still exercises the real validation and provenance code. No route under `/api/test` is added (the model-calls recorder already exists).

- **FR-12 — Host-agnostic review logic.** Three layers, none of which imports a brand-kit module:
  1. **Pure core** (`src/lib/kitUpgrade/review.ts`): `locateEdit(text, edit)` (exactly-once), `applyEdit(text, edit)`, and a reducer `reviewReducer(state, action)` over `{ baseText, edits, status per edit, dismissed }`. Actions: `proposed`, `accept(id)`, `reject(id)`, `textChanged(text)` (re-checks staleness of the pending edits), `dismiss(candidateKey)`, `reset`.
  2. **Hook** (`src/components/textUpgrade/useRuleReview.ts`): `useRuleReview({ text, setText, request })` where `request(text) => Promise<UpgradeResponse>` is supplied by the host. It owns the debounce, the live detector and the reducer. It takes no kit id and no route.
  3. **Panel** (`src/components/textUpgrade/RuleReviewPanel.tsx`): renders flagged phrases, the upgrade button, and per-edit review. It uses the 021 Graphite atoms from `src/components/ui/` only.
     The kit editor passes `request = (t) => POST upgrade {text: t, baseVersion}`. A unit test drives the core with a non-kit host (a plain string and a callback), proving AC-15.

- **FR-13 — Editor integration and what Save means.** In `PromptSection.tsx`, the New Version view gets the panel under the textarea.
  - **Seeding.** "Improve this version" (a button on the Active view, beside "Improve with AI") copies the active prompt into the editor and records `baseVersion = active.version`. A manually written draft has `baseVersion = the active version at the time the editor opened`.
  - **Accept writes into the textarea.** Accepting an edit calls `applyEdit` and `setText`. Nothing is saved. The remaining edits are re-checked against the new text (`textChanged`); an edit whose quote no longer occurs exactly once is shown disabled as stale.
  - **Removed beside inserted.** Each pending edit shows the removed text (struck through) next to the inserted text, the provenance label, and the entry's rationale. An insert shows the sentence it follows.
  - **Save wording.** Above the Save button, a note in plain text: "Save makes this the live prompt for new posts straight away. Restoring an older version later only changes posts you make after that; posts already made keep what they were generated with." The button label stays "Save as new version" (unchanged: the existing flow, existing E2E).
  - **Stale base.** The save route is unchanged and cannot reject a stale base. Before calling it, when the editor was seeded from an upgrade (a `baseVersion` is set), the client refetches `GET /api/admin/brandkits/[id]/prompts`; if the active version differs, it asks "Version N was saved since you started this text. Saving now will replace it as the live prompt. Save anyway?" and saves only on yes. This narrows the race but cannot close it (two admins saving within the same moment still both win in turn, as today); the spec says so.
  - **Dismiss is session-only.** A dismissed flag is held in component state keyed by `entryKey + quote`; it clears on reload or when the editor closes. No schema, no storage.
  - **Errors.** A 409 `STALE_BASE` tells the author to reload (the active version changed); a 502 shows the parse-failure error with "Try again"; a 422 shows the model message; an empty `none` outcome shows which reason (nothing to upgrade, the model proposed nothing, or N proposals failed checks).

- **FR-14 — The live detector.** The panel shows, while the author types in the New Version textarea, the count of flagged phrases and one row per candidate: the quote, the entry label and the model-free suggestion (FR-03). It runs the pure detector in the browser on a 300 ms debounce, only on the editor's text, and never calls the server. Each row has "Dismiss" (FR-13). The count is advisory, never blocks Save, and is not stored.

- **FR-15 — "Improve with AI" flags lost rules.** `POST …/prompts/improve` is changed additively: after drafting, it computes `lostRules = measurableTokens(currentPrompt) \ measurableTokens(draft)` (case, spacing, en dash and `~` normalised) and returns `{ draft, lostRules: string[] }`. The existing `draft` shape and the route's behaviour are unchanged; the field is new. The `PromptSection` shows, above the editor after Improve, "The rewrite dropped N measurable rules: …" listing the original spans, with the editor holding the rewrite as today. It does not block Save. The live detector (FR-14) also runs on the rewrite. The `improve` prompt text is unchanged (golden-compared) so its behaviour does not move.

- **FR-16 — Generation is untouched, and the boundary is guarded.**
  - No file under `src/lib/agent/prompts/`, no `buildBrandKitSystemContext`, no draft or brief route changes, and `PROMPT_VERSION` stays `2026-10-21.1`.
  - A unit test (`designDataBoundary.test.ts`) fails if any file under `src/lib/agent/`, `src/lib/brandkit/systemContext.ts`, `src/lib/captions/`, `src/lib/drafts/` or `src/scheduler/` imports `@/lib/designData/authoring` (or a relative path to it), and fails if `src/lib/designData/index.ts` re-exports it. The only allowed importers are `src/lib/kitUpgrade/`, `src/components/textUpgrade/`, `src/components/admin/brandkits/` and `src/app/api/admin/brandkits/`.
  - A golden test pins `buildBrandKitSystemContext` output for a fixed kit and asserts `PROMPT_VERSION` equals the current literal.

- **FR-17 — Observing uptake, with no schema.**
  - The log line in FR-05 records, per upgrade call, the entry keys the model was asked to fill and the counts of edits and rejections.
  - The evidence query for the handoff counts how many kit-prompt versions each kit gained after the deploy, which is how many Saves followed (an upgrade's accept is invisible to the server, since it lands in the textarea): `SELECT "brandKitId", count(*) AS versions, max("createdAt") AS latest FROM "BrandKitPrompt" WHERE "createdAt" >= '<deploy date>' GROUP BY 1 ORDER BY 2 DESC;`.
  - **Not observable without a column:** which dataset entries an accepted version drew on, and the accept rate. The panel asked to stamp the version with the entry ids; the only no-schema carriers are the prompt text (which would put markers into every generation prompt and break FR-16) and the log (which sees proposals, not accepts). This is **OQ-1**.
  - **Who the authors are.** Team admins only (`withTeamAdmin`): in practice the Bistec team's admin(s) authoring the Bistec and Hearts Academy kits. Editors cannot reach the kit editor or the route (AC-11).

- **FR-18 — The navy/teal drift is an operator step.** The Hearts Academy kit's "teal-to-green is the primary canvas" has no number. Closing it is a data action, not code: after the deploy, a team admin opens the Hearts Academy kit (prod id `cms3jg09p000at5ijivpi3zhe`), uses "Improve this version", accepts the `canvas-share` edit with the numbers they choose (for example brand colour 1 at 60% of the canvas), and saves. It is named in the `docs/handoff.md` 007 section and in the pre-merge checklist as a check, with no blocking step, and CLAUDE.md's "One open drift" line is updated when it is done.

### Non-Functional Requirements

- **NFR-01: no schema, no migration, no env var.** `git diff --name-only <base> -- prisma` lists nothing.
- **NFR-02: the save route is unchanged.** `src/app/api/admin/brandkits/[id]/prompts/route.ts` and the `activate` route are byte-identical to the base (`git diff`). The version it creates and activates is the same as today's.
- **NFR-03: generation is byte-identical.** FR-16's golden test, the `PROMPT_VERSION` literal and an empty `git diff` over `src/lib/agent/prompts/` and `src/lib/brandkit/systemContext.ts`.
- **NFR-04: fail closed on model output.** A reply that cannot be parsed, a proposal that fails any FR-07 check, an unknown candidate and a stale quote never reach the author as an applicable edit. No path writes model text into the editor without the author's accept.
- **NFR-05: untrusted input.** The base text, uploaded grounding and the model reply are untrusted. The text is fenced (FR-10); the reply's quotes and positions are ignored (FR-06); the replacement is length-, sentence-, URL-, hex-, tag- and fence-checked (FR-07). No stored-XSS sink: the panel renders text as text.
- **NFR-06: tenancy.** The route is `withTeamAdmin`, resolves the kit by id and checks `kit.teamId === user.teamId` (404 otherwise, never 403). No id comes from the body.
- **NFR-07: pure and client-safe.** The dataset, detector, `isMeasurable` and the review core import no server module; a guard test enforces it (AC-16).
- **NFR-08: design system.** The panel uses `src/components/ui/` atoms and Graphite tokens only; `uiTokenGuard.test.ts` passes with no new `// ui-exception`; keyboard and focus follow DESIGN_SYSTEM.md (the flagged list is a labelled region, buttons have visible labels).
- **NFR-09: shared databases.** No prisma or DB command runs without an explicit `DATABASE_URL` for `bistec_studio_test` or a named scratch database. This change needs no scratch database. `export MSYS_NO_PATHCONV=1` before any docker command with a container path.
- **NFR-10: no real model calls** in any test, build step or gate.

## Acceptance Criteria

- **AC-01 (FR-01, FR-03): the detector flags the Hearts adjectives** (`tests/unit/designDetect.test.ts`, fixture `tests/unit/fixtures/hearts-kit-adjectives.ts`, built from CLAUDE.md's table). The text containing "similar visual heights", "generous clear space", "the teal-to-green gradient is the primary canvas" and "a soft edge where the photo meets the type" yields exactly four candidates with entry keys `mark-size-match`, `logo-clear-space`, `canvas-share` and `edge-blend`, in text order, each `quote` equal to the matched substring, each `start`/`end` slicing the text to that quote. "IRP is fine on-image" yields no candidate (documented outside the detector).
- **AC-02 (FR-03): it does not flag brand voice or measured text.** Text made of the listed brand-voice words (`warm`, `confident`, `friendly`, `bold`, `modern`, `clean`, `professional`, `approachable`) yields no candidate; "a generous offer" and "a soft tone" yield none; "generous clear space (about 1.5 wordmark letters)" and "primary canvas, 60% of the width" yield none; matching works on `İ` and mixed case without a position shift (a fixture with `İ` before the match slices to the quote).
- **AC-03 (FR-03): bounds and overlaps.** Overlapping matches keep the earlier then longer; more than 12 matches return 12 with `more: true`; text over 20 000 characters sets `truncated: true`; `candidate.id` is `<entryKey>:<start>`.
- **AC-04 (FR-01, FR-02): the dataset invariants** (`designAuthoring.test.ts`). Every entry has all FR-01 fields; every `template` filled with its `defaults` is measurable; every default lies inside its range; `source` is non-empty; the seven keys are present and no `typography` category exists.
- **AC-05 (FR-02): "measurable" is defined** (`designMeasurable.test.ts`). A table: `60%`, `45-60%`, `45–60 %`, `~12 px`, `3:2`, `2x`, `one or two wordmark letters`, `1.5 wordmark capitals`, `about 20% of the canvas width` are measurable; `generous`, `a lot of space`, `similar heights`, `2 apples`, `60` (no unit), `the 2026 launch` are not. `measurableTokens` normalises `~45 – 60 %` and `45-60%` to the same token.
- **AC-06 (FR-05, FR-07): every proposed edit is measurable** (`kitUpgradeValidate.test.ts` and E2E TC-KU-03). In every `edits` outcome, every `replacement` satisfies `isMeasurable`; a proposal with no number and unit or reference object is a `not-measurable` rejection and never an edit.
- **AC-07 (FR-07): validation** (unit table, one case each). `unknown-candidate`, `duplicate` (two proposals for one candidate: the first wins, the second is `duplicate`), `too-long` (over 400), `too-short` (under 8), `multi-sentence` (three sentences), `forbidden-content` (a hex value, a URL, an HTML tag, a code fence, a literal kit font name in any case), `stale-quote` (the quote occurs twice or not at all in the posted text). A `replace` removes only the quote: the text before and after is unchanged byte for byte; an `insert` leaves the quote and its sentence unchanged.
- **AC-08 (FR-08): provenance is set only by code.** A reply that carries `"provenance": "dataset"` on an out-of-range proposal still yields `unverified`; an in-range proposal for a real entry yields `dataset`; a reply `entryKey` is ignored (the candidate's is used); the type has no `sampled` member. A unit test confirms `sampleImageColors` is never called by the upgrade module (mocked, zero calls).
- **AC-09 (FR-09): roles, not literals.** The prompt the route builds contains the role list ("the headline font", "brand colour 1", …) and contains no hex value and no kit font name (asserted on the captured prompt in a unit test); a proposal containing a kit font name or a hex is rejected `forbidden-content`.
- **AC-10 (FR-05, FR-11): three outcomes** (E2E TC-KU-02, TC-KU-04 to TC-KU-06). `UNPARSEABLE` returns 502 `UPGRADE_PARSE_FAILED` and the response is not a 200 with an empty list; `NONE` returns 200 `none` / `model-proposed-none`; `BAD` returns 200 `edits` with one edit and three rejections (reasons asserted); text with no vague phrase returns `none` / `no-candidates` and the model-calls recorder has no `kit-upgrade` record for it.
- **AC-11 (FR-05, NFR-06): auth and tenancy.** No session is 401; an editor is 403; a kit of another team is 404 (not 403); a deleted kit is 404; a bad body (missing text, `baseVersion` negative, text over 20 000) is 400.
- **AC-12 (FR-05, FR-13): the stale base.** A request whose `baseVersion` differs from the kit's active version is 409 `STALE_BASE` with `activeVersion`, and the recorder has no `kit-upgrade` record. In the UI (E2E TC-KU-08): after another save moves the active version, clicking Save in an upgrade-seeded editor shows the "was saved since you started" confirm, and the save happens only on confirm. The Save note's exact words appear in the editor.
- **AC-13 (FR-13, FR-14): the editor flow** (E2E TC-KU-07, TC-KU-09). The flagged list updates after typing (debounced) with no network request to the upgrade route; "Improve this version" then "Upgrade" shows each edit with removed text beside inserted text, a provenance label and the rationale; accepting one edit changes the textarea and the version list is unchanged; Save creates one new active version whose content equals the textarea; accepting nothing and saving creates a version equal to the base; editing the textarea so a quote no longer occurs once disables that edit as stale; dismissing a flag hides it until reload.
- **AC-14 (FR-15): Improve with AI flags lost rules** (unit `designLostRules.test.ts`, E2E TC-KU-10). With a base containing "45-60% of canvas width" and "1.5 wordmark letters", a draft that keeps the first and drops the second returns `lostRules` holding the original span `1.5 wordmark letters`; a draft that keeps both returns `[]`; reformatting (`45 – 60 %`, `~45-60%`) is not a loss; the response still carries `draft` exactly as today; the improve prompt text is unchanged (golden string). In the UI the warning lists the dropped spans.
- **AC-15 (FR-12): host-agnostic** (`kitUpgradeReview.test.ts`). With a non-kit host (a plain string variable and a callback, no kit id and no kit import), `proposed` then `accept` applies an edit to the string via `applyEdit`; `textChanged` marks an edit stale when its quote occurs twice or never; `accept` of a stale edit is a no-op; `dismiss` is keyed by entry key and quote and `reset` clears it. A static check asserts `src/lib/kitUpgrade/` and `src/components/textUpgrade/` import nothing from `src/lib/brandkit`, `src/components/admin` or `@/lib/prisma`.
- **AC-16 (FR-01, FR-16, NFR-07): boundaries and purity.** `designDataBoundary.test.ts`: no generation-side file imports `designData/authoring`; `designData/index.ts` does not re-export it; the authoring, detect, measurable and review-core files import no server module; no template, default or `mockReplacement` contains a placement word or an `ArchetypeKey` literal.
- **AC-17 (FR-16, NFR-02, NFR-03): generation and save are untouched.** `git diff --name-only <base>` shows no change under `src/lib/agent/prompts/`, to `src/lib/brandkit/systemContext.ts`, to `prompts/route.ts` or `prompts/[promptId]/activate/route.ts`; `PROMPT_VERSION` is `2026-10-21.1`; the golden test passes; `git diff --name-only <base> -- prisma` is empty.
- **AC-18 (FR-04): one extractor.** `extractFencedJson` returns `missing`, `invalid-json`, `schema` and `ok` for the four inputs; it takes the last block when two exist; `extractBrandKitBlock` returns today's results for the existing fixtures (the `brandkit-assistant` unit and E2E suites pass unchanged).
- **AC-19 (FR-10, FR-11): grounding and the model call.** The prompt the route builds holds the base text only inside `fenceUntrusted` output and holds `UNTRUSTED_CONTENT_GUARD` (asserted on the captured prompt); a base text containing the closing delimiter cannot break out (the delimiter is neutralised); the recorder shows exactly one record with label `kit-upgrade` and the `ASSISTANT_BRANDKIT` surface's resolved model per `edits` or `none`-after-model call.
- **AC-20 (FR-17, FR-18, docs): observability and the operator step.** The log line for a call is emitted with the FR-05 fields and no prompt text (unit, a captured logger); `docs/handoff.md` carries the 007 section, the evidence query, the OQ-1 note, the Hearts drift operator step and the checklist line (a check, not a blocking step); `docs/e2e-test-plan.md` has section AC with an AC-to-case table; CLAUDE.md's top entry and `.specclaw/ROADMAP.md` are updated.
- **AC-21 (NFR-08): the design system.** `uiTokenGuard.test.ts` passes with no new `// ui-exception`; a manual pass at 390 px and 1440 px, light and dark, shows the panel without horizontal scroll and with visible focus on every control; the 021 render check is run if the panel adds a shared atom (it should not).
- **AC-22 (gate): nothing regressed.** tsc clean, `npm run lint` 0 errors / 7 warnings, `npm run test:unit` at least 3024 plus the new cases, `npm run test:render` 47/47, `npm run build` passes, full clean mock E2E 431/3/0/0 plus the new section AC cases, and CI green on `v2`.

## Edge Cases

- **Empty or whitespace text:** the route is 400; the panel disables Upgrade and shows the flagged list empty.
- **A kit with no active prompt:** `baseVersion 0` is accepted when no active prompt exists; the editor offers the detector but "Improve this version" is hidden (nothing to seed from).
- **The author edits while a request is in flight:** the response is applied only if the text the request carried still equals the textarea; otherwise the panel says "The text changed while we were working. Ask again" and discards the response.
- **The same phrase twice in the text:** two candidates (different `start`), two edits, each anchored by its sentence; each edit's quote must occur exactly once, so a phrase repeated verbatim in two places makes both stale. The server then rejects both as `stale-quote` and the panel says "This phrase appears more than once; reword one occurrence". This is a deliberate limit of the exactly-once rule.
- **Ranges and units:** "45 to 60%" and "45-60 %" both parse. A number written as a word above ten is not a quantity.
- **A very long prompt:** only the first 20 000 characters are scanned and sent; the panel says so (`truncated`).
- **Parallel clicks:** the Upgrade button is disabled while a request is in flight; a second request from another tab is independent and read-only (it writes nothing).
- **Restore after Save:** restoring an older version activates it for new posts only; the Save note says so. The upgrade never changes a draft that already exists.
- **Dismissed flag, text edited:** a dismissal keyed by entry key and quote is dropped when the quote no longer occurs.

## Assumptions

- **A1:** the Hearts defects lived in kit prose is the panel's causal claim (party-ba). It is a **hypothesis with a check:** the 2026-07-28 fixes were each made by replacing an adjective in the kit or briefing text with a measurable rule and then regenerating, and each regeneration passed (CLAUDE.md, the three rounds). This spec does not claim the detector would have prevented them; it claims it would have asked for the number.
- **A2:** the kit has no explicit font role field. "The headline font" is the first font and "the body font" the second, by position. The panel help says so. If the kit editor later gains explicit roles, only the role list builder changes.
- **A3:** `sampleImageColors` returns hex colours only (`string[]`, most frequent first, no shares) (`src/lib/renderer/puppeteer.ts:272`), so v1 never computes a share from pixels. Colour-share edits come from the dataset's 60-30-10 pattern and are labelled `dataset` or `unverified`. A sampled share is a follow-up that needs a sampler change (return counts), not part of this change.
- **A4:** the save route is not changed (decided), so the server cannot enforce a base version on Save. The client check in FR-13 is a narrowing, not a guarantee.
- **A5:** `.env.test` runs `DESIGN_PROVIDER=claude-html` (API mode) and `MOCK_AI`; E2E reaches the new route only through the `MOCK_AI` seam.

## Open Questions

- **OQ-1 (resolved by the user, 2026-10-23: no stamp for now): record which dataset entries an accepted version drew on?** The panel asked to stamp each upgraded version with the entry ids. With no schema change, the server cannot see an accept (it lands in the textarea and the save route is unchanged), and writing markers into the prompt text would put them into every generation prompt. **Recommendation: do not add a column now.** Log proposals (FR-05) and measure uptake by the `BrandKitPrompt` evidence query (FR-17). If the accept rate matters later, add a nullable `BrandKitPrompt.upgradeEntries` column and carry it through a second request from the panel after Save; that is an additive migration for a follow-up change. **If the user wants the stamp in v1, say so and the plan gains a migration task.**

## Dependencies

- **Hard:** 008 (`resolveAssistantModel` and the `ASSISTANT_BRANDKIT` surface), 009 (`designData` module and its composition boundary), 021 (Graphite atoms), 024 (shipped; no dependency, listed because it precedes 007 in the order). All are VERIFIED PASS on `v2`.
- **Soft / follow-ups:** the typography follow-up (font pairings, a type scale) extends `authoring/entries.ts`; the briefing-editor host reuses `useRuleReview`; a sampled colour share needs `sampleImageColors` to return counts; 006 could read the detector's flag count.
- **Runtime:** none new. No new package, no env var, no migration.

## Out of scope

- Typography guidance (decision 1, a follow-up change).
- Any change to generation prompts, `PROMPT_VERSION`, or any file under `src/lib/agent/prompts/` (decided 2026-10-23).
- Rewriting the whole prompt (the diff only; "Improve with AI" stays as is, plus the lost-rule flag).
- Flagging brand-voice words; a kit quality score; correlating kit versions with post quality (006).
- Composition rules (regions, archetypes, placement): 009 owns them.
- A change to the save or activate routes, a base-version check on Save, or any schema.
- Sampling a colour share from reference images (A3).
- Campaign briefing editors (the second host; a follow-up).
- Live end-to-end checks with a real model (no real model calls in any gate; a real-model look is an operator step in the handoff, optional).

## Notes

- **Corrections to the proposal, re-derived at `f0b5c36`.** (1) The proposal says "`designData` in `index.ts` is the one object 007 extends". The boundary guard (FR-16) needs authoring keys kept out of the module generation prompt builders already import, so the authoring dataset is a separate entry (`designData/authoring`) and `designData/index.ts` stays unchanged. (2) The proposal's detector word list is open ("exact word list"); FR-01's table is the v1 list. (3) The proposal lists sampler grounding for colour shares; A3 shows it cannot supply a share, so v1 uses the dataset default. (4) The proposal says the grounding documents may inform a proposed number; v1 sends the base text and the dataset only (documents are not included), to keep the call small and the prompt-injection surface to one fenced block. This can be added with `collectBrandKitGrounding` in a follow-up without changing the schema.
- **The cut line, and the do-nothing price** (party-po). The detector alone (FR-01 to FR-03, FR-14) is about a third of the build and needs no model, route or cost; the upgrade assistant (FR-05 to FR-13) adds the route, the seam and the review state. The user chose both. The do-nothing price is a recurring ~5-minute regeneration per adjective that reaches a post, and the live navy/teal drift unfixed. The drift fix itself needs no code (FR-18) and can be done today by hand.
- **The existing tools.** "Improve with AI" keeps its prompt and route; only the `lostRules` field is added.
- **Why the review state is a reducer.** The repo has no jsdom or React testing library, so the logic that decides what is stale, applied and dismissed is a pure function the unit tests can drive (AC-15); the hook and panel are thin and covered by E2E.
