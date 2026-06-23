# Code Review — bistec-studio

**Date:** 2026-06-23
**Scope:** Full system — 101 TypeScript files, 40 API routes, Prisma schema. Static analysis (read-only).
**Method:** 6 parallel area reviewers (Sonnet, high effort) → Opus synthesis (dedup + rank). Single bounded pass to respect a credit budget; findings carry confidence flags and were **not** put through second-pass adversarial verification. The four headline security findings (ACP/MCP auth, draft IDOR, library ownership leak, dead Publish button) were spot-verified by hand against the source and confirmed.
**Status:** ✅ **Remediation complete — all 28 tracked fixes applied & pushed (2026-06-23).** See **[Remediation Status](#-remediation-status--updated-2026-06-23)** below. The original review text (Executive Summary onward) is preserved as the as-found snapshot.

**Findings:** 42 total — 🔴 16 High · 🟡 20 Medium · 🟢 6 Low.
**Top themes:** Correctness (16) · Security (13) · Performance (14).

> **Original posture (as found): At risk.** All headline items are now **fixed** — the ACP/MCP auth bypass, system-wide IDOR, library ownership leak, dead Publish button, plus the final batch: presigned-URL expiry (H10), scheduler locking (H12), transaction atomicity (H7), Prisma indexes (H9), Puppeteer singleton (H11), and the shared-helper dedup (L2).

---

## ✅ Remediation Status — updated 2026-06-23

**All 28 tracked fixes applied** and pushed to `main`. The first 22 landed in commits `a7a1207`, `ca41815`, `278c8a0`, `fa3b862`; the final 6 (H7, H9, H10, H11, H12, L2) in the Opus/Sonnet remediation batch (H9+L2, H7, H12, H11, H10). All batches typecheck clean and `next build` passes; the security set was smoke-tested (admin retains access; ACP returns 401 without a configured key) and the H10 storage model was runtime-verified against MinIO (public anonymous GET 200; private export 403 anonymous / 200 signed). IDs below are the remediation task IDs that map onto the findings.

### Completed (✅)
| ID | Fix | Theme |
|---|---|---|
| H1 | ACP/MCP auth: `isValidKey` allow-list + `/api/acp` exempted from the session middleware so the key check governs and **fails closed** | Security |
| H2 | IDOR: `forbiddenIfNotOwner` + `getDraftOwnerId` enforced on all draft/brief/generate routes | Security |
| H3 | Library filtered to the user's own briefs for non-admins | Security |
| H4 | Campaign/project `PATCH`+`DELETE` gated on admin | Security |
| H5 | Publish button wired to `POST /api/posts` (was a dead `<Link>`) | Correctness |
| H6 | designAgent closes the tool turn before throwing (no orphaned turn) | Correctness |
| H8 | Upload size + MIME validation (`validateUpload`); briefs/images is raster-only (drops SVG XSS) | Security |
| H13 | `GET /api/me` server-side role (fixed the 404-ing `isAdmin` probe) | Security |
| M1 | Atomic `isDefault` clear+create (`$transaction`) | Correctness |
| M2 | `initBuckets` caches an in-flight Promise (race) | Correctness |
| M3 | `ClaudeCliOrchestrator` routes through shared stdin helper | Correctness |
| M4 | `resolveBrandKit` skips soft-deleted campaigns/kits | Correctness |
| M5 | Artifact `DELETE` clears `BrandKit.logoUrl` / removes font entry | Correctness |
| M6 | ACP `run` validates `generate_post`/`publish_post` input → 400 | Correctness |
| M7 | Draft page polls while `IN_PROGRESS` | Perf/UX |
| M8 | `decrypt` guards short payloads + generic error; `BETTER_AUTH_SECRET` fail-fast | Security |
| M9 | middleware exact-prefix match + documented presence-gate | Security |
| M10 | masked **last-4** `keyPrefix` (was a 12-char leading slice) | Security |
| M11 | bounded `campaigns`/`projects` queries (`take: 200`) | Perf |
| M12 | parallelized brief validation (`Promise.all`) + library `posts` `select` projection | Perf |
| M13 | removed dead `uploadFile()` (broken IIFE) | Maintainability |
| L1 | Instagram token → `Authorization: Bearer` header; MCP uses a real system-user id (FK fix) | Security |
| H7 | Transaction atomicity — refine revision #, prompt version, and posts create→publish wrapped in `$transaction`; P2002 → retry/409. (`@@unique([draftId,revisionNumber])` already existed, so no migration was needed.) | Correctness |
| H9 | Prisma indexes — `Post(status,scheduledAt)` + `(status,nextRetryAt)`, FK indexes (Post, Draft, Brief, Session, Account, BrandKitTemplate, BrandKitArtifact), `BrandKit(isDefault,isDeleted)`. Migration `20260623153740_h9_indexes`. | Performance |
| H10 | Hybrid storage — public-read policy on IMAGES + BRANDKITS buckets (stable embeddable URLs); EXPORTS stays private, object **key** stored and signed at read (`resolveExportUrl`). ~17 write/read/publish sites updated. | Security/Durability |
| H11 | Puppeteer singleton browser reused across renders (page-per-render), relaunch-on-disconnect, `p-limit` concurrency cap (`PUPPETEER_MAX_CONCURRENCY`, default 2). | Performance |
| H12 | Scheduler atomic claim (`FOR UPDATE SKIP LOCKED` via `UPDATE … RETURNING`) with a `PUBLISHING` lease state + exponential-backoff retry (`retryCount`, `nextRetryAt`, MAX 5); reuses the prisma singleton. Migration `20260623154752_h12_scheduler_claim`. | Correctness |
| L2 | Extracted shared `apiFetch` (`src/lib/apiFetch.ts`, replaced 8 copies) + `buildBrandKitSystemContext` (`src/lib/brandkit/systemContext.ts`, replaced 4 copies); consolidated library fetch effects. | Maintainability |
| — | **bonus:** `getCurrentUser` role-casing normalised (`ADMIN`→`admin`) | Correctness |

### Remaining (⬜)

None — all 28 tracked fixes are complete.

### Deferred sub-items (intentional — do not "fix" blindly)
- **Anthropic client → module scope** (a sub-item of M13): **NOT applied** — `new Anthropic({ apiKey: undefined })` throws at *import* time in CLI mode (`DESIGN_PROVIDER=cli`, no key), and the assemble routes import this module even in CLI mode. Per-request instantiation is required here.
- **`requireRole('editor')` rename** (a sub-item of M10): not a real bug — `editor` is the auth floor, so requiring it == requiring authentication. Only the `keyPrefix` part was a real issue (fixed).
- **Icon-button `aria-label`s** (a sub-item of M13): cosmetic a11y polish, deferred.

---

## 🐛 Known Issue — oversized brand template breaks Path A (NEW, 2026-06-23)

**Symptom:** Path A (template) generation fails with:
`Prompt too large for CLI mode (1899849 chars > 600000). This usually means the brand template is too big — use a smaller template or Path B.`

**Root cause:** the seeded **"Hearts Talk 1080×1080"** template is **1.81 MB (~1,896,301 chars / ~475k tokens)** because its image/font assets are embedded inline as `data:` URIs. Path A inlines the entire template into the generation prompt, which trips the 600k-char guard in `src/lib/agent/claudeCli.ts`. **Not CLI-specific** — 1.9M chars also **exceeds the Anthropic API's ~200k-token context window**, so the API path would fail too (it just wouldn't surface as clean an error). The guard is working as intended; the data is the problem.

**Severity:** Medium · **Effort:** medium.

**Workarounds (today):** for Path A use the small **"Simple Gradient Card"** template (Bistec kit); or use **Path B** (freeform — no template is embedded, always works in CLI mode).

**Fix:** re-author/re-seed the Hearts Talk template (`scripts/seed-hearts-talk.mjs`) with **externalized, MinIO-hosted asset URLs** instead of inlined `data:` URIs, so the stored HTML is a few KB. Related to **H10** (object-key storage) but fundamentally a template-authoring change.

---

## Executive Summary

bistec-studio is functionally complete across all six reviewed areas, but it carries a concentrated set of correctness and security defects that must be closed before any production or multi-user load. The single most severe issue is broken authentication on the ACP/MCP surface: `hasAnyKey()` treats any non-empty header value as authenticated, leaving `generate_post` and `publish_post` open to the internet. This is compounded by pervasive IDOR — nearly every draft-, brief-, and generation-scoped route confirms authentication but never checks ownership, so any editor can read, mutate, or run billed AI work against anyone's content. On the durability side, every uploaded asset is stored as a 7-day presigned URL written directly into DB columns, which means the entire visual layer silently 403s after a week. Performance posture is weak under concurrency: Puppeteer spawns a fresh Chromium per render with no reuse or cap, the scheduler full-scans an unindexed `Post` table every tick with no locking (risking duplicate publishes) and no retry path. The crypto core, brand-kit resolution, and copy providers are sound, and admin routes consistently enforce `requireRole('admin')`.

**Posture: At risk** — the auth bypass, system-wide IDOR, and 7-day URL expiry are each independently capable of causing data exposure or a broad production outage.

## Top Priorities

1. **ACP/MCP auth accepts any non-empty string** — `src/mcp/auth.ts:11-13` (used by `src/app/api/acp/run/route.ts:10` and `.../acp/manifest/route.ts`). `hasAnyKey()` returns `Boolean(apiKey?.trim())`, so any one-character header authenticates calls to `generate_post`/`publish_post`. **Fix:** validate against a real key set (`isAdminKey` / a `BISTEC_API_KEYS` allow-list); remove `hasAnyKey`. **Severity: High · Effort: S**
2. **System-wide IDOR on draft/brief/generation routes** — `src/app/api/drafts/[id]/route.ts:51-84` plus `revisions/route.ts`, `revisions/[rev]/restore/route.ts`, `refine/route.ts:46`, and all `generate/*` routes. Auth is confirmed but `draft.brief.userId` is never compared to `user.userId`. **Fix:** add a shared `assertOwnerOrAdmin(record, user)` helper and call it after load in every route. **Severity: High · Effort: M**
3. **7-day presigned URLs persisted to DB, served stale forever** — `src/lib/storage/minio.ts:25,47-70`. URLs flow into `Draft.exportUrl`, `BrandKitArtifact.url`, `BrandKit.logoUrl`, `DraftRevision.exportUrl`; after 7 days all 403, and `generate/export/route.ts:17` returns the dead URL without re-signing. **Fix:** store the object key only and sign at read time (public-read bucket for logos). **Severity: High · Effort: M**
4. **Puppeteer spawns a new Chromium per render, no concurrency cap** — `src/lib/renderer/puppeteer.ts:32-45`, called per `renderHtml` tool use and unbounded by `assemble-a`/`assemble-b` (`.../assemble-b/route.ts:121-129`). **Fix:** module-level singleton browser + page pool + `p-limit` semaphore on the agent run. **Severity: High · Effort: M**
5. **Scheduler: unindexed hot query, no locking, no retry** — `src/lib/scheduler/jobRunner.ts:11-24,56-72` + `prisma/schema.prisma:197-210`. Full table scan every 60s tick; concurrent workers double-publish; transient failures are permanently `FAILED`. **Fix:** add `@@index([status, scheduledAt])`, claim rows atomically (`UPDATE ... RETURNING` or `FOR UPDATE SKIP LOCKED`), add `retryCount`/`nextRetryAt` with backoff. **Severity: High · Effort: M**
6. **Agent tool-error leaves message history invalid** — `src/lib/agent/designAgent.ts:144-153`. On a multi-tool turn, a throw discards already-built `toolResults`, orphaning the assistant turn. **Fix:** build all tool_results (including errors), push the user message unconditionally, then re-throw. **Severity: High · Effort: S**
7. **Revision numbering race / non-atomic writes** — `src/app/api/drafts/[id]/refine/route.ts:147-173`. `findFirst(max)+1` then `create` outside a transaction yields duplicate revision numbers. Same TOCTOU shape in prompt versioning (`admin/brandkits/[id]/prompts/route.ts:27-49`) and `isDefault` toggles. **Fix:** wrap in `prisma.$transaction`; add `@@unique([draftId, revisionNumber])`. **Severity: High · Effort: M**
8. **Mutating campaign/project routes lack admin/ownership gate** — `src/app/api/campaigns/[id]/route.ts:22-70`, `src/app/api/projects/[id]/route.ts:23-60`. Rename/delete only require `getCurrentUser()`. **Fix:** gate PATCH/DELETE on `requireRole('admin')`. **Severity: High · Effort: S**
9. **Library returns all users' drafts** — `src/app/api/library/route.ts:28-90`. No `userId` filter for non-admins. **Fix:** add `...(user.role !== 'admin' && { brief: { userId: user.userId } })` to `findMany` and `count`, mirroring `posts/route.ts:96`. **Severity: High · Effort: S**
10. **Publish button navigates instead of publishing** — `src/app/(app)/drafts/[id]/page.tsx:527-530`. A `<Link href="/library">` wraps the button; `disabled` is ignored, no publish POST fires. **Fix:** replace with an onClick that calls the publish API / opens `PublishDialog`. **Severity: High · Effort: S**

## Quick Wins

- [ ] Replace `hasAnyKey` with real key validation in `src/mcp/auth.ts:11-13` and ACP routes
- [ ] Add `userId` ownership filter to `src/app/api/library/route.ts:28-90`
- [ ] Gate campaign/project PATCH+DELETE on `requireRole('admin')` (`campaigns/[id]/route.ts`, `projects/[id]/route.ts`)
- [ ] Fix Publish button to call the API in `drafts/[id]/page.tsx:527-530`
- [ ] Move agent tool-error throw outside the loop in `designAgent.ts:144-153`
- [ ] Add `@@index([status, scheduledAt])`, FK indexes, and `@@index([isDefault, isDeleted])` in `prisma/schema.prisma`
- [ ] Wrap `updateMany`+`create` `isDefault` toggles in `$transaction` (`admin/providers/route.ts:82-92`, `admin/brandkits/route.ts:33-45`)
- [ ] Wrap `decrypt()` in try/catch returning a generic error; add length guard (`src/lib/crypto.ts:27-36`)
- [ ] Add file-size + MIME allow-list checks to upload routes (`briefs/images/route.ts`, `admin/brandkits/[id]/upload/route.ts`, `artifacts/route.ts`)
- [ ] Reuse the `@/lib/prisma` singleton in `src/lib/scheduler/jobRunner.ts:6`
- [ ] Move Anthropic client to module scope (`designAgent.ts:91`, `prompts/generate/route.ts:29`, `improve/route.ts:21`)
- [ ] Add a `select` projection to the `posts` include in `library/route.ts:68-89`
- [ ] Parallelize the 4 brief validation lookups with `Promise.all` (`briefs/route.ts:49-84`)
- [ ] Add `isDeleted: false` guard to the campaign branch of `resolveBrandKit` (`resolve.ts:37-48`)
- [ ] Migrate `ClaudeCliOrchestrator` to stdin via the shared `runClaudeCli` helper (`claude-cli.ts:30`)
- [ ] Pre-add `IN_PROGRESS` polling effect on `drafts/[id]/page.tsx:386-389`

## Findings by Theme

### Performance

| Severity | File:Line | Issue | Fix | Effort |
|---|---|---|---|---|
| High | `src/lib/renderer/puppeteer.ts:32-45` | New Chromium per render, no reuse | Singleton browser + page pool + semaphore | M |
| High | `src/app/api/generate/assemble-b/route.ts:121-129` | No concurrency cap on generation (Puppeteer + Anthropic) | `p-limit` around agent run; backoff on 429 | S |
| High | `prisma/schema.prisma:197-210` | No index on `Post.status/scheduledAt` or FKs | Add `@@index([status, scheduledAt])` + FK/`isDefault` indexes | S |
| High | `src/app/(app)/brief/page.tsx:256-271` | 5 fetches fired serially on mount | Single `Promise.all`, batch setState | S |
| Medium | `src/app/api/campaigns/route.ts:5-21`, `projects/route.ts:9-17` | List endpoints unbounded (no pagination) | Add `take`/`skip` envelope like `/api/posts` | M |
| Medium | `src/app/api/library/route.ts:68-89` | `posts` include over-fetches all columns | Add `select` projection | S |
| Medium | `src/app/api/briefs/route.ts:49-84` | 4 serial validation queries | `Promise.all` the independent lookups | S |
| Medium | `src/app/api/generate/assemble-b/route.ts:23-36` | Brand-kit resolved twice (route + agent tool) | Pass resolved context into system prompt | M |
| Medium | `src/app/api/generate/image/route.ts:22-28` | Base64 decode/upload duplicated, double memory | Extract `uploadDataUri` shared helper | S |
| Medium | `src/lib/social/linkedin.ts:97-107` | Full image buffered before PUT | Pipe `imageResponse.body` stream | S |
| Medium | `src/lib/scheduler/jobRunner.ts:6` | Separate `PrismaClient` → extra pool | Reuse `@/lib/prisma` singleton | S |
| Medium | `src/app/(app)/admin/brandkits/page.tsx:760-763` | Two API calls per mutation | Derive selected kit from list, or `Promise.all` | S |
| Medium | `src/app/(app)/brief/page.tsx:408-418` | Derived lists recomputed each render | `useMemo` with proper deps | S |
| Low | `src/lib/agent/designAgent.ts:91`, `admin/brandkits/[id]/prompts/generate/route.ts:29`, `improve/route.ts:21` | Anthropic client re-instantiated per request | Module-scope singleton | S |

### Correctness

| Severity | File:Line | Issue | Fix | Effort |
|---|---|---|---|---|
| High | `src/lib/agent/designAgent.ts:144-153` | Tool error orphans message history on multi-tool turn | Build all results, push, then re-throw | S |
| High | `src/app/api/drafts/[id]/refine/route.ts:147-173` | `commitRevision` revision-number race | `$transaction` + `@@unique([draftId,revisionNumber])` | M |
| High | `src/app/api/admin/brandkits/[id]/prompts/route.ts:27-49` | Prompt version TOCTOU → P2002 500 | Transaction; catch P2002 → 409 | S |
| High | `src/app/api/posts/route.ts:44-85` | Create-then-publish not atomic → PENDING orphans | `$transaction`; create SCHEDULED directly | M |
| High | `src/lib/scheduler/jobRunner.ts:11-24` | No locking → duplicate publishes multi-instance | Atomic claim (`UPDATE ... RETURNING` / `SKIP LOCKED`) | M |
| High | `src/lib/scheduler/jobRunner.ts:56-72` | No retry/backoff; transient failures terminal | Add `retryCount`/`nextRetryAt` + backoff | M |
| High | `src/app/(app)/drafts/[id]/page.tsx:527-530` | Publish button navigates, never publishes | onClick → publish API / `PublishDialog` | S |
| Medium | `src/app/api/admin/providers/route.ts:82-92`, `admin/brandkits/route.ts:33-45` | `isDefault` clear-then-set non-atomic | Wrap pair in `$transaction` | S |
| Medium | `src/lib/storage/minio.ts:35-45` | `bucketsInitialized` boolean race on cold start | Cache a `Promise<void>` singleton | S |
| Medium | `src/providers/implementations/orchestrator/claude-cli.ts:30` | Prompt as argv truncates on Windows | Use stdin via shared `runClaudeCli` | S |
| Medium | `src/lib/brandkit/resolve.ts:37-48` | Campaign branch misses `isDeleted: false` | Add soft-delete guard (use `findFirst`) | S |
| Medium | `src/app/api/admin/brandkits/[id]/artifacts/[aid]/route.ts:27-38` | LOGO/FONT delete doesn't clear `logoUrl`/fonts | Sync kit fields in DELETE handler | S |
| Medium | `src/app/api/acp/run/route.ts:26-32` | Raw input passed to generate/publish unvalidated | Zod-validate required fields → 400 | S |
| Medium | `src/lib/agent/designAgent.ts:121-123` | Tool-limit check rejects partially-fitting batch | Check `>= maxToolCalls` per-tool in loop | S |
| Medium | `src/app/(app)/drafts/[id]/page.tsx:386-389` | No polling for `IN_PROGRESS` drafts | Poll `fetchDraft()` until EXPORTED/FAILED | S |
| Low | `src/mcp/tools/generate.ts:32-45`, `publish.ts:22` | `userId='mcp-agent'` FK violation | Seed system user or make sourced userId optional | S |

### Security

| Severity | File:Line | Issue | Fix | Effort |
|---|---|---|---|---|
| High | `src/mcp/auth.ts:11-13` | `hasAnyKey` accepts any non-empty string (ACP + MCP) | Validate against real key set; remove `hasAnyKey` | S |
| High | `src/app/api/drafts/[id]/route.ts:51-84` (+revisions, restore, refine, all `generate/*`) | IDOR — no ownership check | Shared `assertOwnerOrAdmin` after load | M |
| High | `src/app/api/campaigns/[id]/route.ts:22-70`, `projects/[id]/route.ts:23-60` | Mutations open to any editor | Gate PATCH/DELETE on `requireRole('admin')` | S |
| High | `src/app/api/library/route.ts:28-90` | Lists all users' drafts | Add non-admin `userId` filter | S |
| High | `src/app/api/admin/brandkits/[id]/upload/route.ts:11-23`, `artifacts/route.ts:28-42`, `briefs/images/route.ts:9-28` | No file-size/MIME validation (SVG/HTML XSS risk) | MAX_SIZE + MIME allow-list; sanitize SVG | S |
| High | `src/app/(app)/drafts/[id]/page.tsx:391-399`, `library/page.tsx:229` | Client-side `isAdmin` gating, fragile shape | Pass role from layout / add `/api/me` | M |
| Medium | `src/lib/crypto.ts:27-36` | GCM auth-tag failure leaks node error to caller | try/catch → generic error; add length guard | S |
| Medium | `src/middleware.ts:13-16` | Cookie-presence check ≠ valid session | Validate via `getSession()` or document + test re-validation | M |
| Medium | `src/lib/auth.ts:7-15` | `BETTER_AUTH_SECRET` not validated at startup | Throw on missing/placeholder secret | S |
| Medium | `src/lib/auth.ts:19-27` | `requireRole('editor')` silently no-ops | Rename to `requireAdmin`; add real `requireEditor` | S |
| Medium | `src/app/api/admin/providers/route.ts:87` | 12-char key prefix stored (excessive) | Store last 4 / structural prefix only | S |
| Low | `src/lib/social/instagram.ts:27-37` | Access token in POST body → log exposure | Use `Authorization: Bearer` header | S |
| Low | `src/middleware.ts:3-9` | Prefix `startsWith` overlap risk | Match `=== p || startsWith(p + '/')` | S |

### Reuse & Duplication

| Severity | File:Line | Issue | Fix | Effort |
|---|---|---|---|---|
| Low | `src/app/api/generate/assemble-b/route.ts:68-88` (+assemble-a, refine) | Brand-kit prompt construction triplicated, already drifting | Extract `buildBrandKitSystemContext` | M |
| Low | `src/app/(app)/brief/page.tsx:108-115` (+5 pages) | `apiFetch` copy-pasted | Extract `src/lib/apiFetch.ts` | S |

### Maintainability

| Severity | File:Line | Issue | Fix | Effort |
|---|---|---|---|---|
| Medium | `src/app/(app)/admin/brandkits/page.tsx:383-391` | `uploadFile` dead code with broken IIFE FormData | Remove it | S |
| Low | `src/app/api/admin/brandkits/[id]/upload/route.ts:18` | Unused `ext` variable | Remove | S |
| Low | `src/app/(app)/library/page.tsx:274-295` | Duplicate `fetchLibrary` effects double-fire on paging | Consolidate to one effect deriving append | S |

### Accessibility

| Severity | File:Line | Issue | Fix | Effort |
|---|---|---|---|---|
| Medium | `src/app/(app)/admin/brandkits/page.tsx:104-107,622,662` | Icon-only buttons lack `aria-label` | Add descriptive `aria-label`s | S |

## Out of Scope / Notes

- **Merged duplicates:** the ACP/MCP `hasAnyKey` finding (reported by Auth, Provider, and Data-model reviewers), the draft IDOR finding (Auth + Core API), the 7-day presigned-URL finding (Provider + Brand-kit + Storage), the `initBuckets` race (Provider + Brand-kit), per-request Anthropic client, and the `isDefault` non-atomic toggle were each consolidated into a single row keeping the strongest file references.
- **Dropped as low-value/speculative:** the double `getSession()` micro-latency on the campaign PATCH path and the `NAV_ITEMS`/`AppShell.tsx` JSX-identity item (the reviewer themselves noted it evaluates once at module load and is not a per-render problem).
- **Confirmed sound (not re-litigated):** AES-256-GCM internals in `crypto.ts` (random IV, correct tag handling/offsets), admin routes consistently using `requireRole('admin')`, the single-query `resolveBrandKit` include, copy providers (`AnthropicCopyProvider`/`OpenAICopyProvider`), and the `region: "us-east-1"` MinIO setting.
- **Not deeply reviewed:** test suites, Docker Compose / infra config, the newer `claudeCli.ts` path beyond its contrast with the older orchestrator, and runtime behavior under actual load (all findings are static-analysis based). Recommend a focused concurrency/load test of the generation and scheduler paths once Top Priorities 4, 5, and 7 land.
