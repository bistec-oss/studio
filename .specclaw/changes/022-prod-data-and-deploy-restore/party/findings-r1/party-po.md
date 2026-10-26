### [BLOCK] party-po — A cheaper variant (merge the fork code but keep the guard from ever seeing legacy rows) is never priced against four bundled workstreams

**Quotes:**

> **Risk:** high. A wrong caption conversion loses prod text, and a wrong migration fails the prod deploy.
> Items 1–4, with tests for the caption conversion (unit and an E2E case built on a legacy-shaped draft) and the docs.
> **Problem:** The proposal treats "adopt the whole fork v2 and make prod survive it" as a given and never compares alternatives. Prod's real exposure is probably a small number of legacy drafts (Hearts Academy and the IRP posts). A much cheaper conversion exists: a one-off SQL migration that copies each `copyText` into a single caption row per channel. That is the proposal's own option (a), and it fits in one migration plus one E2E case. Option (a) is rejected only because it "may only copy the whole caption to each channel". The proposal never says what that costs. For a handful of already-published or exported drafts the cost is probably near zero, and the 012 planner's split quality would be paid for in a restored TS backfill, a changed boot sequence and unit tests. The default of (b) is chosen before anyone has looked at how many prod drafts there are or what their captions look like. The do-nothing option is also unpriced. That option is to hold prod on `main` and keep v2 off it until needed. The proposal does not say what gets worse. Nor does it say how many prod drafts exist or whether the fork's features are wanted on prod soon.
> **Fix:** Count the legacy drafts on prod first. Price the cheapest variant explicitly: a SQL migration that copies the whole caption to each of the draft's channels. Make that the default unless the count or caption shape shows the split is worth the boot-sequence change. State the do-nothing cost.
> **Status:** upheld

### [WARN] party-po — Item 2 restores the whole deploy workflow with no cut line, though only a green deploy path is needed at merge time

**Quotes:**

> **Restore `docker-publish.yml`** from `a3cecda^`, with its main-only trigger, the main-only dispatch guard, the Coolify redeploy of both resources and the `/api/health` commit verification.
> Revert 013's `GIT_SHA` comment rewording in `Dockerfile`, `src/app/api/health/route.ts` and `src/lib/env.ts` to name the workflow.
> **Problem:** The workflow restore is a file revert and is cheap. The `GIT_SHA` comment reverts in three source files are not. They touch source with no behaviour change. They are listed as scope with no stated value, and they widen the ~12-file blast radius. The proposal also bundles the restore with the conversion work. The restore could ship as its own tiny change that lands before v2 merges. It is independent of the caption mechanism and is unblocked now. Item 2 also carries no price for CI cost. Restoring the workflow brings back a Docker build on every push to main, which is bounded because the trigger is main-only, but the artifact does not say so.
> **Fix:** Drop the comment-reword reverts, or defer them to an optional follow-up. Name the cut line: the workflow restore ships alone and early. The caption conversion, the docs rewrite and the checklist follow.
> **Status:** upheld

### [WARN] party-po — Item 4 checks are open-ended and bundled into scope, with no cap on what a "real prod caller" finding triggers

**Quotes:**

> Reverting other 016 removals beyond what item 1 needs, unless the item-4 check finds a real prod caller.
> **Size:** bounded. It alters existing flows: the migration chain, the boot path, a workflow file and docs. No new subsystem.
> **Problem:** "Bounded" is asserted, but the escape clause makes scope unbounded. If the check finds an external MCP/ACP caller of `copyText`, the change re-adds the alias, and possibly the status heal as well. Each is a revert of a 016 removal that the proposal cannot yet price. The checklist items, which are the `CLAUDE_CLI_MODEL` value, external callers and the migration list, are manual operator steps. They are cheap as a checklist. They are expensive if they become code. Also, the dry-run on a prod `pg_dump` is the stated gate, but Open Question 2 admits it may not exist. In that case the gate degrades to synthetic drafts only, and the risk rating of "high" is not reduced.
> **Fix:** Cap item 4 at checklist-only in this change, and file any revert as a separate change with its own price. State the fallback gate if no prod dump is available, such as the user running the migration against a restored Coolify backup.
> **Status:** upheld

### [NOTE] party-po — Open Questions 3 and 4 are cheap to answer now and are being carried as scope

**Quotes:**

> **`CLAUDE_CLI_MODEL` on prod:** what is it set to in Coolify? If it is `default`, the deploy needs an env change at the same time.
> **The fork remote:** keep `fork` as a named remote for future pulls, or drop it once adopted? Default: keep it.
> **Problem:** The first question is a one-minute lookup that decides whether the deploy needs an env change. It should be answered before planning, not tracked as an open question. The second has a stated default and costs nothing, so it should be resolved by that default and removed from the list. Both inflate the apparent size of the change.
> **Fix:** Resolve both before the planning phase and move them into the checklist as done.
> **Status:** upheld
