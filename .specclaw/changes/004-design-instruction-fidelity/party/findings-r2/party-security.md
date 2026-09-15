### [BLOCK] party-security — The verification pass judges model output using model output, and its verdict is the commit decision

**Quotes:**

> 2. **Post-refine verification pass.** A cheap model call checks the rendered result against the instruction. On failure, retry once with the miss made explicit; on a second failure, surface _"couldn't apply this instruction"_ rather than silently committing a revision that ignored the user.

**Problem:** The evidence handed to the verifier is the refine model's own output — a document that already carries user brief prose, brand-kit voice text, and (per the 2026-08-03 preamble incident quoted in this very proposal) the design model's unprompted narration. That content is read by a model whose boolean answer is the control-flow decision "commit this revision or not". Any text inside the rendered document that reads as a statement about the document — "the background has been replaced", a hidden caption, an alt attribute, a leftover instruction echoed into the markup — is untrusted content arriving in the position of the verifier's ground truth. The proposal's own stated lesson is "validate by extracting what you need, not by asserting it is in there somewhere", and a free-prose "does this look applied?" call is exactly the assertion form that lesson rejects. It is also self-graded: the party whose work is being judged authors the artifact the judge reads. No seat contested this reading; `party-visionary`'s drift finding and `party-po`'s cost finding both assume the same free-prose verifier and add independent reasons to constrain it.
**Fix:** Verify structurally wherever the instruction class permits — `remove`/`constrain` admit deterministic post-conditions on the DOM/render (text node count or length decreased, the named element absent, computed background is the named image and the prior decorative node is gone); reserve the model call for what cannot be measured. Feed the verifier the extracted structural facts, not the raw document; where raw content must be included, delimit it and instruct the verifier that content inside the delimiters is data and never a claim about whether the edit succeeded. Require a strict machine-readable verdict and treat anything unparseable as a miss, not a pass.
**Status:** upheld

### [BLOCK] party-security — The verifier's own failure has no named outcome, and the candidate default on the page is the permissive one

**Quotes:**

> 2. **Post-refine verification pass.** A cheap model call checks the rendered result against the instruction. On failure, retry once with the miss made explicit; on a second failure, surface _"couldn't apply this instruction"_ rather than silently committing a revision that ignored the user.
>
> - Should "couldn't apply" be a hard failure surfaced in the UI, or a soft warning on a committed revision? The former is honest; the latter is less disruptive mid-session.

**Problem:** The design names what happens when the verifier says _no_. It never names what happens when the verifier _cannot answer_ — call errors, times out, returns empty, or returns text the caller cannot parse. The path of least resistance for that case is "skip the check and commit", which is indistinguishable from a verified-good revision. This failure is correlated, not independent: the verifier runs on the same model/credential path as the refine it is judging, so a degraded model layer produces both the bad edit and the disabled check at once — the gate evaporates precisely in the conditions that make it necessary. The soft-warning option in the open question is the same shape: a committed revision plus a dismissible notice is a green result carrying a yellow sticker, and the incident being fixed here is one where the user could not tell a wrong output from a right one. `party-architect`'s BLOCK on the unspecified "not applied" contract is adjacent but distinct: they need the field named, I need its unavailable-verifier value to point at the strict branch rather than at commit.
**Fix:** State the unavailable-verifier outcome as fail-closed: an unreachable, timed-out, or unparseable verification is a miss and takes the same path as an explicit miss. Record the verification outcome as durable state on the revision (`verified` / `unverified — verifier unavailable` / `not applied`) beside the existing `PROMPT_VERSION` stamp, so an unverified revision is distinguishable after the fact and a period of silent verifier outage is diagnosable. Resolve open question 4 toward the hard surface: a "soft warning on a committed revision" is the exact reporting shape this proposal exists to eliminate.
**Status:** upheld

### [BLOCK] party-security — Element-targeted editing writes raw user input into a document a headless browser parses and executes, and is the one path exempt from all verification

**Quotes:**

> 3. **Element-targeted editing.** Extend the existing draft inline-edit so the user can click a specific element and edit it directly. Removes prose ambiguity entirely for text, colour and sizing changes — the cases where "reduce the text" should never have needed a model at all.
>
> - Element-targeted editing: does it edit the **HTML directly** (deterministic, no model, but limited to what the DOM exposes) or send a scoped instruction to the model with the element as context (more capable, reintroduces some ambiguity)?
>   Element-targeted edits are deterministic and are **exempt** — no model call is spent proving a DOM edit did what the code just did.

**Problem:** "Edits the HTML directly" means user-typed text becomes markup in a document that is later parsed and rendered by Chromium and persisted as a draft revision other team members can open. Text typed into an element becomes element content; a colour or size typed into a field becomes a CSS value. Neither is inert: markup typed into a text field breaks out of the element unless the write goes through a text-node API, and a CSS value field accepts `url(...)` — a network fetch issued by the renderer on behalf of the server — and can terminate the surrounding declaration or style block. "Deterministic" describes the code path, not the input; the input is still the least-trusted thing in the system. The proposal then makes this the only editing path with no verification step at all, so it is simultaneously the most permissive sink and the least inspected one. The proposal gives no statement that the edit is escaped, type-constrained, or confined to the element the user clicked. Round 1 strengthened rather than weakened this: `party-visionary` establishes that the element address is itself computed over model-authored markup that the next refine rewrites, so the write target is non-deterministic too.
**Fix:** Write text edits as text content, never as markup. Constrain colour and size inputs to parsed, re-serialized values from a closed grammar (a colour parsed into a hex/rgb triple, a size parsed into number+unit from an allowed unit set) and reject anything else rather than passing the string through; never accept a free-form CSS declaration, and never accept a value containing `url(`. Confine the write to the single element node resolved from the click, not a selector supplied by the client. If the alternative — scoped instruction to the model — is chosen instead, that path is model-driven and must not inherit the verification exemption granted here.
**Status:** upheld

### [WARN] party-security — Classification of the instruction is a control-flow decision derived from user prose, with no stated default when it is ambiguous

**Quotes:**

> 1. **Instruction taxonomy.** Classify each instruction as `add` / `replace` / `remove` / `constrain` and give the model explicit semantics for each. Remove the blanket "preserve everything" for replacement and removal instructions — a replacement must name what it supersedes, so "use this as the background" means the prior decorative visual goes.

**Problem:** The classification decides how much of the existing design the model is licensed to destroy, and it is derived from free user text — which may be ambiguous, multi-clause ("use this as the background and add a character"), or simply misread. The two destructive classes are the ones that switch off the preservation guard, so a misclassification fails toward deletion: the user asks for an addition, the instruction is read as a replacement, and content they never mentioned is removed and committed. The proposal names no default class for a low-confidence or mixed classification, and the design's gravity is toward the permissive reading because that is the one that "does something". The "must name what it supersedes" rule is the right constraint but is stated as prose guidance to the model, not as a precondition the caller enforces. Three seats independently reached the multi-class case in round 1 (`party-architect` on the missing production contract, `party-ba` on `constrain` having no definition, `party-visionary` on single-label classification breaking first); none of them names which way it should fail, which is the part I am filing.
**Fix:** Default to the preserving classes (`add`/`constrain`) when classification is ambiguous or the instruction contains more than one clause, and make the destructive path conditional on the model returning an explicit, non-empty identification of the superseded element — no name, no removal licence. Have the caller check that field's presence rather than trusting the prompt to have required it.
**Status:** upheld

### [WARN] party-security — Both branches of the failed-verification question destroy something with no stated recovery

**Quotes:**

> - When verification fails twice, should the draft keep the attempted revision (user can inspect and undo) or discard it and stay on the prior version? Keeping it preserves work; discarding avoids polluting the revision chain with known-bad states.

**Problem:** The "discard" branch throws away a rendered result the system already paid two model calls and a rasterization for, with nowhere stated that it goes — the user cannot inspect what the model did wrong, and the operator cannot diagnose a systematic verification false-positive because the rejected artifacts leave no trace. The "keep" branch advances the revision chain to a state the system itself has judged wrong; its recovery is a manual version-switch, which this proposal elsewhere describes as the unsatisfactory recovery for the dropped-inline-asset bug. Neither branch as written leaves a durable, labelled record of the rejection. `party-visionary` reaches the same two branches from the design-commitment side and concludes discard is the safe one; my fix satisfies both readings at once, since retaining the rejected artifact outside the chain adds no revision rows.
**Fix:** Retain the rejected output as a recorded artifact that the revision pointer does not advance to — labelled with the instruction, the classification, and the verifier's stated miss — so nothing is unrecoverable and a run of false rejections is visible without reproducing it. If the chain must stay clean, retain it outside the chain rather than deleting it.
**Status:** upheld

### [WARN] party-security — Placeholder recovery is detection-based, so it fails open on the mutation it cannot detect

**Quotes:**

> 5. **Inline-asset auto-reinsert.** Detect dropped `__INLINE_ASSET_n__` placeholders and restore them rather than committing a revision with images silently missing.

**Problem:** "Detect dropped" only covers the case where a placeholder is absent. A model that _mangles_ a placeholder — renames it, changes its index, duplicates it, or wraps it — produces a document where detection finds nothing to restore and the revision commits with the image still lost or, worse, with the wrong asset spliced into the wrong slot at render time. The recovery is silently a no-op and looks identical to a clean run, which is the same shape as the class of bug this proposal is written to close. No seat addressed item 5 in round 1.
**Fix:** Make it a reconciliation, not a detection: the set of placeholder tokens going out and the set coming back must match exactly — same tokens, same multiplicity. Restore on a clean absence; on any other mismatch (renamed, duplicated, reindexed) treat the revision as not applied and take the same failure path as a failed verification. Log the mismatch so a model that starts mangling placeholders is visible before it is reported by a user.
**Status:** upheld

### [NOTE] party-security — A font change alters every future render with nothing recording which font set produced a given export

**Quotes:**

> 4. **Generalize font coverage.** Install symbol/emoji coverage in the runner image alongside Sinhala, so the renderer stops producing tofu for any glyph the design agent emits.
>
> - Which symbol/emoji font? A full colour emoji font is large and changes the look of any emoji the agent emits; a monochrome symbol font is lighter and more on-brand for stat glyphs like ★. This is a deliberate design decision, not just a package name.

**Problem:** The glyph environment is global process state baked into the image: one install silently changes the appearance of every subsequent render, including drafts and templates approved under the old environment. The proposal acknowledges the appearance change but names nothing that records which font set a given export was produced with, so a wrong choice is only discoverable by eye and an export cannot be attributed to the environment that made it. No exposure exists in the design as written — the effect is contained to the runner image and reversed by redeploying the prior image — but the attribution gap is cheap to close now and expensive to reconstruct later. `party-architect` (no per-kit override) and `party-visionary` (a tofu assertion in the rasterizing harness) reached the same item from the layering and leverage sides; all three fixes compose.
**Fix:** Record the installed font set (or a digest of it) alongside the existing per-draft `PROMPT_VERSION` stamp so a render's glyph environment is attributable, and prefer the narrowest coverage that fixes the reported defect — monochrome symbol coverage for stat glyphs — over a full colour emoji set, which widens the visual change far beyond the bug.
**Status:** upheld

### [WARN] party-security — Rebuttal of party-po: item 3 is not the low-risk half of the cut line, it is the most permissive sink in the change

**Quotes:**

> 3. **Element-targeted editing.** Extend the existing draft inline-edit so the user can click a specific element and edit it directly. Removes prose ambiguity entirely for text, colour and sizing changes — the cases where "reduce the text" should never have needed a model at all.
> Element-targeted edits are deterministic and are **exempt** — no model call is spent proving a DOM edit did what the code just did.

**Problem:** `party-po` proposes shipping items 3 and 4 first on the ground that they are "deterministic, no model call", "UI-only", and touch the shared path "not at all or trivially" — a sequencing argument I take no position on. The risk characterization underneath it is the part I am rebutting: item 3 is the only path in this change that writes unvalidated user input directly into HTML that Chromium parses and that persists into the revision chain, and the proposal's own decision exempts it from every check the change adds. Ranking it as the near-zero-risk half rests on "deterministic" describing the input rather than the code path. If the panel does adopt cheaper-first sequencing, item 3 shipping alone means the escaping and value-grammar constraints in my third finding land in the first PR, not deferred behind the taxonomy work; item 4 carries no such condition and is genuinely the low-risk one.
**Fix:** If the cut line is adopted, attach the text-node-write, closed-grammar colour/size parsing, and no-`url(` constraints to item 3 as preconditions of shipping it, and do not carry the "UI-only / near-zero risk" framing into the plan for that item.
**Status:** upheld

### [WARN] party-security — Rebuttal of party-visionary: "discard + hard failure" is reversible for the revision chain but irreversible for the evidence

**Quotes:**

> - When verification fails twice, should the draft keep the attempted revision (user can inspect and undo) or discard it and stay on the prior version? Keeping it preserves work; discarding avoids polluting the revision chain with known-bad states.

**Problem:** `party-visionary` argues the branches are asymmetric and that "discard + hard failure leaves the chain exactly as it is today and is fully reversible later." That is correct about the _design commitment_ — no rows, no schema, nothing to unwind — and I do not contest it on that axis. It is not correct about the _runtime effect_, which is mine: discarding deletes a rendered artifact the system paid two model calls and a rasterization to produce, and nothing in the proposal says where it goes. A wave of false rejections — the exact failure mode a verifier drifting out of sync with the refine prompt produces, which `party-visionary` names in their own second finding — is then undiagnosable, because every instance of the evidence was destroyed at the moment it was judged. The two positions reconcile: retain the rejected render outside the revision chain. That keeps the chain byte-identical to today (their requirement) and keeps the artifact recoverable (mine).
**Fix:** Adopt `party-visionary`'s discard-from-the-chain conclusion, but state that "discard" means the revision pointer does not advance, not that the artifact is deleted — retain it as a labelled out-of-chain record with the instruction, the class, and the verifier's miss.
**Status:** upheld
