# Timeline: 023-scheduler-heartbeat

**Total measured (leaf spans):** 5h08m24s · **Retries:** 0

## By kind

- **phase** — 10m07s across 2 span(s)
- **task** — 5h08m24s across 3 span(s)
- **wave** — 5h08m25s across 3 span(s)

## Slowest

- `W3` (wave) — wave 3 — **4h57m49s**
- `T3` (task) — docs, roadmap, gate — **4h57m48s**
- `W2` (wave) — wave 2 — **7m46s**

## Spans

| Span      | Kind  | Label                            | Model  | Attempt | Status | Duration |
| --------- | ----- | -------------------------------- | ------ | ------- | ------ | -------- |
| `propose` | phase | propose                          | -      | -       | ok     | 6m04s    |
| `plan`    | phase | plan                             | -      | -       | ok     | 4m03s    |
| `W1`      | wave  | wave 1                           | -      | -       | ok     | 2m50s    |
| `T1`      | task  | heartbeat migration              | sonnet | 1       | ok     | 2m50s    |
| `W2`      | wave  | wave 2                           | -      | -       | ok     | 7m46s    |
| `T2`      | task  | worker, helper, route, UI, tests | sonnet | 1       | ok     | 7m46s    |
| `W3`      | wave  | wave 3                           | -      | -       | ok     | 4h57m49s |
| `T3`      | task  | docs, roadmap, gate              | sonnet | 1       | ok     | 4h57m48s |

_No baseline: this project has no archived timelines to compare against yet._
