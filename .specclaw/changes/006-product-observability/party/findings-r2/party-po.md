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
