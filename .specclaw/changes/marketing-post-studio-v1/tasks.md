# Tasks: Marketing Post Studio (v1)

**Change:** marketing-post-studio-v1
**Created:** 2026-06-12
**Total Tasks:** 22

## Summary

22 tasks across 6 waves. Waves 1–3 establish the foundation (project scaffold,
data layer, provider abstraction). Waves 4–5 build the two design paths and
publishing. Wave 6 covers the admin settings and end-to-end verification.

Each wave can begin only when all tasks in the prior wave are complete.
Within a wave, tasks without inter-dependencies can run in parallel.

---

## Tasks

### Wave 1 — Project scaffold & infrastructure

- [ ] `T01` — Initialize Next.js 14 + TypeScript project
  - Files: `package.json`, `tsconfig.json`, `next.config.ts`, `.env.example`, `Dockerfile`
  - Estimate: small
  - Depends: —
  - Notes: App Router, TypeScript strict mode, Tailwind CSS. `.env.example` documents every required env var (OpenAI key, Canva MCP creds, Clerk keys, DB URL, blob storage, social API tokens).

- [ ] `T02` — Azure infrastructure setup (Bicep)
  - Files: `infra/main.bicep`, `infra/modules/` (container-app, postgres, blob, keyvault)
  - Estimate: medium
  - Depends: T01
  - Notes: Azure Container Apps (main app + scheduler job), Azure Database for PostgreSQL Flexible Server, Azure Blob Storage (two containers: `generated-images`, `exported-designs`), Azure Key Vault. Managed identity wired for Key Vault access.

- [ ] `T03` — Prisma schema + initial migration
  - Files: `prisma/schema.prisma`, `prisma/migrations/`
  - Estimate: small
  - Depends: T02
  - Notes: Full schema as defined in design.md: User, Brief, Draft, Post, BrandSystemPrompt enums. Run `prisma migrate dev` to generate migration files.

- [ ] `T04` — Clerk auth integration + role middleware
  - Files: `src/middleware.ts`, `src/app/(auth)/login/page.tsx`, `src/lib/auth.ts`
  - Estimate: small
  - Depends: T01
  - Notes: Clerk middleware protects all `/(app)/**` and `/api/**` routes. `src/lib/auth.ts` exports `requireRole('admin' | 'editor')` helper used in route handlers. Roles stored as Clerk public metadata.

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

### Wave 3 — Canva MCP client + blob storage

- [ ] `T09` — Canva MCP client with transaction guard
  - Files: `src/lib/canva/client.ts`, `src/lib/canva/types.ts`
  - Estimate: medium
  - Depends: T01
  - Notes: Typed wrapper over all Canva MCP tool calls used in the system: `listBrandKits`, `createFromTemplate`, `uploadAsset`, `getDesignContent`, `getAssets`, `withEditingTransaction` (the `try/finally` guard — see design.md), `exportDesign`. The `withEditingTransaction` method is the only way callers can open an editing session — raw start/commit/cancel are not exported.

- [ ] `T10` — Azure Blob Storage client
  - Files: `src/lib/storage/blob.ts`
  - Estimate: small
  - Depends: T02
  - Notes: Wraps `@azure/storage-blob`. Two methods: `uploadImage(buffer, container): Promise<string>` (returns permanent blob URL) and `getUrl(blobName, container): string`. Used by image generation and design export routes.

---

### Wave 4 — Core generation + design assembly API routes

- [ ] `T11` — Brief creation (DB + API route)
  - Files: `src/app/api/briefs/route.ts`, `src/app/api/providers/available/route.ts`, `src/app/(app)/brief/page.tsx`
  - Estimate: medium
  - Depends: T03, T04, T08
  - Notes: `POST /api/briefs` creates a Brief record including `copyProviderKey` and `imageProviderKey` from the user's selection. `GET /api/providers/available` returns only admin-enabled providers per slot (copy + image) — used to populate the model dropdowns in the brief UI. Dropdowns pre-select the system default (`isDefault=true`). Design mode radio (Path A / Path B). FR-5, FR-6, FR-28–FR-30, AC-13.

- [ ] `T12` — Copy + image generation API routes
  - Files: `src/app/api/generate/copy/route.ts`, `src/app/api/generate/image/route.ts`
  - Estimate: small
  - Depends: T08, T10, T11
  - Notes: Both routes are POST, auth-required, create/update a Draft record. Image route uploads gpt-image-1 output to blob storage and stores the URL. Both support regeneration (POST again on existing draftId). FR-7–FR-11, AC-4.

- [ ] `T13` — Path A: design assembly API route (preset template)
  - Files: `src/app/api/design/assemble/route.ts` (mode=template branch)
  - Estimate: medium
  - Depends: T09, T12
  - Notes: `POST /api/design/assemble` with `mode=template`. Calls `uploadAsset` → `createFromTemplate` → `withEditingTransaction([replace_text, update_fill])`. Reads element IDs from `getDesignContent` after template instantiation. Stores `canvaDesignId` on Draft. FR-12, FR-12a, FR-13, FR-14.

- [ ] `T14` — Path B: OpenAI orchestrator + design assembly
  - Files: `src/providers/implementations/orchestrator/openai-canva.ts`, `src/app/api/design/assemble/route.ts` (mode=generate branch)
  - Estimate: large
  - Depends: T09, T12, T08
  - Notes: Implements `DesignOrchestrator`. Passes brief + active `BrandSystemPrompt` + brand kit ID + Canva MCP tool schemas as OpenAI function definitions. Enforces 20-tool-call hard limit (EC-12). On any error: calls `cancelTransaction` before throwing (EC-11). Stores `canvaDesignId` on Draft. FR-18b–FR-21b.

- [ ] `T15` — Design export API route
  - Files: `src/app/api/design/export/route.ts`
  - Estimate: small
  - Depends: T09, T10, T13
  - Notes: `POST /api/design/export`. Calls `exportDesign(canvaDesignId)` → uploads to `exported-designs` blob container → stores `exportUrl` on Draft, sets status to EXPORTED. FR-17.

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

- [ ] `T18` — Scheduler worker (Azure Container Apps Job)
  - Files: `src/scheduler/worker.ts`, `infra/modules/scheduler-job.bicep`
  - Estimate: medium
  - Depends: T17
  - Notes: Runs every minute. Queries `Post WHERE status=SCHEDULED AND scheduledAt <= now()`. Sets IN_FLIGHT before publish (idempotency). Calls `instagram.publish` or `linkedin.publish`. Updates to PUBLISHED or FAILED. Catch-up on restart handles EC-7. AC-8.

- [ ] `T19` — Asset library + publish history API + UI
  - Files: `src/app/api/library/route.ts`, `src/app/(app)/library/page.tsx`
  - Estimate: medium
  - Depends: T17
  - Notes: `GET /api/library` returns user's Drafts (with exportUrl) and Posts (with status, channel, publishedAt). UI: grid of exported post thumbnails + publish history table. FR-22, FR-23, AC-11.

---

### Wave 6 — Admin settings, refinement UI, end-to-end

- [ ] `T20` — Admin: settings UI (brand prompt + provider management)
  - Files: `src/app/api/admin/prompt/route.ts`, `src/app/api/admin/providers/route.ts`, `src/app/api/admin/providers/[id]/route.ts`, `src/app/(app)/admin/settings/page.tsx`
  - Estimate: medium
  - Depends: T14, T04, T08
  - Notes: Two sections in the admin settings page. (1) Brand system prompt: GET active prompt + version history, POST new version, POST `/activate` for rollback (EC-13). (2) Provider management: GET all registered providers per slot, PATCH to enable/disable or set as default, immediately reflected in `GET /api/providers/available` for all users' brief UIs. Admin-role-gated throughout. FR-26b, FR-27b, FR-31, AC-5c, AC-14, AC-15.

- [ ] `T21` — Draft refinement UI
  - Files: `src/app/(app)/draft/[id]/page.tsx`
  - Estimate: medium
  - Depends: T13, T14, T15
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
