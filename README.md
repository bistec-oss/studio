# bistec-studio

An internal marketing post generation tool for the Bistec marketing team. bistec-studio turns a brief into a finished, on-brand, ready-to-publish social media post for Instagram and LinkedIn. It offers two generation paths: **Path A** uses HTML/CSS brand templates stored in the database filled by a Claude agent, while **Path B** generates freeform HTML/CSS designs directly. Both paths use a Claude agent harness and Puppeteer to render the final PNG output.

## Tech Stack

- **Framework:** Next.js 14, TypeScript, React 18
- **Database:** PostgreSQL with Prisma ORM
- **Storage:** MinIO (S3-compatible)
- **Auth:** better-auth (self-hosted)
- **Rendering:** Puppeteer (headless Chromium)
- **AI:** Anthropic Claude API
- **Orchestration:** Docker Compose
- **Testing:** Playwright (E2E)

## Prerequisites

- **Node.js** >=20.6 (required for `--env-file` flag in seed scripts; tested on v24)
- **Docker Desktop** with Docker Compose (for PostgreSQL + MinIO containers)
- **Claude Code CLI** (optional, for CLI-mode generation without Anthropic API key)
- **Chromium/Chrome browser** (Windows hosts: set `PUPPETEER_EXECUTABLE_PATH` in `.env`)

## Quick Start

Follow the **authoritative setup guide** in [`docs/cold-start.md`](docs/cold-start.md) for detailed instructions. The essential steps:

```bash
# 1. Install dependencies
npm install

# 2. Start Docker containers (PostgreSQL + MinIO)
docker compose up -d postgres minio

# 3. Apply database migrations
npx prisma migrate deploy

# 4. Seed admin user + default brand kit
npm run db:seed

# 5. Start the dev server
npm run dev  # http://localhost:3000
```

Log in with username `adminBTG` — the initial password is printed once by the seed script (`npm run db:seed`; or set `SEED_ADMIN_PASSWORD` beforehand). Change it after first login. Accounts sign in by username; the seeded admin is a super-admin and can create more users at `/admin/users`.

## Scripts

| Script                   | Purpose                                               |
| ------------------------ | ----------------------------------------------------- |
| `npm run dev`            | Start Next.js dev server on `http://localhost:3000`   |
| `npm run build`          | Build for production                                  |
| `npm run db:seed`        | Seed admin user + default brand kit                   |
| `npm run test:e2e`       | Run Playwright E2E tests                              |
| `npm run test:e2e:mock`  | Run E2E tests with mocked AI/Puppeteer/social         |
| `npm run test:e2e:serve` | Start test-mode dev server on `http://localhost:3001` |
| `npm run test:e2e:db`    | Set up dedicated test database                        |
| `npm run mcp`            | Run MCP server (`tsx src/mcp/server.ts`)              |
| `npm run typecheck`      | Run TypeScript type checking                          |

## Documentation

- **[docs/cold-start.md](docs/cold-start.md)** — Complete setup & preflight checklist
- **[docs/handoff.md](docs/handoff.md)** — Architecture overview, Path A/B design, provider registration
- **[docs/e2e-test-plan.md](docs/e2e-test-plan.md)** — E2E test catalog (103 passing tests)
- **[docs/code-review-findings.md](docs/code-review-findings.md)** — Code review & remediation status
- **[docs/ui-reference/DESIGN_SYSTEM.md](docs/ui-reference/DESIGN_SYSTEM.md)** — UI/design system
- **[.specclaw/changes/marketing-post-studio-v1/design.md](.specclaw/changes/marketing-post-studio-v1/design.md)** — Architecture, Prisma schema, API routes, provider abstraction
