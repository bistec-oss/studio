# System Improvement Review — 2026-07-02

**Scope:** the entire working system (post-remediation, post model-split). **No changes applied** — this is a documentation-only review to decide where to invest next.

**Method:** four parallel read-only reviewers, one per subsystem:
- **P1–P18** — AI generation pipeline & agent harness (`src/lib/agent`, `src/providers`, renderer, generate/refine routes)
- **A1–A20** — API routes, data layer, auth, storage, publishing, scheduler
- **F1–F20** — Frontend (all pages, components, design system usage)
- **I1–I19** — Infra, Docker, CI, config, testing, DX

All 77 findings were verified against real code with real line numbers (line refs are as of commit `d13cd645`). This review deliberately does **not** re-report anything already fixed in `docs/code-review-findings.md`.

---

## Executive summary

The system is in good shape where it has been deliberately worked: the generation pipeline's operational hardening (tree-kill, inline-asset externalization, singleton browser, per-path models) is captured in code, the storage layer is the best-designed module in the repo, security posture is strong for an internal tool, and the E2E suite + docs are unusually mature. The weaknesses are structural, and they cluster into a small number of themes — most findings are symptoms of ~6 root causes:

1. **Three parallel "brief → design" pipelines** (API tool-use loop, CLI path, and the stale `DesignOrchestrator` layer) with prompts, model choices, and brand-kit assembly duplicated and *already drifted*. Every feature (aspect ratio, model change, prompt rule) is a 3–6 site edit.
2. **No shared route-handler infrastructure** — ~45 handlers each hand-roll auth, JSON parsing, validation (no zod anywhere), and error shaping. That's exactly where the real bugs found here live.
3. **Publish logic implemented four times** (immediate, retry, scheduler, ACP) with four different failure semantics.
4. **Config sprawl** — ~30 `process.env` reads across 20+ files, no validated config module, `.env.example` missing 9 vars.
5. **The Docker production path has never worked** — the Dockerfile expects `output: 'standalone'` that next.config never sets, there's no `.dockerignore` (secrets baked into layers), and the scheduler container references a `.js` file that doesn't exist. CI only ever exercises `next dev`, so all of this is invisible.
6. **Frontend has no data-fetching layer and three god components** (brief wizard 943 lines, brandkits admin 866, draft detail 736); `apiFetch<T = any>` leaves ~70% of API calls untyped; error UX is 33 `window.alert` calls.

**Real bugs found** (system works end-to-end, but these are latent defects): see the bug table below — the headline ones are the channel-casing mismatch (Instagram character limit never applies), draft page showing the wrong brand-kit name when a brief has an explicit kit, and the agent loop re-sending multi-MB inline assets back to the model (a real token-cost bug that partially defeats the Hearts Talk fix).

---

## Confirmed bugs (latent — worth fixing regardless of any refactor)

| ID | Bug | Where |
|---|---|---|
| **F3** | Channel casing mismatch: wizard stores `'instagram'` lowercase, consumers key on `INSTAGRAM` — the 2,200-char Instagram copy limit **never applies**, and channel labels render raw in PostCard | `brief/page.tsx:34` vs `drafts/[id]/page.tsx:81-92`, `PostCard.tsx:53-56` |
| **A1** | Draft detail resolves `brandKitName` without `brief.brandKitId` — a brief with an explicitly selected kit shows the wrong kit name (every other call site was updated for the 06-24 feature; this one was missed) | `src/app/api/drafts/[id]/route.ts:27` |
| **P15** | `designAgent.ts` mutates the SDK response in place, so restored **multi-MB `data:` URIs are sent back to the model** in conversation history on the next turn — re-inflating exactly the payload `inlineAssets` exists to keep out of context (cost + context bug) | `designAgent.ts:158` |
| **P9** | `copy/route.ts` resolves a brand kit it never uses (dead 3-query DB call; and it omits `brief.brandKitId` anyway) | `generate/copy/route.ts:20` |
| **A7** | `CampaignDraft` is dead schema — never written by any code path, yet the library query eagerly joins through it per draft (labels always empty) | `schema.prisma:161-168`, `library/route.ts:92-101` |
| **F4** | Login page uses CSS variables that don't exist (`--bg-base`, `--text-tertiary`) — no dark-mode background on the one unauthenticated screen | `login/page.tsx:34,38` |
| **A5** | `scheduledAt` never validated — a garbage date string passes the branch logic then 500s in Prisma | `posts/route.ts:42-57` |
| **A9** | `isDefault` clear+set is transactional on POST (per fix M1) but **not on PATCH** for both providers and brand kits — a race leaves zero or two defaults | `providers/[id]/route.ts:16-29`, `brandkits/[id]/route.ts:32-48` |
| **A12** | Artifact↔kit `fonts` JSON sync uses a stale pre-upload snapshot — two concurrent font uploads lose one entry | `artifacts/route.ts:47-69` |
| **A15** | ACP `publish_post` ignores draft status (selects it, never checks) and records **no Post row on failure** — violates the "record every publish attempt" requirement the other paths honor | `mcp/tools/publish.ts:8-36` |
| **A20** | No publish idempotency — a double-click on the publish dialog posts the same image twice to the platform | `posts/route.ts:48-71` |
| **F17** | PublishDialog `Promise.all`s per-channel POSTs — if one succeeds and one fails, the UI shows a generic error and re-confirming duplicates the successful channel | `PublishDialog.tsx:41-58` |
| **I1–I3** | Docker prod path cannot work: no `output: 'standalone'`, no `.dockerignore` (`.env` secrets + Windows `node_modules` baked into image), scheduler container runs a nonexistent `worker.js` | `Dockerfile:44,62`, `next.config.mjs:2`, `docker-compose.yml:22` |
| **I4** | Linting is fully non-functional: no `.eslintrc*` exists, so `next lint` fails, and the husky hook never invokes lint-staged — four lint deps installed, zero linting | `package.json`, `.husky/pre-commit` |
| **I9** | `npm run mcp` is broken — `tsx` is not a dependency | `package.json` |
| **F19** | Review step applies `capitalize` to all values — proper nouns mangle ("iPhone launch" → "IPhone Launch") | `brief/page.tsx:940` |

---

## Cross-cutting themes (the refactors that absorb most findings)

### T1 — Collapse to one design pipeline *(absorbs P1, P2, P3, P4, P7, P12)*
The `DesignOrchestrator` layer is a stale third implementation: hardcodes 1080×1080, ignores `Brief.brandKitId`, treats TEMPLATE mode as freeform, and in CLI mode marks drafts `EXPORTED` with an empty export URL — its only caller is MCP `generatePost`. The Path B prompt exists twice (pathB.ts gained aspect-ratio/artifacts/reference-template support; the orchestrator copy didn't — proof the duplication is rotting). All prompts are inline literals in route handlers: unversioned, untestable, with the `__INLINE_ASSET_n__` preservation rule hand-synchronized in 4 variants.
**Direction:** make MCP call `runPathBDesign` directly and delete the orchestrator classes; extract `src/lib/agent/prompts/` with pure builder functions + a `PROMPT_VERSION` stored on Draft; add `modelFor(path, mode)` + `isCliMode()` in one config module (the Haiku/Sonnet policy is currently four pairs of string literals across three routes and two runners).

### T2 — Shared route-handler wrapper + zod *(absorbs A2, A3, A4, A5, A10, P10, A17)*
`requireRole(...) instanceof NextResponse` boilerplate in 21 files; ~14 mutating routes with unguarded `req.json()` (malformed body → 500); PATCH bodies like `{name: 42}` throw `TypeError` → 500; error envelope drifts (`{error}` vs `{code,message}` vs `{error,detail}`) so `apiFetch` probes for both. Briefs POST shows the validation standard exists — it's applied to one route.
**Direction:** `withAuth(handler, {role?})` wrapper that resolves the user, parses/validates the body (zod), catches unexpected errors into one envelope, and logs. ~45 handlers become thin.

### T3 — One `publishDraft` service *(absorbs A6, A15, A16, A20, F17)*
The channel→publisher map is declared three times and the publish-then-record state machine four times, each with different reset/retry/history semantics.
**Direction:** `src/lib/publish/publishDraft(draftId, channel, {userId, mode})` owning the map, export-URL signing, state transitions, and idempotency; the four call sites (posts POST, retry, scheduler, ACP) become adapters.

### T4 — Central validated config *(absorbs P12, A13, I7, I8)*
~30 env vars read ad hoc; a missing `TOKEN_ENCRYPTION_KEY` surfaces deep in a request handler instead of at startup; `.env.example` missing 9 consumed vars (incl. all `POSTGRES_*`); the MinIO container only authenticates by accident of legacy env-var names. The brand-voice prompt routes bypass the encrypted provider registry entirely (`new Anthropic({apiKey: process.env.ANTHROPIC_API_KEY})`, hardcoded model) — key rotation via Admin → Providers silently doesn't reach them.
**Direction:** `src/lib/env.ts` zod-parsed at startup; regenerate `.env.example` from it; route prompt endpoints through provider resolution.

### T5 — Fix the deployment story *(absorbs I1, I2, I3, I5, I10)*
Root cause of all three high-severity infra findings: **no quality gate ever exercises the production build or image.** Also: compose has no healthchecks, Postgres bound to `0.0.0.0` with `bistec:bistec` defaults, `minio:latest` unpinned, and the full `.env` (AI keys, encryption key) fanned out to the MinIO container.
**Direction:** add `output: 'standalone'`, `.dockerignore`, compile the worker; add a CI job running `npm run build` + `docker build`; healthchecks + `127.0.0.1` port binds + pinned tags.

### T6 — Frontend data layer + component decomposition *(absorbs F1, F2, F6, F7, F11, F12, F14, F20)*
Only the dashboard is a server component; every other page mounts empty and waterfalls client fetches (`/api/brandkits` fetched on 5 pages, `isAdmin` fetched 4 ways via 2 endpoints). `apiFetch<T = any>` → 48 of 69 call sites untyped; `Campaign` is defined 3 different ways in 3 pages. The three god components mix fetching, business rules, and rendering; the library's pagination effect is ref-diffing behind an eslint-disable.
**Direction:** adopt SWR/React Query (or RSC initial data + client islands); default `apiFetch<T = unknown>`; shared `src/lib/api-types.ts`; split the wizard into per-step components with a `useBriefWizard` reducer; extract `CopyEditor`/`RefinementPanel` from the draft page; shared `format.ts` + `channel.ts` utils (pairs with F3 fix).

### T7 — Error/confirm UX + a11y baseline *(absorbs F5, F9, F10, F15, F16, F18)*
33 `alert()` + 5 `confirm()` sites; list-fetch failures swallowed to `console.error` so a 403 renders as the *empty* state ("No campaigns yet." — actively misleading for non-admins, who also see the Admin nav they can't use). None of the 4 overlays have dialog semantics/focus trap/Escape; the font combobox is mouse-only; several icon buttons unlabeled.
**Direction:** one toast provider + styled confirm; one `Modal`/`Drawer` primitive (or Radix Dialog) under all overlays; `<PageState loading error empty>`; role-gate the Admin nav.

### T8 — Test pyramid + inner-loop gates *(absorbs I4, I5, I6, I11, I14, I18, I19)*
The entire test surface is a serial 4-minute Playwright suite; pure modules (`inlineAssets` round-trip, `aspectRatio`, `crypto`) have zero unit tests; ESLint is dead config; CI lacks concurrency-cancel, timeout, browser caching; the test helper's module-level session cookie blocks parallelizing workers.
**Direction:** vitest for the pure-logic modules; commit `.eslintrc.json` + wire lint-staged; add `typecheck` script; CI hygiene; migrate `login()` → `loginAs()`.

---

## Full findings by subsystem

Severity: 🔴 high · 🟡 medium · ⚪ low

### Pipeline & agent harness (P)

| ID | Sev | Finding |
|---|---|---|
| P1 | 🔴 | `DesignOrchestrator` is a stale, drifted third pipeline (hardcoded 1080×1080, ignores brief kit, TEMPLATE ignored, CLI orchestrator marks EXPORTED with empty URL) — `claude-html.ts:10-43`, `claude-cli.ts:12-31`, `mcp/tools/generate.ts:48-61` |
| P2 | 🔴 | Path B system/user prompts duplicated between `pathB.ts:82-117` and `claude-html.ts:10-44`, already drifted |
| P3 | 🔴 | All prompts are inline literals across 8+ files — unversioned, untestable; `__INLINE_ASSET_n__` rule in 4 hand-synced variants |
| P4 | 🟡 | CLI trailer *contradicts* the API system prompt ("Ignore any earlier instruction…") instead of mode-aware prompt assembly — `designAgentCli.ts:26-57` |
| P5 | 🟡 | No `stop_reason` handling; 8192-token cap can silently truncate large designs into "broken HTML" — `designAgent.ts:117-136` |
| P6 | 🟡 | API-path agent loop has no wall-clock budget and zero logging (CLI path has 300s tree-kill + heartbeat) — `designAgent.ts:116-192` |
| P7 | 🟡 | `buildBriefInput` reimplemented inline in assemble-a and copy routes despite the shared helper existing — `pathB.ts:16-33` vs `assemble-a/route.ts:57-72`, `copy/route.ts:24-40` |
| P8 | 🟡 | Copy providers hardcode "for Bistec" and never see `BrandKit.prompts` voice — multi-kit support broken for copy tone — all 3 copy providers |
| P9 | ⚪ | Dead `resolveBrandKit` query in copy route (see bug table) |
| P10 | 🟡 | Inconsistent error shapes; export/restore routes have no try/catch at all; copy failures bypass agent-error mapping |
| P11 | 🟡 | Revision-commit P2002 retry loop duplicated with divergent budgets (refine: 12 attempts w/ comment explaining why 4 fails; regenerate-design: 4) — the exact drift class H7 was meant to end |
| P12 | 🟡 | `CLI_MODE` computed in 4 files; Haiku/Sonnet policy as 4 pairs of string literals across 5 files; no config module |
| P13 | 🟡 | Model-generated HTML rendered with full JS + unrestricted network egress in server Chromium (`--no-sandbox`, no request interception) — prompt-injected fetch can reach MinIO/metadata endpoints — `puppeteer.ts:73-89` |
| P14 | ⚪ | `data:`-URL persistence duplicated between agent tool (strict validation) and image route (weaker) — `tools.ts:14-30` vs `image/route.ts:24-31` |
| P15 | 🟡 | Unsafe casts around `briefImages` JSON (two different `intent` types) + in-place SDK response mutation re-sends restored MB-scale assets to the model (see bug table) |
| P16 | ⚪ | Five different export-key formats in one bucket; nothing ever deletes orphaned intermediate renders |
| P17 | ⚪ | Brand-conflict protocol is stringly-typed sniffing of the model's final text (`includes('"conflict"')`) — should be a `reportConflict` tool |
| P18 | ⚪ | `BriefInput` carries 6 fields no copy provider reads — false contract |

### API routes & data layer (A)

| ID | Sev | Finding |
|---|---|---|
| A1 | 🔴 | Draft detail ignores `brief.brandKitId` in kit resolution (see bug table) |
| A2 | 🟡 | No shared handler pattern; `requireRole` `instanceof` boilerplate ×21 files, `getCurrentUser`+401 ×12 more |
| A3 | 🟡 | Unguarded `await req.json()` on ~14 mutating routes → malformed body = 500; no zod anywhere |
| A4 | 🟡 | Unvalidated fields: `.trim()` type bombs on 5 PATCH routes; unvalidated FK ids → P2003 500s; brief channels never checked against the enum |
| A5 | 🟡 | `scheduledAt` never validated (see bug table) |
| A6 | 🟡 | Publish orchestration duplicated 4× with divergent semantics (see T3) |
| A7 | 🟡 | `CampaignDraft` dead schema, read by library (see bug table) |
| A8 | 🟡 | Library list `include`s full drafts incl. MB-scale `htmlContent` for 50 grid tiles — switch to `select` — `library/route.ts:76-106` |
| A9 | 🟡 | `isDefault` clear+set non-transactional on PATCH (see bug table) |
| A10 | ⚪ | Soft-delete filtering inconsistent: deleted campaigns/projects 404 on mutation but 200 on GET |
| A11 | ⚪ | Soft-deleting the default brand kit leaves the system default-less — generation silently runs brand-kit-less |
| A12 | 🟡 | Artifact↔kit denormalized sync race (see bug table) |
| A13 | 🟡 | Config sprawl + prompt routes bypass the encrypted provider registry (see T4) |
| A14 | ⚪ | `prompts/improve` lacks the MOCK_AI seam its sibling has; duplicated Anthropic plumbing |
| A15 | 🟡 | ACP publish ignores draft status, records nothing on failure (see bug table) |
| A16 | ⚪ | `resolveExportUrl` null-handling: `!` at 3 sites, `?? ''` at 1 — scheduler case can send `''` to the Graph API |
| A17 | ⚪ | Console-only logging, no request ids, drifting error envelope; worker has no SIGTERM handling, hardcoded 60s poll |
| A18 | ⚪ | `Brief.channels` is `String[]` despite the `Channel` enum existing; `Draft`/`Post` (the two state machines) lack `updatedAt` |
| A19 | ⚪ | Draft PATCH does 4 round-trips to change one string; permits copy edits on PUBLISHED drafts (desyncs from the posted caption, which is stored nowhere else) |
| A20 | ⚪ | No publish idempotency/dedupe (see bug table) |

### Frontend (F)

| ID | Sev | Finding |
|---|---|---|
| F1 | 🔴 | Brief wizard: 943-line god component, ~20 useState, 6 fetch flows, all 5 steps inline — `brief/page.tsx:232-902` |
| F2 | 🔴 | Admin brandkits: 866 lines, 6 embedded components, 100-entry font list, 14 `alert()` handlers |
| F3 | 🔴 | Channel casing bug (see bug table) |
| F4 | 🟡 | Login page dead CSS variables (see bug table) |
| F5 | 🔴 | 33 `alert()` + 5 `confirm()` as the app-wide error/confirm UX |
| F6 | 🔴 | `apiFetch<T = any>` — 48/69 call sites untyped; response interfaces re-declared per page |
| F7 | 🟡 | Four different `isAdmin` fetches via two endpoints |
| F8 | 🟡 | `SegmentedToggle` (finished, accessible) has zero consumers while 4 pages hand-roll the same pill bar |
| F9 | 🔴 | No overlay has dialog semantics, focus trap, or Escape (PublishDialog, AddKitModal, history drawer, mobile sidebar) |
| F10 | 🟡 | Font combobox mouse-only; unlabeled `×`/eye/toggle buttons; brand-kit row is a clickable div unreachable by keyboard |
| F11 | 🟡 | Every page except dashboard is a client component — loading flashes, duplicate fetches; highest-leverage structural fix |
| F12 | 🟡 | Library pagination: ref-diffing behind an eslint-disable, page-reset logic in 3 places |
| F13 | ⚪ | Tailwind `status-*` tokens defined per design system but unused; StatusChip hardcodes its own palette |
| F14 | ⚪ | 3 date formatters (one misnamed) + 4 channel-label maps across files |
| F15 | 🟡 | Loading UI differs per page; fetch failures render the *empty* state (misleading, esp. for 403s) |
| F16 | 🟡 | Admin nav shown to all users; admin pages render fully for non-admins then 403 into fake-empty states |
| F17 | 🟡 | PublishDialog non-atomic multi-channel publish (see bug table); also bypasses `apiFetch` |
| F18 | ⚪ | GlassInput/Select derive DOM ids from label text — duplicate labels = duplicate ids; use `useId()` |
| F19 | ⚪ | Review step `capitalize` mangles proper nouns; PostCard imgs lack `loading="lazy"`; refine input submits via onKeyDown (breaks IME) |
| F20 | 🟡 | Draft detail mixes 5 concerns in 736 lines; regenerate+undo pattern implemented twice — wants `useUndoableAction` |

### Infra, config, testing, DX (I)

| ID | Sev | Finding |
|---|---|---|
| I1 | 🔴 | Dockerfile expects `output: 'standalone'` that next.config never sets — prod image cannot build |
| I2 | 🔴 | No `.dockerignore` — `.env` secrets, `.git`, and Windows-native `node_modules` baked into image layers |
| I3 | 🔴 | Compose scheduler runs `node src/scheduler/worker.js` — file is `.ts`, not copied into the image, no TS runtime in prod deps: scheduled publishing has no functioning runner in Docker |
| I4 | 🟡 | No `.eslintrc*` exists; husky never calls lint-staged — linting fully dead despite 4 lint deps |
| I5 | 🟡 | CI never runs `next build` — production-only failures structurally undetectable; no local `typecheck` script (drifts from CI) |
| I6 | 🟡 | Zero unit tests; pure modules (`inlineAssets` byte-lossless round-trip!) only covered via 4-min serial E2E |
| I7 | 🟡 | ~28 env vars read ad hoc across 20+ files, no validated config module |
| I8 | 🟡 | `.env.example` missing ≥9 consumed vars (all `POSTGRES_*`, `PUPPETEER_*`, `MCP_API_KEY`, `BISTEC_*_API_KEYS`, `CLAUDE_CLI_PATH`); MinIO auth works only via legacy env-name coincidence |
| I9 | 🟡 | `npm run mcp` broken — `tsx` not a dependency |
| I10 | 🟡 | Compose: no healthchecks, orderless `depends_on`, Postgres on `0.0.0.0:5432` w/ `bistec:bistec`, `minio:latest` unpinned, full `.env` fanned to the MinIO container |
| I11 | ⚪ | CI: no concurrency-cancel, no job timeout, Playwright browsers uncached, readiness loop doesn't fail on timeout, no dependabot |
| I12 | 🟡 | No README; no `engines`/`.nvmrc` despite hard Node ≥ 20.6 requirement (`--env-file` scripts) |
| I13 | ⚪ | Loose pinning (`"next": "14"`); `prisma` CLI (~50 MB) in prod deps; `@anthropic-ai/sdk ^0.30.0` is a very old narrow window |
| I14 | ⚪ | Test helper's module-level session cookie shared across specs — blocks raising `workers` |
| I15 | ⚪ | Seed scripts duplicate storage config; `setup-test-db.mjs` hardcodes container name derived from folder name |
| I16 | ⚪ | Well-known seeded admin credentials committed + printed; `db:seed` runs against the real DB |
| I17 | ⚪ | CLAUDE.md doing triple duty (README + changelog + context), duplicating handoff.md with drift risk; grow-only changelog inflates per-session context |
| I18 | ⚪ | E2E skips untracked; the documented `MOCK_AI`+`DESIGN_PROVIDER=cli` foot-gun has no startup guard |
| I19 | ⚪ | No Prettier / .editorconfig; mixed styles already visible |

---

## Suggested sequencing

**Phase 0 — bug fixes (small, independent, no design decisions needed):**
F3, A1, P9, F4, A5, A9, A12, F19, plus the one-line-ish I9 (`tsx` dep) and I12 (`engines` + README stub). P15's fix (don't mutate the SDK response; keep tokenized HTML in `messages`) is small and pays for itself in tokens immediately.

**Phase 1 — the two highest-leverage refactors:**
- T2 (`withAuth` wrapper + zod) — absorbs the largest number of findings and prevents their recurrence.
- T1 (one design pipeline + prompt module + agent config) — the generation pipeline is the product's core; this is where drift is most expensive.

**Phase 2 — deployment truth + test pyramid (T5, T8):**
`standalone` output, `.dockerignore`, compiled worker, CI `build` + `docker build` job, `.eslintrc`, vitest for pure modules. Converts three invisible breakages into gated ones.

**Phase 3 — frontend structure (T6, T7, T3):**
Data-fetching layer first (it de-risks the god-component splits), then component decomposition, toast/modal primitives, `publishDraft` service + idempotency (fixes F17/A20/A15 together).

**Deliberately deferred:** P13 (renderer egress allowlisting — worthwhile but needs care not to break Google Fonts/MinIO loads), A18 schema migrations (cheap but sequence with other migration work), I16/I10 hardening (posture items for when this leaves "internal tool on a dev box").
