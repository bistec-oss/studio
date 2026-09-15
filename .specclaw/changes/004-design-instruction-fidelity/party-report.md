# Party Report: 004-design-instruction-fidelity

**Reviewed:** 2026-09-15
**Tier:** deep (classifier) — The refine prompt is structurally rewritten with taxonomy-based instruction semantics, a new verification gate is inserted into the refine path that all draft actions depend on, and three open questions about verification scope and element-targeted editing method change what is built. Dockerfile release machinery is modified for font coverage.
**Panel:** party-po(sonnet), party-architect(opus), party-ba(sonnet), party-security(opus), party-visionary(opus)
**Verdict:** CHANGES_REQUESTED

## Summary

34 findings: 7 BLOCK, 19 WARN, 8 NOTE upheld — 0 withdrawn

## Findings

### [BLOCK] party-architect — Element-targeted editing builds a second editing path into the same artifact the refine path writes, with no stated arbitration

**Quotes:** > 3. **Element-targeted editing.** Extend the existing draft inline-edit so the user can click a specific element and edit it directly. Removes prose ambiguity entirely for text, colour and sizing changes — the cases where "reduce the text" should never have needed a model at all.
**Quotes:** > Element-targeted editing: does it edit the **HTML directly** (deterministic, no model, but limited to what the DOM exposes) or send a scoped instruction to the model with the element as context (more capable, reintroduces some ambiguity)?
**Problem:** The artifact names an existing mechanism ("the existing draft inline-edit") and then leaves open whether the new surface is that mechanism or a second one — a direct-DOM writer versus a second model-driven writer of the same `htmlContent`/revision chain the refine path already writes. Those are two different designs with two different revision-commit paths, and the choice is deferred to an open question rather than settled. Until it is settled, an implementer can produce either a genuine extension of one writer or a parallel second writer of the draft HTML, and the second diverges from refine on the first change to how revisions are appended.
**Fix:** State in the artifact whether element-targeted editing reuses the existing inline-edit's HTML-writing and revision-commit path, or introduces a new one; if new, name what the existing one cannot do.
**Status:** upheld

### [BLOCK] party-architect — The verification pass is placed on the refine path only, while the artifact states all three draft actions share the mechanism it is meant to guard

**Quotes:** > 2. **Post-refine verification pass.** A cheap model call checks the rendered result against the instruction. On failure, retry once with the miss made explicit; on a second failure, surface _"couldn't apply this instruction"_ rather than silently committing a revision that ignored the user.
**Quotes:** > - **Risk:** medium — touches the refine path that all three draft actions share (`regenerate-design`, `regenerate-copy` and `refine` all route through `runDesignAgentCli`), so a regression is broad.
**Quotes:** > - **Verification scope — decided 2026-09-15.** The verification pass runs on **every model-driven refine**, across all four instruction classes.
**Problem:** The artifact states three actions route through one shared runner, then scopes both the taxonomy and the verification pass to "refine" without saying where in that shared path the new gate sits. If verification wraps the shared runner, `regenerate-design` and `regenerate-copy` acquire a verification step and a new failure outcome the proposal never names as in scope; if it sits above the runner in the refine route only, the shared runner is untouched but the artifact never says so. The two readings produce different co-changes to the other two actions' response shapes and their `pendingAction`/`pendingActionError` handling, and only one of them is a half-landed merge.
**Fix:** Name the layer the verification pass wraps — the refine route above `runDesignAgentCli`, or the shared runner itself — and state explicitly whether `regenerate-design` and `regenerate-copy` are changed by it.
**Status:** upheld

### [BLOCK] party-architect — The "not applied" outcome is a new terminal state on an async action contract the proposal never names as a co-change

**Quotes:** > on a second failure, surface _"couldn't apply this instruction"_ rather than silently committing a revision that ignored the user.
**Quotes:** > - Should "couldn't apply" be a hard failure surfaced in the UI, or a soft warning on a committed revision? The former is honest; the latter is less disruptive mid-session.
**Quotes:** > - **Files affected:** ~12–18 (estimated) — refine prompt, refine route, draft actions, draft page components, Dockerfile, E2E suite, unit tests
**Problem:** The artifact introduces a third outcome for refine — neither success nor error — and leaves it unresolved whether it commits a revision. That choice determines whether the draft-read contract the polling client consumes needs a new field beyond the existing error channel, whether the revision pointer advances, and whether an undo target exists. "draft actions" and "draft page components" are listed as files but the _contract_ between them — what the poll returns when an instruction was attempted and not applied — is never specified. Two implementers reading this build different payloads, and the client and server halves of the same merge disagree. party-security's fail-closed proposal and party-visionary's reversibility argument both land on this same unresolved question from different arrows, which strengthens rather than replaces the contract objection: whichever answer is chosen, the poll payload must be named in the artifact.
**Fix:** Decide in the artifact whether a twice-failed refine commits a revision, and specify the field the poll response carries for that outcome.
**Status:** upheld

### [WARN] party-architect — The instruction taxonomy is a new grammar with four classes and no stated production or consumption contract

**Quotes:** > 1. **Instruction taxonomy.** Classify each instruction as `add` / `replace` / `remove` / `constrain` and give the model explicit semantics for each.
**Quotes:** > The verification pass runs on **every model-driven refine**, across all four instruction classes.
**Problem:** Four class names are introduced and then consumed by two separate components — the refine prompt builder and the verification pass — but the artifact never says who assigns the class. A model classifier, a heuristic in code, and a user-facing selector are three different designs with three different test seams, and one of them puts a judgement call in a regex while another spends a model call before the edit. The artifact also does not say what happens to an instruction that is two classes at once ("use this as the background and reduce the text"), which is exactly the reported failure shape. Nothing here is unbuildable; it is underspecified enough that two implementers ship incompatible things.
**Fix:** State where classification happens and what the contract is when an instruction spans more than one class.
**Status:** upheld

### [WARN] party-architect — The verification pass has no named deterministic test seam, while the artifact's own diagnosis is that the existing seams hide this class of bug

**Quotes:** > **4. The test suite is structurally blind to all of this.** `MOCK_AI` returns clean HTML and `MOCK_PUPPETEER` never rasterizes, so nothing between the model and the pixels is exercised.
**Quotes:** > 6. **A rasterizing E2E.** At least one end-to-end case that runs the real render path and asserts on actual pixels/DOM — closing the gap that made every defect above invisible to a green suite.
**Quotes:** > 2. **Post-refine verification pass.** A cheap model call checks the rendered result against the instruction.
**Problem:** The proposal adds a second model call inside the refine path and names only one new test asset — a rasterizing E2E — to cover it. The retry-once branch and the twice-failed branch are reachable only by making the verifier return "miss", which needs a stub the artifact does not name; under the existing `MOCK_AI` seam the verifier presumably returns clean, so both new branches are untested by exactly the mechanism the proposal identifies as structurally blind. A rasterizing E2E exercises the render, not the verifier's failure branches.
**Fix:** Name the seam that forces a verification miss deterministically, separate from the rasterizing E2E.
**Status:** upheld

### [NOTE] party-architect — Font coverage is placed in the image while the proposal's own precedent shows the choice is a rendering-policy decision, not a package install

**Quotes:** > 4. **Generalize font coverage.** Install symbol/emoji coverage in the runner image alongside Sinhala, so the renderer stops producing tofu for any glyph the design agent emits.
**Quotes:** > Which symbol/emoji font? A full colour emoji font is large and changes the look of any emoji the agent emits; a monochrome symbol font is lighter and more on-brand for stat glyphs like ★. This is a deliberate design decision, not just a package name.
**Problem:** The artifact places the fix entirely in the `Dockerfile` layer, and simultaneously observes that the choice changes the appearance of every emoji the agent emits — an output-appearance decision landing in an image-build layer where no per-brand or per-kit override exists. The placement is defensible for coverage-as-a-bug, but the artifact should note that a font installed OS-wide is a global rendering policy with no per-draft seam, which is a layering consequence the open question only half-acknowledges.
**Fix:** Note in the artifact that OS-wide installation is global and has no per-kit override, so the font choice is not revisable per brand later without a second mechanism.
**Status:** upheld

### [WARN] party-architect — Rebuttal to party-po: element-targeted editing is not "UI-only", and the artifact's own open question makes it a model-path change

**Quotes:** > Items 3 (element-targeted editing, UI-only) and 4 (Dockerfile font swap) touch that shared path not at all or trivially, while items 1-2 (taxonomy + verification) and 7 (dead-code resolution) are the ones with real blast radius.
**Quotes:** > Element-targeted editing: does it edit the **HTML directly** (deterministic, no model, but limited to what the DOM exposes) or send a scoped instruction to the model with the element as context (more capable, reintroduces some ambiguity)?
**Quotes:** > - **Files affected:** ~12–18 (estimated) — refine prompt, refine route, draft actions, draft page components, Dockerfile, E2E suite, unit tests
**Problem:** The structural premise of party-po's separation — that item 3 is UI-only with near-zero shared-path risk — is not what the artifact says. Element-targeted editing writes the same draft HTML and the same revision chain the refine path writes (that is why "draft actions" appears in the affected-files line beside "draft page components"), and the artifact's own open question keeps the model-driven variant live, which would put it on the shared runner outright. I take no position on release order — that is party-po's arrow — but the coupling fact must be recorded: whichever branch of that open question is chosen, item 3 and the refine path share one writer and one commit contract, so "touches that shared path not at all" is only true under the unchosen half of an unresolved question.
**Fix:** Resolve the artifact's element-editing open question before any separation argument rests on item 3 being independent of the refine path.
**Status:** upheld

### [NOTE] party-architect — Rebuttal to party-po: the dead brand-conflict protocol sits in the same prompt builder the taxonomy rewrites

**Quotes:** > - `src/lib/agent/prompts/refine.ts` — instruction taxonomy, removal/replacement semantics
**Quotes:** > - Resolving the dead API-mode-only brand-conflict protocol (either wire it for CLI mode or remove it)
**Quotes:** > the brand-conflict compliance protocol in `refine.ts` exists **only in API mode** while production runs CLI mode — so that entire path is dead code in prod.
**Problem:** party-po reads this item as scope added "because it's tidy to clean up while already in `refine.ts`". The artifact places both the taxonomy rewrite and the dead protocol in the same prompt builder, and the protocol is mode-gated — so the taxonomy's new removal/replacement semantics must be written either around a live-in-one-mode branch or after it is resolved. That is a structural adjacency in one file, not incidental tidying. I make no claim about whether it returns value or when it should ship; only that the two items occupy the same builder and a plan that separates them edits `refine.ts` twice with an unresolved mode gate in between.
**Fix:** Record in the artifact that the protocol's mode gate lives in the same builder the taxonomy modifies, so whichever order is chosen is chosen knowingly.
**Status:** upheld

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

### [WARN] party-po — Verification pass's recurring cost is unpriced and can multiply refine calls up to 4x

**Quotes:** > A cheap model call checks the rendered result against the instruction. On failure, retry once with the miss made explicit; on a second failure, surface _"couldn't apply this instruction"_ rather than silently committing a revision that ignored the user.
**Problem:** "Cheap" is asserted, not priced. Worst case per refine is now: refine call → verify call (fail) → retry refine call → verify call (fail) → surface failure — up to 4 model spawns where today there is 1, on the hottest shared path (`runDesignAgentCli`, used by all three draft actions). No token/latency/spawn-count budget is stated, and nothing bounds it if verification itself is unreliable (a model checking a model). This is exactly the class of unstated recurring cost the panel exists to catch.
**Fix:** State the expected spawn count and wall-clock added per refine at p50/worst-case, and a hard cap (e.g., no more than one verify+retry cycle regardless of instruction class).
**Status:** upheld

### [WARN] party-po — A cheaper variant (ship the deterministic fix first) is never considered

**Quotes:** > Element-targeted editing. Extend the existing draft inline-edit so the user can click a specific element and edit it directly. Removes prose ambiguity entirely for text, colour and sizing changes — the cases where "reduce the text" should never have needed a model at all.
**Problem:** The proposal's own text argues that item 3 (deterministic, no model call) plus item 4 (one-line Dockerfile font fix) already close two of the four reported failure modes ("reduce the text", the tofu glyph) at near-zero recurring cost. Yet the proposal bundles these with the expensive, unbounded instruction-taxonomy + verification machinery (items 1-2) as one change, with no consideration of shipping the cheap deterministic fixes first and measuring whether the taxonomy/verification spend is still needed for the remaining cases ("include a human character", the double-image background). The omission of this cheaper-first sequencing is itself the finding.
**Fix:** Name the cut: ship element-targeting + font coverage first, observe whether reported failures drop, then decide if the verification pass is still warranted.
**Status:** upheld — party-ba's round-1 finding (element-targeted editing assumes users switch away from prose, unestablished) sharpens rather than displaces this: it means item 3 may not even absorb the "reduce the text" load this cheaper-first sequencing bets on, which is a reason to _validate_ the cheap variant in isolation before paying for verification, not a reason to skip staging it.

### [WARN] party-po — Dead-code resolution has no value tied to the reported failures

**Quotes:** > Resolving the dead API-mode-only brand-conflict protocol (either wire it for CLI mode or remove it)
**Problem:** None of Maleesha's four reported failures, and none of the four confirmed root causes, implicate the brand-conflict protocol. It is included because it was noticed "in the same file" during root-cause work ("the entire path is dead code in prod"), not because it returns any of the value this proposal is chartered to deliver (instruction fidelity). This is scope added because it's tidy to clean up while already in `refine.ts`, at the cost of touching the same high-risk shared path again.
**Fix:** Either cut this to its own zero-risk follow-up (delete dead code, no wiring), or state explicitly what fidelity value wiring it for CLI mode returns.
**Status:** upheld

### [NOTE] party-po — No cut line named despite the proposal's own admission of broad blast radius

**Quotes:** > Risk: medium — touches the refine path that all three draft actions share (`regenerate-design`, `regenerate-copy` and `refine` all route through `runDesignAgentCli`), so a regression is broad.
**Problem:** Six-to-seven items are shipped as one change against a path the proposal itself flags as shared by three actions. Items 3 (element-targeted editing, UI-only) and 4 (Dockerfile font swap) touch that shared path not at all or trivially, while items 1-2 (taxonomy + verification) and 7 (dead-code resolution) are the ones with real blast radius. The proposal never states which pieces could ship independently, so the low-risk wins wait on review/rollout of the high-risk ones.
**Fix:** Name the cut line in Scope: font fix and element-targeted editing ship first (independent PRs, near-zero shared-path risk); taxonomy/verification/dead-code-resolution ship as a second, reviewed separately.
**Status:** upheld — reinforced by party-architect's round-1 finding that the verification pass's placement relative to the shared runner is itself unresolved: an unnamed cut line and an unnamed layer are the same underlying failure to sequence this change, from two different mandates.

### [BLOCK] party-security — The verification pass judges model output using model output, and its verdict is the commit decision

**Quotes:**

> 2. **Post-refine verification pass.** A cheap model call checks the rendered result against the instruction. On failure, retry once with the miss made explicit; on a second failure, surface _"couldn't apply this instruction"_ rather than silently committing a revision that ignored the user.

**Problem:** The evidence handed to the verifier is the refine model's own output — a document that already carries user brief prose, brand-kit voice text, and (per the 2026-08-03 preamble incident quoted in this very proposal) the design model's unprompted narration. That content is read by a model whose boolean answer is the control-flow decision "commit this revision or not". Any text inside the rendered document that reads as a statement about the document — "the background has been replaced", a hidden caption, an alt attribute, a leftover instruction echoed into the markup — is untrusted content arriving in the position of the verifier's ground truth. The proposal's own stated lesson is "validate by extracting what you need, not by asserting it is in there somewhere", and a free-prose "does this look applied?" call is exactly the assertion form that lesson rejects. It is also self-graded: the party whose work is being judged authors the artifact the judge reads. No seat contested this reading; `party-visionary`'s drift finding and `party-po`'s cost finding both assume the same free-prose verifier and add independent reasons to constrain it.
**Fix:** Verify structurally wherever the instruction class permits — `remove`/`constrain` admit deterministic post-conditions on the DOM/render (text node count or length decreased, the named element absent, computed background is the named image and the prior decorative node is gone); reserve the model call for what cannot be measured. Feed the verifier the extracted structural facts, not the raw document; where raw content must be included, delimit it and instruct the verifier that content inside the delimiters is data and never a claim about whether the edit succeeded. Require a strict machine-readable verdict and treat anything unparseable as a miss, not a pass.
**Status:** upheld

### [BLOCK] party-security — The verifier's own failure has no named outcome, and the candidate default on the page is the permissive one

**Quotes:**

> 2. **Post-refine verification pass.** A cheap model call checks the rendered result against the instruction. On failure, retry once with the miss made explicit; on a second failure, surface _"couldn't apply this instruction"_ rather than silently committing a revision that ignored the user.
>
> - Should "couldn't apply" be a hard failure surfaced in the UI, or a soft warning on a committed revision? The former is honest; the latter is less disruptive mid-session.

**Problem:** The design names what happens when the verifier says _no_. It never names what happens when the verifier _cannot answer_ — call errors, times out, returns empty, or returns text the caller cannot parse. The path of least resistance for that case is "skip the check and commit", which is indistinguishable from a verified-good revision. This failure is correlated, not independent: the verifier runs on the same model/credential path as the refine it is judging, so a degraded model layer produces both the bad edit and the disabled check at once — the gate evaporates precisely in the conditions that make it necessary. The soft-warning option in the open question is the same shape: a committed revision plus a dismissible notice is a green result carrying a yellow sticker, and the incident being fixed here is one where the user could not tell a wrong output from a right one. `party-architect`'s BLOCK on the unspecified "not applied" contract is adjacent but distinct: they need the field named, I need its unavailable-verifier value to point at the strict branch rather than at commit.
**Fix:** State the unavailable-verifier outcome as fail-closed: an unreachable, timed-out, or unparseable verification is a miss and takes the same path as an explicit miss. Record the verification outcome as durable state on the revision (`verified` / `unverified — verifier unavailable` / `not applied`) beside the existing `PROMPT_VERSION` stamp, so an unverified revision is distinguishable after the fact and a period of silent verifier outage is diagnosable. Resolve open question 4 toward the hard surface: a "soft warning on a committed revision" is the exact reporting shape this proposal exists to eliminate.
**Status:** upheld

### [BLOCK] party-security — Element-targeted editing writes raw user input into a document a headless browser parses and executes, and is the one path exempt from all verification

**Quotes:**

> 3. **Element-targeted editing.** Extend the existing draft inline-edit so the user can click a specific element and edit it directly. Removes prose ambiguity entirely for text, colour and sizing changes — the cases where "reduce the text" should never have needed a model at all.
>
> - Element-targeted editing: does it edit the **HTML directly** (deterministic, no model, but limited to what the DOM exposes) or send a scoped instruction to the model with the element as context (more capable, reintroduces some ambiguity)?
>   Element-targeted edits are deterministic and are **exempt** — no model call is spent proving a DOM edit did what the code just did.

**Problem:** "Edits the HTML directly" means user-typed text becomes markup in a document that is later parsed and rendered by Chromium and persisted as a draft revision other team members can open. Text typed into an element becomes element content; a colour or size typed into a field becomes a CSS value. Neither is inert: markup typed into a text field breaks out of the element unless the write goes through a text-node API, and a CSS value field accepts `url(...)` — a network fetch issued by the renderer on behalf of the server — and can terminate the surrounding declaration or style block. "Deterministic" describes the code path, not the input; the input is still the least-trusted thing in the system. The proposal then makes this the only editing path with no verification step at all, so it is simultaneously the most permissive sink and the least inspected one. The proposal gives no statement that the edit is escaped, type-constrained, or confined to the element the user clicked. Round 1 strengthened rather than weakened this: `party-visionary` establishes that the element address is itself computed over model-authored markup that the next refine rewrites, so the write target is non-deterministic too.
**Fix:** Write text edits as text content, never as markup. Constrain colour and size inputs to parsed, re-serialized values from a closed grammar (a colour parsed into a hex/rgb triple, a size parsed into number+unit from an allowed unit set) and reject anything else rather than passing the string through; never accept a free-form CSS declaration, and never accept a value containing `url(`. Confine the write to the single element node resolved from the click, not a selector supplied by the client. If the alternative — scoped instruction to the model — is chosen instead, that path is model-driven and must not inherit the verification exemption granted here.
**Status:** upheld

### [WARN] party-security — Classification of the instruction is a control-flow decision derived from user prose, with no stated default when it is ambiguous

**Quotes:**

> 1. **Instruction taxonomy.** Classify each instruction as `add` / `replace` / `remove` / `constrain` and give the model explicit semantics for each. Remove the blanket "preserve everything" for replacement and removal instructions — a replacement must name what it supersedes, so "use this as the background" means the prior decorative visual goes.

**Problem:** The classification decides how much of the existing design the model is licensed to destroy, and it is derived from free user text — which may be ambiguous, multi-clause ("use this as the background and add a character"), or simply misread. The two destructive classes are the ones that switch off the preservation guard, so a misclassification fails toward deletion: the user asks for an addition, the instruction is read as a replacement, and content they never mentioned is removed and committed. The proposal names no default class for a low-confidence or mixed classification, and the design's gravity is toward the permissive reading because that is the one that "does something". The "must name what it supersedes" rule is the right constraint but is stated as prose guidance to the model, not as a precondition the caller enforces. Three seats independently reached the multi-class case in round 1 (`party-architect` on the missing production contract, `party-ba` on `constrain` having no definition, `party-visionary` on single-label classification breaking first); none of them names which way it should fail, which is the part I am filing.
**Fix:** Default to the preserving classes (`add`/`constrain`) when classification is ambiguous or the instruction contains more than one clause, and make the destructive path conditional on the model returning an explicit, non-empty identification of the superseded element — no name, no removal licence. Have the caller check that field's presence rather than trusting the prompt to have required it.
**Status:** upheld

### [WARN] party-security — Both branches of the failed-verification question destroy something with no stated recovery

**Quotes:**

> - When verification fails twice, should the draft keep the attempted revision (user can inspect and undo) or discard it and stay on the prior version? Keeping it preserves work; discarding avoids polluting the revision chain with known-bad states.

**Problem:** The "discard" branch throws away a rendered result the system already paid two model calls and a rasterization for, with nowhere stated that it goes — the user cannot inspect what the model did wrong, and the operator cannot diagnose a systematic verification false-positive because the rejected artifacts leave no trace. The "keep" branch advances the revision chain to a state the system itself has judged wrong; its recovery is a manual version-switch, which this proposal elsewhere describes as the unsatisfactory recovery for the dropped-inline-asset bug. Neither branch as written leaves a durable, labelled record of the rejection. `party-visionary` reaches the same two branches from the design-commitment side and concludes discard is the safe one; my fix satisfies both readings at once, since retaining the rejected artifact outside the chain adds no revision rows.
**Fix:** Retain the rejected output as a recorded artifact that the revision pointer does not advance to — labelled with the instruction, the classification, and the verifier's stated miss — so nothing is unrecoverable and a run of false rejections is visible without reproducing it. If the chain must stay clean, retain it outside the chain rather than deleting it.
**Status:** upheld

### [WARN] party-security — Placeholder recovery is detection-based, so it fails open on the mutation it cannot detect

**Quotes:**

> 5. **Inline-asset auto-reinsert.** Detect dropped `__INLINE_ASSET_n__` placeholders and restore them rather than committing a revision with images silently missing.

**Problem:** "Detect dropped" only covers the case where a placeholder is absent. A model that _mangles_ a placeholder — renames it, changes its index, duplicates it, or wraps it — produces a document where detection finds nothing to restore and the revision commits with the image still lost or, worse, with the wrong asset spliced into the wrong slot at render time. The recovery is silently a no-op and looks identical to a clean run, which is the same shape as the class of bug this proposal is written to close. No seat addressed item 5 in round 1.
**Fix:** Make it a reconciliation, not a detection: the set of placeholder tokens going out and the set coming back must match exactly — same tokens, same multiplicity. Restore on a clean absence; on any other mismatch (renamed, duplicated, reindexed) treat the revision as not applied and take the same failure path as a failed verification. Log the mismatch so a model that starts mangling placeholders is visible before it is reported by a user.
**Status:** upheld

### [NOTE] party-security — A font change alters every future render with nothing recording which font set produced a given export

**Quotes:**

> 4. **Generalize font coverage.** Install symbol/emoji coverage in the runner image alongside Sinhala, so the renderer stops producing tofu for any glyph the design agent emits.
>
> - Which symbol/emoji font? A full colour emoji font is large and changes the look of any emoji the agent emits; a monochrome symbol font is lighter and more on-brand for stat glyphs like ★. This is a deliberate design decision, not just a package name.

**Problem:** The glyph environment is global process state baked into the image: one install silently changes the appearance of every subsequent render, including drafts and templates approved under the old environment. The proposal acknowledges the appearance change but names nothing that records which font set a given export was produced with, so a wrong choice is only discoverable by eye and an export cannot be attributed to the environment that made it. No exposure exists in the design as written — the effect is contained to the runner image and reversed by redeploying the prior image — but the attribution gap is cheap to close now and expensive to reconstruct later. `party-architect` (no per-kit override) and `party-visionary` (a tofu assertion in the rasterizing harness) reached the same item from the layering and leverage sides; all three fixes compose.
**Fix:** Record the installed font set (or a digest of it) alongside the existing per-draft `PROMPT_VERSION` stamp so a render's glyph environment is attributable, and prefer the narrowest coverage that fixes the reported defect — monochrome symbol coverage for stat glyphs — over a full colour emoji set, which widens the visual change far beyond the bug.
**Status:** upheld

### [WARN] party-security — Rebuttal of party-po: item 3 is not the low-risk half of the cut line, it is the most permissive sink in the change

**Quotes:**

> 3. **Element-targeted editing.** Extend the existing draft inline-edit so the user can click a specific element and edit it directly. Removes prose ambiguity entirely for text, colour and sizing changes — the cases where "reduce the text" should never have needed a model at all.
> Element-targeted edits are deterministic and are **exempt** — no model call is spent proving a DOM edit did what the code just did.

**Problem:** `party-po` proposes shipping items 3 and 4 first on the ground that they are "deterministic, no model call", "UI-only", and touch the shared path "not at all or trivially" — a sequencing argument I take no position on. The risk characterization underneath it is the part I am rebutting: item 3 is the only path in this change that writes unvalidated user input directly into HTML that Chromium parses and that persists into the revision chain, and the proposal's own decision exempts it from every check the change adds. Ranking it as the near-zero-risk half rests on "deterministic" describing the input rather than the code path. If the panel does adopt cheaper-first sequencing, item 3 shipping alone means the escaping and value-grammar constraints in my third finding land in the first PR, not deferred behind the taxonomy work; item 4 carries no such condition and is genuinely the low-risk one.
**Fix:** If the cut line is adopted, attach the text-node-write, closed-grammar colour/size parsing, and no-`url(` constraints to item 3 as preconditions of shipping it, and do not carry the "UI-only / near-zero risk" framing into the plan for that item.
**Status:** upheld

### [WARN] party-security — Rebuttal of party-visionary: "discard + hard failure" is reversible for the revision chain but irreversible for the evidence

**Quotes:**

> - When verification fails twice, should the draft keep the attempted revision (user can inspect and undo) or discard it and stay on the prior version? Keeping it preserves work; discarding avoids polluting the revision chain with known-bad states.

**Problem:** `party-visionary` argues the branches are asymmetric and that "discard + hard failure leaves the chain exactly as it is today and is fully reversible later." That is correct about the _design commitment_ — no rows, no schema, nothing to unwind — and I do not contest it on that axis. It is not correct about the _runtime effect_, which is mine: discarding deletes a rendered artifact the system paid two model calls and a rasterization to produce, and nothing in the proposal says where it goes. A wave of false rejections — the exact failure mode a verifier drifting out of sync with the refine prompt produces, which `party-visionary` names in their own second finding — is then undiagnosable, because every instance of the evidence was destroyed at the moment it was judged. The two positions reconcile: retain the rejected render outside the revision chain. That keeps the chain byte-identical to today (their requirement) and keeps the artifact recoverable (mine).
**Fix:** Adopt `party-visionary`'s discard-from-the-chain conclusion, but state that "discard" means the revision pointer does not advance, not that the artifact is deleted — retain it as a labelled out-of-chain record with the instruction, the class, and the verifier's miss.
**Status:** upheld

### [BLOCK] party-visionary — The instruction taxonomy becomes a persisted classification vocabulary that a later change cannot rename or collapse

**Quotes:**

> 1. **Instruction taxonomy.** Classify each instruction as `add` / `replace` / `remove` / `constrain` and give the model explicit semantics for each.
>    The verification pass runs on **every model-driven refine**, across all four instruction classes. Element-targeted edits are deterministic and are **exempt**
>    Mitigated by the new rasterizing E2E and by `PROMPT_VERSION` stamping, which makes a bad prompt revision identifiable per-draft.

**Problem:** A four-value class set that gates verification behaviour is a decision vocabulary, not a prompt detail. The moment a refine's class is recorded anywhere durable — and `PROMPT_VERSION` stamping per-draft is cited as the diagnostic mechanism, which only helps if the per-revision record says what was attempted — the vocabulary is in the revision chain. The next change that finds the taxonomy wrong (the likely one: "reduce the text" is simultaneously `remove` and `constrain`, and "use this as the background" is `replace` + `remove`, so single-label classification will be the first thing to break) cannot renumber or merge classes without every historical revision carrying a class that no longer means what it says. The proposal never states whether the class is persisted, transient, or user-visible — and that choice is the one-way door, not the class names. Decide it before the first revision is written with a class on it.

**Fix:** State explicitly whether the instruction class is (a) transient — computed, used for prompt assembly, discarded, so a later change can replace the taxonomy freely; or (b) recorded on the revision, in which case commit now to the taxonomy being append-only and say so. Option (a) is the reversible door and costs nothing today.

**Status:** upheld — no seat contested it; party-architect's "no stated production or consumption contract" and party-ba's undefined `constrain` both reinforce that the vocabulary is unsettled, and neither addresses whether it becomes durable.

### [WARN] party-visionary — The verification pass becomes a second, undeclared specification of what refine means, kept in sync with the refine prompt by hand forever

**Quotes:**

> 2. **Post-refine verification pass.** A cheap model call checks the rendered result against the instruction. On failure, retry once with the miss made explicit; on a second failure, surface _"couldn't apply this instruction"_ rather than silently committing a revision that ignored the user.
>
> 1. **Instruction taxonomy.** Classify each instruction as `add` / `replace` / `remove` / `constrain` and give the model explicit semantics for each. Remove the blanket "preserve everything" for replacement and removal instructions

**Problem:** The verifier must encode the same per-class semantics the refine prompt encodes — it cannot judge whether a `replace` landed without knowing that `replace` means the superseded visual goes. That is the same fact written in two prompt builders. The next change to refine semantics is already named in this document: "Rewriting the generation (first-pass) prompts" is out of scope, so the first follow-up will be a refine-semantics tweak. It must now edit both the instruction-semantics text and the verifier's acceptance criteria, in different prompts, with nothing failing if only one is edited. The drift's shape is specific and nasty: the refine prompt loosens, the verifier does not, and users start seeing "couldn't apply this instruction" on refines that in fact applied correctly. Nobody notices for weeks because the symptom is a false negative on a self-service loop that users already expect to be flaky — which is exactly the trust the change exists to rebuild.

**Fix:** Derive the verifier's acceptance criterion for each class from the same single source that generates the instruction-semantics block (one table, two consumers), or state in the proposal which of the two is authoritative so a disagreement is diagnosable rather than invisible.

**Status:** upheld

### [WARN] party-visionary — "Couldn't apply this instruction" is the change's most durable commitment and the proposal leaves its permanence to an open question

**Quotes:**

> on a second failure, surface _"couldn't apply this instruction"_ rather than silently committing a revision that ignored the user.
>
> - When verification fails twice, should the draft keep the attempted revision (user can inspect and undo) or discard it and stay on the prior version? Keeping it preserves work; discarding avoids polluting the revision chain with known-bad states.
> - Should "couldn't apply" be a hard failure surfaced in the UI, or a soft warning on a committed revision? The former is honest; the latter is less disruptive mid-session.

**Problem:** These two open questions are framed as UX preferences, but one of the four answers writes to the revision chain and one does not, and the revision chain is already load-bearing across this codebase (`currentRevisionNumber` pointers, restore, Undo, refine-starts-from-current). "Keep the attempted revision + soft warning" means every known-bad refine becomes a permanent row that later changes must reason about: the next change that touches restore, or that adds any revision-level quality signal, inherits a chain where some revisions are marked-bad and some are not, and must decide what each surface does with them. That is not reversible by flipping a flag — the rows exist. "Discard + hard failure" leaves the chain exactly as it is today and is fully reversible later. The proposal treats these as symmetric; they are not, and nothing in it says so.

**Fix:** Note in the proposal that one branch of these questions adds durable rows to the revision chain and the other does not, so the decision is made on reversibility rather than on mid-session disruption. If the soft-warning branch wins, say what every existing revision consumer does with a marked-bad revision before it ships.

**Status:** upheld — party-security's "both branches destroy something with no stated recovery" reads the same pair of questions at runtime scope; the asymmetry in what each branch leaves permanently in the revision chain is unaddressed by it and stands.

### [WARN] party-visionary — Verify-then-retry on every refine sets the precedent that will be copied into generation, where it costs three times as much and is wrong

**Quotes:**

> The verification pass runs on **every model-driven refine**, across all four instruction classes.
>
> - Rewriting the generation (first-pass) prompts; this change is scoped to the edit/refine loop
>   **Risk:** medium — touches the refine path that all three draft actions share (`regenerate-design`, `regenerate-copy` and `refine` all route through `runDesignAgentCli`), so a regression is broad.

**Problem:** The artifact itself names that all three draft actions share `runDesignAgentCli`. Once verify-then-retry-once lives on that path for refine, the obvious next change — "generation ignores the brief too" — generalises it to first-pass generation and regenerate-design. The generalisation is wrong there for a reason nobody will re-derive: a refine has a prior state to compare against, so "did the instruction land" is a well-posed question; a first-pass generation has no prior, so verification degrades into "is this a good design", which the change's own out-of-scope line assigns to proposal 007. The footnote that makes this pattern correct — that it verifies a _delta_, not a _quality_ — is nowhere in the artifact, so the contributor who copies it will not read it. Meanwhile each retry is a full design call on a path already measured at 41–61 seconds, so the copy also triples worst-case generation latency.

**Fix:** State in the proposal that verification is defined over the delta between the prior revision and the new one, and is undefined without a prior — one sentence that makes the wrong generalisation visibly wrong at the point someone reaches for it.

**Status:** upheld — party-architect's BLOCK on the same shared runner asks where the gate sits at merge; it does not settle where the pattern may legitimately spread afterwards, and answering theirs with "wrap the shared runner" is precisely the generalisation this finding says will be copied without its footnote.

### [WARN] party-visionary — Element-targeted editing quietly makes the DOM of generated HTML a stable surface, with no stated contract

**Quotes:**

> 3. **Element-targeted editing.** Extend the existing draft inline-edit so the user can click a specific element and edit it directly. Removes prose ambiguity entirely for text, colour and sizing changes
>
> - Element-targeted editing: does it edit the **HTML directly** (deterministic, no model, but limited to what the DOM exposes) or send a scoped instruction to the model with the element as context (more capable, reintroduces some ambiguity)?

**Problem:** Clicking an element to edit it requires addressing that element — by selector, index, or an injected id — and whatever the addressing scheme is, it is computed over HTML a model wrote freeform (Path B) and will rewrite on the next refine. The next change that touches the design prompts to improve output structure now also silently breaks or re-points every element address, and there is nothing that fails when it does: the edit just lands on the wrong node, or silently on none. This is the durable cost that the "deterministic, no model" framing hides — determinism at the edit site buys nothing if the address is computed against non-deterministic markup. The artifact scopes prompt rewrites out, which delays the collision rather than avoiding it.

**Fix:** Say in the proposal whether element addresses are resolved fresh at click time against the current HTML (safe, nothing persisted) or stored against a revision (a durable coupling between stored addresses and model-authored markup). If the latter, name what invalidates them.

**Status:** upheld

### [NOTE] party-visionary — The rasterizing E2E is the compounding asset here and the proposal asks it to prove only this change

**Quotes:**

> 6. **A rasterizing E2E.** At least one end-to-end case that runs the real render path and asserts on actual pixels/DOM — closing the gap that made every defect above invisible to a green suite.
> **4. The test suite is structurally blind to all of this.** `MOCK_AI` returns clean HTML and `MOCK_PUPPETEER` never rasterizes, so nothing between the model and the pixels is exercised. Every defect above would pass a full green suite — and the preamble bug did.
> **3. Font coverage is Sinhala-only.** `Dockerfile:68` installs `font-noto-sinhala` and nothing else. **All four** attached exports render the rating stat as `4.8⍰`

**Problem:** Everything else in this change is a tax the future pays; this is the one item that makes later changes cheaper, and it is specified as "at least one case". The seam it opens — a harness that can assert on real rasterized output — is exactly what makes the _next_ font question ("did the symbol font actually cover ★ in the runner image?"), the next preamble-class bug, and proposal 007's design-quality work checkable rather than eyeballed. Tofu detection in particular is a cheap, glyph-agnostic pixel assertion that would have caught both the 2026-07-28 Sinhala case and today's `4.8⍰` with one check, and the change is one step from it: it is already installing the fonts and already rasterizing. Stopping at "one case" for this change's own sake leaves that leverage on the floor with no stated reason.

**Fix:** Frame the rasterizing E2E as a reusable harness with a named first assertion (a tofu/replacement-glyph check against the real runner image), not as one case attached to this change — so the next font or render change inherits a place to put its proof instead of building one.

**Status:** upheld — party-architect's "verification pass has no named deterministic test seam" and party-security's request for a recorded font-set stamp both land in this same harness, which strengthens rather than duplicates the case for specifying it as reusable.

### [WARN] party-visionary — Rebuttal of party-po's "ship the deterministic fix first": that cut ships the least reversible item first and defers the most reversible one

**Quotes:**

> 3. **Element-targeted editing.** Extend the existing draft inline-edit so the user can click a specific element and edit it directly. Removes prose ambiguity entirely for text, colour and sizing changes — the cases where "reduce the text" should never have needed a model at all. 2. **Post-refine verification pass.** A cheap model call checks the rendered result against the instruction.

**Problem:** party-po recommends cutting to element-targeting plus the font install first and deciding on the taxonomy/verification spend afterwards. On merge-day cost that ordering is right; on the one-year horizon it is inverted. The verification pass is a wrapper on one route that a later change deletes in a commit, leaving no residue — no schema, no stored addresses, no user-visible surface anyone has built a habit on. Element-targeted editing is the opposite: it introduces an element-addressing scheme computed over model-authored markup (the coupling in my finding above), a second writer of `htmlContent` and the revision chain, and a click-to-edit affordance users learn — none of which a later change walks back cheaply once drafts have been edited through it. Shipping it first, while the artifact's own open question still has not decided whether it edits the HTML directly or routes through the model, means the durable half lands before its contract exists and the disposable half is what gets deferred. If a cut is taken, take it the other way round.

**Fix:** If the panel adopts a cut, sequence on reversibility rather than on unit cost: the verification pass is removable, element-targeted editing is not. At minimum, do not ship element-targeting ahead of a stated answer to the artifact's own addressing question.

**Status:** upheld

## Dissent

No withdrawals.
