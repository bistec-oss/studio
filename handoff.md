# bistec-studio — Session Handoff

**Date:** 2026-06-16
**Repo:** https://github.com/bistec-oss/designer (local: `D:\Bistec\designer`)
**Branch:** `main` — clean, all work pushed (latest commit `119875b`)
**Specclaw change:** `marketing-post-studio-v1`
**Prototype:** `bistec-studio-prototype/` (Next.js 15, static export, runs on `npm run dev`)

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
| Auth | Clerk (admin + editor roles) | Avoids blocking on Entra ID setup |
| Database | PostgreSQL (Docker container) + Prisma ORM | Type-safe, migration tooling, PG arrays |
| Object storage | MinIO (Docker container, S3-compatible) | Self-hosted, replaces Azure Blob Storage |
| Secrets | `.env` file on VPS (`chmod 600`, never in git) | Replaces Azure Key Vault |
| Scheduler | Dedicated Docker container (same image as app) | Polls DB every 60s, replaces Azure Container Apps Job |
| Copy AI | OpenAI GPT (user-selectable) | Provider abstraction allows future swap |
| Image AI | OpenAI gpt-image-2 (user-selectable) | Provider abstraction allows future swap |
| Design (Path A) | Canva MCP server (MCP client in Next.js backend) | No raw REST integration needed |
| Design (Path B) | OpenAI function calling + Canva MCP tools as functions | ChatGPT+Canva plugin pattern, own backend |

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
- A `BrandKit` is its own entity — owns a name, a **versioned brand voice prompt** (`BrandKitPrompt`, rollback per EC-13), a folder of **artifacts** (`BrandKitArtifact` in MinIO — logos/fonts/colors/reference images), an optional **Canva brand kit link**, and a list of **linked brand templates** (`BrandKitTemplate` rows — BTM* IDs). Source is `CANVA | BACKEND | HYBRID`.
- Artifacts flagged `feedToAI` are passed to Path B orchestration + image gen as brand context.
- **Template linking**: when creating or editing a brand kit, the admin selects a Canva brand kit → the UI calls `search-brand-templates` (via a backend proxy) filtered to that kit → results appear as a checkbox picker. No manual BTM* ID entry. Templates can be added or removed at any time by editing the brand kit.
- **Per-template background image prompt**: each linked template has an optional `imagePrompt` field. If set, it overrides the brief-derived prompt for gpt-image-2 background generation — giving admins control over fixed visual styles per template (e.g. "always dark abstract tech"). If blank, the system derives the prompt from the brief as normal.
- **AI-assisted brand voice prompt**: the prompt editor exposes two Claude-powered modes — **Generate** (empty state: admin describes brand in plain text → Claude drafts full prompt for review) and **Improve** (existing prompt: Claude refines it → presented for review before saving as next version). Both feed through the existing version history so rollback always applies.
- The brief wizard's Path A template picker shows only the templates linked to the resolved brand kit.
- Managed by **admins only** (governance); editors select kits via projects/campaigns.
- Projects/campaigns reference a BrandKit by FK. Precedence at generation time:
  **Campaign brand kit → Project default brand kit → system default brand kit** (`BrandKit.isDefault`).

**Key rules:**
- Projects and campaigns: created/edited/deleted by any role (admin or editor)
- Campaign → project reassignment: **admin-only**
- Soft-delete with recovery for both; scheduled posts under a deleted campaign still fire
- A draft can be linked to multiple campaigns (shared asset — same Canva design + MinIO export, not duplicated)
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

### Path A — Preset brand template
1. User writes a brief (topic, goal, tone, channels, design mode = "Use a template"), optionally assigns to a campaign/project
2. Brand kit and tone auto-populate from campaign/project defaults
3. User selects copy model + image model from admin-curated dropdowns
4. User may optionally upload an **Additional Image** (e.g. speaker photo, product shot, event graphic) — placed into a dedicated image slot in the template alongside the AI-generated background
5. GPT generates channel-appropriate caption/copy using the topic + description as prompt context
6. gpt-image-2 generates the post background image (the AI-generated layer)
7. Both the AI background and the user-uploaded additional image are uploaded to Canva via `upload-asset-from-url` → Canva asset IDs
8. `create-design-from-brand-template` instantiates a brand template (BTM* ID)
9. `get-design-content` fetches the element tree from the instantiated design
10. **Claude element resolver** (`src/lib/canva/elementResolver.ts`) receives the element tree + edit intent (topic text, copy text, background asset ID, person photo asset ID) and identifies the correct element ID for each slot by reading layer names — no hardcoded mappings needed
11. Editing transaction: `start` → `perform-editing-operations` (resolved ops from step 10) → `commit`
12. `export-design` → PNG/JPG → MinIO (`exported-designs` bucket)
13. Publish now or schedule to Instagram / LinkedIn

**Brief fields (Path A):** topic · description (AI prompt context — speaker bios, event details, key messages) · goal/CTA · tone · channels · template selection · additional image (optional upload)

**Element resolver:** `src/lib/canva/elementResolver.ts` — uses Claude (Anthropic SDK) to map edit intent roles ("background image", "person photo", "headline") to Canva element IDs by reading the design's layer tree. Throws `ElementNotFoundError` if a slot can't be confidently matched. No per-template element ID configuration required — template designers just use descriptive layer names in Canva.

### Path B — AI-generated new design
1. User writes a brief (design mode = "Generate new design") — same topic + description fields as Path A; user may optionally upload one or more **Reference Images** (speaker photo, product shot, etc.) which are stored in MinIO and passed to the orchestrator
2. Backend calls **OpenAI Chat Completions with function calling**, passing:
   - The brief
   - The resolved BrandKit's active system prompt + feed-to-AI artifacts (campaign → project → default)
   - The BrandKit's Canva brand kit ID
   - `referenceImageUrls[]` — any images the user uploaded at brief time (orchestrator decides their role: place directly, use as gpt-image-2 context, or ignore)
   - Canva MCP tool schemas as function definitions
3. OpenAI orchestrates the full design assembly by calling Canva MCP tools directly
4. OpenAI decides whether to generate imagery (gpt-image-2) or use an existing brand asset
5. Hard limit: 20 tool calls max (prevents runaway loops)
6. On any error: `cancel-editing-transaction` is always called (no orphaned Canva sessions)
7. Same export → publish flow as Path A

---

## AI Provider Abstraction Layer (key architecture decision)

The frontend never knows which AI model runs. Three stable interfaces in `src/providers/`:

```
CopyProvider      { generateCopy(brief): Promise<string> }
ImageProvider     { generateImage(brief): Promise<{ url: string }> }
DesignOrchestrator{ orchestrate(brief, brandKitId): Promise<{ canvaDesignId: string }> }
```

**Provider resolution order (copy + image):**
1. `providerKey` stored on the Brief record (user's choice at brief time)
2. `AvailableProvider` DB row with `isDefault=true` for that slot
3. Env var fallback (`COPY_PROVIDER` / `IMAGE_PROVIDER`)

The Path B orchestrator is NOT user-selectable — env-configured only.

---

## Canva MCP integration

The Next.js backend connects to Canva as an **MCP client**. No raw Canva REST integration.

**MCP tools used:**
- `list-brand-kits` — discover brand kit IDs
- `create-design-from-brand-template` — instantiate a design from a BTM* template ID
- `upload-asset-from-url` — bridge gpt-image-2 image URL → Canva asset ID
- `start-editing-transaction` / `perform-editing-operations` / `commit-editing-transaction` / `cancel-editing-transaction`
- `get-design-content` — fetch the full element tree; passed to the Claude element resolver to identify target element IDs dynamically
- `get-assets` — retrieve existing brand assets (Path B orchestrator)
- `export-design` — export PNG/JPG, returns download URL

**Claude element resolver** (`src/lib/canva/elementResolver.ts`): after `get-design-content` returns the element tree, this module calls Claude with the tree + edit intent to identify which element corresponds to each role (headline, background image, person photo, etc.). No element IDs are hardcoded per template — just descriptive layer names in Canva.

**NFR-11 (transaction integrity):** `withEditingTransaction` wrapper in `src/lib/canva/client.ts` always calls `cancel` in the `finally` block if `commit` was never reached.

---

## Database schema (Prisma) — key models

> Visual ERD: [`docs/erd.svg`](docs/erd.svg)


- `User` — clerkId, role (ADMIN | EDITOR)
- `Project` — name, defaultBrandKitId, defaultTone, isDeleted, deletedAt
- `Campaign` — name, brandKitId (override), defaultTone, isDeleted, deletedAt
- `ProjectCampaign` — M2M join (project ↔ campaign)
- `CampaignDraft` — M2M join (campaign ↔ draft, shared asset linking)
- `Brief` — topic, **description** (AI prompt context — speaker bios, event details, key messages), goal, tone, channels[], designMode, **campaignId** (nullable = Uncategorized), copyProviderKey, imageProviderKey, **additionalImageUrl** (nullable — MinIO URL of user-uploaded image placed into template slot, Path A only), **referenceImageUrls** (MinIO URLs of user-supplied images passed to the GPT orchestrator, Path B only)
- `Draft` — copyText, imageUrl (MinIO), canvaDesignId, templateId, exportUrl (MinIO), status
- `Post` — channel (INSTAGRAM | LINKEDIN), status, scheduledAt, publishedAt, platformId, errorReason
- `BrandKit` — name, source (CANVA | BACKEND | HYBRID), canvaBrandKitId, artifactFolder, isDefault, isDeleted — first-class, admin-managed; referenced by Project.defaultBrandKitId and Campaign.brandKitId
- `BrandKitPrompt` — brandKitId, content, version, isActive (versioned brand voice for rollback — EC-13)
- `BrandKitArtifact` — brandKitId, type, name, url (MinIO), feedToAI (whether passed to AI as brand context)
- `BrandKitTemplate` — brandKitId, canvaTemplateId (BTM*), name, imagePrompt? (optional fixed background image prompt for gpt-image-2; overrides brief-derived prompt when set)
- `AvailableProvider` — slot (COPY | IMAGE), providerKey, label, isEnabled, isDefault

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

**Current specclaw phase:** plan complete → ready for `/specclaw:build marketing-post-studio-v1`

---

## Task breakdown (26 tasks, 6 waves + Wave 3b)

| Wave | Focus | Tasks |
|---|---|---|
| 1 | Project scaffold + Docker Compose infra + design system | T01 Next.js init, T02 Docker Compose, T03 Prisma schema, T04 Clerk auth, T25 Design system foundation |
| 2 | Provider abstraction layer | T05 Interfaces, T06 OpenAI copy, T07 OpenAI image, T08 Registry |
| 3 | Canva MCP client + MinIO storage | T09 Canva client (tx guard), T10 MinIO client |
| 3b | Brand kits, Projects & Campaigns (data layer) | T26 BrandKit management (API + admin UI), T23 Project/Campaign API routes, T24 Projects/Campaigns UI |
| 4 | Core generation + design assembly | T11 Brief UI + model/campaign select, T12 Copy/image routes, T13 Path A assembly, T14 Path B orchestrator, T15 Export route |
| 5 | Publishing, scheduling, library | T16 Social publishers, T17 Publish/schedule routes, T18 Scheduler worker, T19 Library UI (drill-down) |
| 6 | Admin settings + E2E | T20 Admin provider settings, T21 Draft refinement UI, T22 E2E Playwright tests |

**Highest-risk item:** Instagram Graph API Meta Business app review (can take weeks).
Start the Meta Business app registration **before** Wave 1 code begins — it blocks AC-3.

---

## Canva account — confirmed IDs

| Brand kit | ID |
|---|---|
| Bistec Global | `kAFQ4SwAtdg` |
| BISTEC Other | `kAFBgUHql3M` |
| BISTEC CARE | `kAFyjCKH2m8` |
| BISTEC Bookkeeping | `kAG29B4a1Js` |
| CEA Accounting. | `kADduS4v2qM` |
| EasyIOT | `kAFeE5ZgPyg` |
| Project GRIT | `kAFsfQCE5qw` |
| RIFHealth | `kAFz8J5Cp1c` |
| Just Culture Consulting | `kAGAlhswhis` |
| Island Medical Clinic | `kAGCplmPwcQ` |
| Luminii Consulting | `kAGU1pWadkM` |
| Pick a Pro | `kAG0jBoQc2w` |
| BTG Rebranding 2026 | `kAHIBTHaPcg` |
| Deen's Profile | `kAF9fhc0mBA` |

**v1 default brand kit for bistec-studio:** `BTG Rebranding 2026` (`kAHIBTHaPcg`) — use this as `BrandKit.isDefault = true` in the seed.

---

## Path B — end-to-end validation (2026-06-16)

Path B was tested live against the real Canva MCP. The full orchestration flow works:

1. `list-brand-kits` → resolved Bistec Global (`kAFQ4SwAtdg`)
2. `generate-design` (type: `instagram_post`, brand_kit_id: `kAFQ4SwAtdg`) → Canva returned 4 on-brand design candidates
3. `create-design-from-candidate` → saved selected candidate as editable Canva design (`DAHMucs6Lbg`)
4. `export-design` (PNG, pro quality) → download URL returned successfully

**Key finding:** `generate-design` with a `brand_kit_id` is sufficient for Path B — Canva applies brand colours, fonts, and logo placement automatically. The orchestrator does not need to call `upload-asset-from-url` or editing transactions for a pure AI-generated design with no user-supplied reference images. Those steps remain relevant when reference images are provided.

**Tool call count for this run:** 4 (well within the 20-call hard limit).

---

## Open questions (for build phase)

0. Which OpenAI model drives Path B orchestration? (GPT-4o recommended for function calling)
1. **Social API access** (highest risk): who owns obtaining Meta Business app approval and LinkedIn app permissions, and what is the timeline?
2. **Canva MCP production setup**: (a) how is the Canva MCP server hosted for the production VPS environment? (b) MCP client credentials for the Next.js backend? (c) which BTM* template IDs are linked to the Bistec Global brand kit for Path A? (d) how many brand templates does v1 support?
3. Cost/rate controls: per-user or per-period generation limits for OpenAI calls
4. Which additional AI models (beyond OpenAI) should be registered at launch for user-selectable copy/image generation?

---

## AGUI — Chat-driven design refinement

After a design is returned (Path A or Path B), the draft page exposes a **chat-driven refinement panel**. The user types natural language instructions; the AI interprets them and applies targeted changes via Canva MCP editing transactions. The user never directly manipulates design elements.

**How it works:**
1. User types an instruction (e.g. "reposition the topic to the bottom", "change the background to something darker")
2. Backend calls the active AI provider with: the instruction + current design element tree (`get-design-content`) + brand kit context
3. AI produces the appropriate Canva MCP operations (`perform-editing-operations`)
4. `start-editing-transaction` → operations → `commit-editing-transaction` applied
5. Updated design is reflected live in the UI (design preview refreshes)

**AI provider:** same provider the user selected for that brief — Path A uses the user's selected copy/image model; Path B uses the orchestrator model. Driven by the user's BYOK key where configured.

**Undo:** each instruction that results in a committed edit is recorded as a revision in the draft's edit history. The user can revert to any prior revision, which re-applies the previous design state via a fresh editing transaction.

**Brand kit enforcement:**
- Before committing any edit, the AI checks whether the instruction conflicts with the resolved brand kit (colours, fonts, logo placement)
- If a conflict is detected, the AI responds in the chat explaining the conflict before applying — e.g. *"This would use a colour outside your brand kit. Type 'override' to apply anyway."*
- If the user replies "override", the edit is applied as-is with no further gating

**What the refinement panel does NOT do:**
- No direct element dragging, resizing, or canvas manipulation
- Does not open the design in Canva editor
- Does not allow the user to upload new assets mid-refinement (assets must be supplied at brief time)

**New DB model:** `DraftRevision` — draftId, revisionNumber, canvaDesignSnapshot (element tree or export URL), instruction (the user's chat message that produced this revision), createdAt. Supports the undo stack.

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

- **Image generation:** always use the latest available model. Currently `gpt-image-2`. When a new model is released, update the provider implementation — no other code changes required.
- **Any new AI provider added** (image or copy) should default to its latest available generation model, not a pinned older version.
- The `ImageProvider` / `CopyProvider` abstraction means swapping models is a single-file change in `src/providers/implementations/`.

## bistec-studio as an interoperable AI system (v2)

In v2, bistec-studio becomes a fully interoperable node in the broader AI ecosystem by exposing two protocol layers on top of its existing internals. No redesign is required — both are additive adapters over the same underlying tool logic.

```
External agents  →  bistec-studio  (ACP server)
AI models        →  bistec-studio  (MCP server)
bistec-studio    →  Canva          (MCP client)   ← already built in v1
```

### MCP server (Model Context Protocol — Anthropic)

Exposes bistec-studio's capabilities as callable tools for any MCP-compatible AI model (Claude, GPT, etc.). Natural tools to expose:

```
generate-post(brief)           → { exportUrl, canvaDesignId }
list-brand-kits()              → { kits }
get-draft(id)                  → { copy, imageUrl, status }
publish-post(draftId, channel) → { platformId }
```

This allows Claude or GPT to trigger bistec-studio as part of a larger agentic workflow — e.g. a model that generates a post for each speaker in an event lineup without a human touching the brief UI.

### ACP server (Agent Communication Protocol — BeeAI/IBM)

Exposes bistec-studio as a peer agent in multi-agent systems. Where MCP makes bistec-studio callable by a model, ACP makes it callable by another agent — enabling orchestration pipelines where bistec-studio is one step among many (e.g. an event management agent that auto-generates and publishes speaker posts as registrations are confirmed).

Both layers share the same underlying tool implementations. Adding ACP alongside MCP costs minimal extra work once the MCP layer exists.

---

## What was explicitly ruled OUT of v1

- Video generation/publishing
- Custom pixel/canvas/layout editor
- Edit-in-Canva (deep link to Canva editor)
- Channels beyond Instagram + LinkedIn
- Full content calendar UI
- External/client self-serve access
- Healthcare compliance constraints

---

## Prototype (`bistec-studio-prototype/`)

A fully interactive Next.js 15 static-export prototype lives at `bistec-studio-prototype/` in this repo. It covers all 7 screens with mock data and simulated AI calls — use it to validate UX flows before building the real system.

| Screen | Route |
|---|---|
| Dashboard | `/` |
| New Post (brief wizard) | `/brief` |
| Draft refinement | `/draft/[id]` |
| Library | `/library` |
| Projects | `/projects` |
| Campaigns | `/campaigns` |
| Settings (brand kits + AI providers) | `/settings` |

**Run from a fresh clone:**
```bash
cd bistec-studio-prototype
npm install        # generates node_modules/ — not in git, must be run once
npm run dev        # starts dev server; generates .next/ build cache automatically
```

> `node_modules/` and `.next/` are excluded from git (large generated artefacts). They are always recreated locally — `npm install` restores packages from `package.json`, and Next.js rebuilds `.next/` on first `dev` or `build` run. Never commit either folder.

**Key prototype decisions reflected:**
- Brief has: topic · description (AI context) · goal · tone · channels · design mode · additional image upload (Path A only) · copy model · image model
- Path A vs Path B selection is preserved through to the draft page via `?designMode=` query param
- Additional Image upload slot is generic — not speaker-specific; any image the user wants placed into a template slot

---

## Repo notes

- Remote is still named `bistec-oss/designer` on GitHub — user attempted rename to
  `bistec-studio` but lacked org admin rights. To complete the rename:
  go to https://github.com/bistec-oss/designer/settings, rename to `bistec-studio`, then:
  `git remote set-url origin https://github.com/bistec-oss/bistec-studio.git`

