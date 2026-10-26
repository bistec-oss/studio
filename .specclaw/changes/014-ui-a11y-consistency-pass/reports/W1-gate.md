# 014 wave-1 gate (HEAD `99534b84`, 2026-10-09)

**Verdict: passed.**

## AC-04 capture compare (same DB as the T1 baseline `e172e0d6`)

`node scripts/compare-captures.mjs ui-captures/014-before ui-captures/014-after ui-captures/014-diff --expect "draft-*" --expect "brandkits-*" --noise ui-captures/014-noise.txt` exited 0. Result: identical 50, different 8, total 58.

| Shot                              | Pixels                     | Tag      | Explanation                                                                                                                                                              |
| --------------------------------- | -------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| dashboard-{light,dark}-{1440,375} | ~900–1550                  | noise    | Only the relative-time labels changed ("2m ago" became "1h ago").                                                                                                        |
| draft-{light,dark}-1440           | ~5500                      | expected | **D3:** the "Revision History" line is about 2 px shorter, so the region from y 708 to 884 shifts up. All rows above it are identical, and the page height is unchanged. |
| draft-{light,dark}-375            | ~45000, height 1776 → 1773 | expected | **D3:** the column below "Revision History" shifts up about 2.5 px. Rows 0–550 are identical, the fixed button is identical, and no colour, size or typeface changed.    |

- **D1:** no pixel moved, because the Copy section-head row does not wrap in the 375 capture.
- **D2:** the brand-kit shots are pixel-identical, because the section tails are not visible in the captured state.
- **UNEXPECTED:** none.

## Full clean mock E2E

The run used a clean state: `rm -rf .next`, the test DB dropped and recreated, then `test:e2e:serve`.

**313 passed / 3 skipped / 0 failed / 0 flaky (5.8 min).** That is 316 in total; the 3 skips are the long-standing intentional ones.

## FR-04

`git diff e172e0d6..HEAD --stat -- tests/e2e` is empty.

## Verification

Command: npm run test:e2e:mock
Exit: 0
Output (tail):
3 skipped
313 passed (5.8m)
