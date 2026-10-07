# bistec-studio — E2E Test Plan

**Created:** 2026-06-23
**Status:** ✅ Full §6 catalog implemented **and green**. **Unit as of 2026-07-27 (PR #40): 322/322.** The CI gate (`.github/workflows/e2e.yml`) passed on PRs #38, #39 and #40. Last full _local_ run with recorded counts (2026-07-22, `feature/team-tenancy` branch, post TC-REG-H7a de-flake): **171 passed, 4 skipped, 0 failed** (175 tests total; 0 flaky — TC-REG-H7a's parallel-fire assertion was rewritten to a timing-robust integrity invariant, see below), unit **264/264** at that time.

Last full run on `main` (2026-07-13, post brief-draft-recovery §P): **132 passed, 0 failed, 7 skipped** (`npm run test:e2e:mock`; the machine lacked `BISTEC_API_KEYS` in `.env.test`, so 3 §J ACP-auth cases skipped on top of the 4 intentional skips below — CI sets the keys as job env and runs them). The 2026-07-13 feature batch added `async-generation.test.ts` (F1 async + retry), a version back/forward-jump case (F2), F4 auto-scheduling cases in `campaign-scheduling.test.ts`, `brandkit-assistant.test.ts` (F5), and `image-to-template.test.ts` (F6); generation-dependent suites now poll via the `waitForDraft` helper (generation is async). A GitHub Actions gate (`.github/workflows/e2e.yml`) runs the whole suite — including the §K security-fix regressions — on every PR and push to `main`, and is **green as of 2026-07-13** (it had been red for weeks on a bad CI `TOKEN_ENCRYPTION_KEY` — it MUST be a valid 64-char hex string, else `crypto.ts` throws and the credential-encrypting routes 500). Runs on GitHub-hosted `ubuntu-latest` with the actions on the Node 24 runtime.

> **⚠️ Coverage gap this suite cannot see (learned from PR #40).** The suite runs `DESIGN_PROVIDER=claude-html` — **API mode** — so every CLI-mode-only code path is untested here, including the one where copy defaults to `claude -p` with no COPY provider registered. PR #40's bug (the wizard's Generate button dead on a team with no COPY provider) was invisible to this suite for that reason _and_ because the local seed added a `cli` COPY row that satisfied the gate. When changing provider-resolution or credential-chain behaviour, cover it in **unit** tests against the pure helpers (`resolveBriefCopyKey` / `canSubmitBrief`, `resolveCopyProvider`, `resolveClaudeAuth`) — do not assume a green E2E run says anything about CLI mode.

> **Update (2026-07-21, team tenancy):** two new suites on `feature/team-tenancy` — **`team-isolation.test.ts` (§R, 19 cases)** is the cross-tenant isolation guardrail: for every list/by-id/mutation route across briefs, drafts, posts, campaigns, projects, brand kits, and the scheduled-generation queue, a second team (**ClientX**, seeded by `scripts/seed-teams.mjs` alongside the default **Bistec** team, admin `clientx.admin`/`BistecStudio2026!`) must get a 404 (never a 403 — cross-team existence must not leak) trying to read or mutate Bistec's rows, and vice versa; it also exercises the D6 visibility rule (an editor sees own items + anything under a campaign; a team admin sees the whole team) and asserts `/api/me` team fields + the `bistec-active-team` cookie contract (409 `team-choice-required` for an unpicked multi-team user). **`team-settings.test.ts` (§S, 7 cases)** covers the new credential surfaces: personal Claude/OpenAI keys at `/settings` (`GET/PUT/DELETE /api/me/openai-key`), team Claude token / AI providers / social channels / `ApiKey` CRUD at `/team` (`withTeamAdmin`-gated, editor 403s), and `/admin/teams` team + membership management (super-admin-only). Pre-existing suites updated for the new contracts: **`TC-AGUI-06`** (`agui-refinement.test.ts`) rewritten — a campaign-shared draft is now a legitimate 202 for an in-team editor under D6, not a 403; **§J** ACP-auth cases (`acp.test.ts`) now mint real hashed `ApiKey` rows via `POST /api/team/api-keys` instead of relying on `BISTEC_API_KEYS`/`BISTEC_ADMIN_API_KEYS` env lists (both env vars are deleted). The isolation suite (plus the final whole-branch review) is also what caught 16 real cross-tenant gaps during the branch's build (8 from §R itself, 1 from a same-day Anthropic-key-resolution follow-up, 7 from the final review's brand-kit/template boundary sweep — §R gained 4 cases covering those attack shapes) — all fixed before this run; see `docs/handoff.md`'s 2026-07-21 entry. Full-suite count for the team-tenancy work: 132 → **170 passed** (4 intentional skips unchanged, 0 failed); unit 247 → **264 passed**. (A later 2026-07-22 commit de-flaked TC-REG-H7a's parallel-fire assertion, bringing the current HEAD count to **171 passed / 4 skipped / 0 failed** — see the Status line above.)

> **Update (2026-07-28, copy-edit status clobber):** §Q gained **TC-ASYNC-10** — a manual copy edit, _including clearing the copy entirely_, must not disturb `Draft.status`. `PATCH /api/drafts/[id]` used to flip `EXPORTED` → `IN_PROGRESS` ("the export is stale"), which dropped the draft from the library, hid Refine design / Edit inline, made regenerate-copy answer 409 `Draft is not ready for copy regeneration`, left the copy block on an uneditable "Writing the copy…" skeleton, and after 15 min let the stale sweep mark the draft `FAILED` — with nothing regenerating. The case asserts: PATCH response itself says `EXPORTED` with design untouched (same `htmlContent`/export path/revision pointer), `copyText: ''` also stays `EXPORTED`, the draft is still listed by `/api/library?status=READY`, regenerate-copy is accepted (202) and refills the copy, and refine is accepted (202) advancing to revision 2. Suite is now **10 cases**.

> **Update (2026-09-28, change 004 refine fidelity):** two catalog sections added — **§U** (`rejected-revisions.test.ts`, 4 cases, T15/T16: rejected refine renders stay out of the revision chain; TC-REJ-03 now asserts each CHECK constraint by **name**) and **§V** (`agui-refinement.test.ts`, 18 cases, T21: the refine fidelity contract AC-08 → AC-20b, including the two reported failures as regression cases — **TC-FID-01** "reduce the text" and **TC-FID-04** "use the uploaded image as the background"). §V runs **API-mode refine only** (`DESIGN_PROVIDER=claude-html`); the prod CLI branch and the Haiku-pinned verifier (AC-20b) are unit-covered only — see §V for the AC map and the known limits. The T18/T19 poll-field and "Use anyway" cases live in `refine-not-applied.test.ts` and are referenced from the §V map.
>
> **Update (2026-07-17, async draft actions):** new suite **`async-actions.test.ts` (§Q, 9 cases)** — the three draft actions (`regenerate-design`/`regenerate-copy`/`refine`) are now async (F1 pattern): sync validation keeps the legacy shapes (404/403, 400 `NOT_PATH_B`/`instruction is required`, 422 `NO_BRAND_KIT`/`COPY_ERROR`, regenerate-copy 409 unless EXPORTED/PUBLISHED), then an atomic `Draft.pendingAction` claim → **202 `{ok:true}`** and background execution; `GET /api/drafts/[id]` gained `pendingAction`/`pendingActionError`/`conflict {conflictId, explanation}` (never `pendingHtml`). Cases: 202→poll happy paths for all three actions (new revision + advanced `currentRevisionNumber` for design/refine; copy replaced with design/status untouched), refine conflict via poll + still-synchronous Override (`{reply,revisionId,exportUrl}`), 409 `Another action is already running on this draft` on all three actions **and restore** while a claim is seeded (direct test-DB write), lazy 15-min stale sweep on GET (raw-SQL `updatedAt` rewind — Prisma's `@updatedAt` would auto-touch), and failure-sentinel runs (`__FAIL_GEN_ALWAYS__` in the refine _instruction_, or rewritten into the _brief topic_ in the DB for regenerate-design) proving `pendingActionError` is set, previous content stays intact, and the next claim clears the error. Test infra: **`waitForAction(api, draftId, {timeoutMs, intervalMs})`** in `tests/helpers/api.ts` (polls until `pendingAction === null`). `agui-refinement.test.ts` updated to the async refine contract (202 + `waitForAction`; Override stays sync; the H7 case is now sequential — parallel refines 409 by design). `brand-kit.test.ts` gained **TC-BK-09** (logo-URL hygiene: `data:` URI `logoUrl` → 400 on POST create and PATCH; `logoUrl: null` still clears). ⚠️ Known catalog casualty: **TC-REG-H7a** (10 parallel refines → 10 revisions) contradicts the new single-flight contract and needs a rewrite.

> **Update (2026-07-13, brief draft recovery):** new suite **`brief-draft-recovery.test.ts` (§P, 10 cases)** — unfinished-brief autosave API (`/api/brief-drafts`): save → list → resume payload round-trip, in-place update (no duplicate), `?keepImages=true` delete + **no resurrection** via a stale autosave PUT (404 on unknown id), discard deletes the row's real MinIO image (uploads through `/api/briefs/images`, asserts the public URL dies), 5-per-user cap evicts oldest, 7-day TTL sweep (back-dates `updatedAt` via test-DB access — skips without `DATABASE_URL`), foreign ids 404 **including for admins** (no admin override, deliberately), trivial payload 422, oversized 400 (per-field zod cap) / 413 (64 KB serialized cap), unauthenticated → proxy redirect. Suite self-cleans (discards all rows before/after each test) so the cap never bleeds across tests. Full-suite count 122 → **132 passed**.

> **Update (2026-07-07, per-user Claude tokens):** new suite **`settings-claude-token.test.ts` (§O, 7 cases)** — self-service `GET/PUT/DELETE /api/me/claude-token` lifecycle (connect → replace → disconnect, masked `keyPrefix`, raw token never in any response/DOM), zod shape guard (400) vs validation failure (422 — under `MOCK_AI` a token containing `invalid` fails via the `mockClaudeTokenValidation` seam; the live path spawns a `claude -p` ping and can't run in this claude-html env), per-user isolation, proxy-redirect on unauthenticated calls, `/settings` page render (API-mode note, no CLI banner) and connect-via-form. `GET /api/me` now also returns `cliMode` + `claudeToken`. Test infra: `ApiClient` gained a `put()` method (`tests/helpers/api.ts`).

> **Update (2026-07-07, post-brief enhance):** §N gains one case in `briefing-assistant.test.ts` — **post-brief enhance** (`POST /api/briefs/enhance`, `withAuth` so _editor_-accessible unlike the campaign enhance): mock rewrite via the shared `buildMockBriefingEnhance` seam, topic-only drafting, 400 when topic AND content are blank, 404 on unknown campaign. Suite verified 7/7; expected full-suite count 103 → **104 passed** (full run not re-executed this session).

> **Update (2026-07-07, super-admin + username + briefing assistant):** two new suites — **`user-management.test.ts` (§M)**: super-admin CRUD on `/api/admin/users` (create-with-password → username sign-in, role toggle, deactivate revokes sessions + blocks sign-in, reactivate + password reset, self/super-admin guards, plain-admin and editor 403s); **`briefing-assistant.test.ts` (§N)**: campaign document lifecycle (upload/list/type-gate/5-doc-cap/delete), MOCK_AI chat (` ```briefing ` block → `briefingDraft`), enhance rewrite, transcript validation, editor 403s. Contract changes baked into existing specs: the seeded admin is **SUPER_ADMIN** (TC-AUTH-04 expects `super_admin`), the login page takes a **username** (pageLogin helpers fill the `Username` placeholder — an email still routes through the legacy flow). **Two hard-won test-infra rules:** (1) sign-in probes need a **fresh cookie jar per attempt** — a stale session cookie makes better-auth 403 (`MISSING_OR_NULL_ORIGIN`) on sign-in POSTs, masking the status under test; (2) the worker-flow suite **cancels stale PENDING queue entries in `beforeAll`** — the reused test DB accumulates due `__FAIL_GEN_ALWAYS__` retries that starve the tick's claim batch.

> **Update (2026-06-30, post size-picker):** the brief now picks a **size** (1:1 / 3:4) instead of platforms (channels default to both, chosen at publish time). Added **TC-GEN-A3** (3:4 portrait Path A → EXPORTED draft) and **TC-GEN-A4** (template/brief aspect-ratio mismatch → 400) in `path-a.test.ts`, plus a **3:4 portrait Path B** case in `path-b.test.ts`. **TC-UI-02/03** updated: step label is now "Size & Design" and Publish opens the shared `PublishDialog` (pick a channel + Confirm fires POST /api/posts). Net suite count 77 → 80 passed.

### Catalog implementation status (2026-06-30)

All §6 cases are now written. New/changed files:

- **Existing specs extended:** `brand-kit.test.ts` (TC-BK-02/04/05/06/07/08), `publish.test.ts` (TC-PUB-03/04/06/07/08/09), `path-a.test.ts` (TC-GEN-A2/03/04/05/06 + A3/A4 portrait & ratio-mismatch), `path-b.test.ts` (TC-GEN-B2 strengthened via DB + B3 portrait), `agui-refinement.test.ts` (TC-AGUI-06), `provider-registration.test.ts` (TC-PROV-06).
- **New spec files:** `auth.test.ts` (§A), `resolution.test.ts` (§C), `export.test.ts` (§F), `library.test.ts` (§H), `acp.test.ts` (§J), `regression.test.ts` (§K), `ui.test.ts` (§L).
- **New infra:**
  - `scripts/seed-editor.mjs` — the non-admin RBAC account (`editor@bisteccare.lk`, fixed test password — see `FIXED_TEST_PASSWORD` in `scripts/seed-admin.mjs`), wired into `setup-test-db.mjs`.
  - `tests/helpers/db.ts` — direct test-DB access for cases that can't be set up over HTTP. **It reads `DATABASE_URL` from `.env.test` FIRST**, because importing `@prisma/client` runs Prisma's bundled dotenv and loads the dev `.env` into `process.env` — so "process.env first" would wrongly hit the dev DB.
  - **`loginAs` now creates an isolated `APIRequestContext`** (its own cookie jar). The previous version reused the shared `request` fixture, so the admin cookie leaked into editor calls and RBAC tests got 200 instead of 403.
  - Two production-safe `testHooks.ts` seams — `buildMockCopy()` routes the brief topic into the mock caption, and `shouldMockPublishFail()` lets a `__FAIL_ALWAYS__`/`__FAIL_ONCE__` sentinel in the brief topic drive deterministic publish failures (TC-PUB-03/04, TC-REG-H12b) within a single serve.
  - **`POST /api/test/scheduler-tick`** — a test-only seam that runs one `runScheduledJobs()` pass so §K H12 can drive the scheduler over HTTP (Playwright's loader can't resolve the transitive `@/` aliases in the app module graph). **Dormant in prod: hard-404 when `NODE_ENV==='production'` AND 404 unless `MOCK_SOCIAL` is set, plus admin-gated.**
  - `playwright.config.ts`: the global `Content-Type: application/json` was **removed** (it overrode the multipart boundary and 500'd every upload route); `retries: 1` added (cold `next dev` route compiles flake under load).
  - ~~`.env.test` additions: `BISTEC_API_KEYS`/`BISTEC_ADMIN_API_KEYS`~~ **Superseded 2026-07-21 (team tenancy):** the env-key lists are deleted; the §J ACP-auth cases now mint real hashed `ApiKey` rows via `POST /api/team/api-keys` at test time — no env vars, no CI job env needed.
  - `npm run test:e2e:reg` runs the suite with `.env.test` loaded (handy for ad-hoc DB-aware runs); not required for a green run anymore (the H12 HTTP seam removed the reg-mode dependency).

**Contract corrections baked in (differed from the original §6 wording):**

- Unauthenticated API calls are **redirected to `/login` by middleware (3xx), not 401** (except `/api/acp`, which 401s at the route). TC-AUTH-03/07 assert the redirect.
- TC-GEN-A1/B1 etc. return **200** `{draftId,exportUrl}` (not 201) — already corrected in the skeleton, kept.

**The 3 intentional skips (everything else passes):**

- ~~**TC-GEN-05**~~ **runs since 005 T2** (in `path-b.test.ts`): the background mock seam (`__MOCK_BG__` topic sentinel, `shouldMockBackground` in `src/lib/testHooks.ts`) resolves the team's IMAGE row for real, swaps only `generateImage` for a fixture PNG, and the persisted background is read back anonymously (200, `image/png`). The same seam drives `background-notice.test.ts` (§BG, TC-BG-01…10, 005 AC-01/AC-08..AC-11).
- **TC-REG-H11b** (concurrency cap): needs a real-Chromium serve (`MOCK_PUPPETEER` unset); skips in the mock run.
- **TC-REG-H11a / H11c** (one Chromium process per run / relaunch-after-kill): require host process observation / killing Chromium — not auto-driveable from a black-box test; `test.skip` with rationale.

**Resolved infra dependencies (now run in the standard mock suite):**

- **DB-dependent cases** (TC-PUB-07/08, TC-EXP-01/03, TC-GEN-B2, TC-REG-H9/H10b/c) self-resolve the test DB via `tests/helpers/db.ts` (reads `.env.test`), so they run under `test:e2e:mock` — no reg-mode needed.
- **Scheduler** (TC-REG-H12a/b/c) drive the scheduler over the `/api/test/scheduler-tick` HTTP seam, so they run in the standard mock suite (no app-module import, no reg-mode).
- **ACP authenticated** (TC-ACP-02/03/04/05) mint a real `ApiKey` via `POST /api/team/api-keys` (team-admin session) and present the plaintext — always run, no env/job-env dependency (superseded 2026-07-21). TC-ACP-05 is folded into the generate_post output-signing assertion (the MCP stdio surface isn't HTTP-reachable).
  **Owner:** _unassigned_
  **Scope:** End-to-end coverage of the full app surface (API + UI) plus a dedicated regression suite for the 28 code-review remediation fixes (see [`code-review-findings.md`](code-review-findings.md)).

This document is the authoritative test design. Implement the cases below as Playwright specs under `tests/e2e/`. Every case lists an **ID**, **precondition**, **steps**, **expected result**, and (where relevant) the **finding it guards**.

---

## 0. Why this plan exists — current suite assessment

A Playwright skeleton existed under `tests/e2e/` but was **not functional as written**. All five blockers below are now **RESOLVED** (2026-06-23) — the 6 spec files (19 tests) run and pass. History kept for traceability.

| #   | Problem (original)                                                                                                                                              | Resolution                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Mock hooks never implemented.** Tests gated on `MOCK_AI`/`MOCK_PUPPETEER`/`MOCK_SOCIAL` but nothing in `src/` read them.                                      | ✅ Implemented in **`src/lib/testHooks.ts`** + 5 seam points (see §3). Dormant unless the flag is `true`.                                             |
| 2   | **Contract drift — `/api/posts`.** Spec sent `{channels:[…]}`, expected an array.                                                                               | ✅ Spec rewritten to singular `channel`, expects `{postId,status}` (201).                                                                             |
| 3   | **Contract drift — `/api/generate/assemble-a/-b`.** Spec asserted `draft.htmlContent/status/imageUrl` and **201**. Route returns **200 `{draftId,exportUrl}`**. | ✅ Spec asserts `{draftId,exportUrl}` at 200, then `GET /api/drafts/[id]` for status/htmlContent/imageUrl.                                            |
| 4   | **Port mismatch** (config `:3001` vs dev `:3000`).                                                                                                              | ✅ Test app runs on **`:3001`** (`npm run test:e2e:serve`), matching the config default.                                                              |
| 5   | **No DB isolation / teardown.**                                                                                                                                 | ✅ Dedicated **`bistec_studio_test`** DB (`npm run test:e2e:db`); the dev DB is never touched. (Per-run truncation between runs still TODO — see §2.) |

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
4. Seed the baseline: `npm run db:seed` (admin user + Bistec kit + Hearts Talk kit). ~~and `node --env-file=.env.test scripts/seed-cli-provider.mjs` if using CLI mode.~~ **Don't seed the `cli` COPY provider (2026-07-27):** CLI mode needs no COPY provider at all now (PR #30 server-side, PR #40 client-side), and that row **masks provider-gating bugs** — it is exactly why PR #40's dead Generate button never reproduced locally. `.env.test` runs `DESIGN_PROVIDER=claude-html` (API mode) anyway, so it was never needed here.

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
# (BISTEC_API_KEYS / BISTEC_ADMIN_API_KEYS deleted 2026-07-21 — §J mints real ApiKey rows via the API)
```

### Known seeded accounts

- **Admin:** `admin@bisteccare.lk` (role SUPER_ADMIN, username `adminBTG`); the test-DB password is the fixed test credential — see `FIXED_TEST_PASSWORD` in `scripts/seed-admin.mjs` (used by `tests/helpers/api.ts`)
- **Editor:** _create one in a global setup fixture_ (no seeded editor exists — see TC-AUTH-05 precondition). Needed for all RBAC/IDOR tests.

### Per-run reset

Add a global setup that truncates app tables (keep `User`/`Account`/`Session` for the seeded admin, or re-seed) between runs so counts/asserts are deterministic. `fullyParallel: false, workers: 1` is already set — keep it until isolation exists.

---

## 3. Mock strategy (must be built before generation tests run)

The deterministic path uses small, test-only seams, all centralized in **`src/lib/testHooks.ts`** and each gated behind its env flag so production is untouched. **Implemented (2026-06-23):**

| Flag             | Seam point (file)                                                                                                                                                                                                                                                                                                                                                                                                                                      | Behavior when set                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MOCK_AI`        | `resolveCopyProvider` (`src/providers/registry.ts`) → stub copy provider; `runDesignAgent` (`src/lib/agent/designAgent.ts`) → emits `buildMockHtml()` (echoes the brand kit's first hex colour from the prompt) then renders via the mocked Puppeteer path to get a **real EXPORTS key**; returns `buildMockConflict()` JSON when the refine instruction contains `conflict_test`. Also short-circuits the admin brand-voice `prompts/generate` route. | No Anthropic/OpenAI calls.                                                                                                                                               |
| `MOCK_PUPPETEER` | `renderHtmlToPng` (`src/lib/renderer/puppeteer.ts`)                                                                                                                                                                                                                                                                                                                                                                                                    | Skip Chromium; return `MOCK_PNG_BUFFER`. The MinIO upload still happens, so export keys remain real and signable (exercises H10).                                        |
| `MOCK_SOCIAL`    | `publish()` in `src/lib/social/instagram.ts` + `linkedin.ts`                                                                                                                                                                                                                                                                                                                                                                                           | Return `{ platformId: 'mock-<channel>-<ts>' }` with no HTTP call. `MOCK_SOCIAL_FAIL=true` makes them throw `PublishError` — for the FAILED/retry/backoff cases (§G, §K). |

> The brief's `copyProviderKey` must still reference a real enabled COPY provider (brief creation validates it) — the seed registers the keyless `cli` provider, and the specs pass `copyProviderKey: 'cli'`. `MOCK_AI` only stubs the _generation call_, not the validation.

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

| Endpoint                                   | Method | Body                                                                  | Success                                                                                                                         | Notes                                                             |
| ------------------------------------------ | ------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `/api/auth/sign-in/email`                  | POST   | `{email,password}`                                                    | 200 + `set-cookie`                                                                                                              | session token                                                     |
| `/api/me`                                  | GET    | —                                                                     | 200 `{ role }`                                                                                                                  | server-side role (H13)                                            |
| `/api/admin/brandkits`                     | POST   | `{name,colors,fonts}`                                                 | 200 kit                                                                                                                         | admin only                                                        |
| `/api/admin/brandkits/[id]/templates`      | POST   | `{name,htmlTemplate}`                                                 | template `{id}`                                                                                                                 | admin                                                             |
| `/api/admin/brandkits/[id]/prompts`        | POST   | `{content}`                                                           | 201 prompt / **409** on version race                                                                                            | H7                                                                |
| `/api/admin/brandkits/[id]/upload`         | POST   | multipart `file`                                                      | `{url,key,name}`                                                                                                                | `url` is **public** (H10)                                         |
| `/api/admin/brandkits/[id]/artifacts`      | POST   | multipart                                                             | 201 artifact                                                                                                                    | `url` public (H10)                                                |
| `/api/campaigns`                           | POST   | `{name,brandKitId?}`                                                  | campaign `{id}`                                                                                                                 | any role                                                          |
| `/api/briefs`                              | POST   | `{topic,goal,tone,channels[],designMode,copyProviderKey,campaignId?}` | **201** brief `{id}`                                                                                                            | validation                                                        |
| `/api/briefs/images`                       | POST   | multipart                                                             | `{url,filename}`                                                                                                                | `url` **public** (H10)                                            |
| `/api/generate/assemble-a`                 | POST   | `{briefId,templateId}`                                                | **200** `{draftId,exportUrl}`                                                                                                   | `exportUrl` signed (H10). NOTE: 200, not 201 (verified in route). |
| `/api/generate/assemble-b`                 | POST   | `{briefId}`                                                           | **200** `{draftId,exportUrl}`                                                                                                   | signed; 200 not 201.                                              |
| `/api/generate/export`                     | POST   | `{draftId}`                                                           | `{exportUrl}`                                                                                                                   | signed; short-circuits if set                                     |
| `/api/drafts/[id]`                         | GET    | —                                                                     | draft detail, `exportUrl` signed                                                                                                | ownership                                                         |
| `/api/drafts/[id]`                         | PATCH  | `{copyText}`                                                          | updated draft                                                                                                                   | EXPORTED→IN_PROGRESS                                              |
| `/api/drafts/[id]/refine`                  | POST   | `{instruction}` or `{overrideConflictId,instruction}`                 | **202** `{ok:true}` (async — poll draft GET; conflict via `conflict` field) or sync `{reply,revisionId,exportUrl}` for Override | 409 while a `pendingAction` is in flight (§Q)                     |
| `/api/drafts/[id]/revisions`               | GET    | —                                                                     | array, `exportUrl` signed                                                                                                       |                                                                   |
| `/api/drafts/[id]/revisions/[rev]/restore` | POST   | —                                                                     | `{exportUrl}` signed                                                                                                            |                                                                   |
| `/api/posts`                               | POST   | `{draftId,channel,scheduledAt?}`                                      | **201** `{postId,status}`                                                                                                       | **singular `channel`**; PUBLISHED / SCHEDULED / FAILED            |
| `/api/posts`                               | GET    | `?page&pageSize&status?`                                              | `{posts,total,page,pageSize}`                                                                                                   | admin=all, editor=own; `draft.exportUrl` signed                   |
| `/api/posts/[id]`                          | GET    | —                                                                     | post, `draft.exportUrl` signed                                                                                                  | ownership                                                         |
| `/api/posts/[id]`                          | DELETE | —                                                                     | `{postId,status:CANCELLED}` / **409** if not SCHEDULED                                                                          | admin                                                             |
| `/api/posts/[id]/publish`                  | POST   | —                                                                     | `{postId,status}` / 409 if not FAILED                                                                                           | admin retry                                                       |
| `/api/library`                             | GET    | `?page&pageSize&status&search`                                        | `{drafts,total,...}`                                                                                                            | non-admin filtered to own; `exportUrl` signed                     |
| `/api/admin/providers`                     | POST   | `{apiKey,slot,providerName?,label?}`                                  | 201 / 422 / 400                                                                                                                 | prefix auto-detect                                                |
| `/api/providers/available`                 | GET    | `?slot=COPY\|IMAGE`                                                   | array (no secret fields)                                                                                                        |                                                                   |
| `/api/acp/manifest`, `/api/acp/run`        | *      | —                                                                     | **401 without valid key**                                                                                                       | H1                                                                |

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
- **TC-AUTH-07 — middleware exact-prefix.** S: request a path that merely _prefixes_ a protected one (e.g. `/admincustom`). E: not wrongly treated as protected/exempt. **Guards M9.**

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
- **TC-GEN-05 — Generated image stored as public URL.** P: a team with an IMAGE row; brief topic carries `__MOCK_BG__` (the 005 background seam: real resolution, fixture `generateImage` data URL). S: Path B generation. E: `Draft.imageUrl` (the URL the design prompt embeds) is a **public**, unsigned URL (anonymous GET 200, `image/png`), so re-render later works. **Guards H10.**
- **TC-GEN-06 — Oversized template guard.** P: Hearts Talk template (1.81 MB). S: Path A with it. E: clean error (`Prompt too large…`), not a crash. **Known Issue regression.**
- **TC-GEN-A3 — Path A 3:4 portrait.** P: kit + PORTRAIT template + brief (`aspectRatio:PORTRAIT`, `designMode:TEMPLATE`). S: assemble-a. E: 200; `status:EXPORTED`; `GET /api/drafts/[id]` → `brief.aspectRatio:PORTRAIT`. **Guards the aspect-ratio threading.**
- **TC-GEN-A4 — Path A aspect-ratio mismatch rejected.** P: SQUARE template + PORTRAIT brief. S: assemble-a. E: 400 (no stretching; the wizard only offers matching templates, the API enforces it).
- **TC-GEN-B3 — Path B 3:4 portrait.** P: kit + brief (`aspectRatio:PORTRAIT`, `designMode:GENERATE`). S: assemble-b. E: 200; `status:EXPORTED`; `brief.aspectRatio:PORTRAIT`.

### E. AGUI refinement

> ⚠️ Contract updated 2026-07-17 (`async-draft-actions`): refine is async — POST returns **202 `{ok:true}`**; results arrive via the draft GET poll (`waitForAction` helper). Only the Override path stays synchronous.

- **TC-AGUI-01 — Refine creates a revision.** P: an EXPORTED draft. S: POST refine `{instruction:'make the background darker'}` → 202 → `waitForAction`. E: new revision row (found by instruction) with signed `exportUrl`; `currentRevisionNumber` advanced; `pendingActionError` null.
- **TC-AGUI-02 — Revision numbers are sequential.** S: three sequential refines (each 202 → `waitForAction`). E: revisionNumber 1,2,3; no gap/dup.
- **TC-AGUI-03 — Conflict card path.** P: mock agent returns a `{conflict:true,...}` JSON. S: refine → 202 → `waitForAction`. E: draft GET `conflict.{conflictId,explanation}` populated (never `pendingHtml`); `pendingConflict` set server-side; **no** new revision yet.
- **TC-AGUI-04 — Override applies pending HTML.** S: refine with `{overrideConflictId}` — **still synchronous**. E: 200 `{reply,revisionId,exportUrl}`; revision created, `pendingConflict` cleared.
- **TC-AGUI-05 — Restore a revision.** S: POST `…/revisions/1/restore`. E: `{exportUrl}` signed; `Draft.htmlContent` = that snapshot. (409 while a `pendingAction` is in flight — §Q.)
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
- **TC-ACP-02 — Valid key → manifest.** P: an `ApiKey` minted via `POST /api/team/api-keys` (plaintext presented once). E: 200 manifest. _(Env-list keys deleted 2026-07-21.)_
- **TC-ACP-03 — `run` input validation.** S: `generate_post`/`publish_post` with missing fields. E: 400. **Guards M6.**
- **TC-ACP-04 — MCP system-user FK.** S: `generate_post` via MCP. E: Brief/Draft created with a real system user id (no FK violation). **Guards L1.**
- **TC-ACP-05 — MCP getDraft signs exportUrl.** E: returned `exportUrl` is signed/fetchable. **Guards H10.**

### K. Remediation regression suite (the just-completed work)

These are the highest-value additions — they guard the H7/H9/H10/H11/H12 fixes specifically and need targeted setups.

- **TC-REG-H7a — Refine revision atomicity (rewritten for the §Q async single-flight contract; parallel assertion de-flaked 2026-07-22).** P: one EXPORTED draft. S: (1) fire **N=10 sequential** POST `/refine` (each 202 → `waitForAction`); (2) fire **N=10 parallel** POST `/refine`. E: sequential runs append **distinct, contiguous** revisions 2..11 with no 500s; under parallel fire every request is either **202 or 409, never 500** (the atomic `pendingAction` claim), and **exactly one revision is appended per 202 winner**, numbering still distinct and contiguous. Same H7 guarantee — contention never reaches the revision transaction. **Winner count is timing-dependent, not asserted:** the claim guarantees at most one action in flight at any instant, but under the instant `MOCK_AI`/`MOCK_PUPPETEER` seams a fire-and-forget action settles in milliseconds, so a later request in the batch can legitimately re-claim a slot an earlier winner has already released (≥1 winner). In production the model call takes seconds, so the batch truly overlaps and exactly one wins — that stronger property just isn't observable under mocks, so the test asserts the mock-stable integrity invariant instead of a fixed winner count (the old "exactly one 202, nine 409s" assertion was flaky for exactly this reason).
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
- **TC-UI-02 — Brief wizard 5-step happy path.** Walk Campaign → Size&Design → Content → Images → Review → Generate; land on `/drafts/[id]` with a preview. (Path A blocks Continue until a template is chosen.) Step labels asserted: Campaign, **Size & Design**, Content, Images, Review.
- **TC-UI-03 — Publish button opens the dialog and publishes.** On a draft, click Publish → the shared `PublishDialog` opens; pick a channel + Confirm → POST `/api/posts` fires (not a navigation). **Guards H5.**
- **TC-UI-04 — Draft preview image loads.** The `<img src={exportUrl}>` returns 200 (signed URL works end-to-end in the browser). **Guards H10.**
- **TC-UI-05 — AGUI chat refine round-trip.** Type an instruction, see the preview update + a new revision in history.

### U. Rejected refine renders stay out of the revision chain (`rejected-revisions.test.ts`, change 004 T15/T16)

A refine that fails verification twice keeps its render as a `DraftRevision` with `revisionNumber NULL` and `rejectedAt` set (FR-13), and the draft carries `notAppliedReason` / `notAppliedRevisionId`. These cases seed such a row directly in the test DB (they predate T17's writer) and prove every chain consumer is blind to it. Needs `MOCK_AI` + `MOCK_PUPPETEER` + test-DB access.

- **TC-REJ-01 — Absent from the list, the count and restore.** P: EXPORTED draft (v1) + a seeded rejected row. E: `GET /revisions` lists only v1; draft GET `revisionCount` 1, pointer 1, status EXPORTED, no heal/fail/error; restore by the row's id → 400, by `2`/`0` → 404; restoring v1 still works and never lands the rejected render; the row itself is untouched (FR-13).
- **TC-REJ-02 — Next-number allocation skips it.** P: as above, plus a second rejected row mid-way. S: refine → regenerate-design → inline-edit. E: chain numbers 2, 3, 4, contiguous; Undo to v2 lands v2; DB: numbered rows exactly 1..4, both rejected rows still unnumbered.
- **TC-REJ-03 — The DB enforces the invariant.** Each bad insert is refused by its **named** CHECK constraint (migration `20260927130000_refine_not_applied`): rejected but numbered, and unnumbered but not rejected → `DraftRevision_rejected_iff_unnumbered`; a committed row carrying `rejection` data (FR-02) → `DraftRevision_rejection_fields_only_when_rejected`; `adoptedAt` without `adoptedRevisionNumber` → `DraftRevision_adoption_complete`. Any number of rejected rows coexist under `@@unique([draftId, revisionNumber])`.
- **TC-REJ-04 — Admin hard-delete.** A draft whose `notAppliedRevisionId` points at a rejected row deletes cleanly (FK `ON DELETE SET NULL`), leaving no rows.

### V. Refine fidelity contract (`agui-refinement.test.ts` §V, change 004 T21 — AC-08 → AC-20b)

The refine route verifies every edit (`src/lib/drafts/refineAttempt.ts`): the reply carries `{classes, supersedes, constrains}` + the document; a destructive class (replace/remove) with empty `supersedes` is downgraded and counts as a miss; replace/remove/constrain are checked structurally (zero model calls); `add` spends one Haiku verifier call; a miss is retried **once**; a second miss commits nothing and is recorded as a rejected row (diagnostics in `DraftRevision.rejection`, read with `rejectionDiagnosticsSchema`) plus the draft's not-applied outcome (`notApplied` on the poll). The cases drive the T20 seams in `src/lib/testHooks.ts` and read diagnostics straight from the test DB. Before-documents needing an image or an inline `data:` asset are arranged through `POST /api/drafts/[id]/inline-edit` (a normal committed revision) — no extra seam.

> **⚠️ Scope — API mode only.** The mock suite runs `DESIGN_PROVIDER=claude-html`, so only the **API-mode** refine branch (`runDesignAgentRefine`) is exercised. The prod **CLI** branch (`runDesignAgentCliRefine`, `claude -p`) is covered by unit tests only (`tests/unit/refineAttempt.test.ts`, `tests/unit/designAgentRefine.test.ts`, the CLI cases in `tests/unit/refineVerify.test.ts`). A green §V says nothing about CLI mode.
>
> **Seam semantics to remember.** The forced verify outcomes (`__VERIFY_PASS__` / `_FAIL_ALWAYS__` / `_FAIL_ONCE__` / `_UNAVAILABLE__`) short-circuit **before** the verifier model hook, so on those paths `rejection.verifierCalls` is 0. The mock add-verifier **model reply** (`buildMockVerifierReply`) answers "applied" by default; its own sentinels `__VERIFIER_SAYS_NO__` (a well-formed `{"applied": false}` → miss), `__VERIFIER_GARBAGE__` (unparseable → unavailable) and `__VERIFIER_EMPTY__` (empty → unavailable) are **not** forced outcomes: the call is counted and the reply goes through the real verdict parser, so those paths record one verifier call per attempt (TC-FID-16/17). Not applied always spends both attempts (`refineCalls` 2).

Every not-applied case (helper `refineNotApplied`) asserts: clean completion (`pendingAction`/`pendingActionError` null), pointer + `htmlContent` + committed chain unchanged (AC-16), exactly one new rejected row, `notApplied.instruction`/`reason` on the poll (the reason carries the final miss), the row's `instruction`/`rejectedAt`/NULL number, and the AC-15 caps on its diagnostics (`refineCalls` ≤ 2, `verifierCalls` ≤ 2, ≤ 1 per attempt, attempts = refine calls). Every committed case (helper `refineCommitted`) asserts the pointer advanced by exactly one, the revision carries the instruction, and no rejected row was written.

- **TC-FID-01 — REGRESSION "reduce the text".** P: text document (inline-edit). S: `Reduce the text __REFINE_REDUCE_NOOP__`. E: not applied; both attempts `classes`/`effectiveClasses` `['remove']`, `supersedes` = the paragraph's lead phrase, verdict `miss`, a `remove:` reason; `verifierCalls` 0 (AC-12); the retained render is the unchanged echo (same word count); `export: 'stored'` and the poll's `previewUrl` is that object. **AC-08, AC-12, AC-16, AC-17.**
- **TC-FID-02 — Real reduction commits.** `__REFINE_REDUCE_REAL__` → committed; visible word count strictly lower, lead phrase gone. **AC-08.**
- **TC-FID-03 — Retry fixes it.** `__REFINE_REDUCE_NOOP__ __REFINE_FIX_ON_RETRY__` → committed on attempt 2, shorter. **FR-11.**
- **TC-FID-04 — REGRESSION "use the uploaded image as the background".** P: document with an `<img>` on the public MinIO host. S: `__REFINE_IMAGE_DUP__` (the reported failure: new image added, old kept). E: not applied; both attempts `['replace']`, `supersedes` = the old image URL, a `replace: … still present` miss, `verifierCalls` 0; the rejected render contains **both** images; the live design still has only the old one. **AC-09, AC-12.**
- **TC-FID-05 — Clean replace commits.** `__REFINE_IMAGE_REPLACE__` → committed; old image absent, new present. **AC-09.**
- **TC-FID-05b — REGRESSION, the REPORTED duplicate shape (final F1 / C-1).** P: an old background (`.bg` inline `url()`) plus an "uploaded" inset `<img>`. S: `__REFINE_IMAGE_MOVE_DUP__` — the inset image applied as the background AND kept as the inset, `supersedes` = the old background (which is gone). E: not applied; both attempts a `replace: … appears more often` miss (image multiplicity 1 → 2), `verifierCalls` 0; the rejected render has the upload twice and no old background; the live design unchanged. **AC-09, AC-12.**
- **TC-FID-05c — The correct move commits (final F1 / C-1).** `__REFINE_IMAGE_MOVE_DUP__ __REFINE_FIX_ON_RETRY__` → committed on attempt 2; the upload appears once (as the background), the old background is gone. **AC-09.**
- **TC-FID-06 — Empty supersedes deletes nothing.** P: image document. S: `__REFINE_EMPTY_SUPERSEDES__` (a replace with `supersedes: []` whose document wipes the design). E: not applied; `classes ['replace']` → `effectiveClasses ['add']`, `downgraded ['replace']`, verdict `skipped` (never verified), `replace: supersedes was empty` reason; the live design still holds the image and none of the wipe. **AC-10.**
- **TC-FID-07 — Multi-class commits when every class passes.** P: image document. S: `__REFINE_MULTI_CLASS__` (replace + add). E: committed — replace passed structurally and add passed the verifier. **AC-11.**
- **TC-FID-08 — Multi-class with a failing half.** P: the default mock design (no image, so the replace names nothing in the document). E: not applied; both attempts `['replace','add']` verified as such, a `replace:` miss, `verifierCalls` 0 — the add call is not spent once a structural check missed. **AC-11, AC-12.**
- **TC-FID-09 — Add.** A plain add ("Include a human character") commits on the verifier's pass; the same with `__VERIFY_FAIL_ALWAYS__` is not applied, both attempts `['add']` with `classificationDefaulted` (a bare document defaults to the preserving class).
- **TC-FID-10 — Verifier unavailable fails closed.** `__VERIFY_UNAVAILABLE__` → not applied, both verdicts `unavailable`, reason `verification unavailable (treated as a miss)`; then `__VERIFY_FAIL_ONCE__` on the same draft commits on the retry. **AC-14, FR-11.**
- **TC-FID-11 — Placeholder reconciliation.** P: document with an inline `data:` image (the model sees `__INLINE_ASSET_0__`). S: `__REFINE_TOKEN_RENAME__`. E: not applied; `reconcile.kind: 'mismatch'`, verdict `skipped`, `verifierCalls` 0, no usable render (`export: 'none'`, `exportUrl` null, `previewUrl` null); the live design keeps the asset. Then `… __REFINE_FIX_ON_RETRY__` commits with the original `data:` URI restored and no token left. **AC-07, AC-05.**
- **TC-FID-12 — Truncated reply.** `__REFINE_TRUNCATED__` → not applied, both attempts `document: 'truncated'`, never verified, no export, the kept snapshot has no `</html>`, `previewUrl` null.
- **TC-FID-13 — The caps hold for every failure kind.** One draft, six not-applied refines in turn (reduce no-op, image dup, empty supersedes, truncated, forced miss, forced unavailable). E: each spends exactly 2 refine calls and ≤ 2 verifier calls, writes one rejected row and discards the previous one; pointer and chain never move. **AC-15, AC-16.**
- **TC-FID-14 — Regenerate is unchanged (smoke).** regenerate-design and regenerate-copy answer 202 `{ok:true}`, settle with no error and `notApplied` null, write no rejected row (design advances the pointer by one; copy leaves it). §Q TC-ASYNC-01/02 cover them in full. **AC-20.**
- **TC-FID-15 — UI: hard failure, preview, "Use anyway".** After a not-applied refine, the draft page shows a `role="alert"` card ("Couldn’t apply …" + the instruction) with the rejected render's preview loaded; clicking **Use anyway** commits exactly one revision (pointer + 1) whose export is the rejected render, stamps `adoptedAt`/`adoptedRevisionNumber`, and the alert disappears. **AC-18 (UI), AC-20a.**
- **TC-FID-16 — Add absent after the retry (real verifier path).** `Include a human character __VERIFIER_SAYS_NO__` → not applied; `refineCalls` 2, `verifierCalls` 2 (exactly one per attempt), both attempts `['add']` with verdict `miss` and the verifier's `add:` reason. **AC-13.**
- **TC-FID-17 — Unparseable / empty verifier reply (real parser).** `__VERIFIER_GARBAGE__` and `__VERIFIER_EMPTY__` (one case each) → not applied; `verifierCalls` 2, both attempts `unavailable` with the parser's reason (`verifier response was not a valid verdict` / `verifier returned an empty response`). **AC-14.**

**AC → coverage map (AC-08 → AC-20b).**

| AC                                                         | E2E                                                                                                                                     | Unit (where the E2E cannot see it)                                                                                                                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-08 reduce the text                                      | TC-FID-01/02/03                                                                                                                         | `refineAttempt.test.ts` "AC-08: remove whose text is not shorter…"                                                                                                                          |
| AC-09 duplicate image                                      | TC-FID-04/05/05b/05c                                                                                                                    | `refineAttempt.test.ts` "AC-09: the duplicate-image failure…"                                                                                                                               |
| AC-10 empty supersedes                                     | TC-FID-06                                                                                                                               | `refineAttempt.test.ts` "AC-10: replace/remove with an empty supersedes…"                                                                                                                   |
| AC-11 multi-class                                          | TC-FID-07/08                                                                                                                            | `refineVerify.test.ts` "verifies every class of a multi-clause instruction (AC-11)"                                                                                                         |
| AC-12 zero verifier calls                                  | TC-FID-01/04/06/08 (`verifierCalls` 0)                                                                                                  | `refineVerify.test.ts` "structural classes spend zero model calls (AC-12)"                                                                                                                  |
| AC-13 add = one call, not applied after retry              | TC-FID-16 (says-no: `verifierCalls` 2, one per attempt); TC-FID-09 (commit on pass)                                                     | `refineAttempt.test.ts` "AC-13 + AC-20b…"; `refineVerify.test.ts` "add: exactly one verifier call, pinned to Haiku" and "**VERIFIER_SAYS_NO**…"                                             |
| AC-14 timeout/empty/unparseable = miss                     | TC-FID-17 (unparseable + empty through the real parser); TC-FID-10 (forced unavailable)                                                 | timeout: `refineVerify.test.ts` "fails closed: anything but a verdict is unavailable" (not reachable under mocks); `refineAttempt.test.ts` "AC-14: an unparseable verifier reply is a miss" |
| AC-15 ≤ 2 refine + ≤ 2 verifier calls                      | every not-applied case; TC-FID-13                                                                                                       | `refineAttempt.test.ts` "AC-15 — the hard cap holds for ANY input" (576 cases); schema cap in `draftRevisions.test.ts`                                                                      |
| AC-16 pointer unchanged, no new revision                   | every not-applied case; TC-FID-13                                                                                                       | `refineAttempt.test.ts` "AC-16 — settleRefine: not applied commits nothing"                                                                                                                 |
| AC-17 rejected render retrievable + labelled               | TC-FID-01 (instruction, classes, miss)                                                                                                  | `draftRevisions.test.ts` recordRejectedRender                                                                                                                                               |
| AC-18 distinct poll outcome + UI failure                   | TC-FID-15 (UI); T18 in `refine-not-applied.test.ts` (poll shape, `pendingActionError` null, cleared by a later refine / restore)        | `draftRevisions.test.ts` resolveNotAppliedOutcome                                                                                                                                           |
| AC-19 one table, two consumers                             | — (not observable over HTTP)                                                                                                            | `instructionClasses.test.ts` "AC-19 — editing the table changes the prompt AND the verifier criteria"; `refinePrompt.test.ts`                                                               |
| AC-20 regenerate unchanged                                 | TC-FID-14; §Q TC-ASYNC-01/02                                                                                                            | `designAgentRefine.test.ts` (default runners byte-identical)                                                                                                                                |
| AC-20a Use anyway, adopt once                              | TC-FID-15 (UI); T19 in `refine-not-applied.test.ts` (second adopt 409, concurrent adopts, no-export 409, discarded 409, cross-team 404) | `draftRevisions.test.ts` "commitDraftRevision adoptRejectedRevisionId"                                                                                                                      |
| AC-20b verifier pinned to Haiku, retry on the user's model | — (the model is not observable over HTTP under mocks)                                                                                   | `refineVerify.test.ts` "add: exactly one verifier call, pinned to Haiku (AC-13, FR-14b, AC-20b)"; `refineAttempt.test.ts` "AC-13 + AC-20b"                                                  |

**Known limits of the checks (accepted, recorded in `src/lib/agent/instructionClasses.ts` except the first):**

- **Constrain "decrease" can pass by truncating text.** `boundedAttributeHolds` passes a `decrease` when any measure (font-size, box area, text length, word count) goes down and none goes up — so "make the headline smaller" can pass by cutting the headline's words with the font size unchanged. Not caught by the structural check; not reachable under `MOCK_PUPPETEER` (constrain targets never resolve there).
- **Re-tagged passages (N5 family: SPLIT / R1 variants).** A passage re-tagged with its phrase reworded out has no counterpart and reads as gone, so it can pass remove — including when an additive clause is co-present.
- **Flat supersedes, replace-only exemption (fail-open, narrow).** In a replace+remove, a passage the remove clause should have shortened but that was rewritten wholesale — longer — is attributed to replace and passes. Per-clause supersedes is the upgrade path.

### T. Manual inline edit, whole-document and single-element (`draft-inline-edit.test.ts`, element mode is change 004 T22–T24)

`POST /api/drafts/[id]/inline-edit` has two modes, and both use one writer, `commitDraftRevision`.

- **Whole-document mode** (the default): the editor sends the edited HTML.
- **Element mode** (`mode: 'element'`): the editor sends one structural locator `{path, tag, text, baseRevisionNumber}` and one closed-grammar value.
  - The server resolves the node against the **current** stored HTML, and only when the draft's pointer still equals `baseRevisionNumber` (a route check, and again as a compare-and-swap inside the commit).
  - Text is written as a text node. Colour and size are parsed and re-serialized.

Most cases pin a known document through whole-document mode first, then address elements by path. Every case needs `MOCK_PUPPETEER`; TC-INLINE-11 and -13 also need `MOCK_AI`.

- **TC-INLINE-01..04:** whole-document save → new revision with the pointer advanced; restore still works; a missing or empty `html` is 400; an unknown draft is 404.
- **TC-INLINE-05:** an element text edit with a `<script>` value and a decoy top-level `selector`. It is 200 with exactly one new revision, and the stored HTML equals the base with only the `<h1>` content changed, now escaped. Re-sending the same locator is 409 `element-stale`.
- **TC-INLINE-06:** the colour `red; background: url(http://evil.test/x)` is 400 `invalid-color`; the pointer and `htmlContent` are unchanged.
- **TC-INLINE-07:** two element edits chained on the returned `revisionNumber` both land, and the exact final document is asserted.
- **TC-INLINE-08:** a stale `baseRevisionNumber` whose path now names an identical-fingerprint sibling is 409 and writes nothing.
- **TC-INLINE-09:** two element edits in parallel on one base: exactly one 200 and one 409 `element-stale`, never a 500.
- **TC-INLINE-10:** an element edit racing a whole-document save, 15 rounds. It is never a 500, and revisions == pointer == the number of 200s.
- **TC-INLINE-11:** a "Use anyway" adopt racing a whole-document save, 10 rounds. It is never a 500.
- **TC-INLINE-12 (T24):** the sizes `24vh`, `big`, `12 px`, `-5px` and `calc(1px + 2px)` are each 400 `invalid-size`, with no revision and `htmlContent` unchanged.
- **TC-INLINE-13 (T24):** a **real refine** between two edit sessions (default mock reply). The before-document has `<div>MOCK DESIGN</div>` at `[0]`. The refine rewrites the whole document, but a `<div>MOCK DESIGN</div>` is still at `[0]`, so the old tag + text fingerprint still matches. The old session's edit is 409 `element-stale` and the refined HTML is byte-identical. A fresh session, with the base taken from a new GET, then lands on the refined node.
- **TC-INLINE-14 (T24):** decoy `selector` / `target` fields naming the `<p>` at the top level, in `locator` and in `edit`. Only the path-resolved `<h1>` gets the declaration, and the document is asserted exactly.
- **TC-INLINE-15 (T24, browser):** the editor UI, driven with Playwright `page`.
  1. Open the draft, choose "Edit inline" → "Single element", and click the `<h1>` inside the iframe.
  2. Apply the text `<script>alert(1)</script>`. The stored HTML is escaped, there is exactly one new revision, the reloaded iframe shows the literal text with no `<script>` element in `<body>`, and the `<h1>` is re-selected.
  3. Apply the AC-22 colour as a background. The server's grammar message is shown inline, and nothing is written.
  4. Another writer rewrites the design, then apply a font size. It reports that the design changed, reloads the latest version, and writes nothing.
  5. A fresh click on the right `<p>` in the reloaded document then lands.

  Clicks in a freshly remounted frame first wait for `[data-editor-ready="true"]` and the frame's `#inline-edit-select-style`.

- **TC-INLINE-16 (T24 fix round 1, browser):** a whole-document save never reverts a newer save.
  - The page reads the draft at revision 2. A newer save then lands (revision 3), and the page, which does not poll, still holds revision 2. That is the state of a reopen inside the page's post-save refetch.
  - Opening the editor re-reads the draft, and "Save & re-export" stays disabled until that read lands.
  - The save keeps the newer save's text.
- **TC-INLINE-17 (T24 fix round 1, browser):** keyboard only. Every control is focused and activated with Enter.
  1. "Select the whole design" selects `<body>`, with focus on the heading.
  2. Child selects `<section>`, and focus stays on Child. Next selects `<footer>`; Next is then disabled, so focus falls back to the heading. Previous and Child reach the `<h1>`.
  3. Type the text and Apply. After the re-select, focus is on the Text field, because Apply text is disabled for the unchanged text.
  4. Apply a font size. Focus is back on "Apply font size".
  5. The exact document is asserted.
- **TC-INLINE-18 (T24 fix round 2, browser):** a failed re-read fails closed, and whole-document mode always starts from a fresh read. A Playwright `page.route` fails exactly one of the **editor's** draft GETs; the page's own refetch is left alone, because if it failed the page would show its error screen.
  - **Phase 1:** an element Apply succeeds, then the editor's re-read fails. Switching to Whole document re-reads, and Save stays disabled until a read lands. The save keeps the element edit. On `4f9477fe` this reverted it.
  - **Phase 2:** the switch's own re-read fails. The "Try again" overlay shows and Save is disabled, and only a successful retry re-enables it.
  - A mutation check confirmed that phase 2 fails when only the fail-closed half of the fix is removed.

**AC → case map (change 004 Phase 3).** The unit files are `tests/unit/inlineEditElement.test.ts`, `htmlLocator.test.ts`, `draftRevisions.test.ts` and `inlineElementEditClient.test.ts`.

| AC                                                                     | E2E                                                                                                                     | Unit                                              |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| AC-21 `<script>` text renders as literal text                          | TC-INLINE-05 (stored escaped, exact document), TC-INLINE-15 (visible literal text in the editor, no `<script>` element) | `applyElementEdit` AC-21; `replaceElementText`    |
| AC-22 break-out colour rejected, nothing written                       | TC-INLINE-06, TC-INLINE-15 (message shown in the UI)                                                                    | `parseColor` (the exact string plus every `url(`) |
| AC-23 bad unit / non-numeric size rejected                             | TC-INLINE-12                                                                                                            | `parseSize`                                       |
| AC-24 one revision through `commitDraftRevision`                       | TC-INLINE-05, -07, -09, -10, -15, -17, -18                                                                              | `draftRevisions.test.ts` (CAS, lock order)        |
| AC-25 no persisted address; a rewrite between sessions can't misdirect | TC-INLINE-05, -08 (whole-document rewrite), **-13 (real refine)**, -15 (UI reload)                                      | `checkElementBaseRevision`, stale path/tag/text   |
| AC-26 client selector never chooses the target                         | TC-INLINE-05 (top-level decoy), **-14 (decoys at every level, naming a different element)**                             | schema strips `selector`/`target` at every level  |

### BG. Skipped AI background notice (`background-notice.test.ts`, change 005 T2 — AC-01, AC-08 → AC-11)

A Path B background that was not produced is recorded with its reason (FR-06: `NO_PROVIDER`, `PROVIDER_ERROR`, `DECISION_ERROR`, `NOT_NEEDED`) on `Draft.backgroundSkipReason` / `backgroundSkipDetail`, polled as `backgroundSkipped: { reason, message } | null`, and shown as an amber `role="status"` notice under the preview (FR-07). `NOT_NEEDED` is never stored. The provider's error text appears only as a redacted (keys, URLs and `host:port` removed), 300-char-clipped detail inside the `PROVIDER_ERROR` sentence; a moderation refusal reads as "the image request was refused".

The cases drive the NFR-06 background seam (`shouldMockBackground` / `backgroundSeamText` in `src/lib/testHooks.ts`, consulted only under `MOCK_AI`): the sentinel `__MOCK_BG__` makes the decision "needed", **the real resolver picks the provider**, and only its `generateImage` is swapped for a fixture PNG; `__MOCK_BG_FAIL__` makes that fixture throw; `__MOCK_BG_NOT_NEEDED__` makes the decision "not needed". Generation reads the sentinel from the brief topic; a refine reads it from its **instruction** when that carries one, else from the topic. Without a sentinel `MOCK_AI` keeps its early return, so no other suite changes. Every case runs in its own fresh team (soft-deleted afterwards), with either no IMAGE row or one enabled **non-default** IMAGE row registered over the API (T1's key-validation seam); the acting super admin has no personal OpenAI key. Refines carry `__VERIFY_PASS__` so the 004 verifier commits them. Needs `MOCK_AI` + `MOCK_PUPPETEER`; the DB assertions use test-DB access when available.

Refine writes by its own rule: it resolves the provider **first** and, with none, never runs its decision (`NO_PROVIDER` → leave the skip unchanged). It sets the skip only when its decision wanted a background and the provider then failed (`PROVIDER_ERROR`), clears it when it produced one, and otherwise leaves it unchanged, as it does `imageUrl`.

- **TC-BG-01 — No IMAGE row ⇒ NO_PROVIDER, shown (AC-08).** P: no IMAGE row. S: Path B generation, topic `__MOCK_BG__`. E: draft `EXPORTED`, `imageUrl` null; polled `backgroundSkipped.reason` `NO_PROVIDER` with the fix-it message; DB reason `NO_PROVIDER`, detail null. Browser (super admin): the notice is visible, `role="status"`, title "No AI background", body "No image provider is set up…", link "Open Team settings" → `/team`.
- **TC-BG-02 — Non-default row serves a no-key brief (AC-01, E2E half).** P: one enabled non-default IMAGE row; `/api/me/openai-key` reports `connected:false`; the brief has no `imageProviderKey` (what the scheduler, MCP and ACP send). S: generation, `__MOCK_BG__`. E: `imageUrl` is a persisted `background-*.png`; `backgroundSkipped` null.
- **TC-BG-03 — Not needed ⇒ no skip, no notice (AC-09).** P: one non-default row. S: generation, `__MOCK_BG_NOT_NEEDED__`. E: `imageUrl` null, `backgroundSkipped` null, DB reason null; the browser shows no notice.
- **TC-BG-04 — Provider throws ⇒ PROVIDER_ERROR, the draft completes (AC-10).** P: one non-default row. S: generation, `__MOCK_BG_FAIL__`. E: `EXPORTED` with an `exportUrl`, `imageUrl` null, message exactly "The image provider returned an error (Mock image provider failure (**MOCK_BG_FAIL** sentinel)), so the post was designed without one."
- **TC-BG-05 — Regenerate-design clears an earlier skip (AC-11).** P: a `NO_PROVIDER` draft, then a non-default row is added. S: `POST /regenerate-design`. E: `backgroundSkipped` null, a `background-*.png` `imageUrl`, revision 2.
- **TC-BG-06 — A refine that produces a background clears the skip (AC-11).** P: a `NO_PROVIDER` draft, then a non-default row is added. S: refine (topic `__MOCK_BG__`). E: revision 2, `backgroundSkipped` null, a `background-*.png` `imageUrl`.
- **TC-BG-07 — A refine that wanted a background and failed sets the skip (AC-11).** P: one non-default row; generation with topic `__MOCK_BG__` produced a background (skip null). S: refine with `__MOCK_BG_FAIL__` in the **instruction**. E: the edit commits (revision 2); polled and stored reason `PROVIDER_ERROR` with the mock detail; `imageUrl` (polled and in the DB) is the generation's background, unchanged.
- **TC-BG-08 — A refine that didn't want a background leaves the skip unchanged (AC-11).** P: one non-default row; generation `__MOCK_BG_FAIL__` stored `PROVIDER_ERROR`. S: refine with `__MOCK_BG_NOT_NEEDED__` in the instruction (a provider resolves, so the decision really runs). E: revision 2; `backgroundSkipped` equal to the generation's.
- **TC-BG-09 — A refine on a team with no provider leaves the skip unchanged (FR-07 refine rule).** P: one non-default row; generation `__MOCK_BG_FAIL__` stored `PROVIDER_ERROR`; then the row is disabled. S: refine with `__MOCK_BG__` in the instruction. E: revision 2; `backgroundSkipped` still the `PROVIDER_ERROR` (never `NO_PROVIDER`); `imageUrl` null. The unit suite proves the decision model is never called on this path.
- **TC-BG-10 — A team editor gets the /settings link (FR-07).** P: the seed editor (`editor@bisteccare.lk`) is added to the fresh team as `EDITOR` and generates a `NO_PROVIDER` draft. S: open the draft in the browser as the editor. E: the notice shows the `NO_PROVIDER` body and an "Open Settings" link → `/settings`, and no `/team` link. Teardown removes the membership, so the seed editor keeps its original teams.
- **TC-BG-11 — A Gemini default IMAGE row serves a background (005 T8, AC-20).** P: a fresh team whose only IMAGE row is a Gemini key registered over the API (the first row, so it is the default; `providerName` `gemini`). S: Path B generation, topic `__MOCK_BG__`. E: draft `EXPORTED`, `backgroundSkipped` null (no skip notice), `imageUrl` a persisted `background-*.png`; DB `backgroundSkipReason` null. Test: `background-notice.test.ts:197`. The seam swaps only `generateImage`, so nothing reaches Google (mock-verified only, AC-21); that a gemini row resolves to a `GeminiImageProvider` is asserted in `tests/unit/geminiImage.test.ts`.
- **TC-GEN-05** (§D, `path-b.test.ts`) uses the same seam for the public-URL check.

**AC → case map (change 005 item 3).** The unit file is `tests/unit/background.test.ts`: every reason including the stage-based catches, never throwing, the refine order (resolve first; a provider-less refine never decides), the seam (resolution runs for real; the instruction sentinel wins; no effect without `MOCK_AI`), the writer rules, the message table, the moderation and redaction tables, and the `commitDraftRevision` threading.

| AC                                                  | E2E                                               |
| --------------------------------------------------- | ------------------------------------------------- |
| AC-01 (E2E half) non-default row, no personal key   | TC-BG-02                                          |
| AC-08 NO_PROVIDER stored, polled, shown; EXPORTED   | TC-BG-01, TC-BG-10                                |
| AC-09 not needed ⇒ no notice                        | TC-BG-03                                          |
| AC-10 provider failure ⇒ PROVIDER_ERROR, completes  | TC-BG-04                                          |
| AC-11 regenerate clears; refine sets / leaves alone | TC-BG-05 … TC-BG-09                               |
| AC-12 TC-GEN-05 runs                                | TC-GEN-05                                         |
| AC-20 Gemini default row serves a background        | TC-BG-11 + the provider-registration Gemini cases |

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

Last green run: **211 passed / 0 failed / 0 flaky / 4 intentional skips** (~3.2 min) on 2026-09-28 (`v2`, change 004 T21 — fresh test DB, clean `.next`); the T21 follow-up then added TC-FID-16/17 (3 cases, expected full count **214 / 4 skipped**), verified in a targeted run of `agui-refinement` + `refine-not-applied` (38/38) rather than a full run (earlier: 145/4 on 2026-07-17, `async-draft-actions` finalize; earlier baselines: 135/4 on 2026-07-14, 80/4 on 2026-06-30, skeleton 19/19 on 2026-06-23).

CI gate: **`.github/workflows/e2e.yml`** runs the whole suite (§A–§S, including §K) with mocks on every PR and push to `main`. To enforce it, mark the `e2e` check **required** in the `main` branch-protection settings.

---

## 9. Coverage traceability

| Finding(s)                                                  | Guarded by                                                                             |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| H1 ACP/MCP auth                                             | TC-ACP-01/02/03                                                                        |
| H2 IDOR                                                     | TC-AGUI-06, TC-LIB-01, ownership asserts across D/E/F                                  |
| H3 library leak                                             | TC-LIB-01                                                                              |
| H4 admin gating                                             | TC-AUTH-05, TC-PUB-09, TC-BK-08, TC-RES-05                                             |
| H5 publish button                                           | TC-UI-03                                                                               |
| H7 atomicity                                                | TC-PUB-02/03, TC-REG-H7a/b/c                                                           |
| H8 upload validation                                        | TC-BK-07                                                                               |
| H9 indexes                                                  | TC-REG-H9                                                                              |
| H10 storage                                                 | TC-BK-04, TC-GEN-05, TC-PUB-08, TC-LIB-05, TC-ACP-05, TC-REG-H10a/b/c, TC-UI-04        |
| H11 puppeteer                                               | TC-REG-H11a/b/c                                                                        |
| H12 scheduler                                               | TC-PUB-04, TC-REG-H12a/b/c                                                             |
| H13 /api/me                                                 | TC-AUTH-04                                                                             |
| M1 atomic default                                           | TC-BK-02, TC-PROV-06                                                                   |
| M4 soft-delete resolve                                      | TC-RES-04                                                                              |
| M5 artifact sync                                            | TC-BK-06                                                                               |
| M6 ACP validation                                           | TC-ACP-03                                                                              |
| M9 middleware prefix                                        | TC-AUTH-07                                                                             |
| M10 key prefix mask                                         | TC-PROV-04                                                                             |
| M11 bounded lists                                           | TC-RES-06                                                                              |
| M12 brief validation                                        | TC-GEN-03/04                                                                           |
| L1 IG header / system user                                  | TC-ACP-04                                                                              |
| L2 shared helpers                                           | TC-REG-L2                                                                              |
| Known Issue (oversized template)                            | TC-GEN-06                                                                              |
| Change 004 refine fidelity (AC-08 → AC-20b)                 | §U TC-REJ-01…04, §V TC-FID-01…17, T18/T19 in `refine-not-applied.test.ts` (see §V map) |
| Change 005 skipped-background notice (AC-01, AC-08 → AC-11) | §BG TC-BG-01…10, TC-GEN-05 (see §BG map)                                               |

> Items with no behavioral surface (M2 init race, M3 stdin, M7 polling, M8 crypto guards, M13 dead code) are best covered by unit tests; M7 polling can optionally be a UI test (draft auto-refresh while `IN_PROGRESS`).
