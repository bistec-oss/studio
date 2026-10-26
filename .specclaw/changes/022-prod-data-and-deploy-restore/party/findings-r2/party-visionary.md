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
