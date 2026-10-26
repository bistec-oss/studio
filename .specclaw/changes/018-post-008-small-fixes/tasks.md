# Tasks: Post-008 small fixes, the 015 tail and test hygiene

**Change:** 018-post-008-small-fixes · **Size:** bounded

## Summary

This change has **4 tasks in 2 waves**. Each task is implemented by a subagent, reviewed by `specclaw:code-reviewer`, and committed by the orchestrator. Run them one at a time. No real model calls.

## Tasks

### Wave 1 — Fixes

- [x] `T1` — The ACP manifest, the refine label, the comments and the draft-GET lookup
  - Files: `src/acp/agent.ts`, `src/mcp/server.ts`, `src/mcp/tools/generate.ts`, `docs/mcp-acp-guide.md`, `src/lib/models/policyForm.ts`, `src/components/team/ModelsCard.tsx`, `src/lib/agent/claudeCli.ts`, `src/app/api/drafts/[id]/route.ts`, `src/providers/registry.ts`, `tests/unit/mcpGetDraft.test.ts`, `tests/unit/modelPolicyForm.test.ts`, `tests/unit/draftDetailGet.test.ts`, `tests/e2e/model-selection.test.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: none
  - Notes:
    - **Covers:** FR-01–FR-04, AC-01–AC-04.
    - Find the real file that renders the Models defaults (`ModelsCard.tsx` per the sweep); adjust if it moved.

- [x] `T2` — Caption and headline Undo settle on state; the revision list retries
  - Files: `src/components/drafts/CaptionPanel.tsx`, `src/components/drafts/HeadlinePanel.tsx`, `src/components/drafts/CaptionPanels.tsx`, `src/app/(app)/drafts/[id]/page.tsx`, `src/lib/testHooks.ts` (only if a new sentinel is needed), `tests/e2e/settle-race.test.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T1
  - Notes:
    - **Covers:** FR-05, FR-06, AC-05, AC-06.
    - Copy RefinementPanel's `settleArmed` pattern exactly.
    - Do the mutation check for AC-05 and record it.

- [x] `T3` — Test hygiene and small UI/docs
  - Files: `tests/helpers/axe.ts` (new), `tests/e2e/a11y.test.ts`, `tests/e2e/captions.test.ts`, `tests/e2e/model-selection.test.ts`, `tests/unit/uiTokenGuard.test.ts`, `src/components/campaigns/BriefingAssistantPanel.tsx`, `docs/ui-reference/DESIGN_SYSTEM.md`
  - Estimate: medium
  - Kind: test
  - Depends: T2
  - Notes:
    - **Covers:** FR-07, FR-08, AC-07.
    - Each call site keeps its current settle behaviour (NFR-03).

### Wave 2 — Gate

- [x] `T4` — Full gate, docs and CI
  - Files: `docs/handoff.md`, `CLAUDE.md`, `docs/e2e-test-plan.md`
  - Estimate: small
  - Kind: docs
  - Depends: T3
  - Notes:
    - **Covers:** AC-08.
    - Run the standard full clean mock E2E and the build, then push and watch CI.
    - Mark the handoff follow-ups closed by 018.
