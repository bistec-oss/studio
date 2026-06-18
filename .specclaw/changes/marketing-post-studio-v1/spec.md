# Spec: Marketing Post Studio (v1)

**Change:** marketing-post-studio-v1
**Created:** 2026-06-08
**Status:** 🟡 Draft

## Overview

bistec-studio is an internal web tool for the Bistec marketing team that turns a
short brief into a finished, on-brand, ready-to-publish social media post. AI drafts the copy and image; an HTML/CSS brand template enforces
visual consistency; the tool renders the design to a publish-ready PNG server-side and publishes it (now or
scheduled) to Instagram and LinkedIn.

**HTML canvas + Puppeteer rendering pipeline:** The Next.js backend runs Claude
(Anthropic SDK tool-use loop) as a design agent. Claude receives the brand kit
(colors, fonts, logoUrl), the HTML/CSS brand template, the generated copy, and the
generated image URL, then fills the template and calls the `renderHtml` tool to
produce the final PNG. Puppeteer (headless Chromium) executes the render server-side
and returns the PNG byte stream, which is stored in MinIO. No Canva integration is
used at any point.

**Primary problem (the "why"):** today, producing a post depends on the one or two
people who know the brand guidelines and the per-channel publishing process — a
**key-person bottleneck**. The team's throughput and ability to publish are gated
on those individuals' availability.

**What success looks like:** any authorized team member — without prior knowledge
of the brand kit or how to publish to each channel — can go from a brief to a
published, on-brand post in a single guided flow. Brand consistency is enforced by
the templates/brand kit rather than by tribal knowledge, and the publishing
mechanics are owned by the tool rather than by a person.

**v1 boundaries:** static image posts only (no video), no pixel/canvas editing,
channels limited to Instagram + LinkedIn, internal team only.

## Requirements

### Functional Requirements

**Authentication & Roles**
- **FR-1** The system requires users to log in before accessing any functionality.
- **FR-2** The system supports two roles: **admin** and **editor**.
- **FR-3** Both roles can create briefs, generate drafts, and refine drafts.
  Only roles permitted to publish (see FR-4) may publish or schedule posts.
- **FR-4** Publishing and scheduling to social channels is gated by role. (Default:
  admins can publish; editors can create/draft. Final gating matrix confirmed in
  design — see Open Questions.)

**Projects**
- **FR-P1** Any authenticated user (admin or editor) can create, edit, and soft-delete a Project. A Project has a name, an optional default brand kit (reference to an admin-managed BrandKit — see FR-25b), and a default tone.
- **FR-P2** Soft-deleted projects are hidden from active views but recoverable by any authenticated user within a defined recovery window. All campaigns and posts under a soft-deleted project are preserved.
- **FR-P3** A project's default brand kit and tone are automatically inherited by campaigns created within it, but can be overridden at the campaign level.

**Campaigns**
- **FR-C1** Any authenticated user (admin or editor) can create, edit, and soft-delete a Campaign. A Campaign has a name, an optional brand kit override, and an optional default tone override.
- **FR-C2** A campaign can be assigned to one or more projects, or exist as a standalone campaign with no project.
- **FR-C3** Reassigning a campaign to a different project (or removing it from a project) is **admin-only**.
- **FR-C4** Soft-deleted campaigns are recoverable. Posts linked to a soft-deleted campaign are not deleted.
- **FR-C5** A post (draft/export) can be linked to multiple campaigns (shared asset — the same rendered PNG and export URL is reused, not duplicated).

**Brief Input**
- **FR-5** A user can create a brief specifying at minimum: topic/subject, goal/
  call-to-action, target channel(s) (Instagram and/or LinkedIn), desired tone, and
  **design mode**: "preset template" (Path A) or "generate new design" (Path B).
  The brief optionally assigns the post to a campaign (and through it, a project).
  Leaving campaign blank marks the post as **Uncategorized**.
- **FR-5a** When a campaign is selected in the brief UI, the brand kit and tone are pre-populated from the campaign (which may itself have inherited from a project). The user is not prompted to pick a brand kit again unless they choose to override.
- **FR-5b** Brand kit precedence at generation time: Campaign brand kit → Project default brand kit → system global default.
- **FR-6** The brief UI guides the user with prompts/defaults so that no prior
  brand or marketing expertise is required to produce a usable brief.

**AI Copy Generation**
- **FR-7** From a brief, the system generates marketing copy using OpenAI GPT.
- **FR-8** Generated copy is appropriate to the selected channel(s) (e.g. caption
  length/format conventions for Instagram vs LinkedIn).
- **FR-9** The user can regenerate the copy and can manually edit the copy text
  before it is applied to a design.

**AI Image Generation (on-demand)**
- **FR-10** The Claude design agent may call the `generateImage` tool during design
  generation when raster imagery is needed for the post. Image generation is
  **on-demand** — Claude decides whether to invoke it based on the design
  requirements. Claude can generate CSS gradients, SVG patterns, and geometric
  backgrounds natively in HTML/CSS without calling `generateImage`; it only calls
  the tool when authentic photographic or AI-generated raster imagery genuinely
  benefits the design.
- **FR-11** The user can request a change to the visual design — including replacing
  or adding imagery — by issuing a natural language instruction via the AGUI
  refinement panel (FR-33). The Claude design agent will update the HTML and call
  `generateImage` if raster imagery is required for the change.

**Design Path A — Preset Brand Template (Claude design agent)**
- **FR-12** The system composes a design by instantiating the HTML/CSS template
  string stored in `BrandKitTemplate.htmlTemplate`, then invoking the Claude design
  agent. Claude receives: the template HTML, the resolved brand kit context (colors
  as CSS variable values, fonts as @font-face declarations, logoUrl), the generated
  copy text. Claude fills the content
  slots in the template and calls the `renderHtml` tool to produce the PNG.
  Puppeteer executes the render and returns the PNG, which is stored in MinIO.
- **FR-12a** The Claude design agent receives the HTML template and brand kit as
  context and fills content slots using its understanding of HTML/CSS structure.
  No element ID mapping is needed — Claude interprets the template directly and
  replaces placeholder content (text nodes, `src` attributes, CSS custom property
  values) based on the template's semantic structure.
- **FR-12b** If the template design requires raster imagery, Claude calls the
  `generateImage` tool during the agent run; the resulting MinIO URL is embedded by
  Claude in the HTML. Claude may instead use CSS gradients, SVG elements, or static
  brand asset URLs if they better serve the template's visual style. No image is
  pre-generated before the agent runs — Claude decides whether imagery is needed.
- **FR-13** The user can choose among / swap between the brand templates linked to
  their resolved brand kit. Available templates are those an admin registered against
  the kit via the settings UI (see FR-26b). Swapping re-runs the Claude design agent
  with the new template's HTML and the existing copy text — no design recreation step
  is needed; Puppeteer re-renders from the newly filled template. Claude may call
  `generateImage` again if the new template requires different imagery.
- **FR-14** The brand kit (colors, fonts, logo) is applied automatically via the
  Claude agent's system prompt. Claude generates HTML using the brand colors as CSS
  custom properties and the brand fonts via @font-face declarations pointing to their
  MinIO URLs. The user does not configure brand styling manually.

**Design Path B — AI-Generated New Design (Claude design agent, freeform)**
- **FR-18b** When the user selects "generate new design" in the brief, the backend
  runs the Claude design agent in freeform mode. Claude receives: the user's brief,
  the resolved brand kit's active system prompt, structured brand data (colors,
  fonts, logoUrl), feed-to-AI artifact URLs (see FR-25b), the generated copy text,
  and any user-supplied reference image URLs (see FR-18c). Claude designs a complete
  HTML/CSS post from scratch, calls the `generateImage` tool if additional imagery
  is needed, then calls `renderHtml` to produce the PNG.
- **FR-18c** The brief UI for Path B includes an optional **reference image upload**
  (one or more images — e.g. a speaker photo, product shot, or event graphic).
  Uploaded images are stored in MinIO and their URLs are passed to the Claude design
  agent. Claude decides how to use them: it may embed them directly in the HTML
  design via `<img>` tags, use them as compositional reference when calling
  `generateImage`, or ignore them if they don't fit the design. The user hands the
  images over; Claude decides their role. This is distinct from Path A's image URL,
  which is always embedded into a specific template slot.
- **FR-19b** Claude may call the `generateImage` tool (which calls the resolved
  ImageProvider, e.g. gpt-image-2) to produce imagery, or embed existing brand asset
  URLs (from MinIO) directly in the HTML — depending on what best serves the brief.
  Claude decides; the user is not required to choose.
- **FR-20b** The assembled design is the HTML produced by Claude, rendered to PNG by
  Puppeteer. Brand consistency is enforced via Claude's system prompt (brand colors,
  fonts, logo). No editing transactions are used.
- **FR-21b** Once assembled, the new design enters the same in-app refinement and
  export flow as Path A (FR-15, FR-16, FR-17).

**Admin: Brand Kits**
- **FR-25b** A **brand kit** is a first-class, admin-managed entity. It owns: a
  name, a brand voice (versioned system prompt), a folder of brand artifacts
  (logos, fonts, colors, reference images, example posts), structured brand data —
  `colors` (hex color palette), `fonts` (name + MinIO URL pairs), and `logoUrl`
  (MinIO URL of the primary logo) — and a list of **linked brand templates**
  (HTML/CSS template strings registered by the admin). These structured brand data fields are fed directly into
  the Claude design agent's system prompt as CSS variable values and font definitions.
- **FR-26b** Admins manage brand kits through a **settings page in bistec-studio**
  (no developer/deploy cycle): create, **edit**, and soft-delete kits, set the system
  default kit, **link brand templates** (admins paste or upload HTML/CSS template
  strings directly in the settings UI — no manual ID entry, no external template
  picker), set a per-template background image prompt override (FR-25c), edit the
  brand voice prompt (with AI-assisted generation and improvement — FR-26c), and
  upload/remove artifacts. Editors select brand kits (via projects/campaigns) but
  cannot edit them.
- **FR-26b-edit** An admin can edit any existing brand kit at any time — updating
  its name, linked brand templates (add or remove, update image prompts), colors,
  fonts, and logoUrl. This is a dedicated Edit flow (separate from the create flow)
  accessible via an edit button on each brand kit card in the settings UI. Prompt
  versioning and artifact management remain on the card itself and are not part of
  the edit modal.
- **FR-26c** The brand voice prompt editor provides **AI assistance** in two modes:
  (a) **Generate** — shown when no prompt version exists; admin describes the brand
  in plain text and AI drafts a full brand voice prompt, saved as v1; (b) **Improve**
  — shown alongside the active prompt version; AI takes the current prompt and
  returns a refined version, automatically saved as the next version so rollback
  (FR-28b) still applies. Both modes use Claude (Anthropic SDK). The AI-generated
  content is presented as a draft for admin review before saving — it is not saved
  automatically.
- **FR-27b** The brand kit's active system prompt, together with the structured brand
  data (colors, fonts, logoUrl), is passed to the Claude design agent for every
  generation run (Path A and Path B). Artifacts flagged "feed to AI" (e.g. reference
  images) are passed as additional brand context. The prompt and artifacts are stored
  server-side; the prompt is never exposed to editors or the browser.
- **FR-28b** The brand voice prompt is **versioned**. An admin can roll back to any
  prior version from the settings UI (EC-13).
- **FR-29b** Projects and campaigns reference a brand kit. Brand kit precedence at
  generation time: Campaign brand kit → Project default brand kit → system default
  brand kit (see FR-5b).

**User-selectable AI models (copy)**
- **FR-28** At brief creation time, the user can select which AI model to use for
  **copy generation**. The image provider (used when Claude calls `generateImage`
  during the agent run) resolves automatically from the system default; an optional
  advanced selector in the brief wizard lets users override this if needed.
  The Claude design agent is not user-selectable (infrastructure-level choice).
- **FR-29** The copy model selector in the brief UI shows only models that an admin
  has explicitly **enabled** for that slot. Disabled or unregistered models are not
  visible to users.
- **FR-30** Each brief session starts with the **system default** copy model
  pre-selected (set by admin). The user's choice is not remembered between briefs.
- **FR-31** Admins can manage available models per slot (copy / image) from the
  settings UI: enable, disable, and set the system default for each slot. Changes
  take effect immediately for new briefs without a redeploy.

**Admin: AI provider registration**
- **FR-32** An admin can register a new AI provider directly from the bistec-studio settings UI — no redeploy or env var change required. A registered provider becomes available to users immediately.
- **FR-32a** When an admin enters an API key, the system inspects the key prefix and auto-identifies the provider where possible (e.g. `sk-ant-` → Anthropic, `sk-` → OpenAI). If identified, the provider name and label are auto-populated. If the key format is unrecognized, the admin manually specifies the provider name and label and proceeds — no block.
- **FR-32b** The system validates the key against the provider's API before saving. If validation fails, the key is not saved and the admin is shown the error.
- **FR-32c** After initial entry, the API key is never returned to the browser. The settings UI shows only the key prefix (e.g. `sk-ant-••••••••`) for identification. Keys are stored encrypted at rest (AES-256-GCM, same as social tokens).
- **FR-32d** The model selector in the brief UI displays each provider's name and label as registered by the admin (e.g. "Claude 3.5 Sonnet (Anthropic)") so users know exactly which model and provider they are selecting.

**AGUI — Chat-driven design refinement**
- **FR-33** After a design is returned (Path A or Path B), the draft page exposes a **chat-driven refinement panel**. The user types natural language instructions (e.g. "reposition the topic to the bottom", "change the background to something darker"); the backend runs the Claude design agent with `draft.htmlContent` as context plus the instruction. Claude updates the HTML and calls `renderHtml` to produce a new PNG. The user never directly manipulates design elements.
- **FR-33a** Each refinement instruction that results in a committed render is recorded as a `DraftRevision` row, storing `htmlSnapshot` (the HTML at that point) and `exportUrl` (the rendered PNG). The user can revert to any prior revision via an explicit undo step, which re-renders from the stored `htmlSnapshot`.
- **FR-33b** Before committing any refinement edit, the AI checks whether the instruction conflicts with the resolved brand kit. If a conflict is detected, the AI returns a **conflict card** with **Override** and **Cancel** buttons. Override applies the change; Cancel dismisses the card with no edit applied.
- **FR-33c** The copy regenerate button remains available on the draft page — the AGUI panel is additive. Image regeneration is not a separate button; users instruct Claude to change the visual via the AGUI panel instead.
- **FR-33d** The AI driving refinements uses the same model as the originating path — Path A uses `claude-haiku-4-5-20251001`; Path B uses `claude-sonnet-4-6`. No additional model selection is required.
- **FR-33e** The refinement panel does not allow direct element dragging or asset uploads. All changes are applied server-side via the Claude design agent (HTML generation) and Puppeteer rendering only.

**In-App Refinement (no pixel editing)**
- **FR-15** The user can refine a draft entirely within bistec-studio by any
  combination of: editing copy text, swapping the brand template (Path A), and
  issuing natural language instructions via the AGUI chat panel (FR-33) —
  each triggering a Claude design agent run and a fresh Puppeteer render.
- **FR-16** The system does NOT provide pixel/canvas/layout editing. All rendering
  is server-side only — no canvas editor UI is surfaced.

**Export**
- **FR-17** The system exports the finished design as a publish-ready PNG by running
  Puppeteer against the final `draft.htmlContent`. The PNG is stored in MinIO and
  its pre-signed URL is used for display and publishing.

**Publishing & Scheduling**
- **FR-18** A user with publish rights can publish an exported post immediately to
  the selected channel(s): Instagram (Business) and/or LinkedIn (company page).
- **FR-19** A user with publish rights can schedule a post for a future date/time;
  a background scheduler/queue publishes it at the scheduled time.
- **FR-20** The system records the outcome of each publish attempt (success/failure,
  timestamp, channel, and a link/identifier to the published post where available).
- **FR-21** A user can view and cancel a scheduled (not-yet-published) post.

**Persistence: Library & History**
- **FR-22** The system persists users, projects, campaigns, briefs, generated drafts, finished assets (an asset library), scheduled posts, and a publish-history log.
- **FR-23** A user can browse the asset library and publish history. The library supports drill-down filtering: filter by Project → then by Campaign within that project. Uncategorized posts (no campaign) are accessible via an "Uncategorized" filter.
- **FR-24** A standalone post (no campaign assigned) can be promoted into a campaign after creation. A campaign can be reassigned to a different project by an admin.

### Non-Functional Requirements

- **NFR-1 (Self-service / low knowledge barrier)** The end-to-end flow (brief →
  generate → refine → publish) must be completable by a team member with no brand
  or channel-publishing expertise. This is the primary design constraint.
- **NFR-2 (Platform/stack)** Next.js + TypeScript web application.
- **NFR-3 (Hosting)** Deployed to a VPS using Docker Compose (Next.js app, PostgreSQL, MinIO, Puppeteer renderer, scheduler worker as separate containers).
- **NFR-4 (Brand consistency)** Output is brand-consistent by construction — brand
  styling comes from the brand kit's structured data (colors, fonts, logo) injected
  into Claude's system prompt as CSS variables and @font-face declarations, not from
  user choices.
- **NFR-5 (Security)** Third-party credentials (OpenAI, Instagram, LinkedIn) are
  stored server-side as secrets, never exposed to the browser. Social account tokens
  are stored encrypted at rest.
- **NFR-6 (Reliability of scheduling)** A scheduled post fires within an acceptable
  window of its target time (target window confirmed in design, e.g. ±5 min) and
  survives an app restart (durable queue/store, not in-memory timers).
- **NFR-7 (Cost control)** Generation calls (copy via GPT, image generation via
  `generateImage` tool when Claude decides to invoke it) have guardrails to control
  spend (e.g. per-user or per-period limits) — exact policy in design. Image generation
  is on-demand and only incurred when Claude determines raster imagery is needed.
- **NFR-8 (Resilience to third-party failure)** Failures from OpenAI / social APIs
  are surfaced as clear, actionable errors and never silently drop a post.
- **NFR-11 (Renderer idempotency)** Every `renderHtml` call is stateless — re-running
  the Puppeteer renderer with the same HTML always produces the same PNG. The renderer
  holds no session state between calls.
- **NFR-9 (Auditability)** Publish history is retained and attributable to the
  user who published/scheduled.

## Acceptance Criteria

Each criterion must pass for the change to be considered complete.

- **AC-1** An unauthenticated visitor cannot reach any app functionality and is
  routed to login.
- **AC-2** A logged-in editor can create a brief, generate copy + image, refine the
  draft, and produce an exported post; an editor without publish rights cannot
  publish or schedule (the action is unavailable/blocked).
- **AC-3** A logged-in user with publish rights can take a brief all the way to a
  post published to Instagram, and (separately) to LinkedIn, and the published post
  appears on the respective channel.
- **AC-4** Given a brief, the system returns generated copy from GPT and a generated
  image from gpt-image-2, and both can be regenerated independently.
- **AC-5** The assembled design (Path A) visibly uses the Bistec brand kit
  (colors/fonts/logo) embedded in the HTML by Claude, without the user configuring
  any brand styling, and the user can swap between at least the supported set of
  brand templates.
- **AC-5b** A design produced via Path B ("generate new design") is visibly
  brand-consistent (brand kit applied via Claude's system prompt + structured brand
  data) without the user manually configuring any brand styling.
- **AC-5c** An admin can update a brand kit's system prompt in the bistec-studio
  settings UI; a Path B design generated after the update reflects the new prompt
  without a redeploy.
- **AC-5d** An admin uploads a reference-image artifact to a brand kit with "feed
  to AI" enabled; a subsequent Path B generation using that kit reflects the
  artifact as brand context.
- **AC-5e** An admin can roll a brand kit's prompt back to a prior version; Path B
  generations afterward use the reverted prompt (EC-13).
- **AC-13** The brief UI shows only admin-enabled models for copy and image slots;
  a user selects Gemini for image generation and the post image is generated by
  Gemini (not the system default).
- **AC-14** An admin disables a model mid-session; it is no longer selectable in
  new briefs immediately, without a redeploy.
- **AC-15** Admin sets a new system default for the image slot; the next brief
  opened by any user pre-selects that model.
- **AC-6** Editing the copy text and/or regenerating the image and/or swapping the
  template produces an updated exported asset reflecting those changes.
- **AC-7** There is no UI path to pixel/canvas editing — all rendering is
  server-side via Puppeteer only (confirms FR-16).
- **AC-8** A post scheduled for a future time is published automatically within the
  agreed window of that time, and the scheduler recovers correctly across an app
  restart (a scheduled post is not lost).
- **AC-9** A scheduled post can be viewed and cancelled before it fires; a cancelled
  post is not published.
- **AC-10** Every publish attempt (immediate or scheduled) writes a history record
  with outcome, timestamp, channel, and user; failures are recorded as failures
  with a reason, not as successes.
- **AC-11** A user can browse the asset library and publish history and see their previously generated and published posts.
- **AC-11a** The library drill-down works: filtering by a project shows only campaigns/posts under that project; filtering by a campaign within it shows only that campaign's posts; "Uncategorized" shows posts with no campaign.
- **AC-11b** A standalone post can be assigned to a campaign after creation; it then appears under that campaign in the library.
- **AC-11c** A campaign can be reassigned to a different project by an admin; it disappears from the original project and appears under the new one.
- **AC-16** Creating a brief with a campaign pre-selected populates the brand kit and tone fields automatically; the user is not prompted to select a brand kit.
- **AC-17** Brand kit precedence is correct: a campaign-level kit overrides the project default; the project default overrides the system global default.
- **AC-18** Soft-deleting a project hides it from the active project list but a recovery option restores it with all campaigns and posts intact.
- **AC-12** No third-party API key or secret is present in any client-side bundle or network response to the browser.

## Edge Cases

- **EC-1** OpenAI copy or image generation fails or times out → user sees a clear
  error and can retry; no partial/blank draft is silently saved as final.
- **EC-2** gpt-image-2 returns content that fails moderation / is rejected → user is
  informed and prompted to adjust the brief or regenerate.
- **EC-3** Puppeteer render fails (crash, timeout, or invalid HTML) → user is shown
  a specific error; the brief, copy, and generated image URL are preserved in the
  database so no work is lost and the user can retry with the same or a different
  template.
- **EC-4** Selected brand template is incompatible with the generated content (e.g.
  copy too long for the text field) → Claude truncates/warns or offers another
  template rather than producing a broken design.
- **EC-5** Social publish fails (expired/revoked token, rate limit, channel
  rejection) → recorded as a failed attempt with reason; user can re-authenticate
  the channel and retry; a scheduled post that fails is not silently dropped.
- **EC-6** Social account token expires before a scheduled post fires → the post is
  marked needs-attention/failed with a clear reason rather than failing silently.
- **EC-7** Two posts scheduled for the same time, or the app is down at the exact
  scheduled moment → both eventually publish (catch-up on restart) without
  duplicate publishing of the same post.
- **EC-8** Concurrent edits to the same draft (two users) → defined behavior (e.g.
  last-write-wins with indication) confirmed in design.
- **EC-9** Cost/rate guardrail is hit → generation is blocked with a clear message
  rather than failing opaquely.
- **EC-11** Claude design agent fails mid-run (e.g. Anthropic API error, tool call
  rejected) → the agent run is halted; no partial/broken HTML is committed to the
  draft; the brief and any already-generated assets (copy, image URL) are preserved
  so the user can retry.
- **EC-12** Claude design agent enters an unexpected loop or exceeds a maximum
  tool-call depth → the backend enforces a hard limit of 15 tool calls per
  generation run and surfaces a clear error rather than running indefinitely.
- **EC-13** Admin saves a brand kit prompt version that causes all Path B
  generations to fail moderation or produce off-brand output → an admin can revert
  to a previous version via the settings UI (per-brand-kit prompt version history /
  last-known-good retained).
- **EC-10** User selects both channels but content only suits one → each channel receives channel-appropriate copy (per FR-8); publishing to one channel failing does not block the other.
- **EC-14** A campaign is soft-deleted while a post under it is in SCHEDULED state → the scheduled post still fires; deletion does not cancel scheduled posts.
- **EC-15** A project's default brand kit is removed → campaigns that inherited it fall back to the system global default; existing exports are unaffected (stored in MinIO).
- **EC-16** A post is linked to two campaigns and one campaign is soft-deleted → the post remains accessible through the other campaign and in "Uncategorized" if no other campaign remains.

## Dependencies

**External services / APIs**
- **OpenAI API** — GPT (copy generation, both paths); gpt-image-2 (image generation,
  both paths — mandatory on Path A, Claude-decided on Path B). Requires API key +
  spend controls.
- **Anthropic API** — Claude (Anthropic SDK tool-use loop) as the design agent for
  both Path A (template filling) and Path B (freeform HTML/CSS design), and for AGUI
  refinement (FR-33). Also used for AI-assisted brand voice prompt generation
  (FR-26c). Requires API key.
- **Instagram Graph API (Meta Business)** — publishing to Instagram Business.
  Requires a Meta Business app and app review for publishing permissions.
- **LinkedIn API** — publishing to a LinkedIn company page. Requires a LinkedIn app
  with the appropriate posting permissions.

**Infrastructure (VPS)**
- A VPS running Docker Compose (Ubuntu). Containers: Next.js app, PostgreSQL, MinIO, Puppeteer renderer, scheduler worker.
- PostgreSQL for persistence (Docker container, data volume on VPS).
- MinIO (S3-compatible) for generated images and exported PNG designs (Docker container, data volume on VPS). MinIO is served to the browser via pre-signed URLs only — the MinIO port is never publicly exposed.
- **Puppeteer (headless Chromium)** — server-side HTML-to-PNG renderer. Runs as a
  dedicated container (or within the Next.js app container). Receives an HTML string
  and returns a PNG byte stream. Stateless; no session state retained between calls.
- A dedicated Docker container (scheduler worker) for scheduled publishing, polling every minute.
- Secrets managed via `.env` file on the VPS (never committed to git, permissions `600`, owned by root).

**Internal prerequisites**
- An initial set of on-brand HTML/CSS templates authored for bistec-studio (see
  Open Questions — template authoring process).
- Bistec brand fonts available for self-hosting via MinIO (see Open Questions — font
  licensing).
- Bistec **Instagram Business** and **LinkedIn company page** accounts the tool
  can be authorized to publish to.

## Notes

**Open questions to resolve in the design phase (`/specclaw:plan`):**
0. **Path B design model** — which Claude model drives the Path B freeform design
   agent? (Claude 3.5 Sonnet is the natural choice for HTML/CSS generation with
   tool use; confirm whether a different model is preferred.)
1. **Auth provider** — custom auth vs. a managed provider vs. Microsoft Entra ID
   SSO (team is on a Microsoft stack; Entra is a natural fit but not a hard v1
   requirement). Also: exact role→permission matrix for publishing.
2. **Database & ORM** — PostgreSQL in Docker Compose; ORM: Prisma (confirmed).
3. **Asset storage** — MinIO (S3-compatible, Docker container on VPS) for images/exports (confirmed).
4. **Social API ownership/timeline** — who obtains the Meta Business app + Instagram
   Graph API review and the LinkedIn app/permissions, and by when. This is the
   highest-risk dependency for the publishing acceptance criteria.
5. **HTML template authoring process** — who creates the initial brand HTML/CSS
   templates for bistec-studio, and what is the authoring workflow? (Developer-authored
   and committed, or admin-pasted via the settings UI, or a hybrid?) Templates must
   faithfully reproduce the Bistec brand; the authoring responsibility and approval
   process should be defined before Wave 3b.
6. **Font licensing** — are the Bistec brand fonts self-hostable (i.e. the team
   holds a web license)? Fonts must be served from MinIO for Puppeteer to render
   them correctly. If licensing does not permit self-hosting, a fallback font
   strategy (Google Fonts equivalent, or licensed CDN) must be agreed before Wave 3b.
7. **Scheduler infrastructure** — Dedicated Docker container (cron worker, polls every minute). Acceptable scheduling window: ±2 minutes (confirmed).
8. **Cost/rate controls** — concrete per-user/per-period generation limits (NFR-7).

**Deferred to later phases (explicitly not v1):** video generation/publishing,
a custom pixel/canvas editor, additional channels (Facebook/X/TikTok/YouTube),
a full content-calendar surface, and external/client self-serve access.
