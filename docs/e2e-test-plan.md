# bistec-studio — E2E Test Plan

**Created:** 2026-06-23
**Status:** ✅ Full §6 catalog implemented **and green**. **Latest full clean mock gate (change 031 T19, 2026-10-26): 598/3/0/0.** The 025 T12 gate before it was 548/3/0/0. The 006 T6 gate before it was 473/3/0/1 (the one flaky was a Playwright worker-process crash in `regression.test.ts` H7, not an assertion; that suite then re-ran clean 3 of 3) (the 026 gate before it was 444 / 3 / 0 / 0; the 009 gate, 2026-10-21, was 422 passed / 3 skipped / 0 failed / 0 flaky) (the 023 gate before it was 405 / 3 / 0 / 0; the 016 gate was 386 / 3 / 0 / 0). The older counts below are history. **Unit as of 2026-07-27 (PR #40): 322/322.** The CI gate (`.github/workflows/e2e.yml`) passed on PRs #38, #39 and #40. Last full _local_ run with recorded counts (2026-07-22, `feature/team-tenancy` branch, post TC-REG-H7a de-flake): **171 passed, 4 skipped, 0 failed** (175 tests total; 0 flaky — TC-REG-H7a's parallel-fire assertion was rewritten to a timing-robust integrity invariant, see below), unit **264/264** at that time.

Last full run on `main` (2026-07-13, post brief-draft-recovery §P): **132 passed, 0 failed, 7 skipped** (`npm run test:e2e:mock`; the machine lacked `BISTEC_API_KEYS` in `.env.test`, so 3 §J ACP-auth cases skipped on top of the 4 intentional skips below — CI sets the keys as job env and runs them). The 2026-07-13 feature batch added `async-generation.test.ts` (F1 async + retry), a version back/forward-jump case (F2), F4 auto-scheduling cases in `campaign-scheduling.test.ts`, `brandkit-assistant.test.ts` (F5), and `image-to-template.test.ts` (F6); generation-dependent suites now poll via the `waitForDraft` helper (generation is async). A GitHub Actions gate (`.github/workflows/e2e.yml`) runs the whole suite — including the §K security-fix regressions — on every PR and push to `main`, and is **green as of 2026-07-13** (it had been red for weeks on a bad CI `TOKEN_ENCRYPTION_KEY` — it MUST be a valid 64-char hex string, else `crypto.ts` throws and the credential-encrypting routes 500). Runs on GitHub-hosted `ubuntu-latest` with the actions on the Node 24 runtime.

> **Update (2026-10-13, change 017 publish API fixes):** a publish the platform refuses is no longer a 2xx. `POST /api/posts` (immediate) and `POST /api/posts/[id]/publish` (retry) answer **502** `{error, code:'PUBLISH_FAILED', postId, status:'FAILED'}`; the FAILED row is still written. **TC-PUB-03** now expects the 502 (and a failing retry's 502), and new **TC-PUB-10** drives the publish dialog: the failed channel shows "✕ failed" with its reason and the dialog stays open.

> **Update (2026-10-24, change 027 post styles and the facts check):** new suite **`post-styles.test.ts` (§AE, TC-PS-01 to TC-PS-40)**, driven by the mock fact sentinels `__MOCK_FACT_PRICE__`, `__MOCK_FACT_PCT__`, `__MOCK_FACT_DATE__`, `__MOCK_FACT_NUM__`, `__MOCK_FACT_HEADLINE__` and `__MOCK_FACT_ERROR__` and the existing `POST /api/test/generation-tick` (see §AE); §AD gains TC-OBS-31. Gate: 517/3/0/0 (unit 3737/3737, render 47/47, CI green at `c199270` (run 40111923100)).
>
> **Update (2026-10-24, change 006 product observability):** new suite **`analytics.test.ts` (§AD, 30 cases, TC-OBS-01…30)**, driven by the seam `GET`/`DELETE`/`POST /api/test/analytics-events` (see §AD). Gate: 473/3/0/1 (the one flaky was a Playwright worker-process crash in `regression.test.ts` H7, not an assertion; that suite then re-ran clean 3 of 3) (unit 3283/3283, render 47/47, CI green at `851f224` (run 40084041397)).

> **Update (2026-10-21, change 009 hero imagery):** new suite **`hero-image.test.ts` (§AA, 16 cases, TC-HERO-01…16)**, plus one `a11y.test.ts` case (the draft page with the composition notice shown, and `/brief` step 2 with the image-style picker). The Review-step term count in `model-selection.test.ts` and `surfaces.test.ts` went 12 to 13, because a Path B brief now has an Image style row. New seams: the four `__MOCK_HERO_*__` sentinels (see §AA). Gate: 422 passed / 3 skipped / 0 failed / 0 flaky.

> **Update (2026-10-13, change 016 fresh-start cleanup):** the legacy-only cases are removed with the code they tested: **TC-CAP-11, -12, -13 and -19** (§W: lazy migration, the backfill/report scripts, the 012 rollback down.sql, the review notice) and **TC-MODEL-12** (§Y: the 008 rollback round trip), plus the `makeLegacyDraft` helper. **TC-CAP-16** now nulls the headline directly through the test DB instead of using a migrated draft. §W now has 16 cases and §Y 19. A fresh test DB has no migration-created team; `npm run test:e2e:db` seeds Bistec, ClientX and NoKitCo by name. Gate: **386 passed / 3 skipped / 0 failed / 0 flaky**.

> **Update (2026-10-13, change 008 model selection):** new suite **`model-selection.test.ts` (§Y, 20 cases, TC-MODEL-01…20; 19 since 016 removed TC-MODEL-12)**: the model stamps on every generation path, the team policy at `/team` → Models and its allow-list applied to stored values, regenerate like for like, refine and the verifier, the scheduler and ACP on the team default, the assistants, the migration round trip (removed by 016), and the wave-2 pickers (the 400 `MODEL_NOT_ALLOWED` refusals, the wizard, the draft page, the chat headers, the team-token notice). New seam: the `MOCK_AI` model-call recorder, `GET` / `DELETE /api/test/model-calls`. Gates (each a full clean mock run after a dropped and recreated test DB): wave 1 **383 / 3 / 0 / 0**, wave 2 **391 / 3 / 0 / 0**.

> **Update (2026-10-11, change 012 per-channel captions):** new suite **`captions.test.ts` (§W, 20 cases, TC-CAP-01…20; 16 since 016)** — per-channel captions + the headline, the publish resolver (terminal refusals, WhatsApp fails closed), the legacy migration, the backfill/report scripts, the rollback down.sql (those three removed by 016), and the caption-desk panels. New seams: the `__DROP_CAPTION_*__` topic sentinels and the hashed mock `platformId`. Gates (each a full clean mock run after a dropped and recreated test DB): wave 1 **363 passed / 3 skipped / 0 failed / 0 flaky**, waves 2 and 3 **369 / 3 / 0 / 0**. ⚠️ `npm run test:e2e:db` does not drop the test DB; drop it first (`DROP DATABASE IF EXISTS bistec_studio_test WITH (FORCE)`) for a clean gate.

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
  - **`POST /api/test/worker-heartbeat`** — a test-only seam (change 023, §Z) that upserts one loop's `WorkerHeartbeat` row at offsets from now (`{ loop, startedAgoMs, endedAgoMs }`) or deletes every row (`{ clear: true }`). The tick seams call the job runners directly and never go through the worker's `loop()`, so they write no heartbeat, and no worker runs in E2E. **Dormant in prod: hard-404 when `NODE_ENV==='production'` AND 404 unless `MOCK_AI` is set, plus admin-gated.**
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

| Endpoint                                   | Method | Body                                                                  | Success                                                                                                                         | Notes                                                                                                            |
| ------------------------------------------ | ------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `/api/auth/sign-in/email`                  | POST   | `{email,password}`                                                    | 200 + `set-cookie`                                                                                                              | session token                                                                                                    |
| `/api/me`                                  | GET    | —                                                                     | 200 `{ role }`                                                                                                                  | server-side role (H13)                                                                                           |
| `/api/admin/brandkits`                     | POST   | `{name,colors,fonts}`                                                 | 200 kit                                                                                                                         | admin only                                                                                                       |
| `/api/admin/brandkits/[id]/templates`      | POST   | `{name,htmlTemplate}`                                                 | template `{id}`                                                                                                                 | admin                                                                                                            |
| `/api/admin/brandkits/[id]/prompts`        | POST   | `{content}`                                                           | 201 prompt / **409** on version race                                                                                            | H7                                                                                                               |
| `/api/admin/brandkits/[id]/upload`         | POST   | multipart `file`                                                      | `{url,key,name}`                                                                                                                | `url` is **public** (H10)                                                                                        |
| `/api/admin/brandkits/[id]/artifacts`      | POST   | multipart                                                             | 201 artifact                                                                                                                    | `url` public (H10)                                                                                               |
| `/api/campaigns`                           | POST   | `{name,brandKitId?}`                                                  | campaign `{id}`                                                                                                                 | any role                                                                                                         |
| `/api/briefs`                              | POST   | `{topic,goal,tone,channels[],designMode,copyProviderKey,campaignId?}` | **201** brief `{id}`                                                                                                            | validation                                                                                                       |
| `/api/briefs/images`                       | POST   | multipart                                                             | `{url,filename}`                                                                                                                | `url` **public** (H10)                                                                                           |
| `/api/generate/assemble-a`                 | POST   | `{briefId,templateId}`                                                | **200** `{draftId,exportUrl}`                                                                                                   | `exportUrl` signed (H10). NOTE: 200, not 201 (verified in route).                                                |
| `/api/generate/assemble-b`                 | POST   | `{briefId}`                                                           | **200** `{draftId,exportUrl}`                                                                                                   | signed; 200 not 201.                                                                                             |
| `/api/generate/export`                     | POST   | `{draftId}`                                                           | `{exportUrl}`                                                                                                                   | signed; short-circuits if set                                                                                    |
| `/api/drafts/[id]`                         | GET    | —                                                                     | draft detail, `exportUrl` signed                                                                                                | ownership                                                                                                        |
| `/api/drafts/[id]`                         | PATCH  | `{channel,text}` or `{headline}`                                      | updated draft                                                                                                                   | never writes status; `{copyText}` → 400                                                                          |
| `/api/drafts/[id]/refine`                  | POST   | `{instruction}` or `{overrideConflictId,instruction}`                 | **202** `{ok:true}` (async — poll draft GET; conflict via `conflict` field) or sync `{reply,revisionId,exportUrl}` for Override | 409 while a `pendingAction` is in flight (§Q)                                                                    |
| `/api/drafts/[id]/revisions`               | GET    | —                                                                     | array, `exportUrl` signed                                                                                                       |                                                                                                                  |
| `/api/drafts/[id]/revisions/[rev]/restore` | POST   | —                                                                     | `{exportUrl}` signed                                                                                                            |                                                                                                                  |
| `/api/posts`                               | POST   | `{draftId,channel,scheduledAt?}`                                      | **201** `{postId,status}` / **502** `{error,code:'PUBLISH_FAILED',postId,status:'FAILED'}` (017)                                | **singular `channel`**; 201 = PUBLISHED / SCHEDULED; a refused immediate publish is 502, the FAILED row persists |
| `/api/posts`                               | GET    | `?page&pageSize&status?`                                              | `{posts,total,page,pageSize}`                                                                                                   | admin=all, editor=own; `draft.exportUrl` signed                                                                  |
| `/api/posts/[id]`                          | GET    | —                                                                     | post, `draft.exportUrl` signed                                                                                                  | ownership                                                                                                        |
| `/api/posts/[id]`                          | DELETE | —                                                                     | `{postId,status:CANCELLED}` / **409** if not SCHEDULED                                                                          | admin                                                                                                            |
| `/api/posts/[id]/publish`                  | POST   | —                                                                     | 200 `{postId,status}` / 502 PUBLISH_FAILED (same shape) / 409 if not FAILED                                                     | admin retry                                                                                                      |
| `/api/library`                             | GET    | `?page&pageSize&status&search`                                        | `{drafts,total,...}`                                                                                                            | non-admin filtered to own; `exportUrl` signed                                                                    |
| `/api/admin/providers`                     | POST   | `{apiKey,slot,providerName?,label?}`                                  | 201 / 422 / 400                                                                                                                 | prefix auto-detect                                                                                               |
| `/api/providers/available`                 | GET    | `?slot=COPY\|IMAGE`                                                   | array (no secret fields)                                                                                                        |                                                                                                                  |
| `/api/acp/manifest`, `/api/acp/run`        | *      | —                                                                     | **401 without valid key**                                                                                                       | H1                                                                                                               |

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
- **TC-PUB-03 — Publish failure → 502, FAILED, never PENDING.** P: a `__FAIL_ALWAYS__` topic (or `MOCK_SOCIAL_FAIL=true`). S: immediate publish. E: **502** `{error,code:'PUBLISH_FAILED',postId,status:'FAILED'}` (017 FR-01; it was 201 before 017); the row is FAILED with `errorReason` = `error`; terminal, no PENDING orphan. Then a retry (`…/publish`) fails again → **502** in the same shape, still FAILED (017 FR-02). **Guards H7; 017 AC-01, AC-02.**
- **TC-PUB-04 — Retry FAILED.** P: a FAILED post, mock now succeeds. S: POST `…/publish`. E: 200 `PUBLISHED`, `retryCount`/`nextRetryAt` reset. **Guards H12.**
- **TC-PUB-05 — Retry on non-FAILED → 409.** S: `…/publish` on a PUBLISHED post. E: 409.
- **TC-PUB-06 — Cancel scheduled.** S: DELETE a SCHEDULED post. E: `CANCELLED`. DELETE a PUBLISHED post → 409.
- **TC-PUB-07 — Publish requires exportUrl.** P: draft without export. E: 422.
- **TC-PUB-08 — Publisher receives a signed, fetchable URL.** Assert (via mock spy) the URL handed to `publish()` is an `https` signed export URL, not a bare object key. **Guards H10.**
- **TC-PUB-09 — Publish is admin-only.** P: editor. E: 403. **Guards H4.**
- **TC-PUB-10 — The publish dialog shows a refusal (017 AC-03).** P: a `__FAIL_ALWAYS__` draft whose LinkedIn caption is PATCHed clean. S: on the draft page, Publish → check Instagram and LinkedIn → Confirm. E: the Instagram POST is 502; Instagram shows "✕ failed" with "Mock Instagram publish failure" (also its checkbox's accessible description) and stays enabled; LinkedIn shows "✓ published" and is locked; the dialog stays open with the "Instagram failed — …" summary.

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

### W. Per-channel captions (`captions.test.ts`, change 012 T10 + T13 — AC-12 → AC-24)

Every draft carries an on-image **headline** and one **`DraftCaption` row per channel** (Instagram and LinkedIn since 026; WhatsApp until 2026-10-23), each `PENDING` / `READY` / `FAILED`. **026 (2026-10-23):** WhatsApp left the caption registry, so new drafts carry two captions and an old WhatsApp row is hidden, not deleted; TC-CAP-21 and TC-CAP-22 are new and the cases below were retargeted to two channels (`.specclaw/changes/026-drop-whatsapp-caption-refine-under-preview/reports/T2.md`). `GET /api/drafts/[id]` returns `headline` and `captions[]` and has **no `copyText` key**. Every publish path resolves the matching channel's caption first and refuses a failed, pending, empty, over-limit or WhatsApp one **terminally**. **Removed by 016 (2026-10-13):** the legacy single-caption migration (boot backfill, lazy read, `captionMigration`, `legacyCaptionText`) and the 012 rollback are gone, and so are the cases that tested them (TC-CAP-11, -12, -13, -19).

Each case uses a unique topic, `waitForDraft` / `waitForAction` from `tests/helpers/api.ts`, and one kit + one campaign per worker (keeps the campaign count under the 200-row listing cap). Needs `MOCK_AI` + `MOCK_PUPPETEER` + `MOCK_SOCIAL` and test-DB access. The scheduler cases drive `POST /api/test/scheduler-tick`.

**New seams (all dormant in production):**

- **`buildMockCaptionReply(topic, targets)`** (`src/lib/testHooks.ts`, returned by the `MOCK_AI` `CopyProvider`): a raw reply with a preamble, a `json`-fenced object holding only the requested keys, and a trailer, so **the real extractor parses it**. Captions are `Mock <Label> caption [<topic>]` (WhatsApp was removed by 026); the headline is `Mock headline <topic>`.
- **`__DROP_CAPTION_INSTAGRAM__` / `__DROP_CAPTION_LINKEDIN__` / `__DROP_CAPTION_HEADLINE__`** (the WhatsApp sentinel was removed by 026) in the brief topic omit that key, **only in a reply that requests every channel**. So a generation yields a `FAILED` row (or, for the headline, a `FAILED` draft), and a single-channel regenerate of that channel then succeeds, with no stored state.
- **The hashed mock `platformId`:** `mockPlatformId(channel, caption)` = `mock-<channel>-<Date.now()>-<sha256(caption)[0:12]>`, used by the mock publishers, so a case can prove which text a channel received.
- **Removed by 016:** `makeLegacyDraft` (`tests/helpers/db.ts`), the `captions:backfill` / `captions:report` script runs and the rollback scratch DB, with TC-CAP-11/12/13/19. The two bullets below are kept as history.
- ~~**The scripts:**~~ (historical) TC-CAP-12 ran `npm run captions:backfill` / `captions:report` through `spawnSync` with `.env.test` **overriding** the runner env (`dotenv -o` semantics; the runner already has `MOCK_AI` and the dev `.env`'s `DESIGN_PROVIDER=cli`). `testDbUrl()` throws unless the DB name ends in `_test`.
- ~~**The rollback check**~~ (historical) (TC-CAP-13) built a scratch DB `bistec_studio_test_012_rollback` with `prisma migrate deploy` (a `TEMPLATE` copy is refused while the test server holds the source), seeds it through Prisma, applies the real file with `prisma db execute --file prisma/rollback/012-per-channel-captions.down.sql`, and drops it `WITH (FORCE)` in `finally`. It needs only Prisma, so it also runs in CI.

**Wave 1 (T10):**

- **TC-CAP-01 — A generated draft (AC-12).** EXPORTED; `headline` = `Mock headline <topic>`; two READY captions in registry order (Instagram, LinkedIn), each with the topic and no `**`; no `copyText` key (026: no WhatsApp caption).
- **TC-CAP-02 — Partial failure and a single-channel retry (AC-13, AC-16 a).** `__DROP_CAPTION_LINKEDIN__`: EXPORTED, LI `FAILED` (`missing`, empty text), IG READY. `POST /api/posts {LINKEDIN}` → 422 `CAPTION_UNPUBLISHABLE`, the reason names LinkedIn, no Post row. `regenerate-copy {channel:'LINKEDIN'}` → 202 → LI READY; IG `text` and `updatedAt` unchanged; headline and revision pointer unchanged.
- **TC-CAP-03 — A missing headline fails the draft (AC-14).** `__DROP_CAPTION_HEADLINE__`: draft FAILED, `failureReason` mentions the headline, `headline` null, the two captions READY.
- **TC-CAP-04 — Each channel gets only its own caption (AC-15).** Publish LINKEDIN then INSTAGRAM immediately: each `platformId` suffix equals `sha256(own caption)[0:12]` and differs from the other's; each post's `draft.caption` is its own text.
- **TC-CAP-05 — The scheduler refuses an emptied caption, terminally (AC-16 b).** Schedule IG on a READY caption, PATCH IG to `''`, make it due through the test DB, tick → FAILED, `errorReason` contains "caption is empty", `retryCount` 0, `nextRetryAt` null; a second tick leaves the row byte-identical.
- **TC-CAP-06 — WhatsApp fails closed (AC-17).** `POST /api/posts {WHATSAPP}` → 400, no row; the draft's captions are Instagram and LinkedIn only (no READY WhatsApp caption). A due SCHEDULED WHATSAPP Post inserted through the test DB → tick → FAILED "WhatsApp publishing isn't available." (026 wording), `retryCount` 0, `nextRetryAt` null, unchanged by a second tick.
- **TC-CAP-07 — WhatsApp is not an input (AC-18, API).** `POST /api/briefs {channels:['WHATSAPP']}` → 400; a queue create with WHATSAPP → 400.
- **TC-CAP-08 — WhatsApp is in no picker (AC-18, UI).** The draft page's Publish dialog and the campaign's Plan a post modal (`QueueEntryModal`) each show exactly two "Channels" checkboxes, Instagram and LinkedIn. **010 changes this to 3.**
- **TC-CAP-09 — Single-flight (AC-20).** With `pendingAction = REGENERATE_COPY` and the LI row PENDING seeded through the test DB: `regenerate-copy {channel:'INSTAGRAM'}` (WHATSAPP is now a 400, TC-CAP-21), `{headline:true}`, `regenerate-design` and restore each 409 "Another action is already running on this draft"; a PATCH on the PENDING LI row 409s "This caption is being generated", while a PATCH on READY IG is 200.
- **TC-CAP-10 — Restore never touches captions (AC-22).** Refine → revision 2, PATCH LI, restore revision 1: `captions` (every field, `updatedAt` included) and `headline` equal their pre-restore values.
- ~~**TC-CAP-11 — Lazy migration on first read**~~, ~~**TC-CAP-12 — The backfill and report scripts**~~, ~~**TC-CAP-13 — The rollback down.sql**~~ **(AC-23): removed by 016 (2026-10-13)** with the legacy caption machinery and the 012 rollback.
- **TC-CAP-14 — ACP outputs (AC-26, AC-17 ACP).** ACP `generate_post` output has `headline` and `captions` (2: INSTAGRAM, LINKEDIN, registry order, READY). ACP `publish_post {channel:'WHATSAPP'}` → 400 (`channel must be INSTAGRAM or LINKEDIN`), no Post row.
- **AC-19** is the rewritten **TC-ASYNC-10** in `async-actions.test.ts` (§Q): PATCH `{channel:'INSTAGRAM', text}` then `text:''` keep the draft EXPORTED, in the library, regenerable and refinable, and the empty IG panel is an editable textarea with no skeleton.

**Wave 2 (T13), the panels:**

- **TC-CAP-15 — Regenerate all (AC-21 a).** A hand-set headline first; `regenerate-copy {}` → 202 → two READY captions with a strictly later `updatedAt`; the hand-set headline and `currentRevisionNumber` unchanged; `pendingActionError` null.
- **TC-CAP-16 — Regenerate the headline only (AC-21 b).** A generated draft whose headline is nulled directly through the test DB (`prisma.draft.update`, since 016); `{headline:true}` → 202 → `headline` = `Mock headline <topic>`; `captions` deep-equal the read before the regenerate; revision pointer unchanged.
- **TC-CAP-17 — The caption desk structure and counters (AC-24 a–d).** Under the "Captions" h2 the h3s are exactly Headline, Instagram, LinkedIn, and one textbox is named "Headline". Each caption textarea is named by its h3 and holds the GET text. Counters `n / 2,200 (Instagram)` and `n / 3,000 (LinkedIn)`; no WhatsApp text appears (026 removed the soft-guide counter). 2,201 Instagram characters show "Over the Instagram limit" and still save. Then the axe scan.
- **TC-CAP-18 — Copy and per-panel Undo (AC-24 e, f).** Clipboard permission granted on the context. "Copy Instagram caption" → toast "Caption copied", clipboard = IG text. LinkedIn hand-edited, then "Regenerate LinkedIn caption" → "Undo LinkedIn caption" appears (no other Undo); Undo restores the hand-written text in the field and the GET; IG and the headline untouched.
- **TC-CAP-21 — A legacy WhatsApp row stays hidden and unchanged (026 AC-05).** A READY WhatsApp `DraftCaption` row with text is inserted through Prisma. `GET /api/drafts/[id]` lists two captions (no WhatsApp), the page shows no WhatsApp panel or text, and `PATCH` and `regenerate-copy` with `{channel:'WHATSAPP'}` are each 400. The row's text, status and `updatedAt` are unchanged in the DB. MCP `get_draft` is covered by the unit test `mcpGetDraft`.
- **TC-CAP-22 — The draft-page layout (026 AC-09).** At 1440 px the Refine Design card sits at or below the Preview card's bottom with the same left edge (±1 px), and Captions is in the right column. At 390 px the order is Preview, Refine Design, Captions (bounding boxes and `compareDocumentPosition`). Axe runs at both widths.
- ~~**TC-CAP-19 — The review notice (AC-24 g).**~~ **Removed by 016 (2026-10-13)** with the notice and `makeLegacyDraft`.
- **TC-CAP-20 — A FAILED row (AC-24 h).** `__DROP_CAPTION_LINKEDIN__`: the error notice "The LinkedIn caption failed to generate (<reason>)." starts the LI description; the field is empty and editable; the button is "Generate" (named "Generate LinkedIn caption"). Axe scan. Generate fills LI with `Mock LinkedIn caption [<topic>]` and the notice goes.

TC-CAP-17 and -20 (and TC-CAP-19 until 016) run 014's 12 AC-19 axe rules over the caption states 014's own draft-page scan never sees (0 violations). The rule list is copied from `a11y.test.ts` (importing a spec file would register its tests twice); a shared helper is a follow-up.

**Existing cases edited by 012** (reasons in `.specclaw/changes/012-per-channel-captions/reports/T10.md` and `T14.md`): `async-actions` TC-ASYNC-02, -06, -09, -10; `team-isolation` cross-team draft PATCH body; `surfaces` T9 at 375 px (placeholder, "Regenerate all") and "Brief & Caption Direction"; `a11y` rows 26/27 and the three "Brief & Caption Direction" headings.

**AC → case map (change 012).** The unit side is AC-01 → AC-11 (`channels`, `captionExtract`, `captionHeadline`, `captionResolve`, `jobRunner`, `draftRecovery`, `captionWording`, `mcpGetDraft`, `testHooks`; `captionMigrationPlan`, `captionBackfill` and `legacyCaptionGuard` were deleted by 016).

| AC                                                         | E2E                             |
| ---------------------------------------------------------- | ------------------------------- |
| AC-12 generated draft: headline + 2 READY (026), no `**`   | TC-CAP-01                       |
| AC-13 partial failure, single-channel retry                | TC-CAP-02                       |
| AC-14 missing headline fails the draft                     | TC-CAP-03                       |
| AC-15 each channel publishes its own caption               | TC-CAP-04                       |
| AC-16 publishing refuses a failed / emptied caption        | TC-CAP-02, TC-CAP-05            |
| AC-17 WhatsApp fails closed (API, scheduler, ACP)          | TC-CAP-06, TC-CAP-14            |
| AC-18 WhatsApp in no input or picker                       | TC-CAP-07, TC-CAP-08            |
| AC-19 the TC-ASYNC-10 contract on captions                 | TC-ASYNC-10 (§Q)                |
| AC-20 single-flight 409s                                   | TC-CAP-09                       |
| AC-21 Regenerate all; headline-only regenerate             | TC-CAP-15, TC-CAP-16            |
| AC-22 restore never touches captions                       | TC-CAP-10                       |
| AC-23 migration, backfill, report, rollback                | removed by 016 (no case)        |
| AC-24 the panels: structure, counters, copy, undo, notices | TC-CAP-17, TC-CAP-18, TC-CAP-20 |

---

### Y. Model selection (`model-selection.test.ts`, change 008 T12 — wave 1, AC-15 → AC-23)

Every model call resolves through one resolver (request > stamp > team default > system default > fallback), and each tier is checked against the team's effective set **at call time**. What ran is recorded in two places:

- **the stamps**, on the row each call wrote: `captions[].model`, `headlineModel`, and `designModel` (which mirrors the current revision's `DraftRevision.model`), each with a `…SubstitutedFrom`;
- **the recorder**, which is test-only.

The mock E2E runs **API mode**, so every stamp and every recorded `arg` is the full apiId (`claude-haiku-4-5`, `claude-sonnet-5-5`, `claude-opus-5-5`). The CLI boundary is proven by the unit test AC-12 alone, because CLI mode never runs under `MOCK_AI`.

Each case uses a unique topic and `waitForDraft` / `waitForAction`, with one kit (holding a square template) and one campaign per worker. The suite needs `MOCK_AI` + `MOCK_PUPPETEER` and test-DB access. **Every case deletes the team's `TeamModelPolicy` row before and after** (`beforeEach` / `afterEach`). That is the exact "never saved" state, so no later suite inherits a changed team.

**Seams (all dormant in production):**

- **`GET` / `DELETE /api/test/model-calls`** (008 FR-16): the recorder's ring buffer.
  - It holds 200 records on `globalThis`, shared across `next dev` route modules, newest last.
  - It is gated like `/api/test/scheduler-tick`: 404 in production, 404 unless `MOCK_AI`, and admin-only.
  - Each record is `{ surface, key, arg, mode, source, substitutedFrom, label, route }`. `route` (024 FR-07) is `CLI`, `API_KEY`, `SERVER_KEY` or `OTHER` on a caption (`label` `copy`) record, from the selector's decision, and `null` on every other record. Read a caption's route by filtering on `label === 'copy'`. Every `MOCK_AI` branch on a model surface records the `ResolvedModel` it was handed before returning its mock. The upgrade route (007) records under the label `kit-upgrade` (surface `ASSISTANT_BRANDKIT`); read it by filtering on that label.
  - Each case `DELETE`s before the action it asserts on.
- **Stamps are seeded through the test DB** (`prisma.draft.update` / `draftCaption.update`), as §W does.
- **The verifier is reached with an _add_ instruction** ("Include a human character"). A bare mock document defaults to the add class, whose post-condition is the verifier (004 TC-FID-09).
- ~~**The rollback check (TC-MODEL-12)**~~ **Removed by 016 (2026-10-13)** with `prisma/rollback/008-model-selection.down.sql`. (Historical:) it built a scratch DB, `bistec_studio_test_008_rollback`, with `prisma migrate deploy`, as TC-CAP-13 does. A `TEMPLATE` copy is refused while the test server holds the source. The literal `TEMPLATE` run of AC-23 is a scripted step with the server stopped, recorded in `.specclaw/changes/008-model-selection/reports/T12.md`.

**Cases:**

- **TC-MODEL-01 — Path B on system defaults (AC-15).**
  - The draft is EXPORTED. The two `captions[].model` (three before 026) and `headlineModel` are Haiku, `designModel` is Sonnet, and every `…SubstitutedFrom` is null.
  - Revision 1's `model` is Sonnet, in the DB and in the revisions list.
  - Recorder: `CAPTION` → Haiku and `DESIGN_FREEFORM` → Sonnet, both `system`, mode `api`.
- **TC-MODEL-02 — Path A (AC-15).** `designModel` and revision 1 are Haiku. The recorder has `DESIGN_TEMPLATE` → Haiku (`system`) and no `DESIGN_FREEFORM` record.
- **TC-MODEL-03 — A team default reaches generation (AC-16 a).**
  - PUT `defaults.DESIGN_FREEFORM = 'OPUS'` → 200, with `saved: true` and unset surfaces `null`.
  - The next generation's `designModel` and revision 1 are Opus.
  - Recorder: `DESIGN_FREEFORM` → Opus (`team`); `CAPTION` stays Haiku (`system`).
- **TC-MODEL-04 — Validation, permissions and the picker view (AC-16 b–d, FR-13, FR-16).**
  - `allowed: ['OPUS']` → 400 "Template fill needs Haiku or Sonnet allowed".
  - A default outside `allowed` → 400. A lowercase key and an unknown field (`teamId`) → 400. Nothing is saved.
  - **As the editor:**
    - PUT and GET `/api/team/model-policy` → 403;
    - `GET /api/models` → 200, with `mode: 'api'`, `credential: 'n/a'`, tiers `$` / `$$` / `$$$`, and Opus without `DESIGN_TEMPLATE`. No `claude-` string and no price appears anywhere in the JSON;
    - the recorder seam → 403.
- **TC-MODEL-05 — Team isolation (AC-16 e).**
  - ClientX's admin saves `DESIGN_FREEFORM: OPUS` and `CAPTION: SONNET`.
  - Bistec's policy stays unsaved. A Bistec generation designs on Sonnet and captions on Haiku, both `system`.
  - ClientX's row is deleted in `finally`.
- **TC-MODEL-06 — A removal applies to stored stamps (AC-17, security BLOCK).**
  - **Setup:** a draft seeded with `designModel` = Opus and LinkedIn `model` = Opus, then PUT `allowed: ['HAIKU','SONNET']`.
  - `regenerate-design` → revision 2 and the draft are Sonnet, with `…SubstitutedFrom` = Opus.
  - `regenerate-copy {channel:'LINKEDIN'}` → LinkedIn is Haiku, with `modelSubstitutedFrom` = Opus. The IG row deep-equals its seeded read (026: WA is no longer a row).
  - **Recorder:** no Opus record after the PUT. The two records are `[Sonnet, system, Opus]` and `[Haiku, system, Opus]`.
  - **Mutation-checked:** letting the stamp tier skip the effective set makes this case fail (Opus received).
- **TC-MODEL-07 — Regenerate all is like for like (AC-18).**
  - **(a)** Stamps `[S,S]` (026: two rows), then `{}` → two Sonnet rows; recorder `stamp`.
  - **(b)** Mixed stamps `[S,O]` with a team `CAPTION: HAIKU` → two Haiku rows; `team`; `modelSubstitutedFrom` null.
  - **(c)** Null stamps and no team default → two Haiku rows; `system`.
  - The headline and `headlineModel` are never touched.
- **TC-MODEL-08 — Refine and the verifier (AC-19).**
  - A Path B refine ("Include a human character") → revision 2 and `designModel` are Sonnet. Recorder: `REFINE` → Sonnet (`system`) and `INTERNAL_VERIFIER` → Haiku (label `verify`).
  - A Path A refine → revision 2 is Haiku.
  - A team `REFINE: OPUS` → revision 3 is Opus (`team`); the verifier is still Haiku.
  - Restoring revision 1 → `designModel` is Sonnet again.
- **TC-MODEL-09 — Non-interactive callers (AC-20).** The team sets `DESIGN_FREEFORM: OPUS`.
  - **The scheduler:** a HOLD queue entry is made due through the test DB, then `POST /api/test/generation-tick`. The entry is COMPLETED with `errorReason` null. Its draft and revision 1 are Opus; recorder `team`.
  - **ACP `generate_post`,** on a minted team key. The input also carries an ignored `model: 'HAIKU'`. Result: `designModel` is Opus and the captions are Haiku. The key is revoked in `finally`.
- **TC-MODEL-10 — The assistants and the stamp-less surfaces (AC-21).**
  - The surfaces:
    - `ASSISTANT_BRIEFING` (label `briefing`): the campaign briefing chat, campaign Enhance and post-brief Enhance;
    - `ASSISTANT_BRANDKIT`: the brand-kit chat (`brandkit`), image → template (`image-template`), and both voice drafts, generate and improve (`brand-voice`).
  - Each returns 200 and records **exactly one** call: Sonnet (`system`). After a team default of Haiku on both assistant surfaces, each records Haiku (`team`).
- **TC-MODEL-11 — `/team` → Models (AC-22).** Every query is scoped to `region "Models"`.
  - **Structure:**
    - the h2;
    - "Allowed models" holds 3 checkboxes named `Haiku 4.5 · $ · fast`, `Sonnet 5.5 · $$ · medium` and `Opus 5.5 · $$$ · slow`;
    - "Defaults" holds 6 named comboboxes. Each one's first option is `System default (<name>)`, and Template fill never lists Opus;
    - the switch "Opus requires a personal token" is **disabled** (API mode), and is described by the helper text plus "Only applies in CLI mode.".
  - Axe (014's 12 rules).
  - **Untick Opus + Save** → "Models saved". The GET `allowed` is `['HAIKU','SONNET']` with `newModels: ['OPUS']`, and there is one "New" chip.
  - **Only Opus ticked** → Template fill reads "System default (none allowed)". Save → `role="alert"` "Template fill needs Haiku or Sonnet allowed", and nothing is saved.
  - Axe again, with the error showing.
- ~~**TC-MODEL-12 — The migration round trip (AC-23).**~~ **Removed by 016 (2026-10-13)** with the 008 down script. There is no rollback to before 008 on a fresh system.
- **AC-22's axe half on the full page** is also covered by 014's `a11y.test.ts` "AC-19: /team with the register form open", which now waits for the Models section's Save button before scanning.

**Existing cases edited by 008** (reasons in `.specclaw/changes/008-model-selection/reports/T12.md`):

- `a11y` "AC-19: /team with the register form open" waits for the Models section before its scan;
- `surfaces` "/team at 375px" scopes the social-channel Save count to its section (the Models section adds a third Save) and lists the Models h2.

**AC → case map (change 008, wave 1).** The unit side is AC-01 → AC-13: `modelCatalogue`, `modelResolve`, `envModel`, `modelPolicy`, `regenerateStamp`, `captionStore` / `renderStamps` / `draftActions`, `usageLimit`, `actionBudget`, the heartbeat cases, `modelLiteralGuard`, `modelBoundary` and `anthropicCall`. AC-14 is the operator's T2.

| AC                                                     | E2E                                                     |
| ------------------------------------------------------ | ------------------------------------------------------- |
| AC-15 generation stamps on system defaults             | TC-MODEL-01, TC-MODEL-02                                |
| AC-16 the team policy                                  | TC-MODEL-03, TC-MODEL-04, TC-MODEL-05                   |
| AC-17 a removal applies to stored values               | TC-MODEL-06                                             |
| AC-18 regenerate is like for like                      | TC-MODEL-07                                             |
| AC-19 refine and the verifier                          | TC-MODEL-08                                             |
| AC-20 non-interactive callers use the team default     | TC-MODEL-09                                             |
| AC-21 the assistants and the stamp-less surfaces       | TC-MODEL-10                                             |
| AC-22 `/team` → Models                                 | TC-MODEL-11, `a11y` "AC-19: /team …"                    |
| AC-23 the migration and rollback                       | removed by 016 (was TC-MODEL-12 + the T12 TEMPLATE run) |
| AC-24 wave 1's full clean mock E2E, 0 failed / 0 flaky | the wave-1 gate                                         |

#### Y, wave 2: the pickers (change 008 T18 — AC-27 → AC-31, AC-33)

A picker pre-selects exactly what the server would run (`decideModel` with no request), and sends `model` **only once the user picks something else** (A5). The wave-2 cases are in the `describe` block "§Y — the pickers (wave 2)". It resets the team policy before and after each case, as wave 1 does, and discards any unfinished brief a wizard walk autosaved.

**What the cases read:**

- **the request bodies the UI sends** (`page.waitForRequest`), for A5;
- **the stamps and the recorder,** for what ran (a pick runs with `source: 'request'`);
- **each picker's hint line** (`#<id>-hint`) and **refusal** (`#<id>-error`, with `aria-invalid` on the select). The ids are `brief-caption-model`, `brief-design-model`, `draft-caption-model-<channel>`, `draft-headline-model`, `draft-all-captions-model`, `draft-design-model`, `draft-refine-model`, `briefing-assistant-model` and `brandkit-assistant-model`.

Picker names are matched with `exact: true`, because "Instagram caption model" contains "caption model".

**Seams:**

- **AC-31's CLI state is faked client-side.** CLI mode never runs under `MOCK_AI`. So `page.route` answers `/api/me` and `/api/models` from their real responses, with `cliMode: true` and `mode: 'cli'`, `credential: 'team'`, `gateOn`. The server stays in API mock mode.
- **A refused pick in the UI (TC-MODEL-18)** uses the same rewrite: the real policy drops Opus, while the faked `/api/models` still offers it, so the server's 400 is what the page meets.

**Cases:**

- **TC-MODEL-13 — An explicit disallowed request (AC-27).** With `allowed: ['HAIKU','SONNET']`, `model: 'OPUS'` is a 400 `{ code: 'MODEL_NOT_ALLOWED', error: "Opus 5.5 isn't allowed on this team" }` on every route:
  - `POST /api/briefs` (`designModel`, with `field: 'designModel'`, and no Brief row written);
  - the three `regenerate-copy` forms, `regenerate-design` and `refine`, with `pendingAction` null after each;
  - the briefing chat and the brand-kit chat.

  The recorder is empty, and the draft's revision, captions, headline and stamps are unchanged. With every model allowed, `designModel: 'OPUS'` on a TEMPLATE brief → 400 "Opus 5.5 isn't available for template fill", and no row is written.

- **TC-MODEL-14 — The wizard (AC-28, and AC-33's Review-step axe scan).** It walks Path B to Review. Since 018 FR-07 (008 verify gap 4) it also changes the Caption picker, and its title ends "…a resume restores both picks, and they reach the brief".
  - "Caption model" is Haiku and "Design model" is Sonnet, each with the hint "Default". The summary has 12 rows, and names both models. Axe (014's 12 rules, through the shared `tests/helpers/axe.ts`) runs with the pickers present.
  - Picking **Sonnet for Caption** updates the summary ("Sonnet 5.5") and clears that picker's "Default" hint. Picking Opus for Design updates the summary too, and the autosave payload carries `captionModel: 'SONNET'` and `designModel: 'OPUS'`.
  - Switching to Path A resets the design picker to Haiku, with the hint "Opus 5.5 isn't available for template fill". Opus is not offered, and the summary says Haiku. The caption pick stays `SONNET`. Back on Path B, the design pick stays reset and the note is gone.
  - After Opus is picked again, the second autosave still carries `captionModel: 'SONNET'`, and `/brief?resume=<id>` restores both picks (the caption picker is `SONNET`, summary "Sonnet 5.5").
  - Generate sends `captionModel: 'SONNET'` and `designModel: 'OPUS'`. `Brief` stores `{ captionModel: 'SONNET', designModel: 'OPUS' }`. The draft's `designModel` is Opus (recorder `DESIGN_FREEFORM` `request`), every caption is stamped `claude-sonnet-5-5`, and the recorder has a `CAPTION` → Sonnet `request` run. The unfinished brief is deleted.
- **TC-MODEL-15 — Untouched wizard pickers (AC-28).** The POST body has neither field. `Brief` stores null for both, and the draft runs on the defaults (Sonnet design, Haiku captions, both `system`).
- **TC-MODEL-16 — The draft page (AC-29, and AC-33's draft-page axe scan).** The LinkedIn row is seeded with a Sonnet stamp.
  - **The pre-selections and hints:** LinkedIn Sonnet, Instagram Haiku ("Same model as the current caption"; 026: no WhatsApp picker); Headline Haiku ("…headline"); "All captions model" Haiku ("Default", mixed stamps); Design Sonnet ("…design"); Refine Sonnet ("Default").
  - **"Generated with":** one per caption panel and the headline panel, by its stamp, plus the design line. The Versions cell carries the sentence in its `title`. Axe runs with the pickers present.
  - **LinkedIn → Opus, then Regenerate:** the body is `{ channel: 'LINKEDIN', model: 'OPUS' }`. Only LinkedIn's row changes; Instagram deep-equals its seeded read.
  - **Headline → Sonnet:** `{ headline: true, model: 'SONNET' }` → `headlineModel` is Sonnet, and no caption row changes.
  - **Refine → Haiku:** `{ instruction, model: 'HAIKU' }` → revision 2 and `designModel` are Haiku.
  - **The design picker** now pre-selects Haiku from the new stamp. Opus → `{ model: 'OPUS' }` → revision 3 is Opus.
- **TC-MODEL-17 — Substitution and the hide rules (AC-29, reviews/T16.md).** The draft is seeded with design Opus, LinkedIn Haiku substituted from Opus, and a FAILED Instagram row (026: was WhatsApp), then `allowed: ['HAIKU','SONNET']`.
  - The design picker reads Sonnet, with the hint "Opus 5.5 is no longer available on this team — using Sonnet 5.5", and offers no Opus.
  - LinkedIn's line reads "Generated with Haiku 4.5 (substituted)", titled "Substituted for Opus 5.5".
  - The FAILED row shows its failure and no "Generated with".
  - A FAILED design (seeded) shows no design line and no design picker, while the caption and headline lines stay.
- **TC-MODEL-18 — A refused pick in the UI (FR-17, reviews/T16.md).** Each picker shows "Opus 5.5 isn't allowed on this team" as its field error.
  - **Refine** takes the request out of the log and puts the instruction back in the field.
  - **The design regenerate and the LinkedIn regenerate** leave no Undo behind.
  - Nothing is claimed, written or recorded. A new pick clears the error.
- **TC-MODEL-19 — The assistant headers (AC-30, FR-21).** The team has no `ASSISTANT_BRIEFING` default, so Haiku is a real change from the pre-selection.
  - **The briefing chat:** pick Haiku. Two turns each send `model: 'HAIKU'` and record `ASSISTANT_BRIEFING` → Haiku (`request`).
  - **A reload** pre-selects Sonnet again; the body's keys are `['messages']`, and the turn records Sonnet (`system`).
  - **The brand-kit chat:** pick Haiku → the turn records `ASSISTANT_BRANDKIT` → Haiku (`request`).
- **TC-MODEL-20 — The team-token notice and the gated state (AC-31, FR-22).** The CLI state is faked as above.
  - Picking Opus in the refine box shows the `role="status"` notice inside the refine section. Picking Sonnet removes it.
  - With `gateOn: true`, the refine and design pickers offer Haiku and Sonnet only, and the refine hint says "Opus requires a personal Claude token on this team — connect one in Settings".

**Existing cases edited by 008 wave 2** (reasons in `.specclaw/changes/008-model-selection/reports/T18.md`):

- `surfaces` "every step at 375px…": the Review step has 12 terms, not 10, once its two model rows load, and both pickers are visible;
- `surfaces` "Draft review (T9) … at 375px every control is there…", "a campaign detail at 375px, with … the assistant" and "at 375px a kit keeps its controls, with … the assistant…": each waits for its pickers, so the no-scroll checks cover them;
- `a11y` "AC-19: /drafts/[id]" waits for the pickers before its scan.

**AC → case map (change 008, wave 2).** The unit side is AC-25 (`modelRequests`, `captionRequests`, `briefDraftPayload`) and AC-26 (`modelPicker`, `uiPrimitives`).

| AC                                                              | E2E                                                                     |
| --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| AC-27 an explicit disallowed request → 400, claims nothing      | TC-MODEL-13 (API), TC-MODEL-18 (the UI)                                 |
| AC-28 the wizard                                                | TC-MODEL-14, TC-MODEL-15                                                |
| AC-29 the draft page pickers                                    | TC-MODEL-16, TC-MODEL-17                                                |
| AC-30 the chat headers                                          | TC-MODEL-19                                                             |
| AC-31 the team-token notice and the gated state                 | TC-MODEL-20                                                             |
| AC-33 the wave-2 gate; the Review-step and draft-page axe scans | the wave-2 gate; TC-MODEL-14, TC-MODEL-16, `a11y` "AC-19: /drafts/[id]" |

### X. Draft-page settle race (`settle-race.test.ts`, change 015 AC-01/AC-02, change 018 AC-05/AC-06)

Each case mints an EXPORTED draft (`mintExportedDraft`) and acts on it in the browser. The race is forced with `page.route`: the first `GET /api/drafts/<id>` after the action POST is held for 3 s, so the in-process mock action always finishes before the post-202 refetch is served. That is the order the slower CI runner produces on its own. Every case skips without `MOCK_AI` + `MOCK_PUPPETEER`.

- **TC-RACE-01 — Refine (015 AC-01).** A refine that finishes before the held refetch still resolves its log row to "Applied", re-enables the input, offers "Switch to v1" and lists `v2` as Current. The hold happened.
- **TC-RACE-02 — Regenerate design (015 AC-02).** The same race on Regenerate design still lists `v2` as Current, offers "Switch to v1" and re-enables the button.
- **TC-RACE-03 — The caption Undo settles on state (018 AC-05, FR-05).** The mock caption reply is deterministic (`Mock Instagram caption [<topic>]`), so regenerating the Instagram caption writes the same text again.
  - The POST is 202, and "Undo Instagram caption" shows while the refetch is held.
  - Once the refetch lands, the Undo is gone (count 0), Regenerate is enabled again and the text is unchanged. The hold happened.
  - Mutation check (T2 report): with the arm removed from `CaptionPanel`/`HeadlinePanel`, this case and TC-RACE-04 go red (the Undo stays).
- **TC-RACE-04 — The headline Undo settles on state (018 AC-05, FR-05).** The same race for the headline panel (`Mock headline <topic>`): "Undo headline" shows during the hold and is gone after it, with the headline unchanged.
- **TC-RACE-05 — The revision list retries a failed fetch (018 AC-06, FR-06).** After the `regenerate-design` POST, the first `GET /revisions` is answered with a 500. The page retries (2, 4, then 8 s, at most 3 tries), so Current reads `v2` and "Switch to v1" shows **without a reload**. The 500 was served, and at least one later `/revisions` GET went through.

| AC                                                       | E2E                    |
| -------------------------------------------------------- | ---------------------- |
| 015 AC-01 refine settles on state                        | TC-RACE-01             |
| 015 AC-02 regenerate design lists the new revision       | TC-RACE-02             |
| 018 AC-05 the caption/headline Undo settles on state     | TC-RACE-03, TC-RACE-04 |
| 018 AC-06 the revision list retries after a failed fetch | TC-RACE-05             |

> **Update (2026-10-20, change 020):** `create-post-button.test.ts` (011 FR-01 to FR-03) now asserts the floating Create post button is absent on `/drafts/[id]` at 1440 and 375, and runs a check that the refine Send button is not covered at 1440. Its AC-01 case is narrowed to `/`, `/library` and `/campaigns`. **Update (2026-10-23, change 026):** Refine design moved to the left column, so AC-02b now checks the control that sits in the bottom-right band, the LinkedIn caption's Regenerate button. TC-ASYNC-02 expects two captions.

### Z. Scheduler heartbeat (`scheduler-heartbeat.test.ts`, change 023 T2 — AC-05, AC-06, AC-08)

Serial (`test.describe.configure({ mode: 'serial' })`), because the `WorkerHeartbeat` table is global. Every case clears the rows in `beforeEach` and the suite clears them in `afterAll`, so the default state for every other suite stays "no rows". No worker runs in E2E, so the cases seed the rows through the `POST /api/test/worker-heartbeat` seam and open a campaign page. Needs `MOCK_AI` and test-DB access; TC-HB-05 also needs `dbAvailable`.

- **TC-HB-01 — Fresh heartbeats show no banner (AC-05).** Both loops fresh: no "Scheduler offline" banner. A generation loop that is inside a 10-minute tick (started 10 min ago, no end) also shows none, because the generation loop is allowed 30 minutes.
- **TC-HB-02 — A stale generation loop (AC-05).** A generation loop idle for 4 minutes: the banner shows, names the generation loop and says planned posts will not generate.
- **TC-HB-03 — A stale publishing loop (AC-05).** A publishing loop idle for 4 minutes: the banner shows and names the publishing loop.
- **TC-HB-04 — No rows (AC-05).** The never-reported banner shows. This is also the state of a worker that was never started, which is B4's most likely cause.
- **TC-HB-05 — The retry reason (AC-06).** A PENDING entry with `retryCount` 1 and an `errorReason` shows the reason beside its "retry 1" chip. A PENDING entry with `retryCount` 0 shows none.
- **TC-HB-06 — The status route (AC-04, AC-08).** `GET /api/scheduler/status` is 401 without a valid session (the case sends a bogus session cookie, because the proxy redirects a cookie-less request to `/login` before the route runs). With a session its body has only the contract keys: `loops` and `offline`, and per loop `loop`, `state` and `lastSeenAt`.

| AC                                                         | E2E                                    |
| ---------------------------------------------------------- | -------------------------------------- |
| 023 AC-05 the banner (none, generation, publishing, never) | TC-HB-01, TC-HB-02, TC-HB-03, TC-HB-04 |
| 023 AC-06 the retry reason                                 | TC-HB-05                               |
| 023 AC-04, AC-08 the status route and its keys             | TC-HB-06                               |

The health rule itself (AC-02), the worker writes (AC-03) and the route's contract (AC-04) are unit-tested in `heartbeatStatus.test.ts`, `heartbeat.test.ts` and `schedulerStatusRoute.test.ts`.

### AA. Hero imagery (`hero-image.test.ts`, change 009 T5 — AC-04, AC-05, AC-16 to AC-19, AC-21)

Mock mode (`MOCK_AI` + `MOCK_PUPPETEER`). Every generation case runs in its **own fresh team** (disposed afterwards) with one enabled non-default IMAGE row, as §BG does; the wizard case (TC-HERO-13) and the payload case (TC-HERO-16) run in the seeded Bistec team and discard the unfinished brief they autosave. Cases that poll use `waitForDraft` / `waitForAction`. Needs `MOCK_AI` and `MOCK_PUPPETEER`; TC-HERO-10 and TC-HERO-14 also need `dbAvailable`.

**The seams** (`src/lib/testHooks.ts`, consulted only under `MOCK_AI`, dormant in prod; the sentinel is read from the brief topic, or from a refine's instruction when that carries one):

- **`__MOCK_BG__`** makes an image exist: the real resolver picks the provider and only its `generateImage` is swapped for a fixture PNG. A hero style needs it; without it the run settles to `no-image`. (The 005 background seam, §BG.)
- **`__MOCK_HERO_BUSY__`**, **`__MOCK_HERO_CONTRAST__`**, **`__MOCK_HERO_CHECK_ERROR__`**: `mockRegionSamples` returns synthetic samples (busy: high lightness variance; contrast: flat and on the wrong side of the text colour) that go through the **real** `evaluateRegions`; `check-error` makes the seam throw, which the caller settles to `check-error`.
- **`__MOCK_HERO_LAYOUT__`**: `mockLayoutBoxes` returns a box outside every text region, through the **real** layout comparison, so the observation `layout-violation` is recorded.
- `__MOCK_BG_FAIL__` and `__MOCK_BG_NOT_NEEDED__` (§BG) give the no-image cases. Without a sentinel `MOCK_AI` keeps its early return, so no other suite changes. A unit test on `testHooks` asserts the seams return `null` with `MOCK_AI` off.
- **Gotcha:** a refine whose instruction has no sentinel reads `__MOCK_BG__` from the brief topic, so a "carry the stamp" refine on a `__MOCK_BG__` draft needs `__MOCK_BG_NOT_NEEDED__` in its instruction.

- **TC-HERO-01 — A classic brief (AC-21).** Stamp requested and applied `classic`, `imageQuality` `default`, no notice.
- **TC-HERO-02 — `product-showcase` at 1:1 is kept (AC-21).** `contractVersion` 1, `imageUrl` set, the same stamp on the draft and the v1 revision, no notice.
- **TC-HERO-03 — `editorial-split` at 4:5 is kept (AC-21).**
- **TC-HERO-04 — `__MOCK_HERO_BUSY__` (AC-13).** Applied `classic`, reason `busy`, the notice shows, `imageUrl` is still set (the hero image reused, no second image call).
- **TC-HERO-05 — `__MOCK_HERO_CONTRAST__`.** Applied `classic`, reason `contrast`.
- **TC-HERO-06 — `__MOCK_HERO_CHECK_ERROR__` (AC-12).** Applied `classic`, reason `check-error`: the check fails closed.
- **TC-HERO-07 — `__MOCK_BG_FAIL__`.** `no-image`; the composition notice and the background notice both show, each with its own cause.
- **TC-HERO-08 — `__MOCK_BG_NOT_NEEDED__` (an empty prompt) with a hero style.** `no-image`.
- **TC-HERO-09 — a look at 9:16 through the API.** Since 028 it is kept with contract version 2 and no notice (it was recorded as `unsupported-size` on the classic path).
- **TC-HERO-10 — A retired key, then regenerate design (AC-18).** The test DB is written with a retired key; the new revision is `unknown-archetype`, and v1 keeps its stamp.
- **TC-HERO-11 — Refine (AC-17).** A refine on a kept draft carries the stamp; a refine whose instruction carries `__MOCK_BG__` re-stamps `refine-replaced-image`; a refine on a classic draft is unchanged.
- **TC-HERO-12 — `POST /api/briefs` validation (AC-04).** An unknown key, a `TEMPLATE` brief with a style and a non-string are 400; absent stores `classic`.
- **TC-HERO-13 — The wizard (AC-05).** The picker appears on Path B only; at 9:16 every look card is enabled and a chosen look stays pressed (since 028; it was disabled with a reason and reset); the Review row; the request body; autosave and resume.
- **TC-HERO-14 — Restore (AC-16).** Restore to v1 copies v1's stamp; a legacy null stamp stays null.
- **TC-HERO-15 — `__MOCK_HERO_LAYOUT__` (AC-14).** The archetype is **kept**, `observations: ['layout-violation']`, the notice shows. The observation is never a fallback.
- **TC-HERO-16 — The payload and the notice on the page (AC-19).** `GET /api/drafts/[id]` exposes `composition` and `compositionNotice`; the page shows the notice with no axe violation.

| AC                                                                | E2E                                       |
| ----------------------------------------------------------------- | ----------------------------------------- |
| 009 AC-04 the API                                                 | TC-HERO-12                                |
| 009 AC-05 the wizard                                              | TC-HERO-13, `a11y` `/brief` step 2        |
| 009 AC-12, AC-13 fail closed, no second image call                | TC-HERO-04, TC-HERO-05, TC-HERO-06        |
| 009 AC-14 the layout observation                                  | TC-HERO-15                                |
| 009 AC-16 carried stamps                                          | TC-HERO-14                                |
| 009 AC-17 refine                                                  | TC-HERO-11                                |
| 009 AC-18 regenerate design                                       | TC-HERO-10                                |
| 009 AC-19 the notice                                              | TC-HERO-07, TC-HERO-16, `a11y` draft page |
| 009 AC-21 the suite (both styles, both sizes, every fallback row) | TC-HERO-01 to TC-HERO-16                  |

The pure parts (the planner and every fallback row, `evaluateRegions`, the mapping, the prompts and their golden strings, the stamp schema, the budget) are unit-tested; the sampler and layout observation on real pixels are in `npm run test:render` (`hero-sampler.test.ts`, `hero-layout.test.ts`). The mock suite proves the mechanism, not the real-model thresholds: the real fallback rate is OP-1's evidence (see the 009 section of `docs/handoff.md`).

---

### AB. Caption credential route (`caption-route.test.ts`, change 024 T3 — AC-02 to AC-11, AC-14)

Serial (`test.describe.configure({ mode: 'serial' })`). Needs `MOCK_AI` + `MOCK_PUPPETEER` and test-DB access. Each case runs on its own fresh team (the §BG `freshTeam` pattern), so the seeded Bistec and ClientX teams stay "never chosen"; `beforeEach` and `afterAll` clear the model-calls ring (`DELETE /api/test/model-calls`). The route comes from `GET /api/test/model-calls`, filtering records by label `copy`. `MOCK_AI` replaces the provider after the route decision, so the cases exercise the route logic with mock replies.

**The CLI route's happy path has no E2E.** `.env.test` runs API mode (`DESIGN_PROVIDER=claude-html`) and CLI mode bypasses the `MOCK_AI` seam, so a `CLI` route that serves captions is covered by the unit tests alone (`captionRouteSelect`, `captionRouteResolve`). The `CLI`-in-an-API-mode-server case (TC-ROUTE-04) is E2E: it is `not-ready` and fails closed. The header comment of the spec file says the same.

- **TC-ROUTE-01 — A never-chosen team (AC-02, AC-11).** `GET` says `unset`. With a default `anthropic` row a caption run records route `API_KEY`; with a default `openai` row it records `OTHER`, as today.
- **TC-ROUTE-02 — `API_KEY` chosen and ready (AC-04, AC-05).** `PUT API_KEY` with an `anthropic` row gives `ready` and `servingProviderId` is the row. A generated draft's caption rows and `headlineRoute` carry `API_KEY` (read through prisma) and the record says `API_KEY`.
- **TC-ROUTE-03 — `API_KEY` with the row deleted (AC-04).** State `not-ready` with the route-named message; a caption run fails with that message and records no `copy` call; the server key is not used.
- **TC-ROUTE-04 — `CLI` in this API-mode server (AC-04).** State `not-ready`, naming the CLI route and the server mode; the run fails closed.
- **TC-ROUTE-05 — The brief key (AC-06, AC-07).** On an `API_KEY` team a brief created with an `openai` row's key is stored as `'cli'` and records `API_KEY`; with the route cleared the same key records `OTHER`. A chosen route that is not ready gives `422 CAPTION_ROUTE_NOT_READY` and no brief is created.
- **TC-ROUTE-06 — The scheduler (AC-14).** A scheduled entry run through the generation tick seam on an `API_KEY` team records route `API_KEY`; with the row removed the entry's `errorReason` names the route and no draft is made.
- **TC-ROUTE-07 — The Opus gate credential (AC-08).** `GET /api/models` returns `captionCredential: 'team'` for an `API_KEY` team and the plain `credential` otherwise.
- **TC-ROUTE-08 — The API and `/team` (AC-09, AC-10, AC-11).** `PUT` is 401 without a valid session (the case sends a bogus session cookie, because the proxy redirects a cookie-less request to `/login`), 403 for an editor and 400 for a bad body; team A's `PUT` leaves team B at `unset`. `/team` shows the route card and its state line (`data-state` unset, ready, not-ready, unset), the "Serving captions" chips and the COPY slot, with neither stale string ("Not used in CLI mode", "safe to delete") and with "Register Provider".
- **TC-ROUTE-09 — The wizard (AC-11).** A never-chosen team's Review step is unchanged (Generate live, no warning). A chosen and ready team's request has no `copyProviderKey`. A `not-ready` team's Generate is disabled and shows the server's route-named message.

| AC                                                 | E2E / unit                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| 024 AC-02 never-chosen is today's behaviour        | TC-ROUTE-01; unit `captionRouteSelect`                            |
| 024 AC-03 chosen routes fail closed                | TC-ROUTE-03, TC-ROUTE-04; unit `captionRouteSelect`               |
| 024 AC-04 the resolver                             | TC-ROUTE-02, TC-ROUTE-03, TC-ROUTE-04; unit `captionRouteResolve` |
| 024 AC-05 the stamp                                | TC-ROUTE-02; unit `captionRouteStamp`                             |
| 024 AC-06, AC-07 the brief key and the 422         | TC-ROUTE-05                                                       |
| 024 AC-08 the Opus gate and the seam               | TC-ROUTE-01 to TC-ROUTE-04, TC-ROUTE-07; unit `captionRouteGate`  |
| 024 AC-09, AC-10 the route API and its exact keys  | TC-ROUTE-08; unit `captionRouteApi`                               |
| 024 AC-11 `/team` and the wizard                   | TC-ROUTE-02, TC-ROUTE-08, TC-ROUTE-09                             |
| 024 AC-12 other consumers untouched                | unit `captionRouteApi` (the `resolveAnthropicApiKey` parity case) |
| 024 AC-13 the arg-parity guard                     | unit `modelArgParity`                                             |
| 024 AC-14 the scheduler and MCP use the team route | TC-ROUTE-06; unit `captionRouteResolve`                           |
| 024 AC-15 the other suites stay green              | the full clean mock run; the T3 targeted run (83 passed)          |

The pure parts (the selector table, the loader, the stamp writers, the gate rule, the picker, the route API, the arg-parity guard) are unit-tested without a server.

---

### AC. Brand-kit design rules (`kit-upgrade.test.ts`, change 007 T3 — AC-10 to AC-14)

Serial (`test.describe.configure({ mode: 'serial' })`). Needs `MOCK_AI` and test-DB access; it skips without `MOCK_AI`. Each case logs in as the seeded admin (and the editor where it needs one), creates its own kit through `POST /api/admin/brandkits` and its prompt through `POST …/prompts`, and `beforeEach` clears the model-calls ring (`DELETE /api/test/model-calls`). The upgrade call is read from `GET /api/test/model-calls`, filtering records by label `kit-upgrade`.

**Sentinels** (exported from `src/lib/testHooks.ts`, dormant in production; a sentinel in the posted text steers the mock reply):

- `__MOCK_UPGRADE_UNPARSEABLE__`: the reply has no ` ```kitedits ` block (502 `UPGRADE_PARSE_FAILED`).
- `__MOCK_UPGRADE_NONE__`: the reply proposes nothing (200 `none`, `model-proposed-none`).
- `__MOCK_UPGRADE_BAD__`: the reply holds one good proposal and three bad ones (an unknown candidate, a non-measurable wording and a forbidden literal), so the response has one edit and three rejection reasons.
- `__MOCK_UPGRADE_OUTOFRANGE__`: the reply's number is outside the entry's range (the edit comes back `provenance: 'unverified'`).
- `__MOCK_IMPROVE_DROP_RULES__`: for Improve with AI. When the active prompt holds it, the mock draft is the prompt with its measurable spans removed. Without it the draft is today's string.

- **TC-KU-01 — The live detector (AC-13).** Typing the Hearts fixture into the New Version textarea shows four flagged rows within the debounce and makes no request to `…/upgrade`. The brand-voice fixture shows none.
- **TC-KU-02 — The upgrade (AC-10).** `POST …/upgrade` with the fixture and the right `baseVersion` returns four edits, entry keys as the detector found them, `provenance: 'dataset'`, and one `kit-upgrade` record.
- **TC-KU-03 — Every edit is measurable (AC-06).** Each `replacement` passes the exported `isMeasurable`, and each `quote` occurs exactly once in the posted text.
- **TC-KU-04 — Parse failure (AC-10).** `UNPARSEABLE` is 502 `UPGRADE_PARSE_FAILED`, not a 200 with an empty list. The UI shows the error and a "Try again" button.
- **TC-KU-05 — Nothing to propose (AC-10).** `NONE` is 200 `none` / `model-proposed-none`. A text with no vague phrase is `none` / `no-candidates` with no recorder entry.
- **TC-KU-06 — Rejections and provenance (AC-07, AC-08, AC-10).** `BAD` is 200 `edits` with one edit and the three rejection reasons. `OUTOFRANGE` gives `provenance: 'unverified'` and the UI shows "Number not from the dataset, check it".
- **TC-KU-07 — The editor flow (AC-13).** "Improve this version", Upgrade; each edit shows the removed text beside the inserted text (an insert shows "After the sentence with …" and no removal), the provenance label and the rationale. Accept two, reject one: the textarea changes and the version list does not. Save creates one new active version equal to the textarea. Accepting nothing and saving creates a version equal to the base. The Save note's words are on the page.
- **TC-KU-08 — The stale base (AC-12).** A second save through the API moves the active version. `…/upgrade` with the old `baseVersion` is 409 `STALE_BASE` with no recorder entry. In the UI, Save in an upgrade-seeded editor shows the "was saved since you started" confirm; Cancel saves nothing and "Save anyway" saves.
- **TC-KU-09 — Stale edits and dismiss (AC-13).** Editing the textarea so a quote no longer occurs once disables that edit as stale. Dismissing a flag hides it until reload.
- **TC-KU-10 — Lost rules (AC-14).** Improve with AI on a kit whose active prompt holds `__MOCK_IMPROVE_DROP_RULES__` and "1.5 wordmark letters" returns `lostRules` holding `1.5 wordmark letters`. On a normal kit `lostRules` is `[]` and `draft` is today's shape. The UI shows the dropped spans above the editor.
- **TC-KU-11 — Auth and tenancy (AC-11).** 401 with no valid session (a bogus session cookie, because the proxy redirects a cookie-less request), 403 for the editor, 404 for another team's kit and for a deleted kit, 400 for a missing, empty or over-long `text` and for a negative `baseVersion`.

| AC                                            | E2E / unit                                                           |
| --------------------------------------------- | -------------------------------------------------------------------- |
| 007 AC-01 to AC-03 the detector               | TC-KU-01; unit `designDetect`                                        |
| 007 AC-04, AC-05 the dataset and "measurable" | unit `designAuthoring`, `designMeasurable`                           |
| 007 AC-06 every edit is measurable            | TC-KU-03; unit `kitUpgradeValidate`                                  |
| 007 AC-07, AC-08 validation and provenance    | TC-KU-06; unit `kitUpgradeValidate`                                  |
| 007 AC-09 roles, not literals                 | unit `kitUpgradePrompt`, `kitUpgradeValidate`                        |
| 007 AC-10 the three outcomes                  | TC-KU-02, TC-KU-04, TC-KU-05, TC-KU-06                               |
| 007 AC-11 auth and tenancy                    | TC-KU-11                                                             |
| 007 AC-12 the stale base                      | TC-KU-08                                                             |
| 007 AC-13 the editor flow                     | TC-KU-01, TC-KU-07, TC-KU-09                                         |
| 007 AC-14 Improve flags lost rules            | TC-KU-10; unit `designLostRules`                                     |
| 007 AC-15 host-agnostic review                | unit `kitUpgradeReview`                                              |
| 007 AC-16 boundaries and purity               | unit `designDataBoundary`                                            |
| 007 AC-17 generation and save untouched       | unit `generationUntouched`; the `git diff` checks in `reports/T4.md` |
| 007 AC-18 one fenced-block extractor          | unit `fencedBlock`, `brandKitAssistant`                              |
| 007 AC-19 grounding and the model call        | unit `kitUpgradePrompt`, `kitUpgradeRoute`                           |
| 007 AC-20 observability and docs              | unit `kitUpgradeRoute` (the log line); `docs/handoff.md` 007 section |
| 007 AC-21 the design system                   | unit `uiTokenGuard`; the T3 screenshots at 390 and 1440 px           |
| 007 AC-22 nothing regressed                   | the full clean mock run, unit, render, build, CI                     |

The pure parts (the dataset, detector, measurable check, validator, review reducer, prompt builder and route) are unit-tested without a server. The mock suite proves the mechanism with mock replies, not the real model's wording.

### AD. Product observability (`analytics.test.ts`, change 006 T2 to T5 — AC-04 to AC-14, AC-16)

Serial (`test.describe.configure({ mode: 'serial' })`). Needs `MOCK_AI`, `MOCK_PUPPETEER` and `MOCK_SOCIAL` and test-DB access; it skips without them. Each case clears the store first (`DELETE /api/test/analytics-events`), drives a real flow under the mocks and reads the events back through the seam.

**The seam** (`/api/test/analytics-events`, FR-07): 404 in production, 404 unless `MOCK_AI`, admin only, like `model-calls`. `GET` returns recent events (optional `name` and `draftId` filters); `DELETE` clears them; `POST` takes one of three bodies: `{ seed: [...] }` inserts rows with an explicit `at` (retention and range cases), `{ failNext: n }` makes the next `n` event inserts reject (failure isolation, AC-08), and `{ sweep: true }` runs the retention sweep once. The cases reuse these existing sentinels and seams: `__FAIL_GEN_ALWAYS__` (a generation that always fails), `__VERIFY_PASS__` and `__VERIFY_FAIL_ALWAYS__` (the mock verifier), `conflict_test` (a brand-kit conflict on refine), `__FAIL_ALWAYS__` in the topic (a publish that always fails) and `POST /api/test/generation-tick`.

- **TC-OBS-01 — A web generation (AC-05, AC-07).** One `generation.finished` `ok`, `source: web`, with `durationMs > 0`.
- **TC-OBS-02 — A failing generation (AC-05).** One `failed` event holding a redacted reason.
- **TC-OBS-03 — An applied refine (AC-05, AC-06, AC-07).** One `draft_action.settled` `ok` holding the instruction, at least one attempt with classes and verdict `pass`, the verifier model id and `VERIFIER_PROMPT_VERSION`.
- **TC-OBS-04 — A not-applied refine and Use anyway (AC-05, AC-06).** A refine the verifier rejects twice writes one `not-applied` event whose attempts hold the `miss` verdicts. Adopting it writes `revision.adopted`.
- **TC-OBS-05 — A conflict (AC-05).** One `conflict` settle; the Override writes its own `revision.override`.
- **TC-OBS-06 — Regenerate design and regenerate caption (AC-05).** One settled event each.
- **TC-OBS-07 — Inline edit and restore (AC-05).** `revision.edited` and `revision.restored` (from and to numbers), one each.
- **TC-OBS-08 — Publish (AC-05).** One `publish.settled` per attempt: `published`, then `failed`.
- **TC-OBS-09 — A scheduled generation (AC-05).** `generation.finished` with `source: scheduler` and `scheduled_generation.settled`.
- **TC-OBS-10 — The store failing (AC-08).** With `failNext` set, a generation, a refine and a publish end in the same status and rows, and `AnalyticsDrop.dropped` grew.
- **TC-OBS-11 — The page equals a hand count (AC-11, AC-12).** A known set is seeded through the seam; every figure on `/admin/insights` equals the hand count. The applied rate is `ok ÷ (ok + not-applied)` (see the notes below), and two seeded verifier ids give two lines.
- **TC-OBS-12 — The range (AC-11).** The range limits every section; an event 100 days old shows only in retention health.
- **TC-OBS-13 — Events lost and an empty store (AC-11).** Dropped and rejected counts show beside the figures; an empty store reads as zeros, not errors.
- **TC-OBS-14 — The sweep (AC-13).** Rows at 181 days go; rows at 179 days stay.
- **TC-OBS-15 — The batch cap (AC-13).** A sweep deletes at most 5 000 events; a backlog drains over ticks.
- **TC-OBS-16 — The scheduler banner (AC-13).** The retention loop does not disturb the "Scheduler offline" banner, and its own health shows on the page.
- **TC-OBS-17 — Draft delete (AC-14).** Deleting a draft keeps its events with `draftId` null.
- **TC-OBS-18 — Team delete (AC-14).** Soft-deleting a team removes its events and no other team's.
- **TC-OBS-19 — API access (AC-11).** `/api/admin/insights` answers 401 to a bogus session cookie and 403 to an editor and a team admin. A request with no cookie at all is redirected to `/login` by the proxy, so the case sends a bogus cookie (the TC-HB-06 pattern).
- **TC-OBS-20 — Page access (AC-11).** An editor and a team admin see the gate and no nav item.
- **TC-OBS-21 — Layout and axe (AC-16).** The super admin has the nav item; the page has no horizontal scroll at 390 px and passes the axe rules.
- **TC-OBS-22 — Privacy (AC-04).** No event the suite collected holds the brief text, a caption, the headline or HTML. It runs last, so it covers every event the suite wrote.
- **TC-OBS-23 — Wizard steps (AC-09).** Walking the wizard writes one `wizard.step` per step reached; going back and forward again adds none; Generate writes `brief.submitted`.
- **TC-OBS-24 — Resume (AC-09).** Resuming a brief draft reports no steps up to where it stopped, then the next forward step with its draft id; Generate writes `brief.submitted` with `resumed`.
- **TC-OBS-25 — Discard (AC-09).** Discarding a brief draft writes `brief.abandoned` `discarded` with its last step; a foreign id and the Generate-success delete write nothing.
- **TC-OBS-26 — Expiry (AC-09).** A brief draft idle for 8 days is swept by the dashboard read and writes `brief.abandoned` `expired`.
- **TC-OBS-27 — `POST /api/events` (AC-09).** Team, user and source come from the session and a body value is ignored; a foreign draft id, an unknown name, a bad payload, an oversized body (2 KB cap, enforced while streaming) and no session are refused.
- **TC-OBS-28 — The rate limit (AC-09).** The 61st event in a minute is dropped and counted (`AnalyticsDrop` reason `rate-limit`); the first 60 are stored. The client still gets 204.
- **TC-OBS-29 — The funnel (AC-09, AC-11).** The funnel on the API and the page equals a hand count over a seeded set.
- **TC-OBS-30 — Tokens (AC-10).** Token totals count reported events only, and the page shows the not-reported share. The `MOCK_AI` seam bypasses `createMessage`, so the case seeds events; the summing itself is proven by the unit test `analyticsUsage.test.ts`.

**Notes.**

- **The applied rate.** The page and the cases use AC-12's formula, `ok ÷ (ok + not-applied)`. FR-10's wording, "`ok` ÷ settled REFINE", would also count `conflict` and `failed` settles; the page caption states the formula it uses.
- **Mean refines per draft** counts every REFINE settle on the draft, with no date bound.
- **`GET /api/campaigns` caps at 200.** A suite must not create a campaign per test, or the cap makes later lookups miss.

| AC                                               | E2E / unit                                                                                                                                                                                                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 006 AC-01 the migration                          | the `test:upgrade` run and `prisma migrate diff --exit-code` (`reports/T1.md`)                                                                                                                                                                                  |
| 006 AC-02 the wrapper                            | unit `analyticsTrack`                                                                                                                                                                                                                                           |
| 006 AC-03 vocabularies are imported              | unit `analyticsCoverage`                                                                                                                                                                                                                                        |
| 006 AC-04 caps and redaction                     | TC-OBS-22; unit `analyticsCatalogue`, `redactText`                                                                                                                                                                                                              |
| 006 AC-05 one event per operation, every outcome | TC-OBS-01 to TC-OBS-09                                                                                                                                                                                                                                          |
| 006 AC-06 the refine trace                       | TC-OBS-03, TC-OBS-04; the unit golden test of the verifier prompt                                                                                                                                                                                               |
| 006 AC-07 durations                              | TC-OBS-01, TC-OBS-03                                                                                                                                                                                                                                            |
| 006 AC-08 failure isolation                      | TC-OBS-10; unit `analyticsTrack`                                                                                                                                                                                                                                |
| 006 AC-09 wizard events and the client route     | TC-OBS-23 to TC-OBS-28                                                                                                                                                                                                                                          |
| 006 AC-10 tokens                                 | TC-OBS-30; unit `analyticsUsage`                                                                                                                                                                                                                                |
| 006 AC-11 the page and its access                | TC-OBS-11, TC-OBS-12, TC-OBS-13, TC-OBS-19, TC-OBS-20, TC-OBS-29                                                                                                                                                                                                |
| 006 AC-12 the applied rate is checkable          | TC-OBS-11                                                                                                                                                                                                                                                       |
| 006 AC-13 retention                              | TC-OBS-14, TC-OBS-15, TC-OBS-16                                                                                                                                                                                                                                 |
| 006 AC-14 deletes and purge                      | TC-OBS-17, TC-OBS-18; the purge script is run by hand in `reports/T3.md`                                                                                                                                                                                        |
| 006 AC-15 generation untouched                   | the `git diff` checks in the reports; the existing `model-selection` and refine suites                                                                                                                                                                          |
| 006 AC-16 the design system                      | TC-OBS-21; unit `uiTokenGuard`                                                                                                                                                                                                                                  |
| 006 AC-17 nothing regressed                      | the full clean mock run (473/3/0/1 (the one flaky was a Playwright worker-process crash in `regression.test.ts` H7, not an assertion; that suite then re-ran clean 3 of 3)), unit (3283/3283), render (47/47), build, CI (green at `851f224` (run 40084041397)) |

The mock suite proves the mechanism with mock replies; it records no real model call.

### AE. Post styles and the facts check (`post-styles.test.ts`, change 027 T4 to T7 — AC-05 to AC-07, AC-10 to AC-16, AC-22)

Serial. Needs `MOCK_AI`, `MOCK_PUPPETEER` and `MOCK_SOCIAL` and test-DB access; it skips without them. The suite runs under the mocks only: no model call, and the check itself is code. The server cases are TC-PS-01 to TC-PS-29, the UI cases TC-PS-30 to TC-PS-39, and the insights section TC-PS-40. The section also adds **TC-OBS-31** to §AD (the three new event fields).

**The seams** (`src/lib/testHooks.ts`, consulted only under `MOCK_AI`, dormant in prod). A sentinel in the brief **topic** makes the mock caption and headline carry one invented value, and carries no digit itself:

- `__MOCK_FACT_PRICE__` adds `$49`, `__MOCK_FACT_PCT__` adds `35% off`, `__MOCK_FACT_DATE__` adds `30 March 2027`, `__MOCK_FACT_NUM__` adds `1,250 customers`. Each lands in the headline and both captions, so two values give six flags.
- `__MOCK_FACT_HEADLINE__` puts `$49` in the headline only.
- `__MOCK_FACT_ERROR__` forces the check to fail, so the stored status is `error`.
- Because the mock caption embeds the topic, a value written in the topic, the description, the campaign briefing, the kit voice text or a campaign document is a **stated** value and is not flagged. That is the seeded negative case. A topic with no sentinel gives the same mock reply as before 027.
- The scheduler cases drive the existing `POST /api/test/generation-tick` (404 in production, 404 unless `MOCK_AI`, admin only). The one case the API refuses, a stored key that no longer resolves, is seeded straight into the database.

- **TC-PS-01 to TC-PS-04 — `POST /api/briefs` (AC-05).** A style stores the style's goal, the resolved tone and `classic`, and a body `goal` is ignored. With no style, a legacy `hiring` or `announcement` picks its style and anything else is `general`. A pre-027 body (goal and tone, no style) is 201 and keeps its tone. An unknown key is 400 `UNKNOWN_POST_STYLE` and creates nothing; a non-string is 400; a blank key is absent.
- **TC-PS-05, TC-PS-06 — The campaign default (AC-07).** An admin sets it, a brief on that campaign uses it, another campaign is unaffected, and an editor gets 403. Create takes a default, refuses an unknown one, and null clears it.
- **TC-PS-07 to TC-PS-09 — The queue (AC-05).** Create resolves the style (explicit, legacy goal, campaign default, `general`). Edit takes a style, refuses an unknown one and leaves the entry unchanged, and an edit that sends no style keeps the stored style, goal and tone (a legacy null stays null). Batch names the failing entry, writes nothing on an error and resolves defaults on success.
- **TC-PS-10 to TC-PS-16 — The facts check (AC-10, AC-11, AC-16).** The draft carries the stamp and a check, and `GET /api/drafts/[id]` returns `{ key, label, version }`. Each invented value is flagged exactly, with where, and nothing else is. A value stated in any of the five sources is not flagged, the same value elsewhere is. An ordinary brief (`24/7`, a list marker, a step count) is clear. A check that cannot run is stored as `error` and the draft still finishes. A manual caption edit and a regenerate recompute it. A brief with no style gets no stamp but still gets a check.
- **TC-PS-17 to TC-PS-21 — The hold (AC-12).** A flagged check holds `SCHEDULE_PUBLISH` and `PUBLISH_NOW`: `COMPLETED` with a draft, no `Post` row, `postAction` unchanged, `heldReason` set. A clear check runs the post action exactly as before. A `HOLD` entry is unaffected. A check forced to `error` holds with the "could not run" reason. A held entry re-runs through the route: `heldReason` is cleared and a new draft is made.
- **TC-PS-22 to TC-PS-24 — Run-time keys (AC-12, AC-16).** A stored key that no longer resolves fails the entry with the named reason: no brief, no draft, no `Post`. A pre-027 entry (null key) runs with its own goal and tone, no style, and is still gated. A styled entry writes its key, the style goal and the entry tone to the brief, and the image stays `classic`.
- **TC-PS-25 to TC-PS-29 — ACP (AC-05).** `goal` and `tone` are optional and the result names the style and carries the check. An explicit `postStyle` wins over a legacy goal, and a legacy goal alone picks `hiring` or `announcement`. An invented value comes back as a flagged check. An unknown key is the named 422 error and a non-string a 400. The manifest is `1.2.0`, lists `postStyle` and no longer requires `goal` or `tone`. MCP is stdio, so it has no E2E: the unit tests and the shared `generatePost` cover it.
- **TC-PS-30 to TC-PS-34 — The wizard (AC-06, AC-16).** The picker sits above the size choices with General selected, moves by arrow keys, and the Content step has no Goal select. The image style on step 1 is pre-filled from the style, a look picked by hand is kept, and 9:16 and Path A fall to Classic. The style pre-fills Tone, a Tone changed by hand is kept, and the Review shows the resolved rows. The request carries `postStyle` always, and `tone` and `imageStyle` only when touched. A stored style resumes; an unknown key and an old row open as General.
- **TC-PS-35 to TC-PS-37 — The campaign default in the UI (AC-07).** The wizard opens with the default selected, and a campaign with none gives General. An admin sets and clears it on the detail page, the list shows it, and an editor sees text only. The create form takes a default.
- **TC-PS-38 — The queue modal (AC-12).** The modal sends `postStyle` and no goal, and a held entry shows its line with the values in its title.
- **TC-PS-39 — The draft notice (AC-13).** A flagged draft shows `facts-check-notice` naming each value and where; a clear one does not; the check that could not run says so; Publish stays enabled.
- **TC-PS-40 — The insights section (AC-14).** The "Post styles" section equals a hand count over a seeded set, an unchosen style shows zeros, and an editor is refused.
- **TC-OBS-31 (§AD) — The new event fields (AC-14).** The three events carry `postStyle`, `factsStatus`, `factsFlagCount` and `held`; held is true and false in the right cases; and no flagged value is in any payload (TC-OBS-22 also forbids the four mock fact values).

**Notes.**

- **The dark theme of the "Post styles" section is not visually verified.** TC-PS-40's screenshots use `page.emulateMedia({ colorScheme })`, which does not switch the app's theme, so the "dark" captures show the light theme. The axe pass covers it. The captures are review aids, not a gate.
- **"Chosen" counts wizard briefs.** Queued entries have no `brief.submitted` event, so they show under generations and held only.
- **Layout follow-ups, not gates.** The eight-card picker is about 900 px tall at 390 px, and the held line wraps to five or six lines.

| AC                                       | E2E / unit                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 027 AC-01 the migration                  | the `test:upgrade` run and `prisma migrate diff --exit-code` (`reports/T1.md`)                                                                                      |
| 027 AC-02 the dataset                    | unit `postStylesDataset` (the hash table pins released versions)                                                                                                    |
| 027 AC-03 the resolver                   | unit `postStylesResolve`; TC-PS-01 to TC-PS-04, TC-PS-07, TC-PS-24                                                                                                  |
| 027 AC-04 the stamp and derived versions | unit `postStylesStamp`                                                                                                                                              |
| 027 AC-05 the inputs                     | TC-PS-01 to TC-PS-04, TC-PS-07 to TC-PS-09, TC-PS-25 to TC-PS-28; unit `postStylesApi`, `postStylesQueueRoutes`                                                     |
| 027 AC-06 the wizard                     | TC-PS-30 to TC-PS-34; unit `postStylesWizard`                                                                                                                       |
| 027 AC-07 the campaign default           | TC-PS-05, TC-PS-06, TC-PS-35 to TC-PS-37                                                                                                                            |
| 027 AC-08 the prompts                    | unit `postStylesPrompts` (exact text, golden for an unstyled brief)                                                                                                 |
| 027 AC-09 the extractor                  | unit `factsCheckExtract`, `domFacts`                                                                                                                                |
| 027 AC-10 the seeded acceptance bar      | unit `factsCheckCorpus` (24 or more cases, flagged set equals expected); TC-PS-11                                                                                   |
| 027 AC-11 sources, write points, storage | TC-PS-10, TC-PS-12 to TC-PS-16; unit `factsCheckRefresh`, `postStylesWriters`                                                                                       |
| 027 AC-12 the hold                       | TC-PS-17 to TC-PS-22, TC-PS-38; unit `postStylesHold`                                                                                                               |
| 027 AC-13 the notice and readers         | TC-PS-39, TC-PS-10, TC-PS-25, TC-PS-29; unit `factsCheckNotice`                                                                                                     |
| 027 AC-14 analytics and the page         | TC-PS-40, TC-OBS-31, TC-OBS-22; unit `postStylesAnalytics`                                                                                                          |
| 027 AC-15 the seams                      | TC-PS-11, TC-PS-13, TC-PS-14                                                                                                                                        |
| 027 AC-16 legacy behaviour               | TC-PS-02, TC-PS-03, TC-PS-16, TC-PS-23, TC-PS-34                                                                                                                    |
| 027 AC-17 no new calls                   | the `git grep -c "createMessage\|runClaudeCli\|recordModelCall" -- src` count against the base commit; the `model-selection` suite unchanged                        |
| 027 AC-18 one resolver and purity        | unit `postStylesBoundary`, `designDataBoundary`                                                                                                                     |
| 027 AC-19 the check is fast              | unit `factsCheckCorpus` (the maximum-input timing)                                                                                                                  |
| 027 AC-20 the design system              | unit `uiTokenGuard`; the axe and no-horizontal-scroll checks in the UI cases                                                                                        |
| 027 AC-21 nothing regressed              | the full clean mock run (517/3/0/0), unit (3737/3737), render (47/47), lint 0 errors / 7 warnings, build, `test:upgrade`, CI (green at `c199270` (run 40111923100)) |
| 027 AC-22 the mock-only acceptance bar   | AC-10 and §AE (a), AC-12 (b), TC-PS-40 (c)                                                                                                                          |

The mock suite proves the mechanism with mock replies; it records no real model call.

---

### AF. Image looks (`image-looks.test.ts`, change 028 T4 — AC-07, AC-10 to AC-14, AC-18)

Mock mode (`MOCK_AI` + `MOCK_PUPPETEER`). Every case runs on the existing hero seams, so no model or image call is made. `KEPT` reads the current version from the dataset (`archetypes[key].current`), so a future version bump changes no expectation. The cases use the seeded team, except TC-LOOK-12 (a v1 stamp is written through `tests/helpers/db` and the case skips without DB access) and TC-LOOK-11 (the generation tick, `POST /api/test/generation-tick`). Listeners are created before the action that triggers the request. Run alone three times against a fresh `:3001` server, the suite passed 12 of 12 each time with no flake (T4 report).

**The seams** (`src/lib/testHooks.ts`, under `MOCK_AI`, dormant in prod). No new sentinel. `__MOCK_HERO_BUSY__`, `__MOCK_HERO_CONTRAST__` and `__MOCK_HERO_LAYOUT__` apply to any contract. `mockLayoutBoxes` (FR-09) now takes its outside box from a fixed 6 by 6 grid, the first cell that lies outside every text region with tolerance, so the box is outside the bands of `full-bleed-scene` and `spotlight` too (before 028 it was a fixed box that sat inside the Spotlight bottom band).

| Case       | What it checks                                                                                                                                                                                                                                                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-LOOK-01 | `product-showcase` at 9:16 is kept with contract version 2, the image set, no notice; the same stamp on the draft and its first revision                                                                                                                                                                                                                 |
| TC-LOOK-02 | `editorial-split` at 9:16 is kept with contract version 2                                                                                                                                                                                                                                                                                                |
| TC-LOOK-03 | `full-bleed-scene` at SQUARE, PORTRAIT and 9:16 is kept with contract version 1                                                                                                                                                                                                                                                                          |
| TC-LOOK-04 | `spotlight` at SQUARE, PORTRAIT and 9:16 is kept with contract version 2 (031 T18: spotlight v2 is current; v1 stays resolvable, see the render suite's `SUPERSEDED_FIXTURES`)                                                                                                                                                                           |
| TC-LOOK-05 | `full-bleed-scene` with `__MOCK_HERO_BUSY__`: classic, reason `busy`, the notice names "Full-bleed scene", `imageUrl` still set (the hero image is reused)                                                                                                                                                                                               |
| TC-LOOK-06 | `spotlight` with `__MOCK_HERO_CONTRAST__`: classic, reason `contrast`, the notice names "Spotlight"                                                                                                                                                                                                                                                      |
| TC-LOOK-07 | `spotlight` with `__MOCK_HERO_LAYOUT__`: kept, `observations: ['layout-violation']`, the composition notice shows it                                                                                                                                                                                                                                     |
| TC-LOOK-08 | `full-bleed-scene` at 9:16 with `__MOCK_HERO_LAYOUT__`: the same                                                                                                                                                                                                                                                                                         |
| TC-LOOK-09 | `POST /api/briefs` accepts both new keys on GENERATE at every size; a new key on TEMPLATE is 400; an unknown key is 400                                                                                                                                                                                                                                  |
| TC-LOOK-10 | the wizard: six cards (025 T2 added `device-screen`, disabled until a screenshot is uploaded), none of the other five disabled at SQUARE, PORTRAIT or 9:16; Launch at 9:16 pre-fills Product showcase with the hint; Announcement at 9:16 pre-fills Editorial split; Spotlight at 9:16 is sent and shown on Review; resume keeps the look; axe on step 1 |
| TC-LOOK-11 | the unattended surfaces: a queue entry with `postStyle: 'launch'` at 9:16, through the generation tick, stores `imageStyle: 'classic'` and a classic stamp                                                                                                                                                                                               |
| TC-LOOK-12 | a draft with a v1 stamp written in the test DB: refine carries it with no warning; regenerate design records version 2; restore copies the v1 stamp back                                                                                                                                                                                                 |
| TC-LOOK-13 | T7: the Event post style pre-fills Full-bleed scene with the hint at 1:1 and at 9:16 (untouched, it survives the size change); General goes back to Classic                                                                                                                                                                                              |
| TC-LOOK-14 | T7: the same for the Hiring post style                                                                                                                                                                                                                                                                                                                   |
| TC-LOOK-15 | T7: a queue entry with `postStyle: 'event'` at 9:16, through the generation tick, still stores `imageStyle: 'classic'` and a classic stamp                                                                                                                                                                                                               |
| TC-LOOK-16 | T7: the same for `postStyle: 'hiring'`                                                                                                                                                                                                                                                                                                                   |
| TC-LOOK-17 | 031 T18: the wizard pre-fills Spotlight for a Promotion post, and the resumed draft keeps it (`imageStyle` spotlight, STORY)                                                                                                                                                                                                                             |
| TC-LOOK-18 | 031 T18: the same for a Milestone post                                                                                                                                                                                                                                                                                                                   |
| TC-LOOK-19 | 031 T18: a queue entry with `postStyle: 'promotion'` at 9:16, through the generation tick, still stores `imageStyle: 'classic'` and a classic stamp                                                                                                                                                                                                      |
| TC-LOOK-20 | 031 T18: the same for `postStyle: 'milestone'`                                                                                                                                                                                                                                                                                                           |

**AC-to-case table.** Unit and render tests cover the rest of the mechanism; the cases above cover the end-to-end behaviour.

| AC                                            | Where it is checked                                                                                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-01 the dataset (FR-01, FR-02, NFR-04)      | unit `lookDataset.test.ts`, `designData.test.ts`                                                                                                                                     |
| AC-02 validation (FR-03)                      | unit `lookDataset.test.ts` (one fixture per rule; a valid `-light` fixture passes)                                                                                                   |
| AC-03 the key rule (FR-04)                    | unit `lookDataset.test.ts`, `postStylesResolve.test.ts` (a retired look resolves to classic with `retired-classic`; the picker omits it)                                             |
| AC-04 the resolver (FR-05)                    | unit `postStylesResolve.test.ts` (six surfaces, four looks, three sizes); TC-LOOK-09, TC-LOOK-10                                                                                     |
| AC-05 STORY literals (FR-06)                  | unit `styleAfterSizeChange` and the resume rule (fixture look dataset); TC-LOOK-10                                                                                                   |
| AC-06 prompts (FR-07, NFR-05)                 | unit `heroPrompts.test.ts`, `designData.test.ts` (goldens for the eight new contracts; every v1 and classic golden unchanged)                                                        |
| AC-07 the fixtures discriminate (FR-08)       | render `look-fixtures.test.ts` (36 cases in real Chromium; the render total is 84, at least 83)                                                                                      |
| AC-08 completeness and tone (FR-08)           | unit `lookFixtureCompleteness.test.ts`                                                                                                                                               |
| AC-09 the mock layout box (FR-09)             | unit `heroSeams.test.ts`                                                                                                                                                             |
| AC-10 the pipeline (FR-10)                    | TC-LOOK-01 to TC-LOOK-06; unit `background.test.ts` (one image call, including on fallback)                                                                                          |
| AC-11 the notice for band looks (FR-11)       | TC-LOOK-07, TC-LOOK-08; unit `compositionNotice.test.ts`                                                                                                                             |
| AC-12 the wizard (FR-12)                      | TC-LOOK-09, TC-LOOK-10                                                                                                                                                               |
| AC-13 unattended unchanged (FR-05, NFR-06)    | TC-LOOK-11, TC-LOOK-15, TC-LOOK-16; the NFR-06 `git diff` lists nothing                                                                                                              |
| AC-14 old drafts (FR-13)                      | TC-LOOK-12; unit `refinePrompt.test.ts` (a v1 stamp gives the v1 regions)                                                                                                            |
| AC-15 the runner's logic (FR-14)              | unit `lookCheck.test.ts` (imports `scripts/look-check/lookCheck.mjs`)                                                                                                                |
| AC-16 the pass rule (FR-15)                   | unit `lookCheck.test.ts` (`lookVerdicts`)                                                                                                                                            |
| AC-17 nothing extra (NFR-01, NFR-03, NFR-06)  | the `git grep -c` counts against the base and the `git diff` commands; the runner was run only by its unit tests and with `--dry-run`                                                |
| AC-18 the design system (NFR-10)              | unit `uiTokenGuard.test.ts` (no new `// ui-exception`); the step 1 screenshots at 390 px and 1440 px, light and dark, in `ui-captures/028/` (gitignored)                             |
| AC-19 the gate (NFR-01 to NFR-11)             | the full clean mock run (529/3/0/0), unit 3894/3894, render 84/84, lint 0 errors / 7 warnings, tsc, build (passes), `test:upgrade` (passes), CI green at `1639b1e` (run 40128829845) |
| AC-20 the default moves (FR-16, after OP-028) | T7: unit `postStylesDataset.test.ts`, `lookCheckResults.test.ts`; the wizard pre-fill case in `image-looks.test.ts`. Deferred                                                        |
| AC-21 closed (after OP-028)                   | the committed `results.json` and `ledger.jsonl`; the handoff 028 section; CI after T7. Deferred                                                                                      |

**Changes to other sections (028 T4).** §AA `hero-image.test.ts`: `KEPT` reads the current version; TC-HERO-09 and TC-HERO-13 now assert the 9:16 behaviour above. §AE `post-styles.test.ts`: TC-PS-31 and TC-PS-32 (the 9:16 Review row now reads "Product showcase (from the post style)", where it read "Classic"). `unsupported-size` stays covered by unit tests with a fixture dataset, and the notice still names "9:16" (L3).

The mock suite proves the mechanism with mock replies; it records no real model call. The real-image check is OP-028, outside this suite (NFR-11).

### AG. Product screenshots (`product-screenshots.test.ts`, change 025 T2 to T9 — AC-06, AC-09, AC-10, AC-13 to AC-16)

**Status (2026-10-26, Group B built).** Every case is implemented: **TC-SHOT-01** by T2 (`159083d`), **TC-SHOT-02 to 06, 14 and 14b** by T7 (`4627251`), **TC-SHOT-07 to 09** by T8 (`8fe11bc`), **TC-SHOT-10 to 12** by T9 (`3f46f96`) and **TC-SHOT-13** by T10 (`22a204b`). T11 (`90bbcd6`) completed the section. The file is `tests/e2e/product-screenshots.test.ts`. Each case's scope is in the spec ("Mock E2E plan") and the design (section 16).

**The seams.** `__MOCK_BG__` (a hero image); `__MOCK_HERO_SCREEN__` (new: only the screen region is busy); `__MOCK_COMPOSITE_FAIL__` (new: the pure HTML check fails); `__MOCK_HERO_SCREEN_OFFSET__` (Amendment A1, new: the synthetic screen is drawn off the contract region, so the stamped `composites[].rect` differs from the region). **Group B E2E (TC-SHOT-07 onwards) must assert the stamped `rect`, not the region:** under `__MOCK_HERO_SCREEN_OFFSET__` the two differ. The mock suite proves the mechanism with mock replies; it makes no real model or image call (NFR-11).

**TC-LOOK-10 (§AF) now expects six cards** (025 T2): the five existing looks keep their behaviour, and `device-screen` is shown disabled until a screenshot is uploaded.

| Case        | Status            | What it checks                                                                                                                                      |
| ----------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-SHOT-01  | implemented (T2)  | `device-screen` is disabled without a screenshot; the card reads "Needs a product screenshot" (AC-06)                                               |
| TC-SHOT-02  | implemented (T7)  | A PNG uploads to the private bucket and returns a key, never a URL (AC-09)                                                                          |
| TC-SHOT-03  | implemented (T7)  | An SVG named .png, a GIF and a file over the limits are 400 (AC-09)                                                                                 |
| TC-SHOT-04  | implemented (T7)  | A 600 by 400 screenshot is 400 and stores nothing (AC-09)                                                                                           |
| TC-SHOT-05  | implemented (T7)  | Another team's key, and a key that is not yours, are 404 on the preview (AC-09)                                                                     |
| TC-SHOT-06  | implemented (T7)  | Each 400 of FR-11 on `POST /api/briefs`, and a valid brief stores `compositeSource` (AC-10)                                                         |
| TC-SHOT-07  | implemented (T8)  | A kept generation stores one canonical element and the token, and a stamp with the detected rect (AC-13, AC-16)                                     |
| TC-SHOT-08  | implemented (T8)  | A render that fails the composite check is EXPORTED as classic with `composite-not-rendered` and the notice (AC-13)                                 |
| TC-SHOT-09  | implemented (T8)  | A busy screen gives `composite-not-blank`: classic over the same image, no composites (AC-13)                                                       |
| TC-SHOT-10  | implemented (T9)  | A refine keeps the canonical element and the composites entry with its rect (AC-14)                                                                 |
| TC-SHOT-11  | implemented (T9)  | An inline edit that deletes or moves the element is saved with the canonical element restored (AC-14)                                               |
| TC-SHOT-12  | implemented (T9)  | A failed placement fails the refine with the named error and writes no revision; a refine that replaces the image drops the composite (AC-14)       |
| TC-SHOT-13  | implemented (T10) | The wizard field is Path B only; `device-screen` is disabled until an upload; the body carries `compositeSource`; the draft resumes with it (AC-15) |
| TC-SHOT-14  | implemented (T7)  | Resume keeps the screenshot; Discard deletes the object in MinIO; a generate keeps it (AC-10)                                                       |
| TC-SHOT-14b | implemented (T7)  | Deleting the last draft of a brief deletes its screenshot object (AC-10)                                                                            |

| Criterion                                           | Where it is checked                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| AC-06 unavailable without a source (FR-08)          | TC-SHOT-01 (implemented); unit tests                                                 |
| AC-07 the probe and the pass rule (FR-09)           | unit `lookProbe.test.ts`, `lookCheck.test.ts`; OP-025 (operator, outside this suite) |
| AC-09 upload (FR-10)                                | TC-SHOT-02 to TC-SHOT-05 (implemented); unit header parser                           |
| AC-10 the brief (FR-11)                             | TC-SHOT-06, TC-SHOT-14, TC-SHOT-14b (implemented)                                    |
| AC-13 generation (FR-15)                            | TC-SHOT-07 to TC-SHOT-09 (implemented)                                               |
| AC-14 re-renders (FR-16)                            | TC-SHOT-10 to TC-SHOT-12 (implemented)                                               |
| AC-15 the wizard (FR-17, NFR-09)                    | TC-SHOT-13 (implemented)                                                             |
| AC-16 nothing stored but the token (NFR-05, NFR-08) | TC-SHOT-07 (implemented); unit guard (no writer stores a screenshot URL)             |

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

Last green run: **391 passed / 3 skipped / 0 failed / 0 flaky** (~9.0 min) on 2026-10-13 (`v2` at `b36be415`, change 008 wave-2 gate — fresh test DB, clean `.next`; the 3 skips are TC-REG-H11a/b/c). Earlier: **383 / 3 / 0 / 0** at the 008 wave-1 gate (2026-10-13, `d3c5685a`); **369 passed / 3 skipped / 0 failed / 0 flaky** (~7.7 min) on 2026-10-11 (`v2`, change 012 wave-3 gate). Earlier: **211 passed / 0 failed / 0 flaky / 4 intentional skips** (~3.2 min) on 2026-09-28 (`v2`, change 004 T21 — fresh test DB, clean `.next`); the T21 follow-up then added TC-FID-16/17 (3 cases, expected full count **214 / 4 skipped**), verified in a targeted run of `agui-refinement` + `refine-not-applied` (38/38) rather than a full run (earlier: 145/4 on 2026-07-17, `async-draft-actions` finalize; earlier baselines: 135/4 on 2026-07-14, 80/4 on 2026-06-30, skeleton 19/19 on 2026-06-23).

CI gate: **`.github/workflows/e2e.yml`** runs the whole suite (§A–§AA, including §K, plus 015's `settle-race.test.ts`) with mocks on every PR and on pushes to `v2` and `main` (the fork, since change 013). It was red on `v2` from 014 wave 1 (run 37974533639) until change 015 fixed the refine settle race (green at run 38195143494, 2026-10-12); the 008 wave-1 run 38304451112 at `d3c5685a` was green too. After a push, check `gh run list --branch v2`, not just the local gate. To enforce it, mark the `e2e` check **required** in the `main` branch-protection settings.

---

## 9. Coverage traceability

| Finding(s)                                                             | Guarded by                                                                             |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| H1 ACP/MCP auth                                                        | TC-ACP-01/02/03                                                                        |
| H2 IDOR                                                                | TC-AGUI-06, TC-LIB-01, ownership asserts across D/E/F                                  |
| H3 library leak                                                        | TC-LIB-01                                                                              |
| H4 admin gating                                                        | TC-AUTH-05, TC-PUB-09, TC-BK-08, TC-RES-05                                             |
| H5 publish button                                                      | TC-UI-03                                                                               |
| H7 atomicity                                                           | TC-PUB-02/03, TC-REG-H7a/b/c                                                           |
| H8 upload validation                                                   | TC-BK-07                                                                               |
| H9 indexes                                                             | TC-REG-H9                                                                              |
| H10 storage                                                            | TC-BK-04, TC-GEN-05, TC-PUB-08, TC-LIB-05, TC-ACP-05, TC-REG-H10a/b/c, TC-UI-04        |
| H11 puppeteer                                                          | TC-REG-H11a/b/c                                                                        |
| H12 scheduler                                                          | TC-PUB-04, TC-REG-H12a/b/c                                                             |
| H13 /api/me                                                            | TC-AUTH-04                                                                             |
| M1 atomic default                                                      | TC-BK-02, TC-PROV-06                                                                   |
| M4 soft-delete resolve                                                 | TC-RES-04                                                                              |
| M5 artifact sync                                                       | TC-BK-06                                                                               |
| M6 ACP validation                                                      | TC-ACP-03                                                                              |
| M9 middleware prefix                                                   | TC-AUTH-07                                                                             |
| M10 key prefix mask                                                    | TC-PROV-04                                                                             |
| M11 bounded lists                                                      | TC-RES-06                                                                              |
| M12 brief validation                                                   | TC-GEN-03/04                                                                           |
| L1 IG header / system user                                             | TC-ACP-04                                                                              |
| L2 shared helpers                                                      | TC-REG-L2                                                                              |
| Known Issue (oversized template)                                       | TC-GEN-06                                                                              |
| Change 004 refine fidelity (AC-08 → AC-20b)                            | §U TC-REJ-01…04, §V TC-FID-01…17, T18/T19 in `refine-not-applied.test.ts` (see §V map) |
| Change 005 skipped-background notice (AC-01, AC-08 → AC-11)            | §BG TC-BG-01…10, TC-GEN-05 (see §BG map)                                               |
| Change 012 per-channel captions (AC-12 → AC-24)                        | §W TC-CAP-01…20, TC-ASYNC-10 (see §W map)                                              |
| Change 008 model selection, wave 1 (AC-15 → AC-23)                     | §Y TC-MODEL-01…12, `a11y` /team axe (see §Y map)                                       |
| Change 008 model selection, wave 2 (AC-27 → AC-31, AC-33)              | §Y TC-MODEL-13…20, `a11y` /drafts/[id] axe (see §Y wave-2 map)                         |
| Change 020 Create post button off the draft page (AC-01, AC-02)        | `create-post-button.test.ts` AC-01, AC-01b, AC-02b (see the 020 update note after §X)  |
| Change 009 hero imagery (AC-04, AC-05, AC-12 to AC-19, AC-21)          | §AA TC-HERO-01…16, `a11y` draft page and `/brief` axe (see §AA map)                    |
| Change 030 stale-headline badge (AC-11 → AC-19)                        | §AH TC-HL-01…10, `a11y` "AC-19: a draft page with the stale-headline badge" (see §AH)  |
| Change 031 personal image generation key (AC-12)                       | §AI TC-IK-01…06 (see §AI)                                                              |
| Change 031 Apply to image (AC-38 → AC-40)                              | §AM TC-AP-01…10 (see §AM)                                                              |
| Change 031 post fonts (AC-17, AC-18, AC-22 → AC-24)                    | §AJ TC-PF-01…08 (see §AJ)                                                              |
| Change 031 briefing design-rule upgrade (AC-27, AC-28)                 | §AK TC-BU-01…05 (see §AK)                                                              |
| Change 031 assistants: schedule styles, brand-kit fonts (AC-30, AC-32) | §AL TC-AS-01…06 (see §AL)                                                              |

> Items with no behavioral surface (M2 init race, M3 stdin, M7 polling, M8 crypto guards, M13 dead code) are best covered by unit tests; M7 polling can optionally be a UI test (draft auto-refresh while `IN_PROGRESS`).

### AH. Stale-headline badge (`headline-badge.test.ts`, change 030 T5 — AC-11 to AC-19)

Mock mode (`MOCK_AI` + `MOCK_PUPPETEER`), the seeded team, serial. The mock design paints the headline it was given in one element, and the check under `MOCK_PUPPETEER` is the text stand-in (`src/lib/renderedText/mockCheck.ts`), so a mock generation stamps `painted`. The headline is changed through `PATCH /api/drafts/[id]`. Every `page.waitForResponse` is created before its trigger. The a11y suite gains one case (`AC-19: a draft page with the stale-headline badge`, axe on a draft page with the badge shown).

**The seams** (dormant in prod). `__MOCK_HEADLINE_HIDDEN__` in the brief topic (the design carries it as a comment and the check says `not-visible`); `POST /api/test/draft-rendered-text` (`{ draftId }`: nulls `renderedText` on the draft and its revisions, for a draft from before 030; 404 in production and without `MOCK_AI`); the analytics seam `GET/DELETE /api/test/analytics-events`. The mock `regenerate-copy` returns the same headline the design painted, so TC-HL-02 first writes an older painted headline into the stamp through the test DB.

| Case     | AC        | What it checks                                                                                                                                    |
| -------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-HL-01 | AC-11     | A headline edit shows the stale badge, with the old headline, Edit inline and Regenerate design                                                   |
| TC-HL-02 | AC-12     | Regenerate headline (`regenerate-copy` with `{ headline: true }`) shows the badge                                                                 |
| TC-HL-03 | AC-13     | An inline edit that paints the new headline clears the badge; so does Regenerate design (clicked from the badge)                                  |
| TC-HL-04 | AC-14     | `__MOCK_HEADLINE_HIDDEN__` shows the `unconfirmed` badge with `not-visible`; it stays unconfirmed after a headline edit                           |
| TC-HL-05 | AC-15     | A draft from before 030 (the seam) shows no badge after an edit                                                                                   |
| TC-HL-06 | AC-15, 16 | Restoring the pre-edit revision keeps the stale badge; restoring a revision with a null stamp brings none                                         |
| TC-HL-07 | AC-17     | With a SCHEDULED post, the badge shows the scheduled line                                                                                         |
| TC-HL-08 | AC-18     | The publish dialog on the draft page shows the line when stale and none when fresh; Confirm stays enabled                                         |
| TC-HL-09 | AC-18     | The library list item carries `headlineState`; the dialog on the library page shows the line; the library shows no badge                          |
| TC-HL-10 | AC-19     | `draft.headline_edited` once per change with `via` and `state` and no text, none for an unchanged save; `publish.settled` carries `headlineState` |

Adopting a rejected render (AC-16, second half) is covered by the unit tests of the stamp writers, not here.

### AI. Personal image generation key (`image-key.test.ts`, change 031 T5 — AC-12)

Mock mode (`MOCK_AI` + `MOCK_PUPPETEER`), a fresh team per case, serial. The acting user is the seeded super admin; the personal key is removed after each case. The route is still `/api/me/openai-key`. The card is driven at `/settings` (heading "Image generation key", input "Image generation API key"); the connected line is `data-testid="image-key-summary"` ("Gemini …a1b2"). Every `page.waitForResponse` is created before its trigger.

**The seams** (dormant in prod). `__MOCK_BG__` in the brief topic (the decision is "needed"; the real resolver picks the provider, only its `generateImage` is swapped for a fixture PNG); `__MOCK_BG_PERSONAL_FAIL__` (the personal tier's image call throws and the team tier succeeds).

| Case     | AC    | What it checks                                                                                                                      |
| -------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------- |
| TC-IK-01 | AC-12 | An OpenAI key connects through the card; the card shows "OpenAI" next to the suffix; the key is never returned                      |
| TC-IK-02 | AC-12 | A Gemini key connects through the card; the card shows "Gemini" next to the suffix; the route reports `provider: gemini`            |
| TC-IK-03 | AC-12 | An `sk-ant-` key, a random string and a short `AIza` key are 400 with the message naming both kinds, and nothing is stored          |
| TC-IK-04 | AC-12 | A personal Gemini key with `__MOCK_BG__` serves the image; the draft records `{ tier: personal, provider: gemini }`; no notice      |
| TC-IK-05 | AC-12 | `__MOCK_BG_PERSONAL_FAIL__` falls back to the team provider; the draft page shows the fallback notice naming Gemini; no skip notice |
| TC-IK-06 | AC-12 | Disconnect (through the confirm dialog) removes the key; the card returns to "Not connected"                                        |

Locators adapted for the card and `/team` wording: `surfaces.test.ts` ("Image generation key" heading and "Image generation API key" label), `team-image-default.test.ts` ("Teammates without a personal image key ...").

### AJ. Post fonts (`post-fonts.test.ts`, change 031 T8 — AC-17, AC-18, AC-22, AC-23, AC-24)

Mock mode (`MOCK_AI` + `MOCK_PUPPETEER`), a fresh team per case, serial. The acting user is the seeded super admin. The picker is driven at `/admin/brandkits` (Edit; the combobox "Search Google Fonts", the select "Sinhala font"; the date line is "Font list from {date}"). Every `page.waitForResponse` is created before its trigger.

**The seams** (dormant in prod). A font whose name carries `__MOCK_FONT_MISSING__` is let into the font plan under `MOCK_PUPPETEER` only (`src/lib/fonts/plan.ts`), and the mock renderer reports it missing, so the draft page shows `data-testid="font-notice"`. The kit PATCH refuses that name, so TC-PF-06 writes the kit's Sinhala font straight to the test database; so does TC-PF-08 for a non-catalogue (FONT artifact) entry.

| Case     | AC        | What it checks                                                                                                                     |
| -------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| TC-PF-01 | AC-24, 18 | Typing "instr" lists Instrument Serif; adding and saving stores it with the computed Google URL; the chips read Heading and Body   |
| TC-PF-02 | AC-24     | The Sinhala picker lists "None (system font)" then exactly the Sinhala families from `/api/fonts?script=sinhala`; one saves        |
| TC-PF-03 | AC-24     | The kit page shows "Font list from {date}", the date the kit GET returns                                                           |
| TC-PF-04 | AC-17     | An unknown family and a Sinhala value whose family lacks the script are 400, and nothing is written                                |
| TC-PF-05 | AC-22     | A kit with a Sinhala font generates a draft whose stored HTML has the marked `data-post-fonts` link and the stack entry; no notice |
| TC-PF-06 | AC-23     | `__MOCK_FONT_MISSING__` shows the fallback-font notice on the draft page                                                           |
| TC-PF-07 | FR-21     | Choosing "None (system font)" and saving clears the Sinhala font                                                                   |
| TC-PF-08 | AC-17     | A FONT artifact entry (a non-catalogue name and URL) survives a save through the editor unchanged                                  |

Locators adapted: `surfaces.test.ts` (the kit edit case) names the font combobox, because the Sinhala picker is a second combobox in the panel.

### AK. Briefing design-rule upgrade (`briefing-upgrade.test.ts`, change 031 T10 — AC-27, AC-28)

Mock mode (`MOCK_AI` + `MOCK_PUPPETEER`), a fresh campaign per case, serial. The route is `POST /api/campaigns/[id]/briefing/upgrade` (team admin only); the 007 `MOCK_AI` seam answers it, so the real detector and validation run and no model is called. The recorder (`GET/DELETE /api/test/model-calls`) shows a `briefing-upgrade` record on the `ASSISTANT_BRIEFING` surface. Every `page.waitForResponse` is created before its trigger. The kit host stays covered by §AC, unchanged.

| Case     | AC    | What it checks                                                                                                                             |
| -------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| TC-BU-01 | AC-28 | In "Edit as new version" two vague phrases are flagged; Upgrade posts `{ text, baseVersion: 1 }` to the briefing route and lists two edits |
| TC-BU-02 | AC-28 | Accepting an edit changes the textarea; "Save as new version" makes version 2, active, equal to the textarea                               |
| TC-BU-03 | AC-28 | A team editor gets 403 from the route and the recorder has no `briefing-upgrade` entry                                                     |
| TC-BU-04 | AC-28 | A stale `baseVersion` is 409 `STALE_BASE` with the active version and no recorder entry; the right base is 200                             |
| TC-BU-05 | AC-28 | One `briefing-upgrade` record on `ASSISTANT_BRIEFING`, and no `kit-upgrade` record                                                         |

### AL. The assistants: schedule post styles and brand-kit fonts (`assistants-031.test.ts`, change 031 T11, T12 — AC-30, AC-32)

Mock mode (`MOCK_AI` + `MOCK_PUPPETEER`), a fresh campaign per case, serial. The panel is driven at `/campaigns/[id]` ("Draft with AI", then "Please schedule a short series of posts."). The `MOCK_AI` schedule reply has two rows: "Mock scheduled post 1" with the active style `launch`, and "Mock scheduled post 2" with the bad key `flash-sale`, which the parser replaces with the campaign's default style (or General). No model is called. Every `page.waitForResponse` is created before its trigger. TC-AS-04 to TC-AS-06 (the brand-kit assistant) follow in T12.

| Case     | AC    | What it checks                                                                                                                                                                                                                                          |
| -------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-AS-01 | AC-30 | Each plan row has a "Post style" select (row 1 reads `launch`), and the plan shows no goal text                                                                                                                                                         |
| TC-AS-02 | AC-30 | With a campaign default of Event, the bad key row shows Event and the line "Suggested style flash-sale is not available; using Event"                                                                                                                   |
| TC-AS-03 | AC-30 | After the user changes the replaced row to Tip, Schedule posts `postStyle` and no `goal`, and the queue entries carry `launch` and `tip`                                                                                                                |
| TC-AS-04 | AC-32 | The brand-kit assistant accept view shows "Current: Roboto → Proposed: Playfair Display" and the Sinhala row; with `__MOCK_FONT_UNKNOWN__` the body reads "Zzyzx Mock Sans is not in the font list and won't be applied", its checkbox off and disabled |
| TC-AS-05 | AC-32 | "Apply to brand kit" posts once to `/assistant/apply`; the kit's fonts become Playfair Display and Inter (computed Google URLs) and `scriptFonts` is `{ sinhala: "Noto Sans Sinhala" }`                                                                 |
| TC-AS-06 | AC-32 | The new voice version carries `previousFonts` (Roboto, Lora), and History shows "Fonts before this version: Roboto, Lora"                                                                                                                               |

TC-AS-04 to TC-AS-06 (T12) create a kit with two fonts through the API and drive the "Extract from references" drawer; the `MOCK_AI` brand-kit reply proposes heading Playfair Display, body Inter and a Sinhala font. Unit: `brandKitBlock.test.ts` and `brandKitApply.test.ts` (AC-31).

Adapted: `campaign-scheduling.test.ts` (F4 chat case) sends `postStyle` instead of `goal`; `briefingAssistant.test.ts` no longer expects a defaulted `goal`.

### AM. Apply to image (`apply-text.test.ts`, change 031 T15 — AC-38, AC-39, AC-40)

Mock mode (`MOCK_AI` + `MOCK_PUPPETEER`), the seeded team, serial. The mock design paints its headline in one element, and the in-render check is the text stand-in (`src/lib/renderedText/mockCheck.ts`). A stale draft is made by changing the headline through `PATCH /api/drafts/[id]`. The button is "Apply the new headline to the image" (the badge); the confirm dialog is titled "Apply to image". Every `page.waitForResponse` is created before its trigger.

**The seams** (dormant in prod). A new headline carrying `__MOCK_APPLY_NOT_PAINTED__` (the new text is not painted), `__MOCK_APPLY_OLD_PAINTED__` (the old text still is) or `__MOCK_APPLY_RENDER_FAIL__` (the render throws) forces that verdict; the 030 seams (`__MOCK_HEADLINE_HIDDEN__`, `POST /api/test/draft-rendered-text`, `GET/DELETE /api/test/analytics-events`) make an `unconfirmed` and an `unknown` draft and read the events. A held claim is made through the test DB.

| Case     | AC           | What it checks                                                                                                                                                                        |
| -------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-AP-01 | AC-38        | Apply on a stale draft shows the exact confirm text; then the badge is gone, the stamp is `{ text: new, verified: true }`, the HTML holds the new headline, and one revision is added |
| TC-AP-02 | AC-38        | Undo after Apply restores the previous `htmlContent` byte for byte, and the badge comes back                                                                                          |
| TC-AP-03 | AC-39        | `__MOCK_APPLY_NOT_PAINTED__` ends with the `not-painted` sentence on the page, no new revision, the HTML unchanged                                                                    |
| TC-AP-04 | AC-39        | `__MOCK_APPLY_OLD_PAINTED__` ends with the `old-still-painted` sentence, no new revision                                                                                              |
| TC-AP-05 | AC-39        | `__MOCK_APPLY_RENDER_FAIL__` ends with the `render-failed` sentence, no new revision                                                                                                  |
| TC-AP-06 | AC-39        | No Apply button on a fresh, an unconfirmed or an unknown draft; the server refuses the last two with 422 `not-stale`                                                                  |
| TC-AP-07 | AC-39        | While an Apply holds the claim, Apply and Regenerate design get 409, the preview shows "Applying headline", and the badge button is disabled                                          |
| TC-AP-08 | AC-39        | A headline shown twice (seeded) is 422 `ambiguous`: the sentence in a toast, no claim, no revision, the badge still shown                                                             |
| TC-AP-09 | AC-40        | One `draft.text_applied` per verdict (`ok`, then `failed` with `failure: ambiguous`), `draft.headline_edited` with `via: apply`, and no headline text in any payload                  |
| TC-AP-10 | AC-40, FR-35 | No "Beta" chip while the measured rate is at or above 80% (`APPLY_TEXT_BETA` is false); the chip itself is covered by the unit test `applyTextRoute.test.ts`                          |

Unit: `applyTextRoute.test.ts` (each refusal is 422 with nothing claimed; 409; the 202 path; the event once per verdict; the verdict fails closed on a null absent check) and `applyTextCoverage.test.ts` (every `APPLY_FAILURES` value is carried by the event). Render: `tests/render/applyCheck.test.ts` (T14).
