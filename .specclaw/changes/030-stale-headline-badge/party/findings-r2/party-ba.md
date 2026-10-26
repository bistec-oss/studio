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
