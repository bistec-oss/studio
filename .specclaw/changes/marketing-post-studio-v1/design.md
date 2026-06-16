# Design: Marketing Post Studio (v1)

**Change:** marketing-post-studio-v1
**Created:** 2026-06-12

## Technical Approach

A Next.js 14 (App Router) + TypeScript monolith deployed to a VPS via Docker Compose.
Server-side logic runs in Next.js API routes (Route Handlers). The Canva MCP server
is consumed via a server-side MCP client. All AI provider calls are server-side only.

The central architectural principle is the **AI Provider Abstraction Layer**: the
frontend calls stable internal API routes and never references any specific AI model
or third-party service. Adding or swapping an AI model over time = adding a new
provider implementation in `src/providers/` and updating an environment variable or
admin config. No frontend changes, no API contract changes.

## Architecture

### Layer diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Next.js App Router — React, no AI calls)          │
└───────────────────────┬─────────────────────────────────────┘
                        │  stable internal API routes
┌───────────────────────▼─────────────────────────────────────┐
│  Next.js API Route Handlers  (src/app/api/**)               │
│  - /api/generate/copy         - /api/design/export          │
│  - /api/generate/image        - /api/publish                │
│  - /api/design/assemble       - /api/schedule               │
└───────────────────────┬─────────────────────────────────────┘
                        │  resolved by provider registry
┌───────────────────────▼─────────────────────────────────────┐
│  AI Provider Abstraction Layer  (src/providers/)            │
│                                                              │
│  interfaces/                                                 │
│    CopyProvider     { generateCopy(brief): Copy }           │
│    ImageProvider    { generateImage(brief): ImageResult }   │
│    DesignOrchestrator { orchestrate(brief, kit): DesignId } │
│                                                              │
│  implementations/                                            │
│    copy/openai.ts          ← GPT-4o mini (Path A default)   │
│    image/openai.ts         ← gpt-image-2                    │
│    orchestrator/openai-canva.ts  ← GPT-4o + Canva MCP       │
│    [future: copy/anthropic.ts, image/stability.ts, ...]     │
│                                                              │
│  registry.ts   ← resolves active provider from config       │
└──────────┬────────────────┬────────────────────────────────┘
           │                │
┌──────────▼──────┐  ┌──────▼──────────────────────────────┐
│  OpenAI API     │  │  Canva MCP Client (src/lib/canva/)  │
│  (copy, image,  │  │  Wraps MCP tool calls:              │
│   orchestrator) │  │  list-brand-kits                    │
└─────────────────┘  │  create-design-from-brand-template  │
                     │  upload-asset-from-url              │
                     │  start/perform/commit-editing-tx    │
                     │  get-design-content                 │
                     │  get-assets                         │
                     │  export-design                      │
                     └──────────────────┬──────────────────┘
                                        │
                              ┌─────────▼────────┐
                              │  Canva MCP Server │
                              └──────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Publishing Layer  (src/lib/social/)                        │
│  - instagram.ts   (Instagram Graph API)                     │
│  - linkedin.ts    (LinkedIn API)                            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Scheduler  (Docker container — cron worker, every minute)  │
│  Polls DB for due scheduled posts → calls publish layer     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Persistence                                                │
│  PostgreSQL (Docker container, Prisma ORM)                  │
│  MinIO      (Docker container, S3-compatible object store)  │
│  Secrets    (.env file on VPS, chmod 600, never in git)     │
└─────────────────────────────────────────────────────────────┘
```

### AI Provider Abstraction — extensibility detail

**Copy and image providers are user-selectable at brief time** from an
admin-curated list. The Path B orchestrator remains env-configured (infrastructure
choice, not user-facing).

Provider resolution order for copy + image slots:
1. **Brief's chosen provider** — stored on the Brief record, passed to the route handler
2. **System default** — the `AvailableProvider` row marked `isDefault=true` for that slot
3. **Env var fallback** — `COPY_PROVIDER` / `IMAGE_PROVIDER` (used only if DB has no config)

Adding a new model (e.g. Gemini for image generation):
1. Create `src/providers/implementations/image/gemini.ts` implementing `ImageProvider`
2. Register it in `src/providers/registry.ts` under the key `"gemini"`
3. Admin enables it in the settings UI → it appears in the brief UI for all users immediately

The frontend, API route contracts, and database schema for business data are untouched.
Only `AvailableProvider` rows change when models are added/removed.

### Design paths (Path A vs Path B)

**Path A — Preset template:**
```
POST /api/generate/copy   → CopyProvider.generateCopy(brief)
POST /api/generate/image  → ImageProvider.generateImage(brief, imagePrompt?)
  // imagePrompt resolution: BrandKitTemplate.imagePrompt ?? derive from brief topic + description
POST /api/design/assemble?mode=template
  → CanvaMcpClient.uploadAsset(bgImageUrl)          // AI-generated background
  → CanvaMcpClient.uploadAsset(additionalImageUrl)  // user-uploaded photo (optional)
  → CanvaMcpClient.createFromTemplate(templateId)
  → CanvaMcpClient.getDesignContent(designId)       // fetch element tree
  → ElementResolver.resolve(elementTree, intent)    // Claude identifies element IDs
      // intent: { topic, copyText, bgAssetId, personAssetId? }
      // returns: [{ type: replace_text, elementId, value }, { type: update_fill, elementId, assetId }, ...]
  → CanvaMcpClient.withEditingTransaction([...resolvedOps]) → commit()
POST /api/design/export   → CanvaMcpClient.exportDesign(designId) → MinIO
```

**Path B — AI-generated new design:**
```
POST /api/design/assemble?mode=generate
  → resolve BrandKit (campaign → project → system default)
  → DesignOrchestrator.orchestrate(brief, brandKit)
    // orchestrator receives:
    //   - brief (topic, description, goal, tone, channels)
    //   - brandKit.activePrompt (brand voice system prompt)
    //   - brandKit.feedToAI artifacts (logos, reference images, etc.)
    //   - brandKit.canvaBrandKitId
    //   - brief.referenceImageUrls[] (user-uploaded images from MinIO — optional)
    //     → orchestrator decides: place directly, use as gpt-image-2 context, or ignore
    OpenAI Chat Completions (function calling, Canva MCP tools as functions)
    orchestrator loop (max 20 tool calls — EC-12 hard limit):
      may call: upload-asset-from-url, get-assets,
                get-design-content (element tree → orchestrator resolves IDs itself),
                start-editing-transaction, perform-editing-operations,
                commit-editing-transaction (or cancel on error)
POST /api/design/export   → CanvaMcpClient.exportDesign(designId) → MinIO
```

### Frontend design system

The UI follows the **Frozen Light** design system, fully documented in
`docs/ui-reference/DESIGN_SYSTEM.md` (with a working HTML reference and
dark/light screenshots in `docs/ui-reference/`). Glassmorphic aesthetic,
ice-blue accents, Inter + JetBrains Mono.

- **Dark + light themes are mandatory.** Tailwind `darkMode: "class"`; the
  `ThemeProvider` follows OS `prefers-color-scheme` on first visit and persists
  the user's manual toggle to `localStorage`. An inline pre-paint script sets
  the class before first paint to avoid FOUC.
- **Self-hosted fonts/icons** — no external CDN at runtime (consistent with the
  self-contained VPS posture). Inter + JetBrains Mono via `next/font`; icons via
  a local Material Symbols subset or `lucide-react`.
- The design is a **starting point** — tokens and glass aesthetic are the default,
  with room to deviate where a screen needs it (denser library grids, data tables).
- T25 scaffolds the theme config + base components before any screen task; all
  UI tasks depend on it.

### Auth

**Clerk** for authentication (managed provider — fastest path, supports social + email,
avoids building JWT/session from scratch). Two roles stored as Clerk metadata: `admin`
and `editor`. Middleware enforces auth on all routes. Publish/schedule actions check
role server-side in the route handler.

Rationale for Clerk over Entra ID: Entra requires Microsoft 365 tenant setup and
app registration which adds external dependencies before the app is running. Clerk
is self-contained, free tier covers the team size, and can be replaced later by
implementing a new auth adapter if Entra becomes a requirement.

### Database (Prisma + PostgreSQL)

**PostgreSQL running as a Docker container** on the VPS (data persisted via a named Docker volume).
ORM: **Prisma** (type-safe, migrations built-in, works with Next.js edge runtime).

**Entity relationship diagram:** [`docs/erd.svg`](../../../docs/erd.svg) — visual
overview of all entities, the two M:N join tables (ProjectCampaign,
CampaignDraft), and the content pipeline Project → Campaign → Brief → Draft → Post.

![bistec-studio ERD](../../../docs/erd.svg)

Schema:

```prisma
model User {
  id        String    @id @default(cuid())
  clerkId   String    @unique
  role      Role      @default(EDITOR)
  briefs    Brief[]
  posts     Post[]
  createdAt DateTime  @default(now())
}

enum Role { ADMIN EDITOR }

model Project {
  id                String            @id @default(cuid())
  name              String
  defaultBrandKitId String?           // FK → BrandKit (optional)
  defaultBrandKit   BrandKit?         @relation("ProjectBrandKit", fields: [defaultBrandKitId], references: [id])
  defaultTone       String?
  isDeleted         Boolean           @default(false)
  deletedAt         DateTime?
  createdAt         DateTime          @default(now())
  campaigns         ProjectCampaign[]
}

model Campaign {
  id           String            @id @default(cuid())
  name         String
  brandKitId   String?           // FK → BrandKit, overrides project default if set
  brandKit     BrandKit?         @relation("CampaignBrandKit", fields: [brandKitId], references: [id])
  defaultTone  String?           // overrides project default if set
  isDeleted    Boolean           @default(false)
  deletedAt    DateTime?
  createdAt    DateTime          @default(now())
  projects     ProjectCampaign[]
  briefs       Brief[]
  drafts       CampaignDraft[]
}

// M2M: Campaign ↔ Project
model ProjectCampaign {
  projectId  String
  campaignId String
  project    Project  @relation(fields: [projectId], references: [id])
  campaign   Campaign @relation(fields: [campaignId], references: [id])

  @@id([projectId, campaignId])
}

// M2M: Campaign ↔ Draft (shared asset — same export linked to many campaigns)
model CampaignDraft {
  campaignId String
  draftId    String
  campaign   Campaign @relation(fields: [campaignId], references: [id])
  draft      Draft    @relation(fields: [draftId], references: [id])

  @@id([campaignId, draftId])
}

model Brief {
  id               String     @id @default(cuid())
  userId           String
  user             User       @relation(fields: [userId], references: [id])
  campaignId       String?    // null = Uncategorized
  campaign         Campaign?  @relation(fields: [campaignId], references: [id])
  topic            String
  goal             String
  tone             String
  channels         String[]   // ["instagram", "linkedin"]
  designMode            DesignMode
  copyProviderKey       String     // e.g. "openai" — user's choice at brief time
  imageProviderKey      String     // e.g. "gemini" — user's choice at brief time
  additionalImageUrl    String?    // Path A only — MinIO URL of user-uploaded image placed into a specific template slot
  referenceImageUrls    String[]   // Path B only — MinIO URLs of user-supplied images passed to the GPT orchestrator
  createdAt             DateTime   @default(now())
  drafts                Draft[]
}

enum DesignMode { TEMPLATE GENERATE }

model Draft {
  id            String          @id @default(cuid())
  briefId       String
  brief         Brief           @relation(fields: [briefId], references: [id])
  copyText      String
  imageUrl      String          // MinIO URL
  canvaDesignId String?
  templateId    String?
  exportUrl     String?         // MinIO URL of exported PNG/JPG
  status        DraftStatus     @default(IN_PROGRESS)
  createdAt     DateTime        @default(now())
  posts         Post[]
  campaigns     CampaignDraft[] // shared asset links
}

enum DraftStatus { IN_PROGRESS EXPORTED PUBLISHED FAILED }

model Post {
  id          String     @id @default(cuid())
  draftId     String
  draft       Draft      @relation(fields: [draftId], references: [id])
  userId      String
  user        User       @relation(fields: [userId], references: [id])
  channel     Channel
  status      PostStatus @default(PENDING)
  scheduledAt DateTime?
  publishedAt DateTime?
  platformId  String?    // ID/URL from the social platform
  errorReason String?
  createdAt   DateTime   @default(now())
}

enum Channel { INSTAGRAM LINKEDIN }
enum PostStatus { PENDING SCHEDULED PUBLISHED FAILED CANCELLED }

// A BrandKit is a first-class entity (admin-managed). It owns the brand voice
// (versioned system prompt), brand assets (artifact folder in MinIO), an optional
// link to a Canva brand kit, and a list of linked Canva brand templates (BTM* IDs).
// Projects and Campaigns reference a BrandKit.
model BrandKit {
  id              String                @id @default(cuid())
  name            String
  source          BrandKitSource        @default(HYBRID) // CANVA | BACKEND | HYBRID
  canvaBrandKitId String?               // link to a Canva brand kit (Path A templates, Path B kit)
  artifactFolder  String?               // MinIO prefix holding this kit's artifacts
  isDefault       Boolean               @default(false)  // system global default (one per system)
  isDeleted       Boolean               @default(false)
  deletedAt       DateTime?
  createdAt       DateTime              @default(now())
  prompts         BrandKitPrompt[]
  artifacts       BrandKitArtifact[]
  templates       BrandKitTemplate[]    // linked Canva brand templates (BTM* IDs)
  projects        Project[]             @relation("ProjectBrandKit")
  campaigns       Campaign[]            @relation("CampaignBrandKit")
}

// Canva brand template registered against a BrandKit by an admin.
// Discovered via search-brand-templates (filtered by canvaBrandKitId) — no manual entry.
// Users pick from these in the brief wizard (Path A only).
model BrandKitTemplate {
  id              String   @id @default(cuid())
  brandKitId      String
  brandKit        BrandKit @relation(fields: [brandKitId], references: [id])
  canvaTemplateId String   // BTM* ID from Canva
  name            String   // display name shown in brief picker
  imagePrompt     String?  // optional fixed prompt for gpt-image-2 background generation
                           // if set: used verbatim, overrides brief-derived prompt
                           // if null: system derives prompt from brief topic + description
  createdAt       DateTime @default(now())
}

enum BrandKitSource { CANVA BACKEND HYBRID }

// Versioned brand voice / system prompt — prepended to Path B orchestration.
// History retained so an admin can roll back to a prior version (EC-13).
model BrandKitPrompt {
  id         String   @id @default(cuid())
  brandKitId String
  brandKit   BrandKit @relation(fields: [brandKitId], references: [id])
  content    String
  version    Int      @default(1)
  isActive   Boolean  @default(false)
  createdBy  String   // userId
  createdAt  DateTime @default(now())

  @@unique([brandKitId, version])
}

// Brand assets stored in MinIO. Artifacts with feedToAI=true are passed to the
// AI (Path B orchestration / image generation) as brand context.
model BrandKitArtifact {
  id         String       @id @default(cuid())
  brandKitId String
  brandKit   BrandKit     @relation(fields: [brandKitId], references: [id])
  type       ArtifactType // LOGO | FONT | COLOR | REFERENCE_IMAGE | EXAMPLE_POST | OTHER
  name       String
  url        String       // MinIO object URL
  feedToAI   Boolean      @default(false)
  createdAt  DateTime     @default(now())
}

enum ArtifactType { LOGO FONT COLOR REFERENCE_IMAGE EXAMPLE_POST OTHER }

// Admin-curated list of models available to users per slot.
// Admins register providers from the UI — key auto-identified by prefix where possible.
model AvailableProvider {
  id               String       @id @default(cuid())
  slot             ProviderSlot // COPY | IMAGE
  providerKey      String       // e.g. "openai", "gemini", "anthropic"
  providerName     String       // e.g. "Anthropic", "OpenAI" — auto-detected or admin-specified
  label            String       // display name in brief UI, e.g. "Claude 3.5 Sonnet"
  keyPrefix        String       // first 8 chars of key for UI display, e.g. "sk-ant-a"
  encryptedApiKey  String       // AES-256-GCM encrypted API key
  isEnabled        Boolean      @default(true)
  isDefault        Boolean      @default(false) // system default for this slot
  createdAt        DateTime     @default(now())

  @@unique([slot, providerKey])
  @@unique([slot, isDefault]) // only one default per slot (enforced in app logic)
}

enum ProviderSlot { COPY IMAGE }

// Records each committed AGUI refinement instruction for undo support.
model DraftRevision {
  id                    String   @id @default(cuid())
  draftId               String
  draft                 Draft    @relation(fields: [draftId], references: [id])
  revisionNumber        Int      // monotonically increasing per draft
  instruction           String   // the user's natural language instruction that produced this revision
  elementTreeSnapshot   String   // JSON snapshot of the element tree after this edit (for undo re-apply)
  createdAt             DateTime @default(now())

  @@unique([draftId, revisionNumber])
}
```

### Asset storage

**MinIO** (S3-compatible object storage, Docker container on VPS) — two buckets:
- `generated-images` — raw gpt-image-2 output (temp, 7-day lifecycle rule)
- `exported-designs` — final exported PNG/JPG assets (permanent, linked in Draft.exportUrl)

Images are uploaded server-side via the AWS S3 SDK (MinIO is S3-compatible); only
object URLs are stored in the DB. No binary blobs in the database.

MinIO is accessed via its internal Docker network hostname (`minio:9000`) from the
app container. A separate MinIO Console port (9001) is exposed for admin use only,
bound to `127.0.0.1` on the VPS (not publicly accessible).

Pre-signed URLs are used for serving assets to the browser — the MinIO port is
never directly exposed to the public internet.

### Scheduler

**Dedicated Docker container** (defined in `docker-compose.yml` as the `scheduler`
service, runs `src/scheduler/worker.ts` on a 60-second polling loop) — a standalone
Node.js script that:
1. Queries DB for `Post WHERE status=SCHEDULED AND scheduledAt <= now()`
2. For each, calls the publish layer
3. Updates status to PUBLISHED or FAILED with reason
4. Idempotency: marks post as IN_FLIGHT before publish, clears on completion/failure
   to prevent duplicate publish on overlapping runs (EC-7)

Scheduling window: ±2 minutes of target time (job runs every minute, max one missed
cycle before catch-up).

### Canva MCP Client

`src/lib/canva/client.ts` — a typed wrapper around the MCP tool calls. Enforces
the NFR-11 transaction integrity rule: every `startEditingTransaction()` call is
wrapped in a `try/finally` that calls `cancelTransaction()` if `commitTransaction()`
was never reached. Callers cannot leave orphaned transactions.

```typescript
// Enforced pattern — callers use this, never raw MCP calls
async withEditingTransaction<T>(
  designId: string,
  fn: (tx: EditingTransaction) => Promise<T>
): Promise<T>
```

`src/lib/canva/elementResolver.ts` — Claude-powered element targeting. Called
after `getDesignContent` returns the element tree; uses the Anthropic SDK to ask
Claude which elements match each role in the edit intent (topic text box, background
image slot, person photo slot, etc.). Returns fully-formed `perform-editing-operations`
payloads. No element IDs are hardcoded or pre-mapped per template — Claude reads
layer names, types, and structure to identify targets at runtime.

```typescript
interface EditIntent {
  textSlots:  { role: string; value: string }[]   // e.g. { role: 'headline', value: 'New Topic' }
  imageSlots: { role: string; assetId: string }[] // e.g. { role: 'background', assetId: '...' }
}

interface EditingOperation {
  type: 'replace_text' | 'update_fill'
  elementId: string
  value?: string    // replace_text
  assetId?: string  // update_fill
}

async function resolveEditingOperations(
  elementTree: CanvaElement[],
  intent: EditIntent
): Promise<EditingOperation[]>
```

Claude receives the element tree as JSON and the intent as a structured prompt.
It responds with the matching `elementId` per slot. The resolver validates that
every requested slot was matched before returning — if Claude cannot confidently
identify a slot, it throws a typed `ElementNotFoundError` rather than silently
skipping the operation.

### Secrets management

All third-party credentials are provided as environment variables via a `.env` file
on the VPS. Security protocols:

- `.env` is **never committed to git** — enforced by `.gitignore` (`.env*` pattern,
  with `.env.example` the only exception)
- File permissions: `chmod 600 .env`, owned by the user running Docker Compose
- No secrets appear in `docker-compose.yml` — the compose file references
  `env_file: .env` and never hard-codes values
- Secret rotation: update `.env` → `docker compose up -d` to restart affected
  containers (no full redeploy needed)
- `.env.example` documents every required variable with placeholder values and
  inline comments explaining the source of each secret — committed to git as the
  canonical setup reference
- Social API tokens (Instagram, LinkedIn) are stored in the database **encrypted
  at rest** using a `TOKEN_ENCRYPTION_KEY` env var (AES-256-GCM) — the raw token
  never sits in plaintext in the DB

## File Changes Map

| File / Directory | Action | Description |
|---|---|---|
| `src/app/` | create | Next.js App Router pages |
| `src/app/api/generate/copy/route.ts` | create | Copy generation endpoint |
| `src/app/api/generate/image/route.ts` | create | Image generation endpoint |
| `src/app/api/design/assemble/route.ts` | create | Design assembly (Path A + B) |
| `src/app/api/design/export/route.ts` | create | Export design to blob |
| `src/app/api/publish/route.ts` | create | Immediate publish |
| `src/app/api/schedule/route.ts` | create | Schedule a post |
| `src/app/api/posts/route.ts` | create | List/cancel scheduled posts |
| `src/app/api/projects/route.ts` | create | Project CRUD |
| `src/app/api/projects/[id]/route.ts` | create | Project update / soft-delete / recover |
| `src/app/api/campaigns/route.ts` | create | Campaign CRUD |
| `src/app/api/campaigns/[id]/route.ts` | create | Campaign update / soft-delete / recover |
| `src/app/api/campaigns/[id]/projects/route.ts` | create | Campaign → project reassignment (admin) |
| `src/app/api/campaigns/[id]/drafts/[draftId]/route.ts` | create | Link draft to campaign (shared asset) |
| `src/app/api/campaigns/[id]/brandkit/route.ts` | create | Resolved brand kit for a campaign |
| `src/app/api/library/route.ts` | create | Asset library + publish history (filterable by project/campaign) |
| `src/app/api/admin/brandkits/route.ts` | create | BrandKit CRUD (admin) |
| `src/app/api/admin/brandkits/[id]/route.ts` | create | BrandKit update / soft-delete / set default (admin) |
| `src/app/api/admin/brandkits/[id]/prompt/route.ts` | create | BrandKit prompt versions: list, add, activate (rollback) (admin) |
| `src/app/api/admin/brandkits/[id]/artifacts/route.ts` | create | BrandKit artifact upload to MinIO / list / delete (admin) |
| `src/app/(app)/projects/page.tsx` | create | Projects list UI |
| `src/app/(app)/projects/[id]/page.tsx` | create | Project detail — campaigns + posts |
| `src/app/(app)/campaigns/page.tsx` | create | Campaigns list UI (standalone + project-assigned) |
| `src/app/(app)/campaigns/[id]/page.tsx` | create | Campaign detail — posts |
| `src/providers/interfaces/` | create | CopyProvider, ImageProvider, DesignOrchestrator interfaces |
| `src/providers/implementations/copy/openai.ts` | create | GPT copy provider |
| `src/providers/implementations/image/openai.ts` | create | gpt-image-2 provider |
| `src/providers/implementations/orchestrator/openai-canva.ts` | create | Path B orchestrator |
| `src/providers/registry.ts` | create | Provider resolution from env config |
| `src/lib/canva/client.ts` | create | Typed Canva MCP client with tx guard |
| `src/lib/canva/elementResolver.ts` | create | Claude-powered element targeting — resolves element IDs from the design's element tree at runtime; no hardcoded ID mappings |
| `src/lib/social/instagram.ts` | create | Instagram Graph API publisher |
| `src/lib/social/linkedin.ts` | create | LinkedIn API publisher |
| `src/lib/storage/minio.ts` | create | MinIO (S3-compatible) upload / pre-signed URL |
| `src/scheduler/worker.ts` | create | Scheduled post worker |
| `prisma/schema.prisma` | create | Full data model |
| `prisma/migrations/` | create | Auto-generated migrations |
| `tailwind.config.ts` | create | Frozen Light theme tokens (light + dark), `darkMode: "class"` |
| `src/app/globals.css` | create | Glass utility classes, custom scrollbars, self-hosted font faces |
| `src/components/theme/` | create | ThemeProvider (system + localStorage), ThemeToggle, pre-paint FOUC script |
| `src/components/layout/AppShell.tsx` | create | Top app bar + sidebar + fluid canvas layout |
| `src/components/ui/` | create | Base components: Button, GlassPanel, GlassInput, Select, SegmentedToggle, StatusChip |
| `src/middleware.ts` | create | Clerk auth middleware |
| `src/app/(auth)/` | create | Login/signup pages (Clerk components) |
| `src/app/(app)/brief/` | create | Brief creation UI (Path A / B mode select) |
| `src/app/(app)/draft/[id]/` | create | Draft refinement UI |
| `src/app/(app)/library/` | create | Asset library + history |
| `src/app/(app)/admin/settings/` | create | Admin: provider management (with API key registration + auto-detect) + brand kit manager |
| `src/app/api/drafts/[id]/refine/route.ts` | create | AGUI refinement endpoint — interprets instruction, applies Canva MCP edits, brand kit compliance check |
| `src/app/api/drafts/[id]/revisions/route.ts` | create | List revisions for undo panel |
| `src/app/api/drafts/[id]/revisions/[rev]/restore/route.ts` | create | Restore a prior revision via fresh editing transaction |
| `src/components/draft/RefinementPanel.tsx` | create | AGUI chat panel — instruction input, AI reply stream, undo history list |
| `.env.example` | create | Required env vars documented |
| `Dockerfile` | create | Container image (shared by app + scheduler services) |
| `docker-compose.yml` | create | Orchestrates app, scheduler, postgres, minio containers |
| `.env.example` | create | All required env vars documented with placeholder values |
| `.gitignore` | modify | Ensure `.env*` (except `.env.example`) is ignored |

## Data Model Changes

Greenfield — full schema defined above. No existing tables to migrate.

## API Changes

Greenfield — all routes are new. All are authenticated (Clerk session cookie).
Role checks (`requireRole('admin')`) are enforced server-side in route handlers,
not in middleware, so they fail-closed if misconfigured.

Internal API contract summary:

```
POST /api/generate/copy         body: { briefId }      → { copy: string }
POST /api/generate/image        body: { briefId }       → { imageUrl: string }
POST /api/design/assemble       body: { draftId, mode, templateId? } → { canvaDesignId }
POST /api/design/export         body: { draftId }       → { exportUrl: string }
POST /api/publish               body: { draftId, channels } → { posts: Post[] }
POST /api/schedule              body: { draftId, channels, scheduledAt } → { posts: Post[] }
DELETE /api/posts/[id]          (cancel scheduled)      → 204
GET  /api/library               → { drafts[], posts[] }
// Brand kits (admin only)
GET    /api/admin/brandkits                       (admin) → { brandKits: BrandKit[] }  // excludes soft-deleted
POST   /api/admin/brandkits                       (admin) body: { name, source, canvaBrandKitId?, templateIds?: string[] } → { brandKit }
PATCH  /api/admin/brandkits/[id]                  (admin) body: { name?, source?, canvaBrandKitId?, isDefault?, templateIds?: string[] } → { brandKit }
  // Edit is always available — admins can update name, source, Canva kit link, and linked templates at any time
GET    /api/admin/brandkits/[id]/templates        (admin) → { templates: BrandKitTemplate[] }
POST   /api/admin/brandkits/[id]/templates        (admin) body: { canvaTemplateId, name, imagePrompt? } → { template }
PATCH  /api/admin/brandkits/[id]/templates/[tid]  (admin) body: { imagePrompt? } → { template }  // update prompt only
DELETE /api/admin/brandkits/[id]/templates/[tid]  (admin) → 204
GET    /api/canva/brand-templates?kitId=bk_xxx    (admin) → { templates } // proxies search-brand-templates MCP, returns list for picker UI
  // UI renders results as a checkbox list — admin ticks templates to link; each selected template
  // expands to reveal an optional imagePrompt textarea. Used in both Add and Edit brand kit modals.
DELETE /api/admin/brandkits/[id]                  (admin) (soft-delete) → 204
GET    /api/admin/brandkits/[id]/prompt           (admin) → { active, versions: BrandKitPrompt[] }
POST   /api/admin/brandkits/[id]/prompt           (admin) body: { content } → { prompt }   // new version, becomes active
POST   /api/admin/brandkits/[id]/prompt/[v]/activate (admin) → 204   // rollback (EC-13)
GET    /api/admin/brandkits/[id]/artifacts        (admin) → { artifacts: BrandKitArtifact[] }
POST   /api/admin/brandkits/[id]/artifacts        (admin) body: { type, name, file, feedToAI } → { artifact }  // uploads to MinIO
DELETE /api/admin/brandkits/[id]/artifacts/[aid]  (admin) → 204
GET  /api/admin/providers                 (admin) → { providers: AvailableProvider[] }
POST /api/admin/providers                 (admin) body: { slot, apiKey, providerName?, label } → { provider }
  // apiKey is inspected server-side for known prefixes; providerName/label auto-populated where detected.
  // If prefix unrecognized, providerName + label must be supplied by admin.
  // Key validated against provider API before saving. Only keyPrefix stored in response — never full key.
PATCH /api/admin/providers/[id]           (admin) body: { isEnabled?, isDefault?, label? } → { provider }
DELETE /api/admin/providers/[id]          (admin) → 204  // remove a registered provider
GET  /api/providers/available             (authed) → { copy: Provider[], image: Provider[] }
  // returns only isEnabled=true providers per slot — used to populate brief UI dropdowns

// AGUI refinement
POST /api/drafts/[id]/refine              (authed) body: { instruction: string } → { reply: string, revisionId?: string }
  // AI interprets the instruction, checks brand kit compliance, returns a reply.
  // If instruction is safe: applies Canva MCP edits, commits, creates DraftRevision row, returns revisionId.
  // If instruction conflicts with brand kit: returns reply explaining conflict, no edit applied (revisionId absent).
  // Client sends a follow-up { instruction: "override" } to force-apply after a conflict warning.
GET  /api/drafts/[id]/revisions           (authed) → { revisions: DraftRevision[] }
POST /api/drafts/[id]/revisions/[rev]/restore (authed) → { canvaDesignId }
  // Restores the element tree from the selected revision via a fresh Canva editing transaction.

// Projects
GET    /api/projects                      → { projects[] }  // excludes soft-deleted
POST   /api/projects                      body: { name, defaultBrandKitId?, defaultTone? } → { project }
PATCH  /api/projects/[id]                 body: { name?, defaultBrandKitId?, defaultTone? } → { project }
DELETE /api/projects/[id]                 (soft-delete) → 204
POST   /api/projects/[id]/recover         → { project }

// Campaigns
GET    /api/campaigns                     → { campaigns[] }  // excludes soft-deleted; ?projectId= to filter
POST   /api/campaigns                     body: { name, brandKitId?, defaultTone?, projectIds? } → { campaign }
PATCH  /api/campaigns/[id]                body: { name?, brandKitId?, defaultTone? } → { campaign }
DELETE /api/campaigns/[id]                (soft-delete) → 204
POST   /api/campaigns/[id]/recover        → { campaign }
PATCH  /api/campaigns/[id]/projects       (admin) body: { projectIds } → { campaign }  // reassign
POST   /api/campaigns/[id]/drafts/[draftId]  → 204  // link a draft to a campaign (shared asset)

// Brand kit resolution (used by brief UI on campaign select)
GET    /api/campaigns/[id]/brandkit       → { brandKit: BrandKit, source: "campaign"|"project"|"default" }
  // resolves the precedence chain and returns the full BrandKit (canvaBrandKitId,
  // active prompt, feedToAI artifacts) so the brief UI can pre-fill brand context
```

## Key Decisions

**1. Provider Abstraction Layer (answers the extensibility question)**
The frontend and API route contracts are permanently decoupled from specific AI
models. The `CopyProvider`, `ImageProvider`, and `DesignOrchestrator` interfaces
are stable. Adding a new model means: implement the interface, register in
`registry.ts`, update one env var. This is the Strategy pattern applied at the
AI integration boundary.

**2. Clerk for auth (over Entra ID SSO)**
Avoids blocking the build on Microsoft tenant/app-registration setup. Clerk's
role metadata (`admin` / `editor`) is sufficient for v1. Migrating to Entra later
only requires replacing the auth adapter — the role-check pattern in route handlers
stays identical.

**3. Prisma + PostgreSQL in Docker (over a managed cloud DB)**
Prisma's type-safe query builder and built-in migration tooling fit a greenfield
Next.js project. PostgreSQL array columns handle `channels: String[]` naturally.
Running PostgreSQL in Docker Compose alongside the app keeps the stack self-contained
on the VPS with zero managed-service cost. Data is persisted via a named Docker volume.

**3b. MinIO for object storage (over Azure Blob / S3)**
MinIO is S3-compatible and self-hosted on the same VPS, eliminating all cloud
provider dependencies. The `@aws-sdk/client-s3` package works against MinIO
without changes — the only difference is the endpoint URL (env var). If the
project ever migrates to AWS S3, only the env vars change.

**4b. Claude-resolved element targeting (no hardcoded element ID maps)**
Rather than maintaining a per-template mapping of element IDs to their roles
(brittle — IDs can change when a Canva template is updated), the system calls
`get-design-content` after each template instantiation, feeds the element tree to
Claude via `src/lib/canva/elementResolver.ts`, and asks Claude to identify which
element corresponds to each role in the edit intent (headline, background image,
person photo, etc.). Claude reads the layer names and element types that template
designers naturally use in Canva, so any well-named template works without any
configuration. The resolver throws `ElementNotFoundError` if a slot cannot be
confidently matched, surfacing the issue immediately rather than silently producing
a broken design. This approach also means template swaps during draft refinement
require no additional setup — the resolver re-runs against the new template's tree.

**4b-edit. Edit brand kit as a distinct, always-available flow**
The settings UI separates brand kit *creation* from brand kit *editing*. An Edit
button on each kit card opens a modal pre-populated with the kit's current name,
source, linked Canva brand kit, and linked templates (with their imagePrompts).
Prompt versioning and artifact management remain on the expanded card — they are
not part of the edit modal, keeping each concern in one place. The `PATCH
/api/admin/brandkits/[id]` endpoint handles all editable fields. This separation
means admins can add templates to an existing kit at any time without going through
a create flow.

**4c. Per-template background image prompt override**
Each `BrandKitTemplate` row has an optional `imagePrompt` field. At Path A image
generation time, the system checks for this field first. If set, it is passed
verbatim to `ImageProvider.generateImage` instead of constructing a prompt from
the brief topic and description. This gives admins control over visual consistency
for templates that have a fixed aesthetic (e.g. "always dark abstract tech") without
constraining templates that should reflect the post topic. Templates with no
`imagePrompt` behave exactly as before. Admins set this per template in the brand
kit Edit modal — no developer changes required.

**4d. AI-assisted brand voice prompt authoring**
The brand voice prompt editor exposes two AI modes powered by Claude (Anthropic SDK):
(a) **Generate** — available when no prompt version exists yet; admin describes the
brand in plain text → Claude drafts a full brand voice prompt → presented for review
before saving as v1. (b) **Improve** — available alongside any existing active
prompt → Claude refines it → presented for review before saving as the next version.
Both modes feed through the existing prompt versioning system (FR-28b), so rollback
always applies. The AI output is never saved automatically — admin must confirm.
Implementation: `POST /api/admin/brandkits/[id]/prompt/generate` (generate) and
`POST /api/admin/brandkits/[id]/prompt/improve` (improve), both admin-gated, both
call Claude with appropriate system + user prompts.

**4. `withEditingTransaction` guard in Canva client**
Orphaned Canva editing transactions leave designs in a draft-only state and may
block future edits on the same design. The `try/finally` wrapper in `client.ts`
enforces NFR-11 at the library level so no calling code can accidentally skip
`cancel` on failure. This is enforced structurally, not by convention.

**5. Scheduler as a dedicated Docker container (polling loop)**
The scheduler service in `docker-compose.yml` uses the same Docker image as the
main app, runs `src/scheduler/worker.ts`, and polls every 60 seconds. This shares
the Prisma client and business logic with zero code duplication. Docker Compose
restarts the container automatically on failure (`restart: unless-stopped`).

**6. BrandKit as a first-class entity (owns prompt + artifacts + Canva link)**
Rather than a free-floating `BrandSystemPrompt` table and raw Canva ID strings on
Project/Campaign, a **BrandKit** is a proper entity that Projects and Campaigns
reference by FK. It is **hybrid**: it can link to a Canva brand kit
(`canvaBrandKitId`, for Path A templates and Path B), hold a backend artifact
folder in MinIO (`BrandKitArtifact` rows), or both (`source = CANVA | BACKEND |
HYBRID`). The brand voice lives in versioned `BrandKitPrompt` rows — history is
retained with an `isActive` flag so an admin can roll back to any prior version
(EC-13). Artifacts flagged `feedToAI` are passed to Path B orchestration and image
generation as brand context. BrandKits are **admin-managed** (brand governance).
Brand kit precedence at generation time stays: Campaign → Project default →
system default (`BrandKit.isDefault = true`).

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Instagram Graph API app review takes weeks | High | High (blocks AC-3) | Start Meta Business app registration immediately; build and test publish flow with a test account before review completes |
| LinkedIn app publishing permissions gated | Medium | High (blocks AC-3) | Apply for LinkedIn app early; design the publish layer to degrade gracefully (one channel fails, other proceeds) |
| Canva MCP server not available in Azure prod | Medium | High (blocks entire design flow) | Confirm production MCP server hosting in design Q5 before build starts; have a fallback plan (Canva REST API adapter implementing same interface) |
| Path B orchestrator runaway / high token cost | Medium | Medium | Hard limit of 20 tool calls per orchestration (EC-12); per-user generation budget enforced by NFR-7 |
| gpt-image-2 output incompatible with template dimensions | Low | Medium | Canva `update_fill` crops/scales to element bounds; validate output dimensions in EC-4 handler; offer template swap |
| MinIO disk fills up on VPS | Low | Medium | Monitor VPS disk usage; 7-day lifecycle rule on `generated-images` bucket auto-deletes temp images; alert if disk > 80% |
| `.env` file leaked via git | Low | High | `.gitignore` enforced; pre-commit hook blocks accidental commit of `.env`; rotate all secrets immediately if leak occurs |

