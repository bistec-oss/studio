# Verify Report: 025-hero-reference-images

**Verified:** 2026-10-26 · **Model:** Sonnet · **HEAD:** `703d263` (025 code at `5531d29`; `703d263` is docs only)
**Verdict:** PASS (18/18 ACs)

I read spec.md (with Amendment A1), tasks.md, the T1 to T14 reports, the reviews, `look-check/results.json` and `ledger.jsonl`, and the handoff 025 section. I re-ran the focused unit set, `npm run test:render`, tsc and the AC-17 git checks at HEAD. I opened the test behind each AC. I did not run E2E, the build, lint or `test:upgrade`; those are cited from the orchestrator and the T12 gate.

## Gates

| Gate           | Result                                                                              |
| -------------- | ----------------------------------------------------------------------------------- |
| tsc            | clean (I ran `npx tsc --noEmit`, no output)                                         |
| lint           | 0 errors / 7 warnings (orchestrator, HEAD)                                          |
| unit           | 4131/4131, 168 files (orchestrator, HEAD). My focused run: 27 files, 742/742        |
| render         | 119/119, 6 files (I ran `npm run test:render`, 95 s). The T12 gate also had 119/119 |
| build          | pass (orchestrator, HEAD)                                                           |
| `test:upgrade` | ALL PASS in 46.0 s (T12 gate, `reports/T12.md`; no migration since)                 |
| CI             | green at `5531d29`, run 40235850520 (build, unit, e2e all success)                  |

## E2E

The collector's e2e tier was **not run**: `verify.e2e` is not configured, so collect ran no E2E command. I did not run E2E either. The E2E evidence is the T12 local full clean mock run on `5531d29` (548 passed / 3 skipped / 0 failed / 0 flaky; the 3 skips are the intentional TC-REG-H11a/b/c) and CI run 40235850520 at the same code. The floor was 529 plus §AG; 548 meets it. §AG is `tests/e2e/product-screenshots.test.ts`: TC-SHOT-01 to 14 and 14b. An AC that only E2E can prove names its test ids below.

## Acceptance Criteria

- ✅ **AC-01 dataset.** `lookDataset.test.ts` pins every (key, version) by hash and has "the four released looks keep their released hashes (025 NFR-04)"; `device-screen@1` is `b53138cc…`. The FR-02 rows and the 16:10 check are in `designData.test.ts` and `lookDataset.test.ts` (both in my 742). One nit: the hash comment said "removed in T6", but no size failed, so the T1 hash is the final one (comment fixed after verify).
- ✅ **AC-02 validation.** `lookDataset.test.ts` (real dataset gives `[]`, one fixture per FR-03 rule); passes in my run.
- ✅ **AC-03 blank check (amended).** `screenDetect.test.ts`: an offset screen is found within one grid step at each size; failures for a textured seed, `edge-at-window`, 4:3 (`aspect`), under 60% (`too-small`), a text band (`text-overlap`) and a busy interior; the 0.039 passes / 0.041 fails boundary on both seed and interior. `compositeFacts.test.ts` shows `evaluateRegions` leaves a composite region to the detector (T13 review NOTE 2 accepts this). Render: `look-fixtures.test.ts` ran in the 119, with a `screen` fixture per size that fails `composite-not-blank` and a pass fixture.
- ✅ **AC-04 reasons and stamp.** `compositionStamp.test.ts` asserts the 11-item `FALLBACK_REASONS` list and loops each reason; `compositionNotice.test.ts` covers the messages. Stamp invariants and the rect checks are in `compositionStamp.test.ts` (passes).
- ✅ **AC-05 prompts.** `heroPrompts.test.ts` goldens for the three sizes (passes); existing goldens unchanged.
- ✅ **AC-06 unavailable without a source.** Unit: `postStylesResolve.test.ts` (`missing-input-classic`), `compositionPlan.test.ts` (`composite-source-missing`), `briefImageStyle.test.ts` (picker reason). E2E: TC-SHOT-01 (400 `IMAGE_STYLE_NEEDS_SCREENSHOT`), in the T12 run and CI.
- ✅ **AC-07 probe.** `lookProbe.test.ts`: 404 in production before any call, 403 for a non-super-admin, a `MOCK_AI` verdict with no row, the object deleted, the 502 path. `lookCheck.test.ts` covers the `--probe` slots, the cap of 9, the ledger line shape with null `threshold` and `promptHash` (amended wording) and the unchanged 028 slots. Both pass.
- ✅ **AC-08 fixtures (amended).** `lookFixtureCompleteness.test.ts` passes and asserts 57 rows: 36 for the four released looks plus 21 for `device-screen` (pass, busy, contrast, screen, pass-offset, text-overlap, small at three sizes). That is more than the spec's "36 + 12", which A1 widened (the spec now states 57 in the amended AC-08). The completeness rule covers the new kinds.
- ✅ **AC-09 upload.** Unit: `imageHeader.test.ts` (PNG, JPEG, WebP VP8/VP8L/VP8X; refuses SVG, GIF, truncated files; the 640x400 floor; the 8000 side, 25 MP and 10 MB caps). E2E: TC-SHOT-02 (key, no URL), 03 (SVG named .png, GIF, over limits), 04 (600x400), 05 (foreign key 404 on preview).
- ✅ **AC-10 brief.** E2E TC-SHOT-06 (each FR-11 400; a valid brief stores `compositeSource`), TC-SHOT-14 (Resume keeps it; Discard deletes the object; generate keeps it), TC-SHOT-14b (draft delete removes the object). `compositeSource.test.ts` and `briefDraftPayload.test.ts` pass.
- ✅ **AC-11 insertion (amended).** `compositeInsert.test.ts`: idempotent, removes a model-written element, the px box equals the stamped rect and differs from the contract region at each size, strip and insert round-trip.
- ✅ **AC-12 pixel-exact (amended).** `tests/render/composite.test.ts` (real Chromium, in my 119/119): per size, quadrant colours within DeltaE 3 and the box within 2 px of the stamped rect; a missing object gives `composite-source-missing`; covering, moved, resized and undecodable give `composite-not-rendered`; the stored string keeps the token.
- ✅ **AC-13 generation.** E2E TC-SHOT-07 (one canonical element, token, no URL, `composites` of length 1 with the detected rect), TC-SHOT-08 (`__MOCK_COMPOSITE_FAIL__`: EXPORTED, classic, `composite-not-rendered`, no `composites`), TC-SHOT-09 (`composite-not-blank`). `compositeGeneration.test.ts` and `compositeDesignAgent.test.ts` pass. The T8 review WARN (an API loop that ended in prose inserted an unchecked composite) was fixed in T8 (`designAgent.ts:203` throws `composite-not-rendered`).
- ✅ **AC-14 re-renders.** E2E TC-SHOT-10 (refine keeps the element and `composites`), 11 (an inline edit that deletes or moves the element is restored), 12 (a failed placement fails the refine with the named error and writes no revision; an image-replacing refine drops it). `compositeRerender.test.ts` (13 cases) and `compositeCanonical.test.ts` pass.
- ✅ **AC-15 wizard.** E2E TC-SHOT-13 (Path B only field, card disabled until upload, advisory for 1:1, body carries `compositeSource`, Remove). Screenshots exist: `ui-captures/025/` has 8 files, `{390,1440}-{light,dark}-{empty,uploaded}.png`. I did not view them. The orchestrator viewed all eight after verify (2026-10-26): empty shows the Product screen card disabled with "Needs a product screenshot" and an "Add screenshot" button; uploaded shows the card enabled and picked, the thumbnail, "1000×1000 px", Remove and the letterbox advisory; both themes, no horizontal overflow at 390 px. The header drawn mid-page is the full-page capture of the sticky header, not a layout fault. `uiTokenGuard.test.ts` passes.
- ✅ **AC-16 only the token stored.** Unit: `compositeCanonical.test.ts` refuses a document holding a screenshot URL and matches only the preview or an http `screenshots` path. E2E: TC-SHOT-07, 10 and 11 assert `htmlContent` and each `htmlSnapshot` contain `__COMPOSITE_0__` and not `screenshots/`.
- ✅ **AC-17 boundaries.** I re-ran against base `45fae1a`: `createMessage` 21 to 21, `runClaudeCli` 27 to 27, `recordModelCall` 29 to 29, `generateImage` 17 to 17 (the probe reuses the existing background step, so there is no new call site). `git diff --name-only 45fae1a HEAD -- src/lib/scheduler src/mcp src/acp src/app/api/acp src/lib/campaign` lists 0 files. The prisma diff is exactly the migration `20261026120000_composite_source`, its down script and `schema.prisma`; `.env.example` and `src/lib/env.ts` are untouched. `test:upgrade` ALL PASS is from the T12 gate; I did not re-run it.
- ✅ **AC-18 gate.** Table above; every floor met; CI green at `5531d29`. `git diff 45fae1a HEAD -- src tests scripts` adds 0 `// ui-exception:` lines (the nine matches in the full diff are doc sentences saying "no new ui-exception").

## OP-025 (Amendment A1)

`look-check/ledger.jsonl` has 7 lines (cap 9) and `results.json` has 7 entries. Each size has two attempts whose `recheck.styleKept` is true and `accepted` is true: SQUARE attempts 2 and 3, PORTRAIT attempts 1 and 2, STORY attempts 1 and 2. That is the pass rule at all three sizes, so no size was removed. SQUARE attempt 1 fell back (`busy`). Attempts 1 to 4 were re-judged offline by `--recheck`, as A1 requires; the detected rects are in `results.json`.

## Deviations

- AC-08 has 57 rows, not 36 + 12, because A1 added pass-offset, text-overlap and small fixtures. The amended AC-08 in spec.md now states the 57.
- FR-09 and AC-07: ledger `threshold` and `promptHash` are null (the line is written before the request); the real values are in `results.json`. The spec was amended at T5 after the T4 review.
- `evaluateRegions` now skips composite regions (T13 judgement call 2); the detector owns that check.
- `planNextProbe` is new in the runner; `planNext` is hard-coded to two attempts per slot (T4 report).
- The T5 gate had one flaky (`model-selection.test.ts:1065`, §Y); the T12 run and CI show 0 flaky.
- No size was removed at T6, so the `device-screen@1` hash is still the T1 hash.

## Known limits

From the handoff 025 section:

1. One author can attach the same uploaded key to two briefs. Deleting one brief's last draft removes the object the other uses; the other fails closed with `composite-source-missing`. Not cross-tenant.
2. An upload that is removed, replaced or never attached stays in `BUCKET_DOCS` until a discard, eviction or expiry cleanup. There is no per-user quota.
3. The pure HTML check counts the literal `data-composite` anywhere, so a comment mentioning it fails closed to classic.
4. `screenshotWillLetterbox` uses the first look with `requires`.
5. A classic inline edit that pastes an http URL containing `/screenshots/` is refused (the NFR-05 guard).
6. The editor iframe has no browser-level test; only its pure parts and the wizard screenshots are checked.

From the spec:

- The pixel check proves a calm screen area, not a pretty laptop; the user's OP-025 acceptance is the judgement.
- A screen drawn larger than the rect leaves a blank margin.
- The `composite-not-rendered` fallback costs one more design call.
- OP-025 gave two accepted real renders per size. That is a weak sample: the fixtures prove the check discriminates, not that every model image passes.

## Per-task reviews

- T1 — NOTE
- T2 — NOTE
- T3 — NOTE
- T4 — WARN(1) → resolved by amending FR-09 and AC-07 wording at T5 (null ledger fields)
- T5 — no review file (docs and gate task)
- T6 — no review file (gate task; no size removed)
- T7 — PASS (NOTEs)
- T8 — WARN(1) → fixed in-task (a prose-only API loop now throws `composite-not-rendered`)
- T9 — PASS (NOTEs only)
- T10 — PASS (NOTEs only)
- T11 — no review file (E2E task)
- T12 — no review file (docs and gate task)
- T13 — WARN(1) → fixed before commit (`recheck.ts` exits if `MOCK_PUPPETEER` or `MOCK_AI` is set)
- T14 — no review file (docs task)
- OP-025 geometry pin — NOTE (`reviews/op025-pin.md`)

## Verification

Command: `npx vitest run` on 27 files (briefDraftPayload, briefImageStyle, composite*, compositionNotice, compositionPlan, compositionStamp, designData, designDataBoundary, heroPrompts, heroSeams, imageHeader, lookCheck, lookCheckResults, lookDataset, lookFixtureCompleteness, lookProbe, op025Results, postStylesResolve, screenDetect, uiTokenGuard)
Exit: 0
Output (tail):
Test Files 27 passed (27)
Tests 742 passed (742)

Command: `npm run test:render`
Exit: 0
Output (tail):
Test Files 6 passed (6)
Tests 119 passed (119)

Command: `npx tsc --noEmit`
Exit: 0
Output (tail):
(no output)

Command: `git grep -c` for createMessage, runClaudeCli, recordModelCall and generateImage under src (45fae1a vs HEAD), and `git diff --name-only 45fae1a HEAD -- src/lib/scheduler src/mcp src/acp src/app/api/acp src/lib/campaign | wc -l`
Exit: 0
Output (tail):
createMessage 21/21, runClaudeCli 27/27, recordModelCall 29/29, generateImage 17/17; hard-rule diff 0
