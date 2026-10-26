# Proposal: Product observability

**Created:** 2026-09-15
**Refreshed:** 2026-10-23 (after 004, 008, 009 Phase 1, 012, 023 and 024; the user's decisions of 2026-10-23 are recorded below)
**Status:** 🟡 Draft

## Problem

Nobody can see what happens inside bistec-studio in aggregate. Every quality problem so far was found by a person noticing it, days or weeks later.

**There is no usage data.** Nothing records where users leave the brief wizard, how many refines it takes to reach a post they keep, which refine instructions fail, or which teams have stopped using the tool. There is no analytics package and no event store; the only numbers are the dashboard's four counts (`src/app/(app)/page.tsx` `getDashboardData`).

**004 cannot be measured.** 004 changed how refine handles instructions. A refine that is not applied is kept as a rejected `DraftRevision` with its verifier diagnostics (`rejection` JSON), and `Draft.notAppliedReason` holds the last one until the next action clears it. A refine that **was** applied stores no verdict and no instruction class (a CHECK constraint forbids classes on committed rows). So the applied rate per instruction class, which is what 004 set out to improve, cannot be computed from the database.

**Failures are invisible in aggregate.** `Draft.failureReason`, `pendingActionError`, `ScheduledGeneration.errorReason` and `Post.errorReason` are written per row and overwritten or cleared by the next action. Nothing keeps the history, so a systematic regression (a bad prompt version, a degrading provider, a missing font) reads as scattered one-off complaints.

**Time and tokens are not recorded at all.** No model or column holds a duration, a token count or a cost. The CLI logs elapsed seconds (`claudeCli.ts`) and the API path never reads `message.usage` (`anthropicCall.ts`). `Draft.updatedAt` cannot stand in for duration because the action heartbeat bumps it.

**A headline edit leaves the image silently out of date.** Since 012, captions are never drawn on the image; only `Draft.headline` is. Editing the headline (`saveHeadlineEdit`, `src/lib/captions/store.ts`) updates the field and leaves the HTML and the exported PNG showing the old headline. The 2026-07-28 fix said the "your export predates this edit" nudge belongs in the UI; it was never built. The only fix today is Regenerate design, a model call.

**Already done elsewhere.** The scheduler heartbeat (item 7 of the 2026-09-15 proposal) was built by **023** and is VERIFIED PASS. The stamps 006 once planned to derive now exist: `Draft.designModel`, `headlineModel`, `headlineRoute`, `promptVersion`, `composition`, `DraftRevision.model`/`composition`, `DraftCaption.model`/`route` (008, 009, 024).

## Proposed Solution

Record product and generation events in the app's own Postgres, behind one internal wrapper, and give super admins one page to read them. No new service.

1. **An event store.** One new table, `AnalyticsEvent`: time, team, user (null for scheduler, MCP and ACP), event name from a closed list, source (`web`, `scheduler`, `mcp`, `acp`), optional draft id, and a JSON payload validated per event name. Indexed for time-range queries.
2. **One wrapper.** `track(name, payload)` (server) validates the payload, writes the row, and never throws into the caller: a failed write is logged and dropped, so instrumentation can never fail a generation, a refine or a publish. Call sites never touch the table directly, so an external backend (PostHog or another) can be added later inside the wrapper alone.
3. **Emission at the existing choke points**, not at every route: `runGenerationForDraft` and `generateDraftForBrief` (`generateDraft.ts`), `startDraftAction` / `completeDraftAction` / `releaseDraftAction` (`draftActions.ts`, which cover refine, regenerate design and regenerate copy), `commitDraftRevision` (inline edit, restore, adopt), `publishDraft.ts` and `jobRunner.ts` (publish), `generationRunner.ts` (scheduled generation), and the MCP/ACP generate tools. The browser sends only what the server cannot see: brief wizard step changes and wizard exit, through one authenticated `POST /api/events` that accepts the closed client list only.
4. **Generation traces as events, metadata plus the refine text.** Per generation and per draft action: surface, path (A/B), model and route (read from the stamps), prompt version, image style and composition outcome, duration (measured by the wrapper from start to settle), attempts and retries, outcome (`ok`, `not-applied`, `failed`) and the failure reason. For a refine, also the instruction text the user typed, its instruction classes and each attempt's verifier verdict. **No prompt text and no model output** are stored; the drafts and revisions already hold the output.
5. **Token counts where the provider reports them.** Read `message.usage` in `anthropicCall.ts` and the CLI's reported usage where `claude -p` returns it, and add the totals to the action's event. No price table and no money figure.
6. **A super-admin page,** `/admin/insights`, global across teams: the wizard funnel and where users leave; generation success and failure rate and the top failure reasons over time; refine applied rate by instruction class; p50/p90 duration by surface and model; tokens by surface; scheduled generation and publish outcomes; activity per team. Gated in the page and in its API (`withSuperAdmin`), with a `superAdminOnly` nav item.
7. **Retention of 180 days.** A daily sweep deletes older events. It runs in the worker as a third loop, gated to once a day, and the insights page also runs it lazily on read, so retention holds even while the prod worker is down (B4).
8. **A stale-headline badge with a no-model fix.** The draft page shows a badge when the headline was edited after the current design was rendered. Its button applies the new headline to the design without a model call: it replaces the rendered headline text in the stored HTML, only if that text occurs exactly once, and commits a new revision through `commitDraftRevision` (the inline-edit path, which re-renders the PNG). If the old headline cannot be found exactly once, the badge offers Edit inline and Regenerate design instead. Publishing is never blocked. To know which headline the design was rendered with, every design write records it (a nullable column; null for drafts from before 006, which fall back to checking whether the current headline appears in the HTML).

## Scope

### In Scope

- The `AnalyticsEvent` table, its migration and manual down script, and the `track` wrapper with a closed, validated event catalogue
- Server-side emission at the choke points above, and the client wizard events through `POST /api/events`
- Durations, outcomes, failure reasons, refine instruction text, classes and verifier verdicts, and token counts where reported
- The super-admin `/admin/insights` page and its API
- The 180-day retention sweep (worker loop plus lazy sweep)
- The stale-headline badge, the rendered-headline record and the no-model apply action
- An E2E section and unit tests on the `MOCK_AI` seams; no real model calls

### Out of Scope

- **Self-hosted PostHog and ClickHouse** (dropped by the user, 2026-10-23); the wrapper keeps the door open
- **Session replay** in any form (dropped by the user, 2026-10-23)
- Full prompt and model-output capture in traces
- A team-admin or tenant-facing analytics view (super admins only)
- Money: prices, cost reports, billing
- Acting on what the data shows; this change measures, it does not tune
- Replacing application logging
- The scheduler heartbeat (done by 023) and fixing B4 (Coolify configuration)

## Impact

- **Files affected:** about 25 to 35. One migration (the event table and the rendered-headline column), about 7 server choke points, the token read in the two model callers, one events route, the insights page and API, the worker loop, the draft-page badge and its route, about 6 client files for wizard events, and tests.
- **Complexity:** large, but no new infrastructure. The heaviest parts are the event catalogue, the insights queries and the badge's exact-once replace.
- **Risk:** medium.
  - Instrumentation runs inside the hot paths (generation, refine, publish), so a failing `track` must never fail or slow the action.
  - Refine instruction text is user-typed text about client campaigns: it is kept 180 days and readable only by super admins.
  - The insights page reads across teams by design (super admins only); its API must stay unreachable for everyone else.
  - Event volume is small (a few events per post), so Postgres is sufficient.
- **Size:** architectural (a new subsystem, an event contract other changes will emit into, a migration).

## Decisions

- **2026-09-15:** analytics view access is **super-admin only, global**, one cross-team view. **Confirmed by the user on 2026-10-23.**
- **2026-09-15 (superseded 2026-10-23):** session replay with full capture and per-team consent. **The user dropped replay on 2026-10-23.**
- **2026-10-23 (the user):**
  - **Backbone:** in-app Postgres events behind an internal wrapper, not self-hosted PostHog and ClickHouse.
  - **Session replay:** dropped from 006.
  - **Trace contents:** metadata plus the refine instruction text; no full prompts and no model output.
  - **Stale badge:** inform plus a no-model fix button. (The research found that only a headline edit can make the image stale, and a plain re-render would keep the old headline, so the fix is the exactly-once headline replace in item 8.)
  - **Retention:** 180 days, deleted by a daily sweep.
  - **Party panel:** deep, 5 seats, 2 rounds.
- **2026-10-23, after the panel (the user; these override the sections above where they differ):**
  1. **The stale-headline badge (item 8) is split out of 006** into its own change, to carry the panel's fixes (escaping, text-node-only matching, a per-revision rendered-headline stamp written in `commitDraftRevision`, a visible-text check). 006 builds no badge, no rendered-headline column and no HTML replace.
  2. **Scope is staged inside 006:** first the event store, the `track` wrapper, the server-side generation, draft-action (refine, regenerate), revision (inline edit, restore, adopt) and publish/scheduler events, and the insights page; then, as later waves, the wizard events and the token counts.
  3. **Retention:** one daily worker sweep (cutoff computed in SQL, bounded batches, a heartbeat that tolerates a daily cadence); no sweep on page load. The insights page shows the oldest event's age, so an overdue sweep is visible.
  4. **"Applied"** means the refine committed a new revision at the action. Undo, restore and "Use anyway" adoptions are their own events. The applied rate is split by verifier model and prompt version.
  5. **The page serves four decisions,** each with required charts: did 004 work (refine applied rate by instruction class); catch regressions (failure rate and top reasons per day by prompt version and model); 009 image styles (fallback-to-classic rate and refine count per style); model and route choices (duration, later tokens, by surface, model and route).
  6. **On delete:** deleting a team deletes its events; deleting a draft keeps its events with the draft link cleared; a deactivated user's events stay. An operator purge script removes events by team, user or draft.
  7. **Wizard abandonment** is a brief draft that expires (7-day TTL) or is discarded without a Generate, with the last step it reached. Server-side; no client exit beacon.
  8. **Approved** for planning (size: architectural). The panel's upheld findings are design input for `/specclaw:plan`.

## Open Questions

- **Wizard abandonment:** what counts as leaving? A wizard opened and not submitted within a session, or a brief draft that expires unsubmitted (the 7-day brief-draft TTL)?
- **CLI token counts:** does `claude -p` (pinned 2.1.287 in the image) report usage in the output mode the app uses? If not, CLI-mode events carry no tokens.
- **The stale badge's matching rule:** is an exact-once text replace of the rendered headline reliable on freeform Path B HTML (a headline split across elements or styled spans will not match), and should the button then fall back silently or say why?
- **MCP, ACP and scheduler events** have no acting user: attribute them to the team only, or to the API key's creator?
- **Deleted teams and users:** do their events cascade away, or are they kept (anonymised) until the 180-day sweep?

**Party panel, 2026-10-23 (deep, 5 seats × 2 rounds, verdict CHANGES_REQUESTED; upheld findings, see [party-report.md](party-report.md)):**

- (party-po, BLOCK) No cheaper variant is priced against the full event store plus dashboard, and an unrelated feature is bundled in.
- (party-po) The do-nothing option is never priced; name the decisions the page would change.
- (party-po) The stale-headline badge is unrelated scope; split it into its own change.
- (party-po) Recurring runtime cost is unquantified: events per post, per-event write budget, awaited or fire-and-forget.
- (party-po) Tokens feed no decision and retention is built twice; keep one mechanism.
- (party-po, NOTE) Name the cut lines; ship the store plus the refine verdict first.
- (party-ba) The "applied rate per instruction class" goal has no acceptance criterion or success measure.
- (party-ba) "Applied" and "abandoned" are undefined.
- (party-ba) The stale-headline problem's frequency and the fix's reach are unevidenced.
- (party-ba, NOTE) Token panel may be empty for the CLI route; show "not reported", not zero.
- (party-security, BLOCK) The no-model headline fix splices an unescaped headline into rendered HTML.
- (party-security, BLOCK) The exact-once replace can match an attribute or comment and clear the badge on a still-stale image; the pre-006 fallback fails open.
- (party-security) Lost, invalid or unreported events read as healthy numbers; count drops, give `track` a timeout.
- (party-security) `POST /api/events` must set team/user/source from the session, check draft visibility, cap size and rate-limit.
- (party-security) Refine text and failure reasons need length caps, redaction, a purge path and delete cascades.
- (party-security, NOTE) The lazy sweep makes a GET run an unbounded DELETE; SQL-only cutoff, batches, after the response.
- (party-security, NOTE) The applied rate is graded by the pipeline's own verifier; record its model and prompt version.
- (party-security, rebuttal of party-po) A lazy-only sweep lets the 180-day bound fail open when nobody reads the page.
- (party-architect, BLOCK) The rendered-headline record must be per revision (restore and adopt move design state); list every writer.
- (party-architect) Name the carrier that brings tokens, verdicts, attempts and the start time up to the emission point.
- (party-architect) One emitter per event name; name the source/user/commit-kind parameter shared functions gain.
- (party-architect) A third worker loop is an unnamed co-change to 023's heartbeat contract.
- (party-architect) Name where the once-a-day gate state lives and give it a test seam.
- (party-architect) State the reference type and on-delete behaviour of the event's team, user and draft columns.
- (party-architect, NOTE, rebuttal of party-po) The per-row verdict variant collides with 004's CHECK constraint; price it honestly.
- (party-visionary) Event payloads must import the stamps' own vocabularies, and validation must throw under test seams.
- (party-visionary) Add a guard test pairing each action kind, channel and source with a catalogue event; future changes own their events.
- (party-visionary) Version payload shapes, or rule that payloads only add fields.
- (party-visionary) Put the rendered-headline stamp in one write point (`commitDraftRevision`), with a guard test.
- (party-visionary) Say the exact-once replace is a one-off, not the pattern for future on-image fields (or use one render fingerprint).
- (party-visionary) The PostHog door is open on writes only; put insights reads behind a query module or say so.
- (party-visionary, NOTE) Show fallback rate by image style, or stop collecting it.
- (party-visionary, rebuttal of party-po) If retention keeps one mechanism, keep the worker loop and show the oldest row's age.
- (party-visionary, NOTE, rebuttal of party-po) Do not cut to analytics columns on domain tables; cut to the store plus refine and generation events.

---

**To proceed:** Review this proposal and approve to begin planning.
