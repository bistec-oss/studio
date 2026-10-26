# Proposal: Post-008 small fixes, the 015 tail and test hygiene

**Created:** 2026-10-13
**Status:** 🟡 Draft

## Problem

These are the follow-ups left by 008, 012, 014 and 015 (`docs/handoff.md` "Still open after 008"). All were checked against HEAD on 2026-10-13, and all are still open:

1. **The ACP manifest under-advertises `generate_post`.** `src/acp/agent.ts:31-38` lists `{draftId, exportUrl, htmlContent}`, but the handler also returns `headline` and `captions`. The MCP tool description (`src/mcp/server.ts:77`) and `docs/mcp-acp-guide.md:143` are stale too.
2. **`/team` → Models shows Sonnet as refine's system default for every draft.** Template (Path A) drafts actually refine on Haiku; `policyForm.ts:61-74` doesn't pass `designPath`.
3. **Two stale comments:** the orphaned "Known edge case" in `src/lib/agent/claudeCli.ts:401-410`, and "per-path models" in `src/mcp/tools/generate.ts:22-25`.
4. **The draft GET runs a full provider lookup on every 4-second poll** (`src/app/api/drafts/[id]/route.ts:157-163`). It also runs one after another with other reads that don't depend on each other.
5. **The caption and headline Undo clears on an observed edge** (`CaptionPanel.tsx:149-157`, `HeadlinePanel.tsx:109-117`), which L25 forbids. After a regenerate that fails faster than the refetch, an Undo stays behind.
6. **The revision-list guard never retries** after a failed `fetchRevisions` (`drafts/[id]/page.tsx:116-151`). A new version can stay missing until the page is reloaded.
7. **Test hygiene:**
   - the axe rule list is copied three times (`a11y.test.ts`, `captions.test.ts`, `model-selection.test.ts`);
   - TC-MODEL-14 never changes the wizard Caption picker (008 verify gap 4);
   - the wave-2 `afterEach` throws when `beforeEach` skipped (gap 6b);
   - the UI token guard misses digit-suffixed `*-primary-500`, and axe `incomplete` results aren't logged (014 gap 7).
8. **014 gaps 5 and 8:** `BriefingAssistantPanel.tsx:278,393` spell out `EYEBROW` by hand, and DESIGN_SYSTEM §8.18 doesn't list `COMPACT_TEXTAREA`.

## Proposed Solution

1. **ACP manifest:** add `headline` and `captions` to the output schema and bump its version. Fix the MCP description and the guide. Add a unit drift guard: the handler's output keys must equal the manifest's.
2. **Refine label:** pass the design path to `systemDefaultName`. For REFINE, label it "System default (Sonnet 5.5; Haiku 4.5 on template drafts)" when the two differ.
3. **Comments:** move the edge-case comment into `withAuthRetry`'s header, and reword the MCP comment.
4. **Draft GET:** use `select: {providerName: true}`, and run the three independent reads in `Promise.all`.
5. **Undo:** copy the 015 `settleArmed` pattern. Arm after the awaited refetch, and clear Undo from state. Add an E2E race case in `settle-race.test.ts`.
6. **Revision list:** `fetchRevisions` reports whether it succeeded. On failure, reset the guard and retry with backoff (2, 4, 8 s, at most 3 tries). Never retry a success that still lacks the number. E2E: force one 500 on `/revisions`.
7. **Tests:**
   - one shared `tests/helpers/axe.ts`, with the settle step opt-in and `incomplete` results logged;
   - TC-MODEL-14 picks Sonnet for Caption and asserts the payload, the resume, the brief and the stamps;
   - guard the `afterEach`;
   - extend the token-guard regex.
8. **Small UI and docs:** use `EYEBROW`; add `COMPACT_TEXTAREA` to §8.18.

## Scope

### In Scope

Items 1–8.

### Out of Scope

- The 014 gap 6 placeholders. That is a product call and is left as it is.
- The draft-action claim token (019), the publish fixes (017) and the Create post button (020).

## Impact

- **Size:** bounded
- **Files affected:** about 20
- **Complexity:** small
- **Risk:** low. There is no schema change. The only behaviour changes are the Undo and revision-list fixes, and E2E cases guard both.

## Open Questions

None.
