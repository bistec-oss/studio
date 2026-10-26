# Verification Report: 021-graphite-retheme

**Verdict:** PASS (AC-05's literal shell grep keeps one accepted, documented carve-out line)
**Verified:** 2026-10-20
**Model:** Claude Sonnet 5.5 (claude-sonnet-5-5), as the verify agent, read-only (commands run: git, grep, find and `npx vitest run` on five unit files).

Target: branch `v2`, HEAD `aa5f7a8`. Build commits: T1 `6c42ff8`, T2 `9a317ef`, T3 `4545d4e`, T4 `72320b8`, T5 `a38d1c9`, T6 `fb6bd6c`, T7 `9ad8fe1`, T8 `b8d041a`; timeline `aa5f7a8`.

## Gates

| Gate                  | Result                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| tsc                   | clean (T8 report)                                                                                                                                                        |
| lint                  | 0 errors, the 7 known warnings (collect: `lint_passed: true`)                                                                                                            |
| unit                  | **2652/2652**, 91 files (collect). Verifier re-ran `uiTokenGuard`, `uiPrimitives`, `designTokens`, `contrast`, `noTeamNotice`: 5 files, **290/290** pass                 |
| build                 | passed (collect: `build_passed: true`)                                                                                                                                   |
| Full clean mock E2E   | wave 1 (T3) **395/3/0/0**, wave 2 (T7) **397/3/0/0**, final (T8) **397/3/0/0**, all 0 flaky. The baseline is 390/3/0/0 (reports/T1.md:5, T3.md:80, T7.md:78, T8.md:110)  |
| `npm run test:render` | **15/15** (reports/T8.md:109)                                                                                                                                            |
| specclaw e2e tier     | `not_configured`; the E2E evidence is the task reports above                                                                                                             |
| CI at `aa5f7a8`       | run 39411442063: success. T3 to T7 pushes green; one PR-run render-harness failure on the T6 commit was a 30 s Chromium launch timeout (infra), superseded by green runs |

## Acceptance criteria

- MET **AC-01 (FR-01, R10).** `designTokens.test.ts` parses `study-a-graphite.html` and `globals.css` and passes (verifier re-run). `DEVIATIONS` is `{}` (T1 report line 58), so there is no entry to list in DESIGN_SYSTEM.md §3. The T8 review diffed the §3.1 token block against `globals.css`: identical, no missing or extra keys.
- MET **AC-02 (FR-01, FR-02).** `designTokens.test.ts` asserts the key set (`--radius-xl`, `--space-5`, `--space-10` added, `--space-12` removed), the 32/38/44 control heights, the Tailwind mapping and `fontFamily` keys `['sans','mono']`. All pass in the verifier re-run.
- MET **AC-03 (NFR-01).** `contrast.test.ts` passes (verifier re-run) with the 0.12 chip alpha. The T8 report recomputed the 21 pairs for DESIGN_SYSTEM.md §3.3.
- MET **AC-04 (FR-03, NFR-05).**
  - Source: `src/app/layout.tsx:2` is `import { JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google'`, the only font import. `grep -rn "font-display\|font-text" src` prints nothing.
  - E2E: the new AC-04 body-font case was added in T1 (reports/T1.md table) and passed in all three full runs. The AC-19 no-CDN check was not edited and stayed green.
- MET (with one accepted carve-out) **AC-05 (FR-13, FR-06, FR-03).**
  - Unit: the guard test passes with every pattern on and the self-test samples (T1 and T6 reports, T8 review: "244/244 pass").
  - `find src -iname '*folio*'` prints nothing (verifier ran it).
  - `grep -rniE "fraunces|instrument[ _]sans|\bfolio\b" src` prints **one line**: `src/components/admin/brandkits/googleFonts.ts:11`, which lists `'Instrument Sans'` among the Google Fonts a brand kit can choose for generated posts. This does not meet the literal "prints nothing".
  - Why it stays MET: the line is font data for generated posts, which FR-12 and NFR-10 forbid changing, and removing it would change which fonts a brand kit offers. The T1 report (line 98) raised it, the guard excludes this file from pattern 1, and DESIGN_SYSTEM.md §11 documents the carve-out. The T8 review confirms it is the only hit ("carve-out 1"). No UI text or UI font uses it. Strictly, the literal shell sub-bullet is PARTIAL; the criterion's intent is met.
- MET **AC-06 (FR-06).** `find` shows exactly `ui/atoms.ts`, `ui/GateNotice.tsx`, `campaigns/classes.ts` and `admin/brandkits/classes.ts`. tsc is clean (T8 report). The T8 review grepped for the removed names (`BLOCK`, `SECTION_NUMERAL`) and found none left.
- MET **AC-07 (FR-04, FR-05).** `uiPrimitives.test.ts` passes (verifier re-run) with the Graphite class strings (pill Button with raised and flat shadows, pill Input, `rounded-ui-md` textarea, StatusChip `/12` and no `uppercase`, sentence-case FieldLabel). The `numeral` prop is gone from `SectionHead` (T8; the verifier's grep finds `numeral` only in two comments).
- MET **AC-08 (FR-05, 011 FR-08).** The `surfaces.test.ts` AC-09 opaque cases were not edited and stayed green in the 395, 397 and 397 runs (reports/T3.md:69).
- MET **AC-09 (FR-07).** T3 added the sidebar "Create" label case (`uppercase`, 11px, `letter-spacing: 1.54px`; reports/T3.md:65). The `a11y.test.ts` AC-05 label case was updated in T1/T2 and passed in the full runs. The guard's tracking and `uppercase` patterns are on after T8.
- MET **AC-10 (FR-08).**
  - Verifier ran `git hash-object public/BistecStudioLogo.png` = `9a2e3fca8c38e65d04ffb78779f37f3842132a3b` and `git rev-parse 7fdbe38^:public/BistecStudioLogo.png` = the same hash.
  - The per-theme E2E pair (login and banner `img "Bistec Studio"`, `background-image` and `filter`) replaced the wordmark case in T1 and passed.
- MET **AC-11 (FR-09).** T3 added the header geometry case (x = 12, y = 12, 56 px, `18px` radius, shadow; `surfaces.test.ts:395`) and the nub and reduced-motion cases (reports/T3.md:64 and T8.md:87). The existing AC-11 mobile, AC-17 shell-stop and Create post button cases are unedited or minimally edited and green (reports/T3.md:69).
- MET **AC-12 (FR-11).** T5 added two AC-12 cases (the crop-mark absence, and the stage-left of caption layout at 1440 and stacked at 375; reports/T7.md:81, T8.md:90). The "shown as rendered" and 375 px no-scroll cases stay green. `grep` finds no proof-plate or crop-mark name in `src/` (guard pattern 7 is on).
- MET **AC-13 (FR-10).** The verifier ran `grep -rnE "border-[tb]-2|numeral=|numeral\b" src`: no `border-[tb]-2` and no `numeral=`; the two `numeral` hits are comments (`(app)/page.tsx:126`, `brief/StepHead.tsx:8`). The `\bfolio\b` grep over `src` is clean except the AC-05 carve-out. Each guard pattern was switched on in its task (T1, T2, T5, T6, T8 reports).
- MET **AC-14 (FR-12, NFR-06).** The three full clean runs are 0 failed and 0 flaky, with counts 395, 397 and 397, all at or above the 390 baseline. The T8 report (lines 78-90) lists every test edit per task. T1 flagged two edits outside design.md §11 (`a11y.test.ts` `CONTROL_PX`/`OVERRIDE_PX` and the `font-text` removals in `uiPrimitives.test.ts`), explained as forced and minimal, and the reviews accepted them. The one T7 failure (`a11y.test.ts:652`, a T6 file) was resolved and the clean run passed.
- MET **AC-15 (FR-14).** Collect: unit 2652/2652. The verifier re-ran the five named files: 290/290.
- MET **AC-16 (FR-15).**
  - `docs/ui-reference/DESIGN_SYSTEM.md` has §1 Decision record to §11 and §8.1 to §8.19 (`grep` of headings), with §8.12 "The post stage", §8.13 "Versions" and §8.14 "Caption and refine cards" as A10 requires.
  - `docs/ui-reference/archive/` holds only `frozen-light`; there is no `folio` directory.
  - CLAUDE.md's "UI / Design system" section points at Graphite (T8 review, lines 39-43).
- MET **AC-17 (FR-16).** T1, T3, T7 and T8 each report a 62-PNG capture run, with visual notes written from viewing the light and dark shots (reports/T3.md:85, T7.md:88, T8.md:111). `docs/ui-reference/screen-light.png` and `screen-dark.png` were refreshed by the T8 commit (verifier checked `git log` and file times).
- MET **AC-18 (NFR-03).** T2 added the press-scale reduced-motion case (reports/T3.md:82). The existing centred-modal and 150 ms fade cases are unedited and green in the full runs. The `motion-reduce` classes exist in `Button.tsx:59` and `CreatePostButton.tsx:34,42` (T8 review).
- MET **AC-19 (NFR-10, gates).** The build passed (collect), lint is 0 errors, and `npm run test:render` is 15/15 (reports/T8.md:109).

## NFR check

- NFR-01/02/03: met (AC-03, AC-18, and the focus outline is shared per the T2 review).
- NFR-04/05: `themeInitScript` is untouched; fonts load only through `next/font` (AC-04).
- NFR-06/07: met (AC-14; per-task gates are in each report).
- NFR-08: no runtime dependency was added (not seen in any report or diff review).
- NFR-09: wave 1 (T1 to T3) stands alone as the cut; the T3 full run (395) was green with Folio-structured screens still in place.
- NFR-10: met (AC-19).

## Per-task reviews

- T1 — APPROVED (no BLOCK or WARN; comment and header leftovers went to T2 and T8)
- T2 — APPROVED (no BLOCK or WARN)
- T3 — APPROVED (no BLOCK or WARN)
- T4 — NOTE
- T5 — WARN(1), resolved: the "Draft" eyebrow was restored per A7
- T6 — NOTE (the paper card on the two aside blocks is a kept, defensible extension)
- T7 — NOTE (slot group heads stay small caps; a later tweak at most)
- T8 — APPROVED (no BLOCK or WARN; one NOTE on the kit title size, applied afterwards by the orchestrator)

## Follow-ups (none blocking)

1. The brand-kit title size change after T8's review (`text-ui-xl` on `KitDetail.tsx` and `TITLE_FIELD`, plus DESIGN_SYSTEM.md §5.2 rows) has no separate E2E run. The orchestrator re-ran unit, tsc and lint, and no E2E reads that size. The CI run at `aa5f7a8` covers it.
2. The 2 MB `BistecStudioLogo.png` is restored as is (spec edge case). Optimising it is a separate change.
3. The `googleFonts.ts` Instrument Sans entry is permanent font data. If the user ever wants the literal AC-05 grep to print nothing, the brand-kit font list needs its own change.
4. The release rule still holds: 021 lives on `v2`, and nothing here goes to `main` without the user's go-ahead.

**Code review:** no BLOCK in any of the eight reviews; one WARN (T5), resolved.
