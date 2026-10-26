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

### [WARN] party-architect — The backfill's idempotency and concurrency contract is unstated

**Quotes:** > Fork 012 converted these at boot: `prisma migrate deploy` added `DraftCaption` and then `docker-entrypoint.sh` ran `dist/scripts/backfill-captions.js` (the TypeScript split planner).
**Quotes:** > the Coolify redeploy of both resources
**Problem:** (b) puts the backfill back on the boot path. The proposal says one deploy redeploys two resources. If both boot through the same entrypoint, the backfill runs twice and may run at the same time. The proposal gives the backfill no contract for re-runs: does it skip drafts that already have rows, and what lock makes two simultaneous boots safe? The same question applies when a boot crashes partway and restarts. A converter that writes rows without a "not already converted" check doubles captions on the second run.
**Fix:** State that the backfill is idempotent and how (for example, it converts only drafts with zero `DraftCaption` rows, inside a transaction or under an advisory lock), and which resources run it.
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
