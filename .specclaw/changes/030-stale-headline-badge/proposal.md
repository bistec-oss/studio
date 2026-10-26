# Proposal: Stale-headline badge

**Created:** 2026-10-26
**Status:** 🟡 Draft

Split out of 006 by the user (2026-10-23). It carries the 006 party panel's upheld findings on that item: HTML escaping, text-node-only matching, a per-revision rendered-headline stamp written in `commitDraftRevision`, a visible-text check, and evidence for how often the fix can work (`.specclaw/changes/006-product-observability/party-report.md`, the party-architect BLOCK, the party-security BLOCK and the party-ba WARN).

## Problem

Two actions change the on-image headline without touching the design:

- **A headline edit.** `PATCH /api/drafts/[id]` calls `saveHeadlineEdit` (`src/lib/captions/store.ts:385`). It writes `Draft.headline` only.
- **Regenerate headline.** `regenerate-copy` with `{ headline: true }` writes `Draft.headline` at `store.ts:347`.

Neither writes `htmlContent` or `exportUrl`. The draft page then shows the new headline in the Headline panel, but the preview image and the PNG that gets published still show the old one. Nothing tells the user. The only fixes today are Edit inline (find and retype it by hand) or Regenerate design (a new model design, which changes everything else too).

**How often.** Unknown. No analytics event records a headline edit (the 006 catalogue has none), and prod does not run `v2` yet. This change adds the events that will answer it.

**Can a no-model fix work? Measured, 2026-10-26.** The 006 idea was to replace the old headline in the stored HTML "only if it occurs exactly once". I ran a read-only check (`headline-measure.cjs`, kept in this directory) over the 35 real model-made Path B drafts in the scratch database `bistec_studio_op1` (the OP-1, OP-028 and OP-025 renders). Each draft's HTML was loaded in Chromium with the network blocked:

| Where the headline is found                                           | Drafts   |
| --------------------------------------------------------------------- | -------- |
| Exactly once as a raw substring of the HTML                           | 9 of 35  |
| Exactly one text node holds it                                        | 5 of 35  |
| Exactly one innermost element holds it as its text (case-insensitive) | 32 of 35 |
| Visible in the rendered page text                                     | 34 of 35 |

What this shows:

- **The models split headlines.** The usual shape is `<h1>BISTEC Global Opens New <span class="accent">Engineering Hub</span> in Colombo</h1>` or `<h1>On-brand<br>posts in<br><span class="hl">minutes</span></h1>`. A text-node match works on 1 draft in 7.
- **The raw single match is often not the visible headline.** In 4 of the 9 raw single matches, the match was not visible text. In draft `…zwvn0q`, the only exact match was the `<title>` tag, because the visible headline was worded differently. A raw replace would have edited the `<title>`, stamped the new headline and cleared the badge while the image still showed the old one. This is exactly the party-security BLOCK.
- **An element-level match works on 91%.** The match is the innermost element whose visible text equals the headline.

## Proposed Solution

1. **A per-revision stamp.** Add `renderedHeadline` to `RenderStamp` (`src/lib/drafts/revisions.ts:58`). It becomes a nullable TEXT column on `Draft` and on `DraftRevision`, written through `draftStampFields` and `revisionStampFields`. Every writer that already writes a render stamp therefore carries it, as with `composition`:
   - first generation (Path A and B), including scheduled, MCP and ACP runs;
   - regenerate design, refine, inline edit, Override, adopt;
   - restore (`restoredRenderStamp` copies the revision's value);
   - the badge's own apply.

   A new render stamps the headline it was built from (`designHeadline`). A write that keeps HTML (inline edit, Override) carries the stored value forward. Null means the design was rendered before 030. A guard test lists every writer.

2. **Staleness is pure and read-time.** A draft is stale when `renderedHeadline` is set and differs from `Draft.headline` after whitespace normalisation. `GET /api/drafts/[id]` returns `headlineStale` with the reason. No model call and no render are needed to read it.
3. **The badge.** A notice on the draft page in the existing notice pattern (`FactsCheckNotice`, `CompositionNotice`): "The image still shows the old headline “…”". It offers three buttons: **Apply to image**, **Edit inline** and **Regenerate design**. Publishing is never blocked.
4. **Apply to image, with no model call.** A new draft action, `POST /api/drafts/[id]/apply-headline`, claimed like the other draft actions:
   - **Parse** the stored HTML with a real HTML parser that keeps source offsets.
   - **Match** the innermost element whose visible text equals the stamped old headline, with whitespace normalised and case ignored. Text nodes only: never attributes, `<title>`, `<script>`, `<style>`, `<template>` or comments. `<br>` counts as a space. It must be exactly one element.
   - **Replace** that element's inner content with the new headline, HTML-escaped. Splice it at the parser's offsets so every other byte of the document is unchanged.
   - **Commit** through `commitDraftRevision`. That re-renders the PNG, and the 025 composite placement still applies.
   - **Check the visible text.** In the real render, the element's visible text must equal the new headline. Under `MOCK_PUPPETEER`, the same check runs on the parsed HTML.
   - **Stamp** `renderedHeadline` from what the replace changed, and only after the check passes.
   - **Fail closed.** On no match, more than one match, or a failed check, the action fails with a named reason and writes nothing. The badge then says why and offers Edit inline and Regenerate design.

   The cost: inline markup inside the element (an accent span, `<br>` line breaks) becomes one plain run of text in the element's own style. The confirm step says so.

5. **Events** (the 006 rule: a change that adds an action owns its events):
   - `draft.headline_edited` (`via`: `edit` or `regenerate`; `designStale`: boolean; the source);
   - `revision.headline_applied` (outcome `ok`, `not-found`, `ambiguous` or `not-visible`).

   Neither event holds headline text. Together they give the frequency and the real match rate the 006 panel asked for.

## Scope

### In Scope

- The `renderedHeadline` stamp on `Draft` and `DraftRevision`: one additive migration, a manual down script, every render-stamp writer, and a writer guard test.
- The pure staleness rule, the `headlineStale` field on the draft GET, and the badge on the draft page.
- The apply action: the route, the parse-match-splice module (pure, unit-tested on fixtures taken from real Path B HTML shapes), the visible-text check, named failures and the claim.
- A minimum match rate as an acceptance criterion: the apply rule matches at least 28 of the 35 real drafts measured above. The fixtures are stored with ids redacted.
- The two analytics events, catalogue entries and coverage.
- Mock seams and E2E for: badge shown after an edit and after Regenerate headline; apply succeeds; apply refused (not found, ambiguous, not visible); restore and adopt carry the stamp; a pre-030 (null) draft.

### Out of Scope

- A model-based apply (a scoped Haiku call that rewrites the element with its styling). It is the alternative in Open Question 1, not built here.
- Applying the headline automatically on save. The user chooses.
- Blocking or warning inside publish. The badge is on the draft page only (Open Question 4).
- A fingerprint over every rendered input (party-visionary's 006 idea). Only the headline is an editable rendered input today, so a second field would get its own stamp.
- Other on-image text (CTA, kicker, body lines). Captions are not on the image.
- Backfilling `renderedHeadline` for existing drafts.

## Impact

- **Size:** architectural. It adds a per-revision stamp that every design writer must carry, plus a migration, a new draft action and a new HTML-parsing module.
- **Files affected:** about 15 (estimated): `prisma/schema.prisma` plus the migration and down script; `src/lib/drafts/revisions.ts`; the generation writers in `src/lib/agent/generateDraft.ts`; the regenerate-design route; a new `src/lib/drafts/headlineApply.ts`; a new apply route; `src/app/api/drafts/[id]/route.ts`; `src/lib/api-types.ts`; a new badge component and the draft page; the analytics catalogue; tests.
- **Complexity:** medium.
- **Risk:** medium.
  - A writer that forgets the stamp leaves it wrong. The guard test lists the writers, as 009 did for `composition`.
  - The splice must never corrupt HTML. It is pure, offset-based, escapes its input, and is fixture-tested.
- **Dependency:** a new HTML parser with source offsets (`parse5` is the likely pick; Open Question 3).
- No env var, no model call, no image call.

## Open Questions

1. **Apply quality.** The element replace flattens inline styling (the accent word, the line breaks). Is that acceptable for a no-model fix? Alternatives:
   - (b) an inform-only badge with no Apply button (cheapest);
   - (c) a scoped Haiku call that rewrites only that element's markup, checked the same way (better looking, one model call per apply).

   **Recommend (a), the no-model replace,** because the user sees the result before publishing and can still Regenerate design.

2. **Drafts from before 030** (`renderedHeadline` null). The 006 panel said never to infer "fresh" from a raw substring. **Recommend:** for a null stamp, show the badge when the current headline is not the visible text of exactly one element (the same parser and rule, never attributes or `<title>`). Offer only Edit inline and Regenerate design, because the old headline is unknown and Apply has nothing to replace. The alternative is to show nothing for null drafts.
3. **The parser.** Option (a) is `parse5` with source locations: spec-compliant, and splicing at its offsets keeps the rest of the document byte-identical. Option (b) does the match in Chromium during the render, which needs no new dependency, but Chromium re-serialises the whole document on the way out. **Recommend (a).**
4. **The publish dialog.** Should it show one non-blocking line ("The image shows an older headline") when the draft is stale? **Recommend yes** if it fits the dialog without a new component.
5. **Path A.** All 35 measured drafts are Path B. Template fills may differ. The plan measures the seeded Path A templates before fixing the rule.

**Party panel (2026-10-26, deep, CHANGES_REQUESTED; upheld findings, one line each; see [party-report.md](party-report.md)):**

- (party-architect, BLOCK) The stamp rule misclassifies writers that change text inside kept HTML, so the badge's own remedy cannot clear it.
- (party-architect, BLOCK) Apply commits before it checks, yet promises to write nothing on a failed check, and never names the commitDraftRevision change this needs.
- (party-architect, WARN) "Visible text" is defined by two engines, and the mock seam cannot produce the not-visible refusal it promises to test.
- (party-architect, WARN) Two staleness rules feed one `headlineStale` field, its shape is unspecified, and the null-stamp rule puts an HTML parse into the draft GET.
- (party-architect, WARN) The failure vocabulary differs between the route, the badge and the event.
- (party-architect, WARN) The affected-files list leaves out writers that item 1 says must change, and the co-changes a new claimed action needs.
- (party-architect, NOTE) Rebuttal to party-po's "replace the stamp with the parse check": the stamp is the only input that tells an edit apart from a model rewording.
- (party-ba, WARN) The apply path's match rate is measured on a different match rule than the one it will use, and the 28/35 criterion is satisfied by the drafts it was tuned on.
- (party-ba, WARN) Frequency of the pain is unknown, yet the build is sized "architectural" on the assumption it hurts.
- (party-ba, WARN) No acceptance criterion tests the stated main claim that the badge clears only when the image really shows the new headline.
- (party-ba, WARN) "Stale" and "the old headline" carry two meanings, and the null-stamp case contradicts the badge text.
- (party-ba, NOTE) Assumes the user notices the badge and accepts flattened styling, without evidence of either behaviour.
- (party-po, BLOCK) A cheaper variant (inform-only badge, or a no-stamp read-time check) is dismissed in one line, and the proposal's own numbers show the Apply path is the expensive, low-value part.
- (party-po, WARN) The per-revision stamp and migration are paid for by every writer to serve a read-time check that could be cheaper.
- (party-po, WARN) Unbounded scope with no stated value, plus one acceptance bar with no stated source.
- (party-po, NOTE) Name the shipping cut line and the default for pre-030 drafts.
- (party-security, BLOCK) The "visible text" check passes on hidden, clipped or covered text, then clears the badge.
- (party-security, WARN) `renderedHeadline` is written from intent at most writers and never checked against the HTML.
- (party-security, WARN) The splice can delete content the check never looks at.
- (party-security, WARN) For pre-030 drafts, the recommended read-time rule fails open on CSS-hidden matches.
- (party-security, WARN) A stale image is published with no warning, record or recovery path on the publish side.
- (party-security, NOTE) HTML escaping does not neutralise the document's reserved token strings.
- (party-security, WARN) Rebuttal of party-architect's writer-class BLOCK: its "or set it to null" fallback fails open under the recommended null-stamp rule.
- (party-security, WARN) Rebuttal of party-visionary's backfill: it turns a CSS-blind guess into stored stamps that look verified.
- (party-visionary, WARN) The "one stamp per field" rule makes every future editable on-image text a migration, a badge and a route.
- (party-visionary, WARN) "Visible text" gets two definitions that must agree forever, and the mock suite exercises only one.
- (party-visionary, WARN) The null-stamp branch can never retire, because restore keeps bringing it back, so the null rule chosen now is permanent.
- (party-visionary, NOTE) The apply event has no method field, so the match-rate data mixes once the named alternative ships.
- (party-visionary, NOTE) Rebuttal to party-po's stamp-free alternative: a read-time parse rule changes the verdict on old drafts every time the matcher is tuned.

## User Decisions (2026-10-26, after the deep panel)

The user answered the panel's decisions (the handoff's 030 section). These answers govern the spec; the Proposed Solution above is read through them.

- **D1, scope: badge first, Apply later.** This change ships the stamp, the stale badge (remedies: Edit inline and Regenerate design) and the events. **Apply to image is out of scope here.** It becomes a later change, gated on what the events show (how often headlines are edited after a design, and how often a match would succeed). That defers the Apply route, the splice module, the `parse5` dependency (Open Question 3) and Open Questions 1 and 5 to that change.
- **D2, the stamp records the headline verified as painted.** At every design write that renders a PNG (first generation, regenerate design, refine, inline edit, Override, adopt, and restore, which copies the revision's stamp), the real render checks in the page that the draft's headline is painted visibly in exactly one element. The check is geometric, as 025 does for the composite: a non-empty box inside the canvas, computed `display`, `visibility` and `opacity` that render it, no clipping or overflow, and `elementFromPoint` returning that element. The comparison uses one shared normaliser (whitespace, case, `<br>`, `text-transform`). The stamp is the headline with `verified: true` when the check passes, and `verified: false` when it does not. An unverified stamp is never read as fresh. Under `MOCK_PUPPETEER`, a parse-based stand-in plus a `MOCK_*` sentinel reaches the unverified path. An inline edit that fixes the headline therefore clears the badge.
- **D3, drafts from before 030 show nothing.** A null stamp gets no badge, no note and no parse at read time. Restore can bring a null back, so this rule is a permanent contract, not a transition.
- **D4, the stamp's shape (the recommendation; not asked, adopted unless the user objects).** One JSONB stamp keyed by field, `renderedText: { headline: { text, verified } }`, on `Draft` and `DraftRevision`, with staleness that loops over the keys. A later CTA or kicker field is then one more key with no migration.
- **D5, the publish side: record, warn and flag. Never a gate.**
  - The publish event records whether the image was stale, for interactive and scheduled publishes.
  - The publish dialog shows one line whenever the draft is stale.
  - When a headline edit lands on a draft with a pending scheduled post, the badge says so.
- **Adopted from the panel by default:**
  - one closed reason vocabulary shared by the API response, the badge and the events;
  - a stated rule for case-only edits;
  - the full writer and file list in the spec;
  - the badge states only what the stamp knows (not stale, stale, or the image cannot be confirmed).
