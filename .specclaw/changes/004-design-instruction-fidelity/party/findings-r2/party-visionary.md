### [BLOCK] party-visionary — The instruction taxonomy becomes a persisted classification vocabulary that a later change cannot rename or collapse

**Quotes:**

> 1. **Instruction taxonomy.** Classify each instruction as `add` / `replace` / `remove` / `constrain` and give the model explicit semantics for each.
>    The verification pass runs on **every model-driven refine**, across all four instruction classes. Element-targeted edits are deterministic and are **exempt**
>    Mitigated by the new rasterizing E2E and by `PROMPT_VERSION` stamping, which makes a bad prompt revision identifiable per-draft.

**Problem:** A four-value class set that gates verification behaviour is a decision vocabulary, not a prompt detail. The moment a refine's class is recorded anywhere durable — and `PROMPT_VERSION` stamping per-draft is cited as the diagnostic mechanism, which only helps if the per-revision record says what was attempted — the vocabulary is in the revision chain. The next change that finds the taxonomy wrong (the likely one: "reduce the text" is simultaneously `remove` and `constrain`, and "use this as the background" is `replace` + `remove`, so single-label classification will be the first thing to break) cannot renumber or merge classes without every historical revision carrying a class that no longer means what it says. The proposal never states whether the class is persisted, transient, or user-visible — and that choice is the one-way door, not the class names. Decide it before the first revision is written with a class on it.

**Fix:** State explicitly whether the instruction class is (a) transient — computed, used for prompt assembly, discarded, so a later change can replace the taxonomy freely; or (b) recorded on the revision, in which case commit now to the taxonomy being append-only and say so. Option (a) is the reversible door and costs nothing today.

**Status:** upheld — no seat contested it; party-architect's "no stated production or consumption contract" and party-ba's undefined `constrain` both reinforce that the vocabulary is unsettled, and neither addresses whether it becomes durable.

### [WARN] party-visionary — The verification pass becomes a second, undeclared specification of what refine means, kept in sync with the refine prompt by hand forever

**Quotes:**

> 2. **Post-refine verification pass.** A cheap model call checks the rendered result against the instruction. On failure, retry once with the miss made explicit; on a second failure, surface _"couldn't apply this instruction"_ rather than silently committing a revision that ignored the user.
>
> 1. **Instruction taxonomy.** Classify each instruction as `add` / `replace` / `remove` / `constrain` and give the model explicit semantics for each. Remove the blanket "preserve everything" for replacement and removal instructions

**Problem:** The verifier must encode the same per-class semantics the refine prompt encodes — it cannot judge whether a `replace` landed without knowing that `replace` means the superseded visual goes. That is the same fact written in two prompt builders. The next change to refine semantics is already named in this document: "Rewriting the generation (first-pass) prompts" is out of scope, so the first follow-up will be a refine-semantics tweak. It must now edit both the instruction-semantics text and the verifier's acceptance criteria, in different prompts, with nothing failing if only one is edited. The drift's shape is specific and nasty: the refine prompt loosens, the verifier does not, and users start seeing "couldn't apply this instruction" on refines that in fact applied correctly. Nobody notices for weeks because the symptom is a false negative on a self-service loop that users already expect to be flaky — which is exactly the trust the change exists to rebuild.

**Fix:** Derive the verifier's acceptance criterion for each class from the same single source that generates the instruction-semantics block (one table, two consumers), or state in the proposal which of the two is authoritative so a disagreement is diagnosable rather than invisible.

**Status:** upheld

### [WARN] party-visionary — "Couldn't apply this instruction" is the change's most durable commitment and the proposal leaves its permanence to an open question

**Quotes:**

> on a second failure, surface _"couldn't apply this instruction"_ rather than silently committing a revision that ignored the user.
>
> - When verification fails twice, should the draft keep the attempted revision (user can inspect and undo) or discard it and stay on the prior version? Keeping it preserves work; discarding avoids polluting the revision chain with known-bad states.
> - Should "couldn't apply" be a hard failure surfaced in the UI, or a soft warning on a committed revision? The former is honest; the latter is less disruptive mid-session.

**Problem:** These two open questions are framed as UX preferences, but one of the four answers writes to the revision chain and one does not, and the revision chain is already load-bearing across this codebase (`currentRevisionNumber` pointers, restore, Undo, refine-starts-from-current). "Keep the attempted revision + soft warning" means every known-bad refine becomes a permanent row that later changes must reason about: the next change that touches restore, or that adds any revision-level quality signal, inherits a chain where some revisions are marked-bad and some are not, and must decide what each surface does with them. That is not reversible by flipping a flag — the rows exist. "Discard + hard failure" leaves the chain exactly as it is today and is fully reversible later. The proposal treats these as symmetric; they are not, and nothing in it says so.

**Fix:** Note in the proposal that one branch of these questions adds durable rows to the revision chain and the other does not, so the decision is made on reversibility rather than on mid-session disruption. If the soft-warning branch wins, say what every existing revision consumer does with a marked-bad revision before it ships.

**Status:** upheld — party-security's "both branches destroy something with no stated recovery" reads the same pair of questions at runtime scope; the asymmetry in what each branch leaves permanently in the revision chain is unaddressed by it and stands.

### [WARN] party-visionary — Verify-then-retry on every refine sets the precedent that will be copied into generation, where it costs three times as much and is wrong

**Quotes:**

> The verification pass runs on **every model-driven refine**, across all four instruction classes.
>
> - Rewriting the generation (first-pass) prompts; this change is scoped to the edit/refine loop
>   **Risk:** medium — touches the refine path that all three draft actions share (`regenerate-design`, `regenerate-copy` and `refine` all route through `runDesignAgentCli`), so a regression is broad.

**Problem:** The artifact itself names that all three draft actions share `runDesignAgentCli`. Once verify-then-retry-once lives on that path for refine, the obvious next change — "generation ignores the brief too" — generalises it to first-pass generation and regenerate-design. The generalisation is wrong there for a reason nobody will re-derive: a refine has a prior state to compare against, so "did the instruction land" is a well-posed question; a first-pass generation has no prior, so verification degrades into "is this a good design", which the change's own out-of-scope line assigns to proposal 007. The footnote that makes this pattern correct — that it verifies a _delta_, not a _quality_ — is nowhere in the artifact, so the contributor who copies it will not read it. Meanwhile each retry is a full design call on a path already measured at 41–61 seconds, so the copy also triples worst-case generation latency.

**Fix:** State in the proposal that verification is defined over the delta between the prior revision and the new one, and is undefined without a prior — one sentence that makes the wrong generalisation visibly wrong at the point someone reaches for it.

**Status:** upheld — party-architect's BLOCK on the same shared runner asks where the gate sits at merge; it does not settle where the pattern may legitimately spread afterwards, and answering theirs with "wrap the shared runner" is precisely the generalisation this finding says will be copied without its footnote.

### [WARN] party-visionary — Element-targeted editing quietly makes the DOM of generated HTML a stable surface, with no stated contract

**Quotes:**

> 3. **Element-targeted editing.** Extend the existing draft inline-edit so the user can click a specific element and edit it directly. Removes prose ambiguity entirely for text, colour and sizing changes
>
> - Element-targeted editing: does it edit the **HTML directly** (deterministic, no model, but limited to what the DOM exposes) or send a scoped instruction to the model with the element as context (more capable, reintroduces some ambiguity)?

**Problem:** Clicking an element to edit it requires addressing that element — by selector, index, or an injected id — and whatever the addressing scheme is, it is computed over HTML a model wrote freeform (Path B) and will rewrite on the next refine. The next change that touches the design prompts to improve output structure now also silently breaks or re-points every element address, and there is nothing that fails when it does: the edit just lands on the wrong node, or silently on none. This is the durable cost that the "deterministic, no model" framing hides — determinism at the edit site buys nothing if the address is computed against non-deterministic markup. The artifact scopes prompt rewrites out, which delays the collision rather than avoiding it.

**Fix:** Say in the proposal whether element addresses are resolved fresh at click time against the current HTML (safe, nothing persisted) or stored against a revision (a durable coupling between stored addresses and model-authored markup). If the latter, name what invalidates them.

**Status:** upheld

### [NOTE] party-visionary — The rasterizing E2E is the compounding asset here and the proposal asks it to prove only this change

**Quotes:**

> 6. **A rasterizing E2E.** At least one end-to-end case that runs the real render path and asserts on actual pixels/DOM — closing the gap that made every defect above invisible to a green suite.
> **4. The test suite is structurally blind to all of this.** `MOCK_AI` returns clean HTML and `MOCK_PUPPETEER` never rasterizes, so nothing between the model and the pixels is exercised. Every defect above would pass a full green suite — and the preamble bug did.
> **3. Font coverage is Sinhala-only.** `Dockerfile:68` installs `font-noto-sinhala` and nothing else. **All four** attached exports render the rating stat as `4.8⍰`

**Problem:** Everything else in this change is a tax the future pays; this is the one item that makes later changes cheaper, and it is specified as "at least one case". The seam it opens — a harness that can assert on real rasterized output — is exactly what makes the _next_ font question ("did the symbol font actually cover ★ in the runner image?"), the next preamble-class bug, and proposal 007's design-quality work checkable rather than eyeballed. Tofu detection in particular is a cheap, glyph-agnostic pixel assertion that would have caught both the 2026-07-28 Sinhala case and today's `4.8⍰` with one check, and the change is one step from it: it is already installing the fonts and already rasterizing. Stopping at "one case" for this change's own sake leaves that leverage on the floor with no stated reason.

**Fix:** Frame the rasterizing E2E as a reusable harness with a named first assertion (a tofu/replacement-glyph check against the real runner image), not as one case attached to this change — so the next font or render change inherits a place to put its proof instead of building one.

**Status:** upheld — party-architect's "verification pass has no named deterministic test seam" and party-security's request for a recorded font-set stamp both land in this same harness, which strengthens rather than duplicates the case for specifying it as reusable.

### [WARN] party-visionary — Rebuttal of party-po's "ship the deterministic fix first": that cut ships the least reversible item first and defers the most reversible one

**Quotes:**

> 3. **Element-targeted editing.** Extend the existing draft inline-edit so the user can click a specific element and edit it directly. Removes prose ambiguity entirely for text, colour and sizing changes — the cases where "reduce the text" should never have needed a model at all. 2. **Post-refine verification pass.** A cheap model call checks the rendered result against the instruction.

**Problem:** party-po recommends cutting to element-targeting plus the font install first and deciding on the taxonomy/verification spend afterwards. On merge-day cost that ordering is right; on the one-year horizon it is inverted. The verification pass is a wrapper on one route that a later change deletes in a commit, leaving no residue — no schema, no stored addresses, no user-visible surface anyone has built a habit on. Element-targeted editing is the opposite: it introduces an element-addressing scheme computed over model-authored markup (the coupling in my finding above), a second writer of `htmlContent` and the revision chain, and a click-to-edit affordance users learn — none of which a later change walks back cheaply once drafts have been edited through it. Shipping it first, while the artifact's own open question still has not decided whether it edits the HTML directly or routes through the model, means the durable half lands before its contract exists and the disposable half is what gets deferred. If a cut is taken, take it the other way round.

**Fix:** If the panel adopts a cut, sequence on reversibility rather than on unit cost: the verification pass is removable, element-targeted editing is not. At minimum, do not ship element-targeting ahead of a stated answer to the artifact's own addressing question.

**Status:** upheld
