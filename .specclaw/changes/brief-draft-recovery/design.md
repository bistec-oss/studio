# Design: Brief draft autosave & recovery

**Change:** brief-draft-recovery
**Created:** 2026-07-13

## Technical Approach

A small, self-contained vertical: one new Prisma model, one service module owning the lifecycle rules (sweep, cap, image cleanup), two thin API routes, a debounced autosave hook wired into `useBriefWizard`, and dashboard rows in the existing `RecentDraftsCard`. No changes to generation, publishing, or the `Brief` model.

## Architecture

```
useBriefWizard ──(debounced PUT)──► /api/brief-drafts ──► briefDrafts.ts service ──► Prisma BriefDraft
      ▲                                                            │
      └──(GET ?resume=<id>)◄── /api/brief-drafts/[id] ◄────────────┤ sweep(TTL) / cap(5) / deleteImages
                                                                   ▼
Dashboard (RSC, getCurrentUser) ──► listBriefDrafts(userId) ──► MinIO deleteObject (briefs/<uid>/…)
      └─► RecentDraftsCard (client) — unfinished rows + Resume/Discard
```

### Data model

```prisma
model BriefDraft {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  topic     String   @default("")   // denormalized for dashboard display
  payload   Json                    // zod-validated wizard state
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId, updatedAt])
}
```

Migration: `2026XXXX_brief_draft` (additive). `User` gains `briefDrafts BriefDraft[]`.

### Service module — `src/lib/brief/briefDrafts.ts`

Owns all lifecycle rules so routes and the dashboard share one implementation:

- `briefDraftPayloadSchema` (zod): `{ step, campaignId?, aspectRatio, brandKitId?, designMode, templateId?, referenceTemplateId?, topic, prompt, goal, tone, images: {url, filename, intent}[] }`. Size-capped (64 KB serialized).
- `listBriefDrafts(userId)` — sweeps expired (>7 days by `updatedAt`, images deleted) then returns the rest, newest first. Zod-invalid payloads count as expired.
- `saveBriefDraft(userId, id | undefined, payload)` — upsert; on create past the 5-cap, evicts oldest (with images). Returns `{id}`. Rejects empty payloads (no topic, no prompt, no images).
- `getBriefDraft(userId, id)` — owner-scoped fetch or null.
- `deleteBriefDraft(userId, id, { keepImages })` — row + optionally images.
- `deleteDraftImages(userId, payload)` — parses each image URL via `new URL().pathname`, requires `/<BUCKET_IMAGES>/briefs/<userId>/` prefix, `deleteObject` best-effort (failures logged, never thrown).

### API — `src/app/api/brief-drafts/`

- `route.ts`: `GET` (list for dashboard/other callers) · `PUT` (`parseBody` zod `{id?, payload}` → upsert → `{id}`)
- `[id]/route.ts`: `GET` (resume fetch) · `DELETE` (`?keepImages=true` used by generate-success; default deletes images). Both 404 on non-owned ids.
- All `withAuth` (editor-accessible). **No admin override** — unfinished briefs are private working state (deliberate deviation from `forbiddenIfNotOwner`, which lets admins through).

### Wizard integration — `useBriefWizard.ts`

- New `useSearchParams()` read of `resume`; on mount with a resume id: fetch, zod-parse, `setState` batch, set `draftIdRef`. Missing/foreign id → fresh wizard.
- Autosave effect: watches the recoverable fields; if non-trivial, debounce 1.5s → `PUT {id: draftIdRef.current, payload}` → store returned id. Single in-flight guard (skip if a save is running; run one trailing save after). `saving` never surfaces in UI.
- `handleGenerate` success path: stop autosave (clear pending timer + set a `finishedRef`), then `DELETE /api/brief-drafts/<id>?keepImages=true` fire-and-forget before `router.push`.
- The existing template/kit consistency `useEffect` (`useBriefWizard.ts:158-165`) handles dangling restored ids once data loads — no extra validation code.

### Dashboard — `page.tsx` + `RecentDraftsCard`

- `getDashboardData()` gains `getCurrentUser()`; when non-null, `listBriefDrafts(userId)` (which also performs the sweep).
- `RecentDraftsCard` gains `unfinished?: UnfinishedBriefRow[]` — rendered as leading table rows: topic (link to `/brief?resume=<id>`), campaign name (from payload's campaignId — omit; show "—"), "Unfinished" chip (new `StatusChip` variant or reuse `draft` styling with amber tint), relative time, Resume link + Discard button (`useConfirm` + `DELETE` + `router.refresh()`).
- Unfinished rows count toward the collapsed-8 budget (they sit on top — most recent working state first).

## File Changes Map

| File                                            | Action | Description                                                 |
| ----------------------------------------------- | ------ | ----------------------------------------------------------- |
| `prisma/schema.prisma`                          | modify | `BriefDraft` model + `User.briefDrafts`                     |
| `prisma/migrations/…_brief_draft/`              | create | additive migration                                          |
| `src/lib/brief/briefDrafts.ts`                  | create | payload schema + lifecycle service (sweep/cap/images)       |
| `src/app/api/brief-drafts/route.ts`             | create | GET list, PUT upsert                                        |
| `src/app/api/brief-drafts/[id]/route.ts`        | create | GET one, DELETE (`?keepImages`)                             |
| `src/components/brief/useBriefWizard.ts`        | modify | resume rehydration + debounced autosave + clear-on-generate |
| `src/app/(app)/page.tsx`                        | modify | fetch current user's unfinished briefs                      |
| `src/components/dashboard/RecentDraftsCard.tsx` | modify | unfinished rows + Resume/Discard                            |
| `src/lib/api-types.ts`                          | modify | shared `BriefDraftPayload` / row types                      |
| `tests/unit/briefDrafts.test.ts`                | create | schema, URL→key parsing, cap/TTL rules                      |
| `tests/e2e/brief-draft-recovery.test.ts`        | create | AC-1..AC-8 coverage                                         |

## Key Decisions

1. **Separate `BriefDraft` table** over `Brief.status=DRAFT`: payload is wizard-shaped (step index, image intents), `Brief` keeps its "created only at Generate" invariant, zero impact on existing queries.
2. **Owner-only, even vs admins** — unlike generated drafts, unfinished briefs are private working state.
3. **Lazy TTL sweep on read** (F1 precedent) — no worker/cron.
4. **`keepImages` on delete** — generate-success must not delete images the new `Brief.briefImages` references.
5. **Denormalized `topic` column** — dashboard rows without JSON parsing in the hot query.
6. **Debounce 1.5s + in-flight serialization** — keystroke-safe and no lost-update race between overlapping PUTs.

## Risks & Mitigations

- **Late autosave resurrects a deleted row after Generate** → `finishedRef` stops the debounce loop before the DELETE fires; service upsert-by-id of a deleted id creates nothing (update-where-owned, else create-only-when-no-id… enforce: `id` given but not found → treat as create ONLY if payload non-trivial and not finished — simplest: PUT with unknown id returns 404 and the client stops).
- **Image deletion touching wrong objects** → strict `briefs/<userId>/` prefix check; skip anything else.
- **Payload schema drift across releases** → zod-invalid payload = swept row; resume never half-applies.
- **Dashboard now session-dependent** → `getCurrentUser()` returning null (shouldn't happen behind proxy auth) just renders no unfinished rows.
