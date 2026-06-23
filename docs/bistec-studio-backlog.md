# bistec-studio — Project Backlog

**Project:** bistec-studio  
**Client:** Bistec (Internal Marketing Tool)  
**Prepared:** 2026-06-22  
**Branch:** `specclaw/marketing-post-studio-v1`

---

## What We're Building

bistec-studio is an internal web tool that lets any Bistec team member turn a short brief into a finished, on-brand, ready-to-publish social media post for Instagram and LinkedIn — without needing prior brand or marketing knowledge.

**Tech stack:** Next.js 14, TypeScript, PostgreSQL, Prisma, MinIO, better-auth (self-hosted), Docker Compose, Puppeteer (HTML→PNG rendering), Claude AI (design agent), OpenAI (copy + image generation).

---

## Summary

| Wave | Focus | Tasks | Estimate | Status |
|------|-------|-------|----------|--------|
| Wave 1 | Scaffold + Infrastructure + Design System | 5 | 3.5 days | ✅ Complete |
| Wave 2 | AI Provider Abstraction Layer | 4 | 2 days | Pending |
| Wave 3 | HTML Renderer + Claude Design Agent + MinIO | 2 | 1.5 days | Pending |
| Wave 3b | Brand Kits, Projects & Campaigns | 3 | 4.5 days | Pending |
| Wave 4 | Brief Wizard + Generation Pipeline | 5 | 4.5 days | Pending |
| Wave 5 | Publishing, Scheduling & Library | 4 | 4 days | Pending |
| Wave 6 | Admin Settings + AGUI Refinement + E2E Tests | 6 | 6.5 days | Pending |

**Total: 29 tasks · ~26.5 estimated dev days**

---

## Wave 1 — Scaffold & Infrastructure ✅ COMPLETE

> Establishes the project skeleton: Next.js app, Docker Compose services, database schema, authentication, and the base design system all other screens depend on.

| ID | Task | Estimate | Depends On | Status |
|----|------|----------|------------|--------|
| T01 | Initialize Next.js 14 + TypeScript project | 0.5 day | — | ✅ Done |
| T02 | VPS infrastructure setup (Docker Compose) | 1 day | T01 | ✅ Done |
| T03 | Prisma schema + initial migration | 0.5 day | T02 | ✅ Done |
| T04 | Clerk auth integration + role middleware | 0.5 day | T01 | ✅ Done |
| T25 | Design system foundation (Frozen Light theme + base components) | 1 day | T01 | ✅ Done |

**Deliverables:** Running Next.js app, Docker Compose with 4 services (app, scheduler, PostgreSQL, MinIO), full Prisma data model, Clerk auth protecting all routes, Frozen Light glass UI theme with 6 reusable base components.

---

## Wave 2 — AI Provider Abstraction Layer

> Defines the stable interfaces that decouple the frontend from any specific AI model. Adding a new model in future = one new file, no frontend changes.

| ID | Task | Estimate | Depends On | Status |
|----|------|----------|------------|--------|
| T05 | Define provider interfaces (CopyProvider, ImageProvider, DesignOrchestrator) | 0.5 day | T01 | Pending |
| T06 | OpenAI copy provider (GPT-4o mini) | 0.5 day | T05 | Pending |
| T07 | OpenAI image provider (gpt-image-2) | 0.5 day | T05 | Pending |
| T08 | Provider registry (resolves active provider from config) | 0.5 day | T06, T07 | Pending |

**Deliverables:** TypeScript provider interfaces, OpenAI copy + image implementations, provider registry with `DESIGN_PROVIDER=cli` test-mode support (allows full testing without Anthropic API key).

---

## Wave 3 — HTML Renderer + Claude Design Agent + MinIO

> Builds the two core infrastructure modules everything else depends on: the Claude tool-use agent loop that generates HTML/CSS designs, and the MinIO object storage client for all file uploads.

| ID | Task | Estimate | Depends On | Status |
|----|------|----------|------------|--------|
| T09 | HTML renderer (Puppeteer) + Claude design agent harness | 1 day | T01, T10 | Pending |
| T10 | MinIO storage client | 0.5 day | T02 | Pending |

**Deliverables:** `renderHtmlToPng()` function (headless Chromium, 2× DPI), Claude tool-use agent loop (15 tool call limit), 3 agent tools (`generateImage`, `renderHtml`, `getBrandKitContext`), MinIO upload/presign client.

---

## Wave 3b — Brand Kits, Projects & Campaigns

> Adds the brand management and content hierarchy data layer. These entities are referenced by the brief wizard and generation pipeline in Wave 4.

| ID | Task | Estimate | Depends On | Status |
|----|------|----------|------------|--------|
| T26 | Brand kit management (API routes + admin UI) | 2 days | T03, T04, T09, T10, T25 | Pending |
| T23 | Project & Campaign API routes | 1 day | T03, T04, T26 | Pending |
| T24 | Projects & Campaigns UI | 1.5 days | T23, T25 | Pending |

**Deliverables:** Full brand kit CRUD (colors, fonts, logo, HTML templates, versioned voice prompt, AI-assisted prompt generate/improve), project + campaign CRUD with soft-delete/recovery, brand kit resolution chain (campaign → project → system default).

---

## Wave 4 — Brief Wizard + Generation Pipeline

> The core product flow: user fills in a brief, the system generates copy and a designed image post via Path A (template-based) or Path B (AI-generated freeform design).

| ID | Task | Estimate | Depends On | Status |
|----|------|----------|------------|--------|
| T11 | Brief creation (DB + API route + wizard UI) | 1 day | T03, T04, T08, T23, T25, T26 | Pending |
| T12 | Copy generation route + image tool handler | 0.5 day | T08, T10, T11 | Pending |
| T13 | Path A: design assembly (preset brand template) | 1 day | T09, T12 | Pending |
| T14 | Path B: Claude freeform HTML design orchestrator | 2 days | T09, T12, T08, T26 | Pending |
| T15 | Export route (re-render on demand) | 0.5 day | T09, T10 | Pending |

**Deliverables:** 5-step brief wizard (platform/path, campaign, copy prompt, images, review), Path A template-fill pipeline, Path B freeform AI design pipeline, PNG export via Puppeteer → MinIO.

---

## Wave 5 — Publishing, Scheduling & Library

> Publishes finished designs to Instagram and LinkedIn, supports scheduling for future posts, and gives users a browsable library of all their work.

| ID | Task | Estimate | Depends On | Status |
|----|------|----------|------------|--------|
| T16 | Social publisher: Instagram + LinkedIn | 1 day | T03 | Pending |
| T17 | Publish + schedule API routes | 1 day | T15, T16, T04 | Pending |
| T18 | Scheduler worker (Docker container, polls every 60s) | 1 day | T17 | Pending |
| T19 | Asset library + publish history (API + drill-down UI) | 1 day | T17, T23, T25 | Pending |

**Deliverables:** Instagram Graph API publisher, LinkedIn UGC Posts API publisher, publish/schedule endpoints, background scheduler container, library UI with Project → Campaign → Uncategorized drill-down filtering.

---

## Wave 6 — Admin Settings + AGUI Refinement + E2E Tests

> Completes the admin surface (AI provider registration), the chat-driven design refinement panel, and end-to-end test coverage across all acceptance criteria.

| ID | Task | Estimate | Depends On | Status | Note |
|----|------|----------|------------|--------|------|
| T27 | Prisma migration: DraftRevision + schema updates | 0.5 day | T03 | Pending | Run first |
| T20 | Admin: AI provider management settings UI | 1 day | T04, T08, T25 | Pending | |
| T21 | Draft refinement UI + AGUI backend | 2 days | T13, T14, T15, T25, T27 | Pending | ⚠️ Use Opus |
| T28 | bistec-studio MCP server | 1 day | T26, T14, T17 | Pending | |
| T22 | End-to-end tests (Playwright) | 2 days | T20, T21, T19 | Pending | |
| T29 | bistec-studio ACP server | 0.5 day | T28 | Pending | |

**Deliverables:** Provider registration UI (API key auto-detect, encrypted storage), AGUI chat-driven design refinement with brand-kit conflict cards + undo stack, MCP server (admin brand kit tooling via CLI), ACP server (agent-to-agent protocol), full Playwright E2E test suite.

> ⚠️ **T21 note for build team:** this task covers the most complex stateful backend logic in the project (brand kit conflict/override flow, `pendingConflict` state, undo stack, Puppeteer re-render on restore). Allocate extra review time and use the highest available model tier.

---

## Dependencies Outside the Build Team

These items are not code tasks but block specific waves:

| Blocker | Blocks | Owner | Action Required |
|---------|--------|-------|-----------------|
| Docker Desktop installed on VPS | All waves (runtime) | DevOps | ✅ Done locally |
| Clerk account + API keys | Wave 1 runtime / all auth | PM / Dev | Create at clerk.com, add keys to `.env` |
| Anthropic API key (`sk-ant-`) | Wave 3+ (design agent) | PM / Dev | Get from console.anthropic.com |
| OpenAI API key (`sk-`) | Wave 2+ (copy + image) | PM / Dev | Get from platform.openai.com |
| Meta Business app review | Wave 5 (Instagram publish) | PM | **Start immediately — can take weeks** |
| LinkedIn app permissions | Wave 5 (LinkedIn publish) | PM | Apply early — gated approval process |
| Brand HTML/CSS templates | Wave 3b (brand kit setup) | Design / Dev | Author initial templates for Bistec brand |
| Brand fonts (self-hostable) | Wave 3b | Legal / Design | Confirm web license; provide woff2 files |

---

## Acceptance Criteria Summary

The build is considered v1 complete when all of the following pass:

- Any team member can go from a brief to a published post on Instagram + LinkedIn without brand/channel knowledge
- Path A (template-based) and Path B (AI-generated) both produce on-brand PNG exports
- AGUI chat refinement updates the design; undo restores prior revisions
- Admin can register/disable AI providers without a redeploy
- Scheduled posts fire within ±2 minutes of target time and survive a restart
- No API key or secret appears in any browser network response
- All 6 Playwright E2E test suites pass in CI

---

*Document generated from `.specclaw/changes/marketing-post-studio-v1/tasks.md` · bistec-studio v1*
