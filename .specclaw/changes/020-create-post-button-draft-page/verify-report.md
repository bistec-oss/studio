# Verification Report: 020-create-post-button-draft-page

**Verified:** 2026-10-20
**Model:** Sonnet 5.5 (claude-sonnet-5-5)
**Verdict:** PASS (7/7 ACs). HEAD `9604402`; last code commit `8d0d633`.

## Evidence provenance

- **Collected at verify time:**
  - lint: 0 errors / 7 warnings (the baseline);
  - build: passes;
  - unit: 2681/2681.
- **E2E:** no `e2e_command` is configured, so verify did not re-run E2E. The evidence is the T2 full clean mock run at `8d0d633`, which gave 399 passed / 3 skipped / 0 failed / 0 flaky (`reports/T2.md`). That is the 397 baseline plus AC-01b and AC-02b. The targeted runs and the AC-02b mutation check are in `reports/T1.md`.
- **CI at `8d0d633`:** both runs succeeded, the push run 39466314229 and the pull_request run 39466320752. The commits after it (`bd0e0fb`, `9e79b6a`, `9604402`) change only docs and specclaw files.

## Acceptance Criteria

- ✅ **AC-01.** The button is absent on the draft page and kept everywhere else.
  - `AppShell.tsx` defines `const hideCreatePost = pathname === '/brief' || pathname.startsWith('/drafts/')` and renders `{!hideCreatePost && <CreatePostButton />}`. The button is absent from the DOM, not hidden by CSS. The comment says why both pages are excluded.
  - In `tests/e2e/create-post-button.test.ts`, AC-01 now loops over `/`, `/library` and `/campaigns`. It no longer mints a draft or skips under `MOCKED()`. Its `/brief` and `/brief?resume=` assertions are unchanged.
  - AC-01b (with the `MOCKED()` skip guard) loads `/drafts/[id]` at 1440×900 and at 375×812. It asserts a `fab(page)` count of 0 and no link named "Create post". It is one test that covers both viewports.
- ✅ **AC-02.** Nothing covers the refine Send button.
  - AC-02b finds `getByRole('button', { name: 'Send', exact: true })` and calls `scrollIntoViewIfNeeded`. It then scrolls so Send's bottom edge sits 24 px above the viewport bottom, which is the floating button's band.
  - It asserts that Send is inside the viewport (`inside`), inside the band (`inBand`), and not covered (`!covered`). The cover check uses `elementFromPoint` with `el.contains(hit)`.
  - Mutation check (`reports/T1.md`): AC-01b and AC-02b fail with the button restored on `/drafts/`, and pass with the fix.
- ✅ **AC-03.** The other cases still pass.
  - The AC-02 cases (label at 1440, icon only at 375, Tab focus) and the AC-03 cases (toasts at 1440 and 375) are unchanged.
  - `surfaces.test.ts` passes inside the 399/3/0/0 full run.
- ✅ **AC-04.** The docs are updated.
  - **`DESIGN_SYSTEM.md` §8.9:**
    - "Layering" says the button is hidden on `/brief` and on the draft page (020), with the reason.
    - "Known" says the 140 px padding still serves the pages that show the button.
  - **`CreatePostButton.tsx`:** the comment reads "except /brief and the draft page".
  - **The 011 `spec.md`:** it has an update note, and FR-01 and AC-01 carry an inline "(amended by 020 …)" marker. The original text is kept.
  - **`e2e-test-plan.md`:** it has an update note and one row in the §9 traceability table.
  - **No stale rule left:** `grep "except /brief" src docs/ui-reference/DESIGN_SYSTEM.md` matches only the updated `CreatePostButton.tsx:6` line.
- ✅ **AC-05.** The scope stays inside the plan.
  - `git diff --name-only 9990b42` lists only these files:
    - `src/components/layout/AppShell.tsx`;
    - `src/components/layout/CreatePostButton.tsx`;
    - `tests/e2e/create-post-button.test.ts`;
    - `docs/ui-reference/DESIGN_SYSTEM.md`;
    - `docs/e2e-test-plan.md`;
    - the 011 `spec.md`;
    - `docs/handoff.md`;
    - `CLAUDE.md`;
    - `.specclaw/STATUS.md`;
    - 020's own directory.
  - Nothing changed under `src/app/`, `src/lib/`, `prisma/` or `src/components/drafts/`.
  - `CreatePostButton.tsx` differs only in comment lines, and `ToastProvider.tsx` has no diff.
- ✅ **AC-06.** The gate passes.
  - tsc is clean, lint gives 0 errors and 7 warnings (the baseline), unit passes 2681/2681, and the build passes.
  - The full clean mock E2E gives 399/3/0/0, the spec's 399 case.
  - CI is green at the last code commit, `8d0d633`.
- ✅ **AC-07.** The results are recorded.
  - `CLAUDE.md`'s top entry records:
    - T1 `8d0d633`;
    - the T2 gate numbers;
    - CI runs 39466314229 and 39466320752;
    - the updated "Gates now" line.
  - The `docs/handoff.md` table row records the same E2E, unit and CI results.
  - After this report, both mark 020 VERIFIED PASS.

## Issues Found

No blocking issues.

- **Informational (spec A3):** `docs/ui-reference/screen-light.png` and `screen-dark.png` were not recaptured, so they still show the button on the draft page. `CLAUDE.md` records this as a known gap. It is not an AC.
- **Process:** the T2 gate agent handed back before its E2E run finished, so the orchestrator waited for the run's exit line and ran the remaining gates itself. A "build complete" commit (`9e79b6a`) landed before T2 was marked complete because the report footer was rejected; `bd0e0fb` corrected it. No code was affected.

## Per-task reviews

- T1 — WARN(1) → resolved before commit. The WARN was that AC-02b would have passed with the button restored. The fix is confirmed in the test file, and the four NOTEs are resolved (`reviews/T1.md` Resolution section).
- T2 — no review (gate only).

## Summary

**Passed:** 7/7 criteria
**Failed:** 0/7 criteria
**Verdict:** PASS
