# bistec-studio — Session Handoff

**Date:** 2026-06-23
**Repo:** https://github.com/bistec-oss/designer (local: `D:\Bistec\designer`)
**Branch:** `specclaw/marketing-post-studio-v1`
**Specclaw change:** `marketing-post-studio-v1`

---

## Current status

**Wave 2 — complete ✅**

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
| T08 — Provider registry | ✅ | `resolveCopyProvider` / `resolveImageProvider` — DB → default → env fallback |

**Post-Wave-2 addition (out of band):**
- `AnthropicCopyProvider` added (`src/providers/implementations/copy/anthropic.ts`) — uses `claude-haiku-4-5-20251001`
- Registry updated: `"anthropic"` case wired in; env fallback now tries `ANTHROPIC_API_KEY` before `OPENAI_API_KEY`
- `src/lib/crypto.ts` stub created (throws — to be implemented in Wave 6)

Admin user seeded: `admin@bisteccare.lk` · role = ADMIN · password `BistecStudio2026!` (change after first login).

Running containers: `bistec_studio_postgres` · `bistec_studio_minio`.

**Next:** Wave 3 (T09 — Puppeteer renderer + Claude design agent, T10 — MinIO client). No missing npm deps. Requires `ANTHROPIC_API_KEY` in `.env`. See Chromium note below.

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

**Current specclaw phase:** Wave 1 complete → Wave 2 ready to begin

---

## Task breakdown (30 tasks, 6 waves + Wave 3b)

| Wave | Focus | Tasks |
|---|---|---|
| 1 ✅ | Project scaffold + Docker Compose infra + design system | T01 Next.js init, T02 Docker Compose, T03 Prisma schema, T04 better-auth, T25 Design system foundation |
| 2 ✅ | Provider abstraction layer | T05 Interfaces, T06 OpenAI copy, T07 OpenAI image, T08 Registry |
| 3 | HTML renderer (Puppeteer) + Claude design agent, MinIO | T09 Puppeteer renderer + design agent, T10 MinIO client |
| 3b | Brand kits, Projects & Campaigns (data layer) | T26 BrandKit management (API + admin UI), T23 Project/Campaign API routes, T24 Projects/Campaigns UI |
| 4 | Core generation + design assembly | T11 Brief UI + model/campaign select, T12 Copy route + image tool handler, T13 Path A assembly, T14 Path B orchestrator, T15 Export route |
| 5 | Publishing, scheduling, library | T16 Social publishers, T17 Publish/schedule routes, T18 Scheduler worker, T19 Library UI (drill-down) |
| 6 | Admin settings + E2E | T20 Admin provider settings, T21 Draft refinement UI + AGUI backend, T22 E2E Playwright tests, T27 Schema migration, T28 MCP server, T29 ACP server |

**Highest-risk item:** Instagram Graph API Meta Business app review (can take weeks).
Start the Meta Business app registration **before** Wave 1 code begins — it blocks AC-3.

---

## Open questions (for build phase)

0. Which OpenAI model drives copy generation? (GPT-4o recommended)
1. **Social API access** (highest risk): who owns obtaining Meta Business app approval and LinkedIn app permissions, and what is the timeline?
2. **HTML template authoring** — who creates the initial HTML/CSS brand templates and what is the process?
3. **Font licensing** — are brand fonts self-hostable? What format (woff2)?
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
