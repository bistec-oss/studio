# Verify Report: 028-image-looks

**Verified:** 2026-10-25 (second verify, after T7) · **Model:** Sonnet · **HEAD:** `5db8953` (028 code at `7ba50b1` plus `1872cfe` docs)
**Verdict:** PASS (21/21 ACs; AC-20 and AC-21 now checked after OP-028 and T7)

I re-read spec.md's ACs, the T7 report and review, `look-check/results.json` and `ledger.jsonl`, and the handoff 028 section. I re-ran the focused unit set (9 files, 412/412: lookCheckResults, postStylesDataset, postStylesResolve, lookDataset, lookCheck, lookFixtureCompleteness, heroSeams, designData, uiTokenGuard) and the NFR-01 and hard-rule git checks at HEAD. The AC-01 to AC-19 evidence below is carried from the first verify and re-checked against current code through those files; the orchestrator's fresh collect gates are cited as given.

## Gates

| Gate           | Result                                                             |
| -------------- | ------------------------------------------------------------------ |
| tsc            | clean (T7 gate)                                                    |
| lint           | 0 errors / 7 warnings (collect, HEAD)                              |
| unit           | 3903/3903, 156 files (collect, HEAD; floor 3737)                   |
| render         | 84/84 (T6 gate; no render file changed in T7)                      |
| build          | pass (collect, HEAD)                                               |
| `test:upgrade` | ALL PASS (T6 gate; no migration since)                             |
| CI             | green at `5db8953`, run 40165715965 (e2e, build, unit all success) |

## E2E

The collector's e2e tier was **not run**: `verify.e2e` is not configured, so it ran no E2E command. The E2E evidence is: CI run 40165715965 at `5db8953` (the full mock E2E suite, e2e job success); the local T7 gate on `7ba50b1` plus its fix (`tests/e2e/image-looks.test.ts` 16/16 three runs in a row, `tests/e2e/post-styles.test.ts` 42/42 three runs in a row); and the earlier full clean local mock run at T6, 529 passed / 3 skipped / 0 failed / 0 flaky. I did not run E2E myself.

## Acceptance Criteria

- ✅ **AC-01 dataset.** `lookDataset.test.ts` and `designData.test.ts` (in the 460): four active looks, `current` 2, 2, 1, 1, v2 SQUARE and PORTRAIT deep-equal v1, v1 hashes unchanged, a hash per (key, version), no `variantOf` shipped. Spotlight's PORTRAIT subject was tuned before release (final fix I-1, hash updated, spec row noted).
- ✅ **AC-02 validation.** `lookDataset.test.ts`: real dataset gives `[]`, one fixture per FR-03 rule, a valid `-light` variant passes. The module-load assertion is now a behavioural test (mocked bad record key throws under test, resolves in production).
- ✅ **AC-03 key rule.** `composition.ts:8` header "THE LOOK KEY RULE"; committed key-list subset, post-style defaults naming dataset keys or classic, retired-classic (explicit and post-style default), `IMAGE_STYLES` omits a retired look while `contractAt` and `styleLabel` resolve it (final fix I-3).
- ✅ **AC-04 resolver.** `postStylesResolve.test.ts`: the `it.each` over 6 surfaces x 4 looks x 3 sizes (final fix I-2), Launch and Announcement at STORY, unattended `unattended-classic`, Path A `path-a-classic`, SQUARE-only fixture gives `size-classic`.
- ✅ **AC-05 STORY literals.** `styleAfterSizeChange` and resume cases in `postStylesWizard.test.ts`; T2 report's grep lists no leftover STORY literal; final review re-checked. `git grep STORY -- src` shows only kept lines.
- ✅ **AC-06 prompts.** `heroPrompts.test.ts` goldens for the 8 new contracts (Spotlight names headline and CTA-and-logo bands), v1 and classic goldens unchanged.
- ✅ **AC-07 fixtures discriminate.** `npm run test:render` 84/84 (47 + 36 + 1 guard); T3 measured pass sd about 0.018 against busy 0.49, contrast pass fraction 0.000.
- ✅ **AC-08 completeness and tone.** `lookFixtureCompleteness.test.ts` (4 cases) against a literal backdrop table; an added-size fixture fails the check.
- ✅ **AC-09 mock layout box.** `heroSeams.test.ts` every-(key, version, size) case and the Spotlight two-sample case.
- ✅ **AC-10 pipeline, mock.** E2E §AF TC-LOOK-01 to 06 pass (inside the 529). Deviation judged: the "one image call, also on fallback" case lives in `heroSeams.test.ts`, not `background.test.ts`, because `background.test.ts` has no hero harness (T1 report). Substance met: it is the same `background.ts` step, exercised for pass and fallback; the E2E fallback cases (TC-LOOK-05, 06) also reuse the hero image.
- ✅ **AC-11 notice.** `compositionNotice.test.ts` (kept look with `layout-violation`, a `busy` fallback names the look); TC-LOOK-07, 08.
- ✅ **AC-12 wizard.** TC-LOOK-09 and 10 (five cards enabled at 9:16, Launch pre-fill with hint, Spotlight sends `imageStyle: 'spotlight'`, Review row, resume, axe). T4 screenshots at 390 and 1440, light and dark, in `ui-captures/028`.
- ✅ **AC-13 unattended unchanged.** TC-LOOK-11 (queue entry `launch` at STORY through the generation tick stores classic and a classic stamp). Hard-rule diff re-run: empty.
- ✅ **AC-14 old drafts.** TC-LOOK-12 (v1 stamp carried by refine with no warning, regenerate records v2, restore copies v1); `refinePrompt.test.ts` v1 stamp gives v1 regions.
- ✅ **AC-15 runner logic.** `lookCheck.test.ts` (21 cases): cap 16, ledger counting, `planNext` refusals, localhost guard, `--verdict`.
- ✅ **AC-16 pass rule.** `lookCheck.test.ts` `lookVerdicts` cases (last result per slot counts).
- ✅ **AC-17 nothing extra.** `git grep -c` re-run: createMessage 21, runClaudeCli 27, recordModelCall 29, generateImage 17, equal to `4053cfe`. Hard-rule diff empty. T5 report: runner used only with `--dry-run`.
- ✅ **AC-18 design system.** `uiTokenGuard.test.ts` passes (re-run); `git diff 4053cfe HEAD` adds 0 `ui-exception`. Four step-1 screenshots exist; T4 notes no horizontal scroll, five cards stack at 390 px.
- ✅ **AC-19 gate.** Table above; every floor met. CI green at `1639b1e`, the later commit fills doc placeholders only.
- ✅ **AC-20 the default moves (FR-16).** T7 `7ba50b1`. Only `event` and `hiring` gained `versions[2]` with `defaultImageStyle: 'full-bleed-scene'` (styles.ts, `current: 2`); `promotion` and `milestone` stay classic-to-v1 because `spotlight` failed OP-028 (FR-16 requires this). v1 is byte-identical (v1 hashes unchanged); `event@2` and `hiring@2` hashes are in the table; `POST_STYLES_REVISION` is 10 (was 8, +2 styles moved) and both prompt versions carry `+ps10`. `lookCheckResults.test.ts` passes on the committed results and fails on doctored copies (a slot `accepted: false`; contract version 99), per the T7 review; I re-ran it green. The rule-id test is per version with stable ids across versions. E2E TC-LOOK-13 to 16 (wizard pre-fills Full-bleed scene for Event and Hiring at 1:1 and 9:16; a queue entry at 9:16 for each still stores classic) passed three runs in a row locally and in CI.
- ✅ **AC-21 closed.** `look-check/results.json` (11 attempt entries) and `ledger.jsonl` (11 lines, cap 16) are committed. Every slot's last result has a verdict or is a fallback: `product-showcase:STORY` attempt 1 errored (the account hit its weekly limit before any image call, still counted), attempt 2 kept its look and was accepted; `editorial-split:STORY` attempt 1 fell back (`contrast`), attempt 2 kept and accepted; `full-bleed-scene` SQUARE, PORTRAIT and STORY kept and accepted (passed); `spotlight` PORTRAIT and STORY kept and accepted, `spotlight:SQUARE` fell back (`busy`) twice, so `spotlight` failed. The handoff 028 section records the verdicts ("OP-028 result", 11 of 16 calls) and the moved defaults ("Post-style defaults moved for Event and Hiring"). CI is green at `5db8953`.

## Deviations

- AC-10's one-image-call unit case is in `heroSeams.test.ts`, not `background.test.ts` (judged met in the first verify).
- T3: a `LookShape = Shape | "STORY"` type was added instead of widening `Shape`.
- Existing §AA and §AE E2E cases (TC-HERO-09, 13, TC-PS-31, 32) were adapted to the 9:16 lift; none deleted.
- OP-028 call 1 failed on a Claude weekly limit before any image call; it still counts against the ledger, as FR-14 requires.

## Known limits

- The fixtures prove the checker discriminates; they do not prove a real model draws the looks. OP-028 gives one real render per contract (spec L1, L2).
- `spotlight` failed OP-028 on SQUARE twice (`busy`), so it stays an opt-in pick and Promotion and Milestone stay classic. A fix is a `spotlight` v2 (NFR-04).
- `editorial-split:STORY` needed its second attempt after a `contrast` fallback; the contract was not changed between attempts.
- At 1440 px the five picker cards sit 3 + 2 with one empty cell.
- `compositionNotice.ts:42` carries unreachable 9:16 text (L3).
- Full-bleed PORTRAIT overlaps its band by 2 points, the same as a passing 009 contract.
- No two-runner lock in the look-check runner (T5 review NOTE); one operator runs it.

## Per-task reviews

- T1 — NOTE
- T2 — NOTE
- T3 — NOTE
- T4 — NOTE
- T5 — NOTE
- T6 — no separate review file (gate task; covered by the final review)
- T7 — PASS
- final — With fixes (all addressed)
- final-fixes — fixes confirmed

## Verification

Command: `npx vitest run tests/unit/lookCheckResults.test.ts tests/unit/postStylesDataset.test.ts tests/unit/postStylesResolve.test.ts tests/unit/lookDataset.test.ts tests/unit/lookCheck.test.ts tests/unit/lookFixtureCompleteness.test.ts tests/unit/heroSeams.test.ts tests/unit/designData.test.ts tests/unit/uiTokenGuard.test.ts`
Exit: 0
Output (tail):
Test Files 9 passed (9)
Tests 412 passed (412)

Command: `git diff --name-only 4053cfe -- prisma .env.example src/lib/env.ts src/lib/scheduler src/mcp src/acp src/app/api/acp src/app/api/campaigns | wc -l`
Exit: 0
Output (tail):
0

Command: `git grep -c <createMessage|runClaudeCli|recordModelCall|generateImage> -- src` (4053cfe vs HEAD)
Exit: 0
Output (tail):
createMessage 21/21, runClaudeCli 27/27, recordModelCall 29/29, generateImage 17/17
