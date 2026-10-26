# Spec: Stale-headline badge

**Change:** 030-stale-headline-badge · **Size:** architectural
**Created:** 2026-10-26
**Governed by:** `proposal.md` → "User Decisions (2026-10-26, after the deep panel)". Where the Proposed Solution and the decisions differ, the decisions win.

## Overview

A headline edit (`saveHeadlineEdit`, `src/lib/captions/store.ts`) and Regenerate headline (the `regenerate-copy` settle in the same file) change `Draft.headline` but never the design. The preview and the published PNG keep the old headline, and nothing tells the user.

This change records, at every design write that renders a PNG, which headline the real render **visibly paints** (D2). The draft page compares that stamp with the current headline and shows a badge when they differ or when the render could not be confirmed. The remedies are the existing Edit inline and Regenerate design. The publish side records and shows the state but never blocks (D5). Two analytics fields and one new event measure how often this happens, which gates the later Apply-to-image change (D1).

## Approach

- **The stamp.** One JSONB column `renderedText` on `Draft` and `DraftRevision` (D4), shaped `{ headline: { text, verified, reason? } }`. It is part of `RenderStamp`, so it travels through `draftStampFields`, `revisionStampFields`, `restoredRenderStamp` and the adopt path, as `composition` does. Null means "rendered before 030".
- **The check.** It runs inside the render that already makes the PNG (`withRenderedPage` in `src/lib/renderer/puppeteer.ts`), after the 025 composite check and before the screenshot. It never fails a render. Under `MOCK_PUPPETEER` a text-only stand-in plus the sentinel `__MOCK_HEADLINE_HIDDEN__` takes its place.
- **The read.** A pure rule maps the stamp and `Draft.headline` to one of four states: `fresh`, `stale`, `unconfirmed`, `unknown`. Every reader (the draft GET, the library list, the publish event, the headline-edit event) calls it.
- **The UI.** A notice on the draft page in the existing notice pattern, and one line in the publish dialog. Nothing else changes on the page.

## Requirements

### Functional Requirements

**The stamp**

- **FR-01 — Columns.** Add `renderedText Json?` to `Draft` and to `DraftRevision`. One additive migration `20261027120000_rendered_text` and a manual down script `prisma/rollback/030-stale-headline-badge.down.sql`. There is no backfill (D3).
- **FR-02 — Shape.** The stamp is `{ headline: { text: string, verified: boolean, reason?: UnverifiedReason } }`, validated by one zod schema at every write. `reason` is present if and only if `verified` is false. `text` is the headline that was checked, stored as given (not normalised), at most `HEADLINE_MAX` characters. A stored value that does not parse reads as null. The schema is keyed by field, so a later on-image field is one more optional key with no migration (D4); this change defines only `headline`.
- **FR-03 — The vocabularies.** One module exports the closed lists every side uses (API, badge, events):
  - `HEADLINE_STATES = ['fresh', 'stale', 'unconfirmed', 'unknown']`;
  - `UNVERIFIED_REASONS = ['not-found', 'ambiguous', 'not-visible', 'not-checked']`;
  - `HEADLINE_CHECKS = ['painted', ...UNVERIFIED_REASONS]` (the outcome of one check).
- **FR-04 — Every design write stamps it.** `RenderStamp` gains `renderedText`, and `currentRenderStamp` takes it as a required argument, so a writer that forgets it is a type error (the 009 and 027 pattern). The writers and what each stamps:

  | Writer                                                       | Where                                           | Stamp                                                                     |
  | ------------------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------- |
  | First generation, interactive (Path A and B)                 | `generateDraft.ts` `finalizeDraftV1`            | the check of the final render against the generation's validated headline |
  | First generation, sync (scheduler, MCP, ACP)                 | `generateDraft.ts` `generateDraftForBriefInner` | same                                                                      |
  | Regenerate design                                            | `regenerate-design/route.ts`                    | the check against `designHeadline(draft, brief).text`                     |
  | Refine (verified commit), inline edit (both modes), Override | `commitDraftRevision`                           | the check against the draft's headline read at the start of the commit    |
  | Refine rejected render                                       | `recordRejectedRender`                          | the check against the draft's headline read before its render             |
  | Adopt ("Use anyway")                                         | `commitDraftRevision` via `rejectedRenderStamp` | the rejected row's own stamp (no render)                                  |
  | Restore                                                      | `restoredRenderStamp`                           | the revision's own stamp, also when a legacy row is re-rendered           |
  | Export re-render                                             | `generate/export/route.ts`                      | unchanged: same HTML, so the stored stamp stays true                      |

  "The draft's headline" means `designHeadline(draft, brief).text`: the headline, or the brief topic when the headline is null.

- **FR-05 — The check result becomes the stamp.** `painted` stamps `{ text, verified: true }`. Any other outcome stamps `{ text, verified: false, reason }`. A design write that produced no checked render (the API-mode agent ended without a `renderHtml` call that carried the check) stamps `reason: 'not-checked'`. No post-030 design write leaves the stamp null.

**The check (D2)**

- **FR-06 — Where it runs.** In the same Chromium page that makes the PNG, after `setContent` and the 025 composite check, before the screenshot. It adds no page load and no render. It is bounded (`HEADLINE_CHECK_TIMEOUT_MS = 5000`). A throw or a timeout yields `not-checked` and never fails, delays past the bound, or changes the render.
- **FR-07 — Candidates.** Inside `<body>` only, so `<title>`, `<head>`, `<script>`, `<style>`, `<template>` and attributes never match. A candidate is an element whose visible text (`innerText`, which applies `text-transform` and turns `<br>` into a line break) equals the headline under the shared normaliser (FR-09), and none of whose child elements also matches (the innermost).
- **FR-08 — Painted.** A candidate is painted when all of these hold:
  1. `checkVisibility({ opacityProperty: true, visibilityProperty: true })` is true (this covers `display`, `visibility`, `opacity` and `content-visibility` on the element and its ancestors);
  2. its text has at least one non-empty client rect (`Range.getClientRects` over its contents), and the union of those rects lies inside the canvas `[0, 0, width, height]` within 1 px;
  3. it is not clipped: for the element and every ancestor whose computed `overflow-x` or `overflow-y` is not `visible`, the text rects lie inside that box within 1 px;
  4. it is on top: at the centre of every text rect, `document.elementFromPoint` returns the element or a descendant.

  Outcome: no candidate → `not-found`; exactly one painted candidate → `painted`; more than one painted → `ambiguous`; candidates but none painted → `not-visible`. The verdict is computed by a pure function (`evaluateHeadlineFacts`) from facts the page returns, so it is unit-tested without Chromium.

- **FR-09 — One normaliser.** `normaliseHeadline(s)`: Unicode NFC; every whitespace run (including no-break space and line breaks) becomes one space; trim; `toLowerCase()` (locale-independent). It is self-contained (no imports, no closures), and the in-page check uses the same function, passed in as its source. The staleness rule (FR-11) and the mock stand-in (FR-10) use it too.
- **FR-10 — The mock stand-in.** Under `MOCK_PUPPETEER`, the check is a pure text stand-in over the HTML: remove `<head>`, `<script>`, `<style>`, `<template>` and comments, replace every tag with a space, decode the basic entities (`&amp; &lt; &gt; &quot; &#39; &nbsp;`), normalise, and count whole-text occurrences of the normalised headline: 0 → `not-found`, 1 → `painted`, more → `ambiguous`. If the document contains `__MOCK_HEADLINE_HIDDEN__`, the outcome is `not-visible`. The mock design HTML (`buildMockHtml`) gains one element that shows the headline it was given, so a mock generation stamps `painted`. The mock refine reply keeps that element when the current document has it.

**Staleness (read time, pure)**

- **FR-11 — The rule.** `headlineState(renderedText, headline)`:
  - stamp null, or no `headline` key, or `Draft.headline` null → `unknown` (D3: no badge, no note, no parse, ever);
  - `verified: false` → `unconfirmed` (D2: an unverified stamp is never read as fresh);
  - `normaliseHeadline(stamp.text) === normaliseHeadline(headline)` → `fresh`;
  - otherwise → `stale`.

  **The case-only rule:** an edit that changes only letter case or whitespace is `fresh`. The comparison ignores case because designs often set the case in CSS.

- **FR-12 — The read model.** `GET /api/drafts/[id]` returns `headlineImage`:

  ```ts
  {
    state: HeadlineState
    renderedHeadline: string | null    // stamp.text when state is 'stale', else null
    reason: UnverifiedReason | null    // when state is 'unconfirmed', else null
    scheduledPosts: { count: number; nextAt: string } | null  // SCHEDULED Post rows of this draft, when state is 'stale' or 'unconfirmed'
  }
  ```

  It adds one indexed read (the SCHEDULED posts) and no parse and no render. `DraftDetail` in `src/lib/api-types.ts` gains the type. `GET /api/library` returns `headlineState` per item (the state only), from the two columns it already reads plus `renderedText`.

**The badge and the publish side**

- **FR-13 — The badge.** A notice on the draft page beside `CompositionNotice` and `FactsCheckNotice`, in the same pattern (`src/components/drafts/HeadlineImageNotice.tsx`). It renders only for `stale` and `unconfirmed`. It states only what the stamp knows:
  - `stale`: "The image still shows the previous headline “{renderedHeadline}”."
  - `unconfirmed`: "We couldn't confirm that the image shows the current headline." plus one fixed sentence per reason:
    - `not-found`: "The design does not contain it as one piece of text."
    - `ambiguous`: "The design shows it more than once."
    - `not-visible`: "It is in the design but hidden, clipped or covered."
    - `not-checked`: "The check could not run."
  - When `scheduledPosts` is set: "{count} scheduled post(s) will publish this image, the next on {date}." (D5)
  - Two buttons: **Edit inline** (opens the existing inline edit) and **Regenerate design** (the existing action, with its existing confirm). Both are disabled while a draft action is pending, as the existing buttons are.
  - It never blocks publishing.
- **FR-14 — The publish dialog (D5).** `PublishDialog` takes an optional `headlineState`. For `stale` it shows one non-blocking line: "The image shows an older headline." For `unconfirmed`: "We couldn't confirm the image shows the current headline." No line for `fresh` or `unknown`. The draft page passes the GET value; the library page passes the list item's value. Publishing is never disabled by it.

**Events (006 rules; no headline text in any payload)**

- **FR-15 — `draft.headline_edited`** (new; source `web`; no outcome). Payload: `via: 'edit' | 'regenerate'`, `state: HeadlineState` after the write, `scheduledPending: boolean`. One emitter function, `trackHeadlineEdited`, called after the write by the headline PATCH and by the regenerate-copy settle when it wrote a headline. It is not emitted when the headline did not change.
- **FR-16 — `publish.settled` gains `headlineState`** (optional, additive, schemaVersion stays 1). `trackPublish` takes it, and every caller (the immediate publish, the retry route, the MCP/ACP tool, the scheduler tick) passes the state of the draft at publish time, read from the draft row it already loads or one extra `select` of `headline` and `renderedText`.
- **FR-17 — `generation.finished` gains `headlineCheck`** (optional, `HEADLINE_CHECKS`), the outcome of the final render's check, so the unverified rate of fresh generations is measured.
- **FR-18 — Coverage.** The catalogue imports the FR-03 lists (never copies them). `analyticsCoverage.test.ts` fails if a `HEADLINE_STATES` or `HEADLINE_CHECKS` value has no event field that can carry it.

### Non-Functional Requirements

- **NFR-01 — No model and no image call** is added anywhere. No env var.
- **NFR-02 — No extra render.** The check runs in the page that makes the PNG; the draft GET and the library list never parse HTML or render.
- **NFR-03 — Never fails a write.** A check that throws or times out yields `not-checked`. A design write that succeeded before 030 still succeeds.
- **NFR-04 — Bounded cost.** The check adds at most `HEADLINE_CHECK_TIMEOUT_MS` (5 s) to a render in the worst case; the render fixtures record its typical time.
- **NFR-05 — No text in events** (006 NFR-04): no payload field holds the headline or the stamped text.
- **NFR-06 — Additive schema.** Nullable columns, no backfill, a manual down script, a "Check before the merge" line in the handoff checklist.
- **NFR-07 — Generation prompts are unchanged.** `PROMPT_VERSION` and `CAPTION_PROMPT_VERSION` do not change; no prompt file changes.
- **NFR-08 — The unattended surfaces change only as listed:** the sync generation writer stamps (FR-04) and the scheduler's and MCP/ACP's `trackPublish` calls pass `headlineState` (FR-16). Nothing else under `src/lib/scheduler`, `src/mcp`, `src/acp` or `src/app/api/acp` changes.

## Acceptance Criteria

- [ ] **AC-01** — The migration adds `renderedText` to `Draft` and `DraftRevision`, nullable, with no backfill; the down script removes both; `npm run test:upgrade` passes. (FR-01, NFR-06)
- [ ] **AC-02** — The stamp schema accepts `{ headline: { text, verified: true } }` and `{ headline: { text, verified: false, reason } }` and refuses `verified: true` with a reason, `verified: false` without one, an unknown reason and text over `HEADLINE_MAX`; an unparsable stored value reads as null. (FR-02, FR-03)
- [ ] **AC-03** — A writer guard test lists every design writer in the FR-04 table and fails if one writes `htmlContent` without `renderedText` (the 009 `composition` guard pattern); `currentRenderStamp` without the argument is a type error. (FR-04)
- [ ] **AC-04** — Unit: each FR-04 writer stamps as the table says: generation and regenerate design from their own check; commit and rejected render against the draft's headline read before the render; adopt the rejected row's stamp; restore the revision's stamp (null for a pre-030 row); the export route leaves it unchanged. (FR-04, FR-05)
- [ ] **AC-05** — `evaluateHeadlineFacts` returns `not-found`, `painted`, `ambiguous` and `not-visible` for the four candidate shapes, and each FR-08 condition (visibility, empty box, outside the canvas, clipped by an ancestor, covered at a line centre) alone turns `painted` into `not-visible`. (FR-07, FR-08)
- [ ] **AC-06** — `npm run test:render` (real Chromium) has one fixture per case, and each yields the stated outcome: a plain `<h1>` (painted); a headline split by an accent `<span>` and a `<br>` (painted); `text-transform: uppercase` over a lower-case source (painted); only in `<title>` (not-found); `display: none` (not-visible); `opacity: 0` (not-visible); clipped by `overflow: hidden` on a parent (not-visible); covered by a later positioned element (not-visible); outside the canvas (not-visible); shown twice (ambiguous); a 025 composite fixture with a visible headline (painted). (FR-06 to FR-08)
- [ ] **AC-07** — In the same render suite, the mock stand-in and the Chromium check agree on the plain, split, `<title>`-only and twice-shown fixtures. (FR-09, FR-10)
- [ ] **AC-08** — A check that throws or exceeds the bound yields `not-checked`, the PNG is still produced, and the write succeeds (unit, with the in-page step forced to throw). (FR-06, NFR-03)
- [ ] **AC-09** — `headlineState` returns `unknown` for a null stamp and for a null headline, `unconfirmed` for `verified: false` whatever the text, `fresh` for an equal or case-only or whitespace-only difference, and `stale` otherwise. (FR-11)
- [ ] **AC-10** — The draft GET returns `headlineImage` with `renderedHeadline` only when stale, `reason` only when unconfirmed, `scheduledPosts` only when stale or unconfirmed and a SCHEDULED post exists; the library list returns `headlineState`; neither calls the parser or the renderer (unit, with both mocked to throw). (FR-12, NFR-02)
- [ ] **AC-11** — E2E: after a headline edit on a generated draft, the badge shows "The image still shows the previous headline" with the old headline, and Edit inline and Regenerate design. (FR-13)
- [ ] **AC-12** — E2E: after Regenerate headline (`regenerate-copy` with the headline target), the badge shows. (FR-13)
- [ ] **AC-13** — E2E: an inline edit that puts the new headline into the design clears the badge, and so does Regenerate design. (FR-04, FR-05, FR-13) — this is the panel's "the badge clears only when the image shows the new headline".
- [ ] **AC-14** — E2E: a generation whose design carries `__MOCK_HEADLINE_HIDDEN__` shows the `unconfirmed` badge with the `not-visible` sentence, and it never shows "fresh" after a headline edit. (FR-10, FR-11, FR-13)
- [ ] **AC-15** — E2E: a pre-030 draft (`renderedText` null, made by the test seed) shows no badge after a headline edit, and restoring a pre-030 revision on a post-030 draft brings back no badge. (FR-11, D3)
- [ ] **AC-16** — E2E: restoring the revision made before a headline edit keeps the stale badge; adopting a rejected render stamps that render's own result. (FR-04)
- [ ] **AC-17** — E2E: with a SCHEDULED post on the draft, the badge shows the scheduled line after a headline edit. (FR-12, FR-13, D5)
- [ ] **AC-18** — E2E: the publish dialog shows the stale line on the draft page and on the library page for a stale draft, shows nothing for a fresh one, and Publish stays enabled in both cases. (FR-14)
- [ ] **AC-19** — The events: `draft.headline_edited` is written once per headline change with `via` and `state` and no text; an edit that does not change the headline writes none; `publish.settled` carries `headlineState` from the immediate, retry, MCP and scheduler paths; `generation.finished` carries `headlineCheck`; the coverage test passes. Read through the `/api/test/analytics-events` seam in E2E and through unit tests for the scheduler and MCP. (FR-15 to FR-18, NFR-05)
- [ ] **AC-20** — The gates: tsc clean; lint 0 errors and no new warning; unit, render and the full clean mock E2E pass with no lowered count against the baseline (unit 4131, render 119, E2E 548/3/0/0); `test:upgrade` passes; CI is green on `v2`; `PROMPT_VERSION` and `CAPTION_PROMPT_VERSION` unchanged; `git diff --name-only` for `src/lib/scheduler src/mcp src/acp src/app/api/acp` lists only the FR-16 `trackPublish` callers and the FR-04 sync writer. (NFR-01, NFR-07, NFR-08)

## Mock E2E plan (section AH, `tests/e2e/headline-badge.test.ts`)

TC-HL-01 to TC-HL-10 cover AC-11 to AC-19, driven by the mock headline element (FR-10), the sentinel `__MOCK_HEADLINE_HIDDEN__` in the brief topic (carried into the mock design as a comment, like the 025 composite sentinel), a test seed that nulls `renderedText` for the pre-030 case, and a SCHEDULED Post row made through the existing publish route with a future `scheduledAt`. Every `page.waitForResponse` is created before its trigger.

## Panel findings → where addressed

| Finding (party-report.md)                                                              | Where                                                                                      |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| architect BLOCK: stamp rule misclassifies writers that change text inside kept HTML    | FR-04, FR-05: every writer that renders stamps from its own check, not from intent; AC-13  |
| architect BLOCK: Apply commits before it checks                                        | Out of scope by D1 (Apply is a later change)                                               |
| architect WARN: "visible text" defined by two engines; mock cannot produce not-visible | FR-09 (one normaliser), FR-10 (sentinel), AC-07 (agreement fixtures), AC-14                |
| architect WARN: two staleness rules, unspecified shape, parse in the GET               | FR-11 (one rule), FR-12 (shape), D3 (no parse for null), AC-10                             |
| architect WARN: failure vocabulary differs between route, badge and event              | FR-03, FR-18                                                                               |
| architect WARN: affected files leave out writers and claim co-changes                  | FR-04 table; the design's file map. No new claimed action (Apply deferred)                 |
| architect NOTE: the stamp is the only input that tells an edit from a model rewording  | Kept: the stamp is the source of staleness (FR-11)                                         |
| ba WARN: match rate measured on a different rule; 28/35 bar tuned on its own drafts    | Out of scope by D1 (Apply's match rate). FR-17 measures the real check's rate              |
| ba WARN: frequency unknown, sized architectural on an assumption                       | FR-15, FR-16, FR-17 measure it; Apply is gated on them (D1)                                |
| ba WARN: no AC tests "the badge clears only when the image shows the new headline"     | AC-13, AC-14                                                                               |
| ba WARN: "stale" and "the old headline" carry two meanings; null contradicts the text  | FR-11 four states; FR-13 texts per state; null shows nothing (D3)                          |
| ba NOTE: assumes the user notices the badge and accepts flattened styling              | Flattening is out of scope by D1; noticing is measured by FR-15 vs FR-16 (stale publishes) |
| po BLOCK: a cheaper variant is dismissed; Apply is the expensive part                  | D1: badge, stamp and events only                                                           |
| po WARN: the stamp and migration are paid by every writer                              | D2 and D4 decided by the user; one JSONB column, carried by the existing stamp helpers     |
| po WARN: unbounded scope; an acceptance bar with no source                             | Scope is FR-01 to FR-18; the 28/35 bar is out of scope by D1                               |
| po NOTE: name the cut line and the default for pre-030 drafts                          | D1 (cut line), D3 (show nothing)                                                           |
| security BLOCK: "visible text" passes on hidden, clipped or covered text               | FR-08 geometry; AC-05, AC-06                                                               |
| security WARN: the stamp is written from intent and never checked against the HTML     | FR-05: the stamp is the check's result                                                     |
| security WARN: the splice can delete content the check never looks at                  | Out of scope by D1 (no splice)                                                             |
| security WARN: null-stamp read-time rule fails open on hidden matches                  | D3: no read-time rule for null                                                             |
| security WARN: a stale image is published with no warning, record or recovery          | FR-14 (dialog line), FR-16 (event), FR-13 scheduled line                                   |
| security NOTE: escaping does not neutralise reserved tokens                            | Out of scope by D1 (no write into HTML)                                                    |
| security WARN (rebuttal): "or set it to null" fails open                               | FR-05: no post-030 write leaves null; unverified is never fresh                            |
| security WARN (rebuttal): backfill turns a guess into verified stamps                  | No backfill (FR-01, D3)                                                                    |
| visionary WARN: one stamp per field makes every future field a migration               | D4: one field-keyed JSONB (FR-02)                                                          |
| visionary WARN: two definitions of visible text that must agree forever                | FR-09, AC-07                                                                               |
| visionary WARN: the null branch is permanent                                           | D3: stated as a permanent contract (FR-11)                                                 |
| visionary NOTE: the apply event has no method field                                    | Out of scope by D1; recorded for the Apply change                                          |
| visionary NOTE: a read-time parse rule changes old verdicts when tuned                 | No read-time parse (D3, NFR-02)                                                            |

## Edge Cases

- **A headline edit during a render.** The commit reads the headline before the render, so a later edit makes the new stamp stale. That is correct: the image shows the earlier text.
- **The headline is null** (a legacy draft): writers check the brief topic (`designHeadline`), and the state is `unknown` until a headline exists.
- **Gradient or transparent-fill text** (`background-clip: text`) is painted by FR-08. Text with the same colour as its background also passes; contrast is not checked (known limit L1).
- **A headline shown twice** (a hero line repeated in a footer) is `ambiguous`, so `unconfirmed`. Stated by D2 ("exactly one element").
- **A model that rewords the headline** gives `not-found` on the fresh render, so a new draft can show `unconfirmed` before any edit. FR-17 measures how often (the 2026-10-26 sample suggests about 3 in 35).
- **A 9:16 or 4:5 canvas:** the canvas bound uses the render's own width and height.
- **Non-Latin text** (Sinhala): `toLowerCase` is a no-op there; NFC makes composed and decomposed forms equal.
- **A composite (025) render:** the check runs after the composite check in the same page; a composite failure still fails as before, and the check never runs on a render that failed.

## Assumptions

- **A1.** `reason` is an optional addition to D4's `{ text, verified }`. It is diagnostic only; staleness reads `verified`.
- **A2.** The scheduled-post line counts `Post` rows with status `SCHEDULED` only. `PENDING` and `PUBLISHING` are about to publish or publishing, so a warning is too late to act on.
- **A3.** "Exactly one element" (D2) counts painted candidates. A hidden duplicate (for example a screen-reader copy) does not make the result ambiguous.
- **A4.** The library page shows no badge; it passes the state to the publish dialog only.

## Known limits

- **L1.** Contrast and colour are not checked. Text the same colour as its background reads as painted.
- **L2.** The check confirms the headline text is painted, not that it is the design's headline (it could sit in a footer).
- **L3.** A partly covered line passes when its centre is uncovered.
- **L4.** The mock stand-in sees text, not CSS. Only the sentinel produces `not-visible` in mock runs.

## Dependencies

- 009 and 025 (`RenderStamp`, `composition`, the composite check in `withRenderedPage`).
- 006 (the event catalogue and `track`).
- No new npm dependency.

## Out of scope

- Apply to image, the splice module, `parse5`, and Open Questions 1, 3 and 5 (D1). A later change, gated on FR-15 to FR-17.
- Any badge or note for pre-030 drafts (D3).
- Blocking or gating publish (D5).
- Other on-image text (CTA, kicker); the stamp shape allows it later (D4).
- Insights-page queries for the new fields (the events are recorded now; reading them is the Apply change's evidence step).
