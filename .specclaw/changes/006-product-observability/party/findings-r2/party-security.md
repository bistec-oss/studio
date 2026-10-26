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
