# Party Report: 008-model-selection

**Reviewed:** 2026-10-12
**Tier:** deep (classifier) — Persisted data shape changes (model stamps on Draft/DraftCaption/DraftRevision, plus new TeamModelPolicy and UserModelPreference tables) and model resolution sits on the generation critical path with server-side allow-list validation.
**Panel:** party-po(sonnet), party-architect(opus), party-ba(sonnet), party-security(opus), party-visionary(opus)
**Verdict:** CHANGES_REQUESTED

## Summary

35 findings: 5 BLOCK, 23 WARN, 6 NOTE upheld — 1 withdrawn

## Findings

### [BLOCK] party-architect — Two stores answer "which model does the next regenerate use", and they diverge after the first per-channel regenerate

**Quotes:** > - `Brief` carries the chosen caption/design model so async generation, retry and regenerate reuse it
**Quotes:** > - **Regenerate default — decided 2026-10-12:** the picker defaults to the draft's **stamped** model, so a regenerate is like for like unless the user changes it.
**Quotes:** > the caption stamp is **per row**, as `DraftCaption.model` plus `Draft.headlineModel`.
**Problem:** The proposal gives the regenerate model two sources. The In Scope line says regenerate reuses the model carried on `Brief`. The 2026-10-12 decision says regenerate defaults to the draft's stamp. The two agree only until the first regenerate that uses a different model. If a user regenerates the LinkedIn caption on Opus, `DraftCaption(LINKEDIN).model` becomes Opus while `Brief` and the other rows keep the original. The next "Regenerate all" (`{}`) has no single stamped model to default to, and `Brief` says something else again. The stamp is not a tier in the `resolveModel` precedence list either. So it is unclear whether "defaults to the stamp" is client logic (the picker pre-fills an explicit request) or server logic (a resolver tier). If it is client logic, an MCP/ACP regenerate skips the stamp and uses the team default, and a user regenerate and a machine regenerate of the same draft pick different models. Drafts whose stamp is null raise the same question. party-visionary filed the same divergence on their own lens, and party-ba filed the unplaced precedence tier. Three seats reached this independently, which supports keeping it at BLOCK.
**Fix:** Pick one owner. Either `Brief` stores the requested model and the stamps are write-only records that nothing reads for defaults, or the stamps drive regenerate and `Brief` does not. State whether the stamp is a server-side resolver tier. Define what "Regenerate all" defaults to when the rows' stamps differ, and what a null stamp falls back to.
**Status:** upheld

### [BLOCK] party-architect — A regenerate picker is decided, but no regenerate picker or route-body change is in scope

**Quotes:** > - **Brief wizard:** Caption model + Design model pickers on the Review step.
**Quotes:** > - **Refine box:** a model picker beside the instruction.
**Quotes:** > - Pickers: brief wizard, refine, assistant chat headers; `/team` admin section
**Quotes:** > the same surface covers `regenerate-copy` in all three forms: "Regenerate all" (`{}`), one channel (`{channel}`) and the headline (`{headline:true}`)
**Problem:** The Regenerate-default decision refers to "the picker" on regenerate. But item 4 and the In Scope picker list name only the brief wizard, refine and the chat headers. Neither regenerate-copy (all three body forms, on 012's per-channel panels) nor regenerate-design gets a picker. For the decision to work, the same commit has to add a model field to all three `regenerate-copy` request bodies and to `regenerate-design`. It also has to add a picker to each caption panel, the headline control and the design regenerate control. The proposal names none of these. No other seat's round-1 finding answers this. As written, the merge lands a decision with no UI or route contract to carry it.
**Fix:** Add the regenerate pickers (each caption panel, the headline, design regenerate) to item 4 and to In Scope. Add the `model` field on the `regenerate-copy` / `regenerate-design` bodies too, and specify the field's name and shape across the three body forms.
**Status:** upheld

### [WARN] party-architect — The proposal adds `resolveModel` without saying what happens to the existing `modelFor` and the existing `CLAUDE_CLI_MODEL` read, or where the env var now sits

**Quotes:** > `brandkit/voiceDraft.ts:7` (bypasses `modelFor` entirely)
**Quotes:** > It is applied as `override || explicitModel` (`claudeCli.ts:25`).
**Quotes:** > 4. the system default (today's split).
**Quotes:** > `CLAUDE_CLI_MODEL` moves from override to system-default fallback.
**Quotes:** > the background-image decision (Haiku, `modelForBackground`)
**Problem:** The proposal names three existing model-selection points: `modelFor`, `modelForBackground` and the env read inside `claudeCli.ts:25`. A fourth is the local choice in `refine/route.ts:160,170`. It promises "One resolver" but never says whether `modelFor` is deleted, kept as tier 4, or wrapped. If it survives beside `resolveModel`, two resolvers serve the same surfaces. The proposal also never says that `claudeCli.ts` stops reading `CLAUDE_CLI_MODEL` itself. If that read survives at the spawn site, it still beats the resolver, which is exactly problem 3. The env var's position is ambiguous as well. As a "fallback" below tier 4 it would never fire, because today's split always resolves. Placed above tier 4, it replaces the split. The env var's values today are aliases, not catalogue IDs. party-security's ceiling finding and party-visionary's literal-guard finding both depend on this placement being settled.
**Fix:** State that `resolveModel` replaces `modelFor` (or that `modelFor` becomes its tier-4 table), and that `claudeCli.ts` stops reading the env var. Place `CLAUDE_CLI_MODEL` explicitly relative to "today's split". Say which modes it applies in, and how alias values map onto catalogue IDs.
**Status:** upheld

### [WARN] party-architect — The allow-list check covers only tier 1; the other model sources are unvalidated, and the allowed set can be empty

**Quotes:** > 1. explicit request, validated against the team allow-list;
**Quotes:** > 2. the user's remembered choice for that surface;
**Quotes:** > admins can remove any model from their team's list.
**Quotes:** > **Template fill (`design.template`, Path A) — decided 2026-10-12:** offers Haiku and Sonnet only.
**Quotes:** > A `ScheduledGeneration` may optionally pin models at plan time.
**Problem:** Only the explicit request is checked against the allow-list. Several persisted values are read back later: the remembered choice, the team default, the `Brief` model, the `ScheduledGeneration` pin and the env fallback. Any of them can name a model an admin has since removed. The resolver contract does not say whether such a value is rejected, skipped to the next tier, or used anyway. For a scheduler run with no user, "400" has no meaning. The per-surface catalogue restriction overlaps with the team allow-list, and the allow-list's scope (per team or per surface) is unstated. If an admin leaves only Opus, `design.template` has no valid model. party-security's BLOCK covers the bypass, which is the fail-open half of this. My finding is limited to the contract half: what each tier does on a miss, and whether the effective set can be empty. The two do not duplicate each other, so I keep mine at WARN.
**Fix:** Specify that the allow-list check applies at every tier, and what happens on a miss at each tier (fall through or fail, plus non-interactive behaviour). State the allow-list's scope. Require that catalogue ∩ allow-list is never empty for any surface, and say where that is enforced.
**Status:** upheld

### [WARN] party-architect — The timeout contract covers single calls, but the sweeps measure the whole chain, and the catalogue's timeout shape is stated two ways

**Quotes:** > A per-model design timeout, e.g. Opus ~600s against today's 300s, **kept strictly under the 15-minute stale sweeps**, or those sweeps become model-aware.
**Quotes:** > Each entry carries its full API ID, a display name, a relative cost/speed label, and a per-surface timeout.
**Quotes:** > (pinned to Haiku by user decision 2026-09-23 — the retry, not the check, uses the user's refine model)
**Problem:** Each call stays under 15 minutes, but the sweeps judge an action's age. A refine is the refine call, then the Haiku verifier, then a retry on the user's refine model. At Opus ~600s per call that is about 1200s, past the 900s `pendingAction` sweep. The two options ("kept strictly under" and "sweeps become model-aware") are different contracts with different co-changes, and the proposal leaves both open. The catalogue entry's timeout shape is inconsistent: item 1 says a per-surface timeout inside each model entry, while item 8 says a per-model timeout for design only. party-security and party-visionary both reached the same chain arithmetic. party-po suggests reducing the timeout to one per-model value. Structurally, that only works if the proposal also states that caption and assistant calls share the design budget, and it does not.
**Fix:** Pick one of the two options. State the budget as the worst-case chain per action (generation; refine + verify + retry), not as a per-call cap. Define the timeout field as a model × surface table that covers caption and the assistants.
**Status:** upheld

### [WARN] party-architect — The proposal adds a `ScheduledGeneration` model pin in its solution but omits it from scope, so its co-changes are unnamed

**Quotes:** > A `ScheduledGeneration` may optionally pin models at plan time.
**Quotes:** > - `TeamModelPolicy` (defaults per surface + allow-list) and per-user remembered choice — schema + migration
**Problem:** Item 6 introduces a model pin on `ScheduledGeneration`, but In Scope does not list it. A pin needs columns on `ScheduledGeneration` and fields on the queue create/edit routes and the batch route. The briefing chat's schedule-block grammar either gains a field or explicitly does not. The entry modal needs a picker. party-po proposes dropping the pin. Either resolution satisfies this finding, which is about the half-landed merge, not the pin's value.
**Fix:** Either list the pin and its co-changes in In Scope (schema, queue and batch route bodies, the schedule-block grammar, the entry modal), or move it to Out of Scope.
**Status:** upheld

### [WARN] party-architect — No test checks the model ID at the call boundary, and the timeout/sweep reconciliation has no test at all

**Quotes:** > - Unit tests for the pure resolver (precedence + allow-list); E2E: disallowed model → 400, stamp recorded, remembered choice restored
**Quotes:** > (`claude -p --model` accepts full IDs; see the `claudeCli.ts:20` comment)
**Problem:** The listed tests prove that the resolver picks a model and that the value is written to the database. Nothing proves that the resolved ID reaches the `claude -p --model` arguments or the Anthropic SDK request. That is where `CLAUDE_CLI_MODEL` used to win silently, and where a leftover hard-coded call site would go unnoticed while the stamp still looks right. Per-model timeouts against the two sweeps also need a deterministic test with an injectable clock or timeout. party-ba's criterion "stamped model equals requested model" is the acceptance side of this. A stamp-equals-request check would still pass with the gap above, because the stamp is written from the resolver's output, not from the spawn argument. A stub seam at the boundary is the test strategy that closes it.
**Fix:** Add a stub seam at the spawn/SDK boundary that records the model argument. Assert on it for every surface in the table, with `CLAUDE_CLI_MODEL` set and unset. Add unit tests that compute the per-action timeout budget against the sweep threshold, with no wall-clock dependence.
**Status:** upheld

### [NOTE] party-architect — Some call sites inside a surface have no picker, so a user sets their model on a different screen

**Quotes:** > - `assistant.brandkit` (vision extraction + image → template + voice draft)
**Quotes:** > - `assistant.briefing` (campaign chat + schedule planning + both Enhance flows)
**Quotes:** > - **Each assistant chat header** (campaign briefing, brand-kit assistant): a model menu.
**Problem:** Pickers exist only in chat headers. Image → template, voice draft and the post-brief Enhance on the wizard's Content step have no picker. They always resolve from a remembered choice the user set in a chat header on another page. party-ba filed the same gap as a definitional NOTE, which confirms it but does not change its severity.
**Fix:** Either confirm in the proposal that these sites resolve from the remembered choice by design, or split them into their own surfaces.
**Status:** upheld

### [NOTE] party-architect — Rebuttal to party-po's per-user-memory NOTE: the stamped-model default cannot stand in for remembered choice on new posts

**Quotes:** > - **Regenerate default — decided 2026-10-12:** the picker defaults to the draft's **stamped** model, so a regenerate is like for like unless the user changes it.
**Quotes:** > The last pick per surface is remembered per user.
**Problem:** party-po argues that browser-local storage or "default to the draft's stamped model" covers the repeat-use case. I am not disputing whether the feature is worth building; that is PO's call. The structural claim does not hold, though. A stamp exists only once a draft does, so it can seed the regenerate picker but not the brief wizard, the refine box on a fresh draft, or any assistant chat header. Those three of the four choice points listed in item 4 never see a stamp. Browser-local storage does work structurally, but only if pickers pre-fill and send a tier-1 explicit request. That removes tier 2 from the server resolver and changes the precedence contract the proposal states. So the deferral PO proposes is not a pure cut: it changes the resolver's tiers, and the proposal would need to say so.
**Fix:** If party-po's deferral is adopted, the proposal should state that the remembered-choice tier is removed from `resolveModel`. It should also say which value the wizard and chat pickers pre-select for a user with no stamp in reach.
**Status:** upheld

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

### [BLOCK] party-po — Scope never prices or considers a cheaper variant: the full per-surface, per-user, per-team picker system versus a team-level default plus a few pickers

**Quotes:**

> One model catalogue, one resolver, three places to choose.
> Brief wizard:** Caption model + Design model pickers on the Review step.
> Refine box:** a model picker beside the instruction.
> Each assistant chat header** (campaign briefing, brand-kit assistant): a model menu.
> Impact: **Files affected:** ~25–35 (estimated)
> **Problem:** The proposal states ~25–35 files, a new schema table and per-user remembered state, and wizard, refine and chat pickers across 6 surfaces. It never states the value delivered or the do-nothing cost. The Problem section says "a marketer who wants a richer design... has no control" but gives no frequency, and no one is shown to be asking for it. It also never considers a cheaper variant. The cheapest variant is a team-level (or per-surface) default set at `/team`, which needs no per-user table and no per-post picker. A second option adds one "Design model" picker on the wizard only. Most of the value is "I can use Opus or Sonnet 5.5 for richer output", and that is captured by the default plus one picker. Per-chat-header menus, the refine picker and per-user memory are the long tail. Round 2: the architect's two BLOCKs add weight. The regenerate pickers and the stamp/Brief ownership conflict show the picker system keeps growing unpriced. The 2026-09-23 decision picked the location of choice but did not compare it with the cheaper variant. The omission still stands.
> **Fix:** Add a "Cheaper variant considered" section. Compare (a) the upgrade of pinned IDs plus a team default per surface, against (b) the full picker system. State what (b) buys beyond (a). Price the do-nothing option as "pinned IDs stay a generation behind".
> **Status:** upheld

### [WARN] party-po — The ID upgrade and CLI/API version-drift fix have no stated dependence on the picker and ship separately for most of the value

**Quotes:**

> The pinned IDs are a generation behind. The API path pins `claude-sonnet-4-6`.
> The **full ID is passed in both modes**
> `CLAUDE_CLI_MODEL` moves from override to system-default fallback.
> **Problem:** The catalogue, full-ID pinning, ID upgrade, `voiceDraft.ts` migration and env-var demotion are valuable on their own and low-risk. They are bundled with the high-cost UI and schema work. The proposal names no cut line and no shipping order. Bundling delays the cheap wins and makes the whole change hostage to the picker UI. The architect's finding on the `modelFor` / env-read ambiguity concerns the same wave-1 work. It argues that wave 1 is a coherent unit that needs its contract stated.
> **Fix:** Name the cut line explicitly. Wave 1: catalogue, `resolveModel` with system default and team default, ID upgrade, stamps, and timeout reconciliation. Wave 2: the pickers and per-user memory. State that wave 1 is independently worth shipping.
> **Status:** upheld

### [WARN] party-po — Recurring cost of Opus-for-everyone is unquantified, and the default contradicts the proposal's own risk note

**Quotes:**

> **Decided 2026-09-23: Opus is allowed for everyone by default**
> A wrong precedence or an unvalidated request could route every call to Opus, with a cost and limit impact.
> Opus ~600s against today's 300s
> **Problem:** Shipping Opus open to all means a user on upgrade can pick a model with up to 2x the design wall-clock and a higher subscription-limit burn. This lands on the shared team token for scheduled, MCP and ACP callers. The only mitigation is a non-blocking notice for CLI mode, and that applies only to the team-token case. No per-run or per-post cost is stated. Cost is deferred to 006, which is a separate proposal that may not ship. The 15-minute sweep has a 900s ceiling against a 600s Opus design timeout. The architect shows the chain (caption, background, design; or refine, verify, retry) can exceed 900s even when each call meets its own cap. I accept that the open-to-all default is a user decision. This finding is therefore only about the unstated multiplier and wall-clock budget, not about reversing the decision.
> **Fix:** State the multiplier per tier (calls per post at each model, and the wall-clock budget summed against 900s). Optionally offer a team-level Opus switch that is off by default, as an opt-out the user may decline.
> **Status:** upheld

### [WARN] party-po — Scope with no stated value: team-defined allow-list, schedule-time model pinning, and Fable-readiness plumbing

**Quotes:**

> A `ScheduledGeneration` may optionally pin models at plan time.
> admins can remove any model from their team's list.
> Each entry carries its full API ID, a display name, a relative cost/speed label, and a per-surface timeout.
> **Problem:** Optional pin-at-plan-time for scheduled generation is optionality nobody is shown to have asked for, and it adds schema and UI to the queue. The architect separately found its co-changes (queue and batch routes, the schedule-block grammar, the entry modal) unnamed in scope, which confirms the cost is real. The per-surface timeout field on every catalogue entry is more config than three models need. Each knob is a cost paid forever. The allow-list, team defaults and per-user memory are three layers of state for a 3-model catalogue.
> **Fix:** Drop the scheduled-entry pin. It falls back to the team default and can be added later. Cut the per-surface timeout to a per-model value unless a surface really differs.
> **Status:** upheld

### [NOTE] party-po — Per-user remembered choice is the first thing to cut and is worth naming as a deferral

**Quotes:**

> The last pick per surface is remembered per user.
> **Problem:** Per-user per-surface memory needs its own table or JSON field and a resolver tier. Browser-local storage, or just "default to the draft's stamped model", which the proposal already decides for regenerate, covers the repeat-use case at much lower cost. The BA and architect findings show that the remembered tier is also the most ambiguous one. It is unclear whether it is a client pre-fill or a resolver tier, and it is unclear how it interacts with the stamped-model default and with a later change to the team default. That ambiguity is a cost of keeping the tier.
> **Fix:** Defer server-side per-user memory. Use the team default plus the stamped-model default for regenerate.
> **Status:** upheld

### [BLOCK] party-security — The allow-list is enforced on tier 1 only, so stored choices get around an admin's removal

**Quotes:**

> 1. explicit request, validated against the team allow-list;
> 2. the user's remembered choice for that surface;
> 3. the team default;
>
> - `Brief` carries the chosen caption/design model so async generation, retry and regenerate reuse it
>   A `ScheduledGeneration` may optionally pin models at plan time.
>   **Regenerate default — decided 2026-10-12:** the picker defaults to the draft's **stamped** model, so a regenerate is like for like unless the user changes it.
>   **Problem:** Only the explicit request is checked against the allow-list. Tiers 2 to 4 are used as given, and they are stored values that the governed user writes: a remembered choice, a `Brief` field, a `ScheduledGeneration` pin, a draft stamp. Suppose an admin removes Opus. Every user whose last pick was Opus still resolves to Opus through tier 2. Queued scheduled entries pinned to Opus still run on the team token. Retries and regenerates of Opus briefs still reuse Opus. `/team` shows the removal as applied while the model keeps running. An editor can also bypass the check on purpose: write the remembered choice, then send no explicit request. The precedence as written does not back the sentence "the server always validates against the allow-list". In round 1, party-architect separately found the same gap (WARN, "The allow-list check covers only tier 1"). That confirms the entry point is there in the text.
>   **Fix:** Validate the resolver's output at every tier against the current allow-list at call time, and also check writes to remembered choices and pins. A stored value that is no longer allowed falls through to the team default and is recorded as a substitution. It never runs. An explicit request for a disallowed model keeps the stated 400. Add one unit case per tier showing that a stored disallowed value is never returned.
>   **Status:** upheld

### [BLOCK] party-security — A resolved model string reaches a CLI process argument, and catalogue membership is never stated as the gate

**Quotes:**

> The **full ID is passed in both modes** (`claude -p --model` accepts full IDs; see the `claudeCli.ts:20` comment), so CLI and API always run the same version.
> `CLAUDE_CLI_MODEL` moves from override to system-default fallback.
> **Problem:** The value from `resolveModel` goes straight onto the `claude -p` command line. Several of its sources are database fields that users can write: remembered choice, `Brief`, `ScheduledGeneration` pin, and the `TeamModelPolicy` defaults and allow-list. The env fallback is a free-form string. The only check named is against "the team allow-list", which is itself admin-written data. Nothing says a value must exactly match a fixed catalogue entry before it reaches the spawn. party-visionary's round-1 finding that the proposal never says whether rows hold "the catalogue's full API ID or a stable catalogue key" confirms that the stored representation is unspecified. A free-form stored string in an argv position is the trusted-position crossing this probe looks for.
> **Fix:** Make the catalogue a closed enum. Store model choices only as catalogue keys, using a Prisma enum or `z.enum` at every write boundary. This also fits party-visionary's fix. Have the resolver return a catalogue entry, not a string, so the spawn site can only pass `entry.apiId`. Treat a `CLAUDE_CLI_MODEL` that is not in the catalogue as a boot error rather than passing it through.
> **Status:** upheld

### [WARN] party-security — The design timeout is per call, but the 15-minute sweep measures a multi-call span, so an Opus refine can be marked FAILED while it is still running and billing

**Quotes:**

> A per-model design timeout, e.g. Opus ~600s against today's 300s, **kept strictly under the 15-minute stale sweeps**, or those sweeps become model-aware. A generation must never be marked FAILED by the sweep while its model call is still legitimately running.
> **004's refine verifier** (pinned to Haiku by user decision 2026-09-23 — the retry, not the check, uses the user's refine model).
> **Problem:** The invariant is stated for one call, but the sweep times a whole action. An Opus refine runs the background decision, an Opus refine call (~600s), the Haiku verifier, then an Opus retry (~600s). That is about 1200s, past the 900s `pendingAction` sweep, even though each call meets its own cap. The sweep then reports FAILED while the chain keeps running and spending. The user starts another action, so the spend on the abandoned run is wasted. party-architect and party-visionary reached the same arithmetic independently.
> **Fix:** Bound the whole action. Either set one deadline per action below the sweep window and pass the remaining budget to each call, or have the sweep read a per-action deadline written at claim time. Add a test that sums each surface's worst-case chain at the Opus timeout.
> **Status:** upheld

### [WARN] party-security — What happens when a stored model is no longer valid is unspecified, so it could become a silent substitution or a retry loop

**Quotes:**

> **Regenerate default — decided 2026-10-12:** the picker defaults to the draft's **stamped** model, so a regenerate is like for like unless the user changes it.
> Fable 5.1 is left out by user decision (2026-10-12) and can be added later as one entry.
> **Team defaults + allow-list at `/team`** (team admins). **Decided 2026-09-23: Opus is allowed for everyone by default**; admins can remove any model from their team's list.
> **Problem:** The catalogue will change. Old drafts carry stamps that are stale or missing, and an admin can empty a surface's allow-list or set a team default that is not on it. The proposal gives no resolver behaviour for any of these cases. If the run fails, a scheduled entry goes through three backoff retries and ends FAILED about 2h later. If the resolver quietly swaps the model, the picker still claims "like for like". Neither outcome is visible until someone reads a stamp, and the scheduler and MCP have no user to show a notice to. party-architect (empty effective set) and party-visionary (retired ID on regenerate) raised the same gap from their own angles.
> **Fix:** Define one rule. A stored or stamped model that is not in the catalogue, or not allowed, resolves to the team default. The substitution shows in the picker, is recorded in the stamp, and is logged as a warning on scheduled and MCP runs. `/team` rejects an empty effective set for any surface, or a team default outside the list, when it saves. If such a state exists anyway, the resolver fails closed with a clear `errorReason`.
> **Status:** upheld

### [WARN] party-security — Demoting `CLAUDE_CLI_MODEL` removes an operator's model ceiling without any warning

**Quotes:**

> `CLAUDE_CLI_MODEL` moves from override to system-default fallback.
> **Decided 2026-09-23: Opus is allowed for everyone by default**
> **Problem:** Today, setting `CLAUDE_CLI_MODEL` is the only deploy-time way to keep Opus off a deployment. After the change it ranks below the user's pick and the team default, and Opus is allowed by default. A deployment that set it to avoid Opus starts running Opus on the next deploy, with unchanged config and no signal. party-architect's round-1 point makes this worse. Placed below tier 4, the variable "would never fire", because today's split always resolves. So the operator's lever does not just lose priority: it may do nothing at all.
> **Fix:** If `CLAUDE_CLI_MODEL` is set at boot, log a warning that its meaning has changed. Better, add a separate operator ceiling (for example `CLAUDE_MODEL_ALLOW`) that the resolver applies above the team allow-list. Put the change in the release note.
> **Status:** upheld

### [WARN] party-security — One editor's Opus runs on the shared team token can starve the scheduler and MCP, and they have no other credential

**Quotes:**

> **Team-token warning — decided 2026-10-12:** in CLI mode, when Opus is picked and the run would use the **team** Claude token (no personal token connected), the picker shows a small non-blocking notice that the run uses the team's allowance.
> **Non-interactive callers use the team default:** the scheduler, MCP and ACP have no acting user (they pass `null` to `withClaudeAuth`).
> **Problem:** The team token is the only credential that scheduled generation, MCP and ACP can use. The only guard against an editor using up its allowance with Opus is a notice the editor can dismiss. Once the allowance runs out, scheduled posts fail on usage limits and look like ordinary generation failures after the backoff. Nothing records that the cause was token exhaustion. The admin's only lever is removing Opus for the whole team. This finding is about that failure mode and how visible it is, not about cost. party-po's cost finding on the same line is a separate concern, and I do not repeat it.
> **Fix:** Let `TeamModelPolicy` restrict a model by credential tier (for example "Opus only on a personal token"). Classify usage-limit failures on scheduled runs explicitly in `errorReason`.
> **Status:** upheld

### [NOTE] party-security — Rebuttal to party-visionary's "map it to its successor key": a silent successor mapping is a substitution, and it must still pass the allow-list

**Quotes:**

> **Regenerate default — decided 2026-10-12:** the picker defaults to the draft's **stamped** model, so a regenerate is like for like unless the user changes it.
> **Problem:** party-visionary's fix ("map it to its successor key, or fall through to the next precedence tier. Don't reject it.") is right that stored values should not hard-fail. But mapping a retired ID to its successor is itself a model choice the user never made. The successor may cost more or run slower, and it may be a model the admin has removed from the allow-list. Done silently, it brings back the invisible routing that the Risk section says the design should prevent. The explicit-request 400 should also stay as it is: falling through is the right handling for stored values only.
> **Fix:** Whatever mapping is chosen (successor key or next tier), check its result against the current allow-list. Show it as a substitution in the picker and record it in the stamp. Only explicit requests return 400.
> **Status:** upheld

### [WARN] party-visionary — Preference rows store model identity, so the next model upgrade is a data migration and old drafts regenerate onto a retired ID

**Quotes:**

> 1. **The pinned IDs are a generation behind.** The API path pins `claude-sonnet-4-6`.
>    Each entry carries its full API ID, a display name, a relative cost/speed label, and a per-surface timeout.
>    A `ScheduledGeneration` may optionally pin models at plan time.
>
> - `Brief` carries the chosen caption/design model so async generation, retry and regenerate reuse it
> - **Regenerate default — decided 2026-10-12:** the picker defaults to the draft's **stamped** model, so a regenerate is like for like unless the user changes it.
>   **Problem:** Today the upgrade that motivates the proposal (Problem 1) is a one-file edit to `config.ts`. After this change, model identity is persisted in at least five places: `TeamModelPolicy` defaults and allow-lists, per-user remembered choices, `ScheduledGeneration` pins, `Brief` model fields, and the stamps. The proposal never says whether those rows hold the full API ID or a stable catalogue key. If they hold the full ID, the next upgrade (Sonnet 5.5 to its successor, or retiring `claude-haiku-4-5-20251001`) means migrating every preference table. Without that migration, the rows point at an ID that has left the catalogue. The regenerate decision makes this certain to surface: every draft made before the upgrade opens its picker on its stamped ID, tier 1 rejects that ID against the allow-list, and regenerating any old draft fails until someone writes a fallback rule. party-security's round-1 findings support this from a separate direction. Their closed-enum BLOCK asks for the same storage shape (catalogue keys, not strings). Their stale-model WARN asks for the same missing rule (a stored model that is no longer valid). Neither finding covers the cost addressed here, which is that a config edit becomes a data migration repeated at every upgrade. The proposal still does not acknowledge it.
>   **Fix:** Store a stable catalogue key (e.g. `sonnet`, `opus`) in the preference, policy, pin and Brief rows. Keep full IDs only in the "what ran" stamps, which are history and are never rewritten. State the resolver's rule for a stamped or remembered key that has left the catalogue: map it to its successor key, or fall through to the next tier. Do not reject it.
>   **Status:** upheld

### [WARN] party-visionary — Per-model timeouts and the two 15-minute sweeps become an ordering invariant kept by hand, and the proposal leaves it undecided

**Quotes:**

> 8. **Timeouts scale with the model.** A per-model design timeout, e.g. Opus ~600s against today's 300s, **kept strictly under the 15-minute stale sweeps**, or those sweeps become model-aware. A generation must never be marked FAILED by the sweep while its model call is still legitimately running.
> **Problem:** As written, "kept strictly under" means constants in at least two files must stay ordered for as long as the code exists. Nothing fails when they stop being ordered. party-architect and party-security showed in round 1 that the invariant concerns chain sums: refine, then verify, then retry, or caption, then background, then design. A single maximum is not enough. That makes the long-horizon problem worse. Raising any one per-model timeout, or adding a model such as Fable 5.1, changes several chain totals at once, and the contributor editing one catalogue value has no way to see that. The first symptom is a correctly running generation marked FAILED with "Generation was interrupted". It shows up only on the slowest real runs, which the mock E2E suite never exercises. Because the proposal says "or", the planner may ship the invariant as a comment.
> **Fix:** Decide it in the proposal. Either both sweeps derive their threshold from the catalogue (worst-case chain per action, plus a margin), or a unit test computes each action's worst-case chain from the catalogue and fails if it reaches either sweep constant. Then an edit to one value is stopped at the gate.
> **Status:** upheld

### [WARN] party-visionary — "Added later as one entry" is not true: a new model also needs allow-list membership, per-surface eligibility, a cost tier and a timeout, and allow-list semantics for it are undefined

**Quotes:**

> Fable 5.1 is left out by user decision (2026-10-12) and can be added later as one entry.
> **Decided 2026-09-23: Opus is allowed for everyone by default**; admins can remove any model from their team's list.
>
> - **Template fill (`design.template`, Path A) — decided 2026-10-12:** offers Haiku and Sonnet only. Freeform design, refine and the assistants offer all three models.
>   **Problem:** The next catalogue change is already named: adding Fable 5.1. The contributor who makes it has to settle four things the proposal counts as one entry: which surfaces the model is eligible for (`design.template` shows eligibility is per surface), its cost tier, its timeout (which interacts with the sweeps), and whether existing teams get it. The last is a real fork the proposal does not settle. If `TeamModelPolicy` stores an explicit allowed list, as "remove any model from their team's list" implies, the new model reaches no existing team until each admin adds it. If it stores a deny-list, every team silently gains the new model, and its cost, on deploy. party-security's BLOCK (a removal does not stop stored choices) makes the choice of representation more pressing, since it governs what "removed" means across every tier.
>   **Fix:** State the allow-list representation: an explicit list, or "all catalogue models except removed ones". State what a newly added catalogue model does for existing teams. Put per-surface eligibility on the catalogue entry itself, so that adding a model really is one entry plus one decision.
>   **Status:** upheld

### [WARN] party-visionary — Internal steps stay as scattered hard-coded pins, so the next ID upgrade repeats Problem 1 for exactly the sites outside the catalogue

**Quotes:**

> Internal steps stay fixed and are not user-facing: the background-image decision (Haiku, `modelForBackground`), the token-validation ping (`userToken.ts:127`), and **004's refine verifier** (pinned to Haiku by user decision 2026-09-23 — the retry, not the check, uses the user's refine model).
> | Brand voice draft | Sonnet 4.6, separately hard-coded | `brandkit/voiceDraft.ts:7` (bypasses `modelFor` entirely) |
> **Problem:** The proposal fixes one bypass (`voiceDraft.ts`) and leaves at least three other model pins outside the catalogue. The next "the pinned IDs are a generation behind" fix will have to find them again by grep. "Not user-facing" is a reason not to show a picker. It is not a reason to keep the ID out of the catalogue. The precedent this sets is that a model call is either a user surface routed through `resolveModel` or a free-standing literal. The next internal call (006's tracing, or a 009 hero-imagery decision step) will copy the literal. party-architect's call-boundary WARN asks for a seam that records the model argument for each user surface. It does not cover call sites that never declare a surface.
> **Fix:** Give internal steps fixed, non-selectable surfaces in the same catalogue (`internal.background`, `internal.verifier`, `internal.tokenPing`), each resolving to a catalogue key. Add a guard unit test that fails on any `claude-*` ID, or any bare `haiku`/`sonnet`/`opus` model literal, outside `config.ts`.
> **Status:** upheld

### [WARN] party-visionary — Cost tiers are a hand-copied snapshot of Anthropic's price sheet, and 006 will need a second, numeric copy

**Quotes:**

> - **Cost label — decided 2026-10-12:** relative tiers (`$ / $$ / $$$`) plus a speed hint. They are derived from current published pricing at design time, not from memory.
>   **Problem:** "Derived at design time" means the tiers are copied once from an external source into code, and nothing refreshes them. They drift silently the first time a price changes or a model is added, and a stale `$$` label raises no error. The proposal hands cost visibility to 006, which needs real per-token prices. Once 006 lands there will be two representations of pricing, the glyphs here and 006's numbers, and they can disagree.
>   **Fix:** Store input and output price per million tokens on each catalogue entry, with a dated source note, and compute the tier from those numbers. 006 then reads the same field.
>   **Status:** upheld

### [WARN] party-visionary — Surface names become a persisted vocabulary that is coarser than the stamps, so the obvious next split (headline vs captions, voice draft vs vision) is a data migration

**Quotes:**

> So the headline sits **under** the `caption` surface, not beside it, and the same surface covers `regenerate-copy` in all three forms
>
> - `assistant.brandkit` (vision extraction + image → template + voice draft)
>
> 7. **Stamp what ran.** **Decided 2026-10-12:** the caption stamp is **per row**, as `DraftCaption.model` plus `Draft.headlineModel`.
>    **Problem:** Surface names are keys in persisted rows: `TeamModelPolicy` per-surface defaults, per-user remembered choices, and the 006 traces that read them. The proposal does not treat them as a lasting vocabulary. Their granularity is already uneven. The stamps separate the headline from each channel, but choice does not, and `assistant.brandkit` groups a text task with two vision tasks. party-architect's NOTE and party-ba's NOTE confirm the seam is real today: image to template and voice draft have no picker of their own. Both treat it as a merge-day question of where these sites choose their model. The long-horizon cost is different. Splitting `caption` or `assistant.brandkit` after rows exist means a migration plus an inheritance rule for every team and user, and a key mapping for 006's traces.
>    **Fix:** Acknowledge the surface list as a persisted contract. Either store surfaces as a closed enum with a documented split procedure (the new surface inherits its parent's row), or split now where the stamps already show the seam: `caption` vs `headline`, and `assistant.brandkit` vs `assistant.voice`.
>    **Status:** upheld

### [NOTE] party-visionary — Rebuttal of party-security's per-credential-tier fix: it adds a third policy axis that every later catalogue change must fill in

**Quotes:**

> **Team-token warning — decided 2026-10-12:** in CLI mode, when Opus is picked and the run would use the **team** Claude token (no personal token connected), the picker shows a small non-blocking notice that the run uses the team's allowance.
> **Problem:** I do not dispute the failure mode party-security raises (interactive Opus use draining the team token the scheduler depends on). Their proposed fix ("Let `TeamModelPolicy` allow a model per credential tier") would turn the policy from surface × model into surface × model × credential tier, and that shape would be persisted. Every later catalogue addition (Fable 5.1 is already named) and every surface split would then need a decision for each credential tier for each team, and the allow-list representation question from my Fable finding would apply to each tier separately. Credential routing is also being reworked by 005 item 2, which the proposal places out of scope ("Choosing the **provider or credential route** for captions"). A policy axis keyed on today's two-tier personal→team chain would be built on the part of the system most likely to change next.
> **Fix:** Address starvation with something that does not widen the persisted policy matrix. Use party-security's own second suggestion, an explicit usage-limit classification in `errorReason` for scheduled runs, together with a single team-level boolean, "expensive models require a personal token". Leave a per-tier allow-list until 005's credential routing has settled.
> **Status:** upheld

## Dissent

_Withdrawn findings. The severity token is prefixed WITHDRAWN so these do not count as live findings._

### [WITHDRAWN WARN] party-visionary — `Brief`'s model field and the draft's stamp become two answers to "which model does regenerate use", and they diverge after the first regenerate

**Quotes:**

> - `Brief` carries the chosen caption/design model so async generation, retry and regenerate reuse it
> - **Regenerate default — decided 2026-10-12:** the picker defaults to the draft's **stamped** model, so a regenerate is like for like unless the user changes it.
>   **Problem:** Scope says regenerate reuses the `Brief`'s model, while the later decision says it defaults to the stamp. After the first regenerate on a different model the two diverge. The `Brief` field then goes stale for the life of the draft.
>   **Fix:** Name one authority for the regenerate default.
>   **Status:** withdrawn — the divergence is true on merge day, so it is outside this seat's horizon. party-architect's BLOCK "Two stores answer which model the next regenerate uses" covers it in full, including the mixed per-row stamps on "Regenerate all" and the null-stamp case, with the same fix. Once that ruling picks an owner, the downstream-reader concern (006, a future "duplicate post") goes away with it.
