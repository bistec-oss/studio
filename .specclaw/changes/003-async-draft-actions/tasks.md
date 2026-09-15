# Tasks: Async draft actions + brand-kit logo URL hygiene

**Change:** async-draft-actions
**Created:** 2026-07-17
**Total Tasks:** 12

## Summary

Two waves of code (Part B hygiene first — small, independently valuable, de-risks the data fix; then Part A async conversion), a data-fix wave for this machine, and a verification wave. Part B ships the guards the incident exposed; Part A is the UX change. Each task commits separately.

## Tasks

### Wave 1 — Part B: logo URL hygiene (code)

- [x] `T1` — Prompt guards: data-URIs never reach prompts
  - Files: `src/lib/brandkit/systemContext.ts`, `src/lib/agent/pathB.ts`, `src/lib/agent/prompts/shared.ts` (PROMPT_VERSION bump), `tests/unit/systemContext.test.ts` (new), extend `tests/unit/prompts.test.ts`
  - Estimate: small
  - Notes: guard `logoUrl.startsWith('data:')` → `'none'`; filter artifactUrls; unit-test both (AC-8).

- [x] `T2` — Write-surface validation: reject non-http(s) logoUrl
  - Files: `src/app/api/admin/brandkits/route.ts`, `src/app/api/admin/brandkits/[id]/route.ts`, `src/mcp/tools/brandkit.ts`
  - Estimate: small
  - Notes: zod refine on both routes (400); imperative check in MCP tool (throw). `null` stays allowed on PATCH (AC-7).

- [x] `T3` — Seed + migration scripts
  - Files: `scripts/seed-hearts-talk.mjs` (upload instead of dataUri), `scripts/fix-data-uri-logos.mjs` (new, idempotent, --dry-run, exits 1 on skipped rows)
  - Estimate: medium
  - Depends: T2
  - Notes: scripts use their own S3 client (pattern from `refine-bistec-brandkit.mjs`); FR-12/FR-13.

### Wave 2 — Part B: Hearts Academy data fix (this machine)

- [x] `T4` — Transparent logo asset
  - Files: scratchpad script (not committed); output PNG
  - Estimate: small
  - Notes: `sharp` edge-connected background removal on `C:\Users\Damian\Downloads\hearts-academy.png` (light-gray bg → alpha 0; interior white knot preserved). Visual check via Read before use (AC-10).

- [x] `T5` — Apply data fix: upload + rewrite kit/artifact
  - Files: DB + MinIO only (uses T3's script + a few direct commands)
  - Estimate: small
  - Depends: T3, T4
  - Notes: upload transparent PNG → set Hearts Academy `logoUrl`; delete mislabeled data-URI artifact; create "BISTEC Hearts Academy" LOGO artifact (feedToAI: true) with the URL; run `fix-data-uri-logos.mjs` to confirm zero remaining data-URIs (AC-9). Record machine-1 follow-up in handoff.

### Wave 3 — Part A: schema + backend

- [x] `T6` — Migration + action lifecycle module
  - Files: `prisma/schema.prisma`, new migration `*_draft_pending_action`, `src/lib/drafts/draftActions.ts` (new), `tests/unit/draftActions.test.ts` (new, mock prisma like existing unit tests)
  - Estimate: medium
  - Notes: enum `DraftAction`; atomic claim via conditional updateMany; start mirrors `startBackgroundGeneration` (resolve auth first, void promise); release via updateMany (FR-2/FR-3).

- [x] `T7` — Convert the three routes to 202
  - Files: `src/app/api/drafts/[id]/regenerate-design/route.ts`, `regenerate-copy/route.ts`, `refine/route.ts`
  - Estimate: large
  - Depends: T6
  - Notes: validation stays sync (same error shapes); bodies move into background closures unchanged (commitRevision/withNextRevisionNumber intact); regenerate-copy drops the status flip + gains content guard; refine Override path stays synchronous; conflict branch writes pendingConflict then releases (FR-1/FR-6/FR-9).

- [x] `T8` — Poll surface + sweep + restore guard
  - Files: `src/app/api/drafts/[id]/route.ts` (loadDraft fields + recoverIfStuck second clause), `src/app/api/drafts/[id]/revisions/[rev]/restore/route.ts` (409), `src/lib/api-types.ts`
  - Estimate: medium
  - Depends: T6
  - Notes: `conflict` derived from pendingConflict without pendingHtml; 15-min bound shared with F1 (FR-4/FR-5/FR-7).

### Wave 4 — Part A: client

- [x] `T9` — Draft page: poll + overlay + undo capture
  - Files: `src/app/(app)/drafts/[id]/page.tsx`
  - Estimate: medium
  - Depends: T7, T8
  - Notes: poll while `status==='IN_PROGRESS' || pendingAction`; regenerate-design overlay over current image; `designUndo.capture(currentRevisionNumber)` pre-fire; inline pendingActionError; pass new props down (FR-8).

- [x] `T10` — CopyEditor + RefinementPanel async UX
  - Files: `src/components/drafts/CopyEditor.tsx`, `src/components/drafts/RefinementPanel.tsx`
  - Estimate: medium
  - Depends: T9
  - Notes: CopyEditor captures undo pre-fire, disables while REGENERATE_COPY pending; RefinementPanel resolves chat message from polled props (applied via revision baseline / conflict prop / pendingActionError); Override unchanged (FR-6/FR-8).

### Wave 5 — Tests + gates

- [x] `T11` — E2E suite §Q async-actions
  - Files: `tests/e2e/async-actions.test.ts` (new), `tests/helpers/api.ts` (waitForAction helper), `docs/e2e-test-plan.md` (§Q catalog)
  - Estimate: large
  - Depends: T7, T8
  - Notes: AC-1..AC-6 route-level (202, poll to completion, 409 concurrency, 409 restore, stale sweep via direct DB updatedAt rewind, failure sentinel leaves content intact); AC-7 brandkit validation cases can live in the existing brand-kit suite file if cleaner.

- [x] `T12` — Full gates + docs finalize
  - Files: `docs/handoff.md`, `CLAUDE.md`, `.specclaw` status
  - Estimate: medium
  - Depends: T1–T11
  - Notes: tsc, lint, unit, full mock E2E, production build (NFR-1); write handoff entry (incl. machine-1 TODO: `prisma migrate deploy` + run `fix-data-uri-logos.mjs`); update E2E baseline counts.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed

**Task format:**

```
- [ ] `T<n>` — <title>
  - Files: <files to create/modify>
  - Estimate: small | medium | large
  - Depends: <task ids> (if any)
  - Notes: <additional context>
```
