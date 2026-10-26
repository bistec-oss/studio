# Proposal: Publish API correctness — a failed publish must not report success

**Created:** 2026-10-13
**Status:** 🟡 Draft

## Problem

1. **A failed immediate publish shows "✓ published". This is a user-facing bug.**
   - `publishDraft` (`src/lib/publish/publishDraft.ts:98-108`) turns a platform error into a FAILED `Post` row and returns `{post, error}`.
   - `POST /api/posts` (`src/app/api/posts/route.ts:89-95`) ignores `error` and returns **201** `{postId, status: 'FAILED'}`.
   - `apiFetch` throws only on a non-2xx status. So `PublishDialog` (`src/components/library/PublishDialog.tsx:51-84`) shows the channel as published, locks its checkbox and closes.
   - The retry route (`src/app/api/posts/[id]/publish/route.ts:48-55`) does the same with 200, and the library's Retry treats it as success.
   - ACP already treats a failed publish as an error (422).
2. **A duplicate publish can get 422 instead of 409.** The caption check (`route.ts:41-47`) runs before the duplicate check (`:55-64`). A double-click on a post whose caption was later emptied gets `CAPTION_UNPUBLISHABLE`, not 409 with the existing `postId`.
3. **The posts list GET loads captions once per post** (`route.ts:118-129`). It runs a full caption load per row: 100+ queries for a 50-row page.

## Proposed Solution

1. **Return 502.** Both routes return **502** `{error, code: 'PUBLISH_FAILED', postId, status: 'FAILED'}` when the publish ends FAILED. The row still exists, so its id is returned. The dialog then shows "✕ failed" with the reason and stays open, and Retry shows the error.
2. **Reorder `POST /api/posts`:** `scheduledAt` validation first, then the duplicate check (409), then the caption check (422).
3. **Load captions for the whole page in one query.** Add a batch loader beside `loadDraftCaptions`, and fall back to the single loader only for drafts missing rows.

**Tests:**

- unit: `tests/unit/jobRunner.test.ts`;
- E2E: in `tests/e2e/publish.test.ts`, the 201 contract becomes 502, and a new dialog case is driven by the `__FAIL_ALWAYS__` sentinel.

**Docs:** the publish contract in `docs/e2e-test-plan.md`.

## Scope

### In Scope

Items 1–3, their tests and their docs.

### Out of Scope

- The check-then-act race in the duplicate check, which has no unique constraint behind it. It would be a separate change if it is ever needed.
- MCP/ACP publish, which already returns an error.

## Impact

- **Size:** bounded
- **Files affected:** about 8
- **Complexity:** small
- **Risk:** low. It changes an HTTP status in a contract that only this app's client and tests consume.

## Open Questions

None.
