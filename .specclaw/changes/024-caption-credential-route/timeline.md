# Timeline: 024-caption-credential-route

**Total measured (leaf spans):** 44m30s · **Retries:** 0

## By kind

- **phase** — 34m23s across 2 span(s)
- **task** — 44m30s across 4 span(s)
- **wave** — 44m30s across 4 span(s)

## Slowest

- `propose` (phase) — propose — **17m28s**
- `plan` (phase) — plan — **16m55s**
- `W3` (wave) — wave 3 — **14m14s**

## Spans

| Span      | Kind  | Label                               | Model  | Attempt | Status | Duration |
| --------- | ----- | ----------------------------------- | ------ | ------- | ------ | -------- |
| `propose` | phase | propose                             | -      | -       | ok     | 17m28s   |
| `plan`    | phase | plan                                | -      | -       | ok     | 16m55s   |
| `W1`      | wave  | wave 1                              | -      | -       | ok     | 4m09s    |
| `T1`      | task  | migration                           | sonnet | 1       | ok     | 4m09s    |
| `W2`      | wave  | wave 2                              | -      | -       | ok     | 13m10s   |
| `T2`      | task  | selector+resolver+stamp+gate        | sonnet | 1       | ok     | 13m10s   |
| `W3`      | wave  | wave 3                              | -      | -       | ok     | 14m14s   |
| `T3`      | task  | route API + /team + wizard + E2E AB | sonnet | 1       | ok     | 14m14s   |
| `W4`      | wave  | wave 4                              | -      | -       | ok     | 12m57s   |
| `T4`      | task  | docs + full gate                    | sonnet | 1       | ok     | 12m57s   |

_No baseline: this project has no archived timelines to compare against yet._
