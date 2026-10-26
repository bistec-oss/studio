# Spec: Publish API correctness — a failed publish must not report success

**Change:** 017-publish-api-fixes · **Size:** bounded · **Proposal:** [proposal.md](proposal.md)

## Overview

A publish that fails at the platform currently answers 2xx, so the UI reports success. This change makes a failed immediate publish, and a failed retry, an error response that the client shows as a failure. It also orders the `POST /api/posts` checks so that a duplicate is always 409, and loads the posts list's captions in one query.

## Approach

**One decision: a FAILED outcome is HTTP 502 with the post row's id.** The row is still created (a FAILED row is the record), and the body keeps `postId` and `status`, so no information is lost. The client's existing `ApiError` path does the rest.

The file map:

- **Routes:** `src/app/api/posts/route.ts` (POST: the 502 and the check order; GET: the batch caption load) and `src/app/api/posts/[id]/publish/route.ts` (retry: 502).
- **Captions:** `src/lib/captions/store.ts` gains a batch loader beside `loadCaptionText`.
- **Client:** `src/components/library/PublishDialog.tsx` (the ✕ failed state with the reason; it stays open) and `src/app/(app)/library/page.tsx` (Retry shows the error).
- **Tests:** `tests/unit/jobRunner.test.ts`, `tests/e2e/publish.test.ts` and an E2E dialog case.
- **Docs:** `docs/e2e-test-plan.md` (the publish contract).

## Requirements

### Functional Requirements

- **FR-01 — A failed immediate publish is a 502.** When `createAndPublishPost` returns an `error`, `POST /api/posts` returns **502** `{ error: <errorReason>, code: 'PUBLISH_FAILED', postId, status: 'FAILED' }`. Success stays **201** `{postId, status}`. The FAILED row is still persisted, as today.
- **FR-02 — A failed retry is a 502.** `POST /api/posts/[id]/publish` returns the same 502 shape when the retry ends FAILED. Success is unchanged.
- **FR-03 — The dialog shows the failure.** In `PublishDialog`, a channel whose request rejects with `PUBLISH_FAILED` shows "✕ failed" with the error text and is not locked as published. The dialog does **not** close when any channel failed. A channel that succeeded in the same submission still shows ✓.
- **FR-04 — The library Retry shows the failure.** A rejected retry surfaces the error (toast) and the post stays FAILED in the list.
- **FR-05 — Check order in `POST /api/posts`:**
  1. the existing 400/404/422 input checks (draftId, channel, draft, export);
  2. `scheduledAt` validation (400);
  3. the duplicate check (409 with `postId`);
  4. the caption check (422 `CAPTION_UNPUBLISHABLE`).

  A double-click on a live post therefore always gets 409.

- **FR-06 — The posts list loads captions in one query.** `GET /api/posts` resolves every row's channel caption with one `draftCaption.findMany` for the page's draft ids, in a new batch helper in `store.ts`. The response shape (`draft.caption`) is unchanged. A draft with no row for that channel gets the same value `loadCaptionText` returns today.

### Non-Functional Requirements

- **NFR-01:** MCP/ACP publish is unchanged; it already errors.
- **NFR-02:** no schema change.
- **NFR-03:** no real model calls or social calls while testing (`MOCK_SOCIAL`, the `__FAIL_*__` sentinels).

## Acceptance Criteria

- **AC-01 (FR-01):**
  - unit: an immediate `PublishError` gives 502 with `code`, `postId` and `status: 'FAILED'`, and a FAILED row exists;
  - E2E (`publish.test.ts`): the immediate-failure case expects 502, and its body carries `postId` and `status: 'FAILED'`.
- **AC-02 (FR-02):** unit or E2E: a retry that fails again gives 502 in the same shape.
- **AC-03 (FR-03):** E2E: a draft whose topic carries the `__FAIL_ALWAYS__` sentinel, published through the dialog, shows the ✕ failed state with the reason, and the dialog stays open.
- **AC-04 (FR-05):** unit: a live post plus a refused caption gives 409, not 422.
- **AC-05 (FR-06):** unit: one `draftCaption.findMany` for a multi-post page, and `draft.caption` is correct per row (including a missing channel).
- **AC-06:**
  - tsc clean; lint 0 errors; unit all pass; build passes;
  - a full clean mock E2E with 0 failures;
  - fork CI green;
  - `docs/e2e-test-plan.md` describes the 502 contract.

## Edge Cases

- **A publish failure on one channel of a two-channel submission:** the dialog shows one ✓ and one ✕ and stays open, and the user can retry the failed channel. A FAILED row is not live, so a re-submit is allowed.
- **A scheduled publish** is never immediate, so it never returns 502. The scheduler records a later failure on the row.

## Dependencies

016 (the caption loader is already simplified).
