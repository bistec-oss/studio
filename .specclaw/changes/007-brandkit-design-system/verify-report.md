# Verification Report: 007-brandkit-design-system

**Verified:** 2026-10-23
**Model:** Sonnet
**Verdict:** PASS (22/22 ACs)

The report is at HEAD `026b5bf`. The code commits are T1 `e267a08`, T2 `212b7b8`, T3 `3fc0811`; T4 `56c4b92` changes docs and the gate. The verifier read the spec, tasks, the four task reports and the T1 to T3 review notes (each WARN was fixed by the orchestrator, recorded at the end of the matching report). It read the upgrade route, `runKitUpgrade`, the improve route, the route and E2E tests, the handoff and e2e-plan sections, and the 007 screenshots in `ui-captures/007/`. It ran 13 unit files (239/239 passed): the 11 new files plus `brandKitAssistant` and `uiTokenGuard`. It ran the scope diffs and greps. It ran no E2E, server, build, prisma or DB command. The lint, build, full unit, E2E, render and `test:upgrade` results come from the orchestrator's runs (`reports/T4.md`).

## Acceptance Criteria

- ✅ **AC-01: the detector flags the Hearts adjectives.** `designDetect.test.ts` and `fixtures/hearts-kit-adjectives.ts` pass: four candidates, keys in text order, quote and `start`/`end` slice equal. The fixture states that "IRP is fine on-image" is outside the detector. The same text flags four phrases in the browser (E2E TC-KU-01 and the screenshots).
- ✅ **AC-02: no brand voice, no measured text.** Covered in `designDetect.test.ts` (brand-voice fixture, "a generous offer", "a soft tone", measured sentences, the `İ` slice case). E2E TC-KU-01 shows "No vague phrases flagged" for the voice text.
- ✅ **AC-03: bounds and overlaps.** `designDetect.test.ts` covers overlap order, the 12 cap with `more: true`, `truncated: true` over 20 000 and the `<entryKey>:<start>` id.
- ✅ **AC-04: dataset invariants.** `designAuthoring.test.ts` passes: all fields, templates measurable with defaults, defaults in range, non-empty `source`, seven keys, no `typography` category.
- ✅ **AC-05: "measurable" is defined.** `designMeasurable.test.ts` passes with AC-05's table and the `~45 – 60 %` versus `45-60%` token equality.
- ✅ **AC-06: every proposed edit is measurable.** `kitUpgradeValidate.test.ts` (a `not-measurable` rejection is never an edit); E2E TC-KU-03 asserts `isMeasurable` on every replacement and one occurrence of every quote.
- ✅ **AC-07: validation table.** `kitUpgradeValidate.test.ts` has one case per reason (`unknown-candidate`, `duplicate`, `too-long`, `too-short`, `multi-sentence`, `forbidden-content`, stale quote) and the byte-for-byte replace and insert checks.
- ✅ **AC-08: provenance by code.** `kitUpgradeValidate.test.ts` and the route test "edits: one call, provenance set by code, reply provenance and entryKey ignored". The type has no `sampled`. `sampleImageColors` is mocked and never called (`kitUpgradeValidate.test.ts:184-188`; the source files do not contain the string). E2E TC-KU-06 shows `unverified` in the API and the UI.
- ✅ **AC-09: roles, not literals.** `kitUpgradePrompt.test.ts` asserts the role list and no hex or kit font name on the built prompt. The route test "builds a prompt with roles and no kit font or hex" repeats it through the route. A hex or font name in a proposal is `forbidden-content`.
- ✅ **AC-10: three outcomes.** Route unit tests and E2E TC-KU-04 to TC-KU-06: `UNPARSEABLE` gives 502 `UPGRADE_PARSE_FAILED` (`route.ts` returns 502, not an empty 200); `NONE` gives `model-proposed-none`; `BAD` gives one edit and three rejections; no vague phrase gives `no-candidates` with no recorder entry.
- ✅ **AC-11: auth and tenancy.** `upgrade/route.ts` is `withTeamAdmin`; the kit check is `!kit || kit.isDeleted || kit.teamId !== user.teamId` giving 404. The unit test covers 401, 403 for an editor, 404 for a missing, deleted and other-team kit, and 400 for a bad body. E2E TC-KU-11 covers the same over HTTP, including the deleted kit. The order is 404 first, then the body check, so a bad body on a missing kit is 404; that fits FR-05's "kit exists" first.
- ✅ **AC-12: the stale base.** The route returns 409 `{ code: 'STALE_BASE', activeVersion }` before any model call; unit and E2E TC-KU-08 assert the recorder is empty. `PromptSection.tsx:99` carries the exact confirm wording ("Version N was saved since you started this text. Saving now will replace it as the live prompt. Save anyway?"), asserted verbatim in TC-KU-08 (`kit-upgrade.test.ts:305`), where Cancel saves nothing and "Save anyway" saves. The Save note text is at `PromptSection.tsx:249` and asserted at `kit-upgrade.test.ts:227`.
- ✅ **AC-13: the editor flow.** TC-KU-01 (flags update, no upgrade request), TC-KU-07 (improve, upgrade, removed beside inserted, label and rationale, accept changes the textarea only and the version list stays at 1, Save makes one new active version equal to the textarea, accept-nothing Save equals the base) and TC-KU-09 (stale quote disables the edit, a dismissed flag stays hidden until reload). The T3 review WARN (insert showed its quote struck through) was fixed and the test now asserts no `del` on an insert.
- ✅ **AC-14: Improve flags lost rules.** `designLostRules.test.ts` (dropped `1.5 wordmark letters` returned in its original spelling, both kept gives `[]`, reformatting is not a loss). The route test checks `lostRules` and the unchanged `draft`. The improve prompt is golden-pinned in `kitUpgradePrompt.test.ts:85` ("golden, FR-15: the text must not move") and the route passes `buildImprovePrompt('CURRENT')` unchanged. E2E TC-KU-10 covers the UI warning.
- ✅ **AC-15: host-agnostic.** `kitUpgradeReview.test.ts` drives `proposed`, `accept`, `textChanged`, stale no-op, `dismiss` and `reset` with a plain string host, and statically checks that `src/lib/kitUpgrade/` and `src/components/textUpgrade/` import nothing from the kit, admin or prisma modules.
- ✅ **AC-16: boundaries and purity.** `designDataBoundary.test.ts` passes. After the T1 review fix it also scans the 009 generation files in `designData/` (including `composition.ts`). It covers the no-generation-importer rule, no re-export from `index.ts`, server-module purity and the placement-word and archetype scan.
- ✅ **AC-17: generation and save untouched.** The scope diff `git diff --name-only f0b5c36 -- prisma src/lib/agent/prompts src/lib/brandkit/systemContext.ts 'src/app/api/admin/brandkits/[id]/prompts/route.ts' 'src/app/api/admin/brandkits/[id]/prompts/[promptId]' src/lib/designData/index.ts src/lib/designData/composition.ts` is empty (run by the verifier). `PROMPT_VERSION = '2026-10-21.1'` (`shared.ts:20`). `generationUntouched.test.ts` passes. The full `f0b5c36..HEAD` file list matches the tasks' declared files plus docs and specclaw state.
- ✅ **AC-18: one extractor.** `fencedBlock.test.ts` covers `missing`, `invalid-json`, `schema`, `ok` and the last-block rule. The brand-kit parity fixtures passed on the old extractor first and again after the rewrite (T1 report); `brandKitAssistant.test.ts` passes (25/25 with the fenced-block file). `assistant.ts` changed by 3 insertions and 12 deletions.
- ✅ **AC-19: grounding and the model call.** `kitUpgradePrompt.test.ts` asserts the base text sits only inside `fenceUntrusted` output, `UNTRUSTED_CONTENT_GUARD` is present and `<<<END-UNTRUSTED-DATA>>>` in the text is neutralised. The route unit test records exactly one `kit-upgrade` entry for the `ASSISTANT_BRANDKIT` model (and none for 409 or `no-candidates`). E2E TC-KU-02 asserts one record. In the real path the call label `kit-upgrade` is passed to `runBriefingModel`; in the mock path `route.ts`'s `runKitUpgrade` records it once. No retry exists.
- ✅ **AC-20: observability, the operator step, docs.** The route test "logs the FR-05 fields and none of the prompt text or key" captures `console.log`. `docs/handoff.md` has the 007 row, the section with the evidence query (line 46), OQ-1 (line 49), the Hearts drift step with kit `cms3jg09p000at5ijivpi3zhe` (line 50) and the checklist line ("a check, not a blocking step", line 216). `docs/e2e-test-plan.md` §AC has TC-KU-01 to TC-KU-11 and the AC-to-case table (lines 901-922). CLAUDE.md and `.specclaw/ROADMAP.md` carry 007.
- ✅ **AC-21: the design system.** `uiTokenGuard.test.ts` passes. `grep ui-exception` over `src/components/textUpgrade` and `PromptSection.tsx` finds nothing, so no new exception. The verifier read `ui-captures/007/edits-light-1440.png` and `edits-dark-390.png`: the panel is legible with no horizontal overflow at 390 px, a visible focus ring sits on the "Reject" button after the keyboard Tab, and the Accept, Reject and Upgrade buttons carry text labels. The panel adds no shared atom, so the render check is not required. The capture script also logs `scrollWidth` against `clientWidth`, but its output is not stored; the no-scroll claim rests on the images and the orchestrator's note. All four light and dark, 390 and 1440 captures exist.
- ✅ **AC-22: nothing regressed.** tsc clean; lint 0 errors / 7 warnings; unit 3147/3147 (baseline 3024); render 47/47; build passes; `test:upgrade` ALL PASS; full clean mock E2E 442/3/0/0 (431 plus 11 §AC cases). CI: `gh run list --branch v2` shows the push run for the HEAD commit `026b5bf` (39888061784) and its PR run (39888068090) both success; the T4 commit's runs were 39886027978 (attempt 1 failed in `hero-sampler.test.ts` on a Chromium launch timeout in the render harness, which 007 does not touch; attempt 2 passed) and 39886033084 (success). Two runs on the docs commits show `cancelled`; these were superseded by newer pushes.

## Test Results

| Check                                                                            | Result                                              |
| -------------------------------------------------------------------------------- | --------------------------------------------------- |
| 13 unit files (11 new, `brandKitAssistant`, `uiTokenGuard`), run by the verifier | 239/239 passed                                      |
| Full unit (orchestrator)                                                         | 3147/3147, 122 files                                |
| Full clean mock E2E (orchestrator, T4)                                           | 442 passed / 3 skipped / 0 failed / 0 flaky         |
| Targeted kit-upgrade E2E after the T3 fix                                        | 11/11                                               |
| Render, `test:upgrade`, build, tsc, lint                                         | 47/47; ALL PASS; pass; clean; 0 errors / 7 warnings |

## Scope

- No prisma, generation prompt, `systemContext.ts`, save or activate route, or `designData/index.ts` change (the scope diff is empty).
- The changed files match the tasks' declared lists. The improve route is the only existing route touched, additively (`lostRules`).

## Known limits

- The detector only offers an edit for phrases on its word list. "Measurable" is a text check, not proof that a render obeys the number (stated in the spec and handoff).
- The save route cannot enforce a base version; the client check narrows the race only (A4).
- OQ-1: accepts and per-entry uptake are not observable without a column; the user chose "no stamp for now".
- The parse-failure path logs the `parse-failed` line instead of the standard counts line, which matches FR-05's wording for that case. A model that quotes the base text puts it in that log (allowed by FR-17).
- The Hearts Academy navy/teal drift is an operator step, not yet done; it is recorded as a check in the handoff.
- No real-model look has been done (not required by any gate).

## Per-task reviews

- T1: WARN (the boundary test missed the 009 files in `designData/`); fixed and re-gated.
- T2: NOTE (a lone `\r` in the parse-failure log escape); fixed.
- T3: WARN (an insert edit showed its quote struck through); fixed, the E2E assertion corrected.

## Issues Found

None blocking. The AC-21 no-scroll measurement output is not stored (images only).

## Summary

All 22 acceptance criteria are met. The scope is clean, the new unit files pass, and the orchestrator's full gate and CI are green at HEAD. PASS.
