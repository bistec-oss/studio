# bistec-studio — Session Handoff

**Date:** 2026-06-23 (updated after Wave 5)
**Repo:** https://github.com/bistec-oss/designer (local: `D:\Bistec\designer`)
**Branch:** `specclaw/marketing-post-studio-v1`
**Specclaw change:** `marketing-post-studio-v1`

---

## Current status

**Wave 5 — complete ✅**

| Task | Status | Notes |
|---|---|---|
| T01 — Next.js 14 init | ✅ | `package.json`, TypeScript strict, Tailwind, Husky |
| T02 — Docker Compose infra | ✅ | postgres + minio containers up; `docker run` workaround for WSL2 |
| T03 — Prisma schema + migration | ✅ | `20260622191018_better_auth_swap` applied; 18 tables created |
| T04 — better-auth + role middleware | ✅ | Login page, session cookie middleware, `requireRole`/`getCurrentUser` helpers |
| T25 — Design system foundation | ✅ | Frozen Light theme, AppShell, Button/GlassPanel/GlassInput/Select/StatusChip/SegmentedToggle |
| T05 — Provider interfaces | ✅ | `CopyProvider`, `ImageProvider`, `DesignOrchestrator` interfaces + `BriefInput` type |
| T06 — OpenAI copy provider | ✅ | `OpenAICopyProvider` — GPT-4o chat completions |
| T07 — OpenAI image provider | ✅ | `OpenAIImageProvider` — gpt-image-2, returns base64 data URL |
| T08 — Provider registry | ✅ | `resolveCopyProvider` / `resolveImageProvider` / `resolveDesignOrchestrator` |
| T10 — MinIO storage client | ✅ | `uploadObject` / `getPresignedUrl`; auto-creates buckets on cold start |
| T09 — Puppeteer renderer + design agent | ✅ | `renderHtmlToPng` (2× DPI); `runDesignAgent` tool-use loop; 15-call hard limit |
| T26 — BrandKit management (API + admin UI) | ✅ | 11 API routes; admin UI at `/admin/brandkits`; AI prompt assist |
| T23 — Project & Campaign API routes | ✅ | CRUD + soft delete; brand kit resolution endpoint |
| T24 — Projects & Campaigns UI | ✅ | List + detail pages; resolved brand kit badge with source label |
| T11 — Brief creation (DB + API + UI) | ✅ | 3-step wizard; `POST /api/briefs`; `GET /api/providers/available` |
| T12 — Copy + image generation routes | ✅ | `POST /api/generate/copy`; `POST /api/generate/image` (base64 → MinIO) |
| T13 — Path A assembly route | ✅ | `POST /api/generate/assemble-a`; Haiku fills template → Puppeteer PNG |
| T14 — Path B orchestrator | ✅ | `POST /api/generate/assemble-b`; `ClaudeHtmlOrchestrator`; registry wired |
| T15 — Export route | ✅ | `POST /api/generate/export`; re-render path for copy edits |
| T16 — Social publishers | ✅ | `src/lib/social/instagram.ts` + `linkedin.ts`; Graph API + UGC Posts API; `PublishError` typed |
| T17 — Publish + schedule API routes | ✅ | `POST/GET /api/posts`; GET/DELETE `/api/posts/[id]`; retry at `/api/posts/[id]/publish` |
| T18 — Scheduler worker | ✅ | `src/scheduler/worker.ts` + `src/lib/scheduler/jobRunner.ts`; 60s poll; sequential per tick |
| T19 — Asset library UI | ✅ | `GET /api/library`; `/library` page; `PostCard` + `PublishHistoryDrawer` components |

**Cold-start testing fixes — 2026-06-23 (post-Wave-6, on `main`):**
- `next.config.ts` → **`next.config.mjs`** — Next 14 does not support a TypeScript config file; `next dev` crashed on boot (`Configuring Next.js via 'next.config.ts' is not supported`).
- **`requireRole`** (`src/lib/auth.ts`) now compares the role **case-insensitively**. The Prisma `Role` enum and the admin seed store uppercase `ADMIN`/`EDITOR`, but the check compared against lowercase `"admin"`, so every `/api/admin/*` route returned **403** for the admin (the UI already used `.toLowerCase()`).
- **`docker-compose.override.yml`** (new) — publishes MinIO `:9000` to the host so a host-side `npm run dev` can reach it (the committed compose only `expose`s it internally; see `docs/cold-start.md` gotcha #2).
- **Dashboard page added** (`src/app/(app)/page.tsx`) — the `/` route was specced (`docs/prototype-pages.md §1`) but **never implemented**, so post-login `router.push("/")` and the "Dashboard" nav item both **404'd**. New server component: KPIs (Drafts Ready = `EXPORTED` / Posts Published / Active Campaigns / AI Providers), Recent Drafts table (rows → `/drafts/[id]`), Quick Actions (`/brief`, `/library`, `/admin/brandkits`), and a merged activity feed. Uses the **real** routes (`/brief`, `/drafts/[id]`), not the spec's stale `/brief/new` / `/draft/[id]`.

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

Admin user seeded: `admin@bisteccare.lk` · role = ADMIN · password `BistecStudio2026!` (change after first login).

Running containers: `bistec_studio_postgres` · `bistec_studio_minio`.

**Seeding:**
- `scripts/seed-admin.mjs` — creates the admin user via better-auth `auth.api.signUpEmail()` (writes the hashed-password `Account` row), then promotes role to ADMIN. **Must** go through better-auth — a directly-created `User` has no credential `Account` and cannot log in.
- `scripts/seed-brandkit.mjs` — seeds the default **"Bistec"** brand kit (Glacier palette, Inter + JetBrains Mono as Google Fonts, brand-voice prompt v1 active). Idempotent (skips if a non-deleted default kit exists); mirrors the admin API's single-default invariant; sets `BrandKitPrompt.createdBy` to the seeded admin's id. The brand-voice prompt is **provisional** (inferred from Bistec Global's public positioning) — replace once the official style guide is available.
- `scripts/seed-hearts-talk.mjs` — seeds the **"Hearts Talk"** brand kit (NOT default): navy/cyan/green palette, Orbitron + Poppins + Montserrat (Google Fonts), provisional voice prompt v1, a 1080×1080 HTML template, and LOGO artifacts. Reads assets from `scripts/seed-assets/` at runtime (`hearts-talk-1080x1080.html` required; `hearts-academy-logo.png` + `bistec-global-logo.png` optional). Logos are embedded as **`data:` URIs** (never expire, no MinIO needed). ⚠️ `hearts-academy-logo.png` is not yet present and `bistec-global-logo.png` is a best-guess copy — see `scripts/seed-assets/README.md`.
- Run all via `npm run db:seed` (admin → Bistec → Hearts Talk; admin first so `createdBy` resolves) or individually with `node --env-file=.env scripts/<file>.mjs`. Requires `.env` with `DATABASE_URL` + `BETTER_AUTH_SECRET` and a running Postgres container.

> **Known latent bug (not introduced by seeds):** the admin UI's logo/artifact upload routes (`/api/admin/brandkits/[id]/upload` + `/artifacts`) store **7-day presigned MinIO URLs** directly in `BrandKit.logoUrl` / `BrandKitArtifact.url`, so UI-uploaded logos break after ~7 days. Fix: regenerate presigned URLs on read, or store stable object keys. The Hearts Talk seed sidesteps this by embedding logos as `data:` URIs.

### Testing kickoff prompt

Paste this to start a testing session. It works **whether or not the brand kits already exist** — `npm run db:seed` is idempotent, so it creates them on a fresh DB and skips them if present (covers both the before- and after-seeding cases in one run).

```
Before testing, verify the working environment is ready — do not assume it is. Run the docs/cold-start.md §0 preflight: confirm .env exists, Postgres + MinIO containers are Up (MinIO port 9000 published to the host), and migrations are applied (npx prisma migrate status). Fix any gap using the matching section of docs/cold-start.md before continuing.

Then seed the database (idempotent — safe whether or not the brand kits already exist):
  npm run db:seed
This ensures the admin user, the default "Bistec" brand kit, and the "Hearts Talk" brand kit. Existing rows are skipped.

Then start the dev server and smoke-test:
  npm run dev
- Log in at http://localhost:3000 as admin@bisteccare.lk / BistecStudio2026!
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

| Concern | Choice | Rationale |
|---|---|---|
| Framework | Next.js 14 (App Router) + TypeScript | Requested |
| Hosting | VPS — Docker Compose | Removed all Azure dependencies |
| Auth | better-auth (self-hosted, email + password) | No SaaS dependency; sessions in PostgreSQL |
| Database | PostgreSQL (Docker container) + Prisma ORM | Type-safe, migration tooling, PG arrays |
| Object storage | MinIO (Docker container, S3-compatible) | Self-hosted, replaces Azure Blob Storage |
| Secrets | `.env` file on VPS (`chmod 600`, never in git) | Replaces Azure Key Vault |
| Scheduler | Dedicated Docker container (same image as app) | Polls DB every 60s, replaces Azure Container Apps Job |
| Copy AI | OpenAI GPT (user-selectable) | Provider abstraction allows future swap |
| Image AI | OpenAI gpt-image-2 (on-demand agent tool; admin-configured default) | Called by Claude when raster imagery is needed; CSS/SVG used otherwise |
| Design rendering | Puppeteer (headless Chromium) | HTML/CSS → PNG, 2× DPI, self-contained VPS |
| Design (Path A) | Claude agent harness fills HTML/CSS template | Brand template stored as HTML string in DB |
| Design (Path B) | Claude agent harness generates freeform HTML/CSS | Claude designs from scratch, calls generateImage tool |

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
- `Brief` — topic, **description** (AI prompt context — speaker bios, event details, key messages), goal, tone, channels[], designMode, **campaignId** (nullable = Uncategorized), copyProviderKey, **imageProviderKey** (optional — overrides system default image provider if Claude calls `generateImage`), **additionalImageUrl** (nullable — MinIO URL of user-uploaded image placed into template slot, Path A only), **briefImages** (Path B only — JSON array of `{ url: string, intent: "embed" | "reference" }` objects; MinIO URLs of user-supplied images; `"embed"` images are placed in the HTML layout, `"reference"` images are passed as compositional inspiration only), **referenceTemplateId** (nullable — FK → BrandKitTemplate; Path B only — the chosen template's HTML is passed to Claude as style inspiration, not filled)
- `Draft` — copyText, **imageUrl?** (MinIO URL from `generateImage` tool call — null if Claude used CSS/SVG), **htmlContent** (current HTML state), templateId, exportUrl (MinIO), status
- `Post` — channel (INSTAGRAM | LINKEDIN), status, scheduledAt, publishedAt, platformId, errorReason
- `BrandKit` — name, **colors Json?** (hex palette), **fonts Json?** ({name, url}[]), **logoUrl String?**, isDefault, isDeleted — first-class, admin-managed; referenced by Project.defaultBrandKitId and Campaign.brandKitId
- `BrandKitPrompt` — brandKitId, content, version, isActive (versioned brand voice for rollback — EC-13)
- `BrandKitArtifact` — brandKitId, type, name, url (MinIO), feedToAI (whether passed to AI as brand context)
- `BrandKitTemplate` — brandKitId, **htmlTemplate String** (HTML/CSS string), name
- `AvailableProvider` — slot (COPY | IMAGE), providerKey, providerName, label, keyPrefix (display only), encryptedApiKey, isEnabled, isDefault
- `DraftRevision` — draftId, revisionNumber, **htmlSnapshot String** (full HTML at this revision), **exportUrl String** (MinIO PNG URL), instruction (the user's chat message that produced this revision), createdAt

---

## Specclaw files (all committed)

| File | Location |
|---|---|
| `proposal.md` | `.specclaw/changes/marketing-post-studio-v1/` |
| `spec.md` | `.specclaw/changes/marketing-post-studio-v1/` |
| `design.md` | `.specclaw/changes/marketing-post-studio-v1/` |
| `tasks.md` | `.specclaw/changes/marketing-post-studio-v1/` |
| `wave-1-scaffold.md` | `.specclaw/changes/marketing-post-studio-v1/` |
| `wave-2-providers.md` | `.specclaw/changes/marketing-post-studio-v1/` |
| `wave-3-canva-minio.md` | `.specclaw/changes/marketing-post-studio-v1/` |
| `wave-3b-brand-data-layer.md` | `.specclaw/changes/marketing-post-studio-v1/` |
| `wave-4-generation.md` | `.specclaw/changes/marketing-post-studio-v1/` |
| `wave-5-publishing.md` | `.specclaw/changes/marketing-post-studio-v1/` |
| `wave-6-admin-e2e.md` | `.specclaw/changes/marketing-post-studio-v1/` |

`tasks.md` is the canonical task source. The wave files are detailed execution proposals derived from it — one per wave, each with full task specs, parallelism diagrams, and completion checklists.

**Specclaw status:** All 6 waves complete — v1 feature complete

---

## Task breakdown (30 tasks, 6 waves + Wave 3b)

| Wave | Focus | Tasks |
|---|---|---|
| 1 ✅ | Project scaffold + Docker Compose infra + design system | T01 Next.js init, T02 Docker Compose, T03 Prisma schema, T04 better-auth, T25 Design system foundation |
| 2 ✅ | Provider abstraction layer | T05 Interfaces, T06 OpenAI copy, T07 OpenAI image, T08 Registry |
| 3 ✅ | HTML renderer (Puppeteer) + Claude design agent, MinIO | T09 Puppeteer renderer + design agent, T10 MinIO client |
| 3b ✅ | Brand kits, Projects & Campaigns (data layer) | T26 BrandKit management (API + admin UI), T23 Project/Campaign API routes, T24 Projects/Campaigns UI |
| 4 ✅ | Core generation + design assembly | T11 Brief UI + model/campaign select, T12 Copy route + image tool handler, T13 Path A assembly, T14 Path B orchestrator, T15 Export route |
| 5 ✅ | Publishing, scheduling, library | T16 Social publishers, T17 Publish/schedule routes, T18 Scheduler worker, T19 Library UI (drill-down) |
| 6 ✅ | Admin settings + E2E | T20 Admin provider settings, T21 Draft refinement UI + AGUI backend, T22 E2E Playwright tests, T27 Schema migration, T28 MCP server, T29 ACP server |

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

## Prototype — bistec-studio-proto

A static Next.js 15 prototype lives at `bistec-studio-proto/` in this repo. It covers the full UI surface of the real app using mock data (no backend calls). Use it as the primary reference for page layouts, user flows, and interaction patterns before implementing each wave.

**Stack:** Next.js 15 + React 19 + Tailwind CSS 3.4 + TypeScript; `next export` static output; light glassmorphic theme.

**Pages implemented:**

| Route | Purpose |
|---|---|
| `/` | Dashboard — KPIs, recent drafts, quick actions, activity feed |
| `/brief/new` | 5-step Brief Wizard — platform/path, campaign, copy prompt, images, review |
| `/projects` | Projects list + inline create forms for projects and standalone campaigns |
| `/projects/[id]` | Project detail — stats, default brand kit/tone, campaigns list, inline campaign creation |
| `/campaigns/[id]` | Campaign detail — brand kit resolution card, posts table |
| `/library` | Library with drill-down nav (Project → Campaign → Uncategorized) + status/platform filters |
| `/draft/[id]` | Draft workspace — rendered preview, revision history, AGUI chat panel, export/publish |
| `/admin/brandkits` | Brand kits admin — kit list sidebar, detail panel with colors/fonts/templates/voice prompt |
| `/admin/settings` | AI providers admin — provider cards with key entry, model display, default toggle |

**Key behaviours prototyped:**
- Path A blocks Continue on Step 0 until a template is selected
- Campaign selection auto-populates brand kit + tone with source label ("Campaign override" / "Inherited from project" / "System default")
- Library drill-down filters the right panel without page navigation
- Draft AGUI panel with suggestion chips and freeform input

**Full page outline (functionality, data, actions — no design details):**
→ [`docs/prototype-pages.md`](docs/prototype-pages.md)

---

## Repo notes

- Remote is still named `bistec-oss/designer` on GitHub — user attempted rename to
  `bistec-studio` but lacked org admin rights. To complete the rename:
  go to https://github.com/bistec-oss/designer/settings, rename to `bistec-studio`, then:
  `git remote set-url origin https://github.com/bistec-oss/bistec-studio.git`
