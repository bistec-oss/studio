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
   - Give it the **deploy** permission, which is all the workflow needs, rather than full root access.
   - It must belong to the team that owns both prod resources.
   - Copy the value; Coolify shows it once.
2. **Save it as the GitHub secret.** Either:
   - GitHub → `bistec-oss/studio` → **Settings → Secrets and variables → Actions** → `COOLIFY_API_TOKEN` → **Update**, or
   - from a terminal with repo admin rights: `gh secret set COOLIFY_API_TOKEN --repo bistec-oss/studio`, then paste the value when prompted. This keeps it out of shell history.
3. **Prove it.** Re-run the failed job: `gh run rerun 34988162569 --failed --repo bistec-oss/studio`, or use **Re-run failed jobs** in the Actions UI.
   - Both **Redeploy app on Coolify** and **Redeploy scheduler on Coolify** should go green.
   - In Coolify → each resource → **Deployments**, a new deployment should appear for the `sha-09a38b71…` image.
4. **Tell the dev team** so 004 Phase 0 can be marked unblocked.

## While you're in Coolify

This isn't part of the token fix, but it's the same console, and one look answers a long-open question: open the **scheduler** resource's logs and note its first lines. They identify which of four causes is behind **B4** (scheduled generation never runs); see `docs/scheduler-b4-diagnosis-2026-08-03.md`.

## Resource UUIDs (from the workflow, not secrets)

| Resource  | UUID                       |
| --------- | -------------------------- |
| App       | `nck8s530pseqdcfxt50hndl5` |
| Scheduler | `warr96qhvzrie5ndwv8oteeu` |
