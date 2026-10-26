### [BLOCK] party-security — The allow-list is enforced on tier 1 only, so stored choices get around an admin's removal

**Quotes:**

> 1. explicit request, validated against the team allow-list;
> 2. the user's remembered choice for that surface;
> 3. the team default;
>    **Quotes (continued):**
>
> - `Brief` carries the chosen caption/design model so async generation, retry and regenerate reuse it
>   A `ScheduledGeneration` may optionally pin models at plan time.
>   **Regenerate default — decided 2026-10-12:** the picker defaults to the draft's **stamped** model, so a regenerate is like for like unless the user changes it.
>   **Problem:** The precedence list checks only the explicit request against the allow-list. Tiers 2 to 4 are taken as given. They are also persisted values that the user being governed writes: a remembered choice, a `Brief` field, a `ScheduledGeneration` pin, a draft stamp. Suppose an admin removes Opus. Every user who last picked Opus keeps resolving to Opus through tier 2. Every queued `ScheduledGeneration` pinned to Opus still runs on Opus, on the team token. Every retry or regenerate of an Opus brief or draft still reuses Opus. The removal looks applied in `/team` while the model keeps running. An editor can also skip the validated path entirely: write the remembered choice directly (whatever endpoint persists "the last pick per surface"), then send no explicit request. The sentence "the server always validates against the allow-list" is not backed by the precedence as written.
>   **Fix:** Validate the resolver's output at every tier, against the current allow-list at call time, not at write time. Resolve a stored value that is no longer allowed to the team default, with a visible notice in the UI and the stamp. Never run it. Validate remembered-choice writes and `ScheduledGeneration` pins against the allow-list when they are written as well. Add a unit case for each tier: a stored disallowed value must never be returned.
>   **Status:** upheld

### [BLOCK] party-security — A resolved model string reaches a CLI process argument, and catalogue membership is never stated as the gate

**Quotes:**

> The **full ID is passed in both modes** (`claude -p --model` accepts full IDs; see the `claudeCli.ts:20` comment), so CLI and API always run the same version.
> `CLAUDE_CLI_MODEL` moves from override to system-default fallback.
> **Problem:** The value `resolveModel` returns goes straight into the `claude -p` command line. Several of its sources are user-writable database fields: remembered choice, `Brief`, `ScheduledGeneration` pin, `TeamModelPolicy` defaults and allow-list. The env-var fallback is a free-form string. The proposal checks values only against "the team allow-list", which is itself admin-written data. It never says that every value must be an exact member of the fixed catalogue before it reaches the spawn. If a stored free-form string reaches the argument vector, the only things between it and the CLI are option parsing and, on a shell-spawned process, shell quoting. A value such as `--dangerously-…` or one with shell metacharacters would then be in a trusted position.
> **Fix:** Make the catalogue a closed enum. Store model choices only as catalogue keys: a Prisma enum, or a zod `z.enum` at every write boundary. Have the resolver return a catalogue entry, not a string, so the spawn site can pass only `entry.apiId`. Treat a `CLAUDE_CLI_MODEL` that is not a catalogue ID as an error at boot. Do not pass it through.
> **Status:** upheld

### [WARN] party-security — The design timeout is per call, but the 15-minute sweep measures a multi-call span, so an Opus refine can be marked FAILED while it is still running and billing

**Quotes:**

> A per-model design timeout, e.g. Opus ~600s against today's 300s, **kept strictly under the 15-minute stale sweeps**, or those sweeps become model-aware. A generation must never be marked FAILED by the sweep while its model call is still legitimately running.
> **004's refine verifier** (pinned to Haiku by user decision 2026-09-23 — the retry, not the check, uses the user's refine model).
> **Problem:** The invariant is stated for one call, but the sweep covers a whole action. An Opus refine is a chain: background decision, then an Opus refine of up to about 600s, then the Haiku verifier, then an Opus retry of up to about 600s. That adds up to about 1200s, past the 900s `pendingAction` sweep, even though each call stays under its own cap. Generation stacks the caption call, image generation, the Opus design call and the render in the same way. The sweep then reports FAILED while the chain keeps running and spending tokens. The user, told it failed, starts another action, so the abandoned run's spend is wasted.
> **Fix:** Bound the whole action, not each call. Either give the action one deadline under the sweep window, with remaining time passed to each call, or make the sweep read a per-action deadline written when the action is claimed. Add a test that sums the worst-case chain for each surface at the Opus timeout.
> **Status:** upheld

### [WARN] party-security — What happens when a stored model is no longer valid is unspecified, so it could become a silent substitution or a retry loop

**Quotes:**

> **Regenerate default — decided 2026-10-12:** the picker defaults to the draft's **stamped** model, so a regenerate is like for like unless the user changes it.
> Fable 5.1 is left out by user decision (2026-10-12) and can be added later as one entry.
> **Team defaults + allow-list at `/team`** (team admins). **Decided 2026-09-23: Opus is allowed for everyone by default**; admins can remove any model from their team's list.
> **Problem:** The catalogue is expected to change: IDs get upgraded and entries get added or removed. Pre-existing drafts carry old or missing stamps, and an admin may empty a surface's allow-list or set a team default that is not on it. The proposal does not say what the resolver does in any of these cases. In one reading the run fails, and for the scheduler that means three backoff retries ending in FAILED about 2h later. In the other it quietly swaps in a different model while the picker claims "like for like". Either outcome is invisible until someone reads a stamp. The scheduler and MCP have no acting user, so nobody would see a UI notice.
> **Fix:** Define one rule. If a stored or stamped model is not in the current catalogue, or not allowed, use the team default, show it as a substitution in the picker, and record it in the stamp. A scheduled run should log a warning. Reject an empty allow-list or an out-of-list team default when `/team` saves, and fail closed with a clear error if one exists anyway.
> **Status:** upheld

### [WARN] party-security — Demoting `CLAUDE_CLI_MODEL` removes an operator's model ceiling without any warning

**Quotes:**

> `CLAUDE_CLI_MODEL` moves from override to system-default fallback.
> **Decided 2026-09-23: Opus is allowed for everyone by default**
> **Problem:** Today an operator who sets `CLAUDE_CLI_MODEL` gets one model on every call. That is the only deploy-time lever that keeps Opus off a deployment. After this change the same env value sits below the user's pick and the team default, and Opus is allowed by default. A deployment that set the variable to stay off Opus therefore starts running Opus on the next deploy. The config is unchanged and nothing signals the difference.
> **Fix:** At boot, if `CLAUDE_CLI_MODEL` is set, log a warning that it is now only a fallback. Better, add a separate operator ceiling (for example `CLAUDE_MODEL_ALLOW`) that the resolver applies above the team allow-list. Mention the semantic change in the release note.
> **Status:** upheld

### [WARN] party-security — One editor's Opus runs on the shared team token can starve the scheduler and MCP, and they have no other credential

**Quotes:**

> **Team-token warning — decided 2026-10-12:** in CLI mode, when Opus is picked and the run would use the **team** Claude token (no personal token connected), the picker shows a small non-blocking notice that the run uses the team's allowance.
> **Non-interactive callers use the team default:** the scheduler, MCP and ACP have no acting user (they pass `null` to `withClaudeAuth`).
> **Problem:** The team token is the only credential for scheduled generation, MCP and ACP. The only safeguard against an editor using up its allowance with Opus is a non-blocking notice the editor can dismiss. Once the allowance is exhausted, scheduled posts fail on rate or usage limits. They show up as generation failures after the retry backoff, not as "the team token was exhausted by interactive Opus use". The admin's only lever is removing Opus for the whole team. I am raising this failure mode, not asking for spend caps.
> **Fix:** Let `TeamModelPolicy` allow a model per credential tier, for example "Opus only on a personal token", so an admin can protect the team token without removing Opus everywhere. Classify usage-limit failures on scheduled runs explicitly in `errorReason`, so the cause is visible.
> **Status:** upheld
