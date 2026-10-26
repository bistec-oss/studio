# Tasks: Publish API correctness — a failed publish must not report success

**Change:** 017-publish-api-fixes · **Size:** bounded

## Summary

This change has **3 tasks in 2 waves**. Each task is implemented by a subagent, reviewed by `specclaw:code-reviewer`, and committed by the orchestrator. Run them one at a time. No real model or social calls.

## Tasks

### Wave 1 — Server and client

- [x] `T1` — A failed publish or retry is a 502, and the UI shows it
  - Files: `src/app/api/posts/route.ts`, `src/app/api/posts/[id]/publish/route.ts`, `src/components/library/PublishDialog.tsx`, `src/app/(app)/library/page.tsx`, `src/app/(app)/drafts/[id]/page.tsx` (only if its `onSuccess` wiring needs it), `tests/unit/jobRunner.test.ts`, `tests/e2e/publish.test.ts`, `docs/e2e-test-plan.md`
  - Estimate: medium
  - Kind: impl
  - Depends: none
  - Notes:
    - **Covers:** FR-01–FR-04, AC-01–AC-03.
    - Read `src/lib/apiFetch.ts` (`ApiError`) and `src/lib/testHooks.ts` (the `__FAIL_*__` sentinels) first.
    - The dialog must not call `onSuccess` (which closes it) when any channel failed.
    - Add the AC-03 dialog case to `tests/e2e/publish.test.ts` (or the UI spec where the dialog is already exercised).

- [x] `T2` — Check order, and the posts list's batch caption load
  - Files: `src/app/api/posts/route.ts`, `src/lib/captions/store.ts`, `tests/unit/jobRunner.test.ts`, `tests/unit/captionStore.test.ts`
  - Estimate: small
  - Kind: impl
  - Depends: T1
  - Notes:
    - **Covers:** FR-05, FR-06, AC-04, AC-05.
    - The batch helper must return exactly what `loadCaptionText` would for each (draft, channel), including a missing row.

### Wave 2 — Gate

- [x] `T3` — Full gate and CI
  - Files: `docs/handoff.md`, `CLAUDE.md`
  - Estimate: small
  - Kind: docs
  - Depends: T2
  - Notes:
    - **Covers:** AC-06.
    - Run the standard full clean mock E2E and the build, then push, watch CI (L21) and record the totals in the handoff.
