# 028 final review fixes

## I-1 Spotlight PORTRAIT subject

The subject now says "the middle 42%" (was 52%). Rects unchanged; no other contract touched (full-bleed 4:5 overlaps by 2 points, same as a passing 009 contract, left as is).
Arithmetic: image 1024x1536 cover-fit on 1080x1350: scale = max(1080/1024, 1350/1536) = 1.0547; scaled height 1620; crop 270, 135 each side = 8.33% of 1620. Canvas y c% maps to image y% = 0.8333c + 8.33. Measured bands 0-24 and 76-100 map to image 8.3-28.3% and 71.7-91.7%. Old "middle 52%" asked for image 24-76%, overlapping each band by 4.3 points. "Middle 42%" = image 29-71%, clear of both.
Updated: composition.ts, spotlight@1 SHA-256 (6f48b77b... -> 856a579c1ac7fb5fdc9a2918671b774691b6db803b6d56d39c8a53a8c0c2634f) in lookDataset.test.ts, heroPrompts golden (PORTRAIT `lit(42, 24)`), spec.md FR-02 row plus a "tuned before release (NFR-04, final review I-1)" note. product-showcase/editorial-split hashes unchanged.

## I-2 AC-04 table

postStylesResolve.test.ts: `it.each` over 6 surfaces x 4 looks x 3 sizes (attended keep the look with no notes; unattended classic with `unattended-classic`); Launch and Announcement at STORY on wizard and briefs-api (product-showcase, editorial-split, no note); unattended with look-default styles at every size. Also reworded the stale M-3 comment.

## I-3 Retired look in the picker

composition.ts: new pure `imageStylesOf(source)`; `IMAGE_STYLES = deepFreeze(imageStylesOf(archetypes))`; `imageStyleOptions` maps `imageStylesOf(source)`. Tests: equality with IMAGE_STYLES, a fixture with retired spotlight is omitted from list and options while `styleLabel` and `contractAt` still resolve, and a fixture-only look is listed.

## T1 minor

The source-text load check is replaced by a behavioural test (`vi.doMock` of the composition module with a bad record key, dynamic import of `@/lib/designData`): throws /design data/ with NODE_ENV test, resolves under production. The old test case was adapted, not kept.

## Verification

Command: `npx tsc --noEmit`
Exit: 0
Output (tail):
(no output)

Command: `npm run lint`
Exit: 0
Output (tail):
✖ 7 problems (0 errors, 7 warnings)

Command: `npm run test:unit`
Exit: 0
Output (tail):
Test Files 155 passed (155)
Tests 3894 passed (3894)

Command: `npm run test:render`
Exit: 0
Output (tail):
Test Files 5 passed (5)
Tests 84 passed (84)

Command: `git diff --name-only 4053cfe -- prisma .env.example src/lib/env.ts src/lib/scheduler src/mcp src/acp src/app/api/acp src/app/api/campaigns src/lib/renderer src/lib/agent`
Exit: 0
Output (tail):
(empty)
