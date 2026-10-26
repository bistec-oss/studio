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
