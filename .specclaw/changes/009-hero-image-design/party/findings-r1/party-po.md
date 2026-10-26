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
