# T13 re-measure (FR-35)

Run 2026-10-26 with `apply-measure.ts` (through `tsx`, importing the real `src/lib/applyText/candidates`). Read-only: two `SELECT` statements on `bistec_studio_op1` (the SQL is in the script and in `reports/T13.md`). No model call, no write. Raw output: `results.json`.

**The 35-draft sample is non-representative.** It is 35 interactive Path B drafts made on one scratch database by one tester, not a draw from production. Cite its rate only with that caveat.

Test: `precheckApply(html, headline, headline + ' (new)')`; a pass is "exactly one safe candidate".

| Set                                                                      | n   | exactly one safe candidate | element holds child elements | refused       |
| ------------------------------------------------------------------------ | --- | -------------------------- | ---------------------------- | ------------- |
| Path B drafts (the 030 selection: `htmlContent` and `headline` set)      | 35  | 34 (97.1%)                 | 29 of 34                     | `not-found` 1 |
| Path A templates, filled with their own sample headline (first h1/h2/h3) | 1   | 1 (100%)                   | 0 of 1                       | none          |
| Path A templates with no h1/h2/h3 sample headline (Hearts Talk)          | 1   | not measured               |                              |               |
| **Combined**                                                             | 36  | **35 (97.2%)**             | **29 of 35 (82.9%)**         | `not-found` 1 |

Counts per failure: `not-found` 1; `ambiguous` 0; `unsafe-element` 0; `unsafe-text` 0; `new-text-present` 0.

Notes:

- The rate is above 80%, so `APPLY_TEXT_BETA = false`.
- Most matches (29 of 35) sit in an element with child elements (an accent `<span>` or `<br>`); Apply flattens that styling. The splice replaces the whole inner content.
- The one `not-found` draft (`...zwvn0q`) has a stored headline the visible markup does not carry exactly; Apply would refuse it.
- The Path A sample is tiny (2 templates in this database, one with no headline element), so it says almost nothing.
