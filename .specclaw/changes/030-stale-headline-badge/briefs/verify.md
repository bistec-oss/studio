# Verify brief (030-stale-headline-badge)

You are the verifier for specclaw change 030-stale-headline-badge in D:\studio (branch v2, HEAD `6929619`; the last code commit is `57fce05`). Judge each acceptance criterion in `spec.md` against the code and the tests, and write `verify-report.md`. Do not modify any source or test file. Do not commit. Do not run E2E, a dev server, a build or any DB command.

**Read:**

- `.specclaw/changes/030-stale-headline-badge/spec.md` (all; AC-01 to AC-20 are the ground truth), `design.md`, `tasks.md`;
- `reports/T1.md` to `T6.md` and `T6-docs.md`, `reviews/T1.md` to `T5.md`;
- the 030 section at the top of `docs/handoff.md`;
- the format to follow: `.specclaw/changes/025-hero-reference-images/verify-report.md`.

**Evidence already gathered (cite it; do not re-run):**

- Local full gate at `f317d45` (`reports/T6.md`): full clean mock E2E 559 passed / 3 skipped / 0 failed / 0 flaky. The 3 skips are the intentional TC-REG-H11a/b/c. The baseline was 548, plus 10 for §AH (`tests/e2e/headline-badge.test.ts`, TC-HL-01 to 10) plus 1 a11y case. Also unit 4253/4253, render 134/134, lint 0 errors / 7 warnings, tsc clean, build passes.
- The first full E2E run failed 5 §T cases. The fix is in T6: contextual accessible names on the badge buttons and `exact: true` on the old locators. The second run passed.
- `test:upgrade` ALL PASS (`reports/T3.md`; no migration since).
- CI green at `57fce05`, run 40291119564: build, unit and e2e all success. The T3 and T4 CI runs were red on `modelBoundary.test.ts`, which did not mock `renderPost`; it was fixed test-only at `57fce05`.
- The orchestrator's evidence collection at HEAD is in `C:/Users/Damian/AppData/Local/Temp/claude/D--studio/f055d89c-55de-479f-bf26-21be483ec076/scratchpad/verify-collect.json` (lint, build and unit output). Read only the fields you need; it can be large.

**Run yourself:**

- `npx tsc --noEmit`;
- a focused unit set: `npx vitest run tests/unit/renderedText.test.ts tests/unit/renderPost.test.ts tests/unit/renderedTextWriters.test.ts tests/unit/renderStamps.test.ts tests/unit/draftRevisions.test.ts tests/unit/compositeRerender.test.ts tests/unit/draftDetailGet.test.ts tests/unit/libraryHeadlineState.test.ts tests/unit/trackHeadlineEdited.test.ts tests/unit/analyticsCoverage.test.ts tests/unit/analyticsGeneration.test.ts tests/unit/analyticsEmitters.test.ts tests/unit/captionStore.test.ts tests/unit/captionRoutes.test.ts tests/unit/modelBoundary.test.ts`;
- `npm run test:render`;
- the AC-20 git checks:
  - `git diff --name-only ef6c48e -- src/lib/scheduler src/mcp src/acp src/app/api/acp` (only `src/lib/scheduler/jobRunner.ts` is allowed);
  - `git diff ef6c48e -- src/lib/agent/prompts` (empty);
  - confirm `PROMPT_VERSION` and `CAPTION_PROMPT_VERSION` are unchanged since `ef6c48e`.

**Judge strictly:**

- Open the test behind each AC.
- An AC proven only by E2E names its TC ids.
- Where the spec and the build differ, say so under "Deviations" and decide whether the AC is still met. The known deviations:
  - AC-04 behavioural cases live in `renderStamps`, `draftRevisions` and `compositeRerender`, not in the guard file;
  - AC-16's adopt half has unit coverage only (no E2E);
  - TC-HL-02 seeds an older painted headline through the test DB, because the mock regenerate-copy returns the same headline;
  - the badge's Regenerate design button is hidden for non-Path-B drafts;
  - the badge buttons carry contextual accessible names;
  - the T4 seam is gated by `withTeamAdmin`.
- A criterion with no evidence is not met. That caps the verdict at PARTIAL.

**Write** `.specclaw/changes/030-stale-headline-badge/verify-report.md` in the 025 report's structure:

- the header with **Verdict:** PASS, PARTIAL or FAIL (n/20 ACs);
- Gates;
- E2E (state plainly that the collector ran no E2E tier, and that the evidence is the T6 local run plus CI);
- Acceptance Criteria (✅ or ❌ per AC, with evidence);
- Deviations;
- Known limits (L1 to L6 from the handoff);
- Per-task reviews (one line each: T1 NOTE, T2 NOTE (one WARN fixed by the orchestrator), T3 WARN (fixed by the orchestrator), T4 PASS, T5 NOTE);
- a final section headed exactly `## Verification`, with each command you ran written as `Command:` / `Exit:` / `Output (tail):` plus a fenced block.

Reply with the verdict and a short summary.
