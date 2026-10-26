# Proposal: Brand-kit design system intelligence

**Created:** 2026-09-15
**Refreshed:** 2026-10-23 (after 008, 009 Phase 1, 012, 021 and 024; the user's decisions are recorded below)
**Status:** 🟡 Draft

## Problem

Post quality depends almost entirely on the brand kit, and brand kits are authored as prose by people who are not designers.

The Hearts Academy campaign is the worked example, and it is already documented in CLAUDE.md. Three rounds of design defects each required a full regeneration to discover, and **every one of them was caused by an adjectival instruction that the model was free to interpret**:

| Did not stick (adjective)     | Stuck (measurable)                                                |
| ----------------------------- | ----------------------------------------------------------------- |
| "IRP is fine on-image"        | "the headline MUST contain INDUSTRY READINESS PROGRAMME or IRP"   |
| "similar visual heights"      | "the capitals in 'Hearts Academy' match the capitals in 'BISTEC'" |
| "generous clear space"        | "pill width ~45–60% of canvas, gap ≈ one or two wordmark letters" |
| (no rule at all for the seam) | "transparent→opaque mask across ~10–15% of canvas width"          |

The recorded lesson is that measurements stick and adjectives do not — but nothing in the product helps an author reach a measurement. The kit editor accepts free text, so the default output is adjectives, and the cost of each one is a full ~5-minute regeneration to discover it did not hold.

**There is a live open drift proving the problem is ongoing.** CLAUDE.md records that the latest Hearts Academy render reads navy/blue dominant rather than the kit's stated "teal-to-green gradient is the primary canvas", with the diagnosis: _"Same adjectival weakness as the above — the rule has no proportion attached. Fix by giving it a number."_ That number has never been added, because nothing prompts the author for one.

**Typography is unguided.** Kits carry font names with no type scale, no pairing rationale and no size relationships, so headline/subline/body hierarchy is re-invented by the model on every generation and drifts between posts in the same campaign. Fonts are edited as plain name fields (`src/components/admin/brandkits/FontEditor.tsx`).

**The existing kit tools do not close this gap.**

- The brand-kit assistant (`src/lib/brandkit/assistant.ts`) grounds on uploaded reference documents and samples colours programmatically (`collectBrandKitGrounding` at :103, `sampleImageColors` use at :125-134). It proposes voice, tone, style and fonts in a fenced ` ```brandkit ` block (schema :32-39, parser :56). That is useful, but it holds no design-system knowledge and has no concept of turning an adjective into a measurable rule. Its system prompt (:204-216) asks only for a 60-150 word voice.
- "Improve with AI" (`src/app/api/admin/brandkits/[id]/prompts/improve/route.ts:28-33`) rewrites the whole active prompt and asks the model to "make it more specific, actionable, and comprehensive". It returns one block of text (:50). The author cannot accept some changes and refuse others, and nothing tells them which words were the problem.

**Where the kit text goes.** The active kit prompt reaches every generation as `Brand voice: …` in `buildBrandKitSystemContext` (`src/lib/brandkit/systemContext.ts:15-21`). An adjective saved there is paid for on every post.

## Proposed Solution

Bring curated design-system knowledge into the product as **data**, and use it to upgrade brand kits into measurable rules, in kit authoring only.

1. **A curated design-system dataset in the repo.** Type scales, font pairings with rationale, palette proportion patterns, spacing scales and contrast minimums. It lives in `src/lib/designData/` beside 009's `composition` section: `designData` in `src/lib/designData/index.ts:6` is the one object 007 extends, and its header comment already reserves "typography, kit rules" beside `composition`. 007 adds its own file(s) (for example `typography.ts` and `kitRules.ts`) and keys on `designData`, and does not touch the composition files. The module must stay pure and client-safe, as `composition.ts:8-9` states and a guard test enforces. That keeps the adjective detector able to run in the browser.
2. **A brand-kit upgrade assistant that proposes a rule-by-rule diff.** It reads the active kit prompt and proposes individual edits, each one replacing a vague phrase with a measurable rule. The author accepts or rejects each edit. The accepted set becomes a new kit-prompt version through the existing versioned flow (`POST /api/admin/brandkits/[id]/prompts`, `prompts/route.ts:30-84`, which allocates the next version and activates it in one transaction; `BrandKitPrompt` at `prisma/schema.prisma:700`; restore through `PromptSection.tsx:164`). Every upgrade is reviewable and revertible, and no schema change is needed.
3. **Typography guidance.** Propose font pairings and an explicit type scale from the dataset, as suggested rules the author accepts into the kit prompt the same way.
4. **An adjective detector.** Flag vague design words in a kit prompt at authoring time and offer a measurable replacement, moving the feedback from "five minutes and a regeneration later" to "while you are typing". The suggestions come from the dataset, so the detector and the assistant agree.

**What already exists and 007 reuses:**

- `sampleImageColors` (`src/lib/renderer/puppeteer.ts:272`) to ground a colour-proportion rule in the real reference images. The assistant already calls it. 007 does not add a second sampler.
- The ` ```brandkit ` block convention and `extractBrandKitBlock` (`assistant.ts:53-67`) as the pattern for a fenced, zod-validated reply. The upgrade reply is a new fenced block (an array of edits) in the same style, not a change to the existing block.
- `collectBrandKitGrounding` (`assistant.ts:103`) for reference images and documents, so a proposed number can cite the kit's own references.
- `draftBrandVoice` (`src/lib/brandkit/voiceDraft.ts:27`) and `resolveAssistantModel('ASSISTANT_BRANDKIT', …)` (008; used at `assistant.ts:182`), with `withClaudeAuth` and the `AssistantModelError` 422 mapping (`improve/route.ts:38-45`). The upgrade call uses the same model surface, the same MOCK_AI seam style and the same error path.
- The kit editor's `PromptSection.tsx` (Improve with AI at :109, the editable draft textarea at :176-180) as the place the diff review lands.
- The 021 Graphite atoms in `src/components/ui/`. A guard test fails on a copy of a shared atom outside that folder, so the new review UI uses them.

**What 009 already settled and 007 must respect:** 009 owns composition (regions, archetypes, the layout contract, the pixel check). 007 must not write composition numbers that fight an active image style. A kit rule such as "the image fills the right 40%" is a kit rule when an author writes it. The detector may flag its vague form, but it does not own or validate the archetype data. The ROADMAP boundary stands: "007 owns kit rules and typography; 009 owns composition; 004 owns refine."

The alternative of loading real Claude Code skills (`ui-ux-pro-max`, `high-end-visual-design`) into the runner image was considered and **not selected**: it would add heavy context to every call, slow an already ~5-minute pipeline, produce nondeterministic guidance, and widen the CLI `Read` surface the security review flagged (since closed by 005: every `claude -p` spawn runs with `--tools ""`). It also would not fix the underlying problem, since a skill that emits more adjectives helps nothing.

## Scope

### In Scope

- Curated design-system dataset (type scales, font pairings, palette proportions, spacing, contrast, and the vague-word list with measurable suggestions) in `src/lib/designData/`, as new sections beside 009's `composition`
- Brand-kit upgrade assistant that proposes **individual measurable edits** to the active kit prompt; the author accepts or rejects each; the accepted set is saved as one new version through the existing versioned flow
- Typography pairing and type-scale suggestions, delivered as edits in that same diff
- Adjective detection for **design instructions** (size, spacing, proportion, colour-share and layout words) with a suggested measurable replacement at authoring time
- Closing the recorded navy/teal proportion drift as the first worked example (the author accepts a canvas-share edit on the Hearts Academy kit; this is a data action, not code)
- Unit tests for the dataset, the detector and the edit-apply logic; an E2E case for the diff review and the version it saves (through the MOCK_AI seam, no real model call)

### Out of Scope

- Injecting design-system slices into Path A, Path B, refine or background generation prompts (decided 2026-10-23: kit authoring only; generation prompts do not change in this change, and `PROMPT_VERSION` does not move)
- Wholesale rewrite of a kit prompt by the assistant (decided 2026-10-23: diff only). The existing "Improve with AI" button stays as it is.
- Flagging brand-voice words ("warm", "confident", "friendly"); the detector covers design instructions only
- A kit quality score. Not cheap: it needs a definition of "adjectival" that authors will argue with. The detector's flag count could show later as a by-product, but this change does not build or display one.
- Correlating kit version against post quality through 006's traces. 006 is not built, and the link would couple two proposals. It stays out.
- Loading Claude Code skills into the runner image (explicitly rejected above)
- Layout archetypes, regions and the composition stamp: owned by 009 (shipped); 007 only adds beside them
- Refine and instruction fidelity: owned by **004** (verified)
- Font _coverage_ and tofu glyphs: a rendering bug fixed in **004**; this proposal covers font _choice and pairing_
- Automatic kit changes without review; every upgrade is a proposed version a human activates
- Redesigning the brand-kit admin UI beyond what the upgrade flow needs
- Campaign briefings: the same adjective problem applies, but briefings are campaign-scoped and follow after kits

## Impact

- **Files affected:** ~10–15 (estimated, down from 15–25 because generation prompts are out of scope). New: the `designData` sections and their tests; a kit-upgrade module beside `src/lib/brandkit/assistant.ts`; one admin route under `src/app/api/admin/brandkits/[id]/prompts/` (for example `upgrade`); a diff-review panel and a detector hook in `src/components/admin/brandkits/PromptSection.tsx`; a MOCK_AI reply in `src/lib/testHooks.ts`; E2E and the docs. Edited: `src/lib/designData/index.ts` (add the new keys).
- **Schema:** none. The accepted edits save as a normal `BrandKitPrompt` version. No migration, no new env var.
- **Generation:** unchanged. No prompt builder in `src/lib/agent/prompts/` is touched, so no draft's stamp or output shifts.
- **Complexity:** medium (the largest parts are the dataset content and the diff-review UI)
- **Risk:** low to medium. Nothing reaches generation unless a human accepts an edit into a new, revertible kit version. The remaining risks are a bad dataset suggestion (reviewed per edit, and tested) and a detector that is noisy (mitigated by the design-words-only list and by its output being advisory).

**Size recommendation: bounded.** The data module, the assistant call and the review UI all sit inside the existing kit-authoring surface and reuse its versioned save, so it needs no schema change, no new service and no change to the generation pipeline.

## Decisions (user, 2026-10-23)

- **Upgrade form: a rule-by-rule diff.** The assistant proposes individual edits (an adjectival phrase becomes a measurable rule). Each edit is accepted or rejected. The accepted set is saved as a new kit-prompt version through the existing versioned flow. It is not a wholesale rewrite.
- **Data reach: kit authoring only.** The design-system data is used by the upgrade assistant and the adjective detector only. Path A and Path B generation prompts are **not** changed by this change.
- **Detector: design instructions only.** It flags vague size, spacing, proportion, colour-share and layout words (for example "generous", "similar heights", "dominant"), each with a measurable suggestion. Brand-voice words ("warm", "confident") are left alone.
- **Dataset provenance — decided 2026-09-15, unchanged.** The dataset is **authored in-house** from public typographic convention and published standards (WCAG contrast minimums, modular type scales). Deriving it from an installed design skill's data was checked and **rejected on licence grounds**: `ui-ux-pro-max` and `high-end-visual-design` ship **no licence file at all**, and absent a licence there is no grant to copy or redistribute their datasets. No bytes from those packages enter this repository.

## Decisions (user, 2026-10-23, after the party panel)

These supersede the sections above where they differ.

1. **Scope: the detector and the upgrade assistant.** Ship the dataset, the live adjective detector and the rule-by-rule AI upgrade for size, spacing, proportion and colour share. **Typography (font pairings, a type scale) moves to a follow-up change.**
2. **Go-live: into the editor, then Save.** Accepted edits are written into the kit prompt editor's text. The author reads the full text and clicks the existing Save, which activates the version as today (the shared save route is unchanged). The UI says plainly that Save puts the text live for new posts, and that restoring an older version fixes future posts only.
3. **Fonts and colours by role.** Edits refer to the kit's structured fields by role ("the headline font", "brand colour 1"), never by a literal font name or hex value.
4. **"Improve with AI" flags lost rules.** The button stays, but its rewrite is run through the detector before save, and any measurable rule (a number with a unit) that disappeared is flagged to the author.

## Open Questions

- ~~Should the upgrade assistant rewrite a kit prompt wholesale, or propose a diff?~~ **Resolved 2026-10-23:** a rule-by-rule diff.
- ~~How aggressive should adjective detection be?~~ **Resolved 2026-10-23:** design instructions only; brand-voice words are left alone. What remains is the exact word list (below).
- ~~Do design-system slices go into every generation prompt, or only into kit authoring?~~ **Resolved 2026-10-23:** kit authoring only.
- ~~Should there be a kit quality score?~~ **Resolved (scope call, 2026-10-23):** out of scope; revisit only if the detector's flag count proves useful.
- ~~Does this need to interact with 006's generation traces?~~ **Resolved (scope call, 2026-10-23):** no; it stays out.
- **How is the detector's word list set and kept honest?** The list is data in `designData`, but "generous" is a design word in one sentence and plain prose in another. Does it match whole words only, and is a flag a hint the author can dismiss for good on that kit? Plan should settle this with a fixture of real kit text (the Hearts Academy v1-v4 prompts are the test bed).
- **Does the detector run live in the editor, or on demand?** Live feedback matches the "while you are typing" goal and is possible because `designData` is client-safe. The cost is a debounced scan on every edit of a long prompt. Plan should pick one; live with a debounce is the recommendation.
- **How does a proposed edit anchor to the prompt text?** An edit needs a quote of the phrase it replaces. If the author edits the prompt after the proposal, an edit whose quote no longer matches must drop out or go stale, not apply to the wrong place. Plan should define this (exact-quote match, stale edits shown and disabled).
- **Where does the upgrade assistant get a number it cannot compute?** For example "teal-green is the primary canvas" needs a share. The assistant can sample the kit's reference images (`sampleImageColors`), but with no references it can only offer a dataset default. Should it then ask the author for the value instead of inventing one? The recommendation is yes: propose a labelled default, never a silent number.
- **Should the upgrade call be a new route or a mode of the existing assistant chat?** A separate `prompts/upgrade` route returns the edit list in one call and is easier to test; the chat route (`assistant/chat/route.ts`) is conversational. The recommendation is a separate route.

---

**To proceed:** Review this proposal and approve to begin planning.

### Party panel (2026-10-23, CHANGES_REQUESTED) — upheld findings, see party-report.md

- (party-security, BLOCK) Accepting edits activates them at once through the existing save; "revertible" covers future generations only, not drafts already made. State the flow and the recovery path.
- (party-security) A parse failure, zero edits and partly rejected edits must be three distinct outcomes; never an empty panel after a failed parse.
- (party-security) Code, not the model, attaches each number's provenance (sampled / dataset default / unverified).
- (party-security) An edit's quote must occur exactly once; the save carries the base version and returns 409 if it changed.
- (party-security) Fence grounding documents as untrusted; validate edit size and scope on the server; show removed beside inserted text.
- (party-architect) One component picks anchors (detector vs model); no two suggestions with two accept paths for one phrase.
- (party-architect) Specify the base text (textarea vs active version) and whether accept writes into the textarea or saves directly.
- (party-architect) Specify the edit schema: kind (replace/insert), quote + occurrence rule or anchor, replacement, provenance, overlap order.
- (party-architect) "Dismiss for good" needs storage; close it (session-only) or drop "Schema: none".
- (party-architect) State what the sampler returns for a share, that code computes it, and the test stub.
- (party-architect) Layout/proportion suggestions need a checkable rule against 009's composition (or no placement numbers).
- (party-architect) Generalise the fenced-block extractor into one helper. Rebuttal: an inactive-version save would change a shared route.
- (party-ba) Show that the Hearts defects lived in kit prose, or label the causal claim a hypothesis with a check.
- (party-ba) Add falsifiable acceptance criteria (detector on Hearts v1–v4 fixtures, every edit carries a number/unit, the drift fix as an operator step).
- (party-ba) Define "measurable" (number + unit or reference object; not verified against renders).
- (party-ba) Name the real authors and how uptake would be observed.
- (party-po) Price the detector-only variant against the assistant; ship the detector first or justify the assistant.
- (party-po) State per-upgrade model cost, tier, prompt size and the detector debounce.
- (party-po) Move typography to a follow-up cut; no recorded typography defect.
- (party-po) Name the cut line and the do-nothing price; the navy/teal fix needs no code.
- (party-visionary) Prose rules duplicate structured fonts/colours; refer to fields by role or state which wins.
- (party-visionary) Stamp each upgrade version with the dataset entry ids it drew on.
- (party-visionary) Mark the generation vs authoring boundary inside designData (split or guard test).
- (party-visionary) "Improve with AI" can silently erode measurable rules; run its output through the detector or state precedence.
- (party-visionary) Build the detector, anchor/apply logic and review panel host-agnostic (plain text + save callback) for the briefing follow-on.
