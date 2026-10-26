# Verify report: 014-ui-a11y-consistency-pass

**Verdict: PASS**

All 21 acceptance criteria are met. AC-04 has one small caveat, listed under Gaps. Every task review ended with no BLOCK left open. NFR-01 to NFR-08 hold, and the binding decisions were followed.

- **Branch:** `v2`
- **HEAD:** `7c128f7b`. The code is identical to `32404ff9`; the commits after it are specclaw bookkeeping only.
- **Verified:** 2026-10-11

## Gates

| Gate                                                                          | Result                                                        | Source                            |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------- |
| `npm run lint`                                                                | 0 errors (the 7 known warnings)                               | `specclaw-verify collect` at HEAD |
| `npm run build`                                                               | passed                                                        | collect at HEAD                   |
| `npm run test:unit`                                                           | 61 files, 1769/1769                                           | collect at HEAD                   |
| Guard unit files (`uiPrimitives`, `uiTokenGuard`, `designTokens`, `contrast`) | 176/176                                                       | re-run by the verifier            |
| `tsc --noEmit`                                                                | clean                                                         | W3 gate (`32404ff9`)              |
| `npm run test:render`                                                         | 15/15                                                         | W3 gate                           |
| Full clean mock E2E, wave 1 (`99534b84`)                                      | **313 / 3 skipped / 0 failed / 0 flaky**                      | `reports/W1-gate.md`              |
| Full clean mock E2E, wave 2 (`536fc31b`)                                      | **326 / 3 / 0 / 0**                                           | `reports/W2-gate.md`              |
| Full clean mock E2E, wave 3 (`32404ff9`)                                      | **349 / 3 / 0 / 0**, with no re-runs                          | `reports/W3-gate.md`              |
| AC-04 capture compare                                                         | identical 50, different 8 (4 noise, 4 expected), 0 UNEXPECTED | `reports/W1-gate.md`              |

The 3 skips are the long-standing intentional ones: TC-GEN-05 and TC-REG-H11a/b/c. The wave-3 gate found a stale `next dev` server, removed it, and re-ran from a clean state with exactly one listener on :3001.

**Code review (whole change):** not run separately, because `workflow.code_review` is not set. Every task had its own `specclaw:code-reviewer` pass, except T1 and T15, which the orchestrator reviewed inline.

## Acceptance criteria

| AC                                | Status       | Evidence (test → source)                                                                                                                                                                                                  |
| --------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01 primitives                  | MET          | `tests/unit/uiPrimitives.test.ts:26-184` → `src/components/ui/{PageHead,SectionHead,Notice,FieldLabel,StatusChip,folio}`, exported from `index.ts`                                                                        |
| AC-02 copies replaced, name guard | MET          | `uiTokenGuard.test.ts:159-169` finds zero hits and its self-test passes. The local copies are deleted, and no `tracking-[0.14em]` remains outside `ui/`.                                                                  |
| AC-03 StatusWord folded           | MET          | `grep StatusWord src` is empty; the tone case is at `uiPrimitives.test.ts:171`                                                                                                                                            |
| AC-04 B is a no-op                | MET (caveat) | `git diff e172e0d6..99534b84 -- tests/e2e` is empty and the W1 E2E is clean. The compare shows 0 UNEXPECTED: noise is `dashboard-*` and expected drift is `draft-*` (D3).                                                 |
| AC-05 one field-label style       | MET          | `a11y.test.ts:126`, `:152`, `surfaces.test.ts:523`; `fieldLabelClasses` no longer exists                                                                                                                                  |
| AC-06 control heights             | MET          | `designTokens.test.ts:248-345`, `a11y.test.ts:285`, `:299` (with the token override) → `globals.css:44-46`, `tailwind.config.ts:52-54`                                                                                    |
| AC-07 one accent primary          | MET          | `a11y.test.ts:379` and `:413` (`['Add Kit']` with no kit open) → `KitDetail.tsx:459`, `PromptSection.tsx:191` (`variant="ink"`)                                                                                           |
| AC-08 kit-list cap and region     | MET          | `a11y.test.ts:399` → `admin/brandkits/page.tsx:92-93`                                                                                                                                                                     |
| AC-09 body tabular-nums           | MET          | `designTokens.test.ts:153`, `a11y.test.ts:482` → `globals.css:101`                                                                                                                                                        |
| AC-10 guard tokens                | MET          | `uiTokenGuard.test.ts:127-156` (10 positive and 7 negative samples); the tree is green                                                                                                                                    |
| AC-11 27 field labels             | MET          | all 27 rows in `a11y.test.ts` (rows 1-2 `:499`, 3 `:520`, 4-5 `:544`, 6 `:152`, 7-9 `:733`, 10-11 `:760`, 12/13/16 `:434`, 14 `:160`, 15/17 `:451`, 18-19 `:634`, 20/23/24 `:609`, 21-22 `:185`, 25 `:625`, 26-27 `:701`) |
| AC-12 named tablists              | MET          | `SegmentedToggle.tsx` requires `label` (tsc), plus `a11y.test.ts:912`, `:943`                                                                                                                                             |
| AC-13 login h1                    | MET          | `a11y.test.ts:509` → `login/page.tsx:44`                                                                                                                                                                                  |
| AC-14 stepper `aria-disabled`     | MET          | `surfaces.test.ts:479-501` → `Stepper.tsx:34`                                                                                                                                                                             |
| AC-15 read-once names             | MET          | kit row: `a11y.test.ts:417`. Breadcrumb: `surfaces.test.ts:775-782` and `a11y.test.ts:987`.                                                                                                                               |
| AC-16 static scroll regions       | MET          | `a11y.test.ts:943`, `:962`. No conditional region spread remains.                                                                                                                                                         |
| AC-17 24 × 24 targets             | MET          | `a11y.test.ts:1001` → `RecentDraftsCard.tsx:188`                                                                                                                                                                          |
| AC-18 provider On/Off word        | MET          | `a11y.test.ts:788` → `team/page.tsx:242-249`                                                                                                                                                                              |
| AC-19 axe scan                    | MET          | `a11y.test.ts:1041-1184`: 12 rules, 7 cases, 0 violations, falsifiability shown. `axe-core` is a devDependency, and the lockfile changed by one line.                                                                     |
| AC-20 DESIGN_SYSTEM               | MET          | §1, §6/§8.2/§8.3, §8.5, §8.15, §8.17, §8.18, §9, §11                                                                                                                                                                      |
| AC-21 gates                       | MET          | each wave E2E is 0 failed / 0 flaky; the final unit, lint, build, tsc and render gates are green                                                                                                                          |

## Tasks (review verdict → resolution)

- **T1:** reviewed inline; the self-compare was 58/58 identical.
- **T2:** NOTE(3).
- **T3:** WARN(1) and NOTE(1), fixed. The final form is PageHead's opt-in `actionsClassName`, after the T8 sweep found the first fix broke admin buttons.
- **T4:** NOTE(1).
- **T5:** NOTE(1).
- **T6:** NOTE(2); 2 `SMALL_CAPS` re-spellings remain (Gaps 5).
- **T7:** PASS, with NOTE(1).
- **T8:** NOTE(3); 2 fixed.
- **T9:** WARN(1) and NOTE(3), fixed (group names; helper move).
- **T10:** NOTE(3), handed to T11 and fixed there.
- **T11:** NOTE(2), fixed (variant-prefix guard; the AC-07 no-kit state, in T18).
- **T12:** NOTE(3); 1 fixed.
- **T13:** NOTE(2), plus a test-only flake fix.
- **T14:** PASS, with NOTE(1).
- **T15:** reviewed inline.
- **T16:** NOTE(2).
- **T17:** NOTE(3).
- **T18:** NOTE(3).

## NFRs and binding decisions

- **NFR-01, no behaviour change:** `git diff e172e0d6..HEAD -- src/app/api src/lib prisma src/mcp src/scheduler` is empty.
- **NFR-02, E2E per wave:** all three wave runs were 0 failed / 0 flaky. Wave 1 made no `tests/e2e` edit, and every later E2E edit is listed with its reason in its task report.
- **NFR-03 and NFR-04:** per-task gates are green, and the guards are green with self-tests.
- **NFR-05:** the only dependency change is the `axe-core` devDependency.
- **NFR-06:** the primitive contract has been stable since wave 1.
- **NFR-07:** no horizontal scroll at 375 px.
- **NFR-08:** contrast is green.
- **Binding decisions, all followed:**
  - one change, with one E2E run per wave;
  - B landed first;
  - the A/C coupling stayed together;
  - no placeholder was edited;
  - the static scroll-region rule;
  - only the 011 T8 stepper and breadcrumb assertions were superseded, and 011's spec was not edited;
  - the §8.17 doc fix.

## Gaps and follow-ups (none block the verdict)

1. **AC-04 caveat:** W1 explains each differing shot in words, with pixel counts. The diff crops themselves are in the gitignored `ui-captures/014-diff/`.
2. **The floating Create post button covers trailing content at some widths:** the draft refine input at 1440 px, and the team badge and settings text at 375 px. This predates 014 and gets its own follow-up.
3. **The campaign-detail DETAILS labels** are a sentence-case `dt` list, not `FieldLabel`. This is polish to decide later.
4. **The AC-07 Add-Kit check** is resolved in T18.
5. **`BriefingAssistantPanel.tsx:247` and `:362`** still spell out `${SMALL_CAPS} text-fg-muted`. It is identical to `EYEBROW`, so this is cosmetic.
6. **Two placeholders repeat their visible labels:** the library search and the team metadata field. This is intentional for now.
7. **Optional test hardening:**
   - assert the Brief label has no `for` in the AI-suggestion state;
   - Tab-walk to the regions;
   - log axe `incomplete` results;
   - catch the digit-suffixed `*-primary-500` in the guard.
8. **`COMPACT_TEXTAREA`** is a new `ui/folio.ts` atom that FR-01 and DESIGN_SYSTEM §8.18 could list.

Out of scope by decision: the refine poll race, the 010 two-checkbox assertion, the 012 caption UI, and a draft-page More menu.

**Verdict: PASS**
