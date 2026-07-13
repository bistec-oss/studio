# Tasks: Brief draft autosave & recovery

**Change:** brief-draft-recovery
**Created:** 2026-07-13
**Total Tasks:** 6

## Summary

Three waves: (1) data + service layer with unit tests, (2) API + wizard + dashboard wiring, (3) E2E + full gates. Small enough to build in one session; each wave commits independently.

## Tasks

### Wave 1 — Data & service layer

- [x] `T1` — `BriefDraft` model + migration
  - Files: `prisma/schema.prisma`, `prisma/migrations/*_brief_draft/`
  - Estimate: small
  - Notes: additive; `@@index([userId, updatedAt])`; run `migrate dev` against local DB, `generate`.

- [ ] `T2` — Lifecycle service + unit tests
  - Files: `src/lib/brief/briefDrafts.ts`, `tests/unit/briefDrafts.test.ts`, `src/lib/api-types.ts`
  - Estimate: medium
  - Depends: T1
  - Notes: zod payload schema (64 KB cap, non-trivial check), list-with-TTL-sweep, upsert-with-cap-eviction, owner-scoped get/delete, `deleteDraftImages` with strict `briefs/<userId>/` prefix parsing. Unit-test the pure parts (schema, URL→key, trivial-payload predicate) + mocked-prisma cap/TTL rules following existing unit-test patterns.

### Wave 2 — API + wizard + dashboard

- [ ] `T3` — API routes
  - Files: `src/app/api/brief-drafts/route.ts`, `src/app/api/brief-drafts/[id]/route.ts`
  - Estimate: small
  - Depends: T2
  - Notes: `withAuth` + `parseBody`; PUT unknown id → 404 (prevents post-generate resurrection); DELETE honors `?keepImages=true`; 404 (not 403) on foreign ids.

- [ ] `T4` — Wizard autosave + resume
  - Files: `src/components/brief/useBriefWizard.ts`
  - Estimate: medium
  - Depends: T3
  - Notes: `useSearchParams('resume')` rehydration on mount; 1.5s debounced PUT with single in-flight guard + trailing save; `finishedRef` stops autosave on Generate success then fire-and-forget DELETE with keepImages; silent failure everywhere. Existing consistency effect covers dangling ids — do not duplicate.

- [ ] `T5` — Dashboard unfinished rows
  - Files: `src/app/(app)/page.tsx`, `src/components/dashboard/RecentDraftsCard.tsx`
  - Estimate: medium
  - Depends: T3
  - Notes: `getCurrentUser()` in `getDashboardData`; `listBriefDrafts` (sweeps); leading rows in the table with "Unfinished" chip, Resume link (`/brief?resume=<id>`), Discard via `useConfirm` + DELETE + `router.refresh()`. Rows count toward the collapsed-8 budget.

### Wave 3 — E2E + gates

- [ ] `T6` — E2E suite + full gates
  - Files: `tests/e2e/brief-draft-recovery.test.ts`, `docs/e2e-test-plan.md` (catalog entry)
  - Estimate: medium
  - Depends: T4, T5
  - Notes: cover AC-1 (save→dashboard→resume), AC-2 (generate clears), AC-3 (discard + image gone), AC-4 (cap), AC-5 (TTL via back-dated `updatedAt`), AC-6 (foreign id 404), AC-7 (trivial payload rejected), AC-8 (dangling template id) — API-level where UI automation is heavy, mirroring existing suite style. Then run: tsc, lint, `test:unit`, full mock E2E, `next build`.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
