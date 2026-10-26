### [BLOCK] party-architect — The safe area has two sources of truth: the archetype dataset and the model's decision

**Quotes:** > Each one states in measurable terms where the text sits, where the image subject sits, and what must stay empty.
**Quotes:** > The decision gains `{ archetype, role: 'hero' | 'background', safeArea }`.
**Quotes:** > The design prompt receives **the same** archetype and safe area, so text lands where the image is empty by construction, not by scrim.
**Problem:** The proposal makes the archetypes data, and each archetype already states its empty region in measurable terms. It then also has the art-director model return `safeArea` and `role` alongside `archetype`. Both fields can be derived from the archetype: `typographic` has no image, `classic-background` is a background, and the rest are heroes. So the safe area is written twice, once in the dataset and once by a model. The artifact does not say which one the image prompt, the design prompt and the verifier read. If the model returns a `safeArea` that disagrees with its own `archetype`, the "by construction" guarantee is gone, and the verifier may check a different region from the one the design prompt was told to use. That puts a measurement in the model layer when the data layer already owns it.
**Fix:** Have the model return only the archetype key. Code validates it and looks up `safeArea` and `role` in the dataset. The image prompt builder, the design prompt builder and the verifier all read that one lookup. If a per-generation adjustment is really wanted, state in the artifact what the dataset cannot express.
**Status:** upheld

### [BLOCK] party-architect — The per-team quality setting has no named storage, and it changes the ImageProvider contract without saying so

**Quotes:** > **Quality: keep the provider default.** Add a per-team quality setting whose default is today's behaviour, and teams opt into `high` after it is measured on prod.
**Quotes:** > **Size: architectural.** The change adds a new design-data module, schema for the brief's archetype and the kit's allow-list, and prompt changes.
**Quotes:** > `ImageProvider.generateImage(prompt, _brandKitId, size)` ignores the kit (`_brandKitId`) and calls `images.generate` only (`providers/implementations/image/openai.ts:11-19`).
**Quotes:** > **Phase 2:** `ImageProvider` reference images, the OpenAI edit endpoint and product-screenshot kit artifacts (a later change).
**Quotes:** > **Files affected:** ~20–30 (estimated) — background/pathB prompt builders, `background.ts`, `ImageProvider` + OpenAI impl, renderer sampling, brand-kit artifacts + admin UI, brief wizard, schema (brief archetype, kit allow-list, Phase 3 flag), tests
**Problem:** A per-team setting has to be persisted somewhere and set from some UI, but the schema list in the Decisions names only the brief archetype and the kit allow-list. To reach the provider, the setting also needs a new parameter on `generateImage(prompt, _brandKitId, size)`. That changes the shared interface, so every `ImageProvider` implementation and every caller of `generateImage` must change in the same commit. Out of Scope moves `ImageProvider` changes to Phase 2, so the artifact contradicts itself here. The Impact line has not caught up with the Decisions either: it still lists a Phase 3 flag and brand-kit artifacts, which are out of scope, and it omits the team setting. A planner working from either list would half-land the quality change.
**Fix:** Name the quality setting's storage (which model and column, and its "unset" value), the UI that sets it, and the `ImageProvider` signature change as Phase 1 co-changes. List every implementation and call site that must change with it. Rebuild the Impact list from the Phase 1 decisions.
**Status:** upheld

### [BLOCK] party-architect — The archetype that actually rendered is never recorded, and refine and regenerate are unnamed co-changes

**Quotes:** > post-generation safe-area verification, with a **direct fallback** to `classic-background`;
**Quotes:** > The change adds a new design-data module, schema for the brief's archetype and the kit's allow-list, and prompt changes.
**Quotes:** > Enabled per team by an admin, and stamped on the draft so it can't be mistaken for a normal render.
**Quotes:** > The real kit logo and exact copy are layered by the design step, which preserves correct spelling, logo fidelity, inline edit (PR #36), refine and version history.
**Problem:** The brief stores the archetype that was requested. After a failed check, or after `auto` resolves, the draft is built from a different archetype, and the schema has no place to record which one ran or why. Phase 3 stamps its mode on the draft, but Phase 1 does not, even though Phase 1 is the phase with a silent fallback. The proposal says refine and version history are "preserved", but it never names the refine and regenerate design prompt builders as callers that need the current revision's archetype and safe area. Without that, a refine of a `product-showcase` draft is prompted as an unconstrained layout, and a regenerate re-reads the brief's original request instead of what rendered.
**Fix:** Stamp the resolved archetype, and the fallback reason if there was one, on the draft or the revision, next to `PROMPT_VERSION`. List the refine and regenerate-design prompt paths as same-commit co-changes that read that stamp.
**Status:** upheld

### [WARN] party-architect — Nobody owns the design-data module: this change creates it, but 007 is said to own it

**Quotes:** > **007** is soft: archetypes can land first, but should live in the same design-system data module 007 introduces, not a parallel one.
**Quotes:** > **Size: architectural.** The change adds a new design-data module, schema for the brief's archetype and the kit's allow-list, and prompt changes.
**Problem:** One sentence says the module is 007's. The other says this change adds it. If 009 lands first, which the dependency line allows, 009 decides the module's location and top-level shape without 007's input. 007 must then fit into it, or it builds the parallel module the proposal warns against. The artifact does not specify the shape both changes would share.
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

Three components share this contract: the wizard, the art-director step and the prompt builders. Two implementers would resolve it differently.
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
**Problem:** "No regenerate" suggests the fallback reuses the hero image, which has a subject and a focal point, as a full-bleed background under a scrim. The proposal never says so. An implementer could reuse that image or generate a new background, and "no regenerate" rules out only one reading. The proposal names a second exit, where no image is returned at all while a hero archetype is selected, but never routes it. It could go to `typographic`, to `classic-background` with no image, or to the hero design prompt with no image. Item 3 in Proposed Solution still says "regenerate once", which contradicts the decision an implementer is supposed to build.
**Fix:** Write the fallback as a table: check fails, image skipped, invalid archetype. For each exit, give the archetype it resolves to and the image it uses. Bring item 3 into line with the decision.
**Status:** upheld

### [WARN] party-architect — The only named test seam is a real-render test; the decision and fallback logic has no stub seam

**Quotes:** > real-render tests of the safe-area check, using **004**'s rasterizing harness (`npm run test:render`).
**Quotes:** > The build makes no real model calls, so nothing can be measured first.
**Quotes:** > The mock suite cannot see this class of bug (`MOCK_PUPPETEER` never rasterizes).
**Problem:** The only test the proposal names is the real-render harness. The branching logic sits outside it: parsing the art-director output, validating against the allow-list, choosing pass or fallback, and selecting the prompt for the resolved archetype. No real model calls are allowed and the mock suite never rasterizes, so this logic needs two seams. One feeds a fixture image in place of the image model; the other feeds a stubbed art-director decision. The artifact names neither. Without them, the fallback branch is exercised only by a real render of a real generated image, and that test would be skipped.
**Fix:** Split the check into a pure function from pixel samples and a safe area to a verdict, which can be unit-tested with synthetic samples, and a Puppeteer sampling step tested by `test:render` on committed fixture images. Name the mock seam that returns a chosen archetype decision and a chosen fixture image, so the mock suite can drive both pass and fallback.
**Status:** upheld
