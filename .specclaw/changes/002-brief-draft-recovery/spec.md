# Spec: Brief draft autosave & recovery

**Change:** brief-draft-recovery
**Created:** 2026-07-13
**Status:** 🟡 Draft

## Overview

Persist in-progress brief-wizard state server-side so a half-written brief survives tab close, refresh, navigation, and device switches. Unfinished briefs surface as rows in the dashboard's Recent Drafts card with Resume / Discard; resuming rehydrates the wizard exactly where the user left off. Complements F1 (async generation), which already made the _post_-Generate window navigation-safe.

## Requirements

### Functional Requirements

- **FR-1 Autosave.** While the wizard has non-trivial content (topic non-empty OR prompt non-empty OR ≥1 uploaded image), changes to recoverable state are autosaved to the server, debounced (~1.5s after the last change). Recoverable state: `step`, `campaignId`, `aspectRatio`, `brandKitId`, `designMode`, `templateId`, `referenceTemplateId`, `topic`, `prompt`, `goal`, `tone`, `images[] {url, filename, intent}`. Autosave failures are silent (console-only) and never block the wizard.
- **FR-2 Persistence model.** Unfinished briefs are stored per-user in a new `BriefDraft` table: wizard payload as validated JSON, `topic` denormalized for display, `updatedAt` maintained. Owner-only access (admins may NOT read other users' unfinished briefs — they are private working state, unlike generated drafts).
- **FR-3 Cap.** Max **5** unfinished briefs per user. Creating a 6th evicts the oldest-updated one, deleting its uploaded brief images from MinIO.
- **FR-4 TTL.** Unfinished briefs idle >**7 days** are deleted lazily on read (list/dashboard fetch), including their MinIO images. No new worker loop.
- **FR-5 Dashboard surfacing.** The current user's unfinished briefs render as rows at the top of the dashboard Recent Drafts card (topic or "Untitled brief", campaign, "Unfinished" status chip, last-edited relative time, **Resume** and **Discard** actions). They participate in the card's collapsed(8)/expanded(25) row budget. Discard asks for confirmation via the existing `useConfirm()` pattern.
- **FR-6 Resume.** Opening `/brief?resume=<id>` loads the saved payload, rehydrates all wizard state including the step position, and continues autosaving into the **same** row (no duplicate). Restored `campaignId`/`brandKitId`/`templateId`/`referenceTemplateId` that no longer exist (or no longer match the selected kit/ratio) are cleared by the wizard's existing consistency logic; everything else is kept.
- **FR-7 Lifecycle.**
  - Generate success → the `BriefDraft` row is deleted, **keeping** its images (the created `Brief.briefImages` now references them).
  - Discard (dashboard) → row **and** its `briefs/<userId>/…` MinIO images are deleted.
  - Cap eviction / TTL expiry → same as discard.
- **FR-8 Authorization.** All `BriefDraft` routes are `withAuth`; every read/write/delete verifies `userId` ownership (404 on other users' ids — do not leak existence).

### Non-Functional Requirements

- **NFR-1** Autosave must not degrade typing: debounced, fire-and-forget, no spinners, latest-wins (a stale in-flight PUT must not clobber a newer one — serialize via a single in-flight guard).
- **NFR-2** Payload validated with zod on write; payload size capped (64 KB) — images are URLs, not data.
- **NFR-3** Image deletion only ever touches keys under the owner's `briefs/<userId>/` prefix in the IMAGES bucket; unparsable/foreign URLs are skipped, and MinIO deletion failures never fail the row deletion.
- **NFR-4** One additive Prisma migration; no changes to existing generation/publish flows; wizard behaves exactly as today if the autosave API is unreachable.

## Acceptance Criteria

- **AC-1** Fill topic+prompt on `/brief`, wait ≥2s, close the tab: the dashboard shows an "Unfinished brief" row with that topic; Resume returns to the wizard with all fields, images, and step restored, on any logged-in device.
- **AC-2** Completing Generate from a resumed wizard removes the unfinished row from the dashboard; the generated draft renders with its images intact.
- **AC-3** Discard (with confirm) removes the row; its uploaded images are deleted from MinIO; other rows unaffected.
- **AC-4** A 6th unfinished brief evicts the oldest (dashboard shows 5, oldest gone).
- **AC-5** A row with `updatedAt` back-dated >7 days does not appear in the dashboard and is deleted on the next read.
- **AC-6** User B cannot GET/PUT/DELETE user A's `BriefDraft` id (404), including as ADMIN.
- **AC-7** An empty wizard (no topic, no prompt, no images) never creates a row.
- **AC-8** Resume with a since-deleted template/kit/campaign id opens without error; the dangling selection is cleared, remaining fields intact.
- **AC-9** Gates: tsc, lint, full unit suite, E2E suite (new cases + existing green), production build.

## Edge Cases

- Two tabs editing the same unfinished brief: last write wins (accepted; no conflict UI).
- Autosave in flight when Generate succeeds: deletion happens after the brief POST; a late PUT re-creating the row is prevented by resolving deletes against the in-flight guard (stop autosaving before generate).
- `?resume=<id>` for a deleted/expired/foreign row: wizard opens fresh (no crash, no error modal).
- Payload from an older app version (schema drift): zod-invalid payloads on read are treated as missing → row swept.
- User with 5 rows resumes one, edits: updates in place (no eviction).

## Dependencies

- Existing: `withAuth`/`parseBody` (`src/lib/api/handler.ts`), `getCurrentUser()` (`src/lib/auth.ts`), `deleteObject`/`publicUrl`/`BUCKET_IMAGES` (`src/lib/storage/minio.ts`), `useConfirm()`, `RecentDraftsCard` (landed 2026-07-13), F1 lazy-sweep precedent (`src/app/api/drafts/[id]/route.ts`).
- No new packages. One Prisma migration.

## Notes

Storage decision (proposal): separate `BriefDraft` table, NOT `Brief.status=DRAFT` — the payload is wizard-shaped (step index, image intents) not brief-shaped, and keeping `Brief` append-only-on-Generate preserves its invariants (every Brief has a Draft; library/dashboard queries stay untouched).
