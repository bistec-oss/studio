# Spec: Drop the WhatsApp caption; Refine design under the preview

**Change:** 026-drop-whatsapp-caption-refine-under-preview · **Size:** bounded
**Created:** 2026-10-23

## Overview

Every draft asks the model for an Instagram, a LinkedIn and a WhatsApp caption. WhatsApp has no publisher, and the user dropped 010 (WhatsApp Channel posting) on 2026-10-23, so the WhatsApp caption has no use. This change stops generating it and hides existing WhatsApp caption rows without deleting them. It also moves the Refine design card under the Preview card on the draft page.

## Approach

**One decision: remove the WhatsApp entry from `CAPTION_CHANNELS`. Do not add a `generated: false` flag.** Every caption read goes through `loadDraftCaptions`, which orders rows by the registry. Rows for a channel outside the registry therefore drop out of every reader with no new code. A flag would need a filter at each of the 10 places that iterate the registry, and one missed filter would leak the row. `captionSpec('WHATSAPP')` will now throw, so the build must confirm each caller gets registry channels only. `CHANNEL_LABELS` keeps a `WhatsApp` label, because old WhatsApp `Post` rows still render through `channelLabel`. Retry must reset only the registry channels' rows. Otherwise it would set a hidden row to PENDING and later fail it.

File map:

- `src/lib/channels.ts`, `src/lib/agent/prompts/caption.ts`, `src/lib/captions/resolve.ts`, `src/lib/testHooks.ts`, `src/app/api/drafts/[id]/retry/route.ts`, `src/acp/agent.ts`, `src/mcp/tools/{generate,publish}.ts`, `src/lib/publish/publishDraft.ts`, `src/lib/campaign/queue.ts`, `src/components/drafts/{CaptionPanel,CaptionPanels}.tsx`, `src/app/(app)/drafts/[id]/page.tsx`
- tests: `tests/unit/{channels,captionExtract,captionRequests,captionResolve,captionStore,captionWriters,captionActionTargets,captionRoutes,captionRouteStamp,regenerateStamp,prompts,testHooks,mcpGetDraft,jobRunner,actionHeartbeats,renderStamps,queueSchema,modelRequests,campaignBriefing}.test.ts` (each only where it fixes three channels); `tests/e2e/{captions,model-selection,a11y}.test.ts`
- docs: `docs/e2e-test-plan.md`, `docs/ui-reference/DESIGN_SYSTEM.md`, `docs/mcp-acp-guide.md` (if it names WhatsApp captions), `.specclaw/ROADMAP.md`, `docs/handoff.md`, `CLAUDE.md`

## Requirements

### Functional Requirements

- **FR-01 — The caption registry is Instagram and LinkedIn.** `CAPTION_CHANNELS` drops the WhatsApp entry. `CaptionKey` drops `'whatsapp'`. `whatsappBold` is deleted. `PUBLISHABLE_CHANNELS` and `CHANNEL_VALUES` stay unchanged (Instagram and LinkedIn).
- **FR-02 — Generation writes two captions.** New drafts (the async and sync paths), retry, scheduled and MCP generation create and write Instagram and LinkedIn rows only. "Regenerate all" (`{}`) targets those two. `{ channel: 'WHATSAPP' }` on regenerate-copy or on PATCH is a 400 with `CHANNEL_MESSAGE` ("channel must be INSTAGRAM or LINKEDIN").
- **FR-03 — The caption prompt asks for two keys.** The prompt lists only `headline`, `instagram` and `linkedin`. Bump `CAPTION_PROMPT_VERSION`. A reply that still carries a `whatsapp` key fails as `unknown-keys`. This is the existing rule for any key that was not requested.
- **FR-04 — Legacy WhatsApp rows are hidden and kept.** An existing `DraftCaption` row with `channel = 'WHATSAPP'` is not deleted or changed. It does not appear in:
  - `GET /api/drafts/[id]` `captions`;
  - the regenerate-copy response;
  - MCP `generate_post` and `get_draft`;
  - the draft page.

  It cannot be edited or regenerated (FR-02's 400).

- **FR-05 — Retry leaves legacy rows alone.** `POST /api/drafts/[id]/retry` resets only the registry channels' rows to PENDING. A WhatsApp row keeps its status, text and failure reason through a retry, whether the retry succeeds or fails.
- **FR-06 — The external contract says two channels.** The ACP manifest's `captions` description and its `channel` enum list Instagram and LinkedIn. The `MOCK_AI` caption seam drops the WhatsApp key and its `__DROP_CAPTION_WHATSAPP__` sentinel.
- **FR-07 — WhatsApp still fails closed for publishing.** `POST /api/posts` with `WHATSAPP` stays 400. A due WhatsApp `Post` row still fails terminally, with no retry. The reason drops the "Copy the caption…" sentence, because no WhatsApp caption exists now. It reads: "WhatsApp publishing isn't available."
- **FR-08 — Refine design sits under the Preview card.** On the draft page:
  - the left column holds the Preview card, then the Refine design card;
  - the right column holds the Captions card;
  - below `xl` (one column), the order is Preview, Refine design, Captions.

  Nothing else on the page changes: the gating, the Refine panel's props and the caption panels stay as they are.

- **FR-09 — The UI drops WhatsApp wording.** The caption panel loses the "not published from Studio" helper path, and the soft-guide counter loses its "(WhatsApp)" comment. Remove both only if WhatsApp was their only user; keep them if the code stays generic. Rewrite every "until 010" and "WhatsApp has no publisher yet" comment to say that 010 is dropped.

### Non-Functional Requirements

- **NFR-01 — No schema change.** The `Channel` enum keeps `WHATSAPP`. No migration and no env var are added.
- **NFR-02 — No real model calls** in any test.
- **NFR-03 — The gates do not regress:**
  - unit pass count, apart from deleted WhatsApp-only cases (each deletion named in the task report);
  - lint at 0 errors and 7 warnings;
  - tsc clean;
  - build passes;
  - a full clean mock E2E, then CI green.

## Acceptance Criteria

- [ ] **AC-01** (FR-01): `CAPTION_CHANNELS.map(s => s.channel)` equals `['INSTAGRAM', 'LINKEDIN']`. `channelLabel('WHATSAPP')` is `'WhatsApp'`. A unit test asserts both.
- [ ] **AC-02** (FR-02): a mocked generation produces exactly two caption rows (Instagram and LinkedIn, READY) and a headline. E2E TC-CAP-01 is updated to assert this.
- [ ] **AC-03** (FR-02): regenerate-copy `{}` targets two channels (TC-CAP-15). `{ channel: 'WHATSAPP' }` returns 400 on regenerate-copy and on PATCH (unit `captionRequests`).
- [ ] **AC-04** (FR-03): the built prompt names no `whatsapp` key and `CAPTION_PROMPT_VERSION` is new (unit `prompts`). A reply with a `whatsapp` key extracts as `unknown-keys` (unit `captionExtract`).
- [ ] **AC-05** (FR-04, FR-05): new E2E case TC-CAP-21. A WhatsApp row is inserted with Prisma on an exported draft, with text, READY. Then:
  - `GET /api/drafts/[id]` lists two captions;
  - MCP `get_draft` (unit `mcpGetDraft`, or E2E if reachable) lists two;
  - the draft page shows no WhatsApp panel;
  - the row is unchanged in the DB afterwards.
- [ ] **AC-06** (FR-05): a unit or E2E case retries a FAILED draft that has a legacy WhatsApp row. Afterwards the WhatsApp row's status and text are unchanged, and the registry rows went through PENDING.
- [ ] **AC-07** (FR-06): the ACP manifest's caption `channel` enum is `['INSTAGRAM', 'LINKEDIN']` (unit or TC-CAP-14). `buildMockCaptionReply` emits no `whatsapp` key (unit `testHooks`).
- [ ] **AC-08** (FR-07): TC-CAP-06 passes with the new reason text. It no longer asserts a READY WhatsApp caption.
- [ ] **AC-09** (FR-08): new E2E case TC-CAP-22. At 1440 px, the Refine design card's top is below the Preview card's bottom, and both share a left edge. At 390 px, the DOM order is Preview, Refine design, Captions. The case passes axe through the existing helper, like the other draft-page cases.
- [ ] **AC-10** (FR-09): `grep -rn "until 010" src` finds nothing. In `src`, "WhatsApp" survives only in `channels.ts` (the label), in `resolve.ts`'s reason (through the label) and in the comments that record the drop.
- [ ] **AC-11** (NFR-01, NFR-03): `git diff` touches no file under `prisma/`. The task report records the full gate and CI green.

## Edge Cases

- **A draft whose only failed caption was WhatsApp.** The row is now hidden, so the draft shows two good captions. That is intended.
- **A legacy WhatsApp row left PENDING** (an interrupted run before this change). The stale sweep (`settlePendingCaptions`) settles every PENDING row and keeps its text, so the row reaches FAILED and stays hidden. No `captionSpec` lookup is on that path.
- **008's per-caption model picker** ("WhatsApp caption model"). It disappears with the panel. `DESIGN_SYSTEM.md` §8 drops that accessible name.
- **Putting the channel back** (not planned). Restoring the registry entry shows the kept rows again, with their text.

## Dependencies

- 012 (the registry and the caption store) and 008/024 (the stamps). Both are VERIFIED PASS on `v2`.
- 010 is dropped, so no other change depends on the WhatsApp caption.
