# Wave 1 — Project Scaffold & Infrastructure

**Change:** marketing-post-studio-v1
**Wave:** 1 of 6
**Tasks:** T01, T02, T03, T04, T25
**Estimate:** 2–3 days
**Prerequisite:** None — this wave starts first.

## Objective

Stand up the complete project skeleton: Next.js app, Docker Compose services, Prisma schema, better-auth (self-hosted email/password auth), and the Frozen Light design system. Every subsequent wave depends on this foundation being in place.

---

## Tasks

### T01 — Initialize Next.js 14 + TypeScript project

- **Files:** `package.json`, `tsconfig.json`, `next.config.ts`, `.env.example`, `Dockerfile`
- **Estimate:** small
- **Depends:** —
- **Notes:** App Router, TypeScript strict mode, Tailwind CSS. `.env.example` documents every required env var (Anthropic key, OpenAI key, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, DB URL, MinIO endpoint/keys, social API tokens, `TOKEN_ENCRYPTION_KEY`). Husky pre-commit hook added to block accidental `.env` commits.

---

### T02 — VPS infrastructure setup (Docker Compose)

- **Files:** `docker-compose.yml`, `.env.example`, `.gitignore`
- **Estimate:** medium
- **Depends:** T01
- **Notes:** `docker-compose.yml` defines four services:
  - `app` — Next.js, port 3000
  - `scheduler` — same image, runs `worker.ts`
  - `postgres` — official PG image, named volume
  - `minio` — MinIO image, two named volumes for data + config, console port 9001 bound to 127.0.0.1 only

  All services use `env_file: .env` — no secrets in compose file. `.gitignore` includes `.env*` except `.env.example`. Pre-commit hook (husky) blocks committing any `.env` file.

---

### T03 — Prisma schema + initial migration

- **Files:** `prisma/schema.prisma`, `prisma/migrations/`
- **Estimate:** small
- **Depends:** T02
- **Notes:** Full schema as defined in `design.md`. Models:
  - `User` — name, email, emailVerified, image, role (ADMIN | EDITOR) — better-auth managed
  - `Session`, `Account`, `Verification` — better-auth session tables
  - `Project` — name, defaultBrandKitId (FK → BrandKit), defaultTone, isDeleted, deletedAt
  - `Campaign` — name, brandKitId (FK → BrandKit, override), defaultTone, isDeleted, deletedAt
  - `ProjectCampaign` — M2M join
  - `CampaignDraft` — M2M join (shared asset linking)
  - `Brief` — topic, description, goal, tone, channels[], designMode, campaignId (nullable), copyProviderKey, imageProviderKey? (optional — overrides system default if Claude calls generateImage), additionalImageUrl (Path A), referenceImageUrls[] (Path B)
  - `Draft` — copyText, imageUrl? (null if Claude used CSS/SVG; set if agent called generateImage), htmlContent, pendingConflict, templateId, exportUrl, status
  - `Post` — channel, status, scheduledAt, publishedAt, platformId, errorReason
  - `BrandKit` — name, colors, fonts, logoUrl, isDefault, isDeleted
  - `BrandKitPrompt` — brandKitId, content, version, isActive
  - `BrandKitArtifact` — brandKitId, type, name, url, feedToAI
  - `BrandKitTemplate` — brandKitId, htmlTemplate, name
  - `AvailableProvider` — slot (COPY | IMAGE), providerKey, label, isEnabled, isDefault

  `DATABASE_URL` points to the `postgres` Docker service. Run `prisma migrate dev` to generate migration files.

---

### T04 — better-auth integration + role middleware

- **Files:** `src/middleware.ts`, `src/app/(auth)/login/page.tsx`, `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/lib/prisma.ts`, `src/app/api/auth/[...all]/route.ts`
- **Estimate:** small
- **Depends:** T01
- **Notes:** Self-hosted auth via better-auth (email + password). Session stored in PostgreSQL via `prismaAdapter`. Middleware checks `better-auth.session_token` cookie; redirects to `/login` when absent. `src/lib/auth.ts` exports `requireRole('admin' | 'editor')` and `getCurrentUser()` used in route handlers. `role` field lives on the User DB row — server-managed only, not writable via sign-up. Login page is a Frozen Light–themed custom form. No external auth SaaS. Env vars: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`.

---

### T25 — Design system foundation (Frozen Light theme + base components)

- **Files:** `tailwind.config.ts`, `src/app/globals.css`, `src/components/theme/ThemeProvider.tsx`, `src/components/theme/ThemeToggle.tsx`, `src/components/layout/AppShell.tsx`, `src/components/ui/` (Button, GlassPanel, GlassInput, Select, SegmentedToggle, StatusChip), `src/app/layout.tsx`
- **Estimate:** medium
- **Depends:** T01
- **Notes:** Implements the design system per `docs/ui-reference/DESIGN_SYSTEM.md`. Key requirements:
  - Tailwind config with light/dark color tokens + `darkMode: "class"`
  - Glass utility classes (`.glass`, `.glass-panel`, `.glass-input`) in globals.css
  - **Dark + light themes mandatory** — `ThemeProvider` follows `prefers-color-scheme` on first visit and persists manual toggle to `localStorage`; inline pre-paint script prevents FOUC
  - **Self-host all fonts/icons** — Inter + JetBrains Mono via `next/font`, icons via `lucide-react` — no external CDN
  - `AppShell` provides the 64px top app bar + 256px sidebar + fluid canvas layout
  - Base components reused across all screen tasks
  - Use Frozen Light as a starting point, not a rigid spec — deviate where screens need it

  ⚠️ **All subsequent UI tasks must read `docs/ui-reference/DESIGN_SYSTEM.md` before writing any component.**

---

## Parallelism within Wave 1

```
T01 (init)
  ├── T02 (Docker) → T03 (Prisma)
  ├── T04 (better-auth)
  └── T25 (Design system)
```

T04 and T25 can run in parallel once T01 is done. T03 requires T02.

---

## Wave 1 Complete When

- [ ] `npm run dev` starts the app without errors
- [ ] All four Docker services start via `docker-compose up`
- [ ] Prisma migration runs cleanly against the Postgres container
- [ ] Unauthenticated request to `/` redirects to `/login`
- [ ] Authenticated admin and editor roles work
- [ ] Dark/light theme toggle persists across page reloads
- [ ] Base glass components render correctly in both themes
