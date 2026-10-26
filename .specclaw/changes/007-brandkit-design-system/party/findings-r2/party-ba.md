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
