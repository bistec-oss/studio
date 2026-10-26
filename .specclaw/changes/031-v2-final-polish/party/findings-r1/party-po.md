### [BLOCK] party-po — Eight unrelated deliverables in one change, with no cut line and no do-nothing price for most

**Quotes:**

> One change, built in groups, each group with its own tasks and gates.
> **Files affected:** about 80 to 120 (estimated; the wording group touches many components).
> Size:** architectural.
> **Problem:** Groups A to H are independent. Apply-to-image, the font catalogue, the personal image key, Spotlight v2, typography rules, assistant changes, the wording sweep and the leftovers share no dependency. The proposal bundles them as "one final change" because the user wants a single verify before the merge. That is a sequencing preference. It is not a value argument. Bundling means one failed gate, such as an E2E locator break from the wording sweep, delays every group. It also means one panel and one verify cover about 100 files. The proposal prices none of the do-nothing options. Per group, what gets worse if the group does not ship before the merge? For most groups (C, D, E, F, the LOW wording tail) the answer is "nothing blocks the merge". The proposal names an internal order but never says which groups must precede the merge and which can follow it.
> **Fix:** Name the cut line. For example, a pre-merge set (H, the MEDIUM wording fixes, and anything the user needs live) and a post-merge set (B, E, F, A, D). If everything must ship before the merge, state why per group. Add a one-line "if omitted, what is lost" for each group.
> **Status:** upheld

### [BLOCK] party-po — Group B builds the whole Google Fonts catalogue when most of the stated value is a few families and a weights bug

**Quotes:**

> The full Google Fonts catalogue, as a committed metadata snapshot (family, category, real weights and styles, scripts) with a refresh script. The brand-kit font picker becomes searchable.
> Instrument Serif is missing, and `googleFontsUrl` always asks for weights 400 to 700
> **Problem:** The stated pain is three things. Instrument Serif is missing, JetBrains Mono needs to be usable, and the weights request is wrong for single-weight families. A cheaper variant fixes these. Add the few wanted families, add Sinhala families, and make `googleFontsUrl` weight-aware from a per-family weights field in the existing list. That is a small edit to the existing 100-entry list. The proposal instead adds a full catalogue snapshot (roughly 1,500 families), a refresh script, a searchable picker, and a permanent maintenance surface. The proposal never considers the cheaper variant. The full catalogue is "what the user chose", but the user's stated need is "fonts like Instrument Serif and JetBrains Mono". The unpriced costs are repo weight, refresh-script upkeep, and a picker UX change for every kit editor.
> **Fix:** Price the cheaper variant (curated list extended by about 20 to 30 families, including the Sinhala ones, plus a weights-aware URL) against the full snapshot. Ship the weights fix and the Sinhala slot first. Make the full catalogue a separable later step.
> **Status:** upheld

### [WARN] party-po — Apply-to-image is the largest build in the change and its value rests on a match rate the proposal has not yet measured

**Quotes:**

> the match rate re-measured under the final rule (the sample called non-representative), plus the seeded Path A templates measured.
> One new npm dependency, `parse5` (030 Open Question 3, option a).
> **Problem:** The feature adds a claimed draft action, a new dependency, an offset-preserving splice, a post-splice re-parse diff, a closed failure vocabulary, a render-time check and an event. The stated remedy for the stale badge already exists: Edit inline and Regenerate design. The proposal's own number is "32 of 35" for one innermost element holding the headline. The measure only supports the value if the real apply success rate is high. The measurement is listed as a deliverable inside the build, not as a gate before it. The proposal also admits that styling flattens, so some successful applies will visibly change the design. Value is unquantified: how often does a stale badge occur, and how often is Regenerate (a model call) the unwanted cost?
> **Fix:** Make the re-measurement a go/no-go step before the splice is built, with a stated threshold (for example, at least 80% of drafts apply cleanly). State how often the stale badge fires, so the do-nothing price is a number.
> **Status:** upheld

### [WARN] party-po — Real-spend OP-031 has a poor expected return, and the "move defaults" outcome has no stated size

**Quotes:**

> a cap of **4** image calls, and 2 accepted renders to pass.
> If it passes, Promotion and Milestone move to `spotlight`
> **Problem:** Spotlight SQUARE failed `busy` twice in OP-028. The new contract, three fixtures and four real calls are spent to flip the default image style on two of eight post styles. A cap of 4 with a pass bar of 2 accepted renders means the check can pass on 2 lucky renders of one size. The 028 pass rule required every contract to keep its style. The proposal also adds a post-style version and a `POST_STYLES_REVISION` bump, which changes the prompt version suffix for all styles. The value, Promotion and Milestone posts looking better, is unquantified, and the do-nothing option (those two stay classic) is zero-cost.
> **Fix:** State the pass rule in 028 terms (all SQUARE attempts kept, user accepted). Price the do-nothing option, or defer D to a separate change after the merge.
> **Status:** upheld

### [WARN] party-po — The wording sweep touches an unbounded number of files and its recurring cost (E2E locator breakage) is unpriced

**Quotes:**

> Fix every MEDIUM finding of the 2026-10-26 scan and its LOW naming drift, using the user's glossary:
> The wording sweep could break E2E locators that match on text: the full suite runs at the end.
> **Problem:** The scan is "about 20 MEDIUM findings and a long LOW tail", and the proposal commits to all of it, including five spellings of "brand kit", sentence-case and US-spelling normalisation. Only the MEDIUM items have a stated misleading effect. The LOW tail is tidiness with no stated value, and it drives most of the 80 to 120 file estimate and the E2E locator risk. Running the E2E suite only at the end means breakage is found late. A sweep done in the same change as features also hides which edit broke which test.
> **Fix:** Commit to the MEDIUM findings only. Make the LOW tail and the glossary normalisation a separate, mechanical follow-up. If the sweep stays, run the E2E suite after the wording group lands, before the feature groups start.
> **Status:** upheld

### [WARN] party-po — The personal key change spends a data migration and a resolver change to generalise a provider that is mock-verified only

**Quotes:**

> It accepts an OpenAI or a Gemini key, detected from the prefix as `/team` does, and generates with that provider.
> **A live Gemini call** (005 follow-up). The user skipped it; Gemini stays mock-verified only, a known limit.
> **Problem:** The value is that a user can add a Gemini image key at `/settings`. The cost is generalising `UserOpenAiKey`, a data migration for existing keys, a resolver change and a UI rename. The proposal's own out-of-scope list admits the Gemini path has never run for real. The delivered value therefore cannot be shown to work. A cheaper variant is a wording-only fix: label the card "OpenAI image key" so it stops misleading, and defer Gemini until a live check exists. A migration that carries user secrets is also the highest-risk migration in the change.
> **Fix:** Price the label-only variant. Or keep C but state that its Gemini half is unproven, and ship it after a live check.
> **Status:** upheld

### [NOTE] party-po — Typography rules, a second review host, and the assistants' post-style proposals are low-demand scope with no stated value

**Quotes:**

> A **typography** part of the brand-kit design dataset: font pairing and type scale rules, measurable, with the detector and Improve/Upgrade covering them.
> The campaign briefing assistant proposes a **post style** per planned post (one of the eight).
> **Problem:** The proposal gives no demand for any of these. They appear because "007 follow-ups" and the 030 scan listed them. Each adds a dataset, UI or prompt surface to maintain. The briefing assistant's goal-to-post-style change at least fixes a stale field. The typography dataset and the second review host are new capability with no problem statement. Typography rules also depend on the font work in B, so they should follow it.
> **Fix:** Mark E as droppable pre-merge. Keep F's post-style fix, because the stale `goal` is a real mismatch.
> **Status:** upheld
