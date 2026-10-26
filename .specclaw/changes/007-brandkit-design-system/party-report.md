# Party Report: 007-brandkit-design-system

**Reviewed:** 2026-10-23
**Tier:** deep (classifier) — Three unresolved design questions - dataset source, rewrite-vs-diff upgrade architecture, and whether design-system slices go into every-generation prompts or kit-authoring-only - materially change the implementation scope; changes to design prompts affect every future generation globally, and a bad rule would degrade output across all kits.
**Panel:** party-po(sonnet), party-architect(opus), party-ba(sonnet), party-security(opus), party-visionary(opus)
**Verdict:** CHANGES_REQUESTED

## Summary

26 findings: 1 BLOCK, 20 WARN, 5 NOTE upheld — 0 withdrawn

## Findings

### [WARN] party-architect — Two finders of "vague phrase", one deterministic and one model-driven, with no stated seam between them

**Quotes:** > It reads the active kit prompt and proposes individual edits, each one replacing a vague phrase with a measurable rule.
**Quotes:** > Flag vague design words in a kit prompt at authoring time and offer a measurable replacement, moving the feedback from "five minutes and a regeneration later" to "while you are typing". The suggestions come from the dataset, so the detector and the assistant agree.
**Problem:** The proposal describes two components that decide which phrase is vague and what replaces it: a pure word-list detector in the browser, and a model-backed upgrade assistant on the server. It says they "agree" because both use the dataset, but it never says how the dataset reaches the model, or whether the model's anchors are limited to the phrases the detector found. Nothing in the text stops the model from flagging a phrase the detector ignores, or from proposing a number the dataset does not hold. The proposal also gives two ways to apply a fix: the detector "offer[s] a measurable replacement" while you type, and the assistant's edits go through the diff review. So one phrase can carry two different suggestions with two accept paths. Two implementers would put the decision in different layers. party-po's round-1 finding that the assistant is "largely a second path to the same output" describes the same duplication from the value side, and nothing in round 1 argued against this reading.
**Fix:** In the artifact, give one component the job of picking anchors. For example: the deterministic detector produces the candidate phrases and the dataset suggestion, and the model only judges context or fills in a number for those candidates. Or state plainly that the model can propose edits outside the detector's list, and say how a phrase that both components flag is shown and applied.
**Status:** upheld

### [WARN] party-architect — The base text for the diff is unspecified: the saved active prompt versus the unsaved draft textarea

**Quotes:** > It reads the active kit prompt and proposes individual edits, each one replacing a vague phrase with a measurable rule. The author accepts or rejects each edit. The accepted set becomes a new kit-prompt version through the existing versioned flow
**Quotes:** > The kit editor's `PromptSection.tsx` (Improve with AI at :109, the editable draft textarea at :176-180) as the place the diff review lands.
**Quotes:** > The existing "Improve with AI" button stays as it is.
**Problem:** The proposal names the existing editable draft textarea as where the review lands. It also keeps Improve with AI, which writes into that same panel. But the assistant reads the _active_ (saved) prompt, and the accepted edits save directly as a new version through `POST .../prompts`. The proposal does not say what happens when the textarea holds unsaved text, whether from typing or from an Improve with AI rewrite. Three outcomes are all consistent with the text. (a) The accepted edits apply to the active text, and the textarea's unsaved work is silently overwritten. (b) The edits apply to the textarea, and anchors drawn from the active text miss. (c) The accept step writes into the textarea, and the author saves as usual. The live detector scans the textarea, so the detector and the assistant read different inputs. PromptSection's existing draft state has to change in the same commit, and the proposal does not describe how. party-security's round-1 point, that another admin's newer version can be overwritten, is the server-side half of this same unspecified base.
**Fix:** State which text the upgrade request sends: the textarea's current contents or the active version. State whether accepting writes the result into the textarea, to be saved through the existing Save, or posts a version directly. Then say how a pending Improve with AI result or unsaved draft is handled, and whether the save carries a base version number.
**Status:** upheld

### [WARN] party-architect — The edit-array contract that the route, the parser, the apply logic and the UI share is not specified

**Quotes:** > The upgrade reply is a new fenced block (an array of edits) in the same style, not a change to the existing block.
**Quotes:** > Typography pairing and type-scale suggestions, delivered as edits in that same diff
**Quotes:** > An edit needs a quote of the phrase it replaces. If the author edits the prompt after the proposal, an edit whose quote no longer matches must drop out or go stale, not apply to the wrong place. Plan should define this (exact-quote match, stale edits shown and disabled).
**Problem:** The proposal defines an edit only as "a quote of the phrase it replaces". But its own typography deliverable is mostly _insertions_: a type scale or a pairing rationale where the kit currently says nothing, so there is no phrase to quote. The proposal does not say where an insertion goes. It also leaves open three cases: the quoted text appears twice in the prompt, two accepted edits overlap, or an edit needs to record where its number came from. The last one matters because line 108 requires a "labelled default, never a silent number", so provenance is a field the UI has to render. The route's request and response shapes are not stated either. The zod schema, the server route, the client apply function and the E2E mock reply all depend on this one shape, and two implementers would build different ones.
**Fix:** Specify the edit schema in the artifact. At minimum it needs: the kind (replace or insert); the quote, plus an occurrence rule or an insertion anchor; the replacement text; a provenance field (sampled, dataset default, or author-supplied); and the order in which overlapping edits apply or how they conflict.
**Status:** upheld

### [WARN] party-architect — "Dismiss for good on that kit" needs storage, but the proposal says there is no schema change

**Quotes:** > Does it match whole words only, and is a flag a hint the author can dismiss for good on that kit?
**Quotes:** > - **Schema:** none. The accepted edits save as a normal `BrandKitPrompt` version. No migration, no new env var.
**Problem:** The open question offers a per-kit permanent dismissal as an option. A dismissal that survives a reload and applies "on that kit" has to be stored somewhere: a new column or table, a field on `BrandKitPrompt`, or text written into the prompt itself. The Impact section's "Schema: none" and its "Files affected: ~10–15" estimate both assume that option is not taken, but the proposal never says so. If plan picks it, the schema claim and the file count no longer hold, and a migration plus a rollback script land in the same commit.
**Fix:** Either close the option in the proposal (dismissals last only for the session, or are not supported), or name where a persistent dismissal is stored and remove "Schema: none".
**Status:** upheld

### [WARN] party-architect — The colour-share number depends on a Chromium-backed sampler, with no stated test stub and no statement that it returns shares

**Quotes:** > `sampleImageColors` (`src/lib/renderer/puppeteer.ts:272`) to ground a colour-proportion rule in the real reference images. The assistant already calls it. 007 does not add a second sampler.
**Quotes:** > Unit tests for the dataset, the detector and the edit-apply logic; an E2E case for the diff review and the version it saves (through the MOCK_AI seam, no real model call)
**Problem:** The headline worked example, the canvas-share edit, rests on `sampleImageColors`, which the proposal places in the Puppeteer renderer module. Elsewhere the proposal says only that it "samples colours". It never says the function returns a _proportion_, and a "canvas share" rule needs a proportion. If the function returns a palette, there are two outcomes. Either a second sampler gets written, which contradicts "007 does not add a second sampler", or the model is left to estimate a percentage from a palette, which puts arithmetic in the model. The test plan also stubs only the model (MOCK_AI). It names no seam for the renderer-backed sampler on the upgrade route, so the E2E case for the share path needs real Chromium or gets skipped. party-security's round-1 provenance finding depends on this too: a "sampled" label can only be checked by code if code computes the share.
**Fix:** State what the sampler returns that yields the share, and say that code computes the share number, not the model. Name the stub the upgrade route's tests use for the sampler, or state that the E2E case runs on a kit with no reference images and covers only the labelled-default path.
**Status:** upheld

### [WARN] party-architect — Detector scope includes "layout words", but the boundary with 009's composition has no checkable rule

**Quotes:** > 007 must not write composition numbers that fight an active image style.
**Quotes:** > Adjective detection for **design instructions** (size, spacing, proportion, colour-share and layout words) with a suggested measurable replacement at authoring time
**Quotes:** > The detector may flag its vague form, but it does not own or validate the archetype data.
**Problem:** The proposal puts layout and proportion words in the detector's scope and has the dataset suggest measurable replacements for them. It also forbids composition numbers that "fight an active image style", but gives the assistant and the detector no way to know what that means at kit-authoring time. Nothing in the text says which image style is "active" while a kit is being edited, or which `designData.composition` values a suggestion must stay consistent with. A suggestion like "image fills the right 40%" is exactly what the scope invites, and nothing stops it from conflicting with a region in the composition file next to it. An implementer has to guess whether 007's suggestions read the composition data, skip layout numbers altogether, or ignore the constraint.
**Fix:** Turn the constraint into a rule the implementer can test. For example: layout and proportion suggestions never emit region or placement numbers. Or they are checked against `designData.composition` (read-only) and dropped when they conflict. Alternatively, remove "layout words" from the detector's scope.
**Status:** upheld

### [NOTE] party-architect — The second fenced-block parser copies `extractBrandKitBlock` instead of generalising it

**Quotes:** > The ` ```brandkit ` block convention and `extractBrandKitBlock` (`assistant.ts:53-67`) as the pattern for a fenced, zod-validated reply. The upgrade reply is a new fenced block (an array of edits) in the same style, not a change to the existing block.
**Problem:** The proposal uses the existing extractor "as the pattern" for a new block, which reads as writing a second fence extractor beside the first. The two will drift on fence handling, for example a missing closing fence or several blocks in one reply, the first time either is fixed. party-security's round-1 finding asks for three distinct parse outcomes (parse failure, zero edits, N edits with M rejected). That is fence-handling behaviour, and it should live in one shared helper, not be built twice.
**Fix:** Turn the fence extraction into one helper keyed by tag and schema, and have both blocks call it. Leave the existing block's schema unchanged.
**Status:** upheld

### [NOTE] party-architect — Rebuttal of party-security's BLOCK: save-and-activate is the existing route contract for every kit save, and the "inactive version" fix would change a shared route

**Quotes:** > The accepted set becomes a new kit-prompt version through the existing versioned flow (`POST /api/admin/brandkits/[id]/prompts`, `prompts/route.ts:30-84`, which allocates the next version and activates it in one transaction;
**Quotes:** > - Automatic kit changes without review; every upgrade is a proposed version a human activates
**Problem:** On the structural reading, accept-activates-at-once is not a new flow that 007 adds. The proposal reuses the named route unchanged, and by the proposal's own description that route "allocates the next version and activates it in one transaction" for every save that goes through it. So the activation risk security describes is the same one the kit's existing save path already carries. Line 77 reads as an imprecise restatement of that one flow, not as evidence of a second flow. The first option in security's Fix, saving the accepted set as an inactive version and activating it later, is a contract change to that shared route: a new inactive-save mode, or a second save path beside it. The other callers of the existing versioned flow would then have to change in the same commit, and that co-change goes unnamed. The second option, stating plainly that accepting puts the edits live, needs no route change. My round-1 finding on the diff's base text points the same way: if accepting writes into the textarea and the author saves through the existing Save, activation stays a deliberate click on the existing path. This rebuttal concerns only the structural cost of the first fix option. Whether output generated under a rolled-back version needs a recovery path is security's call, and this does not withdraw it.
**Fix:** Resolve line 77 against line 38 by saying the existing save-and-activate route is reused unchanged, and that the activating click is a named step. Do not introduce an inactive-version mode unless the proposal also names every caller of `POST .../prompts` that must change with it.
**Status:** upheld

### [WARN] party-ba — The "navy/teal drift" is the headline evidence, but nothing proves it is an adjective problem or that the feature would have fixed it

**Quotes:**

> There is a live open drift proving the problem is ongoing.
> That number has never been added, because nothing prompts the author for one.
> **Problem:** The proposal gives no evidence for its causal story. It never shows the author wanted a number, noticed the drift, or would act on a prompt. The cited drift is one render, taken secondhand from CLAUDE.md. Scope is "kit authoring only", so a fix lands only if someone accepts an edit. The real pain is a bad render, and the proposal offers an authoring aid whose uptake is unestablished. It also never shows that the Hearts defects lived in kit prose rather than in brief-level or campaign-level rules.
> **Fix:** Show that the missed rules lived in kit prompt text and that the detector or assistant would have flagged each table row. Otherwise label the claim a hypothesis and say how it will be checked.
> **Status:** upheld

### [WARN] party-ba — No acceptance criteria, and the main claim (adjectives become measurements, fewer regenerations) has no falsifiable check

**Quotes:**

> moving the feedback from "five minutes and a regeneration later" to "while you are typing"
> Unit tests for the dataset, the detector and the edit-apply logic; an E2E case for the diff review and the version it saves (through the MOCK_AI seam, no real model call)
> **Problem:** The proposal states a benefit (fewer wasted regenerations, no drift) but lists only tests of mechanics. A MOCK_AI E2E proves that a diff can be accepted and saved. It cannot fail if the proposed edits are wrong or if posts still drift. No criterion defines a correct measurable replacement, and none covers detector precision. The drift fix is called "a data action, not code", so it can be marked done without checking that the next render changes.
> **Fix:** Add criteria that can fail. The detector must flag the named adjectives in the Hearts v1-v4 fixtures and miss the stated non-design uses. Every proposed edit must contain a number or unit. After the canvas-share edit, a real regeneration must show the stated share, or this must be named as an operator step.
> **Status:** upheld

### [WARN] party-ba — "Measurable" is the load-bearing term and is never defined

**Quotes:**

> each one replacing a vague phrase with a measurable rule
> The suggestions come from the dataset, so the detector and the assistant agree.
> **Problem:** "Measurable" supports three different builds. (a) A number or unit appears in the rule. (b) The rule is checkable on rendered pixels. (c) The model can follow it. The proposal's own table mixes these: "the capitals match" has no number, while "~45–60%" does. Reading (b) is not buildable here, because 007 does not validate composition. Without a definition, neither the dataset content nor the pass or fail test for a suggestion can be written. The line between design words and brand-voice words is also left to the plan.
> **Fix:** Define measurable, for example a numeric quantity plus a unit or reference object. State that it is not verified against rendered output.
> **Status:** upheld

### [NOTE] party-ba — Assumes authors read, accept and will write the kit prompt rather than ignore advisory flags

**Quotes:**

> Nothing reaches generation unless a human accepts an edit into a new, revertible kit version.
> a detector that is noisy (mitigated by the design-words-only list and by its output being advisory)
> **Problem:** The proposal never says who edits kit prompts or how often. Its problem statement says kits are authored by "people who are not designers", yet it assumes they will accept numeric rules they cannot judge. It also treats "advisory" as a mitigation, although an advisory flag is the thing it says has not worked so far. This is probably safe, but nothing in the text establishes it.
> **Fix:** Name the real authors, for example the Hearts kit admin. Say whether acceptance rate or a drop in regeneration rate will be observed after shipping.
> **Status:** upheld

### [WARN] party-po — The cheaper variant (detector alone, no model call) is never priced against the full diff assistant

**Quotes:**

> 2. **A brand-kit upgrade assistant that proposes a rule-by-rule diff.** It reads the active kit prompt and proposes individual edits, each one replacing a vague phrase with a measurable rule. 4. **An adjective detector.** Flag vague design words in a kit prompt at authoring time and offer a measurable replacement, moving the feedback from "five minutes and a regeneration later" to "while you are typing".
> **Problem:** Item 4 alone is a pure client-side lookup. It has no model spawn, no route, no MOCK_AI reply, no quote-anchoring or stale-edit logic, and no diff UI. It captures the stated value. The proposal ships both and never compares them. Party-architect's round-1 finding on two finders with no seam between them points the same way: the assistant is largely a second path to the output the detector already produces from the dataset. Round 2 changes nothing in my pricing.
> **Fix:** Name the detector-plus-dataset variant as the cheaper option and say what the assistant adds beyond it. Then either ship the detector first as its own cut, or state why the assistant is worth its extra files.
> **Status:** upheld

### [WARN] party-po — Recurring per-upgrade model cost is unstated

**Quotes:**

> The upgrade call uses the same model surface, the same MOCK_AI seam style and the same error path.
> Live feedback matches the "while you are typing" goal and is possible because `designData` is client-safe. The cost is a debounced scan on every edit of a long prompt.
> **Problem:** The proposal gives no figure for the model tier, the spawns per upgrade, the prompt size or the debounce interval. Architect's finding that the base text is unspecified (textarea versus saved version) makes it worse. It means re-runs after every edit are likely and nothing caps them.
> **Fix:** State the spawns-per-upgrade figure, the model tier and a rough prompt size for the Hearts Academy kit. Name a debounce value, or decide on demand rather than live.
> **Status:** upheld

### [WARN] party-po — Typography proposals and grounded sampling add scope with no stated value or demand evidence

**Quotes:**

> 3. **Typography guidance.** Propose font pairings and an explicit type scale from the dataset, as suggested rules the author accepts into the kit prompt the same way.
> **Typography is unguided.** Kits carry font names with no type scale, no pairing rationale and no size relationships, so headline/subline/body hierarchy is re-invented by the model on every generation and drifts between posts in the same campaign.
> **Problem:** Every worked example in the problem section is a proportion, size or layout defect, and none is a typography defect. Architect's edit-contract finding adds cost here: typography is mostly insertions, which need an anchor scheme that replace-only edits do not. Party-ba's finding that the drift evidence is unestablished leaves the typography claim weaker still.
> **Fix:** Move typography to a follow-up cut. Ship the detector and assistant on proportion, size and spacing. Add typography only when a recorded post shows hierarchy drift.
> **Status:** upheld

### [NOTE] party-po — Name the cut line and the do-nothing price

**Quotes:**

> That number has never been added, because nothing prompts the author for one.
> **Size recommendation: bounded.** The data module, the assistant call and the review UI all sit inside the existing kit-authoring surface and reuse its versioned save
> **Problem:** The live navy/teal defect is closed by a data action, not by code, so doing nothing costs only a recurring chance of repeat patterns, at a rate never quantified. Party-ba independently found the uptake and causal claim unproven, which confirms that the do-nothing price is unstated. No shipping order is named. The natural cut is dataset plus detector, then the assistant, then typography.
> **Fix:** State the do-nothing cost, such as how many kits are authored per quarter. Say that the navy/teal fix needs no code. Name the cut line: detector, then assistant, then typography.
> **Status:** upheld

### [BLOCK] party-security — Accepting edits activates them at once, and "revertible" covers the kit text but not the posts made from it

**Quotes:**

> The accepted set becomes a new kit-prompt version through the existing versioned flow (`POST /api/admin/brandkits/[id]/prompts`, `prompts/route.ts:30-84`, which allocates the next version and activates it in one transaction;
>
> - Automatic kit changes without review; every upgrade is a proposed version a human activates
> - **Risk:** low to medium. Nothing reaches generation unless a human accepts an edit into a new, revertible kit version.
>   **Problem:** The proposal describes two incompatible flows. Line 77 says an upgrade is a proposed version that a human then activates. Line 38 reuses a flow that allocates and activates the version in one transaction. With the line 38 flow, the click that accepts the edits is also the click that sends them to every later generation, because the active kit prompt reaches every generation (line 31). In round 1 I also said scheduled queue entries can auto-publish. That claim is not on the page, so I am narrowing this finding to what the proposal states: every generation that runs after the click uses the new text, whether or not anyone is watching. Architect's base-text finding adds a third reading: accepting writes into the textarea and the author saves through the existing Save. That flow also activates on save, so all three readings still put model-proposed text live without a separate activation step. Restoring an earlier version through `PromptSection.tsx:164` only fixes future generations. Drafts made and posts published under the bad version are not undone, and the proposal names no way to find them. The Risk line's "revertible" therefore overstates what an operator can undo. No seat argued that the activation step exists or that the recovery path is stated, so I am keeping this finding.
>   **Fix:** Pick one flow and state it. Either save the accepted set as an inactive version that the author activates as a separate step after reading the full resulting text, or keep save-and-activate and say plainly in the proposal and in the UI that accepting puts the edits live at once. With either flow, change "revertible" to say that only future generations revert. Also name how an operator lists the drafts generated while a rolled-back version was active, or state that they cannot.
>   **Status:** upheld

### [WARN] party-security — An unreadable or partly invalid edit list has no defined outcome, and the natural default looks like "nothing to fix"

**Quotes:**

> The upgrade reply is a new fenced block (an array of edits) in the same style, not a change to the existing block.
> The upgrade call uses the same model surface, the same MOCK_AI seam style and the same error path.
> **Problem:** The reused error path (`AssistantModelError` → 422) covers model resolution. It does not cover a reply with no fenced block, a block that fails zod, or an array where some entries are invalid. If the route turns any of these into an empty list or quietly drops the bad entries, the panel shows "no edits proposed" or a short list. To the author, a failed call then looks like a kit that is already measurable. Architect's contract finding says the edit schema is unspecified, and that is their finding. What I am flagging is the failure behaviour once a schema exists: a parse failure must not look the same as a clean result. Nothing raised in round 1 changes that.
> **Fix:** Give the route's response and the UI three separate outcomes. A parse failure shows as an error. Zero edits shows as "no suggestions". N edits with M rejected shows the count of dropped entries. Log the raw reply when parsing fails, and never show an empty panel after a failed parse.
> **Status:** upheld

### [WARN] party-security — The model writes the provenance label, so an invented number can claim to come from the kit's own images

**Quotes:**

> - `collectBrandKitGrounding` (`assistant.ts:103`) for reference images and documents, so a proposed number can cite the kit's own references.
>   The recommendation is yes: propose a labelled default, never a silent number.
>   **Problem:** The reviewer decides whether to trust a number from its label: "sampled from your references" or "dataset default". The proposal never says that code attaches the label, so the model under review controls the signal the review depends on. Architect's sampler finding makes this more serious. The proposal never says `sampleImageColors` returns a share, and if it returns only a palette, then every "sampled" canvas-share number is a share the model estimated. That number would still carry the most trusted label, and the author cannot check it against sampler output they never see.
>   **Fix:** Have code attach provenance. A number labelled as sampled must equal a share the server computed in this call. A number labelled as a dataset default must match a `designData` entry by key, and the server checks it. Label every other number as unverified model output. Show the label in the review panel, and decide on purpose whether it stays in the saved text.
>   **Status:** upheld

### [WARN] party-security — Matching an edit by exact quote can hit the wrong occurrence or overwrite another admin's newer version

**Quotes:**

> If the author edits the prompt after the proposal, an edit whose quote no longer matches must drop out or go stale, not apply to the wrong place. Plan should define this (exact-quote match, stale edits shown and disabled).
> **Problem:** Architect's contract finding covers specifying an occurrence rule; that part is theirs. My finding is about what happens when the rule is missing. An edit whose quote matches several places applies to the first match, so an edit can rewrite a different rule from the one the reviewer read, and nothing reports it. My second point does not overlap with architect: if another admin saves and activates a version between the proposal and the accept, the edits apply to the older base text. Saving that as the newest version silently drops the other admin's changes, which then survive only in the version history. Architect's textarea-versus-active finding raises the same risk within a single session, when the textarea holds unsaved work.
> **Fix:** Reject an edit whose quote does not occur exactly once in the base text. Send the base version number with the save, and have the server return 409 if the active version has changed since. Show a stale edit as disabled, and never re-anchor it.
> **Status:** upheld

### [WARN] party-security — Text from uploaded reference documents shapes edits that go into every generation, and nothing limits what an edit can change

**Quotes:**

> **Where the kit text goes.** The active kit prompt reaches every generation as `Brand voice: …` in `buildBrandKitSystemContext` (`src/lib/brandkit/systemContext.ts:15-21`). An adjective saved there is paid for on every post.
>
> - `collectBrandKitGrounding` (`assistant.ts:103`) for reference images and documents, so a proposed number can cite the kit's own references.
>   **Problem:** The proposal notes that `claude -p` runs with `--tools ""` (line 53). That limits what the model can do, but it does not limit what it can write: the replies here become edits, and accepted edits enter every generation. Uploaded document text, such as a client PDF, goes into the upgrade prompt, and the proposal does not say it is fenced as untrusted for this new call. Nothing limits what one edit may do either. An edit can quote a long span and replace it with something short, which deletes rules the author wanted to keep, or it can insert text that is not a design rule at all. The per-edit click is the only check, and a reviewer scanning a list of "make it measurable" edits is poorly placed to notice a removed constraint. No seat argued that this entry point is missing.
>   **Fix:** Fence the grounding text as untrusted in the upgrade prompt. Validate each edit on the server: limit the lengths of the quote and the replacement, keep each quote within one sentence or rule, and reject an edit whose replacement drops most of the quoted text. In the review panel, show each edit's removed text next to its inserted text.
>   **Status:** upheld

### [WARN] party-visionary — Typography and colour-share rules saved as prose become a second copy of the kit's structured fonts and colours

**Quotes:**

> Fonts are edited as plain name fields (`src/components/admin/brandkits/FontEditor.tsx`).

> Propose font pairings and an explicit type scale from the dataset, as suggested rules the author accepts into the kit prompt the same way.

> Closing the recorded navy/teal proportion drift as the first worked example (the author accepts a canvas-share edit on the Hearts Academy kit; this is a data action, not code)

> **Schema:** none. The accepted edits save as a normal `BrandKitPrompt` version. No migration, no new env var.
> **Problem:** After this change, a kit holds its fonts and colours twice. The structured name fields hold them once, and the accepted prose rules hold them again, for example "pair Poppins with JetBrains Mono, headline 72px" or "teal-to-green 60% of canvas". The next change to touch these is ordinary kit upkeep: an admin swaps the headline font in FontEditor or replaces a palette colour. Nothing ties the prose to the field, so the kit prompt keeps naming the old font or colour. That prompt is "paid for on every post", so every later generation gets two instructions that conflict. Nobody notices until a render looks wrong, which is the five-minutes-per-defect loop this change exists to end. A type scale is also a fact a later change will want as structured data. If the kit gains a structured type scale beside today's structured font names, each kit's scale must first be parsed out of prompt prose and out of every saved version. The proposal presents "no schema change" as a plus and never weighs it against this cost. No round-1 finding from another seat addresses this pair. party-po's suggestion to defer typography would shrink it but not remove it, because the canvas-share edit still duplicates the palette.
> **Fix:** Write each pairing or colour-share edit so it names the structured field by role, not by literal font name or hex ("the headline font", "colour 1"). Otherwise, state which source wins and accept the sync pair on purpose. Either way, say in the proposal why prose, not structured data, is the chosen home for a type scale.
> **Status:** upheld

### [WARN] party-visionary — Dataset values are copied into kit prompt text with no record of where they came from, so a correction to the dataset never reaches the kits that already took the old value

**Quotes:**

> The accepted set becomes a new kit-prompt version through the existing versioned flow

> The suggestions come from the dataset, so the detector and the assistant agree.

> Injecting design-system slices into Path A, Path B, refine or background generation prompts (decided 2026-10-23: kit authoring only; generation prompts do not change in this change, and `PROMPT_VERSION` does not move)
> **Problem:** The dataset is curated and tested, but this change ships only copies of it. Each accepted edit freezes a dataset number (a type-scale ratio, a contrast minimum, a proportion default) into one kit's free text, and nothing links that text back to the dataset. Take the first change that corrects a dataset entry, say a type-scale ratio found to render poorly at 1080 px. It updates the module and its tests. Every kit that already accepted the old value keeps it, silently, and nothing can find those kits. "The detector and the assistant agree" holds only on the day a suggestion is made. The deferred option is the real trap. The out-of-scope line says only "in this change", so sending data into generation is left open for later. If a later change sends `designData` into generation prompts, each prompt carries the current dataset value beside the kit's frozen copy of an older one. That is two sources for one fact, and their disagreement cannot be read off the kit. In round 1, party-security asked for code-attached provenance, so that a "dataset default" number is checked against a `designData` key on the server. That fix computes the very entry id this stamp needs, so persisting it now costs almost nothing.
> **Fix:** Stamp each upgrade version with the dataset entry ids (or a `designData` version) it drew on. If the versioned save's existing metadata cannot hold this, that is the one schema question to raise now. A later dataset correction can then list the kits that copied the old value.
> **Status:** upheld

### [WARN] party-visionary — `designData` becomes one module where some keys change generation output and some do not, and nothing tells the next contributor which is which

**Quotes:**

> 007 adds its own file(s) (for example `typography.ts` and `kitRules.ts`) and keys on `designData`, and does not touch the composition files.

> 009 owns composition (regions, archetypes, the layout contract, the pixel check).
> **Problem:** After merge, `designData` holds two kinds of keys behind one object. 009's composition data drives generation and the pixel check, so editing it changes rendered posts. 007's typography and kit-rule data drives authoring hints only, so editing it changes nothing a post renders. A contributor generalises from the one object they see. The next change to the module, whether 009 Phase 2 or the deferred "typography into generation" step, then goes one of two ways. It adds or edits a key without knowing whether it needs a stamp, a `PROMPT_VERSION` bump and render re-verification. Or it treats all of `designData` as generation-facing, and every word-list tweak starts paying for render gates. party-architect's round-1 composition-boundary finding is the merge-day form of this problem. Mine is what remains once this proposal is archived and only the module is left to explain the boundary.
> **Fix:** Mark the boundary in the module itself. Either split `designData` into `generation` and `authoring` keys, or add a guard test asserting that no prompt builder imports the authoring keys. Then the next key added inherits the right contract.
> **Status:** upheld

### [WARN] party-visionary — Keeping the wholesale "Improve with AI" beside the per-rule upgrade lets one tool silently undo the other on every kit

**Quotes:**

> - Wholesale rewrite of a kit prompt by the assistant (decided 2026-10-23: diff only). The existing "Improve with AI" button stays as it is.

> "Improve with AI" (`src/app/api/admin/brandkits/[id]/prompts/improve/route.ts:28-33`) rewrites the whole active prompt and asks the model to "make it more specific, actionable, and comprehensive". It returns one block of text (:50). The author cannot accept some changes and refuse others, and nothing tells them which words were the problem.
> **Problem:** After merge, two AI tools with opposite contracts can edit a kit prompt. The upgrade adds measurable rules one at a time, each one reviewed. Improve rewrites the whole text with no review. The first time an author runs Improve on an upgraded kit, the model may paraphrase "pill width ~45–60% of canvas" back into "a compact, balanced pill". The author cannot see that loss, because Improve returns one opaque block, which is the defect the proposal itself names. The measurable rules then erode one Improve click at a time. Each loss surfaces only as a render defect, and the fix is restoring an older version by hand. Every future kit carries this risk for as long as both buttons exist. party-architect's round-1 base-text finding covers how the two tools collide in the textarea on merge day. This finding is about the slow loss across many saves, which that fix alone does not prevent.
> **Fix:** The proposal is one step from this leverage. The detector and the edit-anchor logic will already exist, so run Improve's output through them before save, and either show what changed or flag any measurable rule that disappeared. Otherwise, state why Improve stays unchanged and which tool's output takes precedence.
> **Status:** upheld

### [NOTE] party-visionary — The diff, anchor and detector machinery is placed in kit-specific files when the named next customer is the campaign briefing

**Quotes:**

> - Campaign briefings: the same adjective problem applies, but briefings are campaign-scoped and follow after kits

> a diff-review panel and a detector hook in `src/components/admin/brandkits/PromptSection.tsx`

> one admin route under `src/app/api/admin/brandkits/[id]/prompts/` (for example `upgrade`)
> **Problem:** The proposal names its own next change: adjective detection and measurable upgrades for campaign briefings, which are also versioned free text that reaches generation. The detector is client-safe and data-driven, so that follow-on could be nearly free. That holds only if the detector hook, exact-quote anchoring, stale-edit handling and edit-apply logic take plain text and a save callback. The proposal instead places the panel and the hook inside the brand-kit `PromptSection.tsx`, and the route under the kit's prompts path. Built that way, the briefing change copies the hook and the anchoring rules into the campaign page. Every later fix to whole-word matching or stale-quote handling, including the uniqueness and 409 rules party-security asked for in round 1, then has to land twice. party-architect's round-1 NOTE on generalising the fenced-block extractor is the same lesson at the parser layer.
> **Fix:** Build the edit-apply and anchor logic, the detector hook and the review panel against plain text plus a save function, with the kit as the first host. The cost now is the same, and the briefing follow-on becomes mostly wiring.
> **Status:** upheld

## Dissent

No withdrawals.
