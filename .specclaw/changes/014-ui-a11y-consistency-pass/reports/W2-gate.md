# 014 wave-2 gate (HEAD `536fc31b`, 2026-10-10)

**Verdict: passed.**

## Full clean mock E2E

The run used a clean state: `rm -rf .next`, the test DB dropped and recreated, then `test:e2e:serve`.

**326 passed / 3 skipped / 0 failed / 0 flaky (6.4 min).** That is 329 in total, and no case needed a re-run.

## Review captures (not a gate)

`ui-captures/014-wave2` has 62 shots. The compare against `014-after` is not meaningful, because the captures ran after the E2E filled the DB, so the list contents and page heights differ.

Viewed shots: brand kits, campaign detail, team, settings, draft and brief, light and dark, at 1440 and 375 px. **No wave-2 visual defects:**

- inputs and selects are 36 px, with no clipping and centred chevrons;
- the labels are small caps with no overlap;
- the kit list is capped;
- no shot scrolls sideways at 375.

## Observations (not regressions, unchanged since 014-after)

- **(a)** The campaign-detail DETAILS labels are a detail list, not field labels.
- **(b)** The floating Create post button covers trailing content in some shots: the draft refine input at 1440, and the team badge and settings text at 375. Logged as a follow-up.
- **(c)** The capture script never opens a kit, so the brand-kit Ink buttons are not in any shot. They are covered by the T11 AC-07 E2E.
- **(d)** The team social-channel inputs are placeholder-only. That is wave-3 T16.

## Verification

Command: npm run test:e2e:mock
Exit: 0
Output (tail):
3 skipped
326 passed (6.4m)
