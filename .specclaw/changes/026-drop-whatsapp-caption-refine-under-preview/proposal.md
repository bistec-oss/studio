# Proposal: Drop the WhatsApp caption; Refine design under the preview

**Created:** 2026-10-23
**Status:** 🟡 Draft

## Problem

1. **Every draft generates a WhatsApp caption nobody uses.** Since 012 the caption registry `CAPTION_CHANNELS` (`src/lib/channels.ts`) holds Instagram, LinkedIn and WhatsApp, and every generation asks the model for all three (`generateDraft.ts` creates one PENDING row per registry channel; the caption prompt lists every registry key). WhatsApp has no publisher (`publishable: false`) and was only ever posted by hand. **The user has dropped 010 (WhatsApp Channel posting) on 2026-10-23**, so the WhatsApp caption is model output, a draft-page panel and a regenerate target with no use.
2. **The Refine design card sits away from the design it changes.** On the draft page (`src/app/(app)/drafts/[id]/page.tsx`) the preview is the left column and the right column stacks the captions, then Refine design. Refine acts on the image, so the user wants it directly under the Preview card.

## Proposed Solution

1. **Stop generating WhatsApp captions.** Remove the WhatsApp entry from the generated caption set, so new drafts, regenerate copy, retry, scheduled and MCP generation produce Instagram and LinkedIn captions only. The caption prompt loses the `whatsapp` key, so `CAPTION_PROMPT_VERSION` is bumped.
   - **Existing WhatsApp caption rows are hidden, not deleted** (the user, 2026-10-23): they stay in the database, are never shown, edited, regenerated or returned by the draft, MCP or ACP surfaces. No migration. Putting the channel back restores them.
   - The `Channel` enum keeps `WHATSAPP` (schema unchanged); it was never publishable.
2. **Move Refine design under the preview.** The left column becomes the Preview card, then the Refine design card; the right column keeps the captions. Below the `xl` breakpoint (one column) the order is Preview, Refine design, captions.
3. **Record the 010 decision:** 010 is dropped, not deferred; ROADMAP and CLAUDE.md say so, and the stale "until 010" comments are reworded.

## Scope

### In Scope

- The caption registry and everything that iterates it for generation (generation, retry, regenerate copy, the caption prompt and parser, the mock seam)
- Hiding legacy WhatsApp rows on the draft page, the draft API, MCP `get_draft` and the ACP manifest
- The draft-page layout move
- Unit and E2E updates (012's §W cases that expect three captions; a new case for a legacy WhatsApp row staying hidden; a layout case)
- Docs: ROADMAP (010 dropped), CLAUDE.md, the 012 notes, `e2e-test-plan.md`

### Out of Scope

- Deleting existing WhatsApp caption rows (kept, hidden)
- Removing `WHATSAPP` from the `Channel` enum or any schema change
- Any other draft-page redesign

## Impact

- **Files affected:** about 10 to 14 source files, about 15 to 20 test files (mostly fixture lists of three channels)
- **Complexity:** small to medium (registry-driven; the risk is legacy rows reaching code that looks up a channel spec)
- **Risk:** low to medium. A legacy WhatsApp row passed to code that calls `captionSpec('WHATSAPP')` after the entry is gone could throw; the build must keep a spec available for reads or filter rows before every lookup. Generation behaviour changes only by dropping one caption (prompt version bumped).
- **Size:** bounded (an existing flow altered: one registry entry and one page layout)

## Decisions

- **2026-10-23 (the user):** stop generating WhatsApp captions; hide existing WhatsApp caption rows and keep the data; 010 is not going ahead; move Refine design below the Preview card; skip the party panel for this change.

## Open Questions

- None blocking. The build picks the safest way to keep legacy rows inert (a `generated: false` flag on the registry entry versus removing it with a read-only spec kept for legacy rows) and states it in the spec.

---

**To proceed:** Review this proposal and approve to begin planning.
