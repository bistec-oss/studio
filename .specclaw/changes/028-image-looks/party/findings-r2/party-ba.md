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
