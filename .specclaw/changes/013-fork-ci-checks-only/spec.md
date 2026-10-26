# Spec: Fork CI — checks only, no image push, no deploy

**Change:** 013-fork-ci-checks-only
**Created:** 2026-10-09
**Size:** bounded
**Status:** 🟢 Approved proposal (2026-10-09)

## Overview

The fork `EnderGuardian25/ai-studio` runs CI checks on `v2`, `main` and PRs. It pushes no image and deploys nothing. Fork `main` was merged into `v2` (`2506de0b`), which brought the hardened `docker-publish.yml`. This change deletes that workflow, extends the `e2e.yml` triggers and turns GitHub Actions back on.

**The user's decisions (2026-10-09):** delete `docker-publish.yml`, so there is no GHCR push, no Coolify redeploy and no company health poll. `e2e.yml` triggers on PRs plus pushes to `v2` and `main`. Re-enabling Actions with `gh api` is approved once this lands on `v2`.

## Requirements

### Functional Requirements

- **FR-01:** `.github/workflows/docker-publish.yml` no longer exists. No workflow in `.github/workflows/` pushes an image (`docker push`, `push: true`, `docker/login-action`), calls `coolify.bistecglobal.com`, or polls `studio.bistecglobal.com`.
- **FR-02:** `.github/workflows/e2e.yml` triggers on `pull_request` and on `push` to `v2` and `main`. Its jobs (`e2e`, `unit`, `build`, including `docker build .` with no push) are otherwise unchanged.
- **FR-03:** No source or doc comment names `docker-publish.yml` as the thing that sets `GIT_SHA`. These three files say that whoever builds the image passes `--build-arg GIT_SHA=<sha>`, and that without it `/api/health` reports `commit: "unknown"`:
  - `Dockerfile`;
  - `src/app/api/health/route.ts`;
  - `src/lib/env.ts`.
- **FR-04:** `CLAUDE.md` and `docs/handoff.md` describe the fork's CI state: checks only, on `v2`, `main` and PRs, with no publish and no deploy, and Actions on. Historical company docs are not rewritten: the prod findings docs, the B4 diagnosis, `docs/coolify-token-rotation.md` and the dated history entries.
- **FR-05:** 004's Phase 0 criteria are closed against the fork, in `.specclaw/changes/004-design-instruction-fidelity/verify-report.md`:
  - AC-P0-3 and AC-P0-5 are re-proven on the merged `v2`;
  - AC-P0-1 and AC-P0-2 (Coolify redeploy and prod health verification) are recorded as **superseded** by this change, because the fork has no deploy target;
  - AC-P0-4 (no Node-20 deprecation warnings) is checked against the first `v2` CI run's annotations.
- **FR-06:** Actions are re-enabled on the fork (`gh api -X PUT repos/EnderGuardian25/ai-studio/actions/permissions -F enabled=true`) only after FR-01 and FR-02 are pushed to `origin/v2`. The first `v2` run is observed.

### Non-Functional Requirements

- **NFR-01:** Nothing is pushed, deployed or published outside `origin` (the fork). The `company` remote is never touched.
- **NFR-02:** Any fix needed for the first CI run to pass on GitHub runners, such as a timeout, is minimal, reported to the user before it is made, and limited to `e2e.yml`.

## Approach

One decision: **delete the workflow, don't guard it.** The fork has no deploy target. A guarded job would keep 250 lines of company-specific Coolify logic alive, and a future deploy workflow will be written fresh for the user's own target. File map:

- `.github/workflows/docker-publish.yml`: **deleted**.
- `.github/workflows/e2e.yml`: `push.branches: [main]` becomes `[v2, main]`, and the header comment is updated.
- `Dockerfile`, `src/app/api/health/route.ts`, `src/lib/env.ts`: comment-only edits (FR-03).
- `CLAUDE.md`, `docs/handoff.md`: the fork CI state (FR-04).
- `.specclaw/changes/004-design-instruction-fidelity/verify-report.md`: the Phase 0 closure (FR-05).

## Acceptance Criteria

- **AC-01 (FR-01):** `test ! -e .github/workflows/docker-publish.yml`. `git grep -nE "push: true|docker/login-action|coolify\.bistecglobal|studio\.bistecglobal" -- .github/` returns nothing.
- **AC-02 (FR-02):** `e2e.yml`'s `on:` block lists `pull_request` and `push.branches` containing exactly `v2` and `main`. `git diff` of `e2e.yml` touches only the `on:` block and comments, plus any NFR-02 fix that was approved and reported.
- **AC-03 (FR-03):** `git grep -n "docker-publish" -- Dockerfile src/` returns nothing. The three comments name `--build-arg GIT_SHA`. Code is unchanged: `git diff` shows comment lines only, and `npm run lint`, `npm run test:unit` and `npm run build` pass.
- **AC-04 (FR-04):** The "Outstanding work" fork bullets in `CLAUDE.md` and the fork section of `docs/handoff.md` say Actions are on, CI is checks only, and `docker-publish.yml` is deleted. Neither still tells a reader to guard the deploy job.
- **AC-05 (FR-05):** The 004 verify report has a dated "Phase 0 closure in the fork" section:
  - AC-P0-3 is proven by the `/api/health` response on merged `v2`;
  - AC-P0-5 is proven by the `node:22-alpine` image build;
  - AC-P0-1 and AC-P0-2 are marked superseded by 013;
  - AC-P0-4 is resolved from the first CI run's annotations.

  The verdict line is updated to match.

- **AC-06 (FR-06, NFR-01):** `gh api repos/EnderGuardian25/ai-studio/actions/permissions` reports `"enabled": true`. The first `E2E` workflow run on `v2` is linked in the build report with its conclusion. No run of any other workflow exists on the fork after the change: `gh run list` shows only `E2E (security-fix regression gate)`.
- **AC-07 (NFR-02):** If the first `v2` run failed, the report shows the failing job, the decisive error line, whether a fix was approved, and the re-run's conclusion.

## Edge Cases

- **A runner-only failure on the first CI run,** such as the 25-minute E2E job timeout with 315 cases, or a Playwright browser cache miss. This is handled under NFR-02: report first, then make a minimal `e2e.yml` fix.
- **A `pull_request` from a fork of the fork.** This is unchanged GitHub default behaviour: no secrets, and the jobs use only dummy env.
- **`workflow_dispatch` of a deleted workflow.** It is impossible, because the file is gone. Old run history stays visible in the Actions UI.

## Dependencies

- The `main` → `v2` merge (`2506de0b`) must be gated green first. That gate run is in progress.
