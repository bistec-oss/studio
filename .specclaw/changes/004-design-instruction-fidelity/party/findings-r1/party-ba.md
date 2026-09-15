### [WARN] party-ba — Core claim ("core promise failing") is generalized from a single tester's four examples with no frequency or breadth evidence

**Quotes:** > A real tester (Maleesha, testing with the BISTEC Global and Hearts Academy accounts) reports that bistec-studio is _"useful for creating initial concepts, but it was difficult to get specific edits and instructions followed accurately."_ ... This is the product's core promise failing: the tool generates, but it does not **obey**.
**Problem:** The entire evidentiary base for the problem statement is one tester's session and four attached exports. The proposal escalates that anecdote directly to "the product's core promise failing" with no data on how often refine instructions succeed vs. fail across the broader user base, no count of sessions or teams affected, and no baseline for what "accurately" means in aggregate. A proposal this size (medium complexity, ~12–18 files, touching every draft action) is justified by an unmeasured severity claim.
**Fix:** Either scope the problem statement to what is actually shown ("four specific refine failures from one tester's session, with root causes traced in code") or cite additional evidence (other tickets, support requests, a failure-rate sample) that the "core promise failing" framing requires.
**Status:** upheld

### [WARN] party-ba — No falsifiable acceptance criteria for the proposal's main claim; the definition of "applied" and "success" is left to open questions

**Quotes:** > Make the refine path state **what kind of change** is being asked for, **prove** the change landed, and give the user a way to edit without prose ambiguity at all.

> Should "couldn't apply" be a hard failure surfaced in the UI, or a soft warning on a committed revision? The former is honest; the latter is less disruptive mid-session.
> **Problem:** There is no Acceptance Criteria section anywhere in the proposal. The document's central verifiable claim — that instructions will now be followed, or the user will be told they weren't — has no stated observation that would make it fail. Whether a "not applied" outcome is a hard failure or a soft warning, and whether a failed revision is kept or discarded, are both listed as open questions rather than decided, so at ship time there is no way to check whether the stated goal was met.
> **Fix:** Add acceptance criteria per numbered solution item (e.g., "given a `remove` instruction, output must not contain the removed element, verified by the post-refine check"), and resolve the two open questions above before they become unfalsifiable defaults.
> **Status:** upheld

### [WARN] party-ba — Element-targeted editing assumes users will switch away from prose instructions, which the proposal never establishes

**Quotes:** > **Element-targeted editing.** Extend the existing draft inline-edit so the user can click a specific element and edit it directly. Removes prose ambiguity entirely for text, colour and sizing changes — the cases where "reduce the text" should never have needed a model at all.
**Problem:** This item's justification is that "reduce the text" (a reported failure) "should never have needed a model." But the fix only removes ambiguity if the user actually discovers and chooses the click-to-edit affordance instead of typing a prose instruction into refine, which is the exact behaviour Maleesha's report shows she used. Nothing in the proposal establishes that users will be steered to the new surface rather than continuing to type "reduce the text" and hitting the same prose-refine path (now covered by verification, but not by this item).
**Fix:** State how users are directed to element-targeted editing for these cases (e.g., prose refine detects a text/colour/size-only request and suggests the click-to-edit surface instead of running the model), or drop the claim that this item resolves the reported "reduce the text" failure.
**Status:** upheld

### [NOTE] party-ba — Font-coverage claim generalizes from one observed glyph class to "any non-Latin symbol or emoji"

**Quotes:** > **All four** attached exports render the rating stat as `4.8⍰` — a tofu box where a star glyph should be. Any non-Latin symbol or emoji the design agent emits rasterizes as a replacement box.
**Problem:** The evidence shown is a single glyph (a star, in a rating stat) rendering as tofu across four exports. The proposal then asserts, without further evidence, that this generalizes to the full class of "any non-Latin symbol or emoji" — driving item 4's scope ("install symbol/emoji coverage" — a materially larger font/package decision than fixing one glyph). The root cause (Dockerfile installs Sinhala only) does support a broader gap in principle, but the observed evidence only demonstrates one glyph family failing.
**Fix:** Either note this generalization is inferred from the root cause rather than directly observed, or test a small set of additional non-Latin/emoji glyphs before committing to "any" in the problem statement.
**Status:** upheld

### [NOTE] party-ba — Taxonomy term "constrain" is introduced with no definition or example, unlike add/replace/remove

**Quotes:** > **Instruction taxonomy.** Classify each instruction as `add` / `replace` / `remove` / `constrain` and give the model explicit semantics for each.
**Problem:** `add`, `replace`, and `remove` are each given a worked example elsewhere in the proposal ("include a human character," "use the uploaded image as the background," "reduce the text"). `constrain` has none. Depending on reading, "constrain" could mean a modifier on an existing element (e.g., "make it bigger"), a stylistic rule (e.g., "keep it minimal"), or a hard boundary condition (e.g., "don't use red") — each of which would classify differently and route to different prompt semantics.
**Fix:** Give `constrain` a worked example from the same evidence set (or a plausible instruction) so the classifier boundary is unambiguous before implementation.
**Status:** upheld

### [NOTE] party-ba — The brand-conflict-protocol root cause is asserted as "confirmed" without the file/line citation given to the other three root causes

**Quotes:** > Four root causes were confirmed in the code and in the exports:

> the brand-conflict compliance protocol in `refine.ts` exists **only in API mode** while production runs CLI mode — so that entire path is dead code in prod.
> **Problem:** Root causes 1–3 each cite a specific file and, in two cases, a line number (`src/lib/agent/prompts/refine.ts`, `Dockerfile:68`). This fourth claim (bundled into the "two further known defects" paragraph, not the numbered root-cause list) asserts a mode-gating fact about `refine.ts` with no line or excerpt, despite being stated with the same certainty ("confirmed in the code").
> **Fix:** Cite the specific conditional in `refine.ts` that gates the protocol to API mode, matching the evidentiary standard set by the other root causes.
> **Status:** upheld
