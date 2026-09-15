### [WARN] party-po — Verification pass's recurring cost is unpriced and can multiply refine calls up to 4x

**Quotes:** > A cheap model call checks the rendered result against the instruction. On failure, retry once with the miss made explicit; on a second failure, surface _"couldn't apply this instruction"_ rather than silently committing a revision that ignored the user.
**Problem:** "Cheap" is asserted, not priced. Worst case per refine is now: refine call → verify call (fail) → retry refine call → verify call (fail) → surface failure — up to 4 model spawns where today there is 1, on the hottest shared path (`runDesignAgentCli`, used by all three draft actions). No token/latency/spawn-count budget is stated, and nothing bounds it if verification itself is unreliable (a model checking a model). This is exactly the class of unstated recurring cost the panel exists to catch.
**Fix:** State the expected spawn count and wall-clock added per refine at p50/worst-case, and a hard cap (e.g., no more than one verify+retry cycle regardless of instruction class).
**Status:** upheld

### [WARN] party-po — A cheaper variant (ship the deterministic fix first) is never considered

**Quotes:** > Element-targeted editing. Extend the existing draft inline-edit so the user can click a specific element and edit it directly. Removes prose ambiguity entirely for text, colour and sizing changes — the cases where "reduce the text" should never have needed a model at all.
**Problem:** The proposal's own text argues that item 3 (deterministic, no model call) plus item 4 (one-line Dockerfile font fix) already close two of the four reported failure modes ("reduce the text", the tofu glyph) at near-zero recurring cost. Yet the proposal bundles these with the expensive, unbounded instruction-taxonomy + verification machinery (items 1-2) as one change, with no consideration of shipping the cheap deterministic fixes first and measuring whether the taxonomy/verification spend is still needed for the remaining cases ("include a human character", the double-image background). The omission of this cheaper-first sequencing is itself the finding.
**Fix:** Name the cut: ship element-targeting + font coverage first, observe whether reported failures drop, then decide if the verification pass is still warranted.
**Status:** upheld

### [WARN] party-po — Dead-code resolution has no value tied to the reported failures

**Quotes:** > Resolving the dead API-mode-only brand-conflict protocol (either wire it for CLI mode or remove it)
**Problem:** None of Maleesha's four reported failures, and none of the four confirmed root causes, implicate the brand-conflict protocol. It is included because it was noticed "in the same file" during root-cause work ("the entire path is dead code in prod"), not because it returns any of the value this proposal is chartered to deliver (instruction fidelity). This is scope added because it's tidy to clean up while already in `refine.ts`, at the cost of touching the same high-risk shared path again.
**Fix:** Either cut this to its own zero-risk follow-up (delete dead code, no wiring), or state explicitly what fidelity value wiring it for CLI mode returns.
**Status:** upheld

### [NOTE] party-po — No cut line named despite the proposal's own admission of broad blast radius

**Quotes:** > Risk: medium — touches the refine path that all three draft actions share (`regenerate-design`, `regenerate-copy` and `refine` all route through `runDesignAgentCli`), so a regression is broad.
**Problem:** Six-to-seven items are shipped as one change against a path the proposal itself flags as shared by three actions. Items 3 (element-targeted editing, UI-only) and 4 (Dockerfile font swap) touch that shared path not at all or trivially, while items 1-2 (taxonomy + verification) and 7 (dead-code resolution) are the ones with real blast radius. The proposal never states which pieces could ship independently, so the low-risk wins wait on review/rollout of the high-risk ones.
**Fix:** Name the cut line in Scope: font fix and element-targeted editing ship first (independent PRs, near-zero shared-path risk); taxonomy/verification/dead-code-resolution ship as a second, reviewed separately.
**Status:** upheld
