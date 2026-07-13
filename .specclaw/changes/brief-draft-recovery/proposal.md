# Proposal: Brief draft autosave & recovery

**Created:** 2026-07-13
**Status:** 🟡 Draft (decisions locked 2026-07-13 — see Resolved Decisions)

## Problem

The brief wizard holds every input — campaign, size, brand kit, design mode, template, topic, prompt, goal, tone, uploaded-image references — in client-side `useState` (`src/components/brief/useBriefWizard.ts`). Nothing touches the server until the final **Generate** click (`POST /api/briefs`).

Consequence: a half-completed brief is silently lost on tab close, refresh, accidental navigation, or session expiry mid-wizard. A user who has written a long prompt (the most expensive field to reproduce) starts from zero. This is asymmetric with generation itself, which since F1 (async generation) survives navigation — the fragile window is now _before_ Generate, not after.

Uploaded images are half-lost today: the PNG bytes are already persisted in MinIO by `POST /api/briefs/images`, but the client-side references (`url`, `filename`, `intent`) die with the tab, orphaning the objects.

## Proposed Solution

**Server-side unfinished-brief drafts with dashboard resume.**

1. **Model**: a new `BriefDraft` row (or `Brief.status=DRAFT` — decide in design) storing the full recoverable wizard state as a JSON payload (`step`, `campaignId`, `aspectRatio`, `brandKitId`, `designMode`, `templateId`, `referenceTemplateId`, `topic`, `prompt`, `goal`, `tone`, `images[]`), per user, with `updatedAt`. One migration.
2. **Autosave**: the wizard debounces (~1–2s) a `PUT` of the payload once the draft is non-trivial (topic or prompt non-empty, or images uploaded). Silent failures — autosave must never block typing.
3. **Resume from the dashboard**: unfinished briefs render as distinct **"Unfinished brief" cards inline in the dashboard's Recent Drafts section** (topic + last-edited time + Resume / Discard), most recent first, alongside generated drafts. Resume opens `/brief?resume=<id>`, rehydrates all state, and jumps to the saved step. (The Recent Drafts card is now expandable in place — landed separately 2026-07-13 — so unfinished-brief cards participate in the same collapsed/expanded list.)
4. **Cap**: **up to 5 unfinished drafts per user**; starting a 6th silently drops the oldest (and deletes its uploaded MinIO images).
5. **TTL**: drafts idle for **7 days** are auto-deleted, **including their uploaded MinIO images** (lazy sweep on read, mirroring the stale-IN_PROGRESS pattern from F1 — no new worker loop).
6. **Clear on success / discard**: successful Generate deletes the draft row; explicit Discard deletes the row **and its MinIO images**.
7. **Validation on resume**: restored `templateId`/`brandKitId`/`campaignId` re-validated against current data (the wizard's existing consistency effect already clears mismatched templates — reuse it).

## Resolved Decisions (2026-07-13)

| Question          | Decision                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------- |
| Storage           | **Server-side DRAFT rows** (cross-device, dashboard-listable, server-side image cleanup) |
| Restore surface   | **Dashboard — cards inline in the Recent Drafts section**, not a `/brief` banner         |
| Drafts per user   | **Up to 5**, oldest dropped                                                              |
| TTL               | **7 days**, expiry also deletes the draft's uploaded MinIO images                        |
| Discard behaviour | Deletes the draft **and** its uploaded MinIO images                                      |

## Scope

### In Scope

- Migration + model for unfinished briefs (JSON payload, per-user, updatedAt)
- Autosave API (`PUT`/`GET`/`DELETE`, `withAuth`, zod) + debounced wizard integration
- Dashboard: unfinished-brief cards inline in the Recent Drafts card with Resume / Discard
- Resume flow: `/brief?resume=<id>` rehydration incl. step position + image references
- 5-per-user cap, 7-day lazy TTL sweep, MinIO image deletion on discard/expiry/cap-eviction
- Entity-ID re-validation on resume
- Unit tests (payload validation, TTL/cap logic); E2E: fill → leave → resume from dashboard → generate; discard removes card

### Out of Scope

- Real-time multi-tab conflict resolution (last write wins)
- Autosaving mid-flight `submitting` state or retrying a failed generate (F1 retry covers post-Generate failures)
- Garbage collection for images orphaned _before_ this feature ships (pre-existing gap)
- Any change to the generation pipeline

## Impact

- **Files affected:** ~8–10 — Prisma schema + migration, new API route(s), `useBriefWizard.ts` (autosave + rehydrate), dashboard page + `RecentDraftsCard`, new unfinished-brief card component, api-types, tests
- **Complexity:** medium
- **Risk:** low–medium — one additive migration; autosave is fire-and-forget so wizard behaviour degrades to today's if the API fails; main hazard is rehydrating stale entity IDs, mitigated by re-validation

## Open Questions

1. `BriefDraft` table vs `Brief.status=DRAFT` on the existing model — the design phase should pick based on how much of `Brief`'s shape the wizard payload actually matches (leaning separate table: the payload is wizard-shaped, not brief-shaped, and keeps `Brief` invariants intact).
2. Should the activity feed also mention "Brief resumed/discarded" events? (Probably no — noise.)

---

**To proceed:** Approved decisions above; run `/specclaw:plan` to produce spec.md, design.md, tasks.md.
