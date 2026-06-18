# bistec-studio Prototype — Page Structure Reference

> Structural outline of all prototype screens. Excludes design guidelines.
> Use this as the reference when building the real application.

---

## Navigation

Persistent sidebar navigation linking to:
- Dashboard (`/`)
- Library (`/library`)
- Campaigns (`/campaigns`)
- Projects (`/projects`)
- Settings (`/settings`)

Each page uses a shared `Header` component that renders a breadcrumb trail.

---

## 1. Dashboard — `/`

**Purpose:** Overview of activity and quick entry points.

### KPI Row (4 cards)
- Published This Month
- Scheduled
- Drafts In Progress
- Active Campaigns

### Two-column layout

**Left — Recent Posts table**
- Columns: thumbnail image, topic, campaign name, channel icon, status badge, date
- Each row is clickable → navigates to `/draft/[draftId]`

**Right column (stacked)**
1. Quick Start CTA — "Create New Post" button → navigates to `/brief`
2. Scheduled Posts list — upcoming scheduled posts with date/time
3. Activity Feed — recent actions (post published, draft created, etc.)

---

## 2. Brief Wizard — `/brief`

**Purpose:** Multi-step form for creating a new post brief.

### Step 1 — Content
- Campaign selector dropdown
  - On select: auto-populates Brand Kit and Tone fields
- Topic text input
- Description textarea
- Goal / CTA text input
- Tone grid — 8 tone options as selectable chips

### Step 2 — Design & Delivery
- Channel toggles: Instagram, LinkedIn (multi-select)
- Design Mode toggle: Template (Path A) | Generate (Path B)
- **Path A:**
  - Template picker — grid of Canva brand templates from the selected brand kit
  - Additional Image upload
- **Path B:**
  - Informational note (no template picker — Canva handles brand application)
  - Reference Images multi-upload
- Copy model selector (dropdown)
- Image model selector
  - Disabled for Path B with label "GPT orchestrator decides"

### Step 3 — Review
- Summary table of all selections from steps 1 and 2
- "Generate Post" button
  - Simulates 2s delay
  - On complete → navigates to `/draft/draft-001?designMode=TEMPLATE|GENERATE`

---

## 3. Draft Refinement — `/draft/[id]`

**Purpose:** Review, refine, export, and publish a generated draft.

### Status chip (top)
States: `IN_PROGRESS` | `EXPORTED` | `PUBLISHED` | `FAILED`

### Two-column layout

**Left column**
- Copy editor — editable textarea with the generated copy; has a "Regenerate" button (Path A and B)
- Channel selector chips showing which channels the draft targets
- Design mode label (Path A or Path B)
- Publish history — list of prior publish attempts

**Right column**
- Image preview panel
  - "Regenerate" button (Path A only; hidden for Path B)
- Canva design card
  - Path A: template selector buttons (swap template)
  - Path B: design label only
- Brief summary card — read-only display of brief inputs

### Export flow (button visible when `IN_PROGRESS`)
- **Path A simulation (4 steps):**
  1. Fetch element tree
  2. Claude resolving elements
  3. Applying edits
  4. Exporting
- **Path B simulation:** single delay → export complete
- On export complete: status → `EXPORTED`; "Re-export" replaces export button

### Post-export actions
- "Publish Now" button → opens Publish modal
- "Schedule" button → opens Schedule modal

### Publish modal
- Channel checkbox list
- Confirm button → simulated publish → status → `PUBLISHED`

### Schedule modal
- Channel checkboxes
- Date input
- Time input
- Confirm button → simulated schedule → status → `SCHEDULED`

### Toasts
- Shown for all async actions (regenerate, export, publish, schedule)

---

## 4. Library — `/library`

**Purpose:** Browse and filter all posts.

### Layout
- Desktop: two-column (sidebar filter + content grid)
- Mobile: horizontal pill strip replaces sidebar

### Filter sidebar
- All Posts
- Projects list (expandable; each project links to its campaigns)
- Uncategorized

### Posts grid (responsive: 1 / 2 / 3 columns)
Each post card shows:
- Thumbnail image
- Failed error banner (if status = FAILED)
- Channel icon (Instagram / LinkedIn)
- Status badge
- Topic text
- Campaign name
- Date

Clicking a card → navigates to `/draft/[draftId]`

---

## 5. Projects List — `/projects`

**Purpose:** Manage top-level project containers.

### Header row
- Page title + description
- "New Project" button → opens New Project modal

### Tabs
- Active (`n`)
- Deleted (`n`)

### Projects grid (1 / 2 / 3 columns)
Each card shows:
- Project name
- Default brand kit badge
- Default tone (if set)
- Campaign count + post count
- Delete button (active tab) / Recover button (deleted tab)

Active card → navigates to `/projects/[id]`
Deleted card → not navigable (recover only)

### New Project modal
Fields:
- Project Name (required)
- Default Brand Kit (dropdown)
- Default Tone (text input)

Actions: Cancel | Create Project

---

## 6. Project Detail — `/projects/[id]`

**Purpose:** View a project and its campaigns.

### Project header card
- Project name
- Default brand kit badge
- Default tone
- Campaign count + post count (stats)

### Campaigns section
- Section label "Campaigns"
- List of campaign rows (each clickable → `/campaigns/[id]`)
  - Campaign name
  - Brand kit (own or "Inherited kit")
  - Tone
  - Post count
  - Up to 3 latest post chips per campaign (channel icon + topic + status badge; clickable → `/draft/[draftId]`)

---

## 7. Campaigns List — `/campaigns`

**Purpose:** Manage campaigns (standalone or within projects).

### Header row
- Page title + description
- "New Campaign" button → opens New Campaign modal

### Tabs
- Active (`n`)
- Deleted (`n`)

### Project filter strip (horizontal scroll)
- "All Campaigns" pill
- One pill per active project

### Campaigns grid (1 / 2 / 3 columns)
Each card shows:
- Campaign name
- Project membership badges (or "Standalone" if none)
- Brand kit badge (own or "Inherited kit")
- Default tone (if set)
- Post count + draft count
- Delete / Recover button

Active card → navigates to `/campaigns/[id]`

### New Campaign modal
Fields:
- Campaign Name (required)
- Assign to Projects (multi-checkbox list of active projects)
- Brand Kit Override (dropdown; blank = "Inherit from project")
- Default Tone Override (text; blank = inherit)

Actions: Cancel | Create Campaign

---

## 8. Campaign Detail — `/campaigns/[id]`

**Purpose:** View all posts and in-progress drafts within a campaign.

### Campaign header card
- Campaign name
- Parent project links (clickable → `/projects/[id]`; "Standalone campaign" if none)
- Brand kit badge
- Default tone
- Post count + draft count (stats)

### Posts section
- Section label "Posts" + "New Post" button → navigates to `/brief`
- Grid of post cards (1 / 2 / 3 columns)
  - Thumbnail
  - Channel icon + label
  - Status badge
  - Topic
  - Date (published / scheduled / created)
  - Clicking → `/draft/[draftId]`
- Empty state if no posts

### In-Progress Drafts section (shown only when drafts exist with status IN_PROGRESS or EXPORTED)
- Section label "In-Progress Drafts"
- List rows: clock icon + topic + tone · channels + status badge (Exported / In Progress)
- Clicking → `/draft/[draftId]`

---

## 9. Settings — `/settings`

**Purpose:** Admin-only configuration for brand kits and AI providers.

**Access:** Admin role only.

### Two-tab layout
- Brand Kits tab
- AI Providers tab

---

### Brand Kits tab

Accordion list of brand kits (one row per kit).

**Kit row header (collapsed)**
- Kit name
- Source badge: `BACKEND` | `CANVA` | `HYBRID`
- Default badge (if `isDefault = true`)
- Canva brand kit ID (shown in monospace)
- Edit button (pencil) → opens Edit Brand Kit modal
- Expand/collapse chevron

**Kit row body (expanded) — three sub-sections:**

1. **Brand Voice Prompt**
   - "Add Version" button → inline textarea → Save / Cancel
   - List of prompt versions: version number, Active/Inactive badge, date, content preview (80 chars)
   - Inactive versions have a "Roll back" button

2. **Artifacts**
   - "Upload Artifact" button → adds a placeholder row
   - List of artifact rows: emoji icon, name, type badge (LOGO / FONT / COLOR / REFERENCE_IMAGE / EXAMPLE_POST / OTHER), "Feed AI" toggle (enabled = green, disabled = grey)

3. **Brand Templates** (visible when source is CANVA or HYBRID)
   - "Manage Templates" button → opens Edit Brand Kit modal (template selection step)
   - List of linked templates: layout icon, name, Canva template ID (monospace), background image prompt (if set)

**"Add Brand Kit" button** (bottom of list) → opens Add Brand Kit modal

#### Add Brand Kit modal
Fields:
- Name (required)
- Source selector: `BACKEND` | `CANVA` | `HYBRID`
- (If CANVA or HYBRID) Canva Brand Kit selector
  - Fetches kit list from Canva (`list-brand-kits`) with loading state
  - Radio list of Canva brand kits (name, description, ID) + "None — backend only" option
- (If a Canva kit is selected) Brand Templates multi-selector
  - Fetches templates from Canva (`search-brand-templates`) with loading state
  - Checkbox list; each selected template reveals a "Background image prompt" textarea (optional; overrides brief)

Actions: Cancel | Add Kit

#### Edit Brand Kit modal
Same fields as Add, pre-populated. Saves in-place.

Actions: Cancel | Save Changes

---

### AI Providers tab

Two sections: **Copy Generation** and **Image Generation**.

Each section:
- Section header with provider count
- "Add Provider" button → opens Add Provider modal (slot pre-set)
- Provider table
  - Columns: Provider (label + provider key), Status (Enabled/Disabled toggle), Default (star toggle), Actions (delete)
  - Empty state row if no providers

#### Add Provider modal
Fields:
- Provider Key (text, monospace — internal identifier, e.g. `anthropic-claude-3`)
- Label (display name, e.g. `Claude 3 Opus`)
- Slot toggle: `COPY` | `IMAGE`

> **Note:** In the real build, the "Provider Key" field is replaced by an API Key field. The server auto-detects the provider from the key prefix (`sk-ant-` → Anthropic, `sk-` → OpenAI). If unrecognized, admin manually specifies name. Key is validated before save and stored encrypted. Only the key prefix is shown after registration.

Actions: Cancel | Add Provider

---

## Data model summary (from prototype mock)

| Entity | Key fields |
|---|---|
| `BrandKit` | `id`, `name`, `source` (BACKEND/CANVA/HYBRID), `canvaBrandKitId`, `isDefault`, `isDeleted`, `prompts[]`, `artifacts[]` |
| `Project` | `id`, `name`, `defaultBrandKitId`, `defaultTone`, `campaignCount`, `postCount`, `isDeleted` |
| `Campaign` | `id`, `name`, `projectIds[]`, `brandKitId`, `defaultTone`, `postCount`, `draftCount`, `isDeleted` |
| `Draft` | `id`, `campaignId`, `topic`, `channels[]`, `tone`, `designMode`, `copyText`, `imageUrl`, `canvaDesignId`, `status` |
| `Post` | `id`, `draftId`, `campaignId`, `channel`, `topic`, `status`, `exportUrl`, `publishedAt`, `scheduledAt` |
| `AvailableProvider` | `id`, `slot` (COPY/IMAGE), `providerKey`, `label`, `isEnabled`, `isDefault` |
| `CanvaTemplate` | `id`, `name`, `imagePrompt?` |

**Brand kit precedence:** Campaign brand kit → Project default → system default (`BrandKit.isDefault = true`)

**Design mode (Draft):** `TEMPLATE` (Path A) or `GENERATE` (Path B)

**Post statuses:** `IN_PROGRESS` | `EXPORTED` | `SCHEDULED` | `PUBLISHED` | `FAILED`
