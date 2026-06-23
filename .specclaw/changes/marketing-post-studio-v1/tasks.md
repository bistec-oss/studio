# Tasks: Marketing Post Studio (v1)

**Change:** marketing-post-studio-v1
**Created:** 2026-06-12
**Total Tasks:** 30

## Summary

28 tasks across 6 waves (plus Wave 3b). Waves 1–3 establish the foundation
(project scaffold, design system, data layer, provider abstraction, HTML renderer +
Claude design agent + MinIO clients). Wave 3b adds the brand kit, project, and
campaign data layer (these are referenced by the brief/generation flow). Waves 4–5
build the two design paths and publishing. Wave 6 covers admin settings and
end-to-end verification.

The frontend follows the **Frozen Light** design system
(`docs/ui-reference/DESIGN_SYSTEM.md`) — glassmorphic, dark + light themes
mandatory, self-hosted fonts/icons. T25 scaffolds it before any screen task.

Each wave can begin only when all tasks in the prior wave are complete.
Within a wave, tasks without inter-dependencies can run in parallel.

---

## Tasks

### Wave 1 — Project scaffold & infrastructure

- [x] `T01` — Initialize Next.js 14 + TypeScript project
  - Files: `package.json`, `tsconfig.json`, `next.config.ts`, `.env.example`, `Dockerfile`
  - Estimate: small
  - Depends: —
  - Notes: App Router, TypeScript strict mode, Tailwind CSS. `.env.example` documents every required env var (Anthropic key, OpenAI key, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, DB URL, MinIO endpoint/keys, social API tokens, `TOKEN_ENCRYPTION_KEY`). Husky pre-commit hook added to block accidental `.env` commits.

- [x] `T02` — VPS infrastructure setup (Docker Compose)
  - Files: `docker-compose.yml`, `.env.example`, `.gitignore`
  - Estimate: medium
  - Depends: T01
  - Notes: `docker-compose.yml` defines four services: `app` (Next.js, port 3000), `scheduler` (same image, runs `worker.ts`), `postgres` (official PG image, named volume), `minio` (MinIO image, two named volumes for data + config, console port 9001 bound to 127.0.0.1 only). All services use `env_file: .env` — no secrets in compose file. `.env.example` documents every variable. `.gitignore` includes `.env*` except `.env.example`. Pre-commit hook (husky) blocks committing any `.env` file.

- [x] `T03` — Prisma schema + initial migration
  - Files: `prisma/schema.prisma`, `prisma/migrations/`
  - Estimate: small
  - Depends: T02
  - Notes: Full schema as defined in design.md: User, Project, Campaign, ProjectCampaign (M2M), CampaignDraft (M2M), Brief (campaignId nullable), Draft, Post, BrandKit, BrandKitPrompt (versioned), BrandKitArtifact, BrandKitTemplate, AvailableProvider + enums (Role, DesignMode, DraftStatus, Channel, PostStatus, ProviderSlot, ArtifactType). Project.defaultBrandKitId and Campaign.brandKitId are FKs → BrandKit. `DATABASE_URL` points to the `postgres` Docker service. Run `prisma migrate dev` to generate migration files.

- [x] `T04` — better-auth integration + role middleware
  - Files: `src/middleware.ts`, `src/app/(auth)/login/page.tsx`, `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/lib/prisma.ts`, `src/app/api/auth/[...all]/route.ts`
  - Estimate: small
  - Depends: T01
  - Notes: Self-hosted auth via better-auth (email + password). Session stored in PostgreSQL via Prisma adapter. Middleware checks `better-auth.session_token` cookie; unauthenticated requests redirect to `/login`. `src/lib/auth.ts` exports `requireRole('admin' | 'editor')` and `getCurrentUser()` helpers used in API route handlers. `role` field lives on the User DB row (server-managed only — not writable at sign-up). Login page is a custom Frozen Light–themed form (`GlassPanel` + `GlassInput`). No external auth SaaS required. Env vars: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`.

- [x] `T25` — Design system foundation (Frozen Light theme + base components)
  - Files: `tailwind.config.ts`, `src/app/globals.css`, `src/components/theme/ThemeProvider.tsx`, `src/components/theme/ThemeToggle.tsx`, `src/components/layout/AppShell.tsx`, `src/components/ui/` (Button, GlassPanel, GlassInput, Select, SegmentedToggle, StatusChip), `src/app/layout.tsx`
  - Estimate: medium
  - Depends: T01
  - Notes: Implements the design system per `docs/ui-reference/DESIGN_SYSTEM.md`. Tailwind config with light/dark color tokens + `darkMode: "class"`. Glass utility classes (`.glass`, `.glass-panel`, `.glass-input`) in globals.css. **Dark + light themes mandatory** — `ThemeProvider` follows `prefers-color-scheme` on first visit and persists manual toggle to `localStorage`; inline pre-paint script prevents FOUC. **Self-host all fonts/icons** (Inter + JetBrains Mono via `next/font`, icons via local Material Symbols subset or `lucide-react`) — no external CDN. `AppShell` provides the 64px top app bar + 256px sidebar + fluid canvas layout. Base components reused across all screen tasks. Use Frozen Light as a starting point, not a rigid spec.

---

### Wave 2 — Provider abstraction layer

- [x] `T05` — Define provider interfaces
  - Files: `src/providers/interfaces/CopyProvider.ts`, `src/providers/interfaces/ImageProvider.ts`, `src/providers/interfaces/DesignOrchestrator.ts`
  - Estimate: small
  - Depends: T01
  - Notes: Three TypeScript interfaces. `CopyProvider.generateCopy(brief: Brief): Promise<string>`. `ImageProvider.generateImage(brief: Brief): Promise<{ url: string }>`. `DesignOrchestrator.orchestrate(brief: Brief, brandKitId: string): Promise<{ exportUrl: string, htmlContent: string }>`. These interfaces are the stable contract — all future AI models plug in here.

- [x] `T06` — OpenAI copy provider implementation
  - Files: `src/providers/implementations/copy/openai.ts`
  - Estimate: small
  - Depends: T05
  - Notes: Implements `CopyProvider`. Calls OpenAI Chat Completions (GPT-4o mini). Channel-aware system prompt (Instagram caption vs LinkedIn post format per FR-8). Returns copy string.

- [x] `T07` — OpenAI image provider implementation
  - Files: `src/providers/implementations/image/openai.ts`
  - Estimate: small
  - Depends: T05
  - Notes: Implements `ImageProvider`. Calls gpt-image-2 via OpenAI Images API. Returns image URL. Handles moderation rejection (EC-2) by throwing a typed `ModerationError`.

- [x] `T08` — Provider registry
  - Files: `src/providers/registry.ts`
  - Estimate: small
  - Depends: T06, T07
  - Notes: Resolves the active provider for a given slot using this order: (1) providerKey passed from the Brief record (user's choice), (2) `AvailableProvider` row with `isDefault=true` for that slot, (3) env var fallback. Throws if the resolved key has no registered implementation. This is the only file that needs updating when a new model is registered.

    **Orchestrator resolution** (env-only, not user-selectable): check `DESIGN_PROVIDER` env var — `"cli"` → `ClaudeCliOrchestrator` (test mode, no API key); `"claude-html"` or unset → `ClaudeHtmlOrchestrator` (production). Both implementations must be registered. Also add `claude-cli.ts` to the File Changes Map.

---

### Wave 3 — HTML renderer + Claude design agent + MinIO storage

- [ ] `T09` — HTML renderer + Claude design agent
  - Files: `src/lib/renderer/puppeteer.ts`, `src/lib/agent/designAgent.ts`, `src/lib/agent/tools.ts`, `src/lib/agent/types.ts`
  - Estimate: medium
  - Depends: T01, T10
  - Notes: Two deliverables.

    **1. `puppeteer.ts` — headless Chromium renderer**

    Exports `renderHtmlToPng(html: string, width: number, height: number): Promise<Buffer>`. Uses `puppeteer-core` with a pinned Chromium version. Key settings: `deviceScaleFactor: 2` for retina-quality output; `page.setContent(html, { waitUntil: 'networkidle0' })` to allow fonts and images to settle before screenshot. Caller is responsible for uploading the returned buffer to MinIO.

    **2. `designAgent.ts` — Claude tool-use agent loop**

    Exports `runDesignAgent(options: DesignAgentOptions): Promise<DesignAgentResult>`. Implements the standard Anthropic SDK tool-use loop: send messages → inspect response → if `tool_use` blocks present, execute each tool, append `tool_result` → repeat until no `tool_use` blocks in response. Hard limit of **15 tool calls** total (EC-12); halts and returns error if exceeded.

    Tools implemented in `tools.ts`:
    - `generateImage(prompt, brandKitId)` — calls the active `ImageProvider` → uploads result buffer to MinIO `generated-images` bucket → returns pre-signed URL
    - `renderHtml(html, width, height)` — calls `renderHtmlToPng` → uploads PNG buffer to MinIO `exported-designs` bucket → returns pre-signed MinIO URL
    - `getBrandKitContext(briefId)` — resolves the brand kit using campaign → project → system default precedence; returns `{ colors, fonts, logoUrl, voicePrompt, artifactUrls }`

    On any tool error: agent is halted, error returned to caller, brief record preserved.

    When `DESIGN_PROVIDER=cli` is set, `runDesignAgent` is not invoked — the CLI proxy (`ClaudeCliOrchestrator`, registered in T08) handles the request entirely. T09 has no CLI-specific code; the dispatch happens at the registry level.

- [ ] `T10` — MinIO storage client
  - Files: `src/lib/storage/minio.ts`
  - Estimate: small
  - Depends: T02
  - Notes: Wraps `@aws-sdk/client-s3` (MinIO is S3-compatible; only the endpoint differs).

    Exported methods:
    ```typescript
    uploadObject(buffer: Buffer, bucket: string, key: string): Promise<string>
    // returns pre-signed GET URL (7-day expiry for generated-images, permanent for exported-designs)

    getPresignedUrl(bucket: string, key: string): Promise<string>
    ```

    Config from env vars:
    - `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`
    - `MINIO_BUCKET_IMAGES`, `MINIO_BUCKET_EXPORTS`, `MINIO_BUCKET_BRANDKITS`

    Creates buckets on startup if they do not exist. Used by image generation, design export, and brand kit artifact routes.

---

### Wave 3b — Brand kits, Projects & Campaigns (data layer)

- [ ] `T26` — BrandKit management (API + admin UI)
  - Files: `src/app/api/admin/brandkits/route.ts`, `src/app/api/admin/brandkits/[id]/route.ts`, `src/app/api/admin/brandkits/[id]/prompt/route.ts`, `src/app/api/admin/brandkits/[id]/artifacts/route.ts`, `src/app/api/admin/brandkits/[id]/templates/route.ts`, `src/app/api/admin/brandkits/[id]/templates/[tid]/route.ts`, `src/lib/brandkit/resolve.ts`, `src/app/(app)/admin/settings/brandkits/page.tsx`
  - Estimate: large
  - Depends: T03, T04, T09, T10, T25
  - Notes: Admin-only BrandKit CRUD. **Create and Edit are separate UI flows** — an Edit button on each kit card opens a pre-populated modal. `PATCH /api/admin/brandkits/[id]` handles all editable fields. (1) **Color palette input**: admin enters hex color values → stored as array in `BrandKit.colors Json?`. (2) **Font management**: admin uploads font files to MinIO `brandkits` bucket → stored as `{ name, url }[]` in `BrandKit.fonts Json?`. (3) **Logo upload**: admin uploads logo → MinIO `brandkits` bucket → URL stored in `BrandKit.logoUrl String?`. (4) **HTML template management**: admins paste or upload an HTML/CSS template string → stored in `BrandKitTemplate.htmlTemplate @db.Text`. The brief wizard (T11) reads `BrandKitTemplate` rows to populate the template picker for Path A. (5) Prompt versioning: list versions, POST new version (becomes active), POST `/prompt/[v]/activate` for rollback (EC-13). (6) **AI prompt assistance**: `POST /api/admin/brandkits/[id]/prompt/generate` — admin submits plain-text brand description, Claude returns a drafted brand voice prompt for review (not auto-saved); `POST /api/admin/brandkits/[id]/prompt/improve` — Claude refines the current active prompt, returns improved version for review. Both admin-gated, both use Anthropic SDK (claude-sonnet-4-6). (7) Artifacts: upload to MinIO `brandkits` bucket with `type` + `feedToAI` flag, list, delete. (8) Set the system default kit (`isDefault`, one per system). (9) `src/lib/brandkit/resolve.ts` exports the shared precedence resolver (campaign → project default → system default) reused by T23 and T14. Admin-role-gated throughout. FR-13, FR-25b–FR-25c, FR-26b–FR-26c, FR-28b–FR-29b, AC-5c, AC-5d, AC-5e.

- [ ] `T23` — Project & Campaign API routes
  - Files: `src/app/api/projects/route.ts`, `src/app/api/projects/[id]/route.ts`, `src/app/api/campaigns/route.ts`, `src/app/api/campaigns/[id]/route.ts`, `src/app/api/campaigns/[id]/projects/route.ts`, `src/app/api/campaigns/[id]/drafts/[draftId]/route.ts`, `src/app/api/campaigns/[id]/brandkit/route.ts`
  - Estimate: medium
  - Depends: T03, T04, T26
  - Notes: Full CRUD for Projects and Campaigns. `defaultBrandKitId` / `brandKitId` are FKs → BrandKit. Soft-delete sets `isDeleted=true` + `deletedAt`. Recovery clears both. Campaign → project reassignment is admin-gated (`requireRole('admin')`). `GET /api/campaigns/[id]/brandkit` uses `resolve.ts` (campaign → project default → system default) and returns the full resolved BrandKit + source label. `POST /api/campaigns/[id]/drafts/[draftId]` creates a `CampaignDraft` row (shared asset link). FR-P1–FR-P3, FR-C1–FR-C5, AC-11b, AC-11c, AC-17, AC-18.

- [ ] `T24` — Projects & Campaigns UI
  - Files: `src/app/(app)/projects/page.tsx`, `src/app/(app)/projects/[id]/page.tsx`, `src/app/(app)/campaigns/page.tsx`, `src/app/(app)/campaigns/[id]/page.tsx`
  - Estimate: medium
  - Depends: T23, T25
  - Notes: Projects list: name, default brand kit, campaign count, soft-delete + recover actions. Project detail: list of assigned campaigns + their posts. Campaigns list: shows standalone campaigns and project-assigned campaigns (with project badge). Campaign detail: posts grid. Brand kit selectors show admin-managed BrandKits. Admin-only UI for reassigning a campaign to a different project. Soft-deleted items shown in a "Deleted" tab with recover button. AC-11c, AC-18.

---

### Wave 4 — Core generation + design assembly API routes

- [x] `T11` — Brief creation (DB + API route)
  - Files: `src/app/api/briefs/route.ts`, `src/app/api/providers/available/route.ts`, `src/app/(app)/brief/page.tsx`
  - Estimate: medium
  - Depends: T03, T04, T08, T23, T25, T26
  - Notes: `POST /api/briefs` creates a Brief record including optional `campaignId`. Brief UI includes a project → campaign drill-down selector (optional — leaving blank = Uncategorized). On campaign select, calls `GET /api/campaigns/[id]/brandkit` to auto-populate the brand kit field; user is not prompted to pick brand kit again unless overriding. Tone pre-fills from campaign/project default. Copy model dropdown populates from `GET /api/providers/available`. Design mode radio (Path A / Path B). **Image uploads differ by path:** Path A shows a single "Additional Image" upload (stored as `additionalImageUrl` in Brief — passed into the HTML template by the Claude design agent). Path B shows a multi-image upload where each image is tagged with an **intent**: "Embed in design" (Claude places this image in the HTML layout) or "Style reference only" (Claude uses it for compositional inspiration only). Stored as `briefImages: { url, intent }[]` (JSON) in Brief. Path B also shows an optional **template reference** picker (same thumbnail list as Path A's picker) — user can choose a template from the resolved brand kit as style inspiration; stored as `referenceTemplateId` FK on Brief. **Image provider selector is hidden by default** — system default is used when Claude calls `generateImage`. An "Advanced" disclosure exposes it for users who want to override. FR-5, FR-5a, FR-5b, FR-6, FR-18c, FR-18d, FR-28–FR-30, AC-13, AC-16, AC-17.

- [x] `T12` — Copy generation API route + image tool handler
  - Files: `src/app/api/generate/copy/route.ts`, `src/app/api/generate/image/route.ts`
  - Estimate: small
  - Depends: T08, T10, T11
  - Notes: `POST /api/generate/copy` is called by the assembly pipeline; `POST /api/generate/image` is called internally by the `generateImage` agent tool implementation (not directly by the pipeline orchestrator). Copy route reads brief + brand kit prompt → calls registry copy provider → returns `{ copyText }`. Image route accepts `{ briefId, prompt? }` → calls registry image provider → uploads buffer to MinIO `generated-images` bucket → returns `{ imageUrl }`. `ModerationError` → 422 `{ code: 'MODERATION' }` (EC-2). FR-7–FR-11, AC-4.

- [x] `T13` — Path A: design assembly API route (preset template)
  - Files: `src/app/api/generate/assemble-a/route.ts`
  - Estimate: medium
  - Depends: T09, T12
  - Notes: `POST /api/generate/assemble-a`. Flow:
    1. Load brief + resolved `BrandKitTemplate` (`htmlTemplate`) + brand kit (`colors`, `fonts`, `logoUrl`, active `BrandKitPrompt`).
    2. Call copy route → `copyText`.
    3. Launch `runDesignAgent` in template-fill mode: system prompt instructs Claude to fill the HTML template using brand colors/fonts. Tools available: `generateImage`, `renderHtml`, `getBrandKitContext`. Claude receives `template.htmlTemplate` + `copyText` + `brief.additionalImageUrl?` + brand kit context. Claude decides whether to call `generateImage` or use CSS/SVG backgrounds.
    4. Claude fills the template, calls `renderHtml(html, 1080, 1080)` → PNG → uploaded to MinIO.
    5. Create `Draft` row: `{ copyText, imageUrl? (set if Claude called generateImage), htmlContent: filledHtml, templateId, exportUrl, status: EXPORTED }`.
    6. Return `{ draftId, exportUrl }`.

    On agent error: return 422 with `{ code: 'AGENT_ERROR', message }` — surface to user as a recoverable error.

- [x] `T14` — Path B: Claude HTML design agent orchestrator
  - Files: `src/app/api/generate/assemble-b/route.ts`, `src/providers/implementations/orchestrator/claude-html.ts`
  - Estimate: large
  - Depends: T09, T12, T08, T26
  - Notes: Implements `DesignOrchestrator`. `POST /api/generate/assemble-b`. Flow:
    1. Resolve brand kit → get `colors`, `fonts`, `logoUrl`, active voice prompt, feed-to-AI artifact URLs.
    2. If `brief.referenceTemplateId` is set, load `BrandKitTemplate.htmlTemplate` — pass to agent with "style inspiration only" instruction.
    3. Launch `runDesignAgent` in freeform-generation mode: system prompt instructs Claude to design a complete HTML/CSS post from scratch using brand guidelines.
       - Pass `brief.briefImages[]` ({ url, intent }) — agent prompt explicitly instructs Claude to embed `"embed"` images in the HTML layout and use `"reference"` images for compositional inspiration only.
       - Pass reference template HTML (if present) with "design in this spirit, not a template to fill" instruction.
       - Tools available: `generateImage`, `renderHtml`, `getBrandKitContext`.
    4. Claude generates HTML, embeds `"embed"` images, optionally calls `generateImage` for additional imagery, calls `renderHtml` to produce PNG.
    5. Create `Draft` row: `{ copyText, imageUrl? (from any generateImage tool call, null if Claude used CSS/SVG), htmlContent, exportUrl, status: EXPORTED }`.
    6. Return `{ draftId, exportUrl }`.

    Hard limit: 15 tool calls (EC-12). On tool error: agent halted, error returned to caller with brief preserved.

- [x] `T15` — Export route
  - Files: `src/app/api/generate/export/route.ts`
  - Estimate: small
  - Depends: T09, T10
  - Notes: `POST /api/generate/export` `{ draftId }`. If `Draft.exportUrl` already set (set at assembly time), returns it immediately. Otherwise: load `Draft.htmlContent` → call `renderHtmlToPng` → upload to MinIO `exported-designs` bucket → update `Draft.exportUrl` + `Draft.status = EXPORTED`. This is a lightweight re-render path for cases where the draft needs re-export after copy edits.

---

### Wave 5 — Publishing, scheduling, library

- [ ] `T16` — Social publisher: Instagram + LinkedIn
  - Files: `src/lib/social/instagram.ts`, `src/lib/social/linkedin.ts`
  - Estimate: medium
  - Depends: T03
  - Notes: Each module exports `publish(exportUrl, copy, channel): Promise<{ platformId }>`. Instagram uses the Graph API (media container → publish). LinkedIn uses the UGC Posts API. Failures throw typed errors with reason strings. Per-channel failure does not block the other (EC-10). FR-18, FR-20.

- [ ] `T17` — Publish + schedule API routes
  - Files: `src/app/api/publish/route.ts`, `src/app/api/schedule/route.ts`, `src/app/api/posts/[id]/route.ts`
  - Estimate: medium
  - Depends: T15, T16, T04
  - Notes: Publish route: role-check (admin only), calls publisher, writes Post records with outcome. Schedule route: role-check, sets `scheduledAt`, status=SCHEDULED. DELETE `/api/posts/[id]`: cancel (status=CANCELLED) only if status=SCHEDULED. FR-18–FR-21, AC-2, AC-3, AC-9, AC-10.

- [ ] `T18` — Scheduler worker (Docker container)
  - Files: `src/scheduler/worker.ts`
  - Estimate: medium
  - Depends: T17
  - Notes: Runs as the `scheduler` service in `docker-compose.yml` (same Docker image as `app`, different entrypoint). Polls every 60 seconds via `setInterval`. Queries `Post WHERE status=SCHEDULED AND scheduledAt <= now()`. Sets IN_FLIGHT before publish (idempotency). Calls `instagram.publish` or `linkedin.publish`. Updates to PUBLISHED or FAILED. Docker Compose `restart: unless-stopped` ensures catch-up after VPS reboot (EC-7). AC-8.

- [ ] `T19` — Asset library + publish history API + UI
  - Files: `src/app/api/library/route.ts`, `src/app/(app)/library/page.tsx`
  - Estimate: medium
  - Depends: T17, T23, T25
  - Notes: `GET /api/library` supports `?projectId=` and `?campaignId=` query params for drill-down filtering; omitting both returns all (including Uncategorized). UI: left-side project/campaign filter panel → post grid + publish history table. "Uncategorized" is a fixed filter option for posts with no campaign. FR-22, FR-23, FR-24, AC-11, AC-11a.

---

### Wave 6 — Admin settings, refinement UI, end-to-end

- [ ] `T20` — Admin: provider management settings
  - Files: `src/app/api/admin/providers/route.ts`, `src/app/api/admin/providers/[id]/route.ts`, `src/app/(app)/admin/settings/page.tsx`
  - Estimate: medium
  - Depends: T04, T08, T25
  - Notes: Provider management section of the admin settings page. Admins register new AI providers directly from the UI — no redeploy required. Registration flow: admin enters API key → server inspects prefix (`sk-ant-` → Anthropic, `sk-` → OpenAI, etc.) and auto-populates provider name + label → if prefix unrecognized, admin manually specifies name and label → key validated against provider API before saving → key stored encrypted (AES-256-GCM) → only `keyPrefix` shown in UI thereafter (never full key). `POST /api/admin/providers` body: `{ slot, apiKey, providerName?, label }`. `PATCH` to enable/disable, set default, or update label. `DELETE` to remove. Brief UI model selector shows provider name + label as registered (e.g. "Claude 3.5 Sonnet (Anthropic)"). Changes immediately reflected in `GET /api/providers/available`. Admin-role-gated. FR-31, FR-32, FR-32a–FR-32d, AC-14, AC-15.

- [ ] `T21` — Draft refinement UI + AGUI backend
  - Files: `src/app/(app)/draft/[id]/page.tsx`, `src/components/draft/RefinementPanel.tsx`, `src/app/api/drafts/[id]/refine/route.ts`, `src/app/api/drafts/[id]/revisions/route.ts`, `src/app/api/drafts/[id]/revisions/[rev]/restore/route.ts`
  - Estimate: large
  - Depends: T13, T14, T15, T25, T03
  - **⚠️ MODEL PROMPT — stop before starting this task and ask the user:**
    > "T21 (Draft refinement + AGUI backend) is the most stateful task in the build —
    > it covers the brand-kit conflict/override flow, `pendingConflict` state, undo stack,
    > and Puppeteer re-render on restore. Recommended: **claude-opus-4-8** with **medium effort**.
    > Switch to Opus for this task? (yes / no, continue with current model)"
  - Notes: Two deliverables. (1) **Draft page UI** — generated copy (editable textarea), generated image ("Regenerate" button), template selector (Path A only), design preview (rendered PNG from `Draft.exportUrl`), "Export" button. No external design editor embed (FR-16). (2) **AGUI refinement panel** — chat input + AI reply area + undo history list, positioned alongside the design preview.

    **Backend — `POST /api/drafts/[id]/refine`:**
    1. Load draft + brief + resolved brand kit.
    2. Launch Claude design agent with `draft.htmlContent` as current design context + the refinement instruction.
    3. System prompt instructs Claude: "here is the current HTML design, apply the requested change".
    4. Claude checks brand kit compliance (colors, fonts, voice), updates HTML accordingly, calls `renderHtml` → new PNG.
    5. If brand kit conflict: return `{ reply: "<explanation>" }` — no render, no revision created. Client waits for user to send "override".
    6. If "override": skip compliance check, proceed.
    7. On committed change: update `Draft.htmlContent` → create `DraftRevision(htmlSnapshot, exportUrl, instruction, revisionNumber)` → update `Draft.exportUrl`.
    8. Return `{ reply, revisionId }`.

    **`GET /api/drafts/[id]/revisions`** — returns revision list for the undo panel.

    **`POST /api/drafts/[id]/revisions/[rev]/restore`** — load `DraftRevision.htmlSnapshot` → call `renderHtmlToPng` → upload new PNG to MinIO → update `Draft.htmlContent` + `Draft.exportUrl`. Returns `{ exportUrl }`. No editing transaction required.

    FR-33, FR-33a–FR-33e, AC-6, AC-7.

- [ ] `T22` — End-to-end test pass + acceptance criteria sign-off
  - Files: `tests/e2e/` (Playwright)
  - Estimate: large
  - Depends: T20, T21, T19
  - Notes: Walk each AC (AC-1 through AC-12, AC-5b, AC-5c, FR-32–FR-33e) with Playwright against a staging environment. Test both design paths. Confirm no secrets in browser network tab (AC-12). Confirm scheduled post fires after mock time advance. Document any ACs that require manual verification. Additional test suites: (a) **provider-registration.test.ts** — register provider with known key prefix (auto-detect), register with unknown prefix (manual name), invalid key fails validation, key prefix shown in UI, full key never in network response; (b) **agui-refinement.test.ts** — instruction applied via Claude design agent, revision created, undo restores prior state, brand kit conflict returns warning without applying edit, "override" forces apply.

- [ ] `T27` — Prisma migration: DraftRevision + AvailableProvider + BrandKit schema update
  - Files: `prisma/schema.prisma`, `prisma/migrations/`
  - Estimate: small
  - Depends: T03
  - Notes: Apply the following schema changes and run `prisma migrate dev`. Must be complete before T21 backend work begins.
    - `Draft.htmlContent String? @db.Text` — added; stores current HTML design state
    - `DraftRevision.htmlSnapshot String @db.Text` — renamed from `elementTreeSnapshot`; stores HTML at that revision
    - `DraftRevision.exportUrl String?` — added; pre-signed PNG URL for that revision
    - `BrandKit.colors Json?` — added; array of brand hex color strings
    - `BrandKit.fonts Json?` — added; array of `{ name, url }` objects
    - `BrandKit.logoUrl String?` — added; MinIO URL of the brand logo
    - `BrandKit.canvaBrandKitId` — **removed**
    - `BrandKit.source` — **removed**
    - `BrandKit.artifactFolder` — **removed**
    - `BrandKitTemplate.htmlTemplate String @db.Text` — added; HTML/CSS template string
    - `BrandKitTemplate.canvaTemplateId` — **removed**
    - `BrandKitSource` enum — **removed**
    - `Brief.briefImages Json?` — added; Path B only — `{ url: string, intent: "embed" | "reference" }[]`; replaces flat `referenceImageUrls String[]`
    - `Brief.referenceImageUrls` — **removed** (replaced by `briefImages`)
    - `Brief.referenceTemplateId String?` — added; Path B only — FK → BrandKitTemplate (style inspiration reference)
    - `BrandKitTemplate.referencedByBriefs` — back-relation for the above FK

- [ ] `T28` — bistec-studio MCP server (admin + generation tools)
  - Files: `src/mcp/server.ts`, `src/mcp/tools/brandkit.ts`, `src/mcp/tools/generate.ts`, `src/mcp/tools/publish.ts`, `src/mcp/auth.ts`
  - Estimate: medium
  - Depends: T26, T14, T17
  - Notes: Exposes bistec-studio as an MCP server so Claude (or any MCP-compatible model) can call it from the terminal or from an agentic pipeline. Primary v1 use case: admin uses Claude in the terminal to set up brand kits (e.g. read brand data from an external source, write it into bistec-studio) without touching the UI. Secondary: agentic workflows (generate + publish a post without a human in the brief UI).
    **Admin tools** (require admin API key — gated in `src/mcp/auth.ts`):
    - `create_brand_kit(name, colors, fonts, logoUrl)` → `{ brandKitId }` — creates BrandKit row
    - `set_brand_kit_prompt(brandKitId, content)` → `{ promptId }` — adds a new active BrandKitPrompt version
    - `upload_brand_template(brandKitId, name, htmlTemplate)` → `{ templateId }` — creates BrandKitTemplate row
    **Read tools** (any authenticated caller):
    - `list_brand_kits()` → `{ kits }` — returns all active (non-deleted) BrandKit rows with names and IDs
    - `get_brand_kit(id)` → `{ kit, templates, activePrompt }` — full kit detail including linked templates
    **Generation tools** (any authenticated caller):
    - `generate_post(brief)` → `{ draftId, exportUrl, htmlContent }` — runs the full generation pipeline (copy + design agent + Puppeteer render)
    - `get_draft(id)` → `{ copyText, imageUrl, exportUrl, status }` — retrieve a draft by ID
    - `publish_post(draftId, channel)` → `{ platformId }` — publish an exported draft to a social channel
    Implementation: `src/mcp/server.ts` uses the `@modelcontextprotocol/sdk` server package. Tool handlers call the same service layer as the API routes — no duplicated logic. Auth: `src/mcp/auth.ts` validates a per-request API key (stored in `AvailableProvider`-style pattern or a dedicated admin token env var) and checks admin role for gated tools.

- [ ] `T29` — bistec-studio ACP server
  - Files: `src/acp/server.ts`, `src/acp/agent.ts`
  - Estimate: small
  - Depends: T28
  - Notes: Exposes bistec-studio as a peer agent using the Agent Communication Protocol (BeeAI/IBM). ACP is an additive adapter over the same tool logic already implemented in T28 (MCP server) — the incremental work is wiring the ACP server layer and registering the agent manifest. Enables orchestration pipelines where bistec-studio is called by another agent rather than directly by a model (e.g. an event management agent triggers post generation and publishing as part of a larger workflow). Implementation: `@beaai/acp-sdk` server package; agent manifest describes the `generate_post` and `publish_post` capabilities. Auth: same API key pattern as the MCP server.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed

**Task format:**
```
- [ ] `T<n>` — <title>
  - Files: <files to create/modify>
  - Estimate: small | medium | large
  - Depends: <task ids>
  - Notes: <context>
```
