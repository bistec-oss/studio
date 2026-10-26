### [BLOCK] party-architect — The rendered-headline record is one Draft column, but design state is per revision and restore moves it

**Quotes:** > To know which headline the design was rendered with, every design write records it (a nullable column; null for drafts from before 006, which fall back to checking whether the current headline appears in the HTML).
**Quotes:** > One migration (the event table and the rendered-headline column)
**Quotes:** > `commitDraftRevision` (inline edit, restore, adopt)
**Quotes:** > `Draft.designModel`, `headlineModel`, `headlineRoute`, `promptVersion`, `composition`, `DraftRevision.model`/`composition`
**Problem:** The proposal says design state is versioned. It names composition stamps on both `Draft` and `DraftRevision`, and it names restore and adopt as revision writers. But it adds the rendered-headline record as a single column ("the rendered-headline column"). A restore or adopt puts an older revision's HTML back as the current design, and the writer cannot know which headline that HTML was rendered with unless the revision recorded it. With a Draft-only column, a restored draft either keeps the headline of the design it replaced (a wrong badge) or falls to null and the weaker fallback. The badge's apply action then searches the HTML for text the HTML does not contain. The proposal also says "every design write" without listing the writers: first generation (Path A and B), regenerate design, refine, inline edit, restore, adopt, the badge's own apply, and the scheduled and MCP generation paths. Any writer that is missed leaves the column wrong, and the badge reports a false stale or misses a real one.
**Fix:** Add the column to `DraftRevision` as well, as with `composition`. Have restore and adopt copy it from the revision they reinstate. List in the artifact every writer that must set it, and include the badge's own apply commit.
**Status:** upheld

### [WARN] party-architect — For pre-006 drafts the apply action has no old headline to replace

**Quotes:** > it replaces the rendered headline text in the stored HTML, only if that text occurs exactly once
**Quotes:** > null for drafts from before 006, which fall back to checking whether the current headline appears in the HTML
**Problem:** Item 8 sets up two different staleness rules. With the column set, it compares the stored rendered headline with the current one. With null, it checks whether the current headline appears in the HTML. The apply action needs the _old_ text to find and replace. On a null row the fallback can only show that the new headline is missing; it cannot say what the old text was. So for every pre-006 draft the badge can show but the button has nothing to replace. The proposal does not say what the badge offers in that case, or whether Edit inline / Regenerate design apply. Two implementers would build that case differently: one hides the button, another guesses the old text from `<h1>`-like elements.
**Fix:** State the badge's behaviour for null-column drafts: the badge shows, and only Edit inline and Regenerate design are offered. State that the exactly-once replace runs only when the column is non-null.
**Status:** upheld

### [WARN] party-architect — Trace fields are produced deep in the pipeline but emitted at the choke points, with no carrier specified

**Quotes:** > duration (measured by the wrapper from start to settle), attempts and retries, outcome (`ok`, `not-applied`, `failed`) and the failure reason. For a refine, also the instruction text the user typed, its instruction classes and each attempt's verifier verdict.
**Quotes:** > Read `message.usage` in `anthropicCall.ts` and the CLI's reported usage where `claude -p` returns it, and add the totals to the action's event.
**Quotes:** > `track(name, payload)` (server) validates the payload, writes the row, and never throws into the caller
**Problem:** Item 3 places emission at `startDraftAction` / `completeDraftAction` / `releaseDraftAction`. The payload, though, is produced elsewhere. Token usage comes from the low-level callers `anthropicCall.ts` and `claudeCli.ts`, and one action makes several model calls. Verifier verdicts and instruction classes come from the refine pipeline. Attempt counts come from whatever loop retries. The proposal names no way to carry these values up to the emission point. One option changes the return contract of `anthropicCall` and the CLI runner, which makes every one of their callers a co-change. The other is an ambient per-action accumulator. Duration has the same gap. `track(name, payload)` is one call and cannot measure "from start to settle". Start happens in `startDraftAction` and settle in `completeDraftAction`/`releaseDraftAction`, possibly in a different request (the stale sweep). So the start time must be held somewhere, and the proposal does not say where (it rules out `updatedAt`). Reading CLI usage may also require changing how the CLI output is requested and parsed. That is a parser co-change, and the proposal raises it only as an open question.
**Fix:** Name the carrier in the artifact: a per-action accumulator, or new return fields on the two model callers with their callers listed. Name where the start timestamp lives so that a swept action can still report a duration. Say whether reading CLI usage changes the CLI output mode and its parser.
**Status:** upheld

### [WARN] party-architect — The choke-point list overlaps, and `source`/`user` must be threaded into shared functions

**Quotes:** > `runGenerationForDraft` and `generateDraftForBrief` (`generateDraft.ts`), `startDraftAction` / `completeDraftAction` / `releaseDraftAction` (`draftActions.ts`, which cover refine, regenerate design and regenerate copy), `commitDraftRevision` (inline edit, restore, adopt), `publishDraft.ts` and `jobRunner.ts` (publish), `generationRunner.ts` (scheduled generation), and the MCP/ACP generate tools.
**Quotes:** > user (null for scheduler, MCP and ACP), event name from a closed list, source (`web`, `scheduler`, `mcp`, `acp`)
**Problem:** The list names shared services and their surface-specific callers side by side: `generateDraftForBrief` with `generationRunner.ts` and the MCP/ACP generate tools, `publishDraft.ts` with `jobRunner.ts`, and `commitDraftRevision` with the draft actions. It does not say which layer emits which event. If both the service and its caller emit, one generation is counted twice. If only the shared service emits, it cannot fill `source` or the null-user rule without a new parameter that each caller passes, and the proposal does not name that signature change. Item 8's apply action also commits through `commitDraftRevision`. Unless that function also learns which caller it is serving, a headline apply is recorded as an inline edit.
**Fix:** Give a table of one emitter per event name. Name the parameter (source, acting user, commit kind) that each shared function gains, and list the callers that must pass it.
**Status:** upheld

### [WARN] party-architect — A third worker loop is an unnamed co-change to 023's heartbeat contract

**Quotes:** > It runs in the worker as a third loop, gated to once a day
**Quotes:** > The scheduler heartbeat (item 7 of the 2026-09-15 proposal) was built by **023** and is VERIFIED PASS.
**Problem:** The proposal says the worker's loops are already health-monitored by 023, then adds a loop to that worker without saying how the new loop relates to the monitoring. The new loop either writes a heartbeat or it does not. If it does, a loop that runs once a day must not trip a staleness rule built for polling loops. If it does not, it is the only unmonitored loop in the worker, and a dead sweep is invisible: exactly the B4 failure 023 was built to surface. Either way the 023 status route, its health rule and possibly the queue-panel banner are co-changes the proposal does not list.
**Fix:** State whether the sweep loop takes part in the heartbeat. If it does, name the change to 023's health rule and status response for a daily cadence. If not, say why it is exempt.
**Status:** upheld

### [WARN] party-architect — The retention sweep has two triggers, an unspecified once-a-day gate, and no clock seam for tests

**Quotes:** > A daily sweep deletes older events. It runs in the worker as a third loop, gated to once a day, and the insights page also runs it lazily on read, so retention holds even while the prod worker is down (B4).
**Quotes:** > An E2E section and unit tests on the `MOCK_AI` seams; no real model calls
**Problem:** The proposal does not say where "gated to once a day" keeps its last-run state. If it is in memory, every worker restart sweeps. If it is in a table, it is new schema the migration list leaves out. Nor does it say whether the lazy sweep on read shares that gate or runs a full-table DELETE on every insights page load. As written, both the 180-day cutoff and the daily gate depend on wall-clock time. The named test seams are the `MOCK_AI` ones, which cover model calls, not time. So the retention test either waits on real time or never runs.
**Fix:** Name where the gate state lives and whether both triggers share it. Take "now" as an argument of a pure sweep function (or provide a test seam that sets it), so that the cutoff and the gate are tested deterministically.
**Status:** upheld

### [WARN] party-architect — The event row's references to draft, team and user are unspecified, which leaves every existing delete path an open co-change

**Quotes:** > One new table, `AnalyticsEvent`: time, team, user (null for scheduler, MCP and ACP), event name from a closed list, source (`web`, `scheduler`, `mcp`, `acp`), optional draft id
**Quotes:** > **Deleted teams and users:** do their events cascade away, or are they kept (anonymised) until the 180-day sweep?
**Problem:** The proposal does not say whether `team`, `user` and `draft id` are foreign keys or plain strings, and that choice decides the blast radius at merge. A restricting FK breaks every existing delete of a draft, team or user until each path first deletes or detaches its events. A cascading FK silently removes history from the aggregates the page exists to show. A plain string leaves dangling ids. The open question covers teams and users but not drafts, though drafts can be deleted too. The migration's shape cannot be settled until this is decided.
**Fix:** State the reference type and on-delete behaviour for each of the three columns in the artifact. If any is a restricting FK, list the existing delete paths that become co-changes.
**Status:** upheld
