# Party Report: 030-stale-headline-badge

**Reviewed:** 2026-10-26
**Tier:** deep (classifier) — Adds a new render-stamp column to Draft and DraftRevision that every render writer must carry, and a new draft action that splices user-edited headline text into stored HTML that is then rendered, which the proposal itself says the party-security panel blocked on escaping and matching.
**Panel:** party-po(sonnet), party-architect(opus), party-ba(sonnet), party-security(opus), party-visionary(opus)
**Verdict:** CHANGES_REQUESTED

## Summary

30 findings: 4 BLOCK, 19 WARN, 6 NOTE upheld — 1 withdrawn

## Findings

### [BLOCK] party-architect — The stamp rule misclassifies writers that change text inside kept HTML, so the badge's own remedy cannot clear it

**Quotes:** > A new render stamps the headline it was built from (`designHeadline`). A write that keeps HTML (inline edit, Override) carries the stored value forward.
**Quotes:** > It offers three buttons: **Apply to image**, **Edit inline** and **Regenerate design**.
**Quotes:** > The only fixes today are Edit inline (find and retype it by hand) or Regenerate design
**Problem:** The proposal puts every writer in one of two classes: a new render, or a write that keeps the HTML. Three writers fit neither class.

Edit inline is offered as a fix because the user retypes the headline in the HTML. Under the carry-forward rule, `renderedHeadline` still holds the old headline afterwards, so the badge stays on after a successful manual fix. One of the badge's three remedies can never clear it. Override has the same problem whenever the pasted HTML changes the headline.

Refine is a model edit of the existing HTML. If it counts as a new render and stamps `designHeadline`, refining a stale draft marks it fresh while the image still shows the old headline. That is the same false clear as the `<title>` case the proposal cites. If refine carries the value forward instead, a refine that does change the headline leaves the draft stale for good.

The stamp is decided by writer type, but whether the HTML still shows the headline depends on what that particular write did to the HTML. In round 1, party-security reached the same conclusion on its own: "Inline edit must recompute the stamp, not carry it forward". That supports this finding.
**Fix:** Name a third writer class: writes that keep the HTML but may change its text (inline edit, Override and refine). For that class, set the stamp from the written HTML using the same match rule Apply uses. When exactly one element shows the new headline, stamp it. Otherwise carry the old value forward or set it to null. If the panel adopts party-security's render-time visibility rule, this check runs at the same render step as Apply's check (see the next finding). Put the rule in the writer guard test.
**Status:** upheld

### [BLOCK] party-architect — Apply commits before it checks, yet promises to write nothing on a failed check, and never names the commitDraftRevision change this needs

**Quotes:** > **Commit** through `commitDraftRevision`. That re-renders the PNG, and the 025 composite placement still applies.
**Quotes:** > **Check the visible text.** In the real render, the element's visible text must equal the new headline.
**Quotes:** > **Stamp** `renderedHeadline` from what the replace changed, and only after the check passes.
**Quotes:** > **Fail closed.** On no match, more than one match, or a failed check, the action fails with a named reason and writes nothing.
**Problem:** The steps run in this order: commit (which re-renders), then check against "the real render", then stamp. Item 1 also says the stamp is written "through `draftStampFields` and `revisionStampFields`", which means inside the commit. "Writes nothing on a failed check" and "stamp only after the check passes" can both hold only in one of two cases:

- `commitDraftRevision` gains a verification hook that runs between its render and its write; or
- Apply renders once outside `commitDraftRevision` to run the check, then commits. That is a second render path beside the one the proposal says `commitDraftRevision` owns.

The proposal names neither. An implementer who follows the steps in order writes a revision and only then learns the check failed: a half-landed write.

Party-security's round-1 BLOCK makes this more pressing. The check it asks for (box inside the canvas, computed styles, overflow, `elementFromPoint`) can only run against a live Chromium page. So the check has to sit inside the render, before the write, which is exactly the seam the proposal leaves unnamed.
**Fix:** State where the check sits. Either:

- `commitDraftRevision` takes a pre-write predicate on the rendered page, listed as a co-change to that function and to its other callers; or
- Apply does an explicit check-render, and the proposal accepts it as a second render path.

Reorder the steps to match.
**Status:** upheld

### [WARN] party-architect — "Visible text" is defined by two engines, and the mock seam cannot produce the not-visible refusal it promises to test

**Quotes:** > **Match** the innermost element whose visible text equals the stamped old headline, with whitespace normalised and case ignored.
**Quotes:** > Under `MOCK_PUPPETEER`, the same check runs on the parsed HTML.
**Quotes:** > Each draft's HTML was loaded in Chromium with the network blocked:
**Quotes:** > Mock seams and E2E for: badge shown after an edit and after Regenerate headline; apply succeeds; apply refused (not found, ambiguous, not visible)
**Problem:** The proposal defines one predicate, "visible text", three ways:

- **At match time,** on a parse5 tree, which has no CSS. Visible text can only mean text content minus the excluded tags.
- **At check time,** in Chromium.
- **In the measurement.** The 32 of 35 figure that the 28-of-35 acceptance floor rests on was measured in Chromium by `headline-measure.cjs`, not by the parse5 module being built.

Under `MOCK_PUPPETEER`, the check runs "on the parsed HTML" just after a parse5 splice wrote exactly that text, so it passes by construction. The `not-visible` refusal listed for E2E then has no deterministic way to fire, and the proposal names no sentinel seam that could force it.

Party-visionary's round-1 WARN reaches the same conclusion about drift between the two definitions. This finding is about the test seam at merge; theirs is about the definitions drifting apart later. They are compatible.
**Fix:**

- Define match-time "visible text" in parse5 terms: text nodes concatenated with the excluded elements removed, `<br>` read as a space, nothing CSS-based.
- Make the fixture acceptance test run the parse5 module itself.
- Name a `MOCK_*` sentinel that forces the visible-text check to fail, so the `not-visible` E2E case is reachable.
  **Status:** upheld

### [WARN] party-architect — Two staleness rules feed one `headlineStale` field, its shape is unspecified, and the null-stamp rule puts an HTML parse into the draft GET

**Quotes:** > A draft is stale when `renderedHeadline` is set and differs from `Draft.headline` after whitespace normalisation. `GET /api/drafts/[id]` returns `headlineStale` with the reason. No model call and no render are needed to read it.
**Quotes:** > **Recommend:** for a null stamp, show the badge when the current headline is not the visible text of exactly one element (the same parser and rule, never attributes or `<title>`).
**Problem:** Two rules feed one field:

- **Item 2** describes staleness as a cheap comparison of the stamp against `Draft.headline`: whitespace normalised, case-sensitive.
- **The recommended answer to Open Question 2** adds a rule for null stamps: a full parse5 parse of the stored HTML on every draft GET, case-insensitive.

The two rules disagree on case. A case-only headline edit is stale under the first rule and fresh under the second.

The proposal never lists the "reason" values that `headlineStale` carries, yet the badge must offer Apply for one reason and hide it for the other. Both `api-types.ts` and the badge depend on that shape.

Party-ba and party-security filed the same two-rule split from their own lenses in round 1, which supports this finding.
**Fix:**

- Specify the `headlineStale` shape as a closed set of reasons, for example `stamp-differs` and `unstamped-unmatched` (or `unknown`, if party-security's "never derive fresh from a parse" is adopted), plus whether Apply is offered.
- Use one shared normaliser for both rules.
- State whether the null-stamp parse runs on every GET or is computed once and cached.
  **Status:** upheld

### [WARN] party-architect — The failure vocabulary differs between the route, the badge and the event

**Quotes:** > On no match, more than one match, or a failed check, the action fails with a named reason and writes nothing. The badge then says why
**Quotes:** > `revision.headline_applied` (outcome `ok`, `not-found`, `ambiguous` or `not-visible`).
**Quotes:** > That re-renders the PNG, and the 025 composite placement still applies.
**Problem:** The route, the badge text and the analytics event share one set of failure reasons, but only the event spells its set out. The route can also fail in ways the event's outcomes do not cover:

- a claim conflict, because the action is "claimed like the other draft actions";
- a 025 composite placement failure during the re-render;
- a render error;
- Apply invoked on a null-stamp draft.

Two implementers would map these differently: one drops the events, the other invents outcome values that the catalogue's schema rejects.

Party-security's round-1 NOTE (a missing `render-failed` outcome) and party-visionary's NOTE (a `method` field) both touch this same enum, so all three findings converge on one closed type.
**Fix:** Define one closed reason enum in the new `headlineApply` module, and have the route response, the badge and the event outcome all import it. Cover the claim conflict, composite failure, render failure, null stamp and reserved-token cases, or state explicitly which of these are not recorded.
**Status:** upheld

### [WARN] party-architect — The affected-files list leaves out writers that item 1 says must change, and the co-changes a new claimed action needs

**Quotes:** > regenerate design, refine, inline edit, Override, adopt;
**Quotes:** > **Files affected:** about 15 (estimated): `prisma/schema.prisma` plus the migration and down script; `src/lib/drafts/revisions.ts`; the generation writers in `src/lib/agent/generateDraft.ts`; the regenerate-design route; a new `src/lib/drafts/headlineApply.ts`; a new apply route; `src/app/api/drafts/[id]/route.ts`; `src/lib/api-types.ts`; a new badge component and the draft page; the analytics catalogue; tests.
**Quotes:** > A new draft action, `POST /api/drafts/[id]/apply-headline`, claimed like the other draft actions:
**Problem:** Item 1 says these writers each write the stamp: refine, inline edit, Override, adopt, restore and Path A first generation. Inline edit and Override must also read the stored value and pass it forward. Yet the files list names only `generateDraft.ts` and the regenerate-design route.

A new claimed action also needs:

- a value for the claim to record;
- whatever shows its pending state;
- handling for a stale claim.

The proposal describes the migration only as the `renderedHeadline` column ("one additive migration") and does not say whether the claim's action vocabulary changes with it. The guard test catches a missing stamp writer only after the fact. This is the merge set, and as written it is incomplete.
**Fix:** List every stamp writer's route or module in Impact. List the claim co-changes: the action value, whether the same migration carries it, and the client's pending-state handling.
**Status:** upheld

### [NOTE] party-architect — Rebuttal to party-po's "replace the stamp with the parse check": the stamp is the only input that tells an edit apart from a model rewording

**Quotes:** > In draft `…zwvn0q`, the only exact match was the `<title>` tag, because the visible headline was worded differently.
**Quotes:** > Offer only Edit inline and Regenerate design, because the old headline is unknown and Apply has nothing to replace.
**Problem:** Party-po's round-1 WARN proposes making the parse-based element check the only staleness rule and dropping the stamp. On the proposal's own evidence, that rule cannot tell "the author edited the headline after the render" apart from "the model worded the headline differently when it rendered". The `…zwvn0q` draft was never edited, yet a parse-only rule would badge it as stale.

The proposal also states the second dependency itself: without a stored old headline, "Apply has nothing to replace". Dropping the stamp therefore removes both the correctness of the staleness signal on untouched drafts and Apply's input. It does not remove just one writer obligation.

This is a structural fact, not a value judgement. Whether Apply ships first or later stays party-po's call. Note that party-po's own BLOCK fix already keeps the stamp in the first cut.
**Status:** upheld

### [WARN] party-ba — The apply path's match rate is measured on a different match rule than the one it will use, and the 28/35 criterion is satisfied by the drafts it was tuned on

**Quotes:**

> | Exactly one innermost element holds it as its text (case-insensitive) | 32 of 35 |
> A minimum match rate as an acceptance criterion: the apply rule matches at least 28 of the 35 real drafts measured above. The fixtures are stored with ids redacted.
> **Match** the innermost element whose visible text equals the stamped old headline, with whitespace normalised and case ignored. Text nodes only: never attributes, `<title>`, `<script>`, `<style>`, `<template>` or comments. `<br>` counts as a space. It must be exactly one element.
> **Problem:** The 32/35 figure counts "innermost element holds it as its text". The shipped rule adds exclusions (no `<title>`, `<script>`, and so on), `<br>` as a space, and "exactly one element". The proposal never says the 32 was computed under these exclusions. It reports only that 34/35 are visible, so the 32 may include non-visible matches. The criterion is also checked against the same 35 drafts used to choose the rule, so it cannot fail for a reason other than a coding slip. These 35 drafts are renders from OP-1, OP-028 and OP-025, which were prompted for hero looks. They are not a sample of real author usage, and Path A is unmeasured (OQ5). The stated headline "91%" therefore does not establish that the user-facing fix will work often.
> **Fix:** State that the 32 was measured under the final rule, or re-measure under it. Say what the criterion is a floor for, and that the sample is not representative. Do not present 91% as the expected hit rate on live drafts.
> **Status:** upheld

### [WARN] party-ba — Frequency of the pain is unknown, yet the build is sized "architectural" on the assumption it hurts

**Quotes:**

> **How often.** Unknown. No analytics event records a headline edit (the 006 catalogue has none), and prod does not run `v2` yet. This change adds the events that will answer it.
> **Size:** architectural. It adds a per-revision stamp that every design writer must carry, plus a migration, a new draft action and a new HTML-parsing module.
> **Problem:** The proposal concedes that nobody knows how often a headline edit leaves a stale image, then commits to the full build, including the stamp migration, the parser dependency and the apply action. The events that would measure frequency ship in the same change as the fix, so the premise is never tested before the cost is paid. The pain is real in mechanism, since the headline field and the image diverge. What is unevidenced is that users hit it and care. No user report or observed incident is cited. A cheaper split would ship the badge and events first, but that is a scope matter for party-po. The finding here is only that the problem's frequency is asserted as worth solving without evidence.
> **Fix:** Cite a real incident or user report. Otherwise state plainly that the premise is unverified and make the events and badge the evidence-gathering step, with Apply justified by what they show.
> **Status:** upheld

### [WARN] party-ba — No acceptance criterion tests the stated main claim that the badge clears only when the image really shows the new headline

**Quotes:**

> **Stamp** `renderedHeadline` from what the replace changed, and only after the check passes.
> Under `MOCK_PUPPETEER`, the same check runs on the parsed HTML.
> Mock seams and E2E for: badge shown after an edit and after Regenerate headline; apply succeeds; apply refused (not found, ambiguous, not visible)
> **Problem:** The problem is that the image and the headline diverge without the user noticing. The stale test compares two stored strings (`renderedHeadline` against `Draft.headline`). It never inspects what the PNG shows. If a writer stamps the wrong value, or the model's design text differs from `designHeadline` (the proposal itself shows the model words headlines differently), the badge is silent while the image is stale. The E2E runs under the mock. Under the mock the visible-text check runs on parsed HTML, not on a render. So no criterion, at ship time, falls on a case where the stamp says fresh and the image says stale. The first-generation stamp, "a new render stamps the headline it was built from (`designHeadline`)", is a claim that the render contains that text, and nothing verifies it.
> **Fix:** Add a criterion that fails when a stamped-fresh draft's rendered page text does not contain the stamped headline, using the real-render harness. Or state that the stamp records intent, not the image, and that the badge can miss real staleness.
> **Status:** upheld

### [WARN] party-ba — "Stale" and "the old headline" carry two meanings, and the null-stamp case contradicts the badge text

**Quotes:**

> A draft is stale when `renderedHeadline` is set and differs from `Draft.headline` after whitespace normalisation.
> "The image still shows the old headline “…”".
> for a null stamp, show the badge when the current headline is not the visible text of exactly one element
> **Problem:** Stale is defined as stamp versus field, but the badge text asserts what the image shows. For a null-stamp draft the old headline is unknown, so the quoted "old headline" cannot be filled in. The null-stamp rule then flags a draft for a different condition, namely that the headline is not found in the HTML. That condition is also true for a draft whose headline was never edited. The model rewords headlines, as the 14% and 91% rows imply. The badge would then tell users that an untouched, correct image is stale. The first reading (the user edited since render) and the second (the headline text is not an element) give two different builds and two different false-positive rates. The case-insensitive match also treats a case-only edit as not stale in the element check but as stale in the stamp check.
> **Fix:** Define stale once, with the null-stamp rule worded as a separate "cannot confirm" state and its own message. Say how a case-only edit is treated.
> **Status:** upheld

### [NOTE] party-ba — Assumes the user notices the badge and accepts flattened styling, without evidence of either behaviour

**Quotes:**

> **Recommend (a), the no-model replace,** because the user sees the result before publishing and can still Regenerate design.
> The cost: inline markup inside the element (an accent span, `<br>` line breaks) becomes one plain run of text in the element's own style. The confirm step says so.
> **Problem:** The measured usual shape is an accent span plus line breaks, so Apply will usually flatten the design's emphasis. The recommendation rests on the assumption that users review the result before publishing. The proposal also does not establish that users would prefer a flattened apply over Edit inline. The events (`revision.headline_applied`) measure apply outcomes. They do not measure whether the user keeps the result or reverts it.
> **Fix:** Add an event or measure for revert after apply, or note the assumption.
> **Status:** upheld

### [BLOCK] party-po — A cheaper variant (inform-only badge, or a no-stamp read-time check) is dismissed in one line, and the proposal's own numbers show the Apply path is the expensive, low-value part

**Quotes:**

> 4. **Apply to image, with no model call.** A new draft action, `POST /api/drafts/[id]/apply-headline`, claimed like the other draft actions:
> (b) an inform-only badge with no Apply button (cheapest);
> **Recommend (a), the no-model replace,** because the user sees the result before publishing and can still Regenerate design.
> **How often.** Unknown. No analytics event records a headline edit (the 006 catalogue has none), and prod does not run `v2` yet. This change adds the events that will answer it.
> **Problem:** Do-nothing is priced as "unknown" frequency. Even so, the proposal builds an architectural change: a stamp on two tables, every render-stamp writer, a new parser dependency, a new claimed draft action, a splice module, a visible-text check and a revision commit. The cheap variant (b), an inform-only badge, delivers the main value, which is that the user is told the image is stale. That value does not depend on Apply. The stated reason for choosing (a) is only that the user can still Regenerate design, and that reason does not weigh the cost of building Apply at all. The proposal's own table says Apply flattens the accent span and line breaks on most real drafts, so the result often looks worse than the original. The events it adds are meant to measure frequency, yet Apply is built before that frequency is known.
> **Fix:** Ship the badge, the stamp and the two events first, with inform-only buttons (Edit inline and Regenerate design). Gate Apply on the measured edit rate and apply-eligible rate from the events. Name that cut line in the proposal.
> **Status:** upheld

### [WARN] party-po — The per-revision stamp and migration are paid for by every writer to serve a read-time check that could be cheaper

**Quotes:**

> It becomes a nullable TEXT column on `Draft` and on `DraftRevision`, written through `draftStampFields` and `revisionStampFields`. Every writer that already writes a render stamp therefore carries it
> **Size:** architectural. It adds a per-revision stamp that every design writer must carry, plus a migration, a new draft action and a new HTML-parsing module.
> **Recommend:** for a null stamp, show the badge when the current headline is not the visible text of exactly one element
> **Problem:** The stamp costs about 8 writers, a guard test, a migration and a down script, forever. Open Question 2 already designs a stamp-free check: parse the HTML and test whether the current headline is the visible text of exactly one element. That check works on every draft, including all pre-030 drafts, and the proposal itself says the stamp is backfilled for none of them. The proposal does not compare the two. If the element check is reliable (91% match on the measured set), it could serve as the only staleness rule and remove the stamp. It would need a parser, but no migration and no writer coverage. The proposal never prices this alternative, and it never says what the stamp buys beyond Apply's "old headline" lookup.
> **Fix:** State what the stamp adds over the parse-based check. If the answer is only Apply, tie the stamp to the Apply cut line so it ships later or not at all.
> **Status:** upheld

### [WARN] party-po — Unbounded scope with no stated value, plus one acceptance bar with no stated source

**Quotes:**

> 4. **The publish dialog.** Should it show one non-blocking line ("The image shows an older headline") when the draft is stale? **Recommend yes** if it fits the dialog without a new component.
>
> - The apply rule matches at least 28 of the 35 real drafts measured above. The fixtures are stored with ids redacted.
> - Mock seams and E2E for: badge shown after an edit and after Regenerate headline; apply succeeds; apply refused (not found, ambiguous, not visible); restore and adopt carry the stamp; a pre-030 (null) draft.
>   **Problem:** The publish-dialog line is "while we're in here" scope. It is also the only surface a user sees at the moment of cost (publishing a stale image), which weakens "Out of Scope: blocking or warning inside publish" and the stated cut line. The proposal states a value for neither. The badge-on-page and publish-time warning pair is one decision, not two. The E2E list covers seven or more scenarios plus mock seams for what is a note on one page. Open Question 5 leaves Path A unmeasured, so the 28/35 bar covers only Path B and gives no guarantee for template fills.
>   **Fix:** Decide the publish-dialog line now (include or cut). Trim E2E to the paths that differ in behaviour. Name the Path A cost as either in scope or a separate later change.
>   **Status:** upheld

### [NOTE] party-po — Name the shipping cut line and the default for pre-030 drafts

**Quotes:**

> - Backfilling `renderedHeadline` for existing drafts.
>   The alternative is to show nothing for null drafts.
>   **Problem:** On upgrade every existing draft has a null stamp, so under the recommended Open Question 2 rule, parsing runs on every draft GET and may badge old drafts that were never edited. Every old draft opening would carry a parse cost and a possible false alarm. The default for a user who changes nothing is then noise, and the proposal never prices it.
>   **Fix:** Default to "show nothing for null drafts" (the proposal's own alternative). Add the element-parse check later only if the events show demand.
>   **Status:** upheld

### [BLOCK] party-security — The "visible text" check passes on hidden, clipped or covered text, then clears the badge

**Quotes:**

> **Check the visible text.** In the real render, the element's visible text must equal the new headline. Under `MOCK_PUPPETEER`, the same check runs on the parsed HTML.
> **Stamp** `renderedHeadline` from what the replace changed, and only after the check passes.
> **Match** the innermost element whose visible text equals the stamped old headline, with whitespace normalised and case ignored.
> **Problem:** The proposal's own measurement shows that the parser can find a headline the render does not show. 32 of 35 drafts match at element level, but the measurement confirms only 34 of 35 as visible page text, and in 4 of the 9 raw single matches the match was not visible. A parse5 match cannot see CSS. It can pick an element that is `display:none`, `opacity:0`, off the canvas, clipped by `overflow:hidden`, or covered by another layer. The check then asks for "the element's visible text", and a text read such as `innerText` or `textContent` still returns the string for hidden, clipped, overflowing or covered elements. So the check passes, `renderedHeadline` is stamped with the new value, and the badge clears while the PNG still shows the old headline or a cut-off new one. Flattening an accent span or `<br>` breaks into one run also changes how the text wraps, so overflow after Apply is a likely result. A false pass looks exactly like success, and the wrong stamp stays for good. In round 2, party-architect (the mock check passes by construction) and party-visionary (two definitions of visible text) reached the same weakness from their own angles. Neither argued that the exposure is absent.
> **Fix:** Define the check from what the page actually paints, measured in Chromium after the render. All of these must hold:

- the element has a non-empty box inside the canvas rect;
- its computed `display`, `visibility` and `opacity` all let it render;
- on the element and on each clipping ancestor, `scrollWidth`/`scrollHeight` are no larger than `clientWidth`/`clientHeight`;
- `elementFromPoint` at sample points across the text box returns the element or one of its children, as 025 does for the composite;
- the comparison handles `text-transform`.

If any of these fails, return `not-visible` and write nothing. Run the same geometry test on the old headline before the splice, so the Match step refuses a hidden match.
**Status:** upheld

### [WARN] party-security — `renderedHeadline` is written from intent at most writers and never checked against the HTML

**Quotes:**

> A new render stamps the headline it was built from (`designHeadline`). A write that keeps HTML (inline edit, Override) carries the stored value forward.
> It offers three buttons: **Apply to image**, **Edit inline** and **Regenerate design**.
> **Problem:** Only Apply checks the stamp against the HTML. Every other writer records what the headline should be, not what the HTML holds.

First, a new render stamps `designHeadline` even when the model wrote different words. The proposal measured one such draft: in `…zwvn0q` the visible headline was worded differently. The badge would then quote an "old headline" that never appeared on the image.

Second, inline edit changes the HTML but keeps the stamp. That causes two failures:

- **Fail open:** an inline edit that rewords the on-image headline leaves the stamp equal to `Draft.headline`, so the system reports a fresh image that is not fresh.
- **Fail closed, but useless:** the user follows the badge's own advice and fixes the headline with Edit inline. The stamp still holds the old value, so the badge never clears, and a later Apply looks for text that is gone and returns `not-found`.

A badge that stays on after the user fixed the problem teaches users to ignore it. party-architect's BLOCK on writer classes and party-ba's WARN on the stamp recording intent agree with this.
**Fix:**

- At every stamp write (new render, refine, inline edit, Override, adopt), run the same parse, match and visibility rule against the HTML being committed. Stamp the headline only if it is the visible text of exactly one element.
- Otherwise, stamp an explicit "unverified" value. The UI must treat it as "cannot confirm", never as fresh.
- Inline edit must recompute the stamp, not carry it forward.
  **Status:** upheld

### [WARN] party-security — The splice can delete content the check never looks at

**Quotes:**

> **Replace** that element's inner content with the new headline, HTML-escaped. Splice it at the parser's offsets so every other byte of the document is unchanged.
> The cost: inline markup inside the element (an accent span, `<br>` line breaks) becomes one plain run of text in the element's own style. The confirm step says so.
> **Problem:** The match rule is "the innermost element whose visible text equals the headline". An element whose children have no text also qualifies:

- an inline `<img>` or `<svg>` icon;
- an `__INLINE_ASSET_n__` logo;
- a 025 `data-composite` wrapper holding the `__COMPOSITE_0__` token.

Replacing the inner content deletes all of them without a trace. The confirm step mentions only spans and line breaks. The visible-text check looks only at the target element, so an image or composite deleted next to the new text still passes.

The offsets themselves are a second risk. When parse5 recovers from bad HTML, such as an implied end tag or misnested elements, an element can lack an explicit end-tag location. Splicing at the element's end offset can then swallow sibling content, and the check still passes. Restore can recover the damage, but nothing signals that it happened.
**Fix:**

- Refuse the match when the element contains anything other than text, `<br>` and inline phrasing elements (`span`, `em`, `strong`, `b`, `i`). In particular, refuse `img`, `svg`, `picture`, `[data-composite]` and any `__*_n__` token. Give the refusal a named outcome and write nothing.
- Refuse when parse5 reports no explicit start-tag and end-tag location for the element.
- After the splice, re-parse and assert that the document outside the element is unchanged: the same element count and the same text.
  **Status:** upheld

### [WARN] party-security — For pre-030 drafts, the recommended read-time rule fails open on CSS-hidden matches

**Quotes:**

> **Recommend:** for a null stamp, show the badge when the current headline is not the visible text of exactly one element (the same parser and rule, never attributes or `<title>`).
> **Staleness is pure and read-time.** A draft is stale when `renderedHeadline` is set and differs from `Draft.headline` after whitespace normalisation. `GET /api/drafts/[id]` returns `headlineStale` with the reason. No model call and no render are needed to read it.
> **Problem:** The GET path has no render, so "visible text" there can only mean "parsed text outside attributes and `<title>`". Suppose the current headline sits in exactly one element that CSS hides, clips or pushes off the canvas, or in a hidden duplicate the model emitted. The rule then reports "not stale", and no badge appears on a draft whose image does not show the headline. For pre-030 drafts, the absence of a badge reads to the user as a clean result, yet the rule cannot establish that. This is the raw-match trap the 006 panel warned about, narrowed from the whole document to element text but not removed. party-po's NOTE (show nothing for null drafts) would remove this exposure, as long as no other surface reads a null stamp as fresh: not the publish dialog line from Open Question 4, and not any record written at publish.
> **Fix:** Never derive "fresh" for a null stamp from parsing alone. Either show "unknown" for null drafts, or derive "fresh" only from a render-time geometry check (see the BLOCK above) and cache its result as the stamp.
> **Status:** upheld

### [WARN] party-security — A stale image is published with no warning, record or recovery path on the publish side

**Quotes:**

> Publishing is never blocked.
> Blocking or warning inside publish. The badge is on the draft page only (Open Question 4).
> **Recommend yes** if it fits the dialog without a new component.
> **Problem:** Publishing to Instagram or LinkedIn is the one effect here that cannot be undone. At publish time the system already knows `headlineStale`, yet the design records nothing about it. The dialog line is only conditional. A `Post` that was already SCHEDULED before the headline edit publishes the stale PNG from the worker with no human present. Afterwards, nobody can tell that a published post went out stale. The only recovery is deleting the post on each channel by hand, and nothing tells the operator which posts need it. This finding asks for a record and a signal, not a gate, so it does not conflict with party-po's scope objection to the dialog line.
> **Fix:** None of these blocks publishing:

- At the moment of publishing, interactive or scheduled, write `headlineStale` and its reason to the `Post` row or as a field on the publish event.
- Show the dialog line whenever the draft is stale, not only "if it fits".
- When a headline edit lands on a draft that has a pending SCHEDULED `Post`, say so in the badge.
  **Status:** upheld

### [NOTE] party-security — HTML escaping does not neutralise the document's reserved token strings

**Quotes:**

> **Replace** that element's inner content with the new headline, HTML-escaped.
> **Commit** through `commitDraftRevision`. That re-renders the PNG, and the 025 composite placement still applies.
> **Problem:** Two kinds of text reach the splice: a headline the user typed, and model output from Regenerate headline. HTML escaping covers `<`, `>`, `&` and quotes. It does not cover the placeholder names the stored HTML already relies on (`__COMPOSITE_0__`, `__INLINE_ASSET_n__`), which are resolved after this step. A headline containing one of these strings puts a second copy of a reserved token into the stored HTML, and the proposal does not say how the later steps treat a duplicate. Only the author's own draft is exposed.
> **Fix:** Before the splice, reject or rewrite any new headline that matches the reserved token pattern, as a named outcome.
> **Status:** upheld

### [WARN] party-security — Rebuttal of party-architect's writer-class BLOCK: its "or set it to null" fallback fails open under the recommended null-stamp rule

**Quotes:**

> A new render stamps the headline it was built from (`designHeadline`). A write that keeps HTML (inline edit, Override) carries the stored value forward.
> **Recommend:** for a null stamp, show the badge when the current headline is not the visible text of exactly one element (the same parser and rule, never attributes or `<title>`).
> **Problem:** I agree with party-architect's diagnosis: inline edit, Override and refine need a third writer class whose stamp comes from the written HTML. Its fix offers two fallbacks for when the parse does not find exactly one match: "carry the old value forward, or set it to null". These are not equally safe.

- **Carrying the old value forward fails closed.** The stamp differs from `Draft.headline`, so the badge stays on.
- **Setting null fails open.** It sends the draft into the Open Question 2 rule, which decides freshness from a parse that cannot see CSS (my WARN above). After a write that removed or hid the headline, the draft can then read as fresh.

A write whose effect on the headline the parser cannot confirm should never produce a value that a later rule can read as fresh.
**Fix:** In the third writer class, when the parse finds no single match, write an explicit "unverified" value that the UI shows as "cannot confirm". Do not use null, and do not carry the old value forward when the old value is no longer in the HTML either.
**Status:** upheld

### [WARN] party-security — Rebuttal of party-visionary's backfill: it turns a CSS-blind guess into stored stamps that look verified

**Quotes:**

> - Backfilling `renderedHeadline` for existing drafts.
>   **Recommend:** for a null stamp, show the badge when the current headline is not the visible text of exactly one element (the same parser and rule, never attributes or `<title>`).
>   **Problem:** party-visionary proposes a one-time backfill that stamps every pre-030 row whose current headline is the visible text of exactly one element, using the same parse rule as Open Question 2. That rule cannot see CSS, so it accepts headlines that are hidden, clipped or off the canvas. At read time, the error lasts one request and goes away if the rule is fixed. A backfill writes it into `Draft` and `DraftRevision` as a stamp that cannot be told apart from one written after a verified render. Restore then copies these rows forward, so the false "fresh" outlives any later fix to the rule. The backfill also stamps the current `Draft.headline` as what was rendered, even on drafts where the headline was edited before 030. That is the stale case this change exists to catch, and the backfill would mark it fresh for good.
>   **Fix:** If a backfill is done, it must be render-verified (the geometry check in the BLOCK above, run under the real-render harness). It must stamp a value marked as backfilled, which the UI can treat differently. Otherwise it should mark unmatched and unverifiable rows "unverified" and leave matched rows null. It must never stamp "fresh" from parsing alone.
>   **Status:** upheld

### [WARN] party-visionary — The "one stamp per field" rule makes every future editable on-image text a migration, a badge and a route

**Quotes:**

> - A fingerprint over every rendered input (party-visionary's 006 idea). Only the headline is an editable rendered input today, so a second field would get its own stamp.
> - Other on-image text (CTA, kicker, body lines). Captions are not on the image.
>
> 4. **Apply to image, with no model call.** A new draft action, `POST /api/drafts/[id]/apply-headline`, claimed like the other draft actions:

**Problem:** The artifact names the next change itself: making the CTA, kicker or body line editable. Under the precedent this change sets, that change must repeat the whole stack for its own field:

- two more nullable TEXT columns, on `Draft` and on `DraftRevision`;
- a new field threaded through `RenderStamp`, `draftStampFields`, `revisionStampFields`, `restoredRenderStamp` and every render-stamp writer;
- a wider guard test, a second staleness rule and a second notice;
- an `apply-cta` route and two more events.

With N fields that is 2N columns, N notices and N apply routes. A contributor who copies 030 will copy the field-named column and the field-named route, because that is the shape 030 shows them.

Round-2 findings from other seats make this worse. party-architect's BLOCK and party-security's WARN both say each stamp write must parse the committed HTML and run the match and visibility rule, so the stamp is verified, not just intended. If that is adopted, the per-field cost also includes a per-field matcher at every writer. One field-keyed shape lets that verification loop run once over all fields. Field-named shapes duplicate it per field.

**Fix:** Keep today's cost, but key it by field:

- one JSONB `renderedText` stamp (`{ headline: "…" }`), as `composition` already is;
- a staleness rule and a writer verification that loop over the keys;
- one apply action that takes the field as a parameter (`apply-text` with `field: 'headline'`).

A second field is then one more key and one more matcher entry, with no migration. If the artifact still wants a field-specific shape, it should say so explicitly and explain why.
**Status:** upheld

### [WARN] party-visionary — "Visible text" gets two definitions that must agree forever, and the mock suite exercises only one

**Quotes:**

> - **Check the visible text.** In the real render, the element's visible text must equal the new headline. Under `MOCK_PUPPETEER`, the same check runs on the parsed HTML.
>
> 5. **Path A.** All 35 measured drafts are Path B. Template fills may differ. The plan measures the seeded Path A templates before fixing the rule.

**Problem:** The proposal's own table already shows the two definitions disagree:

- visible in the rendered page (Chromium): 34 of 35;
- held by exactly one innermost element (the parser): 32 of 35.

The real check runs in Chromium and the mock check runs on parse5. E2E runs under `MOCK_PUPPETEER`, so CI only ever tests the parser's side.

The rule is expected to change. The Open Question 5 Path A measurement will tune it, and so will any later look or prompt change that alters headline markup (028 and 025 each added looks). Each tuning must land in both places in the same commit, and nothing fails if only one is edited. The mock suite then stays green while prod returns `not-visible` on drafts the parser accepts. Nobody notices until the `revision.headline_applied` outcome mix shifts on `/admin/insights`.

**Fix (narrowed in round 2):** party-security's BLOCK shows the real check must be a Chromium geometry test (box in canvas, computed visibility, overflow, `elementFromPoint`). A pure node-tree function cannot express that, so my round-1 option of one shared function for both sides is withdrawn.

The pair that must stay in sync is smaller than I first said: the text normaliser (whitespace, case, `<br>` as a space, `text-transform`) and the element-selection rule. Put those in one module that both sides import, keep the geometry on the Chromium side only, and add a `test:render` real-Chromium fixture. That fixture runs the stored real-draft fixtures through the parse5 matcher and the Chromium check, and fails when they disagree on a draft.
**Status:** upheld

### [WARN] party-visionary — The null-stamp branch can never retire, because restore keeps bringing it back, so the null rule chosen now is permanent

**Quotes:**

> - Backfilling `renderedHeadline` for existing drafts.
>   **Recommend:** for a null stamp, show the badge when the current headline is not the visible text of exactly one element (the same parser and rule, never attributes or `<title>`).
> - restore (`restoredRenderStamp` copies the revision's value);

**Problem:** The artifact treats null as "rendered before 030", which suggests the null branch fades out as old drafts age. It does not fade. Restore copies the revision's stamp, so restoring any pre-030 `DraftRevision`, even years from now, puts a null back on a current draft. Whatever rule the artifact picks for null is therefore a permanent second staleness rule, not a migration-period one. Under the recommended Open Question 2 rule, that means:

- a parse5 parse stays on the `GET /api/drafts/[id]` path forever;
- every later change to staleness (a second field, the publish-dialog line from Open Question 4) has to handle both branches;
- tests need pre-030 fixtures indefinitely.

**Fix (revised in round 2):** I withdraw my round-1 fix, a one-time parse-based backfill. party-security's WARN on pre-030 drafts shows the parse-only rule fails open on CSS-hidden or clipped text. A backfill would make that inference permanent in the stamp column, where it cannot be told apart from a verified stamp. That is a worse one-way door than the read-time branch.

The problem still stands and favours the alternative the artifact already names, which party-po's NOTE and party-security's WARN also recommend: null means "unknown". Show no "fresh" claim, offer Edit inline and Regenerate design, and do no parse at read time. Because restore makes the choice permanent, the artifact should state the null rule as a permanent contract, not as a transition.
**Status:** upheld

### [NOTE] party-visionary — The apply event has no method field, so the match-rate data mixes once the named alternative ships

**Quotes:**

> - `revision.headline_applied` (outcome `ok`, `not-found`, `ambiguous` or `not-visible`).
>   Neither event holds headline text. Together they give the frequency and the real match rate the 006 panel asked for.
> - A model-based apply (a scoped Haiku call that rewrites the element with its styling). It is the alternative in Open Question 1, not built here.

**Problem:** The event exists to measure the real match rate of the splice. The artifact already names the likely next change: Open Question 1(c), a Haiku apply checked the same way, which would emit this same event with the same outcomes. When it lands, one of two things happens:

- a `schemaVersion` bump splits the history at that point; or
- the two methods' outcomes merge into one rate on `/admin/insights`, and that rate can no longer show whether the model apply is worth it.

party-architect's WARN on the failure vocabulary and party-security's NOTE on `render-failed` widen the outcome enum. This finding is about a different axis, the method, and it is still missing.

**Fix:** Add `method: 'splice'` to `revision.headline_applied`, an enum with one value today. The later model apply then becomes a new enum value under the same schema version.
**Status:** upheld

### [NOTE] party-visionary — Rebuttal to party-po's stamp-free alternative: a read-time parse rule changes the verdict on old drafts every time the matcher is tuned

**Quotes:**

> **Recommend:** for a null stamp, show the badge when the current headline is not the visible text of exactly one element (the same parser and rule, never attributes or `<title>`).
> It becomes a nullable TEXT column on `Draft` and on `DraftRevision`, written through `draftStampFields` and `revisionStampFields`.

**Problem:** party-po's WARN proposes using the parse-based element check as the only staleness rule and dropping the stamp. On merge day that is cheaper. Over the long run it is the more expensive option to live with:

- **Old verdicts move.** A read-time rule recomputes every draft's verdict on every GET, using whatever matcher is current. The matcher is expected to change: the Open Question 5 Path A tuning, and every later look or prompt change that alters headline markup. Each tuning would silently flip the badge on historical drafts that nobody has touched.
- **The stamp freezes the verdict.** The stamp records the judgment at the moment the design was rendered, so a later matcher change affects only new writes.
- **The stamp is the only signal of an edit.** Without it, the system cannot tell "the user edited the headline" from "the model worded it differently at render". party-ba's WARN shows the second case is common. Every later consumer of staleness (the publish-dialog line, a `Post`-row record as party-security proposes) would inherit that ambiguity.

The stamp's per-writer cost is real. It buys a verdict that stays put, and the stamp-free rule gives that up.

**Fix:** Keep a persisted stamp, ideally the field-keyed form from my first finding. If party-po's cut line defers Apply, ship the stamp with the badge rather than deferring the stamp.
**Status:** upheld

## Dissent

_Withdrawn findings. The severity token is prefixed WITHDRAWN so these do not count as live findings._

### [WITHDRAWN NOTE] party-security — The apply event's outcomes have no value for a failure after the match

**Quotes:**

> `revision.headline_applied` (outcome `ok`, `not-found`, `ambiguous` or `not-visible`).
> Together they give the frequency and the real match rate the 006 panel asked for.
> **Problem:** Apply can also fail after a successful match: the render fails, the 025 composite cannot be placed, or `commitDraftRevision` loses the claim. None of the four outcomes describes these. Such failures are either not recorded or recorded under the wrong outcome, which skews the measured match rate.
> **Fix:** Add an outcome for render or commit failures, such as `render-failed`, with a redacted reason, so every Apply attempt leaves exactly one event.
> **Status:** withdrawn — party-architect's WARN "The failure vocabulary differs between the route, the badge and the event" covers this fully: one closed reason enum shared by the route, the badge and the event, including render, composite, claim-conflict and null-stamp failures. Its fix covers mine, and contract specification is that seat's mandate.
