### [WARN] party-ba — The central "applied rate per instruction class" goal has no matching acceptance criterion or success measure

**Quotes:**

> So the applied rate per instruction class, which is what 004 set out to improve, cannot be computed from the database.
> Acting on what the data shows; this change measures, it does not tune
> An E2E section and unit tests on the `MOCK_AI` seams; no real model calls
> **Problem:** The proposal names measuring 004 as its main pain, but it never says what a successful measurement looks like. It has no acceptance criterion, no baseline and no threshold. The only verification stated is E2E and unit tests on mocks. Mocks cannot show that the dashboard answers the question the proposal was written for, and they cannot show that events are emitted on real paths. A "no tuning" scope plus mock-only tests means ship-time success is "events were written", not "the applied rate per class is now knowable".
> **Fix:** State falsifiable criteria. Examples: for a given period, the insights page's applied rate per class equals a hand count from the DB. Every emission point named in item 3 produces exactly one event per action, including the failed and not-applied outcomes. A killed `track` write leaves the action's result unchanged.
> **Status:** upheld

### [WARN] party-ba — The tool is meant to reveal usage and failure patterns, but "applied" and "abandoned" are undefined, and the only person who reads it is a super admin

**Quotes:**

> Nobody can see what happens inside bistec-studio in aggregate. Every quality problem so far was found by a person noticing it, days or weeks later.
> **Wizard abandonment:** what counts as leaving? A wizard opened and not submitted within a session, or a brief draft that expires unsubmitted (the 7-day brief-draft TTL)?
> outcome (`ok`, `not-applied`, `failed`)
> **Problem:** The funnel and the applied rate are the headline deliverables. Their load-bearing terms carry two meanings. "Abandonment" is left open, and the two readings (session exit vs 7-day TTL expiry) need different instrumentation: a client exit beacon vs a server-side sweep event. They would produce different builds and different numbers. "Applied" is also ambiguous. The text says a committed refine is "applied", but a refine that the user then undoes, or a "Use anyway" adoption of a rejected refine, could count either way. The Open Questions defer the abandonment definition, but event design (item 3) is already committed.
> **Fix:** Resolve both definitions before planning. Say whether "applied" means committed at the time of the action or kept in the final post, and what counts as the end of a wizard session.
> **Status:** upheld

### [WARN] party-ba — The stale-headline problem is asserted, with an unsourced mechanism and an unestablished fix

**Quotes:**

> Editing the headline (`saveHeadlineEdit`, `src/lib/captions/store.ts`) updates the field and leaves the HTML and the exported PNG showing the old headline.
> (The research found that only a headline edit can make the image stale, and a plain re-render would keep the old headline, so the fix is the exactly-once headline replace in item 8.)
> is an exact-once text replace of the rendered headline reliable on freeform Path B HTML (a headline split across elements or styled spans will not match), and should the button then fall back silently or say why?
> **Problem:** This is a bundled second problem that is unrelated to observability, and it is justified by "the research found", which is not cited. No frequency or user-report is given for how often users hit a stale headline or whether they notice it. The proposal also does not say whether the user edits the headline expecting the image to change. The proposal's own Open Question admits the chosen fix may not work on freeform HTML, so the fix may only apply to a fraction of drafts. The pain is real in principle, but its size and the fix's reach are unevidenced.
> **Fix:** Cite the research, or say how often users edit headlines after export. State the minimum match rate on real Path B HTML that makes the button worth shipping, as an acceptance criterion.
> **Status:** upheld

### [NOTE] party-ba — "Token counts where the provider reports them" may yield no data for the main route, and the page's stated token view assumes it does

**Quotes:**

> Read `message.usage` in `anthropicCall.ts` and the CLI's reported usage where `claude -p` returns it, and add the totals to the action's event.
> **CLI token counts:** does `claude -p` (pinned 2.1.287 in the image) report usage in the output mode the app uses? If not, CLI-mode events carry no tokens.
> tokens by surface
> **Problem:** The proposal commits a "tokens by surface" panel while admitting it does not know whether the CLI route, which is the production route per the proposal's own 024 reference, reports any usage. If it does not, the panel is empty or misleading for the main case. Nothing says how the page shows "unknown" vs zero.
> **Fix:** Resolve the CLI question first. If unresolved, define null-tokens as "not reported", excluded from totals and shown as such.
> **Status:** upheld
