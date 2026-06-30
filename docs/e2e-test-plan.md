# bistec-studio — E2E Test Plan

**Created:** 2026-06-23
**Status:** ✅ Full §6 catalog implemented **and green** (2026-06-30). Last full run: **77 passed, 0 failed, 4 skipped** (`npm run test:e2e:mock`, ~4 min). The 4 skips are intentional (see below). A GitHub Actions gate (`.github/workflows/e2e.yml`) now runs the whole suite — including the §K security-fix regressions — on every PR and push to `main`.

### Catalog implementation status (2026-06-30)

All §6 cases are now written. New/changed files:
- **Existing specs extended:** `brand-kit.test.ts` (TC-BK-02/04/05/06/07/08), `publish.test.ts` (TC-PUB-03/04/06/07/08/09), `path-a.test.ts` (TC-GEN-A2/03/04/05/06), `path-b.test.ts` (TC-GEN-B2 strengthened via DB), `agui-refinement.test.ts` (TC-AGUI-06), `provider-registration.test.ts` (TC-PROV-06).
- **New spec files:** `auth.test.ts` (§A), `resolution.test.ts` (§C), `export.test.ts` (§F), `library.test.ts` (§H), `acp.test.ts` (§J), `regression.test.ts` (§K), `ui.test.ts` (§L).
- **New infra:**
  - `scripts/seed-editor.mjs` — the non-admin RBAC account (`editor@bisteccare.lk` / `BistecStudio2026!`), wired into `setup-test-db.mjs`.
  - `tests/helpers/db.ts` — direct test-DB access for cases that can't be set up over HTTP. **It reads `DATABASE_URL` from `.env.test` FIRST**, because importing `@prisma/client` runs Prisma's bundled dotenv and loads the dev `.env` into `process.env` — so "process.env first" would wrongly hit the dev DB.
  - **`loginAs` now creates an isolated `APIRequestContext`** (its own cookie jar). The previous version reused the shared `request` fixture, so the admin cookie leaked into editor calls and RBAC tests got 200 instead of 403.
  - Two production-safe `testHooks.ts` seams — `buildMockCopy()` routes the brief topic into the mock caption, and `shouldMockPublishFail()` lets a `__FAIL_ALWAYS__`/`__FAIL_ONCE__` sentinel in the brief topic drive deterministic publish failures (TC-PUB-03/04, TC-REG-H12b) within a single serve.
  - **`POST /api/test/scheduler-tick`** — a test-only seam that runs one `runScheduledJobs()` pass so §K H12 can drive the scheduler over HTTP (Playwright's loader can't resolve the transitive `@/` aliases in the app module graph). **Dormant in prod: hard-404 when `NODE_ENV==='production'` AND 404 unless `MOCK_SOCIAL` is set, plus admin-gated.**
  - `playwright.config.ts`: the global `Content-Type: application/json` was **removed** (it overrode the multipart boundary and 500'd every upload route); `retries: 1` added (cold `next dev` route compiles flake under load).
  - `.env.test` additions for this suite: `BISTEC_API_KEYS=e2e-test-key`, `BISTEC_ADMIN_API_KEYS=e2e-admin-key` (enables the §J ACP-auth cases). `.env.test` is git-ignored — the CI workflow sets these as job env.
  - `npm run test:e2e:reg` runs the suite with `.env.test` loaded (handy for ad-hoc DB-aware runs); not required for a green run anymore (the H12 HTTP seam removed the reg-mode dependency).

**Contract corrections baked in (differed from the original §6 wording):**
- Unauthenticated API calls are **redirected to `/login` by middleware (3xx), not 401** (except `/api/acp`, which 401s at the route). TC-AUTH-03/07 assert the redirect.
- TC-GEN-A1/B1 etc. return **200** `{draftId,exportUrl}` (not 201) — already corrected in the skeleton, kept.

**The 4 intentional skips (everything else passes):**
- **TC-GEN-05** (generated image → public URL): the MOCK_AI agent never calls `generateImage` and there is no mock IMAGE-provider seam; the public-IMAGES-bucket guarantee it targets is covered by TC-REG-H10a.
- **TC-REG-H11b** (concurrency cap): needs a real-Chromium serve (`MOCK_PUPPETEER` unset); skips in the mock run.
- **TC-REG-H11a / H11c** (one Chromium process per run / relaunch-after-kill): require host process observation / killing Chromium — not auto-driveable from a black-box test; `test.skip` with rationale.

**Resolved infra dependencies (now run in the standard mock suite):**
- **DB-dependent cases** (TC-PUB-07/08, TC-EXP-01/03, TC-GEN-B2, TC-REG-H9/H10b/c) self-resolve the test DB via `tests/helpers/db.ts` (reads `.env.test`), so they run under `test:e2e:mock` — no reg-mode needed.
- **Scheduler** (TC-REG-H12a/b/c) drive the scheduler over the `/api/test/scheduler-tick` HTTP seam, so they run in the standard mock suite (no app-module import, no reg-mode).
- **ACP authenticated** (TC-ACP-02/03/04/05) read `BISTEC_API_KEYS` from `.env.test` / job env. TC-ACP-05 is folded into the generate_post output-signing assertion (the MCP stdio surface isn't HTTP-reachable).
**Owner:** _unassigned_
**Scope:** End-to-end coverage of the full app surface (API + UI) plus a dedicated regression suite for the 28 code-review remediation fixes (see [`code-review-findings.md`](code-review-findings.md)).

This document is the authoritative test design. Implement the cases below as Playwright specs under `tests/e2e/`. Every case lists an **ID**, **precondition**, **steps**, **expected result**, and (where relevant) the **finding it guards**.

---

## 0. Why this plan exists — current suite assessment

A Playwright skeleton existed under `tests/e2e/` but was **not functional as written**. All five blockers below are now **RESOLVED** (2026-06-23) — the 6 spec files (19 tests) run and pass. History kept for traceability.

| # | Problem (original) | Resolution |
|---|---|---|
| 1 | **Mock hooks never implemented.** Tests gated on `MOCK_AI`/`MOCK_PUPPETEER`/`MOCK_SOCIAL` but nothing in `src/` read them. | ✅ Implemented in **`src/lib/testHooks.ts`** + 5 seam points (see §3). Dormant unless the flag is `true`. |
| 2 | **Contract drift — `/api/posts`.** Spec sent `{channels:[…]}`, expected an array. | ✅ Spec rewritten to singular `channel`, expects `{postId,status}` (201). |
| 3 | **Contract drift — `/api/generate/assemble-a/-b`.** Spec asserted `draft.htmlContent/status/imageUrl` and **201**. Route returns **200 `{draftId,exportUrl}`**. | ✅ Spec asserts `{draftId,exportUrl}` at 200, then `GET /api/drafts/[id]` for status/htmlContent/imageUrl. |
| 4 | **Port mismatch** (config `:3001` vs dev `:3000`). | ✅ Test app runs on **`:3001`** (`npm run test:e2e:serve`), matching the config default. |
| 5 | **No DB isolation / teardown.** | ✅ Dedicated **`bistec_studio_test`** DB (`npm run test:e2e:db`); the dev DB is never touched. (Per-run truncation between runs still TODO — see §2.) |

> **Bottom line (2026-06-23):** the 6 spec files are now green coverage, not drafts. The much larger §6 catalog (RBAC/IDOR, the §K remediation regression suite, §L browser flows) was still to be written at this point.
>
> **Update (2026-06-30):** the full §6 catalog is now implemented and green — see the "Catalog implementation status" block at the top of this doc.

### Reproducing the green run

```bash
# 0. Containers up (postgres + minio:9000 published) — docs/cold-start.md §0
npm run test:e2e:db        # create + migrate + seed the bistec_studio_test DB
npm run test:e2e:serve     # terminal A: app on :3001 with .env.test (mocks on)
npm run test:e2e:mock      # terminal B: run the suite (sets MOCK_* + TEST_BASE_URL)
```

---

## 1. Test pyramid & what E2E owns

E2E here means **black-box tests against a running app + real Postgres + real MinIO**, with the three external AI/social dependencies mocked deterministically.

- **Unit-ish (out of scope here, recommend separately):** `crypto.ts` round-trip, `resolveBrandKit` precedence, `backoffMs`, `resolveExportUrl` passthrough.
- **E2E (this doc):** HTTP API contracts, RBAC, ownership, generation pipeline, publish/schedule, storage URL behavior, AGUI, and a few critical UI browser flows.
- **Concurrency/integration (this doc, §K):** the H7/H12 race fixes — these need parallel requests, which Playwright `request` can drive.

---

## 2. Test environment & preconditions

### Infrastructure
1. Postgres + MinIO containers up (`docker compose up -d`), MinIO `:9000` published to host.
2. A **dedicated test database** (e.g. `bistec_studio_test`) so runs are disposable. Point `DATABASE_URL` at it.
3. Migrations applied: `npx prisma migrate deploy` (must include `20260623153740_h9_indexes` and `20260623154752_h12_scheduler_claim`).
4. Seed the baseline: `npm run db:seed` (admin user + Bistec kit + Hearts Talk kit) and `node --env-file=.env.test scripts/seed-cli-provider.mjs` if using CLI mode.

### Required `.env.test`

> **⚠️ `DESIGN_PROVIDER` must be `claude-html`, NOT `cli`.** CLI mode routes `assemble-b` and the refine route through `runDesignAgentCli` (a real `claude -p` subprocess, ~59s per call). The `MOCK_AI` seam only short-circuits `runDesignAgent` (the API path). With `cli` mode the mock never fires and every generation test hits the 60s Playwright timeout.

```
NEXT_PUBLIC_APP_URL=http://localhost:3001
BETTER_AUTH_SECRET=<copy from .env>
BETTER_AUTH_URL=http://localhost:3001
DATABASE_URL=postgresql://bistec:bistec@localhost:5432/bistec_studio_test
POSTGRES_DB=bistec_studio_test
POSTGRES_USER=bistec
POSTGRES_PASSWORD=bistec
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
MINIO_BUCKET_IMAGES=generated-images
MINIO_BUCKET_EXPORTS=exported-designs
MINIO_BUCKET_BRANDKITS=brand-kits
DESIGN_PROVIDER=claude-html        # MUST be claude-html — cli bypasses MOCK_AI (see warning above)
TOKEN_ENCRYPTION_KEY=<copy from .env>
PUPPETEER_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
MOCK_AI=true
MOCK_PUPPETEER=true
MOCK_SOCIAL=true
BISTEC_API_KEYS=e2e-test-key          # enables the §J ACP-auth cases (TC-ACP-02/03/04/05)
BISTEC_ADMIN_API_KEYS=e2e-admin-key
```

### Known seeded accounts
- **Admin:** `admin@bisteccare.lk` / `BistecStudio2026!` (role ADMIN)
- **Editor:** _create one in a global setup fixture_ (no seeded editor exists — see TC-AUTH-05 precondition). Needed for all RBAC/IDOR tests.

### Per-run reset
Add a global setup that truncates app tables (keep `User`/`Account`/`Session` for the seeded admin, or re-seed) between runs so counts/asserts are deterministic. `fullyParallel: false, workers: 1` is already set — keep it until isolation exists.

---

## 3. Mock strategy (must be built before generation tests run)

The deterministic path uses small, test-only seams, all centralized in **`src/lib/testHooks.ts`** and each gated behind its env flag so production is untouched. **Implemented (2026-06-23):**

| Flag | Seam point (file) | Behavior when set |
|---|---|---|
| `MOCK_AI` | `resolveCopyProvider` (`src/providers/registry.ts`) → stub copy provider; `runDesignAgent` (`src/lib/agent/designAgent.ts`) → emits `buildMockHtml()` (echoes the brand kit's first hex colour from the prompt) then renders via the mocked Puppeteer path to get a **real EXPORTS key**; returns `buildMockConflict()` JSON when the refine instruction contains `conflict_test`. Also short-circuits the admin brand-voice `prompts/generate` route. | No Anthropic/OpenAI calls. |
| `MOCK_PUPPETEER` | `renderHtmlToPng` (`src/lib/renderer/puppeteer.ts`) | Skip Chromium; return `MOCK_PNG_BUFFER`. The MinIO upload still happens, so export keys remain real and signable (exercises H10). |
| `MOCK_SOCIAL` | `publish()` in `src/lib/social/instagram.ts` + `linkedin.ts` | Return `{ platformId: 'mock-<channel>-<ts>' }` with no HTTP call. `MOCK_SOCIAL_FAIL=true` makes them throw `PublishError` — for the FAILED/retry/backoff cases (§G, §K). |

> The brief's `copyProviderKey` must still reference a real enabled COPY provider (brief creation validates it) — the seed registers the keyless `cli` provider, and the specs pass `copyProviderKey: 'cli'`. `MOCK_AI` only stubs the *generation call*, not the validation.

> **Alternative (no mock flags):** run with `DESIGN_PROVIDER=cli` + real Puppeteer (`PUPPETEER_EXECUTABLE_PATH` + Claude CLI auth) + `MOCK_SOCIAL`. Slower, non-deterministic copy, but exercises the real render path.

> Note: the unused `tests/fixtures/mockHtml.ts` is superseded by `src/lib/testHooks.ts` (the seams need the constants server-side, where the app can't import from `tests/`).

---

## 4. Conventions for implementing cases

- Reuse `tests/helpers/api.ts` (`login`, `post`, `get`, `patch`, `del`). Extend it with `loginAs(email, password)` returning an isolated cookie jar so editor-vs-admin tests don't clobber each other's session.
- Each `describe` block logs in in `beforeEach`.
- Assert **status code first**, then body shape, then values.
- For multipart (`/upload`, `/artifacts`, `/briefs/images`) use Playwright's `multipart` option.
- Clean up created rows in `afterEach`/`afterAll` until DB reset exists.

---

## 5. Real API contract reference (assert against these)

| Endpoint | Method | Body | Success | Notes |
|---|---|---|---|---|
| `/api/auth/sign-in/email` | POST | `{email,password}` | 200 + `set-cookie` | session token |
| `/api/me` | GET | — | 200 `{ role }` | server-side role (H13) |
| `/api/admin/brandkits` | POST | `{name,colors,fonts}` | 200 kit | admin only |
| `/api/admin/brandkits/[id]/templates` | POST | `{name,htmlTemplate}` | template `{id}` | admin |
| `/api/admin/brandkits/[id]/prompts` | POST | `{content}` | 201 prompt / **409** on version race | H7 |
| `/api/admin/brandkits/[id]/upload` | POST | multipart `file` | `{url,key,name}` | `url` is **public** (H10) |
| `/api/admin/brandkits/[id]/artifacts` | POST | multipart | 201 artifact | `url` public (H10) |
| `/api/campaigns` | POST | `{name,brandKitId?}` | campaign `{id}` | any role |
| `/api/briefs` | POST | `{topic,goal,tone,channels[],designMode,copyProviderKey,campaignId?}` | **201** brief `{id}` | validation |
| `/api/briefs/images` | POST | multipart | `{url,filename}` | `url` **public** (H10) |
| `/api/generate/assemble-a` | POST | `{briefId,templateId}` | **200** `{draftId,exportUrl}` | `exportUrl` signed (H10). NOTE: 200, not 201 (verified in route). |
| `/api/generate/assemble-b` | POST | `{briefId}` | **200** `{draftId,exportUrl}` | signed; 200 not 201. |
| `/api/generate/export` | POST | `{draftId}` | `{exportUrl}` | signed; short-circuits if set |
| `/api/drafts/[id]` | GET | — | draft detail, `exportUrl` signed | ownership |
| `/api/drafts/[id]` | PATCH | `{copyText}` | updated draft | EXPORTED→IN_PROGRESS |
| `/api/drafts/[id]/refine` | POST | `{instruction}` or `{overrideConflictId,instruction}` | `{reply,revisionId,exportUrl}` or `{conflict,explanation,conflictId}` | signed |
| `/api/drafts/[id]/revisions` | GET | — | array, `exportUrl` signed | |
| `/api/drafts/[id]/revisions/[rev]/restore` | POST | — | `{exportUrl}` signed | |
| `/api/posts` | POST | `{draftId,channel,scheduledAt?}` | **201** `{postId,status}` | **singular `channel`**; PUBLISHED / SCHEDULED / FAILED |
| `/api/posts` | GET | `?page&pageSize&status?` | `{posts,total,page,pageSize}` | admin=all, editor=own; `draft.exportUrl` signed |
| `/api/posts/[id]` | GET | — | post, `draft.exportUrl` signed | ownership |
| `/api/posts/[id]` | DELETE | — | `{postId,status:CANCELLED}` / **409** if not SCHEDULED | admin |
| `/api/posts/[id]/publish` | POST | — | `{postId,status}` / 409 if not FAILED | admin retry |
| `/api/library` | GET | `?page&pageSize&status&search` | `{drafts,total,...}` | non-admin filtered to own; `exportUrl` signed |
| `/api/admin/providers` | POST | `{apiKey,slot,providerName?,label?}` | 201 / 422 / 400 | prefix auto-detect |
| `/api/providers/available` | GET | `?slot=COPY\|IMAGE` | array (no secret fields) | |
| `/api/acp/manifest`, `/api/acp/run` | * | — | **401 without valid key** | H1 |

---

## 6. Test catalog

Legend: **P** precondition · **S** steps · **E** expected. "Guards" = remediation finding regression.

### A. Authentication & RBAC

- **TC-AUTH-01 — Login success.** S: POST sign-in with seeded admin. E: 200, session cookie set.
- **TC-AUTH-02 — Login failure.** S: wrong password. E: 4xx, no session cookie.
- **TC-AUTH-03 — Unauthenticated API is rejected.** P: no cookie. S: GET `/api/library`, `/api/drafts/<any>`. E: 401.
- **TC-AUTH-04 — `/api/me` returns role.** S: as admin GET `/api/me`. E: 200 `{role:'admin'}`. As editor → `'editor'`. **Guards H13.**
- **TC-AUTH-05 — Admin-only mutations gated.** P: editor session. S: PATCH/DELETE `/api/campaigns/[id]`, `/api/projects/[id]`; POST `/api/posts`; any `/api/admin/*`. E: 403. **Guards H4.**
- **TC-AUTH-06 — `requireRole` case-insensitive.** S: as admin (`ADMIN` in DB) hit an admin route. E: 200 (not 403). **Guards the role-casing bonus fix.**
- **TC-AUTH-07 — middleware exact-prefix.** S: request a path that merely *prefixes* a protected one (e.g. `/admincustom`). E: not wrongly treated as protected/exempt. **Guards M9.**

### B. Brand kits (admin)

- **TC-BK-01 — Create kit.** S: POST with colors/fonts. E: kit returned with id.
- **TC-BK-02 — Single-default invariant.** S: create kit A default, then kit B default. E: only B `isDefault` (atomic toggle). **Guards M1.**
- **TC-BK-03 — Prompt versioning happy path.** S: POST prompt content twice. E: versions 1 then 2; only latest `isActive`.
- **TC-BK-04 — Logo upload returns public URL.** S: multipart upload. E: `url` starts with `MINIO_PUBLIC_ENDPOINT`, **anonymous GET of `url` → 200** (no signing). **Guards H10.**
- **TC-BK-05 — Artifact upload + feedToAI sync.** S: upload LOGO artifact. E: `BrandKit.logoUrl` updated; artifact `url` public.
- **TC-BK-06 — Artifact DELETE clears kit field.** S: delete the LOGO artifact. E: `BrandKit.logoUrl` cleared / font removed. **Guards M5.**
- **TC-BK-07 — Upload size/MIME validation.** S: upload >10 MB file; upload an SVG to `/briefs/images`. E: 400 both. **Guards H8.**
- **TC-BK-08 — Non-admin blocked.** P: editor. S: any brandkit write. E: 403.

### C. Projects, campaigns & brand-kit resolution

- **TC-RES-01 — Campaign override wins.** P: project default kit X, campaign kit Y. S: resolve. E: Y, source `campaign`.
- **TC-RES-02 — Inherit from project.** P: campaign has no kit, project default X. E: X, source `project`.
- **TC-RES-03 — System default fallback.** P: neither set. E: the `isDefault` kit, source `system`.
- **TC-RES-04 — Soft-deleted kit/campaign skipped.** P: campaign kit Y is soft-deleted. S: resolve. E: falls through to project/system, never returns Y. **Guards M4.**
- **TC-RES-05 — Campaign→project reassign admin-only.** P: editor. E: 403.
- **TC-RES-06 — List endpoints bounded.** S: GET `/api/campaigns`, `/api/projects`. E: capped (`take:200`). **Guards M11.**

### D. Brief → generation (Path A & B)

> Requires §3 mocks (or CLI mode).

- **TC-GEN-A1 — Path A produces an EXPORTED draft.** P: kit + template + campaign + brief (`designMode:TEMPLATE`). S: POST `/api/generate/assemble-a {briefId,templateId}`. E: 201 `{draftId,exportUrl}`; `exportUrl` matches `^https?://`; `GET /api/drafts/[id]` → `status:EXPORTED`, `htmlContent` contains a brand color. **(Corrects path-a.test.ts.)**
- **TC-GEN-A2 — Path A bad templateId.** S: assemble with non-existent template. E: 404.
- **TC-GEN-B1 — Path B produces an EXPORTED draft.** P: kit + brief (`designMode:GENERATE`). S: POST `/api/generate/assemble-b {briefId}`. E: 201 `{draftId,exportUrl}`.
- **TC-GEN-B2 — Path B requires a brand kit.** P: no resolvable kit. E: 422 `NO_BRAND_KIT`.
- **TC-GEN-03 — Brief validation.** S: POST `/api/briefs` missing `goal`/`channels`/bad FK. E: 4xx with field error. **Guards M12 (parallel validation still correct).**
- **TC-GEN-04 — Brief validation is parallelized & correct.** S: brief with invalid campaign + invalid template + invalid provider. E: 4xx (any/all bad FKs reported). **Guards M12.**
- **TC-GEN-05 — Generated image stored as public URL.** P: mock image provider returns a data URL. S: run generation that calls `generateImage`. E: image embedded in HTML is a **public** URL (anonymous GET 200), so re-render later works. **Guards H10.**
- **TC-GEN-06 — Oversized template guard.** P: Hearts Talk template (1.81 MB). S: Path A with it. E: clean error (`Prompt too large…`), not a crash. **Known Issue regression.**

### E. AGUI refinement

- **TC-AGUI-01 — Refine creates a revision.** P: an EXPORTED draft. S: POST refine `{instruction:'make the background darker'}`. E: `{reply,revisionId,exportUrl(signed)}`; `GET …/revisions` shows the new row with signed `exportUrl`.
- **TC-AGUI-02 — Revision numbers are sequential.** S: three sequential refines. E: revisionNumber 1,2,3; no gap/dup.
- **TC-AGUI-03 — Conflict card path.** P: mock agent returns a `{conflict:true,...}` JSON. S: refine. E: `{conflict:true,conflictId}`; draft.`pendingConflict` set; **no** new revision yet.
- **TC-AGUI-04 — Override applies pending HTML.** S: refine with `{overrideConflictId}`. E: revision created, `pendingConflict` cleared.
- **TC-AGUI-05 — Restore a revision.** S: POST `…/revisions/1/restore`. E: `{exportUrl}` signed; `Draft.htmlContent` = that snapshot.
- **TC-AGUI-06 — Refine ownership.** P: editor B, draft owned by A. E: 403. **Guards H2.**

### F. Export

- **TC-EXP-01 — Export re-renders missing PNG.** P: draft with `htmlContent` but no `exportUrl`. S: POST export. E: `{exportUrl}` signed; draft `EXPORTED`.
- **TC-EXP-02 — Export short-circuit.** P: draft already has `exportUrl`. S: POST export. E: returns the (signed) existing one; no re-render.
- **TC-EXP-03 — Export needs HTML.** P: draft with no `htmlContent`. E: 422.

### G. Publish & schedule

> Requires `MOCK_SOCIAL`.

- **TC-PUB-01 — Immediate publish.** P: EXPORTED draft. S: POST `/api/posts {draftId,channel:'INSTAGRAM'}`. E: 201 `{postId,status:'PUBLISHED'}`; `platformId` set. **(Corrects publish.test.ts — singular `channel`, object response.)**
- **TC-PUB-02 — Schedule for later.** S: POST with future `scheduledAt`. E: 201 `{status:'SCHEDULED'}`; **no transient PENDING row persists** (query DB → status is SCHEDULED, never PENDING). **Guards H7.**
- **TC-PUB-03 — Publish failure → FAILED, never PENDING.** P: `MOCK_SOCIAL_FAIL=true`. S: immediate publish. E: 201 `{status:'FAILED'}` with `errorReason`; row terminal, no PENDING orphan. **Guards H7.**
- **TC-PUB-04 — Retry FAILED.** P: a FAILED post, mock now succeeds. S: POST `…/publish`. E: 200 `PUBLISHED`, `retryCount`/`nextRetryAt` reset. **Guards H12.**
- **TC-PUB-05 — Retry on non-FAILED → 409.** S: `…/publish` on a PUBLISHED post. E: 409.
- **TC-PUB-06 — Cancel scheduled.** S: DELETE a SCHEDULED post. E: `CANCELLED`. DELETE a PUBLISHED post → 409.
- **TC-PUB-07 — Publish requires exportUrl.** P: draft without export. E: 422.
- **TC-PUB-08 — Publisher receives a signed, fetchable URL.** Assert (via mock spy) the URL handed to `publish()` is an `https` signed export URL, not a bare object key. **Guards H10.**
- **TC-PUB-09 — Publish is admin-only.** P: editor. E: 403. **Guards H4.**

### H. Library

- **TC-LIB-01 — Admin sees all, editor sees own.** P: drafts from A and B. S: editor B GET `/api/library`. E: only B's drafts. **Guards H3.**
- **TC-LIB-02 — Status filters.** S: `?status=READY|PUBLISHED|SCHEDULED|FAILED|ALL`. E: correct subsets.
- **TC-LIB-03 — Search.** S: `?search=<topic substring>`. E: matching drafts only.
- **TC-LIB-04 — Pagination envelope.** E: `{drafts,total,page,pageSize}`; `take` honored.
- **TC-LIB-05 — Thumbnails are signed.** E: every `drafts[].exportUrl` is `https` signed (fetchable). **Guards H10.**

### I. Provider registration

- **TC-PROV-01 — `sk-ant-` → Anthropic.** (already drafted) E: 201 or 422-from-provider.
- **TC-PROV-02 — `sk-` → OpenAI.** E: 201/422.
- **TC-PROV-03 — Unknown prefix needs name+label.** E: 400 without, 201/422 with.
- **TC-PROV-04 — Available list hides secrets.** E: no `encryptedApiKey`/`apiKey` fields; `keyPrefix` is masked **last-4**. **Guards M10.**
- **TC-PROV-05 — Disable removes from available.** E: gone from list after `isEnabled:false`.
- **TC-PROV-06 — Default toggle atomic.** S: set provider B default for COPY. E: only one default per slot. **Guards M1.**

### J. MCP / ACP surface

- **TC-ACP-01 — No key → 401.** S: GET `/api/acp/manifest`, POST `/api/acp/run` with no/empty/garbage key. E: 401 (fails closed). **Guards H1.**
- **TC-ACP-02 — Valid key → manifest.** P: configured `BISTEC_API_KEYS`/admin key. E: 200 manifest.
- **TC-ACP-03 — `run` input validation.** S: `generate_post`/`publish_post` with missing fields. E: 400. **Guards M6.**
- **TC-ACP-04 — MCP system-user FK.** S: `generate_post` via MCP. E: Brief/Draft created with a real system user id (no FK violation). **Guards L1.**
- **TC-ACP-05 — MCP getDraft signs exportUrl.** E: returned `exportUrl` is signed/fetchable. **Guards H10.**

### K. Remediation regression suite (the just-completed work)

These are the highest-value additions — they guard the H7/H9/H10/H11/H12 fixes specifically and need targeted setups.

- **TC-REG-H7a — Concurrent refine, no duplicate revision numbers.** P: one EXPORTED draft. S: fire **N=10 parallel** POST `/refine` (mock agent, instant). E: all succeed; revisions have **distinct** sequential numbers 1..N (the `@@unique` + `$transaction` retry holds; no 500s). 
- **TC-REG-H7b — Concurrent prompt version save.** S: fire 5 parallel POST `/prompts`. E: distinct versions, at most one 409, no 500. **Guards H7.**
- **TC-REG-H7c — No PENDING orphan on crash-shaped failure.** Covered by TC-PUB-03; additionally assert DB has zero `PENDING` posts after the suite.
- **TC-REG-H9 — Index presence + query plan.** S: `SELECT indexname FROM pg_indexes WHERE tablename='Post'`; optionally `EXPLAIN` the scheduler's due-query. E: `(status,scheduledAt)` and `(status,nextRetryAt)` indexes exist and the due-query uses an index (not Seq Scan) on a seeded large table. **Guards H9.**
- **TC-REG-H10a — Public bucket anonymous read.** S: upload via `/briefs/images`; fetch the returned `url` with **no auth**. E: 200 + bytes. **Guards H10.**
- **TC-REG-H10b — Private export not publicly readable.** S: take a draft's stored export key, GET `MINIO_ENDPOINT/exported-designs/<key>` **anonymously**. E: 403. The API's signed URL → 200. **Guards H10.**
- **TC-REG-H10c — Legacy URL passthrough.** P: a draft row whose `exportUrl` is a full `http…` URL (pre-migration shape). S: GET `/api/drafts/[id]`. E: returned unchanged (no double-sign). **Guards H10 (`resolveExportUrl` passthrough).**
- **TC-REG-H11a — Browser singleton reuse.** P: `MOCK_PUPPETEER=false`, real Chromium. S: 5 sequential exports. E: all succeed; (if observable) one Chromium process for the run, not five. **Guards H11.**
- **TC-REG-H11b — Concurrency cap holds.** S: fire 8 parallel exports with `PUPPETEER_MAX_CONCURRENCY=2`. E: all complete successfully (semaphore queues, no OOM/crash). **Guards H11.**
- **TC-REG-H11c — Relaunch after disconnect.** S: kill the Chromium process mid-run, then export again. E: next export relaunches and succeeds (no permanently-dead handle). **Guards H11.**
- **TC-REG-H12a — Atomic claim, exactly-once.** P: one SCHEDULED post due now; **two** `runScheduledJobs()` invoked concurrently (import the function directly in a node test, two parallel calls). E: exactly **one** publishes; no double `platformId`. **Guards H12.**
- **TC-REG-H12b — Backoff retry then terminal FAIL.** P: `MOCK_SOCIAL_FAIL=true`, a due post. S: run the scheduler repeatedly (advance `nextRetryAt`). E: status cycles SCHEDULED with growing `nextRetryAt`, `retryCount` increments to MAX (5), then terminal `FAILED`. **Guards H12.**
- **TC-REG-H12c — Lease reclaim.** P: a post stuck in `PUBLISHING` with a lapsed `nextRetryAt` lease (simulate a dead worker). S: run scheduler. E: the post is reclaimed and processed. **Guards H12.**
- **TC-REG-L2 — Shared helpers wired.** Static/build assertion: `src/lib/apiFetch.ts` and `src/lib/brandkit/systemContext.ts` exist and the 8/4 former copies are gone (`grep` guard in CI). **Guards L2.**

### L. Critical UI browser flows (Playwright `page`, not just `request`)

A thin layer of real-browser tests for the highest-risk UI regressions (the rest is API-covered above).

- **TC-UI-01 — Login → dashboard.** Log in via the form, land on `/`, KPIs render (no 404 — the dashboard route exists).
- **TC-UI-02 — Brief wizard 5-step happy path.** Walk Platform&Path → Campaign → Content → Images → Review → Generate; land on `/drafts/[id]` with a preview. (Path A blocks Continue until a template is chosen.)
- **TC-UI-03 — Publish button actually publishes.** On a draft, click Publish → POST fires (not a navigation). **Guards H5.**
- **TC-UI-04 — Draft preview image loads.** The `<img src={exportUrl}>` returns 200 (signed URL works end-to-end in the browser). **Guards H10.**
- **TC-UI-05 — AGUI chat refine round-trip.** Type an instruction, see the preview update + a new revision in history.

---

## 7. Fixes required to the existing specs (before/while implementing)

1. `path-a.test.ts` — assert `{draftId,exportUrl}` then `GET /api/drafts/[id]` for `status`/`htmlContent`/`imageUrl`.
2. `publish.test.ts` — singular `channel`; expect `{postId,status}`; drop the array assumptions; add the FAIL→retry path.
3. All generation/AGUI specs — wire the §3 mock hooks so they stop unconditionally skipping.
4. `helpers/api.ts` — add `loginAs()` with isolated cookie jars for RBAC/IDOR tests (current module-level `sessionCookie` can't represent two users at once).
5. Align ports: run the test app on `:3001` or set `TEST_BASE_URL=http://localhost:3000`.

---

## 8. Execution

Mock hooks (§3) are now built, and `.env.test` + the npm scripts below wire everything together. `.env.test` carries the test `DATABASE_URL`, `MINIO_*`, secrets, and `MOCK_AI/MOCK_PUPPETEER/MOCK_SOCIAL=true`; it is loaded explicitly via `node --env-file=.env.test` because `next dev` does not auto-load it.

```bash
# 1. infra — postgres + minio (:9000 published). See docs/cold-start.md §0.
docker compose up -d
# 2. test DB: create + migrate + seed (admin, Bistec kit, Hearts Talk, cli provider)
npm run test:e2e:db
# 3. start the app on :3001 with .env.test (mock seams active) — leave running
npm run test:e2e:serve
# 4. run the suite (sets MOCK_* + TEST_BASE_URL for the runner)
npm run test:e2e:mock
npx playwright show-report
```

Last green run: **77 passed / 0 failed / 4 intentional skips** (~4 min) on 2026-06-30. (The original skeleton run was 19/19 on 2026-06-23.)

CI gate: **`.github/workflows/e2e.yml`** runs the whole suite (§A–§L, including §K) with mocks on every PR and push to `main`. To enforce it, mark the `e2e` check **required** in the `main` branch-protection settings.

---

## 9. Coverage traceability

| Finding(s) | Guarded by |
|---|---|
| H1 ACP/MCP auth | TC-ACP-01/02/03 |
| H2 IDOR | TC-AGUI-06, TC-LIB-01, ownership asserts across D/E/F |
| H3 library leak | TC-LIB-01 |
| H4 admin gating | TC-AUTH-05, TC-PUB-09, TC-BK-08, TC-RES-05 |
| H5 publish button | TC-UI-03 |
| H7 atomicity | TC-PUB-02/03, TC-REG-H7a/b/c |
| H8 upload validation | TC-BK-07 |
| H9 indexes | TC-REG-H9 |
| H10 storage | TC-BK-04, TC-GEN-05, TC-PUB-08, TC-LIB-05, TC-ACP-05, TC-REG-H10a/b/c, TC-UI-04 |
| H11 puppeteer | TC-REG-H11a/b/c |
| H12 scheduler | TC-PUB-04, TC-REG-H12a/b/c |
| H13 /api/me | TC-AUTH-04 |
| M1 atomic default | TC-BK-02, TC-PROV-06 |
| M4 soft-delete resolve | TC-RES-04 |
| M5 artifact sync | TC-BK-06 |
| M6 ACP validation | TC-ACP-03 |
| M9 middleware prefix | TC-AUTH-07 |
| M10 key prefix mask | TC-PROV-04 |
| M11 bounded lists | TC-RES-06 |
| M12 brief validation | TC-GEN-03/04 |
| L1 IG header / system user | TC-ACP-04 |
| L2 shared helpers | TC-REG-L2 |
| Known Issue (oversized template) | TC-GEN-06 |

> Items with no behavioral surface (M2 init race, M3 stdin, M7 polling, M8 crypto guards, M13 dead code) are best covered by unit tests; M7 polling can optionally be a UI test (draft auto-refresh while `IN_PROGRESS`).
