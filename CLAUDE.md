# bistec-studio — Claude Context

This repo contains planning documents for **bistec-studio**, an internal marketing post generation tool for the Bistec marketing team.

## ✅ Outstanding work — START HERE (updated 2026-07-07)

**✅ Campaign briefing + scheduled post generation — 2026-07-07** (see `docs/handoff.md` top section):

- **Versioned campaign briefing** (`CampaignBriefing`, mirrors `BrandKitPrompt`): campaign-level free-text context injected into every generation under the campaign (copy + Path A/B + background prompts; refine excluded) on top of the brand voice. `GET/POST /api/campaigns/[id]/briefing` + `[vid]/activate`; writes admin-only. Loader: `getActiveCampaignBriefing()` (`src/lib/campaign/briefing.ts`). `PROMPT_VERSION=2026-07-07.1`.
- **One generation orchestrator:** `generateDraftForBrief()` (`src/lib/agent/generateDraft.ts`) + new `runPathADesign` (`src/lib/agent/pathA.ts`); assemble-a/b + MCP are thin adapters.
- **Scheduled generation queue** (`ScheduledGeneration`): per-campaign planned posts with `generateAt` + postAction HOLD / SCHEDULE_PUBLISH / PUBLISH_NOW; routes under `/api/campaigns/[id]/queue` (list/create/edit/cancel/rerun). Editors plan HOLD; auto-publish actions admin-only. Worker (`generationRunner.ts`) mirrors H12 (SKIP LOCKED claim, 15-min lease, 3 retries 20/40/60-min backoff); post-actions create SCHEDULED Post rows handled by the existing publish scheduler. `worker.ts` runs two independent loops.
- **UI:** campaign page briefing editor + planned-posts queue table + entry modal; wizard shows the active briefing.
- **⚠️ Deploy:** `npx prisma migrate deploy` (migrations `20260707052036`, `20260707054311`). **Scheduled generation needs API mode in the Docker scheduler container** (no `claude` CLI there — the worker warns at startup under `DESIGN_PROVIDER=cli`).
- Tests: 72/72 unit; E2E baseline + 12 new cases in `tests/e2e/campaign-scheduling.test.ts` (needs `MOCK_AI` + test-DB access for the worker-flow cases).

**✅ Background images + CLI OAuth + Topic field + admin delete — 2026-07-03** (see `docs/handoff.md` top section):

- **AI background images (Path B + refine):** `src/lib/agent/background.ts` pre-step — Haiku decides `{needed, prompt}` (biased yes at generation, instruction-gated at refine) → gpt-image-2 via `resolveImageProvider()` → public IMAGES bucket → URL injected into the design/refine prompts and stored on `Draft.imageUrl`. Never fails the pipeline (skips to CSS/SVG on any error); `MOCK_AI` skips it. Portrait→`1024x1536`, square→`1024x1024` (`imageSizeFor`).
- **CLI-mode OAuth token:** set `CLAUDE_CODE_OAUTH_TOKEN` in `.env` (`claude setup-token`, ~1 yr) — headless `claude -p` spawns authenticate without the interactive login. API-key migration later = set `ANTHROPIC_API_KEY` + `DESIGN_PROVIDER=claude-html`, no code change.
- **Brief wizard Topic field:** short required Topic → `Brief.topic` (library card name); the big prompt textarea → `Brief.description`. No schema/API change.
- **Admin library delete:** `DELETE /api/drafts/[id]` (admin, transactional: posts → revisions → draft → orphaned brief) + trash button on `PostCard`.
- **⚠️ To activate:** fill `CLAUDE_CODE_OAUTH_TOKEN=` and `OPENAI_API_KEY=` in `.env`. Background generation not yet runtime-verified with real keys (unit + mock-E2E green: 55/55 unit, 80/0/4 E2E).

**✅ Improvement review fully remediated — 2026-07-02/03.** A four-reviewer whole-system design/code review found **77 findings** ([`docs/improvement-review-2026-07-02.md`](docs/improvement-review-2026-07-02.md)); **all 77 are remediated** across four phased commits on `main` (`689131cc`, `74725f28`, `b6fe63dd`, `8a1b2fae`). Structural changes to know about:

- **One design pipeline.** The `DesignOrchestrator` layer is deleted; web routes, CLI mode, and the MCP/ACP surface all run the same `runPathBDesign`/assemble-a core. Prompts are pure builders in `src/lib/agent/prompts/` (a `PROMPT_VERSION` is stamped on every Draft); model policy is `modelFor(path, mode)` in `src/lib/agent/config.ts` (Path A haiku / Path B sonnet, API + CLI variants).
- **Shared route infrastructure.** All session-authed API handlers use `withAuth`/`withAdmin` + zod `parseBody` (`src/lib/api/handler.ts`). Env config is centralized + validated in `src/lib/env.ts` (32 vars, fail-fast in production, skipped during `next build`).
- **One publish service.** `src/lib/publish/publishDraft.ts` owns the channel map + PENDING→PUBLISHED/FAILED machine; duplicate (draft, channel) publishes 409; ACP publishes record FAILED rows and respect draft status.
- **Frontend data layer.** React Query v5 (`QueryProvider`), typed `apiFetch<T = unknown>`, shared `src/lib/api-types.ts`, `useCurrentUser`; library uses `useInfiniteQuery`. Overlays are Radix (`src/components/ui/Modal.tsx`); errors via sonner toasts + `useConfirm()` (zero `alert()`/`confirm()`); admin is role-gated (nav + `admin/layout.tsx`). God components split: brief wizard → `src/components/brief/*` (117-line page), admin brandkits → `src/components/admin/brandkits/*`, draft page → `src/components/drafts/*`.
- **Deployment + gates.** The Docker prod image **builds** now (`output: 'standalone'`, `.dockerignore`, esbuild-bundled scheduler worker at `dist/scheduler/worker.js`); compose has healthchecks, loopback Postgres, pinned MinIO. CI runs lint + 45 vitest unit tests (`npm run test:unit`) + `npm run build` + `docker build` + the E2E suite. Renderer egress is allowlisted (MinIO + Google Fonts only — see `src/lib/renderer/puppeteer.ts`).
- **Migrations:** `20260702110000` (Brief.channels → `Channel[]` uppercase, `updatedAt` on Draft/Post, drop dead `CampaignDraft`) and `20260702113000` (`Draft.promptVersion`). Run `npx prisma migrate deploy` after pulling.

The earlier (2026-06) code review is also **fully remediated — all 28 fixes done**. Full details in **[`docs/code-review-findings.md`](docs/code-review-findings.md) → Remediation Status**.

The final 6 (the others landed earlier):

| ID  | Fix                                                                                                                                                                                | Migration                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| H7  | Transaction atomicity — refine revision #, prompt version, posts create→publish wrapped in `$transaction` (P2002 → retry/409). Unique constraints already existed.                 | no                                   |
| H9  | Prisma indexes — `Post(status,scheduledAt)` + `(status,nextRetryAt)`, FK indexes, `BrandKit(isDefault,isDeleted)`.                                                                 | `20260623153740_h9_indexes`          |
| H12 | Scheduler atomic claim (`FOR UPDATE SKIP LOCKED`) + `PUBLISHING` lease + exponential-backoff retry (`retryCount`/`nextRetryAt`).                                                   | `20260623154752_h12_scheduler_claim` |
| H10 | Hybrid MinIO storage — public-read IMAGES/BRANDKITS buckets (stable URLs); private EXPORTS store object key, signed at read (`resolveExportUrl`). New `MINIO_PUBLIC_ENDPOINT` env. | no                                   |
| H11 | Puppeteer singleton browser + `p-limit` concurrency cap (`PUPPETEER_MAX_CONCURRENCY`, default 2).                                                                                  | no                                   |
| L2  | Shared `src/lib/apiFetch.ts` + `src/lib/brandkit/systemContext.ts`.                                                                                                                | no                                   |

> After pulling these, run `npx prisma migrate deploy` (or `migrate dev`) to apply the new migrations before starting the app. As of 2026-06-24 there is a third migration, `20260624120000_brief_brandkit` (adds `Brief.brandKitId`); as of 2026-06-30 a fourth, `20260630094723_aspect_ratio` (adds the `AspectRatio` enum + `Brief.aspectRatio` + `BrandKitTemplate.aspectRatio`).

**✅ Per-path CLI model split + generation diagnosis — 2026-07-01:** Both design paths were verified end-to-end (real Chromium render, no mocks) and the CLI model is now **per-path**, matching the API path.

- **Model split (both orchestrators): Path A (template fill) → Haiku, Path B (freeform) → Sonnet.** The API path already did this (`assemble-a` haiku, `pathB.ts`/`regenerate-design` sonnet, `refine` per `designMode`). The **CLI path** now matches: `runClaudeCli`/`runDesignAgentCli` take a per-call `model`, wired at `assemble-a` (`haiku`), `pathB.ts` (`sonnet`), and `refine` (`designMode==='TEMPLATE' ? haiku : sonnet`). **`CLAUDE_CLI_MODEL` is now a _global override_ — when unset, the per-path split applies; when set, it forces one model across every `claude -p` call** (copy included; copy defaults to haiku). `default` still omits `--model` (account default/Opus — avoid).
- **Diagnosis (CLI mode, keyless, current Claude account):** Path A → 54s, valid 2160×2160 PNG. Path B → 55s (Haiku) / 61s (Sonnet, richer 1017-char brief), both valid 2160×2160. No timeouts, no dropped assets, no credit runaway. The old Path B timeouts were the **Opus default**, not Sonnet — Sonnet finishes ~5× under the 300s budget. **Sonnet's Path B output is markedly richer** (feature-card grid, stat band, decorative motifs; 2.09 MB vs Haiku's 178 KB) — hence Sonnet for freeform, Haiku for template fill. Not runtime-verified after the split wiring (would re-burn credits); typecheck clean, logic mirrors the verified runs.

**✅ CLI timeout + credit-burn-on-timeout fix — 2026-06-30:** CLI-mode generation (`DESIGN_PROVIDER=cli`) could time out and produce no image **while still burning credits**. Fixed in `src/lib/agent/claudeCli.ts`:

- **Tree-kill on timeout (root cause of the burn).** On Windows the CLI runs via a `cmd.exe` shell (`spawn("claude.cmd", {shell:true})`), so the old `child.kill()` killed only the shell — `claude` kept running and billing after the timeout error. New `killTree()` uses `taskkill /pid <pid> /T /F` (win32) / SIGKILL (POSIX). Verified.
- **`--strict-mcp-config`** added to the spawn (zero MCP servers) so the headless run doesn't inherit the dev's session connectors (latency + context-bloat + cost).
- **Diagnostic logging** (`CLAUDE_CLI_DEBUG`, on by default, `0` to silence): spawn details, live stderr, a 20s heartbeat, and elapsed timing; calls tagged `"copy"`/`"design"`. Timeouts unchanged (design 300s, copy 120s); normal gen measured ~76s so it fits. See `docs/handoff.md` top section.

**✅ Post size picker + publish dialog + CLI model — 2026-06-30:** Three related changes landed:

- **The brief now picks a SIZE, not platforms.** Wizard step 1 ("Size & Design") offers **1:1 (1080×1080)** or **3:4 (1080×1350)**; channels default to both feeds and are chosen at _publish_ time instead. New `AspectRatio` enum on `Brief` + `BrandKitTemplate`. Pixel dims/labels live in the single source **`src/lib/aspectRatio.ts`** and are threaded through every render site (assemble-a, pathB, the design agent API + CLI, and the export/refine/restore routes + their prompts) so the canvas, the model instruction, and the preview never drift. The Path A template picker filters to the chosen size and `assemble-a` rejects a ratio mismatch (no stretching). Draft preview + library tiles reflect the ratio. Admin template create gets a size selector + badge; `scripts/seed-portrait-template.mjs` seeds a 3:4 template on the default kit.
- **Publish dialog on the draft page.** The library `PublishDialog` (channel checkboxes + optional schedule) is now a shared component (`src/components/library/PublishDialog.tsx`) wired into the draft review page's Publish button, replacing the old `confirm()`.
- **CLI mode model is configurable (`CLAUDE_CLI_MODEL`).** `claudeCli.ts` passes `--model` to `claude -p`; without a model the CLI used the costly account default (Opus), the root cause of CLI Path B burning credits. **As of 2026-07-01 the model is per-path by default (see the entry below) — `CLAUDE_CLI_MODEL` is now a global override, not the default source.**

**✅ Brand-kit selection + Hearts Talk fix — 2026-06-24:** Three related changes landed:

- **Oversized templates now work (Hearts Talk Path A fixed).** The orchestrator externalizes inline `data:` assets before the prompt and re-inlines them before render — see "Inline-asset externalization" below. The 600k CLI guard and the API's ~200k context are no longer hit; no re-seed needed.
- **Brand kit is selectable per brief** (independent of campaign) and the template picker filters to the selected kit (Path A + Path B). New `Brief.brandKitId`; precedence is now **explicit brief kit → campaign → project → system default**.
- **Brand kits are assignable on campaigns/projects** at create + edit (UI added; APIs already supported it). A campaign/project's assigned kit becomes the brief default; if none, the user picks one at the brief.

### Inline-asset externalization (the Hearts Talk fix)

`src/lib/agent/inlineAssets.ts` — `extractInlineAssets(html)` replaces every `data:` URI with a short `__INLINE_ASSET_n__` token (the model only ever sees the compact structural HTML — Hearts Talk shrinks 1.89 MB → 6.2 KB); `restoreInlineAssets(html, assets)` splices the originals back just before Puppeteer renders (byte-for-byte lossless). Threaded through `DesignAgentOptions.inlineAssets`, the CLI runner (`designAgentCli.ts`, with a template-fill instruction that tells Claude to preserve the placeholders), the API tool-use runner (`designAgent.ts`), and `assemble-a/route.ts`. Generic to any oversized template — not specific to Hearts Talk.

> Before testing/running, follow `docs/cold-start.md` §0 preflight. Dev server runs on `http://localhost:3000`; CLI-mode generation (`DESIGN_PROVIDER=cli`) needs the seeded `cli` provider (`node --env-file=.env scripts/seed-cli-provider.mjs`).

## What this project is

A Next.js 14 + TypeScript web app that turns a brief into a finished, on-brand, ready-to-publish social media post (Instagram + LinkedIn). Two generation paths:

- **Path A** — HTML/CSS brand template (stored in DB), Claude agent fills it → Puppeteer renders PNG
- **Path B** — Claude agent generates freeform HTML/CSS design → Puppeteer renders PNG

Stack: Next.js 14, TypeScript, Prisma, PostgreSQL, MinIO, better-auth (self-hosted), Docker Compose. Puppeteer (headless Chromium) for HTML→PNG rendering. Claude agent harness (Anthropic SDK tool-use loop) drives design generation.

## Key reference documents

### UI / Design system

Before building or modifying any page, read the design system:

- **[`docs/ui-reference/DESIGN_SYSTEM.md`](docs/ui-reference/DESIGN_SYSTEM.md)** — the design system for bistec-studio. Read this before writing any component or page. Also reference [`docs/ui-reference/screen-dark.png`](docs/ui-reference/screen-dark.png) and [`docs/ui-reference/screen-light.png`](docs/ui-reference/screen-light.png) for visual reference, and [`docs/ui-reference/synthetix-original-reference.html`](docs/ui-reference/synthetix-original-reference.html) for the source HTML reference.

### Architecture & technical design

Before writing any backend code, API routes, Prisma models, or provider logic, read the design document:

- **[`.specclaw/changes/marketing-post-studio-v1/design.md`](.specclaw/changes/marketing-post-studio-v1/design.md)** — authoritative source for the Prisma schema, all API route contracts, the AI provider abstraction layer (`CopyProvider`, `ImageProvider`, `DesignOrchestrator` interfaces), the Claude design agent harness, the Puppeteer renderer, MinIO integration, AGUI backend flow, provider registration encryption, and the full file/folder structure of the real app. Any implementation that touches data models, API routes, or provider logic must align with this document.

### Code review & remediation status

- **[`docs/code-review-findings.md`](docs/code-review-findings.md)** — full code review (42 findings) + **Remediation Status** (✅ all 28 fixed as of 2026-06-23) plus the one open known issue (oversized "Hearts Talk" template breaks Path A). **Read this before picking up review/remediation work.**

### Testing

- **[`docs/e2e-test-plan.md`](docs/e2e-test-plan.md)** — the authoritative E2E test design + catalog. **The full §6 catalog (§A–§L, ~80 cases) is implemented & green** (77 passed / 0 failed / 4 intentional skips, ~4 min, confirmed 2026-06-30). Mock seams live in `src/lib/testHooks.ts` (gated by `MOCK_AI`/`MOCK_PUPPETEER`/`MOCK_SOCIAL`, dormant in prod); run against a dedicated `bistec_studio_test` DB. Reproduce: `npm run test:e2e:db` → `npm run test:e2e:serve` → `npm run test:e2e:mock` (plan §0). **CI gate:** `.github/workflows/e2e.yml` runs the whole suite — including the §K security-fix regressions — on every PR + push to `main`. **⚠️ `.env.test` must use `DESIGN_PROVIDER=claude-html` (not `cli`) — CLI mode bypasses the `MOCK_AI` seam and times out generation tests.**
  - Test-only seams added for the catalog (all dormant in prod): `buildMockCopy`/`shouldMockPublishFail` in `testHooks.ts` (deterministic publish failures via a `__FAIL_*__` sentinel in the brief topic), and `POST /api/test/scheduler-tick` (double-gated: 404 in `NODE_ENV==='production'`, 404 unless `MOCK_SOCIAL`, admin-only) so §K H12 can drive the scheduler over HTTP. **CI runs the app in `next dev` mode** because that seam is intentionally inert in a prod build.
  - The 4 intentional skips: TC-GEN-05 (needs a mock IMAGE-provider seam), TC-REG-H11a/b/c (real-Chromium / host-process observation).

### Specification & planning

- **[`docs/handoff.md`](docs/handoff.md)** — session handoff with current decisions, Path A/B design descriptions, AGUI spec, provider registration flow, v2 interoperability target, and the latest code-review remediation summary
- **[`.specclaw/changes/marketing-post-studio-v1/spec.md`](.specclaw/changes/marketing-post-studio-v1/spec.md)** — full functional requirements (FR-01 through FR-33) and non-functional requirements
- **[`.specclaw/changes/marketing-post-studio-v1/design.md`](.specclaw/changes/marketing-post-studio-v1/design.md)** — architecture, Prisma schema, API routes, provider abstraction layer, file tree
- **[`.specclaw/changes/marketing-post-studio-v1/tasks.md`](.specclaw/changes/marketing-post-studio-v1/tasks.md)** — 28 tasks across 6 waves with estimates and dependencies
- **[`.specclaw/changes/marketing-post-studio-v1/proposal.md`](.specclaw/changes/marketing-post-studio-v1/proposal.md)** — original proposal + post-proposal decisions log

### Per-wave execution plans

| Wave | File                                                                                                  | Scope                                                  |
| ---- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1    | [wave-1-scaffold.md](.specclaw/changes/marketing-post-studio-v1/wave-1-scaffold.md)                   | App scaffold, Docker Compose, Prisma, Clerk            |
| 2    | [wave-2-providers.md](.specclaw/changes/marketing-post-studio-v1/wave-2-providers.md)                 | AI provider abstraction layer                          |
| 3    | [wave-3-canva-minio.md](.specclaw/changes/marketing-post-studio-v1/wave-3-canva-minio.md)             | HTML renderer (Puppeteer) + Claude design agent, MinIO |
| 3b   | [wave-3b-brand-data-layer.md](.specclaw/changes/marketing-post-studio-v1/wave-3b-brand-data-layer.md) | Brand kit data layer                                   |
| 4    | [wave-4-generation.md](.specclaw/changes/marketing-post-studio-v1/wave-4-generation.md)               | Brief → generation pipeline (Path A + B)               |
| 5    | [wave-5-publishing.md](.specclaw/changes/marketing-post-studio-v1/wave-5-publishing.md)               | Publishing + scheduler                                 |
| 6    | [wave-6-admin-e2e.md](.specclaw/changes/marketing-post-studio-v1/wave-6-admin-e2e.md)                 | Admin settings, AGUI refinement, E2E tests             |

## Architecture decisions to remember

- All AI calls are **server-side only** — the browser never calls an AI API or Puppeteer directly
- **Brand kit precedence:** Explicit brief kit (`Brief.brandKitId`) → Campaign kit → Project default → system default (`BrandKit.isDefault = true`)
- **Post size:** chosen per brief (`Brief.aspectRatio`: `SQUARE`=1080×1080, `PORTRAIT`=1080×1350); a brand template declares the size it was designed for (`BrandKitTemplate.aspectRatio`). Dimensions resolve through `src/lib/aspectRatio.ts` — the only place pixel sizes are defined.
- **AI provider resolution order:** Brief's chosen key → `AvailableProvider.isDefault` → env var fallback
- **API keys** stored AES-256-GCM encrypted; only `keyPrefix` shown in UI after registration; full key never returned
- **MinIO** served to browser via pre-signed URLs only — MinIO port never publicly exposed
- **Claude design agent** runs as a tool-use agent loop — tools: `generateImage`, `renderHtml`, `getBrandKitContext`
- **AGUI refinement:** natural language → Claude updates HTML → Puppeteer re-renders → `DraftRevision(htmlSnapshot)`
- **Brand kit structured data** (colors, fonts, logoUrl) is stored in the DB and passed to Claude as CSS variable definitions
