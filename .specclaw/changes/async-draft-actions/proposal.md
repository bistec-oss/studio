# Proposal: Async draft actions (regenerate design/copy, refine) + prompt guard for data-URI logos

**Created:** 2026-07-17
**Status:** ✅ Approved (2026-07-17, with decisions below)

## Decisions (2026-07-17, user-approved)

- **One branch for both parts** — the async conversion (Part A) AND the logo/URL hygiene (Part B) ship together.
- **Enforcement = reject + guard**: PATCH `/api/admin/brandkits/[id]` and MCP `createBrandKit` reject `data:` logoUrl (400); the seed script uploads assets to MinIO instead of embedding; `buildBrandKitSystemContext` strips any `data:` URI as defense-in-depth; existing rows migrated by a one-off script.
- **Hearts Academy artifact**: the mislabeled 136k data-URI LOGO artifact ("BISTEC Global", feedToAI=true) is deleted and replaced by the new transparent hearts-academy logo as a properly named LOGO artifact (bucket URL, feedToAI=true), matching the new kit.logoUrl.
- **Data fix on this branch**: `C:\Users\Damian\Downloads\hearts-academy.png` gets its light-gray background made transparent (edge-connected removal — the white knot inside the heart mark must stay), uploaded to the brand-kits bucket, and set as the Hearts Academy kit logo.
- The prod standalone server on this machine was stopped before branching; the system on `main` must keep working unchanged.

## Problem

_What problem are we solving? Why does it matter?_

1. **Regenerate design, regenerate copy, and refine are synchronous HTTP calls.** Each holds a single request open for the full model run (CLI mode: ~60–300s; `maxDuration = 300`). The server-side work actually survives a tab switch or navigation — the handler keeps running and the new revision lands in the DB — but the browser response is lost, so the UI never learns the outcome. The user sees a stuck spinner or, after navigating back, a silently-changed draft with no success/failure feedback. F1 already solved this exact problem for _initial_ generation (202 + in-process background run + polling skeletons + retry); these three follow-up actions were left synchronous.

2. **Brand-kit `logoUrl` data-URIs flow verbatim into model prompts.** Diagnosed live today (2026-07-17): the "Hearts Academy" kit stores its logo as a 136,050-char base64 `data:` URI in `BrandKit.logoUrl`, and `buildBrandKitSystemContext` (`src/lib/brandkit/systemContext.ts`) interpolates it raw into every generation/refine/regenerate prompt. A regenerate-design against that kit produced a 277,728-char design prompt (the data-URI appears twice: system prompt + user message reference-template/artifact path), sonnet emitted zero output for the whole 300s budget, and the CLI watchdog killed the run — a guaranteed timeout + wasted credits on every attempt. This is the Hearts-Talk inline-asset problem on a path the externalization fix never covered.

## Proposed Solution

_What are we building? High-level approach._

**Part A — async actions (mirrors F1's proven pattern in `src/lib/agent/backgroundGeneration.ts`):**

- `POST /api/drafts/[id]/regenerate-design`, `/regenerate-copy`, and `/refine` validate synchronously (auth, ownership, path/mode checks, kit resolution), mark the draft's in-flight action, return **202** immediately, and run the model work in-process fire-and-forget.
- The draft page polls (existing React Query machinery from F1) and shows an in-progress treatment; on completion the new revision/copy appears, on failure an inline error + Retry (reusing the `failureReason` pattern).
- Stale in-flight actions swept lazily on read (>15 min → failed), mirroring F1's stale-draft sweep — no worker.
- Concurrency: one in-flight action per draft; a second action request while one is running is rejected (409) rather than queued.
- Non-interactive callers (MCP/ACP, scheduler) keep their synchronous paths, exactly as F1 did with `generateDraftForBrief`.

**Part B — prompt guard for data-URI logos:**

- `buildBrandKitSystemContext` (and any other prompt site that renders `kit.logoUrl`) never emits a `data:` URI: replace with a short placeholder line, with the actual asset re-inlined at render time via the existing `__INLINE_ASSET_n__` mechanism where embedding is needed — or simply omitted from the prompt (the model cannot read base64 anyway).
- Upload-time prevention: kit logo uploads store to the `brand-kits` bucket and save a URL (the Bistec kit already works this way); reject or convert direct data-URI writes.
- One-off data fix: migrate the Hearts Academy kit's existing data-URI logo to a bucket object + URL (script or manual, decided at plan time).

## Scope

### In Scope

- Async conversion of the three draft actions: regenerate-design, regenerate-copy, refine (routes + shared runner + draft-page UI states + retry).
- 409 guard against concurrent in-flight actions on the same draft.
- Lazy stale-action sweep on read.
- Prompt guard: `data:` URIs never enter prompts from `logoUrl`; upload-path hardening.
- Data migration for the existing Hearts Academy logo.
- Unit + mock-E2E coverage for the new async flows (new §-suite cases) and the prompt guard.

### Out of Scope

- Streaming/progress UI beyond skeleton + poll (no SSE/WebSocket).
- Async conversion of MCP/ACP or scheduler paths (deliberately synchronous, per F1 precedent).
- Queueing multiple actions per draft.
- The broader refine caveat of dropped `__INLINE_ASSET_n__` placeholders (separate known issue).
- Auto-externalizing other oversized kit artifacts (only `logoUrl` is in scope here).

## Impact

- **Files affected:** ~12–16 (estimated) — 3 routes, a shared async-action runner (new, modeled on `backgroundGeneration.ts`), `src/lib/brandkit/systemContext.ts`, draft-page components (`src/components/drafts/*`), possibly a small Prisma migration for in-flight-action state, tests.
- **Complexity:** medium
- **Risk:** medium — concurrency edges (action vs action, action vs restore/publish), and reusing vs extending `Draft.status` needs care so an in-flight refine doesn't make an EXPORTED draft look unfinished elsewhere (library, publish gates).

## Open Questions

1. **In-flight state representation:** reuse `Draft.status = IN_PROGRESS` (currently means "no content yet" — would hide the existing design in the library/publish gates) or add a dedicated nullable field like `Draft.pendingAction` (`REGENERATE_DESIGN | REGENERATE_COPY | REFINE`) + reuse `failureReason`? A dedicated field looks safer; needs a migration.
2. **UI during regenerate/refine:** keep the current image visible with an overlay/progress shimmer (content still exists) vs the full F1 skeleton?
3. Should Retry re-run with the identical inputs (stored where?) or simply re-enable the action buttons?
4. Fix the Hearts Academy logo data now as an ops one-off (unblocks the user immediately, before this change ships) and keep only the guard in this change?
5. Does refine's request payload (instruction text) need persisting for the poll/retry flow, and if so on the draft row or a new table?

---

**To proceed:** Review this proposal and approve to begin planning.
