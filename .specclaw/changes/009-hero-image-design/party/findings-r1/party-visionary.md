### [WARN] party-visionary — The layout decision is used once and thrown away, so every later edit of the draft works blind to it

**Quotes:**

> The design prompt receives **the same** archetype and safe area, so text lands where the image is empty by construction, not by scrim.
> The real kit logo and exact copy are layered by the design step, which preserves correct spelling, logo fidelity, inline edit (PR #36), refine and version history.
> **Problem:** The proposal says the archetype and safe area are shared by the image prompt and the design prompt during generation. It never says they are stored on the draft or its revisions. The edits that come after generation are refine, regenerate-design, inline edit and restore to an earlier version. A refine such as "make the headline bigger" or "move the CTA up" has no record of which part of the hero image must stay clear, so it can push text onto the subject. That is the scrim problem coming back one edit later. Refine instruction fidelity (004) is listed out of scope, so nobody is assigned to that change. The claim that hero mode "preserves ... refine" is true only of the HTML mechanism, not of the layout contract. The first refine-related change after this one must add the persistence itself, and by then drafts made before it have no recorded contract.
> **Fix:** Store the resolved decision `{ archetype, role, safeArea, contract version }` on the draft and on each revision, beside the `PROMPT_VERSION` stamp. Say that refine and regenerate read it. Doing this now costs one column; adding it later leaves every draft made before then without a record.
> **Status:** upheld

### [WARN] party-visionary — "Until proven" is the gate for the default flip and for Phase 2, and nothing records the evidence

**Quotes:**

> - **This change is Phase 1 only.** Phases 2 and 3 become their own changes later, proposed when Phase 1 is proven.
>   **Phase 1:** archetypes, the layout contract, safe-area verification, quality. `classic-background` stays the default until the archetypes are proven.
> - **On a failed safe-area check, fall back directly** to `classic-background`, with no regenerate.
>   Add a per-team quality setting whose default is today's behaviour, and teams opt into `high` after it is measured on prod.
>   **Problem:** Three later decisions depend on prod evidence: flipping the default away from `classic-background`, proposing Phase 2, and opting teams into `high` quality. The proposal names no instrument for any of them. A direct fallback that leaves no record makes a failed hero look exactly like a draft that asked for `classic-background`. Nobody can then answer "how often does `product-showcase` fail its safe area?", and nobody can get latency or cost per quality tier. So the change that would flip the default has no data. The change that proposes Phase 2 would have to add the instrument first, then wait for data to build up.
>   **Fix:** Stamp the requested archetype, the delivered archetype, the fallback reason (the sampled luminance and variance against the threshold), the image quality used and the image-step duration on the draft. Name these stamps as the evidence that "proven" refers to.
>   **Status:** upheld

### [WARN] party-visionary — Archetype keys become persisted references with no rule for retiring or revising them, which breaks the "independently revertible" claim

**Quotes:**

> A small, versioned set of composition archetypes.
>
> - **Size: architectural.** The change adds a new design-data module, schema for the brief's archetype and the kit's allow-list, and prompt changes.
>   **Phasing (each phase independently revertible):**
>   **Problem:** After merge, each brief row and each admin-curated kit allow-list stores an archetype key. Scheduled queue entries that run weeks later would hold one too, if they carry the brief choice. The proposal calls the set "versioned" but does not say what a version governs. Take the next plausible change: tightening `product-showcase` from ~55% to ~60%, or retiring `hero-centre`. Under a revised contract with the same key, a regenerated old draft silently gets a different layout. A retired key leaves stored briefs and kit allow-lists pointing at nothing, with no stated substitution rule. Once Phase 2 builds on `product-showcase`, Phase 1 can no longer be reverted on its own. Reverting it also drops columns that hold admins' allow-list choices, so "independently revertible" stops being true the day an admin saves a kit.
>   **Fix:** State the lifecycle in the artifact. Say whether keys are stored as strings or as a DB enum. Say how a stored key that has been retired or is no longer allowed resolves (substitute it, and record that). Say whether a contract revision mints a new key or a new version that drafts stamp. Narrow the revertibility claim to "revertible before an admin configures a kit".
>   **Status:** upheld

### [WARN] party-visionary — Layout now has two sources of truth: the archetype contract and the kit and briefing prose that already state layout rules

**Quotes:**

> | `editorial-split` | image confined to its own ~40% band; soft-masked edge (the proven IRP rule) |
>
> - Converting kit prose into measurable rules and the typography dataset — proposal **007** (this proposal adds a **composition** section alongside it)
>   **Problem:** `editorial-split` copies a rule that already lives as prose in a campaign briefing (the "IRP rule"). Kit voice prompts also carry layout instructions, which is the adjective problem the proposal cites from 007. After this change, a post under that campaign with `editorial-split` gets the same rule twice: once from the dataset and once from the briefing, with no stated precedence. The next edit to either copy, for example a 35% band in the briefing, sends the design model conflicting numbers. The drift shows up only as an occasional bad render and gets reported as a model-quality problem. A kit whose prose says "full-bleed photography" combined with a `typographic` archetype is the same conflict on the first day.
>   **Fix:** State which wins when the archetype contract and the kit or briefing prose disagree. Note that layout rules already in briefings and kits should move to the archetype, and are superseded by it, when a kit opts in.
>   **Status:** upheld

### [WARN] party-visionary — 009 founds the design-data module that 007 is supposed to own, so it sets the module's shape without designing for typography

**Quotes:**

> - **007** is soft: archetypes can land first, but should live in the same design-system data module 007 introduces, not a parallel one.
> - **Size: architectural.** The change adds a new design-data module, schema for the brief's archetype and the kit's allow-list, and prompt changes.
>   **Problem:** The dependency note says the module is 007's. The decisions say 009 creates it. Because the user chose to build 009 first, the module's conventions will be fixed for one composition dataset: how entries are keyed and versioned, the "kit allow-list + kit default + brief override" mechanism, and how prompts render an entry. When 007 lands its typography dataset and measurable kit rules, it either bends to a shape built for archetypes or starts a second module beside it, which is the outcome the dependency note forbids. Neither proposal is assigned to decide the module's generic contract.
>   **Fix:** Say in 009 that it is the module's founding change, and define the generic entry, version and kit-binding shape with 007's typography dataset named as its second consumer. Otherwise, make 007's module skeleton a prerequisite.
>   **Status:** upheld

### [WARN] party-visionary — The decision schema allows one `safeArea`, but the starting set already needs two regions and Phase 2 needs a third kind

**Quotes:**

> 2. **The art-director step returns a layout, not just a prompt.** The decision gains `{ archetype, role: 'hero' | 'background', safeArea }`.
> | `hero-centre` | subject centred in middle ~50% height; top ~20% and bottom ~25% kept clear |
>
> - For product screenshots on device screens: should the image model receive the screenshot as a reference (it may redraw it inaccurately), or should the design step composite the **real** screenshot into a device frame the image model leaves blank? The second is exact but needs a screen-region contract.
>   **Problem:** `hero-centre` keeps two separate regions clear. Open question 5's exact option, the one Phase 2 will most likely pick, adds a region with a different purpose: blank for compositing rather than dark for text. With a single `safeArea`, the verifier, both prompt builders and any persisted stamp all have to be widened by Phase 2. Phase 2 then also has to migrate every stamped decision written under the old single-region shape.
>   **Fix:** Define the decision as a list of typed regions, `{ rect, purpose: 'text' | 'clear' | 'composite' }`, now. The verifier then loops over the list, and Phase 2 adds a purpose without changing the schema.
>   **Status:** upheld

### [WARN] party-visionary — The archetype contracts are percentages with no post size, so every future size change must re-audit every archetype

**Quotes:**

> | `product-showcase` | device/subject in right ~55%; left ~45% empty and dark for text |
> Each one states in measurable terms where the text sits, where the image subject sits, and what must stay empty.
> **Problem:** The proposal never mentions post size. This finding relies on context outside the artifact: the app renders several sizes (square, 4:5, 9:16). A left-45% text column suits a square post. On a 9:16 story it is a tall thin strip that a headline cannot fill, and the subject is squeezed into a narrow band. With one contract per archetype, a change that adds a size (a LinkedIn landscape, say) or edits an archetype must check every pair by hand. Nothing in the dataset fails when a pair is wrong. The failure shows up as safe-area fallbacks clustered on one size, and only if the fallback is stamped.
> **Fix:** Key each contract by size, or let an archetype declare the sizes it supports so the resolver can exclude it elsewhere. Either way, adding a size then fails loudly where a contract is missing.
> **Status:** upheld

### [WARN] party-visionary — The per-team `quality` setting stores one provider's parameter in a provider-neutral place

**Quotes:**

> 6. **`quality: 'high'` for hero images**, configurable per team, with the latency and cost measured before it becomes the default.
>
> - a per-team `quality` setting for hero images, defaulting to today's behaviour;
>   **Problem:** `quality` with a value of `high` is the OpenAI image API's vocabulary. It is set on the team, not on the IMAGE provider row that the abstraction resolves. The proposal itself points to the next image provider (Gemini, via 005). When that provider lands, its change must either translate OpenAI's tiers into its own parameters or ignore the team setting without saying so. A team that set `high` then gets default quality from the new provider with no signal. This also teaches that provider parameters go on the team, and later per-provider knobs (style, background transparency, from open question 1) will copy that.
>   **Fix:** Put the setting on the IMAGE provider row, or define it as a neutral tier that each `ImageProvider` implementation maps. State which approach the artifact takes.
>   **Status:** upheld

### [NOTE] party-visionary — The safe-area sampler checks the image before layout; the same check on the final render would be the actual invariant, and it is reusable

**Quotes:**

> 3. **Verify the contract, don't assume it.** After the image returns, sample luminance and variance inside the text safe area (the existing `sampleImageColors` machinery in `renderer/puppeteer.ts`).
> **Problem:** The check proves that the image left a region empty. It does not prove that the design step put the text inside that region, which is the other half of the contract. Run on the rasterized final PNG, a data-driven region check would cover both halves. That generic form, "regions from the dataset, metrics, thresholds", is also what 007's measurable kit rules and Phase 2's screen region will need. Built as a one-purpose pre-design gate, it will be rebuilt by each of them.
> **Fix:** Build the verifier as a generic `checkRegions(png, regions[], thresholds)` over any rasterized image. Call it here on the hero image, and leave it ready for a post-render pass.
> **Status:** upheld
