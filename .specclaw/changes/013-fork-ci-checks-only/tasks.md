# Tasks: Fork CI — checks only, no image push, no deploy

**Change:** 013-fork-ci-checks-only
**Created:** 2026-10-09
**Total Tasks:** 3

## Summary

Delete `docker-publish.yml`, add `v2` to `e2e.yml`, and fix the comments that name the deleted workflow (T1). Update the docs and close 004 Phase 0 against the fork (T2). Push `v2`, re-enable Actions and watch the first run (T3). T1 and T2 change no runtime code, so the gates are lint, unit and build. There is no extra full E2E run, because the merge gate run covers the same tree plus comment-only changes.

## Tasks

### Wave 1 — Workflows, comments and docs

- [x] `T1` — Delete docker-publish.yml, add v2 to the e2e.yml triggers, fix the GIT_SHA comments
  - Files: `.github/workflows/docker-publish.yml` (delete), `.github/workflows/e2e.yml`, `Dockerfile`, `src/app/api/health/route.ts`, `src/lib/env.ts`
  - Estimate: small
  - Kind: config
  - Notes: AC-01, AC-02, AC-03. Comment-only edits in the three source files. Gates: lint, unit, build.

- [x] `T2` — Docs: the fork CI state, and the 004 Phase 0 closure
  - Files: `CLAUDE.md`, `docs/handoff.md`, `.specclaw/changes/004-design-instruction-fidelity/verify-report.md`
  - Estimate: small
  - Kind: docs
  - Depends: T1
  - Notes: AC-04 and AC-05. Use the merge gate evidence (`/api/health` response, node:22 image build, `claude --version`). Leave AC-P0-4 as "pending the first v2 CI run" until T3 fills it in.

### Wave 2 — Turn CI on

- [x] `T3` — Push v2, re-enable Actions, and watch the first run
  - Files: none, unless an approved NFR-02 fix touches `.github/workflows/e2e.yml`, plus `reports/T3.md` and the 004 verify-report's AC-P0-4 line
  - Estimate: small
  - Kind: config
  - Depends: T1, T2
  - Notes: AC-06 and AC-07. `git push origin v2` (fork only), then `gh api -X PUT repos/EnderGuardian25/ai-studio/actions/permissions -F enabled=true`, then `gh run list` / `gh run watch` on the E2E run for v2. Report any runner-only failure to the user before fixing it.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
- `[>]` Deferred
