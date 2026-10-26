### [BLOCK] party-po — Scope never prices or considers a cheaper variant: the full per-surface, per-user, per-team picker system versus a team-level default plus a few pickers

**Quotes:**

> One model catalogue, one resolver, three places to choose.
> Brief wizard:** Caption model + Design model pickers on the Review step.
> Refine box:** a model picker beside the instruction.
> Each assistant chat header** (campaign briefing, brand-kit assistant): a model menu.
> Impact: **Files affected:** ~25–35 (estimated)
> **Problem:** The proposal states ~25–35 files, a new schema table and per-user remembered state, and wizard, refine and chat pickers across 6 surfaces. It never states the value delivered or the do-nothing cost. The Problem section says "a marketer who wants a richer design... has no control" but gives no frequency, and no one is shown to be asking for it. It also never considers a cheaper variant. The cheapest variant is a team-level (or per-surface) default set at `/team`, which needs no per-user table and no per-post picker. A second option adds one "Design model" picker on the wizard only. Most of the value is "I can use Opus or Sonnet 5.5 for richer output", and that is captured by the default plus one picker. Per-chat-header menus, the refine picker and per-user memory are the long tail. The omission of this comparison is the finding.
> **Fix:** Add a "Cheaper variant considered" section. Compare (a) the upgrade of pinned IDs plus a team default per surface, against (b) the full picker system. State what (b) buys beyond (a). Price the do-nothing option as "pinned IDs stay a generation behind".
> **Status:** upheld

### [WARN] party-po — The ID upgrade and CLI/API version-drift fix have no stated dependence on the picker and ship separately for most of the value

**Quotes:**

> The pinned IDs are a generation behind. The API path pins `claude-sonnet-4-6`.
> The **full ID is passed in both modes**
> `CLAUDE_CLI_MODEL` moves from override to system-default fallback.
> **Problem:** The catalogue, full-ID pinning, ID upgrade, `voiceDraft.ts` migration and env-var demotion are valuable on their own and low-risk. They are bundled with the high-cost UI and schema work. The proposal names no cut line and no shipping order. Bundling delays the cheap wins and makes the whole change hostage to the picker UI.
> **Fix:** Name the cut line explicitly. Wave 1: catalogue, `resolveModel` with system default and team default, ID upgrade, stamps, and timeout reconciliation. Wave 2: the pickers and per-user memory. State that wave 1 is independently worth shipping.
> **Status:** upheld

### [WARN] party-po — Recurring cost of Opus-for-everyone is unquantified, and the default contradicts the proposal's own risk note

**Quotes:**

> **Decided 2026-09-23: Opus is allowed for everyone by default**
> A wrong precedence or an unvalidated request could route every call to Opus, with a cost and limit impact.
> Opus ~600s against today's 300s
> **Problem:** Shipping Opus open to all means a user on upgrade can pick a model with up to 2x the design wall-clock and a higher subscription-limit burn. This lands on the shared team token for scheduled, MCP and ACP callers. The only mitigation is a non-blocking notice for CLI mode, and that applies only to the team-token case. No per-run or per-post cost is stated. Cost is deferred to 006, which is a separate proposal that may not ship. The 15-minute sweep has a 900s ceiling against a 600s Opus design timeout, with headroom of 300s. That is not stated for the caption plus background-image plus render steps.
> **Fix:** State the multiplier per tier (calls per post at each model, and the wall-clock budget summed against 900s). Consider flipping the shipped default to Opus off, or opt-in per team, until 006 shows cost.
> **Status:** upheld

### [WARN] party-po — Scope with no stated value: team-defined allow-list, schedule-time model pinning, and Fable-readiness plumbing

**Quotes:**

> A `ScheduledGeneration` may optionally pin models at plan time.
> admins can remove any model from their team's list.
> Each entry carries its full API ID, a display name, a relative cost/speed label, and a per-surface timeout.
> **Problem:** Optional pin-at-plan-time for scheduled generation is optionality nobody is shown to have asked for, and it adds schema and UI to the queue. The per-surface timeout field on every catalogue entry is more config than the three models need. Each knob is a cost paid forever. The allow-list plus team defaults plus per-user memory give three layers of state for a 3-model catalogue.
> **Fix:** Drop the scheduled-entry pin. It falls back to the team default and can be added later. Cut the per-surface timeout to a per-model value unless a surface really differs.
> **Status:** upheld

### [NOTE] party-po — Per-user remembered choice is the first thing to cut and is worth naming as a deferral

**Quotes:**

> The last pick per surface is remembered per user.
> **Problem:** Per-user per-surface memory needs its own table or JSON field and a resolver tier. Browser-local storage, or just "default to the draft's stamped model", which the proposal already decides for regenerate, covers the repeat-use case at much lower cost.
> **Fix:** Defer server-side per-user memory. Use the team default plus the stamped-model default for regenerate.
> **Status:** upheld
