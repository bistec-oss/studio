# Status: Design instruction fidelity

**Change:** 004-design-instruction-fidelity
**Started:** 2026-09-15
**Last Updated:** 2026-09-15

## Progress

| Phase    | Status                      | Notes                                                                     |
| -------- | --------------------------- | ------------------------------------------------------------------------- |
| Proposal | ✅ Approved                 |                                                                           |
| Spec     | ✅ Done                     | 26 acceptance criteria                                                    |
| Design   | ✅ Done                     | 3 phases, ordered by reversibility                                        |
| Tasks    | ✅ Done                     | 16 tasks / 4 waves                                                        |
| Build    | ✅ Complete                 | 16/16 · 21 commits on `specclaw/004-design-instruction-fidelity`          |
| Verify   | ⚠️ Partial                  | **PARTIAL** — 15 MET / 0 NOT MET / 11 UNVERIFIED (see `verify-report.md`) |
| PR       | ⏸️ Deliberately not created | User is shipping 004 together with 005/006/007 as one release             |

## Task Progress

**Completed:** 16 / 16
**Failed:** 0

Gates: tsc clean · lint 0 errors (7 pre-existing warnings) · **592/592 unit** (from 347) · production build green · `render-fidelity` 4/4 against real Chromium.

## Outstanding before this ships

Three verification steps, none requiring code. Full commands in `verify-report.md`.

1. **AC-01** — `docker build` + the glyph assertion **inside the image**. Docker daemon was down; a local run is a documented false green.
2. **The E2E suite** — needs Postgres + MinIO + a server on :3001. **15 new cases have never executed.**
3. **One live CLI-mode refine** — closes AC-08/09/10/11/12/13, which the E2E suite **cannot** reach: `.env.test` runs API mode and the classification code is CLI-only, while production runs CLI mode.

## Issues

- **AC-06's wording is unachievable** at the signature the plan mandated — `reconcileInlineAssets` cannot re-insert a dropped placeholder. Spec defect, not implementation. (`learnings.md` L6)
- **AC-17's rejected render has no HTTP read surface** — by design; DB-readable only.
- **AC-20's "byte-identical"** holds with two declared deltas (the `fontSetId` stamp on `regenerate-design`; `claimDraftAction` clearing the new `notAppliedReason` column).
- Two defects found and fixed mid-build, both between task boundaries: the `MOCK_AI` stub returning byte-identical HTML (`learnings.md` L12), and a stale not-applied card surviving a successful regenerate.

## Agent Runs

Built subagent-driven, 3 parallel per wave (`parallel_tasks: 3`).

| Wave | Tasks           | Notes                                                                                                                                |
| ---- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | T1–T4           | T1 applied directly (one-line Dockerfile edit); T2/T3/T4 in parallel                                                                 |
| 2    | T5–T9           | T5/T6/T8 then T7/T9. T6's agent was killed mid-task by an API spend limit — its files survived and were verified by the orchestrator |
| 3    | T10–T13         | T10/T12 then T11, T13                                                                                                                |
| 4    | T14 → T15 → T16 | Strict dependency chain, sequential                                                                                                  |

The verify agent was also killed by a spend limit before writing anything; `verify-report.md` was written by the orchestrator directly.
