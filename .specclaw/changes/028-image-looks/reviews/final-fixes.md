# 028 final-fixes re-review (160c2e0..cfc55bc)

- I-1 ADDRESSED. Arithmetic checked: scale max(1.0547, 0.8789) = 1.0547, scaled height 1620, crop 135 px per side = 8.33%. Image y% = 0.8333c + 8.33, so the bands map to image 8.3-28.3 and 71.7-91.7. The old 52% (image 24-76) overlapped each band by 4.3 points. 42% (image 29-71) clears both. The model draws in image space, so the prompt wording is the right lever. Rects are unchanged, and the spotlight@1 hash, the PORTRAIT golden and the spec FR-02 row are all updated. The product-showcase and editorial-split hashes are untouched.
- I-2 ADDRESSED. The `it.each` table covers 6 surfaces x 4 looks x 3 sizes. Launch and Announcement at STORY on wizard and briefs-api give product-showcase and editorial-split with no note. Unattended surfaces stay classic at every size.
- I-3 ADDRESSED. `imageStylesOf(source)` is pure and `IMAGE_STYLES` is built from it, so production output is identical. A test pins the equality, a retired-look fixture is omitted from the list and the options, and a fixture-only look is listed.
- T1 minor ADDRESSED. The test is now behavioural: it mocks the composition module with a bad record key, imports `designData`, expects a throw under NODE_ENV test and a clean import under production.
- New breakage: none seen. `imageStyleOptions` now reads from `source` instead of the global `IMAGE_STYLES`; the default parameter keeps production behaviour the same.
- Minor, no action: the report's "subject at image 29-71" is in image space, and in canvas space the subject is canvas 29-71 (image 32.5-67.5). Either reading clears the bands. I did not re-run the suites; I relied on the orchestrator's tsc, lint and unit results.

NOTE
