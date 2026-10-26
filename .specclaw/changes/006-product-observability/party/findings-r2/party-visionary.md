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
