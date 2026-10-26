### [BLOCK] party-po — Eight unrelated deliverables in one change, with no cut line and no do-nothing price for most

**Quotes:**

> One change, built in groups, each group with its own tasks and gates.
> **Files affected:** about 80 to 120 (estimated; the wording group touches many components).
> Size:** architectural.
> **Problem:** Groups A to H are independent. They share no dependency. The user chose a single change so there is a single verify before the merge, and that is a sequencing preference, not a value argument. The proposal still prices no do-nothing option per group, and it names no cut line between what must precede the merge and what can follow it. One failed gate delays every group, and one panel and one verify cover about 100 files.
> **Fix:** Name the cut line and add a one-line "if omitted, what is lost" per group. At minimum, mark which groups may slip past the merge without blocking it, such as B, E and D.
> **Status:** upheld

### [BLOCK] party-po — Group B builds the whole Google Fonts catalogue when most of the stated value is a few families and a weights bug

**Quotes:**

> The full Google Fonts catalogue, as a committed metadata snapshot (family, category, real weights and styles, scripts) with a refresh script. The brand-kit font picker becomes searchable.
> Instrument Serif is missing, and `googleFontsUrl` always asks for weights 400 to 700
> **Problem:** The stated pain is a few missing families, no Sinhala families, and a weights bug. A cheaper variant fixes all three: extend the existing list by about 20 to 30 families, add a per-family weights field, and make the URL weight-aware. The proposal never prices that variant against a roughly 1,500-family snapshot, a refresh script and a new picker UX. The user did choose the full catalogue, but the proposal does not show that the user compared the two costs.
> **Fix:** Price the curated-list variant. Ship the weights fix and the Sinhala slot first, and make the full catalogue a separable step.
> **Status:** upheld

### [WARN] party-po — Apply-to-image is the largest build in the change and its value rests on a match rate the proposal has not yet measured

**Quotes:**

> the match rate re-measured under the final rule (the sample called non-representative), plus the seeded Path A templates measured.
> One new npm dependency, `parse5` (030 Open Question 3, option a).
> **Problem:** The measurement is a deliverable inside the build, not a gate before it. The new action, the dependency, the splice, the re-parse diff and the failure vocabulary are all built first. The do-nothing price is unquantified: nothing says how often the stale badge fires, or how often Regenerate is the unwanted cost.
> **Fix:** Make the re-measurement a go/no-go step before the splice is built, with a stated threshold. State how often the stale badge fires.
> **Status:** upheld

### [WARN] party-po — Real-spend OP-031 has a poor expected return, and the "move defaults" outcome has no stated size

**Quotes:**

> a cap of **4** image calls, and 2 accepted renders to pass.
> If it passes, Promotion and Milestone move to `spotlight`
> **Problem:** Spotlight SQUARE failed `busy` twice in OP-028. A pass bar of 2 accepted renders out of 4 is weaker than 028's rule, which required every contract to keep its style. The prize is a default image style on two of eight post styles. The do-nothing option, leaving those two on classic, costs nothing.
> **Fix:** State the pass rule in 028 terms, price the do-nothing option, or defer D to a separate change after the merge.
> **Status:** upheld

### [WARN] party-po — The wording sweep touches an unbounded number of files and its recurring cost (E2E locator breakage) is unpriced

**Quotes:**

> Fix every MEDIUM finding of the 2026-10-26 scan and its LOW naming drift, using the user's glossary:
> The wording sweep could break E2E locators that match on text: the full suite runs at the end.
> **Problem:** Only the MEDIUM items have a stated misleading effect. The LOW tail drives the file count and the locator risk. Running E2E only at the end hides which edit broke which test.
> **Fix:** Commit to MEDIUM only, with the LOW tail as a mechanical follow-up. If the sweep stays, run the full E2E suite after group G lands and before the feature groups start.
> **Status:** upheld

### [WARN] party-po — The personal key change spends a data migration and a resolver change to generalise a provider that is mock-verified only

**Quotes:**

> It accepts an OpenAI or a Gemini key, detected from the prefix as `/team` does, and generates with that provider.
> **A live Gemini call** (005 follow-up). The user skipped it; Gemini stays mock-verified only, a known limit.
> **Problem:** The delivered Gemini half cannot be shown to work. The cost is a migration that carries user secrets, a resolver change and a UI rename. The label-only variant, "OpenAI image key", captures the "stops misleading" value for none of that cost.
> **Fix:** Price the label-only variant, or ship the Gemini half after a live check.
> **Status:** upheld

### [NOTE] party-po — Typography rules, a second review host, and the assistants' post-style proposals are low-demand scope with no stated value

**Quotes:**

> A **typography** part of the brand-kit design dataset: font pairing and type scale rules, measurable, with the detector and Improve/Upgrade covering them.
> The campaign briefing assistant proposes a **post style** per planned post (one of the eight).
> **Problem:** No demand or problem statement is given for the typography dataset or the second host. Typography also depends on group B's font work. F's post-style fix does repair a stale `goal`, so it has a stated value.
> **Fix:** Mark E as droppable before the merge. Keep F's post-style fix.
> **Status:** upheld
