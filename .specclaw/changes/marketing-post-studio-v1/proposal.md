# Proposal: Marketing Post Studio (v1)

**Created:** 2026-06-08
**Status:** 🟡 Draft

## Problem

Bistec Care (healthcare/eldercare) has an internal marketing team that needs to
produce brand-consistent marketing posts for social media on a regular basis.
Today that work is manual: writing copy, sourcing or designing imagery, applying
brand styling, and then publishing to each channel by hand. This is slow,
inconsistent across team members, and dependent on whoever happens to know the
brand guidelines and the publishing process.

**bistec-studio** solves this by giving the marketing team a single internal web
tool that turns a short brief into a finished, on-brand, ready-to-publish post —
AI drafts the copy and imagery, the brand template enforces consistency, and the
tool publishes (now or scheduled) to the team's social channels.

## Proposed Solution

A Next.js + TypeScript web application (hosted on Azure) that orchestrates a
**hybrid** pipeline: custom AI generation owned by us, with Canva used for
brand-consistent rendering and export.

**Core v1 flow:**
1. An authenticated team member writes a **brief** (topic, goal, channel, tone).
2. **OpenAI GPT** drafts the marketing copy from the brief.
3. **gpt-image-1** generates the post imagery.
4. The copy + image **auto-fill a Canva brand template** drawn from Bistec Care's
   existing Canva brand kit.
5. The user can **edit in-app** — tweak the copy text, regenerate the image, or
   swap the brand template — then re-export. (No pixel/canvas editing in v1; no
   manual edit-in-Canva step.)
6. The finished design is **exported via the Canva API** (PNG/JPG).
7. The user **publishes now or schedules** the post for a future date/time to
   **Instagram** and **LinkedIn**.

All artifacts persist: users, briefs, generated drafts, an asset library of
finished posts, and a publish-history log.

## Scope

### In Scope
- Authenticated internal-team access with **simple roles** (admin vs editor;
  publishing gated by role).
- Brief input UI.
- AI copy generation via **OpenAI GPT**.
- AI image generation via **gpt-image-1**.
- Canva integration: pull brand kit + a small set of brand templates, auto-fill
  with generated copy/image, export the rendered design.
- In-app refinement: edit copy text, regenerate image, swap template, re-export.
- Publishing to **Instagram** (Business) and **LinkedIn** (company page).
- **Publish-now and schedule-for-later** (scheduler/queue runs scheduled posts).
- Persistence: full database for users, briefs, drafts, asset library, and
  publish history.
- Deployment to **Azure**.

### Out of Scope (v1)
- **Video** generation/publishing (planned for a later phase).
- A custom drag-and-drop / pixel-level design editor.
- Manual editing inside Canva (edit-in-Canva deep-link flow).
- Channels beyond Instagram + LinkedIn (e.g. Facebook, X, TikTok, YouTube).
- A full content-calendar product surface (basic scheduling only; rich calendar
  view is a later consideration).
- External/client self-serve access (internal team only).
- Microsoft Entra ID SSO (auth provider to be recommended in design; not a hard
  requirement for v1).

## Impact

- **Files affected:** ~40–80 (estimated — greenfield project, full app scaffold)
- **Complexity:** large
- **Risk:** medium — multiple third-party integrations (OpenAI, Canva, Instagram
  Graph API, LinkedIn API) each with their own auth, rate limits, and review/app
  approval requirements; scheduled publishing requires a reliable background
  job/queue.

## Open Questions

1. **Auth provider:** Custom auth, a managed auth provider (e.g. Auth0/Clerk), or
   Microsoft Entra ID SSO? (Team is on a Microsoft stack — Entra is a natural fit
   but was not made a hard requirement.) To be settled in design.
2. **Database choice & Azure data service:** e.g. Azure Database for PostgreSQL
   vs Azure SQL; ORM choice (Prisma, etc.). To be settled in design.
3. **Asset/image storage:** Azure Blob Storage for generated images and exported
   designs — confirm.
4. **Social API access:** Instagram publishing requires a Meta Business app +
   Instagram Graph API with app review; LinkedIn requires a LinkedIn app with the
   appropriate posting permissions. Who owns obtaining these credentials/approvals,
   and what is the timeline?
5. **Canva API access:** Confirm the Canva Connect API plan/credentials and that
   the existing brand kit + templates are reachable via the API for auto-fill and
   export. How many brand templates should v1 support?
6. **Scheduler infrastructure:** Azure-native scheduling (e.g. Container Apps jobs,
   Azure Functions timer, or a queue + worker) — to be settled in design.
7. **OpenAI cost/rate controls:** Any per-user or per-period generation limits to
   control spend?
8. **Brand voice / guardrails:** Are there compliance constraints on healthcare
   marketing copy (claims, disclaimers) the copy generation must respect?

---

**To proceed:** Review this proposal and approve to begin planning.
