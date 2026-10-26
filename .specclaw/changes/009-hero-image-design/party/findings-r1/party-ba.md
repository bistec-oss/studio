### [BLOCK] party-ba — The central evidence is one informal comparison against a different product, with no baseline showing users see "flat" posts as a problem

**Quotes:**

> **The image model is used as wallpaper, so posts are clean but flat.** A side-by-side comparison on 2026-09-23 made the gap concrete (`evidence/`):
> `chatgpt-product-showcase.png`: ChatGPT, from a short prompt.
> **Problem:** The pain is named as "flat", and the only evidence is the author's own comparison of one hand-polished Bistec post against two ChatGPT outputs. It names no sufferer, no user complaint and no rejected post. It does not show that ChatGPT's look is what the Bistec marketing team wants. It also does not show that a different pipeline would produce that look reliably, because the ChatGPT images came from one prompt each and may have been selected. Five root causes are listed, but nothing shows that fixing them closes the gap. If this shipped and worked perfectly, nothing in the text says the marketing team would use the posts more or reject fewer of them. A taste gap is being treated as a user problem.
> **Fix:** Name who is dissatisfied and cite what they said or did, such as rejected drafts, refine requests asking for imagery, or a team request. Otherwise restate the problem as an exploratory hypothesis, with a comparison of generated outputs as the check.
> **Status:** upheld

### [WARN] party-ba — The proposal's Phase 1 contradicts its own evidence: the ChatGPT look depends on a photoreal hero subject and real product UI, which are excluded

**Quotes:**

> The ChatGPT images have a **hero subject** with depth, lighting and physical objects.
> **This change is Phase 1 only.** Phases 2 and 3 become their own changes later, proposed when Phase 1 is proven. Items 4 and 7 above, and the product-screenshot part of the reference images, are out of scope here.
> **Problem:** The problem statement says the gap is a hero subject, a laptop showing the real product UI, and the 3-step row. Phase 1 builds layout archetypes, safe-area verification and a quality setting. Cause 3 (no reference images, so the real product UI cannot be shown) is deferred, and the only path to the ChatGPT look is the Phase 3 full AI render. In Phase 1 the image model can make a hero, but the proposal never says it will be asked for one, and `classic-background` stays the default. So after Phase 1, most of what the problem cites can still go unaddressed. The problem and the delivered scope do not match, and nothing says which gap Phase 1 closes.
> **Fix:** State which of the five causes Phase 1 closes and which gap in the comparison images it should visibly shrink. Or re-scope the Problem section to the layout and safe-area part only.
> **Status:** upheld

### [WARN] party-ba — No acceptance criteria, so the main claim (posts look less flat) has nothing to fail against

**Quotes:**

> `classic-background` stays the default until the archetypes are proven.
> real-render tests of the safe-area check, using **004**'s rasterizing harness (`npm run test:render`).
> **Problem:** The artifact has no acceptance criteria. "Proven" is never defined: no observation, sample size or reviewer decides when archetypes are proven. The only testable item, the safe-area check, verifies a mechanism (luminance or variance in a region) and not the claimed benefit (less flat, better looking posts). It also gives no threshold for "busy" or "fails contrast". The Phase 1 goal of better imagery therefore has no ship-time check, and the promotion of an archetype to default has no stated criterion.
> **Fix:** Add falsifiable criteria. For example, a fixed set of briefs is generated under each archetype and judged against `classic-background` by a named reviewer. Also give numeric pass thresholds for the safe-area check, and define what "proven" means for the default flip.
> **Status:** upheld

### [WARN] party-ba — The proposal's own text still asserts the decided-against behaviour and the per-team Phase 3 and quality scope, so the stated scope is inconsistent

**Quotes:**

> If the region is busy or fails contrast, regenerate once, then fall back to `classic-background`.
>
> - Is regenerate-once on a failed safe-area check worth the extra image cost, or should it fall straight back to `classic-background`?
>   **Risk:** medium-high. This changes the look of every Path B post, adds image cost (high quality, possible regenerate-once)
>   schema (brief archetype, kit allow-list, Phase 3 flag)
>   **Problem:** The Decisions say regenerate-once is removed, and open question 4 is "answered". But the Proposed Solution item 3 still says to regenerate once, the open question is still listed as open, and the Impact section still lists regenerate-once and a Phase 3 flag in the build. Another reading is that "regenerate once" is still wanted for the cost or latency estimate. Two readings of "what the safe-area step does on failure" give two different builds. The Impact also says "changes the look of every Path B post" while `classic-background` is stated as the default, which are different claims about how many posts change.
>   **Fix:** Edit the Proposed Solution, Impact and Open Questions so they match the Decisions block, and say which posts change under the default.
>   **Status:** upheld

### [WARN] party-ba — "Auto" archetype selection has no stated chooser or behaviour, and "safe area" and "measurable" are undefined

**Quotes:**

> A brief can pick one or leave it on **auto**.
> The decision gains `{ archetype, role: 'hero' | 'background', safeArea }`.
> sample luminance and variance inside the text safe area
> **Problem:** "Auto" is load-bearing, because it is the default for briefs. The proposal does not say whether the art-director model picks it, whether it depends on brief content, or whether it is restricted to the kit's allow-list. Under the stated default (`classic-background`), auto might always resolve to classic and make the feature dormant, or it might let the model pick any archetype. These give different builds. "safeArea" is also never defined (a region in percent of the canvas, a pixel box, or the whole empty band?), and the proposal's "measurable" contract examples use approximate percentages ("~55%", "~~45%").
> **Fix:** Define what auto resolves to and who decides. Define `safeArea` as a shape and units, and state how the "~~" values become exact thresholds.
> **Status:** upheld

### [NOTE] party-ba — The assumption that a safe-area luminance and variance check detects a usable text region is unverified

**Quotes:**

> sample luminance and variance inside the text safe area (the existing `sampleImageColors` machinery in `renderer/puppeteer.ts`).
> **Problem:** The check is presented as an invariant, but nothing shows that luminance and variance inside a region predict legible text over it. The proposal also assumes `sampleImageColors`, which the project documents as palette sampling, can do this. Probably workable, but it is a stated premise and not an evidenced one, and it defines whether the "no scrim" benefit is real.
> **Fix:** State the pass rule (for example, a WCAG contrast ratio against the intended text colour) and note it will be checked against real renders.
> **Status:** upheld
