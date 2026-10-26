# Tasks: Draft-page async-action settle race (the red fork CI)

**Change:** 015-draft-action-settle-race · **Size:** bounded

## Summary

This change has **3 tasks in 2 waves**, all built on `v2`. The approach is test-first:

1. **T1** adds the forced-race cases and shows they fail on the current code.
2. **T2** fixes both settles.
3. **T3** runs the gates and closes out the CI.

Each task is implemented by a subagent, reviewed by `specclaw:code-reviewer`, and committed by the orchestrator. Run the tasks one at a time.

## Tasks

### Wave 1 — Test, then fix

- [x] `T1` — The forced-race E2E cases, failing on the current code
  - Files: `tests/e2e/settle-race.test.ts` (new)
  - Estimate: small
  - Kind: test
  - Depends: none
  - Notes:
    - **Covers:** FR-03. **ACs:** AC-01, AC-02 (written now), AC-03 (the "fails before" half).
    - **The race:** hold the first `GET /api/drafts/<id>` (the exact path, not `/revisions`) for about 3 s after the action POST, using `page.route`. Use the shape of the parked repro at `<scratchpad>/refine-race-repro.test.ts`.
    - **Cases:** two, one for refine and one for Regenerate design. Assert the AC-01 and AC-02 outcomes, and assert that the delay actually happened (`expect(delayed).toBe(true)`).
    - **Run against the unfixed code:** both cases must FAIL, for the stated cause. Record the failure lines in the report.

- [x] `T2` — Settle on state: RefinementPanel and the revision list
  - Files: `src/components/drafts/RefinementPanel.tsx`, `src/app/(app)/drafts/[id]/page.tsx`
  - Estimate: small
  - Kind: impl
  - Depends: T1
  - Notes:
    - **Covers:** FR-01, FR-02, FR-04. **ACs:** AC-01, AC-02, AC-03 (the "passes after" half), AC-04, AC-07, AC-08.
    - **Follow spec `## Approach` exactly.** The outcome logic is unchanged and only the trigger moves.
    - **FR-02's no-loop guard is required.**
    - **Prove it:**
      - T1's cases pass;
      - `agui-refinement` and `refine-not-applied` pass;
      - a mutation run that reverts each of the two changes in turn turns its case red.
    - **Write the FR-04 audit result in the report.**

### Wave 2 — Gate and CI

- [x] `T3` — Full gate, fork CI green, handoff
  - Files: `docs/handoff.md`, `CLAUDE.md`
  - Estimate: small
  - Kind: docs
  - Depends: T2
  - Notes:
    - **Covers ACs:** AC-05, AC-06.
    - **Run the standard full clean mock E2E,** then push `v2` and watch the `E2E` run with `gh run watch`. It must conclude `success`.
    - **Then update the handoff and CLAUDE.md:**
      - the red-CI follow-up is closed;
      - the 011 "Applying…" follow-up is closed;
      - learning L21 is resolved;
      - the caption/headline undo-clear edge is logged as a small follow-up.
    - **If CI is not green,** report it to the user before any CI-only change (013 NFR-02).

## Legend

- `[ ]` pending · `[~]` in progress · `[x]` complete · `[!]` failed
