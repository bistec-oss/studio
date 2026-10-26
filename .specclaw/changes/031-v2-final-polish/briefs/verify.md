# Verify brief (031-v2-final-polish)

You are the verifier for specclaw change 031-v2-final-polish in D:\studio (branch v2, HEAD `21dcda2`; the last code commit is `daf120b`, the rest are docs and state). Judge each acceptance criterion in `spec.md` against the code and the tests, and write `verify-report.md`. Do not modify any source or test file. Do not commit. Do not run E2E, a dev server, a build, `test:upgrade` or any DB command, and make no network or model call.

**Read:**

- `.specclaw/changes/031-v2-final-polish/spec.md` (all; AC-01 to AC-46 are the ground truth; known limits L1 to L6), `design.md`, `tasks.md`;
- `reports/T1.md` to `T19.md`, `reviews/T1.md` to `T16.md` and `T18.md` (each review may end with an "Orchestrator follow-up" section: that is what was fixed after the review);
- `measure/results.md`, `look-check/evidence.md`, `look-check/results.json`, `look-check/ledger.jsonl`, `briefs/T19-carryovers.md`;
- the 031 section at the top of `docs/handoff.md`;
- the format to follow: `.specclaw/changes/030-stale-headline-badge/verify-report.md`.

**Evidence already gathered (cite it; do not re-run):**

- **Full clean mock E2E** at T19 (`reports/T19.md`): 598 passed / 3 skipped / 0 failed / 0 flaky, after a dropped test DB and `rm -rf .next`. The 3 skips are the intentional TC-REG-H11a/b/c. Earlier full runs: T3 559/3/0/0 (after G), T15 594/3/0/0 (after A).
- **`test:upgrade`** ALL PASS at T19 (4 scenarios, incl. 031's scenario 4).
- **CI green at `a511013`**, run 40374348999: unit, build and the full E2E all success. Earlier: green at `37b1e64` (run 40359025530); `5621bff` had one real failure (a T12-renamed locator, fixed in T15) and one flaky; `26db51c` failed only the render harness on a CI-runner Chromium launch timeout (`WS endpoint`, 147/148), a known runner flake.
- **The orchestrator's collector at HEAD** is `C:/Users/Damian/AppData/Local/Temp/claude/D--studio/fc9e9b36-7276-47a5-a426-2a15997b43b0/scratchpad/verify-collect-031.json` (872 KB; it is not strict JSON, so grep it, do not parse it): unit 4553/4553 (201 files), lint passed (0 errors / 7 warnings), build compiled successfully.
- **OP-031** (`reports/T17.md`): 2 of 4 calls; both attempts kept the look and the user accepted both; verdict `pass`.

**Run yourself:**

- `npx tsc --noEmit`;
- a focused unit set: `npx vitest run tests/unit/claudeCliTempDir.test.ts tests/unit/lostClaimCleanup.test.ts tests/unit/uiWordingGuard.test.ts tests/unit/keyPrefix.test.ts tests/unit/personalImageKey.test.ts tests/unit/imageProviderResolution.test.ts tests/unit/imageSourceNotice.test.ts tests/unit/fontsMerge.test.ts tests/unit/fontsUrl.test.ts tests/unit/fontsValidate.test.ts tests/unit/fontsRoute.test.ts tests/unit/fontsBoundary.test.ts tests/unit/applyPostFonts.test.ts tests/unit/fontInjectionSites.test.ts tests/unit/renderStampWriters.test.ts tests/unit/renderedTextWriters.test.ts tests/unit/fontNotice.test.ts tests/unit/designAuthoring.test.ts tests/unit/kitTypography.test.ts tests/unit/designDetect.test.ts tests/unit/ruleUpgrade.test.ts tests/unit/briefingUpgradeRoute.test.ts tests/unit/schedulePlan.test.ts tests/unit/brandKitBlock.test.ts tests/unit/brandKitApply.test.ts tests/unit/applyTextCandidates.test.ts tests/unit/applyTextSplice.test.ts tests/unit/renderPost.test.ts tests/unit/commitAcceptRender.test.ts tests/unit/applyTextRoute.test.ts tests/unit/applyTextCoverage.test.ts tests/unit/analyticsCoverage.test.ts tests/unit/lookDataset.test.ts tests/unit/planOverrideBoundary.test.ts tests/unit/op031Verdict.test.ts tests/unit/lookCheck.test.ts tests/unit/lookCheckResults.test.ts tests/unit/lookFixtureCompleteness.test.ts tests/unit/postStylesDataset.test.ts tests/unit/generationUntouched.test.ts tests/unit/designDataBoundary.test.ts tests/unit/uiTokenGuard.test.ts` (fix the list if a file name differs: `ls tests/unit`);
- `npm run test:render`;
- the AC-46 git checks:
  - `git diff --name-only 0f42017 -- src/lib/scheduler src/mcp src/acp src/app/api/acp` (only the NFR-04 files are allowed: `src/mcp/tools/brandkit.ts`; `src/mcp/server.ts` was allowed but unneeded);
  - `git diff --name-only 0f42017 -- src/lib/agent/prompts` (only `shared.ts`);
  - `git log --oneline 0f42017..HEAD -S PROMPT_VERSION_BASE -- src/lib/agent/prompts` and the diff of that line, to confirm `PROMPT_VERSION_BASE` was bumped exactly once (to `2026-10-29.1`).

**Judge strictly:**

- Open the test behind each AC. An AC proven only by E2E names its TC ids (TC-IK, TC-PF, TC-BU, TC-AS, TC-AP, TC-LOOK, TC-PS).
- An AC whose evidence lives in a report (AC-01 tmpdir listings, AC-03 docker output, AC-13 down-script transcript, AC-16 status codes, AC-33 the re-measure, AC-41 the evidence, AC-45 the ledger) cites the report section.
- Where the spec and the build differ, say so under "Deviations" and decide whether the AC is still met. The known deviations (all in the reports or `T19-carryovers.md`):
  - AC-37: the `::after` fixture became a second DOM element, because the check reads `innerText` (pseudo-element content is not detected); recorded as spec L6;
  - NFR-09: `catalogue.json` is 263,944 bytes against a 250 KB target;
  - `catalogue.ts` has no `import 'server-only'` (absent package; MCP and scheduler runtimes); `fontsBoundary.test.ts` is an allow-list guard instead;
  - W-14 dropped (in `src/acp`, frozen by NFR-04); W-28 and W-36 fixed as wording only; W-35 casing only;
  - T11's mock schedule reply has 2 rows (one active key, one bad key), not design §7.1's three;
  - T12: the assistant Apply waits for the font lookups; a `__MOCK_FONT_UNKNOWN__` sentinel; known limits on the apply route (no active voice version, stale `previousFonts` under a concurrent PATCH, identical fonts still versioned);
  - T15: an extra 409 `DRAFT_NOT_READY`; Undo shows for any captured snapshot; the claimed work re-reads the draft and treats a change as `conflict`;
  - T14: `absentPainted` is `number | null`; Apply fails closed on `null` (`render-failed`);
  - T16/T18: spotlight v1 kept as `SUPERSEDED_FIXTURES`; the OP-031 `infra` rule tightened;
  - T17: `bistec_studio_op1` needed five migrations (025's and 030's too), applied with the user's approval;
  - the CI e2e job timeout was raised from 25 to 40 minutes (`5621bff`).
- A criterion with no evidence is not met. That caps the verdict at PARTIAL.

**Write** `.specclaw/changes/031-v2-final-polish/verify-report.md` in the 030 report's structure:

- the header with **Verdict:** PASS, PARTIAL or FAIL (n/46 ACs);
- Gates (tsc, lint, unit, render, build, `test:upgrade`, CI);
- E2E (state plainly that the collector ran no E2E tier, and that the evidence is the T19 local full run plus CI run 40374348999);
- Acceptance Criteria (✅ or ❌ per AC, with evidence), grouped by H, G, C, B, E, F, A, D, close;
- Deviations;
- Known limits (L1 to L6 plus the carry-over limits);
- Per-task reviews (one line each): T1 PASS · T2 NOTE · T3 NOTE · T4 PASS · T5 NOTE · T6 NOTE (one fixed by the orchestrator) · T7 WARN (fixed by the orchestrator) · T8 NOTE · T9 NOTE · T10 PASS · T11 NOTE (one fixed) · T12 NOTE · T13 NOTE (one fixed) · T14 WARN (fixed) · T15 NOTE (the race fixed, and a tsc error the implementer missed) · T16 NOTE (one fixed) · T17 no review (orchestrator-run operator step) · T18 NOTE · T19 no review (docs; the orchestrator corrected the group mapping);
- a final section headed exactly `## Verification`, with each command you ran written as `Command:` / `Exit:` / `Output (tail):` plus a fenced block.

Reply with the verdict and a short summary.
