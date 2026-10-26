# Tasks: Image looks (027b)

**Change:** 028-image-looks · **Size:** architectural
**Created:** 2026-10-25
**Total Tasks:** 7 (6 build tasks, then 1 operator-gated task)

## Summary

This change has **7 tasks in 5 waves**:

1. the dataset: v2 of the two looks, the two new looks, the validator, the key rule, the prompt `use` text and the mock layout box;
2. three tasks that each need only wave 1, run one at a time: the resolver and the wizard's STORY literals (T2), the fixture set (T3), and the runner (T5);
3. E2E section AF and the existing suites that encoded "STORY unsupported" (T4);
4. the docs, the full gate and CI (T6). **The first verify runs after T6.**
5. after the operator's real-image check (OP-028): post-style `versions[2]` for the looks that passed (T7, deferred).

**OP-028 is not a task.** It is the operator's run of `scripts/look-check/run-look-check.mjs` on the user's decision, after T6, against a local server on a scratch database (spec FR-15). No task runs it, and no task makes a real model or image call.

## Process / Gates

- **One task at a time:**
  1. an implementer subagent does the task (suggested model per task below; the user's standing rule is the cheapest workable model);
  2. `specclaw:code-reviewer` reviews it (sonnet);
  3. the orchestrator re-runs tsc, `npm run lint` and `npm run test:unit`, then commits.

  Never run two implementers in this checkout. Wave 2 lists three tasks with no dependency between them, but they still run one after another.

- **No real model or image calls.** Every test runs on the `MOCK_AI` seam, fixture datasets or synthetic fixtures. The runner is run only by its unit tests and with `--dry-run`.
- **No prisma or DB command in any task.** There is no migration. If a test needs the test DB (TC-LOOK-11, TC-LOOK-12), it goes through the E2E helpers against `bistec_studio_test`. `bistec_studio` and `bistec_studio_op1` are never touched. Use `export MSYS_NO_PATHCONV=1` before any docker command with a container path.
- **The OP-1 dev server may be running on :3002** (it shares `.next`). Before any build or E2E run, ask the orchestrator; do not kill it yourself.
- **A `page.waitForResponse` must be created before the action that triggers the request** (the 023 TC-HB-01 lesson).
- **Read first:** `docs/ui-reference/DESIGN_SYSTEM.md` before T4's screenshots. No new component; no new `// ui-exception`.
- **Baselines (027 T8, at the base commit `4053cfe`):** unit 3737/3737; render 47/47; lint 0 errors / 7 warnings; full clean mock E2E 517 passed / 3 skipped / 0 failed / 0 flaky. A task may add cases; it may not lower a pass count or add a lint warning. An existing case may be adapted (listed in the task report), never deleted.
- **Hard rule for every task:** `git diff --name-only 4053cfe -- prisma .env.example src/lib/env.ts src/lib/scheduler src/mcp src/acp src/app/api/acp src/app/api/campaigns src/lib/renderer src/lib/agent` lists nothing (no migration, no env var, unattended and the pipeline untouched).
- **Report footers.** Each task writes `reports/T<n>.md` ending with a `## Verification` heading exactly (`specclaw-build check-report`); re-read it after prettier.

## Tasks

### Wave 1: The dataset

- [x] `T1` — Version 2 of the two looks, the two new looks, the validator, the key rule, the prompt `use` text and the mock layout box
  - Files: `src/lib/designData/{composition,validate,index,promptText}.ts` (`validate.ts` new), `src/lib/testHooks.ts` (`mockLayoutBoxes` only), `tests/unit/lookDataset.test.ts` (new), `tests/unit/{designData,designDataBoundary,heroPrompts,designRegions,compositionPlan,heroSeams,compositionNotice,refinePrompt,background}.test.ts` (adapt and extend)
  - Estimate: large
  - Kind: impl
  - Model: sonnet
  - Depends: none
  - Notes:
    - **Covers:** FR-01, FR-02, FR-03, FR-04 (the header and the committed key list), FR-07, FR-09, FR-10, FR-11 (the unit half), NFR-02, NFR-04, NFR-05, NFR-07; AC-01, AC-02, AC-03 (the dataset half), AC-06, AC-09, AC-10 (the unit half), AC-11 (the unit half), AC-14 (the unit half).
    - Follow design sections 2, 3, 4, 7 and 8 (mock seam). The rows are spec FR-02 verbatim. v1 objects are not touched: run the v1 hash test **before** and after.
    - `lookDataset.test.ts`: `lookDatasetProblems(archetypes)` is `[]`; one fixture dataset per FR-03 rule, each failing with its own message; a valid `-light` variant fixture passes; the committed key list (`product-showcase`, `editorial-split`, `full-bleed-scene`, `spotlight`) is a subset of the dataset keys; a committed SHA-256 per (key, version) (compute once from the finished rows); v2 SQUARE and PORTRAIT deep-equal v1; the header contains "THE LOOK KEY RULE".
    - `designData.test.ts`: the four-key list; `declaredUnsupported` becomes empty for the current versions (the v1 "no STORY" assertion stays: it is true); the picker case asserts all five cards supported at STORY; nine module files; the region-keys test allows the optional `use`.
    - `heroPrompts.test.ts`: golden image, design and refine text for the 8 new contracts; the Spotlight design and refine text name each band's `use`; every existing golden passes **unchanged**.
    - `designRegions.test.ts`: the STORY worked case of design section 3.
    - `compositionPlan.test.ts` and `heroSeams.test.ts`: a kept plan's version is read from `archetypes[key].current`; the `unsupported-size` cases move to a fixture dataset declaring SQUARE only (the `source` parameter of `planComposition`); `mockLayoutBoxes` returns an outside box for every (key, version, size) and an inside box in the first text region.
    - `compositionNotice.test.ts`: a kept Spotlight and Full-bleed stamp with `layout-violation` gives the observation message with the look label. `refinePrompt.test.ts`: a v1 stamp resolves the v1 regions. `background.test.ts`: a band look makes exactly one image call, also on a fallback.
    - Expect `postStylesDataset.test.ts` to still pass (no post-style change here).
    - **Gate:** tsc, lint, unit. Then `npm run test:render` (the 47 existing cases unchanged; T3 adds the new ones).

### Wave 2: Resolver and wizard, fixtures, runner (one at a time)

- [x] `T2` — `retired-classic`, post-style defaults may name any look key, and the wizard's STORY literals
  - Files: `src/lib/postStyles/{resolve,styles}.ts`, `src/lib/brief/{wizardStyleState,imageStyle}.ts`, `src/components/brief/{useBriefWizard.ts,ReviewStep.tsx}`, `src/app/api/briefs/route.ts` (comments only), `tests/unit/{postStylesResolve,postStylesDataset,postStylesWizard,briefImageStyle}.test.ts` (adapt and extend)
  - Estimate: medium
  - Kind: impl
  - Model: sonnet
  - Depends: T1
  - Notes:
    - **Covers:** FR-04 (the resolver half), FR-05, FR-06, FR-12 (the logic half), FR-13 (the resume half), NFR-06; AC-03 (the resolver half), AC-04, AC-05.
    - Follow design sections 5 and 6. The new check order is unattended, Path A, retired, not in the dataset, size. `UNATTENDED` and its branch are not edited.
    - `postStylesResolve.test.ts`: the AC-04 table per surface; the `retired-classic` cases with a fixture look dataset (a default naming a retired look, and an explicit retired value); `size-classic` with a fixture look dataset declaring SQUARE only; the old "STORY is classic" case becomes "STORY keeps the look" on `wizard` and `briefs-api`.
    - `postStylesDataset.test.ts`: `defaultImageStyleProblems` accepts a retired dataset key and refuses a missing one.
    - `postStylesWizard.test.ts`: 9:16 with Launch shows Product showcase; Path A still shows classic; `styleAfterSizeChange` keeps a supported pick and resets an unsupported one (fixture look dataset); resume keeps a 9:16 look.
    - Grep and record in `reports/T2.md`: `grep -rn "\.notes\|ResolveNote" src` (no production reader of the notes) and `git grep -n "STORY" -- src` (only the kept lines of the spec FR-06 table remain).
    - **Gate:** tsc, lint, unit, `npm run build` (then `rm -rf .next`; check with the orchestrator about :3002 first).

- [x] `T3` — The fixture set: the table, the images, the render test and the completeness test
  - Files: `tests/render/{lookFixtureTable,lookFixtures,look-fixtures.test}.ts` (new), `tests/render/heroFixtures.ts` (STORY shape, export `CALM` and `STRIPES`), `tests/unit/lookFixtureCompleteness.test.ts` (new); `src/lib/designData/composition.ts` and the T1 hash table **only** if a contract must be tuned (NFR-04)
  - Estimate: medium
  - Kind: test
  - Model: sonnet
  - Depends: T1
  - Notes:
    - **Covers:** FR-08, NFR-11; AC-07, AC-08.
    - Follow design section 8. `LOOK_FIXTURES` is a literal list of 36 rows; `INTENDED_BACKDROP` is a literal and never derived from `textTone`. Busy hits the last text region, contrast the first.
    - Tuning: if a pass fixture fails, change the fixture first; change a contract (rect or subject) only if the fixture cannot be made fair, and then update its committed hash in the same commit and record the reason in `reports/T3.md` (the contract is not released yet, NFR-04). Never flip an assertion's direction and never touch `evaluate.ts`.
    - Record in `reports/T3.md` the measured margins for one contract per look (the L\* standard deviation and the pass fraction), as 009 T3 did.
    - **Gate:** tsc, lint, unit, `npm run test:render` (at least 83, all passing, run twice).

- [x] `T5` — The real-image check runner in `scripts/look-check/`
  - Files: `scripts/look-check/{lookCheck,run-look-check}.mjs` (new), `tests/unit/lookCheck.test.ts` (new), `.specclaw/changes/028-image-looks/look-check/.gitignore` (new: `renders/`)
  - Estimate: medium
  - Kind: impl
  - Model: sonnet
  - Depends: T1
  - Notes:
    - **Covers:** FR-14, FR-15 (the rule in code), NFR-01 (the runner half), NFR-09; AC-15, AC-16, AC-17 (the runner half).
    - Follow design section 9 exactly: the pure module has no fs, no network and no prisma import; the runner writes the ledger line with `appendFileSync` **before** each request; one generation at a time; `--base` must be localhost or 127.0.0.1 over http; credentials only from the environment, never in the source; `--dry-run` and `--verdict` make no network call.
    - Write the eight briefs (one per slot) with the slot's post style, no invented date, price or number, and a plain call to action. The reviewer checks each against the post-style checklist (`src/lib/postStyles/styles.ts`).
    - `lookCheck.test.ts`: every AC-15 and AC-16 case, including a malformed ledger line counted as an attempt and a result with `error` counted once.
    - **Do not run the runner against a server.** Run only `node scripts/look-check/run-look-check.mjs --out <scratch dir> --dry-run` and record its output in `reports/T5.md`.
    - Do not move or edit `.specclaw/changes/009-hero-image-design/op1/` (assumption A6).
    - **Gate:** tsc, lint (covers the `.mjs` files), unit.

### Wave 3: E2E

- [x] `T4` — E2E §AF and the existing suites that encoded "STORY unsupported"
  - Files: `tests/e2e/image-looks.test.ts` (new), `tests/e2e/{hero-image,post-styles}.test.ts` (adapt)
  - Estimate: medium
  - Kind: test
  - Model: sonnet
  - Depends: T2, T3
  - Notes:
    - **Covers:** FR-05 (the E2E half), FR-10, FR-11, FR-12, FR-13, NFR-10; AC-10, AC-11, AC-12, AC-13, AC-14, AC-18.
    - The cases are the spec's Mock E2E plan, TC-LOOK-01 to TC-LOOK-12 (design section 10). `KEPT` reads the current version from the dataset. TC-LOOK-11 uses `POST /api/test/generation-tick`; TC-LOOK-12 writes the v1 stamp through `tests/helpers/db` and skips without DB access.
    - Adapt `hero-image.test.ts` (`KEPT`, TC-HERO-09, TC-HERO-13) and `post-styles.test.ts` (TC-PS-31 and the 9:16 Review case) as design section 10 says; list each change in `reports/T4.md`.
    - If a src change turns out to be needed, stop and report it to the orchestrator; this task changes tests only.
    - **Screenshots** of wizard step 1 with the five image-style cards at 390 px and 1440 px, light and dark (`node scripts/capture-ui.mjs` or Playwright), into the gitignored `ui-captures/028/`; look at them; note the result in `reports/T4.md`.
    - Run `image-looks.test.ts` three times alone against a fresh `:3001` server (stop stray node processes except the :3002 OP-1 server after asking, `rm -rf .next`, drop and recreate `bistec_studio_test`).
    - **Gate:** tsc, lint, unit, build, the three runs above, plus the suites that touch the looks and the wizard: `hero-image`, `post-styles`, `path-b`, `agui-refinement`, `async-actions`, `brief-draft-recovery`, `analytics`, `a11y`, `ui`. `uiTokenGuard.test.ts` passes.

### Wave 4: Docs and the gate

- [x] `T6` — The docs, the full gate and CI
  - Files: `docs/handoff.md`, `docs/e2e-test-plan.md`, `CLAUDE.md`, `.specclaw/ROADMAP.md`
  - Estimate: small
  - Kind: docs
  - Model: haiku for the docs; the orchestrator watches the gate (haiku gate agents have handed back before a long E2E run finished: wait for the `MOCK_EXIT` line in the run's log)
  - Depends: T1, T2, T3, T4, T5
  - Notes:
    - **Covers:** AC-17, AC-19, and the documentation of every FR.
    - **handoff:** a 028 section: the four looks and their contracts (the FR-02 table); the look key rule and the version rule ("released" = the change is VERIFIED PASS); how to add a look or a size (a new version, the 36-row fixture pattern, the completeness test); what the fixtures prove and do not prove (NFR-11); the OP-028 procedure (the runner's command lines, the env vars, the localhost rule, the ledger and the cap of 16, `--verdict`, where the results are committed, the pass rule and its scope); the 009 evidence query, unchanged, now also showing `contractVersion` 2 rows. A **"Check before the merge"** line in the pre-merge checklist: no migration and no env var; v2 of `product-showcase` and `editorial-split` and the two new looks are opt-in on interactive Path B briefs; scheduled, MCP and ACP posts stay classic; **release note:** at 9:16 a Launch or Announcement brief now pre-fills its look (assumption A4); post-style defaults are unchanged unless T7 has run (then name the moved styles).
    - **e2e-test-plan:** section AF (TC-LOOK-01 to TC-LOOK-12), an AC-to-case table, and a note on the §AA and §AE cases that changed.
    - **CLAUDE.md:** the top entry (028 state, gates and run IDs; next is OP-028 on the user's decision, then T7, then 025, then the stale-headline badge), an "Image looks (028)" note under "Architecture decisions to remember" (the four looks; the key rule and `retired-classic`; `variantOf` as validation only; the fixture set as the merge gate; unattended stays classic; the runner and its cap), and an amendment to the Hero imagery (009) note (STORY is supported by every current look).
    - **ROADMAP:** the 028 row; T7 pending OP-028.
    - **Full gate:** stop stray node processes (ask about :3002), `rm -rf .next`, drop and recreate `bistec_studio_test`, then `npm run test:e2e:serve` and `npm run test:e2e:mock` (0 failed, 0 flaky, at least 517 passed plus §AF), tsc, lint, unit, `npm run test:render` (at least 83), `npm run build`, `npm run test:upgrade`, `rm -rf .next`. Re-run the NFR-01 `git grep -c` and the hard-rule `git diff` and record both.
    - **Push `v2`** (never `main`) and watch `gh run list --branch v2` until green; record the run IDs.

### Wave 5: After OP-028 (operator-gated)

- [x] `T7` — Post-style `versions[2]` for the looks that passed the real-image check
  - Files: `src/lib/postStyles/styles.ts`, `tests/unit/postStylesDataset.test.ts`, `tests/unit/lookCheckResults.test.ts` (new), `tests/e2e/image-looks.test.ts` (one case per moved style), `docs/handoff.md`, `CLAUDE.md`, `.specclaw/ROADMAP.md`
  - Estimate: small
  - Kind: impl
  - Model: sonnet
  - Depends: T6, OP-028
  - Deferred-Reason: blocked on OP-028, the operator's real-image check (spec FR-15). It runs only after the user has recorded a verdict for every slot and `ledger.jsonl` and `results.json` are committed under `.specclaw/changes/028-image-looks/look-check/`. If no look passed, T7 writes no post-style version and only records the verdicts in the docs.
  - Notes:
    - **Covers:** FR-16; AC-20, AC-21.
    - Follow design section 11. Only the looks `lookVerdicts` passes move: Promotion and Milestone to `spotlight`; Event and Hiring to `full-bleed-scene`. Each new version copies its v1 checklist and changes only `defaultImageStyle`; v1 is untouched; the new hashes go in the committed table; the rule-id test becomes per version with stable ids.
    - `lookCheckResults.test.ts` passes on the committed results and fails on a doctored copy (asserted on an in-memory copy, not by editing the file).
    - Check in `reports/T7.md`: `POST_STYLES_REVISION` before and after, and both derived prompt versions.
    - Docs: the verdicts and the moved defaults in the handoff 028 section; the release note in its "Check before the merge" line (the wizard pre-fills the look for the moved styles; queued entries are unaffected because they stay classic); CLAUDE.md and ROADMAP.
    - **Gate:** tsc, lint, unit, build, `image-looks.test.ts` and `post-styles.test.ts` three times each alone, then push `v2` and check CI.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
- `[>]` Deferred — blocked on a named operator step; excluded from the incomplete-task count that gates the first `verify`

## Open questions

None blocking. The assumptions the user can change are spec A1 to A10, chiefly A1 (one render per contract, cap 16), A2 and A3 (the band and STORY geometry) and A4 (9:16 Launch and Announcement pre-fill their look at merge).
