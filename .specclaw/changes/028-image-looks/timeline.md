# Timeline: 028-image-looks

**Total measured (leaf spans):** 49m32s · **Retries:** 0 · **Open spans:** 1 ⏱ still running

## By kind

- **phase** — 1h03m32s across 2 span(s)
- **task** — 49m32s across 5 span(s)
- **wave** — 49m43s across 3 span(s)

## Slowest

- `propose` (phase) — propose — **46m38s**
- `W3` (wave) — wave 3 — **18m57s**
- `T4` (task) — e2e — **18m57s**

## Spans

| Span      | Kind  | Label    | Model  | Attempt | Status | Duration        |
| --------- | ----- | -------- | ------ | ------- | ------ | --------------- |
| `propose` | phase | propose  | -      | -       | ok     | 46m38s          |
| `plan`    | phase | plan     | -      | -       | ok     | 16m54s          |
| `W1`      | wave  | wave 1   | -      | -       | ok     | 12m14s          |
| `T1`      | task  | dataset  | sonnet | 1       | ok     | 12m14s          |
| `W2`      | wave  | wave 2   | -      | -       | ok     | 18m32s          |
| `T2`      | task  | resolver | sonnet | 1       | ok     | 4m44s           |
| `T3`      | task  | fixtures | sonnet | 1       | ok     | 7m36s           |
| `T5`      | task  | runner   | sonnet | 1       | ok     | 6m01s           |
| `W3`      | wave  | wave 3   | -      | -       | ok     | 18m57s          |
| `T4`      | task  | e2e      | sonnet | 1       | ok     | 18m57s          |
| `T6`      | -     | -        | -      | -       | ok     | ⏱ still running |

_No baseline: this project has no archived timelines to compare against yet._
