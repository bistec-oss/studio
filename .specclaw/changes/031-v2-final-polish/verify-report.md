# Verify Report: 031-v2-final-polish

**Verified:** 2026-10-27 · **Model:** Sonnet · **HEAD:** `21dcda2` (031 code at `daf120b`; the later commits are docs and state)
**Verdict:** PASS (46/46 ACs)

I read spec.md, the T1 to T19 reports, the reviews, `measure/results.md`, the look-check evidence, results and ledger, `briefs/T19-carryovers.md` and the 030 report format. I re-ran tsc, a focused unit set, `npm run test:render` and the AC-46 git checks at HEAD. I opened the test behind each AC. I ran no E2E, no build, no `test:upgrade`, no DB command and no model or network call. Those are cited from the T19 gate, the orchestrator's collector and CI.

## Gates

| Gate           | Result                                                                                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tsc            | clean (I ran `npx tsc --noEmit`, exit 0, no output)                                                                                                               |
| lint           | 0 errors / 7 warnings (T19 gate; the collector's lint run exited 0). Baseline 7, so no new warning                                                                |
| unit           | 4553/4553, 201 files (collector at HEAD; baseline 4253). My focused run: 42 files, 576/576                                                                        |
| render         | 154/154, 9 files (I ran `npm run test:render`, 142 s; baseline 134)                                                                                               |
| build          | compiled successfully (collector at HEAD)                                                                                                                         |
| `test:upgrade` | ALL PASS in 64.5 s at T19 (4 scenarios, including 031's scenario 4, AC-10); `reports/T19.md`                                                                      |
| CI             | green at `a511013`, run 40374348999 (unit, build, full E2E all success). Earlier green at `37b1e64` (run 40359025530); see Deviations for the red runs on the way |

## E2E

The collector ran **no E2E tier**, and I ran none. The E2E evidence is the T19 local full clean mock run (after a dropped test DB and `rm -rf .next`): **598 passed / 3 skipped / 0 failed / 0 flaky**, 14.9 min, `MOCK_EXIT 0` (`reports/T19.md`; the 3 skips are the intentional TC-REG-H11a/b/c), plus CI run 40374348999 at `a511013`. Earlier full runs: T3 559/3/0/0 (right after group G, AC-07) and T15 594/3/0/0 (after group A). Baseline 559/3/0/0, so the count is +39 (§AI 6, §AJ 8, §AK 5, §AL 6, §AM 10, and the TC-LOOK-17 to 20 cases).

## Acceptance Criteria

**H**

- ✅ **AC-01 temp dirs.** `claudeCliTempDir.test.ts`: "registers one exit hook and removes exactly the created path", "a re-created dir replaces the old one", "does nothing and never throws when there is no dir". The before/after listing is in `reports/T1.md` ("tmpdir listings"): a full `npm run test:unit` left 1159 before and 1159 after (0 new). T1 found vitest workers end without an `exit` event, so six spawning test files call `cleanupSpawnCwd` in `afterAll`.
- ✅ **AC-02 lost claim.** `lostClaimCleanup.test.ts` (5 cases): deletes the key the run uploaded and never the draft's `exportUrl`; a successful run and a non-claim error delete nothing; the helper handles both claim loss and revision conflict. `commitDraftRevision` and `recordRejectedRender` call the shared helper (`reports/T1.md`). Passes in my run.
- ✅ **AC-03 AC-17 recheck.** `reports/T1.md` "Docker (AC-17)": `docker build` exit 0, `grep -c EBADENGINE` = 0, `docker run --rm --entrypoint claude … --version` printed `2.1.287 (Claude Code)`. The 005 verify-report follow-up line was added (not re-run).

**G**

- ✅ **AC-04 wording guard.** `uiWordingGuard.test.ts` passes in my run (self-tests: each pattern, the `wording-exception` opt-out, comments ignored; `OpenAI key` joined in T5).
- ✅ **AC-05 W table.** `reports/T3.md` holds 41 distinct `W-nn` rows (W-01 to W-41), none missing and no "pending" cell. W-14 is dropped (reason: `src/acp`, frozen by NFR-04). W-01, W-02, W-13, W-16 and W-19 name their owning tasks (T5, T11, T12, T15; filled in T19).
- ✅ **AC-06 glossary.** `docs/ui-reference/DESIGN_SYSTEM.md` §12 "Words" (line 770) has the eight FR-05 rules with applies and does-not-apply columns, a UI-to-code mapping and the deny-list.
- ✅ **AC-07 early E2E.** T3 full clean run 559/3/0/0 (same as baseline, no lowered count); adapted locators are listed in `reports/T3.md`. Not re-run.

**C**

- ✅ **AC-08 detector.** `keyPrefix.test.ts` (anthropic, openai, gemini, null). The grep in `reports/T4.md` and the re-grep in `reports/T5.md`: the only `startsWith('sk-` left in `src` is `src/providers/keyPrefix.ts`; the team page and the admin route call `detectKeyProvider`.
- ✅ **AC-09 save.** `personalImageKey.test.ts` (PUT stores `openai` for `sk-`, `gemini` for `AIza`, returns the provider, 400 with nothing stored for `sk-ant-`, a random string and a malformed `AIza`). E2E TC-IK-01 to TC-IK-03.
- ✅ **AC-10 upgrade.** `test:upgrade` scenario 4 (`scripts/test-upgrade-path.mjs`): a pre-migration `UserOpenAiKey` row reads `provider = 'openai'`, and the resolver returns tier personal, provider openai. ALL PASS in `reports/T4.md` and `reports/T19.md` (not re-run).
- ✅ **AC-11 fallback.** `imageProviderResolution.test.ts` (five `resolveImageProviderWithSource` cases, including no personal row for `userId: null`) and `personalImageKey.test.ts` / `background.test.ts` (personal throw leads to one team call with `personalFailed`; 401 marks INVALID; no team provider is `PROVIDER_ERROR` with the personal-key message). The notice text is in `imageSourceNotice.test.ts`. Pass.
- ✅ **AC-12 E2E.** TC-IK-04 (personal Gemini key, draft records tier personal, provider gemini), TC-IK-05 (failing personal key falls back and the draft notice names Gemini), TC-IK-01/02 (card shows the provider next to the suffix). Run in T5 (6/6) and the T19 full run.
- ✅ **AC-13 down script.** `reports/T4.md` "AC-13 transcript": a gemini and an openai row, the down script with `ON_ERROR_STOP=1` (`DELETE 1`, two `ALTER TABLE`, `DELETE 1`), only the openai row remained and read under the previous schema, then re-applied cleanly. Not re-run.

**B**

- ✅ **AC-14 snapshot.** `fontsMerge.test.ts` (keeps a missing family with `delisted: true`, clears the flag on return, sets the date). The committed `catalogue.json` is 1950 families, `snapshotDate` 2026-10-26; `reports/T6.md` lists the seven AC-14 families present, with `sinhala` for Noto Sans Sinhala, Noto Serif Sinhala, Abhaya Libre, Yaldevi and Gemunu Libre.
- ✅ **AC-15 URLs.** `fontsUrl.test.ts` (Instrument Serif, JetBrains Mono, Noto Sans Sinhala, two families in one URL, an unknown family with one log line). Passes.
- ✅ **AC-16 evidence.** `reports/T6.md` "AC-16 evidence": the old Instrument Serif URL (`:wght@400;500;600;700`) and the new URL (`:ital,wght@0,400;1,400`) both returned HTTP 200. The report says plainly that Google did not refuse the old request as a whole; the defect is that it asked for weights and no italic axis the family lacks. The AC asks for the statuses and they are there.
- ✅ **AC-17 save validation.** `fontsValidate.test.ts` and `fontsRoute.test.ts` (unchanged stored entry kept, a submitted Google `url` replaced, unknown family, over 6, a non-offered script key and a Sinhala value lacking `sinhala` refused). The MCP path is covered in the same set through `validateKitFonts`. E2E TC-PF-04, TC-PF-08. See Deviations for the artifact-upload cap.
- ✅ **AC-18 one font list.** `googleFonts.ts` is deleted; the grep in `reports/T8.md` shows only `googleFontsUrl` matches. `fontsBoundary.test.ts` (allow-list of six catalogue importers) passes; `uiTokenGuard.test.ts` no longer exempts the path and passes.
- ✅ **AC-19 `applyPostFonts`.** `applyPostFonts.test.ts` (one marked link at the start of `<head>`, replaced when earlier, family before a generic keyword and in an inline `style`, an existing family and a `var()` value untouched, idempotent, no `<head>`). Pass.
- ✅ **AC-20 call-site guard.** `fontInjectionSites.test.ts`: Path A and Path B inject through the design runner post-process, refine injects before the commit, and no other file under `src` calls `applyPostFonts`. Pass.
- ✅ **AC-21 real Chromium.** `tests/render/postFonts.test.ts` (in my 154/154): with the stack extended the Sinhala glyphs come from the script font, and without the extension they fall back and the script font is never used. It uses a synthetic TrueType face built in code (`syntheticFont.ts`).
- ✅ **AC-22 stored HTML.** E2E TC-PF-05 (the stored HTML has the marked link and the stack entry although the mock design never names the font). T8 8/8 and the T19 full run.
- ✅ **AC-23 fonts missing.** `tests/render/postFonts.test.ts` ("a family with no face … missing", "a render with no marked link reports nothing", "a check that throws gives [] and never fails the render"); `fontNotice.test.ts`; `renderStampWriters.test.ts` covers `renderNotes`; E2E TC-PF-06 (`__MOCK_FONT_MISSING__` shows the notice). The check does not use `document.fonts.check()`; see Deviations.
- ✅ **AC-24 picker.** E2E TC-PF-01 (typing "instr" finds and saves Instrument Serif), TC-PF-02 (Sinhala picker lists Sinhala families only), TC-PF-03 (snapshot date), TC-PF-07 (None clears).

**E**

- ✅ **AC-25 entries.** `designAuthoring.test.ts` (ten keys, five categories, provenance of the typography entries) and `designDetect.test.ts` (the new triggers, including "make the headline big" to `type-scale`). Pass.
- ✅ **AC-26 kit rules.** `kitTypography.test.ts` (each finding, none for a sans heading with a serif body, completeness over every `AspectRatio` width via `MIN_BODY_PX_BY_WIDTH`). Pass.
- ✅ **AC-27 same runner.** `kitUpgradeRoute.test.ts` and the other kit-upgrade unit tests pass unmodified, and §AC TC-KU-01 to TC-KU-11 passed unchanged (T10: 23/23; also in the full runs).
- ✅ **AC-28 briefing host.** E2E TC-BU-01 (flag and Upgrade), TC-BU-02 (accept edits the textarea; Save makes a version), TC-BU-03 (editor gets 403, no model call), TC-BU-04 (stale base is 409 `STALE_BASE`), TC-BU-05 (the model-calls record shows `briefing-upgrade` on the briefing surface). Unit: `briefingUpgradeRoute.test.ts`, `ruleUpgrade.test.ts`.

**F**

- ✅ **AC-29 schedule parser.** `schedulePlan.test.ts` (10 tests: active key kept, unknown and retired replaced with the campaign default or `general` with `styleReplaced`, legacy `goal` mapped, the prompt lists the styles of the source it is given).
- ✅ **AC-30 plan UI.** E2E TC-AS-01 (select per row), TC-AS-02 (bad key replaced, row says so), TC-AS-03 (queue entries carry the shown `postStyle`).
- ✅ **AC-31 block and apply route.** `brandKitBlock.test.ts` (new and old `fonts` shapes) and `brandKitApply.test.ts` (one transaction, `previousFonts`, one invalid font writes nothing with 400, cross-team 404, editor 403). Pass.
- ✅ **AC-32 accept view.** E2E TC-AS-04 (current versus proposed; an unknown name is off), TC-AS-05 (Apply changes heading, body and Sinhala), TC-AS-06 (History shows the previous fonts).

**A**

- ✅ **AC-33 re-measure.** `measure/results.md` and `reports/T13.md`: 35 of 36 sets pass (Path B 34 of 35 = 97.1%, Path A 1 of 1; combined 97.2% with exactly one safe candidate); 29 of 35 matched elements hold child elements; the reasons for the rest are `not-found` 1 and 0 for all others; `APPLY_TEXT_BETA = false`; the 35-draft sample is called non-representative. The Path A part is tiny (one template), which the report states.
- ✅ **AC-34 candidates.** `applyTextCandidates.test.ts` (plain `<h1>`, a split by `<span>` and `<br>`, entity-encoded, ignoring `<title>`, `<script>` and `<svg>`, two for a repeated headline). Pass.
- ✅ **AC-35 refusals.** `applyTextCandidates.test.ts` (`precheckApply` codes with the HTML unchanged) and `applyTextRoute.test.ts` (422 with no claim; `not-stale` in the route). Pass.
- ✅ **AC-36 splice.** `applyTextSplice.test.ts` (byte compare outside the range, escaping of `<`, `&`, `>`, `splice-mismatch` for a forced bad offset with the input unchanged). Pass.
- ✅ **AC-37 in-render check.** `tests/render/applyCheck.test.ts` (in my 154/154): after a splice the target is painted and `absentPainted` is 0; the old text still painted by a second element gives `old-still-painted` through `acceptRender`; the hidden target gives `not-visible`. `commitAcceptRender.test.ts`: a rejection uploads nothing, opens no transaction and writes nothing. Amended per L6: the `::after` fixture became a second DOM element, and a fixture pins the pseudo-element limit. The AC's three behaviours are proven; the pseudo-element case is a recorded limit, so I count the AC as met.
- ✅ **AC-38 E2E.** TC-AP-01 (confirm, badge gone, stamp verified, a new revision) and TC-AP-02 (Undo restores `htmlContent` byte for byte). Full run 594/3/0/0 at T15 and 598 at T19.
- ✅ **AC-39 sentinels.** TC-AP-03, TC-AP-04, TC-AP-05 (each `__MOCK_APPLY_*__` gives its code, its toast and no new revision), TC-AP-06 (no button on a fresh, unconfirmed or unknown draft), TC-AP-07 (a second action gets 409), TC-AP-08 (a headline shown twice is `ambiguous`).
- ✅ **AC-40 event.** `applyTextRoute.test.ts` (one `draft.text_applied` per verdict, no text), `applyTextCoverage.test.ts` (every `APPLY_FAILURES` value has a carrier) and `analyticsCoverage.test.ts`; E2E TC-AP-09 (events once per verdict, `via: 'apply'`, no text). Pass.

**D**

- ✅ **AC-41 evidence.** `look-check/evidence.md` and `reports/T16.md`: the table for both OP-028 SQUARE renders. The bottom band (CTA, 76 to 100%) is busy in both (std dev 0.209 and 0.241 against the 0.12 limit; 0.191 and 0.285 at its inner edge); the top band passes in both (0.093, 0.095) but its last 2 points are busy in attempt 2 (0.126). The report states the caveat that pulling the bands back cannot fix the bottom alone.
- ✅ **AC-42 v2.** `lookDataset.test.ts` (v2 hash `f6b67506…7172` pinned, PORTRAIT and STORY deep-equal to v1, SQUARE geometry, no dataset problems, v1 hashes unchanged); `lookFixtureCompleteness.test.ts`; the nine `spotlight@2` fixtures (pass, busy, contrast for each size) run in `look-fixtures.test.ts` (render 154/154). `current` is 2 after the pass.
- ✅ **AC-43 probe.** `lookProbe.test.ts` (a super admin plans v2; refuses a non-super-admin, a version over the latest, a non-integer, zero, a string) and `planOverrideBoundary.test.ts` (only `look-probe/route.ts` passes a `version` to `planComposition`). Pass.
- ✅ **AC-44 verdict.** `op031Verdict.test.ts` and `lookCheck.test.ts` (pass on two kept and accepted, fail on any fallback or reject among the first two counted, an infra attempt not counted but using a ledger line, the cap refusing a fifth line). Pass.
- ✅ **AC-45 OP-031.** `look-check/ledger.jsonl` holds 2 lines (cap 4), both slot `spotlight@2:SQUARE`; `results.json` records both attempts `styleKept: true`, `fallbackReason: null`, `accepted: true`; verdict `{"passed":true,"status":"pass","counted":2}` (`reports/T17.md`). Applied per FR-50 in T18: `spotlight.current` 2, Promotion and Milestone `versions[2]` with `defaultImageStyle: 'spotlight'`, `POST_STYLES_REVISION` 12, and `lookCheckResults.test.ts` reads both results files (passes in my run, and a test shows 028 alone still fails spotlight).

**The gate**

- ✅ **AC-46 gate.**
  - tsc clean and lint 0 errors / 7 warnings (no new warning); unit 4553 (floor 4253), render 154 (floor 134), E2E 598/3/0/0 (floor 559/3/0/0); `test:upgrade` ALL PASS; CI green at `a511013` (run 40374348999).
  - `PROMPT_VERSION_BASE` is bumped exactly once: `git log 0f42017..HEAD -S PROMPT_VERSION_BASE -- src/lib/agent/prompts` lists one commit, and the diff line is `2026-10-25.1` to `2026-10-29.1` in `shared.ts`.
  - `git diff --name-only 0f42017 -- src/lib/scheduler src/mcp src/acp src/app/api/acp` lists only `src/mcp/tools/brandkit.ts`. `src/lib/agent/prompts` changed only in `shared.ts`.
  - The screenshots are recaptured (`reports/T19.md`, orchestrator part: `screen-light.png` and `screen-dark.png`, viewed, dark confirmed by the `dark` class). Not re-checked pixel by pixel by me; I cite the report.

## Deviations

- **AC-37 / L6.** The in-render check reads `innerText`, so CSS pseudo-element content is not detected. The `::after` fixture became a second DOM element, a fixture pins the limit, and the spec carries L6.
- **NFR-09.** `catalogue.json` is 263,944 bytes against the 250 KB target; getting under it would drop a field FR-16 requires. It is imported only by server code.
- **`server-only`.** `catalogue.ts` has no `import 'server-only'` (the package is absent, and the MCP and scheduler runtimes would crash). `fontsBoundary.test.ts` is an allow-list guard instead.
- **Fonts check.** `renderPost` does not use `document.fonts.check()` (false for any face no text used); a family is missing only when it has no face or every face errored (T7). FR-24's intent is met; the method differs from the spec's wording.
- **W items.** W-14 dropped (in `src/acp`, frozen by NFR-04); W-28 and W-36 fixed as wording only; W-35 casing only.
- **T11.** The mock schedule reply has 2 rows (one active key, one bad key), not design §7.1's three, so existing E2E counts hold.
- **T12.** The assistant Apply waits for the font lookups. A `__MOCK_FONT_UNKNOWN__` sentinel was added. The apply route has the limits listed below.
- **T15.** An extra 409 `DRAFT_NOT_READY`; Undo shows for any captured snapshot (so Template drafts can undo an Apply); the claimed work re-reads the draft and treats a change as `conflict`.
- **T14.** `absentPainted` is `number | null`; Apply fails closed on `null` (`render-failed`).
- **T16/T18.** Spotlight v1 is kept as `SUPERSEDED_FIXTURES` (v1 still resolves for stamps and refine); the OP-031 `infra` rule was tightened.
- **T17.** `bistec_studio_op1` needed five migrations (025's and 030's too), applied with the user's approval.
- **CI history.** The e2e job timeout was raised from 25 to 40 minutes (`5621bff`). Earlier runs: `5621bff` had one real failure (a locator renamed by T12, fixed in T15) and one flaky (TC-OBS-17, passed on retry); `26db51c` failed only the render harness on a CI-runner Chromium launch timeout (`WS endpoint`, 147/148, the same flake as the T2 run, a known runner flake). The final run at `a511013` is green.
- **T4 (extra field).** `imageSource` carries an extra `personalProvider` so the notice can name the failed key's provider; the notice uses plain "OpenAI" / "Gemini".
- **T6 (artifact cap).** The FONT artifact upload (`artifacts/route.ts`) writes `fonts` without the 6-entry cap. FR-20 names the kit POST, PATCH and MCP routes only, so AC-17 is met, but the gap is recorded.

## Known limits

From spec.md and the handoff:

- **L1.** Gemini is mock-verified only (out of scope by the user's decision).
- **L2.** Apply flattens styling inside the headline element; Undo restores it.
- **L3.** Script fonts reach only declarations that exist; a design with no `font-family` uses the OS fallback.
- **L4.** The font snapshot ages; the refresh is an operator step (`docs/cold-start.md`).
- **L5.** The typography prose rules are checked as text; only FR-27's rules are checked against the kit's fonts.
- **L6.** The Apply in-render check reads `innerText`; an old headline painted only through `::before` or `::after` content is not detected.

Carry-over limits (`briefs/T19-carryovers.md`):

- **T4.** When the personal key fails and the team provider's retry also fails, the result is a plain `PROVIDER_ERROR` skip with no `imageSource`, so the draft does not record that the user's key failed.
- **T12.** On a kit with no active voice version, Apply writes the fonts but makes no version, so `previousFonts` is not recorded; `previousFonts` is read before the transaction (a concurrent kit PATCH can make it stale); an Apply whose fonts equal the stored ones still makes a version; the panel's exact-match lookup relies on the family being in `/api/fonts`'s top 20.
- **T7.** `applyPostFonts` skips unquoted `style=` attributes and stops at a never-closed tag (both leave the document unchanged); stored HTML now carries the marked font link whenever the kit has catalogue fonts.
- **T11.** `loadDefaultStyle` reads the campaign by id only; safe because the chat route 404s a foreign campaign first.
- **T15.** Undo stays visible after an asynchronous Apply failure (it restores the unchanged current revision: harmless, but misleading).
- **Measurement.** The 97.2% rate rests on a 35-draft, non-representative sample and one Path A template.

## Per-task reviews

- T1 — PASS
- T2 — NOTE
- T3 — NOTE
- T4 — PASS
- T5 — NOTE
- T6 — NOTE (one fixed by the orchestrator)
- T7 — WARN (fixed by the orchestrator)
- T8 — NOTE
- T9 — NOTE
- T10 — PASS
- T11 — NOTE (one fixed)
- T12 — NOTE
- T13 — NOTE (one fixed)
- T14 — WARN (fixed)
- T15 — NOTE (the race fixed, and a tsc error the implementer missed)
- T16 — NOTE (one fixed)
- T17 — no review (orchestrator-run operator step)
- T18 — NOTE
- T19 — no review (docs; the orchestrator corrected the group mapping)

## Verification

Command: `npx tsc --noEmit`
Exit: 0

```
(no output)
```

Command: `npx vitest run <the 42 focused unit files named in the brief; every file exists>`
Exit: 0
Output (tail):

```
 Test Files  42 passed (42)
      Tests  576 passed (576)
   Duration  3.40s
```

Command: `npm run test:render`
Exit: 0
Output (tail):

```
 Test Files  9 passed (9)
      Tests  154 passed (154)
   Duration  142.17s
```

Command: `git diff --name-only 0f42017 -- src/lib/scheduler src/mcp src/acp src/app/api/acp`
Exit: 0
Output (tail):

```
src/mcp/tools/brandkit.ts
```

Command: `git diff --name-only 0f42017 -- src/lib/agent/prompts`
Exit: 0
Output (tail):

```
src/lib/agent/prompts/shared.ts
```

Command: `git log --oneline 0f42017..HEAD -S PROMPT_VERSION_BASE -- src/lib/agent/prompts` and `git diff 0f42017 -- src/lib/agent/prompts | grep PROMPT_VERSION`
Exit: 0
Output (tail):

```
-export const PROMPT_VERSION_BASE = '2026-10-25.1'
+export const PROMPT_VERSION_BASE = '2026-10-29.1'
 export const PROMPT_VERSION = derivedPromptVersion(PROMPT_VERSION_BASE)
```

(`git log -S` prints nothing here, because the match count is unchanged when a value is edited. `git log --oneline 0f42017..HEAD -G PROMPT_VERSION_BASE -- src/lib/agent/prompts` lists exactly one commit, `fa9e2e3` (T7), so the base was bumped once.)
