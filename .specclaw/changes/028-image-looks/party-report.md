# Party Report: 028-image-looks

**Reviewed:** 2026-10-24
**Tier:** deep (classifier) — Adds five new looks and STORY contracts across the designData dataset, prompts, render fixtures, the resolver and the insights page (about 25 files), and changes unattended queue, MCP and ACP behaviour so they use a look only after a real-image allow-list entry, with open questions on the full-bleed measurement and the number of sizes that change what is built.
**Panel:** party-po(sonnet), party-architect(opus), party-ba(sonnet), party-security(opus), party-visionary(opus)
**Verdict:** CHANGES_REQUESTED

## Summary

37 findings: 4 BLOCK, 26 WARN, 7 NOTE upheld — 0 withdrawn

## Findings

### [WARN] party-architect — The `realCheck` record edits released dataset versions, which breaks the immutability rule the proposal cites

**Quotes:** > The spec sets the exact rectangles, subjects and band sizes. Existing versions are never edited (the dataset's immutability rule): STORY arrives as `versions[2]` with `current: 2`, and drafts stamped `v1` keep resolving.
**Quotes:** > - **The allow-list:** each contract carries a `realCheck` record (`{ passedOn, renders }`), written into the dataset only from the real-image check's results. Unset means unproven.
**Quotes:** > It is a tuning step and the allow-list input, never a merge gate.
**Problem:** The proposal says a contract belongs to a released version, and released versions are never edited. It then puts a mutable field on that contract. The field is filled in after the version ships, by an operator run that happens after the merge. One of two things must give:

- Every later `realCheck` write edits a released version, which breaks the rule.
- Every pass needs a new `versions[n+1]`. That moves `current` and voids the record the resolver just read.

The proposal does not say which. It also does not say how runner output becomes a code change: whether the runner emits a patch, prints a record for a person to paste, or writes the file. So "written … only from the real-image check's results" has no mechanism behind it. In round 1, party-security (no tie to evidence) and party-visionary (no tie from runner output to the record) both reached the same gap from their own lanes.
**Fix:** Keep the allow-list outside the versioned contracts, as a separate code-owned map keyed by (key, version, size) that the resolver reads. State that adding an entry does not count as a version edit. Name the hand-off format from the runner to that map, for example a committed results file that a unit test checks the map against.
**Status:** upheld

### [WARN] party-architect — The allow-list is keyed to the current version, but the real check covers only the 17 new contracts, so the v2 copies of Showcase and Editorial split at SQUARE and PORTRAIT can never qualify

**Quotes:** > | Showcase (`product-showcase`) | **version 2** adds STORY; SQUARE/PORTRAIT copied as is | light | SQUARE, PORTRAIT, **STORY** | the text area: calm (busy) and light-text contrast | Launch |
**Quotes:** > - `resolvePostStyle` lets a queue entry, an MCP call or an ACP call use a non-classic look **only when the contract at (key, current version, size) has a `realCheck` record**.
**Quotes:** > the 009 OP-1 runner (`.specclaw/changes/009-hero-image-design/op1/run-op1.mjs`) is extended to render **one brief per new contract** (17 hero image calls)
**Problem:** Once v2 ships, `current` is 2 for `product-showcase` and `editorial-split`. Their v2 SQUARE and PORTRAIT contracts are byte-for-byte copies of v1, but each is a new (key, version, size) tuple. The real-image check renders only the 17 new contracts (2 STORY plus 15), so it never writes a `realCheck` for v2 SQUARE or v2 PORTRAIT. As written, unattended Launch and Announcement posts at 1:1 and 4:5 stay `unproven-classic` for good, while the same looks at 9:16 can be allowed.

A carry-forward rule would not fix this either. By the proposal's own definition, `realCheck` comes only from the new real-image check, so v1 has no record to inherit. OP-1 was a different test with a different bar, as party-security's round-1 note argues. The same gap returns on every later version bump: a version that only adds a size silently withdraws unattended use at every size it copied.
**Fix:** Add the 4 copied contracts to the real-check run and raise the cap to match, or state that they stay classic on unattended surfaces. For future bumps, state whether a record carries forward to an unchanged contract, for example by keying it on a content hash instead of the version number.
**Status:** upheld

### [WARN] party-architect — Three different fixture counts, so the completeness test and the fixture set cannot both be built as written

**Quotes:** > - **Merge gate (deterministic):** `tests/render/` gains a synthetic pass image and a synthetic fail image per contract per size (17 contracts: 2 STORY additions plus 5 looks × 3 sizes), built like 009's `heroFixtures.ts`.
**Quotes:** > A unit test asserts that every (key, current version, size) in the dataset has both fixtures, so a new size cannot land without them.
**Quotes:** > - Dataset validation: at least one `text` region per contract; the variant key grammar `<base>-<variant>`; pass and fail fixtures for every (key, version, size).
**Problem:** The proposal gives three different sizes for the fixture set:

- The merge gate sizes it at 17 contracts.
- The completeness test covers every (key, current version, size): 7 keys × 3 sizes = 21, because the v2 SQUARE and PORTRAIT contracts of the two existing looks count.
- The scope line covers every (key, version, size), which adds both v1 versions: 25.

If only 17 pairs are built, the unit test the proposal specifies fails at merge. 009's existing fixtures could fill the 4 missing pairs only if fixtures are matched to contracts by geometry rather than by version. The proposal does not say which, or whether 009 shipped must-fail images at all. Two implementers would build different fixture sets and different lookup keys.
**Fix:** State the fixture identity (key + version + size, or contract content) and the exact set. State whether 009's existing fixtures are reused for the copied v2 contracts and for v1, and whether must-fail images are added for them.
**Status:** upheld

### [WARN] party-architect — The `<base>-<variant>` key grammar cannot be checked by a test, because the bases and the new standalone looks already contain hyphens

**Quotes:** > | 26 | visionary: two key grammars in the Showcase family | A variant key is `<base>-<variant>`: `product-showcase-light`, `editorial-split-light`. A test enforces it |
**Quotes:** > - Five new looks (`product-showcase-light`, `editorial-split-light`, `abstract-forms`, `full-bleed-scene`, `spotlight`), each at SQUARE, PORTRAIT and STORY.
**Problem:** Both base keys (`product-showcase`, `editorial-split`) contain hyphens, and so do two of the new non-variant looks (`abstract-forms`, `full-bleed-scene`). A test that splits on `-` cannot tell that `full-bleed-scene` is a standalone look and `product-showcase-light` is a variant. A test that instead requires the prefix to be an existing key passes any key that happens to start with one, and says nothing about `abstract-forms`. The proposal does not say what makes a key a variant, so the test that "enforces it" has no defined input. Grouping looks by family on insights, and 025, would hit the same ambiguity.
**Fix:** Make variance explicit data on the look, for example `variantOf: 'product-showcase'`. The test then asserts `key === variantOf + '-' + suffix`, with the suffix drawn from a closed list (`light`).
**Status:** upheld

### [WARN] party-architect — The STORY exclusions and the unattended-classic gate that must change are left to discovery ("if any")

**Quotes:** > - **The 9:16 gate lifts by data.** The wizard picker and `POST /api/briefs` already ask the dataset which sizes a look supports (`imageStyleOptions`); adding STORY rows enables them. The spec lists every place that hard-codes "not STORY" and removes it.
**Quotes:** > - Removing hard-coded STORY exclusions (wizard, briefs route, queue modal, if any).
**Quotes:** > 3. **Scheduled, MCP and ACP posts are always classic** (`UNATTENDED` in `resolve.ts:93`).
**Problem:** The co-changes for both the 9:16 lift and the unattended rule are left to discovery.

- **The 9:16 lift.** One paragraph says the picker and the briefs route are data-driven, then lists those same two places as possibly holding hard-coded exclusions, "if any". So the blast radius is unknown at proposal time.
- **`size-classic`.** The downgrade at `resolve.ts:100-104` is not said to be data-driven. If it is a literal STORY check, it is one more co-change. If it is data-driven, it becomes unreachable once every look declares STORY.
- **The unattended rule.** The proposal names only `UNATTENDED` in `resolve.ts:93` and does not say this is the only place scheduled, MCP and ACP runs are forced to classic. If the runner or the tool adapters also force classic, the resolver change half-lands: the resolver allows a proven look and a later step discards it.
  **Fix:** List in the proposal, or require the spec to list by file, every STORY literal and every place that forces unattended runs to classic, and state whether each is removed or kept. Say what happens to `size-classic` once all looks declare STORY.
  **Status:** upheld

### [WARN] party-architect — New note `unproven-classic` with no named consumers

**Quotes:** > Otherwise it is classic, with a new note `unproven-classic`.
**Quotes:** > A 9:16 brief is always classic, and `resolvePostStyle` downgrades a Launch or Announcement default to classic with the `size-classic` note (`src/lib/postStyles/resolve.ts:100-104`).
**Problem:** The resolver's notes are a vocabulary shared with whatever reads them, and `size-classic` shows the proposal knows this. The proposal names no reader of the new value: not the draft notice, the queue entry line, the MCP and ACP tool responses, or any analytics field that carries the note. Every place that switches on the note set must handle the new value in the same commit, or the value falls into a default branch. The proposal names the producer and none of the consumers. Party-security's round-1 finding on fallback visibility makes the same point from the trust side: without a named reader, nobody sees the note on an unattended run.
**Fix:** Name every reader of the resolver's notes and say what each shows for `unproven-classic`. Otherwise state that the note set is closed and read in one place.
**Status:** upheld

### [WARN] party-architect — Fallback-per-look on insights may become a second record of the look outcome that the composition stamp already holds

**Quotes:** > - **Fallbacks are seen** (finding 19): the look outcome per draft (styled, or fell back with its reason) is shown per look key on `/admin/insights`, from events 006 already emits or one new field on them. The spec decides which.
**Quotes:** > 5. **Insights:** is a fallback-rate-per-look section on `/admin/insights` wanted now, or is the composition stamp enough until there is usage?
**Problem:** The proposal itself says the composition stamp already records the look outcome per draft. Adding "one new field" on an analytics event writes the same fact a second time, from a different writer, on a different retention schedule. The two diverge on the first path that stamps without emitting, or emits without stamping. The proposal leaves the source for the in-scope insights section as "the spec decides which", so the shared contract (which field is the truth for "fell back, and why") is undecided. This holds whether the section ships now (party-security) or is deferred (party-po). Any reader of the outcome needs one source.
**Fix:** Name one source of truth for the look outcome. If an event field is added, state that it is derived from the stamp at the same write site, so there is a single writer.
**Status:** upheld

### [WARN] party-architect — The unattended allow-list's "allowed" branch ships with no data to test against

**Quotes:** > It runs locally on a scratch database, as OP-1 did. It is a tuning step and the allow-list input, never a merge gate.
**Quotes:** > - The resolver's unattended rule (the allow-list instead of always classic) and the `unproven-classic` note.
**Problem:** The real check runs after the merge, on the user's decision, so the dataset ships with no `realCheck` record set. The resolver reads the code-owned dataset, so the branch where an unattended surface gets a styled look has no real data at merge. A unit or mock E2E test cannot exercise that branch unless the resolver takes the allow-list as an input or the tests can swap the dataset, and the proposal names no such seam. Party-security's round-1 BLOCK explains why the obvious shortcut, seeding a record into the dataset to make the test pass, is the failure to avoid. That makes an injected seam more necessary, not less.
**Fix:** Pass the allow-list into `resolvePostStyle` as an argument, or put it behind an injectable lookup. Name the test that drives a queue, MCP or ACP run through a proven contract using a fixture allow-list that is never part of the shipped dataset.
**Status:** upheld

### [NOTE] party-architect — A one-off change-folder script becomes the only producer of a product dataset field, and the hard cap lives in that untested script

**Quotes:** > the 009 OP-1 runner (`.specclaw/changes/009-hero-image-design/op1/run-op1.mjs`) is extended to render **one brief per new contract** (17 hero image calls), plus **at most one re-run per failing contract** after tuning. **Hard cap: 34 hero image calls**; the runner refuses to go past it.
**Problem:** The runner lives in 009's change-history folder. This proposal makes it the source of the `realCheck` allow-list for 027b. Through the vocabulary the proposal calls architectural ("025 all depend on"), it becomes the source for later changes too. A closed change's folder is an odd place for the ongoing producer of a product contract. The cap is enforced only inside the script, with no stated test.
**Fix:** Move the runner to `scripts/` (or similar) as a maintained tool with a unit-tested cap counter. Otherwise state that each change copies it, and accept the drift.
**Status:** upheld

### [NOTE] party-architect — Rebuttal of the visionary's first fix for the light variants: inheriting base geometry would silently edit a variant's released contract

**Quotes:** > The spec sets the exact rectangles, subjects and band sizes. Existing versions are never edited (the dataset's immutability rule): STORY arrives as `versions[2]` with `current: 2`, and drafts stamped `v1` keep resolving.
**Quotes:** > **Light polarity is data, not new code.** `evaluateRegions` already takes a `textTone` of `light` or `dark` (`src/lib/designData/evaluate.ts:29-35`). The light looks need fixtures and prompt wording, not a new check.
**Problem:** party-visionary's finding on the light looks proposes modelling a variant as "its base plus overrides, so geometry edits reach the variant automatically". I agree with the duplication finding. That first fix, though, conflicts with the immutability rule the proposal states. If `editorial-split` gains a v3 rectangle and `editorial-split-light` inherits it, then the variant's released v1 contract changes under every draft stamped `editorial-split-light` v1, with no version bump on the variant. Its fixtures and any `realCheck` then cover geometry that was never rendered. A geometry change at the base also does not carry over for free. The variant's contrast fixtures are built against the opposite backdrop, so they must be rebuilt either way.
**Fix:** Prefer the visionary's alternative: keep the copy, and add a test that the variant's regions equal its base's at paired versions. If inheritance is chosen, pin each variant version to an explicit base version (`variantOf: { key, version }`), so a base bump needs a deliberate variant bump.
**Status:** upheld

### [WARN] party-ba — "Real check passed" has no falsifiable bar, and it gates unattended publishing

**Quotes:**

> A contract passes when its render keeps the style (no fallback) and the user marks it acceptable.
> Real-check pass bar: per contract, "kept the style and the user marks it acceptable" (proposed), or a preference bar like OP-1's 4 of 6 per look
> **Problem:** The `realCheck` allow-list is the sole control that lets scheduled, MCP and ACP posts use a look, and finding 19 exists to protect those surfaces. The pass condition is one render per contract and a subjective sign-off by one person. One render cannot show a look works across briefs. "Keeps the style" is the same pixel check that already passes the look, so it adds no information. The proposal's own evidence standard, OP-1, was 6 briefs with a bar of 4. A contract passing on a single render would unlock unattended use on weaker evidence than the interactive looks had.
> **Fix:** State a numeric bar per contract (briefs, minimum accepted), cost it against the cap, or restrict unattended use to looks with several accepted renders.
> **Status:** upheld

### [WARN] party-ba — Problem 2 (looks serving post styles) is asserted, not evidenced

**Quotes:**

> General, Promotion, Event, Hiring, Tip and Milestone have no look that fits them
> The user picked the new looks on 2026-10-24: light Showcase, light Editorial split, Abstract brand forms, Full-bleed scene, Spotlight.
> OP-1 showed the styled looks are wanted
> **Problem:** The proposal cites no data that these six styles are used, or that classic fails them. The only evidence is OP-1, which covered two looks at two sizes and which the proposal itself says "says nothing about the new ones." The wish for the looks is the user's preference, not a shown pain. Yet the proposal builds seven look-to-style mappings, and finding 9 is claimed as answered by that table. The mapping is design intent, not demand. The insights data from 006 and 027a now exists and could show real style usage, but the proposal does not cite it.
> **Fix:** Cite style-usage numbers from the 006 insights or 027a, or mark the mapping as a user preference and trim the looks that serve no observed style.
> **Status:** upheld

### [WARN] party-ba — The 9:16 problem has no evidence that Story posts are wanted or hurt

**Quotes:**

> Story posts can never use an image style.
> A 9:16 brief is always classic, and `resolvePostStyle` downgrades a Launch or Announcement default to classic with the `size-classic` note
> **Problem:** The problem is stated as a capability gap, not as pain. The proposal gives no count of 9:16 briefs created, and no sign that users abandon or complain. It names no acceptance criterion showing that a Story post with a look is better than a classic one. OP-1's preference result was measured at SQUARE and PORTRAIT only. STORY sits inside "Showcase version 2" on the assumption that the existing regions transfer to a different aspect.
> **Fix:** Give the STORY brief count from insights, or state that it is a user-requested capability with no measured demand. Add a STORY-specific preference check.
> **Status:** upheld

### [WARN] party-ba — Merge-gate fixtures prove the check can fail on synthetic images, not that the looks work

**Quotes:**

> Each pass image must pass `evaluateRegions` through the real Chromium sampler; each fail image must fail with a named reason (`busy` or `contrast`).
> Every contract has at least one `text` region (validation fails otherwise), and each contract has a must-fail fixture
> **Problem:** Finding 21's concern was that the pixel check "can pass all." Synthetic fixtures authored by the same people who author the thresholds show that the sampler discriminates between hand-made extremes. They show nothing about whether the geometry of Full-bleed or Spotlight, with text bands over the raw scene, has a real image that passes. The proposal also admits the full-bleed measure is "no scrim credit", which is strict and untested on real pixels. Treating the fixtures as "the merge gate" answers finding 5, but finding 21 is only partly answered. The one-per-contract real check is the only link to real images.
> **Fix:** Say that the fixtures verify check discrimination only, and tie each look's shipped status to the real check rather than the fixtures.
> **Status:** upheld

### [WARN] party-ba — "Look" and "contract" carry the same load with shifting meaning, and the real-check cap arithmetic does not close

**Quotes:**

> (17 contracts: 2 STORY additions plus 5 looks × 3 sizes)
> **Hard cap: 34 hero image calls**
> one brief per new contract (17 hero image calls), plus **at most one re-run per failing contract**
> **Problem:** "Contract" is used for a (key, version, size) tuple, but the count mixes a new-version size addition (2) with new looks across all sizes (15). The "light" variants of Showcase and Editorial split are counted as both looks and variants. Showcase and Editorial split at SQUARE and PORTRAIT (v2 copies as is) are not rechecked, though `realCheck` is keyed on (key, current version, size). Version 2 therefore has `current: 2` with no `realCheck` record for the carried-over sizes, and the resolver would downgrade them to classic on unattended surfaces. The build ambiguity is real: do those two looks get unattended access, and at which sizes? The cap of 34 equals exactly 2 x 17, so it allows at most one re-run per contract. That leaves no allowance for a contract failing twice.
> **Fix:** Define "contract" once and state whether v2 SQUARE and PORTRAIT inherit v1's OP-1 result for `realCheck`. State what happens when a contract still fails after its one re-run.
> **Status:** upheld

### [NOTE] party-ba — Fallback visibility is promised but the data source is undecided

**Quotes:**

> from events 006 already emits or one new field on them. The spec decides which.
> is a fallback-rate-per-look section on `/admin/insights` wanted now, or is the composition stamp enough until there is usage?
> **Problem:** Finding 19 is claimed as answered by showing fallbacks per look. The proposal both lists the insights section as in scope and asks whether it is wanted, so the answer to finding 19 is not settled. There is also no criterion for what fallback rate would count as the look failing in production.
> **Fix:** Decide in the proposal, and state a threshold at which a look is withdrawn from unattended use.
> **Status:** upheld

### [BLOCK] party-po — Seven looks and 17 contracts are bought up front with no cheaper cut line, and no use data justifies five of them

**Quotes:**

> Five new looks (`product-showcase-light`, `editorial-split-light`, `abstract-forms`, `full-bleed-scene`, `spotlight`), each at SQUARE, PORTRAIT and STORY.
> OP-1 showed the styled looks are wanted
> It covered two looks at two sizes; it says nothing about the new ones.
> **Problem:** The only evidence of value is OP-1 on two looks. Five more looks at three sizes each means 15 new contracts plus 2 STORY additions. Each contract needs a pass fixture, a fail fixture, prompt wording, tuning and a real-image render. Open Question 4 asks whether fewer sizes would do, but the proposal never prices the cheaper variant. The cheapest variant that captures the stated value is a first cut that does two things:

- Add STORY to the two existing looks. This is a data row each, and it is the user's explicit problem 1.
- Ship one or two new looks that fix the "six of eight styles default to classic" problem. Full-bleed scene (Event, Hiring) and Spotlight (Promotion, Milestone) between them cover four of the six classic-default rows.

The `-light` variants and Abstract forms could wait for usage data. The proposal has no cut line, and its own estimate is about 25 files and "large".
**Fix:** Name a cut line. Either ship STORY plus Full-bleed and Spotlight first, with the other three looks as a follow-up after fallback rates are known, or state why the full set cannot be sequenced.
**Status:** upheld

### [WARN] party-po — The unattended-surface gate costs the whole real-image check and returns value only to a path the user did not size

**Quotes:**

> **Hard cap: 34 hero image calls**; the runner refuses to go past it.
> Scheduled, MCP and ACP posts are always classic
> A contract passes when its render keeps the style (no fallback) and the user marks it acceptable.
> **Problem:** The 34-call real check, plus operator time to judge 17 or more renders, exists mainly to populate the `realCheck` allow-list that unlocks scheduled, MCP and ACP use. The proposal gives no number for how many unattended posts exist or would use a look. It also never prices the cheaper alternative: leave unattended surfaces classic and skip the allow-list. That removes the `realCheck` record, the `unproven-classic` note and the resolver branch. The pass bar is one acceptable render per contract, which is a single sample. The operator-attention cost is unstated.
> **Fix:** State the expected volume of unattended styled posts and the operator time budget, or defer the allow-list to a later change that covers only the looks interactive users actually pick.
> **Status:** upheld

### [WARN] party-po — Shipped defaults silently move five post styles onto unproven looks, and no running cost is stated for the slower render

**Quotes:**

> **Post-style defaults move** in a new post-style version (`versions[2]`, never an edit): Promotion → Spotlight, Event → Full-bleed scene, Hiring → Full-bleed scene, Tip → Abstract brand forms, Milestone → Spotlight.
> It takes longer: 11 to 22 s with `IMAGE_QUALITY` unset, on OP-1's numbers.
> **Problem:** A user who never edits anything gets five post styles that previously rendered classic and now render a hero look on every interactive brief. That is a latency and behaviour change on upgrade. The real check is a tuning step and not a merge gate, so the default can move onto a look with no `realCheck` record. The "no new call" claim hides the cost of a failed pixel check, which wastes the hero generation and reuses it as classic. The expected fallback rate is not stated (OP-1 saw 2 of 12 renders record layout-violation observations).
> **Fix:** Make a default move conditional on the look having a `realCheck` record, or ship new looks as opt-in picks first. State the expected fallback rate and the wasted-call cost.
> **Status:** upheld

### [NOTE] party-po — Insights fallback section is optional scope with the answer already listed as an open question

**Quotes:**

> - Fallback outcomes per look on `/admin/insights`.
>
> 5. **Insights:** is a fallback-rate-per-look section on `/admin/insights` wanted now, or is the composition stamp enough until there is usage?
>    **Problem:** The section is listed In Scope and also raised as an open question, so the scope contradicts itself. The composition stamp already records the outcome per draft, and a handoff evidence query gave OP-1 its data. A UI section is recurring maintenance with no stated decision it serves. It is the first thing to defer if the change is split.
>    **Fix:** Default Open Question 5 to "stamp only, with a handoff query", and move the insights section to the follow-up.
>    **Status:** upheld

### [BLOCK] party-security — The unattended allow-list is a hand-editable code record with no link to the evidence or to the contract it vouches for

**Quotes:**

> - **The allow-list:** each contract carries a `realCheck` record (`{ passedOn, renders }`), written into the dataset only from the real-image check's results. Unset means unproven.
>   `resolvePostStyle` lets a queue entry, an MCP call or an ACP call use a non-classic look **only when the contract at (key, current version, size) has a `realCheck` record**.
>   It is a tuning step and the allow-list input, never a merge gate.
>   **Problem:** The resolver only checks that a `realCheck` record exists. The word "only" in "written into the dataset only from the real-image check's results" states an intention, and nothing enforces it. The record is a literal in `composition.ts`, so any commit can add one, including one written by the implementing subagent. That subagent has a reason to: the unattended-styled branch needs a proven contract before E2E can exercise it, and the real check is "never a merge gate", so it may not have run when the code merges. A made-up `{ passedOn, renders }` looks identical to a real one, and the resolver would then let scheduled auto-publish use the look. The record is also not tied to the geometry it vouches for. Once a contract's rectangles or subject wording change after a pass, the old record still covers it, so the pass applies to a contract that was never rendered. Round 2 strengthens this finding. party-architect (no mechanism from runner output to code; no test seam for the allowed branch) and party-visionary (nothing ties the runner's output to the record; the record survives changes to the prompt, model and thresholds) reach the same gap from their own lenses. party-architect's "allowed branch has no data to test against" names the exact pressure that would lead someone to seed a fake record.
>   **Fix:** Store each operator verdict in a committed results file: contract key, version, size, a fingerprint of the contract's measured fields plus the hero prompt version and image model (party-visionary's fingerprint), the run id, and the verdict. Make `realCheck` reference that file. Add a unit test that fails when a record has no matching result, or when the stored fingerprint differs from the current one. Test the allowed branch through an injected allow-list (party-architect's seam), gated like the other `MOCK_AI` seams and inert in production. Never satisfy the test with a seeded dataset record.
>   **Status:** upheld

### [BLOCK] party-security — No way to pull a misbehaving look off unattended auto-publish short of a code change and redeploy

**Quotes:**

> **No migration expected:** `Brief.imageStyle` is free text, the stamp is JSON, and the allow-list lives in code.
>
> - `resolvePostStyle` lets a queue entry, an MCP call or an ACP call use a non-classic look **only when the contract at (key, current version, size) has a `realCheck` record**.
>   **Problem:** Once a contract is allow-listed, `SCHEDULE_PUBLISH` and `PUBLISH_NOW` queue entries publish posts in that look to LinkedIn and Instagram with no person in the loop. That publish leaves the system and cannot be undone. The real check rests on one render per contract, which party-ba and party-visionary both call too weak, so a look can pass and still produce illegible or off-brand posts in production. The proposal gives no recovery path for that case. Revoking a look means a commit, a merge to `main` and a redeploy. The deploy path depends on the dead Coolify token named in the project context, so "a redeploy" is not even a reliable recovery today. Until it lands, every queued entry keeps publishing in the look. party-visionary's note ("revoking `realCheck` is currently a code change") and party-ba's request for a withdrawal threshold both assume an operator lever the proposal never provides.
>   **Fix:** Add an operator off switch that takes effect at runtime without a deploy, such as a team setting or a single DB flag that `resolvePostStyle` reads, which sends unattended runs back to classic. List it in the handoff as the recovery step. The narrowest form is a per-look "unattended disabled" set that the resolver checks before the `realCheck` record.
>   **Status:** upheld

### [WARN] party-security — The 34-call cap is only stated as a runner refusal, so a crash or restart can reset it and timed-out calls may go uncounted

**Quotes:**

> **Hard cap: 34 hero image calls**; the runner refuses to go past it.
> plus **at most one re-run per failing contract** after tuning.
> **Problem:** Image calls cost money and cannot be refunded. The proposal does not say whether the count persists across runner invocations, or whether it counts attempts or completed renders. Tuning means several runner restarts. If the count lives in process memory, or counts only completed renders, the cap resets or under-counts, and timed-out hero calls still bill. The cap then fails open while the runner reports that it held. party-architect's note adds that the counter has no stated test.
> **Fix:** Keep an append-only call ledger, either a file in the OP results directory or a table in the scratch database. Write each hero call to it before the request goes out, and count attempts, including timeouts and errors. Refuse to start when the ledger is at the cap, and print the running total on every call.
> **Status:** upheld

### [WARN] party-security — The fallback visibility that answers finding 19 is put up for removal in the open questions

**Quotes:**

> - **Fallbacks are seen** (finding 19): the look outcome per draft (styled, or fell back with its reason) is shown per look key on `/admin/insights`, from events 006 already emits or one new field on them. The spec decides which.
>
> 5. **Insights:** is a fallback-rate-per-look section on `/admin/insights` wanted now, or is the composition stamp enough until there is usage?
>    **Problem:** Two kinds of unattended degradation produce a post with no visible signal. In the first, a look fails the pixel check on a scheduled run and is published as classic. In the second, a run is downgraded with `unproven-classic`. OQ5 offers to drop the only aggregate signal, and the proposal names no per-entry place where `unproven-classic` shows. party-architect's finding confirms that no reader of the new note is named. A per-draft stamp can be read only one draft at a time, so a look that falls back on most unattended runs goes unnoticed and is trusted.
>    **Fix:** Do not offer finding 19's answer as optional. Either ship the fallback-per-look section, or at least show the fallback or `unproven-classic` reason on the queue entry's completed line, the way 027 shows `heldReason`. Derive both from the composition stamp at its write site, so there is a single writer (party-architect).
>    **Status:** upheld

### [WARN] party-security — The new post-style version silently changes the look an already planned auto-publish entry will publish

**Quotes:**

> - **Post-style defaults move** in a new post-style version (`versions[2]`, never an edit): Promotion → Spotlight, Event → Full-bleed scene, Hiring → Full-bleed scene, Tip → Abstract brand forms, Milestone → Spotlight.
>   **Problem:** The proposal does not say whether a queued entry resolves its style version when it is created or when it runs. If it resolves at run time, an Event or Hiring entry that an admin approved as classic auto-publish starts publishing a full-bleed scene, with text over the raw image, once its contract is allow-listed. Nobody sees the change before it goes out. 027 needed a mandatory release note for the same class of change.
>   **Fix:** Either pin the post-style version on the queue entry when it is created, or state the run-time switch in a release note and show the resolved look on the queue row before it runs.
>   **Status:** upheld

### [WARN] party-security — On band looks, the check measures the image, and nothing stated stops the design from putting text outside the measured band

**Quotes:**

> | Full-bleed scene (`full-bleed-scene`) | new | light | SQUARE, PORTRAIT, STORY | a **text band** (bottom 35 to 40%) over the scene: calm and contrast on the raw image, no scrim credit | Event, Hiring |
>
> - The image, design and refine prompts and the layout observation read the new contracts (they already read the dataset; the spec checks each).
>   **Problem:** In the split looks, text sits beside the image. In Full-bleed and Spotlight, text sits over it, so a design that ignores the band puts the headline straight onto the busy scene. The pixel check measures the generated image's band and passes. The only thing that sees where the text actually landed is called an "observation", and the proposal never says it holds a post or falls back. OP-1 recorded `layout-violation` on 2 of 12 renders, a figure party-po cites, so this already happens. On an unattended surface the check passes and the illegible post is published.
>   **Fix:** For looks whose text regions overlap the image, make a layout violation fail closed on unattended surfaces: hold the post or re-render it as classic, with no second image call. State this rule in the spec, next to the band geometry.
>   **Status:** upheld

### [WARN] party-security — One fail fixture per contract proves only one of the two measured properties is active

**Quotes:**

> Each pass image must pass `evaluateRegions` through the real Chromium sampler; each fail image must fail with a named reason (`busy` or `contrast`).
> **Problem:** Each contract and size gets one fail image, and it can fail for either reason. A contract whose only fail image fails on `busy` never shows that its contrast test runs at the stated polarity. That matters most for the light looks, which are the reason `textTone: dark` exists. If the fixtures are generated from the contract's own `textTone`, a mislabelled tone produces matching pass and fail images, and the gate passes while measuring the wrong polarity. party-ba's point that the fixtures prove discrimination only makes this worse: if the fixtures are the only merge gate, they must at least prove both discriminators.
> **Fix:** Require two fail fixtures per contract and size, one failing on `busy` and one failing on `contrast`. Build the contrast fixtures from the look's intended backdrop as declared in the spec, independent of the `textTone` field they test.
> **Status:** upheld

### [NOTE] party-security — Whether the four copied v2 contracts are allow-listed is left unstated

**Quotes:**

> | Showcase (`product-showcase`) | **version 2** adds STORY; SQUARE/PORTRAIT copied as is | light | SQUARE, PORTRAIT, **STORY** | the text area: calm (busy) and light-text contrast | Launch |
> (17 contracts: 2 STORY additions plus 5 looks × 3 sizes)
> **Problem:** The real check renders 17 contracts. It leaves out the SQUARE and PORTRAIT contracts of `product-showcase` v2 and `editorial-split` v2, which back the Launch and Announcement defaults. party-architect, party-ba and party-visionary flag the same gap from the other side: as written, these contracts can never qualify. I am refining the reason, not the finding. party-ba notes that OP-1's evidence (6 briefs per look) is stronger than the proposed one-render bar, so the strength of OP-1's evidence is not my objection. My objection is that any carry-over would be a hand-copied record under an unwritten rule, which is the entry point in my first BLOCK.
> **Fix:** State the carry-over rule explicitly. Either these four contracts start without a record and join the run (with the cap raised to match), or they inherit OP-1's result through a recorded entry in the results file, with a fingerprint that is checked by the test. Never inherit by hand.
> **Status:** upheld

### [WARN] party-security — Rebuttal to party-po: "stamp only, with a handoff query" leaves unattended degradation silent

**Quotes:**

> - Fallback outcomes per look on `/admin/insights`.
>
> 5. **Insights:** is a fallback-rate-per-look section on `/admin/insights` wanted now, or is the composition stamp enough until there is usage?
>    **Problem:** party-po's NOTE proposes defaulting OQ5 to "stamp only, with a handoff query" on cost grounds. A handoff query only shows a fallback when someone thinks to run it. The failure here is a scheduled post that publishes as classic, or never leaves `unproven-classic`, on a surface with no person in the loop. That is exactly the case where nobody is looking. OP-1's query worked because an operator was running OP-1. In production there is no such run. Cutting the insights section is a fair scope call, but cutting every push signal along with it is a failure-visibility regression from what finding 19 asked for.
>    **Fix:** If the insights section is deferred, keep a per-entry signal: the fallback or `unproven-classic` reason on the queue entry's completed line, derived from the stamp, as in my fallback-visibility WARN above.
>    **Status:** upheld

### [NOTE] party-security — Rebuttal to party-po: making defaults conditional on `realCheck` turns an allow-list write into a silent change to what queued entries publish

**Quotes:**

> - **Post-style defaults move** in a new post-style version (`versions[2]`, never an edit): Promotion → Spotlight, Event → Full-bleed scene, Hiring → Full-bleed scene, Tip → Abstract brand forms, Milestone → Spotlight.
>   **Problem:** party-po's fix for its defaults WARN is to "make the defaults conditional on that record". Under that rule, adding a `realCheck` entry changes the default look for every brief and every queued entry of that style, with no post-style version bump and no `PROMPT_VERSION` move to show it happened. The allow-list then controls interactive defaults as well as unattended access. That widens the impact of the unverified record in my first BLOCK, and it makes the queue-drift case in my post-style WARN happen on an allow-list commit rather than a release.
>   **Fix:** If defaults wait for proof, move them in a new post-style version written after the record exists, so the switch is versioned and visible. Do not make a data-dependent branch inside one released version.
>   **Status:** upheld

### [BLOCK] party-visionary — Five new look keys become permanent through two immutable datasets and a free-text column, and no rule says how to rename or retire them

**Quotes:**

> - **Size:** architectural (the look keys and the `realCheck` allow-list are a vocabulary that the resolver, the stamp, the unattended surfaces and 025 all depend on)
> - **Post-style defaults move** in a new post-style version (`versions[2]`, never an edit): Promotion → Spotlight, Event → Full-bleed scene, Hiring → Full-bleed scene, Tip → Abstract brand forms, Milestone → Spotlight. General, Launch and Announcement stay. This bumps `POST_STYLES_REVISION`, so `PROMPT_VERSION` moves with it (027's version rule).
> - **Risk:** medium. New contracts may fail on real pixels often until tuned; a failure already falls back to classic with no second image call, and unattended surfaces see a look only after it passed. **No migration expected:** `Brief.imageStyle` is free text, the stamp is JSON, and the allow-list lives in code. The spec confirms.
>   **Problem:** The proposal calls the look keys a vocabulary that other parts of the system depend on. It never sets the rule that 027 wrote for post-style keys: never renamed, never reused, and a retired key stays resolvable. The rule is needed here because these keys get pinned in three places a later change cannot edit. (a) Post-style `versions[2]` names `spotlight`, `full-bleed-scene` and `abstract-forms`, and 027's version rule forbids editing a released version. So those names must resolve for as long as any draft is stamped with that version. (b) Every composition stamp in `Draft`/`DraftRevision` JSON stores the key. (c) `Brief.imageStyle` is free text, so no enum rejects a stale value. Take the plausible next change: insights show Spotlight falling back on most Promotion posts, and someone wants to retire it. Or someone wants to rename `abstract-forms` once 025 adds a real "forms" look. The proposal gives no path for either. The released post-style version can't be edited to point elsewhere. Nothing defines what the resolver does when a post-style default names a retired look. Refine and regenerate on drafts stamped with the old key would have nothing to resolve to. Shipping makes all five keys permanent without anyone having decided that. No round-1 finding from another seat addresses key retirement. The PO cut line, which defers three looks, shrinks the set of keys this change makes permanent but does not supply the rule.
>   **Fix:** Extend 027's key rule to look keys explicitly: never renamed, never reused, and a retired look stays resolvable but is hidden from pickers. State what the resolver does when a post-style version's default names a retired look: classic, with a named note such as `retired-classic`. Add a test that fails if any post-style version names a key missing from the dataset.
>   **Status:** upheld

### [WARN] party-visionary — The `<base>-<variant>` grammar can't be parsed from the key, because bases already contain hyphens

**Quotes:**

> - Dataset validation: at least one `text` region per contract; the variant key grammar `<base>-<variant>`; pass and fail fixtures for every (key, version, size).
> - Five new looks (`product-showcase-light`, `editorial-split-light`, `abstract-forms`, `full-bleed-scene`, `spotlight`), each at SQUARE, PORTRAIT and STORY.
>   **Problem:** Every multi-word base (`product-showcase`, `editorial-split`, `abstract-forms`, `full-bleed-scene`) already has the shape `<base>-<variant>`. So syntax alone can't tell a variant from a base. A test can enforce the grammar only by matching each key against existing base keys as a prefix. That makes a key's meaning depend on which other keys exist. Suppose a later change adds a plausible base such as `full-bleed` (no scene) or `abstract`. `full-bleed-scene` then silently becomes "a variant of `full-bleed`". The grammar test either fails on a key that was legal at merge or quietly misclassifies it. Any reader that groups looks by family must repeat the same lookup, and one that splits on the last hyphen gets it wrong. Examples are the per-look insights section and 025 deciding which family takes product screenshots. Once the keys are persisted (finding above), the grammar is a published contract and can't be redrawn. party-architect raised the same defect from the merge-day side, where the test has no defined input. This finding is about what happens to it after merge, and both converge on the same fix.
>   **Fix:** Store the family as an explicit field on each look (for example `family: 'product-showcase'`, `variant: 'light' | null`). Test that a variant's key equals `${family}-${variant}`, and fail validation when a new base key is a prefix of an existing key.
>   **Status:** upheld

### [WARN] party-visionary — A `realCheck` keyed to (key, current version, size) is revoked by changes that don't need it and survives changes that do

**Quotes:**

> The spec sets the exact rectangles, subjects and band sizes. Existing versions are never edited (the dataset's immutability rule): STORY arrives as `versions[2]` with `current: 2`, and drafts stamped `v1` keep resolving.
>
> - **The allow-list:** each contract carries a `realCheck` record (`{ passedOn, renders }`), written into the dataset only from the real-image check's results. Unset means unproven.
> - `resolvePostStyle` lets a queue entry, an MCP call or an ACP call use a non-classic look **only when the contract at (key, current version, size) has a `realCheck` record**. Otherwise it is classic, with a new note `unproven-classic`. Interactive briefs may use every active look at every declared size, as today (a failed pixel check already falls back to classic with no second image call).
>   **Problem:** The version number belongs to the look, not to the size. So the next change that adds a size, or retunes one size's rectangle, creates `versions[n+1]`. That clears the allow-list for every size of the look. Unattended use falls back to classic until a new paid operator run, even for sizes whose geometry was copied unchanged. party-architect (findings 1 and 2) and party-security (the NOTE on the four copied contracts) found the merge-day form of this: the v2 SQUARE/PORTRAIT copies. That supports the finding and does not answer it. Their content-hash fixes cover geometry only. The record also fails in the other direction. A real check proves the combination of contract, hero prompt wording, image model and `evaluate.ts` thresholds, and only the contract is in the key. A later change might rewrite the hero prompt wording (moving `PROMPT_VERSION`) or replace `gpt-image-2`. Every `realCheck` then stays set while proving nothing about the new pipeline, and nobody notices until an unattended post renders badly.
>   **Fix:** Key the record per (key, size) and store a fingerprint with it: that size's geometry, the hero prompt version and the image model. The resolver treats a mismatch as unproven. Alternatively, state in the proposal which future edits clear `realCheck` and which carry it over, and add a test that enforces the list.
>   **Status:** upheld

### [WARN] party-visionary — The light looks copy their base's whole contract, so every later geometry fix must be made twice and checked twice

**Quotes:**

> **Light polarity is data, not new code.** `evaluateRegions` already takes a `textTone` of `light` or `dark` (`src/lib/designData/evaluate.ts:29-35`). The light looks need fixtures and prompt wording, not a new check.
>
> - Five new looks (`product-showcase-light`, `editorial-split-light`, `abstract-forms`, `full-bleed-scene`, `spotlight`), each at SQUARE, PORTRAIT and STORY.
>   **Problem:** Polarity is data, but it sits at the wrong level. Each light variant is its own key with its own versions, contracts, fixtures and `realCheck`. So the base geometry exists in two copies for each of six (look, size) pairs. Take the next foreseeable change: tuning after the real check widens the `editorial-split` STORY text rectangle as v3. `editorial-split-light` keeps the old rectangle and nothing fails. The two drift until someone compares a light and a dark story post side by side. Every fix then costs two version bumps, two fixture pairs and two paid re-checks. Each future look that gets a light twin doubles the cost again, and 027b sets the template that makes this the norm. No other seat contested this. The PO cut line would defer the light variants, which postpones the problem but does not remove it.
>   **Fix:** Model a variant as its base plus overrides (`textTone`, subject wording), so geometry edits reach the variant automatically. If the copy is intentional, say so, and add a test that the variant's regions equal its base's at matching versions.
>   **Status:** upheld

### [WARN] party-visionary — The only tool that writes the allow-list lives in a closed change's folder, and nothing ties its output to the record in code

**Quotes:**

> - **Real-image check (operator-run, capped):** the 009 OP-1 runner (`.specclaw/changes/009-hero-image-design/op1/run-op1.mjs`) is extended to render **one brief per new contract** (17 hero image calls), plus **at most one re-run per failing contract** after tuning. **Hard cap: 34 hero image calls**; the runner refuses to go past it. A contract passes when its render keeps the style (no fallback) and the user marks it acceptable. It runs locally on a scratch database, as OP-1 did. It is a tuning step and the allow-list input, never a merge gate.
>   **Problem:** This runner becomes the only writer of a record that controls what unattended surfaces do in production. It sits in a completed change's folder, outside `src/` and `scripts/` and outside tsc, lint and CI, and it moves when `/specclaw:archive` archives 009. 025, Phase 3 and every new look will have to find and extend a 009 artifact to get proof. The cap of 34 is two times 17, a figure tied to this change's contract count, so the next run must work it out again. And `realCheck` is typed into the dataset by hand from the runner's output, so nothing fails when the two disagree. Three seats raised the same seam in round 1. party-architect (NOTE) placed it at merge. party-security (BLOCK, and the WARN on the ledger) covered it as forgery and spend. This finding covers the cost to every future look that needs proof. The committed results file that security proposes is the same remedy as the one here.
>   **Fix:** Move the runner to `scripts/`, where `purge-analytics.mjs` already sits. Compute the cap from the dataset as two times the number of contracts without a record. Have the runner write a committed results file, and add a test that every `realCheck` matches an entry in it.
>   **Status:** upheld

### [WARN] party-visionary — "One render and the user's approval" becomes the standard of proof every later look will copy

**Quotes:**

> 3. **Real-check pass bar:** per contract, "kept the style and the user marks it acceptable" (proposed), or a preference bar like OP-1's 4 of 6 per look (more renders, over the cap)?
> **Problem:** Whatever bar this change uses to admit a look to unattended surfaces, 025's screenshot looks and Phase 3 will cite it as already established. OP-1 set the bar at six briefs per look against a preference threshold. The proposed default drops it to one render per contract, judged by eye. The record (`{ passedOn, renders }`) keeps neither the brief used nor the judgement. The lesson a contributor takes away is "one render proves a look". That holds only while the looks stay this close to OP-1's two proven ones. It will be wrong for 025, where the subject is a product screenshot with failure modes no one has seen yet. party-ba and party-po attacked the same bar as weak evidence today. This finding is about the bar becoming the default that later looks copy, so the three are compatible.
> **Fix:** Whatever bar is chosen, write it down as a named rule. Store the brief id and the render reference in `realCheck`, so a later change can see what the proof consisted of and decide whether it carries over.
> **Status:** upheld

### [NOTE] party-visionary — Production fallback rates per look and the allow-list are two halves that never connect

**Quotes:**

> - **Fallbacks are seen** (finding 19): the look outcome per draft (styled, or fell back with its reason) is shown per look key on `/admin/insights`, from events 006 already emits or one new field on them. The spec decides which.
>   **Problem:** The allow-list is written once and only grows. The evidence that should promote or demote a look is live production fallback per contract. The proposal sends that evidence only to a page a person reads, and groups it by look key, not by the (key, version, size) triple that `realCheck` is keyed on. One small step would let a later change grant or revoke unattended use from real outcomes. Without that step, demoting a look that fails in production is always a hand-made code change, and comparing the page with the record needs a manual join. party-security's runtime off-switch (BLOCK) is the manual form of the same connection. If it is adopted, grouping the insights query by the identity the off-switch acts on lets a person see which entry to turn off.
>   **Fix:** Group the insights outcome query by the same identity `realCheck` uses, (key, version, size) or (key, size) if the fingerprint fix above is taken. State that revoking `realCheck` is currently a code change.
>   **Status:** upheld

## Dissent

No withdrawals.
