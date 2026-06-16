# bistec-studio — Product Requirements Document

**Version:** 1.0
**Date:** 2026-06-15
**Status:** Draft
**Stakeholders:** Bistec internal team

---

## 1. Executive Summary

bistec-studio is an internal web tool that lets any Bistec marketing team member produce and publish a branded social media post — without needing to know the brand guidelines or how to operate each publishing platform. A user fills in a short brief; the tool generates on-brand copy and imagery via AI, composes a finished design using Bistec's Canva brand templates, and publishes (or schedules) the post to Instagram and/or LinkedIn.

**v1 scope:** static image posts, Instagram + LinkedIn, internal team only.

---

## 2. Problem Statement

Producing a finished, on-brand post today requires the one or two people on the team who know both the brand guidelines and the per-channel publishing process. Everything routes through them — creating a **key-person bottleneck** that limits how much the team can publish and makes the marketing pipeline dependent on specific individuals' availability.

The consequence is that:
- Post volume is artificially capped by bandwidth, not by ideas or strategy.
- Team members who could contribute are blocked without the brand expert present.
- The brand knowledge lives in people, not in a system — it cannot be transferred at scale.

bistec-studio removes this dependency by encoding brand knowledge into the tool itself (Canva brand kit, versioned brand voice prompts) and automating the per-channel publishing mechanics so that any authorized team member can independently produce and publish a post.

---

## 3. Goals

| Goal | Metric | Target |
|---|---|---|
| Reduce time-to-publish | Minutes from brief to published post | From current baseline → under 30 minutes |
| Increase post volume | Posts published per month | Measurable increase from baseline within 60 days of launch |
| Expand publishing capability | % of team who can independently publish | ≥ 80% of the team able to publish without brand-expert involvement |
| Adoption | Active users within 4 weeks of launch | ≥ 70% of the marketing team (6–15 people) |

---

## 4. Users & Personas

The team is 6–15 people. Two roles exist in the tool:

### Admin
**Who:** senior marketing team members or team leads.
**What they do in bistec-studio:**
- Manage brand kits (system prompt, artifacts, Canva link).
- Enable/disable AI models available to users.
- Reassign campaigns to different projects.
- Publish and schedule posts (in addition to all editor capabilities).

### Editor
**Who:** the broader marketing team — content creators, social media managers, designers.
**What they do in bistec-studio:**
- Create briefs and generate drafts.
- Refine copy and imagery within the tool.
- Organize work into campaigns and projects.
- Submit for publish (or publish directly if permitted).

Neither role requires prior knowledge of Canva, the Bistec brand kit, or the technical requirements of each social platform. The tool handles all of that.

---

## 5. User Journeys

### 5.1 Core journey — brief to published post

```
1. Log in → land on dashboard
2. Create a brief
   - Enter topic, goal, tone, target channel(s)
   - Optionally assign to a campaign/project
     → brand kit and tone auto-populate from the campaign/project defaults
   - Choose design mode: "Use a template" (Path A) or "Generate new design" (Path B)
   - Select AI models for copy and image (defaults pre-selected by admin)
3. Generate
   - AI produces channel-appropriate copy
   - AI produces a post image
4. Review & refine
   - Edit copy text directly
   - Regenerate image (without changing copy)
   - Swap brand template (Path A)
   - Each change re-exports the design
5. Publish or schedule
   - Publish immediately to selected channel(s), or
   - Schedule for a future date/time
6. Done — post appears in library with publish history
```

### 5.2 Scheduled post

A user with publish rights schedules a post. The background worker picks it up at the target time and publishes it automatically. If it fails (e.g. expired token), the post is marked failed with a reason — not silently dropped — and the user is notified to re-authenticate and retry.

### 5.3 Content organization

```
Project (optional top-level grouping)
  └── Campaign (can belong to one or more projects, or be standalone)
        └── Post / Draft

Standalone post with no campaign → visible under "Uncategorized"
```

A user can assign a standalone post to a campaign after creation. An admin can reassign a campaign to a different project.

### 5.4 Admin: brand kit management

An admin navigates to Settings → Brand Kits. They can:
- Create a new brand kit, link it to a Canva brand kit, and upload brand artifacts (logos, fonts, reference images).
- Edit the brand voice prompt — the system prompt passed to AI on every Path B generation. The prompt is versioned; the admin can roll back to any prior version.
- Mark specific artifacts as "feed to AI" — these are passed as brand context to the AI during generation.
- Set one brand kit as the system default (used when no campaign/project specifies one).

No redeploy is required for any brand kit change.

---

## 6. Feature Requirements

### Authentication & access control

| ID | Requirement |
|---|---|
| FR-1 | Users must log in before accessing any functionality. |
| FR-2 | Two roles: **admin** and **editor**. |
| FR-3 | Both roles can create briefs, generate drafts, and refine drafts. |
| FR-4 | Publishing and scheduling to social channels is restricted by role. Default: admins can publish; editors can draft. |

### Content organization

| ID | Requirement |
|---|---|
| FR-P1 | Any authenticated user can create, edit, and soft-delete a Project (name, optional default brand kit, default tone). |
| FR-P2 | Soft-deleted projects are hidden but recoverable. All linked campaigns and posts are preserved. |
| FR-P3 | A project's default brand kit and tone are inherited by campaigns within it, overridable at the campaign level. |
| FR-C1 | Any authenticated user can create, edit, and soft-delete a Campaign (name, optional brand kit override, optional tone override). |
| FR-C2 | A campaign can belong to one or more projects, or be standalone. |
| FR-C3 | Reassigning a campaign to a different project is admin-only. |
| FR-C4 | Soft-deleted campaigns are recoverable. Posts linked to the campaign are not deleted. |
| FR-C5 | A post can be linked to multiple campaigns (shared asset — Canva design and export URL are reused, not duplicated). |

### Brief creation

| ID | Requirement |
|---|---|
| FR-5 | A user creates a brief with: topic, goal/CTA, channel(s) (Instagram and/or LinkedIn), tone, design mode, and optionally a campaign assignment. No campaign = "Uncategorized". |
| FR-5a | Selecting a campaign auto-populates brand kit and tone from the campaign (inherited from project if not overridden). User is not prompted for brand kit unless they override. |
| FR-5b | Brand kit precedence: Campaign brand kit → Project default brand kit → System default brand kit. |
| FR-6 | The brief UI is self-explanatory with guided prompts and defaults — no brand or channel expertise required. |

### AI copy generation

| ID | Requirement |
|---|---|
| FR-7 | The system generates marketing copy using OpenAI GPT from the brief. |
| FR-8 | Copy is appropriate to the selected channel(s) (length, format conventions for Instagram vs LinkedIn). |
| FR-9 | The user can regenerate copy and manually edit it before applying to a design. |

### AI image generation

| ID | Requirement |
|---|---|
| FR-10 | The system generates a post image from the brief using OpenAI gpt-image-2. |
| FR-11 | The user can regenerate the image without changing the copy. |

### Design — Path A (preset brand template)

| ID | Requirement |
|---|---|
| FR-12 | The system instantiates a Canva brand template via MCP, then injects the generated copy and image via a single editing transaction (replace_text + update_fill). |
| FR-12a | Before the editing transaction, the generated image is uploaded to Canva via `upload-asset-from-url` to obtain a Canva asset ID. |
| FR-13 | The user can swap between available brand templates. Swapping creates a new design from the chosen template and re-applies the current copy and image. |
| FR-14 | Brand styling (colors, fonts, logo) is applied automatically by the brand template — the user does not configure brand styling. |

### Design — Path B (AI-generated new design)

| ID | Requirement |
|---|---|
| FR-18b | When "generate new design" is selected, the backend invokes OpenAI with function calling as an AI orchestrator. It receives the brief, the resolved brand kit's active system prompt and feed-to-AI artifacts, and the Canva MCP tool schemas as callable functions. OpenAI directs the full design assembly by calling Canva MCP tools. |
| FR-19b | OpenAI may generate new imagery (gpt-image-2) or use an existing brand asset from Canva (`get-assets`) — it decides based on what best serves the brief. |
| FR-20b | The assembled design is built via a Canva editing transaction with the brand kit ID applied. |
| FR-21b | The Path B design enters the same in-app refinement and export flow as Path A. |

### Brand kit management (admin)

| ID | Requirement |
|---|---|
| FR-25b | A brand kit is a first-class, admin-managed entity. It owns: a name, a versioned brand voice prompt, a folder of brand artifacts (logos, fonts, colors, reference images, example posts), and an optional Canva brand kit link. Type: Canva-linked, backend-folder-based, or hybrid. |
| FR-26b | Admins manage brand kits in bistec-studio Settings: create/edit/soft-delete kits, set the system default, link a Canva brand kit, edit the brand voice prompt, and upload/remove artifacts. Editors can select but not edit kits. |
| FR-27b | The active brand voice prompt is prepended to every Path B OpenAI call. Feed-to-AI artifacts are passed as brand context. The prompt and artifacts are server-side only — never exposed to the browser. |
| FR-28b | The brand voice prompt is versioned. An admin can roll back to any prior version from the settings UI. |
| FR-29b | Projects and campaigns reference a brand kit by FK. Precedence: Campaign → Project default → System default. |

### User-selectable AI models

| ID | Requirement |
|---|---|
| FR-28 | At brief creation, the user selects a copy model and an image model independently. The Path B orchestrator model is not user-selectable. |
| FR-29 | Only admin-enabled models appear in the brief UI selectors. |
| FR-30 | Each brief opens with the admin-set system default pre-selected. Selection is not persisted between briefs. |
| FR-31 | Admins manage available models per slot (copy / image) from Settings: enable, disable, set default. Changes apply immediately — no redeploy. |

### In-app refinement

| ID | Requirement |
|---|---|
| FR-15 | The user can refine a draft by editing copy text, regenerating the image, and/or swapping the brand template — each triggering the appropriate MCP operations and a fresh export. |
| FR-16 | The tool does NOT provide pixel/canvas editing and does NOT open the design in Canva. MCP operations are server-side only. |

### Export

| ID | Requirement |
|---|---|
| FR-17 | The system exports the finished design as PNG/JPG via the MCP `export-design` tool. The export is stored in MinIO before publishing. |

### Publishing & scheduling

| ID | Requirement |
|---|---|
| FR-18 | A user with publish rights can publish immediately to Instagram Business and/or LinkedIn company page. |
| FR-19 | A user with publish rights can schedule a post for a future date/time; the background scheduler publishes it at the scheduled time. |
| FR-20 | Every publish attempt is recorded: outcome (success/failure), timestamp, channel, and a link/ID to the published post. |
| FR-21 | A user can view and cancel a scheduled post before it fires. |

### Library & history

| ID | Requirement |
|---|---|
| FR-22 | The system persists: users, projects, campaigns, briefs, drafts, assets, scheduled posts, and publish history. |
| FR-23 | The library supports drill-down filtering: Project → Campaign → Posts. "Uncategorized" is a fixed filter for posts with no campaign. |
| FR-24 | A standalone post can be promoted into a campaign after creation. An admin can reassign a campaign to a different project. |

---

## 7. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-1 | **Self-service:** the end-to-end flow (brief → generate → refine → publish) must be completable by a team member with no brand or channel-publishing expertise. This is the primary design constraint. |
| NFR-2 | **Platform:** Next.js + TypeScript web application. |
| NFR-3 | **Hosting:** VPS, Docker Compose — Next.js app, PostgreSQL, MinIO, and scheduler worker as separate containers. |
| NFR-4 | **Brand consistency:** output is brand-consistent by construction. Brand styling comes from Canva brand kit/templates, not from user choices. |
| NFR-5 | **Security:** all third-party credentials (OpenAI, Canva, Instagram, LinkedIn) are stored server-side. Social tokens are encrypted at rest (AES-256-GCM). No secret is ever exposed to the browser. |
| NFR-6 | **Scheduling reliability:** a scheduled post fires within ±2 minutes of its target time and survives an app restart (persisted queue, not in-memory timers). |
| NFR-7 | **Cost control:** generation calls (GPT, gpt-image-2) have per-user or per-period limits to control OpenAI spend. Exact thresholds to be confirmed. |
| NFR-8 | **Third-party resilience:** failures from OpenAI, Canva MCP, or social APIs are surfaced as clear, actionable errors and never silently drop a post. |
| NFR-9 | **Auditability:** publish history is retained and attributable to the user who published or scheduled. |
| NFR-11 | **MCP transaction integrity:** every `start-editing-transaction` must always resolve with either `commit-editing-transaction` (success) or `cancel-editing-transaction` (error/abort). No orphaned open transactions. |

---

## 8. Out of Scope (v1)

The following are explicitly **not** included in v1:

- Video generation or video publishing
- Custom pixel/canvas/layout editing
- Opening designs in the Canva editor (edit-in-Canva)
- Channels beyond Instagram and LinkedIn (no Facebook, X, TikTok, YouTube)
- Full content calendar UI
- External or client self-serve access
- Healthcare compliance constraints (not applicable)

---

## 9. Dependencies & Risks

### External dependencies

| Dependency | Risk | Mitigation |
|---|---|---|
| **Meta Business app review** (Instagram Graph API) | High — app review can take weeks; blocks all Instagram publishing ACs | Begin Meta Business app registration before Wave 1 code. Assign a named owner immediately. |
| **LinkedIn API app + permissions** | Medium — requires a LinkedIn developer app with posting permissions | Apply in parallel with Meta; confirm posting scope. |
| **Canva MCP server (production)** | Medium — how/where is it hosted for the production VPS? Development uses Claude Code session | Confirm hosting model, MCP client credentials, brand kit ID, and brand template IDs before Wave 3 begins. |
| **OpenAI API** | Low — key + spend controls needed | Obtain API key and set spend alerts as part of Wave 1 infra setup. |

### Infrastructure dependencies

| Item | Notes |
|---|---|
| VPS (Ubuntu) | Must be provisioned before deployment. Docker + Docker Compose installed. |
| PostgreSQL | Docker container on VPS, named volume for persistence. |
| MinIO | Docker container, console bound to `127.0.0.1:9001` only (not publicly accessible). |
| Scheduler worker | Dedicated Docker container polling every 60 seconds. |
| `.env` file | `chmod 600`, owned by root, never committed. All secrets via env vars — no hard-coded values in `docker-compose.yml`. |

### Internal prerequisites

- An existing Bistec **Canva brand kit** and at least one **brand template** in the team's Canva account.
- A Bistec **Instagram Business** account and **LinkedIn company page** that the tool can be authorized to publish to.

---

## 10. Acceptance Criteria (launch-gate)

All of the following must pass before v1 ships:

| ID | Criterion |
|---|---|
| AC-1 | Unauthenticated visitors cannot reach any functionality and are routed to login. |
| AC-2 | An editor can create a brief, generate copy + image, refine the draft, and produce an exported post. An editor without publish rights cannot publish or schedule. |
| AC-3 | A user with publish rights can take a brief all the way to a post published on Instagram and (separately) LinkedIn. |
| AC-4 | Generated copy and image can each be independently regenerated. |
| AC-5 | Path A design visibly uses the Bistec brand kit (colors, fonts, logo) without user configuration. User can swap between available brand templates. |
| AC-5b | Path B design is visibly brand-consistent (brand kit applied, brand voice reflected) without user configuration. |
| AC-5c | Admin updates a brand kit system prompt in Settings; the next Path B generation reflects the new prompt — no redeploy. |
| AC-5d | Admin uploads a feed-to-AI artifact to a brand kit; subsequent Path B generations reflect it as brand context. |
| AC-5e | Admin rolls back a brand kit prompt to a prior version; Path B generations use the reverted prompt. |
| AC-6 | Editing copy, regenerating the image, or swapping the template produces an updated export reflecting the change. |
| AC-7 | No UI path exists to pixel/canvas editing or opening the design in Canva. |
| AC-8 | A scheduled post publishes automatically within ±2 minutes of its target time. The scheduler recovers correctly after an app restart — no scheduled post is lost. |
| AC-9 | A scheduled post can be cancelled before it fires; a cancelled post is not published. |
| AC-10 | Every publish attempt writes a history record (outcome, timestamp, channel, user). Failures are recorded as failures with a reason. |
| AC-11 | A user can browse the asset library and publish history and see previously generated and published posts. |
| AC-11a | Library drill-down works: Project → Campaign → Posts; "Uncategorized" shows posts with no campaign. |
| AC-11b | A standalone post can be assigned to a campaign after creation. |
| AC-11c | An admin can reassign a campaign to a different project; it moves correctly in the library. |
| AC-12 | No third-party API key or secret is present in any client-side bundle or browser network response. |
| AC-13 | The brief UI shows only admin-enabled models per slot; selecting a non-default model uses that model for generation. |
| AC-14 | An admin disables a model; it is no longer selectable in new briefs immediately — no redeploy. |
| AC-15 | Admin sets a new system default for a slot; the next brief opened by any user pre-selects it. |
| AC-16 | Selecting a campaign in the brief auto-populates brand kit and tone; user is not prompted to pick a brand kit. |
| AC-17 | Brand kit precedence is correct: campaign-level kit overrides project default; project default overrides system default. |
| AC-18 | Soft-deleting a project hides it from active views; recovery restores it with all campaigns and posts intact. |

---

## 11. Open Questions

| # | Question | Impact |
|---|---|---|
| 0 | Which OpenAI model drives Path B orchestration? (GPT-4o recommended for function calling — confirm.) | Affects Path B latency and cost |
| 1 | Who owns obtaining Meta Business app approval and LinkedIn app permissions, and what is the timeline? | **Highest risk** — blocks all publish ACs |
| 2 | How is the Canva MCP server hosted for the production VPS environment? What are the MCP client credentials for the Next.js backend? | Blocks Wave 3 |
| 3 | What are the Bistec Canva brand kit ID and BTM* template IDs accessible via `list-brand-kits`? How many brand templates does v1 support? | Required for Wave 4 (Path A) |
| 4 | What are the concrete per-user or per-period generation limits for OpenAI calls (NFR-7)? | Cost/rate guardrail design |
| 5 | Exact role → permission matrix for publishing: can editors publish, or is publishing admin-only by default? | Auth middleware + UI gating |

