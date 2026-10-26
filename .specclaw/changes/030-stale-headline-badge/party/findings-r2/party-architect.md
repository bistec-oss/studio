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
