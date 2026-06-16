# bistec-studio — Claude Context

This repo contains planning documents and a working prototype for **bistec-studio**, an internal marketing post generation tool for the Bistec marketing team.

## What this project is

A Next.js 14 + TypeScript web app that turns a brief into a finished, on-brand, ready-to-publish social media post (Instagram + LinkedIn). Two generation paths:
- **Path A** — preset Canva brand template, Claude element resolver fills layers
- **Path B** — GPT-4o orchestrates Canva MCP tools, Canva generates the design

Stack: Next.js 14, TypeScript, Prisma, PostgreSQL, MinIO, Clerk auth, Docker Compose. Canva integration via MCP server (server-side only).

## Key reference documents

### UI / Page structure
Before building or modifying any page, read the prototype structure outline:
- **[`bistec-studio-prototype/PROTOTYPE_STRUCTURE.md`](bistec-studio-prototype/PROTOTYPE_STRUCTURE.md)** — structural outline of all 9 screens (Dashboard, Brief Wizard, Draft Refinement, Library, Projects, Project Detail, Campaigns, Campaign Detail, Settings). Use this as the ground truth for layout, component hierarchy, data displayed, and navigation flows.
- **[`docs/ui-reference/DESIGN_SYSTEM.md`](docs/ui-reference/DESIGN_SYSTEM.md)** — the design system for bistec-studio. Read this before writing any component or page. Also reference [`docs/ui-reference/screen-dark.png`](docs/ui-reference/screen-dark.png) and [`docs/ui-reference/screen-light.png`](docs/ui-reference/screen-light.png) for visual reference, and [`docs/ui-reference/synthetix-original-reference.html`](docs/ui-reference/synthetix-original-reference.html) for the source HTML reference.
### Architecture & technical design
Before writing any backend code, API routes, Prisma models, or provider logic, read the design document:
- **[`.specclaw/changes/marketing-post-studio-v1/design.md`](.specclaw/changes/marketing-post-studio-v1/design.md)** — authoritative source for the Prisma schema, all API route contracts, the AI provider abstraction layer (`CopyProvider`, `ImageProvider`, `DesignOrchestrator` interfaces), the Canva MCP client wrapper, MinIO integration, AGUI backend flow, provider registration encryption, and the full file/folder structure of the real app. Any implementation that touches data models, API routes, or provider logic must align with this document.

### Specification & planning
- **[`handoff.md`](handoff.md)** — session handoff with current decisions, confirmed Canva brand kit IDs, Path B validation results, AGUI spec, provider registration flow, and v2 interoperability target
- **[`.specclaw/changes/marketing-post-studio-v1/spec.md`](.specclaw/changes/marketing-post-studio-v1/spec.md)** — full functional requirements (FR-01 through FR-33) and non-functional requirements
- **[`.specclaw/changes/marketing-post-studio-v1/design.md`](.specclaw/changes/marketing-post-studio-v1/design.md)** — architecture, Prisma schema, API routes, provider abstraction layer, file tree
- **[`.specclaw/changes/marketing-post-studio-v1/tasks.md`](.specclaw/changes/marketing-post-studio-v1/tasks.md)** — 28 tasks across 6 waves with estimates and dependencies
- **[`.specclaw/changes/marketing-post-studio-v1/proposal.md`](.specclaw/changes/marketing-post-studio-v1/proposal.md)** — original proposal + post-proposal decisions log

### Per-wave execution plans
| Wave | File | Scope |
|---|---|---|
| 1 | [wave-1-scaffold.md](.specclaw/changes/marketing-post-studio-v1/wave-1-scaffold.md) | App scaffold, Docker Compose, Prisma, Clerk |
| 2 | [wave-2-providers.md](.specclaw/changes/marketing-post-studio-v1/wave-2-providers.md) | AI provider abstraction layer |
| 3 | [wave-3-canva-minio.md](.specclaw/changes/marketing-post-studio-v1/wave-3-canva-minio.md) | Canva MCP client, MinIO |
| 3b | [wave-3b-brand-data-layer.md](.specclaw/changes/marketing-post-studio-v1/wave-3b-brand-data-layer.md) | Brand kit data layer |
| 4 | [wave-4-generation.md](.specclaw/changes/marketing-post-studio-v1/wave-4-generation.md) | Brief → generation pipeline (Path A + B) |
| 5 | [wave-5-publishing.md](.specclaw/changes/marketing-post-studio-v1/wave-5-publishing.md) | Publishing + scheduler |
| 6 | [wave-6-admin-e2e.md](.specclaw/changes/marketing-post-studio-v1/wave-6-admin-e2e.md) | Admin settings, AGUI refinement, E2E tests |

## Architecture decisions to remember

- All AI and Canva calls are **server-side only** — the browser never calls an AI API or Canva directly
- **Brand kit precedence:** Campaign kit → Project default → system default (`BrandKit.isDefault = true`)
- **AI provider resolution order:** Brief's chosen key → `AvailableProvider.isDefault` → env var fallback
- **API keys** stored AES-256-GCM encrypted; only `keyPrefix` shown in UI after registration; full key never returned
- **MinIO** served to browser via pre-signed URLs only — MinIO port never publicly exposed
- **Path B** uses `generate-design` with `brand_kit_id` — confirmed working in 4 Canva MCP tool calls
- **AGUI** (chat-driven refinement): natural language → AI → Canva MCP editing operations → `DraftRevision` row created per edit for undo
- **Canva default brand kit (v1):** `BTG Rebranding 2026` (`kAHIBTHaPcg`)
