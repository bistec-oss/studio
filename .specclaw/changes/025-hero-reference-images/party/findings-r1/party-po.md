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
