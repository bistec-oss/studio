### [WARN] party-visionary — Typography and colour-share rules saved as prose become a second copy of the kit's structured fonts and colours

**Quotes:**

> Fonts are edited as plain name fields (`src/components/admin/brandkits/FontEditor.tsx`).

> Propose font pairings and an explicit type scale from the dataset, as suggested rules the author accepts into the kit prompt the same way.

> Closing the recorded navy/teal proportion drift as the first worked example (the author accepts a canvas-share edit on the Hearts Academy kit; this is a data action, not code)

> **Schema:** none. The accepted edits save as a normal `BrandKitPrompt` version. No migration, no new env var.
> **Problem:** After this change, a kit holds its fonts and colours twice. The structured name fields hold them once. The accepted prose rules hold them again, for example "pair Poppins with JetBrains Mono, headline 72px" or "teal-to-green 60% of canvas". The next change that touches these is ordinary kit upkeep. An admin swaps the headline font in FontEditor, or replaces a colour in the palette. Nothing ties the prose to the field, so the kit prompt keeps naming the old font or colour. That prompt is "paid for on every post", so every generation from then on gets two conflicting instructions. Nobody will notice until a render looks wrong, which is the same five-minute-per-defect loop this change exists to end. Typography is also the kind of fact a later change will want as structured data. If the kit ever gains a structured type scale, it would sit beside today's structured font names. Each kit's type scale would then have to be parsed back out of prompt prose and out of every saved version. The proposal presents "no schema change" as a plus and never weighs it against this. My reasoning assumes the structured font and colour fields also reach generation. The proposal implies this but does not say it.
> **Fix:** Write each pairing or colour-share edit so it refers to the structured field by role rather than by literal name or hex, for example "the headline font" or "colour 1". Otherwise state which source wins and accept the sync pair on purpose. Either way, say in the proposal why prose and not structured data is the chosen home for a type scale.
> **Status:** upheld

### [WARN] party-visionary — Dataset values are copied into kit prompt text with no record of where they came from, so a correction to the dataset never reaches the kits that already took the old value

**Quotes:**

> The accepted set becomes a new kit-prompt version through the existing versioned flow

> The suggestions come from the dataset, so the detector and the assistant agree.

> Injecting design-system slices into Path A, Path B, refine or background generation prompts (decided 2026-10-23: kit authoring only; generation prompts do not change in this change, and `PROMPT_VERSION` does not move)
> **Problem:** The dataset is described as curated and tested, but this change ships only copies of it. Each accepted edit freezes a dataset number, such as a type-scale ratio, a contrast minimum or a proportion default, into one kit's free text. Nothing links that text back to the dataset. Take the first change that corrects a dataset entry, say a type-scale ratio found to render poorly at 1080 px. It updates the module and its tests, and every kit that already accepted the old value keeps it, silently and with nothing that can find it. The "detector and assistant agree" property holds only on the day a suggestion is made. The deferred option is the real trap. The out-of-scope line says only "in this change", so data reaching generation is left open for later. If a later change sends `designData` into generation prompts, each prompt would carry the current dataset value beside the kit's frozen copy of an older one. That gives two sources of the same fact, and they disagree in ways no one can read off the kit.
> **Fix:** Stamp each upgrade version with the dataset entry ids (or a `designData` version) it drew on. The versioned save's existing metadata may be enough, and if not, that is the one schema question to raise now. A later dataset correction can then list the kits that copied the old value.
> **Status:** upheld

### [WARN] party-visionary — `designData` becomes one module where some keys change generation output and some do not, and nothing tells the next contributor which is which

**Quotes:**

> 007 adds its own file(s) (for example `typography.ts` and `kitRules.ts`) and keys on `designData`, and does not touch the composition files.

> 009 owns composition (regions, archetypes, the layout contract, the pixel check).
> **Problem:** After merge, `designData` holds two kinds of keys behind one object. 009's composition data drives generation and the pixel check, so editing it changes rendered posts. 007's typography and kit-rule data drives authoring hints only, so editing it changes nothing a post renders. A contributor generalises from the one object they see. Picture the next change to the module, whether 009 Phase 2 or the deferred "typography into generation" step. It will add or edit a key without knowing whether that key needs a stamp or `PROMPT_VERSION` bump and render re-verification. Or it will treat all of `designData` as generation-facing, and the authoring-only lists will start costing render gates on every word-list tweak. Today the boundary lives only in this proposal's prose. Once the proposal is archived, the module is all that is left.
> **Fix:** Mark the boundary in the module itself. One way is a `generation` versus `authoring` split under `designData`. Another is a guard test asserting that no prompt builder imports the authoring keys. Either way, the next key added inherits the right contract.
> **Status:** upheld

### [WARN] party-visionary — Keeping the wholesale "Improve with AI" beside the per-rule upgrade lets one tool silently undo the other on every kit

**Quotes:**

> - Wholesale rewrite of a kit prompt by the assistant (decided 2026-10-23: diff only). The existing "Improve with AI" button stays as it is.

> "Improve with AI" (`src/app/api/admin/brandkits/[id]/prompts/improve/route.ts:28-33`) rewrites the whole active prompt and asks the model to "make it more specific, actionable, and comprehensive". It returns one block of text (:50). The author cannot accept some changes and refuse others, and nothing tells them which words were the problem.
> **Problem:** After merge, a kit prompt can be edited by two AI tools with opposite contracts. The upgrade adds measurable rules one by one, each reviewed. Improve rewrites the whole text with no review. The first time an author runs Improve on an upgraded kit, the model may paraphrase "pill width ~45–60% of canvas" back into "a compact, balanced pill". The author cannot see that loss, because Improve returns one opaque block, which is the exact defect the proposal names. The measurable rules then erode one Improve click at a time. Each loss surfaces only as a render defect, and an older version has to be restored by hand. Every future kit pays this risk for as long as both buttons exist.
> **Fix:** The proposal is one step from the leverage. The detector and the edit-anchor logic already exist, so run Improve's output through them before save, and either show what changed or flag any measurable rule that disappeared. Otherwise state why Improve stays unchanged and which tool's output takes precedence.
> **Status:** upheld

### [NOTE] party-visionary — The diff, anchor and detector machinery is placed in kit-specific files when the named next customer is the campaign briefing

**Quotes:**

> - Campaign briefings: the same adjective problem applies, but briefings are campaign-scoped and follow after kits

> a diff-review panel and a detector hook in `src/components/admin/brandkits/PromptSection.tsx`

> one admin route under `src/app/api/admin/brandkits/[id]/prompts/` (for example `upgrade`)
> **Problem:** The proposal names the next change: adjective detection and measurable upgrades for campaign briefings. Briefings are also versioned free text that reaches generation. The detector is client-safe and data-driven, so that follow-on could be nearly free. That holds only if the detector hook, the exact-quote anchoring, the stale-edit handling and the apply-edits logic take plain text and a save callback. The proposal instead places the panel and hook inside the brand-kit `PromptSection.tsx` and the route under the kit's prompts path. If built that way, the briefing change copies the hook and the anchoring rules into the campaign page. Each later fix to whole-word matching or stale-quote handling would then have to land twice.
> **Fix:** Build the edit-apply and anchor logic, the detector hook and the review panel against plain text plus a save function, with the kit as their first host. That is the same cost now, and the briefing follow-on becomes mostly wiring.
> **Status:** upheld
