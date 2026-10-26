# Tasks: Per-channel captions (Instagram / LinkedIn / WhatsApp) + "copy" → "caption"

**Change:** 012-per-channel-captions
**Created:** 2026-10-10
**Total Tasks:** 16

## Summary

There are **16 tasks in 3 waves**, all on `v2`. **The full clean mock E2E runs 3 times, once per wave** (the same convention as 014).

| Wave | Content                                                                                                                                                                                                 | Tasks   | Full E2E |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------- |
| 1    | **Storage, extraction and the publish fix (the shippable boundary).** Registry, pure modules, schema and migrations, writers, draft API with base panels, publish resolver, MCP/ACP, legacy rename, E2E | T1–T10  | 1        |
| 2    | **The panels completed:** per-channel regenerate, the headline panel, per-panel undo, copy to clipboard, notices and counters                                                                           | T11–T13 | 1        |
| 3    | **Wording, scripts and docs**                                                                                                                                                                           | T14–T16 | 1        |

**At the end of wave 1, 012 is shippable.**

- Every publish path sends the matching caption and refuses a failed, pending, empty, over-limit or WhatsApp one, terminally.
- Every writer stores three captions and a headline.
- Legacy drafts migrate, with the original text preserved.
- The draft page edits all three captions, with "Regenerate all".

Waves 2 and 3 add UX and wording only.

**Dependency:** 012 starts only after 014 is complete (T18). 014 T15 edits `CopyEditor`, which 012 T6 deletes.

**Per task:**

- `npm run lint` (0 errors), `npm run test:unit` and `npx tsc --noEmit -p .`;
- `npx prisma generate` after any `schema.prisma` edit;
- migrations are written by hand as SQL files. They are applied when the test DB is recreated at the wave gate, never by `migrate dev` against the dev DB;
- each task is one commit, implemented by a subagent, reviewed by `specclaw:code-reviewer`, and committed by the orchestrator.

**Per wave:**

- stop stray node processes, `rm -rf .next`, drop and recreate the test DB (`npm run test:e2e:db`), then `npm run test:e2e:serve` and `npm run test:e2e:mock`;
- the result must be **0 failed and 0 flaky**. Every edited pre-existing case is listed with its reason in the wave's last task report;
- push `v2` after the wave passes.

**Run tasks one at a time,** even inside a wave: lint-staged stashes.

**Mid-wave note (wave 1):** between T5 and T9 the app compiles, but the draft page and parts of the E2E suite are knowingly mid-change. T10 owns every wave-1 E2E edit, and the gate is the first full run.

## Tasks

### Wave 1 — Storage, extraction and the publish fix (shippable boundary)

- [x] `T1` — `WHATSAPP` in `Channel`, the per-channel registry, and publishable-only channel inputs
  - Files: `prisma/schema.prisma`, `prisma/migrations/<ts>_channel_whatsapp/migration.sql` (new), `src/lib/channels.ts`, `src/lib/social/types.ts`, `src/lib/publish/publishDraft.ts` (typing only), `src/app/api/briefs/route.ts`, `src/lib/campaign/queue.ts`, `src/app/api/posts/route.ts`, `src/app/api/team/channels/route.ts`, `src/app/api/team/channels/[channel]/route.ts`, `src/mcp/tools/generate.ts`, `src/mcp/tools/publish.ts`, `tests/unit/channels.test.ts`, `tests/unit/queueSchema.test.ts`
  - Estimate: medium
  - Kind: impl
  - Notes:
    - **Covers:** FR-01, FR-15 (inputs). **ACs:** AC-01 (all but the prompt half, which is T2).
    - **The migration file contains only** `ALTER TYPE "Channel" ADD VALUE 'WHATSAPP';`.
    - **The registry is exactly design §2.** `CHANNEL_VALUES` stays and equals `PUBLISHABLE_CHANNELS`. `CHANNEL_COPY_LIMITS` → `CHANNEL_CAPTION_LIMITS`. `channelCopyLimit` stays until T6 deletes its last consumer.
    - **`PublishError.channel`** widens to `Channel`, and gains `terminal` (default false; T7 uses it).
    - **`publishers`** becomes `Partial<Record<Channel, …>>`. A miss throws `PublishError(channel, "<Label> publishing isn't available yet…", { terminal: true })`, so the code compiles. T7 replaces this with the resolver.
    - **Every listed input validator** uses `isPublishableChannel`. The messages keep their wording, with the list derived (for example 'channel must be INSTAGRAM or LINKEDIN'). `queue.ts` uses `z.enum(PUBLISHABLE_CHANNELS)`. MCP `publish_post` throws before any Post row exists.
    - **The registry unit test** fails when a `Channel` value is missing from `CAPTION_CHANNELS` or duplicated in it.

- [x] `T2` — The caption prompt, the extractor and the headline rules (pure)
  - Files: `src/lib/agent/prompts/copy.ts` → `src/lib/agent/prompts/caption.ts` (git mv), `src/lib/captions/extract.ts` (new), `src/lib/captions/headline.ts` (new), `tests/unit/captionExtract.test.ts` (new), `tests/unit/captionHeadline.test.ts` (new), `tests/unit/prompts.test.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T1
  - Notes:
    - **Covers:** FR-07 (the builder), FR-08, FR-09 (`validateHeadline`, `designHeadline`). **ACs:** AC-01 (the prompt half), AC-03, AC-04 (the first two bullets).
    - **`buildCaptionPrompt(brief, targets)`:** builds the bullets, length guidance and key list from the registry (spec FR-07). `CAPTION_PROMPT_VERSION` and `CAPTION_MAX_TOKENS = 8192` are exported.
    - **Keep `buildCopyPrompt` as a thin deprecated wrapper** until T5 switches the providers, so the task compiles. T5 deletes it.
    - **The extractor is design §3:** the string-aware brace scanner, escaping raw control characters inside strings, exactly one candidate, unknown keys rejected against the **requested** targets, and the per-field order from spec FR-08.
    - **No I/O** in either module. The extractor returns `discarded` and does not log; T5's `writeCaptions` logs.

- [x] `T3` — The migration planner and the publish resolver (pure)
  - Files: `src/lib/captions/migrationPlan.ts` (new), `src/lib/captions/resolve.ts` (new), `tests/unit/captionMigrationPlan.test.ts` (new), `tests/unit/captionResolve.test.ts` (new)
  - Estimate: medium
  - Kind: impl
  - Depends: T1
  - Notes:
    - **Covers:** FR-05, FR-14 (the pure half). **ACs:** AC-02, AC-05.
    - **The planner:** header grammar, SPLIT conditions and fallback exactly as spec FR-05. It returns `{ outcome, rows: [{ channel, text, status: 'READY', needsReview }] }` with one row per registry channel. The property case (AC-02 i) uses a seeded generator, so it is deterministic.
    - **The resolver:** client-safe (imports only `channels.ts` and types). Rules in the spec FR-14 order, with the exact reason strings, which T10's E2E asserts on substrings.
    - **The row type** is a structural `{ status, text, failureReason }`, so neither module imports `@prisma/client` values.

- [x] `T4` — `DraftCaption` schema, the caption store and materializer, and the boot backfill
  - Files: `prisma/schema.prisma`, `prisma/migrations/<ts>_draft_captions/migration.sql` (new), `src/lib/captions/store.ts` (new), `src/lib/captions/backfill.ts` (new), `src/scripts/backfill-captions.ts` (new), `docker-entrypoint.sh`, `Dockerfile`, `package.json`
  - Estimate: large
  - Kind: migration
  - Depends: T3
  - Notes:
    - **Covers:** FR-02, FR-03 (`headline`, `captionMigration`), FR-04 (migration 2, backfill, deferral, lazy path, logging, `--report`).
    - **The SQL is exactly design "Data Model Changes"**, including the named CHECK. `copyText` is **not** touched here (T9 does it).
    - **`store.ts`:**
      - `loadDraftCaptions` and `migrateDraft` (design §6, reading the field still named `copyText`);
      - `claimCaptionAction` and `settleCaptionAction`, whose bodies are completed in T6;
      - `saveGenerationCaptions` (T5's caller);
      - `settlePendingCaptions`.

      The settle logic is the pure `settleCaptionRow`, which lands in T6's `actionTargets.ts`. Here, stub only what T5 needs.

    - **The materializer condition is "no rows"** plus legacy not null plus `captionMigration` null. Deferred when `IN_PROGRESS` or `pendingAction = REGENERATE_COPY`.
    - **The backfill:** the advisory lock, paging, per-draft `try/catch`, and the summary and `REVIEW` lines (spec FR-04). The entrypoint step sits inside the `SKIP_MIGRATIONS` guard. Add the second esbuild bundle (design §8) and the `captions:backfill` / `captions:report` npm scripts.
    - **Unit-test `migrateDraft`'s transaction shape** with Prisma mocked: `createMany skipDuplicates`, then the guarded update. **Do not run the script against the dev DB;** AC-23 runs it against the test DB in T10.

- [x] `T5` — The writers, the mock caption seam, and the headline in the design prompts
  - Files: `src/providers/interfaces/CopyProvider.ts`, `src/providers/implementations/copy/{anthropic,openai,claude-cli}.ts`, `src/providers/registry.ts`, `src/lib/testHooks.ts`, `src/lib/captions/generate.ts` (new), `src/lib/agent/generateDraft.ts`, `src/app/api/drafts/[id]/retry/route.ts`, `src/lib/agent/{pathA,pathB,background}.ts`, `src/lib/agent/prompts/{pathA,pathB,background,shared,caption}.ts`, `src/app/api/drafts/[id]/regenerate-design/route.ts`, `tests/unit/{prompts,background,campaignBriefing,renderStamps,testHooks,copyProviderCliMode}.test.ts`
  - Estimate: large
  - Kind: impl
  - Depends: T2, T4
  - Notes:
    - **Covers:** FR-07 (providers), FR-09 (required headline, design prompts, Topic fallback in regenerate-design), FR-10 (async, sync, retry), FR-21 (the reply seam and sentinels). **ACs:** AC-04 (the prompt bullet), AC-11.
    - **`generateCaptions(brief, targets)`** returns the raw reply. Anthropic and OpenAI use `max_tokens: CAPTION_MAX_TOKENS`. `buildCopyPrompt` is deleted.
    - **`writeCaptions`** calls the provider, then `extractCaptionReply`, and logs (design §3). A whole-reply failure maps to failed fields.
    - **`createPendingDraft`** creates three `PENDING` rows in the same transaction. It still writes `copyText: ''` (the placeholder; removed in T9).
    - **`runGenerationForDraft` and `generateDraftForBrief`** follow design §4. Add `HeadlineMissingError`, and map it in `humanizeGenerationError` to the spec FR-09 sentence.
    - **The sync path writes `copyText: ''` too,** until T9.
    - **Retry** resets the rows to `PENDING` in its update.
    - **The design prompts** use the fenced headline (spec FR-09). Path A gets the supporting-text rule. `PROMPT_VERSION` is bumped.
    - **`regenerate-design`** uses `designHeadline`.
    - **The mock:** `buildMockCaptionReply` plus the four drop sentinels (drop only in all-channel replies). The registry's mock provider returns it.

- [x] `T6` — The draft API (GET, PATCH, regenerate-copy, sweep) and the base `CaptionPanels`
  - Files: `src/app/api/drafts/[id]/route.ts`, `src/app/api/drafts/[id]/regenerate-copy/route.ts`, `src/lib/captions/actionTargets.ts` (new), `src/lib/captions/store.ts`, `src/lib/drafts/recovery.ts`, `src/lib/drafts/draftActions.ts`, `src/lib/api-types.ts`, `src/lib/channels.ts` (remove `channelCopyLimit`), `src/components/drafts/CopyEditor.tsx` (delete), `src/components/drafts/CaptionPanels.tsx` (new), `src/components/drafts/CaptionPanel.tsx` (new), `src/app/(app)/drafts/[id]/page.tsx`, `tests/unit/draftRecovery.test.ts`, `tests/unit/captionActionTargets.test.ts` (new), `tests/unit/draftActions.test.ts`
  - Estimate: large
  - Kind: impl
  - Depends: T5
  - Notes:
    - **Covers:** FR-11 (all of it, server side), FR-12, FR-13, FR-18/FR-19 (the wave-1 base). **ACs:** AC-07.
    - **GET** goes through `loadDraftCaptions` and returns the spec FR-13 shape. `recoverIfStuck` applies `settlePendingCaptions`.
    - **PATCH** takes the zod union `{channel, text}` | `{headline}`, with the messages from spec FR-12. **No status write** (keep the TC-ASYNC-10 comment, reworded for captions).
    - **regenerate-copy:** the body union, `claimCaptionAction`, and the work closure from design §5. `startDraftAction` gains `onError`.
    - **`actionTargets.ts`:** `captionActionTargets` and `settleCaptionRow` (pure).
    - **The DELETE handler comment** notes that captions cascade.
    - **The base UI (design §9, wave-1 part):** the "i. Captions" `SectionHead` with "Regenerate all" in the tail, and three `CaptionPanel`s, each with:
      - a `SectionHead level={3}` with an `id`;
      - a ruled textarea `aria-labelledby` that `id`, saved on blur through the new PATCH;
      - the per-registry counter (hard limit red);
      - a FAILED `Notice tone="error"`;
      - a skeleton only while the row is `PENDING`.

      Placeholder: "Write the <Label> caption…". On `page.tsx`, `copyPending` is replaced by the per-row status, and the "Captions" strings are used.

    - **Use only `ui` primitives** (`SectionHead`, `Notice`, `Button`). The `uiTokenGuard` stays green.

- [x] `T7` — Publishing through the one resolver; the terminal failure in the job runner
  - Files: `src/lib/publish/publishDraft.ts`, `src/lib/scheduler/jobRunner.ts`, `src/app/api/posts/route.ts`, `src/app/api/posts/[id]/route.ts`, `src/app/api/posts/[id]/publish/route.ts`, `src/lib/social/{instagram,linkedin}.ts`, `src/lib/testHooks.ts`, `src/lib/captions/store.ts` (`loadCaptionForPublish`), `tests/unit/jobRunner.test.ts` (new), `tests/unit/channels.test.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T3, T6
  - Notes:
    - **Covers:** FR-14, FR-15 (the up-front 422), FR-16, FR-21 (`mockPlatformId`). **ACs:** AC-06.
    - **`publishToChannel(channel, exportKey, draftId, teamId)`** follows design §7. The caption is resolved **before** the export is signed.
    - **All three callers pass the draft id** and stop selecting `copyText`.
    - **The job runner:** a terminal error → FAILED now (`retryCount` unchanged, `nextRetryAt` null). It logs `→ FAILED (terminal)`.
    - **`POST /api/posts`:** the pure resolver runs on the loaded row after the export check, giving 422 `CAPTION_UNPUBLISHABLE`, for both the scheduled and the immediate path.
    - **The posts GET routes** return `draft.caption`.
    - **The mock publishers** return `mockPlatformId(channel, caption)`. Keep the `mock-<channel>-<timestamp>` prefix, so existing `toBeTruthy` checks hold.
    - **`generationRunner` is unchanged** (FR-16 is satisfied by the resolver). Confirm with its existing unit test.

- [x] `T8` — MCP/ACP and `generate/copy` outputs
  - Files: `src/mcp/tools/generate.ts`, `src/mcp/tools/publish.ts`, `src/app/api/generate/copy/route.ts`, `tests/unit/mcpGetDraft.test.ts`
  - Estimate: small
  - Kind: impl
  - Depends: T6, T7
  - Notes:
    - **Covers:** FR-10 (`generate/copy`), FR-17. **ACs:** AC-10.
    - **`getDraft`** goes through `loadDraftCaptions` and returns `{ copyText (IG text), headline, captions:[{channel,text,status}], imageUrl, exportUrl, status }`.
    - **`generatePost`** adds `headline` and `captions`.
    - **`publishPost`** surfaces a caption refusal as `Publish failed (<reason>) — recorded as post <id> with status FAILED` (the existing format).
    - **`generate/copy`** returns `{ copyText, headline, captions }`, without persisting.

- [x] `T9` — The legacy rename: `legacyCaptionText @map("copyText")`, no more placeholder writes, the read-only guard, the fixture seed and the rollback file
  - Files: `prisma/schema.prisma`, `prisma/migrations/<ts>_legacy_caption_text/migration.sql` (new), `prisma/rollback/012-per-channel-captions.down.sql` (new), `src/lib/captions/store.ts`, `src/lib/captions/backfill.ts`, `src/lib/agent/generateDraft.ts`, `scripts/seed-teams.mjs`, `tests/unit/legacyCaptionGuard.test.ts` (new)
  - Estimate: small
  - Kind: migration
  - Depends: T5, T6, T7, T8
  - Notes:
    - **Covers:** FR-03 (`legacyCaptionText`), FR-04 (migration 3), FR-06. **ACs:** AC-08, AC-27.
    - **The migration:** `ALTER TABLE "Draft" ALTER COLUMN "copyText" DROP NOT NULL;`. The schema field becomes `legacyCaptionText String? @map("copyText")`.
    - **Remove the `copyText: ''` placeholder writes** (T5). The materializer and backfill now read `legacyCaptionText`.
    - **Before committing, `grep -rn copyText src`** may show only the external alias names in the MCP and `generate/copy` outputs and the `@map` comment.
    - **`seed-teams.mjs`** creates native fixture drafts: three `READY` rows (`<topic> — seeded fixture <Label> caption.`), a `headline`, and no `copyText`.
    - **The down.sql** is design "Data Model Changes". The runbook text goes into the handoff in T16.

- [x] `T10` — Wave-1 E2E: the §W captions suite and the existing-case updates (wave-1 gate)
  - Files: `tests/e2e/captions.test.ts` (new), `tests/e2e/async-actions.test.ts`, `tests/e2e/team-isolation.test.ts`, `tests/e2e/surfaces.test.ts`, `tests/e2e/a11y.test.ts`, `tests/helpers/db.ts` (helpers only, if needed)
  - Estimate: large
  - Kind: test
  - Depends: T9
  - Notes:
    - **Covers ACs:** AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-22, AC-23, AC-26, AC-28 (wave 1).
    - **The edits to existing cases are design §10's table**, every T10 row. Each edit's reason goes in the report.
    - **AC-23** seeds legacy-shaped drafts with direct SQL (`copyText` set, no rows), then runs `dotenv -e .env.test -- npm run captions:backfill` and `captions:report`. The down.sql check runs against a scratch copy of the test DB (`CREATE DATABASE … TEMPLATE`), which is dropped afterwards.
    - **The gate:** the per-wave procedure in the Summary, giving 0 failed and 0 flaky. Push `v2`.

### Wave 2 — The panels completed

- [x] `T11` — Per-channel regenerate, the headline panel, per-panel undo, and copy to clipboard
  - Files: `src/components/drafts/CaptionPanels.tsx`, `src/components/drafts/CaptionPanel.tsx`, `src/components/drafts/HeadlinePanel.tsx` (new)
  - Estimate: medium
  - Kind: impl
  - Depends: T10
  - Notes:
    - **Covers:** FR-18 (the headline panel), FR-19 (Regenerate/Generate per panel, Undo, Copy caption, the headline skeleton through `captionActionTargets`).
    - **One `useUndoableAction<string>` per panel.** "Regenerate all" captures all three. Undo PATCHes only its own channel, or the headline.
    - **"Copy <Label> caption"** uses `navigator.clipboard.writeText`, with the toast "Caption copied". On error, toast "Couldn't copy. Select the text and copy it manually."
    - **`HeadlinePanel`:** an `Input` `aria-labelledby` its h3, the `n / 100` counter, the helper text, "Generate headline" / "Regenerate headline", and a PATCH on blur with the inline 400 message.

- [x] `T12` — Notices, the WhatsApp guide, and the counters
  - Files: `src/components/drafts/CaptionPanel.tsx`, `src/components/drafts/HeadlinePanel.tsx`
  - Estimate: small
  - Kind: impl
  - Depends: T11
  - Notes:
    - **Covers:** FR-19 (the review notice, the last-regenerate-failed notice, the WhatsApp soft-guide warning, "Over the <Label> limit", the WhatsApp helper text).
    - **Notices use `Notice`** with the tones in spec FR-19. The review notice carries `role="status"`.
    - **Counter wording is exact:** `1,234 / 2,200 (Instagram)` and `412 / 1,000 guide`. The warning colours are the existing `--status-scheduled` and `--status-failed` tokens, already checked by `contrast.test.ts`.

- [x] `T13` — Wave-2 E2E: the panel cases (wave-2 gate)
  - Files: `tests/e2e/captions.test.ts`
  - Estimate: medium
  - Kind: test
  - Depends: T12
  - Notes:
    - **Covers ACs:** AC-21, AC-24, AC-28 (wave 2).
    - **Grant clipboard permissions on the context** (`context.grantPermissions(['clipboard-read','clipboard-write'])`).
    - **The review-notice case** reuses AC-23's SQL fixture pattern.
    - **Run 014's axe block on the draft page** (`a11y.test.ts`) and confirm it stays green (NFR-07).
    - **The gate:** 0 failed and 0 flaky. Push `v2`.

### Wave 3 — Wording, scripts and docs

- [x] `T14` — "copy" → "caption" in the UI strings, and the wording guard
  - Files: `src/components/brief/ContentStep.tsx`, `src/components/campaigns/CampaignBriefingSection.tsx`, `src/app/(app)/team/page.tsx`, `tests/unit/captionWording.test.ts` (new), `tests/e2e/a11y.test.ts`, `tests/e2e/surfaces.test.ts`
  - Estimate: small
  - Kind: impl
  - Depends: T13
  - Notes:
    - **Covers:** FR-20 (the remaining rows; the draft-page and API strings landed in T6/T7). **ACs:** AC-09, AC-25.
    - **Change only the table's rows.** Leave every "deliberately unchanged" string.
    - **E2E edits:** the "Brief & Copy Direction" assertions (`a11y.test.ts:123`, `:530`, `surfaces.test.ts:522`).
    - **This task runs the wave-3 gate**, because it is the last task touching `src/`. T15 and T16 change no app code. Push `v2`.

- [x] `T15` — `export-posts` / `import-posts` carry captions and the headline
  - Files: `scripts/export-posts.mjs`, `scripts/import-posts.mjs`
  - Estimate: small
  - Kind: impl
  - Depends: T14
  - Notes:
    - **Covers:** FR-22 (scripts).
    - **The export** includes `headline`, `captionMigration` and the caption rows.
    - **The import** writes them idempotently (`skipDuplicates`). An old bundle that has `copyText` and no captions is imported into `legacyCaptionText` with no rows, so the loader materializes it on first read.
    - **Verify with `--dry-run`** against a small export from the test DB. Do not touch the dev DB.

- [x] `T16` — Docs
  - Files: `CLAUDE.md`, `docs/handoff.md`, `.specclaw/ROADMAP.md`, `.specclaw/changes/008-*/proposal.md`, `.specclaw/changes/010-*/proposal.md`, `docs/e2e-test-plan.md`, `docs/mcp-acp-guide.md`, `docs/ui-reference/DESIGN_SYSTEM.md`
  - Estimate: small
  - Kind: docs
  - Depends: T15
  - Notes:
    - **Covers:** FR-22.
    - **The handoff gets a runbook section:**
      - the three migrations;
      - the boot backfill and its log lines;
      - `captions:report`;
      - the rollback (down.sql, then `SKIP_MIGRATIONS=1` if needed, then the roll-forward notes);
      - the release note: "every channel now publishes its own caption; fallback-migrated drafts show a review notice".
    - **`e2e-test-plan.md` §W** lists AC-12–AC-24 and the new seams (`__DROP_CAPTION_*__`, the hashed mock `platformId`).
    - **`mcp-acp-guide.md`** documents `captions`, `headline` and the `copyText` alias.
    - **`DESIGN_SYSTEM.md` §8.14** describes the caption desk.
    - **008:** `caption` surface / `captionModel`, with the headline under it. **010:** consumes the `DraftCaption` WhatsApp row; flips `publishable`; owns the real limit and its `QueueEntryModal` count.
    - **No app code.**

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
- `[>]` Deferred — correctly blocked on a sibling change, not incomplete through any fault of its own; excluded from the incomplete-task count that gates `verify`

**Task format:**

```
- [ ] `T<n>` — <title>
  - Files: <files to create/modify>
  - Estimate: small | medium | large
  - Kind: docs | test | config | refactor | impl | migration   (optional; hints the build subagent's role, tools, and model)
  - Depends: <task ids> (if any)
  - Notes: <additional context>
  - Deferred-Reason: <why this can't be built yet>            (required when marker is `[>]`)
  - Deferred-Blocked-On: <sibling change name, if known>      (optional; free text, not a structured link)
```
