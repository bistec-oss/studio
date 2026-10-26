### [WARN] party-ba — The proposal never states what hurts or for whom; "users cannot choose" is asserted as the pain

**Quotes:**

> **Every Claude model in the product is hard-coded, and users cannot choose one.** A marketer who wants a richer design, a sharper caption, or a stronger assistant has no control.
> **Problem:** The pain sentence is a hypothetical marketer ("who wants..."). No observed complaint, bad output, or request is cited, and nothing shows that today's Haiku/Sonnet split produces output users find inadequate. The lack of a control is a missing feature, not an established problem. The real problems the proposal names (version drift between CLI and API, the env override, the sweep limit) are engineering concerns, not user pain. If this shipped and worked, nothing in the text says what would measurably improve. Re-read in round 2: the proposal text is unchanged on this point.
> **Fix:** State the observed pain (which surface, what quality gap, who reported it), or reframe the goal as version consistency and stamping, which are evidenced.
> **Status:** upheld

### [WARN] party-ba — The central quality premise is not tied to any acceptance criterion

**Quotes:**

> A marketer who wants a richer design, a sharper caption, or a stronger assistant has no control.
> Unit tests for the pure resolver (precedence + allow-list); E2E: disallowed model → 400, stamp recorded, remembered choice restored
> **Problem:** The stated goal is richer, sharper, stronger output. The listed tests check only plumbing (precedence, 400 on a disallowed model, stamp, remembered choice). No criterion checks that picking a different model changes the model that actually runs, or that output improves. A build could pass every listed test while the choice has no effect. There is also no acceptance criterion for the timeout requirement: "A generation must never be marked FAILED by the sweep while its model call is still legitimately running" has no test listed.
> **Fix:** Add falsifiable criteria: the stamped model equals the requested model in both CLI and API mode, and an Opus design run longer than 300s is not swept to FAILED.
> **Status:** upheld

### [WARN] party-ba — The "full ID in both modes" premise rests on an unverified CLI behaviour that the problem section contradicts

**Quotes:**

> CLI mode passes short aliases (`haiku`, `sonnet`), which the CLI resolves to whatever version it maps them to.
> The **full ID is passed in both modes** (`claude -p --model` accepts full IDs; see the `claudeCli.ts:20` comment), so CLI and API always run the same version.
> **Problem:** The evidence that full IDs work in CLI mode is a code comment, not an observation. The proposal does not say it was run against the pinned CLI (2.1.287). It also does not say whether that CLI version knows `claude-sonnet-5-5` or `claude-opus-5-5`. The claim "always run the same version" is the justification for problem 2, and it is unverified. The model IDs are dated "checked 2026-10-12" but no source is given.
> **Fix:** Cite a run of the pinned CLI with each full ID, and the source for the ID list.
> **Status:** upheld

### [WARN] party-ba — The historic Opus timeout is cited as evidence for a 600s budget, but the cause is not established

**Quotes:**

> CLAUDE.md (2026-07-01) records that the old Path B timeouts were "the **Opus default**, not Sonnet".
> A per-model design timeout, e.g. Opus ~600s against today's 300s
> **Problem:** The "~600s" figure has no source. The evidence says Sonnet finishes about 5x under 300s, and does not say how long Opus takes. The proposal asserts Opus needs a longer budget without a measurement, and then builds a timeout table on it. The note that Opus timed out may also reflect the older Opus generation, not Opus 5.5.
> **Fix:** Measure Opus 5.5 Path B and refine durations and set the budget from that, or state the figure as a placeholder to be measured.
> **Status:** upheld

### [WARN] party-ba — "Team default" and "user's remembered choice" assume behaviours and interactions that are never established

**Quotes:**

> The last pick per surface is remembered per user.
>
> 1. explicit request, validated against the team allow-list; 2. the user's remembered choice for that surface;
>    the picker defaults to the draft's **stamped** model, so a regenerate is like for like
>    **Problem:** The proposal does not say whether a picker pre-selects the remembered choice and sends it as an "explicit request" (step 1) or leaves it empty so the resolver finds it (step 2). The two readings build differently: a pre-filled picker turns every remembered choice into an explicit request. The regenerate decision (default to the stamped model) conflicts with "remembered choice" and with the team default, and the precedence list does not place it. A user whose team admin later changes the team default will not see it take effect if their remembered pick shadows it. Whether that is intended is not stated.
>    **Fix:** Define whether pickers send a value or "unset", and where the stamped-model default sits in the precedence list.
>    **Status:** upheld

### [NOTE] party-ba — "Surface" term shifts: `caption` covers headline, and `assistant.brandkit` spans three different tasks

**Quotes:**

> `assistant.brandkit` (vision extraction + image → template + voice draft)
> So the headline sits **under** the `caption` surface, not beside it
> **Problem:** A single surface covers three tasks with different needs: chat-header vision extraction, image-to-template, and the one-shot voice draft. The proposal puts a picker only in the chat header, so it does not say whether the image-to-template and voice draft flows get a picker or just follow the remembered choice. Under the unlikely reading that each needs its own picker, the build changes.
> **Fix:** State where image-to-template and voice draft pick their model.
> **Status:** upheld
