### [BLOCK] party-architect — Pixel-exact placement is handed to the design model, a layer that can only be asked

**Quotes:** > The screenshot stays pixel-exact; the model does not redraw it.
**Quotes:** > The image model draws only the device and scene, with the screen left blank. The design step places the real screenshot in that rect.
**Quotes:** > 5. **Design step:** the prompt gets the screenshot URL and the rect, and must place the screenshot exactly there (object-fit and rounding are set by the contract, not the model). `evaluateLayout` checks the box after render.
**Problem:** Placing a known image at a known rect with a fixed fit and rounding is arithmetic, and the inputs are all data the proposal says the contract owns. The proposal still routes it through the design model's prompt and then checks the result afterwards. A prompt instruction is a request, not an invariant. The proposal also never says what happens when the post-render check fails. In the Path B pipeline the 009 layout observation is record-only ("A violation is recorded and shown, never a fallback", `src/lib/agent/pathB.ts`), so as written a post with a missing, moved or re-cropped screenshot ships with an observation attached. Three open questions only exist because of this choice of layer. OQ7 asks whether refine may move or remove the screenshot, because a model-written `<img>` is just more HTML for refine to edit. OQ4 worries that "the stored HTML must not keep an expiring URL", because the model writes the URL into the HTML. And step 8's tests can only check placement through a mocked box seam, never against what the model actually wrote. This is the same lesson the repo learned at the parse boundary: enforce the rule in code, not in the prompt.
**Fix:** Make placement a code step. The model leaves the `composite` rect empty, which is the same discipline as a `clear` region. After the model returns, code inserts an absolutely positioned element sized from the contract rect, the same way `restoreInlineAssets` splices assets back just before render. Do it again on regenerate and refine. Under this design the stored HTML holds a placeholder, which settles OQ4's expiry problem. The placement is unit-testable with no model, and the post-render check becomes a guard on code instead of on a model.
**Status:** upheld

### [BLOCK] party-architect — The per-brief screenshot choice has no named storage, and the migration list excludes one

**Quotes:** > - A per-brief choice of one kit screenshot, interactive Path B only.
**Quotes:** > 7. **UI:** an upload section for screenshots on the kit admin page, and a screenshot picker in the brief wizard. The `device-screen` card is shown only once a screenshot is chosen.
**Quotes:** > - **Migration:** one additive enum value (`ArtifactType.PRODUCT_SCREENSHOT`), with a manual down script.
**Problem:** The brief has to remember which screenshot was picked, because regenerate-design re-runs the design from the brief. The proposal never says where that choice lives. It is either a new `Brief` column, which is a second migration the Impact section says does not exist, or an entry in the existing `Brief.briefImages` JSON, which already means "`embed`/`reference` intent" and would gain a third meaning. Either way the same commit must also change: the `POST /api/briefs` body schema, plus a team check that the artifact id belongs to the brief's kit and team; the generation and regenerate readers that pass it to the design step; and any persisted wizard state, or Resume will drop the pick. Today only the stamp field (step 6) is named, and a stamp records what ran, not what was asked for.
**Fix:** Name the storage, either a `Brief` column with its migration and down script or a stated, parsed shape inside an existing field. Then list the readers and writers that change with it.
**Status:** upheld

### [WARN] party-architect — A new artifact type does not by itself keep screenshots out of the `feedToAI` prompts

**Quotes:** > Reusing `REFERENCE_IMAGE` or `EXAMPLE_POST` would mix purposes. It would also put screenshots into every prompt that reads `feedToAI` artifacts.
**Quotes:** > - `PRODUCT_SCREENSHOT` kit artifacts: upload with validation (type, size, dimensions), list and delete, team-scoped (a cross-team id is 404).
**Problem:** In the proposal's own words, `feedToAI` is a property that prompts read. It is a per-artifact flag, not a type. The existing upload route takes it from the form for every type, and Path B selects artifacts on `feedToAI: true` with no type filter (`pathB.ts`, `brandKitArtifact.findMany({ where: { brandKitId, feedToAI: true } })`). So a `PRODUCT_SCREENSHOT` uploaded with the flag set lands in the freeform design prompt as "brand reference imagery". That is the mixing the new enum value was meant to prevent. The upload contract is also silent on the route's own type lists (`VALID_TYPES`, the raster allow-list `IMAGE_TYPES`) and on the new dimension check. The route has no dimension check today.
**Fix:** State the rule. Either the upload forces `feedToAI = false` for `PRODUCT_SCREENSHOT`, or every `feedToAI` reader filters the type out. Also name the route's type-list changes and the dimension limits.
**Status:** upheld

### [WARN] party-architect — OP-025 gates on a hand-written prompt and rect, not on the data contract the build ships

**Quotes:** > It is a script modelled on `scripts/look-check/` with its append-only ledger and hard cap. It sends a hand-written blank-screen prompt to `gpt-image-2` per size and runs the existing pixel check on the screen rect.
**Quotes:** > 2. **Image prompt:** generated from the data (`promptText.ts`). It asks for a flat, front-facing device whose screen fills the rect, blank and evenly lit.
**Quotes:** > 3. **Pixel check:** the screen rect must be blank, with a tighter bar than a `clear` region.
**Problem:** The go/no-go check runs before the `composite` purpose, the `device-screen` rects, the data-generated prompt and the tighter "blank" bar exist. So it necessarily measures a second, hand-held copy of each: a different prompt, a rect not taken from the dataset, and either the `clear` bar or a threshold invented for the script. A pass does not show that the shipped prompt, rect and bar pass. The proposal also builds a second capped runner with its own ledger next to `scripts/look-check/`, so the "real-image check" record that later work reads would live in two places.
**Fix:** Either land the dataset entry, the prompt builder and the blank-screen threshold first (pure code, no model calls) and have OP-025 call them, or say plainly that OP-025 tests a stand-in and must be re-run against the shipped contract. Say whether OP-025 extends `run-look-check.mjs` or replaces it, and where its pass or fail is recorded.
**Status:** upheld

### [WARN] party-architect — The screenshot's lifecycle is unspecified across the brief, the stamp and kit deletion

**Quotes:** > It also gives the picker a clear rule: the look is offered only when the brief has a screenshot.
**Quotes:** > 6. **Stamp:** `compositionStampSchema` gains an optional `screenshots` field (artifact ids). It is validated in code, so the stamp needs no migration.
**Quotes:** > A failure falls back to classic with a new reason, `screen-not-blank`, added to `FALLBACK_REASONS` (`stamp.ts:7`). The screenshot is then dropped, not pasted onto a classic post.
**Problem:** "Offered only when" is stated as a picker rule, which is UI. The proposal never says whether `POST /api/briefs` rejects `device-screen` with no screenshot, or a screenshot with some other look. Kit admins can delete screenshots (in scope), but nothing says what a regenerate or refine does when the brief's or the stamp's artifact id no longer resolves. `screen-not-blank` is the only new fallback reason, so a missing screenshot has no named exit. The stamp's existing invariants also have to be extended, and the proposal does not say how: is `screenshots` present on a `screen-not-blank` classic fallback, where the screenshot was dropped, and is it forbidden on a classic request? The field is plural, while more than one screenshot per post is out of scope.
**Fix:** Add a server-side rule for `imageStyle` against the screenshot choice. Specify what happens when a referenced artifact is deleted, either a named fallback reason or a refusal to delete while it is referenced. Add the `screenshots` invariants to the stamp's `superRefine`, and make the cardinality match the scope.
**Status:** upheld

### [WARN] party-architect — The precedence between an `embed` brief image and the composite screen is undefined

**Quotes:** > A per-brief upload (`Brief.briefImages`, `embed`/`reference` intent) is the other plausible home, for a one-off "this feature, this week" screenshot. Whether to support it too is an open question.
**Quotes:** > 2. **Where screenshots live:** kit only (recommended), or also a per-brief upload? If both, which wins?
**Problem:** The proposal names an existing mechanism, `embed`-intent brief images, that already puts a user's image into the design. Even if screenshots are kit-only, a `device-screen` brief can still carry `embed` images under that mechanism. Nothing tells the design step to keep those out of the composite rect. Two components, the existing embed path and the new composite path, would then both write into the screen area. OQ2's "which wins" is open only for the case where both homes are supported, but the collision exists with the recommended kit-only home too.
**Fix:** State that the `composite` rect is off-limits to `embed` images, or that `device-screen` refuses briefs that carry them.
**Status:** upheld

### [NOTE] party-architect — "Exactly one `composite` region per contract" would fail the four released looks as written

**Quotes:** > `validate.ts` requires exactly one `composite` region per contract.
**Problem:** Read literally, this applies to every contract in the dataset, and the four released looks have no `composite` region. The intended rule is probably "exactly one in a `device-screen` contract, and at most one in any contract". An implementer has to guess which.
**Fix:** Scope the rule to the look, or state it as "at most one per contract, and exactly one for `device-screen`".
**Status:** upheld
