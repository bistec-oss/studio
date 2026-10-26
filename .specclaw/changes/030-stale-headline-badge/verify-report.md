# Verify Report: 030-stale-headline-badge

**Verified:** 2026-10-26 · **Model:** Sonnet · **HEAD:** `6929619` (030 code at `57fce05`; `6929619` is docs only)
**Verdict:** PASS (20/20 ACs)

I read spec.md, the T1 to T6 and T6-docs reports, the T1 to T5 reviews, the handoff 030 section and the 025 report format. I re-ran tsc, the focused unit set, `npm run test:render` and the AC-20 git checks at HEAD. I opened the test behind each AC. I did not run E2E, lint, the build or `test:upgrade`; those are cited from the T6 gate, the orchestrator's collector and CI.

## Gates

| Gate           | Result                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| tsc            | clean (I ran `npx tsc --noEmit`, exit 0, no output)                                                   |
| lint           | 0 errors / 7 warnings (T6 gate; the collector's lint run passed)                                      |
| unit           | 4253/4253, 173 files (collector at HEAD). My focused run: 15 files, 413/413                           |
| render         | 134/134, 7 files (I ran `npm run test:render`, 127 s). Baseline 119, so +15 (`headlineCheck.test.ts`) |
| build          | pass (collector at HEAD)                                                                              |
| `test:upgrade` | ALL PASS in 55.3 s (`reports/T3.md`; no migration since)                                              |
| CI             | green at `57fce05`, run 40291119564 (build, unit, e2e all success)                                    |

## E2E

The collector ran **no E2E tier**, and I ran none. The E2E evidence is the T6 local full clean mock run at `f317d45` (559 passed / 3 skipped / 0 failed / 0 flaky; the 3 skips are the intentional TC-REG-H11a/b/c) plus CI run 40291119564 at `57fce05`. The baseline was 548; 559 is +10 for §AH (`tests/e2e/headline-badge.test.ts`, TC-HL-01 to 10) and +1 a11y case. The first full run failed 5 §T cases (the badge buttons' names collided with old locators); T6 fixed that with contextual accessible names and `exact: true`, and the second run passed. The T3 and T4 CI runs were red on `modelBoundary.test.ts` (it did not mock `renderPost`); fixed test-only at `57fce05`, and `modelBoundary.test.ts` passes in my run.

## Acceptance Criteria

- ✅ **AC-01 migration.** `git diff ef6c48e --stat -- prisma` is exactly `migrations/20261027120000_rendered_text/migration.sql` (4 lines, two additive `ADD COLUMN`s, no backfill), `prisma/rollback/030-stale-headline-badge.down.sql` and `schema.prisma`. `test:upgrade` ALL PASS in `reports/T3.md` (not re-run).
- ✅ **AC-02 schema.** `renderedText.test.ts`: accepts both shapes, "refuses the malformed shapes" (verified with a reason, unverified without, unknown reason, text over `HEADLINE_MAX`), "reads an unparsable stored value as null", `renderedTextColumn` DbNull and throw. Passes in my run.
- ✅ **AC-03 writer guard.** `renderedTextWriters.test.ts` (`030 AC-03`): the scan is non-vacuous, no file outside the list writes HTML, every HTML write spreads `draftStampFields(` or `revisionStampFields(`, every literal holding HTML spreads a helper, each allowed file covers both models. Clean `tsc` enforces the required fourth argument of `currentRenderStamp`.
- ✅ **AC-04 writer stamps.** Behavioural cases are in `renderStamps.test.ts`, `draftRevisions.test.ts` and `compositeRerender.test.ts` (generation, regenerate design, commit and rejected render against the headline read before the render, adopt, restore with a null legacy row). All pass. See Deviations.
- ✅ **AC-05 verdicts.** `renderedText.test.ts` covers `evaluateHeadlineFacts` for the four outcomes and each FR-08 condition alone (visibility, empty box, outside the canvas, clipped, covered). Passes.
- ✅ **AC-06 real Chromium.** `tests/render/headlineCheck.test.ts` (in my 134/134): plain h1, span plus br, uppercase over lower-case, title only, display none, opacity 0, overflow hidden parent, covered, outside the canvas, shown twice, a STORY canvas, and a 025 composite with a visible headline. Each asserts the stated outcome.
- ✅ **AC-07 agreement.** The same render file asserts the mock stand-in agrees with Chromium on the plain, split, title-only and twice-shown fixtures (`renderedText.test.ts` covers the stand-in itself).
- ✅ **AC-08 never fails.** `renderPost.test.ts` "runHeadlineCheck is bounded and never throws": a throw in the page gives `not-checked`, logged once; a hang gives `not-checked` after the timeout. The render still produces the PNG (render suite).
- ✅ **AC-09 state rule.** `renderedText.test.ts` covers `headlineState`: unknown for a null stamp or null headline, unconfirmed for `verified: false`, fresh for equal, case-only and whitespace-only, stale otherwise.
- ✅ **AC-10 read model.** `draftDetailGet.test.ts` (`headlineImage` fields by state, `scheduledPosts` only when stale or unconfirmed) and `libraryHeadlineState.test.ts` (list `headlineState`); both with the parser and renderer mocked to throw. Pass.
- ✅ **AC-11 stale badge after an edit.** E2E TC-HL-01 (old headline text, Edit inline and Regenerate design buttons).
- ✅ **AC-12 regenerate headline.** E2E TC-HL-02.
- ✅ **AC-13 badge clears.** E2E TC-HL-03 (an inline edit that paints the new headline clears it, and so does Regenerate design).
- ✅ **AC-14 hidden headline.** E2E TC-HL-04 (`__MOCK_HEADLINE_HIDDEN__` shows the `unconfirmed` badge with the not-visible sentence, still unconfirmed after an edit).
- ✅ **AC-15 pre-030.** E2E TC-HL-05 (null stamp, no badge after an edit) and TC-HL-06 second half (restoring a stamp-nulled revision gives `unknown` and no badge).
- ✅ **AC-16 restore and adopt.** Restore half: E2E TC-HL-06 (restoring the pre-edit revision keeps `stale`). Adopt half: unit only (`draftRevisions.test.ts`, `renderStamps.test.ts`; the adopt stamp is the rejected row's). See Deviations.
- ✅ **AC-17 scheduled line.** E2E TC-HL-07.
- ✅ **AC-18 publish dialog.** E2E TC-HL-08 (draft page: line when stale, none when fresh, Confirm usable) and TC-HL-09 (library page line for a stale draft, no library badge).
- ✅ **AC-19 events.** E2E TC-HL-10 (`draft.headline_edited` once per change with via and state, none for an unchanged save, `publish.settled` carries `headlineState`). Unit: `trackHeadlineEdited.test.ts` (no text in the payload, a case-only change still counts, never throws), `analyticsEmitters.test.ts` section "publish.settled headlineState" (immediate path and MCP/ACP tool, scheduler tick), `analyticsGeneration.test.ts` (`headlineCheck` on `generation.finished`), `analyticsCoverage.test.ts` (every `HEADLINE_STATES` and `HEADLINE_CHECKS` value is carried). All pass in my run.
- ✅ **AC-20 gates.** Table above; every floor met (unit 4253 vs 4131, render 134 vs 119, E2E 559/3/0/0 vs 548/3/0/0); CI green at `57fce05`. My git checks against `ef6c48e`: `git diff --name-only -- src/lib/scheduler src/mcp src/acp src/app/api/acp` lists only `src/lib/scheduler/jobRunner.ts` (the FR-16 `trackPublish` caller); `git diff -- src/lib/agent/prompts` is 0 bytes; no changed line mentions `PROMPT_VERSION` or `CAPTION_PROMPT_VERSION`. The sync generation writer (`generateDraft.ts`) is outside the listed paths. I did not re-run lint, the build or `test:upgrade`.

## Deviations

- AC-04's behavioural cases live in `renderStamps.test.ts`, `draftRevisions.test.ts` and `compositeRerender.test.ts`, not in the writer guard file. The guard file proves the structural half (AC-03). Still met.
- AC-16's adopt half has unit coverage only, no E2E. The stamp logic is a pure carry of the rejected row's stamp. Still met.
- TC-HL-02 seeds an older painted headline through the test DB, because the mock regenerate-copy returns the same headline as generation. The route under test is the real one; only the precondition is seeded.
- The badge's Regenerate design button is hidden for non-Path-B drafts (the existing action is Path B only).
- The badge buttons carry contextual accessible names; old §T locators now use `exact: true`.
- The T4 seam is gated by `withTeamAdmin`.

## Known limits

From spec.md and the handoff:

- **L1.** Contrast and colour are not checked; text the same colour as its background reads as painted.
- **L2.** The check confirms the headline text is painted, not that it is the design's headline (it could sit in a footer).
- **L3.** A partly covered line passes when its centre is uncovered.
- **L4.** The mock stand-in sees text, not CSS; only the sentinel produces `not-visible` in mock runs.
- **L5.** An overlay with `pointer-events: none` is not seen by `elementFromPoint`, so text it covers still reads as painted (T2 review NOTE 3; `docs/handoff.md` line 30).
- **L6.** A page whose CSP forbids `unsafe-eval` gives `not-checked`, because the collector is rebuilt with `new Function` (T2 review NOTE 3; `docs/handoff.md` line 31). Neither changes a verdict here.
- A model that rewords the headline gives `unconfirmed` on a fresh draft; `generation.finished.headlineCheck` measures how often.
- Apply to image is out of scope (D1); it waits on the three events.

## Per-task reviews

- T1 — NOTE
- T2 — NOTE (one WARN fixed by the orchestrator)
- T3 — WARN (fixed by the orchestrator)
- T4 — PASS
- T5 — NOTE

## Verification

Command: `npx tsc --noEmit`
Exit: 0
Output (tail):

```
(no output)
```

Command: `npx vitest run tests/unit/renderedText.test.ts tests/unit/renderPost.test.ts tests/unit/renderedTextWriters.test.ts tests/unit/renderStamps.test.ts tests/unit/draftRevisions.test.ts tests/unit/compositeRerender.test.ts tests/unit/draftDetailGet.test.ts tests/unit/libraryHeadlineState.test.ts tests/unit/trackHeadlineEdited.test.ts tests/unit/analyticsCoverage.test.ts tests/unit/analyticsGeneration.test.ts tests/unit/analyticsEmitters.test.ts tests/unit/captionStore.test.ts tests/unit/captionRoutes.test.ts tests/unit/modelBoundary.test.ts`
Exit: 0
Output (tail):

```
 Test Files  15 passed (15)
      Tests  413 passed (413)
   Duration  2.28s
```

Command: `npm run test:render`
Exit: 0
Output (tail):

```
 Test Files  7 passed (7)
      Tests  134 passed (134)
   Duration  126.98s
```

Command: `git diff --name-only ef6c48e -- src/lib/scheduler src/mcp src/acp src/app/api/acp`
Exit: 0
Output (tail):

```
src/lib/scheduler/jobRunner.ts
```

Command: `git diff ef6c48e -- src/lib/agent/prompts | wc -c`, and a grep of `git diff ef6c48e -U0 -- src` for `PROMPT_VERSION` or `CAPTION_PROMPT_VERSION`
Exit: 0
Output (tail):

```
0
(no matching changed lines)
```
