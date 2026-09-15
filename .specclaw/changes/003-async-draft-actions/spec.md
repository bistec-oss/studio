# Spec: Async draft actions + brand-kit logo URL hygiene

**Change:** async-draft-actions
**Created:** 2026-07-17
**Status:** 🟡 Draft

## Overview

Two coupled improvements shipped on one branch (`feature/async-draft-actions`):

- **Part A** — convert the three synchronous draft actions (regenerate design, regenerate copy, refine) to the F1 async pattern: validate → 202 → in-process background run → the draft page polls to completion. A tab switch/navigation no longer orphans the result in the UI.
- **Part B** — brand-kit logos are always URLs, never base64: reject `data:` URIs at every write surface, strip them defensively at prompt build, fix the seed script that embedded them, and migrate the existing Hearts Academy kit (new transparent logo, uploaded to MinIO).

Root incident (2026-07-17): a regenerate-design against the Hearts Academy kit timed out at 300s because its 136,050-char base64 `logoUrl` entered the design prompt twice (via `buildBrandKitSystemContext` AND the `feedToAI` artifact URL list in `pathB.ts`), producing a 277k-char prompt.

## Requirements

### Functional Requirements

**Part A — async draft actions**

- **FR-1** `POST /api/drafts/[id]/regenerate-design`, `POST /api/drafts/[id]/regenerate-copy`, and `POST /api/drafts/[id]/refine` perform all validation synchronously (auth, ownership, 404, Path B check, kit resolution, instruction presence), then return **202** with `{ ok: true }` and run the model work in-process fire-and-forget, mirroring `startBackgroundGeneration`.
- **FR-2** A new nullable `Draft.pendingAction` field (`REGENERATE_COPY | REGENERATE_DESIGN | REFINE`) marks the in-flight action. It is claimed **atomically** (conditional update where `pendingAction IS NULL`); a second action request while one is in flight returns **409**. `Draft.status` is NOT touched by actions (an EXPORTED draft stays EXPORTED; the current regenerate-copy behavior of flipping to IN_PROGRESS is removed).
- **FR-3** On background failure, the error message is written to a new `Draft.pendingActionError` and `pendingAction` is cleared. On success both are cleared (`pendingActionError` also cleared when a new action starts).
- **FR-4** `GET /api/drafts/[id]` returns `pendingAction`, `pendingActionError`, and (when a refine produced a brand-kit conflict) `conflict: { conflictId, explanation }` so the poll can drive the UI. The existing 4s draft-page poll also runs while `pendingAction` is set.
- **FR-5** Stale in-flight actions are swept lazily on read: `pendingAction` older than 15 min (by `updatedAt`, same bound as F1) → `pendingAction` cleared + `pendingActionError` set to an interruption message. Same `recoverIfStuck` site.
- **FR-6** The refine conflict flow survives async: a conflict result writes `pendingConflict` (existing shape) and clears `pendingAction`; the client learns of it via FR-4 and the existing Override path (`overrideConflictId`) still works. Override is applied synchronously if fast (no model call — it commits stored HTML) — it does NOT need the async treatment.
- **FR-7** `POST /api/drafts/[id]/revisions/[rev]/restore` returns **409** while `pendingAction` is set (prevents the revision pointer racing a running action). The F1 generation-retry route is unaffected.
- **FR-8** Client UX: regenerate-copy shows the copy area disabled/shimmering with the current text visible; regenerate-design and refine keep the current image visible with an in-progress overlay (NOT the full generation skeleton). On completion the new state appears via poll; on failure an inline error appears near the triggering control and the buttons re-enable (no server-side retry route for actions — the user simply re-triggers). Undo data (`previousCopyText`, `previousRevisionNumber`) is captured client-side before firing.
- **FR-9** Non-interactive callers (scheduler `generateDraftForBrief`; MCP/ACP — which do not expose these actions) remain synchronous and untouched.

**Part B — logo URL hygiene**

- **FR-10** `PATCH /api/admin/brandkits/[id]` and `POST /api/admin/brandkits` reject a `logoUrl` that is not `http(s)://` (covers `data:`) with 400 and a clear message. MCP `create_brand_kit` applies the same check (throws a tool error).
- **FR-11** `buildBrandKitSystemContext` never emits a `data:` URI: if `logoUrl` starts with `data:`, render `Logo URL: none (embedded logo omitted)` instead. `pathB.ts` filters `data:` URLs out of the `artifactUrls` list before joining into the prompt. (Defense in depth — after FR-10 + migration these paths should never trigger.)
- **FR-12** `scripts/seed-hearts-talk.mjs` uploads its logo assets to the brand-kits bucket (stable `publicUrl`) instead of embedding `data:` URIs (the 7-day-presigned-URL rationale is obsolete since H10).
- **FR-13** A one-off migration script `scripts/fix-data-uri-logos.mjs` finds every `BrandKit.logoUrl` / `BrandKitArtifact.url` holding a `data:` URI, uploads the decoded bytes to the brand-kits bucket, and rewrites the row with the public URL. Idempotent; `--dry-run` supported. (Runs on this machine now; machine 1 runs it after pulling.)
- **FR-14** Hearts Academy data fix (this machine): `C:\Users\Damian\Downloads\hearts-academy.png` gets its light-gray background made transparent via **edge-connected** removal (the white knot inside the heart mark must remain), is uploaded to the brand-kits bucket, and becomes `kit.logoUrl`. The mislabeled 136k data-URI LOGO artifact ("BISTEC Global") is deleted and replaced with a properly named artifact ("BISTEC Hearts Academy", `feedToAI: true`) pointing at the same uploaded URL.

### Non-Functional Requirements

- **NFR-1** All gates green before merge: `tsc`, `npm run lint` (0 errors), full unit suite, full mock E2E suite, production build. No regressions in the 135-passing E2E baseline.
- **NFR-2** No change to generation quality/prompts beyond removing base64 noise; `PROMPT_VERSION` bumped since prompt text changes (FR-11).
- **NFR-3** The migration adds only nullable columns — `prisma migrate deploy` is safe on existing data, no backfill.
- **NFR-4** `main` remains deployable throughout; all work on `feature/async-draft-actions`.

## Acceptance Criteria

- **AC-1** Firing regenerate-design returns 202 in <2s; the draft page shows the current image with an overlay; within the poll cadence the new design appears with a new revision and correct `currentRevisionNumber`; closing/reopening the tab mid-run still ends with the new design visible.
- **AC-2** Firing regenerate-copy returns 202; current copy stays visible but disabled; the new copy replaces it on poll; Undo restores the captured previous copy.
- **AC-3** Firing refine returns 202; the chat message shows pending until the poll reports completion (applied), conflict (amber card + Override works), or error (inline message).
- **AC-4** A second action on a draft with `pendingAction` set → 409; restore during `pendingAction` → 409.
- **AC-5** A draft with `pendingAction` and `updatedAt` older than 15 min is swept on GET: `pendingAction` null, `pendingActionError` set, draft content untouched.
- **AC-6** A background action failure (mock sentinel) leaves the draft's previous content intact, sets `pendingActionError`, and the UI shows the error + re-enabled buttons.
- **AC-7** PATCH/POST brandkits with `logoUrl: "data:image/png;base64,..."` → 400. MCP `create_brand_kit` with a data-URI logo → tool error.
- **AC-8** `buildBrandKitSystemContext({...logoUrl: 'data:...'})` output contains no base64; pathB prompt contains no `data:` in the reference-image list. Unit-tested.
- **AC-9** After the data fix on this machine: Hearts Academy `logoUrl` is an `http://…/brand-kits/…` URL; its LOGO artifact is named "BISTEC Hearts Academy" with the same URL and `feedToAI: true`; no `data:` URIs remain in `BrandKit`/`BrandKitArtifact`; a regenerate-design prompt against the kit is back to normal size (< 10k chars logged by `claudeCli` debug).
- **AC-10** The uploaded logo PNG has a transparent background, the white knot inside the heart preserved (visual check).
- **AC-11** Full gates pass (NFR-1); new E2E cases cover AC-1..AC-7 under MOCK_AI/MOCK_PUPPETEER.

## Edge Cases

- Refine instruction empty → still 400 synchronously (unchanged contract: `instruction is required`).
- Draft deleted mid-action → background runner's final write uses `.catch(() => {})` / `updateMany` guards, mirroring `runGenerationForDraft`.
- Two conflicting refines can no longer interleave (409 guard), so `pendingConflict` single-slot semantics are safe.
- Server restart mid-action → stale sweep (FR-5) recovers on next read.
- Action fired on a FAILED draft (initial generation failed): regenerate/refine require existing content — refine/regenerate-design 409/400 as today (no htmlContent); regenerate-copy is allowed only on drafts with content (guard: status EXPORTED/PUBLISHED).
- `logoUrl: null` (clearing the logo) stays allowed through PATCH.
- Migration script encounters an unparsable data-URI → logs and skips the row, exits non-zero at the end so it's noticed.

## Dependencies

- `sharp` 0.34.5 is present transitively in `node_modules` (win32-x64 binaries) — used ONLY by the one-off transparency script, not imported by app code, so it is not added to `package.json`.
- Prisma migration must be applied before the new code runs (`npx prisma migrate dev` locally / `migrate deploy` on the other machine).

## Notes

- The F1 pattern's building blocks being mirrored: `src/lib/agent/backgroundGeneration.ts` (auth-resolve-then-void-promise), `retry/route.ts` (validate → claim → 202), `drafts/[id]/route.ts` `recoverIfStuck` (lazy sweep).
- `previousCopyText`/`previousRevisionNumber` move from server response to client-side capture — `useUndoableAction` already stores snapshots client-side, so this is a small call-site change.
- The draft page and its child components use plain `useState` + 4s `setInterval` polling (NOT React Query) — the async UI extends that machinery rather than introducing a new data layer.
