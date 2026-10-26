# Tasks: Drop the WhatsApp caption; Refine design under the preview

**Change:** 026-drop-whatsapp-caption-refine-under-preview · **Size:** bounded
**Created:** 2026-10-23
**Total Tasks:** 3

## Summary

This change has **3 tasks in 3 waves**:

1. the registry change and everything that follows from it on the server, with the unit tests;
2. the draft-page layout move and the E2E updates;
3. the docs, the full gate and CI.

## Process / Gates

- **One task at a time:**
  1. an implementer subagent (sonnet) does the task;
  2. `specclaw:code-reviewer` reviews it;
  3. the orchestrator re-runs tsc, `npm run lint` and `npm run test:unit`, then commits.

  Never run two implementers in this checkout.

- **No real model calls.** Every test runs on the `MOCK_AI` seam or a faked provider.
- **The databases are shared.** Never run a prisma or DB command without an explicit `DATABASE_URL` that points at `bistec_studio_test`. Never touch `bistec_studio`. Run `export MSYS_NO_PATHCONV=1` before any docker command that takes a container path. **Stop any :3002 server (the OP-1 environment) before an E2E run.**
- **Baselines (007 T4, 2026-10-23):**
  - unit 3147/3147;
  - render 47/47;
  - lint 0 errors / 7 warnings;
  - full clean mock E2E 442/3/0/0.

  A task may delete a WhatsApp-only case if it names the case in its report. Otherwise it may not lower the pass count or add a lint warning.

- **No open questions.** The spec's Approach settles the proposal's one open question: remove the entry, with no flag.

## Tasks

### Wave 1 — Registry and server

- [x] `T1` — Remove WhatsApp from the caption registry; keep legacy rows hidden and untouched
  - Files: `src/lib/channels.ts`, `src/lib/agent/prompts/caption.ts`, `src/lib/captions/resolve.ts`, `src/lib/testHooks.ts`, `src/app/api/drafts/[id]/retry/route.ts`, `src/acp/agent.ts`, `src/mcp/tools/generate.ts`, `src/mcp/tools/publish.ts`, `src/lib/publish/publishDraft.ts`, `src/lib/campaign/queue.ts`, `src/components/drafts/CaptionPanel.tsx`, `src/components/drafts/CaptionPanels.tsx` (comments and the "three captions" wording only); the unit tests listed in the spec's file map, each only where it fixes three channels
  - Estimate: medium
  - Kind: impl
  - Depends: none
  - Notes:
    - **Covers:** FR-01 to FR-07, FR-09; AC-01, AC-03 (unit half), AC-04, AC-06 (unit), AC-07, AC-10.
    - **Delete** the WhatsApp entry, `'whatsapp'` from `CaptionKey`, and `whatsappBold`.
    - **Keep the label.** Build `CHANNEL_LABELS` from the registry and add `WHATSAPP: 'WhatsApp'` explicitly, with a one-line comment (old `Post` rows). Also drop the WhatsApp mention from the `CHANNEL_CAPTION_LIMITS` comment.
    - **Audit every `captionSpec(` caller** (`extract.ts`, `resolve.ts`, `CaptionPanel.tsx`). Confirm each gets registry channels only, and say so in the report. `resolve.ts` checks `isPublishableChannel` first, so it is safe.
    - **Retry (FR-05):** scope the `updateMany` to the registry channels: `where: { channel: { in: CAPTION_CHANNELS.map(s => s.channel) } }`. Add a unit case (or extend an existing retry test) that proves the WhatsApp row is untouched.
    - **Bump `CAPTION_PROMPT_VERSION`** to `2026-10-23.1`. Fix the "three captions" comments, and recheck the max-tokens comment's wording.
    - **`testHooks.ts`:** remove the WhatsApp sentinel and the `**WhatsApp**` label branch. If `Record<CaptionTarget, …>` then fails to compile, make the sentinel map `Partial`.
    - **`resolve.ts`:** the unavailable reason becomes `` `${channelLabel(channel)} publishing isn't available.` ``.
    - **`CaptionPanel.tsx`:** keep the `softLimit` and `publishable` branches only if they stay generic. If WhatsApp was their only user, delete them and the matching `CaptionChannelSpec` fields (YAGNI). State which you chose in the report.
    - **Comments:** rewrite "until 010" and "no publisher yet" to say that 010 was dropped on 2026-10-23.
    - Run `npx tsc --noEmit`, `npm run lint` and `npm run test:unit`. No E2E in this task.

### Wave 2 — Layout and E2E

- [x] `T2` — Move Refine design under the Preview card; update the E2E suites
  - Files: `src/app/(app)/drafts/[id]/page.tsx`, `tests/e2e/captions.test.ts`, `tests/e2e/model-selection.test.ts`, `tests/e2e/a11y.test.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T1
  - Notes:
    - **Covers:** FR-08; AC-02, AC-03 (E2E half), AC-05, AC-08, AC-09.
    - **Layout:** wrap the Preview `<section>` and the `ready && <RefinementPanel …/>` in one `flex min-w-0 flex-col gap-3.5` left column. The right column keeps `<CaptionPanels>` only. Update the two grid comments ("the stage left…", "captions, then refine"). Change no class on the cards themselves.
    - **E2E updates:**
      - TC-CAP-01: two captions;
      - TC-CAP-06: no READY WhatsApp caption assertion, and the new reason text;
      - TC-CAP-14: the ACP enum and MCP get_draft list two;
      - TC-CAP-15: `{}` regenerates two;
      - TC-CAP-17: the desk has two panels;
      - `model-selection.test.ts`: drop or retarget the WhatsApp picker and row cases to LinkedIn, and keep each case's intent;
      - `a11y.test.ts`: the label loop.
    - **New TC-CAP-21 (AC-05):** insert a READY WhatsApp row with text through Prisma. Then assert it is absent from the API, from MCP if reachable, and from the page, and that it is unchanged in the DB.
    - **New TC-CAP-22 (AC-09):** the layout check at 1440 px and at 390 px, with axe through the existing helper.
    - Run the affected specs locally against `bistec_studio_test` (`npm run test:e2e:serve` and `test:e2e:mock` with `--grep`). The full clean run is T3.

### Wave 3 — Docs and gate

- [x] `T3` — Docs, the full gate and CI
  - Files: `docs/e2e-test-plan.md` (§W: the case changes, TC-CAP-21 and TC-CAP-22), `docs/ui-reference/DESIGN_SYSTEM.md` (the draft-page column text near "The right column of the draft page holds two bezel cards", and the picker-name list without "WhatsApp caption model"), `docs/mcp-acp-guide.md` (only if it says WhatsApp captions), `.specclaw/ROADMAP.md`, `docs/handoff.md` (a 026 section with no operator steps; release note: new drafts carry two captions, and old WhatsApp captions are hidden, not deleted), `CLAUDE.md` (the top entry)
  - Estimate: small
  - Kind: docs
  - Depends: T2
  - Notes:
    - **Covers:** NFR-01, NFR-03; AC-11.
    - **The full gate:** drop and recreate `bistec_studio_test` (the CLAUDE.md gotcha), `rm -rf .next`, then run a full clean mock E2E. Also run tsc, lint, unit, render and the build.
    - **Push to `origin v2`**, then check `gh run list --branch v2` until CI is green. Record the run IDs.
    - Confirm `git diff --stat <base>..HEAD -- prisma/` is empty.
