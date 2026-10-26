### [WARN] party-ba — The "navy/teal drift" is the headline evidence, but nothing proves it is an adjective problem or that the feature would have fixed it

**Quotes:**

> There is a live open drift proving the problem is ongoing.
> That number has never been added, because nothing prompts the author for one.
> **Problem:** The proposal asserts a causal story with no evidence. It says the number is missing because nothing prompts the author, but it never shows the author wanted to add one, noticed the drift, or would act on a prompt. The cited drift is a single render, described secondhand from CLAUDE.md. It is also in tension with the proposal's own scope, because "kit authoring only" means a fix lands only if someone accepts an edit. The real pain is a bad render, and what the proposal offers is an authoring aid whose uptake is unestablished. The same applies to "Three rounds of design defects each required a full regeneration". The proposal does not say whether a prompt like this would have caught those defects. The Hearts examples were mostly brief or campaign-level rules and logo geometry, not necessarily kit prose.
> **Fix:** Show that the missed rules lived in kit prompt text, and that the detector or assistant would have flagged each of the four table rows. Alternatively, say the claim is a hypothesis and state how it will be checked.
> **Status:** upheld

### [WARN] party-ba — No acceptance criteria, and the main claim (adjectives become measurements, fewer regenerations) has no falsifiable check

**Quotes:**

> moving the feedback from "five minutes and a regeneration later" to "while you are typing"
> Unit tests for the dataset, the detector and the edit-apply logic; an E2E case for the diff review and the version it saves (through the MOCK_AI seam, no real model call)
> **Problem:** The proposal states a benefit (fewer wasted regenerations, no drift) and lists only tests of mechanics. A MOCK_AI E2E proves a diff can be accepted and saved. It cannot fail if the proposed edits are wrong or ignored, or if posts still drift. No criterion says what counts as a correct measurable replacement. No criterion covers detector precision, even though the proposal itself calls "generous" ambiguous. Nothing checks that the drift example is actually closed. The scope item "Closing the recorded navy/teal proportion drift" is "a data action, not code", so it can be done without verifying that the next render changes.
> **Fix:** Add criteria that can fail. For example: the detector flags the named adjectives in the Hearts v1-v4 fixtures and misses the specified non-design uses. Every proposed edit must contain a number or unit. After the canvas-share edit, a real regeneration shows the stated share, or this is named as an operator step.
> **Status:** upheld

### [WARN] party-ba — "Measurable" is the load-bearing term and is never defined

**Quotes:**

> each one replacing a vague phrase with a measurable rule
> The suggestions come from the dataset, so the detector and the assistant agree.
> **Problem:** "Measurable" could mean any of three builds. (a) A number or unit appears in the rule. (b) The rule is checkable on the rendered pixels, the way 009's fail-closed check works. (c) The model can follow it. The proposal's own table mixes these. "The capitals match" has no number, while "pill width ~45–60%" does. The proposal also says 007 does not validate composition, so (b) is not buildable here. Without a definition, the dataset's content and the pass or fail test for a suggestion cannot be written. A similar split exists in "vague design words", which the detector scopes to "design instructions only". The boundary with brand-voice words is left to the plan.
> **Fix:** Define measurable (for example: contains a numeric quantity and a unit or reference object). State that it is not verified against rendered output.
> **Status:** upheld

### [NOTE] party-ba — Assumes authors read, accept and will write the kit prompt rather than ignore advisory flags

**Quotes:**

> Nothing reaches generation unless a human accepts an edit into a new, revertible kit version.
> a detector that is noisy (mitigated by the design-words-only list and by its output being advisory)
> **Problem:** The proposal does not establish who edits kit prompts or how often. Its own problem statement says kits are authored by "people who are not designers". It also assumes that these people will accept numeric rules they cannot judge, such as a share or a cap-height. The risk section treats an advisory flag as a mitigation. An advisory flag is also the thing the proposal says has not worked so far. This is probably safe, but nothing in the text shows it.
> **Fix:** Name the real authors (for example the Hearts kit admin). Say whether acceptance rate or a regeneration-rate drop will be observed after shipping.
> **Status:** upheld
