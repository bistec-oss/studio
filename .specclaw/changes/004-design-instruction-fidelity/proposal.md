# Proposal: Design instruction fidelity

**Created:** 2026-09-15
**Status:** 🟡 Draft

## Problem

**Four refine failures from one tester's session, each with a root cause confirmed in code.** Maleesha, testing with the BISTEC Global and Hearts Academy accounts, reports that bistec-studio is _"useful for creating initial concepts, but it was difficult to get specific edits and instructions followed accurately. Even after several revisions, the final results often differed from what I expected."_

The sample is one tester and four exports, and this proposal does not claim to know the failure rate across the user base — proposal **006** is what would make that measurable rather than anecdotal. What justifies acting now is not the sample size but the root causes: all four failures trace to specific, confirmed defects in code, and each defect would produce the same failure for any user who hit it.

Her documented examples, with the four attached exports as evidence:

| Instruction                            | What happened                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| "include a human character"            | Element not generated at all                                                        |
| "reduce the text"                      | Text unchanged                                                                      |
| "use the uploaded image as background" | Image applied as background **and** kept as a separate inset visual — appears twice |
| "white background with the image"      | Background incorporated the image as a watermark instead of being white             |

Four root causes were confirmed in the code and in the exports:

**1. The refine prompt is structurally additive.** `src/lib/agent/prompts/refine.ts` instructs the model to _"Apply the user's instruction as a targeted edit… Preserve everything the instruction does not touch"_ and _"Change ONLY what the instruction requires; preserve all other structure, layout, and CSS."_ There is no notion of an instruction that **removes** or **replaces**. "Use the uploaded image as the background" is a replacement, and "reduce the text" is a removal — both fight a prompt that says preserve. The duplicate-image export is this instruction working exactly as written.

**2. Nothing verifies the instruction was applied.** The refine route runs one model call and commits the result as a revision. There is no check that the requested change is present in the output. This is the same failure mode as the 2026-08-03 chat-preamble bug, whose recorded lesson is **a prompt rule is not an invariant** — validate by extracting what you need, not by asserting it is in there somewhere.

**3. Font coverage is Sinhala-only.** `Dockerfile:68` installs `font-noto-sinhala` and nothing else. **All four** attached exports render the rating stat as `4.8⍰` — a tofu box where a star glyph should be. One glyph family is directly observed; the wider claim that any uncovered symbol or emoji rasterizes the same way is **inferred from the root cause**, not measured, and the rasterizing harness in Phase 1 is what turns it into something checkable. The 2026-07-28 fix solved one script rather than the class.

**4. The test suite is structurally blind to all of this.** `MOCK_AI` returns clean HTML and `MOCK_PUPPETEER` never rasterizes, so nothing between the model and the pixels is exercised. Every defect above would pass a full green suite — and the preamble bug did.

Two further known defects belong to the same "the output silently isn't what was asked for" family: refine can drop `__INLINE_ASSET_n__` placeholders, silently losing embedded images in that revision (recovery today is a manual version-switch back), and the brand-conflict compliance protocol in `refine.ts` exists **only in API mode** while production runs CLI mode — so that entire path is dead code in prod.

## Proposed Solution

Make the refine path state **what kind of change** is being asked for, **prove** the change landed, and give the user a way to edit without prose ambiguity at all.

1. **Instruction taxonomy.** Classify each instruction as `add` / `replace` / `remove` / `constrain` and give the model explicit semantics for each. Remove the blanket "preserve everything" for replacement and removal instructions — a replacement must name what it supersedes, so "use this as the background" means the prior decorative visual goes.
2. **Post-refine verification pass.** A cheap model call checks the rendered result against the instruction. On failure, retry once with the miss made explicit; on a second failure, surface _"couldn't apply this instruction"_ rather than silently committing a revision that ignored the user.
3. **Element-targeted editing.** Extend the existing draft inline-edit so the user can click a specific element and edit it directly. Removes prose ambiguity entirely for text, colour and sizing changes — the cases where "reduce the text" should never have needed a model at all.
4. **Generalize font coverage.** Install symbol/emoji coverage in the runner image alongside Sinhala, so the renderer stops producing tofu for any glyph the design agent emits.
5. **Inline-asset auto-reinsert.** Detect dropped `__INLINE_ASSET_n__` placeholders and restore them rather than committing a revision with images silently missing.
6. **A rasterizing E2E.** At least one end-to-end case that runs the real render path and asserts on actual pixels/DOM — closing the gap that made every defect above invisible to a green suite.

## Scope

### In Scope

Ordered by reversibility. Each phase is independently shippable and independently revertible; later phases must not start before the phase above them has landed.

**Phase 1 — no residue, deletable in one commit.**

- `Dockerfile` — monochrome symbol font coverage in the runner stage, plus recording the installed font set beside `PROMPT_VERSION`
- The rasterizing E2E **harness**, with a glyph-agnostic tofu/replacement-glyph assertion as its first case
- Inline-asset placeholder **reconciliation** (token set out must equal token set back)

**Phase 2 — a wrapper on one route, removable without residue.**

- `src/lib/agent/prompts/refine.ts` — instruction taxonomy with `add`/`replace`/`remove`/`constrain` semantics, replacing the blanket "preserve everything"
- Post-refine verification in the **refine route only**, above `runDesignAgentCli` — structural where the class permits, model call only where it does not, fail-closed, retry once
- The "not applied" outcome: pointer does not advance, rejected render retained out-of-chain, hard failure surfaced in the UI
- A deterministic test seam that forces a verification miss, distinct from the rasterizing harness

**Phase 3 — durable surface; ships last, after its contract is settled.**

- Element-targeted editing on the draft page, reusing the existing inline-edit writer and revision-commit path, with fresh click-time addressing and the closed input grammar recorded in Decisions

### Out of Scope

- **The dead API-mode-only brand-conflict protocol.** `party-po` found it returns no fidelity value and touches the same high-risk path for tidiness; moved out to its own zero-risk follow-up. `party-architect` noted it shares a prompt builder with the taxonomy work, so the follow-up is sequenced **after** Phase 2 rather than interleaved.
- Brand-kit design quality, font _pairing_ and design-system rules — that is proposal **007**; this change fixes font _coverage_ (a bug), not typographic _taste_
- Provider selection and onboarding — proposal **005**
- Analytics, traces and the admin view — proposal **006**
- Rewriting the generation (first-pass) prompts; this change is scoped to the edit/refine loop
- Any change to Path A template filling

## Impact

- **Files affected:** ~12–18 (estimated) — refine prompt, refine route, draft actions, draft page components, Dockerfile, E2E suite, unit tests
- **Complexity:** medium
- **Risk:** medium — touches the refine path that all three draft actions share (`regenerate-design`, `regenerate-copy` and `refine` all route through `runDesignAgentCli`), so a regression is broad. Mitigated by the new rasterizing E2E and by `PROMPT_VERSION` stamping, which makes a bad prompt revision identifiable per-draft.

## Decisions

All dated 2026-09-15. Items marked **(panel)** were decided in response to a party-panel finding; see `party-report.md`.

- **Verification scope.** The verification pass runs on **every model-driven refine**, across all four instruction classes. Selective verification (only `remove`/`constrain`) was rejected because the reported "include a human character" failure is an `add`, and would have gone unverified.
- **Sequencing — the change ships in three phases, ordered by reversibility, not by unit cost. (panel)** `party-po` argued for shipping the cheap deterministic items first; `party-visionary` rebutted that this ships the _least_ reversible item first, and prevailed. The verification pass is a wrapper a later commit deletes with no residue; element-targeted editing introduces an addressing scheme, a second writer of the revision chain, and a user habit that does not walk back. Phases are in Scope below.
- **Element-targeted editing — direct DOM write, addresses resolved fresh. (panel)** It **reuses the existing inline-edit HTML-writing and revision-commit path**; it does not introduce a second writer. Element addresses are resolved at click time against the current HTML and **nothing is persisted**, so a later refine that rewrites the markup cannot invalidate a stored address. Answers `party-architect`'s arbitration BLOCK and `party-visionary`'s coupling WARN.
- **Element-editing input is validated, not trusted. (panel)** Adopted as a defect fix, not a preference. Text edits are written as **text content, never markup**. Colour and size inputs are parsed into a closed grammar and re-serialized (colour to hex/rgb; size to number + unit from an allowed set); anything else is rejected rather than passed through. **No free-form CSS declarations, and no value containing `url(`.** The write is confined to the single node resolved from the click, never a client-supplied selector. The verification exemption for this path is conditional on these constraints holding — it applies only because the path is deterministic _and_ closed.
- **Failed verification — pointer stays, artifact retained. (panel)** After a second failure the revision pointer **does not advance** (the chain stays byte-identical to today, so the decision is fully reversible), and the rejected render is **retained out-of-chain**, labelled with the instruction, its class, and the verifier's stated miss. The outcome is a **hard failure surfaced in the UI**, not a soft warning on a committed revision. This is where `party-security` and `party-visionary` converged from opposite directions.
- **Instruction class is transient. (panel)** Computed, used for prompt assembly, then discarded. It is **not** recorded on the revision, so a later change can replace or collapse the taxonomy freely. `party-visionary`'s point stands: the one-way door is persistence, not the class names, and single-label classification is the thing most likely to break first on multi-clause instructions.
- **Verification is defined over the delta, and is undefined without a prior. (panel)** Stated explicitly so the pattern is not copied into first-pass generation, where there is no prior revision and "did it land" degrades into "is this good" — a question that belongs to proposal **007**.
- **Verification sits in the refine route, above `runDesignAgentCli`. (panel, author's call — override if wrong.)** The shared runner is **not** wrapped, so `regenerate-design` and `regenerate-copy` are unchanged by this proposal and acquire no verification step and no new failure outcome. This follows necessarily from the delta rule above: neither of those actions has an instruction to verify against. Answers `party-architect`'s placement BLOCK.
- **Verification fails closed. (panel)** An unreachable, timed-out, empty or unparseable verifier response is a **miss**, taking the same path as an explicit miss — never a silent commit. The failure is correlated (verifier and refine share a model and credential path), so failing open would remove the gate exactly when it is needed.
- **The verifier reads extracted structural facts, not the raw document. (panel)** Where the instruction class admits a deterministic post-condition (`remove`/`constrain`: text length decreased, named element absent; `replace`: computed background is the named image and the superseded node is gone), verify **structurally** and spend no model call. Where raw content must reach the verifier it is delimited and declared to be data, never a claim about whether the edit succeeded. The verdict must be machine-readable; anything unparseable is a miss.
- **Ambiguous classification defaults to the preserving classes. (panel)** `add`/`constrain` win when confidence is low or the instruction has more than one clause. The destructive path is conditional on the model returning an explicit, non-empty identification of the superseded element — **no name, no removal licence** — and the caller checks that field rather than trusting the prompt to have required it.
- **Placeholder handling is reconciliation, not detection. (panel)** The set of `__INLINE_ASSET_n__` tokens sent out and the set returned must match exactly, same tokens and same multiplicity. A clean absence is restored; any other mismatch (renamed, duplicated, reindexed) is treated as not applied and takes the failed-verification path.
- **Font: narrowest coverage that fixes the defect. (panel)** Monochrome symbol coverage for stat glyphs like ★, not a full colour emoji set, which would change the appearance of every emoji the agent emits far beyond the reported bug. The installed font set is recorded alongside the existing per-draft `PROMPT_VERSION` stamp so a render's glyph environment is attributable. Noted as a consequence: an OS-wide install is global rendering policy with **no per-kit override**.
- **Classification is emitted by the refine call itself. (panel — resolves the blocking question.)** The refine model returns `{ classes[], supersedes[], html }` in one response. No extra spawn, and classifier and editor **cannot disagree, because they are the same call**. A multi-clause instruction returns multiple classes and every one of them must be satisfied. The caller checks that `supersedes` is non-empty before permitting any destructive class — enforced in code, not trusted to the prompt, which is precisely what `party-security` asked for.
- **Cost ceiling: verify plus at most one retry, hard-capped regardless of class. (panel)** Worst case is 4 model calls against today's 1. Realistic p50 is 1–2, because `remove`/`constrain`/`replace` are checked structurally with no model call at all. `party-po` was right that "cheap" was asserted rather than priced; the cap is the price.
- **One source, two consumers. (panel)** A single per-class table generates **both** the refine prompt's instruction-semantics block and the verifier's acceptance criterion. They cannot drift because there is one definition. This closes `party-visionary`'s silent-false-negative mode — a loosened refine prompt with an unchanged verifier producing "couldn't apply" on refines that in fact worked.
- **Problem statement scoped to its evidence. (panel)** `party-ba`'s objection accepted: the claim is now four traced failures from one session, not a measured systemic failure, and the font generalization is labelled as inferred from the root cause. The root causes carry the argument; the larger claim was unnecessary and would have been the first thing a skeptical reviewer attacked.
- **The rasterizing E2E is a reusable harness, not one case. (panel)** Its named first assertion is a glyph-agnostic **tofu/replacement-glyph check** against the real runner image — one check that would have caught both the 2026-07-28 Sinhala bug and today's `4.8⍰`. It is also where the verification-miss seam and the font-set assertion live.

## Open Questions

**No blocking questions remain.** Every question the panel raised is resolved in **Decisions** above. Three items are deferred to `spec.md` as authoring work rather than decisions:

- **The poll-response field for the "not applied" outcome.** Semantics are decided (pointer does not advance, artifact retained out-of-chain, hard failure in the UI); the wire contract between the draft route and the polling client is named at planning time. `party-architect` is right that both halves of one merge must agree on it.
- **A worked example for `constrain`.** `party-ba`: the other three classes each have one from the evidence set. Written into `spec.md` alongside the per-class table that now generates both the refine semantics and the verifier criterion.
- **Acceptance criteria per solution item.** `party-ba` notes the proposal has none, so the central claim has no stated observation that would falsify it. These are `spec.md`'s job — e.g. "given a `remove` instruction, the output must not contain the removed element, checked structurally."

### Party panel findings (2026-09-15 — verdict CHANGES_REQUESTED)

Panel: deep tier, 5 seats, 2 rounds. 34 findings, **all upheld, none withdrawn** — 7 BLOCK, 19 WARN, 8 NOTE. Full text in [`party-report.md`](party-report.md).

- (**party-architect**) [BLOCK] Element-targeted editing builds a second editing path into the same artifact the refine path writes, with no stated arbitration — see party-report.md
- (**party-architect**) [BLOCK] The verification pass is placed on the refine path only, while the artifact states all three draft actions share the mechanism it is meant to guard — see party-report.md
- (**party-architect**) [BLOCK] The "not applied" outcome is a new terminal state on an async action contract the proposal never names as a co-change — see party-report.md
- (**party-architect**) [WARN] The instruction taxonomy is a new grammar with four classes and no stated production or consumption contract — see party-report.md
- (**party-architect**) [WARN] The verification pass has no named deterministic test seam, while the artifact's own diagnosis is that the existing seams hide this class of bug — see party-report.md
- (**party-architect**) [NOTE] Font coverage is placed in the image while the proposal's own precedent shows the choice is a rendering-policy decision, not a package install — see party-report.md
- (**party-architect**) [WARN] Rebuttal to party-po: element-targeted editing is not "UI-only", and the artifact's own open question makes it a model-path change — see party-report.md
- (**party-architect**) [NOTE] Rebuttal to party-po: the dead brand-conflict protocol sits in the same prompt builder the taxonomy rewrites — see party-report.md
- (**party-ba**) [WARN] Core claim ("core promise failing") is generalized from a single tester's four examples with no frequency or breadth evidence — see party-report.md
- (**party-ba**) [WARN] No falsifiable acceptance criteria for the proposal's main claim; the definition of "applied" and "success" is left to open questions — see party-report.md
- (**party-ba**) [WARN] Element-targeted editing assumes users will switch away from prose instructions, which the proposal never establishes — see party-report.md
- (**party-ba**) [NOTE] Font-coverage claim generalizes from one observed glyph class to "any non-Latin symbol or emoji" — see party-report.md
- (**party-ba**) [NOTE] Taxonomy term "constrain" is introduced with no definition or example, unlike add/replace/remove — see party-report.md
- (**party-ba**) [NOTE] The brand-conflict-protocol root cause is asserted as "confirmed" without the file/line citation given to the other three root causes — see party-report.md
- (**party-po**) [WARN] Verification pass's recurring cost is unpriced and can multiply refine calls up to 4x — see party-report.md
- (**party-po**) [WARN] A cheaper variant (ship the deterministic fix first) is never considered — see party-report.md
- (**party-po**) [WARN] Dead-code resolution has no value tied to the reported failures — see party-report.md
- (**party-po**) [NOTE] No cut line named despite the proposal's own admission of broad blast radius — see party-report.md
- (**party-security**) [BLOCK] The verification pass judges model output using model output, and its verdict is the commit decision — see party-report.md
- (**party-security**) [BLOCK] The verifier's own failure has no named outcome, and the candidate default on the page is the permissive one — see party-report.md
- (**party-security**) [BLOCK] Element-targeted editing writes raw user input into a document a headless browser parses and executes, and is the one path exempt from all verification — see party-report.md
- (**party-security**) [WARN] Classification of the instruction is a control-flow decision derived from user prose, with no stated default when it is ambiguous — see party-report.md
- (**party-security**) [WARN] Both branches of the failed-verification question destroy something with no stated recovery — see party-report.md
- (**party-security**) [WARN] Placeholder recovery is detection-based, so it fails open on the mutation it cannot detect — see party-report.md
- (**party-security**) [NOTE] A font change alters every future render with nothing recording which font set produced a given export — see party-report.md
- (**party-security**) [WARN] Rebuttal of party-po: item 3 is not the low-risk half of the cut line, it is the most permissive sink in the change — see party-report.md
- (**party-security**) [WARN] Rebuttal of party-visionary: "discard + hard failure" is reversible for the revision chain but irreversible for the evidence — see party-report.md
- (**party-visionary**) [BLOCK] The instruction taxonomy becomes a persisted classification vocabulary that a later change cannot rename or collapse — see party-report.md
- (**party-visionary**) [WARN] The verification pass becomes a second, undeclared specification of what refine means, kept in sync with the refine prompt by hand forever — see party-report.md
- (**party-visionary**) [WARN] "Couldn't apply this instruction" is the change's most durable commitment and the proposal leaves its permanence to an open question — see party-report.md
- (**party-visionary**) [WARN] Verify-then-retry on every refine sets the precedent that will be copied into generation, where it costs three times as much and is wrong — see party-report.md
- (**party-visionary**) [WARN] Element-targeted editing quietly makes the DOM of generated HTML a stable surface, with no stated contract — see party-report.md
- (**party-visionary**) [NOTE] The rasterizing E2E is the compounding asset here and the proposal asks it to prove only this change — see party-report.md
- (**party-visionary**) [WARN] Rebuttal of party-po's "ship the deterministic fix first": that cut ships the least reversible item first and defers the most reversible one — see party-report.md

---

**To proceed:** Review this proposal and approve to begin planning.
