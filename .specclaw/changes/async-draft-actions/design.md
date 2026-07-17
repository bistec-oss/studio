# Design: Async draft actions + brand-kit logo URL hygiene

**Change:** async-draft-actions
**Created:** 2026-07-17

## Technical Approach

**Part A** mirrors F1's proven shape exactly, with one new module owning the lifecycle:

`src/lib/drafts/draftActions.ts` (new) exports:

- `claimDraftAction(draftId, action): Promise<boolean>` — atomic claim via `prisma.draft.updateMany({ where: { id, pendingAction: null }, data: { pendingAction: action, pendingActionError: null } })`; `count === 0` → caller returns 409. No read-then-write race.
- `startDraftAction(draftId, userId, work): Promise<void>` — resolves Claude auth up front (`resolveClaudeAuthForUser`, same as `startBackgroundGeneration`), then `void runWithClaudeAuth(auth, work).then(clearAction).catch(writeErrorAndClear)`. The `work` closure is each route's existing model+DB logic, moved verbatim.
- `releaseDraftAction(draftId, error?)` — clears `pendingAction` (+ sets/clears `pendingActionError`) with `updateMany` so a deleted draft is a no-op.

Each of the three routes keeps its synchronous validation exactly as today, then: claim (409 on conflict) → `startDraftAction` → `202 { ok: true }`. The heavy `try/catch` bodies move into the background closure; their DB commits (`commitRevision`, `withNextRevisionNumber` transactions) are unchanged. The refine conflict branch writes `pendingConflict` then releases the action (success path, no error).

**Poll surface:** `loadDraft` in `GET /api/drafts/[id]` gains `pendingAction`, `pendingActionError`, and `conflict` (derived from `pendingConflict`: `{ conflictId, explanation }`, never `pendingHtml`). `recoverIfStuck` gains a second clause: `pendingAction !== null && now - updatedAt > 15min` → release with interruption message (guarded `updateMany` where `pendingAction` equals the observed value).

**Client:** the draft page's existing poll condition `status === 'IN_PROGRESS'` extends to `|| pendingAction !== null`. The page passes `pendingAction`/`pendingActionError`/`conflict` down:

- `CopyEditor` — `regenerate()` captures `undoAction.capture(draft.copyText)` BEFORE the POST, fires, gets 202; textarea + buttons disable while `pendingAction === 'REGENERATE_COPY'`; on poll completion the parent's fresh `draft.copyText` flows in via existing props; `pendingActionError` renders inline.
- Draft page regenerate-design button — captures `designUndo.capture(draft.currentRevisionNumber)` before firing; while `pendingAction === 'REGENERATE_DESIGN'` the preview `<img>` gets a translucent overlay + spinner ("Regenerating design…"), NOT the skeleton; error renders where the failure card does but without touching `status`.
- `RefinementPanel` — `send()` posts and marks the chat message `pending`; the panel receives the polled draft state as props and resolves the message to `applied` (new `currentRevisionNumber` observed), `conflict` (`conflict` prop present → amber card, Override posts with `overrideConflictId` — Override stays synchronous since it commits stored HTML without a model call), or `error` (`pendingActionError`). A `revisionBaseline` ref captured at send time detects "applied".

**Part B** is four small, independent guards plus data work:

1. `logoUrlSchema = z.string().url().refine(u => /^https?:\/\//.test(u))` (in a small shared helper or inline) applied to both brandkits routes; MCP `createBrandKit` does the same check imperatively and throws.
2. `buildBrandKitSystemContext`: `const logoUrl = kit?.logoUrl && !kit.logoUrl.startsWith('data:') ? kit.logoUrl : 'none'` (with a comment on the incident). `pathB.ts`: `.filter(u => !u.startsWith('data:'))` on `artifactUrls`. Bump `PROMPT_VERSION`.
3. `seed-hearts-talk.mjs`: replace `dataUri()` with upload via the same S3 client pattern `refine-bistec-brandkit.mjs` already uses (`uploadObject` + `publicUrl` equivalents inline in the script, since scripts don't import src/).
4. `scripts/fix-data-uri-logos.mjs` (new): scan `BrandKit.logoUrl` + `BrandKitArtifact.url` for `^data:`; decode; upload to `BUCKET_BRANDKITS` under `<kitId>/migrated-<timestamp>-logo.<ext>`; update row. `--dry-run` prints the plan. Exits 1 if any row was skipped as unparsable.
5. One-off (not committed as app code): transparency processing of `hearts-academy.png` with `sharp` — flood-fill from the four edges over near-background pixels (tolerance-based, light-gray ≈ #F5F5F5) to alpha 0, interior whites untouched; then upload + DB update via a short script (can reuse `fix-data-uri-logos.mjs` for the artifact swap or do it directly), and delete/replace the mislabeled artifact per FR-14.

## Architecture

No new layers. The action lifecycle module sits beside the existing revision helper (`src/lib/drafts/revisions.ts`). Background execution reuses the process-lifetime guarantee F1 established (long-lived Node server; Docker runner unchanged). The scheduler/MCP/ACP surfaces are untouched (they never call these routes).

## File Changes Map

| File                                                       | Action        | Description                                                                                                |
| ---------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma` + new migration                     | modify        | `DraftAction` enum; `Draft.pendingAction DraftAction?`; `Draft.pendingActionError String?`                 |
| `src/lib/drafts/draftActions.ts`                           | create        | claim / start / release lifecycle (Part A core)                                                            |
| `src/app/api/drafts/[id]/regenerate-design/route.ts`       | modify        | sync validation → claim → 202; body moves to background closure                                            |
| `src/app/api/drafts/[id]/regenerate-copy/route.ts`         | modify        | same; drop the EXPORTED→IN_PROGRESS status flip; add content guard                                         |
| `src/app/api/drafts/[id]/refine/route.ts`                  | modify        | same for the model path; Override path stays synchronous; conflict branch releases action                  |
| `src/app/api/drafts/[id]/route.ts`                         | modify        | `loadDraft` returns `pendingAction`/`pendingActionError`/`conflict`; `recoverIfStuck` sweeps stale actions |
| `src/app/api/drafts/[id]/revisions/[rev]/restore/route.ts` | modify        | 409 while `pendingAction` set                                                                              |
| `src/app/(app)/drafts/[id]/page.tsx`                       | modify        | poll condition, overlay, undo capture, error surface, props down                                           |
| `src/components/drafts/CopyEditor.tsx`                     | modify        | async regenerate, client-side undo capture, disabled state                                                 |
| `src/components/drafts/RefinementPanel.tsx`                | modify        | pending-until-poll message lifecycle, conflict/error from props                                            |
| `src/lib/api-types.ts`                                     | modify        | DraftDetail gains the new fields                                                                           |
| `src/lib/brandkit/systemContext.ts`                        | modify        | data-URI guard (FR-11)                                                                                     |
| `src/lib/agent/pathB.ts`                                   | modify        | filter `data:` from artifactUrls (FR-11)                                                                   |
| `src/lib/agent/prompts/shared.ts`                          | modify        | bump `PROMPT_VERSION`                                                                                      |
| `src/app/api/admin/brandkits/route.ts`                     | modify        | logoUrl http(s) validation (FR-10)                                                                         |
| `src/app/api/admin/brandkits/[id]/route.ts`                | modify        | logoUrl http(s) validation (FR-10)                                                                         |
| `src/mcp/tools/brandkit.ts`                                | modify        | logoUrl http(s) validation (FR-10)                                                                         |
| `scripts/seed-hearts-talk.mjs`                             | modify        | upload assets to MinIO instead of data-URIs (FR-12)                                                        |
| `scripts/fix-data-uri-logos.mjs`                           | create        | idempotent data-URI → bucket-URL migration (FR-13)                                                         |
| `tests/unit/*`                                             | create/modify | systemContext guard, pathB filter, draftActions claim/release                                              |
| `tests/e2e/async-actions.test.ts`                          | create        | new §Q suite: AC-1..AC-7                                                                                   |
| `docs/e2e-test-plan.md`, `docs/handoff.md`, `CLAUDE.md`    | modify        | catalog + handoff updates at finalize                                                                      |

## Data Model Changes

```prisma
enum DraftAction {
  REGENERATE_COPY
  REGENERATE_DESIGN
  REFINE
}

model Draft {
  // ...
  pendingAction      DraftAction?
  pendingActionError String?
}
```

One migration, nullable columns only, no backfill. `updatedAt` (existing) is the staleness clock, as in F1.

## API Changes

- The three action POSTs: **200-with-payload → 202 `{ ok: true }`** (breaking for their only callers — the two components updated in the same change). Validation-failure responses (400/404/403/409/422 NO_BRAND_KIT, NOT_PATH_B, instruction-required) keep today's shapes and move fully before the 202.
- New 409 on all three when an action is already pending, and on restore.
- `GET /api/drafts/[id]` response gains `pendingAction: string|null`, `pendingActionError: string|null`, `conflict: { conflictId, explanation } | null`.
- Refine Override (`overrideConflictId` present): unchanged synchronous response `{ reply, revisionId, exportUrl }`.
- Brandkits POST/PATCH: 400 on non-http(s) `logoUrl`.

## Key Decisions

1. **Dedicated `pendingAction` field, not `status` reuse** — an EXPORTED draft mid-refine must stay publishable-looking in the library and keep its image on the page; `status=IN_PROGRESS` means "no content yet" everywhere (skeletons, publish gates, sweeps). Cost: one migration.
2. **No server-side retry for actions** — failure re-enables the buttons; the user re-triggers with their context intact (refine instruction still in the chat input history). Avoids persisting request payloads (proposal Q3/Q5 resolved to the simple option).
3. **Undo snapshots move client-side** — the 202 body can't carry `previousCopyText`/`previousRevisionNumber`; the client already holds both values pre-fire.
4. **Override stays synchronous** — it commits already-stored HTML (renders only for legacy rows) and typically completes in seconds; async would complicate the conflict card for no user benefit.
5. **Reject + strip for data-URIs (not auto-convert)** — per user decision; the artifacts route already produces trusted URLs server-side, so only `logoUrl` writers and seeds need the guard.
6. **`sharp` used only in a throwaway script** — not added to `package.json`; app code never depends on it (the app's only pixel path remains Puppeteer canvas).
7. **PROMPT_VERSION bump** — FR-11 changes prompt text; keeps output-quality correlation intact.

## Risks & Mitigations

- **In-process background work dies on server restart** → same exposure F1 accepted; stale sweep recovers with a clear error message (AC-5).
- **Poll misses a fast action** (completes < 4s under mocks) → client marks pending optimistically and reconciles on the next poll regardless of timing; E2E uses `waitFor`-style polling helpers, not fixed sleeps.
- **`pendingConflict` overwrite races** → eliminated by the 409 claim (only one refine can run).
- **Legacy zero-revision drafts** (imported, `currentRevisionNumber: null`) — regenerate-design already has the legacy snapshot guard; RefinementPanel's "applied" detection must treat `null → N` as a change (baseline ref handles it).
- **E2E flakiness from the new async timing** → reuse the F1 suite's proven `waitForDraft`-style helper extended to wait for `pendingAction === null`.
- **Prompt-text change altering mock E2E assertions** → mock seams key off sentinels in the prompt context; verify `buildMockHtml` context still contains what it greps for.
