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

### [WARN] party-visionary — 009 founds the design-data module that 007 is supposed to own, so it sets the module's shape without designing for typography

**Quotes:**

> - **007** is soft: archetypes can land first, but should live in the same design-system data module 007 introduces, not a parallel one.
> - **Size: architectural.** The change adds a new design-data module, schema for the brief's archetype and the kit's allow-list, and prompt changes.
>   **Problem:** The dependency note says the module belongs to 007, but the decisions say 009 creates it. If 009 lands first, its conventions fix the module's shape before 007's typography dataset has any say.
>   **Fix:** Say that 009 is the founding change, and define a generic entry shape with 007 named as the second consumer.
>   **Status:** withdrawn — party-architect's "Nobody owns the design-data module" quotes the same two lines and makes the same fix: name the path and top-level shape, with a `composition` section that 007's sections sit beside. My long-horizon framing adds nothing the planner would build differently.

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

### [NOTE] party-visionary — The safe-area sampler checks the image before layout; the same check on the final render would be the actual invariant, and it is reusable

**Quotes:**

> 3. **Verify the contract, don't assume it.** After the image returns, sample luminance and variance inside the text safe area (the existing `sampleImageColors` machinery in `renderer/puppeteer.ts`).
> **Problem:** The original claim was that a generic pixel-region check, run on the final PNG, would also verify that the text landed in the safe area.
> **Fix:** A generic `checkRegions(png, regions[], thresholds)`.
> **Status:** withdrawn — party-security's "The check reads the image and never where the text actually landed" shows that the post-render half is a DOM-geometry check: read the text and logo bounding rects from the page Puppeteer already holds. My pixel version rests on a misreading. On the final render the text itself sits inside the text region, so luminance and variance would fail by design. Without that, the reuse argument does not follow.

### [WARN] party-visionary — Rebuttal of party-po's prompt-only variant: cheap to build, but it leaves layout as prose in the prompt builders, the pattern this proposal names as the cause

**Quotes:**

> `classic-background` stays the default until the archetypes are proven.
> That is the adjective problem **007** documents, applied to layout instead of kit rules.
> **Problem:** party-po's first cut adds `product-showcase` and `editorial-split` as prompt-only text in the existing builders, with no schema, then checks a few posts by eye. I agree with the sequencing. As written, though, the variant leaves the next change with two costs. First, the layout rules live as prose inside the background and Path B builders, which is the adjective problem the proposal sets out to undo. The second cut must then lift them out and keep both copies in step while it does. Second, drafts made during the prompt-only period carry no record of which archetype they used. A check by eye leaves nothing behind, so the "proven" decision still has no data when the second cut arrives.
> **Fix:** If the prompt-only cut ships first, still define the two archetypes as keyed data that the builders read, and stamp the key on the draft. That is a few lines more than pure prompt text, and it lets the second cut extend the first instead of replacing it.
> **Status:** upheld
