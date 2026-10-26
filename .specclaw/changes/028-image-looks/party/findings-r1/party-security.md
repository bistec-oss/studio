### [BLOCK] party-security — The unattended allow-list is a hand-editable code record with no link to the evidence or to the contract it vouches for

**Quotes:**

> - **The allow-list:** each contract carries a `realCheck` record (`{ passedOn, renders }`), written into the dataset only from the real-image check's results. Unset means unproven.
>   `resolvePostStyle` lets a queue entry, an MCP call or an ACP call use a non-classic look **only when the contract at (key, current version, size) has a `realCheck` record**.
>   It is a tuning step and the allow-list input, never a merge gate.
>   **Problem:** The resolver only checks that a `realCheck` record exists. The word "only" in "written into the dataset only from the real-image check's results" describes an intention, and nothing enforces it. The record is a literal in `composition.ts`, so any commit can add one, and the implementing subagent is one such author. That subagent has a reason to: the unattended-styled branch needs a proven contract before E2E can exercise it, and the real check is "never a merge gate", so it may not have run when the code merges. A fabricated `{ passedOn, renders }` looks the same as a real one, and the resolver would let scheduled auto-publish use the look. The record also has no tie to the geometry it vouches for. The runner allows "one re-run per failing contract after tuning", and a contract whose rectangles or subject wording change after a pass keeps its record, so the pass then covers a contract that was never rendered.
>   **Fix:** Store each operator verdict in a committed results file: contract key, version, size, a hash of the contract's measured fields, the run id, and the verdict. Make `realCheck` reference that file, and add a unit test that fails when a record has no matching result or when the stored hash differs from the contract's current fields. Any E2E seam that forces "proven" should be gated like the other `MOCK_AI` seams and inert in production. Never satisfy the test with a seeded dataset record.
>   **Status:** upheld

### [BLOCK] party-security — No way to pull a misbehaving look off unattended auto-publish short of a code change and redeploy

**Quotes:**

> **No migration expected:** `Brief.imageStyle` is free text, the stamp is JSON, and the allow-list lives in code.
>
> - `resolvePostStyle` lets a queue entry, an MCP call or an ACP call use a non-classic look **only when the contract at (key, current version, size) has a `realCheck` record**.
>   **Problem:** After a contract is allow-listed, `SCHEDULE_PUBLISH` and `PUBLISH_NOW` queue entries publish posts in that look to LinkedIn and Instagram with no person in the loop. That publish is the effect that leaves the system and cannot be undone. The real check rests on a single render per contract, so a look can pass it and still produce illegible or off-brand posts in production. The proposal names no recovery path for that case. The allow-list lives in code, so revoking a look means a commit, a merge to `main` and a redeploy, and every queued entry keeps publishing in the look until then.
>   **Fix:** Add an operator off switch that takes effect at runtime without a deploy, such as a team setting or a single DB flag read by `resolvePostStyle`, that sends unattended runs back to classic. List it in the handoff as the recovery step. The narrowest form is a per-look "unattended disabled" set that the resolver checks before the `realCheck` record.
>   **Status:** upheld

### [WARN] party-security — The 34-call cap is only stated as a runner refusal, so a crash or restart can reset it and timed-out calls may go uncounted

**Quotes:**

> **Hard cap: 34 hero image calls**; the runner refuses to go past it.
> plus **at most one re-run per failing contract** after tuning.
> **Problem:** Image calls cost money and cannot be refunded. The proposal does not say whether the count persists across runner invocations or whether it counts attempts or successful renders. A tuning loop means several runner restarts. If the count is held in process memory, or counts only completed renders, the cap resets or under-counts, and timed-out hero calls still bill. The cap then fails open: spend stays unbounded while the runner reports that it held.
> **Fix:** Keep an append-only call ledger, a file in the OP results directory or a table in the scratch database. Write each hero call to the ledger before the request goes out, and count attempts, including timeouts and errors. Refuse to start when the ledger is at 34, and print the running total on every call.
> **Status:** upheld

### [WARN] party-security — The fallback visibility that answers finding 19 is put up for removal in the open questions

**Quotes:**

> - **Fallbacks are seen** (finding 19): the look outcome per draft (styled, or fell back with its reason) is shown per look key on `/admin/insights`, from events 006 already emits or one new field on them. The spec decides which.
>
> 5. **Insights:** is a fallback-rate-per-look section on `/admin/insights` wanted now, or is the composition stamp enough until there is usage?
>    **Problem:** Two kinds of unattended degradation produce a post with no visible signal: a look that fails the pixel check on a scheduled run and is published as classic, and a run downgraded with `unproven-classic`. OQ5 offers to drop the only aggregate signal. The proposal names no per-entry place where the `unproven-classic` note shows up. A composition stamp per draft can only be read one draft at a time, so a look that falls back on most unattended runs, or never leaves `unproven-classic`, goes unnoticed and is trusted.
>    **Fix:** Do not offer finding 19's answer as optional. Ship the fallback-per-look section, or at least show the fallback or `unproven-classic` reason on the queue entry's completed line, just as 027 shows `heldReason`.
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
>   **Problem:** In the split looks, text sits beside the image. In Full-bleed and Spotlight, text sits over it, so a design that ignores the band puts the headline straight onto the busy scene. The pixel check measures the generated image's band and passes. The only thing that sees where the text actually landed is described as an "observation", and the proposal never says it holds a post or falls back. On an unattended surface, that check passes and the illegible post is published.
>   **Fix:** For looks whose text regions overlap the image, make a layout violation fail closed on unattended surfaces: hold the post or re-render as classic, with no second image call. State this rule in the spec, alongside the band geometry.
>   **Status:** upheld

### [WARN] party-security — One fail fixture per contract proves only one of the two measured properties is active

**Quotes:**

> Each pass image must pass `evaluateRegions` through the real Chromium sampler; each fail image must fail with a named reason (`busy` or `contrast`).
> **Problem:** Each contract and size gets one fail image, which can fail for either reason. A contract whose single fail image fails on `busy` never shows that its contrast test runs at the stated polarity. That matters most for the light looks, which are the reason `textTone: dark` exists. If the fixtures are generated from the contract's own `textTone`, as a builder modelled on `heroFixtures.ts` might be, a mislabelled tone produces matching pass and fail images. The gate then passes while measuring the wrong polarity. That is the pass-everything outcome finding 21 was about.
> **Fix:** Require two fail fixtures per contract and size, one failing on `busy` and one failing on `contrast`. Build the contrast fixtures from the look's intended backdrop as declared in the spec, independent of the `textTone` field they test.
> **Status:** upheld

### [NOTE] party-security — Whether the four copied v2 contracts are allow-listed is left unstated

**Quotes:**

> | Showcase (`product-showcase`) | **version 2** adds STORY; SQUARE/PORTRAIT copied as is | light | SQUARE, PORTRAIT, **STORY** | the text area: calm (busy) and light-text contrast | Launch |
> (17 contracts: 2 STORY additions plus 5 looks × 3 sizes)
> **Problem:** The real check renders 17 contracts, which leaves out the SQUARE and PORTRAIT contracts of `product-showcase` v2 and `editorial-split` v2. Today these back the Launch and Announcement defaults. The proposal does not say whether they get a `realCheck` record carried over from OP-1 or stay unproven. OP-1 was a preference study with a different bar and, in the proposal's words, "covered two looks at two sizes". Carrying its result over would turn unattended use on for the most used defaults through a record the defined check never produced.
> **Fix:** State that these four contracts start without a `realCheck` record and are either added to the real-check run (raising the cap to match) or stay classic on unattended surfaces until they pass it.
> **Status:** upheld
