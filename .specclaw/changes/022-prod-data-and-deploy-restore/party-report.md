# Party Report: 022-prod-data-and-deploy-restore

**Reviewed:** 2026-10-18
**Tier:** deep (classifier) — Converts persisted prod captions from Draft.copyText into DraftCaption rows through a migration or restored backfill that must not lose text, restores the deleted deploy workflow (GHCR push, Coolify redeploy, health commit check), and changes the boot sequence, while the conversion mechanism and the prod data copy are still unresolved.
**Panel:** party-po(sonnet), party-architect(opus), party-ba(sonnet), party-security(opus), party-visionary(opus)
**Verdict:** CHANGES_REQUESTED

## Summary

33 findings: 6 BLOCK, 17 WARN, 9 NOTE upheld — 1 withdrawn

## Findings

### [BLOCK] party-architect — Option (b) needs boot-path, build and migration-file co-changes the proposal never names

**Quotes:** > **(b)** Restore the TypeScript backfill and run it between two `migrate deploy` stages, or make the drop migration's guard a separate step that runs after the backfill.
**Quotes:** > Default: (b), if planning confirms the planner splits real prod captions better.
**Quotes:** > It must be a no-op where `copyText` is already gone, so databases that already applied 016 stay valid.
**Quotes:** > The 016 guard stays as the last line of defence.
**Problem:** (b) is the default, but its co-changes are left to planning. The proposal does not say what stops `migrate deploy` part-way, so that "two stages" can exist. A single command applies every pending migration, and the proposal itself says that is how 012 and 016 land "in one run". Running the backfill in that gap also means changing `docker-entrypoint.sh` and bringing back the build step that produced `dist/scripts/backfill-captions.js`. The second branch, "make the drop migration's guard a separate step", edits `20261013120000`. The proposal says some databases have already applied that migration, so editing it changes a migration they recorded as applied. That branch also contradicts "The 016 guard stays as the last line of defence". Finally, the code restored from `4900682^` was written against a schema that still had `Draft.copyText`. After 016 drops that column, the current schema presumably has no `copyText` field, so the restored planner needs a raw read, or the column has to survive in the schema until the backfill has run. None of these four co-changes (staged deploy, entrypoint plus build bundle, the applied migration file, the schema or raw read) is in the item-1 list or the "about 12" files. If one is missed, the merge half-lands on prod's boot path.
**Fix:** Pick the mechanism in the proposal rather than in planning. For (b), list the changes to the entrypoint, the build step, the drop migration and the schema. Say how migration stops before `20261013120000` (for example, the backfill moves into the drop migration's predecessor, or the drop moves to a migration that runs only after the backfill). State plainly that applied migration files are not edited.
**Status:** upheld

### [WARN] party-architect — The conversion's selection predicate and the 016 guard's predicate are not tied together

**Quotes:** > That migration raises an exception when any draft has `copyText` and no `DraftCaption` rows.
**Quotes:** > Either way, no caption text is lost.
**Quotes:** > (a) keeps one `migrate deploy`, but SQL cannot easily repeat the 012 channel-split planner, so it may only copy the whole caption to each channel.
**Problem:** The conversion and the guard both decide which drafts count as "legacy". The guard trips only on drafts with `copyText` and _zero_ `DraftCaption` rows. A draft with `copyText` and _some_ `DraftCaption` rows passes the guard, and its `copyText` is dropped whether or not that text was converted. The proposal does not say which drafts the conversion selects. It also does not say which channels get a row: "each channel" of what (the brief's channels, or a fixed set)? It does not say what happens to a draft with an empty `copyText`. For (a), "no-op where `copyText` is already gone" means the migration must not even reference a column that no longer exists, and the proposal leaves the guarding technique unstated. Two implementers would choose different predicates, channel sets and no-op guards.
**Fix:** Say in the proposal which drafts are converted (and that this matches or covers the guard's predicate), how channels are chosen, how empty and partial cases are handled, and how the migration checks for a missing column.
**Status:** upheld

### [WARN] party-architect — The E2E test for a legacy-shaped draft has no seam at the schema that test runs on

**Quotes:** > Items 1–4, with tests for the caption conversion (unit and an E2E case built on a legacy-shaped draft) and the docs.
**Quotes:** > A dry-run on a copy of prod data proves it before any deploy.
**Problem:** A legacy-shaped draft (`copyText` set, no `DraftCaption` rows) cannot exist on a database migrated to the head of `v2`, because 016 drops the column. So an app-level E2E case cannot seed one. What actually has to be tested is the migration and boot sequence: migrate to just before the conversion, seed legacy rows, run the rest, and check the captions. The proposal names no harness that migrates part-way, seeds, then finishes. The dry-run depends on Open Question 2 (a prod dump that may never come), so it is not a repeatable test.
**Fix:** Name the test seam. One option is a script-driven test that applies migrations up to `20261013120000` minus one, inserts synthetic legacy drafts with raw SQL, runs the conversion and the remaining migrations, and checks the rows. For (b), unit-test the restored planner against fixture captions.
**Status:** upheld

### [WARN] party-architect — The docs get a new rule on top while the contradicting rules stay below it

**Quotes:** > `CLAUDE.md` and `docs/handoff.md` now say this repo is the fork, `origin` is the fork, and `bistec-oss/studio` must never be pushed to.
**Quotes:** > `CLAUDE.md` and `docs/handoff.md` get a new top entry:
**Quotes:** > The fork's history entries stay, marked as fork context.
**Problem:** The item is called "Rewrite the repo rules", but the plan only adds a top entry. The proposal does not say whether the existing "never push `bistec-oss/studio`" rules sit in history entries (which can be marked) or in a standing rules section (which has to be edited). If they are standing rules, two files then contain two opposite answers about `origin` and pushing, and agents read both as instructions.
**Fix:** Say whether each existing rule line is removed, rewritten or merely superseded, and which section it lives in.
**Status:** upheld

### [NOTE] party-architect — Option (a) puts the split judgement in SQL, which the proposal itself says cannot do it

**Quotes:** > (a) keeps one `migrate deploy`, but SQL cannot easily repeat the 012 channel-split planner, so it may only copy the whole caption to each channel.
**Problem:** The proposal names the layer that owns channel splitting: the TypeScript planner. Under (a), prod's legacy drafts would be converted by different logic from the logic that converted every database that went through 012. The same legacy data would get different results depending on the environment. This is a choice of layer, separate from whether the split quality is worth paying for.
**Fix:** If (a) is chosen, say in the proposal that prod is deliberately converted differently, or keep the planner as the only converter.
**Status:** upheld

### [NOTE] party-architect — Item 2 cannot reach `main` without item 1

**Quotes:** > **Restore `docker-publish.yml`** from `a3cecda^`, with its main-only trigger, the main-only dispatch guard, the Coolify redeploy of both resources and the `/api/health` commit verification.
**Quotes:** > The entrypoint's `set -e` then fails the boot, and the deploy never comes up.
**Problem:** Item 2 is the only thing that makes a `v2` → `main` merge deploy. If the restored workflow is on `main` without the item-1 conversion, the first merge deploys a boot that, by the proposal's own account, fails. The same goes for the `CLAUDE_CLI_MODEL` env change in Open Question 3. This is a coupling fact.
**Fix:** State in the proposal that items 1 and 2, plus any required `CLAUDE_CLI_MODEL` change, must all be on `v2` before the merge PR.
**Status:** upheld

### [NOTE] party-architect — Rebuttal to party-po: the workflow restore is not independent of the caption mechanism at the point where it has effect

**Quotes:** > When `v2` merges to `main`, nothing would build or deploy.
**Quotes:** > **Restore `docker-publish.yml`** from `a3cecda^`, with its main-only trigger, the main-only dispatch guard, the Coolify redeploy of both resources and the `/api/health` commit verification.
**Problem:** party-po's WARN says the restore "is independent of the caption mechanism" and can "ship alone and early". By the proposal's text, the workflow is missing only on `v2`, and its trigger is main-only. So restoring it on `v2` early does nothing until the `v2` → `main` merge. That same merge carries the 016 drop migration. The file can be committed early, but its first run is always the deploy that applies the caption migrations. This is a coupling fact, not a release-order recommendation. The restore cannot be validated in production apart from item 1, so "independent" is structurally wrong.
**Fix:** If the restore is split into its own change, its acceptance must not claim a deploy was exercised. Its first real run is the merge that also needs item 1.
**Status:** upheld

### [NOTE] party-architect — Rebuttal to party-po: the cheaper variant is not "one migration plus one E2E case" as structured

**Quotes:** > It must be a no-op where `copyText` is already gone, so databases that already applied 016 stay valid.
**Quotes:** > Items 1–4, with tests for the caption conversion (unit and an E2E case built on a legacy-shaped draft) and the docs.
**Problem:** party-po's BLOCK prices option (a) as fitting "in one migration plus one E2E case". Structurally, (a)'s migration runs in two schema states: with `copyText` and without it. So it needs a column-existence branch, and both branches need testing. As argued in my upheld WARN on the test seam, an E2E case cannot seed a legacy-shaped draft on a head-of-`v2` database. (a) still needs a part-way-migrate harness. The price comparison may still favour (a), and that judgement is party-po's to keep. The structural cost entered for (a) is understated.
**Fix:** When pricing (a), include the conditional-migration branch and the migrate-part-way test harness. Do not count it as a single E2E case.
**Status:** upheld

### [BLOCK] party-ba — The claim that every legacy draft trips the guard is asserted, and the proposal never checks prod's data shape

**Quotes:**

> That migration raises an exception when any draft has `copyText` and no `DraftCaption` rows. On prod, `migrate deploy` applies 012 and 016 in one run, before any boot step, so every legacy draft trips the guard.
> Prod drafts store their caption in `Draft.copyText`.
> **Problem:** The whole change rests on two claims about prod: that prod runs a schema where 012's migration is not yet applied, and that its drafts hold legacy captions. Neither is sourced. The proposal quotes no prod query, row count, migration-table state or dump. Open Question 2 admits there is no prod copy yet, so the premise has not been observed. The "every legacy draft" wording is also unscoped. The proposal does not say how many drafts exist, what shape their captions take (single block, combined multi-channel, empty), or whether any already have `DraftCaption` rows. Mechanism (a) versus (b) depends on those facts.
> **Fix:** Before planning, record the actual prod state: the last applied migration, the count of drafts with `copyText` and no `DraftCaption`, and a sample of caption shapes. Cite where that came from. State the problem as "N drafts will fail" and not "every".
> **Status:** upheld

### [WARN] party-ba — Caption "split quality" is the stated reason to prefer (b), but the proposal never says what a correct conversion means

**Quotes:**

> Either way, no caption text is lost.
> SQL cannot easily repeat the 012 channel-split planner, so it may only copy the whole caption to each channel.
> Default: (b), if planning confirms the planner splits real prod captions better.
> **Problem:** "Conversion" and "better" are load-bearing terms with no definition, so there are two builds. One copies the whole caption to every channel, which loses no text but duplicates it. The other splits per channel, which risks dropping or misassigning text. "No caption text is lost" is also not testable as written. It does not say whether duplicated text counts as lost, or whether the split must round-trip to the original. The Problem section also never establishes that the combined-caption shape actually exists in prod. The CLAUDE.md bug description is about the old system, and the proposal does not re-verify it for these drafts.
> **Fix:** State an acceptance criterion for the converted state. For example, for each legacy draft, the union of the per-channel captions contains the original `copyText` and no channel is empty. State the pass condition for the split-versus-copy choice.
> **Status:** upheld

### [WARN] party-ba — The item-4 checks are described as risks with no evidence they affect prod, and the scope depends on their outcome

**Quotes:**

> Prod's value is not known.
> External MCP/ACP callers that read it would break.
> Prod's team has both, so it stays.
> Reverting other 016 removals beyond what item 1 needs, unless the item-4 check finds a real prod caller.
> **Problem:** Several claims about prod are asserted with no source: the team "has both" members and rows, the heal is "probably safe", and external callers "would break". The proposal also names no party who calls the MCP/ACP surface with `copyText`, so it is unknown whether the problem exists. The scope boundary is conditional on a check the proposal does not specify how to run. The "Pre-merge prod checklist" is a doc deliverable, and nothing says when it is acted on or by whom.
> **Fix:** Name the evidence source for each item, such as a Coolify env read, the MCP/ACP access logs, or a count query. Say who runs it. Make the "real prod caller" threshold explicit.
> **Status:** upheld

### [WARN] party-ba — Acceptance criteria are absent, so the main claim (prod deploys and keeps its data) is unverified at ship time

**Quotes:**

> Items 1–4, with tests for the caption conversion (unit and an E2E case built on a legacy-shaped draft) and the docs.
> A dry-run on a copy of prod data proves it before any deploy.
> The dry-run on prod-shaped data is the gate.
> **Problem:** The goal is "keep prod data working", but no criterion defines it, so nothing can fail. A synthetic legacy-shaped draft only proves the code handles the shape the author imagined. It cannot show that real prod data survives. "Prod-shaped" is undefined, and Open Question 2 allows the gate to degrade to synthetic drafts only. The proposal also does not say what a passing dry-run looks like. It sets no row-count parity, no zero-diff on caption text, and no check that `/api/health` returns the commit. Item 2 has no criterion either. Nothing shows the restored workflow works, since it can only truly run on `main` and merging is out of scope.
> **Fix:** Add falsifiable criteria. Examples: after migrating a prod dump copy, the count of drafts with `copyText` and no captions is 0 and the pre- and post-migration text matches; the boot completes; the restored workflow passes a syntax or dry-run check. State what happens if no dump is available.
> **Status:** upheld

### [NOTE] party-ba — "Fresh system" and "company prod" reading of the fork rests on one dated user decision with no stated source

**Quotes:**

> The user decided on 2026-10-18 to **keep prod data working**.
> The fork was built for a **fresh, separate system** with no deploy target.
> **Problem:** The premise that prod holds real data and must be kept is credible, since the repo's own docs describe the Hearts Academy data. The proposal still cites the decision with no pointer to where it was recorded. "Prod data working" is also ambiguous. It could mean no data loss, or it could mean the deploy stays green with the new UI and behaviour. This probably does not change the build.
> **Fix:** Link the decision record and define "working" in one line.
> **Status:** upheld

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

### [BLOCK] party-security — The caption guard checks that rows exist, not that the text survived, and the column drop it protects cannot be undone

**Quotes:**

> That migration raises an exception when any draft has `copyText` and no `DraftCaption` rows.
> Either way, no caption text is lost. The 016 guard stays as the last line of defence.
> **Problem:** The guard is a presence test. If a draft has even one `DraftCaption` row, of any content, the guard passes and `copyText` is dropped. So a conversion that goes partly wrong still passes: a planner that writes one channel and skips the others, a split that truncates, a whole-caption copy written to only some channels, or an empty-string row. The guard says yes, and the only source text is destroyed in the same run. A guard that a bad conversion can satisfy does not prove "no caption text is lost". The proposal also names no recovery path once the column is gone.
> **Fix:** Make the guard compare content. Before the drop, check for every draft with `copyText` that the converted rows reproduce the source. For a split, the joined channel text must equal the normalised `copyText`. For a copy, every channel must equal it. Abort on any mismatch. Before the drop, also copy `id, copyText` into a retained archive table, or into a required pre-deploy `pg_dump` step, so an operator can restore text after a bad conversion.
> **Status:** upheld

### [BLOCK] party-security — The dry-run gate falls back to synthetic data without a signal

**Quotes:**

> **Risk:** high. A wrong caption conversion loses prod text, and a wrong migration fails the prod deploy. The dry-run on prod-shaped data is the gate.
> **Prod data copy:** can the user provide a `pg_dump` of prod (or the Hearts Academy rows) for the dry-run? Without it, the test uses synthetic legacy drafts only.
> **Problem:** The proposal names the prod-data dry-run as the only gate on an irreversible, high-risk migration. Then, if no dump is provided, it swaps in synthetic drafts. A synthetic pass looks the same as a real pass. Synthetic drafts are shaped by what the author expects legacy captions to look like, so they are least likely to hit the odd real captions that break a channel splitter. The gate is open exactly when it matters.
> **Fix:** Fail closed. Without a prod-data dry-run, the merge checklist item stays unchecked and the deploy is blocked. If the user knowingly accepts a synthetic-only run, record that as a named waiver in `docs/handoff.md`. The dry-run report must state which data source it ran against.
> **Status:** upheld

### [BLOCK] party-security — A boot failure after the destructive migration leaves prod on a schema the old code cannot read

**Quotes:**

> On prod, `migrate deploy` applies 012 and 016 in one run, before any boot step
> 008 makes `CLAUDE_CLI_MODEL` a validated system default. `default` or any value that is not a catalogue key or current ID **fails the boot**. Prod's value is not known.
> **Problem:** Migrations run before the rest of boot. So any later boot failure happens after `20261013120000_drop_legacy_captions` has already removed `copyText` and the `Bistec`-team deletion has run. An unknown `CLAUDE_CLI_MODEL` would cause one, and so would any other new env check. The new container never comes up. The only way back, the previous image or a reverted merge, is code that reads `Draft.copyText`, which no longer exists. The proposal treats "the deploy never comes up" as the failure to avoid. The worse case is a half-applied deploy: destructive schema changes committed, no code that matches them, and no rollback image that works.
> **Fix:** Make the env and config checks happen before `migrate deploy` in the entrypoint, so a config failure stops the boot before any schema change. Treat the destructive migrations as a one-way step. Before merge, the checklist confirms the prod env values and takes a backup. The handoff states the recovery: restore the backup and redeploy the previous SHA. Rolling back the image alone does not work.
> **Status:** upheld

### [WARN] party-security — The staged backfill runs outside the migration lock on both resources

**Quotes:**

> **(b)** Restore the TypeScript backfill and run it between two `migrate deploy` stages, or make the drop migration's guard a separate step that runs after the backfill.
> with its main-only trigger, the main-only dispatch guard, the Coolify redeploy of both resources
> **Problem:** The workflow redeploys both resources, and the boot path runs on each. Under option (b), the backfill runs between the two `migrate deploy` calls, outside whatever serialises the migration step. Two containers booting together could both backfill. That can write duplicate `DraftCaption` rows, which the presence-only guard accepts, or the two can interleave. The second variant moves the guard into a separate step. Then an operator who skips that step, or a boot path that never reaches it, runs the drop unguarded.
> **Fix:** If (b) is chosen, make the backfill idempotent, with a unique key on (draft, channel) and upsert semantics, and run it under the same advisory lock as `migrate deploy`. Keep the guard inside the drop migration itself, never as a separate step, so the drop cannot run without it.
> **Status:** upheld

### [WARN] party-security — External fork code stays a standing pull source into a repo that auto-deploys to prod

**Quotes:**

> the fork `EnderGuardian25/ai-studio` is the source of the adopted code, fetched as `fork/*`;
> **The fork remote:** keep `fork` as a named remote for future pulls, or drop it once adopted? Default: keep it.
> **Problem:** This change restores the `main` → GHCR → Coolify deploy path. The fork's earlier adoption came in by fast-forward and brought in changes that would have broken prod (the deleted workflow, the destructive migrations, and docs that told agents not to touch this repo). Keeping the fork as a standing pull source, with no stated review gate, invites the same fast-forward again. Code from a third-party repo would then reach a pipeline that deploys to prod with real tenant data.
> **Fix:** If the remote stays, document in `CLAUDE.md` that fork code arrives only as a reviewed PR into `v2`, never by fast-forward or a direct merge. Every such PR gets the same pre-merge prod checklist (migration list, removed workflows, new boot-time validations). Otherwise, drop the remote after adoption.
> **Status:** upheld

### [NOTE] party-security — Kept fork history entries still read as agent instructions

**Quotes:**

> The fork's history entries stay, marked as fork context.
> **Problem:** Agents read `CLAUDE.md` and `docs/handoff.md` as directives. The fork entries contain imperatives, such as "`origin` is the fork" and "`bistec-oss/studio` must never be pushed to", and they describe the company prod items as "company history, not to-dos". Tagging them as "context" does not stop an agent from obeying a stale directive further down the file. That can lead to wrong pushes, or to treating live prod blockers as closed.
> **Fix:** Move the fork entries to a separate archive file that `CLAUDE.md` links but does not inline. If they must stay, rewrite their imperatives in the past tense, and put a top-entry rule that supersedes them.
> **Status:** upheld

### [WARN] party-security — Rebuttal to party-visionary: falling back to the default model on an unknown value trades a visible outage for a silent change

**Quotes:**

> 008 makes `CLAUDE_CLI_MODEL` a validated system default. `default` or any value that is not a catalogue key or current ID **fails the boot**. Prod's value is not known.
> **Problem:** party-visionary's second fix option is to have the boot "fall back to the default and log a warning on an unknown value, instead of failing". Under a failure-mode reading, that turns a misconfiguration into a silently reduced or changed setting. Prod would run a model the operator did not choose. The only signal would be a log line in a container nobody watches. This repo's own B4 history shows how long that kind of silence can last. The real harm in the proposal is not that the boot fails closed. The harm is that it fails closed after the destructive migration has run (see my finding above). The fix is to move the check before the schema change, not to make it permissive.
> **Fix:** Keep the check fail-closed. Run it before `migrate deploy`, so an unknown value stops the boot while the old container and the old schema still match. If a fallback is ever added, it must show in a visible place, such as `/api/health` or an admin banner, not only in a log.
> **Status:** upheld

### [NOTE] party-security — Rebuttal to party-po: the fork-remote default is not cost-free under a failure-mode reading

**Quotes:**

> **The fork remote:** keep `fork` as a named remote for future pulls, or drop it once adopted? Default: keep it.
> **Problem:** party-po says this question "has a stated default and costs nothing, so it should be resolved by that default and removed from the list". On cost grounds that may be right. But settling it by the default with no review gate leaves open the same import path that produced every BLOCK in this proposal. The remote is how unreviewed third-party code reaches a branch that merges into an auto-deploying `main`. Closing the question is fine. Closing it as "keep" with no condition is not.
> **Fix:** Resolve the question before planning, as party-po asks. If the answer is "keep", attach the reviewed-PR-only rule from my fork-remote finding as part of the same decision.
> **Status:** upheld

### [WARN] party-visionary — Open Question 1 compares the two conversion mechanisms on split quality alone, but each leaves a permanent cost on the migration chain

**Quotes:**

> - **(a)** A new SQL migration, ordered before `20261013120000`, that writes `DraftCaption` rows from `copyText`. It must be a no-op where `copyText` is already gone, so databases that already applied 016 stay valid.
> - **(b)** Restore the TypeScript backfill and run it between two `migrate deploy` stages, or make the drop migration's guard a separate step that runs after the backfill.
>   Default: (b), if planning confirms the planner splits real prod captions better.
>   **Problem:** Both options outlive the one prod run they exist for. Every fresh database (the CI E2E database, each recreated test database, any new environment) replays the whole chain on every boot, forever.

Under (b), the backfill runs at a historical point in the schema, after `DraftCaption` is created and before the drop. But it is compiled against the current Prisma client, which no longer has `copyText` at all. So the first later change that alters `DraftCaption` breaks fresh-database boots, because the backfill writes with today's client into the older table. That change could add a column or a channel value, or change a constraint. It would be CI that goes red, on a change that never touched captions. The entrypoint is also tied permanently to one migration's name. Every later migration author must know which `migrate deploy` stage their migration lands in. If the guard-split variant edits the already-applied `20261013120000`, every dev or test database that applied it now has a modified applied migration. And taking the backfill out of the boot later brings back this exact bug for any database that has not yet converted. That is how 016 created it.

Under (a), the chain gains a migration dated before one that some databases have already applied. Its body has to test whether a column exists, because it runs in two different schema states. Once prod's `_prisma_migrations` records it, it can never be removed. It also sets a precedent: "fix a bad migration by back-dating one in front of it". The next contributor will copy that in a case where the target databases have already applied the later migration, and it will not work there.

The open question prices none of this. It chooses (b) on split quality alone.
**Fix:** Add the lifetime cost of each option to Open Question 1 as a second criterion. If (b) is chosen, require the backfill to read and write through raw SQL pinned to the schema as it stands at that point in the chain, not the generated client. State whether it is permanent or how it is retired. If (a) is chosen, record in the migration's header why it is back-dated and that it is conditional, so the precedent comes with its limits stated.
**Status:** upheld

### [WARN] party-visionary — Splitting the caption and then dropping `copyText` makes the split rule permanent, and the artifact treats only a lossy conversion as the risk

**Quotes:**

> Either way, no caption text is lost. The 016 guard stays as the last line of defence.
> (b) keeps the split quality but changes the boot sequence.
> **Problem:** Once `20261013120000` drops `copyText`, the original combined caption no longer exists anywhere in the database. Today's split planner becomes the only record of what each prod post said before the change. Suppose a later change finds the planner assigned text to the wrong channel, for example per-channel caption tuning, or a WhatsApp channel being added. The original string is no longer there to re-split, so that judgement cannot be revisited. The Risk section covers a conversion that loses text. It does not cover one that keeps all the text but places it wrongly. Text-preserving is the only thing the dry-run checks, so that failure passes the gate and becomes permanent.
> **Fix:** Keep the original string for converted drafts, in a legacy-source column on `DraftCaption` or a small archive table, so the split can be re-run later. Otherwise, state outright that accepting 016's drop also accepts today's split rule permanently.
> **Status:** upheld

### [WARN] party-visionary — Keeping the fork remote turns adoption into a recurring import, but the prod-safety check is written as a one-time list

**Quotes:**

> 4. **Other fresh-start assumptions may hit prod.** These need a check before merge: 4. **The fork remote:** keep `fork` as a named remote for future pulls, or drop it once adopted? Default: keep it.
> **Problem:** The proposal itself says the fork targets a "fresh, separate system with no deploy target". It found four conflicts on the first import: a destructive migration, a deleted workflow, rewritten repo rules, and a stricter boot check. With `fork` kept "for future pulls", the next pull from `fork/v2` can bring more of the same: another drop migration with a guard, another workflow edit, and `CLAUDE.md` merge conflicts at the top entry. Nothing makes the next import check for those. Item 4's checklist sits in `docs/handoff.md` as a list of this import's specific items, not as a procedure. So the next contributor who runs `git merge fork/v2` must rediscover the method by hand, after the conflict is already on `v2`.
> **Fix:** If the default is to keep the remote, make item 4 a reusable "importing from the fork" procedure, not a list for this one import. It should name the checks by class: migrations that drop or guard, workflow deletions, env values the boot validates, removed API fields. Or decide that adoption is one-time and drop the remote.
> **Status:** upheld

### [WARN] party-visionary — The 008 boot check ties prod's Coolify env to the code's model catalogue, and the artifact reduces that to a one-time lookup

**Quotes:**

> 008 makes `CLAUDE_CLI_MODEL` a validated system default. `default` or any value that is not a catalogue key or current ID **fails the boot**. Prod's value is not known.
> If it is `default`, the deploy needs an env change at the same time.
> **Problem:** The proposal treats this as a check before this one merge. But the contract lasts. One fact is split across two systems: the catalogue in the repo and the env var in Coolify. Only the Coolify administrator can edit the second. One day a later change retires a model ID from the catalogue, or renames a key, because a model is deprecated. If prod's `CLAUDE_CLI_MODEL` names that ID, the next deploy fails to boot. Nothing in the repo would show it, since the env value is outside the repo. The person who edits the catalogue cannot see the Coolify value, and the person who can see it does not edit the catalogue.
> **Fix:** Record the prod value and the rule ("any change that removes or renames a catalogue entry must check the prod env") in the same place as the catalogue, not only in the pre-merge checklist. Or have the boot fall back to the default and log a warning on an unknown value, instead of failing. That makes the mismatch reversible rather than an outage.
> **Status:** upheld

### [WARN] party-visionary — The repo-identity rules will be stated in two documents, and the fork entries kept beside them say the opposite

**Quotes:**

> 3. **Rewrite the repo rules in the docs.** `CLAUDE.md` and `docs/handoff.md` get a new top entry:
> The fork's history entries stay, marked as fork context.
> **Problem:** "Which repo is this, what does `origin` point to, may I push" is now written separately in `CLAUDE.md` and `docs/handoff.md`. Both files also keep fork entries that say `origin` is the fork and that `bistec-oss/studio` must never be pushed to. The next change to these rules will edit one file and not the other. Likely next changes are dropping the fork remote (Open Question 4), or allowing direct pushes to `main` after the merge. Agent sessions reach these files through grep hits as well as by reading from the top. So a stale or fork-context line shows up out of context, and a stale "never push" line looks exactly like a current rule. This repo has already had one instance of this drift, which is half of why the proposal exists.
> **Fix:** Make one file authoritative for the repo rules and have the other point to it. Mark each kept fork entry inline (for example, a prefix on its heading), not only by where it sits under the new top entry.
> **Status:** upheld

### [WARN] party-visionary — "The migration list since `main`" becomes a third hand-kept copy of a fact git already holds

**Quotes:**

> 4. **Pre-merge prod checklist** in `docs/handoff.md`: the `CLAUDE_CLI_MODEL` value, external `copyText` callers, the migration list since `main`, and the 005 NFR-03 release note.
> **Problem:** Every change that lands on `v2` before the merge adds a migration. The planned conversion migration does, and so will whatever comes after 021. Each one makes a written list out of date. If the checklist is the merge gate, a stale list gives a wrong answer at the one moment it is used: the merge-day review checks fewer migrations than prod will apply. Nobody notices until a migration that was not on the list fails on prod.
> **Fix:** Have the checklist name the command that produces the list (a diff of `prisma/migrations` between `main` and `v2`), not the list itself.
> **Status:** upheld

### [NOTE] party-visionary — The legacy-draft E2E case is one step short of a standing upgrade-from-`main` test that would catch this class of failure for every later migration

**Quotes:**

> Items 1–4, with tests for the caption conversion (unit and an E2E case built on a legacy-shaped draft) and the docs.
> A dry-run on a copy of prod data proves it before any deploy.
> **Problem:** The failure being fixed here is "the migrations on `v2` cannot apply over data shaped by `main`". The CI suite cannot see that, because it always starts from an empty database. The proposal builds the fixtures for that case, a legacy-shaped draft and possibly prod-shaped data, but uses them for this one conversion only. A CI job could migrate a database to `main`'s head, seed it with legacy-shaped rows, and then run `migrate deploy` to `v2` head through the real entrypoint. That would catch the next destructive migration, from this repo or from a future fork pull, before it reaches the merge gate. Most of that job is already being built here.
> **Fix:** Build the legacy-draft case as a general "upgrade from `main`" CI step, and make the caption conversion its first assertion.
> **Status:** upheld

## Dissent

_Withdrawn findings. The severity token is prefixed WITHDRAWN so these do not count as live findings._

### [WITHDRAWN WARN] party-architect — The backfill's idempotency and concurrency contract is unstated

**Quotes:** > Fork 012 converted these at boot: `prisma migrate deploy` added `DraftCaption` and then `docker-entrypoint.sh` ran `dist/scripts/backfill-captions.js` (the TypeScript split planner).
**Quotes:** > the Coolify redeploy of both resources
**Problem:** (b) puts the backfill back on the boot path. The proposal says one deploy redeploys two resources. If both boot through the same entrypoint, the backfill runs twice and may run at the same time. The proposal gives the backfill no contract for re-runs: does it skip drafts that already have rows, and what lock makes two simultaneous boots safe? The same question applies when a boot crashes partway and restarts. A converter that writes rows without a "not already converted" check doubles captions on the second run.
**Fix:** State that the backfill is idempotent and how (for example, it converts only drafts with zero `DraftCaption` rows, inside a transaction or under an advisory lock), and which resources run it.
**Status:** withdrawn — party-security's WARN covers the same two-resource concurrency hazard and gives a more complete fix: a unique key on (draft, channel), upsert semantics, and the same advisory lock as `migrate deploy`. The one point it leaves out is naming which resources run the backfill. That is small enough that it does not justify a second filing of the same defect.
