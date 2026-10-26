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
