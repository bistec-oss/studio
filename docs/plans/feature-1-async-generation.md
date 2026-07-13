# F1 — Async generation + skeleton loader

## Goal

Clicking Generate lands the user on the preview page immediately, with theme-matched
skeletons for copy + image that fill in as the real output arrives.

## Locked decisions

- Generation becomes **asynchronous**: create a placeholder `Draft` (status `IN_PROGRESS`)
  immediately, navigate straight to the preview page, and poll for completion.
- Copy and image skeletons **resolve independently** — copy shows as soon as it's written;
  the image skeleton keeps animating until the render lands.
- On failure → **inline error card with Retry** that re-runs generation for that same draft
  in place (needs the `FAILED` draft state — already in the enum — plus a retry endpoint).
- Generation runs **server-side regardless of the browser** — navigating away and back is safe.

## Current state (from exploration)

- Generation today is **fully synchronous**: `handleGenerate()` in
  `src/components/brief/useBriefWizard.ts` holds one request open through copy + design +
  Puppeteer render; the `Draft` row is created **after** the image exists, straight into
  `EXPORTED` (never `IN_PROGRESS`).
- The draft page **already has a dormant `setInterval` poll** gated on
  `status === 'IN_PROGRESS'` — it just never fires because drafts are born `EXPORTED`.

## Files to change (confirm at build)

- Generation route/orchestrator (`src/app/api/briefs/route.ts` + `src/lib/agent/generateDraft.ts`):
  split into "create IN_PROGRESS draft + return id" then "run generation in background",
  updating the draft to `EXPORTED` (or `FAILED`) on completion. Persist copy as soon as ready
  so the copy skeleton can resolve before the image.
- `src/components/brief/useBriefWizard.ts` — `handleGenerate` navigates to the draft page on
  draft-id return instead of awaiting the whole render.
- Draft page (`src/app/(app)/drafts/[id]/page.tsx` + `src/components/drafts/*`) — activate the
  existing poll; add copy + image **skeleton** components (Frozen Light theme); inline error +
  Retry on `FAILED`.
- New **retry endpoint** (`POST /api/drafts/[id]/retry`) — re-runs generation for a `FAILED`
  draft in place.

## Steps

1. Introduce the create-then-run split; draft born `IN_PROGRESS`.
2. Background execution (respect existing job/lease patterns; must survive client navigation).
3. Wire copy/image status into the poll response.
4. Skeleton UI + inline error/Retry.
5. Retry endpoint + `FAILED` transitions.

## Verify / test

- `tsc`, `lint`, `test:unit`; E2E generation flow updated for the async path.
- Real check: click Generate → lands on preview instantly with skeletons → copy resolves
  first, then image → navigate away and back mid-gen → still completes → force a failure
  (mock/sentinel) → inline error + Retry works.

## Risks / notes

- Biggest structural change of the six (introduces the job/status pattern). Reuse the existing
  scheduler claim/lease conventions rather than inventing a new one. Benefits F4.
- Ensure the MOCK_AI E2E seams still work on the async path.
