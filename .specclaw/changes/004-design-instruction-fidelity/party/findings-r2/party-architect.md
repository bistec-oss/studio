### [BLOCK] party-architect — Element-targeted editing builds a second editing path into the same artifact the refine path writes, with no stated arbitration

**Quotes:** > 3. **Element-targeted editing.** Extend the existing draft inline-edit so the user can click a specific element and edit it directly. Removes prose ambiguity entirely for text, colour and sizing changes — the cases where "reduce the text" should never have needed a model at all.
**Quotes:** > Element-targeted editing: does it edit the **HTML directly** (deterministic, no model, but limited to what the DOM exposes) or send a scoped instruction to the model with the element as context (more capable, reintroduces some ambiguity)?
**Problem:** The artifact names an existing mechanism ("the existing draft inline-edit") and then leaves open whether the new surface is that mechanism or a second one — a direct-DOM writer versus a second model-driven writer of the same `htmlContent`/revision chain the refine path already writes. Those are two different designs with two different revision-commit paths, and the choice is deferred to an open question rather than settled. Until it is settled, an implementer can produce either a genuine extension of one writer or a parallel second writer of the draft HTML, and the second diverges from refine on the first change to how revisions are appended.
**Fix:** State in the artifact whether element-targeted editing reuses the existing inline-edit's HTML-writing and revision-commit path, or introduces a new one; if new, name what the existing one cannot do.
**Status:** upheld

### [BLOCK] party-architect — The verification pass is placed on the refine path only, while the artifact states all three draft actions share the mechanism it is meant to guard

**Quotes:** > 2. **Post-refine verification pass.** A cheap model call checks the rendered result against the instruction. On failure, retry once with the miss made explicit; on a second failure, surface _"couldn't apply this instruction"_ rather than silently committing a revision that ignored the user.
**Quotes:** > - **Risk:** medium — touches the refine path that all three draft actions share (`regenerate-design`, `regenerate-copy` and `refine` all route through `runDesignAgentCli`), so a regression is broad.
**Quotes:** > - **Verification scope — decided 2026-09-15.** The verification pass runs on **every model-driven refine**, across all four instruction classes.
**Problem:** The artifact states three actions route through one shared runner, then scopes both the taxonomy and the verification pass to "refine" without saying where in that shared path the new gate sits. If verification wraps the shared runner, `regenerate-design` and `regenerate-copy` acquire a verification step and a new failure outcome the proposal never names as in scope; if it sits above the runner in the refine route only, the shared runner is untouched but the artifact never says so. The two readings produce different co-changes to the other two actions' response shapes and their `pendingAction`/`pendingActionError` handling, and only one of them is a half-landed merge.
**Fix:** Name the layer the verification pass wraps — the refine route above `runDesignAgentCli`, or the shared runner itself — and state explicitly whether `regenerate-design` and `regenerate-copy` are changed by it.
**Status:** upheld

### [BLOCK] party-architect — The "not applied" outcome is a new terminal state on an async action contract the proposal never names as a co-change

**Quotes:** > on a second failure, surface _"couldn't apply this instruction"_ rather than silently committing a revision that ignored the user.
**Quotes:** > - Should "couldn't apply" be a hard failure surfaced in the UI, or a soft warning on a committed revision? The former is honest; the latter is less disruptive mid-session.
**Quotes:** > - **Files affected:** ~12–18 (estimated) — refine prompt, refine route, draft actions, draft page components, Dockerfile, E2E suite, unit tests
**Problem:** The artifact introduces a third outcome for refine — neither success nor error — and leaves it unresolved whether it commits a revision. That choice determines whether the draft-read contract the polling client consumes needs a new field beyond the existing error channel, whether the revision pointer advances, and whether an undo target exists. "draft actions" and "draft page components" are listed as files but the _contract_ between them — what the poll returns when an instruction was attempted and not applied — is never specified. Two implementers reading this build different payloads, and the client and server halves of the same merge disagree. party-security's fail-closed proposal and party-visionary's reversibility argument both land on this same unresolved question from different arrows, which strengthens rather than replaces the contract objection: whichever answer is chosen, the poll payload must be named in the artifact.
**Fix:** Decide in the artifact whether a twice-failed refine commits a revision, and specify the field the poll response carries for that outcome.
**Status:** upheld

### [WARN] party-architect — The instruction taxonomy is a new grammar with four classes and no stated production or consumption contract

**Quotes:** > 1. **Instruction taxonomy.** Classify each instruction as `add` / `replace` / `remove` / `constrain` and give the model explicit semantics for each.
**Quotes:** > The verification pass runs on **every model-driven refine**, across all four instruction classes.
**Problem:** Four class names are introduced and then consumed by two separate components — the refine prompt builder and the verification pass — but the artifact never says who assigns the class. A model classifier, a heuristic in code, and a user-facing selector are three different designs with three different test seams, and one of them puts a judgement call in a regex while another spends a model call before the edit. The artifact also does not say what happens to an instruction that is two classes at once ("use this as the background and reduce the text"), which is exactly the reported failure shape. Nothing here is unbuildable; it is underspecified enough that two implementers ship incompatible things.
**Fix:** State where classification happens and what the contract is when an instruction spans more than one class.
**Status:** upheld

### [WARN] party-architect — The verification pass has no named deterministic test seam, while the artifact's own diagnosis is that the existing seams hide this class of bug

**Quotes:** > **4. The test suite is structurally blind to all of this.** `MOCK_AI` returns clean HTML and `MOCK_PUPPETEER` never rasterizes, so nothing between the model and the pixels is exercised.
**Quotes:** > 6. **A rasterizing E2E.** At least one end-to-end case that runs the real render path and asserts on actual pixels/DOM — closing the gap that made every defect above invisible to a green suite.
**Quotes:** > 2. **Post-refine verification pass.** A cheap model call checks the rendered result against the instruction.
**Problem:** The proposal adds a second model call inside the refine path and names only one new test asset — a rasterizing E2E — to cover it. The retry-once branch and the twice-failed branch are reachable only by making the verifier return "miss", which needs a stub the artifact does not name; under the existing `MOCK_AI` seam the verifier presumably returns clean, so both new branches are untested by exactly the mechanism the proposal identifies as structurally blind. A rasterizing E2E exercises the render, not the verifier's failure branches.
**Fix:** Name the seam that forces a verification miss deterministically, separate from the rasterizing E2E.
**Status:** upheld

### [NOTE] party-architect — Font coverage is placed in the image while the proposal's own precedent shows the choice is a rendering-policy decision, not a package install

**Quotes:** > 4. **Generalize font coverage.** Install symbol/emoji coverage in the runner image alongside Sinhala, so the renderer stops producing tofu for any glyph the design agent emits.
**Quotes:** > Which symbol/emoji font? A full colour emoji font is large and changes the look of any emoji the agent emits; a monochrome symbol font is lighter and more on-brand for stat glyphs like ★. This is a deliberate design decision, not just a package name.
**Problem:** The artifact places the fix entirely in the `Dockerfile` layer, and simultaneously observes that the choice changes the appearance of every emoji the agent emits — an output-appearance decision landing in an image-build layer where no per-brand or per-kit override exists. The placement is defensible for coverage-as-a-bug, but the artifact should note that a font installed OS-wide is a global rendering policy with no per-draft seam, which is a layering consequence the open question only half-acknowledges.
**Fix:** Note in the artifact that OS-wide installation is global and has no per-kit override, so the font choice is not revisable per brand later without a second mechanism.
**Status:** upheld

### [WARN] party-architect — Rebuttal to party-po: element-targeted editing is not "UI-only", and the artifact's own open question makes it a model-path change

**Quotes:** > Items 3 (element-targeted editing, UI-only) and 4 (Dockerfile font swap) touch that shared path not at all or trivially, while items 1-2 (taxonomy + verification) and 7 (dead-code resolution) are the ones with real blast radius.
**Quotes:** > Element-targeted editing: does it edit the **HTML directly** (deterministic, no model, but limited to what the DOM exposes) or send a scoped instruction to the model with the element as context (more capable, reintroduces some ambiguity)?
**Quotes:** > - **Files affected:** ~12–18 (estimated) — refine prompt, refine route, draft actions, draft page components, Dockerfile, E2E suite, unit tests
**Problem:** The structural premise of party-po's separation — that item 3 is UI-only with near-zero shared-path risk — is not what the artifact says. Element-targeted editing writes the same draft HTML and the same revision chain the refine path writes (that is why "draft actions" appears in the affected-files line beside "draft page components"), and the artifact's own open question keeps the model-driven variant live, which would put it on the shared runner outright. I take no position on release order — that is party-po's arrow — but the coupling fact must be recorded: whichever branch of that open question is chosen, item 3 and the refine path share one writer and one commit contract, so "touches that shared path not at all" is only true under the unchosen half of an unresolved question.
**Fix:** Resolve the artifact's element-editing open question before any separation argument rests on item 3 being independent of the refine path.
**Status:** upheld

### [NOTE] party-architect — Rebuttal to party-po: the dead brand-conflict protocol sits in the same prompt builder the taxonomy rewrites

**Quotes:** > - `src/lib/agent/prompts/refine.ts` — instruction taxonomy, removal/replacement semantics
**Quotes:** > - Resolving the dead API-mode-only brand-conflict protocol (either wire it for CLI mode or remove it)
**Quotes:** > the brand-conflict compliance protocol in `refine.ts` exists **only in API mode** while production runs CLI mode — so that entire path is dead code in prod.
**Problem:** party-po reads this item as scope added "because it's tidy to clean up while already in `refine.ts`". The artifact places both the taxonomy rewrite and the dead protocol in the same prompt builder, and the protocol is mode-gated — so the taxonomy's new removal/replacement semantics must be written either around a live-in-one-mode branch or after it is resolved. That is a structural adjacency in one file, not incidental tidying. I make no claim about whether it returns value or when it should ship; only that the two items occupy the same builder and a plan that separates them edits `refine.ts` twice with an unresolved mode gate in between.
**Fix:** Record in the artifact that the protocol's mode gate lives in the same builder the taxonomy modifies, so whichever order is chosen is chosen knowingly.
**Status:** upheld
