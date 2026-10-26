### [WARN] party-visionary — Typography and colour-share rules saved as prose become a second copy of the kit's structured fonts and colours

**Quotes:**

> Fonts are edited as plain name fields (`src/components/admin/brandkits/FontEditor.tsx`).

> Propose font pairings and an explicit type scale from the dataset, as suggested rules the author accepts into the kit prompt the same way.

> Closing the recorded navy/teal proportion drift as the first worked example (the author accepts a canvas-share edit on the Hearts Academy kit; this is a data action, not code)

> **Schema:** none. The accepted edits save as a normal `BrandKitPrompt` version. No migration, no new env var.
> **Problem:** After this change, a kit holds its fonts and colours twice. The structured name fields hold them once, and the accepted prose rules hold them again, for example "pair Poppins with JetBrains Mono, headline 72px" or "teal-to-green 60% of canvas". The next change to touch these is ordinary kit upkeep: an admin swaps the headline font in FontEditor or replaces a palette colour. Nothing ties the prose to the field, so the kit prompt keeps naming the old font or colour. That prompt is "paid for on every post", so every later generation gets two instructions that conflict. Nobody notices until a render looks wrong, which is the five-minutes-per-defect loop this change exists to end. A type scale is also a fact a later change will want as structured data. If the kit gains a structured type scale beside today's structured font names, each kit's scale must first be parsed out of prompt prose and out of every saved version. The proposal presents "no schema change" as a plus and never weighs it against this cost. No round-1 finding from another seat addresses this pair. party-po's suggestion to defer typography would shrink it but not remove it, because the canvas-share edit still duplicates the palette.
> **Fix:** Write each pairing or colour-share edit so it names the structured field by role, not by literal font name or hex ("the headline font", "colour 1"). Otherwise, state which source wins and accept the sync pair on purpose. Either way, say in the proposal why prose, not structured data, is the chosen home for a type scale.
> **Status:** upheld

### [WARN] party-visionary — Dataset values are copied into kit prompt text with no record of where they came from, so a correction to the dataset never reaches the kits that already took the old value

**Quotes:**

> The accepted set becomes a new kit-prompt version through the existing versioned flow

> The suggestions come from the dataset, so the detector and the assistant agree.

> Injecting design-system slices into Path A, Path B, refine or background generation prompts (decided 2026-10-23: kit authoring only; generation prompts do not change in this change, and `PROMPT_VERSION` does not move)
> **Problem:** The dataset is curated and tested, but this change ships only copies of it. Each accepted edit freezes a dataset number (a type-scale ratio, a contrast minimum, a proportion default) into one kit's free text, and nothing links that text back to the dataset. Take the first change that corrects a dataset entry, say a type-scale ratio found to render poorly at 1080 px. It updates the module and its tests. Every kit that already accepted the old value keeps it, silently, and nothing can find those kits. "The detector and the assistant agree" holds only on the day a suggestion is made. The deferred option is the real trap. The out-of-scope line says only "in this change", so sending data into generation is left open for later. If a later change sends `designData` into generation prompts, each prompt carries the current dataset value beside the kit's frozen copy of an older one. That is two sources for one fact, and their disagreement cannot be read off the kit. In round 1, party-security asked for code-attached provenance, so that a "dataset default" number is checked against a `designData` key on the server. That fix computes the very entry id this stamp needs, so persisting it now costs almost nothing.
> **Fix:** Stamp each upgrade version with the dataset entry ids (or a `designData` version) it drew on. If the versioned save's existing metadata cannot hold this, that is the one schema question to raise now. A later dataset correction can then list the kits that copied the old value.
> **Status:** upheld

### [WARN] party-visionary — `designData` becomes one module where some keys change generation output and some do not, and nothing tells the next contributor which is which

**Quotes:**

> 007 adds its own file(s) (for example `typography.ts` and `kitRules.ts`) and keys on `designData`, and does not touch the composition files.

> 009 owns composition (regions, archetypes, the layout contract, the pixel check).
> **Problem:** After merge, `designData` holds two kinds of keys behind one object. 009's composition data drives generation and the pixel check, so editing it changes rendered posts. 007's typography and kit-rule data drives authoring hints only, so editing it changes nothing a post renders. A contributor generalises from the one object they see. The next change to the module, whether 009 Phase 2 or the deferred "typography into generation" step, then goes one of two ways. It adds or edits a key without knowing whether it needs a stamp, a `PROMPT_VERSION` bump and render re-verification. Or it treats all of `designData` as generation-facing, and every word-list tweak starts paying for render gates. party-architect's round-1 composition-boundary finding is the merge-day form of this problem. Mine is what remains once this proposal is archived and only the module is left to explain the boundary.
> **Fix:** Mark the boundary in the module itself. Either split `designData` into `generation` and `authoring` keys, or add a guard test asserting that no prompt builder imports the authoring keys. Then the next key added inherits the right contract.
> **Status:** upheld

### [WARN] party-visionary — Keeping the wholesale "Improve with AI" beside the per-rule upgrade lets one tool silently undo the other on every kit

**Quotes:**

> - Wholesale rewrite of a kit prompt by the assistant (decided 2026-10-23: diff only). The existing "Improve with AI" button stays as it is.

> "Improve with AI" (`src/app/api/admin/brandkits/[id]/prompts/improve/route.ts:28-33`) rewrites the whole active prompt and asks the model to "make it more specific, actionable, and comprehensive". It returns one block of text (:50). The author cannot accept some changes and refuse others, and nothing tells them which words were the problem.
> **Problem:** After merge, two AI tools with opposite contracts can edit a kit prompt. The upgrade adds measurable rules one at a time, each one reviewed. Improve rewrites the whole text with no review. The first time an author runs Improve on an upgraded kit, the model may paraphrase "pill width ~45–60% of canvas" back into "a compact, balanced pill". The author cannot see that loss, because Improve returns one opaque block, which is the defect the proposal itself names. The measurable rules then erode one Improve click at a time. Each loss surfaces only as a render defect, and the fix is restoring an older version by hand. Every future kit carries this risk for as long as both buttons exist. party-architect's round-1 base-text finding covers how the two tools collide in the textarea on merge day. This finding is about the slow loss across many saves, which that fix alone does not prevent.
> **Fix:** The proposal is one step from this leverage. The detector and the edit-anchor logic will already exist, so run Improve's output through them before save, and either show what changed or flag any measurable rule that disappeared. Otherwise, state why Improve stays unchanged and which tool's output takes precedence.
> **Status:** upheld

### [NOTE] party-visionary — The diff, anchor and detector machinery is placed in kit-specific files when the named next customer is the campaign briefing

**Quotes:**

> - Campaign briefings: the same adjective problem applies, but briefings are campaign-scoped and follow after kits

> a diff-review panel and a detector hook in `src/components/admin/brandkits/PromptSection.tsx`

> one admin route under `src/app/api/admin/brandkits/[id]/prompts/` (for example `upgrade`)
> **Problem:** The proposal names its own next change: adjective detection and measurable upgrades for campaign briefings, which are also versioned free text that reaches generation. The detector is client-safe and data-driven, so that follow-on could be nearly free. That holds only if the detector hook, exact-quote anchoring, stale-edit handling and edit-apply logic take plain text and a save callback. The proposal instead places the panel and the hook inside the brand-kit `PromptSection.tsx`, and the route under the kit's prompts path. Built that way, the briefing change copies the hook and the anchoring rules into the campaign page. Every later fix to whole-word matching or stale-quote handling, including the uniqueness and 409 rules party-security asked for in round 1, then has to land twice. party-architect's round-1 NOTE on generalising the fenced-block extractor is the same lesson at the parser layer.
> **Fix:** Build the edit-apply and anchor logic, the detector hook and the review panel against plain text plus a save function, with the kit as the first host. The cost now is the same, and the briefing follow-on becomes mostly wiring.
> **Status:** upheld
