# Coolify deploy token: rotation handoff

**For:** whoever administers `https://coolify.bistecglobal.com`
**Raised:** 2026-09-23
**Status:** 🔴 open. Until this is done, **merges to `main` build and push the image but do not redeploy prod.**

## What's broken

The `Build and push Docker image` workflow (`.github/workflows/docker-publish.yml`) ends by calling Coolify's deploy API for the two prod resources. Since at least 2026-09-15 that call is rejected:

```
curl: (22) The requested URL returned error: 401
```

- Failed run: [actions/runs/34988162569](https://github.com/bistec-oss/studio/actions/runs/34988162569), step **Redeploy app on Coolify**.
- The image itself was built and pushed to GHCR successfully (`ghcr.io/bistec-oss/studio:latest` and `:sha-09a38b71…`).
- The scheduler redeploy step never ran, because the app step failed first.
- Nothing was lost that time: `09a38b71` was a docs-only commit, and prod still runs `9ea4c045`, which has identical code. **The next code merge will silently not deploy**, though.

A 401 means Coolify didn't accept the token in the `COOLIFY_API_TOKEN` GitHub secret: it was revoked, expired, regenerated, or its owner lost access.

## Steps

1. **Create a new API token in Coolify.** In Coolify v4 this is under **Keys & Tokens → API tokens** (check the exact label in your version).
   - Give it the **deploy** and **read** permissions rather than full root access. `deploy` triggers the redeploys. `read` lets the workflow check the scheduler's deployment status afterwards (`GET /api/v1/deployments/<uuid>`), which the Phase 0 pipeline fix adds. A deploy-only token still redeploys, but that status check will fail with "token rejected".
   - It must belong to the team that owns both prod resources, and it must be created by a team **Admin or Owner** — not a **Member**. Since Coolify v4.2.0, Members are deploy-read-only: a Member's token still gets HTTP 200 back from `/api/v1/deploy`, but the body reads `"message":"Unauthorized to deploy this application."` and no deployment is actually queued. That looks like success at a glance (200 OK) unless you read the body, so it's worth getting the owner right the first time.
   - Copy the value; Coolify shows it once.
2. **Save it as the GitHub secret.** Either:
   - GitHub → `bistec-oss/studio` → **Settings → Secrets and variables → Actions** → `COOLIFY_API_TOKEN` → **Update**, or
   - from a terminal with repo admin rights: `gh secret set COOLIFY_API_TOKEN --repo bistec-oss/studio`, then paste the value when prompted. This keeps it out of shell history.
3. **Prove it.** How depends on whether the Phase 0 pipeline fix (the redeploy/verify rewrite this doc already refers to above) has merged to `main` yet:
   - **If Phase 0 has NOT merged, do not re-run 34988162569 either.** That run calls `/api/v1/deploy` with GET. Coolify v4.2.0 and later answer GET with **405** ("This endpoint has changed to a POST request") even when the token is good, so a red re-run tells you nothing about the new token. Prove the token directly instead, from any terminal:

     ```sh
     read -rs COOLIFY_TOKEN   # paste the token; it is not echoed or saved to shell history
     curl -sS -X POST -H "Authorization: Bearer $COOLIFY_TOKEN" \
       "https://coolify.bistecglobal.com/api/v1/deploy?uuid=nck8s530pseqdcfxt50hndl5&force=false"
     ```

     - **Good:** the reply contains a `deployment_uuid`. This really redeploys the app with the current `:latest` image (`sha-09a38b71…`, the same code prod already runs), so it is harmless. Repeat with the scheduler UUID `warr96qhvzrie5ndwv8oteeu`.
     - **Then check the `read` ability:** `curl -sS -H "Authorization: Bearer $COOLIFY_TOKEN" "https://coolify.bistecglobal.com/api/v1/deployments/<deployment_uuid>"` should return 200 with a `status` field.
     - **HTTP 401 or 403:** the token is rejected; recheck step 1.
     - **HTTP 200 with `"Unauthorized to deploy this application."` and no `deployment_uuid`:** the token belongs to a Member; recreate it as an Admin or Owner (step 1).
     - Finish with `unset COOLIFY_TOKEN`.

   - **If Phase 0 HAS merged, do not re-run 34988162569.** A re-run rebuilds and pushes that old `09a38b71` commit as `:latest` instead of whatever is actually on `main` by then — and separately, that run's redeploy step still sends the pre-fix GET to `/api/v1/deploy`, which Coolify ≥4.2.0 answers with 405 ("This endpoint has changed to a POST request"); Phase 0 switches to POST, but a pre-merge run never picks that up. Instead trigger a fresh run on `main`: `gh workflow run docker-publish.yml --ref main --repo bistec-oss/studio`, or **Actions → Build and push Docker image → Run workflow** with `main` selected. Success looks like: the **Redeploy on Coolify (app + scheduler, both always attempted)** step prints both lines as `HTTP 200 (ok)` with a deployment queued — not "Coolify accepted the call but queued no deployment: …", which is the Unauthorized-to-deploy shape a Member token produces (see step 1) — the **Verify deploy (prod /api/health + scheduler deployment status)** step goes green, and `https://studio.bistecglobal.com/api/health` returns the commit SHA that's on `main`.
   - **⚠️ Never re-run a pre-merge run after the merge.** On Coolify older than v4.2.0 it redeploys stale code behind a green checkmark that looks identical to a real deploy; on v4.2.0 and later it just fails with 405.
4. **Tell the dev team** so 004 Phase 0 can be marked unblocked.

## While you're in Coolify

This isn't part of the token fix, but it's the same console, and one look answers a long-open question: open the **scheduler** resource's logs and note its first lines. They identify which of four causes is behind **B4** (scheduled generation never runs); see `docs/scheduler-b4-diagnosis-2026-08-03.md`.

## Resource UUIDs (from the workflow, not secrets)

| Resource  | UUID                       |
| --------- | -------------------------- |
| App       | `nck8s530pseqdcfxt50hndl5` |
| Scheduler | `warr96qhvzrie5ndwv8oteeu` |
