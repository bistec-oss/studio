# Production E2E smoke test — RE-RUN findings (2026-07-23)

**Host:** https://studio.bistecglobal.com
**Date:** 2026-07-23
**Tester:** Claude Code (browser automation, `adminBTG` / super-admin, user logged in the session manually)
**Team under test:** Claude Testing (`cmrwbp0rm0009uaz13894q3i0`)
**Mode:** prod now runs **CLI mode** — `/api/me` → `cliMode:true`, personal Claude token `ACTIVE` (connected 2026-07-22). This is the B2 fix (option 2: switch to CLI + team/personal token).
**Method:** uploads/AI driven by real endpoint calls with genuine multipart / JSON bodies from the logged-in page (in-page `fetch`, carries the httpOnly session cookie) — the browser file-picker still doesn't fire this app's React `onChange` (unchanged harness limitation). **No code changes.**

---

## TL;DR

**B1 (storage) and B2 (AI) from 2026-07-22 are both FIXED and confirmed.** Uploads, AI copy/enhance, chat grounding, tone/color extraction, and live CLI-mode **vision** all work. **A new blocker surfaced: B3 — the Puppeteer/Chromium renderer is misconfigured on the prod host, so nothing that renders HTML→PNG can complete** (full generation, regenerate-design, refine, worker-run scheduled generation). A secondary finding: **B4 — the scheduled-generation worker is not running** on prod.

| Blocker                                  | 2026-07-22            | 2026-07-23                                  |
| ---------------------------------------- | --------------------- | ------------------------------------------- |
| B1 — object-storage upload 500s          | 🔴                    | ✅ **FIXED**                                |
| B2 — no AI key in API mode               | 🔴                    | ✅ **FIXED** (switched to CLI mode + token) |
| **B3 — renderer executablePath invalid** | (masked behind B1/B2) | 🔴 **NEW**                                  |
| B4 — scheduled-gen worker not running    | (not reached)         | 🟠 **NEW (secondary)**                      |

---

## ✅ Verified working

| Area                                                      | Endpoint                                 | Result                                                                                                                                                                                                              |
| --------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brand-kit **logo upload**                                 | POST `/api/admin/brandkits/{id}/upload`  | **200** — object at `minio.studio.bistecglobal.com/brand-kits/…`, publicly retrievable (200 `image/png`)                                                                                                            |
| Brand-kit **artifact — REFERENCE_DOC (PDF)**              | POST `…/artifacts`                       | **201** — `parsedText` contains `VERIFY-MARKER: ZEPHYR-7742` (PDF parse ✓)                                                                                                                                          |
| Brand-kit **artifact — REFERENCE_IMAGE**                  | POST `…/artifacts`                       | **201**                                                                                                                                                                                                             |
| **Brief image upload**                                    | POST `/api/briefs/images`                | **200** — object in `generated-images` bucket, publicly retrievable                                                                                                                                                 |
| Public-read bucket policy (B1 root-cause #3)              | GET minio object URLs                    | **200** for all 3 objects — bucket policy OK                                                                                                                                                                        |
| **Brief "Enhance with AI"** (B2)                          | POST `/api/briefs/enhance`               | **200** in 3.8s — real on-brand draft in the kit's voice                                                                                                                                                            |
| **Brand-kit assistant chat** grounding + extraction       | POST `…/assistant/chat`                  | **200** in 14s — quoted `ZEPHYR-7742`, extracted both hex colors, emitted `brandkit` block (voice/tone/style)                                                                                                       |
| **Campaign briefing chat** grounding (doc + image vision) | POST `/api/campaigns/{id}/briefing/chat` | **200** in 23s — quoted `ZEPHYR-7742` from uploaded doc/image                                                                                                                                                       |
| **Campaign briefing Enhance**                             | POST `…/briefing/enhance`                | **200** in 14s — real briefing draft                                                                                                                                                                                |
| Campaign document upload (PDF + PNG)                      | POST `/api/campaigns/{id}/documents`     | **201** each                                                                                                                                                                                                        |
| **Copy generation** (inside full pipeline)                | via `/api/generate/assemble-b`           | ✅ `copyText` generated (493 chars, on-brand, both channels) before render failed                                                                                                                                   |
| **From-image → Path A template (live CLI vision)**        | POST `…/templates/from-image`            | **200** in 27.6s — valid 1080×1080 HTML template, aspect ratio honored, provenance artifact created. **First live verification of the F6 vision path (was mock-only) and the CLI `--allowedTools Read` mechanism.** |

---

## 🔴 B3 (NEW) — Puppeteer/Chromium renderer misconfigured → all HTML→PNG rendering fails

Full Path B generation was triggered (brief 201 → `assemble-b` **202** → async). After ~100s the draft went **FAILED** with:

> `Browser was not found at the configured executablePath (C:\Program Files\Google\Chrome\Application\chrome.exe)`

- Config knob: **`PUPPETEER_EXECUTABLE_PATH`** (`src/lib/renderer/puppeteer.ts:14-26`). It is set on the prod host to `C:\Program Files\Google\Chrome\Application\chrome.exe`, but no Chrome exists at that path (this exact string is the _example_ in the code's own error message — it looks like the placeholder was copied into the prod `.env` verbatim, or Chrome simply isn't installed there).
- **Copy generation succeeded first** (`copyText` populated) — so this is a **render-only** failure. AI (B2) and storage (B1) are healthy; only the HTML→PNG step is broken.
- **Blast radius:** blocks **all generation** (copy+design→export), **regenerate-design**, **refine** (both re-render), the **PNG EXPORT** step, worker-run **scheduled generation**, and the final render of **from-image** templates. Because the three async draft actions 409 on non-EXPORTED drafts, **regenerate-copy / regenerate-design / refine can't be tested at all until one draft reaches EXPORTED** — i.e. until B3 is fixed.
- **Fix (prod host):** install Google Chrome / Chromium on the host and set `PUPPETEER_EXECUTABLE_PATH` to the real binary path (e.g. the actual `chrome.exe` location, or `/usr/bin/chromium-browser` if Linux; unsetting it lets the Linux-path autodetect work). Then re-run generation.

## 🟠 B4 (NEW, secondary) — scheduled-generation worker not running on prod

A HOLD queue entry with `generateAt` 5 minutes in the past was created (201, PENDING) and polled for **~145s** (worker poll interval is **60s** — `src/scheduler/worker.ts:6`). It stayed **PENDING**, `retryCount:0`, no draft — the worker never claimed it. Conclusion: the `worker.ts` process is **not running** on the prod host (or not processing this team). Even if it were, generation would fail at B3. Start the worker (`npx tsx --env-file=.env src/scheduler/worker.ts`, or the container's worker service) after B3 is fixed, then re-test.

---

## ⚙️ Config gap found (not a bug) — CLI-mode teams need a `cli` COPY provider

Brief creation (`POST /api/briefs`) requires a `copyProviderKey` matching a team-scoped **enabled COPY provider**. The Claude Testing team had **zero** providers (`/api/providers/available?slot=COPY` → `[]`), so the brief wizard 400'd `copyProviderKey is required` — even though CLI mode + token are set (enhance/chat bypass this because they call the CLI token directly via `withClaudeAuth`). The `scripts/seed-cli-provider.mjs` only seeds the **Bistec** team.

**To let the generation wizard run for a CLI-mode team, register a keyless `cli` COPY provider on that team** (via `/team` → providers, or `POST /api/admin/providers {apiKey:'cli', slot:'COPY', providerName:'cli', label:'Claude CLI', isDefault:true}`; the registry detects CLI by `providerName==='cli'` and skips decrypt). **I registered one on Claude Testing for this test** (`cli-1784786367943`, id `cmrx3pz9l000gt18kdb28g6dr`) — remove it or keep it for the B3 re-run (see test-data note).

## Minor

- **DOCX artifact upload 400'd** ("Could not extract text — is it a valid document?"). The uploaded bytes were byte-identical (1207 B, `PK\x03\x04`) to a DOCX that parsed cleanly in the project's own mammoth 1.12.0 seconds earlier — so this is an artifact of my **hand-crafted minimal 3-part DOCX** under prod's bundling, **not** a storage/route bug. The PDF proved the full doc upload→parse→store→marker path. Low priority; re-test with a real Word/Google-Docs .docx.
- **Logo `/upload` leaves an orphan object:** the route stores the object and returns the URL but does **not** set `kit.logoUrl` or create an artifact (the client does that in a follow-up call). Expected; noted for MinIO cleanup accounting.
- **Secondary bug from 2026-07-22 still stands:** unresolved AI/render errors surface as raw `FAILED`/500 rather than a clear 4xx — B3 shows only as a `failureReason` string.

---

## Test data on Claude Testing team (as of this run)

**Kept from 2026-07-22:** kit `cmrwbywrq000duaz1d3a1dp06` (+ prompt), project `cmrwc9o2y000iuaz10qf4ud48`, campaign `cmrwc9o7n000kuaz1464hss6o` (+ old queue entry `cmrwcb40g000muaz1fl8zmh7u`).

**Created this run:**

- Brand-kit artifacts (on the kit): `cmrx3ecub0007t18kyy1r1z6k` (PDF doc), `cmrx3ed2k000at18kq6g0dpkb` (ref image), `cmrx3uuac000mt18kgw0zsw1h` (from-image poster).
- MinIO orphan objects: `brand-kits/cmrwbywrq…/1784785825377-logo.png`, `generated-images/briefs/G5i9…/1784785826118-brief.png`.
- COPY provider `cmrx3pz9l000gt18kdb28g6dr` (key `cli-1784786367943`).
- Brief `cmrx3pzdo000it18kbb16qnkz` + Draft `cmrx3pzi0000kt18kqms8r2oy` (FAILED — B3).
- Campaign documents: `cmrx3lj5y000ct18k8kq5dvsp` (PDF), `cmrx3ljam000et18kuke7xnrz` (image).
- Queue entry `cmrx3wki0000ot18kag2v3l1m` (PENDING).

**Recommendation:** because B3 forces **another** re-run of the generation/refine/worker suite, consider **keeping** this data (as was done on 2026-07-22) and wiping only after the post-B3 re-run.

Fixtures regenerated at the session scratchpad `…/scratchpad/fixtures/` (logo.png, reference.png/.jpg, brand-guide.pdf/.docx/.txt/.md — all embed `VERIFY-MARKER: ZEPHYR-7742`).

---

## Pick-up plan (next session)

1. Team fixes **B3** on the prod host: install Chrome/Chromium and point `PUPPETEER_EXECUTABLE_PATH` at the real binary (or unset on Linux). Start the scheduler **worker** (**B4**).
2. Ensure the **`cli` COPY provider** exists on each team that will generate (done for Claude Testing).
3. Re-run: full generation (copy+design→EXPORT) → regenerate-copy / regenerate-design / refine → worker-run scheduled generation → publish (still needs social creds).
4. Wipe the test data (IDs above).

---

## Code fixes implemented (branch `fix/prod-render-and-cli-copy`, 2026-07-23)

All on a branch, gates green (tsc · lint 0 errors · **unit 293/293** · production build). **Not merged** — awaiting go-ahead. These are the code-fixable parts; **B3-host (install a browser) and B4 (start the worker) remain host/ops actions** the code cannot perform.

1. **Renderer robustness (B3, code side)** — `src/lib/renderer/puppeteer.ts`: `pickExecutablePath()` now (a) uses `PUPPETEER_EXECUTABLE_PATH` only if it actually exists on disk — a set-but-missing path no longer fails the launch, it logs a warning and falls through; (b) autodetects across Linux **and Windows** (Chrome + Edge) candidates. So a Windows host finds Edge automatically and a Linux host with a stale Windows env var falls back to its Chromium. _(Still needs a browser installed somewhere standard — code can't conjure one.)_ Tests: `tests/unit/rendererExecutablePath.test.ts`.
2. **Copy resolution CLI default + optional brief key** — `src/providers/registry.ts` `resolveCopyProvider()` returns the local `ClaudeCliCopyProvider` in CLI mode when no API-key provider is registered (billed via the OAuth chain personal→team); a registered API-key provider (explicit key or team default) **overrides** ("whenever configured"). `POST /api/briefs` no longer requires `copyProviderKey` in CLI mode (stores the `cli` marker) — the wizard works with no per-team provider row. The keyless `cli` row still resolves for backward-compat. Tests: `copyProviderCliMode.test.ts`, `briefCopyProvider.test.ts` + helper `src/lib/brief/copyProvider.ts`.
3. **Clearer error surfacing** — `src/lib/agent/generationErrors.ts` `humanizeGenerationError()` maps browser-missing / no-Claude-token / no-copy-provider / timeout failures to actionable `Draft.failureReason` messages (used in `generateDraft.ts`). Tests: `generationErrors.test.ts`.
4. **Prompt-injection hardening** — `src/lib/agent/untrusted.ts` (`fenceUntrusted` + `UNTRUSTED_CONTENT_GUARD`) now delimits + guards untrusted uploaded-doc/chat content in the campaign-briefing and brand-kit assistants; the CLI-vision prompt (`buildVisionCliPrompt`) instructs the model to read **only** the listed reference files and treat image contents as untrusted data. `isAllowedRenderRequest` exported + SSRF regression test (metadata IP / internal / non-http blocked; fonts+MinIO allowed). Tests: `untrustedContent.test.ts`, `visionPrompt.test.ts`, `rendererEgress.test.ts`.
   - **Residual (documented, not code-fixable):** a hard filesystem jail for the CLI `Read` tool needs an OS-level sandbox — the CLI's Read can open absolute paths regardless of cwd. The prompt-level guard is the in-code mitigation; OS sandbox is an infra follow-up.

**Re-test after the host fixes + merge:** the full generation/regenerate/refine/worker/from-image suite (from-image vision especially, to confirm the hardened prompt didn't regress it).
