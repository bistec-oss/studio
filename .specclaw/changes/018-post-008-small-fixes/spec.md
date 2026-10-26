# Spec: Post-008 small fixes, the 015 tail and test hygiene

**Change:** 018-post-008-small-fixes · **Size:** bounded · **Proposal:** [proposal.md](proposal.md)

## Overview

This change clears the open follow-ups from 008, 012, 014 and 015. The line pointers are in the proposal; they were checked against HEAD on 2026-10-13.

## Approach

**One decision: every fix copies an existing pattern in the repo.** Nothing new is invented:

- the 015 `settleArmed` pattern for the Undo;
- the existing `decideModel` for the refine label;
- `tests/helpers/ui.ts`-style helpers for axe.

The file map:

- `src/acp/agent.ts`, `src/mcp/server.ts`, `src/mcp/tools/generate.ts`, `docs/mcp-acp-guide.md`
- `src/lib/models/policyForm.ts`, `src/components/team/ModelsCard.tsx` (or wherever the defaults render)
- `src/lib/agent/claudeCli.ts`
- `src/app/api/drafts/[id]/route.ts`, `src/providers/registry.ts`
- `src/components/drafts/{CaptionPanel,HeadlinePanel,CaptionPanels}.tsx`, `src/app/(app)/drafts/[id]/page.tsx`, `src/lib/testHooks.ts` (one new sentinel, if needed)
- `src/components/campaigns/BriefingAssistantPanel.tsx`, `docs/ui-reference/DESIGN_SYSTEM.md`
- tests: `tests/helpers/axe.ts` (new); `tests/e2e/{a11y,captions,model-selection,settle-race}.test.ts`; `tests/unit/{mcpGetDraft,modelPolicyForm,uiTokenGuard,draftDetailGet}.test.ts`

## Requirements

### Functional Requirements

- **FR-01 — The ACP manifest matches the handler.**
  - The `generate_post` output schema in `src/acp/agent.ts` lists `headline` (`string | null`) and `captions` (an array of `{channel, text, status}`), and the manifest version is bumped.
  - The MCP tool description (`src/mcp/server.ts`) and `docs/mcp-acp-guide.md` say the same.
  - A unit test fails if the handler's output keys and the manifest's `output.properties` keys differ.
- **FR-02 — The refine label names both defaults.** `/team` → Models labels the REFINE system default with the design path:
  - when the Path A and Path B defaults differ: "System default (Sonnet 5.5; Haiku 4.5 on template drafts)";
  - when they match: a single name.
  - Every other surface is unchanged.
- **FR-03 — Stale comments.**
  - The orphaned "Known edge case" comment in `claudeCli.ts` moves to the `withAuthRetry` header.
  - The "per-path models" comment in `src/mcp/tools/generate.ts` is reworded to "the team's model policy and system defaults (src/lib/models)".
- **FR-04 — The draft GET stops one lookup per poll.**
  - The provider lookup selects only `providerName`.
  - It runs in `Promise.all` with the other independent reads (`resolveBrandKit`, `resolveNotAppliedOutcome`).
  - The response is unchanged.
- **FR-05 — The caption and headline Undo settle on state (L25).** `CaptionPanel` and `HeadlinePanel` clear their Undo only after an **armed** settle, following the RefinementPanel pattern:
  - arm after the awaited post-202 refetch;
  - resolve when the action is no longer pending;
  - clear only if the text equals the snapshot.

  "Regenerate all" arms every panel. The observed-edge refs are removed.

- **FR-06 — The revision list retries after a failure.**
  - `fetchRevisions` reports success.
  - On failure, the page resets its guard and retries with backoff (2, 4, 8 s, at most 3 tries).
  - It never retries after a success that still lacks the current number (015 FR-02's no-loop rule).
- **FR-07 — Test hygiene:**
  - one shared `tests/helpers/axe.ts` (the rule list; an `expectNoAxeViolations(page, what, { settle? })` that logs `incomplete` results) replaces the three copies;
  - TC-MODEL-14 picks Sonnet for Caption and asserts the autosave payload, the resume, the brief body and stored value, the caption stamps and the recorded CAPTION run as `request`;
  - the wave-2 `afterEach` returns early when `beforeEach` skipped;
  - `uiTokenGuard` also catches digit-suffixed legacy palette classes such as `text-primary-500`.
- **FR-08 — Small UI and docs.**
  - `BriefingAssistantPanel.tsx` uses `EYEBROW` where it spells out the same classes.
  - DESIGN_SYSTEM §8.18 lists `COMPACT_TEXTAREA`.

### Non-Functional Requirements

- **NFR-01:** no schema change, and no behaviour change except FR-05 and FR-06.
- **NFR-02:** no real model calls.
- **NFR-03:** the shared axe helper keeps each call site's settle behaviour; the `networkidle` wait is opt-in.

## Acceptance Criteria

- **AC-01 (FR-01):** the manifest drift unit test passes, and fails if a key is removed from either side (show this in the report).
- **AC-02 (FR-02):**
  - unit: `modelPolicyForm` gives the dual label for REFINE, and an unchanged label for other surfaces and when the paths agree;
  - E2E: the `/team` Models row reads the new label.
- **AC-03 (FR-03):** a review confirms both comments.
- **AC-04 (FR-04):** `draftDetailGet` unit tests pass and assert the narrowed select.
- **AC-05 (FR-05):** a new `settle-race.test.ts` case.
  - The first post-202 GET is held for 3 s.
  - A caption regenerate whose result leaves the text identical ends with **no** Undo.
  - Removing the arm (a mutation run) turns the case red; record this in the report.
- **AC-06 (FR-06):** a new `settle-race.test.ts` case. After a regenerate-design 202, `/revisions` returns 500 once, and the new version appears without a reload.
- **AC-07 (FR-07):** the three axe copies are gone, every axe-scanning spec passes, TC-MODEL-14 passes with the new asserts, and `uiTokenGuard` has a case for the digit-suffixed class.
- **AC-08:**
  - tsc clean; lint 0 errors; unit all pass; build passes;
  - a full clean mock E2E with 0 failures;
  - fork CI green.

## Edge Cases

- A caption regenerate that **changes** the text keeps its Undo, which restores the old text. That is the existing behaviour.
- A revision fetch that keeps failing stops after 3 retries; a reload still works.

## Dependencies

016 and 017.
