# bistec-studio — Session Handoff

**Date:** 2026-07-07 (latest: per-user Claude OAuth tokens — see top section below)
**Repo:** https://github.com/bistec-oss/studio (formerly `bistec-oss/designer`)
**Branch:** `main`
**Specclaw change:** `marketing-post-studio-v1`

---

## 2026-07-07 (latest) — Per-user Claude OAuth tokens (CLI mode)

**Branch: `main`.** Each app user can now connect their **own Claude account**: they run `claude setup-token` on their own machine (no official third-party "Sign in with Claude" OAuth exists — the paste flow is the supported mechanism) and paste the `sk-ant-oat01-…` token at the new **`/settings`** page. In CLI mode (`DESIGN_PROVIDER=cli`) every Claude call the user triggers — copy, Path A/B design, regenerate copy/design, refine (incl. the background decision), briefing chat/enhance, post-brief enhance — then runs on **their** subscription. Gates: tsc clean, lint 0 errors (9 pre-existing warnings), **135/135 unit** (37 new), **full E2E 109 passed / 0 failed** (7 new §O cases in `settings-claude-token.test.ts`), Docker image builds.

1. **Schema** (migration `20260707164417_user_claude_token`): `UserClaudeToken` 1:1 with `User` — `encryptedToken` (AES-256-GCM via `crypto.ts`), display-only `keyPrefix` (`…last4`), `status ACTIVE|INVALID`, `lastValidatedAt`. Mirrors the `AvailableProvider` secret pattern; ciphertext never leaves the server.
2. **AsyncLocalStorage auth context, not signature threading.** `src/lib/agent/claudeAuth.ts` (ALS, zero app imports) + `src/lib/agent/userToken.ts` (resolver): routes wrap their model-calling span in `withUserClaudeAuth(user.userId, fn)`; the single spawn site `runClaudeCli` (`claudeCli.ts`) reads `currentClaudeAuth()`. Explicit threading would have touched 14+ signatures incl. the provider-agnostic `CopyProvider` interface. **Fail-safe default:** any caller that never enters the context — the scheduler worker, MCP/ACP, scripts — uses the shared credential, which is exactly the product decision (scheduled generations must never fail on a user's expired token; MCP/ACP are M2M).
3. **Precedence per `claude -p` spawn:** ALS user token → shared `CLAUDE_CODE_OAUTH_TOKEN` → developer's logged-in session. Token travels via child env, never argv. `opts.authToken` is an explicit override used only by save-time validation (bypasses ALS, never retries).
4. **Retry-once on auth failure:** a non-zero exit is now a typed `ClaudeCliError` (exit code + stderr/stdout); `isClaudeAuthFailure()` (exported, conservative regex — timeouts/ENOENT/buffer are plain `Error`s and never match) triggers: mark the row INVALID (`updateMany`, idempotent) → retry the same call ONCE on the shared credential so the user's work completes. Second failure propagates; non-auth failures never retry.
5. **API:** `GET/PUT/DELETE /api/me/claude-token` (all `withAuth`, self-service, keyed to the session user). PUT: zod shape guard (`sk-ant-oat01-` + ≥20 chars) → `validateClaudeToken` — live `claude -p` haiku ping in CLI mode (fail closed), `mockClaudeTokenValidation` seam under `MOCK_AI` (token containing "invalid" → 422), `{ok, skipped}` in API mode (stored dormant) — → upsert. `GET /api/me` now also returns `cliMode` + masked `claudeToken` state (threaded through `useCurrentUser`).
6. **UI:** `/settings` page (new nav item, all roles) with `ClaudeTokenCard` — status pill, numbered `claude setup-token` instructions, password-type paste field, Connect/Replace/Disconnect (`useConfirm`), amber reconnect banner on INVALID, API-mode informational note. `ClaudeTokenPrompt` — dismissible post-login banner in `AppShell` (CLI mode only), per-user + per-state dismissal (`localStorage`), so a token going INVALID re-surfaces it.
7. **Docker:** the runner stage now installs the **Claude Code CLI** (`npm i -g @anthropic-ai/claude-code`) + a writable `HOME=/home/nextjs` — the VPS can run `DESIGN_PROVIDER=cli`. Side effect: **scheduled generation in the container now works in CLI mode too** (shared token; previously documented as API-mode-only).
8. **Env repair on this machine (not code):** `docker-compose.yml`'s MinIO pin bumped `RELEASE.2024-10-13` → **`RELEASE.2025-09-07T16-13-09Z`** — the volume's on-disk format is now "xl meta version 3" (written when a newer MinIO ran against it during the 2026-07-07 prod-standalone verification), which the old pin can't read (crash-loop: `decodeXLHeaders: Unknown xl meta version 3`). A wipe would have destroyed the `bistecprod` service account, so the pin moved forward instead. Also: this machine's `node_modules` was synced (`npm install`), 4 pending migrations applied, and the stale E2E test DB dropped + re-seeded (its admin predated SUPER_ADMIN).

> **⚠️ Deploy:** `npx prisma migrate deploy` (1 new migration) → rebuild the Docker image (CLI + MinIO pin). No new env vars — `CLAUDE_CODE_OAUTH_TOKEN` is re-documented as the shared fallback. Personal tokens are CLI-mode-only; API mode (`claude-html`) keeps shared API keys for everything.
> **Not runtime-verified with a real token:** the live validation ping + a real user-token generation + the revoked-token retry path need a real `claude setup-token` token on a CLI-mode dev server (unit + mock-E2E cover the logic; see the manual smoke checklist in the plan).

---

## 2026-07-07 (latest) — Post-brief "Enhance with AI" + full-screen export preview (lightbox)

**Branch: `main`** — two features, one session. Gates: tsc clean, lint 0 errors (9 pre-existing warnings), 98/98 unit, briefing-assistant E2E suite 7/7 (full suite not re-run for the UI-only lightbox change).

1. **Enhance with AI on the brief wizard's Content step** (commit `d460df9`). `enhancePostBrief()` in `src/lib/campaign/briefingAssistant.ts` is the per-POST twin of the campaign-briefing `enhanceBriefing()`: same mode-agnostic Sonnet call (`runBriefingModel` — Anthropic SDK in API mode, `claude -p` with `CLAUDE_CODE_OAUTH_TOKEN` in CLI mode), grounded in what generation itself will use — the brand voice via `resolveBrandKit(campaignId, brandKitId)` (the brief's explicit kit selection wins) plus the active campaign briefing + source documents when a campaign is selected. Prompt targets one post (~40–120 words, explicit key message + CTA) and can draft from just the topic. `buildCampaignContext()` was generalised to optional `campaignId`/`brandKitId` (campaign-briefing callers unchanged).
   - **Route: `POST /api/briefs/enhance`** — **`withAuth`, not `withAdmin`** (editors write briefs; the campaign-briefing enhance stays admin-only). Body `{topic, content, goal?, tone?, campaignId?, brandKitId?}`; 400 when topic AND content are blank; 404 on unknown campaign; reuses the `buildMockBriefingEnhance` MOCK_AI seam.
   - **UI:** `ContentStep.tsx` gains the button (enabled once topic or brief text exists) with the same Before / AI suggestion / Accept / Discard review flow as `CampaignBriefingSection` — the rewrite only reaches the brief field on Accept. The wizard page threads `campaignId`/`brandKitId` through as props.
   - **E2E:** new §N case in `tests/e2e/briefing-assistant.test.ts` (editor access, mock rewrite, topic-only drafting, 400 guard, campaign 404).
2. **Full-screen export preview** (`src/components/ui/ImageLightbox.tsx`). New shared lightbox on the same Radix Dialog base as `Modal` (focus trap, Esc, click-outside free): near-opaque blurred backdrop, export fitted to the viewport, glass caption bar with topic + `dimensionsLabel()` (JetBrains Mono) and a **Download** button (fetch→blob→save with a slugged filename — a plain `<a download>` would navigate since MinIO is another origin). Wired in two places: the **draft page** Preview panel image (click-to-open, hover `Maximize2` hint, `cursor-zoom-in`) and **library tiles** (`PostCard` — hover/focus expand icon top-right that opens the lightbox WITHOUT navigating; tile click still goes to the draft). No-export tiles are unchanged. Note: tiles crop with `object-cover`, so the lightbox is where portrait posts show uncropped.

Also this session (ops, not committed as code): verified the **production standalone server** runs locally the way the VPS image does (`npm run build` → copy `.next/static` + `public` into `.next/standalone` → `node server.js`). The `env.ts` production gate correctly refused the dev `minioadmin` creds — resolved by creating a MinIO service account (`bistecprod`, readwrite, via `mc admin user add` in the container; dev creds/`.env`/`.env.test` untouched) and passing it as process env. Login page + proxy cookie-gate verified (unauthenticated API POSTs 307 → `/login`).

---

## 2026-07-07 — Framework upgrade: Next.js 16.2 + React 19.2 + tooling majors

**Branch: `main`** — phased upgrade (safe bumps → Next/React → tooling majors), each phase individually gated. Final gates: tsc clean, lint 0 errors, 98/98 unit (vitest 4), `next build` (Turbopack) green, full E2E green.

1. **Next.js 14.2 → 16.2, React 18.3 → 19.2.** Key migration points baked into the code:
   - **Async request APIs:** `headers()` is awaited in `src/lib/auth.ts`; route-handler `params` is a `Promise` — **`withAuth` (handler.ts) resolves it centrally**, so all wrapped handlers keep synchronous `{ params }` destructuring. Only the two `requireRole`-direct routes (`brandkits/[id]/prompts/generate|improve`) await `ctx.params` themselves.
   - **`src/middleware.ts` → `src/proxy.ts`** (function `proxy`; nodejs runtime). Same cookie-presence gate.
   - **`next.config.mjs`:** `experimental.serverComponentsExternalPackages` → top-level `serverExternalPackages`; new **`experimental.proxyClientMaxBodySize: '16mb'`** — Next 16 buffers request bodies at 10MB when a proxy exists and silently TRUNCATES larger ones, which 500'd multipart uploads before `validateUpload()` could reply 400 (the app-level 10MB cap stays authoritative).
   - **Turbopack is the default builder** (dev + build). No custom webpack config existed, so no flag needed.
   - **`next lint` is removed** → `eslint.config.mjs` flat config (`eslint .`), eslint 9 + eslint-config-next 16. The new `react-hooks/set-state-in-effect` rule is downgraded to `warn` (6 pre-existing hydration-init patterns in ThemeProvider etc. — refactor to `useSyncExternalStore` later).
   - React 19 types: `useRef<T>(null)` now yields `RefObject<T | null>` (brief wizard file-input ref).
   - Next 16 allows only ONE `next dev` per project (lockfile) — stop the :3000 dev server before `test:e2e:serve`.
2. **Tooling majors:** lucide-react 1.x (**brand icons removed** — Instagram/LinkedIn are now inline SVGs in `admin/settings/page.tsx`), p-limit 7 (ESM-only; worker esbuild bundle verified), vitest 4, lint-staged 17, @types/node 24. `test:e2e:serve` now uses `dotenv-cli` (Node 24 rejects `--env-file` inside NODE_OPTIONS).
3. **Test-infra fix surfaced by the faster stack:** PUBLISH_NOW E2E was flaky because `Post.scheduledAt` is stamped from the **app clock** while the publish claim compares Postgres `now()` — Docker clock skew makes a due-now post momentarily unclaimable. The test now forces `scheduledAt` into the past before ticking (mirrors `makeDueAndTick`).
4. **Deferred majors (backlog, deliberately NOT upgraded):** Prisma 7, Tailwind 4, zod 4, ESLint 10, TypeScript 6, @anthropic-ai/sdk 0.110, openai 6, puppeteer-core 25. Each is an independent migration; land separately.

> **⚠️ Deploy:** `npm install`. Node ≥ 20.9 required (Docker `node:20-alpine` floats and satisfies it). No schema/migration changes.

---

## 2026-07-07 — Super-admin user management, username sign-in, AI briefing assistant, UI fixes

**Branch: `main`.** Gates: tsc clean, **98/98 unit tests** (26 new), full E2E green including two new suites (`user-management.test.ts`, `briefing-assistant.test.ts`). New deps: `pdf-parse` (v2), `mammoth`.

1. **Role hierarchy + super-admin** (migration `20260707065911`). `Role` enum gains `SUPER_ADMIN`; all checks go through **`hasRole` in `src/lib/roles.ts`** (pure module: `super_admin > admin > editor`) — never compare role strings directly. `withSuperAdmin` joins `withAuth`/`withAdmin` in `src/lib/api/handler.ts`; `useCurrentUser` exposes `isSuperAdmin` (and `isAdmin` is true for super-admins). The seeded admin is now SUPER_ADMIN (`scripts/seed-admin.mjs`); promote any account with `node --env-file=.env scripts/promote-super-admin.mjs <email-or-username> [new-username]`.
2. **Username sign-in** (better-auth `username()` plugin + `usernameClient()`, migration `20260707135943`: `User.username` unique + `displayUsername`). The login page takes a username (an email still routes through the legacy email flow); the dev/seed admin is **`adminBTG`**, seed editor `editor`. better-auth still requires an email internally — admin-created accounts get a synthetic `<username>@users.bistec.internal`. **Gotcha fixed along the way:** the `role` additionalField default had to be `"EDITOR"` (DB-enum casing) — lowercase made every app-instance sign-up 500.
3. **User management** (`/admin/users` page + `GET/POST /api/admin/users`, `PATCH /api/admin/users/[id]` — all `withSuperAdmin`). Create = name/username/role/initial password (via `auth.api.signUpEmail` then server-side role set; password shared out-of-band). Role toggle admin⇄editor; **"delete" = deactivate** (`User.disabled`): sessions revoked immediately, sign-in blocked by a `databaseHooks.session.create.before` hook (403), live sessions null out via `getCurrentUser`. Reactivation + password reset (`ctx.password.hash` + `internalAdapter.updatePassword`). Guards: no self-modify, no touching SUPER_ADMIN accounts, `super_admin` never assignable via the API. Self-signup remains enabled (EDITOR).
4. **Campaign source documents** (`CampaignDocument`, same migration; private MinIO bucket `campaign-docs`). `POST/GET /api/campaigns/[id]/documents` (+`[docId]` DELETE): PDF/DOCX/TXT/MD, 10MB cap, **max 5 per campaign**, parsed to text at upload (`src/lib/campaign/documents.ts` — pdf-parse v2 `PDFParse`/mammoth), per-file cap 60k chars, prompt-context cap 50k (`buildDocsContext`). **`next.config.mjs` gotcha:** `pdf-parse`/`pdfjs-dist` must be in `serverComponentsExternalPackages` — webpack RSC bundling breaks pdfjs otherwise.
5. **AI briefing assistant** (`src/lib/campaign/briefingAssistant.ts`). Mode-agnostic Sonnet helper (API `messages[]` / CLI transcript-folded `claude -p`, `MOCK_AI` seams `buildMockBriefingReply`/`buildMockBriefingEnhance`): **chat** `POST /api/campaigns/[id]/briefing/chat` (stateless; client owns the transcript; reply carries a ` ```briefing ` fenced block → `extractBriefingBlock` → `briefingDraft`) and **enhance** `POST .../briefing/enhance` (rewrite of the editor text, drafts from context when empty). Both admin-only, grounded in brand voice + docs + active briefing. UI: `BriefingAssistantPanel` (Drawer: doc upload/list/delete + chat + "Apply to editor") and an **Enhance with AI** before/after accept/discard flow in `CampaignBriefingSection`; applying only fills the textarea — saving stays the normal versioned flow.
6. **UI fixes.** `Modal.tsx` content is now `max-h-[calc(100dvh-2rem)]` with a scrollable body and pinned header/footer (fixes QueueEntryModal et al. on short screens); sidebar logo removed; topbar logo enlarged (26→40).

> **⚠️ Deploy:** `npm install` (new deps) → `npx prisma migrate deploy` (2 new migrations) → `node --env-file=.env scripts/promote-super-admin.mjs <your admin> adminBTG`. The `campaign-docs` bucket is auto-created by `initBuckets()`. No new env vars. E2E note: sign-in probes in tests need a **fresh cookie jar** — a stale session cookie makes better-auth 403 (`MISSING_OR_NULL_ORIGIN`) on sign-in POSTs.

---

## 2026-07-07 (latest) — Campaign briefing (versioned) + scheduled post generation

**Branch: `main`** — 7 phased commits (schema → briefing API/injection → core extraction → queue schema/API → runner/worker → UI → polish). Campaigns are now a content-production unit: they carry the "80% of the brief" and can generate posts on a schedule. Gates per phase: tsc clean, lint clean (2 pre-existing warnings), 72/72 unit tests, full E2E green (80 baseline + 12 new cases).

1. **Versioned campaign briefing** (`CampaignBriefing`, migration `20260707052036`) — free-text campaign context injected into **every** generation under the campaign (copy system prompt, Path A system prompt, Path B user message, background-decision prompt — refine is deliberately excluded), on top of the brand voice. Exact `BrandKitPrompt` pattern: one `isActive` row per campaign, `@@unique([campaignId, version])`, P2002 → 409, restore = re-activate. Routes: `GET/POST /api/campaigns/[id]/briefing` (+`[vid]/activate`); **writes admin-only**, reads editor-visible. Loader `getActiveCampaignBriefing()` (`src/lib/campaign/briefing.ts`) — deliberately NOT folded into `resolveBrandKit` (explicit-kit short-circuit would drop it). `PROMPT_VERSION` → `2026-07-07.1`.
2. **Headless generation core** — `src/lib/agent/generateDraft.ts` `generateDraftForBrief(brief, {templateId?})` is now the ONE brief→draft orchestrator (kit + briefing → copy → design → Draft create), and Path A got its `runPathBDesign` twin: `src/lib/agent/pathA.ts` `runPathADesign` + `assertTemplateMatchesBrief` (`PathATemplateError`). assemble-a/b + MCP `generatePost` are thin adapters — response shapes/error strings unchanged (E2E-verified). MOCK_AI seams sit inside the core, so headless callers stay testable.
3. **Scheduled generation queue** (`ScheduledGeneration`, migration `20260707054311`) — per-campaign planned posts: per-post specifics (topic/description/goal/tone/channels/size/path/template), a `generateAt`, and a `postAction`: **HOLD** (draft for review) / **SCHEDULE_PUBLISH** (auto-create SCHEDULED posts at `publishAt`) / **PUBLISH_NOW**. Routes under `/api/campaigns/[id]/queue` (list/create/edit/cancel/rerun). **Permissions: editors plan HOLD entries (owner-or-admin to edit); any auto-publish action is admin-only** (extends the POST /api/posts gate). zod cross-field rules in `src/lib/campaign/queue.ts` (TEMPLATE⇒templateId + kit/ratio match; SCHEDULE_PUBLISH⇒publishAt>generateAt).
4. **Worker** — `src/lib/scheduler/generationRunner.ts` mirrors the H12 publish runner: `FOR UPDATE SKIP LOCKED` claim, RUNNING lease in `nextRetryAt` (15 min), CLAIM_BATCH 2, MAX_RETRIES 3 with 20/40/60-min backoff, terminal FAILED re-runnable via the rerun route. The Brief is created once and reused across retries. Post-actions create **SCHEDULED Post rows** (PUBLISH_NOW = due-now) so publishing keeps its own H12 retry and a publish failure never re-runs a good generation. `worker.ts` now runs **two independent 60s loops** (publish + generation) so long generations can't delay due publishes.
5. **UI** — campaign detail page gains `CampaignBriefingSection` (Active/History/New Version + Restore, React Query; read-only for editors) and `ScheduledQueueSection` (queue table, status chips Queued/Generating/Generated/Failed/Cancelled, edit/cancel/re-run, "Open draft", 30s poll) + `QueueEntryModal` (kit-filtered template picker, datetime-locals, action radios disabled to HOLD for editors). Brief wizard `CampaignStep` shows the active briefing collapsed read-only.
6. **Test seams** — `POST /api/test/generation-tick` (prod-404 + MOCK_AI-gated + admin) drives the queue in E2E; `__FAIL_GEN_ALWAYS__` topic sentinel (`shouldMockGenerateFail`) makes the mock design agent throw. New `tests/e2e/campaign-scheduling.test.ts` (12 cases: versioning/rollback, RBAC matrix, HOLD/SCHEDULE_PUBLISH/PUBLISH_NOW worker flows incl. handover to the publish scheduler, retry→FAILED→rerun, concurrent-tick exactly-once, page UI smoke).

> **⚠️ Deployment caveats:** (a) run `npx prisma migrate deploy` (two new migrations). (b) **Scheduled generation in the Docker scheduler container requires API mode** — the image has no `claude` CLI, so under `DESIGN_PROVIDER=cli` every scheduled generation fails (the worker logs a loud startup warning). Use `DESIGN_PROVIDER=claude-html` + `ANTHROPIC_API_KEY` in the container, or run the worker on a host with the CLI in dev. (c) Scheduler-created briefs use `copyProviderKey: 'env-default'` (falls through to the default enabled COPY provider → env key), same as MCP.

---

## 2026-07-03 (latest) — Background-image pre-step, CLI OAuth token, Topic field, admin delete

**Branch: `main`** — committed as `08bc052` (`feat: AI background images, CLI OAuth token, brief Topic field, admin delete`). Four features + a second-machine environment/DB repair. Gates: tsc clean, lint clean (2 pre-existing warnings only), **55/55 vitest unit tests** (10 new), full E2E **80 passed / 0 failed / 4 intentional skips** (unchanged baseline).

1. **AI background images (Path B + refine) — `src/lib/agent/background.ts`.** A dedicated pre-step before the design call: Claude (**Haiku**, `modelForBackground()` in `config.ts`) answers strict JSON `{needed, prompt}` — biased **toward yes** at generation ("most posts need a background"), **neutral** at refine (only when the instruction asks for a new background) — then the server calls the resolved IMAGE provider (**gpt-image-2**, `OPENAI_API_KEY` env fallback), persists via `persistDataUrlImage(…, 'background')` (public IMAGES bucket), and injects the URL into the design/refine prompts as the full-bleed background layer (with a scrim-for-legibility instruction). Same behavior in CLI and API mode (one pipeline). Stored on **`Draft.imageUrl`** by `assemble-b`, `regenerate-design`, and refine's `commitRevision`.
   - **Never fails the pipeline**: no provider / declined decision / provider error / bad JSON → `null` → design proceeds with CSS/SVG as before. `MOCK_AI` skips the step (E2E stays deterministic; the mock-IMAGE-provider seam for TC-GEN-05 is still open).
   - Prompt rules ban text/logos in the raster (typography is the HTML layer's job). Portrait posts request `1024x1536`, square `1024x1024` (`imageSizeFor`; `ImageProvider.generateImage` gained an optional `size` param). Decision parser (`parseBackgroundDecision`) mirrors `parseConflict`'s fence-strip + outermost-`{}` pattern; unit-tested in `tests/unit/background.test.ts`.
2. **CLI OAuth token (`CLAUDE_CODE_OAUTH_TOKEN`).** `claudeCli.ts` forwards the token (from `env.ts`, validated) into every spawned `claude -p`, so headless CLI-mode generation no longer depends on the developer's interactive login. Generate with `claude setup-token` (~1-year lifetime, Pro/Max/Team/Enterprise). The spawn still strips `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` (they outrank the token in the CLI's precedence chain), so **switching to an API key later = set `ANTHROPIC_API_KEY` + `DESIGN_PROVIDER=claude-html` — no code change**. Documented in `.env.example`; `.env` has the empty placeholder awaiting the real token.
3. **Brief wizard "Topic" field.** The Content step now has a short required **Topic** input → `Brief.topic` (names the post in the library), and the big prompt textarea maps to **`Brief.description`** (previously the whole prompt was stuffed into `topic`, so library cards showed paragraph-length names). Both fields already flowed into Claude's prompts; **no API or schema change**. Review step shows the topic; step validation requires topic non-empty + prompt > 10 chars.
4. **Admin delete from the library.** New **`DELETE /api/drafts/[id]`** (`withAdmin`): one transaction deletes Posts (a SCHEDULED post is thereby cancelled) → DraftRevisions → Draft → the Brief when no other draft references it (no cascades exist on these relations). `PostCard` gets an admin-only trash button wired through `useConfirm()` + sonner toasts + React Query invalidation on the library page.
5. **This-machine environment + dev-DB repair** (fresh clone on a second device): `node_modules` was out of sync with the lockfile (74 packages added) + 2 unapplied migrations + stale Prisma client — the classic "Next.js error after pull" trio. Also the **MinIO volume was wiped** this session (the pinned `RELEASE.2024-10-13` image couldn't read a newer volume's `xl meta version 3` format — user chose wipe over pinning a newer image). Repairs: re-rendered the broken "Announcing bistec-studio" draft from stored `htmlContent` (721 KB PNG; its legacy expired-presigned `exportUrl` migrated to a modern object key), restored the 3 Bistec master logos via `refine-bistec-brandkit.mjs` (**script's `ASSETS_DIR` is now portable** — derives from `%APPDATA%`, override with `BISTEC_ASSETS_DIR`), and swept **9 orphan test briefs**. Final dev-DB state on this machine: **2 drafts + 2 briefs** ("Announcing bistec-studio" SQUARE + "House Standings" PORTRAIT), no orphans.

> **To activate the new features:** fill `CLAUDE_CODE_OAUTH_TOKEN=` and `OPENAI_API_KEY=` in `.env` (both placeholders exist). Without the OpenAI key the background pre-step logs "no image provider available" and generation proceeds exactly as before. Background generation is **not yet runtime-verified end-to-end** (needs the real keys) — the decision parser, prompts, and skip paths are unit-tested and the full mock E2E suite is green.

---

## 2026-07-03 (latest) — Dev-DB library cleanup (pruned test debris)

**Branch: `main`.** Housekeeping only — no code changes. After a CLI-mode (`DESIGN_PROVIDER=cli`) test session that generated a new draft, the dev DB was pruned down to two intentional drafts; the leftover 2026-06-24 test debris was removed.

- **Kept (2 drafts, both `EXPORTED`, Path B):** the **IRP 2nd-cohort announcement** (generated this session) and the **Q3 product launch** post — plus their 2 briefs.
- **Deleted (4 test drafts):** two "Hearts Talk speaker session" (Path A), the MS-Teams "Damian De Cruz" one (Path A), and "Hearts Talk: Spec-Driven Development" (Path A, was `IN_PROGRESS`) — together with their **1 post, 2 revisions, and 4 briefs**. Then swept **4 orphan test briefs** (no drafts attached: MS-Teams brief, 2× "Hearts Talk freeform launch", "precedence test topic xyz").
- **Final dev-DB state:** exactly **2 drafts + 2 briefs**, no orphans. Deletions ran in a `$transaction` with the two keeper drafts/briefs guarded by ID (no cascade exists on `Post`/`DraftRevision`/`Draft`→`Brief`, so children were deleted first). Dev-only data change — no schema/migration/code impact; the only 2026-06-24 template fixtures on disk ("Hearts Talk" oversized + "Simple Gradient Card") are untouched.

---

## 2026-07-03 — Improvement review fully remediated (77 findings, 4 phases)

**Branch: `main`.** A four-reviewer whole-system design/code review ([`docs/improvement-review-2026-07-02.md`](improvement-review-2026-07-02.md)) surfaced **77 findings** (pipeline P1–P18, API/data A1–A20, frontend F1–F20, infra I1–I19). **All 77 are remediated** across four phased, individually-gated commits on `main`: `689131cc` (Phase 0 — bug fixes), `74725f28` (Phase 1 — core refactors), `b6fe63dd` (Phase 2 — deployment + gates), `8a1b2fae` (Phase 3 — product quality). Each phase gate: tsc clean, lint clean, 45/45 vitest unit tests, full E2E (77 passed / 0 failed / 7 skipped — unchanged baseline), and from Phase 2 `npm run build` + `docker build .` green.

Structural changes worth knowing before touching the code:

- **One design pipeline.** `DesignOrchestrator` deleted; web routes, CLI mode, and MCP/ACP all run the same `runPathBDesign` / assemble-a core. Prompts are pure builders in `src/lib/agent/prompts/` (`PROMPT_VERSION` stamped on each Draft); model policy is `modelFor(path, mode)` in `src/lib/agent/config.ts`.
- **Shared route infrastructure.** All session-authed handlers use `withAuth`/`withAdmin` + zod `parseBody` (`src/lib/api/handler.ts`). Env is centralized + validated in `src/lib/env.ts` (32 vars; production fail-fast, skipped during `next build` via `NEXT_PHASE`).
- **One publish service.** `src/lib/publish/publishDraft.ts` owns the channel map + PENDING→PUBLISHED/FAILED machine; duplicate `(draft, channel)` publishes 409; ACP publishes record FAILED rows and respect draft status.
- **Frontend data layer.** React Query v5, typed `apiFetch<T = unknown>`, shared `src/lib/api-types.ts`, `useCurrentUser`; library on `useInfiniteQuery`. Overlays on Radix (`src/components/ui/Modal.tsx`); sonner toasts + `useConfirm()` (no `alert()`/`confirm()` left); admin role-gated (`admin/layout.tsx`). God components split into `src/components/{brief,admin/brandkits,drafts}/*`.
- **Deployment + gates.** Docker prod image builds (`output: 'standalone'`, `.dockerignore`, esbuild-bundled scheduler worker at `dist/scheduler/worker.js`); compose has healthchecks, loopback Postgres, pinned MinIO. CI gates lint + unit + build + docker build + E2E. Renderer egress allowlisted to MinIO + Google Fonts (`src/lib/renderer/puppeteer.ts`), verified against real Chromium.
- **After pulling:** `npm install` (new deps: zod, @tanstack/react-query, @radix-ui/react-dialog, sonner, tsx, vitest, esbuild) and `npx prisma migrate deploy` (migrations `20260702110000` channels-enum/updatedAt/drop-CampaignDraft, `20260702113000` Draft.promptVersion).
- **Known follow-ups (documented, not blocking):** PostCard `<img>` → `next/image` (lint warning), `@anthropic-ai/sdk` upgrade off the 0.30.x line.

---

## 2026-07-01 (latest) — Bistec brand kit refined with real BISTEC Global master-brand identity

**Branch: `main`.** The system-default **"Bistec"** brand kit (`cmqroh4me…`) previously held _provisional placeholder_ values (sky-blue `#0284c7…` palette, Inter/JetBrains Mono fonts, null logo, 0 artifacts). It's now populated with the **real BISTEC Global master-brand identity**, sourced from the `bistec-designer-v2` skill's Brand Identity Style Guide v1.1 (Sep 2025).

| Field               | Before                 | After                                                                                                                                            |
| ------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `colors`            | placeholder sky-blue   | Navy `#14377D`, Royal `#006FB9`, Grass Green `#2CB34A`, White `#FFFFFF`, Charcoal `#203232`, Pale Fawn `#F4F4F3`                                 |
| `fonts`             | Inter + JetBrains Mono | **Lato** (primary brand font; Arial/Calibri are office alternates, not web fonts)                                                                |
| `logoUrl`           | `null`                 | master full-colour logo (public MinIO URL)                                                                                                       |
| artifacts           | none                   | 3 `LOGO` artifacts (full / reversed / icon), all `feedToAI=true`                                                                                 |
| active voice prompt | v1 (provisional)       | **v2** — carries the "Hearts empowering business with technology" tagline, "our family", Australian-English rules, em-dashes, banned-phrase list |

- **Reusable script:** [`scripts/refine-bistec-brandkit.mjs`](../scripts/refine-bistec-brandkit.mjs) — idempotent (`node --env-file=.env scripts/refine-bistec-brandkit.mjs`). Uploads the three master logos to the public-read `brand-kits` bucket, rewrites colours/fonts/logoUrl, rebuilds the LOGO artifacts, and publishes a new active voice-prompt version (skips the prompt if the tagline is already present). Mirrors `src/lib/storage/minio.ts` for the S3 upload + public-read policy.
- **Verified:** all three logos return `200 image/png` on their stable URLs; the active prompt (v2) carries the tagline. Master brand only — Navy/Royal/Green.
- **Scope note:** this is the **master** brand. The skill also defines six sub-brands (Bookkeeping/Accounting/AI+Software/IT Services/Consulting/Marketing), each with its own accent pair + logo set — not seeded yet. The **Consulting** palette has a known bug flag in guide v1.1 (Marketing's orange hex printed by mistake) — verify with Marketing before customer-facing use.

---

## 2026-07-01 (latest) — Per-path CLI model split + Path A/B generation diagnosis

**Branch: `main`.** Verified both design paths end-to-end in CLI mode (keyless, on the local Claude Code account, real Chromium render — no mocks) and made the CLI design model **per-path**, matching the API path.

**The model split (both orchestrators): Path A → Haiku, Path B → Sonnet.**

- The **API path** (`DESIGN_PROVIDER=claude-html`) already did this: `assemble-a` passes `claude-haiku-4-5-20251001`, `pathB.ts` (used by `assemble-b` + `regenerate-design`) passes `claude-sonnet-4-6`, and `refine` picks by `designMode`. No change needed there.
- The **CLI path** (`DESIGN_PROVIDER=cli`) previously used a single global `CLAUDE_CLI_MODEL` for everything. Now `runClaudeCli`/`runDesignAgentCli` accept a per-call `model`, wired at the three CLI design call sites: `assemble-a` → `haiku`, `pathB.ts` → `sonnet`, `refine` → `designMode==='TEMPLATE' ? 'haiku' : 'sonnet'`.
- **`CLAUDE_CLI_MODEL` is now a _global override_, not the default source.** Unset ⇒ the per-path split applies (copy defaults to `haiku`). Set ⇒ forces one model across every `claude -p` call (useful for testing). `default` ⇒ omits `--model` and uses the costly account default (Opus) — avoid. Documented in `.env.example` + `docs/cold-start.md §7`.
- Files: `src/lib/agent/claudeCli.ts`, `src/lib/agent/designAgentCli.ts`, `src/app/api/generate/assemble-a/route.ts`, `src/lib/agent/pathB.ts`, `src/app/api/drafts/[id]/refine/route.ts`. Typecheck clean. **Not runtime-verified after the wiring** (would re-burn credits) — the split logic is trivial and mirrors the runs below.

**Diagnosis (what was actually run, once per path, monitored):**

- **Path A** (template fill, small "Simple Gradient Card" template seeded on the default kit) → HTTP 200 in **54s**, valid **2160×2160** PNG, on-brand.
- **Path B** (freeform) → **55s on Haiku** / **61s on Sonnet** (richer 1017-char brief), both valid **2160×2160** PNGs. Copy 16–26s, design 24–39s — every stage ~5× under its timeout (copy 120s / design 300s).
- **Root cause of the earlier Path B timeouts + credit burn was the Opus default model, not Sonnet.** With Haiku/Sonnet pinned it never approaches the timeout, so the tree-kill safety net doesn't even engage.
- **Quality:** Sonnet's Path B is markedly richer (feature-card grid, 3-stat band, decorative geometry; 9,363-char HTML → 2.09 MB PNG) vs Haiku's simpler layout (7,891 chars → 178 KB). Hence Sonnet for freeform, Haiku for the constrained template fill.

> Testing left a small **"Simple Gradient Card" SQUARE** template on the default Bistec kit (the only other template is the 1.85 MB "Hearts Talk" oversized edge case) — kept as a normal-sized Path A fixture. Test briefs/drafts were cleaned up.

---

## 2026-06-30 — CLI timeout + credit-burn-on-timeout fix

**Branch: `main`.** Fixed in `src/lib/agent/claudeCli.ts`. Symptom: CLI-mode generation (`DESIGN_PROVIDER=cli`) would time out and produce no image **while still burning credits**. Investigated by reproducing the exact spawn directly with cheap prompts (trivial 5–20s; one real ~820-char Path B prompt → valid 6.2 KB HTML in **~76s**), so normal generation actually fits the 300s design / 120s copy budgets — the timeouts came from heavy prompts + per-spawn variance, and the credit waste from an un-killed subprocess.

Three changes:

1. **Tree-kill on timeout (the credit-burn cause).** On Windows the CLI runs as `spawn("claude.cmd", { shell: true })` → `cmd.exe → claude → node`. The old `child.kill()` only signaled the `cmd.exe` shell, so `claude` kept running to completion and **kept billing** after we'd already returned a timeout error. New `killTree()` runs `taskkill /pid <pid> /T /F` on win32 (SIGKILL elsewhere). **Verified:** `taskkill /T` on a shell parent kills the node child; `child.kill()` does not.
2. **`--strict-mcp-config`** added to the spawn args (no `--mcp-config` ⇒ zero MCP servers). Without it each `claude -p` inherited the dev's full session config (Canva/Drive/Atlassian connectors), adding startup latency and bloating context/cost. **Verified** (exit 0, valid output).
3. **Diagnostic logging** (`CLAUDE_CLI_DEBUG`, on by default; set `0` to silence): logs each spawn (cmd/model/prompt-size/timeout), streamed **stderr live**, a **20s heartbeat** (elapsed + bytes; flags "no output yet"), and final outcome + elapsed. Callers tag calls `label: "copy"` / `"design"`. Documented in `.env.example`.

> Timeouts themselves are unchanged (design 300s in `designAgentCli.ts`, copy 120s in `copy/claude-cli.ts`). If heavy templates legitimately overrun 300s, raise the design budget — but an overrun no longer keeps billing. Typecheck clean. Not run through the full app route (would burn a real generation's credits); each link verified individually.

---

## 2026-06-30 — Brief size picker, publish dialog, CLI model fix

**Branch: `main`** — commits `ec7ac4a`, `c684da7`, `f5120fc`.

1. **The brief picks a SIZE, not platforms.** Wizard step 1 is now "Size & Design" with **1:1 (1080×1080)** / **3:4 (1080×1350)**. Channels default to both feeds and are chosen at _publish_ time. New `AspectRatio` enum on `Brief` + `BrandKitTemplate` (migration `20260630094723_aspect_ratio`). Pixel dims/labels are centralized in **`src/lib/aspectRatio.ts`** and threaded through every render site (assemble-a, pathB, the design agent API + CLI, and the export/refine/restore routes + their prompts). Path A template picker filters to the chosen size; `assemble-a` rejects a ratio mismatch (no stretching). Draft preview + library tiles reflect the ratio. Admin template create has a size selector + badge; `scripts/seed-portrait-template.mjs` seeds a 3:4 template.
2. **Publish dialog on the draft page.** Extracted the library `PublishDialog` (channels + optional schedule) into a shared `src/components/library/PublishDialog.tsx`, wired into the draft review page's Publish button (replaces the old `confirm()`).
3. **pathB.ts reference-template externalization** (`ec7ac4a`): a heavy style-reference template (e.g. Hearts Talk) is run through `extractInlineAssets()` before the prompt, so it no longer blows the CLI/API context.
4. **CLI model fix** (`f5120fc`): `claudeCli.ts` now passes `--model` from **`CLAUDE_CLI_MODEL`** (default `sonnet`). Root cause of CLI Path B burning credits was the missing flag → account-default Opus. Set `CLAUDE_CLI_MODEL=default` to omit it. **Not runtime-verified** (would cost CLI credits).
5. **E2E:** added TC-GEN-A3/A4 (portrait + ratio-mismatch) and a portrait Path B case; updated TC-UI-02/03 for the renamed step + dialog flow. Suite **80 passed / 0 failed / 4 skipped**.
6. **Library cleaned** (dev DB): removed the "Bistec 5-year anniversary" draft + brief; only the "Announcing bistec-studio" intro post remains.

---

## 2026-06-30 — Bistec Studio logo added to the UI

**Branch: `main`**

The app brand mark is now the **Bistec Studio logo** instead of the "bistec-studio" text.

- **Asset:** `public/BistecStudioLogo.png` — a transparent, **pure-black** PNG (1536×1024). The wordmark occupies only the centre of the canvas (content box ≈ x[0.24–0.65] y[0.38–0.58], aspect ≈ 3:1).
- **Component:** `src/components/Logo.tsx` — shared, used in the login hero and the app-shell sidebar + mobile top bar. It **CSS-crops** to the wordmark region (so the logo isn't a small mark in a big transparent box) and applies **`dark:invert`** so the black mark flips to white on the dark theme. Verified in both light (black on white) and dark (white on dark) themes.
- **No favicon set:** a 3:1 wordmark at 16px is illegible. A square "S" monogram (transparent PNG/SVG) is the right favicon asset when available — drop it at `src/app/icon.png` (Next auto-detects).
- Documented in `docs/ui-reference/DESIGN_SYSTEM.md` §1 (Brand & Aesthetic).

---

## 2026-06-30 (later) — Full E2E §6 catalog implemented + green + CI gate

**Branch: `main`**

The entire `docs/e2e-test-plan.md` §6 catalog (§A–§L, ~80 cases) is now implemented and **green: 77 passed, 0 failed, 4 intentional skips** (`npm run test:e2e:mock`, ~4 min). A GitHub Actions workflow (`.github/workflows/e2e.yml`) runs the whole suite — including the §K security-fix regressions — on every PR and push to `main`, so the 28 remediation fixes can't silently break.

**New spec files:** `auth.test.ts` (§A), `resolution.test.ts` (§C), `export.test.ts` (§F), `library.test.ts` (§H), `acp.test.ts` (§J), `regression.test.ts` (§K, 13 cases), `ui.test.ts` (§L). Existing specs extended to fill §B/§G/§E/§I/§D gaps.

**Bugs found & fixed while getting it green (production-touching — review these):**

- **`refine` route retry budget was 4** → 10-way concurrent refines exhausted it and 500'd. Bumped `MAX_ATTEMPTS` to 12 (`src/app/api/drafts/[id]/refine/route.ts`). Genuine hardening of the H7 fix.
- **`playwright.config.ts`** forced a global `Content-Type: application/json` that overrode the multipart boundary → every file-upload route 500'd. Removed; added `retries: 1` (cold `next dev` compile flake).

**New test-only seams (all dormant in prod):**

- `src/lib/testHooks.ts`: `buildMockCopy()` (routes brief topic into the mock caption) + `shouldMockPublishFail()` (a `__FAIL_ALWAYS__`/`__FAIL_ONCE__` sentinel in the brief topic drives deterministic publish failures). Wired into `registry.ts` + both social publishers. Gated by `MOCK_*`.
- `POST /api/test/scheduler-tick` (`src/app/api/test/scheduler-tick/route.ts`): runs one `runScheduledJobs()` pass so §K H12 can drive the scheduler over HTTP. **Double-gated: hard-404 in `NODE_ENV==='production'`, AND 404 unless `MOCK_SOCIAL`, AND admin-only.** (This is why CI runs the app in `next dev` mode — the seam is intentionally inert in a prod build.)

**Test infra:** `scripts/seed-editor.mjs` (non-admin RBAC account, wired into `setup-test-db.mjs`); `tests/helpers/db.ts` (direct test-DB access — reads `DATABASE_URL` from `.env.test` FIRST, because importing `@prisma/client` pollutes `process.env` with the dev `.env`); `loginAs` rewritten to use an isolated cookie jar (the shared-context version leaked the admin session into editor calls); `.env.test` gained `BISTEC_API_KEYS`/`BISTEC_ADMIN_API_KEYS` (enables §J ACP-auth cases — git-ignored, set as CI job env).

**The 4 intentional skips:** TC-GEN-05 (needs a mock IMAGE-provider seam), TC-REG-H11a/b/c (real-Chromium / host-process observation — not black-box driveable).

---

## 2026-06-30 — Preflight fixes, Dockerfile fix, TypeScript fixes, E2E 19/19 green

**Branch: `main`**

### Dockerfile Chromium fix

The `Dockerfile` was missing a Chromium binary in all three build stages (`deps`, `builder`, `runner`). `puppeteer.ts` resolves `/usr/bin/chromium` at runtime, so any production render would have failed silently. Fixed: added `apk add chromium` to all three `apk add` lines and `ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` to the runner stage.

### TypeScript — 0 errors (was 10 errors)

Two issues found and fixed:

- **Prisma client stale** — H9/H12/brief_brandkit migrations had been applied to the schema but `prisma generate` had not been re-run. This left `retryCount`/`nextRetryAt` (H12, `Post` model) and `brandKit`/`campaign` relations (`Brief` model) absent from the generated types. Fix: `npx prisma migrate deploy` (applied the 3 pending migrations to dev DB) then `npx prisma generate`.
- **`tests/helpers/api.ts:73`** — `headers` was inferred as `{ Cookie: string } | { Cookie?: undefined }`, which fails the `{ [key: string]: string }` index signature. Fix: explicit `Record<string, string>` annotation.

### E2E tests — root cause + fix — 19/19 green

**Root cause of 6 failures:** `.env.test` was missing entirely (git-ignored, never committed). `npm run test:e2e:db` creates it as part of the DB setup script, but the file had not yet been created on this machine. Created with all required vars.

**Additional bug found in the template** (`docs/e2e-test-plan.md` §2): the documented `.env.test` snippet had `DESIGN_PROVIDER=cli`. With CLI mode active, `assemble-b` and the `refine` route dispatch through `runDesignAgentCli` (spawns a real `claude -p` subprocess, ~59s) instead of `runDesignAgent`. The `MOCK_AI=true` seam only short-circuits `runDesignAgent` — it never fires in CLI mode. Result: every test that called `assemble-b` (directly or via `createExportedDraft`) hit the 60s Playwright timeout. **Fix:** `DESIGN_PROVIDER=claude-html` in `.env.test`. The template in `docs/e2e-test-plan.md` has been corrected.

**Result:** 19/19 passed in 52s (was 13/19, ~10 min, 6 timeouts).

### `.env.test` contents (for new machines)

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
MINIO_BUCKET_IMAGES=generated-images
MINIO_BUCKET_EXPORTS=exported-designs
MINIO_BUCKET_BRANDKITS=brand-kits
DESIGN_PROVIDER=claude-html        # MUST be claude-html — cli bypasses MOCK_AI
TOKEN_ENCRYPTION_KEY=<copy from .env>
PUPPETEER_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
MOCK_AI=true
MOCK_PUPPETEER=true
MOCK_SOCIAL=true
```

---

## Current status

**Security pass + dead-code cleanup — 2026-06-24 (on `main`):** A full static security audit (4 parallel auditors: authz/IDOR, injection/SSRF, secrets/crypto/storage, dead-code) was run over the whole codebase and the findings independently verified. **The headline risk — command injection via the `claude -p` subprocess — is NOT present** (prompt piped via stdin; argv is the static `["-p"]`; no user input reaches the shell). SQL is parameterized; the system-wide IDOR remediation holds, including the four new 2026-06-24 routes.

- **Fixed (this commit):**
  - **SSRF (High)** — `Brief.additionalImageUrl` / `briefImages[].url` were stored unvalidated, embedded into agent HTML, and fetched by Chromium (`setContent` + `networkidle0`), letting an authed user reach internal hosts (cloud metadata, `postgres:5432`, etc.). New `isAllowedAssetUrl()` in `src/lib/storage/minio.ts` (MinIO-host + http(s) allow-list — legit image URLs only ever come from `/api/briefs/images`), enforced in `POST /api/briefs`. Runtime-tested: legit MinIO URL → 201; metadata IP / internal host / `file://` → 400.
  - **MinIO default creds (Med)** — `minio.ts` now fails fast in production if `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` are unset or `minioadmin` (was a silent fallback).
  - **Image content-type (Low)** — `toolGenerateImage` (`tools.ts`) now validates the provider's `data:` content-type against `RASTER_IMAGE_TYPES` before writing to the public bucket (was a `text/html`/`svg` stored-XSS primitive).
- **Cleanup:** removed dead `src/acp/server.ts` (re-export shim; consumers import `@/acp/agent` directly), unused deps `clsx` + `tailwind-merge` (hand-rolled `cn()`) + `@sparticuz/chromium-min` (never imported); fixed the stale Dockerfile comment.
- **Reported, NOT changed (need product/ops decision):** MinIO public-read buckets stay safe **only while port 9000 is never publicly exposed** (enforce via firewall, not docs); ACP/MCP `get_draft`/`publish_post` allow any non-admin `BISTEC_API_KEYS` holder cross-user draft read/publish (documented M2M trust boundary); public-bucket object keys are guessable (recommend a `randomUUID()` segment); inline-asset token forgery (Med, low blast radius) and `resolveExportUrl` `^https?://` passthrough (Low, latent).
- **🐛 Latent deploy bug flagged:** the `Dockerfile` installs **no Chromium binary** (only `libc6-compat`), but `puppeteer.ts` expects `/usr/bin/chromium` — production render would fail. Fix: `apk add chromium` + `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`. A NOTE was left in the Dockerfile.
- **Cleanup deferred (judgment calls):** `src/components/ui/SegmentedToggle.tsx` (unused but a deliberate design-system primitive); `docs/PRD.md` + `docs/bistec-studio-backlog.md` (stale — reference removed Canva/Clerk — but historical); the `src/mcp/` + `src/acp/` subsystem (only reachable via `npm run mcp` / `/api/acp/*`, not in docker-compose).

**Brand-kit selection + Hearts Talk fix — 2026-06-24 (on `main`):**

- **Hearts Talk Path A fixed** via orchestrator-level inline-asset externalization (see Resolved note below). No re-seed required.
- **Brand kit selectable per brief**, independent of campaign. New `Brief.brandKitId` (migration `20260624120000_brief_brandkit`); `resolveBrandKit(campaignId, brandKitId)` precedence is now **explicit brief kit → campaign → project → system default** (also honored by `toolGetBrandKitContext`). New `GET /api/brandkits` (non-admin list); `GET /api/templates?brandKitId=` filter; `POST /api/briefs` validates+stores `brandKitId`; `assemble-a` rejects a template that doesn't belong to the pinned kit.
- **Brand kits assignable on campaigns/projects** at create + edit. Brand-kit `<Select>` added to the campaign/project create forms and admin-gated inline editors on both detail pages (the PATCH/POST routes already accepted `brandKitId`/`defaultBrandKitId`).
- **Brief wizard reordered** to `Campaign → Platform & Design → Content → Images → Review`: the kit defaults from the campaign/project assignment (campaign/project tier only — a bare system default leaves it empty so the user picks), and the template + style-reference pickers filter to the selected kit on both paths.
- **Deploy:** run `npx prisma migrate deploy` to apply the new migration, then restart the dev server (regenerated Prisma client).

**Draft regeneration (copy + design) — 2026-06-24 (on `main`):** The draft page now offers independent **Regenerate** + one-click **Undo** for both copy and design.

- `POST /api/drafts/[id]/regenerate-copy` (new) — re-runs the resolved copy provider against the brief, persists the new copy, and returns `{ copyText, previousCopyText }` for an immediate Undo. Design is untouched; an `EXPORTED` draft flips to `IN_PROGRESS` (a copy change invalidates the prior export, mirroring the PATCH route). Works for both paths.
- `POST /api/drafts/[id]/regenerate-design` (new) — **Path B only** (returns `400 NOT_PATH_B` for a TEMPLATE draft). Runs the new design first (draft untouched on failure), then snapshots the _current_ design as a `DraftRevision` (`instruction: "Design before regenerate"`) before pointing the draft at the new one — atomic, with the standard P2002 revision-number retry. Returns `{ exportUrl (signed), previousRevisionNumber }`; the snapshot is the Undo target and also shows in revision history.
- `src/lib/agent/pathB.ts` (new) — extracted `buildBriefInput(brief)` and `runPathBDesign(brief, kit, copyText)` as the single source of truth for the Path B pipeline (CLI vs API dispatch), shared by `assemble-b`, `regenerate-copy`, and `regenerate-design` so they never drift. `assemble-b/route.ts` was slimmed to call it.
- Draft-page UI (`src/app/(app)/drafts/[id]/page.tsx`) wires both: Regenerate copy + Undo (`previousCopyText`), and Regenerate design (Path-B-gated) + Undo design (restores the `previousRevisionNumber` snapshot).

**E2E verification of the 2026-06-24 additions — 2026-06-24 (CLI mode, real generation, no mocks):** All new endpoints verified end-to-end against the running app (`DESIGN_PROVIDER=cli`, admin session):

- `GET /api/brandkits` → 200, both kits + preview swatches; `GET /api/templates?brandKitId=` filters correctly (empty kit → `[]`).
- `regenerate-copy` → 200, returns new + `previousCopyText`, persists, flips `EXPORTED→IN_PROGRESS`.
- `regenerate-design` (Path B) → 200 (~51s), snapshots old design as `DraftRevision #1`, produces a real **2160×2160** PNG via Puppeteer→MinIO with an H10-signed read URL; output is on-brand and incorporates the regenerated copy. Path A draft → `400 NOT_PATH_B` (guard verified).
- > ⚠️ **Dev-server gotcha (CLI mode):** after a long session of CLI-mode generation (hours; each generate spawns a `claude -p` subprocess), the Next.js dev compiler worker can wedge — newly-touched routes fail to compile with `Jest worker encountered N child process exceptions, exceeding retry limit` (instant HTTP 500), while already-compiled routes keep serving 200. `tsc --noEmit` stays clean (it's not a code error). **Fix: restart `npm run dev`.** Not a production concern (prod is a built image, not `next dev`).

**Wave 5 — complete ✅**

| Task                                       | Status | Notes                                                                                          |
| ------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------- |
| T01 — Next.js 14 init                      | ✅     | `package.json`, TypeScript strict, Tailwind, Husky                                             |
| T02 — Docker Compose infra                 | ✅     | postgres + minio containers up; `docker run` workaround for WSL2                               |
| T03 — Prisma schema + migration            | ✅     | `20260622191018_better_auth_swap` applied; 18 tables created                                   |
| T04 — better-auth + role middleware        | ✅     | Login page, session cookie middleware, `requireRole`/`getCurrentUser` helpers                  |
| T25 — Design system foundation             | ✅     | Frozen Light theme, AppShell, Button/GlassPanel/GlassInput/Select/StatusChip/SegmentedToggle   |
| T05 — Provider interfaces                  | ✅     | `CopyProvider`, `ImageProvider`, `DesignOrchestrator` interfaces + `BriefInput` type           |
| T06 — OpenAI copy provider                 | ✅     | `OpenAICopyProvider` — GPT-4o chat completions                                                 |
| T07 — OpenAI image provider                | ✅     | `OpenAIImageProvider` — gpt-image-2, returns base64 data URL                                   |
| T08 — Provider registry                    | ✅     | `resolveCopyProvider` / `resolveImageProvider` / `resolveDesignOrchestrator`                   |
| T10 — MinIO storage client                 | ✅     | `uploadObject` / `getPresignedUrl`; auto-creates buckets on cold start                         |
| T09 — Puppeteer renderer + design agent    | ✅     | `renderHtmlToPng` (2× DPI); `runDesignAgent` tool-use loop; 15-call hard limit                 |
| T26 — BrandKit management (API + admin UI) | ✅     | 11 API routes; admin UI at `/admin/brandkits`; AI prompt assist                                |
| T23 — Project & Campaign API routes        | ✅     | CRUD + soft delete; brand kit resolution endpoint                                              |
| T24 — Projects & Campaigns UI              | ✅     | List + detail pages; resolved brand kit badge with source label                                |
| T11 — Brief creation (DB + API + UI)       | ✅     | 3-step wizard; `POST /api/briefs`; `GET /api/providers/available`                              |
| T12 — Copy + image generation routes       | ✅     | `POST /api/generate/copy`; `POST /api/generate/image` (base64 → MinIO)                         |
| T13 — Path A assembly route                | ✅     | `POST /api/generate/assemble-a`; Haiku fills template → Puppeteer PNG                          |
| T14 — Path B orchestrator                  | ✅     | `POST /api/generate/assemble-b`; `ClaudeHtmlOrchestrator`; registry wired                      |
| T15 — Export route                         | ✅     | `POST /api/generate/export`; re-render path for copy edits                                     |
| T16 — Social publishers                    | ✅     | `src/lib/social/instagram.ts` + `linkedin.ts`; Graph API + UGC Posts API; `PublishError` typed |
| T17 — Publish + schedule API routes        | ✅     | `POST/GET /api/posts`; GET/DELETE `/api/posts/[id]`; retry at `/api/posts/[id]/publish`        |
| T18 — Scheduler worker                     | ✅     | `src/scheduler/worker.ts` + `src/lib/scheduler/jobRunner.ts`; 60s poll; sequential per tick    |
| T19 — Asset library UI                     | ✅     | `GET /api/library`; `/library` page; `PostCard` + `PublishHistoryDrawer` components            |

**Cold-start testing fixes — 2026-06-23 (post-Wave-6, on `main`):**

- `next.config.ts` → **`next.config.mjs`** — Next 14 does not support a TypeScript config file; `next dev` crashed on boot (`Configuring Next.js via 'next.config.ts' is not supported`).
- **`requireRole`** (`src/lib/auth.ts`) now compares the role **case-insensitively**. The Prisma `Role` enum and the admin seed store uppercase `ADMIN`/`EDITOR`, but the check compared against lowercase `"admin"`, so every `/api/admin/*` route returned **403** for the admin (the UI already used `.toLowerCase()`).
- **`docker-compose.override.yml`** (new) — publishes MinIO `:9000` to the host so a host-side `npm run dev` can reach it (the committed compose only `expose`s it internally; see `docs/cold-start.md` gotcha #2).
- **Dashboard page added** (`src/app/(app)/page.tsx`) — the `/` route was specced (`docs/prototype-pages.md §1`) but **never implemented**, so post-login `router.push("/")` and the "Dashboard" nav item both **404'd**. New server component: KPIs (Drafts Ready = `EXPORTED` / Posts Published / Active Campaigns / AI Providers), Recent Drafts table (rows → `/drafts/[id]`), Quick Actions (`/brief`, `/library`, `/admin/brandkits`), and a merged activity feed. Uses the **real** routes (`/brief`, `/drafts/[id]`), not the spec's stale `/brief/new` / `/draft/[id]`.

**Brief wizard — proto flow port — 2026-06-23 (on `main`):** The `/brief` wizard was rebuilt to match the prototype branch (`bistec-studio-proto/src/app/brief/new/page.tsx`) **exactly** in flow, wired to the real backend. Replaces the old 3-step (`Content / Brand & Design / Channels`) wizard.

- **5 steps**, proto order: `Platform & Path` → `Campaign` → `Content` → `Images` → `Review` → **Generate Post**. Rendered with the real design system (GlassPanel/Select/Button, light+dark tokens), not the proto's standalone blue/light styling.
- **Decisions** (confirmed with the user): channels are **multi-select** (IG + LI → `channels[]`); Content keeps the proto's single prompt **plus** Goal + Tone selects (prompt → `Brief.topic`, API unchanged); images are a **real MinIO upload** with embed/style-ref intent; "Generate Post" runs generation and lands on the draft.
- **Generate flow:** `POST /api/briefs` → `POST /api/generate/assemble-a {briefId, templateId}` (Path A) or `/assemble-b {briefId}` (Path B) → redirect to `/drafts/{draftId}`. Copy/image providers are **auto-resolved** to the default behind the scenes (no provider step, to keep the proto's 5 steps). If no COPY provider exists, the Review step shows a warning and disables Generate.
- **Image intent mapping:** all wizard images are stored in `Brief.briefImages` as `[{url, intent, filename}]` (the shape `assemble-a/b` read). For Path A (which only embeds a single image), the first `embed` image is also passed as `Brief.additionalImageUrl`. Path B uses `referenceTemplateId` for the style-reference template.
- **New/changed backend** (all additive):
  - `GET /api/templates` (**new**, non-admin) — lists templates across all non-deleted kits with `brandKitName` + `previewColor` (kit's first color). Needed because the picker shows all templates in step 1, and `/api/admin/brandkits*` is admin-gated (403s for editors after the `requireRole` fix).
  - `GET /api/campaigns` — now includes `projects { project { id, name } }` so the wizard can group campaigns by project + standalone.
  - `POST /api/briefs/images` (**new**, non-admin) — multipart → MinIO `BUCKET_IMAGES` under `briefs/{userId}/`, returns `{url, filename}`. Runs before the brief exists; uses 7-day presigned URLs (consumed at generation time — same known expiry caveat as other uploads).
- **Not yet verifiable here:** end-to-end generation needs registered providers + API keys (env has 0 providers, `DESIGN_PROVIDER=cli`). Everything up to the Generate call is smoke-tested (page 200, all supporting endpoints 200, project grouping confirmed with real data). **→ Now solved via the CLI orchestrator below.**

**CLI orchestrator (keyless generation) — 2026-06-23 (on `main`):** Routes the full pipeline — copy, design, and PNG render — through the local **Claude Code CLI** (`claude -p`) instead of the Anthropic/OpenAI APIs, so the brief flow runs **end-to-end without any API key**. Activated by `DESIGN_PROVIDER=cli`. Verified: Path A (75s) and Path B (81s) both produce real 2160×2160 PNGs and `EXPORTED` drafts.

- `src/lib/agent/claudeCli.ts` — `runClaudeCli(prompt)` spawns the CLI and pipes the prompt via **STDIN** (argv would truncate at Windows' ~8191-char cmd limit). On win32 it runs `claude.cmd` via shell; override with `CLAUDE_CLI_PATH`. Guards prompts > 600k chars with an actionable error. `stripCodeFences()` cleans markdown-wrapped output.
- `src/providers/implementations/copy/claude-cli.ts` — `ClaudeCliCopyProvider` (copy via CLI). Wired into `registry.ts` as the `cli` case; `providerApiKey()` skips `decrypt()` for the keyless `cli` provider.
- `src/lib/agent/designAgentCli.ts` — `runDesignAgentCli()`: single-shot `claude -p` → HTML → `renderHtmlToPng` (Puppeteer) → MinIO `BUCKET_EXPORTS` → real `exportUrl`. Replaces the Anthropic tool-use loop (`runDesignAgent`) in CLI mode only.
- `src/app/api/generate/assemble-a|b/route.ts` — branch on `CLI_MODE` (`DESIGN_PROVIDER === 'cli'`): CLI path vs. the untouched API path.
- `scripts/seed-cli-provider.mjs` — idempotently registers a default COPY `AvailableProvider` `{providerKey:"cli", providerName:"cli", label:"Claude CLI (local, no API key)"}` so the wizard's Generate is enabled and `/api/briefs` validation passes. Run: `node --env-file=.env scripts/seed-cli-provider.mjs`.
- **Images:** CLI mode has no raster-image API — visuals are CSS/SVG authored by Claude and rasterized by Puppeteer. True raster generation (e.g. DALL·E) still needs an IMAGE provider + key.
- **Template size limit:** single-shot prompts can't carry a giant template. The seeded **"Hearts Talk 1080×1080"** template is 1.81 MB (~475k tokens) and fails with the size guard (it would also exceed the API's 200k context). Use a normal-sized template — a **"Simple Gradient Card"** template was added to the Bistec kit for Path A testing.

> ### ⤺ Reverting to API mode (once an API key is confirmed)
>
> The CLI path is **only** taken when `DESIGN_PROVIDER=cli`. To switch back to the real Anthropic/OpenAI providers, **no code changes are needed** — the API path (`runDesignAgent`, `AnthropicCopyProvider`/`OpenAICopyProvider`) is left fully intact:
>
> 1. In `.env`, set `DESIGN_PROVIDER=claude-html` (and add `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY`). Restart the dev server so it re-reads the env (`CLI_MODE` is read at module load).
> 2. Register the real provider(s) in the UI at **`/admin/settings`** (encrypted, stored as `AvailableProvider` rows), **or** rely on the env-var fallback in `registry.ts`.
> 3. Disable/remove the seeded CLI provider so it isn't auto-selected as default: in `/admin/settings` toggle it off, or run SQL `UPDATE "AvailableProvider" SET "isEnabled"=false WHERE "providerKey"='cli';` (or `DELETE … WHERE "providerKey"='cli';`). Set your real provider as `isDefault`.
> 4. (Optional) The CLI files (`claudeCli.ts`, `designAgentCli.ts`, `copy/claude-cli.ts`, the `cli` cases in `registry.ts`, and the `CLI_MODE` branches in the assemble routes) are dormant when `DESIGN_PROVIDER!=='cli'` and can stay for future keyless testing, or be deleted to fully remove the path.

**Code review + remediation — 2026-06-23 (on `main`):** A full optimization/security code review was run and is documented in **[`docs/code-review-findings.md`](code-review-findings.md)** (42 findings: 16 High / 20 Medium / 6 Low). Remediation is **complete — all 28 tracked fixes applied & pushed**: the first 22 across commits `a7a1207`, `ca41815`, `278c8a0`, `fa3b862`; the final 6 (H7, H9, H10, H11, H12, L2) in the follow-up batch (two new migrations: `20260623153740_h9_indexes`, `20260623154752_h12_scheduler_claim`).

- **Fixed (highlights):** ACP/MCP auth bypass (`isValidKey` allow-list + `/api/acp` exempted from session middleware, fails closed); system-wide IDOR (`forbiddenIfNotOwner`/`getDraftOwnerId` on all draft/brief/generate routes); library ownership filter; campaign/project mutations admin-gated; Publish button wired (+ `GET /api/me` for server-side role); upload size/MIME validation; atomic `isDefault` toggles; MinIO init race; artifact-delete kit sync; ACP input validation; draft polling; decrypt guard + `BETTER_AUTH_SECRET` fail-fast; masked last-4 `keyPrefix`; bounded list queries; parallelized brief validation; Instagram token → `Authorization` header; MCP system-user FK fix; `getCurrentUser` role-casing normalised.
- **Final 6 (now done):**
  - **H7** transaction atomicity — refine revision #, prompt version, posts create→publish wrapped in `$transaction` (P2002 → retry/409); the unique constraints already existed so no migration was needed.
  - **H9** Prisma indexes — `Post(status,scheduledAt)` + `(status,nextRetryAt)`, FK indexes, `BrandKit(isDefault,isDeleted)` (migration `20260623153740_h9_indexes`).
  - **H12** scheduler atomic claim (`FOR UPDATE SKIP LOCKED` + `PUBLISHING` lease) + exponential-backoff retry (`retryCount`/`nextRetryAt`, MAX 5); reuses the prisma singleton (migration `20260623154752_h12_scheduler_claim`).
  - **H10** hybrid storage — IMAGES/BRANDKITS buckets are public-read (stable embeddable URLs); EXPORTS stays private, storing the object **key** and signing at read (`resolveExportUrl`); new `MINIO_PUBLIC_ENDPOINT` env. Runtime-verified against MinIO.
  - **H11** Puppeteer singleton browser + page-per-render + relaunch-on-disconnect + `p-limit` cap (`PUPPETEER_MAX_CONCURRENCY`, default 2).
  - **L2** shared `src/lib/apiFetch.ts` (8 copies removed) + `src/lib/brandkit/systemContext.ts` (4 copies removed); consolidated library fetch effects.
  - **⚠️ Deploy note:** two new migrations — run `npx prisma migrate deploy` before starting the app.
- **Deferred on purpose:** Anthropic client → module scope (would throw at import in CLI mode — keep per-request); `requireRole('editor')` rename (editor is the auth floor, not a bug); icon-button aria-labels (cosmetic).

> ### ✅ Resolved — oversized brand template (Hearts Talk) Path A — 2026-06-24
>
> Previously, Path A with the seeded **"Hearts Talk 1080×1080"** template failed: `Prompt too large for CLI mode (1899849 chars > 600000)`. The template is 1.81 MB because its assets are inlined as `data:` URIs (also exceeds the Anthropic API's ~200k context — not CLI-specific).
> **Fix (orchestrator-level, no re-seed):** the assemble pipeline now externalizes inline `data:` assets before the prompt is built and re-inlines them before render. `src/lib/agent/inlineAssets.ts` — `extractInlineAssets()` swaps each `data:` URI for a short `__INLINE_ASSET_n__` token (Hearts Talk: 1.89 MB → **6.2 KB**, well under the 600k guard and the API context); `restoreInlineAssets()` splices the originals back just before Puppeteer renders (verified **byte-for-byte lossless**). Threaded through `DesignAgentOptions.inlineAssets`, `designAgentCli.ts` (with a template-fill CLI instruction telling Claude to preserve the placeholders verbatim), `designAgent.ts` (restores before the `renderHtml` Puppeteer call), and `assemble-a/route.ts`. Generic to any oversized template.

**Security review — 2026-06-23 (on `main`):** After all 6 waves + the code-review remediation, a focused security review (`/security-review`) was run over the full remediation changeset (the 9 commits ahead of `origin`: H7, H9, H10, H11, H12, L2 + prototype removal). Method: one discovery pass over all modified files, then independent false-positive verification of each candidate, reporting only findings at **confidence ≥ 8/10**.

- **Outcome: no high-confidence vulnerabilities found — no security fixes required.** All high-risk areas were examined and cleared:
  - **`jobRunner.ts` `$queryRaw` (`FOR UPDATE SKIP LOCKED`)** — safe; Prisma tagged-template parameterization, and interpolated values (`leaseUntil`, `CLAIM_BATCH`) are server-computed constants, not user input. No SQL injection.
  - **H7 `$transaction`** (refine, prompts, posts) — safe; `forbiddenIfNotOwner` / `requireRole('admin')` run **before** the transaction. No authz gap, no injection.
  - **H10 read-signing refactor** (library, posts, drafts, revisions) — safe; `resolveExportUrl` mapping was added _after_ the access-controlled queries, so every pre-existing ownership/role filter is preserved. EXPORTS stays private.
  - **`resolveExportUrl` legacy `^https?://` passthrough** — not exploitable; `exportUrl` is only ever written server-side, no route accepts a user-supplied value.
  - **Upload key construction** (briefs/images, brandkit upload/artifacts) — safe; filenames sanitized with `replace(/[^a-zA-Z0-9._-]/g, '_')`, neutralizing `/` and `..`. No path traversal.
  - **H11 Puppeteer singleton** — no security-relevant change (the `setContent`/`networkidle0` SSRF surface is pre-existing, not introduced here).
  - **Migrations** (H9 indexes, H12 columns/enum) — no security impact.
- **One informational note (confidence 3/10, below threshold — not a vulnerability):** H10's **public-read bucket policy** on the `generated-images` + `brand-kits` buckets (`src/lib/storage/minio.ts`) is a real downgrade of the documented "MinIO served via pre-signed URLs only" control, but **not** a concrete vulnerability under the actual deployment: the committed `docker-compose.yml` does not publish MinIO's port (internal `expose` only; console on `127.0.0.1:9001`; host publishing lives only in the dev `docker-compose.override.yml`), so anonymous reads are reachable only from inside the trusted network. The policy grants no `ListBucket` (no enumeration), keys are unguessable (`{userId}/{Date.now()}-{filename}`), and users are trusted internal staff.
  - **⚠️ Deploy invariant to preserve:** this stays safe **only while MinIO's port 9000 is never publicly exposed**. If production ever exposes MinIO directly to browsers/CDN, those buckets become world-readable across users — switch to app-mediated signed reads (as EXPORTS already does) before doing so.
  - **Optional hardening (not required, ~2 lines):** add a `randomUUID()` segment to brief-image keys (`briefs/{userId}/{uuid}-{filename}`) for parity with the unguessable generated-image keys.

**E2E tests (T22) — implemented & green — 2026-06-23 (on `main`):** The `tests/e2e/` skeleton was non-functional (the `MOCK_*` hooks the specs gated on were never built, and the specs had drifted from the real route contracts). It is now **runnable and passing: 19/19 tests (~16s)**. Full design + reproduction steps in **[`docs/e2e-test-plan.md`](e2e-test-plan.md)** (§0 "Reproducing the green run").

- **Mock seams — `src/lib/testHooks.ts`** (env-gated; dormant unless the flag is `true`, so production is untouched). Wired into 5 points:
  - `MOCK_AI` → stub copy provider in `resolveCopyProvider` (`providers/registry.ts`) + short-circuit `runDesignAgent` (`lib/agent/designAgent.ts`) to emit deterministic HTML (echoes the kit's first hex colour from the prompt) and a conflict marker when the refine instruction contains `conflict_test`; also short-circuits the admin brand-voice `prompts/generate` route.
  - `MOCK_PUPPETEER` → `renderHtmlToPng` (`lib/renderer/puppeteer.ts`) returns a fixed 1×1 PNG, skipping Chromium. The MinIO upload still runs, so EXPORTS keys stay real and signable (exercises H10).
  - `MOCK_SOCIAL` (+ `MOCK_SOCIAL_FAIL`) → `publish()` in `lib/social/instagram.ts` + `linkedin.ts` returns a fake `platformId` (or throws `PublishError`), no HTTP call.
- **Contract corrections** to the drifted specs (asserted against route code, which differed from the test-plan's original table): `assemble-a/-b` return **200 `{draftId,exportUrl}`** (not 201, not `{htmlContent,…}`); `/api/posts` POST takes **singular `channel`** → 201 `{postId,status}`; `/api/drafts/[id]/revisions` is a **bare array**; brief creation **validates `copyProviderKey`** against a real enabled COPY provider — so specs use `copyProviderKey:'cli'` and the run seeds the keyless `cli` provider.
- **Helper:** added `loginAs()` with isolated cookie jars (`tests/helpers/api.ts`) for future RBAC/IDOR tests; the existing module-level `login`/`post`/… kept.
- **Isolation:** runs against a dedicated **`bistec_studio_test`** DB via `.env.test` (gitignored) loaded with `node --env-file=.env.test` (Next doesn't auto-load it under `next dev`). The dev DB is never touched.
- **Repro scripts** (new): `npm run test:e2e:db` (create + migrate + seed test DB, via `scripts/setup-test-db.mjs`) → `npm run test:e2e:serve` (app on `:3001` with mocks) → `npm run test:e2e:mock` (run suite).
- **Still open:** the broader `docs/e2e-test-plan.md` §6 catalog is unwritten — §A RBAC/IDOR (now unblocked by `loginAs`), the §K remediation regression suite (H7 concurrency, H9 index plans, H10 anonymous-bucket reads, H11 Chromium singleton, H12 atomic scheduler claim), and §L browser flows.

**Post-Wave-2 addition (out of band):**

- `AnthropicCopyProvider` added (`src/providers/implementations/copy/anthropic.ts`) — uses `claude-haiku-4-5-20251001`
- Registry updated: `"anthropic"` case wired in; env fallback now tries `ANTHROPIC_API_KEY` before `OPENAI_API_KEY`
- `src/lib/crypto.ts` — AES-256-GCM encrypt/decrypt implemented (`encryptApiKey` / `decryptApiKey`; key from `TOKEN_ENCRYPTION_KEY` env var)

**Wave 3 details:**

- `src/lib/storage/minio.ts` — S3-compatible client wrapping `@aws-sdk/client-s3`; `BUCKET_IMAGES` (7-day pre-signed URLs) / `BUCKET_EXPORTS` / `BUCKET_BRANDKITS`; `initBuckets()` idempotent
- `src/lib/renderer/puppeteer.ts` — `renderHtmlToPng(html, w, h): Promise<Buffer>`; `deviceScaleFactor: 2`; `waitUntil: "networkidle0"`; resolves Chromium from `PUPPETEER_EXECUTABLE_PATH` → common Linux paths
- `src/lib/agent/types.ts` — `DesignAgentOptions`, `DesignAgentResult`, `BrandKitContext`, `AgentToolLimitError`
- `src/lib/agent/tools.ts` — `toolGenerateImage` (handles base64 data URL → MinIO), `toolRenderHtml` (Puppeteer → MinIO), `toolGetBrandKitContext` (campaign→project→system default chain)
- `src/lib/agent/designAgent.ts` — `runDesignAgent`: standard Anthropic SDK tool-use loop; throws `AgentToolLimitError` at 15 calls; halts on any tool error
- `src/providers/implementations/orchestrator/claude-cli.ts` — `ClaudeCliOrchestrator` (dev mode; `DESIGN_PROVIDER=cli`; single-shot `claude -p`, no Puppeteer, `exportUrl=""`)
- `src/providers/registry.ts` — `resolveDesignOrchestrator()` added; dispatches cli → `ClaudeCliOrchestrator`; `claude-html` → `ClaudeHtmlOrchestrator` (wired in T14)

**Wave 3b details:**

- `src/lib/brandkit/resolve.ts` — `resolveBrandKit(campaignId?)`: campaign→project→system default; returns `ResolvedBrandKit` + source label; shared by tools.ts and API routes
- `src/app/api/admin/brandkits/` — 11 routes: CRUD, file upload helper (`/upload` → MinIO URL), template CRUD, prompt versioning + activate/rollback, AI generate + improve (Sonnet; returns draft for admin review — not auto-saved), artifact upload with feedToAI toggle; LOGO/FONT artifacts sync to `BrandKit.logoUrl`/`fonts`
- `src/app/(app)/admin/brandkits/page.tsx` — Frozen Light admin UI: kit list sidebar, detail panel with color palette editor, logo upload, font list, HTML template editor, prompt version history + AI assist panel, artifact manager with feedToAI toggle
- `src/app/api/projects/`, `src/app/api/campaigns/` — CRUD + soft delete for both; campaign reassignment admin-gated; `GET /api/campaigns/[id]/brandkit` returns resolved kit + source label
- `src/app/(app)/projects/`, `src/app/(app)/campaigns/` — list + detail pages; inline create forms; soft-delete/restore; campaign detail shows resolved brand kit with "Campaign override / Inherited from project / System default" label
- `AppShell` — added Campaigns + Admin nav items

Admin user seeded: `admin@bisteccare.lk` · role = ADMIN · password printed once by the seed script (change after first login). _(Historical note — the account is now SUPER_ADMIN with username `adminBTG`.)_

Running containers: `bistec_studio_postgres` · `bistec_studio_minio`.

**Seeding:**

- `scripts/seed-admin.mjs` — creates the admin user via better-auth `auth.api.signUpEmail()` (writes the hashed-password `Account` row), then promotes role to ADMIN. **Must** go through better-auth — a directly-created `User` has no credential `Account` and cannot log in.
- `scripts/seed-brandkit.mjs` — seeds the default **"Bistec"** brand kit (Glacier palette, Inter + JetBrains Mono as Google Fonts, brand-voice prompt v1 active). Idempotent (skips if a non-deleted default kit exists); mirrors the admin API's single-default invariant; sets `BrandKitPrompt.createdBy` to the seeded admin's id. The brand-voice prompt is **provisional** (inferred from Bistec Global's public positioning) — replace once the official style guide is available.
- `scripts/seed-hearts-talk.mjs` — seeds the **"Hearts Talk"** brand kit (NOT default): navy/cyan/green palette, Orbitron + Poppins + Montserrat (Google Fonts), provisional voice prompt v1, a 1080×1080 HTML template, and LOGO artifacts. Reads assets from `scripts/seed-assets/` at runtime (`hearts-talk-1080x1080.html` required; `hearts-academy-logo.png` + `bistec-global-logo.png` optional). Logos are embedded as **`data:` URIs** (never expire, no MinIO needed). ⚠️ `hearts-academy-logo.png` is not yet present and `bistec-global-logo.png` is a best-guess copy — see `scripts/seed-assets/README.md`.
- Run all via `npm run db:seed` (admin → Bistec → Hearts Talk; admin first so `createdBy` resolves) or individually with `node --env-file=.env scripts/<file>.mjs`. Requires `.env` with `DATABASE_URL` + `BETTER_AUTH_SECRET` and a running Postgres container.

> **~~Known latent bug~~ — FIXED by H10:** the admin UI's logo/artifact upload routes (`/api/admin/brandkits/[id]/upload` + `/artifacts`) previously stored **7-day presigned MinIO URLs** directly in `BrandKit.logoUrl` / `BrandKitArtifact.url`, so UI-uploaded logos broke after ~7 days. As of H10 these buckets are **public-read** and the routes store **stable public URLs** (`publicUrl()`), which never expire. (Legacy rows written before H10 still carry expiring URLs — re-upload to refresh them.)

### Testing kickoff prompt

Paste this to start a testing session. It works **whether or not the brand kits already exist** — `npm run db:seed` is idempotent, so it creates them on a fresh DB and skips them if present (covers both the before- and after-seeding cases in one run).

```
Before testing, verify the working environment is ready — do not assume it is. Run the docs/cold-start.md §0 preflight: confirm .env exists, Postgres + MinIO containers are Up (MinIO port 9000 published to the host), and migrations are applied (npx prisma migrate status). Fix any gap using the matching section of docs/cold-start.md before continuing.

Then seed the database (idempotent — safe whether or not the brand kits already exist):
  npm run db:seed
This ensures the admin user, the default "Bistec" brand kit, and the "Hearts Talk" brand kit. Existing rows are skipped.

Then start the dev server and smoke-test:
  npm run dev
- Log in at http://localhost:3000 as username adminBTG (password: whatever the seed script printed / the current local admin password)
- Open /admin/brandkits and confirm BOTH "Bistec" (system default) and "Hearts Talk" show their colors, fonts, and — for Hearts Talk — the 1080x1080 HTML template and logo artifact(s).
- If ANTHROPIC_API_KEY + OPENAI_API_KEY are set, create a brief and generate a design end-to-end. Otherwise set DESIGN_PROVIDER=cli in .env to exercise the flow without API keys (no Puppeteer render / MinIO upload).

Report any preflight failures or smoke-test errors with the exact command output.
```

**⚠️ Before testing — verify the working environment.** A fresh machine / clean clone needs `.env` created, Postgres + MinIO containers up (MinIO 9000 published to host), migrations applied, and seed run **before** `npm run dev`. Follow the preflight + steps in **[`docs/cold-start.md`](docs/cold-start.md)**. Do not assume the environment is ready — run the §0 preflight check first; most "it doesn't work" reports trace to a missing `.env`, a stopped container, or un-applied migrations.

**Fonts:** brand fonts use **Google Fonts** (open-source, no licensing) — stored in `BrandKit.fonts` as `{name, url}[]` with auto-built `css2?family=…` URLs. The `/admin/brandkits` Fonts editor is a searchable picker over the top-100 Google Fonts (admins never paste URLs). The design agent embeds them via `@import` in generated HTML; Puppeteer fetches them at render (`waitUntil: "networkidle0"`).

**Wave 5 details:**

- `src/lib/social/instagram.ts` — `publish(exportUrl, copyText): Promise<{ platformId }>` wrapping Instagram Graph API two-step flow (create container → publish container). Reads `INSTAGRAM_ACCESS_TOKEN` + `INSTAGRAM_BUSINESS_ACCOUNT_ID` from env. Throws `PublishError("INSTAGRAM", reason)` on API error.
- `src/lib/social/linkedin.ts` — `publish(exportUrl, copyText): Promise<{ platformId }>` wrapping LinkedIn Marketing API (register asset → upload bytes → create UGC post). Reads `LINKEDIN_ACCESS_TOKEN` + `LINKEDIN_ORGANIZATION_ID`. `platformId` from `x-restli-id` header.
- `src/lib/social/types.ts` — `PublishError extends Error` with `channel` + `reason` fields; shared by both publishers.
- `src/app/api/posts/route.ts` — `POST /api/posts` (admin-only, create + immediate publish or schedule); `GET /api/posts` (paginated, admins see all, editors see own).
- `src/app/api/posts/[id]/route.ts` — `GET` (single post + draft); `DELETE` (cancel SCHEDULED → 409 if not scheduled).
- `src/app/api/posts/[id]/publish/route.ts` — `POST` retry for FAILED posts (admin-only).
- `src/scheduler/worker.ts` — entry point for the `scheduler` Docker service; 60s poll loop; catches tick errors without crashing.
- `src/lib/scheduler/jobRunner.ts` — `runScheduledJobs()`: queries `Post WHERE status=SCHEDULED AND scheduledAt<=now`, dispatches sequentially to Instagram/LinkedIn publishers, updates status → PUBLISHED or FAILED + errorReason. Uses `new PrismaClient()` directly (standalone Node.js process).
- `src/app/api/library/route.ts` — `GET /api/library?page&pageSize&status&search`: returns paginated drafts with brief, posts, and resolved brand kit name. Status filter: ALL / READY (EXPORTED + no posts) / SCHEDULED / PUBLISHED / FAILED.
- `src/app/(app)/library/page.tsx` — library page: status tabs, search, 3-col draft grid, load-more pagination, publish dialog modal (admin), `PublishHistoryDrawer` wired with retry.
- `src/components/library/PostCard.tsx` — draft card: thumbnail, topic, channel pills, brand kit name, status chip, Publish (admin) + History buttons.
- `src/components/library/PublishHistoryDrawer.tsx` — slide-in drawer showing all Post rows for a draft: channel, status, dates, platform link, errorReason, retry button.

**Wave 4 details:**

- `src/app/api/briefs/route.ts` — `POST /api/briefs`: creates Brief with full validation (topic, goal, tone, channels, designMode, copyProviderKey required; FK checks for campaign, template, providers)
- `src/app/api/providers/available/route.ts` — `GET /api/providers/available?slot=COPY|IMAGE`: lists enabled providers ordered defaults-first
- `src/app/(app)/brief/page.tsx` — 3-step wizard: Step 1 content (topic/desc/goal/tone), Step 2 brand+design (campaign selector with brand-kit badge, design mode toggle, template/image pickers), Step 3 channels+providers (channel toggles, copy provider select, advanced image provider disclosure)
- `src/app/api/generate/copy/route.ts` — `POST /api/generate/copy { briefId }`: resolves copy provider, builds BriefInput, returns `{ copyText }`
- `src/app/api/generate/image/route.ts` — `POST /api/generate/image { briefId, prompt }`: resolves image provider, handles base64 data URL → MinIO upload, returns `{ imageUrl }`; 422 on moderation error
- `src/app/api/generate/assemble-a/route.ts` — `POST /api/generate/assemble-a { briefId, templateId }`: Path A full pipeline — copy generation → `runDesignAgent` (Haiku, template-fill mode) → Draft created with `status: EXPORTED`
- `src/app/api/generate/assemble-b/route.ts` — `POST /api/generate/assemble-b { briefId }`: Path B full pipeline — brand kit resolution (required) → feed-to-AI artifacts → optional style reference → copy generation → `runDesignAgent` (Sonnet, freeform mode) → Draft created
- `src/providers/implementations/orchestrator/claude-html.ts` — `ClaudeHtmlOrchestrator` implementing `DesignOrchestrator`; wraps `runDesignAgent` with brand-aware system prompt; used by `resolveDesignOrchestrator()` in production
- `src/providers/registry.ts` — `resolveDesignOrchestrator()` now returns `ClaudeHtmlOrchestrator` for `DESIGN_PROVIDER=claude-html` (default); Wave 3 stub removed
- `src/app/api/generate/export/route.ts` — `POST /api/generate/export { draftId }`: short-circuits if `exportUrl` already set; otherwise re-renders `htmlContent` via Puppeteer → MinIO → updates `Draft.exportUrl` + `status: EXPORTED`

---

## What bistec-studio is

An internal web tool for the **Bistec marketing team** that turns a short brief into a
finished, on-brand, ready-to-publish social media post. The tool is NOT healthcare-specific
(that framing was removed — no compliance constraints apply).

**Primary problem it solves:** a key-person bottleneck — only one or two people know the
brand guidelines and per-channel publishing process. bistec-studio removes that dependency
so any team member can produce and publish a post without prior brand or channel knowledge.

**v1 scope:** static image posts only (no video), Instagram + LinkedIn, internal team only,
publish-now or schedule-for-later.

---

## Tech stack (decided)

| Concern          | Choice                                                              | Rationale                                                              |
| ---------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Framework        | Next.js 14 (App Router) + TypeScript                                | Requested                                                              |
| Hosting          | VPS — Docker Compose                                                | Removed all Azure dependencies                                         |
| Auth             | better-auth (self-hosted, email + password)                         | No SaaS dependency; sessions in PostgreSQL                             |
| Database         | PostgreSQL (Docker container) + Prisma ORM                          | Type-safe, migration tooling, PG arrays                                |
| Object storage   | MinIO (Docker container, S3-compatible)                             | Self-hosted, replaces Azure Blob Storage                               |
| Secrets          | `.env` file on VPS (`chmod 600`, never in git)                      | Replaces Azure Key Vault                                               |
| Scheduler        | Dedicated Docker container (same image as app)                      | Polls DB every 60s, replaces Azure Container Apps Job                  |
| Copy AI          | OpenAI GPT (user-selectable)                                        | Provider abstraction allows future swap                                |
| Image AI         | OpenAI gpt-image-2 (on-demand agent tool; admin-configured default) | Called by Claude when raster imagery is needed; CSS/SVG used otherwise |
| Design rendering | Puppeteer (headless Chromium)                                       | HTML/CSS → PNG, 2× DPI, self-contained VPS                             |
| Design (Path A)  | Claude agent harness fills HTML/CSS template                        | Brand template stored as HTML string in DB                             |
| Design (Path B)  | Claude agent harness generates freeform HTML/CSS                    | Claude designs from scratch, calls generateImage tool                  |

---

## Infrastructure — Docker Compose (4 services)

```
app         — Next.js (port 3000)
scheduler   — same Docker image, runs src/scheduler/worker.ts
postgres    — PostgreSQL, named volume
minio       — MinIO S3-compatible storage, console on 127.0.0.1:9001 only
```

**Secrets security protocol:**

- `.env` file: `chmod 600`, owned by root, never committed to git
- `.gitignore` blocks all `.env*` except `.env.example`
- Husky pre-commit hook as extra guard
- Social API tokens encrypted at rest in DB (AES-256-GCM via `TOKEN_ENCRYPTION_KEY`)
- MinIO served to browser via pre-signed URLs only — MinIO port never publicly exposed

---

## Content hierarchy (added this session)

```
Project  (optional top-level grouping)
  └── Campaign  (can belong to multiple projects, or standalone)
        └── Post / Draft
Standalone post → "Uncategorized" (no campaign assigned)
```

**Brand kits (first-class, admin-managed):**

- A `BrandKit` is its own entity — owns a name, a **versioned brand voice prompt** (`BrandKitPrompt`, rollback per EC-13), a folder of **artifacts** (`BrandKitArtifact` in MinIO — reference images), `colors Json?` (hex palette), `fonts Json?` ({name, url}[]), `logoUrl String?`, and a list of **linked brand templates** (`BrandKitTemplate` rows — each stores an `htmlTemplate` string).
- Artifacts flagged `feedToAI` are passed to the Path B design agent as additional brand context.
- **Template linking**: when creating or editing a brand kit, the admin manages HTML/CSS templates directly. Each template is stored as an `htmlTemplate` string in the DB — no external IDs needed.
- **AI-assisted brand voice prompt**: the prompt editor exposes two Claude-powered modes — **Generate** (empty state: admin describes brand in plain text → Claude drafts full prompt for review) and **Improve** (existing prompt: Claude refines it → presented for review before saving as next version). Both feed through the existing version history so rollback always applies.
- The brief wizard's Path A template picker shows only the templates linked to the resolved brand kit.
- Managed by **admins only** (governance); editors select kits via projects/campaigns.
- Projects/campaigns reference a BrandKit by FK. Precedence at generation time:
  **Campaign brand kit → Project default brand kit → system default brand kit** (`BrandKit.isDefault`).

**Key rules:**

- Projects and campaigns: created/edited/deleted by any role (admin or editor)
- Campaign → project reassignment: **admin-only**
- Soft-delete with recovery for both; scheduled posts under a deleted campaign still fire
- A draft can be linked to multiple campaigns (shared asset — same HTML content + MinIO export, not duplicated)
- Brief UI auto-populates brand kit + tone when a campaign is selected; user not prompted to pick brand kit again unless overriding
- Library supports drill-down filtering: Project → Campaign → Posts; "Uncategorized" is a fixed filter option

---

## Frontend design system — "Frozen Light"

Documented in `docs/ui-reference/` (DESIGN_SYSTEM.md + working HTML reference +
dark/light screenshots). Glassmorphic aesthetic, ice-blue accents.

- **Dark + light themes mandatory** — follows OS preference first visit, persists manual toggle to localStorage (Tailwind `darkMode: "class"`)
- **Self-hosted fonts/icons** — Inter + JetBrains Mono via `next/font`, no external CDN (consistent with self-contained VPS)
- Fidelity: starting point, not rigid — deviate where screens need it
- `T25` scaffolds the theme config + base components (Button, GlassPanel, GlassInput, SegmentedToggle, StatusChip, AppShell, ThemeProvider/Toggle) before any screen task; all UI tasks depend on it
- Diffusion-tool features stripped from the source template (seed, credits, step slider, fine-tuning/billing nav)

> ⚠️ **Build instruction:** When implementing any UI screen, the design context file at `docs/ui-reference/DESIGN_SYSTEM.md` **must be explicitly read and followed** before writing any component. Do not rely on memory or generic Tailwind conventions — the token names, surface levels, glass utility classes, and color ramps are project-specific and must be applied exactly as documented. This applies to every task in every wave.

## The two design paths

### Path A — HTML/CSS brand template

1. User writes brief, selects "Use a template"; campaign auto-populates brand kit
2. User picks from HTML/CSS templates linked to the brand kit (admin-managed, stored in DB as `htmlTemplate` strings)
3. User selects copy model; optionally uploads Additional Image (image model hidden by default — system default used if Claude calls generateImage)
4. `POST /api/design/assemble?mode=template` launches Claude design agent:
   - Claude receives: template HTML/CSS + brand kit (colors as CSS vars, fonts, logoUrl) + copyText + additionalImageUrl?
   - Claude fills/adapts the template; calls `generateImage` tool only if raster imagery is needed, otherwise uses CSS/SVG
   - Claude calls `renderHtml(html, 1080, 1080)` → Puppeteer → PNG → MinIO
5. Draft saved with `htmlContent` (the filled HTML) + `exportUrl` (MinIO PNG URL)
6. Publish now or schedule

**Brief fields (Path A):** topic · description (AI prompt context — speaker bios, event details, key messages) · goal/CTA · tone · channels · template selection · additional image (optional upload)

### Path B — Claude-generated freeform design

1. User writes a brief (design mode = "Generate new design"); user may optionally:
   - Upload one or more **images**, each tagged with intent: **"Embed in design"** (Claude must include it in the layout via `<img>`) or **"Style reference only"** (Claude uses it for compositional inspiration but doesn't embed it)
   - Pick an optional **template reference** from the brand kit's linked templates — passed to Claude as loose style inspiration ("design in this spirit, not a template to fill")
2. `POST /api/design/assemble?mode=generate` launches Claude design agent in freeform mode:
   - Claude receives: brief + brand kit (colors, fonts, logoUrl, voice prompt, feed-to-AI artifacts) + `briefImages[]` (each with `url` + `intent: "embed" | "reference"`) + optional reference template HTML (with "style inspiration only" instruction)
   - Claude generates complete HTML/CSS design from scratch; embeds images tagged `"embed"` directly in the HTML; uses images tagged `"reference"` only as compositional guidance
   - Claude calls `generateImage(prompt)` tool only when raster imagery genuinely serves the design → MinIO; otherwise uses CSS/SVG/gradient backgrounds
   - Claude calls `renderHtml(html, 1080, 1080)` → Puppeteer → PNG → MinIO
3. Draft saved with `htmlContent` + `exportUrl`
4. Same publish flow as Path A

---

## Claude Design Agent Harness

The generation backend runs as a Claude tool-use agent (`src/lib/agent/designAgent.ts`).
The same pattern is used for both paths and for AGUI refinement.

Tools available:

- `generateImage(prompt, brandKitId)` — calls resolved ImageProvider → MinIO URL
- `renderHtml(html, width, height)` — Puppeteer headless Chrome → PNG → MinIO URL
- `getBrandKitContext(briefId)` — resolves brand kit (campaign→project→default), returns colors/fonts/logoUrl/voicePrompt

Agent loop: standard Anthropic tool-use. Hard limit: 15 tool calls per run.

`src/lib/renderer/puppeteer.ts`: `renderHtmlToPng(html, w, h): Promise<Buffer>`.
deviceScaleFactor: 2 → 2160×2160 → PNG buffer. Caller uploads to MinIO.

---

## Path A/B validation

Path A/B validation pending — to be completed once the HTML renderer + agent harness are built.

---

## AI Provider Abstraction Layer (key architecture decision)

The frontend never knows which AI model runs. Three stable interfaces in `src/providers/`:

```
CopyProvider      { generateCopy(brief): Promise<string> }
ImageProvider     { generateImage(brief): Promise<{ url: string }> }
DesignOrchestrator{ orchestrate(brief, brandKitId): Promise<{ htmlContent: string, exportUrl: string }> }
```

**Provider resolution order:**

- **Copy:** `Brief.copyProviderKey` → `AvailableProvider.isDefault` for COPY slot → `COPY_PROVIDER` env var
- **Image** (when Claude calls `generateImage` tool): `Brief.imageProviderKey` (optional, user override) → `AvailableProvider.isDefault` for IMAGE slot → `IMAGE_PROVIDER` env var

The design orchestrator is NOT user-selectable — env-configured only.

---

## Database schema (Prisma) — key models

> Visual ERD: [`docs/erd.svg`](docs/erd.svg)

- `User` — id, name, email, emailVerified, image, role (ADMIN | EDITOR), sessions[], accounts[]
- `Project` — name, defaultBrandKitId, defaultTone, isDeleted, deletedAt
- `Campaign` — name, brandKitId (override), defaultTone, isDeleted, deletedAt
- `ProjectCampaign` — M2M join (project ↔ campaign)
- `CampaignDraft` — M2M join (campaign ↔ draft, shared asset linking)
- `Brief` — topic, **description** (AI prompt context — speaker bios, event details, key messages), goal, tone, channels[] (default both; the publish step picks targets), **aspectRatio** (SQUARE=1080×1080 | PORTRAIT=1080×1350 — chosen in the wizard), designMode, **campaignId** (nullable = Uncategorized), **brandKitId** (nullable — explicit per-brief kit), copyProviderKey, **imageProviderKey** (optional — overrides system default image provider if Claude calls `generateImage`), **additionalImageUrl** (nullable — MinIO URL of user-uploaded image placed into template slot, Path A only), **briefImages** (Path B only — JSON array of `{ url: string, intent: "embed" | "reference" }` objects; MinIO URLs of user-supplied images; `"embed"` images are placed in the HTML layout, `"reference"` images are passed as compositional inspiration only), **referenceTemplateId** (nullable — FK → BrandKitTemplate; Path B only — the chosen template's HTML is passed to Claude as style inspiration, not filled)
- `Draft` — copyText, **imageUrl?** (MinIO URL from `generateImage` tool call — null if Claude used CSS/SVG), **htmlContent** (current HTML state), templateId, exportUrl (MinIO), status
- `Post` — channel (INSTAGRAM | LINKEDIN), status, scheduledAt, publishedAt, platformId, errorReason
- `BrandKit` — name, **colors Json?** (hex palette), **fonts Json?** ({name, url}[]), **logoUrl String?**, isDefault, isDeleted — first-class, admin-managed; referenced by Project.defaultBrandKitId and Campaign.brandKitId
- `BrandKitPrompt` — brandKitId, content, version, isActive (versioned brand voice for rollback — EC-13)
- `BrandKitArtifact` — brandKitId, type, name, url (MinIO), feedToAI (whether passed to AI as brand context)
- `BrandKitTemplate` — brandKitId, **htmlTemplate String** (HTML/CSS string), name, **aspectRatio** (SQUARE | PORTRAIT — the size this template is designed for; the brief picker filters to the chosen size)
- `AvailableProvider` — slot (COPY | IMAGE), providerKey, providerName, label, keyPrefix (display only), encryptedApiKey, isEnabled, isDefault
- `DraftRevision` — draftId, revisionNumber, **htmlSnapshot String** (full HTML at this revision), **exportUrl String** (MinIO PNG URL), instruction (the user's chat message that produced this revision), createdAt

---

## Specclaw files (all committed)

| File                          | Location                                      |
| ----------------------------- | --------------------------------------------- |
| `proposal.md`                 | `.specclaw/changes/marketing-post-studio-v1/` |
| `spec.md`                     | `.specclaw/changes/marketing-post-studio-v1/` |
| `design.md`                   | `.specclaw/changes/marketing-post-studio-v1/` |
| `tasks.md`                    | `.specclaw/changes/marketing-post-studio-v1/` |
| `wave-1-scaffold.md`          | `.specclaw/changes/marketing-post-studio-v1/` |
| `wave-2-providers.md`         | `.specclaw/changes/marketing-post-studio-v1/` |
| `wave-3-canva-minio.md`       | `.specclaw/changes/marketing-post-studio-v1/` |
| `wave-3b-brand-data-layer.md` | `.specclaw/changes/marketing-post-studio-v1/` |
| `wave-4-generation.md`        | `.specclaw/changes/marketing-post-studio-v1/` |
| `wave-5-publishing.md`        | `.specclaw/changes/marketing-post-studio-v1/` |
| `wave-6-admin-e2e.md`         | `.specclaw/changes/marketing-post-studio-v1/` |

`tasks.md` is the canonical task source. The wave files are detailed execution proposals derived from it — one per wave, each with full task specs, parallelism diagrams, and completion checklists.

**Specclaw status:** All 6 waves complete — v1 feature complete

---

## Task breakdown (30 tasks, 6 waves + Wave 3b)

| Wave  | Focus                                                   | Tasks                                                                                                                                               |
| ----- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 ✅  | Project scaffold + Docker Compose infra + design system | T01 Next.js init, T02 Docker Compose, T03 Prisma schema, T04 better-auth, T25 Design system foundation                                              |
| 2 ✅  | Provider abstraction layer                              | T05 Interfaces, T06 OpenAI copy, T07 OpenAI image, T08 Registry                                                                                     |
| 3 ✅  | HTML renderer (Puppeteer) + Claude design agent, MinIO  | T09 Puppeteer renderer + design agent, T10 MinIO client                                                                                             |
| 3b ✅ | Brand kits, Projects & Campaigns (data layer)           | T26 BrandKit management (API + admin UI), T23 Project/Campaign API routes, T24 Projects/Campaigns UI                                                |
| 4 ✅  | Core generation + design assembly                       | T11 Brief UI + model/campaign select, T12 Copy route + image tool handler, T13 Path A assembly, T14 Path B orchestrator, T15 Export route           |
| 5 ✅  | Publishing, scheduling, library                         | T16 Social publishers, T17 Publish/schedule routes, T18 Scheduler worker, T19 Library UI (drill-down)                                               |
| 6 ✅  | Admin settings + E2E                                    | T20 Admin provider settings, T21 Draft refinement UI + AGUI backend, T22 E2E Playwright tests, T27 Schema migration, T28 MCP server, T29 ACP server |

**Highest-risk item:** Instagram Graph API Meta Business app review (can take weeks).
Start the Meta Business app registration **before** Wave 1 code begins — it blocks AC-3.

---

## Open questions (for build phase)

0. Which OpenAI model drives copy generation? (GPT-4o recommended)
1. **Social API access** (highest risk): who owns obtaining Meta Business app approval and LinkedIn app permissions, and what is the timeline?
2. **HTML template authoring** — who creates the initial HTML/CSS brand templates and what is the process?
3. ~~**Font licensing** — are brand fonts self-hostable?~~ **Resolved** — brand kits use Google Fonts (open-source, no licensing); admins pick from a searchable list in `/admin/brandkits`, URLs auto-built. App UI fonts (Inter + JetBrains Mono) remain self-hosted via `next/font`.
4. Cost/rate controls: per-user or per-period generation limits for AI calls
5. Which additional AI models (beyond OpenAI) should be registered at launch for user-selectable copy/image generation?

---

## AGUI — Chat-driven design refinement

After a design is returned (Path A or Path B), the draft page exposes a **chat-driven refinement panel**. The user types natural language instructions; Claude interprets them, updates the HTML, and Puppeteer re-renders. The user never directly manipulates design elements.

**How it works:**

1. User types an instruction (e.g. "reposition the topic to the bottom", "change the background to something darker")
2. Backend runs Claude design agent with `draft.htmlContent` as context + instruction
3. Claude checks brand kit compliance, updates the HTML
4. Claude calls `renderHtml` → new PNG → MinIO
5. `DraftRevision` row created: `htmlSnapshot` (the updated HTML) + `exportUrl` (new PNG URL)
6. Design preview refreshes in the UI

**AI model:** same model as the originating path — Path A drafts use `claude-haiku-4-5-20251001`; Path B drafts use `claude-sonnet-4-6`. Resolved from `brief.designMode`, no additional selection needed.

**Undo:** each committed refinement stores the full `htmlSnapshot` in `DraftRevision`. Restore = load `htmlSnapshot`, call `renderHtml`, update `Draft.htmlContent` + `Draft.exportUrl`.

**Brand kit enforcement:**

- Before committing any edit, Claude checks whether the instruction conflicts with the resolved brand kit (colours, fonts, logo placement)
- If a conflict is detected, Claude returns a **conflict card** in the chat panel with the explanation and two buttons: **Override** and **Cancel** — the user never types "override"
- The pending conflict is stored on the Draft row (`pendingConflict Json?`) so the backend knows what to apply if Override is clicked
- Clicking Override sends `{ conflictId }` to the refine endpoint — backend loads the pending instruction, skips compliance check, applies the HTML change
- Clicking Cancel dismisses the card; no request is sent; `pendingConflict` is cleared on the next instruction

**What the refinement panel does NOT do (FR-33e):**

- The refinement panel does not allow direct element manipulation or asset uploads mid-refinement. All changes are applied server-side via Claude HTML generation + Puppeteer rendering only.

**New DB model:** `DraftRevision` — draftId, revisionNumber, htmlSnapshot (the full HTML at this revision), exportUrl (MinIO PNG), instruction (the user's chat message that produced this revision), createdAt. Supports the undo stack.

---

## AI provider registration (admin UI)

Admins can register any AI provider directly from the bistec-studio settings UI — no redeploy or env var change required. A registered provider becomes available to users immediately.

**Registration flow:**

1. Admin enters an API key
2. The system inspects the key prefix and auto-identifies the provider where possible:
   - `sk-ant-` → Anthropic (Claude)
   - `sk-` → OpenAI (GPT)
   - Other recognizable formats → Groq, Mistral, Google, etc.
3. If the provider is identified, the name and label are auto-populated
4. If the key format is unrecognized, the admin manually specifies the provider name and label and proceeds — no block
5. The system validates the key against the provider's API before saving
6. Admin assigns the provider to one or more slots: **copy**, **image**, or both
7. Admin sets whether the provider is enabled and whether it is the default for that slot

**Storage:** API keys are stored encrypted at rest (AES-256-GCM, same pattern as social tokens). Keys are never exposed to the browser after initial entry — the settings UI shows only the key prefix (e.g. `sk-ant-••••••••`) for identification.

**DB model (`AvailableProvider`):** slot (COPY | IMAGE), providerKey, label, providerName, isEnabled, isDefault, keyPrefix (for display), encryptedApiKey.

**User-facing clarity:** the model selector in the brief UI displays the provider name and label as registered by the admin — e.g. "Claude 3.5 Sonnet (Anthropic)" or "GPT-4o (OpenAI)" — so users always know exactly which model and provider they are selecting.

---

## AI model versioning policy

- **Image generation:** on-demand only — Claude calls `generateImage` when raster imagery is needed. Always use the latest available model. Currently `gpt-image-2`. When a new model is released, update the provider implementation — no other code changes required.
- **Any new AI provider added** (image or copy) should default to its latest available generation model, not a pinned older version.
- The `ImageProvider` / `CopyProvider` abstraction means swapping models is a single-file change in `src/providers/implementations/`.

## bistec-studio MCP server (v1)

The bistec-studio MCP server ships in v1. It is an **admin tool first** — its primary purpose at launch is to let an admin use Claude in the terminal to set up and manage brand kits without going through the UI (e.g. reading brand data from Canva and writing it into bistec-studio in one conversational session). It also makes bistec-studio callable from any MCP-compatible AI model for agentic workflows.

```
AI models / Claude terminal  →  bistec-studio  (MCP server)
bistec-studio                →  Puppeteer      (HTML renderer)
```

Tools exposed (v1):

```
create_brand_kit(name, colors, fonts, logoUrl)     → { brandKitId }
set_brand_kit_prompt(brandKitId, content)          → { promptId }
upload_brand_template(brandKitId, name, html) → { templateId }
list_brand_kits()                                  → { kits }
get_brand_kit(id)                                  → { kit, templates, activePrompt }
generate_post(brief)                               → { exportUrl, htmlContent }
get_draft(id)                                      → { copy, imageUrl, status }
publish_post(draftId, channel)                     → { platformId }
```

All admin tools (`create_brand_kit`, `set_brand_kit_prompt`, `upload_brand_template`) are gated to admin API keys. Read + generation tools are available to any authenticated caller.

## bistec-studio ACP server (v1)

bistec-studio also ships an ACP server in v1, making it callable not just by AI models (MCP) but by peer agents. Both protocol layers ship together — ACP is an additive adapter over the same tool logic already exposed by the MCP server, so the incremental cost is minimal.

```
External agents  →  bistec-studio  (ACP server)
AI models        →  bistec-studio  (MCP server)
bistec-studio    →  Puppeteer      (HTML renderer)
```

### ACP server (Agent Communication Protocol — BeeAI/IBM)

Exposes bistec-studio as a peer agent in multi-agent systems. Where MCP makes bistec-studio callable by a model, ACP makes it callable by another agent — enabling orchestration pipelines where bistec-studio is one step among many (e.g. an event management agent that auto-generates and publishes speaker posts as registrations are confirmed).

---

## What was explicitly ruled OUT of v1

- Video generation/publishing
- Custom pixel/canvas/layout editor
- Canva integration of any kind
- Channels beyond Instagram + LinkedIn
- Full content calendar UI
- External/client self-serve access
- Healthcare compliance constraints

---

## Testing without an Anthropic API key

Set `DESIGN_PROVIDER=cli` in `.env` (or `.env.local`) to use the **Claude Code CLI proxy** instead of the production design agent. This routes all `DesignOrchestrator` calls through a subprocess call to `claude -p "<prompt>"`, using the developer's authenticated Claude Code session on the host machine.

**File:** `src/providers/implementations/orchestrator/claude-cli.ts`

**What still works in CLI mode:**

- Full brief wizard flow, DB writes, draft page, library, publish UI
- Real Claude-generated HTML/CSS design output
- Brand kit context is included in the prompt (colors, fonts, voice)

**What is skipped:**

- Tool-use loop — single-shot call only
- Puppeteer rendering — `exportUrl` returns empty string; draft preview shows a placeholder
- `generateImage` tool — no raster image generation
- MinIO upload

**How to switch back to production:** remove `DESIGN_PROVIDER` or set it to `claude-html`.

This is a dev-only convenience — never set `DESIGN_PROVIDER=cli` in production.

---

## Wave 3 prerequisites note

- All npm deps present: `@anthropic-ai/sdk`, `puppeteer-core`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`
- `ANTHROPIC_API_KEY` must be set in `.env` — required by design agent
- MinIO env vars already set; buckets auto-created on cold start
- **Chromium (Windows local dev):** `puppeteer-core` does not bundle Chromium. Set `PUPPETEER_EXECUTABLE_PATH` in `.env` pointing to a local Chrome/Chromium install (e.g. `C:\Program Files\Google\Chrome\Application\chrome.exe`). On the VPS Docker image, Chromium is baked in — no extra config needed.
- `DESIGN_PROVIDER=cli` bypasses both Anthropic API and Puppeteer for local testing without burning tokens

---

## Architecture decisions

- All AI calls are **server-side only** — the browser never calls an AI API or Puppeteer directly
- **Brand kit precedence:** Campaign kit → Project default → system default (`BrandKit.isDefault = true`)
- **AI provider resolution order:** Brief's chosen key → `AvailableProvider.isDefault` → env var fallback
- **API keys** stored AES-256-GCM encrypted; only `keyPrefix` shown in UI after registration; full key never returned
- **MinIO** served to browser via pre-signed URLs only — MinIO port never publicly exposed
- **Path B** uses Claude agent harness in freeform HTML generation mode
- **Image generation is on-demand** — `generateImage` is a tool Claude calls when raster imagery is needed; CSS/SVG backgrounds require no external call. `Brief.imageProviderKey` is optional (system default used if not set). `Draft.imageUrl` is nullable.
- **AGUI:** natural language → Claude agent updates HTML → Puppeteer re-renders → `DraftRevision(htmlSnapshot)`
- **Brand kit data** (colors, fonts, logoUrl) stored directly in DB — no external brand kit IDs
- **Claude models by mode:** Path A (template fill) → `claude-haiku-4-5-20251001` (~10× cheaper, sufficient for constrained task); Path B (freeform design) → `claude-sonnet-4-6` (stronger reasoning for layout decisions); AGUI refinement → same model as originating path; brand voice prompt assistance → Sonnet (infrequent admin operation)
- **Anthropic API required in production** — the design agent uses `api.anthropic.com` with a registered `sk-ant-` API key. For local testing without a key, set `DESIGN_PROVIDER=cli` to use the Claude Code CLI proxy (see "Testing without an Anthropic API key" section above). The claude.ai subscription cannot be used for multi-turn tool-use in production.

---

## Prototype — removed 2026-06-23

The static `bistec-studio-proto/` prototype (and `docs/prototype-pages.md`) were **removed** during cleanup once the real app implemented every page. The live app under `src/app/(app)/` is now the source of truth for page layouts and flows; the design system reference remains in `docs/ui-reference/`.

---

## Repo notes

- Remote is still named `bistec-oss/designer` on GitHub — user attempted rename to
  `bistec-studio` but lacked org admin rights. To complete the rename:
  go to https://github.com/bistec-oss/designer/settings, rename to `bistec-studio`, then:
  `git remote set-url origin https://github.com/bistec-oss/bistec-studio.git`
