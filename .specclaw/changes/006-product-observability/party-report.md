# Party Report: 006-product-observability

**Reviewed:** 2026-10-23
**Tier:** deep (classifier) — Adds a new persisted event table that stores user-typed refine instruction text readable across all teams through a new super-admin API, instruments the generation, refine and publish choke points, and adds a rendered-headline column to Draft with a badge that rewrites stored HTML, so it touches a trust boundary and persisted data shape.
**Panel:** party-po(sonnet), party-architect(opus), party-ba(sonnet), party-security(opus), party-visionary(opus)
**Verdict:** CHANGES_REQUESTED

## Summary

35 findings: 4 BLOCK, 23 WARN, 7 NOTE upheld — 1 withdrawn

## Findings

### [BLOCK] party-architect — The rendered-headline record is one Draft column, but design state is per revision and restore moves it

**Quotes:** > To know which headline the design was rendered with, every design write records it (a nullable column; null for drafts from before 006, which fall back to checking whether the current headline appears in the HTML).
**Quotes:** > One migration (the event table and the rendered-headline column)
**Quotes:** > `commitDraftRevision` (inline edit, restore, adopt)
**Quotes:** > `Draft.designModel`, `headlineModel`, `headlineRoute`, `promptVersion`, `composition`, `DraftRevision.model`/`composition`
**Problem:** The proposal treats design state as versioned: it names composition stamps on both `Draft` and `DraftRevision`, and it names restore and adopt as revision writers. The rendered-headline record, though, is added as a single column ("the rendered-headline column"). A restore or adopt puts an older revision's HTML back as the current design. The writer cannot know which headline that HTML was rendered with unless the revision recorded it. With a Draft-only column, a restored draft either keeps the headline of the design it replaced, which gives a wrong badge, or falls back to null and the weaker check. The apply action then searches the HTML for text it does not contain. "Every design write" is also never listed. The writers include first generation (Path A and B), regenerate design, refine, inline edit, restore, adopt, the badge's own apply, and the scheduled and MCP generation paths. Any writer left out leaves the column wrong. party-visionary reached the same structural fix from the long-horizon side (record it on the revision inside `commitDraftRevision`). That makes it more likely the per-revision placement is the right seam.
**Fix:** Add the column to `DraftRevision` as well, as with `composition`. Have restore and adopt copy it from the revision they reinstate, or have the badge read it from the current revision. List in the artifact every writer that must set it, including the badge's own apply commit.
**Status:** upheld

### [WARN] party-architect — Trace fields are produced deep in the pipeline but emitted at the choke points, with no carrier specified

**Quotes:** > duration (measured by the wrapper from start to settle), attempts and retries, outcome (`ok`, `not-applied`, `failed`) and the failure reason. For a refine, also the instruction text the user typed, its instruction classes and each attempt's verifier verdict.
**Quotes:** > Read `message.usage` in `anthropicCall.ts` and the CLI's reported usage where `claude -p` returns it, and add the totals to the action's event.
**Quotes:** > `track(name, payload)` (server) validates the payload, writes the row, and never throws into the caller
**Problem:** Item 3 places emission at `startDraftAction` / `completeDraftAction` / `releaseDraftAction`, but the payload is produced elsewhere:

- **Token usage** comes from the low-level callers `anthropicCall.ts` and `claudeCli.ts`, and one action makes several model calls.
- **Verifier verdicts and instruction classes** come from the refine pipeline.
- **Attempt counts** come from whichever loop retries.

The proposal names no way to carry these values up to the emission point. There are two options. One is to change the return contract of `anthropicCall` and the CLI runner, which makes every one of their callers a co-change. The other is an ambient per-action accumulator.

Duration has the same gap. `track(name, payload)` is a single call, so it cannot measure "from start to settle". Start happens in `startDraftAction` and settle happens in `completeDraftAction` or `releaseDraftAction`, possibly in a different request (the stale sweep). The start time must therefore be held somewhere, and the proposal does not say where; it rules out `updatedAt`.

Reading CLI usage may also require a change to how the CLI output is requested and parsed. That is a parser co-change, and the proposal raises it only as an open question. party-po's unanswered "awaited or fire-and-forget" question depends on the same missing carrier design.
**Fix:** Name the carrier in the artifact: either a per-action accumulator, or new return fields on the two model callers with their callers listed. Name where the start timestamp lives so that a swept action can still report a duration. Say whether reading CLI usage changes the CLI output mode and its parser.
**Status:** upheld

### [WARN] party-architect — The choke-point list overlaps, and `source`/`user` must be threaded into shared functions

**Quotes:** > `runGenerationForDraft` and `generateDraftForBrief` (`generateDraft.ts`), `startDraftAction` / `completeDraftAction` / `releaseDraftAction` (`draftActions.ts`, which cover refine, regenerate design and regenerate copy), `commitDraftRevision` (inline edit, restore, adopt), `publishDraft.ts` and `jobRunner.ts` (publish), `generationRunner.ts` (scheduled generation), and the MCP/ACP generate tools.
**Quotes:** > user (null for scheduler, MCP and ACP), event name from a closed list, source (`web`, `scheduler`, `mcp`, `acp`)
**Problem:** The list puts shared services next to their surface-specific callers: `generateDraftForBrief` with `generationRunner.ts` and the MCP/ACP generate tools, `publishDraft.ts` with `jobRunner.ts`, and `commitDraftRevision` with the draft actions. It does not say which layer emits which event. If both the service and its caller emit, one generation is counted twice. If only the shared service emits, it cannot fill `source` or apply the null-user rule unless each caller passes a new parameter, and the proposal does not name that signature change. Item 8's apply action also commits through `commitDraftRevision`. Unless that function also learns which caller it is serving, a headline apply is recorded as an inline edit.
**Fix:** Give a table with one emitter per event name. Name the parameter (source, acting user, commit kind) that each shared function gains, and list the callers that must pass it.
**Status:** upheld

### [WARN] party-architect — A third worker loop is an unnamed co-change to 023's heartbeat contract

**Quotes:** > It runs in the worker as a third loop, gated to once a day
**Quotes:** > The scheduler heartbeat (item 7 of the 2026-09-15 proposal) was built by **023** and is VERIFIED PASS.
**Problem:** The proposal says 023 already monitors the worker's loops, then adds a loop to that worker without saying how the new loop relates to the monitoring. The new loop either writes a heartbeat or it does not. If it does, a loop that runs once a day must not trip a staleness rule built for polling loops. If it does not, it is the only unmonitored loop in the worker, and a dead sweep is invisible: exactly the B4 failure 023 was built to surface. Either way, the 023 status route, its health rule and possibly the queue-panel banner are co-changes the proposal does not list. party-po's suggestion to keep only the lazy sweep would remove this coupling, but the artifact as written keeps the worker loop, so the finding stands against the text.
**Fix:** State whether the sweep loop takes part in the heartbeat. If it does, name the change to 023's health rule and status response for a daily cadence. If not, say why it is exempt. If the worker loop is dropped, this finding falls away with it.
**Status:** upheld

### [WARN] party-architect — The retention sweep has two triggers and an unspecified once-a-day gate with no test seam

**Quotes:** > A daily sweep deletes older events. It runs in the worker as a third loop, gated to once a day, and the insights page also runs it lazily on read, so retention holds even while the prod worker is down (B4).
**Quotes:** > An E2E section and unit tests on the `MOCK_AI` seams; no real model calls
**Problem:** The proposal does not say where "gated to once a day" keeps its last-run state. If the state is held in memory, every worker restart sweeps. If it is held in a table, that table is new schema the migration list leaves out. The proposal also does not say whether the lazy sweep on read shares that gate, or runs a full-table DELETE on every insights page load. On reflection, the 180-day cutoff on its own can be tested deterministically: seed rows backdated to either side of `now() - 180 days` and assert what survives. That is compatible with party-security's "cutoff in SQL only" fix. The daily gate is different. It needs a controllable clock or gate-state seam, and the named seams are the `MOCK_AI` ones, which cover model calls, not time. So the gate's test either waits on real time or is never written.
**Fix:** Name where the gate state lives and whether both triggers share it. Make the gate's notion of "now" or "last run" injectable (an argument of a pure gate function, or a test seam that sets the last-run state), so that the once-a-day behaviour is tested deterministically.
**Status:** upheld

### [WARN] party-architect — The event row's references to draft, team and user are unspecified, which leaves every existing delete path an open co-change

**Quotes:** > One new table, `AnalyticsEvent`: time, team, user (null for scheduler, MCP and ACP), event name from a closed list, source (`web`, `scheduler`, `mcp`, `acp`), optional draft id
**Quotes:** > **Deleted teams and users:** do their events cascade away, or are they kept (anonymised) until the 180-day sweep?
**Problem:** The proposal does not say whether `team`, `user` and `draft id` are foreign keys or plain strings, and that choice decides the blast radius at merge:

- **A restricting FK** breaks every existing delete of a draft, team or user until each path first deletes or detaches its events.
- **A cascading FK** silently removes history from the aggregates the page exists to show.
- **A plain string** leaves dangling ids.

The open question covers teams and users but not drafts, which can also be deleted. party-security's fix asks for team and user deletion to cascade. That is one answer to the question, and it confirms the reference type has to be decided in the artifact before the migration can take shape.
**Fix:** State the reference type and on-delete behaviour for each of the three columns in the artifact. If any of them is a restricting FK, list the existing delete paths that become co-changes.
**Status:** upheld

### [NOTE] party-architect — Rebuttal to party-po's cheaper variant: the per-row refine verdict collides with a constraint the proposal names

**Quotes:** > A refine that **was** applied stores no verdict and no instruction class (a CHECK constraint forbids classes on committed rows).
**Quotes:** > Record product and generation events in the app's own Postgres, behind one internal wrapper, and give super admins one page to read them. No new service.
**Problem:** party-po's BLOCK presents "persisting an applied-verdict and instruction class on the existing refine path" as the cheap structural alternative. By the proposal's own text, committed revisions are barred from carrying classes by a CHECK constraint, so that variant means a migration that relaxes a 004 invariant on `DraftRevision`. It also changes every committed-revision writer, which the proposal lists as inline edit, restore and adopt. Its "durable failure log" is likewise a new append-only store written from the same choke points, which is structurally the event table with a narrower schema. The cheaper variant's co-change count is therefore closer to the full design than the BLOCK implies. Whether it is still worth preferring is party-po's call. This note corrects only the structural price used in that comparison.
**Fix:** If the cheaper-variant section party-po asks for is added, list the CHECK-constraint change and the committed-revision writers as its co-changes, so the comparison is made on the real structural cost.
**Status:** upheld

### [WARN] party-ba — The central "applied rate per instruction class" goal has no matching acceptance criterion or success measure

**Quotes:**

> So the applied rate per instruction class, which is what 004 set out to improve, cannot be computed from the database.
> Acting on what the data shows; this change measures, it does not tune
> An E2E section and unit tests on the `MOCK_AI` seams; no real model calls
> **Problem:** The proposal names measuring 004 as its main pain, but it states no acceptance criterion, baseline or threshold for a successful measurement. Mock-only tests show that events were written. They do not show that the applied rate per class is now knowable. Nothing in round 1 from other seats changes this.
> **Fix:** State falsifiable criteria. For a given period, the insights applied rate per class equals a hand count from the DB. Every emission point in item 3 produces exactly one event per action, including the failed and not-applied outcomes. A failed `track` write leaves the action's result unchanged.
> **Status:** upheld

### [WARN] party-ba — The tool is meant to reveal usage and failure patterns, but "applied" and "abandoned" are undefined, and the only person who reads it is a super admin

**Quotes:**

> Nobody can see what happens inside bistec-studio in aggregate. Every quality problem so far was found by a person noticing it, days or weeks later.
> **Wizard abandonment:** what counts as leaving? A wizard opened and not submitted within a session, or a brief draft that expires unsubmitted (the 7-day brief-draft TTL)?
> outcome (`ok`, `not-applied`, `failed`)
> **Problem:** Abandonment has two readings, a session exit and a 7-day TTL expiry. They need different instrumentation (a client beacon versus a server-side sweep event), so they would produce different builds. "Applied" is also open. It could mean committed at the time of the action or kept in the final post, which matters for undone refines and "Use anyway" adoptions. The event design in item 3 is already committed while both definitions are deferred.
> **Fix:** Resolve both definitions before planning.
> **Status:** upheld

### [WARN] party-ba — The stale-headline problem is asserted, with an unsourced mechanism and an unestablished fix

**Quotes:**

> Editing the headline (`saveHeadlineEdit`, `src/lib/captions/store.ts`) updates the field and leaves the HTML and the exported PNG showing the old headline.
> (The research found that only a headline edit can make the image stale, and a plain re-render would keep the old headline, so the fix is the exactly-once headline replace in item 8.)
> is an exact-once text replace of the rendered headline reliable on freeform Path B HTML (a headline split across elements or styled spans will not match), and should the button then fall back silently or say why?
> **Problem:** This is a second problem bundled into an observability change. It rests on "the research found", which is not cited. The proposal gives no frequency of headline edits after export. Its own open question admits the fix may not match freeform HTML, so the size of the pain and the reach of the fix are both unevidenced.
> **Fix:** Cite the research, or give how often users edit the headline after export. Set a minimum match rate on real Path B HTML as an acceptance criterion.
> **Status:** upheld

### [NOTE] party-ba — "Token counts where the provider reports them" may yield no data for the main route, and the page's stated token view assumes it does

**Quotes:**

> Read `message.usage` in `anthropicCall.ts` and the CLI's reported usage where `claude -p` returns it, and add the totals to the action's event.
> **CLI token counts:** does `claude -p` (pinned 2.1.287 in the image) report usage in the output mode the app uses? If not, CLI-mode events carry no tokens.
> tokens by surface
> **Problem:** The proposal commits a "tokens by surface" panel while admitting it does not know whether the CLI route reports any usage. If it does not, the panel is empty or misleading for the main case, and nothing says how the page distinguishes unknown from zero.
> **Fix:** Resolve the CLI question first, or define null tokens as "not reported", excluded from totals and shown as such.
> **Status:** upheld

### [BLOCK] party-po — Bundles a measurement subsystem with an unrelated feature and never prices a cheaper variant

**Quotes:**

> Record product and generation events in the app's own Postgres, behind one internal wrapper, and give super admins one page to read them. No new service.
> **Complexity:** large, but no new infrastructure.
> **Files affected:** about 25 to 35.
> **Problem:** The proposal sizes itself at 25 to 35 files and "architectural", yet never considers a cheaper variant. The smallest version that captures most of the stated value is not weighed. That version is: add the durations and token counts to rows the app already writes (`Draft`, `DraftRevision`, `DraftCaption`), plus one read-only SQL query or script for the 004 applied rate. The stated pain is that 004 cannot be measured and that failures are invisible. Both could be served by (a) persisting an applied-verdict and instruction class on the existing refine path, and (b) a durable failure log. A closed event catalogue, a client events route, a super-admin dashboard, retention loops and a 7-surface insights UI are not needed to answer those two questions. The only user of the page is the super admin, which is likely one person.
> **Fix:** Add a "Cheaper variant" section that compares a verdict column, an aggregate query and an operator-run script against the full event store plus dashboard, with a named cut line.
> **Status:** upheld

### [WARN] party-po — Do-nothing option is never priced

**Quotes:**

> Every quality problem so far was found by a person noticing it, days or weeks later.
> Nobody can see what happens inside bistec-studio in aggregate.
> **Problem:** The proposal says what is invisible, not what it costs. It gives no frequency or cost of a missed regression, no number of regressions that went undetected, and no decision the data would change. "Acting on what the data shows; this change measures, it does not tune" is explicitly out of scope, so the value return is deferred indefinitely. A large measurement build with no named decision it unlocks has not earned its scope.
> **Fix:** Name the one or two decisions the insights page would change, and what shipping nothing costs, in terms of incidents or hours.
> **Status:** upheld

### [WARN] party-po — The stale-headline badge is unrelated scope, bundled into an observability change

**Quotes:**

> A stale-headline badge with a no-model fix.
> The heaviest parts are the event catalogue, the insights queries and the badge's exact-once replace.
> **Problem:** Item 8 returns UI value and shares nothing with the event store: it adds a new column, an HTML text replace, a new route and a draft-page badge. It also has an acknowledged open reliability question ("is an exact-once text replace ... reliable on freeform Path B HTML"). It holds the whole change hostage to that unresolved question. It is also a "while we're in here" item, since the proposal itself notes the nudge was deferred in July.
> **Fix:** Split item 8 into its own change, shipped independently. A badge-only variant with no replace, plus the existing Regenerate design and Edit inline buttons, captures most of the value at a fraction of the cost.
> **Status:** upheld

### [WARN] party-po — Recurring runtime cost is unquantified

**Quotes:**

> Event volume is small (a few events per post), so Postgres is sufficient.
> It runs in the worker as a third loop, gated to once a day, and the insights page also runs it lazily on read
> **Problem:** "A few events per post" is asserted, not counted. Per-event cost is also unstated: a synchronous DB write inside each hot path (generation, refine, publish) adds latency and one extra connection use per event. The lazy retention sweep on page read also adds a delete query to a page load. No per-post write count, no row-size estimate for refine text, and no p90 latency budget for `track` is given.
> **Fix:** State the events per post at the largest flow (a refine-heavy draft), the per-event write time budget, and whether `track` is awaited or fire-and-forget.
> **Status:** upheld

### [WARN] party-po — Scope lacking a stated value: per-team and tenant-level extras, token counts and a double retention mechanism

**Quotes:**

> Token counts where the provider reports them.
> A daily sweep deletes older events. It runs in the worker as a third loop, gated to once a day, and the insights page also runs it lazily on read
> activity per team
> **Problem:** Tokens carry "no price table and no money figure", so they feed no decision, and the CLI path may report none at all (an open question). Retention is built twice, a worker loop plus a lazy-on-read sweep, to cover B4. With a daily gate and 180 days, a week of worker downtime changes nothing observable. The lazy sweep alone is enough, or the worker loop alone. Each extra mechanism is a cost paid forever.
> **Fix:** Keep one retention mechanism (the lazy sweep, which needs no worker loop). Defer token counts until a cost decision exists, or until the open CLI question is answered.
> **Status:** upheld

### [NOTE] party-po — Sequencing: the cut line is not named

**Quotes:**

> **To proceed:** Review this proposal and approve to begin planning.
> **Problem:** The change ships as one unit, with no stated order. A natural cut is: (1) the store, wrapper and server-side generation traces; (2) the insights page; (3) the wizard client events; (4) the stale badge. Each is independently worth having, and (3) depends on the unanswered "what counts as leaving" question.
> **Fix:** Name the cut lines, and ship the store plus the refine verdict first, since that alone unlocks the 004 measurement.
> **Status:** upheld

### [BLOCK] party-security — The no-model headline fix writes an unescaped edited headline into HTML that the server renders and publishes

**Quotes:**

> Its button applies the new headline to the design without a model call: it replaces the rendered headline text in the stored HTML, only if that text occurs exactly once, and commits a new revision through `commitDraftRevision` (the inline-edit path, which re-renders the PNG).
> **Problem:** The new headline is text from the caption editor (`saveHeadlineEdit`) or from the model. This step pastes it straight into the stored HTML. The proposal never says the text is HTML-escaped. A headline containing `<`, `>`, `&` or a quote therefore becomes markup, not text. Server-side Chromium renders that markup, and it is saved in a revision. Every later refine starts from that revision, and the exported PNG is what gets published. With no model call, there is also no model in the loop, so nothing between the editor and the renderer sanitizes the string. The same gap means a headline with an entity-encoded character (`R&D` stored as `R&amp;D`) is searched for in the wrong form. In round 2, no seat disputed this entry point. party-po's suggestion to split item 8 out, or to ship it without the replace, would remove the surface. It does not make the design as written safe.
> **Fix:** HTML-escape the new headline before the splice. Match the old headline against the HTML-escaped form of the old text, not the raw string. Add a unit test that applies a headline containing `<img src=x onerror=…>` and `</div>` and asserts the result is inert text inside the same element.
> **Status:** upheld

### [BLOCK] party-security — The exact-once replace can hit the wrong spot and clear the badge while the image still shows the old headline

**Quotes:**

> it replaces the rendered headline text in the stored HTML, only if that text occurs exactly once
> To know which headline the design was rendered with, every design write records it (a nullable column; null for drafts from before 006, which fall back to checking whether the current headline appears in the HTML).
> **Problem:** "Occurs exactly once" is checked against the raw HTML string, not the visible text. Freeform Path B HTML often splits a headline across styled spans, as Open Question 3 admits. In that case the only exact match can be an `alt`, `title`, `aria-label` or `data-*` attribute, a `<title>` tag or a comment. The replace then edits that hidden spot and commits a revision. The commit is a design write, so it records the new headline as the rendered one, and the badge goes away. The re-rendered PNG still shows the old headline. That is a green result on a still-stale image, which is exactly the failure this badge exists to catch.

The fallback for drafts from before 006 fails open the same way. If the edited headline happens to appear anywhere in the HTML (a CTA button, alt text, a meta tag), the draft reads as not stale and no badge is shown.

Round 2 strengthens this finding. party-architect shows that restore and adopt put back an older revision's HTML under a Draft-only column, which gives a second way for the badge to report fresh on a stale image. party-architect also shows that a null-column draft has no old text to replace. Both point to the same fail-open shape.
**Fix:**

- Match only inside text nodes: parse the HTML and walk its text nodes, never matching inside attributes, `<title>`, `<script>`, `<style>` or comments.
- Record the rendered headline from what the replace actually changed, not from the requested value.
- After the re-render, confirm the new headline is in a visible text node before clearing the badge. If it is not, keep the badge and offer Edit inline or Regenerate design, saying why.
- For drafts from before 006, treat a null record as "unknown, show the badge" rather than inferring "fresh" from a substring match.
  **Status:** upheld

### [WARN] party-security — Lost, invalid or unreported events read as healthy numbers on the insights page

**Quotes:**

> `track(name, payload)` (server) validates the payload, writes the row, and never throws into the caller: a failed write is logged and dropped
> Read `message.usage` in `anthropicCall.ts` and the CLI's reported usage where `claude -p` returns it, and add the totals to the action's event.
> **Problem:** Failing open on the measurement is the right choice for the action. The problem is that the loss cannot be seen where the numbers are read. Dropped events are not random:

- A database stall that fails a generation is the same stall that drops its failure event.
- A payload schema that drifts after a code change drops every event of that name until someone reads the server log. party-visionary shows this is the expected path for every future vocabulary change, not an edge case.

In both cases `/admin/insights` shows fewer failures, a higher success rate and a cleaner funnel. The degraded view looks exactly like a good week.

Token totals have the same problem. party-ba's NOTE confirms the CLI route may report nothing at all. A CLI-mode event with no reported usage adds nothing to "tokens by surface", so missing data shows up as low usage.

The wrapper also states no bound on its write. "Never slow the action" (Risk) is asserted but never given a timeout.
**Fix:**

- Keep an in-process counter of dropped events and validation rejects per event name. Write it through a path separate from the failing insert, for example the worker heartbeat row or a periodic single-row upsert.
- Show that counter on `/admin/insights` as "events lost in this window".
- Store missing token counts as explicitly "not reported" (null), not zero, and show the share of events without usage next to every token figure.
- Give the `track` insert a short timeout.
  **Status:** upheld

### [WARN] party-security — `POST /api/events` lets any signed-in user write unlimited, self-attributed rows into the global store

**Quotes:**

> The browser sends only what the server cannot see: brief wizard step changes and wizard exit, through one authenticated `POST /api/events` that accepts the closed client list only.
> Event volume is small (a few events per post), so Postgres is sufficient.
> **Problem:** The closed list limits the event name. The proposal does not say that the server, rather than the request body, sets team, user, source and draft id, and it states no rate limit or payload size cap. Any editor on any team can post wizard events that name another team's draft id or another team. That distorts the cross-team funnel and "activity per team", and they can post them in a loop. The volume claim holds only for well-behaved clients. A hostile or buggy client can grow the shared table without limit, and the insights page's on-read sweep then has to delete that backlog. No round-1 seat disputed the entry point. party-po's unquantified-volume finding reaches the same claim on cost grounds, not abuse.
> **Fix:**

- On the client route, set `teamId`, `userId` and `source='web'` from the session, and ignore any such fields in the body.
- Accept a draft id only if the caller can see that draft; otherwise drop it.
- Cap the payload size.
- Rate-limit per user per minute, dropping the excess and counting it toward the lost-events figure above.
  **Status:** upheld

### [WARN] party-security — Free-text refine instructions and failure reasons have no size cap, no redaction and no way to purge one record

**Quotes:**

> For a refine, also the instruction text the user typed, its instruction classes and each attempt's verifier verdict. **No prompt text and no model output** are stored
> Refine instruction text is user-typed text about client campaigns: it is kept 180 days and readable only by super admins.
> **Deleted teams and users:** do their events cascade away, or are they kept (anonymised) until the 180-day sweep?
> **Problem:** Two free-text fields are copied out of their tenant-scoped rows into a global, cross-team store: the refine instruction and the failure reason. Today the per-row `failureReason` and `errorReason` are overwritten by the next action. In the event store they last 180 days.

"No model output" is a claim, not a check. A failure reason built from provider or CLI error text can carry fragments of the reply or the request, and nothing filters it.

A user who pastes a client secret, a contact list or a credential into a refine instruction has now copied it into a store they cannot see. The only ways to remove it are the 180-day sweep or hand-written SQL. Deleting the team does not remove it either, because cascade is left as an open question.

party-architect's reference-type finding covers the structural side: which delete paths become co-changes. This finding covers the recovery side: an operator has no way to remove one leaked record. The two are compatible, and neither replaces the other.
**Fix:**

- Cap the instruction and failure-reason lengths in the per-event schema.
- Run failure reasons through the same redaction the app uses for logs (strip anything shaped like a key or token) before `track`.
- Define an operator purge path that deletes events by draft, user or team.
- Make team and user deletion remove their event payloads, and answer Open Question 5 as "remove" rather than "keep".
  **Status:** upheld

### [NOTE] party-security — A page view runs an irreversible bulk delete with no guard on its cutoff

**Quotes:**

> It runs in the worker as a third loop, gated to once a day, and the insights page also runs it lazily on read, so retention holds even while the prod worker is down (B4).
> **Problem:** Deleting events older than 180 days is the intended effect. But the lazy path turns a GET on the insights API into an unbounded DELETE with no undo. Two cases follow:

- If the worker has been down for weeks (B4), the first page view deletes the whole backlog inside the request.
- If the cutoff is ever computed wrong (wrong unit, client clock, a query parameter), it deletes current data.

Nothing in the design limits either case. party-po's proposal to keep only the lazy sweep would make this the only delete path, which raises the stakes of this guard (see the rebuttal below).
**Fix:**

- Compute the cutoff in SQL only (`now() - interval '180 days'`), never from request input.
- Delete in bounded batches.
- Run the lazy sweep after the response, not on its critical path.
- Refuse any cutoff newer than 180 days, as a hard floor.
  **Status:** upheld

### [NOTE] party-security — The refine applied rate is graded by the pipeline's own verifier model

**Quotes:**

> refine applied rate by instruction class
> For a refine, also the instruction text the user typed, its instruction classes and each attempt's verifier verdict.
> **Problem:** Both "applied" and the instruction class come from the refine pipeline's own model verifier, which is part of what 004 changed. A more lenient verifier, or a verifier model swapped under 008's catalogue, raises the applied rate with no real gain in fidelity. The page would show that as 004 working. No gate depends on this metric, so there is no exposure today, but the number is self-reported. party-ba's finding that "applied" is undefined (committed at the time, or kept in the final post) is the definitional side of the same weakness. A "kept in the final post" reading would also be a partial check that does not depend on the grader.
> **Fix:** Record the verifier's model ID and prompt version in each refine event. Split the applied-rate chart by them, so that a change in the verifier shows up as a change in the grader and is not read as a change in refine quality.
> **Status:** upheld

### [WARN] party-security — Rebuttal of party-po "Scope lacking a stated value": a lazy-only sweep makes the stated 180-day retention fail open

**Quotes:**

> A daily sweep deletes older events. It runs in the worker as a third loop, gated to once a day, and the insights page also runs it lazily on read
> Refine instruction text is user-typed text about client campaigns: it is kept 180 days and readable only by super admins.
> **Problem:** party-po recommends keeping only the lazy sweep, because it "needs no worker loop". On cost grounds that may be right. On failure-mode grounds it is wrong. A lazy-only sweep runs only when a super admin opens `/admin/insights`. The proposal's only privacy bound on stored client-campaign text is "kept 180 days". With one reader who may not open the page for months, that bound silently becomes "kept until someone looks". Nothing warns, and no artifact shows that the bound was exceeded. The worker loop is what makes retention hold when nobody reads the page. The lazy path is what makes it hold when the worker is down (B4). Cutting either one turns one of those two cases into silent over-retention.
> **Fix:** If one mechanism must go, keep the worker loop and add the oldest event's age to the 023 status response. A retention breach is then visible as "oldest event older than 180 days". Alternatively, keep both triggers, with the guards in the NOTE above.
> **Status:** upheld

### [WARN] party-visionary — Event payloads copy the stamps' vocabularies, and the wrapper silently drops any payload that drifts from them

**Quotes:**

> Per generation and per draft action: surface, path (A/B), model and route (read from the stamps), prompt version, image style and composition outcome, duration (measured by the wrapper from start to settle), attempts and retries, outcome (`ok`, `not-applied`, `failed`) and the failure reason.
> `track(name, payload)` (server) validates the payload, writes the row, and never throws into the caller: a failed write is logged and dropped, so instrumentation can never fail a generation, a refine or a publish.
> **Problem:** Model, route, image style and composition each already have a closed vocabulary, owned by a stamp (`Draft.designModel`, `headlineRoute`, `composition`, `DraftCaption.route`). 006 copies each value into a per-event payload and validates it against a closed schema of its own, so every vocabulary now exists twice. The next change that adds a value has to update both copies: a fifth caption route, a new catalogue model, or a new image style (the hero product-screenshot follow-up to 009; that roadmap context is from outside this artifact). If only the stamp side is updated, validation fails, the never-throw rule drops the row, and the new runs quietly vanish from `/admin/insights`. Round 2: party-security's "lost events read as healthy numbers" finding reaches the same failure from the read side and does not supersede this one. Its fix makes the loss visible. This fix stops the duplicate vocabulary from causing the loss in the first place.
> **Fix:** Import each stamp's own enum or type into the event schema instead of declaring a copy. Make a validation failure throw under the test seams, so the first E2E run of a drifting change goes red. Keep never-throw in prod.
> **Status:** upheld

### [WARN] party-visionary — The event catalogue is an opt-in obligation on every future change, and the insights page cannot tell "zero" from "not instrumented"

**Quotes:**

> 3. **Emission at the existing choke points**, not at every route:
>
> - **Size:** architectural (a new subsystem, an event contract other changes will emit into, a migration).
>   **Problem:** Coverage is a fixed list of today's choke points. Two kinds of later change will go around it, and nothing fails when they do. One adds a draft action or publish path outside those functions, for example the assisted WhatsApp Channel publish (010, from the repo roadmap). The other adds a generation step inside them that has no event. The artifact says other changes "will emit into" the contract, but it names no owner and no check that makes emitting part of their definition of done. On the read side, an uninstrumented path shows up as missing volume or a better success rate, never as a gap. Round 2: party-architect's "one emitter per event" table settles today's list. It does not stop next year's paths from bypassing it.
>   **Fix:** Add a guard test in the spirit of `modelArgParity.test.ts` that pairs each action kind, `Channel` value and generation source with at least one catalogue event. State that each future change owns its events.
>   **Status:** upheld

### [WARN] party-visionary — Persisted payload shapes have no version, so every later payload change taxes the insights queries for 180 days

**Quotes:**

> One new table, `AnalyticsEvent`: time, team, user (null for scheduler, MCP and ACP), event name from a closed list, source (`web`, `scheduler`, `mcp`, `acp`), optional draft id, and a JSON payload validated per event name. 7. **Retention of 180 days.** A daily sweep deletes older events.
> **Problem:** Validation happens only on write, so a stored row keeps its JSON shape until the sweep removes it. Take the next change that reshapes a payload: instruction classes split or renamed in a later refine change, or a composition outcome that gains a field. From then on, every insights query must read both shapes for six months, or its chart breaks at the deploy date. No row says which shape it holds. After two or three such changes, the insights SQL becomes a pile of COALESCEs over shapes nobody can list.
> **Fix:** Store a per-event `schemaVersion` and key the queries on it, or state the rule that payloads only ever add fields and never rename them.
> **Status:** upheld

### [WARN] party-visionary — "Every design write records the rendered headline" is a forever obligation on every future design writer, with a silent failure mode

**Quotes:**

> To know which headline the design was rendered with, every design write records it (a nullable column; null for drafts from before 006, which fall back to checking whether the current headline appears in the HTML).
> **Problem:** This is a second "every writer must also stamp X" rule, after 009's composition stamp. Every later design path has to remember to write it: hero screenshots, a full AI render, or a 007-style re-theme of an existing draft. A writer that changes the design but leaves the column untouched gives a plausible wrong badge. The null fallback catches only a writer that writes null. Round 2: party-architect's BLOCK (the column must be per revision, and restore and adopt must copy it) converges on the same fix point from the merge-day side. Listing today's writers fixes merge day. Moving the stamp to one write point is what protects the writers added later, so this finding stands on its own horizon. party-security's fix also applies here: record the headline that was actually rendered, not the requested value.
> **Fix:** Put the stamp in a single write point: on `DraftRevision`, set inside `commitDraftRevision`, with the badge reading it from the current revision. A future path then inherits the stamp by committing a revision. Add a unit test that fails when a revision is created without it.
> **Status:** upheld

### [WARN] party-visionary — The exact-once HTML replace plus a per-field "rendered" column is the template the next on-image editable field will copy

**Quotes:**

> Its button applies the new headline to the design without a model call: it replaces the rendered headline text in the stored HTML, only if that text occurs exactly once, and commits a new revision through `commitDraftRevision` (the inline-edit path, which re-renders the PNG).
> (The research found that only a headline edit can make the image stale, and a plain re-render would keep the old headline, so the fix is the exactly-once headline replace in item 8.)
> **Problem:** The reasoning holds only while the headline is the one edited field drawn on the image. The next on-image field (a CTA, a subline, a contact block, brand colours re-applied to an existing draft) will copy the pattern: one column, one matcher and one badge per field. A text replace is the wrong lesson for a colour or a font. Round 2: party-security's two BLOCKs show the matcher is unsafe as written: an unescaped splice, and a match on a raw string that can land in an attribute. A copied template would carry both hazards to every new field. That makes the precedent worse, not moot. party-po's split of item 8 into its own change does not remove this finding. Whichever change ships the mechanism sets the template.
> **Fix:** Record what the design was rendered from as one fingerprint over the rendered inputs, with the headline as its first member, or state that the exact-once replace is a deliberate one-off and not the pattern for future fields.
> **Status:** upheld

### [WARN] party-visionary — The wrapper keeps the PostHog door open only on the write side; the insights page binds reads to this Postgres table

**Quotes:**

> Call sites never touch the table directly, so an external backend (PostHog or another) can be added later inside the wrapper alone.
>
> - **Self-hosted PostHog and ClickHouse** (dropped by the user, 2026-10-23); the wrapper keeps the door open
>   **Problem:** The claim covers emission, not consumption. `/admin/insights` queries `AnalyticsEvent` directly, so a later "add PostHog inside the wrapper" change has two choices, and neither stays inside the wrapper. It can dual-write forever, with the 180-day sweep and PostHog's own retention drifting apart. Or it can rewrite every insights query and retire the page. The door gets more expensive with every chart added.
>   **Fix:** State that a later external backend means replacing or dual-feeding the page, or put the insights reads behind one query module that matches the write wrapper.
>   **Status:** upheld

### [NOTE] party-visionary — Image style and composition outcome are captured but not surfaced, one chart short of a continuous 009 hypothesis check

**Quotes:**

> image style and composition outcome 6. **A super-admin page,** `/admin/insights`, global across teams: the wizard funnel and where users leave; generation success and failure rate and the top failure reasons over time; refine applied rate by instruction class; p50/p90 duration by surface and model; tokens by surface; scheduled generation and publish outcomes; activity per team.
> **Problem:** Item 4 stores the style and composition outcome, so the fail-closed fallback rate per style can be computed. Item 6 never shows it. The next imagery change waits on a one-off six-brief operator check (repo roadmap). One chart would turn that check into a continuous one on prod traffic. Round 2: party-po's scope pressure cuts the other way. If the page will not show this data, the payload should not collect it. Either answer fixes the gap. Collecting the data without ever showing it does not.
> **Fix:** Add "composition outcome and fallback rate by image style" to the page, or drop the field from the payload and record why.
> **Status:** upheld

### [WARN] party-visionary — Rebutting party-po's "keep only the lazy sweep": retention that runs on page reads decays as the page falls out of use

**Quotes:**

> 7. **Retention of 180 days.** A daily sweep deletes older events. It runs in the worker as a third loop, gated to once a day, and the insights page also runs it lazily on read, so retention holds even while the prod worker is down (B4).
> **Problem:** party-po's fix keeps the lazy sweep and drops the worker loop. That works on merge day, while someone is reading the page. One year on, the page's only audience is one super admin, and dashboards like this fall out of use. Under lazy-only retention, the 180-day promise about refine instruction text (user-typed client data, per the Risk section) stops being kept on the day people stop opening the page, and nothing reports it. The decision then reads as "180 days" while the system actually keeps events forever. If one mechanism has to go, the one tied to page traffic is the wrong one to keep. Losing the worker during B4 only delays deletion until the worker comes back. Losing page traffic leaves no trigger at all. party-security's NOTE, that a GET runs an unbounded DELETE, points the same way.
> **Fix:** If retention is reduced to one mechanism, keep the worker loop and drop the lazy sweep. To cover B4 instead, show the age of the oldest row on the page. An overdue sweep is then visible rather than silently run.
> **Status:** upheld

### [NOTE] party-visionary — Rebutting party-po's cheaper variant: verdict and duration columns on domain tables set the precedent that each new metric is a migration on a hot table

**Quotes:**

> Record product and generation events in the app's own Postgres, behind one internal wrapper, and give super admins one page to read them. No new service.
> A refine that **was** applied stores no verdict and no instruction class (a CHECK constraint forbids classes on committed rows).
> **Problem:** party-po's cheaper variant answers today's two questions by adding verdict, duration and token columns to `Draft`, `DraftRevision` and `DraftCaption`. The lesson a contributor takes from it is that every measurement question becomes a schema column on a domain table. The next questions, wizard drop-off, publish latency per channel and fallback rate by style, would each add another migration and another down script to the tables every hot path writes. Analytics fields would then sit next to the domain invariants. The CHECK constraint quoted above is one such invariant, and a verdict column on a committed revision would collide with it. The event store is the more expensive build, but its marginal cost per question is near zero. The column variant gets cheaper only if no further question is ever asked. The cut line party-po proposes, the store plus the refine verdict first, keeps that compounding. Columns-only does not.
> **Fix:** If the change is cut, cut it to the store, the wrapper and the refine and generation events (party-po's own sequencing NOTE). Do not cut it to columns on domain tables.
> **Status:** upheld

## Dissent

_Withdrawn findings. The severity token is prefixed WITHDRAWN so these do not count as live findings._

### [WITHDRAWN WARN] party-architect — For pre-006 drafts the apply action has no old headline to replace

**Quotes:** > it replaces the rendered headline text in the stored HTML, only if that text occurs exactly once
**Quotes:** > null for drafts from before 006, which fall back to checking whether the current headline appears in the HTML
**Problem:** With the column null, the apply action has no old text to search for, and the proposal does not say what the badge offers in that case.
**Fix:** State that the exactly-once replace runs only when the column is non-null, and that null drafts are offered Edit inline and Regenerate design.
**Status:** withdrawn — the proposal already covers this case: "If the old headline cannot be found exactly once, the badge offers Edit inline and Regenerate design instead." When the old headline is unknown it cannot be found, so this rule applies and two implementers would build the same thing. The remaining problem with null rows is the detection fallback, which reads "fresh" when the new headline appears anywhere in the HTML. That fails open and belongs to party-security's second BLOCK, which already files it.
