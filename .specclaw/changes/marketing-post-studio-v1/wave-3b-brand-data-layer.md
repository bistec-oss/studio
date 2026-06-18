# Wave 3b — Brand Data Layer + Project/Campaign API

**Change:** marketing-post-studio-v1
**Wave:** 3b of 6
**Tasks:** T26, T23, T24
**Estimate:** 2–3 days
**Prerequisite:** Wave 1 complete (T01, T02, T03, T04, T25).

## Objective

Build the admin-facing brand kit management (CRUD + color palette + font management + logo upload + HTML template management + prompt versioning + artifact management) and the project/campaign organization layer (API routes + UI screens). These are the two "data foundation" surfaces that run in parallel with Wave 3.

---

## Tasks

### T26 — BrandKit management (admin)

- **Files:** `src/app/settings/page.tsx`, `src/app/api/admin/brandkits/route.ts`, `src/app/api/admin/brandkits/[id]/route.ts`, `src/app/api/admin/brandkits/[id]/templates/route.ts`, `src/app/api/admin/brandkits/[id]/templates/[tid]/route.ts`, `src/app/api/admin/brandkits/[id]/prompts/route.ts`, `src/app/api/admin/brandkits/[id]/prompts/generate/route.ts`, `src/app/api/admin/brandkits/[id]/prompts/improve/route.ts`, `src/app/api/admin/brandkits/[id]/artifacts/route.ts`
- **Estimate:** large
- **Depends:** T03, T09, T10, T25
- **FR references:** FR-25, FR-25b, FR-25c, FR-26, FR-26b, FR-26b-edit, FR-26c

#### UI flows

**Add Brand Kit modal** — triggered by "Add Kit" button in Settings.
1. Name field
2. **Color palette input** — admin enters hex values (e.g. `#1A2B3C`); stored as an array in `BrandKit.colors Json?`
3. **Font management** — admin uploads font files (TTF/WOFF2); each uploaded to MinIO `brandkits` bucket; stored as `{ name, url }[]` in `BrandKit.fonts Json?`
4. **Logo upload** — admin uploads a logo image; uploaded to MinIO `brandkits` bucket; URL stored in `BrandKit.logoUrl String?`
5. **HTML template management** — admin pastes or uploads an HTML/CSS template string; stored in `BrandKitTemplate.htmlTemplate @db.Text`

**Edit Brand Kit modal** — pencil button on each kit card; separate from prompt versioning and artifact management.
- Pre-populated with all existing values
- Calls `PATCH /api/admin/brandkits/[id]` on save
- Color palette, fonts, logo, and HTML templates are all editable
- Template list seeded from existing `BrandKitTemplate` rows

**Kit card (expanded)**
- Shows name, color swatches, font list, logo thumbnail
- Brand Templates section: lists linked HTML templates
- Brand Voice Prompt section: shows active prompt version; Add / version history
- Artifacts section: uploaded files (reference imagery, etc.) with feedToAI toggle

#### API routes

| Method | Route | Action |
|---|---|---|
| GET | `/api/admin/brandkits` | list all |
| POST | `/api/admin/brandkits` | create |
| GET | `/api/admin/brandkits/[id]` | get one |
| PATCH | `/api/admin/brandkits/[id]` | edit name / colors / fonts / logoUrl |
| DELETE | `/api/admin/brandkits/[id]` | soft delete |
| GET | `/api/admin/brandkits/[id]/templates` | list linked HTML templates |
| POST | `/api/admin/brandkits/[id]/templates` | link templates (replaces all) |
| PATCH | `/api/admin/brandkits/[id]/templates/[tid]` | update htmlTemplate or name |
| POST | `/api/admin/brandkits/[id]/prompts` | add new prompt version |
| POST | `/api/admin/brandkits/[id]/prompts/generate` | Claude-generated prompt (empty state) |
| POST | `/api/admin/brandkits/[id]/prompts/improve` | Claude-improved prompt (existing prompt) |
| POST | `/api/admin/brandkits/[id]/artifacts` | upload artifact to MinIO |
| PATCH | `/api/admin/brandkits/[id]/artifacts/[aid]` | toggle feedToAI |
| DELETE | `/api/admin/brandkits/[id]/artifacts/[aid]` | remove artifact |

#### AI-assisted brand voice prompt (FR-26c)

Both routes call Claude via Anthropic SDK (`claude-sonnet-4-6`).

- **Generate** (`/prompts/generate`): Called when no existing prompt — input is brand name, color palette, any existing artifacts (names + feedToAI=true ones only). Returns a draft prompt the admin reviews before saving.
- **Improve** (`/prompts/improve`): Called with the current active prompt as input. Returns an improved version. Admin reviews and saves as a new version.

Neither route auto-saves — admin explicitly clicks "Save as new version" after reviewing.

#### Prompt versioning

Each `BrandKitPrompt` row has a version number and `isActive` flag. Promoting a version sets `isActive=true` on that row and `isActive=false` on all others for that kit. The generation pipeline always reads the row with `isActive=true`.

---

### T23 — Project & Campaign API routes

- **Files:** `src/app/api/projects/route.ts`, `src/app/api/projects/[id]/route.ts`, `src/app/api/campaigns/route.ts`, `src/app/api/campaigns/[id]/route.ts`
- **Estimate:** small
- **Depends:** T03
- **Notes:** Standard CRUD routes for projects and campaigns. Both support soft delete (`isDeleted`, `deletedAt`). Campaign overrides `brandKitId` if set — brief resolution reads campaign's brandKitId first, falls back to project default, then system default.

---

### T24 — Projects & Campaigns UI

- **Files:** `src/app/(app)/projects/page.tsx`, `src/app/(app)/projects/[id]/page.tsx`, `src/app/(app)/campaigns/page.tsx`, `src/app/(app)/campaigns/[id]/page.tsx`
- **Estimate:** medium
- **Depends:** T23, T25
- **Notes:** Basic CRUD UI using GlassPanel + GlassInput components from T25. Both entity types show: name, linked brand kit (badge), draft count. Campaign detail page shows briefs created under it. Project detail shows campaigns and any ungrouped briefs. Uses dark/light theme from T25.

---

## Parallelism within Wave 3b

T26, T23, and T24 share only the T03 (schema) dependency. T23 and T24 form a sequential pair; T26 is fully independent of them. T26 depends on T09 (the HTML renderer is needed to validate template rendering) and T10 (artifact upload to MinIO).

```
T03 ──┬── T26 (BrandKit management)
      └── T23 (Project/Campaign routes)
               └── T24 (Projects/Campaigns UI)
T09 ───── T26  (HTML template management — renderer available for preview)
T10 ───── T26  (artifact upload, font upload, logo upload)
T25 ─────────── T24
```

Wave 3 (T09, T10) and Wave 3b (T26, T23, T24) run concurrently with each other.

---

## Wave 3b Complete When

- [ ] Admin can add a brand kit with color palette, font files, logo, and HTML template
- [ ] Admin can edit an existing kit — all fields pre-populated, HTML templates editable
- [ ] HTML template saved in `BrandKitTemplate.htmlTemplate` and retrievable via API
- [ ] Brand colors stored in `BrandKit.colors`, fonts in `BrandKit.fonts`, logo in `BrandKit.logoUrl`
- [ ] Linked templates appear on the kit card
- [ ] Template picker in brief wizard shows linked HTML templates for the selected brand kit
- [ ] Brand voice prompt versioning: new version saves, active version is promoted explicitly
- [ ] AI-assisted generate and improve return draft prompts — not auto-saved
- [ ] Artifacts upload to MinIO, feedToAI toggle persists
- [ ] Projects and campaigns create / edit / soft-delete
- [ ] Campaign with brandKitId override resolves correctly in the brief resolution chain
