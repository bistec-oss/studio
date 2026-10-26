# T1 — work in progress (interrupted 2026-10-13 by a usage limit)

T1 is **still in_progress**. Its implementer subagent was cut off by a session usage limit while starting FR-02. The orchestrator finished the half-written pieces, fixed one type error, and committed the work-in-progress so nothing is lost.

## Done (committed in the WIP commit, not yet reviewed)

- **FR-01 — the ACP manifest.**
  - `src/acp/agent.ts`: the `generate_post` output schema lists `headline` and `captions`, and the manifest version is bumped.
  - `src/mcp/server.ts`: the description is updated.
  - `docs/mcp-acp-guide.md`: updated.
  - The drift guard is in `tests/unit/mcpGetDraft.test.ts` ("the ACP manifest advertises exactly the output generatePost returns"). The orchestrator fixed its cast to `as unknown as Schema` (TS2352).
  - **Not yet done:** the AC-01 mutation proof (remove a key from either side and show the guard fails).
- **FR-02 — the refine label.**
  - `src/lib/models/policyForm.ts` `systemDefaultName` names both defaults for REFINE when they differ ("Sonnet 5.5; Haiku 4.5 on template drafts").
  - Unit cases are in `tests/unit/modelPolicyForm.test.ts`.
  - The E2E row in `tests/e2e/model-selection.test.ts` is updated to match the rendered `System default (<name>)` label.
  - **Not yet run:** the E2E itself.
- **FR-03 — the comments.** `src/lib/agent/claudeCli.ts` (the edge-case comment moved) and `src/mcp/tools/generate.ts` (reworded).

## Not done

- **FR-04 — the draft GET.** Narrow `copyProviderIsClaude`'s provider select to `providerName` (check the other callers of `findCopyProviderRecord` first), and run it in `Promise.all` with `resolveBrandKit` and `resolveNotAppliedOutcome`. Assert the narrowed select in `tests/unit/draftDetailGet.test.ts` (AC-04).
- Then: targeted E2E (model-selection, acp, team-settings), the `specclaw:code-reviewer` pass, and marking T1 complete.

## Gates at the WIP commit

- tsc: clean.
- lint: 0 errors.
- unit: 2551/2551.
- `mcpGetDraft` and `modelPolicyForm`: 33/33.
