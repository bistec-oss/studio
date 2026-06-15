# Tasks: Marketing Post Studio (v1)

**Change:** marketing-post-studio-v1
**Created:** 2026-06-12
**Total Tasks:** 26

## Summary

26 tasks across 6 waves (plus Wave 3b). Waves 1–3 establish the foundation
(project scaffold, design system, data layer, provider abstraction, Canva + MinIO
clients). Wave 3b adds the brand kit, project, and campaign data layer (these are
referenced by the brief/generation flow). Waves 4–5 build the two design paths and
publishing. Wave 6 covers admin settings and end-to-end verification.

The frontend follows the **Frozen Light** design system
(`docs/ui-reference/DESIGN_SYSTEM.md`) — glassmorphic, dark + light themes
mandatory, self-hosted fonts/icons. T25 scaffolds it before any screen task.

Each wave can begin only when all tasks in the prior wave are complete.
Within a wave, tasks without inter-dependencies can run in parallel.

---

## Tasks

### Wave 1 — Project scaffold & infrastructure

- [ ] `T01` — Initialize Next.js 14 + TypeScript project
  - Files: `package.json`, `tsconfig.json`, `next.config.ts`, `.env.example`, `Dockerfile`
  - Estimate: small
  - Depends: —
  - Notes: App Router, TypeScript strict mode, Tailwind CSS. `.env.example` documents every required env var (OpenAI key, Canva MCP creds, Clerk keys, DB URL, MinIO endpoint/keys, social API tokens, `TOKEN_ENCRYPTION_KEY`). Husky pre-commit hook added to block accidental `.env` commits.

- [ ] `T02` — VPS infrastructure setup (Docker Compose)
  - Files: `docker-compose.yml`, `.env.example`, `.gitignore`
  - Estimate: medium
  - Depends: T01
  - Notes: `docker-compose.yml` defines four services: `app` (Next.js, port 3000), `scheduler` (same image, runs `worker.ts`), `postgres` (official PG image, named volume), `minio` (MinIO image, two named volumes for data + config, console port 9001 bound to 127.0.0.1 only). All services use `env_file: .env` — no secrets in compose file. `.env.example` documents every variable. `.gitignore` includes `.env*` except `.env.example`. Pre-commit hook (husky) blocks committing any `.env` file.

- [ ] `T03` — Prisma schema + initial migration
  - Files: `prisma/schema.prisma`, `prisma/migrations/`
  - Estimate: small
  - Depends: T02
  - Notes: Full schema as defined in design.md: User, Project, Campaign, ProjectCampaign (M2M), CampaignDraft (M2M), Brief (campaignId nullable), Draft, Post, BrandKit, BrandKitPrompt (versioned), BrandKitArtifact, AvailableProvider + enums (Role, DesignMode, DraftStatus, Channel, PostStatus, ProviderSlot, BrandKitSource, ArtifactType). Project.defaultBrandKitId and Campaign.brandKitId are FKs → BrandKit. `DATABASE_URL` points to the `postgres` Docker service. Run `prisma migrate dev` to generate migration files.

- [ ] `T04` — Clerk auth integration + role middleware
  - Files: `src/middleware.ts`, `src/app/(auth)/login/page.tsx`, `src/lib/auth.ts`
  - Estimate: small
  - Depends: T01
  - Notes: Clerk middleware protects all `/(app)/**` and `/api/**` routes. `src/lib/auth.ts` exports `requireRole('admin' | 'editor')` helper used in route handlers. Roles stored as Clerk public metadata.

- [ ] `T25` — Design system foundation (Frozen Light theme + base components)
  - Files: `tailwind.config.ts`, `src/app/globals.css`, `src/components/theme/ThemeProvider.tsx`, `src/components/theme/ThemeToggle.tsx`, `src/components/layout/AppShell.tsx`, `src/components/ui/` (Button, GlassPanel, GlassInput, Select, SegmentedToggle, StatusChip), `src/app/layout.tsx`
  - Estimate: medium
  - Depends: T01
  - Notes: Implements the design system per `docs/ui-reference/DESIGN_SYSTEM.md`. Tailwind config with light/dark color tokens + `darkMode: "class"`. Glass utility classes (`.glass`, `.glass-panel`, `.glass-input`) in globals.css. **Dark + light themes mandatory** — `ThemeProvider` follows `prefers-color-scheme` on first visit and persists manual toggle to `localStorage`; inline pre-paint script prevents FOUC. **Self-host all fonts/icons** (Inter + JetBrains Mono via `next/font`, icons via local Material Symbols subset or `lucide-react`) — no external CDN. `AppShell` provides the 64px top app bar + 256px sidebar + fluid canvas layout. Base components reused across all screen tasks. Use Frozen Light as a starting point, not a rigid spec.

---

### Wave 2 — Provider abstraction layer

- [ ] `T05` — Define provider interfaces
  - Files: `src/providers/interfaces/CopyProvider.ts`, `src/providers/interfaces/ImageProvider.ts`, `src/providers/interfaces/DesignOrchestrator.ts`
  - Estimate: small
  - Depends: T01
  - Notes: Three TypeScript interfaces. `CopyProvider.generateCopy(brief: Brief): Promise<string>`. `ImageProvider.generateImage(brief: Brief): Promise<{ url: string }>`. `DesignOrchestrator.orchestrate(brief: Brief, brandKitId: string): Promise<{ canvaDesignId: string }>`. These interfaces are the stable contract — all future AI models plug in here.

- [ ] `T06` — OpenAI copy provider implementation
  - Files: `src/providers/implementations/copy/openai.ts`
  - Estimate: small
  - Depends: T05
  - Notes: Implements `CopyProvider`. Calls OpenAI Chat Completions (GPT-4o mini). Channel-aware system prompt (Instagram caption vs LinkedIn post format per FR-8). Returns copy string.

- [ ] `T07` — OpenAI image provider implementation
  - Files: `src/providers/implementations/image/openai.ts`
  - Estimate: small
  - Depends: T05
  - Notes: Implements `ImageProvider`. Calls gpt-image-1 via OpenAI Images API. Returns image URL. Handles moderation rejection (EC-2) by throwing a typed `ModerationError`.

- [ ] `T08` — Provider registry
  - Files: `src/providers/registry.ts`
  - Estimate: small
  - Depends: T06, T07
  - Notes: Resolves the active provider for a given slot using this order: (1) providerKey passed from the Brief record (user's choice), (2) `AvailableProvider` row with `isDefault=true` for that slot, (3) env var fallback. Throws if the resolved key has no registered implementation. This is the only file that needs updating when a new model is registered.

---

### Wave 3 — Canva MCP client + MinIO storage

- [ ] `T09` — Canva MCP client with transaction guard
  - Files: `src/lib/canva/client.ts`, `src/lib/canva/types.ts`
  - Estimate: medium
  - Depends: T01
  - Notes: Typed wrapper over all Canva MCP tool calls used in the system: `listBrandKits`, `createFromTemplate`, `uploadAsset`, `getDesignContent`, `getAssets`, `withEditingTransaction` (the `try/finally` guard — see design.md), `exportDesign`. The `withEditingTransaction` method is the only way callers can open an editing session — raw start/commit/cancel are not exported.

- [ ] `T10` — MinIO storage client
  - Files: `src/lib/storage/minio.ts`
  - Estimate: small
  - Depends: T02
  - Notes: Wraps `@aws-sdk/client-s3` (MinIO is S3-compatible; only the endpoint differs). Two methods: `uploadObject(buffer, bucket, key): Promise<string>` (returns a pre-signed GET URL, 7-day expiry for `generated-images`, no-expiry for `exported-designs`) and `getPresignedUrl(bucket, key): Promise<string>`. Endpoint, access key, and secret key from env vars (`MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`). Bucket names from env vars (`MINIO_BUCKET_IMAGES`, `MINIO_BUCKET_EXPORTS`, `MINIO_BUCKET_BRANDKITS`). Creates buckets on startup if they do not exist. Used by image generation, design export, and brand kit artifact routes.

---

### Wave 3b — Brand kits, Projects & Campaigns (data layer)

- [ ] `T26` — BrandKit management (API + admin UI)
  - Files: `src/app/api/admin/brandkits/route.ts`, `src/app/api/admin/brandkits/[id]/route.ts`, `src/app/api/admin/brandkits/[id]/prompt/route.ts`, `src/app/api/admin/brandkits/[id]/artifacts/route.ts`, `src/lib/brandkit/resolve.ts`, `src/app/(app)/admin/settings/brandkits/page.tsx`
  - Estimate: large
  - Depends: T03, T04, T10, T25
  - Notes: Admin-only BrandKit CRUD. A BrandKit is hybrid (`source = CANVA | BACKEND | HYBRID`) with optional `canvaBrandKitId` and an optional MinIO artifact folder. (1) Prompt versioning: list versions, POST new version (becomes active), POST `/prompt/[v]/activate` for rollback (EC-13). (2) Artifacts: upload to MinIO `brandkits` bucket with `type` + `feedToAI` flag, list, delete. (3) Set the system default kit (`isDefault`, one per system). (4) `src/lib/brandkit/resolve.ts` exports the shared precedence resolver (campaign → project default → system default) reused by T23 and T14. Admin-role-gated throughout. FR-25b–FR-29b, AC-5c, AC-5d, AC-5e.

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

- [ ] `T11` — Brief creation (DB + API route)
  - Files: `src/app/api/briefs/route.ts`, `src/app/api/providers/available/route.ts`, `src/app/(app)/brief/page.tsx`
  - Estimate: medium
  - Depends: T03, T04, T08, T23, T25, T26
  - Notes: `POST /api/briefs` creates a Brief record including optional `campaignId`. Brief UI includes a project → campaign drill-down selector (optional — leaving blank = Uncategorized). On campaign select, calls `GET /api/campaigns/[id]/brandkit` to auto-populate the brand kit field; user is not prompted to pick brand kit again unless overriding. Tone pre-fills from campaign/project default. Model dropdowns populate from `GET /api/providers/available`. Design mode radio (Path A / Path B). FR-5, FR-5a, FR-5b, FR-6, FR-28–FR-30, AC-13, AC-16, AC-17.

- [ ] `T12` — Copy + image generation API routes
  - Files: `src/app/api/generate/copy/route.ts`, `src/app/api/generate/image/route.ts`
  - Estimate: small
  - Depends: T08, T10, T11
  - Notes: Both routes are POST, auth-required, create/update a Draft record. Image route uploads gpt-image-1 output to MinIO `generated-images` bucket and stores the pre-signed URL. Both support regeneration (POST again on existing draftId). FR-7–FR-11, AC-4.

- [ ] `T13` — Path A: design assembly API route (preset template)
  - Files: `src/app/api/design/assemble/route.ts` (mode=template branch)
  - Estimate: medium
  - Depends: T09, T12
  - Notes: `POST /api/design/assemble` with `mode=template`. Calls `uploadAsset` → `createFromTemplate` → `withEditingTransaction([replace_text, update_fill])`. Reads element IDs from `getDesignContent` after template instantiation. Stores `canvaDesignId` on Draft. FR-12, FR-12a, FR-13, FR-14.

- [ ] `T14` — Path B: OpenAI orchestrator + design assembly
  - Files: `src/providers/implementations/orchestrator/openai-canva.ts`, `src/app/api/design/assemble/route.ts` (mode=generate branch)
  - Estimate: large
  - Depends: T09, T12, T08, T26
  - Notes: Implements `DesignOrchestrator`. Resolves the BrandKit (campaign → project → system default) and passes brief + the kit's active `BrandKitPrompt` + feed-to-AI artifacts + `canvaBrandKitId` + Canva MCP tool schemas as OpenAI function definitions. Enforces 20-tool-call hard limit (EC-12). On any error: calls `cancelTransaction` before throwing (EC-11). Stores `canvaDesignId` on Draft. FR-18b–FR-21b, FR-27b.

- [ ] `T15` — Design export API route
  - Files: `src/app/api/design/export/route.ts`
  - Estimate: small
  - Depends: T09, T10, T13
  - Notes: `POST /api/design/export`. Calls `exportDesign(canvaDesignId)` → uploads to MinIO `exported-designs` bucket → stores `exportUrl` (pre-signed URL) on Draft, sets status to EXPORTED. FR-17.

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
  - Estimate: small
  - Depends: T04, T08, T25
  - Notes: Provider management section of the admin settings page (brand kit management lives in T26). GET all registered providers per slot, PATCH to enable/disable or set as default, immediately reflected in `GET /api/providers/available` for all users' brief UIs. Links to the BrandKit manager (T26). Admin-role-gated. FR-31, AC-14, AC-15.

- [ ] `T21` — Draft refinement UI
  - Files: `src/app/(app)/draft/[id]/page.tsx`
  - Estimate: medium
  - Depends: T13, T14, T15, T25
  - Notes: Shows generated copy (editable textarea), generated image (with "Regenerate" button), template selector (Path A: dropdown of brand templates; Path B: N/A), preview of assembled Canva design (thumbnail via `get-design-thumbnail`), "Export" button. No Canva editor embed — FR-16 confirmed. AC-6, AC-7.

- [ ] `T22` — End-to-end test pass + acceptance criteria sign-off
  - Files: `tests/e2e/` (Playwright)
  - Estimate: large
  - Depends: T20, T21, T19
  - Notes: Walk each AC (AC-1 through AC-12, AC-5b, AC-5c) with Playwright against a staging environment. Test both design paths. Confirm no secrets in browser network tab (AC-12). Confirm scheduled post fires after mock time advance. Document any ACs that require manual verification (e.g. actual Instagram/LinkedIn publish requires live social credentials).

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
