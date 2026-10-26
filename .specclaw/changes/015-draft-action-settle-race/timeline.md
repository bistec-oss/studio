# Timeline: 015-draft-action-settle-race

**Total measured (leaf spans):** 7m12s · **Retries:** 0 · **Open spans:** 1 ⏱ still running

## By kind

- **phase** — 3m09s across 2 span(s)
- **task** — 7m12s across 2 span(s)
- **wave** — 16m43s across 2 span(s)

## Slowest

- `W2` (wave) — wave 2 — **9m31s**
- `W1` (wave) — wave 1 — **7m12s**
- `T2` (task) — settle on state — **5m28s**

## Spans

| Span      | Kind  | Label           | Model | Attempt | Status | Duration        |
| --------- | ----- | --------------- | ----- | ------- | ------ | --------------- |
| `propose` | phase | propose         | -     | -       | ok     | 1m31s           |
| `plan`    | phase | plan            | -     | -       | ok     | 1m38s           |
| `W1`      | wave  | wave 1          | -     | -       | ok     | 7m12s           |
| `T1`      | task  | forced-race E2E | opus  | 1       | ok     | 1m44s           |
| `T2`      | task  | settle on state | opus  | 1       | ok     | 5m28s           |
| `W2`      | wave  | wave 2          | -     | -       | ok     | 9m31s           |
| `T3`      | -     | -               | -     | -       | ok     | ⏱ still running |

_No baseline: this project has no archived timelines to compare against yet._
