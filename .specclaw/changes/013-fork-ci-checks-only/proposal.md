# Proposal: Fork CI — checks only, no image push, no deploy

**Created:** 2026-10-09
**Status:** 🟡 Draft

## Problem

Development moved to the public fork `EnderGuardian25/ai-studio` on 2026-10-07. Both GitHub workflows still assume the company repo, so GitHub Actions were switched off on the fork:

- **`.github/workflows/docker-publish.yml`** runs on every push to `main` and on manual dispatch. It does three things:
  1. It builds the image and **pushes** it to GHCR. On the fork that is the public package `ghcr.io/enderguardian25/ai-studio:latest` plus `:<sha>`.
  2. It **redeploys** by POSTing to the **company** Coolify (`coolify.bistecglobal.com`, the company's two resource UUIDs).
  3. It polls the **company** prod `studio.bistecglobal.com/api/health` for up to 10 minutes.

  The fork must do none of these. The user will deploy the fork themselves later, with their own workflow.

- **`.github/workflows/e2e.yml`** holds every check: typecheck, lint, the full mock E2E suite, unit tests, `npm run build` and `docker build .` (no push). It triggers only on PRs and pushes to `main`. `v2`, the fork's default and integration branch, gets no CI.

So `v2` has no CI, and every gate runs only locally.

## Proposed Solution

**The user's decisions (2026-10-09):**

- **Delete `docker-publish.yml` outright.** The fork pushes no image and calls no deploy target. When the user sets up their own deploy, a new workflow is written for that target. Git history keeps the old file.
- **`e2e.yml` triggers on PRs and on pushes to `v2` and `main`.** Its jobs are unchanged.
- **Re-enable Actions** once this lands on `v2`: `gh api -X PUT repos/EnderGuardian25/ai-studio/actions/permissions -F enabled=true`. The user approved this.

This lands **after** fork `main` is merged into `v2`. That merge brings 004 Phase 0, including the hardened `docker-publish.yml`, Node 22 and `/api/health`. The merge comes first so the file is deleted once, not edited and then deleted.

**Comments that name the deleted workflow are updated** so they don't point at a file that no longer exists:

- `Dockerfile` and `src/app/api/health/route.ts` / `src/lib/env.ts` (`GIT_SHA`): with no publish workflow, a local `docker build` leaves the commit unset, and `/api/health` reports that. The comment says who sets `GIT_SHA` now: whoever builds the image, through `--build-arg GIT_SHA=…`.
- `CLAUDE.md` and `docs/handoff.md`: the fork CI state becomes "checks only on `v2`/`main`/PRs, no publish, no deploy".

Historical docs (`docs/prod-e2e-findings-2026-07-2*.md`, `docs/scheduler-b4-diagnosis-2026-08-03.md`, `docs/coolify-token-rotation.md`) describe company history and stay as they are.

## Scope

### In Scope

- Delete `.github/workflows/docker-publish.yml`.
- Add `v2` to `e2e.yml`'s `push.branches`.
- Update the comments and docs listed above.
- Re-enable Actions on the fork, then confirm the first CI run on `v2`.

### Out of Scope

- **Any deploy workflow for the fork.** The user writes one later, for their own target.
- **Any GHCR image or package.** Nothing is published.
- **Any change to the company repo `bistec-oss/studio`.**
- **Changes to the CI jobs themselves** (steps, Node version, timeouts). The exception is a fix that the first CI run on `v2` proves is needed for the suite to pass on GitHub's runners. If one is needed, it is reported first and kept minimal.

## Impact

- **Size:** bounded. This alters two existing workflow files and a few comments. It adds no subsystem and no interface.
- **Files affected:** about 6: the two workflows, `Dockerfile`, `src/app/api/health/route.ts`, `src/lib/env.ts`, `CLAUDE.md` and `docs/handoff.md`.
- **Complexity:** small.
- **Risk:** low. Nothing pushes or deploys after this change. The only new outward effect is CI running on GitHub-hosted runners for a public repo, which is free.
  - **One unknown:** the E2E job has not run in CI since 011 grew the suite to 315 cases. The first `v2` run may expose a runner-only failure, such as the 25-minute job timeout.

## Open Questions

- If the first CI run on `v2` fails for a runner-only reason (timeout, missing system font, etc.), is a minimal fix inside this change acceptable? Proposed default: yes, reported before it is made.
