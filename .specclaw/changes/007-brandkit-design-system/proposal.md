# Proposal: Brand-kit design system intelligence

**Created:** 2026-09-15
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

**Typography is unguided.** Kits carry font names with no type scale, no pairing rationale and no size relationships, so headline/subline/body hierarchy is re-invented by the model on every generation and drifts between posts in the same campaign.

**The existing brand-kit assistant does not close this gap.** It grounds on uploaded reference documents and samples colours programmatically, which is genuinely useful — but it has no design-system knowledge to apply and no concept of converting an adjective into a measurable rule.

## Proposed Solution

Bring curated design-system knowledge into the product as **data**, and use it to upgrade brand kits into measurable rules.

1. **A curated design-system dataset in the repo** — type scales, font pairings with rationale, palette proportion patterns, spacing scales and contrast minimums. Versioned alongside the code, injected as relevant slices into the brand-kit assistant and design prompts. Deterministic, reviewable, and no new tools in the generation hot path.
2. **A brand-kit upgrade assistant.** Analyses an existing kit and proposes concrete improvements, with the explicit job of **converting adjectives into measurements** — turning "green-forward" into a stated canvas proportion, "similar heights" into a cap-height relationship, "generous spacing" into a percentage of canvas width. Output lands as a new kit prompt version through the existing versioned `BrandKitPrompt` flow, so every upgrade is reviewable and revertible.
3. **Typography guidance** — propose font pairings and an explicit type scale, so hierarchy is specified rather than improvised.
4. **An adjective detector.** Flag vague terms in a kit prompt at authoring time and offer a measurable replacement, moving the feedback from "five minutes and a regeneration later" to "while you are typing".

The alternative of loading real Claude Code skills (`ui-ux-pro-max`, `high-end-visual-design`) into the runner image was considered and **not selected**: it would add heavy context to every call, slow an already ~5-minute pipeline, produce nondeterministic guidance, and widen the CLI `Read` surface the security review flagged. It also would not fix the underlying problem, since a skill that emits more adjectives helps nothing.

## Scope

### In Scope

- Curated design-system dataset (type scales, font pairings, palette proportions, spacing, contrast) committed to the repo
- Brand-kit upgrade assistant that emits **measurable** rules, writing through the existing versioned kit-prompt flow
- Typography pairing and type-scale guidance
- Adjective detection with suggested measurable replacements at authoring time
- Injecting relevant design-system slices into brand-kit and design prompts
- Closing the recorded navy/teal proportion drift as the first worked example

### Out of Scope

- Loading Claude Code skills into the runner image (explicitly rejected above)
- Refine and instruction fidelity — proposal **004**
- Font _coverage_ and tofu glyphs — a rendering bug fixed in **004**; this proposal covers font _choice and pairing_
- Automatic kit changes without review; every upgrade is a proposed version a human activates
- Redesigning the brand-kit admin UI beyond what the upgrade flow needs
- Campaign briefings — the same adjective problem applies, but briefings are campaign-scoped and follow after kits

## Impact

- **Files affected:** ~15–25 (estimated) — new design-system data module, brand-kit assistant extensions, kit prompt authoring UI, prompt builders
- **Complexity:** medium-large
- **Risk:** medium. Changes to design prompts affect every future generation, and a bad design-system slice would degrade output globally rather than for one kit. Mitigated by the fact that kit changes are already versioned with history and activation, so any upgrade is revertible — and by `PROMPT_VERSION` stamping, which ties a rendered draft to the prompt revision that produced it.

## Decisions

- **Dataset provenance — decided 2026-09-15.** The dataset is **authored in-house** from public typographic convention and published standards (WCAG contrast minimums, modular type scales). Deriving it from an installed design skill's data was checked and **rejected on licence grounds**: `ui-ux-pro-max` and `high-end-visual-design` ship **no licence file at all**, and absent a licence there is no grant to copy or redistribute their datasets. No bytes from those packages enter this repository.

## Open Questions

- Should the upgrade assistant **rewrite** a kit prompt wholesale, or propose a diff of individual rules? A diff is far easier to review and matches how the Hearts Academy kit actually evolved (v1→v4, each a targeted correction), but is more work to build.
- How aggressive should adjective detection be? Some adjectives are legitimate brand voice ("warm", "confident") rather than unenforceable design instructions — flagging those would be noise.
- Do design-system slices go into **every** generation prompt, or only into kit authoring? Every-generation raises prompt size on an already 5k+ char path; kit-only keeps the hot path lean but relies on the kit having been upgraded.
- Should there be a "kit quality score" so an admin can see which kits are still adjectival? Useful signal, but invites arguing with a number.
- Does this need to interact with **006**'s generation traces — e.g. correlating kit version against post quality? Powerful, but creates a dependency between two independent proposals.

---

**To proceed:** Review this proposal and approve to begin planning.
