# bistec-studio — Prototype Page Outline

Reference document for all pages in the `bistec-studio-proto` Next.js prototype.
Use this as the primary UI contract when building the real system. Design/visual details are intentionally omitted — consult `docs/ui-reference/DESIGN_SYSTEM.md` for those.

---

## 1. Dashboard — `/`

**Purpose:** Landing page and at-a-glance status overview.

**KPI summary:**
- Drafts Ready (count of drafts with status `ready`)
- Posts Published (count of posts with status `published`)
- Active Campaigns (count of campaigns)
- AI Providers (count of configured providers)

**Recent Drafts panel:**
- Table of the most recent 5–10 drafts
- Columns: title, campaign, platform (Instagram / LinkedIn), path (A/B), status chip, created date
- Row click navigates to `/draft/[id]`

**Quick Actions panel:**
- "New Brief" button → `/brief/new`
- "View Library" button → `/library`
- "Manage Brand Kits" button → `/admin/brandkits`

**Activity Feed:**
- Chronological list of recent system events (draft generated, post published, provider added, etc.)
- Display only; no actions

---

## 2. New Brief Wizard — `/brief/new`

**Purpose:** Five-step guided flow from blank brief to a queued generation job.

### Step 0 — Platform & Path

**Inputs:**
- Platform: Instagram or LinkedIn (toggle/radio)
- Path type: "Path A — Use a template" or "Path B — Generate new design" (toggle/radio)

**Path A only — Template picker:**
- Grid of template cards from the resolved brand kit
- Templates are not filtered by platform — all templates apply to all platforms
- Each card shows: template name, description, preview swatch
- A template **must be selected** to proceed (Continue is disabled until one is chosen)

**Path B only — Reference picker (optional):**
- "Style reference" toggle — optionally pick a template from the brand kit as loose compositional inspiration
- Uploading reference images (embed or reference intent) is configured in Step 3

**Navigation:** Continue disabled on Path A if no template is selected.

---

### Step 1 — Campaign

**Inputs:**
- Campaign selector (dropdown or grouped list):
  - "Uncategorized" — always the first option; assigns no campaign to the draft
  - Campaigns grouped by project (project name shown as a non-selectable header)
  - Standalone campaigns (not belonging to any project) listed in a separate group
- Selecting a campaign triggers **brand kit auto-population**:
  - Resolves brand kit via precedence: Campaign kit → Project default kit → System default kit
  - Shows a read-only banner: resolved kit name + source label ("Campaign override" / "Inherited from project" / "System default")
  - User is not prompted to select a brand kit again unless they want to override
- Tone field:
  - Auto-populated from the resolved campaign/project default tone
  - User can override

**Navigation:** Continue always enabled (Uncategorized is a valid choice).

---

### Step 2 — Copy Prompt

**Inputs:**
- Topic (short text input)
- Description / AI context (textarea — speaker bios, event details, key messages)
- Goal / CTA (short text input)
- Copy AI model selector (dropdown of available Copy providers — populated from admin-configured providers)

**Navigation:** Continue enabled when topic is non-empty.

---

### Step 3 — Images

**Inputs:**
- "Upload image" button — multiple files allowed
- Each uploaded image gets an intent selector: "Embed in design" or "Style reference only"
  - "Embed" — Claude must include this image in the generated HTML layout
  - "Reference" — Claude uses it for compositional inspiration but does not embed it
- Images can be removed individually

**Path A:** Image upload section is shown but optional (additional image passed to agent for brand context).

**Navigation:** Continue always enabled (images are optional).

---

### Step 4 — Review & Generate

**Display (read-only summary):**
- Platform
- Path (A with template name, or B)
- Campaign (name or "Uncategorized")
- Resolved brand kit name + source
- Tone
- Topic + description excerpt
- Uploaded images with their intent tags

**Action:**
- "Generate" button → submits brief, navigates to `/draft/[id]` for the newly created draft

---

## 3. Projects List — `/projects`

**Purpose:** Overview of all projects; entry point for project-scoped organization.

**Project cards grid:**
- One card per project
- Card shows: project name, status badge (active / archived), campaign count, ready draft count, published draft count, default brand kit (color swatches + name), default tone, first 3 campaign name pills (overflow shown as "+N more")
- Card click → `/projects/[id]`

**Create Project inline form** (triggered by "New Project" button):
- Fields: name (required), default brand kit (dropdown, with "Inherit system default" option), default tone (text input)
- Create / Cancel buttons

**Standalone Campaigns card:**
- Lists all campaigns not assigned to any project
- Shows campaign count + post count stats
- Campaign name pills — each is a link to `/campaigns/[id]`
- "New Campaign" button → inline create form:
  - Fields: campaign name (required), brand kit override (optional dropdown, with "System default" option)
  - Create / Cancel buttons

---

## 4. Project Detail — `/projects/[id]`

**Purpose:** Per-project management hub — view campaigns, configure defaults, create briefs.

**Header:** Project name, status badge, "New Brief" button (navigates to `/brief/new`).

**Stats row:** Total campaigns, ready draft count, published draft count.

**Default settings panel:**
- Default brand kit: name, color swatches, "Edit" button
- Default tone: text display, "Edit" button

**Campaigns list:**
- One row per campaign belonging to this project
- Row shows: campaign name, brand kit source badge ("Campaign override" / "Inherited from project" / "System default"), post count
- Row click → `/campaigns/[id]`

**Create Campaign inline form** (triggered by "New Campaign" button within this project):
- Fields:
  - Campaign name (required)
  - Brand kit override: dropdown defaulting to "— Inherit from project ([kit name]) —"; selecting a different kit creates a campaign-level override
  - Tone override: text input, placeholder shows the project's inherited tone
- Create / Cancel buttons — created campaign is automatically scoped to this project

---

## 5. Campaign Detail — `/campaigns/[id]`

**Purpose:** Per-campaign management hub — view posts, understand brand kit resolution.

**Header:** Campaign name; project pill link (navigates to `/projects/[id]`) if campaign belongs to a project; "New Brief" button.

**Brand kit card:**
- Resolved brand kit name + source label ("Campaign override" / "Inherited from project" / "System default")
- Color swatches (primary, secondary, accent)
- Explanatory text describing the precedence rule (e.g., "This campaign uses the project's default brand kit. Set a campaign override to use a different kit for all posts in this campaign.")

**Posts table:**
- Columns: title, platform chip, path badge (A/B), status chip, created date, action (ChevronRight → `/draft/[id]`)
- Empty state if no posts yet

---

## 6. Library — `/library`

**Purpose:** Browse and filter all drafts/posts across the full content hierarchy.

**Left panel — drill-down navigation:**
- "All Posts" (top-level, default selected)
- Project entries — clicking expands to show:
  - Campaign sub-items (indented, each links to that campaign scope)
  - "Uncategorized" sub-item (posts in this project with no campaign assigned)
- "Uncategorized" top-level item — posts with no project or campaign

**Active scope drives the right panel** — selecting any item in the left panel filters the right panel.

**Breadcrumb:** Updates to reflect the current scope (e.g., "Library / Project A / Campaign 1").

**Right panel — filter chips:**
- Status filter: All, Draft, Ready, Published
- Platform filter: All, Instagram, LinkedIn

**Right panel — posts table:**
- Grouped by campaign when scope is a project (each campaign is a sub-heading)
- Columns: title, platform chip, path badge (A/B), status chip, created date, action (ChevronRight → `/draft/[id]`)
- "New Brief" button for the current scope context

---

## 7. Draft Detail — `/draft/[id]`

**Purpose:** Review, refine, and publish a generated draft. The core post-generation workspace.

**Breadcrumb:** Home → Campaign name (or "Uncategorized") → Draft title.

**Top bar:**
- Status chip (generating / ready / published)
- Platform chip (Instagram / LinkedIn)
- Path badge (A / B)
- Campaign name
- "Export PNG" button — downloads the rendered PNG from MinIO
- "Publish" button — opens publish/schedule modal

**Post preview panel (left):**
- Rendered PNG preview (or HTML preview at 1:1 if PNG not yet generated)
- Revision history selector — dropdown or list of past `DraftRevision` snapshots; selecting one loads that revision's HTML preview
- "Restore this version" action on non-current revisions

**AGUI chat panel (right):**
- Conversation thread: user messages + agent responses
- Agent response may include: updated post preview, suggested change chips, explanatory text
- Quick suggestion chips (pre-composed prompts, e.g., "Make it more energetic", "Swap background color", "Shorter headline")
- Text input + send button for freeform refinement instructions
- Each refinement creates a new `DraftRevision` automatically

---

## 8. Brand Kits Admin — `/admin/brandkits`

**Purpose:** Manage brand kits and their linked HTML/CSS templates. Admin-only.

**Kit list sidebar:**
- One card per brand kit — shows name, "Default" badge if `isDefault`, color swatches, template count
- Clicking a card loads its detail in the right panel

**Kit detail panel — Identity section:**
- Kit name, "System default" label if applicable
- "Edit Kit" button

**Kit detail panel — Colors sub-section:**
- Primary, secondary, accent color swatches with hex values

**Kit detail panel — Fonts sub-section:**
- Heading font name, body font name

**Kit detail panel — Usage sub-section:**
- Template count, default status indicator

**Kit detail panel — Templates section:**
- Grid of template cards
- Each card shows: preview swatch, template name, description, platform icons (all platforms), "Edit" on hover
- "Add Template" button — opens template creation form/modal

**Kit detail panel — Brand Voice Prompts section:**
- Displays current voice prompt text
- Version line (version number + last updated date)
- "Edit" button

---

## 9. AI Providers Admin — `/admin/settings`

**Purpose:** Configure and manage AI provider API keys and defaults. Admin-only.

**Provider groups:**
- "Copy Generation" — providers that generate post copy (text)
- "Image Generation" — providers that generate raster images

**Provider card (per provider):**
- Provider name + model name display
- Status chip (active / unconfigured)
- API key entry field — shows only `keyPrefix` (first 8 chars + `...`) after registration; never displays the full key
- "Rotate Key" button — clears stored key and prompts for a new one
- "Set as Default" toggle/button — marks this provider as the default for its category

**Encryption info banner:**
- Informs admin that API keys are encrypted at rest (AES-256-GCM) and only the key prefix is ever shown in the UI

---

## Route summary

| Route | Page | Auth |
|---|---|---|
| `/` | Dashboard | Editor + Admin |
| `/brief/new` | New Brief Wizard | Editor + Admin |
| `/projects` | Projects List | Editor + Admin |
| `/projects/[id]` | Project Detail | Editor + Admin |
| `/campaigns/[id]` | Campaign Detail | Editor + Admin |
| `/library` | Library | Editor + Admin |
| `/draft/[id]` | Draft Detail | Editor + Admin |
| `/admin/brandkits` | Brand Kits Admin | Admin only |
| `/admin/settings` | AI Providers Admin | Admin only |
