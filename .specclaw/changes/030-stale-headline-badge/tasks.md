# Tasks: Stale-headline badge

**Change:** 030-stale-headline-badge · **Size:** architectural
**Created:** 2026-10-26
**Total Tasks:** 6 in 6 waves (one at a time)

## Summary

1. **The pure module** (T1): vocabulary, normaliser, stamp, verdict, state rule, mock stand-in, notice text.
2. **The renderer** (T2): `renderPost`, the in-page check, the mock seam and mock design, the render fixtures.
3. **The stamp on every writer** (T3): the migration, the stamp helpers, generation, regenerate design, commit, rejected render, restore, adopt, the writer guard.
4. **The read side and the events** (T4): the GET `headlineImage`, the library `headlineState`, `draft.headline_edited`, `publish.settled.headlineState`, `generation.finished.headlineCheck`, the test seam.
5. **The UI and E2E** (T5): the badge, the publish dialog line, §AH.
6. **Docs, the full gate and CI** (T6).

## Process / Gates

- **One task at a time:**
  1. an implementer subagent does the task, on the model listed for it (the user's standing rule: the cheapest workable model);
  2. `specclaw:code-reviewer` (sonnet) reviews it;
  3. the orchestrator re-runs tsc, `npm run lint` and `npm run test:unit`, then commits.

  Never run two implementers in this checkout.

- **No real model or image calls** in any task (NFR-01). Every test runs on the `MOCK_AI` / `MOCK_PUPPETEER` seams or real Chromium on local fixtures.
- **Database:** only T3 touches the schema. Every prisma or DB command takes an explicit `DATABASE_URL` pointing at `bistec_studio_test`. Never touch `bistec_studio` or `bistec_studio_op1`. Use `export MSYS_NO_PATHCONV=1` before any docker command with a container path.
- **A :3002 dev server may be running** and shares `.next`. Before a build or E2E run, ask the orchestrator; do not kill it yourself.
- **A `page.waitForResponse` must be created before the action that triggers the request.**
- **Read `docs/ui-reference/DESIGN_SYSTEM.md` before T5.** No new shared component, no new `// ui-exception`.
- **Baselines (025 T12, CI green at `5531d29`):** unit 4131; render 119; lint 0 errors / 7 warnings; full clean mock E2E 548 passed / 3 skipped / 0 failed / 0 flaky. A task may add cases; it may not lower a pass count or add a lint warning. An existing case may be adapted (list it in the report), never deleted.
- **Hard rules for every task:** `PROMPT_VERSION` and `CAPTION_PROMPT_VERSION` unchanged; no file under `src/lib/agent/prompts/` changes (NFR-07). `git diff --name-only ef6c48e -- src/lib/scheduler src/mcp src/acp src/app/api/acp` lists nothing before T4, and only `src/lib/scheduler/jobRunner.ts` after it (NFR-08).
- **Report footers.** Each task writes `reports/T<n>.md` ending with a `## Verification` heading exactly (`specclaw-build check-report`). Re-read it after prettier.
- **Build context:** do not hand an implementer the `specclaw-build-context` payload (~500 KB). Give it `spec.md`, `design.md`, this task's block and the files listed.

## Tasks

### Wave 1: The pure module

- [x] `T1` — `src/lib/renderedText/`: vocabulary, normaliser, stamp, verdict, state rule, mock stand-in, notice text
  - Files: `src/lib/renderedText/{vocab,normalise,stamp,facts,mockCheck,state,noticeText,index}.ts` (new), `tests/unit/renderedText.test.ts` (new)
  - Estimate: medium
  - Kind: impl
  - Model: sonnet
  - Depends: none
  - Notes:
    - **Covers:** FR-02, FR-03, FR-08 (the verdict), FR-09, FR-10 (the stand-in), FR-11, the FR-12 builder, the FR-13 and FR-14 texts; AC-02, AC-05, AC-09.
    - Follow design section 2 exactly. Pure: zod, `HEADLINE_MAX` and the `Prisma` namespace only. No `prisma` client, no I/O.
    - `normaliseHeadline` stays self-contained. Test that `new Function('return ' + NORMALISE_HEADLINE_SOURCE)()` gives the same output as the original on: mixed case, NBSP, `\n`, ` `, ` `, decomposed and composed `é`, Sinhala.
    - `evaluateHeadlineFacts`: one test per outcome, and one per FR-08 condition flipping `painted` to `not-visible` (AC-05).
    - `mockHeadlineCheck`: painted, split by tags, `<title>` only, twice, the sentinel, entities.
    - `noticeText.ts`: `headlineNoticeText(image)` and `publishLineFor(state)` return the exact FR-13 and FR-14 sentences; the plural "post(s)" is resolved ("1 scheduled post will…", "2 scheduled posts will…").
    - **Gate:** tsc, lint, unit.

### Wave 2: The renderer

- [x] `T2` — `renderPost`, the in-page check, the mock seam, the mock design, the render fixtures
  - Files: `src/lib/renderer/puppeteer.ts`, `src/lib/testHooks.ts` (`buildMockHtml` headline and sentinel, `buildMockRefineReply` keeps the element), `tests/unit/renderPost.test.ts` (new), `tests/render/headlineCheck.test.ts` (new) and its fixtures, adapted tests that pin `buildMockHtml` output (list them)
  - Estimate: medium
  - Kind: impl
  - Model: sonnet
  - Depends: T1
  - Notes:
    - **Covers:** FR-06 to FR-10; NFR-03, NFR-04; AC-06, AC-07, AC-08.
    - Design sections 3.1 to 3.4. `renderHtmlToPng` keeps its signature and behaviour. `withRenderedPage` gains the `beforeShot` hook; the composite check still runs first.
    - The check never throws out of `renderPost`: a forced throw and a forced timeout both give `not-checked` and a PNG (AC-08, unit with the collector stubbed).
    - The render fixtures are the eleven of AC-06, each a small HTML file at 1080×1080 (one at 1080×1920). AC-07: the mock stand-in agrees with Chromium on plain, split, `<title>`-only and twice-shown. Log the check's time per fixture in the report (NFR-04).
    - `buildMockHtml` keeps `MOCK DESIGN` in the card; its new headline element is HTML-escaped.
    - No caller moves to `renderPost` yet (T3 does that), so behaviour is unchanged.
    - **Gate:** tsc, lint, unit, `npm run test:render` (119 plus the new cases).

### Wave 3: The stamp on every writer

- [x] `T3` — The migration, the stamp helpers and every FR-04 writer, plus the writer guard
  - Files: `prisma/schema.prisma`, `prisma/migrations/20261027120000_rendered_text/migration.sql` (new), `prisma/rollback/030-stale-headline-badge.down.sql` (new), `src/lib/drafts/revisions.ts`, `src/lib/agent/{types,designAgent,designAgentCli,tools,pathA,pathB,generateDraft}.ts`, `src/app/api/drafts/[id]/regenerate-design/route.ts`, `src/app/api/drafts/[id]/revisions/[rev]/restore/route.ts`, `src/app/api/generate/export/route.ts`, `tests/unit/renderedTextWriters.test.ts` (new), adapted `renderStamps`, `draftRevisions`, `compositeGeneration`, `compositeRerender`, `postStylesWriters`, `heroSeams` tests as needed
  - Estimate: large
  - Kind: migration
  - Model: sonnet
  - Depends: T2
  - Notes:
    - **Covers:** FR-01, FR-04, FR-05, NFR-03, NFR-06; AC-01, AC-03, AC-04.
    - Design sections 4.1 to 4.4. `currentRenderStamp`'s fourth argument is required. In `commitDraftRevision` the stamp is built **after** the render (design section 10); adopt keeps `rejectedRenderStamp`, which now reads `renderedText`.
    - The headline checked: generation's validated headline; regenerate design and every commit and rejected render use `designHeadline(draft, brief).text`, read inside `commitDraftRevision` / `recordRejectedRender` (one `findUnique`).
    - API-mode agent: `lastHeadlineCheck` follows `lastExportUrl`; a run with no render gives `not-checked`.
    - `generation.finished` is **not** touched here (T4).
    - Migration: `ALTER TABLE "Draft" ADD COLUMN "renderedText" JSONB;` and the same on `"DraftRevision"`; no backfill. The down script drops both. Apply with an explicit `DATABASE_URL` for `bistec_studio_test` only; run `npm run test:upgrade`.
    - The source-scan guard lists `generateDraft.ts`, `regenerate-design/route.ts` and `revisions.ts`, and fails with the path for any other file that writes `htmlContent` through Prisma.
    - **Gate:** tsc, lint, unit, render, `test:upgrade`, `npx prisma validate`.

### Wave 4: The read side and the events

- [x] `T4` — `headlineImage` on the GET, `headlineState` on the library, the three event changes, the test seam
  - Files: `src/lib/renderedText/track.ts` (new), `src/app/api/drafts/[id]/route.ts` (GET and PATCH), `src/app/api/library/route.ts`, `src/lib/api-types.ts`, `src/lib/captions/store.ts` (`settleCaptionAction` reports the headline write), `src/app/api/drafts/[id]/regenerate-copy/route.ts`, `src/lib/analytics/catalogue.ts`, `src/lib/agent/generateDraft.ts` (`emitGenerationFinished`), `src/lib/publish/{trackPublish,publishDraft}.ts`, `src/app/api/posts/[id]/publish/route.ts`, `src/lib/scheduler/jobRunner.ts`, `src/app/api/test/draft-rendered-text/route.ts` (new), `tests/unit/{draftDetailGet,analyticsCoverage,analyticsGeneration}.test.ts` and the publish / scheduler / library / captions-store tests (extend)
  - Estimate: medium
  - Kind: impl
  - Model: sonnet
  - Depends: T3
  - Notes:
    - **Covers:** FR-12, FR-15 to FR-18; NFR-02, NFR-05, NFR-08; AC-10, AC-19 (unit half).
    - Design sections 5 and 6. The scheduled-posts aggregate runs only when the state is `stale` or `unconfirmed` (the 4 s poll).
    - `trackHeadlineEdited` is the only writer of `draft.headline_edited`; no event payload holds headline text (assert it in a test).
    - AC-10: a unit test mocks the renderer and `mockHeadlineCheck` to throw and shows the GET and the library list still answer.
    - The test seam follows `src/app/api/test/worker-heartbeat/route.ts` exactly (404 in production, 404 without `MOCK_AI`, admin only).
    - `src/lib/scheduler/jobRunner.ts` is the only scheduler file that changes (NFR-08).
    - **Gate:** tsc, lint, unit.

### Wave 5: The UI and E2E

- [x] `T5` — The badge, the publish dialog line, and E2E §AH
  - Files: `src/components/drafts/HeadlineImageNotice.tsx` (new), `src/components/library/PublishDialog.tsx`, `src/app/(app)/drafts/[id]/page.tsx`, `src/app/(app)/library/page.tsx`, `tests/e2e/headline-badge.test.ts` (new, TC-HL-01 to TC-HL-10), `docs/e2e-test-plan.md` (§AH)
  - Estimate: medium
  - Kind: impl
  - Model: sonnet
  - Depends: T4
  - Notes:
    - **Covers:** FR-13, FR-14; AC-11 to AC-18, AC-19 (E2E half).
    - Design section 7. Text comes only from `noticeText.ts`. The buttons reuse the page's existing inline-edit opener and regenerate-design handler (with its confirm); disabled while `pendingAction` is set.
    - E2E (spec "Mock E2E plan"): the sentinel `__MOCK_HEADLINE_HIDDEN__` in the brief topic; the pre-030 case through `/api/test/draft-rendered-text`; a SCHEDULED post through the existing publish route with a future `scheduledAt`; events through `/api/test/analytics-events`. Run the new suite three times clean, and `a11y` on the draft page with the badge shown.
    - Before the E2E run, ask the orchestrator about a :3002 server; follow the clean-gate steps in `CLAUDE.md` (drop and recreate `bistec_studio_test`, `rm -rf .next`).
    - **Gate:** tsc, lint, unit, the new suite 3× and `a11y`.

### Wave 6: Docs, the full gate and CI

- [x] `T6` — Docs, the full clean gate and CI
  - Files: `docs/handoff.md` (the 030 section: the stamp, the states, the known limits L1 to L4, the "Check before the merge" line for the migration), `CLAUDE.md` (an Architecture-decisions bullet and the Outstanding-work entry), `.specclaw/ROADMAP.md`, `docs/e2e-test-plan.md` (coverage map row), `reports/T6.md`
  - Estimate: small
  - Kind: docs
  - Model: haiku
  - Depends: T5
  - Notes:
    - **Covers:** AC-20 and the record of every gate.
    - The full clean mock E2E: drop and recreate `bistec_studio_test`, `rm -rf .next`, then `npm run test:e2e:db`, `test:e2e:serve`, `test:e2e:mock`. Wait for the `MOCK_EXIT` line in the log; Haiku gate agents have handed back early before, so the orchestrator confirms the final counts from the log.
    - Also: `npm run build`, `npm run test:render`, `npm run test:upgrade`, the NFR-07 / NFR-08 git checks.
    - Push `v2` (orchestrator), then `gh run list --branch v2` until green.
