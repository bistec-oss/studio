# F4 — Chat-driven auto-scheduling

> Refine this plan just before build — F1 (async generation) informs it.

## Goal

In the campaign voice chat, a user says "generate posts as per a scheme" → the AI proposes
topics + dates, the user edits/approves, and the system auto-creates the scheduled-generation
(and publishing) queue entries — no manual per-post entry.

## Locked decisions

- AI **infers** count / cadence / dates from natural language, then shows a **confirm plan**.
- The plan renders as an **editable list** — edit / remove / reorder topics and dates — before approval.
- Post-action: **AI proposes per scheme, defaults to HOLD**; auto-publish
  (`SCHEDULE_PUBLISH`/`PUBLISH_NOW`) stays **admin-only** (the chat is already admin-only).
- Channels + size default to **campaign defaults**, editable in the plan.

## Current state (from exploration)

- The briefing chat is **admin-only** (`withAdmin`), **stateless**, client owns the transcript,
  and uses a ` ```briefing ` fenced-block convention the model emits and the client extracts.
- `POST /api/campaigns/[id]/queue` creates **exactly one** `ScheduledGeneration` per call —
  no bulk create, no assistant-driven creation path yet.
- `ScheduledGeneration` already has every field needed (topic/goal/tone/channels/aspectRatio/
  designMode/template/generateAt/postAction/publishAt); the worker already handles
  HOLD / SCHEDULE_PUBLISH / PUBLISH_NOW → SCHEDULED posts.

## Approach

- Add a **sibling fenced convention** ` ```schedule ` — the model emits a JSON plan (list of
  proposed entries). Client renders it as an approve-able, editable table.
- Add a **batch-create endpoint** (`POST /api/campaigns/[id]/queue/batch`) that validates and
  inserts many `ScheduledGeneration` rows in one transaction.
- Extend `briefingAssistant.ts` prompt so the model knows when/how to emit ` ```schedule `.
- UI in the briefing assistant panel: detect the block, render the editable plan, "Schedule all".

## Files (confirm at build)

- `src/lib/campaign/briefingAssistant.ts` (prompt convention)
- `src/app/api/campaigns/[id]/queue/batch/route.ts` (new)
- `src/lib/campaign/queue.ts` (batch validation/insert)
- `src/components/campaigns/BriefingAssistantPanel.tsx` (plan editor + approve)

## Verify / test

- `tsc`, `lint`, `test:unit`; E2E: chat emits schedule block → edit a topic → approve →
  rows created with correct fields → worker generates them (MOCK_AI + test-DB, like existing
  campaign-scheduling cases).

## Risks / notes

- RBAC: editors must not be able to create auto-publish entries via the batch endpoint.
- Reuse the existing versioned-briefing / worker machinery; this is mostly AI-plan + UI + batch endpoint.
