# Tasks: Hide the floating Create post button on the draft page

**Change:** 020-create-post-button-draft-page · **Size:** bounded
**Created:** 2026-10-20
**Total Tasks:** 2

## Summary

This change has **2 tasks in 2 waves**:

1. the exclusion, its tests and its docs;
2. the gate.

## Process / Gates

- **One task at a time:**
  1. an implementer subagent does the task;
  2. `specclaw:code-reviewer` reviews it;
  3. the orchestrator re-runs tsc, `npm run lint` and `npm run test:unit`, then commits.

  Never run two implementers in this checkout.

- **No real model calls.**
- **The databases are shared.** Never run a prisma or DB command without an explicit `DATABASE_URL` that points at `bistec_studio_test` or a named scratch database. `bistec_studio` is never touched. Use `export MSYS_NO_PATHCONV=1` before any docker command that takes a container path.
- **Baselines (019 T4, 2026-10-20):**
  - unit 2681/2681;
  - lint 0 errors / 7 warnings;
  - full clean mock E2E 397/3/0/0.

  A task may add cases; it may not lower the pass count or add a lint warning.

## Tasks

### Wave 1 — The change

- [x] `T1` — Hide the button on the draft page, with its tests and docs
  - Files: `src/components/layout/AppShell.tsx`, `src/components/layout/CreatePostButton.tsx` (comment only), `src/components/providers/ToastProvider.tsx` (comment only, if its text needs it), `tests/e2e/create-post-button.test.ts`, `docs/ui-reference/DESIGN_SYSTEM.md`, `.specclaw/changes/011-app-visual-redesign/spec.md`, `docs/e2e-test-plan.md`
  - Estimate: small
  - Kind: impl
  - Depends: none
  - Notes:
    - **Covers:** FR-01, FR-02, FR-03, FR-04; AC-01 to AC-05.
    - **The code.** One local constant in `AppShell.tsx` for "`/brief` or under `/drafts/`", used at `:263`. Update the JSX comment at `:261-262`. Change nothing else in the file, including the `pb-[140px]` at `:253`.
    - **The tests.** Narrow the AC-01 case's loop to `/`, `/library` and `/campaigns` and drop its draft; keep its `/brief` assertions. Add the absent-on-draft case (1440 and 375) and the Send-not-covered case (AC-02: `scrollIntoViewIfNeeded`, box inside the viewport, `elementFromPoint` at the centre is Send or a descendant). Reuse `createExportedDraft`, `pageLogin` and the `MOCKED()` skip.
    - **The docs.** §8.9 "Layering" and "Known"; the 011 update note plus the FR-01 and AC-01 markers (keep the original text); the `e2e-test-plan.md` update note and one map row. Do not touch the other §-references listed in the spec's Notes.
    - **Run the targeted E2E suites** against a fresh `:3001` test server (`npm run test:e2e:serve`, DB prepared with `npm run test:e2e:db`): `create-post-button.test.ts` and `surfaces.test.ts`. Both must be fully green. Stop any stray node server first; one `next dev` per project.
    - **Report** `reports/T1.md`: the diff summary, the targeted run's counts, and whether the absent-on-draft check is one test or two (it sets the expected E2E total).
    - Do not edit anything outside the file list. Do not recapture the reference screenshots (A3).

### Wave 2 — Gate

- [x] `T2` — The full gate, CI, and the results recorded
  - Files: `docs/handoff.md`, `CLAUDE.md`
  - Estimate: small
  - Kind: test
  - Depends: T1
  - Notes:
    - **Covers:** AC-05, AC-06, AC-07.
    - **Prepare for the full run:**
      - stop stray node processes;
      - `rm -rf .next`;
      - `docker exec designer-postgres-1 psql -U bistec -d postgres -c "DROP DATABASE IF EXISTS bistec_studio_test WITH (FORCE);"`, then `npm run test:e2e:db`.
    - **Then run:**
      - `npm run test:e2e:serve` and `npm run test:e2e:mock`, for 0 failed and 0 flaky, with the total at the 397/3/0/0 baseline plus the new case(s);
      - tsc, `npm run lint`, `npm run test:unit` and `npm run build`;
      - `rm -rf .next` after the build.
    - **Run the AC-05 scope diff** (`git diff --name-only 9990b42`) and paste it into `reports/T2.md`.
    - **Push `v2` to `origin`** (never `main`), then watch `gh run list --branch v2` until CI is green at the last commit.
    - **Record** the run ID and the gate numbers in `CLAUDE.md`'s top entry and the handoff's "Where things stand" table. Mark 020 verified, and update the "Next" line: with 019 and 020 both done, the build order 018 → 022 → 021 → 019 → 020 is complete, and the remaining items are the company prod to-dos.
