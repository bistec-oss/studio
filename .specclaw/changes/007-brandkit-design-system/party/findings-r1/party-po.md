### [WARN] party-po — The cheaper variant (detector alone, no model call) is never priced against the full diff assistant

**Quotes:**

> 2. **A brand-kit upgrade assistant that proposes a rule-by-rule diff.** It reads the active kit prompt and proposes individual edits, each one replacing a vague phrase with a measurable rule. 4. **An adjective detector.** Flag vague design words in a kit prompt at authoring time and offer a measurable replacement, moving the feedback from "five minutes and a regeneration later" to "while you are typing".
> **Problem:** Item 4 alone is a pure client-side lookup. It has no model spawn, no route, no MOCK_AI reply, no quote-anchoring or stale-edit logic, and no diff UI. It captures the stated value, which is turning an adjective into a number before it costs a 5-minute regeneration. The proposal ships both and never compares them. The assistant adds a model call, a new route, an edit-anchoring scheme and a review panel. That is most of the 10-15 files and most of the medium complexity. The detector's suggestions already come from the same dataset, so the assistant is largely a second path to the same output. The proposal never says what the assistant buys that the detector's inline suggestions do not.
> **Fix:** Name the detector-plus-dataset variant as the cheaper option and say what the assistant adds beyond it. The likely answer is sampled-image grounding and typography proposals. Then either ship the detector first as its own cut, or state why the assistant is worth its extra files.
> **Status:** upheld

### [WARN] party-po — Recurring per-upgrade model cost is unstated

**Quotes:**

> The upgrade call uses the same model surface, the same MOCK_AI seam style and the same error path.
> Live feedback matches the "while you are typing" goal and is possible because `designData` is client-safe. The cost is a debounced scan on every edit of a long prompt.
> **Problem:** The upgrade is a model call over the whole kit prompt plus grounding images and documents, using an assistant surface that may default to Sonnet. Its latency, token size, and expected calls per kit are never given. The author may re-run it after every edit, and the proposal sets no cap. The proposal does not give the live detector's debounce interval or scan cost either. It states only that a cost exists. The "bounded" size label rests on file count, not on running cost.
> **Fix:** State an expected spawns-per-upgrade figure, the model tier, and a rough prompt size for the Hearts Academy kit. Name a debounce value, or decide on demand rather than live.
> **Status:** upheld

### [WARN] party-po — Typography proposals and grounded sampling add scope with no stated value or demand evidence

**Quotes:**

> 3. **Typography guidance.** Propose font pairings and an explicit type scale from the dataset, as suggested rules the author accepts into the kit prompt the same way.
> **Typography is unguided.** Kits carry font names with no type scale, no pairing rationale and no size relationships, so headline/subline/body hierarchy is re-invented by the model on every generation and drifts between posts in the same campaign.
> **Problem:** Every worked example in the problem section is a proportion, size or layout defect, and none is a typography defect. Typography guidance needs a font-pairing dataset with rationale and a type-scale generator. Its drift claim is asserted and never shown with a case. This is the "while we're in here" item. It also needs the most curated authoring, since the dataset is in-house and cannot be borrowed.
> **Fix:** Move typography to a follow-up cut. Ship the detector and assistant on proportion, size and spacing, which are the defects actually evidenced. Add typography only when a recorded post shows hierarchy drift.
> **Status:** upheld

### [NOTE] party-po — Name the cut line and the do-nothing price

**Quotes:**

> That number has never been added, because nothing prompts the author for one.
> **Size recommendation: bounded.** The data module, the assistant call and the review UI all sit inside the existing kit-authoring surface and reuse its versioned save
> **Problem:** The one live defect, the navy/teal share, is closed by a data action, not by code. The proposal says so itself: "this is a data action, not code". An author who adds one number to the Hearts Academy prompt fixes it today. Doing nothing therefore costs a recurring chance that future kits repeat the pattern, at a rate never quantified. The proposal also does not state a shipping order. A natural cut is dataset plus detector first, then the assistant, then typography. Each cut returns value on its own, and the single "bounded" label hides that.
> **Fix:** State the do-nothing cost, such as how many kits are authored per quarter. Say that the navy/teal fix needs no code. Name the cut line: detector, then assistant, then typography.
> **Status:** upheld
