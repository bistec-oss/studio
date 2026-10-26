# Final whole-branch review: 028-image-looks (027b image looks)

Range `701fe0f..1fd2f23` (10 commits, T1 to T5 plus reviews). The code baseline for the hard rules is `4053cfe`. The reviewer was read-only: no build, no E2E and no server. The checks below were run with `git` and `grep`, plus one arithmetic check of the cover-fit mapping.

## Strengths

- **The hard rules hold, and I checked them, not just read the reports.**
  - `git diff --name-only 4053cfe 1fd2f23` lists nothing under `src/lib/agent`, `src/lib/scheduler`, `src/mcp`, `src/acp`, `src/app/api/acp`, `src/app/api/campaigns`, `prisma`, `.env.example` or `src/lib/env.ts`.
  - The NFR-01 `git grep -c` counts are unchanged: `createMessage` 21, `runClaudeCli` 27, `recordModelCall` 29, `generateImage` 17.
- **The pipeline makes no assumption about size or region count.**
  - `background.ts` `checkHero` samples `hero.sizeContract.regions`, all of them, in one page and inside one timeout.
  - `evaluateRegions` loops over every region.
  - `evaluateLayout` accepts a box inside _any_ text region, so the two Spotlight bands work.
  - `designContractText` and `refineContractText` list every text region.
  - No `regions[0]` or single-region lookup is left in `src/` outside the mock seam.
  - The STORY cover fit fills the canvas (scale 1.25, sides cropped), so `areaPct` for a 22% band is 22 and clears `minAreaPct: 20`.
- **The stamp readers handle v2 and the new keys.**
  - Refine resolves `contractAt(applied, stampedVersion, size)`.
  - Regenerate re-plans from the brief, so it records `current` (2).
  - Restore copies the revision's own stamp.
  - `compositionNoticeFor` and `styleLabel` are driven by the dataset.
  - The analytics enum is built from `Object.keys(archetypes)`.
  - No file outside `designData` and `postStyles/styles.ts` names a look key.
- **The 9:16 lift is fully landed.** `git grep -n "STORY\|9:16" -- src` returns only the kept lines of the FR-06 table. The `9:16` text in `compositionNotice.ts:42` is unreachable, which is L3.
- **Unattended surfaces stay classic, and that can be proven.**
  - `UNATTENDED` is still the first check in `resolve.ts`.
  - The runner, MCP and ACP files are byte-identical.
  - TC-LOOK-11 covers it end to end.
  - No production code reads `ResolveNote` (grepped).
- **`retired-classic` is correct and is placed in the order the spec gives:** unattended, then Path A, then retired, then not in the dataset, then size. An explicit retired key never reaches it from the API, because `validateImageStyle` returns 400 first. Resume maps a retired key to classic through `resumeImageStyle`. A retired post-style default resolves to classic and is stored as classic. On the shipped dataset nothing is retired, so it is not reachable today, which is intended.
- **The runner's spend control is sound.** The ledger line is written before the call. A malformed line counts toward the cap. The cap is computed. The runner refuses at the cap before signing in. Generations run one at a time.
- **The tests are meaningful.** The fixtures assert the exact failing region (the last band for busy, the first for contrast). The completeness test compares against a literal backdrop table. The existing suites were inverted only as far as the STORY change needs, and no case was deleted.

## Issues

### Critical

None.

### Important

**I-1. PORTRAIT crop: the measured bands of the two band looks reach into the area where the image model was told to draw the subject.**

- **Where:** `src/lib/designData/composition.ts:198` (full-bleed-scene PORTRAIT subject) and `:232` (spotlight PORTRAIT subject).
- **What happens.** The image prompt states each region in canvas percent (`imageContractText`: "The top 24% of the frame…", "centred in the middle 52%"). The model, though, draws a 1024x1536 (2:3) image for PORTRAIT (`imageCapabilities.ts:60`), and the cover fit on 1080x1350 crops 8.3% of the image off the top and off the bottom. Canvas y% maps to image y% as `0.8333·c + 8.33`:
  - **Spotlight PORTRAIT:** the measured top band is image 8.3 to 28.3%, and the bottom band is image 71.7 to 91.7%. The prompt asked for the subject in image 24 to 76%. So 4.3 points of each band, about 21% of its height, lie in the subject zone. A spotlit subject or its glow there will trip `busy` or `contrast`: light text needs backdrop L ≤ 0.183 on 95% of samples.
  - **Full-bleed PORTRAIT:** the measured band is image 60 to 91.7%, against a scene that fills image 0 to 62%. That is a 2-point overlap, the same size as 009's product-showcase PORTRAIT, which OP-1 tolerated.
  - SQUARE (no crop) and STORY (no vertical crop) are exact.
- **Why the plan missed it.** design.md §3 works through only the STORY crop. The fixtures paint the mapped image band (`lookFixtures.ts`, `mapRegionToImage`), so they cannot show the gap between the prompt and the measurement. The mock E2E cannot show it either.
- **Why it matters.** `spotlight:PORTRAIT` is an OP-028 slot. One failure there fails the Spotlight look, and that keeps Promotion and Milestone classic in T7. Fixing it after release costs a `spotlight` v2. Before VERIFIED PASS, NFR-04 allows an adjustment in place, with a new hash and a recorded reason.
- **Fix: adjust both PORTRAIT subjects in place, before T6 and OP-028.**
  - Spotlight PORTRAIT: "centred in the middle 42% of the frame" (image 29 to 71%, clear of both measured bands).
  - Full-bleed PORTRAIT: "filling the top 58% of the frame … across the bottom 42%".
  - Keep the rects, so the fixtures, the mock and the layout logic are unchanged. Update the two hashes in `lookDataset.test.ts`, the FR-02 table rows, the heroPrompts goldens for those two contracts, and the T1 report (with the reason).
  - If the user would rather keep the geometry, record it as known limit L6 in the T6 handoff and flag `spotlight:PORTRAIT` as the expected weak slot in the OP-028 procedure. Either way it needs the user's call, because it amends the FR-02 table.
- **Pass to the follow-ups.** 025 and any future PORTRAIT contract should state the subject in image space, or compensate for the crop like this.

**I-2. The AC-04 unit table, per surface, is not there.**

- **Where:** `tests/unit/postStylesResolve.test.ts:125-185`.
- **What is missing.** AC-04 asks for a unit table: on `wizard` and `briefs-api`, Launch at STORY gives `product-showcase` and Announcement at STORY gives `editorial-split`, with no note; an explicit `full-bleed-scene` or `spotlight` is kept at every size; on `queue`, `mcp` and `acp`, every look at every size is classic with `unattended-classic`.
- **What exists:**
  - Launch at STORY, on the wizard only (`postStylesWizard.test.ts:57`).
  - Unattended, with `editorial-split` at the default size only.
  - No new-look cases on any surface.
  - Announcement at STORY appears only in E2E (TC-LOOK-10).
- **Why it matters.** The code is correct by reading (the `UNATTENDED` check comes first and ignores look and size). But the AC names a unit table, and verify will check that literally. That table is also the unit-level proof that unattended surfaces stay classic.
- **Fix:** add one `it.each` over SURFACES × the four looks × the three sizes, plus the two style defaults at STORY on `wizard` and `briefs-api` (expect `notes: []`). About 20 lines; no src change.

**I-3. AC-03 "`IMAGE_STYLES` omits a retired look" is untested and, as built, cannot be tested with a fixture dataset.**

- **Where:** `src/lib/designData/composition.ts:302-321`.
- **The cause.** `IMAGE_STYLES` is computed once from the real `archetypes`. `imageStyleOptions(size, source)` maps that real list and uses `source` only for `supported`. With a fixture dataset in which `spotlight` is retired, it therefore still lists Spotlight as supported, and `supportsSize` and `styleAfterSizeChange` inherit that. A key that exists only in the fixture is never listed.
- **Effect.** Production is correct, because the real list filters on `status === 'active'`. But the `looks` and `source` injection this change added is only half real. AC-03's "omits a retired look" bullet and its "`styleLabel` still resolves a retired look" bullet have no test. 009's `compositionPlan.test.ts:94` covers `contractAt` only.
- **Fix:**
  - Extract `imageStylesOf(source)`, which is classic plus the active looks of `source`.
  - Set `IMAGE_STYLES = imageStylesOf(archetypes)` and have `imageStyleOptions` map `imageStylesOf(source)`. Production output stays identical.
  - Add a unit test with a fixture dataset in which `spotlight` is retired: `imageStylesOf` omits it; `imageStyleOptions(…, fixture)` omits it; `styleLabel('spotlight', fixture)` and `contractAt('spotlight', 1, 'SQUARE', fixture)` still resolve.

### Minor

- **M-1** `src/lib/testHooks.ts:467-477`: the "6 × 6 grid, 2% start, 8% step" spans only 2 to 48% on each axis. For product-showcase SQUARE, editorial-split SQUARE, PORTRAIT and STORY (four contracts), no grid cell lies outside, and the `{92,92}` fallback does the work. The behaviour is correct, and the unit test proves an outside box for every contract. But FR-09's "a unit test asserts that _such a cell_ exists" is literally false for those four. Fix: either say in the comment and the T6 docs that the corner fallback is part of the rule, or use a 16% step.
- **M-2** AC-05, "resume keeps a 9:16 look and drops it on Path A": the resume decision is inline in `useBriefWizard.ts:401-405` and has no unit test. Only the E2E covers the keep. Optional: extract a pure `resumedImageStyle({ imageStyle, designMode, aspectRatio })` into `wizardStyleState.ts` and add two unit cases.
- **M-3** `tests/unit/postStylesResolve.test.ts:126`: the comment "No current style defaults to a look" is stale (Launch and Announcement do), and the `withLook` fixture is therefore unnecessary for those two. Reword the comment.
- **M-4** Spotlight's `use` strings assign the headline and the CTA and logo, but no band for body text (`designContractText` says "Headline, body text and the logo go only inside these regions"). A model may put body text over the subject. That is only a layout observation on an interactive post (L4), but worth a line in the T6 handoff, or "the headline and any short body text" before release.
- **M-5** AC-18: `reports/T4.md` describes the screenshots but does not state "no horizontal scroll" or "visible focus", which AC-18 names. T6 or verify should look at `ui-captures/028/` for both and record them.

## Triage of the deferred task minors

| Item                                                                           | Decision                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1: prettier reflow of unrelated lines in `composition.ts` and `promptText.ts` | **Leave.** No behaviour change, and the v1 hashes are unchanged (the re-wrapped v1 string is byte-identical). Reverting is churn.                                                                                                                                                                                         |
| T1: the module-load assertion test is a source-text check                      | **Fix before verify (cheap).** AC-02 says the assertion "throws on a bad fixture outside production". Do it with `vi.resetModules()` and `vi.doMock('@/lib/designData/composition', async (o) => ({ ...(await o()), archetypes: bad }))`, then `await expect(import('@/lib/designData')).rejects.toThrow(/design data/)`. |
| T3: the light-backdrop branches in `lookFixtures.ts` are unexercised           | **Leave.** They are small and give the tone-agreement test meaning when a light look arrives.                                                                                                                                                                                                                             |
| T5: the ledger cap is per `--out`                                              | **Fix in T6 docs (must).** The OP-028 runbook must say: one fixed `--out`, namely `.specclaw/changes/028-image-looks/look-check/`, for every invocation, and never delete or move `ledger.jsonl`.                                                                                                                         |
| T5: no lock between processes                                                  | **Leave.** The runbook says to run one runner at a time.                                                                                                                                                                                                                                                                  |
| T5: the `exportUrl` fetch has no localhost guard                               | **Leave.** No credentials are sent, and the URL comes from the localhost server the runner already trusts.                                                                                                                                                                                                                |
| T4: a redundant null check in TC-LOOK-12                                       | **Leave.**                                                                                                                                                                                                                                                                                                                |
| T4: TC-LOOK-03 and TC-LOOK-04 are slow                                         | **Leave.** They were green three times, and the size is in the assertion message.                                                                                                                                                                                                                                         |

## ACs other than T6 (docs) and T7 (AC-20, AC-21)

- **AC-01, AC-02, AC-05 to AC-17:** met by the code and tests in this range. AC-02 is met with the caveat that its module-load throw is checked by source text (triage above). AC-05's resume half has no unit test (M-2).
- **AC-03:** partly met. "`IMAGE_STYLES` omits a retired look" and "`styleLabel` resolves a retired look" are untested (I-3).
- **AC-04:** partly met. The per-surface unit table is missing (I-2).
- **AC-18:** the screenshots exist, but focus and horizontal scroll are not recorded (M-5).
- **AC-19:** for the T6 gate.

## Verdict

**Ready to merge: With fixes.** Nothing is Critical, and the architecture is sound: the pipeline, the stamp readers, the unattended surfaces and the STORY lift are all correct.

Fix before T6 and the first verify:

- **I-2 and I-3:** tests, plus one small pure refactor that changes no production output.
- **The AC-02 behavioural test:** cheap.
- **I-1:** get the user's decision first, because it amends the FR-02 table. Either adjust the two PORTRAIT subjects in place now, while NFR-04 still allows it, or record the crop as L6 and name `spotlight:PORTRAIT` as the expected weak slot in OP-028.

The Minor items can be left or folded into T6.
