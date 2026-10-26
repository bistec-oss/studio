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
