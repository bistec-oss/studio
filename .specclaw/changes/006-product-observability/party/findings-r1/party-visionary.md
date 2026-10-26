### [WARN] party-visionary — Event payloads copy the stamps' vocabularies, and the wrapper silently drops any payload that drifts from them

**Quotes:**

> Per generation and per draft action: surface, path (A/B), model and route (read from the stamps), prompt version, image style and composition outcome, duration (measured by the wrapper from start to settle), attempts and retries, outcome (`ok`, `not-applied`, `failed`) and the failure reason.
> `track(name, payload)` (server) validates the payload, writes the row, and never throws into the caller: a failed write is logged and dropped, so instrumentation can never fail a generation, a refine or a publish.
> **Problem:** The model, route, image style and composition are each a closed vocabulary that a stamp already owns (the proposal lists them: `Draft.designModel`, `headlineRoute`, `composition`, `DraftCaption.route`). 006 copies each value into a per-event payload that is validated against its own closed schema, so every vocabulary now exists twice. The next change that adds a value to one of them has to update both copies. Examples are a fifth caption route, a new catalogue model, or a new image style (the hero product-screenshot change that follows 009 Phase 1 is the obvious next one; that roadmap context comes from outside this artifact). If only the stamp side is updated, the payload fails validation. Under the never-throw rule, the failure is logged and the row is dropped, so the new runs disappear from `/admin/insights`. They do not show up as errors, and the success rates and durations just quietly leave them out. The hot-path safety property and the strict catalogue together turn every future drift into missing data. Nobody notices until someone asks why the new style has no numbers.
> **Fix:** Have the event schema import each stamp's own enum or type instead of declaring a copy. Make a validation failure throw under the test seams (`MOCK_AI` / test env), so the first E2E run of a change that drifts the vocabulary goes red. Keep the never-throw rule for prod.
> **Status:** upheld

### [WARN] party-visionary — The event catalogue is an opt-in obligation on every future change, and the insights page cannot tell "zero" from "not instrumented"

**Quotes:**

> 3. **Emission at the existing choke points**, not at every route:
>
> - **Size:** architectural (a new subsystem, an event contract other changes will emit into, a migration).
>   **Problem:** Coverage is defined as a fixed list of today's choke points: `runGenerationForDraft`, `draftActions.ts`, `commitDraftRevision`, `publishDraft.ts`, `jobRunner.ts`, `generationRunner.ts` and the MCP/ACP tools. Two kinds of future change will go around that list:

- One that adds a draft action or publish path outside those functions. The assisted WhatsApp Channel publish (010, from the repo roadmap, not this artifact) cannot go through an API publisher.
- One that adds a generation step inside them that has no event of its own.

Either way, nothing fails. The proposal does acknowledge that other changes "will emit into" the contract. It does not name an owner or a check that makes emitting part of the definition of done for those changes. On the read side, an uninstrumented path shows up on `/admin/insights` as missing volume, or as a better success rate, never as a gap. A year from now the page will look complete and not be.
**Fix:** Add a guard test in the spirit of `modelArgParity.test.ts`. It pairs each action kind, each `Channel` value and each generation source with at least one catalogue event, so adding an enum value without an event fails CI. State in the artifact that each future change owns its events.
**Status:** upheld

### [WARN] party-visionary — Persisted payload shapes have no version, so every later payload change taxes the insights queries for 180 days

**Quotes:**

> One new table, `AnalyticsEvent`: time, team, user (null for scheduler, MCP and ACP), event name from a closed list, source (`web`, `scheduler`, `mcp`, `acp`), optional draft id, and a JSON payload validated per event name. 7. **Retention of 180 days.** A daily sweep deletes older events.
> **Problem:** Validation happens only on write. Once a row is stored, its JSON shape is fixed until the sweep removes it. Take the next change that reshapes a payload: say instruction classes are split or renamed in a later refine change (the refine applied-rate chart groups by them), or a composition outcome gains a field. From then on, every insights query has to read both the old and the new shape for six months, or its chart has a break at the deploy date. Nothing in a row says which shape it has. After two or three of these changes, the insights SQL becomes a chain of `COALESCE`s over shapes nobody can list. This is not permanent, since the sweep clears it, but each payload change costs the next contributor six months of parallel shapes, and the proposal does not price that in.
> **Fix:** Store a per-event `schemaVersion` (or put it in the event name) and key the insights queries on it. Alternatively, state the rule that a payload change adds fields and never renames them.
> **Status:** upheld

### [WARN] party-visionary — "Every design write records the rendered headline" is a forever obligation on every future design writer, with a silent failure mode

**Quotes:**

> To know which headline the design was rendered with, every design write records it (a nullable column; null for drafts from before 006, which fall back to checking whether the current headline appears in the HTML).
> **Problem:** This is the second "every writer must also stamp X" rule. The first is 009's composition stamp on every revision writer (repo context, not this artifact). Every design path added later has to remember to write the column too: the hero product-screenshot path, a full-AI-render path, a 007-style re-theme of an existing draft. If a writer updates the design and leaves the column at its previous value, the badge is wrong in a way that looks plausible: either "stale" right after a fresh regenerate, or no badge after a real edit. The null fallback catches only a writer that writes null. It does not catch one that leaves the column alone. The badge is a trust signal, so a false one teaches users to ignore it.
> **Fix:** Pick a single write point and say which one. For example, record the rendered headline on the `DraftRevision` inside `commitDraftRevision`, and have the badge read it from the current revision. Then a new design path inherits the stamp because it commits a revision, not because someone remembered. Also add a unit test that fails if a revision is created without the stamp.
> **Status:** upheld

### [WARN] party-visionary — The exact-once HTML replace plus a per-field "rendered" column is the template the next on-image editable field will copy

**Quotes:**

> Its button applies the new headline to the design without a model call: it replaces the rendered headline text in the stored HTML, only if that text occurs exactly once, and commits a new revision through `commitDraftRevision` (the inline-edit path, which re-renders the PNG).
> (The research found that only a headline edit can make the image stale, and a plain re-render would keep the old headline, so the fix is the exactly-once headline replace in item 8.)
> **Problem:** The reasoning holds only for as long as the headline is the only editable field drawn on the image. The next change that puts another edited field on the image will generalise from this one: a CTA, a subline, a contact block, or brand-kit colours re-applied to an existing draft. Copied as-is, that gives another `rendered<X>` column, another exact-once string replace and another badge. One column, one matcher and one badge per field, each with its own way of failing to match on freeform Path B HTML. Text replace is also the wrong lesson for anything that is not a unique text run, such as a colour or a font. The proposal frames the mechanism as headline-specific and never says it is not meant to be the pattern.
> **Fix:** Record what the design was rendered from as one fingerprint over the rendered inputs, with the headline as its first member, and derive staleness from that fingerprint. Or state in the artifact that the exact-once replace is a deliberate one-off and is not the pattern for future fields.
> **Status:** upheld

### [WARN] party-visionary — The wrapper keeps the PostHog door open only on the write side; the insights page binds reads to this Postgres table

**Quotes:**

> Call sites never touch the table directly, so an external backend (PostHog or another) can be added later inside the wrapper alone.
>
> - **Self-hosted PostHog and ClickHouse** (dropped by the user, 2026-10-23); the wrapper keeps the door open
>   **Problem:** The claim covers emission. It does not cover consumption. `/admin/insights` runs funnel, p50/p90, applied-rate and per-team queries directly on `AnalyticsEvent`. The change that later "adds PostHog inside the wrapper" will therefore have two choices:

- Dual-write forever, so Postgres and PostHog must stay in agreement, and the 180-day sweep and PostHog's own retention will diverge.
- Rewrite every insights query against PostHog and retire the page.

Neither happens inside the wrapper alone. A later reader will take the door as open because the proposal says so. The longer the page grows, the more expensive the move becomes.
**Fix:** Either state honestly that adopting an external backend later means replacing or dual-feeding `/admin/insights`, or put the insights reads behind a query module, so the read side has a single seam that matches the write wrapper.
**Status:** upheld

### [NOTE] party-visionary — Image style and composition outcome are captured but not surfaced, one chart short of a continuous 009 hypothesis check

**Quotes:**

> image style and composition outcome 6. **A super-admin page,** `/admin/insights`, global across teams: the wizard funnel and where users leave; generation success and failure rate and the top failure reasons over time; refine applied rate by instruction class; p50/p90 duration by surface and model; tokens by surface; scheduled generation and publish outcomes; activity per team.
> **Problem:** Item 4 already stores the image style and composition outcome on each generation event, so the fail-closed fallback rate per style becomes computable. Item 6 does not list it. According to the repo roadmap (not this artifact), the next imagery change is gated on a one-off six-brief operator check of 009 Phase 1. One chart would make that check continuous on real prod traffic: fallback-to-classic rate by style, plus refine count to keep by style. 006 collects the data and stops one step short of using it.
> **Fix:** Add "composition outcome and fallback rate by image style" to the insights page list, or record why it is left out.
> **Status:** upheld
