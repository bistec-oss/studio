# Spec: Marketing Post Studio (v1)

**Change:** marketing-post-studio-v1
**Created:** 2026-06-08
**Status:** 🟡 Draft

## Overview

bistec-studio is an internal web tool for the Bistec marketing team that turns a
short brief into a finished, on-brand, ready-to-publish social media post. AI drafts the copy and image; a Canva brand template enforces
visual consistency; the tool exports the rendered design and publishes it (now or
scheduled) to Instagram and LinkedIn.

**Canva integration model:** The Next.js backend connects to Canva as an **MCP
client** (via the Canva MCP server), calling structured tool operations rather than
building a raw REST integration. This eliminates the need to hand-roll Canva OAuth,
HTTP wrappers, or response parsing — the MCP server owns that layer. The same Canva
MCP server is already connected to the development environment (Claude Code session),
meaning the integration can be developed and tested directly from the toolchain.

**Primary problem (the "why"):** today, producing a post depends on the one or two
people who know the brand guidelines and the per-channel publishing process — a
**key-person bottleneck**. The team's throughput and ability to publish are gated
on those individuals' availability.

**What success looks like:** any authorized team member — without prior knowledge
of the brand kit or how to publish to each channel — can go from a brief to a
published, on-brand post in a single guided flow. Brand consistency is enforced by
the templates/brand kit rather than by tribal knowledge, and the publishing
mechanics are owned by the tool rather than by a person.

**v1 boundaries:** static image posts only (no video), no pixel/canvas editing, no
manual edit-in-Canva, channels limited to Instagram + LinkedIn, internal team only.

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

**Brief Input**
- **FR-5** A user can create a brief specifying at minimum: topic/subject, goal/
  call-to-action, target channel(s) (Instagram and/or LinkedIn), desired tone, and
  **design mode**: "preset template" (Path A) or "generate new design" (Path B).
- **FR-6** The brief UI guides the user with prompts/defaults so that no prior
  brand or marketing expertise is required to produce a usable brief.

**AI Copy Generation**
- **FR-7** From a brief, the system generates marketing copy using OpenAI GPT.
- **FR-8** Generated copy is appropriate to the selected channel(s) (e.g. caption
  length/format conventions for Instagram vs LinkedIn).
- **FR-9** The user can regenerate the copy and can manually edit the copy text
  before it is applied to a design.

**AI Image Generation**
- **FR-10** From the brief (and/or copy context), the system generates a post image
  using OpenAI gpt-image-1.
- **FR-11** The user can regenerate the image (producing a new variation) without
  changing the copy.

**Design Path A — Preset Brand Template (via MCP)**
- **FR-12** The system composes a design by instantiating a Canva **brand template**
  via the MCP `create-design-from-brand-template` tool (using a BTM* template ID
  from Bistec's brand kit), then opening an editing transaction
  (`start-editing-transaction`) and injecting the generated copy and image in a
  single bulk `perform-editing-operations` call: `replace_text` on the template's
  copy element(s) and `update_fill` on the image element using the Canva asset ID
  obtained via `upload-asset-from-url` (which bridges the gpt-image-1 output URL
  into Canva). The transaction is then saved with `commit-editing-transaction`.
- **FR-12a** Before the editing transaction, the system uploads the gpt-image-1
  generated image into Canva using `upload-asset-from-url`, obtaining a Canva asset
  ID to use in the `update_fill` operation.
- **FR-13** The user can choose among / swap between the available brand templates.
  Swapping discards the current Canva design and creates a new one from the chosen
  template ID via `create-design-from-brand-template`, then re-applies the current
  copy and image via a fresh editing transaction. (Number of templates supported in
  v1 confirmed in design — see Open Questions.)
- **FR-14** The brand kit (colors, fonts, logo) is applied automatically by the
  brand template; the user does not configure brand styling manually. Available
  brand kits are discovered at runtime via `list-brand-kits`.

**Design Path B — AI-Generated New Design (OpenAI orchestrates Canva MCP)**
- **FR-18b** When the user selects "generate new design" in the brief, the backend
  invokes OpenAI (Chat Completions with function calling) as an **AI orchestrator**,
  passing it: the user's brief, the admin-defined brand system prompt (see FR-26b),
  the Bistec brand kit ID, and the Canva MCP tool schemas as available
  functions. OpenAI plans and directs the full design assembly by calling Canva MCP
  tools — this replicates the ChatGPT + Canva plugin pattern (canva.com/integrations/
  chatgpt) in bistec-studio's own backend, without depending on ChatGPT's UI.
- **FR-19b** OpenAI may call `gpt-image-1` to generate imagery (uploaded via
  `upload-asset-from-url` → Canva asset ID) or elect to use an existing brand asset
  already in the user's Canva account via `get-assets` — depending on what best
  serves the brief. The orchestrator decides; the user is not required to choose.
- **FR-20b** The assembled design is produced via a Canva editing transaction
  (`start-editing-transaction` → `perform-editing-operations` for all elements →
  `commit-editing-transaction`), with the brand kit ID applied to enforce brand
  consistency, regardless of whether OpenAI chose generated imagery or brand assets.
- **FR-21b** Once assembled, the new design enters the same in-app refinement and
  export flow as Path A (FR-15, FR-16, FR-17).

**Admin: Brand System Prompt Configuration**
- **FR-26b** Admins can configure the brand system prompt — encoding Bistec's brand
  voice and visual style guidelines — through a
  **settings page in bistec-studio** (no developer/deploy cycle required to update).
- **FR-27b** The brand system prompt is prepended to every Path B OpenAI
  orchestration call. It is stored server-side only and never exposed to editors or
  the browser.

**User-selectable AI models (copy + image)**
- **FR-28** At brief creation time, the user can select which AI model to use for
  **copy generation** and which to use for **image generation**, independently.
  The Path B design orchestrator is not user-selectable (infrastructure-level choice).
- **FR-29** The model selectors in the brief UI only show models that an admin has
  explicitly **enabled** for that slot. Disabled or unregistered models are not
  visible to users.
- **FR-30** Each brief session starts with the **system default** model pre-selected
  for each slot (set by admin). The user's choice is not remembered between briefs.
- **FR-31** Admins can manage available models per slot (copy / image) from the
  settings UI: enable, disable, and set the system default for each slot. Changes
  take effect immediately for new briefs without a redeploy.

**In-App Refinement (no pixel editing)**
- **FR-15** The user can refine a draft entirely within bistec-studio by any
  combination of: editing copy text, regenerating the image, and swapping the brand
  template — each triggering the appropriate MCP editing transaction (replace_text /
  upload-asset-from-url + update_fill / create-design-from-brand-template) and a
  fresh export. Element IDs needed for editing operations are obtained by reading the
  design content after the initial template instantiation.
- **FR-16** The system does NOT provide pixel/canvas/layout editing and does NOT
  open the design in Canva for manual editing. The MCP editing operations are
  server-side only (text content, image fill) — no Canva editor UI is surfaced.

**Export (via MCP)**
- **FR-17** The system exports the finished design as a publish-ready image
  (PNG/JPG) via the MCP `export-design` tool, which returns a download URL. The
  export is stored in the asset library (Azure Blob Storage) before publishing.

**Publishing & Scheduling**
- **FR-18** A user with publish rights can publish an exported post immediately to
  the selected channel(s): Instagram (Business) and/or LinkedIn (company page).
- **FR-19** A user with publish rights can schedule a post for a future date/time;
  a background scheduler/queue publishes it at the scheduled time.
- **FR-20** The system records the outcome of each publish attempt (success/failure,
  timestamp, channel, and a link/identifier to the published post where available).
- **FR-21** A user can view and cancel a scheduled (not-yet-published) post.

**Persistence: Library & History**
- **FR-22** The system persists users, briefs, generated drafts, finished assets
  (an asset library), scheduled posts, and a publish-history log.
- **FR-23** A user can browse the asset library of previously generated/published
  posts and the publish history.

### Non-Functional Requirements

- **NFR-1 (Self-service / low knowledge barrier)** The end-to-end flow (brief →
  generate → refine → publish) must be completable by a team member with no brand
  or channel-publishing expertise. This is the primary design constraint.
- **NFR-2 (Platform/stack)** Next.js + TypeScript web application.
- **NFR-3 (Hosting)** Deployed to Azure.
- **NFR-4 (Brand consistency)** Output is brand-consistent by construction — brand
  styling comes from the Canva brand kit/templates, not from user choices.
- **NFR-5 (Security)** Third-party credentials (OpenAI, Canva, Instagram, LinkedIn)
  are stored server-side as secrets, never exposed to the browser. Social account
  tokens are stored encrypted at rest.
- **NFR-6 (Reliability of scheduling)** A scheduled post fires within an acceptable
  window of its target time (target window confirmed in design, e.g. ±5 min) and
  survives an app restart (durable queue/store, not in-memory timers).
- **NFR-7 (Cost control)** Generation calls (GPT, gpt-image-1) have guardrails to
  control spend (e.g. per-user or per-period limits) — exact policy in design.
- **NFR-8 (Resilience to third-party failure)** Failures from OpenAI/Canva MCP
  tools/social APIs are surfaced as clear, actionable errors and never silently
  drop a post.
- **NFR-11 (MCP transaction integrity)** Every Canva editing session that opens a
  `start-editing-transaction` must always resolve with either
  `commit-editing-transaction` (success path) or `cancel-editing-transaction`
  (error/abort path) — orphaned open transactions are not acceptable.
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
  image from gpt-image-1, and both can be regenerated independently.
- **AC-5** The composed design (Path A) visibly uses the Bistec brand kit
  (colors/fonts/logo) without the user configuring any brand styling, and the user
  can swap between at least the supported set of brand templates.
- **AC-5b** A design produced via Path B ("generate new design") is visibly
  brand-consistent (brand kit applied, brand voice reflected) without the user
  manually configuring any brand styling.
- **AC-5c** An admin can update the brand system prompt in the bistec-studio
  settings UI; a Path B design generated after the update reflects the new prompt
  without a redeploy.
- **AC-13** The brief UI shows only admin-enabled models for copy and image slots;
  a user selects Gemini for image generation and the post image is generated by
  Gemini (not the system default).
- **AC-14** An admin disables a model mid-session; it is no longer selectable in
  new briefs immediately, without a redeploy.
- **AC-15** Admin sets a new system default for the image slot; the next brief
  opened by any user pre-selects that model.
- **AC-6** Editing the copy text and/or regenerating the image and/or swapping the
  template produces an updated exported asset reflecting those changes.
- **AC-7** There is no UI path to pixel/canvas editing or to opening the design in
  Canva for manual editing (confirms FR-16).
- **AC-8** A post scheduled for a future time is published automatically within the
  agreed window of that time, and the scheduler recovers correctly across an app
  restart (a scheduled post is not lost).
- **AC-9** A scheduled post can be viewed and cancelled before it fires; a cancelled
  post is not published.
- **AC-10** Every publish attempt (immediate or scheduled) writes a history record
  with outcome, timestamp, channel, and user; failures are recorded as failures
  with a reason, not as successes.
- **AC-11** A user can browse the asset library and publish history and see their
  previously generated and published posts.
- **AC-12** No third-party API key or secret is present in any client-side bundle or
  network response to the browser.

## Edge Cases

- **EC-1** OpenAI copy or image generation fails or times out → user sees a clear
  error and can retry; no partial/blank draft is silently saved as final.
- **EC-2** gpt-image-1 returns content that fails moderation / is rejected → user is
  informed and prompted to adjust the brief or regenerate.
- **EC-3** Canva MCP server is unavailable, or an MCP tool call fails (template
  instantiation, asset upload, editing transaction, or export) → user is informed
  with a specific error; the brief/copy/generated image are preserved in the
  database so no work is lost and the user can retry. An open editing transaction
  that encounters an error is cancelled via `cancel-editing-transaction` rather than
  left orphaned.
- **EC-4** Selected brand template is incompatible with the generated content (e.g.
  copy too long for the text field) → system truncates/warns or offers another
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
- **EC-11** Path B OpenAI orchestration fails mid-assembly (e.g. OpenAI error, MCP
  tool call rejected mid-transaction) → the open editing transaction is cancelled
  via `cancel-editing-transaction`; no partial/broken design is left in Canva; the
  brief and any already-generated assets are preserved so the user can retry.
- **EC-12** OpenAI orchestrator enters an unexpected loop or exceeds a maximum
  tool-call depth → the backend enforces a hard limit on orchestration steps and
  surfaces a clear error rather than running indefinitely.
- **EC-13** Admin saves a brand system prompt that causes all Path B generations to
  fail moderation or produce off-brand output → an admin can revert to the previous
  prompt via the settings UI (prompt history / last-known-good retained).
- **EC-10** User selects both channels but content only suits one → each channel
  receives channel-appropriate copy (per FR-8); publishing to one channel failing
  does not block the other.

## Dependencies

**External services / APIs**
- **OpenAI API** — GPT (copy generation, Path A); GPT with function calling as AI
  orchestrator (Path B); gpt-image-1 (image generation, both paths — mandatory on
  Path A, AI-decided on Path B). Requires API key + spend controls.
- **Canva MCP server** — The Next.js backend connects as an MCP client to the
  Canva MCP server, which exposes structured tool operations:
  - `list-brand-kits` — discover available brand kits
  - `create-design-from-brand-template` — instantiate a design from a BTM* template
  - `upload-asset-from-url` — bridge gpt-image-1 image URLs into Canva assets
  - `start-editing-transaction` / `perform-editing-operations` (replace_text,
    update_fill) / `commit-editing-transaction` / `cancel-editing-transaction` —
    programmatic content injection and refinement
  - `get-design-content` — read element IDs required for editing operations
  - `get-assets` — retrieve existing brand assets (used by Path B orchestrator as
    an alternative to generating new imagery)
  - `export-design` — export as PNG/JPG, returns a download URL
  The MCP server handles Canva OAuth and all raw API calls; the backend only
  needs MCP client credentials (not raw Canva REST credentials).
  Note: `generate-design-structured` is **presentation-only** and is NOT used
  for social media post generation.
- **Instagram Graph API (Meta Business)** — publishing to Instagram Business.
  Requires a Meta Business app and app review for publishing permissions.
- **LinkedIn API** — publishing to a LinkedIn company page. Requires a LinkedIn app
  with the appropriate posting permissions.

**Infrastructure (Azure)**
- Compute for the Next.js app (e.g. App Service / Container Apps).
- A managed database for persistence (Postgres or SQL — chosen in design).
- Blob storage for generated images and exported designs (e.g. Azure Blob Storage).
- A durable background scheduler/queue + worker for scheduled publishing.
- Secret management for third-party credentials (e.g. Azure Key Vault).

**Internal prerequisites**
- An existing Bistec **Canva brand kit** and at least one **brand template**.
- Bistec **Instagram Business** and **LinkedIn company page** accounts the tool
  can be authorized to publish to.

## Notes

**Open questions to resolve in the design phase (`/specclaw:plan`):**
0. **Path B OpenAI model** — which OpenAI model drives the Path B orchestration?
   (GPT-4o is the natural choice for function-calling orchestration; confirm whether
   a different model is preferred and whether the same model is used for copy
   generation on Path A or a lighter model is acceptable there.)
1. **Auth provider** — custom auth vs. a managed provider vs. Microsoft Entra ID
   SSO (team is on a Microsoft stack; Entra is a natural fit but not a hard v1
   requirement). Also: exact role→permission matrix for publishing.
2. **Database & ORM** — Azure Database for PostgreSQL vs Azure SQL; ORM (e.g.
   Prisma) and the concrete data model.
3. **Asset storage** — confirm Azure Blob Storage for images/exports.
4. **Social API ownership/timeline** — who obtains the Meta Business app + Instagram
   Graph API review and the LinkedIn app/permissions, and by when. This is the
   highest-risk dependency for the publishing acceptance criteria.
5. **Canva MCP setup** — confirm: (a) MCP server deployment/hosting for the
   production bistec-studio environment (same server connected to Claude Code dev
   session, or a separately hosted instance); (b) MCP client credentials/auth for
   the Next.js backend; (c) the Bistec brand kit ID and the BTM* template IDs
   accessible via `list-brand-kits`; (d) **how many brand templates** v1 supports.
   The `generate-design-structured` tool (presentations only) is NOT in scope.
6. **Scheduler infrastructure** — Azure-native choice (Container Apps job, Functions
   timer, or queue + worker) and the acceptable scheduling window (NFR-6).
7. **Cost/rate controls** — concrete per-user/per-period generation limits (NFR-7).

**Deferred to later phases (explicitly not v1):** video generation/publishing,
a custom pixel/canvas editor, edit-in-Canva, additional channels (Facebook/X/
TikTok/YouTube), a full content-calendar surface, and external/client self-serve
access.
