# Wave 4 — AI Generation Pipeline

**Change:** marketing-post-studio-v1
**Wave:** 4 of 6
**Tasks:** T11, T12, T13, T14, T15
**Estimate:** 3–4 days
**Prerequisite:** Wave 2 (T05–T08) + Wave 3 (T09, T10) + Wave 3b partial (T26 schema ready, T03).

## Objective

Build the brief wizard UI and the full AI generation backend — copy, image, and two distinct design paths (Path A: preset Canva template; Path B: GPT-4o orchestrates Canva). The export route closes the loop so a draft becomes a downloadable/publishable asset.

---

## Tasks

### T11 — Brief creation wizard (UI)

- **Files:** `src/app/(app)/briefs/new/page.tsx`, `src/components/brief/`
- **Estimate:** medium
- **Depends:** T25, T26 (brand kits), T23 (campaigns)
- **FR references:** FR-1 through FR-7, FR-10 through FR-13

  Multi-step wizard form built on GlassPanel + GlassInput components.

  **Step 1 — Content**
  - Topic (text, required)
  - Description (textarea, optional)
  - Goal (enum select: awareness, engagement, conversion, hiring, announcement)
  - Tone (enum select: professional, casual, bold, empathetic — default from project/campaign or system)

  **Step 2 — Brand & Design**
  - Brand kit selector — lists all active BrandKits; shows active brand kit name as default
  - Campaign selector (optional) — overrides brand kit if campaign has one
  - Design mode toggle: Path A (Preset Template) vs Path B (AI Generated)
  - Path A: shows template picker drawn from `BrandKitTemplate` rows linked to the selected kit
  - Path B: reference image upload slots (up to 3 `referenceImageUrls`)
  - Additional image upload (Path A optional): uploads to MinIO → stored as `Brief.additionalImageUrl`

  **Step 3 — Channels & Providers**
  - Channel multi-select: Instagram, LinkedIn
  - Copy provider selector (shows only `AvailableProvider` rows with `isEnabled=true`)
  - Image provider selector (same)

  Submit → calls `POST /api/briefs` → redirects to draft view.

---

### T12 — Copy + image generation routes

- **Files:** `src/app/api/generate/copy/route.ts`, `src/app/api/generate/image/route.ts`
- **Estimate:** small
- **Depends:** T06, T07, T08 (provider registry)
- **FR references:** FR-8, FR-9, EC-2

  Both routes are called internally by the generation pipeline — not directly from the browser.

  **`POST /api/generate/copy`**
  - Reads brief record + brand kit's active `BrandKitPrompt`
  - Calls `registry.getCopyProvider(brief.copyProviderKey)` → `generateCopy(brief)`
  - Returns `{ copyText: string }`

  **`POST /api/generate/image`**
  - Reads brief record + resolved `imagePrompt` (from `BrandKitTemplate.imagePrompt` if set; else derived from `brief.topic + brief.description`)
  - Calls `registry.getImageProvider(brief.imageProviderKey)` → `generateImage(brief, imagePrompt?)`
  - Uploads result buffer to MinIO (`MINIO_BUCKET_IMAGES`)
  - Returns `{ imageUrl: string }` (pre-signed URL)
  - On `ModerationError`: returns 422 with `{ code: 'MODERATION', message }` (EC-2)

---

### T13 — Path A assembly route (preset template)

- **Files:** `src/app/api/generate/assemble-a/route.ts`
- **Estimate:** medium
- **Depends:** T09, T12
- **FR references:** FR-14 through FR-17

  **`POST /api/generate/assemble-a`** — the Path A pipeline in full:

  1. Fetch brief + resolved template (`BrandKitTemplate`) + brand kit
  2. Call copy route → get `copyText`
  3. Call image route → get `imageUrl`
  4. `canvaClient.createFromTemplate(template.canvaTemplateId)` → `designId`
  5. Upload `imageUrl` → `canvaClient.uploadAsset(imageUrl)` → `assetId`
  6. `canvaClient.getDesignContent(designId)` → `elementTree`
  7. `elementResolver.resolveEditingOperations(elementTree, { headline: copyText, backgroundImage: assetId })` → list of `EditingOperation`s
  8. `canvaClient.withEditingTransaction(designId, operations)` (transaction guard from T09)
  9. Create `Draft` row: `{ copyText, imageUrl, canvaDesignId: designId, templateId, status: PENDING_EXPORT }`
  10. Return `{ draftId }`

  On `ElementNotFoundError` from resolver: return 422 with element slot that failed — surface to user as a recoverable error ("Could not locate headline slot in template — contact admin to review layer names").

---

### T14 — Path B orchestrator (GPT-4o as Canva controller)

- **Files:** `src/app/api/generate/assemble-b/route.ts`, `src/providers/implementations/design/openai-orchestrator.ts`
- **Estimate:** large
- **Depends:** T09, T12, T08
- **FR references:** FR-18 through FR-21

  **`POST /api/generate/assemble-b`** — Path B pipeline:

  1. Fetch brief + brand kit + assets (`canvaClient.getAssets(brandKitId)`)
  2. Build function-calling system prompt:
     - Brief details (topic, description, goal, tone, channels)
     - Brand voice prompt (active `BrandKitPrompt.content`)
     - Asset catalogue (IDs and names)
     - `referenceImageUrls[]` from brief (if any)
     - All Canva MCP tools exposed as OpenAI functions
  3. Call GPT-4o with function definitions for all Canva MCP tools
  4. GPT-4o acts as orchestrator: calls functions in sequence
     - Generates design structure
     - Calls `create-design-from-brand-template` or `generate-design` as it decides
     - Calls `upload-asset-from-url` for generated images
     - Calls `get-design-content` → internally resolves element IDs (GPT-4o does this from the tree, not Claude)
     - Calls `start/perform/commit-editing-transaction` via our transaction guard
  5. When orchestrator signals done: retrieve `canvaDesignId` from function call results
  6. Create `Draft` row: `{ copyText: extractedCopy, imageUrl, canvaDesignId, status: PENDING_EXPORT }`
  7. Return `{ draftId }`

  Error handling: if GPT-4o calls `cancel-editing-transaction` or the function loop exceeds 30 turns without committing, return 422 with `{ code: 'ORCHESTRATION_FAILED' }`.

  **Note:** GPT-4o resolves element IDs itself from the element tree — Claude element resolver (T09) is Path A only. In Path B, GPT-4o's broad context window is the resolver.

---

### T15 — Export route

- **Files:** `src/app/api/generate/export/route.ts`
- **Estimate:** small
- **Depends:** T09, T10
- **FR references:** FR-22

  **`POST /api/generate/export`** `{ draftId }`

  1. Load `Draft` row → `canvaDesignId`
  2. `canvaClient.exportDesign(canvaDesignId)` → `{ downloadUrl }`
  3. Fetch the download, upload buffer to MinIO (`MINIO_BUCKET_EXPORTS`) with a stable key
  4. Update `Draft.exportUrl` + `Draft.status = READY`
  5. Return `{ exportUrl }` (pre-signed, permanent)

---

## Parallelism within Wave 4

T12 (copy + image routes) is independent of T13 and T14 — they can be built in parallel once T09 and the provider registry are ready. T15 only needs T09 and T10.

```
T09 + T08 ──┬── T13 (Path A)
             └── T14 (Path B)
T12 (routes)─── feeds T13, T14
T09 + T10 ─── T15 (export)
T11 (wizard) ─── calls T13/T14 indirectly via POST /api/briefs
```

---

## Draft refinement (handled in Wave 6/T21, listed here for context)

After generation, the draft view (T21) allows:
- Edit copy text → re-save
- Regenerate image → calls image route again
- Swap template (Path A) → re-runs T13 with different template
- Re-export after edits → calls T15 again

---

## Wave 4 Complete When

- [ ] Brief wizard submits and creates a `Brief` row in the database
- [ ] Path A: template-based draft generates copy, image, opens Canva design, fills elements, commits transaction
- [ ] Path A: `ElementNotFoundError` is surfaced as a 422 with the failing slot named
- [ ] Path B: GPT-4o orchestrator completes a design creation via Canva MCP function calls
- [ ] Image route uses `BrandKitTemplate.imagePrompt` when present (verified with + without)
- [ ] Export route produces a stable MinIO URL and sets `Draft.status = READY`
- [ ] `ModerationError` on image generation returns 422 with `code: 'MODERATION'`
