# Production E2E — post-redeploy re-run findings (2026-07-24)

**Host:** https://studio.bistecglobal.com
**Date:** 2026-07-24
**Tester:** Claude Code (browser automation, `adminBTG` / super-admin, user logged in the session manually)
**Team under test:** Claude Testing (`cmrwbp0rm0009uaz13894q3i0`)
**Mode:** CLI mode (`/api/me` → `cliMode:true`, personal Claude token ACTIVE)
**Method:** real endpoint calls via in-page `fetch` (carries the httpOnly session cookie). No code changes to the running app during testing.

---

## TL;DR

The Coolify **auto-redeploy webhook** (commit `1116189`, added to `docker-publish.yml` on 2026-07-24) worked: **prod is now on the post-fix `latest` image** with PR #30/#35/#36. **B3 is fixed — Puppeteer rendering works end-to-end.** The full generation + all three async draft actions + from-image vision + both new features pass. **Two items remain: B4 (scheduler worker still not running) and a NEW blocker B5 (exported PNGs unreachable in the browser).**

| Item                                         | 2026-07-23     | 2026-07-24                                                     |
| -------------------------------------------- | -------------- | -------------------------------------------------------------- |
| Prod running post-fix image                  | 🔴 pre-fix     | ✅ **redeployed** (`copyProviderKey` now optional in CLI mode) |
| B3 — HTML→PNG render                         | 🔴             | ✅ **FIXED** (full gen → EXPORTED)                             |
| B4 — scheduler worker running                | 🟠             | 🟠 **still not running**                                       |
| **B5 — exported PNG unreachable in browser** | (masked by B3) | 🔴 **NEW**                                                     |

---

## Deploy state — confirmed post-fix

- **Probe (no side effect):** `POST /api/briefs` with all required fields, **no `copyProviderKey`**, plus a bogus `referenceTemplateId` → **404 "Reference template not found"** (not the pre-fix **400 "copyProviderKey is required"**). This proves PR #30's CLI-copy-optional change is live.
- **Auto-redeploy:** `docker-publish.yml` now calls the Coolify deploy API for both the app and scheduler resource UUIDs after the GHCR push (commit `1116189`, anupa). The app resource clearly redeployed. The scheduler resource evidently did **not** come up as a running worker (see B4).

## ✅ Verified working

| Test                                                   | Result                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Full generation** (Path B, copy+design)              | Brief 201 → `assemble-b` 202 → draft **EXPORTED in ~195s**. `copyText` (790 chars) → design → gpt-image background (`imageUrl` set) → **HTML→PNG render succeeded** (`exportUrl` set). No "Browser was not found" error. **B3 fixed.** A second run also reached EXPORTED.                                                                   |
| **regenerate-copy** (async)                            | 202 → completed 41s, `pendingAction` cleared, copy changed, no revision bump (in-place), back to EXPORTED.                                                                                                                                                                                                                                   |
| **regenerate-design** (async)                          | 202 → completed 140s, **rev 1 → 2** (new DraftRevision), re-render succeeded.                                                                                                                                                                                                                                                                |
| **refine** (async)                                     | 202 (`{instruction}`) → completed 48s, **rev 2 → 3**, re-render succeeded.                                                                                                                                                                                                                                                                   |
| **Draft inline-edit** (PR #36)                         | `POST /api/drafts/[id]/inline-edit {html}` → **200 synchronous**, **rev 3 → 4**, injected marker persisted in the committed revision HTML, `exportUrl` returned (synchronous render OK).                                                                                                                                                     |
| **Multiple brand-kit logos** (PR #35)                  | Uploaded two labeled `LOGO` artifacts ("Full colour", "Reversed white") → 201 each; pre-existing `logoUrl` **not clobbered** (correct: first-logo-auto-primary only when none exists). UI: the **LOGOS gallery** renders both cards with editable label fields + "Set primary" controls; the public-bucket thumbnail loads.                  |
| **From-image → Path A template (CLI vision)** (item 4) | `POST …/templates/from-image` (multipart) → **200 in 28s**, valid template HTML (3396 chars), aspect ratio inferred (SQUARE), `REFERENCE_IMAGE` provenance artifact created. **PR #30's hardened vision prompt did not regress this.** (Vision→template step; a full Path A render from the template was not separately exercised this run.) |

## 🔴 B5 (NEW) — exported PNGs are unreachable from the browser

Rendering succeeds and the PNG is stored, but the **presigned EXPORTS URL points at the internal Coolify MinIO container host** — `http://minio-ahhurs4f46a66uva7tx3ayam:9000/exported-designs/...` — which a browser cannot resolve (`DNS_PROBE_FINISHED_NXDOMAIN`). Result: **library thumbnails are blank** and export downloads fail, even though the design rendered fine.

- **Root cause** (`src/lib/storage/minio.ts`): `getPresignedUrl` signs with the single `s3` client bound to `MINIO_ENDPOINT`, which prod sets to the internal container host. AWS SIGv4 binds the `host` header into the signature, so the URL is both unresolvable from a browser and un-validatable behind the public reverse proxy. Public-bucket assets (backgrounds, logos) are fine because they use `publicUrl()` → `MINIO_PUBLIC_ENDPOINT` (`minio.studio.bistecglobal.com`).
- **Blast radius:** every browser-facing export — library tiles, draft preview image, export/download, lightbox — and any external fetch of a signed URL (Instagram publish image path). Renders themselves are unaffected.
- **Consumer analysis:** every presigned-URL consumer is off-server (browser responses, or external fetches by Anthropic vision / LinkedIn / Instagram) — none needs the internal-only host — so signing against the public endpoint is correct for all of them.
- **Fix — PR #37** (`fix/export-presign-public-endpoint`): add a dedicated presigning `S3Client` bound to `publicEndpoint` (`MINIO_PUBLIC_ENDPOINT`); use it in `getPresignedUrl`. When `MINIO_PUBLIC_ENDPOINT` is unset, `publicEndpoint === endpoint` so it is a no-op (local dev / tests). Test: `tests/unit/exportPresignEndpoint.test.ts`. Gates: tsc · lint · unit 318/318. **Merging PR #37 to `main` triggers the auto-redeploy.**
- **Env-only stopgap (if not merging immediately):** set `MINIO_ENDPOINT=https://minio.studio.bistecglobal.com` on the Coolify **app** resource. PR #37 supersedes this (signs correctly regardless of the internal endpoint).

## 🟠 B4 (still open) — scheduled-generation worker not running

A HOLD queue entry with `generateAt` 10 minutes in the past was created (201, PENDING) and polled for **185s** (worker poll interval is 60s — >3 cycles). It stayed **PENDING**, `retryCount:0`, no draft, no error — the worker never claimed it. The app resource is clearly redeployed (B3/copy fixes live), so this is specifically the **scheduler resource not running** (or not pointed at this DB). Ensure Coolify runs the `docker-compose.yml` `scheduler` service (same image, CMD `node dist/scheduler/worker.js`, same env). Confirm the auto-redeploy webhook's scheduler UUID (`warr96qhvzrie5ndwv8oteeu`) actually targets a running worker resource.

## Not tested

- **Publish** — still needs LinkedIn/Instagram social credentials on the team.
- **Worker-run scheduled generation end-to-end** — blocked by B4 (worker not running). Re-test once the scheduler resource is up.
- **Visual verification of exported PNGs** — blocked by B5; verify once PR #37 deploys (or the env stopgap is applied).

## Test data on Claude Testing team (this run) — KEPT for the next re-run

- Briefs/drafts: two Path B generation drafts ("Puppeteer render verification post", "Puppeteer render check …") both EXPORTED; the latter carries rev 4 after the async-action + inline-edit tests.
- Deploy-probe brief attempt (404'd, no brief created).
- Two labeled `LOGO` artifacts on kit `cmrwbywrq000duaz1d3a1dp06` ("Full colour", "Reversed white") + one `REFERENCE_IMAGE` from-image provenance artifact + the generated from-image template.
- One PENDING queue entry ("Scheduler B4 verification") on campaign `cmrwc9o7n000kuaz1464hss6o` — leave until B4 is verified.

**Recommendation:** keep this data until (1) B4 is fixed and a worker-run scheduled generation is verified, and (2) PR #37 deploys and an exported thumbnail is confirmed visible. Then wipe.

## Pick-up plan (next session)

1. **Merge PR #37** (fixes B5 → exports viewable) — auto-redeploys.
2. **Bring up the scheduler resource in Coolify** (fixes B4); confirm the scheduler deploy UUID targets a running worker.
3. Re-verify: an exported thumbnail is visible in the library (B5), and the past-due HOLD queue entry gets claimed + generated (B4).
4. Publish path once social creds exist.
5. Wipe the kept test data.
