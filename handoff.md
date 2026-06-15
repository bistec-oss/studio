# bistec-studio — Session Handoff

**Date:** 2026-06-12
**Repo:** https://github.com/bistec-oss/designer (local: `D:\Bistec\designer`)
**Branch:** `main` — clean, all work pushed (latest commit `3356c79`)
**Specclaw change:** `marketing-post-studio-v1`

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
| Hosting | Azure Container Apps | Requested |
| Auth | Clerk (admin + editor roles) | Avoids blocking on Entra ID setup |
| Database | Azure Database for PostgreSQL + Prisma ORM | Type-safe, migration tooling, PG arrays |
| Blob storage | Azure Blob Storage | Images + exported designs |
| Secrets | Azure Key Vault | Managed identity injection |
| Scheduler | Azure Container Apps Job (cron, every minute) | Shares same Docker image as main app |
| Copy AI | OpenAI GPT (user-selectable) | Provider abstraction allows future swap |
| Image AI | OpenAI gpt-image-1 (user-selectable) | Provider abstraction allows future swap |
| Design (Path A) | Canva MCP server (MCP client in Next.js backend) | No raw REST integration needed |
| Design (Path B) | OpenAI function calling + Canva MCP tools as functions | ChatGPT+Canva plugin pattern, own backend |

---

## The two design paths

### Path A — Preset brand template
1. User writes a brief (topic, goal, tone, channels, design mode = "Use a template")
2. User selects copy model + image model from admin-curated dropdowns
3. GPT generates channel-appropriate caption/copy
4. gpt-image-1 generates post image
5. Image uploaded to Canva via `upload-asset-from-url` → Canva asset ID
6. `create-design-from-brand-template` instantiates a brand template (BTM* ID)
7. Editing transaction: `start` → `perform-editing-operations` (`replace_text` for copy,
   `update_fill` for image) → `commit`
8. `export-design` → PNG/JPG → Azure Blob Storage
9. Publish now or schedule to Instagram / LinkedIn

### Path B — AI-generated new design
1. User writes a brief (design mode = "Generate new design")
2. Backend calls **OpenAI Chat Completions with function calling**, passing:
   - The brief
   - The admin-configured brand system prompt
   - The Bistec brand kit ID
   - Canva MCP tool schemas as function definitions
3. OpenAI orchestrates the full design assembly by calling Canva MCP tools directly
   (replicates the ChatGPT + Canva plugin pattern in bistec-studio's own backend)
4. OpenAI decides whether to generate imagery (gpt-image-1) or use an existing brand asset
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

**User model selection:** At brief creation, the user picks the copy model and image model
from dropdowns. Only admin-enabled models appear. No memory between briefs — always starts
at the system default.

**Admin model management:** Admin enables/disables models per slot and sets the system
default from a settings UI. No redeploy needed.

**Adding a new model (e.g. Gemini for images):**
1. Write `src/providers/implementations/image/gemini.ts` implementing `ImageProvider`
2. Register in `src/providers/registry.ts` under key `"gemini"`
3. Admin enables it in Settings → immediately available in brief UI

The Path B orchestrator is NOT user-selectable — env-configured only.

---

## Canva MCP integration

The Next.js backend connects to Canva as an **MCP client**. No raw Canva REST integration.

**MCP tools used:**
- `list-brand-kits` — discover brand kit IDs
- `create-design-from-brand-template` — instantiate a design from a BTM* template ID
- `upload-asset-from-url` — bridge gpt-image-1 image URL → Canva asset ID
- `start-editing-transaction` / `perform-editing-operations` / `commit-editing-transaction` / `cancel-editing-transaction` — editing sessions
- `get-design-content` — read element IDs for editing operations
- `get-assets` — retrieve existing brand assets (Path B orchestrator)
- `export-design` — export PNG/JPG, returns download URL

**Important:** `generate-design-structured` is **presentations only** — NOT used here.

**NFR-11 (transaction integrity):** Every editing session uses a `withEditingTransaction`
wrapper in `src/lib/canva/client.ts` that always calls `cancel` in the `finally` block if
`commit` was never reached. Orphaned transactions are impossible by construction.

---

## Database schema (Prisma)

Key models:
- `User` — clerkId, role (ADMIN | EDITOR)
- `Brief` — topic, goal, tone, channels[], designMode (TEMPLATE | GENERATE),
  **copyProviderKey**, **imageProviderKey** (user's model choices)
- `Draft` — copyText, imageUrl (blob), canvaDesignId, templateId, exportUrl, status
- `Post` — channel (INSTAGRAM | LINKEDIN), status, scheduledAt, publishedAt, platformId, errorReason
- `BrandSystemPrompt` — content, version, isActive (versioned for rollback — EC-13)
- `AvailableProvider` — slot (COPY | IMAGE), providerKey, label, isEnabled, isDefault

---

## Specclaw files (all committed)

| File | Location | Size |
|---|---|---|
| `proposal.md` | `.specclaw/changes/marketing-post-studio-v1/` | 5 KB |
| `spec.md` | `.specclaw/changes/marketing-post-studio-v1/` | ~20 KB |
| `design.md` | `.specclaw/changes/marketing-post-studio-v1/` | ~19 KB |
| `tasks.md` | `.specclaw/changes/marketing-post-studio-v1/` | ~10 KB |

**Current specclaw phase:** plan complete → ready for `/specclaw:build marketing-post-studio-v1`

---

## Task breakdown (22 tasks, 6 waves)

| Wave | Focus | Tasks |
|---|---|---|
| 1 | Project scaffold + Azure infra | T01 Next.js init, T02 Azure Bicep, T03 Prisma schema, T04 Clerk auth |
| 2 | Provider abstraction layer | T05 Interfaces, T06 OpenAI copy, T07 OpenAI image, T08 Registry |
| 3 | Canva MCP client + blob storage | T09 Canva client (tx guard), T10 Blob storage client |
| 4 | Core generation + design assembly | T11 Brief UI + model select, T12 Copy/image routes, T13 Path A assembly, T14 Path B orchestrator, T15 Export route |
| 5 | Publishing, scheduling, library | T16 Social publishers, T17 Publish/schedule routes, T18 Scheduler worker, T19 Library UI |
| 6 | Admin settings + E2E | T20 Admin settings (prompt + providers), T21 Draft refinement UI, T22 E2E Playwright tests |

**Highest-risk item:** Instagram Graph API Meta Business app review (can take weeks).
Start the Meta Business app registration **before** Wave 1 code begins — it blocks AC-3.

---

## Open questions (for design/build phase)

0. Which OpenAI model drives Path B orchestration? (GPT-4o recommended for function calling)
1. Auth: confirm Clerk is acceptable, or is Microsoft Entra ID SSO required?
2. Database: confirm Azure Database for PostgreSQL (vs Azure SQL)
3. Confirm Azure Blob Storage for image/export storage
4. **Social API access** (highest risk): who owns obtaining Meta Business app approval
   and LinkedIn app permissions, and what is the timeline?
5. **Canva MCP production setup**: (a) how is the Canva MCP server hosted for the
   production Azure environment? (b) MCP client credentials for the Next.js backend?
   (c) what are the Bistec brand kit ID and BTM* template IDs? (d) how many brand
   templates does v1 support?
6. Scheduler: confirm Azure Container Apps Job (vs Azure Functions timer)
7. Cost/rate controls: per-user or per-period generation limits for OpenAI calls
8. Which additional AI models (beyond OpenAI) should be registered at launch for
   user-selectable copy/image generation? (e.g. Gemini, Anthropic Claude, Stability AI)

---

## What was explicitly ruled OUT of v1

- Video generation/publishing
- Custom pixel/canvas/layout editor
- Edit-in-Canva (deep link to Canva editor)
- Channels beyond Instagram + LinkedIn
- Full content calendar UI
- External/client self-serve access
- Healthcare compliance constraints (bistec-studio is not healthcare-specific)

---

## Repo notes

- Remote was originally `bistec-oss/designer` — user attempted to rename to
  `bistec-studio` during this session but lacked org admin rights on GitHub.
  The GitHub repo is still named `designer`. Local folder is still `D:\Bistec\designer`.
  To complete the rename: go to https://github.com/bistec-oss/designer/settings,
  change the repository name to `bistec-studio`, then run:
  `git remote set-url origin https://github.com/bistec-oss/bistec-studio.git`

- The D: drive showed intermittent I/O errors mid-session (fsync/"no such device").
  It recovered and was stable by the time all specclaw files were written.
  All four specclaw files verified on disk before push.
