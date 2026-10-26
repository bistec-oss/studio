# Verify Report: 026-drop-whatsapp-caption-refine-under-preview

**Verified:** 2026-10-24 · **Model:** Sonnet · **HEAD:** `8bef317` (T1 `3053695`, T2 `66d2e15`, T3 `8bef317`)
**Verdict:** PASS (11/11 ACs)

I read spec.md, tasks.md, the T1 to T3 reports, the T1 and T2 reviews and the diff `96c8e27..8bef317` over `src` and `tests` (channels, the caption store/extract/resolve/requests modules, the retry route, the generateDraft catch path, testHooks, the ACP manifest, CaptionPanel, the draft page, TC-CAP-21 and TC-CAP-22). I re-ran eight unit files (channels, captionRequests, captionExtract, prompts, testHooks, mcpGetDraft, captionWriters, captionStore): 8 files, 219/219 pass. I ran the AC-10 greps and the AC-11 prisma diff. I did not re-run E2E, build or any DB command; those figures are the orchestrator's.

## Acceptance Criteria

- ✅ **AC-01.** `CAPTION_CHANNELS` is Instagram and LinkedIn only (`src/lib/channels.ts`). `tests/unit/channels.test.ts` asserts the registry, `CHANNEL_LABELS` equal to `{INSTAGRAM, LINKEDIN, WHATSAPP: 'WhatsApp'}` (line 119) and that `captionSpec('WHATSAPP')` throws (line 109).
- ✅ **AC-02.** TC-CAP-01 is updated to two READY rows plus a headline (T2 report; the full E2E passed 444/3/0).
- ✅ **AC-03.** `captionRequests.test.ts:67-69`: `{channel:'WHATSAPP'}` gives `CHANNEL_MESSAGE` on PATCH and on regenerate. TC-CAP-15 was retargeted to two channels.
- ✅ **AC-04.** `CAPTION_PROMPT_VERSION` moved from `2026-10-11.1` to `2026-10-23.1`, pinned in `prompts.test.ts:328`. The prompt names no `whatsapp` key (lines 276, 307). `captionExtract.test.ts:172` shows a `whatsapp` reply key is `unknown-keys`.
- ✅ **AC-05.** TC-CAP-21 (`captions.test.ts:643`) inserts a READY WHATSAPP row with Prisma and asserts two captions in the API, no WhatsApp text on the page, a 400 on PATCH and regenerate, and an unchanged row (text, status, updatedAt). The MCP half is covered by `mcpGetDraft.test.ts` (passes), which the spec allows.
- ✅ **AC-06.** `captionWriters.test.ts:511` applies the retry's scoped `where: { channel: { in: [INSTAGRAM, LINKEDIN] } }` to a draft that holds a legacy row and shows the WhatsApp row untouched. The route code is at `retry/route.ts:49-52`. The catch-path gap the T1 review found is closed: `generateDraft.ts` now scopes its PENDING to FAILED sweep to the registry channels, pinned at `captionWriters.test.ts:322`. The proof is a mock of the filter plus TC-CAP-21. There is no retry-specific behavioural E2E on a legacy row. That is a small gap, not a blocker: the filter is one line and is asserted in both places it is written.
- ✅ **AC-07.** `testHooks.test.ts` passes: `buildMockCaptionReply` emits no whatsapp key and the `__DROP_CAPTION_WHATSAPP__` sentinel is gone. The ACP manifest description now reads "Instagram and LinkedIn". The enum derives from the registry, and TC-CAP-14 covers it.
- ✅ **AC-08.** `unavailableReason` now returns "WhatsApp publishing isn't available." (`resolve.ts`). TC-CAP-06 asserts the 400 and the terminal failure with the new text and no longer asserts a READY WhatsApp caption.
- ✅ **AC-09.** TC-CAP-22 (`captions.test.ts:682`) sets 1440 px (line 686): Refine's top is below Preview's bottom, with a shared left edge. At 390 px (line 706) it checks DOM order (Preview, Refine, Captions) and runs the existing axe helper. The T2 review's WARN (no viewport set) is fixed.
- ✅ **AC-10.** `grep -rn "until 010" src` finds nothing. `grep -rni whatsapp src` finds `channels.ts` (the label), the `resolve.ts` reason through the label, and comments recording the drop (retry route, generateDraft, queue, publishDraft, mcp generate/publish). No code path other than the label uses WhatsApp.
- ✅ **AC-11.** `git diff --stat 96c8e27..8bef317 -- prisma` is empty. The T3 report records the full gate, and CI is green at `8bef317` (run 40002885901).

## Gates

Orchestrator evidence, not re-run by me: unit 3150/3150; lint 0 errors / 7 warnings; tsc clean; build passes; render 47/47; `test:upgrade` ALL PASS; full clean mock E2E 444 / 3 skipped / 0 failed (the first run was 442/3/2, and both stale specs were fixed in T3). My re-run: 219/219 across the eight caption-related unit files.

## Scope

All changed `src` files are in the spec's file map, plus these ripples:

- `src/lib/captions/requests.ts`: a comment only ("every registry caption").
- `src/lib/agent/generateDraft.ts`: the catch-path scoping, which the T1 review required (FR-05).
- `tests/e2e/async-actions.test.ts` and `tests/e2e/create-post-button.test.ts`: stale specs fixed after the gate (TC-ASYNC-02 count, AC-02b band).
- Unit tests beyond the listed ones (`campaignBriefing`, `jobRunner` and others) change only where a test fixed three channels.

The draft page diff is large (465 lines), mostly prettier re-indentation from the new wrapper div. T2's review confirmed no card class or prop changed.

## Per-task reviews

- T1 — NOTE (catch-path gap fixed by the orchestrator)
- T2 — WARN(1) (viewport fixed by the orchestrator)
- T3 — no task review

## Known limits

- There is no behavioural E2E for retry over a legacy row. The unit test checks the scoped filter against a mock.
- A legacy WhatsApp row left PENDING is settled to FAILED by the stale sweep and stays hidden, with its text kept. The spec accepts this.
- `captionSpec('WHATSAPP')` now throws. A review of every caller found none that can reach it.
- Restoring the registry entry would show the kept rows again.
