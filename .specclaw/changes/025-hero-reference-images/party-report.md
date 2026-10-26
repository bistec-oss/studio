# Party Report: 025-hero-reference-images

**Reviewed:** 2026-10-25
**Tier:** deep (classifier) — Adds a new team-scoped upload type for product screenshots that may show unreleased UI, with a public-or-private storage choice still open, a new region purpose in the layout contract, and an optional field on the persisted composition stamp, so it touches an upload trust boundary, persisted data shape, and an unresolved storage decision that changes the design.
**Panel:** party-po(sonnet), party-architect(opus), party-ba(sonnet), party-security(opus), party-visionary(opus)
**Verdict:** CHANGES_REQUESTED

## Summary

28 findings: 4 BLOCK, 18 WARN, 5 NOTE upheld — 1 withdrawn

## Findings

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

### [WARN] party-ba — The pain is "software marketers want real-UI posts", but no evidence says any user wants it or does the upload work

**Quotes:**

> For a software company's marketing team, "a laptop showing our actual dashboard" is the post they want most.
> A per-brief upload (`Brief.briefImages`, `embed`/`reference` intent) is the other plausible home, for a one-off "this feature, this week" screenshot.
> **Problem:** The sole statement of user need is an unsourced assertion ("the post they want most"). The proposal does not say who asked, how often a post with a product screen is requested, or what marketers do today (manual screenshot mockups?). It also assumes the team will upload and maintain a library of `PRODUCT_SCREENSHOT` artifacts in the kit admin page, and that a team admin (not the post author) does so. The proposal's own text raises a more likely behaviour, a one-off per-post screenshot, and leaves it as an open question. If real usage is per-post, the kit-first recommendation builds the wrong home. OP-1 and OP-028 showed that styled looks beat classic. They did not show demand for a device screen.
> **Fix:** Cite where the demand came from (a request, a count of posts, a user quote). State who uploads and how often. Decide the kit-versus-per-brief question from that behaviour, not from where an upload route already exists.
> **Status:** upheld

### [WARN] party-ba — No acceptance criteria exist for the main claim that the screenshot is pixel-exact and correctly placed

**Quotes:**

> The screenshot stays pixel-exact; the model does not redraw it.
> the prompt gets the screenshot URL and the rect, and must place the screenshot exactly there (object-fit and rounding are set by the contract, not the model). `evaluateLayout` checks the box after render.
> **Problem:** "Pixel-exact" and "exactly there" are the headline benefit, but the proposal has no stated pass or fail observation. It does not give a tolerance for the box check, and it does not say how the output is shown to contain the unaltered screenshot (as opposed to a model that recolours or crops it). In approach (b) the design step is an LLM writing HTML. The same proposal documents that prompt rules are not invariants. The only measurable gate named is the blank-screen check on the image, which tests the device and not the placement. The fixtures listed (pass, busy, contrast, screen-not-blank) are all about the background image and none about the composited screenshot.
> **Fix:** State falsifiable criteria. For example, the rendered screen rect matches the screenshot within a stated per-pixel tolerance. Or the screenshot's `<img>` box is within N px of the rect. Or a post-render check fails closed when the screenshot is absent or altered.
> **Status:** upheld

### [WARN] party-ba — "Blank enough" and "tighter bar than a clear region" are undefined, and OP-025's pass rule is open

**Quotes:**

> The screen rect must be blank, with a tighter bar than a `clear` region.
> Does a size need 2 of 2 blank screens to pass?
> if the screen is not blank enough at a size, that size is out of scope or the change stops.
> **Problem:** The go/no-go gate depends on a term with no measure. "Blank", "blank enough" and "tighter" can each be built as different thresholds. Two image calls per size, with a 2-of-2 rule left open, is a sample too small to show that a size is reliably achievable. It also contradicts the premise that the model must achieve this every time, since every failure falls back to classic and drops the screenshot. The proposal's own risk note says Spotlight failed a calm-region bar on a real image. That shows a pass on a few samples does not predict the failure rate.
> **Fix:** Define blank as a number (for example maximum luminance variance or edge density inside the rect). State the pass rate that makes a size shippable, and the fallback rate users will accept.
> **Status:** upheld

### [NOTE] party-ba — "Real product screenshot" does not say what a valid screenshot is, and "device" carries two readings

**Quotes:**

> Screen shape per size:** one device per size (a laptop for SQUARE, a phone for STORY?), or one device for all sizes?
> Is a screenshot whose aspect is far from the rect's refused at pick time?
> **Problem:** The build differs a lot between readings. If the device is per size, a desktop dashboard screenshot is shown in a phone rect for STORY, and then it is either cropped (cover) or letterboxed. In both cases the "real UI" is no longer what the product looks like, which undercuts the stated value. The proposal leaves these as open questions but does not say the premise ("our actual dashboard") depends on them.
> **Fix:** Say which reading the problem statement assumes. Check that the supported device and fit combinations show a screenshot a marketer would call "our actual dashboard".
> **Status:** upheld

### [WARN] party-po — No cheaper variant is considered: a per-brief upload with a hand-placed screen would capture most of the value

**Quotes:**

> **Recommendation: a fifth look key, e.g. `device-screen`,** with a `composite` region per size.
> **Size:** architectural. It adds a new region purpose to the shared dataset contract, a new look, a new asset type with storage, UI and tenancy rules, and a stamp field others read.
> **Files affected:** about 25 to 35 (estimated)
> **Problem:** The proposal weighs two ways of getting the screenshot onto the screen: (a) reference input and (b) HTML composite. It never prices a smaller variant. For example, a user could attach one screenshot to the brief, using the existing `Brief.briefImages` embed path that the proposal itself mentions. They could then use one device and one size, picking SQUARE only if OP-025 passes there. That would skip the new enum migration, the kit admin upload UI, the artifact validation and tenancy work, and the stamp field. It would also skip a 3-size fixture matrix. The proposal prices the whole thing at 25 to 35 files, while the value rests on one post type. It also says the kit-only home is "recommended", but the cheaper per-brief home is left as open question 2 and is never costed.
> **Fix:** Add a "smallest slice" section. It should cover one size, a per-brief embed (no kit artifact type, no migration), and `device-screen` with a single composite contract. State what value it loses against the full plan, and ship the kit artifact type as a second change only if reuse is shown.
> **Status:** upheld

### [WARN] party-po — Do-nothing option is not priced, and no demand figure is stated for the screenshot post

**Quotes:**

> For a software company's marketing team, "a laptop showing our actual dashboard" is the post they want most.
> If it cannot, the change is moot.
> **Problem:** The only value claim is an unquantified assertion that this is the post the team wants most. If this ships in no form, the team still gets a classic or hero post. The proposal does not say how often such posts are made, how they are made today (a manual Figma mockup, say), or what the cost of that is. Without a rate, "architectural" scope has not earned its place. The proposal also states that OP-025 can make the change moot after the proposal is written, which shows the value case is not yet established.
> **Fix:** State how often marketing wants a product-screenshot post per month and what they do now. If the answer is a few posts a month, say so and size the build to that.
> **Status:** upheld

### [WARN] party-po — Scope with no stated value: three-size support, per-brief picker gating, and 006 event work

**Quotes:**

> with SQUARE, PORTRAIT and STORY contracts only where OP-025 passed.
> Each gets pass, busy and contrast fixtures, plus a "screen not blank" fixture.
> A 006 event for the new fallback reason, if 006's coverage test requires one.
> Screen shape per size: one device per size (a laptop for SQUARE, a phone for STORY?), or one device for all sizes?
> **Problem:** Each size multiplies the work: its own device prompt and screen rect, four fixtures, and a real-image check. The proposal says 028 added full support for all three sizes, but it states no demand for a screenshot post at each size. Per-size devices (laptop vs phone) are floated as an open question, and each one adds another contract to author. The 006 event is mentioned only as conditional.
> **Fix:** Name the one size with demand (likely SQUARE for feed) as the first cut. Let PORTRAIT and STORY be follow-ups, each added after its own OP-025 pass.
> **Status:** upheld

### [WARN] party-po — OP-025 spend and the real-model running cost are not bounded or priced

**Quotes:**

> The cap and spend are the user's call (open question 1).
> A failure falls back to classic with a new reason, `screen-not-blank`, added to `FALLBACK_REASONS`
> **Problem:** OP-025 is proposed at 6 calls with a hard cap of 9, but no figure is given for what a call costs or how long it takes. Per-post running cost is also unstated. A `device-screen` post spends one hero image call. When that call fails the new blank-screen bar, the proposal sends the post to classic and says the screenshot is dropped, so the image spend is wasted. Fail-closed on a bar the proposal calls "tighter" than a `clear` region could trigger often. The proposal does not give an expected failure rate or say whether the user is told that their screenshot was dropped. Spotlight failed SQUARE on `busy` twice, so the failure rate is not hypothetical.
> **Fix:** State the per-call cost and time from OP-1 (11 to 22 s, 35 to 99 s at higher quality). Set a pass-rate threshold for shipping, such as 2 of 2 at each size. Say what the user sees when the screenshot is dropped.
> **Status:** upheld

### [NOTE] party-po — Cut line: ship OP-025 and the dataset and pixel-check slice before any UI

**Quotes:**

> On approval, run OP-025 before `/specclaw:plan`. 7. **UI:** an upload section for screenshots on the kit admin page, and a screenshot picker in the brief wizard.
> **Problem:** The proposal sequences OP-025 first, which is good. It does not name any later cut line, and the build list runs dataset, prompt, check, fixtures, design step, stamp and UI as one change. Items 1 to 4 (the look, the prompt, and the check with its fixtures) can be proven in isolation, and that gate also tests whether the idea works at all. The UI, the artifact type and the migration (items 6 and 7) are only worth building after it passes.
> **Fix:** Name two tasks groups, "engine" (items 1 to 5) and "surface" (items 6 and 7, the migration), with a go/no-go after the engine's real check.
> **Status:** upheld

### [BLOCK] party-security — A screenshot that fails to render still produces a green, screenshot-stamped post

**Quotes:**

> 5. **Design step:** the prompt gets the screenshot URL and the rect, and must place the screenshot exactly there (object-fit and rounding are set by the contract, not the model). `evaluateLayout` checks the box after render. 6. **Stamp:** `compositionStampSchema` gains an optional `screenshots` field (artifact ids). It is validated in code, so the stamp needs no migration.
> **Problem:** The blank-screen check (step 3) runs on the image model's output before the screenshot is composited. After that, two things can fail and nothing catches them. (1) The design model writes the `<img>`. It can leave it out, point it at the wrong URL, or put it outside the rect. "set by the contract, not the model" is a request in the prompt, not a rule the code enforces. (2) The screenshot can fail to load at render time: the artifact was deleted, a signed URL expired (open question 4), MinIO is down, or the egress allowlist blocks the host. Chromium then paints a broken image or nothing. The device screen stays blank, which is exactly the state step 3 checked for. The proposal says `evaluateLayout` "checks the box", but it never says what a failed check does. The architect's round-1 finding confirms that the Path B layout observation is record-only. The result is an EXPORTED draft showing an empty laptop, and its stamp still lists `screenshots: [id]`. Draft status, stamp and events all look the same as success. Round 2: party-architect (code-owned placement) and party-ba (no criterion for "pixel-exact") reach the same weak point from their own lenses. Nothing in round 1 shows that the post-render check fails closed.
> **Fix:** Make the composite deterministic. Code inserts the `<img>` (with the contract's object-fit and radius) into the screen rect after the model has written its HTML, and the model is never asked to place it. After render, check the actual pixels in the rect: confirm the image loaded (`naturalWidth > 0` or a check on the network response) and that the rect is no longer blank. On any failure, fail closed to classic with a named reason (for example `screenshot-not-rendered`) and show the user the existing draft notice. Write `screenshots` into the stamp only after that check passes.
> **Status:** upheld

### [BLOCK] party-security — Deleting a kit screenshot silently breaks every draft and revision that references it

**Quotes:**

> - `PRODUCT_SCREENSHOT` kit artifacts: upload with validation (type, size, dimensions), list and delete, team-scoped (a cross-team id is 404).
>
> 7. **Refine:** when a refine replaces the image, Phase 1 already falls back (`refine-replaced-image`). Should a refine that keeps the image be allowed to move or remove the screenshot?
>    **Problem:** Delete removes the stored object, and that cannot be undone. Drafts and revisions keep `htmlSnapshot`s that name the screenshot's URL, and their stamps name its artifact id. After a delete, any later refine, regenerate design or re-render of those drafts loads a missing object and produces a blank device screen. Nothing reports it (see the finding above). The proposal states no reference check, soft delete, warning or recovery path. The risk also runs the other way. Deleting a screenshot of unreleased UI does not remove it from exported PNGs or published posts that already contain it, so an operator who deletes it "to withdraw it" wrongly believes it is gone. Round 2: party-architect (lifecycle warning: no named exit when an id no longer resolves) and party-visionary (the stamp and the HTML disagree after a delete) concur. Neither offers a recovery path, so the runtime-irreversibility objection stands.
>    **Fix:** Before deleting, count the drafts and revisions whose stamps reference the artifact and show that count in the confirmation. Prefer a soft delete (hide the screenshot from the picker but keep the object) so existing drafts still render. If the object really is removed, any later render of an affected draft must fail closed with a named reason, not show a blank screen. Say plainly in the delete UI that exports and published posts are not changed.
>    **Status:** upheld

### [WARN] party-security — Unreleased product UI has no safe default bucket, and the public option exposes it permanently and without auth

**Quotes:**

> 4. **Bucket:** the public IMAGES bucket (stable URL, as kit logos use), or a private bucket signed at read? Screenshots of unreleased UI argue for private. The render then needs a signed URL that lives long enough, and the stored HTML must not keep an expiring URL.
>
> - A product screenshot may show unreleased UI. Bucket choice matters (open question 4).
>   **Problem:** The proposal names the exposure but leaves the default open. With the public IMAGES bucket, every screenshot gets a stable URL that needs no login. That URL is copied into the model-written `htmlSnapshot`s and into every revision, so it spreads to every place that stores or logs HTML. It also outlives a kit delete unless the object itself is removed. Anyone who obtains the URL can fetch the unreleased UI without a session. The renderer allows all MinIO hosts, so model-written HTML can also reference any public object, not just the screenshot the brief chose. Round 2: party-visionary adds that public-then-private is a one-way door once URLs are in stored HTML. That strengthens the case for a private default.
>   **Fix:** Default to a private bucket. Store only the object key in the HTML and the stamp, and sign it with a short TTL when the render runs, as H10's `resolveExportUrl` does. With the deterministic composite from the first finding this is straightforward: code inserts the signed URL just before render and strips it back to the key before saving. A public bucket should be an explicit opt-in the user chooses, not the fallback when the question goes unanswered.
>   **Status:** upheld

### [NOTE] party-security — The upload validation does not name the allowed formats or limit the decode cost in the renderer

**Quotes:**

> - `PRODUCT_SCREENSHOT` kit artifacts: upload with validation (type, size, dimensions), list and delete, team-scoped (a cross-team id is 404).
>   **Problem:** "type, size, dimensions" does not say which types are allowed. An SVG accepted as a "screenshot" and served from MinIO is active content on the MinIO origin. A highly compressed raster with very large pixel dimensions costs decode memory in the shared Puppeteer browser, which runs at most two renders at once. Round 2: party-architect notes that the existing route already has a raster allow-list (`IMAGE_TYPES`) but no dimension check. If the new type is added to that list, the SVG exposure goes away. The decode-cost and magic-byte points remain. This is hardening, not exposure.
>   **Fix:** Allow raster formats only (PNG, JPEG, WebP), checked against the file's magic bytes rather than the MIME type the client sends. At upload, cap the pixel count (width × height), not just the file size in bytes.
>   **Status:** upheld

### [WARN] party-visionary — A generic `composite` slot gets permanent screen-only names in the stamp and the analytics vocabulary

**Quotes:**

> 3. **Pixel check:** the screen rect must be blank, with a tighter bar than a `clear` region. A failure falls back to classic with a new reason, `screen-not-blank`, added to `FALLBACK_REASONS` (`stamp.ts:7`). The screenshot is then dropped, not pasted onto a classic post. 6. **Stamp:** `compositionStampSchema` gains an optional `screenshots` field (artifact ids). It is validated in code, so the stamp needs no migration.
> **Problem:** The proposal presents `composite` as a general purpose ("the next `Purpose` literal"), but it names the two persisted parts after this one use, and both names become permanent. `FALLBACK_REASONS` is imported into the 006 event catalogue and written into every Draft and DraftRevision stamp. `parseCompositionStamp` returns null when a stamp fails to parse, so renaming or removing a reason later would silently turn every historical stamp that carries it into "no stamp". Two future changes will need a composite that is not a kit screenshot. One is the per-brief upload in open question 2, which has no artifact id. The other is an exact-geometry kit logo lockup: the Hearts Academy logo sizing failed three times when it was controlled only by prompt wording. Each of those changes will have to add a second reason next to `screen-not-blank` and a second id field next to `screenshots`, or reuse the screen names for things that are not screens. Either way, `/admin/insights` will split one kind of failure across two names. Round 2 makes this more pressing, not less. party-security's BLOCK proposes a second new reason (`screenshot-not-rendered`), and party-architect's lifecycle WARN asks for a named exit for a deleted artifact. Under screen-specific naming those become two more asset-specific reasons; under slot naming they are `composite-not-rendered` and `composite-source-missing`, and a logo or per-brief source reuses them. The artifact says the look key is permanent (open question 3). It does not say these names are just as permanent.
> **Fix:** Name the parts after the slot, not the asset: `composite-not-blank` (plus whatever reasons the panel's render and delete findings add, in the same family), and `composites: [{ region, source: { kind: 'kit-artifact', id } }]`. A per-brief upload or a logo then becomes a new `kind`, with no new reason and no new field. State in the artifact that these names are permanent once released.
> **Status:** upheld

### [WARN] party-visionary — "A new ArtifactType keeps screenshots out of prompts" is false, and the next asset type will copy that reasoning

**Quotes:**

> Reusing `REFERENCE_IMAGE` or `EXAMPLE_POST` would mix purposes. It would also put screenshots into every prompt that reads `feedToAI` artifacts.
> **Problem:** The generation readers filter on the `feedToAI` flag, not on the artifact type: Path B, the agent tools and the prompt-generate route all select `feedToAI: true` with no type filter, and the upload route takes the flag from the form for every type. So a new enum value does not keep a screenshot out of the prompts; the flag does. party-architect filed the merge-day half of this, and its fix (force the flag off on upload, or filter in each reader) closes today's hole. My concern is what comes after. Either fix as stated is a per-type exception that lives in a route or in N queries. The next kit asset type will copy the proposal's reasoning, that a new type is what keeps it out of prompts. Examples are 007's planned typography follow-up and a team-photo asset for a Hiring look. That type will then repeat the gap, because nothing fails when a reader misses the new type.
> **Fix:** Make generation visibility a property of the type, defined in one place. That means an exported set of the types generation may read, used by every `feedToAI` query and enforced by a guard test in the style of `designDataBoundary.test.ts`. A per-type exception in the upload route doesn't do this. Then correct the stated reason in the artifact.
> **Status:** upheld

### [WARN] party-visionary — The first look that needs an input declares that need in wizard UI, not in the dataset the resolver reads

**Quotes:**

> It also gives the picker a clear rule: the look is offered only when the brief has a screenshot. 7. **UI:** an upload section for screenshots on the kit admin page, and a screenshot picker in the brief wizard. The `device-screen` card is shown only once a screenshot is chosen.
>
> - Changing any post style's default look. Launch keeps `product-showcase`.
>   **Problem:** `device-screen` is the first look that cannot render without a specific input. Build step 1 adds the look to the dataset but no field that says it needs one, so the rule exists only as a condition in the wizard. party-architect's lifecycle finding asks for the same rule on the server, in `POST /api/briefs`. If that is written as a route check, the precondition is in two places, the wizard and the route, and the dataset is in neither. The obvious next change is the one the proposal puts out of scope: "Launch uses `device-screen` when the kit has a screenshot." It goes through `resolvePostStyle`, whose result notes are a closed set (`unattended-classic`, `retired-classic`) with no case for a missing input. That change, and any later lifting of `unattended-classic` for the queue, would have to write the precondition a third time. The next input-bound look will copy the wizard condition.
>   **Fix:** Declare the input on the archetype in `composition.ts` (for example `requires: 'composite-source'`). The picker, the brief route and `resolve.ts` should all read that one field. Give `resolve.ts` a `missing-input-classic` note now, so a follow-up that changes a default only edits data.
>   **Status:** upheld

### [WARN] party-visionary — Choosing a public bucket is a one-way door once URLs are written into stored HTML, and open question 4 frames it as a symmetric trade-off

**Quotes:**

> 4. **Bucket:** the public IMAGES bucket (stable URL, as kit logos use), or a private bucket signed at read? Screenshots of unreleased UI argue for private. The render then needs a signed URL that lives long enough, and the stored HTML must not keep an expiring URL.
> **Problem:** As written, the screenshot URL is stored in `Draft.htmlContent` and in every `DraftRevision.htmlSnapshot`, and refine and re-render read those snapshots. If the bucket starts public, a later move to private has two options, both bad. One is to leave every object an old snapshot references public forever. The other is a data migration that rewrites stored HTML across all revisions. The reverse move, from private to public, is only a policy change. Open question 4 weighs confidentiality against URL stability and never says that only one direction can be undone. party-security argues the confidentiality side, and party-architect's BLOCK, code placement with a placeholder in the stored HTML, would remove the door. Neither makes the irreversibility visible in the artifact. If the code-placement fix is not adopted, the door is still there.
> **Fix:** Mark open question 4 as one-way and decide it before `/specclaw:plan`. Store an object key or a placeholder token in the HTML and resolve it at render time (the `resolveExportUrl` / `__INLINE_ASSET_n__` pattern), so stored HTML never holds a URL that expires or can't be revoked. This is the same seam party-architect's and party-security's fixes call for.
> **Status:** upheld

### [WARN] party-visionary — The screenshot in a post is recorded twice, in the stamp and in the HTML, and refine and delete will make the two disagree

**Quotes:**

> 7. **Refine:** when a refine replaces the image, Phase 1 already falls back (`refine-replaced-image`). Should a refine that keeps the image be allowed to move or remove the screenshot?
>
> - `PRODUCT_SCREENSHOT` kit artifacts: upload with validation (type, size, dimensions), list and delete, team-scoped (a cross-team id is 404).
>   **Problem:** The stamp's artifact ids say which screenshot a revision used, and the `<img>` in the revision's HTML says it again. Refine edits only the HTML. If open question 7 answers yes, a refined revision can carry a stamp naming screenshot X while its HTML shows a different screenshot or none, unless every refine writer recomputes the stamp. Deleting an artifact leaves the id pointing at nothing while old HTML may still show the image. party-security's BLOCK shows the merge-day form of this: a stamp that lists a screenshot that never rendered. The long-horizon cost lands when something reads the stamp as the truth. That could be an insights section on which screenshots were used, or a "this screenshot is out of date" badge built the way the stale-headline badge is planned, on a per-revision stamp.
>   **Fix:** Make one of the two copies derived. Under party-architect's code-placement fix, the code step that inserts the element is the only writer of both the placeholder and the stamp entry, and refine is forbidden from touching the composite. Otherwise, derive the stamp field at commit time from the rendered HTML. Either way, make artifact delete a soft delete, as party-security also asks. Say which one in the artifact.
>   **Status:** upheld

### [WARN] party-visionary — A screenshot's fit depends on a versioned rect, but it would be checked once at upload against a long-lived kit asset

**Quotes:**

> 6. **Fit rule:** cover (crop to fill) or contain (letterbox)? Is a screenshot whose aspect is far from the rect's refused at pick time? 5. **Screen shape per size:** one device per size (a laptop for SQUARE, a phone for STORY?), or one device for all sizes? This sets the screen rect's aspect, which sets how the screenshot is cropped.
> **Problem:** Kit screenshots are meant to be reused across many posts and to outlive any one look version. Whether one fits depends on the screen rect's aspect, which the `device-screen` contract version sets. If the scope's "validation (type, size, dimensions)" includes an aspect rule, the upload route holds a second copy of the rect geometry. The foreseeable next change is `device-screen` v2, for example a phone for STORY after a second OP run, or the PORTRAIT and STORY follow-ups that party-po's SQUARE-first slice would create. It must then also update the upload rule, and screenshots already uploaded become silently unsuitable for the new rect. No test links the two. party-security's NOTE asks for a pixel-area cap at upload. That fits this fix, because it bounds decode cost without encoding geometry.
> **Fix:** At upload, validate only the format (by magic bytes), the byte size and the pixel bounds. Compute aspect fit only at pick time, from the current contract's rect, so the dataset stays the only copy of the geometry.
> **Status:** upheld

## Dissent

_Withdrawn findings. The severity token is prefixed WITHDRAWN so these do not count as live findings._

### [WITHDRAWN WARN] party-security — OP-025 decides go/no-go with a looser check than the one the build will ship

**Quotes:**

> It sends a hand-written blank-screen prompt to `gpt-image-2` per size and runs the existing pixel check on the screen rect. 3. **Pixel check:** the screen rect must be blank, with a tighter bar than a `clear` region.
> **Problem:** OP-025 is the gate, but it measures with the existing calm-region check, while production will use a stricter "blank" bar. The prompt is also hand-written, not generated from the data.
> **Fix:** Fix the threshold and generate the prompt from the contract before OP-025, and record both in the ledger.
> **Status:** withdrawn — party-architect's round-1 finding ("OP-025 gates on a hand-written prompt and rect, not on the data contract the build ships") covers the same gap more completely, including the rect and the duplicate ledger, and it sits in their lane (test strategy, contract). What I added as a failure mode, a mass silent fallback, is not silent: the proposal routes each failure to the named, stamped `screen-not-blank` reason. So the part that was mine does not hold, and the rest is theirs.
