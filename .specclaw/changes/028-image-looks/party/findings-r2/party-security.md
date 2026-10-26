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
