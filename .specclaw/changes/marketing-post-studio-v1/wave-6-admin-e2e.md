# Wave 6 — Admin Settings, Draft Refinement & End-to-End Tests

**Change:** marketing-post-studio-v1
**Wave:** 6 of 6
**Tasks:** T20, T21, T22, T27, T28, T29
**Estimate:** 3–4 days
**Prerequisite:** All prior waves complete.

## Objective

Ship the remaining admin surface (provider settings with API key registration + auto-detect, social channel token management), the draft refinement UI (copy edit, image regen, template swap, AGUI chat panel with undo), and full end-to-end test coverage that validates both generation paths, provider registration, and AGUI refinement.

---

## Tasks

### T20 — Admin provider settings UI

- **Files:** `src/app/settings/providers/page.tsx`, `src/app/api/admin/providers/route.ts`, `src/app/api/admin/providers/[id]/route.ts`, `src/app/api/admin/channels/route.ts`
- **Estimate:** medium
- **Depends:** T08 (registry), T25
- **FR references:** FR-31, FR-32, FR-32a–FR-32d, NFR-7

  **Provider registration flow** (within Settings → Providers tab):
  - Admin enters an API key into a text field and hits "Register"
  - Server inspects the key prefix: `sk-ant-` → Anthropic, `sk-` → OpenAI, known others auto-detected
  - If recognized: provider name + label auto-populated in the form for admin to confirm
  - If unrecognized: admin manually enters provider name and label — no block
  - Key validated against the provider's API server-side before saving
  - On success: provider appears in the list showing only the key prefix (e.g. `sk-ant-a•••••••`) — full key never shown again
  - Admin assigns to slot (COPY / IMAGE / both), sets enabled + default flags
  - Brief UI model selector shows registered label and provider name (e.g. "Claude 3.5 Sonnet (Anthropic)")

  **Provider list**: toggle `isEnabled` (removes from brief wizard immediately), set `isDefault`, update label, delete provider row.

  **Social channel token tab** (unchanged):
  - Instagram: paste access token + account ID → encrypted + stored → "Connected" badge
  - LinkedIn: paste access token + organization ID → encrypted + stored → "Connected" badge
  - Token values are never displayed after save — only "Connected" / "Not connected" state
  - Revoke button → clears stored token

  **`POST /api/admin/providers`** — body: `{ slot, apiKey, providerName?, label }` → validate key → encrypt → create row  
  **`PATCH /api/admin/providers/[id]`** — toggle isEnabled / isDefault / update label  
  **`DELETE /api/admin/providers/[id]`** — remove provider  
  **`POST /api/admin/channels`** — store encrypted social token  
  **`DELETE /api/admin/channels/[channel]`** — revoke token

---

### T21 — Draft refinement UI + AGUI backend

> **⚠️ MODEL PROMPT** — Stop before starting this task and ask the user:
> _"T21 (Draft refinement + AGUI backend) is the most stateful task in the build —
> brand-kit conflict/override flow, `pendingConflict` state, undo stack, and Puppeteer
> re-render on restore. Recommended: **claude-opus-4-8** with **medium effort**.
> Switch to Opus for this task? (yes / no, continue with current model)"_

- **Files:** `src/app/(app)/drafts/[id]/page.tsx`, `src/components/draft/CopyEditor.tsx`, `src/components/draft/ImagePanel.tsx`, `src/components/draft/TemplateSwapper.tsx`, `src/components/draft/RefinementPanel.tsx`, `src/app/api/drafts/[id]/refine/route.ts`, `src/app/api/drafts/[id]/revisions/route.ts`, `src/app/api/drafts/[id]/revisions/[rev]/restore/route.ts`
- **Estimate:** large
- **Depends:** T13, T14, T15, T25, T27
- **FR references:** FR-15, FR-16, FR-33, FR-33a–FR-33e

  The draft detail page — opened after generation completes or from the library.

  **Layout:** two-column on desktop: left = copy editor + AGUI panel; right = design preview (rendered PNG from `Draft.exportUrl`) + image + export controls.

  **CopyEditor** — inline textarea pre-filled with `Draft.copyText`. Edits saved via `PATCH /api/drafts/[id]` `{ copyText }`. Character count per channel (Instagram: 2200, LinkedIn: 3000).

  **ImagePanel** — shows the current rendered design preview (the exported PNG). No standalone "Regenerate image" button — image changes are made via the AGUI refinement panel (user instructs Claude to change the visual; Claude calls `generateImage` tool if raster imagery is needed). `Draft.imageUrl` is shown as an informational thumbnail only when it was set during the generation run.

  **TemplateSwapper** (Path A only) — lists `BrandKitTemplate` rows linked to the brand kit. Selecting triggers re-run of `POST /api/generate/assemble-a` with new `templateId`.

  **RefinementPanel (AGUI)** — chat-style interface below the copy editor:
  - Instruction input (text field + send button)
  - AI reply area — shows the AI's response streamed back
  - If the AI detects a brand kit conflict, a conflict card is rendered with Override / Cancel buttons — no HTML update applied until Override is clicked
  - Revision history list — each committed edit shown as a row with its instruction text and a "Restore" button
  - Restore re-renders the stored `htmlSnapshot` via Puppeteer and updates the design preview

  **Backend — `POST /api/drafts/[id]/refine`:**
  1. Load draft + brief + resolved brand kit.
  2. Launch Claude design agent with `draft.htmlContent` as current design context + the refinement instruction.
  3. System prompt instructs Claude: "here is the current HTML design, apply the requested change".
  4. Claude checks brand kit compliance (colors, fonts, voice), updates HTML accordingly, calls `renderHtml` → new PNG.
  5. If brand kit conflict: return `{ conflict: true, explanation, conflictId }` — store `Draft.pendingConflict`, no HTML update, no revision created. Client renders conflict card with Override / Cancel buttons.
  6. If Override clicked: POST `{ conflictId }` — backend loads `Draft.pendingConflict`, skips compliance check, proceeds to step 7. If Cancel clicked: client dismisses card, no request sent.
  7. On committed change: update `Draft.htmlContent` → create `DraftRevision(htmlSnapshot, exportUrl, instruction, revisionNumber)` → update `Draft.exportUrl`.
  8. Return `{ reply, revisionId }`.

  **`GET /api/drafts/[id]/revisions`** — returns revision list for the undo panel.

  **`POST /api/drafts/[id]/revisions/[rev]/restore`** — load `DraftRevision.htmlSnapshot` → call `renderHtmlToPng` → upload new PNG to MinIO → update `Draft.htmlContent` + `Draft.exportUrl`. Returns `{ exportUrl }`. No editing transaction required — the stored `htmlSnapshot` is the full source of truth for that revision.

  **Export button** — calls `POST /api/generate/export`. Shows "Re-export" if export already exists. Spinner + toast.

  **Publish button** — opens publish dialog. Admin only.

  **Status banner** — `Draft.status` with guidance ("Ready to export", "Export needed after edits", etc.)

### T27 — Prisma migration: DraftRevision + AvailableProvider + BrandKit schema update

- **Files:** `prisma/schema.prisma`, `prisma/migrations/`
- **Estimate:** small
- **Depends:** T03
- **FR references:** FR-32c, FR-33a

  Apply the following schema changes and run `prisma migrate dev`. Must be complete before T21 backend work begins.

  | Change | Detail |
  |---|---|
  | `Draft.htmlContent String? @db.Text` | Added — stores current HTML design state |
  | `DraftRevision.htmlSnapshot String @db.Text` | Renamed from `elementTreeSnapshot` — stores HTML at that revision |
  | `DraftRevision.exportUrl String?` | Added — pre-signed PNG URL for that revision |
  | `BrandKit.colors Json?` | Added — array of brand hex color strings |
  | `BrandKit.fonts Json?` | Added — array of `{ name, url }` objects (font files stored in MinIO) |
  | `BrandKit.logoUrl String?` | Added — MinIO URL of the brand logo |
  | `BrandKit.canvaBrandKitId` | **Removed** |
  | `BrandKit.source` | **Removed** |
  | `BrandKit.artifactFolder` | **Removed** |
  | `BrandKitTemplate.htmlTemplate String @db.Text` | Added — HTML/CSS template string |
  | `BrandKitTemplate.canvaTemplateId` | **Removed** |
  | `BrandKitSource` enum | **Removed** |
  | `AvailableProvider.providerName String` | Added |
  | `AvailableProvider.keyPrefix String` | Added |
  | `AvailableProvider.encryptedApiKey String` | Added |

---

### T22 — End-to-end tests

- **Files:** `tests/e2e/path-a.test.ts`, `tests/e2e/path-b.test.ts`, `tests/e2e/publish.test.ts`, `tests/e2e/brand-kit.test.ts`, `tests/e2e/provider-registration.test.ts`, `tests/e2e/agui-refinement.test.ts`
- **Estimate:** large
- **Depends:** All prior tasks
- **FR references:** all functional requirements (smoke coverage)
- **Test runner:** Playwright (recommended) or Vitest + Supertest for route-level tests

> **Note (2026-06-30, later extended):** post size is now per-brief — `Brief.aspectRatio` (SQUARE 1080×1080 | PORTRAIT 1080×1350) + `BrandKitTemplate.aspectRatio`, resolved via `src/lib/aspectRatio.ts`. Where the assertions below say "1080×1080 logical", read it as the brief's chosen size. The implemented suite adds TC-GEN-A3/A4 (portrait + ratio-mismatch) and a portrait Path B case; the Publish button opens the shared `PublishDialog`. See `docs/e2e-test-plan.md`.

  **`path-a.test.ts`**
  - Create a brand kit with a linked HTML template + brand colors/fonts
  - Submit a brief selecting Path A + that template
  - Assert: `Draft.htmlContent` non-null after assembly
  - Assert: `Draft.exportUrl` is set and the PNG renders at correct dimensions (1080×1080 logical)
  - Assert: brand colors from `BrandKit.colors` are present in the HTML content
  - Assert: export produces a downloadable PNG at the MinIO URL
  - Assert: `Draft.imageUrl` is null when Claude used CSS/SVG; non-null when Claude called `generateImage`

  **`path-b.test.ts`**
  - Submit a brief selecting Path B + 1 reference image
  - Assert: Claude design agent completed (`Draft.htmlContent` non-null)
  - Assert: `Draft.exportUrl` set and PNG renders correctly
  - Assert: draft created with status EXPORTED

  **`publish.test.ts`**
  - Immediate publish: `POST /api/posts` with `scheduledAt = null` → status = PUBLISHED
  - Scheduled publish: `POST /api/posts` with future `scheduledAt` → status = SCHEDULED → worker tick → PUBLISHED
  - FAILED post retry: mock publisher failure → status = FAILED → `POST /api/posts/[id]/publish` → PUBLISHED

  **`brand-kit.test.ts`**
  - Create kit with color palette, fonts, logo, and HTML template
  - Edit kit → HTML template updated, colors/fonts persisted
  - Brand voice prompt versioning: new version saves, active version is promoted explicitly
  - AI-assisted generate and improve return draft prompts — not auto-saved
  - Artifacts upload to MinIO, feedToAI toggle persists
  - Soft delete → kit excluded from brief picker

  **`provider-registration.test.ts`**
  - Register provider with `sk-ant-` prefix → providerName auto-populated as "Anthropic", no manual entry required
  - Register provider with `sk-` prefix → auto-populated as "OpenAI"
  - Register provider with unknown prefix → admin supplies name manually, proceeds without block
  - Invalid key → API validation fails → 422, row not created
  - Registered provider appears in brief model selector with correct label + provider name
  - Full API key never returned in any GET response — only keyPrefix shown
  - Disable provider → removed from `GET /api/providers/available` immediately

  **`agui-refinement.test.ts`**
  - Submit refinement instruction → Claude design agent applies change → `Draft.htmlContent` updated → `DraftRevision` row created with non-null `htmlSnapshot`
  - Submit instruction that violates brand kit → reply returned, `Draft.htmlContent` unchanged, no revision created
  - Click Override after conflict card → change applied, `Draft.htmlContent` updated, `Draft.pendingConflict` cleared, revision created
  - Click Cancel after conflict card → no change, `Draft.pendingConflict` cleared
  - Restore prior revision → `DraftRevision.htmlSnapshot` re-rendered via Puppeteer → `Draft.exportUrl` updated, design preview changes
  - Undo panel shows revision history in order

  **Test infrastructure:** tests run against `docker-compose.test.yml` (same services, isolated DB + MinIO). AI provider calls (copy, image, design agent) mocked via fixture implementations that return deterministic responses. Puppeteer `renderHtmlToPng` replaced with a fixture that returns a pre-built test buffer (avoids headless Chromium dependency in CI). Social publisher calls mocked similarly.

---

### T28 — bistec-studio MCP server

- **Files:** `src/mcp/server.ts`, `src/mcp/tools/brandkit.ts`, `src/mcp/tools/generate.ts`, `src/mcp/tools/publish.ts`, `src/mcp/auth.ts`
- **Estimate:** medium
- **Depends:** T26, T14, T17

Exposes bistec-studio as an MCP server so Claude (or any MCP-compatible model) can call it from the terminal or from an agentic pipeline. Primary v1 use case: an admin uses Claude in the terminal to set up brand kits without touching the UI (e.g. read brand data from an external source, write it into bistec-studio conversationally). Secondary use: agentic generation workflows.

**Admin tools** (require admin API key — gated in `src/mcp/auth.ts`):
- `create_brand_kit(name, colors, fonts, logoUrl)` → `{ brandKitId }`
- `set_brand_kit_prompt(brandKitId, content)` → `{ promptId }`
- `upload_brand_template(brandKitId, name, htmlTemplate)` → `{ templateId }`

**Read tools** (any authenticated caller):
- `list_brand_kits()` → `{ kits }`
- `get_brand_kit(id)` → `{ kit, templates, activePrompt }`

**Generation tools** (any authenticated caller):
- `generate_post(brief)` → `{ draftId, exportUrl, htmlContent }`
- `get_draft(id)` → `{ copyText, imageUrl, exportUrl, status }`
- `publish_post(draftId, channel)` → `{ platformId }`

Implementation: `@modelcontextprotocol/sdk` server package. Tool handlers call the same service layer as the REST API routes — no duplicated logic.

---

## Parallelism within Wave 6

T27 must run first (schema migration). T20, T21, and T28 can then run in parallel. T22 must come last.

```
(all waves) ── T27 (schema migration) ──┬── T20 (provider registration UI)
                                        ├── T21 (draft refinement + AGUI)
                                        ├── T28 (MCP server)
                                        └── (T20 + T21 + T28 done) ──┬── T22 (E2E tests)
                                                                      └── T29 (ACP server, depends on T28)
```

---

## Definition of Done for v1

Wave 6 completion = **v1 feature complete**. The following must all pass before the milestone is called done:

- [ ] Schema migration (T27) applies cleanly — `DraftRevision`, `htmlContent`, `htmlSnapshot`, `exportUrl`, and updated `BrandKit` fields present; `BrandKitSource` enum absent
- [ ] Provider registration: known key prefix auto-detected; unknown prefix allows manual entry; invalid key rejected before save; full key never returned in any response
- [ ] Provider settings: enable/disable/default toggle works; brief wizard immediately reflects changes
- [ ] Brief model selector shows provider name + label as registered (e.g. "Claude 3.5 Sonnet (Anthropic)")
- [ ] Social token stored encrypted; never returned in plaintext; revoke clears it
- [ ] Copy editor saves; changes reflected in re-export
- [ ] AGUI instruction requesting imagery change: Claude calls `generateImage` tool if raster imagery needed; Draft.imageUrl updated if called
- [ ] Template swap (Path A) re-runs assembly with new template; draft updated in place
- [ ] HTML content saved on Draft after both Path A and Path B generation
- [ ] Puppeteer renders PNG at correct dimensions (1080×1080 logical → 2160×2160 physical)
- [ ] AGUI instruction updates `Draft.htmlContent` and creates `DraftRevision` with non-null `htmlSnapshot`
- [ ] AGUI brand kit conflict returns conflict card (Override / Cancel buttons) with no HTML update applied; Override applies the change; Cancel dismisses with no change
- [ ] Restore re-renders `DraftRevision.htmlSnapshot` via Puppeteer and updates `Draft.exportUrl`
- [ ] Export button produces downloadable PNG at a stable MinIO URL
- [ ] All 6 E2E test suites pass in CI (mock Puppeteer buffer + mock publishers + mock AI)
- [ ] Dark/light theme tested on all screens — no unthemed surfaces
- [ ] Admin-only actions (publish, provider settings, brand kits) return 403 for editor role
- [ ] MCP server (T28): admin tools (`create_brand_kit`, `upload_brand_template`) create correct DB rows; non-admin caller receives auth error on admin tools; `generate_post` returns a valid `exportUrl`; `publish_post` delegates correctly to the publish layer
- [ ] ACP server (T29): agent manifest registered; `generate_post` and `publish_post` callable via ACP protocol; auth consistent with MCP server
