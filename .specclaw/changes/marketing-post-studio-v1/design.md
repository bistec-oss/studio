# Design: Marketing Post Studio (v1)

**Change:** marketing-post-studio-v1
**Created:** 2026-06-12

## Technical Approach

A Next.js 14 (App Router) + TypeScript monolith deployed to Azure Container Apps.
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
│    image/openai.ts         ← gpt-image-1                    │
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
│  Scheduler  (Azure Container Apps Job — cron worker)        │
│  Polls DB for due scheduled posts → calls publish layer     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Persistence                                                │
│  Azure Database for PostgreSQL  (via Prisma ORM)            │
│  Azure Blob Storage             (generated images, exports) │
│  Azure Key Vault                (secrets)                   │
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
POST /api/generate/image  → ImageProvider.generateImage(brief)
POST /api/design/assemble?mode=template
  → CanvaMcpClient.uploadAsset(imageUrl)
  → CanvaMcpClient.createFromTemplate(templateId)
  → CanvaMcpClient.startTransaction() → performOps([replace_text, update_fill]) → commit()
POST /api/design/export   → CanvaMcpClient.exportDesign(designId) → blob storage
```

**Path B — AI-generated new design:**
```
POST /api/design/assemble?mode=generate
  → DesignOrchestrator.orchestrate(brief, brandKitId)
    OpenAI Chat Completions (function calling, Canva MCP tools as functions)
    orchestrator loop (max 20 tool calls — EC-12 hard limit):
      may call: upload-asset-from-url, get-assets,
                start-editing-transaction, perform-editing-operations,
                commit-editing-transaction (or cancel on error)
POST /api/design/export   → CanvaMcpClient.exportDesign(designId) → blob storage
```

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

**Azure Database for PostgreSQL Flexible Server** (cheapest managed PG on Azure).
ORM: **Prisma** (type-safe, migrations built-in, works with Next.js edge runtime).

Schema:

```prisma
model User {
  id        String   @id @default(cuid())
  clerkId   String   @unique
  role      Role     @default(EDITOR)
  briefs    Brief[]
  posts     Post[]
  createdAt DateTime @default(now())
}

enum Role { ADMIN EDITOR }

model Brief {
  id              String     @id @default(cuid())
  userId          String
  user            User       @relation(fields: [userId], references: [id])
  topic           String
  goal            String
  tone            String
  channels        String[]   // ["instagram", "linkedin"]
  designMode      DesignMode
  copyProviderKey String     // e.g. "openai" — user's choice at brief time
  imageProviderKey String    // e.g. "gemini" — user's choice at brief time
  createdAt       DateTime   @default(now())
  drafts          Draft[]
}

enum DesignMode { TEMPLATE GENERATE }

model Draft {
  id           String   @id @default(cuid())
  briefId      String
  brief        Brief    @relation(fields: [briefId], references: [id])
  copyText     String
  imageUrl     String   // blob storage URL
  canvaDesignId String?
  templateId   String?
  exportUrl    String?  // blob storage URL of exported PNG/JPG
  status       DraftStatus @default(IN_PROGRESS)
  createdAt    DateTime @default(now())
  posts        Post[]
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

model BrandSystemPrompt {
  id        String   @id @default(cuid())
  content   String
  version   Int      @default(1)        // for rollback — EC-13
  isActive  Boolean  @default(false)
  createdAt DateTime @default(now())
  createdBy String   // userId
}

// Admin-curated list of models available to users per slot
model AvailableProvider {
  id          String       @id @default(cuid())
  slot        ProviderSlot // COPY | IMAGE
  providerKey String       // e.g. "openai", "gemini", "anthropic"
  label       String       // display name shown in brief UI, e.g. "GPT-4o"
  isEnabled   Boolean      @default(true)
  isDefault   Boolean      @default(false) // system default for this slot
  createdAt   DateTime     @default(now())

  @@unique([slot, providerKey])
  @@unique([slot, isDefault]) // only one default per slot (enforced in app logic)
}

enum ProviderSlot { COPY IMAGE }
```

### Asset storage

**Azure Blob Storage** — two containers:
- `generated-images` — raw gpt-image-1 output (temp, 7-day TTL)
- `exported-designs` — final exported PNG/JPG assets (permanent, linked in Draft.exportUrl)

Images are uploaded server-side; only blob URLs are stored in the DB. No binary
blobs in the database.

### Scheduler

**Azure Container Apps Job** (cron-triggered, runs every minute) — a standalone
Node.js script (`src/scheduler/worker.ts`) that:
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

### Secrets management

All third-party credentials stored in **Azure Key Vault**, injected as environment
variables at runtime via Container Apps managed identity. Never in code or `.env`
committed to git.

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
| `src/app/api/library/route.ts` | create | Asset library + publish history |
| `src/app/api/admin/prompt/route.ts` | create | Brand system prompt CRUD (admin) |
| `src/providers/interfaces/` | create | CopyProvider, ImageProvider, DesignOrchestrator interfaces |
| `src/providers/implementations/copy/openai.ts` | create | GPT copy provider |
| `src/providers/implementations/image/openai.ts` | create | gpt-image-1 provider |
| `src/providers/implementations/orchestrator/openai-canva.ts` | create | Path B orchestrator |
| `src/providers/registry.ts` | create | Provider resolution from env config |
| `src/lib/canva/client.ts` | create | Typed Canva MCP client with tx guard |
| `src/lib/social/instagram.ts` | create | Instagram Graph API publisher |
| `src/lib/social/linkedin.ts` | create | LinkedIn API publisher |
| `src/lib/storage/blob.ts` | create | Azure Blob Storage upload/read |
| `src/scheduler/worker.ts` | create | Scheduled post worker |
| `prisma/schema.prisma` | create | Full data model |
| `prisma/migrations/` | create | Auto-generated migrations |
| `src/middleware.ts` | create | Clerk auth middleware |
| `src/app/(auth)/` | create | Login/signup pages (Clerk components) |
| `src/app/(app)/brief/` | create | Brief creation UI (Path A / B mode select) |
| `src/app/(app)/draft/[id]/` | create | Draft refinement UI |
| `src/app/(app)/library/` | create | Asset library + history |
| `src/app/(app)/admin/settings/` | create | Admin: brand system prompt editor |
| `.env.example` | create | Required env vars documented |
| `Dockerfile` | create | Container image for Azure Container Apps |
| `infra/` | create | Azure Bicep or Terraform for Container Apps + PG + Blob + Key Vault |

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
GET  /api/admin/prompt                    (admin) → { prompt: BrandSystemPrompt }
POST /api/admin/prompt                    (admin) body: { content } → { prompt }
POST /api/admin/prompt/[id]/activate      (admin) → 204
GET  /api/admin/providers                 (admin) → { providers: AvailableProvider[] }
POST /api/admin/providers                 (admin) body: { slot, providerKey, label } → { provider }
PATCH /api/admin/providers/[id]           (admin) body: { isEnabled?, isDefault? } → { provider }
GET  /api/providers/available             (authed) → { copy: Provider[], image: Provider[] }
  // returns only isEnabled=true providers per slot — used to populate brief UI dropdowns
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

**3. Prisma + PostgreSQL (over Azure SQL)**
Prisma's type-safe query builder and built-in migration tooling fit a greenfield
Next.js project better than the MSSQL driver ecosystem. PostgreSQL array columns
handle `channels: String[]` naturally. Azure Database for PostgreSQL Flexible
Server is cost-comparable to Azure SQL Basic.

**4. `withEditingTransaction` guard in Canva client**
Orphaned Canva editing transactions leave designs in a draft-only state and may
block future edits on the same design. The `try/finally` wrapper in `client.ts`
enforces NFR-11 at the library level so no calling code can accidentally skip
`cancel` on failure. This is enforced structurally, not by convention.

**5. Container Apps Job for scheduler (over Azure Functions timer)**
Container Apps Jobs run the exact same Docker image as the main app, so the
scheduler shares the Prisma client and business logic with zero duplication. Azure
Functions timer triggers require a separate deployment artifact and a different
Node.js entrypoint pattern. For this scale, the job approach is simpler.

**6. Brand system prompt versioning with rollback (BrandSystemPrompt table)**
EC-13 requires that a bad prompt can be reverted without a developer. Storing all
versions with an `isActive` flag lets an admin activate any prior version instantly
from the settings UI.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Instagram Graph API app review takes weeks | High | High (blocks AC-3) | Start Meta Business app registration immediately; build and test publish flow with a test account before review completes |
| LinkedIn app publishing permissions gated | Medium | High (blocks AC-3) | Apply for LinkedIn app early; design the publish layer to degrade gracefully (one channel fails, other proceeds) |
| Canva MCP server not available in Azure prod | Medium | High (blocks entire design flow) | Confirm production MCP server hosting in design Q5 before build starts; have a fallback plan (Canva REST API adapter implementing same interface) |
| Path B orchestrator runaway / high token cost | Medium | Medium | Hard limit of 20 tool calls per orchestration (EC-12); per-user generation budget enforced by NFR-7 |
| gpt-image-1 output incompatible with template dimensions | Low | Medium | Canva `update_fill` crops/scales to element bounds; validate output dimensions in EC-4 handler; offer template swap |
| Azure Blob Storage URL expiry before scheduled publish | Low | Low | Use permanent blob URLs (no SAS expiry) for `exported-designs` container; only temp images use TTL |
