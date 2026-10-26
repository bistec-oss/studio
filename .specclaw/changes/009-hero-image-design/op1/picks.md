# 009 OP-1 picks (the user, 2026-10-23)

Each styled render compared with the classic render of the same brief.

| Brief                                                    | product-showcase | editorial-split |
| -------------------------------------------------------- | ---------------- | --------------- |
| sq-announce (square, announcement, Bistec kit)           | better           | better          |
| sq-event (square, event, Hearts Academy kit)             | better           | better          |
| sq-product (square, product, Bistec kit)                 | better           | better          |
| pt-announce (portrait, announcement, Hearts Academy kit) | **worse**        | better          |
| pt-event (portrait, event, Bistec kit)                   | better           | better          |
| pt-product (portrait, product, Bistec kit)               | better           | better          |

**A styled render preferred on 6 of 6 briefs (bar: 4). PASS.**

- Stamps: all 12 styled renders `requested = applied` (no fallback); `layout-violation` observed on pt-announce editorial-split and pt-product product-showcase.
- `IMAGE_QUALITY` (one sq-product product-showcase render each): unset 11–22 s hero; `standard` 35.5 s (stamp `standard`); `high` 99.0 s (stamp `high`). `medium` is not a recognised value (treated as unset).
- Files: `results-batch.json` (18 jobs; sq-product classic failed on a Prisma pool timeout), `results-rerun.json` (that job re-run alone), `results-{high,standard,medium}.json`, `run-op1.mjs` (the runner; the seeded test password in it is the repo's fixed seed credential).
- The PNGs are not committed (about 45 MB); they were in the session scratchpad.
