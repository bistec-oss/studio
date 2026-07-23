# Production E2E smoke test — findings

**Host:** https://studio.bistecglobal.com
**Date:** 2026-07-22
**Tester:** Claude Code (browser automation, `adminBTG` / super-admin)
**Team under test:** Claude Testing (`cmrwbp0rm0009uaz13894q3i0`)
**Scope:** every upload path, chat uploads, brand-kit + campaign tone extraction, artifact persistence, scheduled generation (HOLD). Publishing intentionally skipped. **No code changes.**

---

## 🔴 Two production blockers (both HTTP 500; both infra/config, not app logic)

### B1 — Object-storage (MinIO/S3) writes fail → ALL upload routes 500

Proven on three endpoints across two buckets:

- `POST /api/admin/brandkits/{id}/upload` (logo → `brand-kits`) → **500**
- `POST /api/admin/brandkits/{id}/artifacts` (text doc → `brand-kits`) → **500**
- `POST /api/briefs/images` (PNG → `generated-images`) → **500**

Common path: `uploadObject()` → `initBuckets()` + `PutObjectCommand` in `src/lib/storage/minio.ts`. A failure here breaks **every** upload site (brand-kit logo/artifacts/assistant-docs, campaign briefing docs/images, brief images, "from image" template) **and** the render→EXPORT step of generation. So generation/refine can't complete either.

Likely root causes (need the server-side stack trace — the handler masks it into a generic message):

1. MinIO/S3 unreachable from the app host (`MINIO_ENDPOINT` wrong / service down).
2. Bad `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY`.
3. `initBuckets()` throwing on `PutBucketPolicyCommand` (`setPublicReadPolicy`) — some managed/S3-compatible backends reject anonymous bucket policies, or the creds lack `s3:PutBucketPolicy`. Would 500 the first upload while working against dev MinIO.
4. Buckets absent and `CreateBucket` denied.

**Next step:** pull the app-server log stack trace for any upload 500 — it names the exact cause.

### B2 — No Anthropic API key resolvable in API mode → all AI 500

Proven: `POST /api/briefs/enhance` (text-only, no storage) → **500**. By extension: copy generation, Path A/B design, brand-kit voice generate/extract, campaign briefing enhance, refine — all tone/brandkit/campaign extraction and all generation.

Prod runs **API mode** (`/api/me` → `cliMode:false`, `DESIGN_PROVIDER=claude-html`). API-mode key resolution (`src/providers/registry.ts`):

- copy / enhance / vision → `resolveAnthropicApiKey(teamId)` = team default COPY `AvailableProvider` key **→ else `ANTHROPIC_API_KEY` env → else null**.
- design / background → `new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })` **directly (env only)**.

The enhance 500 proves **both** are missing on prod: no team COPY provider **and** no `ANTHROPIC_API_KEY` env.

**The personal Claude OAuth token does NOT apply in API mode — by design.** `sk-ant-oat01-…` is a CLI credential, consumed only by the `claude -p` path when `DESIGN_PROVIDER=cli`. In API mode it is stored dormant/unvalidated (`userToken.ts:116-124`) and never read.

**Fix — pick one:**

1. **Stay API mode:** set a real `ANTHROPIC_API_KEY` (`sk-ant-api…`) on the host — unblocks copy + design + background + vision (all fall back to it). Optionally register a team COPY provider at `/team` for per-team billing.
2. **Switch to CLI mode:** `DESIGN_PROVIDER=cli` + connect a **team** Claude token (or rely on personal tokens) — then the connected OAuth token is used.

**Secondary bug (either mode):** an unresolved key surfaces as a raw 500 ("Internal server error") instead of a clear 4xx like "No AI provider configured for this team."

---

## ✅ Healthy: DB / auth / tenancy / validation

All created cleanly with correct `teamId` scoping (proves Postgres, auth, `withTeamAuth/Admin`, validation):

| Artifact                    | Endpoint                                 | Result                              |
| --------------------------- | ---------------------------------------- | ----------------------------------- |
| Brand kit                   | POST `/api/admin/brandkits`              | 201, `teamId` correct               |
| Brand voice prompt (manual) | POST `/api/admin/brandkits/{id}/prompts` | 201, v1, `isActive`                 |
| Project                     | POST `/api/projects`                     | 201, `teamId` correct               |
| Campaign                    | POST `/api/campaigns`                    | 201, `teamId` correct               |
| Scheduled generation (HOLD) | POST `/api/campaigns/{id}/queue`         | 201, PENDING/HOLD, `teamId` correct |

Validation is real (queue rejected missing `channels`/`designMode` with clean 400s; brief-drafts rejected missing `payload` with 400).

---

## F1 — [MINOR/UI] Brand-kit list not refreshed after create

`/admin/brandkits` → "Add Kit" → Create: POST succeeds (kit created, correct `teamId`), modal closes, but the list still shows "No brand kits yet." Kit appears only after a manual reload. Likely React Query cache not invalidated on create success. Cosmetic; no data loss.

---

## ⚙️ Test-harness limitation (NOT an app bug)

The browser-automation file picker (`chrome-devtools` `upload_file` / CDP `setFileInputFiles`) primes the hidden `<input type=file>` (`.files` populated) but does not trigger this app's React `onChange`, so clicking an upload button via automation fires no request (matches the handoff note that DevTools `fill` doesn't fire React `onChange`). Upload persistence was therefore verified by calling the real endpoints with genuine multipart bodies from the logged-in session (same origin/cookies/route/fields as the UI). UI file inputs are present with correct `accept` attributes.

---

## Coverage status

| Area                                                           | Status                                                    |
| -------------------------------------------------------------- | --------------------------------------------------------- |
| Brand kit create + DB artifacts (prompt)                       | ✅ pass                                                   |
| Brand kit logo upload                                          | 🔴 500 (B1)                                               |
| Brand kit artifact upload (doc/image)                          | 🔴 500 (B1)                                               |
| Brand-kit assistant chat upload + tone/color extraction        | ⛔ blocked (B1 + B2)                                      |
| Campaign create + DB fields                                    | ✅ pass                                                   |
| Campaign briefing assistant upload + tone extraction + Enhance | ⛔ blocked (B1 + B2)                                      |
| Brief wizard image upload                                      | 🔴 500 (B1)                                               |
| Brief "Enhance with AI"                                        | 🔴 500 (B2)                                               |
| Generation E2E (copy+design), regenerate, refine               | ⛔ blocked (B2 + B1 export write)                         |
| "From image" → Path A template                                 | ⛔ blocked (B1 + B2)                                      |
| Scheduled generation — entry saved                             | ✅ pass (201, HOLD)                                       |
| Scheduled generation — worker actually generates               | ⛔ blocked (B1+B2); `generateAt` set +1h so it won't fire |

---

## Test data created — KEPT for re-run (per user decision)

Not deleted; to be wiped at the end of the re-run once B1/B2 are fixed.

- Brand kit `cmrwbywrq000duaz1d3a1dp06` "ZZ Test Kit (Claude E2E)" (+ prompt `cmrwc9ny9000guaz1hjb0d6dc`)
- Project `cmrwc9o2y000iuaz10qf4ud48` "ZZ Test Project (Claude E2E)"
- Campaign `cmrwc9o7n000kuaz1464hss6o` "ZZ Test Campaign (Claude E2E)" (+ queue entry `cmrwcb40g000muaz1fl8zmh7u`)
- No MinIO objects created (all upload attempts 500'd).

---

## Pick-up plan (next session)

1. Team fixes **B1** (MinIO) and **B2** (`ANTHROPIC_API_KEY` or CLI-mode + team token) on the host.
2. Re-run the full suite: uploads → chat-upload grounding → brand-kit & campaign tone/color extraction → artifact persistence → generation → regenerate/refine → worker-run scheduled generation.
3. Fixture files were generated at `scratchpad/fixtures/` (logo.png, reference.png/.jpg, brand-guide.pdf/.docx/.txt/.md), each embedding `VERIFY-MARKER: ZEPHYR-7742` to confirm extraction actually read them. Regenerate if the scratchpad is gone (recipe in session history).
4. Wipe the kept test data (IDs above) at the end.
