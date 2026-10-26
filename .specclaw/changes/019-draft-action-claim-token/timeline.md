# Timeline: 019-draft-action-claim-token

**Total measured (leaf spans):** 44m09s · **Retries:** 0

## By kind

- **phase** — 8m18s across 1 span(s)
- **task** — 44m09s across 4 span(s)
- **wave** — 44m20s across 3 span(s)

## Slowest

- `W3` (wave) — wave 3 — **19m55s**
- `T4` (task) — gate + docs — **19m54s**
- `W2` (wave) — wave 2 — **16m28s**

## Spans

| Span   | Kind  | Label                    | Model  | Attempt | Status | Duration |
| ------ | ----- | ------------------------ | ------ | ------- | ------ | -------- |
| `plan` | phase | plan                     | -      | -       | ok     | 8m18s    |
| `W1`   | wave  | wave 1                   | -      | -       | ok     | 7m57s    |
| `T1`   | task  | claim-token column       | sonnet | 1       | ok     | 7m56s    |
| `W2`   | wave  | wave 2                   | -      | -       | ok     | 16m28s   |
| `T2`   | task  | token + lifecycle guards | sonnet | 1       | ok     | 8m08s    |
| `T3`   | task  | content-write guards     | sonnet | 1       | ok     | 8m11s    |
| `W3`   | wave  | wave 3                   | -      | -       | ok     | 19m55s   |
| `T4`   | task  | gate + docs              | haiku  | 1       | ok     | 19m54s   |

_No baseline: this project has no archived timelines to compare against yet._
