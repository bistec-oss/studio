# Verification Report: 022-prod-data-and-deploy-restore

**Verdict:** PASS (CI half of AC-11 pending, the orchestrator appends it)
**Verified:** 2026-10-19
**Model:** Claude Sonnet 5.5 (claude-sonnet-5-5), as the verify agent, read-only (the only command run with side effects was `npm run test:upgrade`, which touches only its own scratch database).

Target: branch `v2`, HEAD `12ef7e6`. Build commits: `8b5c551` (T1), `6d02d6b` (T2), `7982636` (T3), `32b02c8` (T4).

## Gates

| Gate                   | Result                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| tsc                    | clean (T4 report)                                                                                             |
| lint                   | 0 errors, the 7 known warnings (collect: `lint_passed: true`)                                                 |
| unit                   | **2556/2556**, 91 files (collect `test_output`)                                                               |
| build                  | passed (collect: `build_passed: true`)                                                                        |
| Full clean mock E2E    | **390 passed / 3 skipped / 0 failed / 0 flaky** (T4 report; clean DB with 35 migrations, carry-over included) |
| `npm run test:upgrade` | **re-run by the verifier: ALL PASS in 44.3s**, 3/3 scenarios                                                  |
| CI at `12ef7e6`        | pending, run 39169650169 in progress, the orchestrator appends                                                |

## Acceptance criteria

- MET **AC-01 (FR-01, FR-03).** Verifier re-run: scenario 1 PASS (8 legacy drafts converted to 24 rows, 9 archived, 2 kept drafts unchanged, post untouched, `copyText` dropped, 016 applied, `team_bistec_default` kept, head client read OK, migrate diff exit 0). That covers every FR-03 scenario-1 assertion. T1 also ran a mutation check (expected text `trim()`med): scenario 1 went RED on `upg_crlf/INSTAGRAM`, so the assertions can fail.
- MET **AC-02 (FR-01).** Scenario 2 PASS: out-of-order carry-over applied as a no-op (exit 0), archive exists and is empty. This also proves assumption A1 (Prisma 5.22 applies a back-dated migration).
- MET **AC-03 (FR-01).** Scenario 3 PASS: deploy exit 1, `copyText` kept, 0 caption rows, archive table absent (atomic), 016 not applied. Guard message, as printed by the verifier run: `ERROR: 022 legacy_caption_carryover: content guard failed (a converted caption row does not hold the expected text); nothing was written. 1 draft(s) were selected for conversion.`
- MET **AC-04 (FR-02).** `npx prisma validate` passes (T1 report), and the in-script `migrate diff --exit-code` exits 0 (in the scenario-1 PASS line, re-run by the verifier). The model matches the SQL (`reviews/T1.md`).
- MET **AC-05 (FR-03, NFR-03, NFR-05).**
  - The script hard-codes `bistec_studio_upgrade` and asserts the derived names before connecting (T1 review, lines 89-95). The orchestrator follow-up also refuses a non-local host (exit 2, proven in the T1 report).
  - After the verifier run the script prints "cleanup: scratch database dropped", and the T1 report shows no `pg_database` row and no leftover temp folders. The run takes 44s, under 2 minutes.
  - `git diff --name-only 8cbd78c -- prisma/migrations` prints only `prisma/migrations/20261012130000_legacy_caption_carryover/migration.sql` (verifier ran it).
- MET **AC-06 (FR-04).**
  - Local: with `NODE_ENV=production` and validly shaped env, `CLAUDE_CLI_MODEL=default` exits 1 and stderr names `CLAUDE_CLI_MODEL`, and `sonnet` exits 0 (T2 report).
  - `sh -n docker-entrypoint.sh` passes.
  - The image was built, and the new CI step's script was run verbatim against it: `default` stopped before any "applying" line (also with `SKIP_MIGRATIONS=1`), and `sonnet` printed the ok line before applying and then failed on the unreachable database as expected.
  - The CI run of that step is pending (see AC-11).
- MET **AC-07 (FR-05).** The "Prod boot depends on this file (change 022 FR-05)" block is at `src/lib/models/catalogue.ts` lines 13-21 (T2 report), and the T2 review accepted it.
- MET **AC-08 (FR-06).** Verifier ran `git diff --exit-code origin/main -- .github/workflows/docker-publish.yml`: exit 0. `grep -ci fork .github/workflows/e2e.yml` prints 0 (verifier ran it). actionlint 1.7.7 over `.github/workflows/` exited 0 in the T2 report, after two pre-existing SC2034 fixes (`for i` to `for _`) that the T2 review accepted.
- MET **AC-09 (FR-07, NFR-06).** The T3 report's greps: the forbidden-phrase grep matches only `CLAUDE.md:13` (the new rules entry's "fetch-only" for `fork`, which is allowed). All 77 headings below the procedure in `docs/fork-history.md` carry the `[fork context, superseded]` prefix. The procedure names all four check classes. The links exist in `CLAUDE.md` and `docs/handoff.md`, and `docs/handoff.md` links `../CLAUDE.md`. The moved text was proven verbatim for 16 ranges. The orchestrator fixed the T3 review WARNs afterwards.
- MET **AC-10 (FR-08).** The checklist in `docs/handoff.md` has the named waiver ("user, 2026-10-18"), the three blocking operator steps (the SQL verbatim, `in_flight` = 0, the restore plus redeploy of the previous SHA, and the `migrate resolve --rolled-back` step), the post-deploy counts, and the `CLAUDE_CLI_MODEL`, `copyText` callers, migration-list, release-note and deploy-window items (T3 report mapping table). The review WARNs are fixed: the recovery now says to resolve at once (P3009), the DraftCaption baseline is stated, and the migration list uses `origin/v2`.
- PARTIAL **AC-11 (gate).**
  - Local half: MET. tsc is clean, lint has 0 errors, unit is 2556/2556, build passes, and the full clean mock E2E is 390/3/0/0.
  - CI half: pending, the orchestrator appends the result for run 39169650169 at `12ef7e6`. This includes the new upgrade-path and preflight steps.

## NFR check

- NFR-01/02: no runtime-behaviour or model-call change in the committed diff. The only src changes are `src/scripts/env-preflight.ts` and a comment in `catalogue.ts`.
- NFR-03: met (AC-05). NFR-04: the boot is preflight, then one `migrate deploy`, then `exec`, with no new env vars (T2). NFR-05: met (AC-05). NFR-06: met (AC-09).

## Per-task reviews

- T1 — NOTE (1 fixed): the non-local host refusal was added by the orchestrator.
- T2 — NOTE
- T3 — WARN(2) (fixed): both fixed by the orchestrator in `docs/handoff.md`, plus the `origin/v2` note.
- T4 — no review (gate task)

## T1 incident note

The T1 report records that a stray `prisma migrate deploy` migrated the shared dev database `bistec_studio`, which belongs to the other checkout. The orchestrator's read-only check found that all 13 legacy captions were archived and converted verbatim, both teams were kept, and nothing was lost. This does not affect any AC, because the deliverable is the migration, the tests and the docs, and the migration behaved correctly. It happened outside the deliverable, on a shared dev DB, and the host-refusal guard now prevents a repeat of that class of mistake in the test script. The incident also acts as an unplanned real-data run of the upgrade path.

## Named waiver (accepted)

**Synthetic dry run only, no prod dump (user, 2026-10-18).** This is an accepted, recorded limitation, not a gap. The compensating control is the three blocking operator steps in the FR-08 checklist: a `pg_dump` backup, the legacy-count query with `in_flight` = 0, and the recovery procedure.

## Known gaps, none blocking

- CI result for `12ef7e6` is not yet known.
- Dev-machine DB operations (the incident above) are outside this change's scope.

**Code Review:** NOTE. Three reviewed tasks: two NOTE, one WARN (resolved); 0 BLOCK.

## CI (orchestrator, appended)

CI run 39169650169 (bistec-oss/studio, push to v2) at HEAD `12ef7e6c`: **success** — jobs `build` (incl. the new env-preflight image check), `unit`, `e2e` (incl. the new `npm run test:upgrade` step) all green. AC-11 is fully MET.
