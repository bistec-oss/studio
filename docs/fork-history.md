# bistec-studio — Fork history

This file keeps the record of the **fork era, 2026-10-07 to 2026-10-14**, when development ran in the fork `EnderGuardian25/ai-studio` and the docs called that fork `origin`. On 2026-10-18 this repo, `bistec-oss/studio`, adopted the fork's `v2`, and development continues here.

- **Everything below the procedure is superseded context, not instructions.** Each heading there starts with "[fork context, superseded]". Its rules about remotes, pushes, CI and company prod are wrong for this repo.
- **The current repo rules are in [`CLAUDE.md`](../CLAUDE.md)** (the top entry, which is authoritative). The current pick-up point is in [`handoff.md`](handoff.md).
- The entries were moved here by change 022 (T3, 2026-10-19). Apart from the heading prefix, their text is unchanged.

## Importing from the fork

The `fork` remote is `EnderGuardian25/ai-studio`. It is fetch-only (push URL `DISABLED`). The fork was built for a fresh system with no deploy target, and this repo deploys to company prod, which holds real data. So fork code arrives **only as a reviewed PR into `v2`**, never by fast-forward or a direct merge. The 2026-10-18 fast-forward was the one-time adoption, done on the user's explicit instruction.

1. **See what is new.** Run `git fetch fork`, then `git log --oneline v2..fork/v2`.
2. **Bring it onto a branch.** Branch from `v2` (for example `import/fork-<date>`), then merge or cherry-pick the fork commits onto that branch. `v2` itself is not touched yet.
3. **Check the four classes below.** Each one has broken, or would have broken, company prod. Record a decision for every hit in the PR. A hit that needs code usually becomes its own specclaw change, as 022 did.
   - **Migrations that drop or guard data.**
     - List them with `git diff --name-only v2...fork/v2 -- prisma/migrations`.
     - Read each new `migration.sql` for `DROP`, `DELETE`, `TRUNCATE`, `ALTER … DROP` and `RAISE EXCEPTION`.
     - The fork assumes a fresh database; prod has real rows. A drop or a guard needs a carry-over migration that runs first (the 022 pattern), and `npm run test:upgrade` must pass with prod-shaped rows.
     - Never edit a migration that has already been applied anywhere.
   - **Workflow deletions or changes.**
     - Check `git diff --stat v2...fork/v2 -- .github/workflows`.
     - The fork has no deploy target. `docker-publish.yml` deploys `main` to prod and must stay: 013 deleted it in the fork, and 022 restored it.
   - **Env validated at boot.**
     - Check `git diff v2...fork/v2 -- src/lib/env.ts src/lib/models/catalogue.ts docker-entrypoint.sh Dockerfile`.
     - A new or stricter rule can stop prod's boot. Compare it with prod's Coolify env on both resources (app and scheduler) before the merge.
     - Since 022, the env preflight stops a bad boot before any migration runs. It still stops the boot.
   - **Removed API fields.**
     - Check `git diff v2...fork/v2 -- src/app/api src/mcp src/acp`.
     - A field removed from a response breaks external MCP and ACP callers. Check each prod team's `/team` API keys and their last use before the merge.
4. **Open the PR into `v2`** and have it reviewed (`specclaw:code-reviewer`, or a human).
5. **Run the full gate on the branch:** tsc, lint, unit, `npm run build`, `npm run test:upgrade`, a full clean mock E2E, and CI green.
6. **Merge into `v2` only after the review.** `v2` → `main` still goes through the pre-merge prod checklist in [`handoff.md`](handoff.md).

---

## [fork context, superseded] CLAUDE.md "Outstanding work" entries, 2026-10-07 to 2026-10-14

These were the top entries of `CLAUDE.md`, newest first. Their relative links were written from the repo root, so a link such as `docs/handoff.md` means `handoff.md` beside this file.

### [fork context, superseded] 2026-10-14 — PICK UP HERE: 016 and 017 verified; 018 T1 WIP

- **⏸️ 2026-10-14 — PICK UP HERE: 016 and 017 are VERIFIED PASS (CI green). 018 is building: T1 is a committed WIP (`8546451b`), interrupted by a usage limit. Resume at 018 T1 FR-04, using [`reports/T1-wip.md`](.specclaw/changes/018-post-008-small-fixes/reports/T1-wip.md).** Full detail: [`docs/handoff.md`](docs/handoff.md) top section.
  - **Resume order:**
    1. Finish 018 T1: FR-04 (the draft-GET provider lookup), the AC-01 mutation proof, the targeted E2E, a `specclaw:code-reviewer` pass, then mark T1 complete.
    2. 018 T2 (Undo settle-on-state, revision-list retry), T3 (test hygiene) and T4 (gate and CI), then verify.
    3. 019 (claim token) and 020 (Create post button off the draft page). Both are approved (bounded) but **not yet planned**: run `/specclaw:plan` first.
  - **Gates at the last verified point (017, `e539395d`):** E2E 387/3/0/0; unit 2546; CI run 38436823300 green. At the 018 WIP: tsc clean, lint 0 errors, unit 2551.
  - **Process (unchanged):** one task at a time. An implementer subagent does the work, `specclaw:code-reviewer` reviews it, and the orchestrator re-runs tsc, lint and unit and commits. A full clean mock E2E and a CI check close each change. No real model calls.

### [fork context, superseded] 2026-10-13 (latest) — 016 and 017 verified; fresh start decided

- **(superseded) 2026-10-13 (latest) — 016 fresh-start cleanup VERIFIED PASS (E2E 386/3/0/0; CI green). 017 publish fixes VERIFIED PASS (E2E 387/3/0/0; CI green). The new system starts FRESH (no data import, user decision). 004 re-verified PASS at `e88b55b6` (CI green). Changes 016–020 are approved (bounded) and build one at a time: 016 fresh-start cleanup → 017 publish fixes → 018 small fixes → 019 claim token → 020 Create post button off the draft page.** Full detail: [`docs/handoff.md`](docs/handoff.md) top section.
  - **Decisions:**
    - no import or carry-over; `import-posts` is won't-fix and both scripts are deleted in 016;
    - no pre-made "Bistec" team on fresh systems;
    - the 012 and 008 rollbacks go;
    - the `copyText` alias goes;
    - the Create post button is hidden on `/drafts/[id]` (this amends 011 AC-01).
  - **⚠️ Remote `upstream` → `bistec-oss/studio` has push enabled. Never push to it; removing it waits on the user.**
  - **After 016–020:** 006, 007, 009 and 010 (proposals), plus the 005 AC-16 operator run.

### [fork context, superseded] 2026-10-13 (later) — 008 built and verified

- **(superseded) 2026-10-13 (later) — 008 model selection is BUILT 19/19 and VERIFIED PASS (32/32 gating ACs; [`verify-report.md`](.specclaw/changes/008-model-selection/verify-report.md)). CI green at `c78ce50c`. Next: the post-012/008 follow-ups (handoff "Still open after 008"); AC-32 (real Opus timings) stays optional.** Full detail: [`docs/handoff.md`](docs/handoff.md) top section; deploy, rollback and procedures in its **008 runbook** section.
  - **Gates:** wave 1 **383/3/0/0** (CI run 38304451112 green); wave 2 **391/3/0/0**, a full clean mock E2E at `b36be415`. Unit **2604/2604**, tsc clean, lint 0 errors. Every task was reviewed: no BLOCK; T1's one WARN (a refused `CLAUDE_CLI_MODEL` must still try the table default) was fixed before commit and is unit-tested.
  - **Check first:** the CI run for `b36be415` (run 38354472914, in progress when the docs were written) and for the T19 docs commit (L21).
  - **T2 passed (2026-10-13):** the pinned CLI 2.1.287 accepts all three full IDs, so `cliArg = apiId`.
  - **What 008 is now:**
    - one catalogue, `src/lib/models/catalogue.ts`: Haiku 4.5, Sonnet 5.5 and Opus 5.5, the only file in `src/` allowed a model literal;
    - one resolver, `resolveModel`: explicit pick → draft stamp → team default → system default → fallback, with the team allow-list checked at every tier;
    - `/team` → Models: allowed models, per-surface defaults, and the "Opus requires a personal token" switch;
    - stamps: `DraftCaption.model`, `Draft.headlineModel`, `Draft.designModel`, `DraftRevision.model`;
    - pickers on the wizard Review step, refine, every regenerate control and both assistant chat headers.
  - **⚠️ Deploy:** one additive migration, `20261012120000_model_selection`, applied on boot. **`CLAUDE_CLI_MODEL` is now the system default, not a global override. `default` or any value that isn't a catalogue key or a current ID fails the boot.**
  - **Optional, not a gate:** AC-32, one real Opus 5.5 Path B generation and refine in CLI mode, to measure the placeholder timeouts.

### [fork context, superseded] 2026-10-13 — 008 wave 1 built

- **(superseded) 2026-10-13 — 008 wave 1 is BUILT, REVIEWED and GREEN.** Full detail: [`docs/handoff.md`](docs/handoff.md) top section.
  - **Done:** T1 and T3–T12 are committed, each reviewed NOTE. The local full clean E2E gave **383/3/0/0** and unit 2394. **CI run 38304451112 at `d3c5685a` is green.**
  - **Open:** **T2, the operator CLI full-ID check** (the user runs it; the command is in `tasks.md` T2). T12 stays `in_progress` until `reports/T2.md` exists.
  - **Next:** wave 2, T13–T19 (the pickers), with the same one-task-at-a-time process.

### [fork context, superseded] 2026-10-12 (evening) — 008 build in progress

- **(superseded) 2026-10-12 (evening) — 008 BUILD in progress.** Full detail: [`docs/handoff.md`](docs/handoff.md) top section.
  - **Committed:** T1, T3–T6 (each reviewed) and **T7, which is UNREVIEWED.** The review was stopped to save usage; the gates were verified (unit 2285/2285).
  - **Next:**
    1. review T7, then mark it complete;
    2. T8 → T12 (the wave-1 gate);
    3. wave 2, T13–T19.
  - **T2 (operator CLI full-ID check) is waiting on the user.** The command is in `tasks.md` T2.
  - **Process:** one task at a time: an implementer subagent → `specclaw:code-reviewer` → the orchestrator re-runs tsc/lint/unit and commits. No real model calls.

### [fork context, superseded] 2026-10-12 (latest) — 008 planned

- **(superseded) 2026-10-12 (latest) — 008 is PLANNED and waiting for the user to approve the plan; then `/specclaw:build 008-model-selection`.** The earlier planner subagent died on a usage limit after writing `spec.md`; the orchestrator reviewed it and wrote `design.md` and `tasks.md`. **19 tasks in 2 waves:** wave 1 = T1–T12, shippable alone, one full E2E gate; wave 2 = T13–T19, the pickers.
  - **T2 is an operator step:** the pinned CLI 2.1.287 must accept the full model IDs. It gates the wave-1 gate (T12), not T3–T11.
  - **Read first:** `spec.md` Assumptions A1–A14 and open questions 1–4; `design.md` §5 (timeouts are placeholders; the budget unit test is the gate) and §13 (every panel finding → where it is addressed).
  - **Build order:** subagent-driven, one task at a time: an implementer, then a `specclaw:code-reviewer`, then the orchestrator commits. No real model calls.

### [fork context, superseded] 2026-10-12 (later) — 008 approved and being planned

- **⏸️ 2026-10-12 (later) — PICK UP HERE: 008 model selection is APPROVED (architectural) and was being PLANNED by a subagent when the chat was cleared. Finish the plan first.** Full detail: [`docs/handoff.md`](docs/handoff.md) top section.
  - **State at the clear:**
    - 015 verified PASS and fork CI is green.
    - 008's proposal is approved (`a1272922`), with a deep party panel (CHANGES_REQUESTED: 5 BLOCK / 23 WARN / 6 NOTE, see `party-report.md`) and all rulings recorded.
    - A planner subagent was writing `.specclaw/changes/008-model-selection/{spec,design,tasks}.md`. **These are uncommitted.**
    - **The plan lock on 008 has been held since 2026-10-12T02:53Z.**
  - **Resume:**
    1. **Check the plan files.** Run `ls .specclaw/changes/008-model-selection/`. If `spec.md`, `design.md` and `tasks.md` are all there and complete, review them against the proposal's **"Panel rulings (user, 2026-10-12)"** and **"Panel resolutions (orchestrator, 2026-10-12)"** sections, and against design.md's "Panel findings → where addressed" table.
    2. **Record the phases.** Run `specclaw-parse-tasks .specclaw/changes/008-model-selection/tasks.md`, then `specclaw-set-phase .specclaw 008-model-selection spec done`, then `design done`, then `tasks done`.
    3. **Release and commit.** Run `specclaw-change-lock .specclaw release 008-model-selection`, then commit and push to `v2`.
    4. **Get approval.** Present the plan summary, the A1… assumptions and the open questions to the user, then `/specclaw:build 008-model-selection`.
    5. **If any plan file is missing or half-written:** release the lock and re-run `/specclaw:plan 008-model-selection`. The proposal holds everything the plan needs.
  - **008 binding decisions (all in `proposal.md`):**
    - **Catalogue:** Haiku 4.5, Sonnet 5.5 and Opus 5.5, with no Fable. They are stored as **closed catalogue keys**; full API IDs appear only in stamps.
    - **Two waves.** Wave 1, independently shippable: catalogue, `resolveModel` (replacing `modelFor`/`modelForBackground`), current IDs everywhere, `TeamModelPolicy` with defaults, allow-list and the "Opus requires a personal token" switch at `/team`, and the stamps (`DraftCaption.model`, `Draft.headlineModel`, `Draft.designModel`, `DraftRevision.model`). It also covers the per-action time budget under both 15-minute sweeps, the boundary seam, the model-literal guard and `CLAUDE_CLI_MODEL` as a validated system default. Wave 2: the pickers (wizard Review, refine, every regenerate control, chat headers), the `model` body fields and the team-token notice.
    - **No per-user remembered choice.** New posts and chats pre-select the team default. Regenerate pre-selects the draft's stamp; mixed or null stamps fall to the team default.
    - **No `ScheduledGeneration` pin.**
    - **The allow-list is checked at every tier at call time.** A stored value that is no longer allowed falls to the team default, recorded as a substitution. Only an explicit request returns 400.
    - **Cost tiers** `$`/`$$`/`$$$` are computed from numeric per-MTok prices.
    - **Path A** gets Haiku and Sonnet only.
  - **Never run real model calls while planning or testing.** The pinned CLI 2.1.287's full-ID check and the Opus 5.5 timings are operator-gated tasks.

### [fork context, superseded] 2026-10-12 — fork CI green; 015 verified

- **✅ 2026-10-12 — superseded by 2026-10-12 (later) above: fork CI on `v2` is GREEN again. Change 015 (draft-page settle race) is built and VERIFIED PASS (8/8).** CI run 38195143494 passed on every job (E2E 371 passed / 3 skipped, unit, build), the first green since 013. Local full gate: 371/3/0/0.
  - **Root cause** (`/specclaw:debug`, deterministic repro): `RefinementPanel` settled a refine row, and the draft page refreshed its version list, only on an _observed_ `pendingAction` transition. A refine that finished before the post-202 refetch was served went from `null` to `null` as far as the client could see, so the row hung on "Applying…" with the input disabled and History stuck at v1. The slower runner always lost that race. This was also the old 011 "Applying…" follow-up.
  - **The fix:** settle on state, not on an edge. The panel awaits the refetch, then resolves once `pendingAction` is null, with unchanged outcome logic. The page refetches revisions whenever the current revision is missing from the list. New `tests/e2e/settle-race.test.ts` (§X) forces the race by holding the post-202 GET for 3 s, for refine and for Regenerate design. A mutation check showed each half of the fix guards its own case. `surfaces.test.ts` is untouched.
  - **User rule (2026-10-12):** all work lands directly on `v2`; no per-change PRs. The whole of `v2` goes to `main` as one PR later, on request.
  - **New small follow-up:** the `CaptionPanel`/`HeadlinePanel` undo-clear uses the same observed-edge pattern. Its only effect is a leftover Undo that restores identical text after a regenerate that fails faster than the refetch.
  - **Next after 015 verify:** the remaining post-012 follow-ups below (starting with the `import-posts` `teamId` gap; won't-fix, the script was removed by 016), then the roadmap's next planning item, **008 model selection**.

### [fork context, superseded] 2026-10-11 (later) — 012 built and verified

- **⏸️ 2026-10-11 (later) — superseded by 2026-10-12 above: 012 (per-channel captions) is BUILT 16/16 and VERIFIED PASS (28/28 gating ACs, 2026-10-12), all pushed. Next: the follow-ups below, starting with the red-CI refine race (`/specclaw:debug`).** Verify: [`verify-report.md`](.specclaw/changes/012-per-channel-captions/verify-report.md) — fresh E2E at HEAD 369/3/0/0, unit 2025, `test:render` 15/15. Full detail: [`docs/handoff.md`](docs/handoff.md) top section; deploy/backfill/rollback steps in its **012 runbook** section.
  - **Commits this session:** T8 `1f00261d`, T9 `9cf986eb`, T10 `05e8b021`, T11 `932104ec`, T12 `44b28c83`, T13 `29ed3c8e`, T14 `b522046e`, T15 `c9386ae0`, T16 `1b7186f7`.
  - **Gates** (each a full clean mock E2E after a dropped and recreated test DB): wave 1 **363/3/0/0**, wave 2 **369/3/0/0**, wave 3 **369/3/0/0** (passed/skipped/failed/flaky). Unit **2025**.
  - **User decisions this session:**
    - **(a)** MCP/ACP `publish_post` keeps FR-17: a refused caption leaves a **FAILED Post row** with the resolver's reason. The T7 review's "no row" suggestion was rejected.
    - **(b)** The red fork CI is debugged as its own change after 012.
  - **~~🔴 Fork CI on `v2` has been RED since 014 wave 1~~ — FIXED 2026-10-12 by change 015 (green at `df27ff49`).** It had been red since run 37974533639, 2026-10-09; "v2 CI is green" was true only at 013.
    - One runner-only failure: `tests/e2e/surfaces.test.ts` "Draft review (T9) at 375px" times out waiting for the refine log row "Applied", on the first attempt and the retry; it passes locally every time. Likely the already-logged refine "Applying…" race.
    - All 14 wave-1 012 cases pass in CI, including the backfill and down.sql cases.
    - **Lesson (L21):** after each push, check `gh run list --branch v2`, not just the local gate.
  - **Follow-ups after 012, each its own change:**
    1. ~~the red-CI refine race, together with the refine "Applying…" follow-up;~~ **done: change 015, CI green 2026-10-12;**
    2. ~~`import-posts.mjs` never sets `teamId`~~ (won't-fix; removed by 016), so a real import has been broken since team tenancy; `--dry-run` hides it (L22);
    3. the ACP manifest's advertised `generate_post` output schema (`src/acp/agent.ts`) lacks `headline` and `captions`;
    4. ~~`POST /api/posts` returns 201 for an immediate publish that ends FAILED;~~ fixed by 017;
    5. a per-claim token for draft actions;
    6. the floating Create post button overlapping content;
    7. small items: the trailing `---` in split sections (T3); the caption check runs before the duplicate 409 (T7/T8); per-post caption loads in the posts list GET (T7); the axe rule list copied into `captions.test.ts` should become a shared helper (T13); the 014 verify gaps 5–8;
    8. **the 005 AC-16 operator run** stays open. 🔴 Revoke the OAuth token pasted into chat on 2026-10-06 first.
  - **Gotchas:**
    - **`npm run test:e2e:db` does NOT drop the test DB** (it creates if missing, migrates, seeds). A clean gate first needs `docker exec designer-postgres-1 psql -U bistec -d postgres -c "DROP DATABASE IF EXISTS bistec_studio_test WITH (FORCE);"`.
    - **`specclaw-build setup` refuses on a stale lock** from a previous session: `specclaw-change-lock .specclaw release <change>` (`setup --force` doesn't parse).
    - **The `review-package` diff came out repo-wide (~437 KB) for T8;** point reviewers at `git diff -- <task files>`.
    - **(removed by 016)** ~~**The `captions:*` scripts use `--env-file-if-exists=.env`**~~ (so they work in CI). Locally run them only with `dotenv -e .env.test --` or an explicit `DATABASE_URL`.
    - **A dev DB without the three 012 migrations can't create drafts** with the current Prisma client: `npx prisma migrate deploy` on the dev DB before running the dev app.
    - **(removed by 016: the 012 rollback no longer exists)** ~~**Rolling back:**~~ run `prisma/rollback/012-per-channel-captions.down.sql` **before** the old image boots. It also un-records migration 3, so a later 012 redeploy re-applies it by itself and no manual roll-forward step is needed (runbook; proven by TC-CAP-13).

### [fork context, superseded] 2026-10-11 — 013 and 014 verified; 012 building

- **⏸️ 2026-10-11 (superseded by 2026-10-11 (later) above) — 013 and 014 are verified PASS; 012 (per-channel captions) is building, with T1–T7 of 16 committed. Resume at T8.** Full detail: [`docs/handoff.md`](docs/handoff.md) top section.
  - Everything is pushed to `origin/v2`.
  - **Then** resume `/specclaw:build 012-per-channel-captions` at **T8**, subagent-driven: one task at a time, an implementer then a `specclaw:code-reviewer`, and the orchestrator commits.
    - **T8:** MCP/ACP outputs. It carries two items from the T7 review: MCP `getDraft` still returns `copyText`, and MCP/ACP `publish_post` needs the up-front resolver check.
    - **T9:** the `legacyCaptionText @map("copyText")` rename.
    - **T10:** the wave-1 E2E and gate. T6 listed the E2E cases it expects to break.
    - **T11–T16:** the panels, then the wording and docs.
    - ~~Then `/specclaw:verify 012`.~~ **Done 2026-10-12: PASS.**
  - **Done since 2026-10-09:**
    - **013** fork CI is checks only: `docker-publish.yml` is deleted, Actions are ON, and `v2` CI is green.
    - **004** is PASS.
    - **014** UI a11y, shared `PageHead`/`SectionHead`/`Notice`/`FieldLabel` primitives and consistency: 18 tasks, verify PASS 21/21. The final E2E was **349/3/0/0**, with unit 1769 and `test:render` 15/15.
  - **012 binding decisions** (proposal Decisions, the panel rulings, A1–A10):
    - `DraftCaption` is keyed on `Channel`, with WHATSAPP added. A publish to a channel with no publisher fails closed.
    - A required, fenced `Draft.headline`, with a Topic fallback for migrated drafts.
    - Contracts keep their names.
    - `copyText` is preserved as `legacyCaptionText @map`, alongside the boot backfill and the lazy loader (all removed by 016).
  - **Follow-ups to propose after 012:**
    - ~~`POST /api/posts` returns 201 for a FAILED immediate publish;~~ fixed by 017;
    - a per-claim token for draft actions;
    - the floating Create post button overlapping content at some widths.
  - **Gotchas:**
    - Exactly one :3001 listener before an E2E run.
    - Never `npm run build` while `next dev` is serving.
    - Never run the caption backfill script without an explicit test-DB `DATABASE_URL` (the script was removed by 016).
    - Resume usage-limited subagents with `SendMessage`.

### [fork context, superseded] 2026-10-09 — 011 verified; main merged into v2; 013 building

- **🧭 2026-10-09 (superseded by 2026-10-11 above) — 011 verified PASS; fork `main` merged into `v2`; 013 (fork CI, checks only) is building.** Full detail: [`docs/handoff.md`](docs/handoff.md) top section.
  - **The user's decisions:**
    - **The fork runs checks only:** no GHCR push and no redeploy. `docker-publish.yml` is deleted (013 T1); the user will write their own deploy workflow later. `e2e.yml` (typecheck, lint, E2E, unit, build, `docker build .` with no push) runs on PRs and on pushes to `v2` and `main`.
    - **The 011 theme-toggle exception to FR-12 is approved.**
    - **Order: 013 → 014 → 012.**
      - **013 fork CI** (bounded) is building.
      - **014 UI accessibility / shared primitives / consistency** is approved: one change, a full E2E per wave, the shared primitive first, a static scroll-region rule.
      - **012 per-channel captions** is approved: a `DraftCaption` table, a separate on-image headline, design-only revisions, and a brief step named "Brief & Caption Direction".
  - **011 verify: PASS, 20/20.** A fresh E2E at HEAD gave 311 passed / 3 skipped / 1 flaky / 0 failed. The flake was a one-off Chromium page crash at `tests/e2e/surfaces.test.ts:521`.
  - **The merge `2506de0b`** was clean and brought 004 Phase 0. Gates on the merged tree: tsc clean, lint 0 errors, unit 1722/1722, build, full clean mock E2E **313/3/0/0**, and `auth.test.ts` 8/8 with the new `/api/health` case.
    - `/api/health` without a session returns 200 `{"ok":true,"commit":"unknown"}`; the commit is unknown because `GIT_SHA` is unset locally.
    - The `node:22-alpine` image builds, with `claude` 2.1.287, node v22.23.3 and no `EBADENGINE` warnings. **005 AC-17 re-check: PASS.**
    - **004 Phase 0:** AC-P0-3 and AC-P0-5 pass; AC-P0-1 and AC-P0-2 are superseded by 013, because the fork has no deploy target; AC-P0-4 waits on the first `v2` CI run.
  - **Local MinIO now runs silo** (`pgsty/silo:RELEASE.2026-09-16T00-00-00Z`, same volume; buckets, object counts and policies unchanged). The rollback image is `local/minio-rollback:pre-silo`.
  - **Next, in order:**
    1. **Finish 013 with T3:** push `v2` to `origin`, re-enable Actions, watch the first `v2` E2E run and record AC-P0-4. Report any runner-only failure to the user before fixing it.
    2. **Plan and build 014.**
    3. **Plan and build 012.**
    4. **The operator run of 005 AC-16:** `scripts/cli-sandbox-check.mjs` in the rebuilt image, with a real OAuth token. 🔴 Revoke the token pasted into chat on 2026-10-06 first.
    5. **Watch the `surfaces.test.ts:521` page-crash flake.**

### [fork context, superseded] 2026-10-08 — 011 built

- **🎨 2026-10-08 — 011 (app visual redesign) is BUILT: 13/13 tasks on `v2` in the fork.** Every screen is **Folio**. Full detail: [`docs/handoff.md`](docs/handoff.md) top section.
  - **The user's decisions:**
    - **Direction:** B Folio (2026-10-07).
    - **Logo:** the typeset **"Studio"** wordmark; the Bistec Studio PNG is deleted.
    - **Draft page:** no "More" menu. Export, Edit inline and the other actions stay visible buttons.
  - **Commits:** T3 `9be31d58` → T13 `c37357a3`, each implemented by a subagent, reviewed by `specclaw:code-reviewer` and committed by the orchestrator.
  - **What changed:**
    - **The legacy Frozen Light layer is gone.** `tests/unit/uiTokenGuard.test.ts` fails on any legacy class, glass utility or raw palette colour, with a `// ui-exception:` opt-out.
    - **The default font is Instrument Sans,** with Fraunces for display and JetBrains Mono for code.
  - **Gates at `c37357a3`:** unit 1722/1722, lint 0 errors, build, `test:render` 15/15, full clean mock E2E **312/3/0/0**. The suite grew by 47 (`tests/e2e/surfaces.test.ts`).
  - **Next, in order:**
    1. ~~**`/specclaw:verify 011-app-visual-redesign`.**~~ **Done 2026-10-09:** PASS, 20/20.
    2. ~~**The fork CI-fix proposal.** The user approves it; they asked for it after 011. It means guarding or removing the `docker-publish.yml` deploy job, adding `v2` to `e2e.yml`, then re-enabling Actions.~~ **Superseded 2026-10-09 by change 013:** `docker-publish.yml` is deleted, and CI is checks only.
    3. **The 011 follow-up proposal, for the user to approve.** **Approved 2026-10-09 as change 014.** Its contents are listed in the handoff:
       - an accessibility naming pass;
       - one shared page-head / section primitive replacing 8 `folio.ts` copies;
       - smaller consistency items.
    4. ~~**Merge fork `main` into `v2`.** This brings 004 Phase 0: Node 22, `/api/health`, CI hardening and MinIO → silo. Then recheck 005 AC-17 and AC-16.~~ **Done 2026-10-09 at `2506de0b`.** AC-17 passes; AC-16 still needs an operator run.
  - **~~Pre-existing bug, logged as a follow-up:~~ FIXED 2026-10-12 (change 015):** a refine row can stay on "Applying…" if the mock refine finishes before the post-202 refetch sees `pendingAction`. It was seen once.
  - **The capture tool:** `node scripts/capture-ui.mjs --out ui-captures/<name>`, against `npm run test:e2e:serve`, captures every screen. `ui-captures/` is gitignored.

### [fork context, superseded] 2026-10-07 — this repo became the fork

- **🍴 2026-10-07 — THIS REPO IS NOW THE FORK `EnderGuardian25/ai-studio` (public). Read this before any git, `gh`, CI or deploy step.** Full detail: [`docs/handoff.md`](docs/handoff.md) → "moved to the fork".
  - **The user's decision:** company development stops. All `v2` work (004, 005, 011 and the 006–010/012 proposals) continues here. **The company repo `bistec-oss/studio` is left exactly as it is.** Never push, open PRs, close PRs (draft #43 included) or delete branches there.
  - **Remotes:**
    - `origin` = the fork. Push here; `main` and `v2` track it, and **`v2` is the fork's default branch**.
    - `company` = `bistec-oss/studio`, **fetch-only**. Its push URL is deliberately `DISABLED-company-repo-is-read-only`; never "repair" it.
    - `gh repo set-default` = `EnderGuardian25/ai-studio`. In a fork, `gh pr create` and `/specclaw:pr` otherwise default the PR base to the **company** repo. If `gh` ever proposes `bistec-oss/studio`, stop.
  - **CI on the fork is checks only** (user decision 2026-10-09, change 013). `docker-publish.yml` is **deleted**, so there is no GHCR push, no Coolify redeploy and no company health poll. `e2e.yml` is the only workflow; it runs on PRs and on pushes to `v2` and `main`.
    - **Actions are re-enabled by 013 T3** (`gh api -X PUT repos/EnderGuardian25/ai-studio/actions/permissions -F enabled=true`), once 013 is pushed to `v2`. Until 013 T3 lands, Actions are off (since 2026-10-07) and the gates run locally.
    - **Never** give the fork a `COOLIFY_API_TOKEN`. A deploy workflow for the user's own target will be written fresh later.
  - **The repo is public.**
    - The 2026-10-07 audit found no real credential in the tree or in `v2` history, and everything was already public on the company repo.
    - **Never commit** secrets, `.env*` (except `.env.example`), prod IDs, customer data or tokens. Test fixtures use obvious fakes (`FAKE`, `AAAA…`).
    - `BistecStudio2026!` is the test-only seed password; it is never used outside a `*_test` DB.
  - **Company prod (`studio.bistecglobal.com`) is not ours.** The Coolify, MinIO → silo prod swap, B4, team-token and prod-test items further down are **company history and reference**, not to-dos. The fork has no deploy target yet.
  - **PR #42 was merged into company `main` on 2026-09-28** (`671ad6e9` = fork `main`). Every "merge #42 only on go-ahead" note below is stale. ~~**To do in the fork:** merge `main` into `v2`, recheck 005 AC-17 under node:22, re-run AC-16 against a rebuilt image, and close 004's Phase 0 ACs.~~ **Done 2026-10-09** (`2506de0b`), except the AC-16 operator run and AC-P0-4.
  - **Branch rule (kept):** `v2` is the integration branch. Fork `main` moves only on the user's go-ahead.

---

## [fork context, superseded] docs/handoff.md sections, 2026-10-07 to 2026-10-14

These were the top sections of `docs/handoff.md`, newest first, including the obsolete 012 runbook. The 016 and 008 runbooks stayed in the handoff. The moved sections keep their own heading levels.

## [fork context, superseded] ⏸️ 2026-10-14 — PICK UP HERE: 016 + 017 VERIFIED PASS; 018 T1 WIP committed; resume at 018 T1 FR-04

### [fork context, superseded] Where things stand

| Change                                    | State                                                                     | Evidence                                                                                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 016 fresh-start cleanup                   | ✅ **VERIFIED PASS** (12/12 ACs)                                          | E2E 386/3/0/0; CI [run 38432519271](https://github.com/EnderGuardian25/ai-studio/actions/runs/38432519271) green at `dc33c663`; [verify-report](../.specclaw/changes/016-fresh-start-cleanup/verify-report.md) |
| 017 publish API fixes                     | ✅ **VERIFIED PASS** (6/6 ACs)                                            | E2E 387/3/0/0; CI [run 38436823300](https://github.com/EnderGuardian25/ai-studio/actions/runs/38436823300) green at `e539395d`; [verify-report](../.specclaw/changes/017-publish-api-fixes/verify-report.md)   |
| 018 post-008 small fixes                  | 🔨 **building**: planned (8 FR, 8 AC, 4 tasks); **T1 is a committed WIP** | [`reports/T1-wip.md`](../.specclaw/changes/018-post-008-small-fixes/reports/T1-wip.md): FR-01–03 done and unreviewed; FR-04 not done                                                                           |
| 019 draft-action claim token              | approved (bounded), **not planned**                                       | proposal only                                                                                                                                                                                                  |
| 020 Create post button off the draft page | approved (bounded), **not planned**                                       | proposal only                                                                                                                                                                                                  |

### [fork context, superseded] Resume, in order

1. **Finish 018 T1** from `reports/T1-wip.md`:
   - FR-04: narrow the draft-GET provider lookup to `providerName` (check the other callers of `findCopyProviderRecord` first), and run it in `Promise.all` with `resolveBrandKit` and `resolveNotAppliedOutcome`. Assert the narrowed select in `draftDetailGet.test.ts`.
   - The AC-01 mutation proof for the manifest drift guard.
   - Targeted E2E: model-selection (the refine label row changed), acp and team-settings.
   - The `specclaw:code-reviewer` pass, then mark T1 complete and commit.
2. **018 T2–T4,** then `/specclaw:verify 018-post-008-small-fixes`.
3. **`/specclaw:plan` and build 019, then 020.**
4. **Then the roadmap:** 006, 007, 009 and 010 are proposals only. The 005 AC-16 operator run needs a real token.

**Gates at the 018 WIP commit:** tsc clean, lint 0 errors, unit 2551/2551. The E2E for the T1 label change has not been run yet; CI on the WIP push shows it.

**Gotcha seen this session:** `npx tsc --noEmit | tail` hides the tsc exit code. Look for `error TS` lines, or run tsc without the pipe.

### [fork context, superseded] Earlier on 2026-10-13: fresh start decided; 004 re-verified PASS; 016–020 approved

### [fork context, superseded] User decisions (2026-10-13)

- **The new system starts with fresh teams, users and data.** Nothing is imported or migrated from the company prod or the two dev machines. Data carry-over work is not proposed.
  - **Change 016 (import-posts team tenancy) was dropped mid-panel for this reason.** Its folder was never committed. The "Still open after 008" item 1 (L22) is **won't-fix**; the scripts themselves are deleted by the new 016 below.
- **Fresh-start cleanup (new 016):**
  - remove the code that only serves old data;
  - **remove the pre-made "Bistec" team on fresh systems.** Applied migration `20260721120000_team_tenancy_b` inserts it; a new migration deletes it only when it is empty, and the seeds create their own;
  - **remove the rollbacks to before 012 and 008** (both `down.sql` scripts, TC-CAP-13, TC-MODEL-12);
  - **remove the `copyText` alias** from MCP/ACP and `POST /api/generate/copy`.
- **The floating Create post button is hidden on the draft page** (new 020). This amends 011 AC-01.
- **"Fix all as per necessary":** every remaining follow-up is in 017–019.

### [fork context, superseded] 004 re-verified PASS (2026-10-13)

- Every 004 gate was re-run at `e88b55b6`, after 008, 012 and 015 landed.
  - **Local:** lint passed; unit 2604/2604; build passed; `test:render` 15/15.
  - **Fork CI [run 38385695969](https://github.com/EnderGuardian25/ai-studio/actions/runs/38385695969):** E2E 391 passed / 3 skipped; unit and build green, including the render harness and `docker build`.
  - **No Node-20 deprecation annotation.**
- `state.json` now records PASS; it still said PARTIAL from 2026-10-01. T1 (the Coolify token) stays deferred, because the fork has no Coolify pipeline (013).
- The full write-up is the last section of `.specclaw/changes/004-design-instruction-fidelity/verify-report.md`.

### [fork context, superseded] Changes 016–020: approved (all bounded), building one at a time in this order

| #   | Change                                                                                                            | What                                                                                                                                                                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 016 | [Fresh-start cleanup](../.specclaw/changes/016-fresh-start-cleanup/) (**VERIFIED PASS**; E2E 386/3/0/0, CI green) | Delete the export/import scripts and the 012 legacy caption machinery (a migration drops `copyText`, `captionMigration`, `needsReview`). Remove the copy-edit heal, two legacy guards, three one-off scripts, the 012/008 rollbacks and the `copyText` alias. No pre-made team; a zero-team dashboard for super admins. |
| 017 | [Publish API fixes](../.specclaw/changes/017-publish-api-fixes/) (**VERIFIED PASS**; E2E 387/3/0/0, CI green)     | **A failed immediate publish shows "✓ published" today:** return 502 with the reason (also on Retry). Duplicate check before the caption check. A batch caption load for the posts list.                                                                                                                                |
| 018 | [Post-008 small fixes](../.specclaw/changes/018-post-008-small-fixes/) (building; T1 WIP)                         | ACP manifest output; the `/team` refine label; stale comments; the draft-GET provider lookup; caption/headline Undo settle-on-state; revision-list retry; the shared axe helper; TC-MODEL-14 caption pick; 014 gaps 5, 7 and 8.                                                                                         |
| 019 | [Draft-action claim token](../.specclaw/changes/019-draft-action-claim-token/)                                    | `Draft.pendingActionClaimId`, so a run swept as stuck can't settle or overwrite a newer run's claim. Additive migration plus a down script.                                                                                                                                                                             |
| 020 | [Create post button off the draft page](../.specclaw/changes/020-create-post-button-draft-page/)                  | It covered the refine Send button.                                                                                                                                                                                                                                                                                      |

- **016 goes first,** because 017–019 edit the caption code it simplifies.
- **The party panel was skipped for all five** (no explicit approval this time).
- **Not in any change:**
  - 014 gap 6, the placeholders, which is a product call;
  - the duplicate-publish check-then-act race;
  - the 005 AC-16 operator run, which needs a real token. 🔴 Revoke the one pasted on 2026-10-06 first.
- **After 016–020, the remaining roadmap is the four unbuilt proposals:**
  - 006 product observability;
  - 007 brand-kit design system;
  - 009 hero imagery;
  - 010 WhatsApp Channel posting.
- **⚠️ Remotes:** a second remote, `upstream`, points at the company repo with **push enabled**. Removing it is waiting on the user's go-ahead. Never push to it.

---

## [fork context, superseded] ⏸️ 2026-10-13 (later) — superseded by 2026-10-13 (latest) above: 008 model selection is BUILT 19/19 and VERIFIED PASS

Both waves are committed and pushed to `v2`. Every task has a report in `.specclaw/changes/008-model-selection/reports/` and a review in `reviews/`; no review raised a BLOCK, and T1's one WARN was fixed before commit. T2, the operator check, passed. The deploy, rollback, `CLAUDE_CLI_MODEL` and procedure notes are in the **008 runbook** section just below.

### [fork context, superseded] Commits

| Task | Commit                 | What                                                                                                                                                         |
| ---- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T1   | `0295a53c`             | The catalogue (`src/lib/models/catalogue.ts`) and the pure resolver (`resolve.ts`, `policyRules.ts`)                                                         |
| T2   | `b8c84ae0`, `677d2e19` | **Operator:** the pinned CLI 2.1.287 accepts all three full model IDs (PASS)                                                                                 |
| T3   | `628b6179`             | Schema, migration `20261012120000_model_selection`, the down script, `CLAUDE_CLI_MODEL` validation                                                           |
| T4   | `8d5b66c1`             | `resolveModel`, the team policy store, `GET/PUT /api/team/model-policy`, `GET /api/models`                                                                   |
| T5   | `b43c4a64`             | The boundary: the CLI takes a `ResolvedModel`, `createMessage`, the recorder, the usage-limit classifier, `/api/test/model-calls`                            |
| T6   | `198a64d9`             | Generation on the resolver, with the caption, headline and design stamps                                                                                     |
| T7   | `19a6ba22`, `5d4386ed` | regenerate-copy, regenerate-design, refine and the verifier on the resolver, and every remaining stamp writer                                                |
| T8   | `004153ab`             | The assistants, image → template, the voice draft and the token ping on the resolver                                                                         |
| T9   | `1c02c90b`             | The per-action time budget, the heartbeats, scheduler lease renewal, the usage-limit `errorReason` and the 120 s image timeout                               |
| T10  | `ddc3e9db`             | The boundary closed: `model` required, `modelFor` / `modelForBackground` / `pinModel` / `VERIFIER_MODEL` deleted, the literal guard, `modelBoundary.test.ts` |
| T11  | `73765983`             | `/team` → Models                                                                                                                                             |
| T12  | `d3c5685a`             | Wave-1 E2E §Y (TC-MODEL-01…12), the AC-23 round trip, export/import carry the stamps; **wave-1 gate**                                                        |
| T13  | `95a9ab26`             | The `model` body fields, the `Brief` initial request, and spec open question 1 (a caption pick needs a Claude caption provider)                              |
| T14  | `57f5dfa7`             | The shared `ModelPicker`, `useModels()` and the pure picker helpers                                                                                          |
| T15  | `8c164a6a`             | The brief wizard's Review step pickers                                                                                                                       |
| T16  | `f886db89`             | The draft page pickers and "Generated with"                                                                                                                  |
| T17  | `92ae2854`             | The assistant chat header pickers and the team-token notice                                                                                                  |
| T18  | `b36be415`             | Wave-2 E2E §Y (TC-MODEL-13…20); **wave-2 gate**                                                                                                              |
| T19  | (this commit)          | Docs: this handoff and runbook, CLAUDE.md, ROADMAP, the MCP/ACP guide, DESIGN_SYSTEM §8.19, the e2e plan's status lines                                      |

### [fork context, superseded] Gates

- **Wave 1:** a full clean mock E2E after DROP, `test:e2e:db` and `rm -rf .next` gave **383 passed / 3 skipped / 0 failed / 0 flaky**. CI run 38304451112 at `d3c5685a` was green (E2E 383/3, unit, build, render 15/15).
- **Wave 2:** the same procedure gave **391 passed / 3 skipped / 0 failed / 0 flaky** (9.0 min). The 3 skips are the intentional TC-REG-H11a/b/c.
- **Unit: 2604/2604** (93 files), in the machine's CLI mode and in forced API mode. tsc is clean; lint has 0 errors and the 7 pre-existing warnings.
- **CI for `b36be415`:** run 38354472914 was still in progress when T19 was written. **Check it** (`gh run list --branch v2 --repo EnderGuardian25/ai-studio`) before calling wave 2 green on CI (L21).

### [fork context, superseded] Do this next, in order

1. ~~**Confirm the CI run for `b36be415` (and for the T19 commit) is green.**~~ **Done:** runs 38354472914 and 38355582519 both green.
2. ~~**`/specclaw:verify 008-model-selection`.**~~ **Done 2026-10-13: PASS, 32/32 gating ACs** ([`verify-report.md`](../.specclaw/changes/008-model-selection/verify-report.md); 7 non-blocking gaps listed there). Wave 1 ACs AC-01 … AC-24, wave 2 ACs AC-25 … AC-33. AC-14 is T2's report. AC-32 is optional and not a gate (see the runbook).
3. **Then the follow-ups below,** each its own change.

### [fork context, superseded] Rulings and facts from wave 2 (keep them)

- **T13, spec open question 1 is built as its recommended default.** A `model` pick on a caption (`POST /api/briefs` `captionModel`, every `regenerate-copy` form) returns **400 `MODEL_NOT_ALLOWED`** "This team's caption provider is not Claude, so the caption model can't be chosen" when the caption provider is OpenAI. "Is Claude" is read from the registered row: `cli` and `anthropic` are Claude, `openai` is not, no row is Claude, and an unknown name counts as Claude. The draft GET carries `captionProviderIsClaude` for **that draft's** provider, so the caption pickers hide exactly when the server would refuse.
- **T13, error shapes.** A refused **explicit** pick is a 400 `{ error, code: 'MODEL_NOT_ALLOWED' }`, before any claim; `POST /api/briefs` adds `field`. With **no** pick, a resolution failure keeps the wave-1 answer: 422 `{ code, message }` on refine, regenerate-design and the two chats, 422 `COPY_ERROR` on regenerate-copy.
- **T13, `regenerate-design` now reads a strict body:** `{}` or `{ model }`; anything else is 400 "Send {} or { model }". An empty body is still valid.
- **T14, the picker resets a stale pick by itself** (a model unticked at `/team`, the switch turned on, or a path change to template fill), so a client never sends a key the server would refuse.
- **T15, `apiFetch` throws `ApiError`,** which carries `status`, `code` and `field`. `message` and `instanceof Error` are unchanged for existing callers.
- **T16, the "Regenerate all" picker is labelled "All captions model".** "Generated with" is hidden for a FAILED caption row and on a FAILED draft.
- **T17, the chat picker** is the first strip under each assistant drawer's title bar. The pick lasts for the open chat and resets on reload.

### [fork context, superseded] Still open after 008 (each its own change)

1. ~~**`import-posts.mjs` never sets `teamId` (L22).**~~ **Won't fix (2026-10-13): fresh start, no import; the scripts are deleted in 016.** A real import has been broken since team tenancy, and `--dry-run` hides it. 008 T12 made the scripts carry the stamps but did not fix this.
2. ~~**The ACP manifest's `generate_post` output schema** is missing `headline` and `captions`.~~ **Fixed by 018 FR-01 (2026-10-18):** the manifest lists both, and a unit drift guard compares it with the handler.
3. ~~**`POST /api/posts` returns 201 for an immediate publish that ends FAILED.**~~ **Fixed by 017 (2026-10-13): 502 `PUBLISH_FAILED`; the dialog shows ✕ failed and stays open.**
4. **A per-claim token for draft actions.**
5. **The floating Create post button overlaps content** at some widths.
6. ~~**The caption/headline undo-clear uses the observed-edge pattern** (a 015 follow-up).~~ **Fixed by 018 FR-05 (2026-10-18):** `CaptionPanel` and `HeadlinePanel` use the armed `settleArmed` settle; TC-RACE-03/04.
7. ~~**The 015 revision-list guard doesn't retry after a transient `fetchRevisions` failure.**~~ **Fixed by 018 FR-06 (2026-10-18):** retries after 2, 4 and 8 s; TC-RACE-05.
8. ~~**Small 008 items:**~~ **All fixed by 018 (2026-10-18):**
   - ~~`/team` → Models names refine's "System default" for Path B only; Path A drafts refine on Haiku (T11);~~ FR-02, the dual label;
   - ~~the "Known edge case" comment in `claudeCli.ts` lost the function it described (T10);~~ FR-03;
   - ~~`src/mcp/tools/generate.ts` still has a comment about "per-path models", which the catalogue replaced;~~ FR-03;
   - ~~the axe rule list is now copied into `captions.test.ts` and `model-selection.test.ts`; make it a shared helper;~~ FR-07, `tests/helpers/axe.ts`;
   - ~~the draft poll makes one extra `copyProviderIsClaude` lookup per GET (T16).~~ FR-04, a narrowed select in `Promise.all`.
   - Also closed by 018 FR-07: TC-MODEL-14 now picks Sonnet for Caption (008 verify gap 4), and the wave-2 `afterEach` no longer throws when `beforeEach` skipped (gap 6b).
9. **Small 012/014 items:** the trailing `---` in split sections; the caption check runs before the duplicate-post 409; per-post caption loads in the posts list; the 014 verify gaps 5–8. **The 014 gaps 5, 7 and 8 are fixed by 018 FR-07/FR-08 (2026-10-18)** (`EYEBROW` in `BriefingAssistantPanel`, the digit-suffixed token guard plus logged axe `incomplete` results, and `COMPACT_TEXTAREA` in §8.18). Gap 6 (the placeholders) is left as a product call.
10. **The 005 AC-16 operator run.** 🔴 Revoke the OAuth token pasted into chat on 2026-10-06 first.

---

## [fork context, superseded] (superseded) 2026-10-13 — 008 WAVE 1 is built, reviewed and green (local and CI). Only T2 (operator) is open, then wave 2

Every wave-1 task except T2 is committed, reviewed and pushed. No review raised a BLOCK; T1's WARN was fixed before commit and every other review was NOTE. T12 stays `in_progress` until T2's report exists.

| Task                                                                                            | Review                                                               | Commit                         |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------ |
| T7 draft actions on the resolver                                                                | NOTE (4)                                                             | `19a6ba22` + review `5d4386ed` |
| T8 assistants, image → template, voice draft, token ping                                        | NOTE                                                                 | `004153ab`                     |
| T9 action budget, heartbeats, scheduler lease renewal, usage-limit `errorReason`, image timeout | NOTE (3)                                                             | `1c02c90b`                     |
| T10 boundary closed, literal guard, `modelBoundary.test.ts`                                     | NOTE (3)                                                             | `ddc3e9db`                     |
| T11 `/team` → Models                                                                            | NOTE (3); the orchestrator fixed note 1 (`cliMode` from `view.mode`) | `73765983`                     |
| T12 wave-1 E2E §Y (TC-MODEL-01…12), AC-23 round trip, export/import stamps                      | NOTE (3)                                                             | `d3c5685a`                     |

**Wave-1 gate:**

- **Local:** the orchestrator ran a full clean mock E2E after DROP, `test:e2e:db` and `rm -rf .next`: **383 passed / 3 skipped / 0 failed / 0 flaky**. Unit is 2394/2394 in CLI and API mode; tsc is clean; lint has 0 errors.
- **CI:** run 38304451112 at `d3c5685a` is **green**: E2E 383/3, unit, build, render 15/15.
- **The T11 commit's own CI run was red** because of the /team Save-count ripple that T12 fixed. HEAD is green.

### [fork context, superseded] Resume, in order

1. **T2 (the user runs it).**
   - The command is in `tasks.md` T2. Paste its output into `reports/T2.md`.
   - **If an ID is rejected,** that catalogue entry's `cliArg` becomes its alias. `scripts/cli-sandbox-check.mjs` `VISION_MODEL` follows it; its drift test pins it.
   - Then mark T12 complete with `specclaw-update-task-status … T12 complete`.
2. **Wave 2, T13 → T19.** Same process: an implementer, then `specclaw:code-reviewer`, then the orchestrator re-gates and commits, one task at a time. The full clean E2E runs at T18.

### [fork context, superseded] Rulings and facts from 2026-10-13 (keep them)

- **T8, model resolution:** an assistant entry point whose model can't be resolved returns **422 `{code, message}`**. Before, it returned a generic 500. T13 will map an _explicit-request_ miss to 400 via `AssistantModelError.code`.
- **T8, voice routes:** the two brand-voice routes are now wrapped in `withClaudeAuth`, because the voice draft now has a CLI path.
- **T8, token ping:** its MOCK branch records mode `cli`.
- **T9, the tightest budget segment** is the scheduler's renew-before-design → complete: 830 s plus the 60 s margin is 890 s, against the 900 s lease. If a real Opus run nears 600 s, lower Opus `DESIGN_FREEFORM` first.
- **T9, refine** also touches before `recordRejectedRender`.
- **T9, accepted:** a DB error on a heartbeat or lease renewal fails the generation, or sends the entry to retry.
- **T10, the literal guard** allows model literals only in `src/lib/models/catalogue.ts`; ALL-CAPS keys are exempt.
- **T10, `CLAUDE_CLI_MODEL`** is read at runtime only in `policy.ts`, as the system default.
- **T10, cosmetic:** the "Known edge case" comment in `claudeCli.ts` (~403) lost the function it described. Re-anchor it some time.
- **T11:** unticking a model resets the defaults that named it. Refine's "System default" label names only Path B's model.
- **T12, test isolation:** §Y resets the team model-policy row before and after every case.
- **T12, export manifest:** it stays at v2, because the change is additive.
- **T12, AC-23:** the in-suite case uses a migrate-deployed scratch DB, because `TEMPLATE` is refused while the server is connected. The literal `TEMPLATE` run is recorded in `reports/T12.md`.
- **Wave-2 UI (from the T7 review):** a FAILED caption row may keep an old stamp, so hide the stamp when the row is FAILED.
- **Gotchas:** start Docker Desktop before the E2E gate. `pgrep` doesn't exist in this Git Bash.

## [fork context, superseded] (superseded) 2026-10-12 (evening) — 008 BUILD in progress — wave 1, T1–T7 committed (T7 UNREVIEWED); next: review T7, then T8

The session stopped to save usage. The user approved the plan ("continue") and the build is running `/specclaw:build 008-model-selection` subagent-driven, ONE task at a time: implementer subagent → `specclaw:code-reviewer` → the orchestrator re-runs the gates and commits (`specclaw-build commit`).

### [fork context, superseded] State

| Task                                                                                                              | State                                                                                                                                        | Commit     |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| T1 catalogue + pure resolver                                                                                      | ✅ reviewed (WARN fixed), committed                                                                                                          | `0295a53c` |
| T2 **operator** CLI full-ID check                                                                                 | ⏳ **waiting on the user** — the command is in tasks.md T2                                                                                   | —          |
| T3 schema, migration, rollback, `CLAUDE_CLI_MODEL` validation                                                     | ✅ reviewed NOTE, committed                                                                                                                  | `628b6179` |
| T4 server resolver, policy store, `/api/team/model-policy` + `/api/models`                                        | ✅ reviewed NOTE, committed                                                                                                                  | `8d5b66c1` |
| T5 the boundary (CLI `ResolvedModel`, `createMessage`, recorder, usage-limit classifier, `/api/test/model-calls`) | ✅ reviewed NOTE, committed                                                                                                                  | `b43c4a64` |
| T6 generation on the resolver + caption/headline/design stamps                                                    | ✅ reviewed NOTE, committed                                                                                                                  | `198a64d9` |
| T7 draft actions on the resolver + every remaining stamp writer                                                   | ⚠️ **committed UNREVIEWED** (gates verified by the orchestrator: tsc clean, lint 0 errors, unit 2285/2285); status `in_progress` in tasks.md | `19a6ba22` |
| T8–T12                                                                                                            | not started                                                                                                                                  | —          |
| T13–T19 (wave 2)                                                                                                  | not started                                                                                                                                  | —          |

### [fork context, superseded] Resume, in order

1. **Review T7.** Spawn `specclaw:code-reviewer` on the T7 commit (`git show 19a6ba22 --stat`, then per-file diffs). The review brief to reuse is in this session's history; its focus list: resolve-before-claim on every route; FR-09 stamp tiers; FR-08 stamp rules (a failed regenerate field KEEPS its old stamp; error/sweep settles never touch stamps; retry clears `headlineModel*`; refine commit / rejected render / Override / inline-edit / restore / adopt); verifier on `INTERNAL_VERIFIER`; no response-shape regressions. Write `reviews/T7.md`. On PASS/NOTE/WARN: `specclaw-update-task-status .specclaw/changes/008-model-selection/tasks.md T7 complete`, commit the review. On BLOCK: fix, re-gate, then complete.
2. **Continue with T8** (assistants, image → template, voice draft through `runBriefingModel`, token ping on `INTERNAL_TOKEN_PING`), then T9 (budget + heartbeats + scheduler lease renewal + usage-limit `errorReason` + OpenAI image timeout), T10 (close the boundary + literal guard + `modelBoundary.test.ts`), T11 (`/team` → Models), T12 (wave-1 E2E + AC-23 round trip + gate). Read each task's entry in `tasks.md` — several gained notes during the build (T7 "Retry", T10's file list now includes `designAgent.ts`, `agent/types.ts`, `drafts/refineAttempt.ts`).
3. **T2** (the user runs it): the ready-to-paste bash is in `tasks.md` T2. Record the output in `reports/T2.md`. If an ID is rejected, that catalogue entry's `cliArg` becomes its alias. **The wave-1 gate (T12) can't be called passed without it.**

### [fork context, superseded] Rulings made during the build (keep them)

- **T1:** a team-refused `CLAUDE_CLI_MODEL` records the substitution, then tries the surface's TABLE default, then the fallback (so env `opus` on a team without Opus gives Sonnet on freeform, not Haiku).
- **T6:** a stored `Brief.captionModel`/`designModel` is a `storedRequest` tier: checked against the effective set, a miss falls through as a substitution, never a 400 or a throw.
- **T6/T7:** generation/retry write an explicit null stamp on a FAILED caption row; a REGENERATE's failed field keeps the row's previous stamp (012 A7).
- **T7:** refine's model-resolution failure is a 422 `{code, message}` before the claim (regenerate-design's shape); regenerate-copy keeps its 422 `COPY_ERROR`.

### [fork context, superseded] Gotchas found during the build

- **Unit-test mode depends on the machine:** importing `@prisma/client` loads the local `.env` (`DESIGN_PROVIDER=cli` here); CI has no `.env`. New tests must fake `teamModelPolicy` and `userClaudeToken` so they pass in both modes; implementers ran the suite in both.
- **After T3 the Prisma client selects the new columns:** run `npx prisma migrate deploy` on the dev DB before using the dev app. The test DB gets it at the wave gate (drop + `npm run test:e2e:db`).
- **Usage limits:** Sonnet's weekly limit was exhausted on 2026-10-12 (resets 10:30 Colombo). Reviews can run on Opus (`model: opus` on the Agent call).
- **Build interim states (expected until T10):** the CLI boundary still accepts a plain string model; `claudeCli.ts` still reads `CLAUDE_CLI_MODEL` on that string path; the refine runners accept `ResolvedModel | string`. T10 deletes all of it, and its literal guard + `tsc` prove nothing was missed.

## [fork context, superseded] (superseded) 2026-10-12 (latest) — 008 is PLANNED (spec/design/tasks committed). Get the user to approve the plan, then `/specclaw:build 008-model-selection`

- **The plan:** 19 tasks in 2 waves. Wave 1 is T1–T12: the foundation, shippable on its own, with one full E2E gate at T12. Wave 2 is T13–T19: the pickers and docs.
- **T2 is operator-gated:** the CLI full-ID check. The ready-to-paste command is in tasks.md.
- **Spec:** assumptions A1–A14 and open questions 1–4, each with a recommended default.
- **Design:** §13 maps every upheld panel finding to where it is addressed. One finding is explicitly declined: a separate `CLAUDE_MODEL_ALLOW` operator ceiling.
- **History:** the 2026-10-12 planner subagent hit a usage limit after writing `spec.md`. The orchestrator reviewed `spec.md` against the code survey and wrote `design.md` and `tasks.md`.

## [fork context, superseded] (superseded) 2026-10-12 (later) — 008 is approved; finish its plan (a planner subagent was mid-run at the clear)

### [fork context, superseded] State

| Change                                  | State                                                     | Evidence                                                                                                                                                                                         |
| --------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **012** per-channel captions            | ✅ verified PASS, 28/28                                   | `.specclaw/changes/012-per-channel-captions/verify-report.md`                                                                                                                                    |
| **015** draft-page settle race (red CI) | ✅ verified PASS, 8/8                                     | `.specclaw/changes/015-draft-action-settle-race/verify-report.md`. CI run 38195143494 at `df27ff49` passed every job (E2E 371/3, unit, build). It was the first green `v2` run since 2026-10-09. |
| **008** model selection                 | 📝 **approved (architectural); planning was in progress** | `proposal.md` (with **Panel rulings** and **Panel resolutions**) and `party-report.md` (deep, CHANGES_REQUESTED: 5 BLOCK / 23 WARN / 6 NOTE upheld, 1 withdrawn). Committed at `a1272922`.       |

**At the clear:**

- A planner subagent was writing `.specclaw/changes/008-model-selection/spec.md`, `design.md` and `tasks.md`. **These are uncommitted.**
- The specclaw **plan lock** on 008 has been held since **2026-10-12T02:53Z**. It goes stale after 120 minutes.

### [fork context, superseded] Resume, in order

1. **Check the planner's output.** Run `ls .specclaw/changes/008-model-selection/`.
   - **All three files present and complete:** review them. Check them against the proposal's two ruling sections, the design.md "Panel findings → where addressed" table (every upheld finding must be addressed or explicitly declined), and the task format, which `specclaw-parse-tasks` must parse with files, depends, estimate and kind. Fix gaps.
     - Then run `specclaw-set-phase .specclaw 008-model-selection spec done`, then `design done`, then `tasks done`.
     - Then `specclaw-change-lock .specclaw release 008-model-selection`.
     - Commit and push to `v2`.
   - **Missing or half-written:** run `specclaw-change-lock .specclaw release 008-model-selection`, then re-run `/specclaw:plan 008-model-selection`. The proposal holds every input; the planner brief is described below.
2. **Present the plan to the user** for approval: the FR/AC/task counts, the A1… assumptions, the open questions and the pricing used. Then run `/specclaw:build 008-model-selection` subagent-driven: implementer → `specclaw:code-reviewer` → the orchestrator commits, one task at a time, with a full clean mock E2E per wave.

### [fork context, superseded] What the 008 planner was told (re-use it if planning must be re-run)

- **The proposal's "Panel rulings" and "Panel resolutions" sections are binding** and override the older Proposed Solution text.
- **Survey every model call site in the current code**, because the line numbers have drifted since 2026-09-23. Grep for every model literal in `src`.
- **Pricing comes from the `claude-api` skill, not memory:** numeric per-MTok prices plus a dated source, with the tier derived from them.
- **Do NOT run any real model call.**
  - The pinned CLI 2.1.287's full-model-ID acceptance becomes an operator-gated wave-1 task, with a fallback to aliases.
  - Opus 5.5 timeouts are measured placeholders, with the per-action budget unit test as the hard gate.
- **Format:** copy 012's tasks.md exactly (plain `- Files:` keys) and its per-task and per-wave gate Summary.
- **Migrations:** hand-written SQL with a `prisma/rollback/` file that also un-records the migration (lesson L24).
- **Plan a mock seam** so the E2E can see the resolved model.

### [fork context, superseded] 008 decisions (summary; the authority is `proposal.md`)

- **Catalogue:** Haiku 4.5, Sonnet 5.5 and Opus 5.5; no Fable. Choices are stored as **closed catalogue keys**; full API IDs appear only in the "what ran" stamps.
- **Two waves inside 008.**
  - **Wave 1** (the foundation, shippable on its own): the catalogue; `resolveModel` replacing `modelFor`/`modelForBackground`; current IDs on every call site, `voiceDraft.ts` included; internal surfaces (background, verifier, token ping) plus a model-literal guard test; `TeamModelPolicy` (team defaults, the allow-list, and the "Opus requires a personal token" switch) at `/team`; the stamps `DraftCaption.model`, `Draft.headlineModel`, `Draft.designModel` and `DraftRevision.model`; `Brief` fields meaning only the initial request; a per-action time budget kept under both 15-minute sweeps; a boundary seam recording the model passed in; and `CLAUDE_CLI_MODEL` as a validated system default (a boot error if it isn't a catalogue value, plus a boot log).
  - **Wave 2:** the pickers (the brief wizard Review step, refine, every regenerate control on the caption panels, the headline and design regenerate, and the assistant chat headers), the `model` body fields on `regenerate-copy` (all three forms) and `regenerate-design`, and the team-token notice.
- **Defaults:**
  - There is no per-user remembered choice. New posts and chats pre-select the team default.
  - Regenerate pre-selects the draft's stamp. Mixed or null stamps fall back to the team default.
  - There is no `ScheduledGeneration` pin: scheduled, MCP and ACP runs use the team default.
- **Allow-list:** checked at every tier, at call time. A stored value that is disallowed or retired falls back to the team default, then the system default, and is recorded as a substitution. Only an explicit request returns 400. `/team` rejects a policy that leaves any surface with no model.
- **UI and errors:**
  - Cost tiers `$`/`$$`/`$$$`.
  - Path A gets Haiku and Sonnet only.
  - The team-token notice shows when Opus would run on the team token.
  - Scheduled runs label usage-limit failures explicitly in `errorReason`.

### [fork context, superseded] Still open after 008 (each its own change)

1. ~~**`import-posts.mjs` never sets `teamId` (L22).**~~ **Won't fix (2026-10-13): fresh start, no import; the scripts are deleted in 016.** A real import has been broken since team tenancy, and `--dry-run` hides it.
2. ~~**The ACP manifest's `generate_post` output schema** is missing `headline` and `captions`.~~ **Fixed by 018 FR-01 (2026-10-18).**
3. ~~**`POST /api/posts` returns 201 for an immediate publish that ends FAILED.**~~ **Fixed by 017 (2026-10-13): 502 `PUBLISH_FAILED`; the dialog shows ✕ failed and stays open.**
4. **A per-claim token for draft actions.**
5. **The floating Create post button overlaps content** at some widths.
6. ~~**The caption/headline undo-clear uses the observed-edge pattern** (a 015 follow-up). After a fast failed regenerate, an Undo can linger that restores identical text.~~ **Fixed by 018 FR-05 (2026-10-18):** an armed settle; TC-RACE-03/04.
7. ~~**The 015 revision-list guard doesn't retry after a transient `fetchRevisions` failure.**~~ **Fixed by 018 FR-06 (2026-10-18):** 2/4/8 s backoff; TC-RACE-05.
8. **Small items:** the trailing `---` in split sections (012 T3); the caption check runs before the duplicate-post 409 (012 T7/T8); per-post caption loads in the posts list (012 T7); ~~the axe rule list copied into `captions.test.ts` (012 T13)~~ (fixed by 018 FR-07, `tests/helpers/axe.ts`); the 014 verify gaps 5–8 (**5, 7 and 8 fixed by 018**; gap 6 is left as a product call).
9. **The 005 AC-16 operator run.** 🔴 Revoke the OAuth token pasted into chat on 2026-10-06 first.

### [fork context, superseded] Rules and gotchas in force

- **All work lands directly on `v2`.** No per-change PRs (user, 2026-10-12). The whole of `v2` goes to `main` in one PR later, and only on request.
- **After every push, check `gh run list --branch v2 --repo EnderGuardian25/ai-studio`,** not just the local gate (L21).
- **`npm run test:e2e:db` does not drop the test DB.** For a clean gate, first run `docker exec designer-postgres-1 psql -U bistec -d postgres -c "DROP DATABASE IF EXISTS bistec_studio_test WITH (FORCE);"`, then `rm -rf .next`, then the setup, then exactly one fresh :3001 server.
- **Never run `npm run build`** (or `specclaw-build finalize` / `specclaw-verify collect`) **while `next dev` is serving.** Afterwards, run `rm -rf .next` and `git checkout -- next-env.d.ts`.
- **A stale specclaw lock** blocks `setup`. Clear it with `specclaw-change-lock .specclaw release <change>`; `setup --force` doesn't parse.
- **Never settle async UI on an observed edge of polled state** (L25). Arm it after an awaited refetch instead. To force a race in E2E, delay the refetch with `page.route`.

---

## [fork context, superseded] ⏸️ 2026-10-11 (later) — superseded by 2026-10-12 (later) above (kept for history): 012 is BUILT 16/16 and VERIFIED PASS (2026-10-12); fork CI on `v2` was red, ✅ GREEN since 015 (2026-10-12)

**012 per-channel captions is built: 16 of 16 tasks, all on `origin/v2`.** The next step is **`/specclaw:verify 012-per-channel-captions`**. Every task has a report and a review in `.specclaw/changes/012-per-channel-captions/reports/` and `reviews/`. The deploy, backfill and rollback steps are in the **012 runbook** section just below.

### [fork context, superseded] Commits this session

| Task | Commit     | What                                                                                                                                                                      |
| ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T8   | `1f00261d` | MCP `get_draft` / `generate_post` and `POST /api/generate/copy` return `headline` and `captions`; `copyText` stays as the deprecated alias (the Instagram text)           |
| T9   | `9cf986eb` | `legacyCaptionText @map("copyText")` (migration `20261011140000_legacy_caption_text`), no placeholder writes, the read-only guard, native fixture seed, the rollback file |
| T10  | `05e8b021` | §W captions E2E suite (TC-CAP-01…14) and the existing-case edits; **wave-1 gate**                                                                                         |
| T11  | `932104ec` | Per-channel regenerate, the headline panel, per-panel Undo, Copy to clipboard                                                                                             |
| T12  | `44b28c83` | The review / last-failed notices, the WhatsApp helper and guide, the counters                                                                                             |
| T13  | `29ed3c8e` | §W wave-2 panel cases (TC-CAP-15…20); **wave-2 gate**                                                                                                                     |
| T14  | `b522046e` | "copy" → "caption" in the remaining UI strings and the wording guard; **wave-3 gate**                                                                                     |
| T15  | `c9386ae0` | `export-posts` / `import-posts` carry captions, the headline and `captionMigration` (manifest v2; v1 bundles still import). Scripts removed by 016                        |
| T16  | `1b7186f7` | Docs: this handoff, the runbook, CLAUDE.md, ROADMAP, 008/010 proposals, e2e plan §W, MCP/ACP guide, DESIGN_SYSTEM §8.14                                                   |

### [fork context, superseded] Gates

- **Each wave gate was a full clean mock E2E after a dropped and recreated test DB:** wave 1 **363 passed / 3 skipped / 0 failed / 0 flaky**; wave 2 **369/3/0/0**; wave 3 **369/3/0/0**. The 3 skips are the intentional TC-REG-H11a/b/c.
- **Unit: 2025/2025** (74 files). tsc clean; lint 0 errors, the 7 pre-existing warnings.

### [fork context, superseded] The user's decisions this session

- **(a) MCP/ACP `publish_post` keeps FR-17:** a refused caption leaves a **FAILED Post row** with the resolver's reason, so "every attempt leaves a row" still holds. The T7 review's suggestion of an up-front, no-row refusal was **rejected** (an interim T8 version had it and was reverted). Only a non-publishable channel (WhatsApp) is rejected up front, before any row.
- **(b) The red fork CI is debugged as its own change after 012** (below).

### [fork context, superseded] ✅ Fork CI on `v2`: red since 014 wave 1, FIXED by change 015 (green 2026-10-12)

- **Fixed by change 015** (`.specclaw/changes/015-draft-action-settle-race/`). Run 38195143494 at `df27ff49` passed on every job: E2E 371 passed / 3 skipped, unit, build.
- **Root cause:** `RefinementPanel` settled a refine row, and the draft page refreshed its version list, only on an _observed_ `pendingAction` transition. A refine that finished before the post-202 refetch was served went from `null` to `null` as far as the client could see. The row then hung on "Applying…", and the version list stayed at v1.
- **The fix:** settle on state, not on an observed edge. The panel awaits the refetch, then resolves once `pendingAction` is `null`; the page refetches revisions whenever the current revision is missing from the list.
- **The test:** `tests/e2e/settle-race.test.ts` (§X) forces the race. `surfaces.test.ts` is untouched.
- **Leftover (small follow-up):** the caption and headline undo-clear uses the same edge pattern. Its only effect is a leftover Undo that restores identical text after a regenerate that fails faster than the refetch. **Fixed by 018 FR-05 (2026-10-18).**

The original finding:

- **Since run 37974533639 (2026-10-09).** The earlier "v2 CI is green" was true only at 013.
- **One runner-only failure:** `tests/e2e/surfaces.test.ts`, "Draft review (T9) at 375px". It times out waiting for the refine log row "Applied", on the first attempt and the retry. It passes locally every time.
- **Likely cause:** the already-logged refine "Applying…" race, made deterministic by the slower runner.
- **All 14 wave-1 012 cases pass in CI,** including the backfill (TC-CAP-12) and the down.sql (TC-CAP-13) cases.
- **Lesson (learning L21):** after each push, check `gh run list --branch v2`, not just the local gate.

### [fork context, superseded] Do this next, in order

1. ~~**`/specclaw:verify 012-per-channel-captions`.**~~ **Done 2026-10-12: PASS, 28/28 gating ACs** (`.specclaw/changes/012-per-channel-captions/verify-report.md`). A fresh full mock E2E at HEAD `3d645899` gave 369/3/0/0, unit 2025/2025, lint 0 errors, build, `test:render` 15/15. Gaps noted but not blocking: AC-25 points 2–3 rest on code plus the static guard, not a running test; AC-03 "discarded text logged" is proven in two halves; AC-29 (optional operator live check) not run; the T6 settle-guard WARN was accepted as the per-claim-token follow-up, not fixed. Next: `/specclaw:pr` only if the user wants a PR (`v2` is the integration branch), or go straight to the follow-ups.
2. **Follow-ups after 012, each its own change:**
   1. ~~**The red-CI refine race,** together with the refine "Applying…" follow-up (`/specclaw:debug`).~~ **Done: change 015, CI green 2026-10-12.** A small leftover is the caption and headline undo-clear on the same edge pattern (a leftover Undo that restores identical text). **That leftover is fixed by 018 FR-05.**
   2. ~~**`import-posts.mjs` never sets `teamId`,**~~ **Won't fix; the script was removed by 016 (2026-10-13).** A real import has been broken since team tenancy (2026-07-21); `--dry-run` never calls `create` and hides it (learning L22). Needs a `--team` remap, then a real import into a scratch test DB.
   3. ~~**The ACP manifest's advertised `generate_post` output schema** (`src/acp/agent.ts`) lists only `draftId`, `exportUrl`, `htmlContent`; it lacks `headline` and `captions`. The real output has them (AC-26).~~ **Fixed by 018 FR-01 (2026-10-18).**
   4. **`POST /api/posts` returns 201 for an immediate publish that ends FAILED,** and `PublishDialog` shows it as a success. Predates 012; caption refusals no longer reach it (422), a platform failure still does.
   5. **A per-claim token for draft actions** (the settle guards key on state, not on the claim).
   6. **The floating Create post button overlaps content** at some widths.
   7. **Small items:**
      - a trailing `---` separator stays in split sections (T3);
      - the caption check runs before the duplicate 409 (T7/T8);
      - per-post caption loads in the posts list GET (T7);
      - the axe rule list is copied into `captions.test.ts` and should become a shared helper (T13);
      - the 014 verify gaps 5–8.
   8. **The 005 AC-16 operator run** stays open: `scripts/cli-sandbox-check.mjs` in the rebuilt image with a real OAuth token. 🔴 **Revoke the token pasted into chat on 2026-10-06 first.**

### [fork context, superseded] Gotchas from this session

- **`npm run test:e2e:db` does NOT drop the test DB.** It creates it if missing, then migrates and seeds. A clean gate needs `docker exec designer-postgres-1 psql -U bistec -d postgres -c "DROP DATABASE IF EXISTS bistec_studio_test WITH (FORCE);"` first.
- **`specclaw-build setup` refuses on a stale lock** left by an earlier session. Clear it with `specclaw-change-lock .specclaw release <change>`; `setup --force` doesn't parse.
- **The `review-package` diff came out repo-wide (~437 KB) for T8.** Point reviewers at `git diff -- <task files>` instead.
- **(Removed by 016: the `captions:*` scripts no longer exist.)** ~~**The `captions:*` scripts use `tsx --env-file-if-exists=.env`,**~~ so they also run in CI (no `.env` there). Locally that means they hit the **dev** DB by default: run them only with `npx dotenv -e .env.test --` or an explicit `DATABASE_URL`.
- **(Superseded by 016: the `copyText` column is dropped; a dev DB with unmigrated legacy drafts now fails `migrate deploy` and must be reset. See the 016 runbook.)** A dev DB without the three 012 migrations can't create drafts with the then-current Prisma client (`copyText` is still NOT NULL there, and nothing writes it now). Run `npx prisma migrate deploy` on the dev DB before running the dev app.

---

## [fork context, superseded] 🛠️ 012 runbook — per-channel captions: migrations, boot backfill, report, rollback

**Removed by 016 (2026-10-13):** the boot backfill, `captions:report` / `captions:backfill`, the legacy columns (`copyText`, `captionMigration`, `needsReview`), the review notice and `prisma/rollback/012-per-channel-captions.down.sql` are all deleted. **Do not follow the backfill, report, rollback or roll-forward steps below:** the scripts and files they name no longer exist. The three 012 migrations stay applied; migration `20261013120000_drop_legacy_captions` drops what they added for the legacy path. There is no rollback to before 012. This section is history; the current deploy notes are the **016 runbook**.

**Release note:** _Every channel now publishes its own caption. Drafts whose old single caption couldn't be split by channel show a review notice on Instagram and LinkedIn until each caption is edited or regenerated._ WhatsApp has a caption on every draft but is not publishable from Studio (010).

### [fork context, superseded] The three migrations

All three are applied by the entrypoint's `prisma migrate deploy` on boot. None drops or renames a column or table (AC-27), so the previous container keeps working against the migrated schema during a rolling deploy. The one exception is the cutover window itself: a draft the new container creates has a NULL `copyText`, which the old container can't read.

| Migration                            | What it does                                                                                                                                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261011120000_channel_whatsapp`    | `ALTER TYPE "Channel" ADD VALUE 'WHATSAPP';`, alone in its file                                                                                                                                |
| `20261011130000_draft_captions`      | Enums `CaptionStatus`, `CaptionMigration`; table `DraftCaption` (cascade FK, unique `(draftId, channel)`, CHECK `DraftCaption_failed_has_no_text`); `Draft.headline`, `Draft.captionMigration` |
| `20261011140000_legacy_caption_text` | `ALTER TABLE "Draft" ALTER COLUMN "copyText" DROP NOT NULL;` The Prisma field is now `legacyCaptionText @map("copyText")`: read-only, dropped in a later change                                |

### [fork context, superseded] The boot backfill (removed by 016)

`docker-entrypoint.sh` runs `node dist/scripts/backfill-captions.js` right after `migrate deploy`, inside the same `SKIP_MIGRATIONS` guard. It takes a Postgres advisory lock (the app and scheduler containers serialize), and migrates every draft with a legacy caption, no `DraftCaption` rows and no `captionMigration`, one transaction per draft. It is idempotent.

**Expected boot log:**

```
[entrypoint] applying pending Prisma migrations…
[entrypoint] migrations up to date
[entrypoint] backfilling per-channel captions…
[captions] backfill: N drafts — split S, unsplit-fallback F, empty E, deferred D, errors X
[captions] REVIEW draft <id> — team "<name>", topic "<topic>": caption not split (both feeds carry the whole legacy text); live posts: LINKEDIN at <ISO time>, …
```

- **One `REVIEW` line per `UNSPLIT_FALLBACK` draft that has a SCHEDULED, PENDING or PUBLISHING post.** Those posts will publish the whole legacy text to both feeds (what pre-012 sent) unless someone edits or regenerates the caption first. Open each draft: its Instagram and LinkedIn panels carry the review notice.
- **A second boot prints `0 drafts — split 0, …`.**
- **`deferred`** counts drafts that were `IN_PROGRESS` or held `pendingAction = REGENERATE_COPY`. They are migrated lazily by the loader on their next read (`[captions] draft <id> migrated on read: <outcome>`). The same lazy path covers drafts created by the old container during cutover, and a boot with `SKIP_MIGRATIONS=1`.
- **A per-draft error** logs `[captions] backfill: draft <id> failed (the loader retries it on read): …` and is counted in `errors`; the boot continues.
- **A top-level failure** (DB unreachable, lock query failing) logs `[captions] backfill failed: …` and exits 1. Under `set -e` the boot fails and the previous container keeps serving.

### [fork context, superseded] `captions:report` (removed by 016)

Prints the `REVIEW` list again, with no lock and no writes, then `[captions] report: N draft(s) to review`.

- **In the container:** `node dist/scripts/backfill-captions.js --report`.
- **Locally:** `npx dotenv -e .env.test -- npm run captions:report` (or with an explicit `DATABASE_URL`). The npm scripts load `.env` if it exists (`--env-file-if-exists=.env`), so **without an explicit target they hit the dev DB.** The same applies to `captions:backfill`: never run it without an explicit test-DB `DATABASE_URL`.

### [fork context, superseded] Rollback to the pre-012 image (removed by 016)

1. **Stop both 012 containers** (app and scheduler). Once step 2 restores NOT NULL, 012 code can no longer create drafts: it never writes `copyText`.
2. **Run the data fix** `prisma/rollback/012-per-channel-captions.down.sql` against the prod DB, e.g. `npx prisma db execute --file prisma/rollback/012-per-channel-captions.down.sql --url "$DATABASE_URL"` (the form TC-CAP-13 runs) or `psql "$DATABASE_URL" -f …`. It sits outside `prisma/migrations/`, so `migrate deploy` never applies it. It:
   - gives every post-012 draft (`copyText` NULL) its Instagram text, else its LinkedIn text, else `''`;
   - restores `copyText` NOT NULL;
   - deletes migration 3's row (`20261011140000_legacy_caption_text`) from `_prisma_migrations`, so a later 012 redeploy re-applies it;
   - leaves `DraftCaption`, `Draft.headline`, `Draft.captionMigration` and `Channel.WHATSAPP` in place. The old code never reads them, Postgres can't drop an enum value, and they are what a roll-forward resumes from.
3. **Boot the old image.** If its `migrate deploy` refuses because of the three newer applied migrations, boot it with `SKIP_MIGRATIONS=1`.

> **⚠️ Ordering hazard: the old image must NOT boot before down.sql has run.** Drafts created by 012 have a NULL `copyText`, and the old image's Prisma client treats that column as non-null, so its reads of those drafts fail (T9 review). Run step 2 first, every time.

**While rolled back,** the old code publishes `copyText` to every channel, so a post-012 draft sends its Instagram caption to LinkedIn too: the pre-012 combined-caption behaviour.

### [fork context, superseded] Roll forward again (removed by 016)

1. **Redeploy 012. There is no manual step.** down.sql un-recorded migration 3, so the boot `migrate deploy` re-applies it (`DROP NOT NULL`). The boot backfill then migrates the drafts the old code created while rolled back; they have `copyText` and no rows. Post-012 drafts already have rows and are skipped.
   - The un-record step was added to down.sql on 2026-10-11, by user decision, after the T16 runbook found the gap. Without it, migration 3 would never re-run, and every new draft would fail on NOT NULL.
   - TC-CAP-13 proves the down and forward directions on a scratch DB, and a mutation check that removes the `DELETE` turns it red.
2. **Not carried forward:** an edit the old code made to a post-012 draft's `copyText` while rolled back. The rows win; the edited text is still in the `copyText` column for reference, and must be re-applied in the panel by hand.

A bad split is recoverable later too: the legacy text is never touched, so an improved planner can re-plan affected drafts in a later change.

---

## [fork context, superseded] ⏸️ 2026-10-11 (earlier) — superseded by 2026-10-11 (later) above (kept for history): 013 and 014 verified PASS; 012 is building, with 7 of 16 tasks committed; resume at T8

Everything is pushed to `origin/v2` through the 014 verify (`fbd58748`). **012 T1–T7 are committed and pushed** (`d2e782dc` … `5b1514a2`; this handoff is `d6369881`).

### [fork context, superseded] State of each change

| Change                                             | State                                | Evidence                                                                                                                                                                                         |
| -------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **011** app visual redesign (Folio)                | ✅ verified PASS, 20/20 (2026-10-09) | `.specclaw/changes/011-app-visual-redesign/verify-report.md`. The theme-toggle exception to FR-12 is approved.                                                                                   |
| **013** fork CI, checks only                       | ✅ verified PASS, 7/7                | `docker-publish.yml` is deleted, so there is no GHCR push and no deploy. `e2e.yml` runs on PRs and on pushes to `v2` and `main`. **Actions are ON.** The first `v2` run, 37886671270, was green. |
| **004** design fidelity                            | ✅ now PASS                          | Phase 0 is closed in the fork: AC-P0-3, P0-4 and P0-5 pass; AC-P0-1 and P0-2 are superseded by 013 (no deploy target).                                                                           |
| **014** UI a11y, shared primitives and consistency | ✅ verified PASS, 21/21 (2026-10-11) | 18 tasks in 3 waves. The final gate at `32404ff9`: E2E **349/3/0/0**, unit 1769, build, `test:render` 15/15. See `.specclaw/changes/014-ui-a11y-consistency-pass/verify-report.md`.              |
| **012** per-channel captions                       | 🔨 **building: T1–T7 of 16 done**    | The plan, decisions and panel report are in `.specclaw/changes/012-per-channel-captions/`. Each task has a report and a review under `reports/` and `reviews/`.                                  |

### [fork context, superseded] The user's decisions (2026-10-09 and 2026-10-10), all recorded in the proposals

- **Fork CI:** checks only, with no image push and no redeploy. The user will write a deploy workflow later.
- **014:** built as one change, with one E2E run per wave and the shared primitive first. Scroll regions follow a static rule (always focusable and labelled). All 27 fields are labelled. Every field label is small caps. `axe-core` is a devDependency. The A5 micro-drift is accepted. §8.17 records that there is no More menu.
- **012** (proposal Decisions plus the deep panel rulings, and spec assumptions A1–A10, all approved):
  - **Storage and scope:**
    - a `DraftCaption` table keyed on `Channel`, with **WHATSAPP added to `Channel`**;
    - a publish to a channel with no publisher **fails closed** and terminally;
    - WhatsApp is never selectable in a publish or queue picker until 010;
    - full scope: three captions, per-channel regenerate plus "Regenerate all", and per-panel undo.
  - **Headline:**
    - a required `Draft.headline` for new generations (A6: a missing headline fails the draft);
    - migrated drafts fall back to the brief Topic, and the fallback is logged;
    - the headline enters the design prompts only fenced as untrusted content.
  - **Contracts keep their names:** the `regenerate-copy` and `generate/copy` routes, `DraftAction.REGENERATE_COPY`, and the MCP/ACP field names. MCP/ACP keep `copyText` as a deprecated alias holding the Instagram caption, plus a `captions: [{channel,text,status}]` list and `headline` (A4).
  - **The old caption text is preserved** _(all removed by 016, 2026-10-13: the column, the migration record, the notice, the backfill and the lazy loader)_:
    - it becomes `legacyCaptionText @map("copyText")`, a rename in code only (A1);
    - it is dropped only in a later change;
    - each draft records how it migrated (`split` / `unsplit-fallback` / `empty`);
    - fallback drafts get a "review this caption" notice;
    - the boot-time backfill runs under an advisory lock (A8);
    - the same planner also runs lazily in the loader.
  - **Behaviour:**
    - single-flight is per draft (A2);
    - all three captions are always written (A5);
    - a failed regenerate keeps good text as READY (A7);
    - "Regenerate all" leaves the headline alone (A9);
    - `POST /api/posts` returns 422 `CAPTION_UNPUBLISHABLE` with no Post row (A10);
    - the WhatsApp counter is a soft 1,000-character guide.

### [fork context, superseded] 012 progress

| Task | Commit     | What                                                                                                                                                                                                                                                                                                    |
| ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1   | `d2e782dc` | WHATSAPP in `Channel` (migration `20261011120000_channel_whatsapp`), the per-channel registry in `src/lib/channels.ts`, and every channel input limited to publishable channels                                                                                                                         |
| T2   | `8ec62b6a` | `buildCaptionPrompt`, the strict extractor `src/lib/captions/extract.ts` (exactly one object, requested keys only, fails closed) and `headline.ts`                                                                                                                                                      |
| T3   | `1fdcfce0` | The pure migration planner (`migrationPlan.ts`) and publish resolver (`resolve.ts`)                                                                                                                                                                                                                     |
| T4   | `f0ce3533` | The `DraftCaption` schema (migration `20261011130000_draft_captions`, with the named CHECK), `store.ts`, the boot backfill (`backfill.ts`, `src/scripts/backfill-captions.ts`, the entrypoint and the Dockerfile bundle)                                                                                |
| T5   | `f0ca83b5` | The writers (`captions/generate.ts`), the mock caption seam (`buildMockCaptionReply` plus drop sentinels), the fenced headline in the Path A, Path B and background prompts (`PROMPT_VERSION` `2026-10-11.1`), and the async, sync and retry flows                                                      |
| T6   | `09c75f18` | The draft API: GET (captions plus headline), PATCH (`{channel,text}` or `{headline}`, which never writes status) and `regenerate-copy` (`{}` / `{channel}` / `{headline:true}`, an empty body counts as `{}`). Also claim and settle, the sweep, and the base `CaptionPanels`; `CopyEditor` is deleted. |
| T7   | `5b1514a2` | Every publish path goes through the one resolver, before the export is signed. The job runner treats terminal errors as such, `POST /api/posts` returns 422, and the posts GET routes return `draft.caption`. **This fixes the live combined-caption bug.**                                             |

**Unit tests at T7:** 2007/2007, with tsc and lint clean. **No E2E has run since the 014 gate.** 012 T5–T9 are knowingly mid-change, as the tasks.md mid-wave note says. T10 owns every wave-1 E2E edit and runs the wave-1 gate.

### [fork context, superseded] Do this next, in order

1. **`git pull`** on any other machine. Everything is pushed to `origin/v2`.
2. **Resume `/specclaw:build 012-per-channel-captions` at T8.** Use the same subagent-driven loop: implementer, then `specclaw:code-reviewer`, then the orchestrator fixes any WARN and commits. Run one task at a time.
   - **T8:** MCP/ACP and `generate/copy` outputs. Two items were handed over from the T7 review:
     - MCP `getDraft` still returns the legacy `copyText`;
     - MCP/ACP `publish_post` needs the **up-front** resolver check, so a refusal creates no Post row, matching `POST /api/posts`.
   - **T9:** the legacy rename `legacyCaptionText @map("copyText")`; no more placeholder `copyText: ''` writes; the read-only guard; the fixture seed; the rollback file.
   - **T10:** the wave-1 E2E: the §W captions suite, the existing-case updates, then the **wave-1 gate**. T6 listed the cases it expects to break:
     - `async-actions`: TC-ASYNC-02, the stale sweep, the "not ready" message, and TC-ASYNC-10's `{copyText}` PATCH;
     - `team-isolation`: the cross-team PATCH body;
     - the `surfaces` T9 draft case: the placeholder, and the "Regenerate" button now named "Regenerate all";
     - `a11y` row 26;
     - the publish cases.

     The backfill's npm scripts use `tsx --env-file=.env`, which errors without a `.env`. If CI runs them, use `--env-file-if-exists` or call tsx directly.

   - **T11–T13 (wave 2):** per-channel regenerate, the headline panel, per-panel undo, copy to clipboard, the notices and counters, and the wave-2 E2E gate.
   - **T14–T16 (wave 3):** the "copy" → "caption" UI strings and their guard, the export and import scripts, and the docs.
   - Then `/specclaw:verify 012-per-channel-captions`.
3. **Follow-ups to propose after 012**, each as its own change:
   - **`POST /api/posts` returns 201 for an immediate publish that ends FAILED,** and `PublishDialog` shows it as a success. This predates 012.
   - **A per-claim token for draft actions.** The settle guards key on state, not on the claim, so a stale worker after the 15-minute sweep plus a new claim could overwrite the newer run. This was the 004 ruling, and it was logged again by the 012 T6 review.
   - **The floating Create post button covers trailing content at some widths:** the draft refine input at 1440 px, and the team badge and settings text at 375 px. This predates 014.
   - **Small items:**
     - a trailing `---` separator stays in split sections (012 T3);
     - the caption check runs before the duplicate 409 in `POST /api/posts` (012 T7);
     - per-post caption loads in the posts list GET (012 T7);
     - the 014 verify gaps 5–8.
4. **The operator run of 005 AC-16:** `scripts/cli-sandbox-check.mjs` in the rebuilt image, with a real OAuth token. 🔴 **Revoke the token pasted into chat on 2026-10-06 first.**

### [fork context, superseded] Gotchas from this session

- **Usage limits stopped subagents about 5 times.** Resume the same agent with `SendMessage`: its working-tree edits survive. Check `git status` and port 3001 first.
- **A finished gate agent restarted a detached `next dev` on :3001** after its background task died, and it collided with the next gate. **Before every full E2E, confirm exactly one :3001 listener**, the one you started after `rm -rf .next` and the DB reset. This is logged in `.specclaw/learnings.md`.
- **Never run `npm run build` while `next dev` is serving :3001.** It corrupts the dev `.next`. `specclaw-build finalize` and `specclaw-verify collect` both run the build, so stop the server first and `rm -rf .next` afterwards.
- **`specclaw-build setup` acquires a change lock.** `.specclaw/changes/*/.lock/` is now gitignored, after a lock got committed once. `finalize` releases it; a stale build lock blocks verify until then.
- **(Historical; the backfill was removed by 016.)** **012 T4's implementer ran the backfill once against the dev DB by accident.** `@prisma/client` loads `.env` even when `DATABASE_URL` is unset. It failed with P2022 before writing anything, because the dev DB doesn't have the migration yet. **Never run `src/scripts/backfill-captions.ts` without an explicit test-DB `DATABASE_URL`.**
- **Local MinIO now runs `pgsty/silo:RELEASE.2026-09-16T00-00-00Z`** on the same volume, with no data change. The rollback image is `local/minio-rollback:pre-silo`, and the volume backups are in the 2026-10-09 session scratchpad.
- **The 012 migrations exist only as SQL files:** `20261011120000_channel_whatsapp` and `20261011130000_draft_captions`. They are applied when the wave gate recreates the test DB. Run `npx prisma migrate deploy` on the dev DB only when you want the dev app to run 012 code.
- **GitHub moves `ubuntu-latest` to Ubuntu 26 from 2026-10-19.** Watch the first CI run after that date.

---

## [fork context, superseded] ⏸️ 2026-10-09 — superseded by 2026-10-11 above (kept for history): 011 verified PASS; `main` merged into `v2`; 013 (fork CI, checks only) is building

### [fork context, superseded] The user's decisions (2026-10-09)

- **The fork runs checks only.** It pushes no GHCR image and redeploys nothing. `docker-publish.yml` is **deleted** (change 013, T1), not guarded. The user will write their own deploy workflow later, for their own target.
- **`e2e.yml` is the only workflow.** It runs typecheck, lint, the E2E suite, unit tests, the build and `docker build .` (no push). It triggers on PRs and on pushes to `v2` and `main`.
- **Re-enabling Actions is approved** once 013 is pushed to `v2` (013 T3).
- **The 011 theme-toggle exception to FR-12 is approved.** The toggle is now a "Theme" group with "Light" and "Dark" buttons.
- **The next changes run in this order: 013 → 014 → 012.**
  - **013 fork CI, checks only** (bounded): approved, planned, building now.
  - **014 UI accessibility, shared primitives and consistency** (architectural): approved. The panel's CHANGES_REQUESTED was resolved by the user's rulings: it stays one change, a full E2E runs per wave, the shared primitive comes first, and scroll regions follow a static rule.
  - **012 per-channel captions:** approved, with these decisions: a `DraftCaption` table, a separate on-image headline, revisions stay design-only, and the brief step is named "Brief & Caption Direction".

### [fork context, superseded] What happened

- **011 verified PASS, 20/20** (`.specclaw/changes/011-app-visual-redesign/verify-report.md`). A fresh E2E run at HEAD gave **311 passed / 3 skipped / 1 flaky / 0 failed**. The flake was a one-off Chromium `Page crashed` at `tests/e2e/surfaces.test.ts:521` (library thumbnails); it passed on retry and when run alone.
- **Fork `main` merged into `v2` at `2506de0b`.** The merge was clean. It brings 004 Phase 0: Node 22, `/api/health`, the CI hardening and MinIO → silo. Gates on the merged tree:
  - tsc clean, lint 0 errors, unit **1722/1722**, build passes;
  - full clean mock E2E **313 passed / 3 skipped / 0 failed / 0 flaky** (5.8 min);
  - `tests/e2e/auth.test.ts` 8/8, including the new "/api/health is public and returns exactly {ok, commit}".
- **`/api/health` with no session** returns HTTP 200 and `{"ok":true,"commit":"unknown"}`. The commit is `unknown` because `GIT_SHA` is not set locally. Whoever builds the image passes `--build-arg GIT_SHA=<sha>`.
- **`docker build` on `node:22-alpine` works.** In the image, `claude --version` is `2.1.287 (Claude Code)` and `node -v` is `v22.23.3`, with 0 `EBADENGINE` warnings. **005 AC-17 re-check: PASS.**
- **004 Phase 0 is closed in the fork** (`.specclaw/changes/004-design-instruction-fidelity/verify-report.md` → "Phase 0 closure in the fork"). AC-P0-3 and AC-P0-5 pass. AC-P0-1 and AC-P0-2 are superseded by 013, because the fork has no deploy target. **AC-P0-4 waits on the first `v2` CI run's annotations.**
- **Local MinIO swapped to silo:** `pgsty/silo:RELEASE.2026-09-16T00-00-00Z`, on the same volume. All 6 buckets, their object counts and their policies are unchanged. Backups are in the session scratchpad, and the old image is tagged `local/minio-rollback:pre-silo` for a rollback.

### [fork context, superseded] Do this next, in order

1. **Finish 013 with T3.** Push `v2` to `origin` (the fork only), run `gh api -X PUT repos/EnderGuardian25/ai-studio/actions/permissions -F enabled=true`, and watch the first `E2E` run on `v2`. Record its annotations as 004's AC-P0-4. If a runner-only failure appears, such as a timeout or a Playwright cache miss, report it to the user before making a minimal `e2e.yml` fix (013 NFR-02). **Until 013 T3 lands, Actions are off** and the gates run locally.
2. **Plan and build 014** (`.specclaw/changes/014-ui-a11y-consistency-pass/`), with the user's rulings above.
3. **Plan and build 012** (`.specclaw/changes/012-per-channel-captions/`), with the user's decisions above.
4. **Operator run for 005 AC-16:** `scripts/cli-sandbox-check.mjs` in the rebuilt node:22 image, with a real OAuth token. 🔴 **First revoke the token pasted into chat on 2026-10-06** and make a new one with `claude setup-token`.
5. **Watch the `surfaces.test.ts:521` page-crash flake.** If it recurs, look into it with `/specclaw:debug`.

---

## [fork context, superseded] ⏸️ 2026-10-08 — superseded by 2026-10-09 above (kept for history): 011 is built (13/13); verify next

All of 011 is on `v2` in the fork. Every screen is **Folio**. Each task followed one cycle: an implementer subagent with a written brief, then a `specclaw:code-reviewer` subagent, then the orchestrator fixed any WARNs, re-ran the gates and committed. The reports are in `.specclaw/changes/011-app-visual-redesign/reports/T*.md` and the reviews (with resolutions) in `reviews/T*.md`.

### [fork context, superseded] The user's decisions (2026-10-07)

- **Direction B, Folio,** unchanged from the study.
- **No Bistec Studio logo.** The logo is Folio's typeset **"Studio"** wordmark, and `public/BistecStudioLogo.png` is deleted. `public/.gitkeep` keeps `Dockerfile:105` (`COPY … /app/public`) working.
- **No "More" menu on the draft page.** Every action stays a visible button, because a menu would change the roles the E2E drives (FR-12).
- **The fork CI-fix proposal waits until 011 is finished,** and the user approves it.

### [fork context, superseded] What landed

| Task | Commit     | What                                                                                                             |
| ---- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| T3   | `9be31d58` | Folio `DESIGN_SYSTEM.md`; Frozen Light archived                                                                  |
| T4   | `6b2d6c87` | Tokens, `next/font`, reduced motion (loaders keep moving), token + contrast tests, `scripts/capture-ui.mjs`      |
| T5   | `74b237e5` | Primitives on tokens; every fixed or floating surface opaque; `tests/e2e/surfaces.test.ts`                       |
| T6   | `7fdbe38b` | Shell, login, choose-team, the wordmark; the theme toggle is two buttons with `aria-pressed`                     |
| T7   | `d7aadf5a` | Dashboard and library                                                                                            |
| T8   | `5b72b46d` | Brief wizard                                                                                                     |
| T9   | `64a42d64` | Draft review: proof plate, contact sheet, copy desk                                                              |
| T10  | `d23585ad` | Campaigns, projects, queue, briefing assistant                                                                   |
| T11  | `14e47b88` | Brand kits admin                                                                                                 |
| T12  | `53c78b61` | Team, settings, admin users and teams                                                                            |
| T13  | `c37357a3` | Legacy layer removed; `uiTokenGuard` test; Instrument Sans is the default; final captures; reference screenshots |

There was also one separate docs commit: `1f5a2a39`, the AC-23 wording-guard fix in this file.

**Gates at `c37357a3`:**

- unit **1722/1722**;
- lint 0 errors (the 7 known warnings);
- build passes;
- `npm run test:render` **15/15**;
- full clean mock E2E **312 passed / 3 skipped / 0 failed / 0 flaky**, up from 265, with 47 new cases in `surfaces.test.ts`.

### [fork context, superseded] Do this next, in order

1. ~~**`/specclaw:verify 011-app-visual-redesign`.**~~ **Done 2026-10-09:** PASS, 20/20.
2. ~~**Fork CI-fix proposal** (`/specclaw:propose`, then the user approves it): guard or remove the `docker-publish.yml` deploy job, add `v2` to `e2e.yml`, and re-enable Actions.~~ **Superseded 2026-10-09 by change 013:** `docker-publish.yml` is deleted, CI is checks only, and Actions are re-enabled by 013 T3.
3. **011 follow-up proposal** (`/specclaw:propose`, then the user approves it). **Proposed and approved 2026-10-09 as change 014.** These items were kept out of 011 on purpose, because FR-12 froze accessible names and because they are refactors:
   - **Accessibility naming pass:**
     - labels for placeholder-named inputs (the /team register and channel fields, the add-colour field, the template Size and HTML/CSS fields, the brief topic and kit select);
     - the unnamed COPY/IMAGE tablist;
     - a visually hidden `h1` on login;
     - `aria-disabled` on stepper steps that aren't done (this updates T8's AC-17 expectation);
     - `aria-hidden` on swatch titles inside the kit-row name;
     - the breadcrumb tail read twice;
     - scroll regions focusable only when they overflow;
     - 24 px remove targets;
     - an On/Off word on the provider toggle.
   - **One shared page-head / section / notice primitive** replacing the 8 local `folio.ts` copies (dashboard/library inline, `brief/cardCls.ts`, `drafts/folio.ts`, `campaigns/folio.ts`, `admin/brandkits/folio.ts`, `team/folio.tsx`). Also fold `StatusWord` into `StatusChip`.
   - **Consistency:**
     - align Select labels with the small-caps `FieldLabel`;
     - align button and input heights;
     - fix the two primaries possible in brand kits;
     - cap the kit list's height;
     - set `tabular-nums` on body as DESIGN_SYSTEM §5 says;
     - extend the guard to catch `glow-blob`, `animate-scale-in`, `text-primary` and `font-inter`.
4. ~~**Merge fork `main` into `v2`.** This brings 004 Phase 0: Node 22, `/api/health`, CI hardening and MinIO → silo. Then recheck 005 AC-17 under node:22, re-run AC-16 on a rebuilt image and close 004's Phase 0 ACs. Expect a `docker-publish.yml` conflict, so pair it with step 2.~~ **Done 2026-10-09 at `2506de0b`** (a clean merge). AC-17 passes, and 004 Phase 0 is closed except AC-P0-4. AC-16 still needs an operator run.

### [fork context, superseded] Follow-ups and gotchas from this build

- **~~Refine poll race~~ (FIXED 2026-10-12, change 015; it was pre-existing and logged in `.specclaw/learnings.md`):** a refine row can stay on "Applying…" when the mock refine finishes before the post-202 refetch sees `pendingAction: 'REFINE'`. It was seen once.
- **Change 010 must update a T10 E2E assertion** that expects exactly 2 channel checkboxes in `QueueEntryModal`.
- **Capturing screens:** run `npm run test:e2e:serve`, then `node scripts/capture-ui.mjs --out ui-captures/<name>`. The script hides Next's dev indicator. On a fresh test DB the seeded fixture draft has no MinIO export, so the script mints one.
- **Scroll containers:** a container that scrolls on its own must be `relative` if it holds `sr-only` cells; otherwise they widen the page at 375. This happened twice. It is in DESIGN_SYSTEM §8.15.
- **The test DB fills up** (about 200 campaigns and kits). The gate script drops and recreates it every run.
- **Usage-limit interruptions:** they stopped two implementer subagents. Resuming the same agent with SendMessage kept its edits and context. Check `git status` and port 3001 first.

---

## [fork context, superseded] 🍴 2026-10-07 — moved to the fork `EnderGuardian25/ai-studio` (read before any git, CI or deploy step)

**Decision (the user, 2026-10-07):** development of the company repo stops. Everything on `v2` (004, 005, 011 and the 006–010/012 proposals) continues in the user's own public fork, **`EnderGuardian25/ai-studio`**. **The company repo `bistec-oss/studio` is left exactly as it is:** no pushes, PRs, branch deletes or PR closes there, draft PR #43 included.

### [fork context, superseded] How this checkout is wired

| Remote    | URL                                                | Use                                                                                                                                   |
| --------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `origin`  | `https://github.com/EnderGuardian25/ai-studio.git` | **The fork. Push here.** `main` and `v2` track it.                                                                                    |
| `company` | `https://github.com/bistec-oss/studio.git`         | **Fetch only.** The push URL is set to `DISABLED-company-repo-is-read-only`, so `git push company …` fails by design. Don't "fix" it. |

- `gh repo set-default` is **`EnderGuardian25/ai-studio`**. Without it, `gh pr create`, and so `/specclaw:pr`, in a fork defaults to **the company repo** as the PR base. If `gh` ever proposes `bistec-oss/studio` as the base, stop.
- specclaw `github.repo` is empty and auto-detects from `origin`, so it already points at the fork. GitHub sync stays off.
- **The other worktree,** `../designer-ci` (`fix/ci-deploy-pipeline`, already merged as PR #42), shares this repo's git config, so the same remotes apply to it. It can be removed with `git worktree remove ../designer-ci`.
- **Setting up a new machine:** `git clone https://github.com/EnderGuardian25/ai-studio.git`, then run `git remote add company https://github.com/bistec-oss/studio.git`, `git remote set-url --push company DISABLED-company-repo-is-read-only` and `gh repo set-default EnderGuardian25/ai-studio`.

### [fork context, superseded] Leak audit before going public (2026-10-07)

- **Nothing new was exposed.** Every commit on `v2` and `main` was already pushed to `bistec-oss/studio`, which is **public**, before the fork was made. The fork adds no content the company repo didn't already publish.
- **No real credential exists in the tree or in `v2` history.** The scan looked for Anthropic `sk-ant-oat/api`, OpenAI `sk-proj`, GitHub `ghp_/gho_/github_pat_`, AWS `AKIA`, Google `AIza`, `bstk_`, Slack `xox*` and private-key blocks. Every hit is a prefix in docs or validation regexes, or a fake test value (`FAKE`, `AAAA…`). The only env file ever committed is `.env.example`, which holds placeholders and the local-dev `minioadmin`/`bistec` defaults.
- **Test-only credentials in the repo, which are fine:**
  - `BistecStudio2026!` is the fixed **test** seed password. `seed-admin.mjs` uses it only for `NODE_ENV=test`, `SEED_FIXED_CREDENTIALS=true` or a `*_test` database. A real deploy gets a random password printed once.
  - The CI E2E job's `ci-test-secret-…` and `0123…` keys.
- **Company operational detail is in the tracked docs and stays public,** as it already is on the company repo: the prod hostname, Coolify resource UUIDs, prod team and kit IDs, the Hearts Academy contact block, the prod findings docs and the prompt-injection review. Removing these from the fork's tip would not unpublish them, because fork networks share history. **Never add new secrets, prod IDs or customer data to the fork.**
- **Untracked and gitignored files never reach the fork:** `.env`, `.env.test`, `brag-output/`, the specclaw `logs/` and `.lock/`.
- 🔴 **Still open, and unrelated to the fork:** the OAuth token pasted into chat on 2026-10-06 lives in the session transcript, not the repo. Revoke it and make a new one with `claude setup-token`.

### [fork context, superseded] CI on the fork: checks only (change 013)

**Updated 2026-10-09 (change 013).** By the user's decision, the fork runs **checks only**:

- **`docker-publish.yml` is deleted** (013 T1), not guarded. The fork pushes no GHCR image, calls no Coolify and polls no `/api/health`. The user will write their own deploy workflow later.
- **`e2e.yml` is the only workflow.** It runs typecheck, lint, E2E, unit, the build and `docker build .` with no push, on PRs and on pushes to `v2` and `main`.
- **Actions are re-enabled by 013 T3**, after 013 is pushed to `v2`. Until 013 T3 lands, Actions are off and the gates run locally.

The 2026-10-07 state is kept below for history.

`gh api -X PUT repos/EnderGuardian25/ai-studio/actions/permissions -F enabled=false` was run on 2026-10-07. Both workflows still assume the company repo:

- **`docker-publish.yml`** (push to `main`) builds and pushes `ghcr.io/<repo>` (here, `ghcr.io/enderguardian25/ai-studio`). It then **calls the company's Coolify** (`coolify.bistecglobal.com`, the company's two resource UUIDs) and polls the company's `/api/health`. With no `COOLIFY_API_TOKEN` it can only fail red. It must never be given one.
- **`e2e.yml`** runs only on PRs and pushes to `main`. Draft PR #43 existed only to get CI on `v2`; the fork needs `v2` in its triggers instead.

**The user's timing (2026-10-07): this waits until 011 is finished.** Then draft it with `/specclaw:propose` for the user to approve; don't build it between 011 tasks. ~~**Next step (a specclaw change, so propose it first):** remove or guard the deploy job with `if: github.repository == 'bistec-oss/studio'`, and add `v2` to `e2e.yml`'s triggers. Then turn Actions back on with `-F enabled=true`.~~ **Superseded by 013** (see above). Until then, **gates are run locally** (unit, lint, build, mock E2E), exactly as before.

### [fork context, superseded] What changed in the open items

- **PR #42 was already merged** into company `main` on 2026-09-28 (`671ad6e9`). The "merges only on go-ahead" notes were stale. Fork `main` = `671ad6e9`.
- ~~**Still to do, now inside the fork:**~~ **Done 2026-10-09** (merge `2506de0b`; only AC-16 and AC-P0-4 remain): merge `main` into `v2`, which brings 004 Phase 0: `/api/health`, Node 22, the CI hardening and MinIO → silo. Then recheck 005 AC-17 under node:22, re-run AC-16 against a rebuilt image, and close 004's Phase 0 ACs. Expect conflicts in `.github/workflows/docker-publish.yml`, so do the CI change above right after.
- **No longer ours, so don't act on them from here:**
  - draft PR #43 (left open on the company repo, as it is);
  - the Coolify token rotation;
  - the MinIO → silo **prod** swap (CVE-2026-40344);
  - B4 (scheduler) and the team Claude tokens **on company prod**;
  - the prod test-data wipe.

  These belong to the company's Coolify admin. The runbooks (`docs/coolify-token-rotation.md`, `docs/minio-silo-migration.md`, `docs/scheduler-b4-diagnosis-2026-08-03.md`) stay in the tree for reference.

- **The "`v2` merges to `main` in one go" rule is kept for the fork:** `v2` is the integration branch, and fork `main` moves only on the user's go-ahead. It no longer deploys anything. Once the fork has its own deploy target, write that rule here.
