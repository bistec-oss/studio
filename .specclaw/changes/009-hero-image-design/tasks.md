# Tasks: Hero imagery and product-showcase design (Phase 1, thin slice)

**Change:** 009-hero-image-design · **Size:** architectural
**Created:** 2026-10-21
**Total Tasks:** 6

## Summary

This change has **6 tasks in 6 waves**, built one at a time:

1. the columns, the migration and its down script;
2. the design-data module, the pure check and the planner, with unit tests;
3. the sampler and the layout measurement, with the real-render fixtures;
4. the prompts, the pipeline wiring, quality, the budget, the mock seams and the stamp writer;
5. the brief picker, the draft notice, the refine and regenerate co-changes, and the E2E suite;
6. the docs, the full gate and CI.

Nothing ships the hero prompt without the check and the stamp (T4 lands them together). The operator step OP-1 (the real-look comparison on prod) is in `spec.md`; it is not a task and not an acceptance criterion.

## Process / Gates

- **One task at a time:**
  1. an implementer subagent does the task;
  2. `specclaw:code-reviewer` reviews it;
  3. the orchestrator re-runs tsc, `npm run lint` and `npm run test:unit`, then commits.

  Never run two implementers in this checkout (lint-staged stashes).

- **No real model calls,** and no real image-provider call. The sampler and layout tests render synthetic fixtures through the real Chromium renderer; nothing reaches OpenAI, Gemini or Claude.
- **The databases are shared.** `D:\studio` and `D:\Bistec\designer` share one Postgres and one MinIO. Never run a prisma or DB command without an explicit `DATABASE_URL` that points at `bistec_studio_test` or a named scratch database. `bistec_studio` is never touched. Use `export MSYS_NO_PATHCONV=1` before any docker command that takes a container path.
- **Baselines (023 T3, 2026-10-21, HEAD `2ad7431`):**
  - unit 2706/2706;
  - lint 0 errors / 7 warnings;
  - full clean mock E2E 405/3/0/0;
  - render 15/15 (6 `dom-facts` plus 9 `render-fidelity`).

  A task may add cases; it may not lower a pass count or add a lint warning.

- **Targeted E2E.** Every task that touches `src/` ends with the suites it can affect, run against a fresh `:3001` server (`npm run test:e2e:serve`, then `npm run test:e2e:mock -- <files>`), after `rm -rf .next` and a stop of any stray node processes.
- **The full clean mock E2E closes the change (T6):** `docker exec designer-postgres-1 psql -U bistec -d postgres -c "DROP DATABASE IF EXISTS bistec_studio_test WITH (FORCE);"`, then `npm run test:e2e:db`, `npm run test:e2e:serve` and `npm run test:e2e:mock`. `npm run test:e2e:db` does not drop the test DB itself.
- **After each push** check `gh run list --branch v2`, not just the local gate. Push to `origin v2` only; never `main`.
- **The thresholds are tuned in T3.** If a fixture fails a constant, change the fixture or the constant with a recorded reason in `reports/T3.md`; never flip an assertion's direction to make it pass.

## Tasks

### Wave 1 — Migration

- [x] `T1` — The three columns, their migration, the down script and the schema comments
  - Files: `prisma/schema.prisma`, `prisma/migrations/20261022120000_hero_composition/migration.sql` (new), `prisma/rollback/009-hero-image-design.down.sql` (new)
  - Estimate: small
  - Kind: migration
  - Depends: none
  - Notes:
    - **Covers:** FR-01; AC-01, NFR-04.
    - **Write the migration by hand.** Follow the 008 and 019 header style (additive only; the previous image keeps working: it never reads the new columns and its `brief.create` omits `imageStyle`, so the default applies), and the 016/019 down script's shape: a manual header naming what the rollback discards, `DROP COLUMN IF EXISTS` for all three, and the L24 `DELETE FROM "_prisma_migrations"` for its own row.
    - **Schema comments** state that `imageStyle` is plain TEXT so a retired key needs no migration, and that `composition` is the composition stamp, validated in `src/lib/designData/stamp.ts`, null meaning "before 009".
    - **Prove it on `bistec_studio_009_scratch` only,** created and dropped through `docker exec designer-postgres-1 psql -U bistec -d postgres`:
      1. `migrate deploy`, then check a pre-existing `Brief` row reads `imageStyle = 'classic'`;
      2. the down script (`psql -v ON_ERROR_STOP=1`, expect `DELETE 1`);
      3. `migrate deploy` again;
      4. `prisma migrate diff --from-url <scratch> --to-schema-datamodel prisma/schema.prisma --exit-code`.
    - **Then:** `npx prisma generate`, `npx prisma validate` and `npm run test:upgrade` (every scenario PASS). Confirm `scripts/test-upgrade-path.mjs` needs no edit (assumption A6); report it if it does.
    - **Report:** paste the outputs into `reports/T1.md`, with the scratch database's `pg_database` check showing it is gone.
    - The app does not use the columns yet, so tsc and unit stay green. The generated client changes `Brief`, `Draft` and `DraftRevision` types only by adding optional fields; fix any fixture that spreads a full row if tsc says so.
    - **Targeted E2E:** `path-b.test.ts` and `async-generation.test.ts` (smoke: the migrated schema is in use).

### Wave 2 — The module and the pure logic

- [x] `T2` — `src/lib/designData/`: the dataset, the mapping, `evaluateRegions`, the planner, the stamp schema, the prompt text, the layout comparison, the quality tier parser
  - Files: `src/lib/designData/{index,composition,regions,evaluate,layout,plan,stamp,promptText}.ts` (new), `src/providers/imageCapabilities.ts` (the tier parser only), `tests/unit/{designData,compositionPlan,designRegions,evaluateRegions,layoutObservation,compositionStamp,imageQuality}.test.ts` (new; `imageQuality` covers the parser only here)
  - Estimate: large
  - Kind: impl
  - Depends: T1
  - Notes:
    - **Covers:** FR-02, FR-04 (the pure planner and settle), FR-07, FR-08, the pure half of FR-11, the schema half of FR-12 and the tier parser of FR-16; AC-02, AC-03, AC-06, AC-09, AC-10, the pure half of AC-14, the schema half of AC-15, the parser half of AC-20.
    - **The shapes are in design.md sections 2 to 7.** The proposal's contract values are fixed in design.md's table; build them as `Object.freeze`d records (deep), and add the test that pins version 1 so an edit fails.
    - **Purity.** Nothing under `src/lib/designData/` may import a server module. Add the guard test (AC-02): it reads the directory's source and fails on `@/lib/prisma`, `@/lib/env`, `fs`, `puppeteer`, `minio` or a runtime `@prisma/client` import (a `import type` is allowed).
    - **`evaluateRegions` constants** are exported and named. Assert the two derived contrast luminances (`0.183` and `0.200`) in the test.
    - **`planComposition` / `settleComposition`** cover every row of the fallback table (AC-06), including the "URL but no check" row as `check-error`. They take structural inputs (no import of `background.ts`), so T4 wires them.
    - **`promptText.ts`** generates the region wording; golden strings for both archetypes and both sizes are asserted in T4's `heroPrompts.test.ts`, but write the generator and its own small unit cases here.
    - **No wiring.** Nothing in `src/` outside `designData/` and the tier parser imports the module yet, so tsc and the existing unit suite stay green.
    - **Targeted E2E:** `path-b.test.ts` (smoke only; nothing is wired).

### Wave 3 — The sampler and the layout measurement

- [x] `T3` — The Chromium sampler, the layout extraction, the real-render fixtures, and the threshold tuning
  - Files: `src/lib/renderer/puppeteer.ts`, `src/lib/renderer/layoutFacts.ts` (new), `tests/render/{heroFixtures,hero-sampler.test,hero-layout.test}.ts` (new), `reports/T3.md`
  - Estimate: medium
  - Kind: test
  - Depends: T2
  - Notes:
    - **Covers:** FR-09, the in-page half of FR-11; AC-11, AC-12 (the sampler half), the real half of AC-14.
    - **`sampleRegionLuminance`** and its `HeroCheckError` and `HERO_CHECK_TIMEOUT_MS` follow design.md section 5: `data:` URLs only, network blocked, natural dimensions first, the mapping in Node (T2's `mapRegionToImage`), point sampling with smoothing off, alpha under 128 dropped, a `Promise.race` timeout, inside the renderer's `limit`. Under `MOCK_PUPPETEER` it returns calm synthetic samples. It does not read any sentinel.
    - **`layoutFacts.ts`** measures text-node ranges and the kit's logo `<img>` through `evaluateInRenderedPage`, converts to percent in Node and calls T2's `evaluateLayout`. It ignores the background image, anything covering over 60% of the canvas, brief images and hidden elements. It never throws: an error returns `null` and is logged.
    - **Fixtures** (`heroFixtures.ts`) are HTML sources rasterized through the real renderer at test time (correction 5): a calm dark gradient, a busy stripe pattern, a mid-grey low-contrast image, a `1024x1536` image with busy content only inside its cropped rows, and a layout page with text, a logo, a background and a brief image. Square and portrait.
    - **Prove A3** (point sampling with smoothing off) on a one-pixel-grid fixture, and record it in `reports/T3.md`.
    - **Tune the constants** against the fixtures. Record each value, why it holds, and the margin (how far the calm and busy fixtures sit from `BUSY_STDDEV_MAX` and the contrast fraction). The tuning is on synthetic fixtures; say so in the report (the real fallback rate is OP-1's evidence).
    - **Run `npm run test:render`:** 15 baseline plus the new cases, 0 failed. The harness refuses to run with `MOCK_PUPPETEER` on.
    - **Targeted E2E:** `export.test.ts` and `image-to-template.test.ts` (they use `sampleImageColors` and the renderer, so a regression in `puppeteer.ts` shows there).

### Wave 4 — Prompts, pipeline, quality and the stamp

- [x] `T4` — The prompts, the pipeline wiring, the fail-closed check, quality, the budget, the mock seams and the stamp on every writer
  - Files: `src/lib/agent/prompts/{background,pathB,refine,shared}.ts`, `src/lib/agent/{background,pathB,generateDraft}.ts`, `src/lib/drafts/revisions.ts`, `src/app/api/drafts/[id]/{regenerate-design/route,inline-edit/route,refine/route,revisions/[rev]/restore/route,rejected/[revisionId]/adopt/route}.ts` (stamp carry only), `src/providers/interfaces/ImageProvider.ts`, `src/providers/implementations/image/{openai,gemini}.ts`, `src/lib/env.ts`, `.env.example`, `src/lib/testHooks.ts`, `src/lib/models/budget.ts`, `tests/unit/{heroPrompts,heroSeams}.test.ts` (new) plus the extended files named in design.md section 12 (`background`, `renderStamps`, `draftRevisions`, `draftActionModels`, `refinePrompt`, `prompts`, `geminiImage`, `toolGenerateImage`, `imageQuality`, `testHooks`, `actionBudget`, and any fixture that spreads a `RenderStamp`)
  - Estimate: large
  - Kind: impl
  - Depends: T3
  - Notes:
    - **Covers:** FR-05, FR-06, FR-10, FR-12 (every writer), the wiring half of FR-04, the observation call of FR-11, FR-16, FR-17, FR-18; AC-07, AC-08, AC-13, AC-15, AC-16 (unit half), AC-18 (unit half), AC-20, AC-22, the unit half of AC-21, AC-23.
    - **Do it in this order** so tsc guides the stamp: (1) `RenderStamp.composition`, `currentRenderStamp(model, composition)` with no default, `draftStampFields`, `revisionStampFields` and `toJsonColumn`; replace the five `...stamp` spreads; (2) `commitDraftRevision`'s required `composition` argument and every caller carrying `draftCompositionStamp(draft)` (inline edit, Override, refine verified commit, `recordRejectedRender`), `rejectedRenderStamp` and `restoredRenderStamp` reading the stored value; (3) the prompts; (4) `background.ts` and `pathB.ts`; (5) quality; (6) the seams and the budget.
    - **Classic must not move.** Capture the classic outputs of the five prompt builders at HEAD **before editing** (fixed inputs: a kit with a layout-bearing voice prompt, a campaign briefing, both modes) as the golden strings in `heroPrompts.test.ts`, then edit. The golden test is the proof of NFR-01. Bump `PROMPT_VERSION` to the build date's `YYYY-MM-DD.1` with its comment line.
    - **The closed decision.** `decisionSchema` stays `{ needed, prompt }`. Add the test that feeds `archetype`, `safeArea`, `regions` and `role` and gets `{ needed, prompt }` only. No code reads a region from a reply (AC-23's grep).
    - **One image call.** For every check-failure exit, `generateImage` runs once; the classic design prompt is built over the same URL. The fourth argument is passed only for a hero plan with `IMAGE_QUALITY` set (`parseImageTier`, `env.IMAGE_QUALITY`).
    - **Fail closed.** Wrap the whole check (the sampler, the mock seam, `evaluateRegions`) so any throw is `check-error`. The only path to the kept archetype is `{ ok: true }`.
    - **The layout observation** runs in `runPathBDesign` only for an applied non-classic archetype, with the kit's logo URLs (`kit.logoUrl` plus its LOGO artifacts); an error records nothing.
    - **`budget.ts`:** add `heroCheckMs` and `layoutMeasureMs` to the generation and Regenerate design segments (design.md section 11) and report the new worst cases against the 900 s limit in the task report. The scheduler and MCP rows stay unchanged.
    - **Seams** (`testHooks.ts`): `mockRegionSamples`, `mockLayoutBoxes` and the four `__MOCK_HERO_*__` sentinels, dormant outside `MOCK_AI` (a unit test with `MOCK_AI` off). They feed the real `evaluateRegions` and `evaluateLayout`. `mockImageProvider` keeps its signature.
    - **The refine route's contract block and re-stamp, the regenerate route's behaviour change and the wizard are T5's.** Here the refine route only passes the carried stamp so the build compiles and a refine never drops it.
    - **Adapt, never delete.** Fixtures that build a `RenderStamp` or assert exact `create` data gain the `composition` field; list the edited files in the report.
    - **Targeted E2E:** `path-b.test.ts`, `background-notice.test.ts`, `async-generation.test.ts`, `async-actions.test.ts`, `agui-refinement.test.ts`, `rejected-revisions.test.ts`, `refine-not-applied.test.ts`, `draft-inline-edit.test.ts`, `model-selection.test.ts`, `campaign-scheduling.test.ts`, `acp.test.ts`.

### Wave 5 — The UI, the co-changes and the E2E suite

- [x] `T5` — The brief picker and its API, the draft notice, the refine and regenerate co-changes, and E2E §AA
  - Files: `src/lib/brief/imageStyle.ts` (new), `src/app/api/briefs/route.ts`, `src/lib/brief/briefDraftPayload.ts`, `src/components/brief/{SizeDesignStep,ReviewStep,useBriefWizard,types}` and the brief page that passes the props, `src/lib/drafts/compositionNotice.ts` (new), `src/components/drafts/CompositionNotice.tsx` (new), `src/app/(app)/drafts/[id]/page.tsx`, `src/app/api/drafts/[id]/route.ts`, `src/lib/api-types.ts`, `src/app/api/drafts/[id]/{refine/route,regenerate-design/route}.ts`, `tests/unit/{briefImageStyle,compositionNotice}.test.ts` (new), extended `refinePrompt`, `draftActionModels`, `draftDetailGet`, `briefDraftPayload`, `tests/e2e/hero-image.test.ts` (new), `tests/e2e/a11y.test.ts` (one case)
  - Estimate: large
  - Kind: impl
  - Depends: T4
  - Notes:
    - **Covers:** FR-03, FR-13, FR-14, FR-15; AC-04, AC-05, AC-17, AC-18, AC-19, AC-21 (TC-HERO-01 to TC-HERO-16).
    - **The API.** `validateImageStyle` is pure (design.md section 9): absent is `classic`; non-string, unknown, retired and a style on `TEMPLATE` are 400; a style on `STORY` is accepted (the pipeline records `unsupported-size`).
    - **The wizard** follows design.md section 10: the "Image style" section in the Size & Design step for Path B only, built from `imageStyleOptions(aspectRatio)`, on the existing `cardCls` cards; the disabled state and reason for `STORY`; the resets; the Review row; the body and autosave field; an unknown stored value resumes as classic. No new colour, no raw palette value, no `// ui-exception` (`uiTokenGuard.test.ts` must pass).
    - **The notice.** `compositionNoticeFor` is pure with the wording in design.md section 10. `CompositionNotice.tsx` uses the `Notice` atom, `tone="warning"`, `role="status"`, `data-testid="composition-notice"` and `data-reason`; it sits beside `BackgroundNotice`. The GET route adds `composition` and `compositionNotice`; `api-types.ts` types them.
    - **Refine.** Read and parse the draft's `composition`; when applied is non-classic resolve `contractAt(applied, contractVersion, brief.aspectRatio)` and pass `compositionContract` to `buildRefineSystemPrompt`; after the background pre-step, a returned URL on a non-classic draft commits `refineReplacedStamp(prev)`; a classic draft keeps its stamp.
    - **Regenerate design.** Confirm the route passes `result.composition` to `currentRenderStamp` for both the revision row and the draft write (T4 wired the writers; T5 proves the behaviour: a retired key, a newer contract version).
    - **E2E §AA** (`hero-image.test.ts`, design.md section 12): seed with the test DB helper (which reads `.env.test` first), poll with `waitForDraft` and `waitForAction`, and reset anything a case changes. The retired-key case writes the brief's `imageStyle` directly in the test DB. Add the a11y case for `/drafts/[id]` with the notice shown to `a11y.test.ts`.
    - **Check the UI by eye** at 390 px and 1440 px on the test server (`node scripts/capture-ui.mjs --out ui-captures/009` is a review tool, not a gate), and note any issue in the report.
    - **Targeted E2E:** `hero-image.test.ts` (all 16 cases), `a11y.test.ts`, `ui.test.ts`, `path-b.test.ts`, `agui-refinement.test.ts`, `async-actions.test.ts`, `brief-draft-recovery.test.ts`, `model-selection.test.ts`, `background-notice.test.ts`, `create-post-button.test.ts`.

### Wave 6 — Docs and the gate

- [x] `T6` — The docs, the full gate and CI
  - Files: `.env.example` (only if T4 left a gap), `docs/e2e-test-plan.md`, `docs/handoff.md`, `CLAUDE.md`, `.specclaw/ROADMAP.md`, `.specclaw/changes/009-hero-image-design/reports/T6.md`
  - Estimate: medium
  - Kind: test
  - Depends: T5
  - Notes:
    - **Covers:** FR-19; AC-23 (the full greps), AC-24, AC-25.
    - **Docs.**
      - `docs/e2e-test-plan.md`: the §AA section (the 16 cases, the four sentinels, the AC map), the status-line counts, and the coverage-table row.
      - `docs/handoff.md`: the 009 section with the evidence query (design.md section 9), a line in the pre-merge prod checklist (a migration that adds three nullable or defaulted columns; `IMAGE_QUALITY` is optional and off), the 009 build record, and the **OP-1 steps verbatim** (the six briefs, the 4-of-6 bar, reading the stamps, the `medium` and `high` check on `gpt-image-2`, the 120 s bound).
      - `CLAUDE.md`: the top entry's status line and the gates.
      - ROADMAP: the 009 row.
    - **Prepare for the full run:**
      - stop stray node processes;
      - `rm -rf .next`;
      - `docker exec designer-postgres-1 psql -U bistec -d postgres -c "DROP DATABASE IF EXISTS bistec_studio_test WITH (FORCE);"`, then `npm run test:e2e:db`.
    - **Then run:**
      - `npm run test:e2e:serve` and `npm run test:e2e:mock`, for 0 failed and 0 flaky against 405/3/0/0 plus the new §AA cases;
      - tsc, `npm run lint`, `npm run test:unit`, `npm run test:render`, `npm run build` and `npm run test:upgrade`;
      - `rm -rf .next` after the build.
    - **Run the AC-23 greps** and `git diff --name-only 2ad7431 -- prisma/migrations` (only the new directory), and paste them into `reports/T6.md`.
    - **Push `v2` to `origin`** (never `main`), then watch `gh run list --branch v2` until CI is green.
    - **Record the run ID and the gate numbers** in `CLAUDE.md`'s top entry and the handoff's "Where things stand" table.
    - **Do not claim OP-1.** The verify report lists it as the user's pending operator step.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
- `[>]` Deferred
