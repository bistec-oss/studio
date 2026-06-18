# Wave 4 — AI Generation Pipeline

**Change:** marketing-post-studio-v1
**Wave:** 4 of 6
**Tasks:** T11, T12, T13, T14, T15
**Estimate:** 3–4 days
**Prerequisite:** Wave 2 (T05–T08) + Wave 3 (T09, T10) + Wave 3b partial (T26 schema ready, T03).

## Objective

Build the brief wizard UI and the full AI generation backend — copy, image, and two distinct design paths (Path A: Claude fills a preset HTML template; Path B: Claude design agent generates HTML from scratch). The export route closes the loop so a draft becomes a downloadable/publishable asset.

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
  - Path B: reference image upload slots (up to 3 `referenceImageUrls`) — passed to the Claude design agent as context for freeform generation
  - Additional image upload (Path A optional): uploads to MinIO → stored as `Brief.additionalImageUrl` — passed into the HTML template by the Claude design agent

  **Step 3 — Channels & Providers**
  - Channel multi-select: Instagram, LinkedIn
  - Copy provider selector (shows only `AvailableProvider` rows with `isEnabled=true`)
  - Image provider selector is **hidden by default** — the system default image provider is used automatically when Claude calls `generateImage`. An optional "Advanced" disclosure exposes the selector for users who want to override the default.

  Submit → calls `POST /api/briefs` → redirects to draft view.

---

### T12 — Copy generation route + image tool handler

- **Files:** `src/app/api/generate/copy/route.ts`, `src/app/api/generate/image/route.ts`
- **Estimate:** small
- **Depends:** T06, T07, T08 (provider registry)
- **FR references:** FR-8, FR-9, EC-2

  **`POST /api/generate/copy`** — called by the assembly pipeline:
  - Reads brief record + brand kit's active `BrandKitPrompt`
  - Calls `registry.getCopyProvider(brief.copyProviderKey)` → `generateCopy(brief)`
  - Returns `{ copyText: string }`

  **`POST /api/generate/image`** — called internally by the `generateImage` agent tool, not the pipeline orchestrator:
  - Accepts `{ briefId, prompt? }` — `prompt` is the image prompt Claude determined at runtime (derived from the brief)
  - Calls `registry.getImageProvider(brief.imageProviderKey ?? systemDefault)` → `generateImage(brief, prompt?)`
  - Uploads result buffer to MinIO (`MINIO_BUCKET_IMAGES`)
  - Returns `{ imageUrl: string }` (pre-signed URL, 7-day expiry)
  - On `ModerationError`: returns 422 with `{ code: 'MODERATION', message }` (EC-2)

---

### T13 — Path A assembly route (preset template)

- **Files:** `src/app/api/generate/assemble-a/route.ts`
- **Estimate:** medium
- **Depends:** T09, T12
- **FR references:** FR-14 through FR-17

  **`POST /api/generate/assemble-a`** — the Path A pipeline in full:

  1. Load brief + resolved `BrandKitTemplate` (`htmlTemplate`) + brand kit (`colors`, `fonts`, `logoUrl`, active `BrandKitPrompt`).
  2. Call copy route → get `copyText`.
  3. Launch `runDesignAgent` in **template-fill mode**: system prompt instructs Claude to fill the provided HTML template with the given content, using the brand's colors and fonts.
     - Tools available: `generateImage`, `renderHtml`, `getBrandKitContext`
     - Claude receives: `template.htmlTemplate` + `copyText` + `brief.additionalImageUrl?` + brand kit context
     - Claude decides whether to call `generateImage` (for raster imagery) or use CSS/SVG backgrounds
  4. Claude fills the template and calls `renderHtml(html, 1080, 1080)` → PNG uploaded to MinIO.
  5. Create `Draft` row: `{ copyText, imageUrl? (set only if Claude called generateImage), htmlContent: filledHtml, templateId, exportUrl, status: EXPORTED }`.
  6. Return `{ draftId, exportUrl }`.

  On agent error: return 422 with `{ code: 'AGENT_ERROR', message }` — surface to user as a recoverable error.

---

### T14 — Path B: Claude HTML design agent orchestrator

- **Files:** `src/app/api/generate/assemble-b/route.ts`, `src/providers/implementations/orchestrator/claude-html.ts`
- **Estimate:** large
- **Depends:** T09, T12, T08, T26
- **FR references:** FR-18 through FR-21

  **`POST /api/generate/assemble-b`** — Path B pipeline:

  1. Resolve brand kit → get `colors`, `fonts`, `logoUrl`, active voice prompt, feed-to-AI artifact URLs.
  2. Launch `runDesignAgent` in **freeform-generation mode**: system prompt instructs Claude to design a complete HTML/CSS post from scratch using the brand guidelines.
     - Include `referenceImageUrls[]` from the brief as context images for Claude
     - Tools available: `generateImage`, `renderHtml`, `getBrandKitContext`
  3. Claude generates HTML from scratch, calls `generateImage` if raster imagery is needed (Claude decides), then calls `renderHtml` to produce the final PNG.
  4. Create `Draft` row: `{ copyText, imageUrl? (from any generateImage tool call, null if CSS/SVG used instead), htmlContent, exportUrl, status: EXPORTED }`.
  5. Return `{ draftId, exportUrl }`.

  Hard limit: 15 tool calls (EC-12). On tool error: agent halted, error returned to caller with brief record preserved.

  `claude-html.ts` implements the `DesignOrchestrator` interface: `orchestrate(brief, brandKitId): Promise<{ exportUrl: string, htmlContent: string }>`.

---

### T15 — Export route

- **Files:** `src/app/api/generate/export/route.ts`
- **Estimate:** small
- **Depends:** T09, T10
- **FR references:** FR-22

  **`POST /api/generate/export`** `{ draftId }`

  1. Load `Draft` row.
  2. If `Draft.exportUrl` is already set (assembly sets it), return it immediately.
  3. Otherwise: load `Draft.htmlContent` → call `renderHtmlToPng(htmlContent, 1080, 1080)` → upload buffer to MinIO (`MINIO_BUCKET_EXPORTS`) with a stable key.
  4. Update `Draft.exportUrl` + `Draft.status = EXPORTED`.
  5. Return `{ exportUrl }` (pre-signed, permanent).

  This is a lightweight re-render path for cases where the draft needs re-export after copy edits without re-running the full agent.

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
- Swap template (Path A) → re-runs T13 with different template
- Issue AGUI instruction → Claude updates HTML (may call `generateImage` if imagery change requested) → Puppeteer re-renders
- Re-export after edits → calls T15 again (renders `Draft.htmlContent` via Puppeteer)

---

## Wave 4 Complete When

- [ ] Brief wizard submits and creates a `Brief` row in the database
- [ ] Path A: template-based draft generates copy and launches Claude design agent in template-fill mode
- [ ] Path A: `Draft.htmlContent` is non-null after assembly
- [ ] Path A: `Draft.exportUrl` is set and PNG renders at correct dimensions (1080×1080 logical)
- [ ] Path A: brand colors and fonts from `BrandKit` are visible in the generated HTML
- [ ] Path A: agent error is surfaced as a 422 with a descriptive message
- [ ] Path B: Claude design agent completes freeform HTML generation (`htmlContent` non-null)
- [ ] Path B: `exportUrl` set and PNG renders correctly
- [ ] Agent `generateImage` tool call: when Claude calls it, result is uploaded to MinIO and URL embedded in HTML
- [ ] `Draft.imageUrl` is null when Claude uses CSS/SVG; non-null when Claude calls `generateImage`
- [ ] Export route produces a stable MinIO URL and sets `Draft.status = EXPORTED`
- [ ] `renderHtmlToPng` produces PNG at correct dimensions for both 1:1 and other aspect ratios
- [ ] `ModerationError` on `generateImage` tool call returns 422 with `code: 'MODERATION'`
