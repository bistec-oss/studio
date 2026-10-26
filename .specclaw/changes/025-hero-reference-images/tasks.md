# Tasks: Hero product screenshots (009 Phase 2)

**Change:** 025-hero-reference-images · **Size:** architectural
**Created:** 2026-10-25
**Total Tasks:** 12 (5 in Group A, then OP-025, then 7 in Group B, which are operator-gated)

## Summary

This change has **12 tasks in 6 waves**:

1. **Group A, the dataset:** the composite purpose, `device-screen` v1, `requires`, the blank check, the reasons, the stamp field, the prompt text and the mock screen sentinel (T1).
2. **Group A, after T1, one at a time:** availability by `requires` (T2), the fixtures (T3), the probe route and `--probe` runner (T4).
3. **Group A docs, gate and CI** (T5). The Group A verify (AC-01 to AC-08) can run after T5.
4. **OP-025 is not a task.** The operator runs `run-look-check.mjs --probe` on the user's decision.
5. **Group B, after an OP-025 go** (all deferred until then): apply the OP-025 result (T6), storage and the brief (T7), the composite engine and generation (T8), the re-render paths and the editor (T9), the wizard (T10).
6. **Group B E2E** (T11), then the docs, the full gate and CI (T12). The final verify runs after T12.

## Process / Gates

- **One task at a time:**
  1. an implementer subagent does the task (the suggested model is listed per task; the user's standing rule is the cheapest workable model);
  2. `specclaw:code-reviewer` (sonnet) reviews it;
  3. the orchestrator re-runs tsc, `npm run lint` and `npm run test:unit`, then commits.

  Never run two implementers in this checkout.

- **No real model or image calls** in any task. Every test runs on the `MOCK_AI` / `MOCK_PUPPETEER` seams, fixture datasets or synthetic fixtures. The runner is run only by unit tests and `--dry-run`.
- **Database:** only T7 touches the schema. Every prisma or DB command takes an explicit `DATABASE_URL` pointing at `bistec_studio_test`. `bistec_studio` and `bistec_studio_op1` are never touched by a task. Use `export MSYS_NO_PATHCONV=1` before any docker command with a container path.
- **The OP-1/OP-028 dev server may be running on :3002** and shares `.next`. Before any build or E2E run, ask the orchestrator; do not kill it yourself.
- **A `page.waitForResponse` must be created before the action that triggers the request** (the 023 lesson).
- **Read first:** `docs/ui-reference/DESIGN_SYSTEM.md` before T9 and T10. No new component without need, and no new `// ui-exception`.
- **Baselines (028 T6/T7 and 029, at `45fae1a`):** unit 3903/3903; render 84/84; lint 0 errors / 7 warnings; full clean mock E2E 529 passed / 3 skipped / 0 failed / 0 flaky. A task may add cases; it may not lower a pass count or add a lint warning. An existing case may be adapted (list it in the task report), never deleted.
- **Hard rule for every task (NFR-10):** `git diff --name-only 45fae1a -- src/lib/scheduler src/mcp src/acp src/app/api/acp src/lib/campaign` lists nothing. **Group A tasks also** leave `prisma/`, `.env.example` and `src/lib/env.ts` untouched.
- **Report footers.** Each task writes `reports/T<n>.md` ending with a `## Verification` heading exactly (`specclaw-build check-report`). Re-read it after prettier.

## Tasks

### Wave 1: Group A, the dataset

- [x] `T1` — The composite purpose, `device-screen` v1, the blank check, the reasons, the stamp field and the prompt text
  - Files: `src/lib/designData/{composition,validate,evaluate,plan,stamp,promptText,index}.ts`, `src/lib/designData/composite.ts` (new), `src/lib/testHooks.ts` (`mockRegionSamples` per region, `__MOCK_HERO_SCREEN__`), `src/lib/drafts/compositionNotice.ts`, `tests/unit/{lookDataset,designData,designDataBoundary,heroPrompts,compositionStamp,compositionNotice,compositionPlan,heroSeams,designRegions}.test.ts` (adapt and extend), `tests/unit/compositeFacts.test.ts` (new)
  - Estimate: large
  - Kind: impl
  - Model: sonnet
  - Depends: none
  - Notes:
    - **Covers:** FR-01 to FR-07; NFR-02, NFR-04; AC-01 to AC-05.
    - Follow design sections 2 to 6 and 15. The rows are spec FR-02 verbatim; assert 16:10 in canvas px within 0.5%.
    - Run the four released hashes **before and after**; they must not change. Compute and commit the `device-screen@1` hash.
    - `evaluateCompositeFacts` and `COMPOSITE_TOLERANCE_PX` go in `designData/composite.ts` (pure). Unit-test found, complete, `naturalWidth`, the box tolerance on each edge, and each of the five hit points.
    - `settleComposition` gains the optional third argument (design section 4). It is unit-tested here, wired in T8.
    - `__MOCK_HERO_BUSY__` and every other existing sentinel keep their exact meaning; `heroSeams.test.ts` proves it.
    - The tests that enumerate look keys or reasons (`designDataBoundary` four keys, `compositionStamp` 8 reasons, `postStylesResolve`, `postStylesWizard`) are adapted, and each change is listed in the report.
    - **Gate:** tsc, lint, unit, `npm run test:render` (84 unchanged; T3 adds the new cases).

### Wave 2: Group A, availability, fixtures and the probe (one at a time)

- [x] `T2` — Availability by `requires`: picker, resolver, plan and `POST /api/briefs`
  - Files: `src/lib/designData/{composition,plan}.ts` (`imageStyleOptions` opts, `planComposition` flag), `src/lib/postStyles/{resolve,types}.ts`, `src/lib/brief/compositeSource.ts` (new, pairing rule only), `src/app/api/briefs/route.ts`, `src/lib/agent/briefInput.ts` (pass the flag), `src/lib/brief/wizardStyleState.ts`, `src/components/brief/SizeDesignStep.tsx` (unavailable reason text), `tests/unit/{postStylesResolve,postStylesWizard,briefImageStyle,compositionPlan,compositeSource}.test.ts`, `tests/e2e/product-screenshots.test.ts` (new; TC-SHOT-01 only)
  - Estimate: medium
  - Kind: impl
  - Model: sonnet
  - Depends: T1
  - Notes:
    - **Covers:** FR-08; AC-06.
    - Follow design sections 2 and 7. `missing-input-classic` is checked after `retired-classic`. In Group A the source is always absent, so `device-screen` is unavailable everywhere and `POST /api/briefs` is 400 `IMAGE_STYLE_NEEDS_SCREENSHOT`.
    - The picker shows the `device-screen` card disabled with "Needs a product screenshot".
    - **Gate:** tsc, lint, unit, build (then `rm -rf .next`), and TC-SHOT-01 plus `post-styles.test.ts` and `image-looks.test.ts` alone against a fresh `:3001` server.

- [x] `T3` — Fixtures for `device-screen`: 12 rows, the screen kind and the completeness rule
  - Files: `tests/render/{lookFixtureTable,lookFixtures,look-fixtures.test}.ts`, `tests/unit/lookFixtureCompleteness.test.ts`; `src/lib/designData/{composition,evaluate}.ts` and the T1 hash **only** if a row or `BLANK_STDDEV_MAX` must be tuned
  - Estimate: medium
  - Kind: test
  - Model: sonnet
  - Depends: T1
  - Notes:
    - **Covers:** FR-04 (the render half); AC-03 (render), AC-08.
    - Follow design section 9. Tuning: change the fixture first. Change a row or the threshold only if the fixture cannot be made fair; then update the `device-screen@1` hash in the same commit and record why. The four released contracts and `BUSY_STDDEV_MAX` are never touched.
    - Record in `reports/T3.md` the measured L\* standard deviation of the pass and screen fixtures per size.
    - **Gate:** tsc, lint, unit, `npm run test:render` (at least 96, all passing, run twice).

- [x] `T4` — The probe route and `run-look-check.mjs --probe`
  - Files: `src/app/api/admin/look-probe/route.ts` (new), `src/lib/agent/background.ts` (`onPrompt` callback only), `scripts/look-check/{lookCheck,run-look-check}.mjs`, `tests/unit/{lookProbe,lookCheck}.test.ts`, `.specclaw/changes/025-hero-reference-images/look-check/.gitignore` (new: `renders/`)
  - Estimate: medium
  - Kind: impl
  - Model: sonnet
  - Depends: T1, T2
  - Notes:
    - **Covers:** FR-09; NFR-01 (the probe is the only new image call site); AC-07.
    - Follow design section 8. The route is `withTeamAuth` plus a super-admin check, and 404 when `NODE_ENV === 'production'`. It writes no row, and deletes the persisted IMAGES object after building the response.
    - In the runner: probe mode reuses `parseLedger`, `planNext` and `checkBase`; `capFor` gains an optional per-slot maximum (the 028 default stays 2 and its tests are unchanged); add `probeVerdicts` and per-attempt `--verdict <slot>#<n>=accept|reject`; write the ledger line before each request; credentials only from the env.
    - **Do not run the runner against a server.** Run only `node scripts/look-check/run-look-check.mjs --probe --out <scratch dir> --dry-run`, and record its output in `reports/T4.md`.
    - **Gate:** tsc, lint, unit.

### Wave 3: Group A docs and gate

- [x] `T5` — Group A docs, the gate and CI
  - Files: `docs/handoff.md`, `docs/e2e-test-plan.md`, `CLAUDE.md`, `.specclaw/ROADMAP.md`
  - Estimate: small
  - Kind: docs
  - Model: haiku for the docs; the orchestrator watches the gate (wait for the `MOCK_EXIT` line in the run's log)
  - Depends: T1, T2, T3, T4
  - Notes:
    - **Covers:** the Group A documentation; AC-07 (the procedure).
    - **handoff:** a 025 section. It covers the Group A state; `device-screen` (unavailable until Group B); the blank threshold; and **the OP-025 procedure**:
      - the server: `:3002` on `bistec_studio_op1`, migrated to head, with `MOCK_*` off and the user's OpenAI key at `/settings`;
      - the env vars;
      - `--probe` command lines;
      - the cap of 9 and the ledger;
      - per-attempt `--verdict`;
      - the pass rule;
      - what a fail at a size means.
    - **CLAUDE.md:** the top entry (025 Group A state; next is OP-025 on the user's decision). **ROADMAP:** the 025 row.
    - **e2e-test-plan:** section AG with TC-SHOT-01; the rest are planned.
    - **Gate:** stop stray node processes (ask about :3002), `rm -rf .next`, drop and recreate `bistec_studio_test`, then `npm run test:e2e:serve` and `npm run test:e2e:mock` (0 failed, 0 flaky, at least 530 passed), tsc, lint, unit, `npm run test:render`, build, `rm -rf .next`. Push `v2` (never `main`) and watch `gh run list --branch v2` until green.

- [x] `T13` — Amendment A1: screen detection, the stamp rect, fixtures and `--recheck`
  - Files: `src/lib/designData/{composite,evaluate,plan,stamp,index}.ts`, `src/lib/renderer/puppeteer.ts` (`sampleLuminanceGrid` only), `src/lib/agent/background.ts` (the check wiring only), `src/lib/testHooks.ts` (the grid seam, `__MOCK_HERO_SCREEN_OFFSET__`), `src/lib/drafts/compositionNotice.ts` (the `composite-not-blank` wording), `src/app/api/admin/look-probe/route.ts` (`rect` in the response), `scripts/look-check/{lookCheck,run-look-check}.mjs` (`--recheck`), `tests/unit/{compositeFacts,compositionStamp,compositionPlan,heroSeams,lookProbe,lookCheck,compositionNotice}.test.ts`, `tests/unit/screenDetect.test.ts` (new), `tests/render/{lookFixtureTable,lookFixtures,look-fixtures.test}.ts`, `tests/unit/lookFixtureCompleteness.test.ts`
  - Estimate: large
  - Kind: impl
  - Model: sonnet
  - Depends: T1, T2, T3, T4, T5
  - Notes:
    - **Covers:** spec Amendment A1 (FR-04 composite branch, FR-06 rect, AC-03, AC-08 as amended); design section 21.
    - The four released contracts, their hashes, `BUSY_STDDEV_MAX` and `BLANK_STDDEV_MAX` are unchanged. The `device-screen@1` rows are unchanged.
    - `--recheck` makes no network call and no image call. The orchestrator runs it on the 4 saved renders; it must reproduce the prototype verdicts in spec A1 (SQUARE 1 fail; SQUARE 2, PORTRAIT 1 and STORY 1 pass).
    - **Gate:** tsc, lint, unit, `npm run test:render` twice, then the targeted E2E (TC-SHOT-01, `image-looks`, `hero-image`, `post-styles`) on a fresh `:3001`.
- [x] `T14` — Amendment A1 docs (handoff, CLAUDE.md, e2e plan)
  - Files: `docs/handoff.md`, `CLAUDE.md`, `docs/e2e-test-plan.md`
  - Estimate: small
  - Kind: docs
  - Model: haiku
  - Depends: T13
  - Notes: the A1 decision, the detector, the OP-025 recheck procedure and state. Then OP-025 resumes on the user's go (re-judge, verdicts, remaining attempts).

### Wave 4: Group B setup (after an OP-025 go)

- [x] `T6` — Apply the OP-025 result to `device-screen` v1
  - Files: `src/lib/designData/composition.ts`, `tests/unit/lookDataset.test.ts` (hash), `tests/render/lookFixtureTable.ts`, `tests/unit/lookFixtureCompleteness.test.ts`, `docs/handoff.md`
  - Estimate: small
  - Kind: impl
  - Model: haiku
  - Depends: T14, OP-025
  - Deferred-Reason: blocked on OP-025, the operator's probe (spec FR-09). It runs only after the user has recorded a verdict for every attempt and `ledger.jsonl` and `results.json` are committed under `.specclaw/changes/025-hero-reference-images/look-check/`. If no size passed, the change stops: T6 instead removes `device-screen` from the dataset (it was never released), and T7 to T12 are cancelled.
  - Notes:
    - Remove each size that failed from v1; commit the final hash; drop its fixture rows. Record the per-size verdicts in the handoff.
    - **Gate:** tsc, lint, unit, `npm run test:render`.

- [x] `T7` — Private storage, the upload and preview routes, `Brief.compositeSource`, brief drafts and draft delete
  - Files: `prisma/schema.prisma`, `prisma/migrations/20261026120000_composite_source/migration.sql` (new), `prisma/rollback/025-hero-product-screenshots.down.sql` (new), `src/lib/storage/minio.ts` (`getObjectBytes`, `headObject`), `src/lib/composite/imageHeader.ts` (new), `src/app/api/briefs/screenshots/route.ts` (new), `src/app/api/briefs/route.ts`, `src/lib/brief/{compositeSource,briefDraftPayload,briefDrafts}.ts`, `src/app/api/drafts/[id]/route.ts` (delete only), `tests/unit/{imageHeader,compositeSource,briefDraftPayload}.test.ts`, `tests/e2e/product-screenshots.test.ts` (TC-SHOT-02 to TC-SHOT-06, TC-SHOT-14)
  - Estimate: large
  - Kind: migration
  - Model: sonnet
  - Depends: T6
  - Deferred-Reason: blocked on OP-025 (via T6).
  - Notes:
    - **Covers:** FR-10, FR-11; NFR-03, NFR-06, NFR-07; AC-09, AC-10.
    - Follow design sections 7, 10 (`imageHeader`), 12 (brief drafts, draft delete) and 14. Create the migration by hand (one `ALTER TABLE`), and apply it only with `DATABASE_URL` for `bistec_studio_test`. `npm run test:upgrade` must pass.
    - The preview route accepts `key` (session team and user must match) and, for T9, `key&draftId` (the draft must be visible and the key must equal its stamp's key). Both are 404 otherwise.
    - **Gate:** tsc, lint, unit, build, `test:upgrade`, the listed TC-SHOT cases and `brief-draft-recovery.test.ts` alone against a fresh server.

### Wave 5: Group B, the composite (one at a time)

- [x] `T8` — The composite engine, the renderer check and generation
  - Files: `src/lib/composite/{insert,assets}.ts` (new), `src/lib/renderer/puppeteer.ts`, `src/lib/agent/{pathB,designAgentCli,designAgent,tools}.ts`, `src/lib/testHooks.ts` (`__MOCK_COMPOSITE_FAIL__`), **every** `renderHtmlToPng` / `evaluateInRenderedPage` caller (each passes `null` for now except generation; T9 wires the stamp), `tests/unit/{compositeInsert,compositeAssets}.test.ts`, `tests/render/composite.test.ts` (new), `tests/e2e/product-screenshots.test.ts` (TC-SHOT-07 to TC-SHOT-09)
  - Estimate: large
  - Kind: impl
  - Model: sonnet (move to opus if the first review asks for changes to the renderer or the fallback)
  - Depends: T7
  - Deferred-Reason: blocked on OP-025 (via T6).
  - Notes:
    - **Covers:** FR-12 to FR-15; NFR-05, NFR-07, NFR-08; AC-11, AC-12, AC-13.
    - Follow design sections 10, 11 and the generation part of 12. The `composites` argument is **required** (tsc lists every caller; list them in the report).
    - `tests/render/composite.test.ts` (real Chromium) covers the AC-12 quadrant-colour test at each size, plus the three failing cases (missing object, covering element, moved element). Record the `setContent` time for a 10 MB screenshot.
    - The fallback deletes the uploaded export and re-runs the design once as classic with no hero image. Assert exactly one image call and two design calls through the model-calls recorder.
    - **Gate:** tsc, lint, unit, `npm run test:render` twice, build, `hero-image.test.ts`, `image-looks.test.ts`, `path-b.test.ts` and the listed TC-SHOT cases alone.

- [x] `T9` — Refine, override, inline edit, restore, export, the verifiers and the editor
  - Files: `src/app/api/drafts/[id]/{refine/route,inline-edit/route,revisions/[rev]/restore/route}.ts` (paths as found), `src/app/api/generate/export/route.ts`, `src/lib/drafts/{revisions,draftActions}.ts`, `src/lib/agent/refineAttempt.ts`, `src/lib/renderer/{domFacts,layoutFacts}.ts`, `src/components/drafts/InlineEditModal.tsx`, `tests/unit/*` as needed, `tests/e2e/product-screenshots.test.ts` (TC-SHOT-10 to TC-SHOT-12)
  - Estimate: large
  - Kind: impl
  - Model: sonnet
  - Depends: T8
  - Deferred-Reason: blocked on OP-025 (via T6).
  - Notes:
    - **Covers:** FR-16; NFR-05, NFR-08; AC-14, AC-16 (the unit guard).
    - Follow the re-render part of design section 12. The action error text is the spec's, verbatim. The layout observation excludes `[data-composite]`.
    - Add the NFR-05 unit guard (no writer stores an `http` URL with `screenshots/`).
    - **Gate:** tsc, lint, unit, build, `agui-refinement`, `async-actions`, `inline-edit` (as named in the repo), `regression` H7, and the listed TC-SHOT cases alone.

- [x] `T10` — The wizard: the screenshot field, the picker, review, autosave and resume
  - Files: `src/components/brief/{SizeDesignStep,ReviewStep}.tsx`, `src/components/brief/useBriefWizard.ts`, `src/lib/brief/wizardStyleState.ts`, `tests/unit/postStylesWizard.test.ts`, `tests/e2e/product-screenshots.test.ts` (TC-SHOT-13)
  - Estimate: medium
  - Kind: impl
  - Model: sonnet
  - Depends: T7
  - Deferred-Reason: blocked on OP-025 (via T6).
  - Notes:
    - **Covers:** FR-17; NFR-09; AC-15.
    - Follow design section 13. Use existing primitives only. Take screenshots at 390 px and 1440 px, light and dark, into `ui-captures/025/`; look at them; note the result in the report.
    - **Gate:** tsc, lint, unit, build, `uiTokenGuard`, `post-styles`, `brief-draft-recovery`, `a11y`, `ui` and TC-SHOT-13 alone.

### Wave 6: Group B E2E, docs and the gate

- [x] `T11` — E2E §AG complete and the NFR-05 end-to-end check
  - Files: `tests/e2e/product-screenshots.test.ts`
  - Estimate: small
  - Kind: test
  - Model: sonnet
  - Depends: T8, T9, T10
  - Deferred-Reason: blocked on OP-025 (via T6).
  - Notes:
    - **Covers:** AC-13 to AC-16 (E2E halves).
    - Fill any TC-SHOT case not yet written. Add the AC-16 sweep: after generation, refine and inline edit, every `htmlSnapshot` holds `__COMPOSITE_0__` and no `screenshots/` string (through `tests/helpers/db`; skip without DB access).
    - Run the file three times alone against a fresh server. If a src change is needed, stop and report it.

- [x] `T12` — Docs, the full gate and CI
  - Files: `docs/handoff.md`, `docs/e2e-test-plan.md`, `CLAUDE.md`, `.specclaw/ROADMAP.md`
  - Estimate: small
  - Kind: docs
  - Model: haiku for the docs; the orchestrator watches the gate
  - Depends: T11
  - Deferred-Reason: blocked on OP-025 (via T6).
  - Notes:
    - **Covers:** AC-17, AC-18 and the documentation of every FR.
    - **handoff:** the 025 section (the engine, the token rule, the render check, the fallbacks, storage and tenancy, the limits). Add a **"Check before the merge"** line: the migration `20261026120000_composite_source` with its down script; no env var; `BUCKET_DOCS` now also holds `screenshots/`; `device-screen` is opt-in on interactive Path B; unattended stays classic.
    - **CLAUDE.md:** the top entry, and a "Product screenshots (025)" note under "Architecture decisions to remember". **e2e-test-plan:** §AG with an AC-to-case table. **ROADMAP:** the 025 row.
    - **Full gate:** clean `.next`, a fresh `bistec_studio_test`, then full mock E2E (0 failed, 0 flaky, at least 529 plus §AG), tsc, lint, unit, render, build, `test:upgrade`. Record the NFR-01 `git grep -c` and the NFR-10 `git diff`. Push `v2` and watch CI until green; record the run IDs.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
- `[>]` Deferred: blocked on a named operator step; excluded from the incomplete-task count that gates the first `verify`

## Open questions

None blocking. The assumptions the user can change are spec A1 to A5, chiefly:

- A1: reuse `BUCKET_DOCS`;
- A2 and A3: the geometry and the blank threshold;
- A4: `contain` on black.
