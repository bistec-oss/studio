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
