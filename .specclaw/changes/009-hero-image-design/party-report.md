# Party Report: 009-hero-image-design

**Reviewed:** 2026-10-21
**Tier:** deep (classifier) — Adds persisted brief archetype and kit allow-list fields and rewrites the art-director, image and design prompts that every Path B post depends on, across roughly 20-30 files including schema, renderer sampling and the brief wizard, even though the default stays classic-background.
**Panel:** party-po(sonnet), party-architect(opus), party-ba(sonnet), party-security(opus), party-visionary(opus)
**Verdict:** CHANGES_REQUESTED

## Summary

37 findings: 6 BLOCK, 24 WARN, 5 NOTE upheld — 2 withdrawn

## Findings

### [BLOCK] party-architect — The safe area has two sources of truth: the archetype dataset and the model's decision

**Quotes:** > Each one states in measurable terms where the text sits, where the image subject sits, and what must stay empty.
**Quotes:** > The decision gains `{ archetype, role: 'hero' | 'background', safeArea }`.
**Quotes:** > The design prompt receives **the same** archetype and safe area, so text lands where the image is empty by construction, not by scrim.
**Problem:** The proposal makes the archetypes data, and each archetype already states its empty region in measurable terms. It then also has the art-director model return `safeArea` and `role` alongside `archetype`. Both fields can be derived from the archetype: `typographic` has no image, `classic-background` is a background, and the rest are heroes. So the safe area is written twice, once in the dataset and once by a model. The artifact does not say which one the image prompt, the design prompt and the verifier read. If the model returns a `safeArea` that disagrees with its own `archetype`, the "by construction" guarantee is gone, and the verifier may check a different region from the one the design prompt was told to use. That puts a measurement in the model layer when the data layer already owns it. party-security reached the same fix independently from the trust side (a self-graded gate). That agreement supports the structural reading and does not duplicate it.
**Fix:** Have the model return only the archetype key, from a closed set. Code validates it and looks up `safeArea` and `role` in the dataset. The image prompt builder, the design prompt builder and the verifier all read that one lookup. If a per-generation adjustment is really wanted, state in the artifact what the dataset cannot express.
**Status:** upheld

### [BLOCK] party-architect — The per-team quality setting has no named storage or route to the provider, and the Impact list does not match the Phase 1 decisions

**Quotes:** > **Quality: keep the provider default.** Add a per-team quality setting whose default is today's behaviour, and teams opt into `high` after it is measured on prod.
**Quotes:** > **Size: architectural.** The change adds a new design-data module, schema for the brief's archetype and the kit's allow-list, and prompt changes.
**Quotes:** > `ImageProvider.generateImage(prompt, _brandKitId, size)` ignores the kit (`_brandKitId`) and calls `images.generate` only (`providers/implementations/image/openai.ts:11-19`).
**Quotes:** > **Phase 2:** `ImageProvider` reference images, the OpenAI edit endpoint and product-screenshot kit artifacts (a later change).
**Quotes:** > **Files affected:** ~20–30 (estimated) — background/pathB prompt builders, `background.ts`, `ImageProvider` + OpenAI impl, renderer sampling, brand-kit artifacts + admin UI, brief wizard, schema (brief archetype, kit allow-list, Phase 3 flag), tests
**Problem:** In round 1 I said the setting needs a new `generateImage` parameter. That is one route. The value could also be applied when the provider is instantiated, or stored on the IMAGE provider row, as party-visionary suggests. Either way the quality value has to reach the OpenAI call, so `ImageProvider` or the provider's construction must change in Phase 1, even though Out of Scope moves `ImageProvider` work to Phase 2. The setting also needs storage and a UI to set it, and neither appears in the schema list in the Decisions. The Impact line contradicts the Decisions too: it lists a Phase 3 flag and brand-kit artifacts, which are out of scope, and it leaves out the quality setting. party-ba and party-po flagged the stale Impact list separately. A planner working from either list would half-land the quality change.
**Fix:** Name where the setting is stored (a team column, the IMAGE provider row, or an env value as party-po suggests) and its "unset" value. Name the UI that sets it, if there is one, and the route by which it reaches the OpenAI call (a call argument or provider instantiation). List every implementation and call site that changes in Phase 1. Rebuild the Impact list from the Phase 1 decisions.
**Status:** upheld

### [BLOCK] party-architect — The archetype that actually rendered is never recorded, and refine and regenerate are unnamed co-changes

**Quotes:** > post-generation safe-area verification, with a **direct fallback** to `classic-background`;
**Quotes:** > The change adds a new design-data module, schema for the brief's archetype and the kit's allow-list, and prompt changes.
**Quotes:** > Enabled per team by an admin, and stamped on the draft so it can't be mistaken for a normal render.
**Quotes:** > The real kit logo and exact copy are layered by the design step, which preserves correct spelling, logo fidelity, inline edit (PR #36), refine and version history.
**Problem:** The brief stores the archetype that was requested. After a failed check, or after `auto` resolves, the draft is built from a different archetype, and the schema has no place to record which one ran or why. Phase 3 stamps its mode on the draft. Phase 1 does not, even though it is the phase with a silent fallback. The proposal says refine and version history are "preserved". It never names the refine and regenerate design prompt builders as callers that need the current revision's archetype and safe area. Without that, a refine of a `product-showcase` draft is prompted as an unconstrained layout, and a regenerate re-reads the brief's original request instead of what rendered. party-visionary (refine works blind) and party-security (the fallback leaves no record) found the same missing column from their own angles. Neither undermines the merge-time co-change reading.
**Fix:** Stamp the resolved archetype, and the fallback reason if there was one, on the draft or the revision, next to `PROMPT_VERSION`. List the refine and regenerate-design prompt paths as same-commit co-changes that read that stamp.
**Status:** upheld

### [WARN] party-architect — Nobody owns the design-data module: this change creates it, but 007 is said to own it

**Quotes:** > **007** is soft: archetypes can land first, but should live in the same design-system data module 007 introduces, not a parallel one.
**Quotes:** > **Size: architectural.** The change adds a new design-data module, schema for the brief's archetype and the kit's allow-list, and prompt changes.
**Problem:** One sentence says the module is 007's. The other says this change adds it. If 009 lands first, which the dependency line allows, 009 decides the module's location and top-level shape without 007's input. 007 must then fit into it, or it builds the parallel module the proposal warns against. The artifact does not specify the shape both changes would share. party-visionary raised the long-horizon version of this. My finding is limited to the contract this commit must name.
**Fix:** In this change, name the module's path and top-level shape, with a `composition` section that 007's typography and kit-rule sections sit beside. Record that 007 extends this module rather than introducing one.
**Status:** upheld

### [WARN] party-architect — The rules for picking an archetype (auto, kit default, allow-list) are not specified

**Quotes:** > A brand kit lists which archetypes it allows and its default. A brief can pick one or leave it on **auto**.
**Quotes:** > Mitigated by `classic-background` as the default until proven, per-kit opt-in, `PROMPT_VERSION` stamping, and phase independence.
**Problem:** An implementer would have to guess at several points:

- whether `auto` means "use the kit default" or "the art-director model picks from the allow-list";
- what an existing kit with no allow-list allows (only `classic-background`?);
- what happens when a brief's explicit pick is not in the allow-list of the kit that finally resolves, for example after a campaign or project kit override;
- what code does when the model returns an archetype outside the allow-list.

Three components share this contract: the wizard, the art-director step and the prompt builders. Two implementers would resolve it differently. party-ba and party-security raised the same gaps under their own lenses (an undefined term, and a check that can be bypassed).
**Fix:** State the order of tiers (brief pick, then kit default or model choice, then `classic-background`), the meaning of an empty allow-list, and that the allow-list is validated in code after the model returns, with a named substitute when validation fails.
**Status:** upheld

### [WARN] party-architect — The safe-area check has no thresholds, no coordinate space, and no text colour to measure contrast against

**Quotes:** > After the image returns, sample luminance and variance inside the text safe area (the existing `sampleImageColors` machinery in `renderer/puppeteer.ts`). If the region is busy or fails contrast, regenerate once, then fall back to `classic-background`.
**Quotes:** > `ImageProvider.generateImage(prompt, _brandKitId, size)` ignores the kit (`_brandKitId`) and calls `images.generate` only
**Problem:** The artifact describes `sampleImageColors` as existing colour-sampling machinery. A per-region luminance and variance measurement is a new function on top of it, and the proposal does not define its inputs or outputs. "Busy" and "fails contrast" have no thresholds. Contrast needs a text colour, but the design step chooses that colour after the check runs. The archetypes are written as percentages of "the frame", but the image is generated at a provider `size` and then placed on the post canvas. The artifact does not say whether the safe area is measured on the generated image or on the rendered canvas, so the verifier and the design prompt could be looking at different regions.
**Fix:** Specify the function the check uses (region in, `{ meanLuminance, variance }` out), the pass thresholds, the colour that contrast is measured against (for example, the archetype's declared text tone), and that safe areas are canvas percentages mapped onto the image through the same fit the design uses.
**Status:** upheld

### [WARN] party-architect — It is not defined what the fallback to `classic-background` renders, or what happens when no image comes back

**Quotes:** > **On a failed safe-area check, fall back directly** to `classic-background`, with no regenerate. Open question 4 is answered.
**Quotes:** > Today a teammate without a personal OpenAI key gets **no image at all**, silently. Ship hero mode before that fix and most users would see no change, only the CSS fallback.
**Problem:** "No regenerate" suggests the fallback reuses the hero image, which has a subject and a focal point, as a full-bleed background under a scrim. The proposal never says so. An implementer could reuse that image or generate a new background, and "no regenerate" rules out only one reading. The proposal names a second exit, where no image comes back while a hero archetype is selected, but never says where it goes. It could go to `typographic`, to `classic-background` with no image, or to the hero design prompt with no image. Item 3 in Proposed Solution still says "regenerate once", which contradicts the decision an implementer is supposed to build. party-security's fail-closed finding adds a third exit (the check errors) that belongs in the same table.
**Fix:** Write the fallback as a table with one row per exit: check fails, check errors, image skipped, invalid archetype. For each exit, give the archetype it resolves to and the image it uses. Bring item 3 into line with the decision.
**Status:** upheld

### [WARN] party-architect — The only named test seam is a real-render test; the decision and fallback logic has no stub seam

**Quotes:** > real-render tests of the safe-area check, using **004**'s rasterizing harness (`npm run test:render`).
**Quotes:** > The build makes no real model calls, so nothing can be measured first.
**Quotes:** > The mock suite cannot see this class of bug (`MOCK_PUPPETEER` never rasterizes).
**Problem:** The only test the proposal names is the real-render harness. The branching logic sits outside it: parsing the art-director output, validating against the allow-list, choosing pass or fallback, and selecting the prompt for the resolved archetype. No real model calls are allowed and the mock suite never rasterizes, so this logic needs two seams. One feeds a fixture image in place of the image model. The other feeds a stubbed art-director decision. The artifact names neither. Without them, the fallback branch runs only on a real render of a real generated image, and that test would be skipped.
**Fix:** Split the check into two parts. The first is a pure function that takes pixel samples and a safe area and returns a verdict; unit-test it with synthetic samples. The second is a Puppeteer sampling step, tested by `test:render` on committed fixture images. Name the mock seam that returns a chosen archetype decision and a chosen fixture image, so the mock suite can drive both pass and fallback.
**Status:** upheld

### [NOTE] party-architect — Rebuttal to party-visionary: an emptiness check on the final render is not the same check, so it cannot cover both halves

**Quotes:** > 3. **Verify the contract, don't assume it.** After the image returns, sample luminance and variance inside the text safe area (the existing `sampleImageColors` machinery in `renderer/puppeteer.ts`).
**Problem:** party-visionary's NOTE says running "the same check on the final render would be the actual invariant". On the final PNG the text safe area contains the text by design, so a luminance and variance test for emptiness fails on every correct post. The two halves of the contract need two different measurements. The image half asks whether the region was left empty before layout, and only the hero image can answer that. The layout half asks whether the text landed inside the region, and that is a geometry question about the rendered DOM, not a pixel statistic. party-security's WARN asks for that measurement: text and logo bounding rects compared against the safe area. A generic `checkRegions(png, ...)` run after render would need a different metric per region purpose, so it is not one reusable check. My comment is limited to the verifier design in this commit. Only party-visionary can withdraw its finding.
**Fix:** Keep the pre-design pixel check on the hero image. Use the DOM bounding-rect assertion party-security describes for the layout half. Both read the same dataset-derived safe area.
**Status:** upheld

### [BLOCK] party-ba — The central evidence is one informal comparison against a different product, with no baseline showing users see "flat" posts as a problem

**Quotes:**

> **The image model is used as wallpaper, so posts are clean but flat.** A side-by-side comparison on 2026-09-23 made the gap concrete (`evidence/`):
> `chatgpt-product-showcase.png`: ChatGPT, from a short prompt.
> **Problem:** The pain is named as "flat", and the only evidence is the author's own comparison of one hand-polished Bistec post against two ChatGPT outputs. It names no sufferer, no user complaint and no rejected post. It does not show that ChatGPT's look is what the Bistec marketing team wants. It also does not show that a different pipeline would produce that look reliably. Five root causes are listed, but nothing shows that fixing them closes the gap. The 2026-10-21 Decisions narrow the scope to Phase 1 but add no evidence for the premise.
> **Fix:** Name who is dissatisfied and cite what they said or did, such as rejected drafts, refine requests asking for imagery, or a team request. Otherwise restate the problem as an exploratory hypothesis, with a comparison of generated outputs as the check.
> **Status:** upheld

### [WARN] party-ba — The proposal's Phase 1 contradicts its own evidence: the ChatGPT look depends on a photoreal hero subject and real product UI, which are excluded

**Quotes:**

> The ChatGPT images have a **hero subject** with depth, lighting and physical objects.
> **This change is Phase 1 only.** Phases 2 and 3 become their own changes later, proposed when Phase 1 is proven. Items 4 and 7 above, and the product-screenshot part of the reference images, are out of scope here.
> **Problem:** The Problem section cites a hero subject, a laptop showing the real product UI and a 3-step row. Phase 1 delivers layout archetypes, safe-area verification and a quality setting. Cause 3 (no reference images) is deferred, and `classic-background` stays the default. After Phase 1, most of what the problem cites can still go unaddressed, and nothing says which gap Phase 1 closes.
> **Fix:** State which of the five causes Phase 1 closes and which gap in the comparison images it should visibly shrink. Or re-scope the Problem section to the layout and safe-area part only.
> **Status:** upheld

### [WARN] party-ba — No acceptance criteria, so the main claim (posts look less flat) has nothing to fail against

**Quotes:**

> `classic-background` stays the default until the archetypes are proven.
> real-render tests of the safe-area check, using **004**'s rasterizing harness (`npm run test:render`).
> **Problem:** There are no acceptance criteria. "Proven" is never defined: no observation, sample size or reviewer decides it. The only testable item, the safe-area check, verifies a mechanism and not the claimed benefit. It also gives no threshold for "busy" or "fails contrast". The default flip has no stated criterion.
> **Fix:** Add falsifiable criteria. For example, a fixed set of briefs is generated under each archetype and judged against `classic-background` by a named reviewer. Also give numeric pass thresholds for the safe-area check, and define what "proven" means.
> **Status:** upheld

### [WARN] party-ba — The proposal's own text still asserts the decided-against behaviour and the per-team Phase 3 and quality scope, so the stated scope is inconsistent

**Quotes:**

> If the region is busy or fails contrast, regenerate once, then fall back to `classic-background`.
>
> - Is regenerate-once on a failed safe-area check worth the extra image cost, or should it fall straight back to `classic-background`?
>   **Risk:** medium-high. This changes the look of every Path B post, adds image cost (high quality, possible regenerate-once)
>   schema (brief archetype, kit allow-list, Phase 3 flag)
>   **Problem:** The Decisions say regenerate-once is removed and open question 4 is answered. But Proposed Solution item 3 still says to regenerate once, the question is still listed as open, and Impact still lists regenerate-once and a Phase 3 flag. Two readings of what the safe-area step does on failure give two different builds. Impact also says "every Path B post" changes while `classic-background` is the default.
>   **Fix:** Edit the Proposed Solution, Impact and Open Questions so they match the Decisions block, and say which posts change under the default.
>   **Status:** upheld

### [WARN] party-ba — "Auto" archetype selection has no stated chooser or behaviour, and "safe area" and "measurable" are undefined

**Quotes:**

> A brief can pick one or leave it on **auto**.
> The decision gains `{ archetype, role: 'hero' | 'background', safeArea }`.
> sample luminance and variance inside the text safe area
> **Problem:** "Auto" is the brief default and the proposal does not say who decides it. Under the stated default (`classic-background`), auto might always resolve to classic and make the feature dormant, or it might let the model pick any archetype from the kit's allow-list. These give different builds. "safeArea" is never defined as a shape and units, and the contract examples use approximate percentages ("~55%", "~~45%").
> **Fix:** Define what auto resolves to and who decides. Define `safeArea` as a shape and units, and state how the "~~" values become exact thresholds.
> **Status:** upheld

### [NOTE] party-ba — The assumption that a safe-area luminance and variance check detects a usable text region is unverified

**Quotes:**

> sample luminance and variance inside the text safe area (the existing `sampleImageColors` machinery in `renderer/puppeteer.ts`).
> **Problem:** Nothing shows that luminance and variance inside a region predict legible text over it. The proposal also assumes `sampleImageColors`, which is documented as palette sampling, can do this. Probably workable, but it is a stated premise and not an evidenced one.
> **Fix:** State the pass rule (for example, a WCAG contrast ratio against the intended text colour) and note it will be checked against real renders.
> **Status:** upheld

### [BLOCK] party-po — Phase 1 ships a new look with zero default exposure and no stated value for what it builds

**Quotes:**

> `classic-background` stays the default until the archetypes are proven.
> **Complexity:** large
> ~20–30 (estimated)
> **Problem:** The stated value is a hero subject with depth, which the proposal's own Problem section says needs a subject in the image. Phase 1 cuts reference images (item 4) and quality measurement, and leaves `classic-background` as the default. A user who never edits config therefore gets no change on upgrade. The measurable layout contract and verification machinery is a large build, 20-30 files plus schema, and it has no stated value until someone opts in. The proposal also names the real product UI on a device screen as a main gap (Problem point 3), and that is deferred to Phase 2. The do-nothing option is never priced: nothing says what gets worse if this never ships, or how many posts are affected. The cheaper variant is never considered: add one or two archetypes (`product-showcase`, `editorial-split`) as prompt-only text in the existing background and Path B builders, with no schema and no per-kit allow-list. Then eyeball a few real posts, and build the verification and data model only if that works.
> **Fix:** Add a do-nothing paragraph and compare it with a prompt-only two-archetype variant. Ship that variant first, and name the full data model and verification as a second cut.
> **Status:** upheld

### [WARN] party-po — Per-kit allow-list, kit default, and brief-level picker are optionality nobody asked for

**Quotes:**

> A brand kit lists which archetypes it allows and its default. A brief can pick one or leave it on **auto**.
> a kit-level allow-list and default, and a brief-level choice (auto by default);
> **Problem:** This adds two schema fields, admin UI and wizard UI, and each is a knob paid for forever. No requester or use case is stated. Auto plus a single team-level or global default would capture most of the value. The wizard picker also adds a prompt every user must consider or skip.
> **Fix:** Cut the kit allow-list and the brief picker from Phase 1. Keep auto only, and add per-kit controls when a kit asks for them.
> **Status:** upheld

### [WARN] party-po — Running cost is unstated and the Impact section contradicts the decisions

**Quotes:**

> adds image cost (high quality, possible regenerate-once), and adds latency to an already ~5-minute pipeline.
> Is regenerate-once on a failed safe-area check worth the extra image cost, or should it fall straight back to `classic-background`?
> **Files affected:** ~20–30 (estimated) — background/pathB prompt builders, `background.ts`, `ImageProvider` + OpenAI impl, renderer sampling, brand-kit artifacts + admin UI, brief wizard, schema (brief archetype, kit allow-list, Phase 3 flag)
> **Problem:** The Impact section still prices high quality, regenerate-once, the `ImageProvider` and OpenAI edit work, kit artifacts, and a Phase 3 flag. The user's decisions cut all of these. Open questions 1, 2 (partly), 4 and 5 are also stale. The cost the reader sees is therefore not the cost of this change. The real recurring cost is also never given as a number: an extra art-director output, a sampling pass per image, and what a fallback does. A fallback after a full image spend wastes that spend, and no expected fallback rate is stated.
> **Fix:** Restate Impact for Phase 1 only: file count, added latency, added Haiku tokens, and the image spend lost on each fallback.
> **Status:** upheld

### [NOTE] party-po — Quality setting could be an env or config value instead of a per-team setting

**Quotes:**

> Add a per-team quality setting whose default is today's behaviour, and teams opt into `high` after it is measured on prod.
> **Problem:** The default is today's behaviour, so most teams never touch it. A per-team schema field and UI is a mechanism where a single env var would do for the first measurement. The measurement itself can only happen on prod, which means a deploy with no value until someone runs it.
> **Fix:** Ship quality as an env or system-level flag first, and promote it to per-team only if teams need different values. This item is also a separate cut line that could ship alone.
> **Status:** upheld

### [NOTE] party-po — The safe-area check is a separable cut line, and 005 item 3 should ship first

**Quotes:**

> **005 item 3 (`isDefault` fix) is a hard prerequisite.**
> real-render tests of the safe-area check, using **004**'s rasterizing harness (`npm run test:render`).
> **Problem:** The proposal does not name its own cut lines. The cheapest first cut is the 005 `isDefault` fix (it makes images appear at all). Next is the archetype prompts (value visible by eye). Last is luminance verification and the fallback, which only guards a feature users cannot yet reach by default. Sequence the guard after the prompts are seen in use.
> **Fix:** State the ship order explicitly: the `isDefault` fix, then the prompt-only archetypes, then verification and fallback, then quality.
> **Status:** upheld

### [BLOCK] party-security — The verifier's region comes from the model it is checking

**Quotes:**

> The decision gains `{ archetype, role: 'hero' | 'background', safeArea }`. The image prompt states the empty region as a measurement ("the left 45% of the frame must be an empty dark gradient"). The design prompt receives **the same** archetype and safe area, so text lands where the image is empty by construction, not by scrim.
> After the image returns, sample luminance and variance inside the text safe area
> **Problem:** The art-director model writes `safeArea`, and the verifier samples only inside it. The region being checked is chosen by the party being checked, so this is a self-graded gate. A tiny or degenerate rectangle, or one placed over a plain corner, passes luminance and variance trivially. The design prompt then gets the same rectangle as its text zone, so the post goes out green with text over the busy subject. Brief text, campaign briefings and uploaded documents all feed the art-director, and any of them can steer it into producing that rectangle on purpose. A missing or zero-area `safeArea` passes vacuously. party-architect's round-1 BLOCK reaches the same fix from the structural side ("two sources of truth"). Their reading shows the field is redundant. This one shows it is also exploitable, which is why it stays a BLOCK and not only a duplication to clean up.
> **Fix:** Take the safe area from the versioned archetype dataset, keyed by archetype, never from model output. The model picks only an archetype key from a closed enum, and any region it returns is ignored. Set a minimum area per archetype in the dataset. A region below that minimum, or one that cannot be resolved, counts as a failed check and takes the `classic-background` fallback.
> **Status:** upheld

### [WARN] party-security — The check reads the image and never where the text actually landed

**Quotes:**

> so text lands where the image is empty by construction, not by scrim.
> This follows the 2026-08-03 lesson: **a prompt rule is not an invariant; check the output.**
> **Problem:** The verification runs on the generated image before the design step. Whether the design model really puts its text inside the safe area is still only a prompt rule, which is exactly what the cited lesson says not to trust. A design reply that ignores the zone produces text over the hero subject with no scrim, and the image check still reports a pass. That failure looks the same as success. party-visionary's round-1 NOTE makes the same observation as a reuse opportunity. This finding is the exposure that opportunity would close.
> **Fix:** After the final render, read the bounding rects of the text and logo elements from the DOM (Puppeteer already has the page) and assert they fall inside the safe area. A violation takes the same fallback as an image failure and is recorded the same way.
> **Status:** upheld

### [WARN] party-security — An archetype from the brief or from auto is not stated to be checked against the kit allow-list

**Quotes:**

> A brand kit lists which archetypes it allows and its default. A brief can pick one or leave it on **auto**.
> **Problem:** The allow-list belongs to the kit admin. The archetype value comes from the brief, which an editor controls, or under auto from model output. The proposal never says the value is checked against the allow-list at generation time. If the check lives only in the wizard, it is bypassed by a direct API call, by a model choice under auto, and by callers that skip the wizard (scheduler, MCP, ACP, regenerate from a stored brief). It is also bypassed when a kit's allow-list is narrowed after the brief was saved. party-po's round-1 WARN proposes cutting the allow-list. If that happens, the kit-admin half of this finding goes away, but the closed-enum check on model output under auto still applies.
> **Fix:** On the server, check the resolved archetype against the kit's current allow-list at call time, on every caller path. An explicit interactive pick that is not allowed returns 400. A stored or model-chosen value that is not allowed falls back to the kit default, and the substitution is recorded.
> **Status:** upheld

### [WARN] party-security — The fallback to classic-background is silent and leaves no record

**Quotes:**

> - **On a failed safe-area check, fall back directly** to `classic-background`, with no regenerate. Open question 4 is answered.
>   **Problem:** A user who picked `product-showcase` gets a full-bleed background with a scrim, and nothing tells them, stamps the draft or logs it. A miscalibrated threshold, a prompt regression or a provider change could make the fallback fire on every run, and that would look exactly like hero mode working. The "prove it on prod" plan would then rest on numbers that cannot tell the two apart. The proposal also does not say whether the fallback reuses the image that failed the check (putting a busy subject under the text) or makes a second paid image call. party-architect (BLOCK, the rendered archetype is never recorded) and party-visionary (WARN, no evidence for "until proven") converge on the same stamp, which supports this finding.
>   **Fix:** Stamp the draft with the requested archetype, the applied archetype and the fallback reason (`busy`, `contrast`, `region-invalid`, `check-error`, `layout-violation`). Show a visible notice on the draft page. Say whether the fallback reuses the generated image or makes a new call, and count that call.
>   **Status:** upheld

### [WARN] party-security — The fallback only fires on a measured failure, so a check that cannot run passes

**Quotes:**

> If the region is busy or fails contrast, regenerate once, then fall back to `classic-background`.
>
> - post-generation safe-area verification, with a **direct fallback** to `classic-background`;
>   **Problem:** The only fallback condition the artifact states is "the region is busy or fails contrast", which can only be the result of a completed measurement. It names no outcome for when measuring is impossible: a sampler exception, a Puppeteer timeout, an image URL that won't load, or an art-director reply that won't parse or names an unknown archetype. If the code falls back only on a negative result, every one of these ships as a hero render that was never checked. That is the fail-open shape. party-architect's fallback-table WARN asks for these exits to be routed somewhere, which is a specification gap. This finding is narrower: whatever the table says, an exit where the check could not complete must not keep the hero archetype.
>   **Fix:** State that the check fails closed. Any error, timeout, unparseable decision or unknown archetype counts as a failed check, takes the `classic-background` fallback and is recorded with reason `check-error`. Only an explicit, completed pass may keep the hero archetype.
>   **Status:** upheld

### [WARN] party-security — The per-team quality setting spends money but names no permission gate

**Quotes:**

> - a per-team `quality` setting for hero images, defaulting to today's behaviour;
>   **Problem:** Switching to `high` raises the spend on every image the team generates, including unattended scheduled and MCP runs, and money spent cannot be recovered. The proposal does not say who may change the setting, whether the value is limited to the provider's allowed values, or whether a run records the quality it used. Without that record, an operator cannot tell which drafts cost more or when the setting changed. Two other seats suggest moving the setting: party-visionary to the IMAGE provider row, party-po to an env flag. The provider row would satisfy this fix if it keeps the team-admin gate those rows already have. An env flag removes the in-app grant, but the per-draft stamp is still needed for tracing spend.
>   **Fix:** Make the setting team-admin only (`withTeamAdmin`, the narrowest gate that works). Validate it against a closed enum and treat any unknown value as the provider default. Stamp the quality used on each draft so spend can be traced afterwards.
>   **Status:** upheld

### [NOTE] party-security — Rebuttal to party-po: shipping archetype prompts before the verifier ships the unchecked failure mode as the live state

**Quotes:**

> real-render tests of the safe-area check, using **004**'s rasterizing harness (`npm run test:render`).
> This follows the 2026-08-03 lesson: **a prompt rule is not an invariant; check the output.**
> **Problem:** party-po's round-1 BLOCK and NOTE propose shipping prompt-only archetypes first, judging them by eye, and adding the verification and fallback afterwards ("Sequence the guard after the prompts are seen in use"). I take no position on cost or scope. My objection is to the failure mode of that order. In the interim, a hero prompt that leaves the text region busy produces text over the subject with no scrim, no check, no fallback and no record. The proposal's own cited lesson describes this as the failure that looks identical to success. A prompt-only cut is safe only if it keeps a fail-closed path: either it stays off until the check exists, or it ships with a stamp that makes every interim hero render identifiable afterwards.
> **Fix:** If the prompt-only cut is adopted, it must either ship behind an admin-only flag that stays off until the verifier lands, or stamp the requested archetype on each draft from day one so interim renders can be found and re-checked. Only party-po can withdraw or amend their finding. This entry records the failure-mode objection.
> **Status:** upheld

### [WARN] party-visionary — The layout decision is used once and thrown away, so every later edit of the draft works blind to it

**Quotes:**

> The design prompt receives **the same** archetype and safe area, so text lands where the image is empty by construction, not by scrim.
> The real kit logo and exact copy are layered by the design step, which preserves correct spelling, logo fidelity, inline edit (PR #36), refine and version history.
> **Problem:** The proposal says the image prompt and the design prompt share the archetype and safe area during generation. It never says they are stored on the draft or its revisions. Refine, regenerate-design, inline edit and restore all come after generation. A refine such as "make the headline bigger" has no record of which part of the hero image must stay clear, so it can push text onto the subject. That brings back the scrim problem one edit later. party-architect's BLOCK on the unrecorded archetype names the merge-day co-changes. This finding is about what follows if the stamp is not added now. The first refine-related change after this one has to add the persistence itself. By then, every hero draft made before it has no recorded contract and can never get one back, so that change also has to carry a "no contract known" path forever.
> **Fix:** Store the resolved decision `{ archetype, regions, contract version }` on the draft and on each revision, beside the `PROMPT_VERSION` stamp. Say that refine and regenerate read it. It costs one column now. Added later, it leaves a permanent gap in the history.
> **Status:** upheld

### [WARN] party-visionary — "Until proven" is the gate for the default flip and for Phase 2, and nothing records the evidence

**Quotes:**

> - **This change is Phase 1 only.** Phases 2 and 3 become their own changes later, proposed when Phase 1 is proven.
>   **Phase 1:** archetypes, the layout contract, safe-area verification, quality. `classic-background` stays the default until the archetypes are proven.
>   Add a per-team quality setting whose default is today's behaviour, and teams opt into `high` after it is measured on prod.
>   **Problem:** Three later decisions depend on prod evidence: flipping the default away from `classic-background`, proposing Phase 2, and opting teams into `high`. party-security's silent-fallback finding covers the requested, applied and reason stamps. party-ba's finding covers defining "proven". Neither seat ties those stamps to the decisions that come later. Nor does either one record image-step duration, so the quality opt-in has no latency evidence. Without that tie, the change that flips the default has to add the instrument first and then wait for prod data to build up before it can decide anything.
>   **Fix:** Name the stamps (requested archetype, delivered archetype, fallback reason, quality used, image-step duration) as the evidence "proven" refers to. That way the change that follows starts with data.
>   **Status:** upheld

### [WARN] party-visionary — Archetype keys become persisted references with no rule for retiring or revising them, which breaks the "independently revertible" claim

**Quotes:**

> A small, versioned set of composition archetypes.
>
> - **Size: architectural.** The change adds a new design-data module, schema for the brief's archetype and the kit's allow-list, and prompt changes.
>   **Phasing (each phase independently revertible):**
>   **Problem:** After merge, brief rows and admin-curated kit allow-lists store archetype keys. Scheduled queue entries that run weeks later may store them too. The proposal calls the set "versioned" but does not say what a version governs. Take the next plausible change: tightening `product-showcase` from ~55% to ~60%, or retiring `hero-centre`. If the contract changes under the same key, a regenerated old draft silently gets a different layout. If a key is retired, it leaves stored briefs and allow-lists pointing at nothing. party-security's allow-list finding gives a substitution rule for a stored value that is no longer allowed. That rule covers a narrowed allow-list but not a contract revised under the same key. Once an admin saves a kit, reverting Phase 1 also drops their choices. So "independently revertible" stops being true at that point.
>   **Fix:** State the lifecycle: string or DB enum, how a retired key resolves (substitute it and record the substitution), and whether a contract revision mints a new key or a new version that drafts stamp. Narrow the revertibility claim to "revertible before an admin configures a kit".
>   **Status:** upheld

### [WARN] party-visionary — Layout now has two sources of truth: the archetype contract and the kit and briefing prose that already state layout rules

**Quotes:**

> | `editorial-split` | image confined to its own ~40% band; soft-masked edge (the proven IRP rule) |
>
> - Converting kit prose into measurable rules and the typography dataset — proposal **007** (this proposal adds a **composition** section alongside it)
>   **Problem:** `editorial-split` copies a rule that already exists as prose (the "IRP rule"). Kit and briefing prompts carry layout instructions, which is the adjective problem the proposal cites from 007. A post under that campaign gets the rule twice, with no stated precedence. The next edit to either copy, such as a 35% band in the prose, sends the model conflicting numbers. The drift shows up only as an occasional bad render, and someone will report it as a model-quality problem. No other seat raised this.
>   **Fix:** State which wins when the archetype contract and the kit or briefing prose disagree. Note that layout rules in prose move to the archetype, and are superseded by it, when a kit opts in.
>   **Status:** upheld

### [WARN] party-visionary — The layout contract allows one region, but the starting set already needs two and Phase 2 needs a third kind

**Quotes:**

> 2. **The art-director step returns a layout, not just a prompt.** The decision gains `{ archetype, role: 'hero' | 'background', safeArea }`.
> | `hero-centre` | subject centred in middle ~50% height; top ~20% and bottom ~25% kept clear |
>
> - For product screenshots on device screens: should the image model receive the screenshot as a reference (it may redraw it inaccurately), or should the design step composite the **real** screenshot into a device frame the image model leaves blank? The second is exact but needs a screen-region contract.
>   **Problem:** party-architect and party-security both argue, correctly, that the region should come from the archetype dataset and not from model output. The shape problem moves with it. `hero-centre` keeps two separate regions clear. Open question 5's exact option, the one Phase 2 will most likely pick, adds a region with a different purpose: left blank for compositing, not dark for text. If the dataset entry, the verifier, both prompt builders and the persisted stamp all assume a single `safeArea`, Phase 2 has to widen all of them. It also has to migrate every stamp written under the single-region shape.
>   **Fix:** Define the region shape now as a list of typed regions, `{ rect, purpose: 'text' | 'clear' | 'composite' }`, both in the dataset entry and in the stamp. The verifier then loops over the list, and Phase 2 adds a purpose without changing the schema.
>   **Status:** upheld

### [WARN] party-visionary — The archetype contracts are percentages with no post size, so every future size change must re-audit every archetype

**Quotes:**

> | `product-showcase` | device/subject in right ~55%; left ~45% empty and dark for text |
> Each one states in measurable terms where the text sits, where the image subject sits, and what must stay empty.
> **Problem:** The proposal never mentions post size. This finding relies on context outside the artifact: the app renders several sizes (1:1, 4:5, 9:16). A left-45% text column suits a square post. On a 9:16 story it becomes a tall, thin strip. party-architect's coordinate-space finding concerns mapping between the image and the canvas at merge. This finding is about what happens next. A change that adds a size, or edits an archetype, has to check every pair by hand, and nothing fails when a pair is wrong.
> **Fix:** Key each contract by size, or let an archetype declare the sizes it supports so the resolver excludes it elsewhere. Adding a size then fails loudly wherever a contract is missing.
> **Status:** upheld

### [WARN] party-visionary — The per-team `quality` setting stores one provider's parameter in a provider-neutral place

**Quotes:**

> 6. **`quality: 'high'` for hero images**, configurable per team, with the latency and cost measured before it becomes the default.
>
> - a per-team `quality` setting for hero images, defaulting to today's behaviour;
>   **Problem:** `quality: 'high'` comes from the OpenAI image API's vocabulary. party-architect asks where the setting is stored. party-po suggests an env var instead. This finding holds either way. Wherever it lives, if the value is OpenAI's own word, the next image provider the proposal names (Gemini, via 005) must either translate it or ignore it without saying so. A team that set `high` would then get default quality and no signal. It also sets a precedent that provider parameters live outside the provider, and the later per-provider settings (transparency, from open question 1) will copy that.
>   **Fix:** Put the setting on the IMAGE provider row, or define it as a neutral tier that each `ImageProvider` implementation maps.
>   **Status:** upheld

### [WARN] party-visionary — Rebuttal of party-po's prompt-only variant: cheap to build, but it leaves layout as prose in the prompt builders, the pattern this proposal names as the cause

**Quotes:**

> `classic-background` stays the default until the archetypes are proven.
> That is the adjective problem **007** documents, applied to layout instead of kit rules.
> **Problem:** party-po's first cut adds `product-showcase` and `editorial-split` as prompt-only text in the existing builders, with no schema, then checks a few posts by eye. I agree with the sequencing. As written, though, the variant leaves the next change with two costs. First, the layout rules live as prose inside the background and Path B builders, which is the adjective problem the proposal sets out to undo. The second cut must then lift them out and keep both copies in step while it does. Second, drafts made during the prompt-only period carry no record of which archetype they used. A check by eye leaves nothing behind, so the "proven" decision still has no data when the second cut arrives.
> **Fix:** If the prompt-only cut ships first, still define the two archetypes as keyed data that the builders read, and stamp the key on the draft. That is a few lines more than pure prompt text, and it lets the second cut extend the first instead of replacing it.
> **Status:** upheld

## Dissent

_Withdrawn findings. The severity token is prefixed WITHDRAWN so these do not count as live findings._

### [WITHDRAWN WARN] party-visionary — 009 founds the design-data module that 007 is supposed to own, so it sets the module's shape without designing for typography

**Quotes:**

> - **007** is soft: archetypes can land first, but should live in the same design-system data module 007 introduces, not a parallel one.
> - **Size: architectural.** The change adds a new design-data module, schema for the brief's archetype and the kit's allow-list, and prompt changes.
>   **Problem:** The dependency note says the module belongs to 007, but the decisions say 009 creates it. If 009 lands first, its conventions fix the module's shape before 007's typography dataset has any say.
>   **Fix:** Say that 009 is the founding change, and define a generic entry shape with 007 named as the second consumer.
>   **Status:** withdrawn — party-architect's "Nobody owns the design-data module" quotes the same two lines and makes the same fix: name the path and top-level shape, with a `composition` section that 007's sections sit beside. My long-horizon framing adds nothing the planner would build differently.

### [WITHDRAWN NOTE] party-visionary — The safe-area sampler checks the image before layout; the same check on the final render would be the actual invariant, and it is reusable

**Quotes:**

> 3. **Verify the contract, don't assume it.** After the image returns, sample luminance and variance inside the text safe area (the existing `sampleImageColors` machinery in `renderer/puppeteer.ts`).
> **Problem:** The original claim was that a generic pixel-region check, run on the final PNG, would also verify that the text landed in the safe area.
> **Fix:** A generic `checkRegions(png, regions[], thresholds)`.
> **Status:** withdrawn — party-security's "The check reads the image and never where the text actually landed" shows that the post-render half is a DOM-geometry check: read the text and logo bounding rects from the page Puppeteer already holds. My pixel version rests on a misreading. On the final render the text itself sits inside the text region, so luminance and variance would fail by design. Without that, the reuse argument does not follow.
