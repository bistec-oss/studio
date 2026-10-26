### [BLOCK] party-architect — Pixel-exact placement is handed to the design model, a layer that can only be asked

**Quotes:** > The screenshot stays pixel-exact; the model does not redraw it.
**Quotes:** > The image model draws only the device and scene, with the screen left blank. The design step places the real screenshot in that rect.
**Quotes:** > 5. **Design step:** the prompt gets the screenshot URL and the rect, and must place the screenshot exactly there (object-fit and rounding are set by the contract, not the model). `evaluateLayout` checks the box after render.
**Problem:** Placing a known image at a known rect, with a fixed fit and rounding, is arithmetic, and the proposal says the contract owns every input. It still sends the placement through the design model's prompt and checks the result afterwards. A prompt instruction is a request, not an invariant. The proposal never says what a failed post-render check does: no fallback reason, no fail-closed path. As written, the check has no stated outcome, so a post with a missing, moved or re-cropped screenshot has no defined exit. Three open questions exist only because of this choice of layer. OQ7 asks whether refine may move or remove the screenshot, because a model-written `<img>` is just more HTML for refine to edit. OQ4 worries that "the stored HTML must not keep an expiring URL", because the model writes the URL into the HTML. Step 8's tests can check placement only through a mocked seam, never against what the model actually wrote. party-security's round-1 BLOCK reaches the same fix through the render-failure path, and party-visionary's bucket and double-record findings both go away if placement is a code step. I uphold this finding. In round 2 I removed my round-1 claim about what `pathB.ts` contains, because I have not read that file. The finding stands on the proposal's text alone.
**Fix:** Make placement a code step. The model leaves the `composite` rect empty, with the same discipline as a `clear` region. After the model returns, code inserts an absolutely positioned element sized from the contract rect, in the same way the proposal-adjacent inline-asset splice restores assets just before render. Do this again on regenerate and refine. The stored HTML then holds a placeholder, which settles OQ4's expiry problem. Placement can be unit-tested with no model, and the post-render check becomes a guard on code rather than on a model. Name the reason that a failed check falls back with.
**Status:** upheld

### [BLOCK] party-architect — The per-brief screenshot choice has no named storage, and the migration list excludes one

**Quotes:** > - A per-brief choice of one kit screenshot, interactive Path B only.
**Quotes:** > 7. **UI:** an upload section for screenshots on the kit admin page, and a screenshot picker in the brief wizard. The `device-screen` card is shown only once a screenshot is chosen.
**Quotes:** > - **Migration:** one additive enum value (`ArtifactType.PRODUCT_SCREENSHOT`), with a manual down script.
**Problem:** The brief has to remember which screenshot was picked, because a regenerate re-runs the design from the brief. The proposal never says where that choice lives. It is either a new `Brief` column, which is a second migration that the Impact section says does not exist, or an entry in the existing `Brief.briefImages`, which already carries "`embed`/`reference` intent" and would gain a third meaning. Either way, the same commit must also change four things. (1) The `POST /api/briefs` body schema. (2) A check that the artifact id belongs to the brief's kit and team. (3) The generation and regenerate readers that pass the choice to the design step. (4) Any persisted wizard state, or Resume drops the pick. The only field the proposal names is the stamp (step 6), and a stamp records what ran, not what was asked for. No seat rebutted this. party-po's smaller slice (a per-brief embed) would still need a stated shape for the same choice, so this holds under either home.
**Fix:** Name the storage. Either add a `Brief` column with its migration and down script, or state a parsed shape inside an existing field. Then list the readers and writers that change with it.
**Status:** upheld

### [WARN] party-architect — A new artifact type does not by itself keep screenshots out of the `feedToAI` prompts

**Quotes:** > Reusing `REFERENCE_IMAGE` or `EXAMPLE_POST` would mix purposes. It would also put screenshots into every prompt that reads `feedToAI` artifacts.
**Quotes:** > - `PRODUCT_SCREENSHOT` kit artifacts: upload with validation (type, size, dimensions), list and delete, team-scoped (a cross-team id is 404).
**Problem:** The proposal's own sentence makes `feedToAI` the property that prompts read. That is a per-artifact flag, not a type, so adding an enum value does not change which artifacts a `feedToAI` reader selects. Unless the upload contract says how the flag is set for the new type, a screenshot uploaded with the flag on is fed into prompts as reference imagery. That is exactly the mixing the new value was meant to prevent. The upload contract also says nothing about the route's own type lists or the new dimension check. party-visionary's round-1 finding independently lists the readers that filter on the flag rather than the type. I uphold this finding as the merge-time contract gap. Visionary's finding is about the precedent for later asset types, so the two do not duplicate each other. In round 2 I removed my round-1 claims about the contents of unread files.
**Fix:** State the rule. Either the upload forces `feedToAI = false` for `PRODUCT_SCREENSHOT`, or every `feedToAI` reader filters the type out. Name the route's type-list changes and the dimension limits in the same commit.
**Status:** upheld

### [WARN] party-architect — OP-025 gates on a hand-written prompt and rect, not on the data contract the build ships

**Quotes:** > It is a script modelled on `scripts/look-check/` with its append-only ledger and hard cap. It sends a hand-written blank-screen prompt to `gpt-image-2` per size and runs the existing pixel check on the screen rect.
**Quotes:** > 2. **Image prompt:** generated from the data (`promptText.ts`). It asks for a flat, front-facing device whose screen fills the rect, blank and evenly lit.
**Quotes:** > 3. **Pixel check:** the screen rect must be blank, with a tighter bar than a `clear` region.
**Problem:** The go/no-go check runs before the `composite` purpose, the `device-screen` rects, the data-generated prompt and the tighter "blank" bar exist. So it has to measure a second, hand-held copy of each one. A pass does not show that the shipped prompt, rect and bar pass. The proposal also builds a second capped runner, with its own ledger, beside `scripts/look-check/`, so the record of real-image checks that later work reads would live in two places. party-security's round-1 WARN reaches the same conclusion about the threshold. Their extra point, recording the threshold and the prompt hash in the ledger, is compatible with this finding.
**Fix:** Either land the dataset entry, the prompt builder and the blank-screen threshold first (pure code, no model calls) and have OP-025 call them, or state that OP-025 tests a stand-in and must be re-run against the shipped contract. Say whether OP-025 extends `run-look-check.mjs` or replaces it, and where its pass or fail is recorded.
**Status:** upheld

### [WARN] party-architect — The screenshot's lifecycle is unspecified across the brief, the stamp and kit deletion

**Quotes:** > It also gives the picker a clear rule: the look is offered only when the brief has a screenshot.
**Quotes:** > 6. **Stamp:** `compositionStampSchema` gains an optional `screenshots` field (artifact ids). It is validated in code, so the stamp needs no migration.
**Quotes:** > A failure falls back to classic with a new reason, `screen-not-blank`, added to `FALLBACK_REASONS` (`stamp.ts:7`). The screenshot is then dropped, not pasted onto a classic post.
**Problem:** "Offered only when" is a picker rule, which is UI. The proposal never says whether `POST /api/briefs` rejects `device-screen` with no screenshot, or a screenshot with any other look. Kit admins can delete screenshots (that is in scope), but nothing says what a regenerate or refine does when the artifact id no longer resolves. `screen-not-blank` is the only new fallback reason, so a missing screenshot has no named way out. The proposal also does not say how the stamp's invariants extend. Is `screenshots` present on a `screen-not-blank` classic fallback, where the screenshot was dropped? Is it forbidden on a classic request? The field is plural, while more than one screenshot per post is out of scope. party-security's round-1 BLOCK on deletion covers the runtime harm. This finding covers the unspecified contract, and party-visionary's `requires:` field would be one way to give the server-side rule a home.
**Fix:** Add a server-side rule that checks `imageStyle` against the screenshot choice. Specify what happens when a referenced artifact is deleted: either a named fallback reason, or a refusal to delete while it is referenced. Add the `screenshots` invariants to the stamp's validation, and make the field's cardinality match the scope.
**Status:** upheld

### [WARN] party-architect — The precedence between an `embed` brief image and the composite screen is undefined

**Quotes:** > A per-brief upload (`Brief.briefImages`, `embed`/`reference` intent) is the other plausible home, for a one-off "this feature, this week" screenshot. Whether to support it too is an open question.
**Quotes:** > 2. **Where screenshots live:** kit only (recommended), or also a per-brief upload? If both, which wins?
**Problem:** The proposal names an existing mechanism, `embed`-intent brief images, that already puts a user's image into the design. Even with kit-only screenshots, a `device-screen` brief can still carry `embed` images through that mechanism, and nothing tells the design step to keep them out of the composite rect. Two paths, the existing embed path and the new composite path, would then both write into the screen area. OQ2's "which wins" is open only for the case where both homes are supported, but the collision exists under the recommended kit-only home too. It also exists under a code-inserted composite: the stacking order against a model-placed embed image is then unspecified.
**Fix:** State that the `composite` rect is off-limits to `embed` images, or that `device-screen` refuses briefs that carry them.
**Status:** upheld

### [NOTE] party-architect — "Exactly one `composite` region per contract" would fail the four released looks as written

**Quotes:** > `validate.ts` requires exactly one `composite` region per contract.
**Problem:** Read literally, the rule applies to every contract in the dataset, and the four released looks have no `composite` region. The intended rule is probably "exactly one in a `device-screen` contract, and at most one in any contract". An implementer has to guess which.
**Fix:** Scope the rule to the look, or state it as "at most one per contract, and exactly one for `device-screen`".
**Status:** upheld

### [NOTE] party-architect — Rebuttal to party-po's cut line: the design step cannot land in "engine" without the screenshot source from "surface"

**Quotes:** > 5. **Design step:** the prompt gets the screenshot URL and the rect, and must place the screenshot exactly there (object-fit and rounding are set by the contract, not the model). `evaluateLayout` checks the box after render.
**Quotes:** > 7. **UI:** an upload section for screenshots on the kit admin page, and a screenshot picker in the brief wizard.
**Quotes:** > - **Migration:** one additive enum value (`ArtifactType.PRODUCT_SCREENSHOT`), with a manual down script.
**Problem:** party-po's NOTE splits the work into "engine" (items 1 to 5) and "surface" (items 6 and 7, plus the migration). That is a coupling error, not a scope one. Item 5 consumes a screenshot URL, and the only source the proposal names is a `PRODUCT_SCREENSHOT` artifact (the migration) chosen on the brief (storage the proposal has not named; see my per-brief storage BLOCK). An engine group containing item 5 cannot be exercised, except against a mock, until the artifact type and the brief's stored choice exist. Items 1 to 4 (dataset, prompt, pixel check, fixtures) are self-contained, so a structurally clean engine group is items 1 to 4. Items 5 and 6 (the design step and the stamp field that records its input) must land together with the artifact type and the brief storage. This states only which items must land together. The release order is party-po's call.
**Fix:** If the work is split, draw the line after item 4. Keep items 5 and 6 in the same group as the artifact type, the brief storage and the migration.
**Status:** upheld
