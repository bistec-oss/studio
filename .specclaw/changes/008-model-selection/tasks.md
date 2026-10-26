# Tasks: Model selection per surface (Haiku / Sonnet / Opus)

**Change:** 008-model-selection
**Created:** 2026-10-12
**Total Tasks:** 19

## Summary

There are **19 tasks in 2 waves**, all on `v2`. **The full clean mock E2E runs 2 times, once per wave** (the convention of 012 and 014).

| Wave | Content                                                                                                                                                                                                                                                 | Tasks   | Full E2E |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------- |
| 1    | **The foundation (the shippable boundary).** Catalogue and pure resolver, the operator CLI check, schema, the policy and its APIs, the boundary, every call site on the resolver with stamps, the time budget, the literal guard, `/team` → Models, E2E | T1–T12  | 1        |
| 2    | **Choice.** The `model` body fields, the shared picker, the wizard, the draft page, the chat headers and the team-token notice, E2E, docs                                                                                                               | T13–T19 | 1        |

**At the end of wave 1, 008 is shippable:**

- every model call runs a catalogue entry on current IDs, through one resolver, in both modes;
- `CLAUDE_CLI_MODEL` is a validated system default;
- a team admin sets defaults, the allow-list and the Opus switch at `/team`, and every tier honours them at call time;
- every caption, headline and design revision records the model that wrote it;
- the per-action time budget is a unit gate.

Wave 2 adds per-post and per-chat pickers only.

**Per task:**

- `npm run lint` (0 errors), `npm run test:unit` and `npx tsc --noEmit -p .`;
- `npx prisma generate` after any `schema.prisma` edit;
- migrations are hand-written SQL. They are applied when the test DB is recreated at the wave gate, never by `migrate dev` against the dev DB;
- each task is one commit, implemented by a subagent, reviewed by `specclaw:code-reviewer`, and committed by the orchestrator;
- **no real model call is ever made by an implementer.** Unit tests mock `child_process.spawn` and the Anthropic client; the E2E runs `MOCK_AI`. T2 and AC-32 are operator steps.

**Per wave:**

- stop stray node processes;
- check there is exactly one `:3001` listener (L19);
- `rm -rf .next`;
- drop the test DB (`docker exec designer-postgres-1 psql -U bistec -d postgres -c "DROP DATABASE IF EXISTS bistec_studio_test WITH (FORCE);"`), because `test:e2e:db` does not drop it;
- run `npm run test:e2e:db`, then `npm run test:e2e:serve`, then `npm run test:e2e:mock`;
- the result must be **0 failed and 0 flaky**. Every edited pre-existing case is listed with its reason in the wave's last task report;
- push `v2`, then check `gh run list --branch v2` (L21).

**Run tasks one at a time,** even inside a wave: lint-staged stashes.

**Mid-wave note (wave 1):**

- Between T5 and T10, the boundary accepts `model?: ResolvedModel` **optionally**: with none, it keeps today's behaviour. Each of T6–T8 moves its call paths onto the resolver.
- T10 then makes `model` **required**, deletes `modelFor`, `modelForBackground`, `VERIFIER_MODEL`, `pinModel` and the `CLAUDE_CLI_MODEL` read, and lands the literal guard. From T10 on, no un-migrated call site compiles.
- T12 owns every wave-1 E2E edit; its gate is the first full run.

## Tasks

### Wave 1 — The foundation (shippable boundary)

- [x] `T1` — The catalogue and the pure resolver
  - Files: `src/lib/models/catalogue.ts` (new), `src/lib/models/resolve.ts` (new), `src/lib/models/policyRules.ts` (new), `tests/unit/modelCatalogue.test.ts` (new), `tests/unit/modelResolve.test.ts` (new), `tests/unit/regenerateStamp.test.ts` (new)
  - Estimate: large
  - Kind: impl
  - Notes:
    - **Covers:** FR-01, FR-02 (types), FR-03 (pure core), FR-04 (the system default table), FR-05 (the validation rules, pure), FR-09 (`regenerateStampTier`). **ACs:** AC-01, AC-02, AC-03, AC-05 (the pure half), AC-06.
    - **The catalogue is exactly spec FR-01's table** (Haiku `claude-haiku-4-5`, with `claude-haiku-4-5-20251001` in `previousApiIds`; Sonnet `claude-sonnet-5-5`, with `claude-sonnet-4-6`; Opus `claude-opus-5-5`). Timeouts are design §5's table. `cliArg = apiId` for every entry until T2 says otherwise.
    - **`priceSource`:** `'Anthropic first-party API rates, claude-api skill model table (cached 2026-09-25), read 2026-10-12'`.
    - **The header comment** holds design §2's add-a-model procedure and spec FR-02's surface split procedure.
    - **`ModelKey` and `Surface` are TypeScript unions in `catalogue.ts`** with no Prisma import (client-safe). T3's Prisma enums carry the same values; a T3 unit test pins the two together.
    - **AC-03 is exhaustive, not sampled:** a nested loop over the stated product. It must run in under 2 s.
    - **No I/O, no clock, no env read** in any of the three modules. `envDefault`, `mode` and `credential` are inputs.

- [x] `T2` — **Operator:** the pinned CLI accepts full model IDs (AC-14)
  - Files: `.specclaw/changes/008-model-selection/reports/T2.md` (new), `src/lib/models/catalogue.ts` (only if an ID is rejected)
  - Estimate: small
  - Kind: config
  - Depends: T1
  - Notes:
    - **Covers:** FR-01 (`cliArg`). **ACs:** AC-14. **Gates the wave-1 gate (T12), not T3–T11.**
    - **The implementer does not run this.** The orchestrator hands the operator the command below, and the operator pastes the output into `reports/T2.md`. It needs a real OAuth token in `CLAUDE_CODE_OAUTH_TOKEN`; it is three tiny calls on Haiku, Sonnet and Opus.
    - **The command** (bash, in the rebuilt image or on a machine with CLI 2.1.287; `claude --version` first and recorded):

      ```bash
      claude --version
      for id in claude-haiku-4-5 claude-sonnet-5-5 claude-opus-5-5; do
        echo "=== $id"
        echo "Reply with: ok" | claude -p --strict-mcp-config --tools "" --no-session-persistence \
          --safe-mode --setting-sources "" --output-format stream-json --verbose --model "$id" \
          | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const l of s.split("\n")){try{const e=JSON.parse(l);if(e.type==="system"&&e.subtype==="init")console.log("init.model:",e.model);if(e.type==="result")console.log("result:",e.subtype,"is_error:",e.is_error,JSON.stringify(e.result).slice(0,80))}catch{}}})'
        echo "exit: ${PIPESTATUS[1]}"
      done
      ```

    - **Pass:** each ID exits 0, `init.model` echoes the ID, and a non-error `result` comes back. Then `cliArg = apiId` stays, and T2 commits only the report.
    - **On a rejection:** that entry's `cliArg` becomes its alias (`haiku`/`sonnet`/`opus`). Re-run with the alias, record its `init.model`, and note the narrowed version-consistency claim for the verify report.
    - **Also recorded if available:** what CLI 2.1.287 prints on a usage-limited account (design §8). Otherwise the report says it was not observed.

- [x] `T3` — Schema, migration, rollback and `CLAUDE_CLI_MODEL` validation
  - Files: `prisma/schema.prisma`, `prisma/migrations/20261012120000_model_selection/migration.sql` (new), `prisma/rollback/008-model-selection.down.sql` (new), `src/lib/env.ts`, `.env.example`, `tests/unit/envModel.test.ts` (new), `tests/unit/modelCatalogue.test.ts`
  - Estimate: medium
  - Kind: migration
  - Depends: T1
  - Notes:
    - **Covers:** FR-04 (validation), FR-06. **ACs:** AC-04 (the parse half; the boot line is T4), AC-23 (prepared; run at T12).
    - **The SQL is design §4 verbatim.** The schema adds the `ModelKey`/`ModelSurface` enums, `TeamModelPolicy`, `TeamModelDefault`, the two `Brief` keys and the eight stamp columns, each with a one-line `///` comment in the house style.
    - **`env.ts`:** `CLAUDE_CLI_MODEL` gets a `z.string().optional().transform(...)` that maps a key (case-insensitive) or a current `apiId` to a `ModelKey`, and throws the FR-04 message otherwise. The throw happens at load **outside `next build`** (`IS_BUILD_PHASE`), in every `NODE_ENV`, because a bad value is a config bug in dev too. It imports from `src/lib/models/catalogue.ts` only.
    - **The pin test:** `modelCatalogue.test.ts` asserts that Prisma's `ModelKey` and `ModelSurface` values (from `@prisma/client`) equal the catalogue's unions.
    - **`.env.example`** re-documents the variable: "system default model (haiku | sonnet | opus or a full ID); CLI mode only; no longer overrides team defaults; `default` is rejected".

- [x] `T4` — The server resolver, the team policy store and the two APIs
  - Files: `src/lib/models/policy.ts` (new), `src/app/api/team/model-policy/route.ts` (new), `src/app/api/models/route.ts` (new), `src/lib/api-types.ts`, `tests/unit/modelPolicy.test.ts` (new), `tests/unit/envModel.test.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T3
  - Notes:
    - **Covers:** FR-03 (the I/O wrapper), FR-04 (the boot line), FR-05, FR-13. **ACs:** AC-04 (the boot line), AC-05.
    - **`resolveModel(surface, { requested?, stamp?, userId, teamId, designPath? })`** is spec FR-03's wrapper. `credentialTier` is design §3's single query, skipped in API mode. Substitutions log per FR-03, at `warn` when `userId` is null.
    - **`saveTeamPolicy`:** `validatePolicy` (T1), then one transaction that upserts the `TeamModelPolicy` row and replaces its `TeamModelDefault` rows. A `null` default deletes that surface's row.
    - **Routes:** `GET`/`PUT /api/team/model-policy` use `withTeamAdmin` with a strict zod body (`.strict()`). `GET /api/models` uses `withTeamAuth`, and its shape is FR-13 exactly: no prices and no `apiId`. Response types go into `api-types.ts`.
    - **Unit tests mock Prisma**, the same way `captionStore.test.ts` does.

- [x] `T5` — The boundary: the CLI, the SDK wrapper, the recorder and the usage-limit classifier
  - Files: `src/lib/agent/claudeCli.ts`, `src/lib/models/anthropicCall.ts` (new), `src/lib/models/modelCalls.ts` (new), `src/app/api/test/model-calls/route.ts` (new), `src/lib/agent/generationErrors.ts`, `tests/unit/anthropicCall.test.ts` (new), `tests/unit/usageLimit.test.ts` (new), `tests/unit/claudeCliArgs.test.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T1
  - Notes:
    - **Covers:** FR-07, FR-11 (the classifier), FR-16 (the route). **ACs:** AC-08 (the classifier half), AC-13.
    - **Transitional (see the Summary):** `ClaudeCliOptions.model` becomes `model?: ResolvedModel | string`. A `ResolvedModel` gives `--model <arg>` and **ignores `CLAUDE_CLI_MODEL`**. A string or nothing keeps today's path exactly, so untouched call sites still pass their tests. T10 deletes the string branch.
    - **`recordModelCall`** runs right before `spawnClaude` and inside `createMessage`, for `ResolvedModel` calls only. Its sinks are design §6: a `globalThis` ring buffer under `MOCK_AI`.
    - **`createMessage`** is design §6: the `signal`, the `max_tokens` floor, `ModelRefusalError` and `textOf`. `humanizeGenerationError` passes `ModelRefusalError`'s message through.
    - **`isClaudeUsageLimit`** lives in `claudeCli.ts` beside `isClaudeAuthFailure`, with design §8's regex and field contract.
    - **`/api/test/model-calls`** copies `/api/test/scheduler-tick`'s gate: 404 in production, 404 unless `MOCK_AI`, admin-only. GET returns `{ calls }`; DELETE clears and returns 204.
    - **`claudeCliArgs.test.ts`:** today's override cases stay green on the string path. New cases: a `ResolvedModel` gives `['--model', arg]` with `CLAUDE_CLI_MODEL` both set and unset, and a `MODEL_NAME_RE` violation still throws.

- [x] `T6` — Generation on the resolver, with caption, headline and design stamps
  - Files: `src/providers/interfaces/CopyProvider.ts`, `src/providers/implementations/copy/anthropic.ts`, `src/providers/implementations/copy/claude-cli.ts`, `src/providers/implementations/copy/openai.ts`, `src/providers/registry.ts`, `src/lib/captions/generate.ts`, `src/lib/captions/store.ts`, `src/lib/agent/generateDraft.ts`, `src/lib/agent/pathA.ts`, `src/lib/agent/pathB.ts`, `src/lib/agent/designAgent.ts`, `src/lib/agent/designAgentCli.ts`, `src/lib/agent/background.ts`, `src/lib/drafts/revisions.ts`, `src/app/api/generate/copy/route.ts`, `src/mcp/tools/generate.ts`, `src/lib/testHooks.ts`, `tests/unit/captionWriters.test.ts`, `tests/unit/captionStore.test.ts`, `tests/unit/renderStamps.test.ts`, `tests/unit/background.test.ts`, `tests/unit/copyProviderCliMode.test.ts`
  - Estimate: large
  - Kind: impl
  - Depends: T4, T5
  - Notes:
    - **Covers:** FR-07 (call sites), FR-08 (the generation writers), FR-10 (read side), FR-11 (MCP/ACP/scheduler resolution), FR-15 (`INTERNAL_BACKGROUND`), FR-16 (the generation mock branches). **ACs:** AC-07 (the generation half).
    - **Wiring is design §3's table.** `runGenerationForDraft` and `generateDraftForBrief` resolve `CAPTION` and the design surface at their start: `Brief.captionModel` / `designModel` as `requested` (stored, so a miss falls through), then team, then system. `userId` is the actor's (null for scheduler/MCP/ACP).
    - **`CopyProvider.generateCaptions(brief, targets, model)`** returns `{ raw, modelId }`. The OpenAI provider returns its own model ID. `writeCaptions` returns `{ fields, stamp }`.
    - **`RenderStamp`** gains `model` and `modelSubstitutedFrom`. `currentRenderStamp(model: ResolvedModel | null)`. `draftStampFields(stamp)` maps them to `designModel` / `designModelSubstitutedFrom` (design §4, D4). Update every existing `currentRenderStamp()` caller in this task's files; T7 owns the action routes' callers. Until T7, they pass `null`.
    - **Caption stamps:** `captionRowsFromFields` and `saveGenerationCaptions` write `model` and `modelSubstitutedFrom` on `ok` rows only, and `headlineModel` with the headline.
    - **The background decision** uses `internalModel('INTERNAL_BACKGROUND', mode)`.
    - **The API design loop:** `deadlineMs = model.timeoutMs`, and every turn goes through `createMessage` with `deadlineAt`. Its `claude-sonnet-4-6` default is deleted from `runDesignAgent`, where `model: ResolvedModel` becomes required. `runDesignAgentRefine` keeps accepting `ResolvedModel | string` until T7 moves refine (a string keeps today's direct SDK call). T10 removes the string.
    - **Mock branches record** (design §7: the registry mock provider, the `runDesignAgent` mock, the background seam). The mock caption reply's stamp is `model.arg`.
    - **`retry/route.ts` is untouched:** retry re-enters `runGenerationForDraft`, which resolves from `Brief`.

- [x] `T7` — Draft actions on the resolver: regenerate-copy, regenerate-design, refine and the verifier, plus every remaining stamp writer
  - Files: `src/app/api/drafts/[id]/regenerate-copy/route.ts`, `src/app/api/drafts/[id]/regenerate-design/route.ts`, `src/app/api/drafts/[id]/refine/route.ts`, `src/app/api/drafts/[id]/inline-edit/route.ts`, `src/app/api/drafts/[id]/revisions/[rev]/restore/route.ts`, `src/app/api/drafts/[id]/rejected/[revisionId]/adopt/route.ts`, `src/app/api/drafts/[id]/retry/route.ts`, `src/app/api/drafts/[id]/route.ts`, `src/lib/drafts/refineVerify.ts`, `src/lib/drafts/revisions.ts`, `src/lib/captions/store.ts`, `src/lib/api-types.ts`, `src/lib/testHooks.ts`, `tests/unit/draftRevisions.test.ts`, `tests/unit/renderStamps.test.ts`, `tests/unit/captionStore.test.ts`, `tests/unit/refineVerify.test.ts`, `tests/unit/captionRoutes.test.ts`
  - Estimate: large
  - Kind: impl
  - Depends: T6
  - Notes:
    - **Covers:** FR-08 (the action writers), FR-09 (server side), FR-15 (`INTERNAL_VERIFIER`), FR-16 (`DraftDetail` fields; the refine and verifier mock branches). **ACs:** AC-07 (the rest).
    - **Each route resolves before its claim** (design §3).
      - **regenerate-copy:** the stamp tier comes from `regenerateStampTier(targets, rows, headlineModel)` (T1). The closure writes stamps through `settleCaptionAction` (`ok` fields only; a failed field keeps the row's stamp).
      - **regenerate-design:** `stamp = draft.designModel`.
      - **refine:** no stamp tier; `designPath` comes from the brief (A8).
    - **The verifier:** `internalModel('INTERNAL_VERIFIER', mode)`. `pinModel: true` becomes unnecessary, because a `ResolvedModel` already bypasses the env (T5). It is deleted at T10.
    - **Revision writers:**
      - `commitDraftRevision` and `recordRejectedRender` take `stamp.model` from the refine's resolved model;
      - restore and adopt copy the row's own stamp (`restoredRenderStamp`, `rejectedRenderStamp`);
      - inline edit carries `draft.designModel` forward (A6);
      - the legacy "Design before regenerate" snapshot copies the draft's stamp;
      - the Override path reads `pendingConflict.model`, which refine's `conflict` callback now writes (A6).
    - **Retry** (added after T6): `retry/route.ts` clears `headlineModel` / `headlineModelSubstitutedFrom` together with the headline (spec FR-08).
    - **Caption and headline edits** (`saveCaptionEdit`, `saveHeadlineEdit`) write no stamp field. A unit case proves it.
    - **`GET /api/drafts/[id]`** adds `designModel`, `designModelSubstitutedFrom`, `headlineModel`, `headlineModelSubstitutedFrom` and `captions[].model` / `modelSubstitutedFrom`. The revisions list adds `model`. All additive; the `DraftDetail` type follows.

- [x] `T8` — The assistants, image → template, the voice draft and the token ping on the resolver
  - Files: `src/lib/campaign/briefingAssistant.ts`, `src/lib/agent/vision.ts`, `src/lib/brandkit/assistant.ts`, `src/lib/brandkit/templateFromImage.ts`, `src/lib/brandkit/voiceDraft.ts`, `src/lib/agent/userToken.ts`, `tests/unit/briefingAssistant.test.ts`, `tests/unit/brandKitAssistant.test.ts`, `tests/unit/visionCli.test.ts`, `tests/unit/userToken.test.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T5, T4
  - Notes:
    - **Covers:** FR-02 (the assistant surfaces), FR-07 (call sites), FR-15 (`INTERNAL_TOKEN_PING`), FR-16 (the assistant mock branches), spec open question 2 (D8). **ACs:** groundwork for AC-12 and AC-21.
    - **`runBriefingModel(system, messages, teamId, model)`** and **`runVisionModel({ …, model })`** take a required `ResolvedModel`. The lib entry points resolve it from `teamId`, with `userId` passed where the route has one:
      - `runBriefingChat`, `enhanceBriefing`, `enhancePostBrief` → `ASSISTANT_BRIEFING`;
      - `runBrandKitChat`, `generateTemplateFromImage`, `draftBrandVoice` → `ASSISTANT_BRANDKIT`.

      Wave 2 adds `requested` for the two chats.

    - **`draftBrandVoice`** goes through `runBriefingModel(undefined system, [{ role: 'user', content: promptText }], teamId, model)`. This gives it a CLI path; the `BRAND_VOICE_MODEL` literal is deleted, and `max_tokens` stays 1024 through the call's options.
    - **The token ping** uses `internalModel('INTERNAL_TOKEN_PING', 'cli')` with its explicit `authToken`.
    - **Every assistant mock branch records** (design §7).

- [x] `T9` — The time budget, the heartbeats, scheduler lease renewal, the usage-limit `errorReason` and the image timeout
  - Files: `src/lib/models/budget.ts` (new), `src/lib/drafts/draftActions.ts`, `src/lib/agent/generateDraft.ts`, `src/lib/agent/pathB.ts`, `src/app/api/drafts/[id]/regenerate-design/route.ts`, `src/app/api/drafts/[id]/refine/route.ts`, `src/lib/scheduler/generationRunner.ts`, `src/providers/implementations/image/openai.ts`, `src/lib/renderer/puppeteer.ts` (export a constant only), `tests/unit/actionBudget.test.ts` (new), `tests/unit/draftActions.test.ts`, `tests/unit/generationRunner.test.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T6, T7
  - Notes:
    - **Covers:** FR-11 (the `errorReason` prefix), FR-12. **ACs:** AC-08 (the runner half), AC-09, AC-10.
    - **`budget.ts`** is design §5:
      - `STEP_BUDGETS` imports `SET_CONTENT_TIMEOUT_MS`, `TX_MAX_WAIT_MS` and `IMAGE_GENERATION_TIMEOUT_MS` from their homes, exporting them if they aren't already;
      - `actionSegments()` lists every row of the segments table;
      - `actionBudgetViolations(catalogue, steps)` returns the violations, each naming its segment, worst case and limit.
    - **The limits are imported** (`STUCK_GENERATION_MS` from `recovery.ts`; `GENERATION_LEASE_MS` exported from `generationRunner.ts`), never copied.
    - **Hooks are design §5:**
      - `onBeforeDesign` threads through `runPathBDesign`, `produceDesign`, `runGenerationForDraft` and `generateDraftForBrief`;
      - `touchGeneration(draftId)` lives in `draftActions.ts`;
      - refine adds `touchDraftAction(…, 'REFINE')` inside `commit` before `commitDraftRevision`;
      - the scheduler adds `renewGenerationLease(id)` at each entry's start and as the entry's `onBeforeDesign`.
    - **The usage-limit prefix:** in the runner's catch, `isClaudeUsageLimit(err)` prepends `Claude usage limit reached on the team's credential — ` to `reason`. The retry logic is untouched.
    - **The OpenAI image provider:** `new OpenAI({ apiKey, timeout: IMAGE_GENERATION_TIMEOUT_MS, maxRetries: 0 })`, with the constant (120,000) exported from `providers/imageCapabilities.ts` and shared with Gemini where it already uses 120 s.
    - **AC-10's order assertions** use the mocked Prisma call log. No timers.

- [x] `T10` — Close the boundary: `model` required, the old resolvers deleted, the literal guard and the boundary test
  - Files: `src/lib/agent/claudeCli.ts`, `src/lib/agent/config.ts`, `src/lib/drafts/refineVerify.ts`, `src/lib/agent/designAgentCli.ts`, `src/lib/agent/designAgent.ts`, `src/lib/agent/types.ts`, `src/lib/drafts/refineAttempt.ts`, `tests/unit/modelLiteralGuard.test.ts` (new), `tests/unit/modelBoundary.test.ts` (new), `tests/unit/claudeCliArgs.test.ts`, `scripts/cli-sandbox-check.mjs`, `tests/unit/visionCli.test.ts`
  - Estimate: medium
  - Kind: refactor
  - Depends: T6, T7, T8, T9
  - Notes:
    - **Covers:** FR-03 (deletions), FR-04 (`claudeCli.ts` stops reading the env), FR-07 (required `model`), FR-15, NFR-03. **ACs:** AC-11, AC-12.
    - **Deleted:**
      - the `string` branch of `ClaudeCliOptions.model`, which becomes `model: ResolvedModel` (required);
      - the refine runners' `ResolvedModel | string` (`runDesignAgentRefine`, `runDesignAgentCliRefine`), the refine default model literal in `designAgent.ts`, and `DesignAgentOptions.model?: string` / `deadlineMs` in `agent/types.ts` (found by T6);
      - `pinModel`;
      - the `env.CLAUDE_CLI_MODEL` read;
      - the `"default"` / no-`--model` path;
      - the `"haiku"` fallback;
      - `modelFor`, `modelForBackground`, the three model tables in `config.ts`;
      - `VERIFIER_MODEL`.

      `tsc` is the proof: any call site T6–T8 missed fails to compile.

    - **The literal guard is spec FR-15.** It allows `src/lib/models/catalogue.ts` only and skips `//` and `*` comment lines. Its self-test runs on a fixture string.
    - **`modelBoundary.test.ts` is spec AC-12:** the 9 surfaces × {CLI env unset, CLI `CLAUDE_CLI_MODEL=opus`, API} plus the team-default case and the timeout check. It mocks `child_process.spawn` (as `claudeCliAuth.test.ts` does), the Anthropic client and Prisma (for `resolveModel`), with `MOCK_AI` off.
    - **`claudeCliArgs.test.ts`:** the override cases are rewritten to the new contract, and each rewrite is listed in the report.
    - **`scripts/cli-sandbox-check.mjs`:** `VISION_MODEL` becomes the `ASSISTANT_BRANDKIT` system default's `cliArg` (`claude-sonnet-5-5`, or its alias if T2 fell back). Its drift test asserts the value against the catalogue.

- [x] `T11` — `/team` → Models
  - Files: `src/components/team/ModelsCard.tsx` (new), `src/app/(app)/team/page.tsx`, `tests/unit/uiTokenGuard.test.ts` (only if a new allow-list entry is needed; expected none)
  - Estimate: medium
  - Kind: impl
  - Depends: T4
  - Notes:
    - **Covers:** FR-14. **ACs:** AC-22 (verified at T12).
    - **Layout is spec FR-14.** It is built from `SectionHead`, `FieldLabel`, `Select`, `Notice` and `Button`, plus the team page's `BLOCK`/`ROW` (`components/team/folio.tsx`). There is no raw palette colour.
    - **Data:** React Query `GET /api/team/model-policy`. Save → PUT → invalidate it and `['models']`. The 400 message shows inline in `Notice tone="error"`.
    - **API mode:** the switch is disabled with "Only applies in CLI mode." (`useCurrentUser().cliMode`).
    - **Accessible names:** each checkbox is labelled by its model, and each `Select` by its surface name (`htmlFor`).

- [x] `T12` — Wave-1 E2E, the migration round trip, the export/import scripts, and the gate
  - Files: `tests/e2e/model-selection.test.ts` (new), edited pre-existing E2E files (listed in the report), `scripts/export-posts.mjs`, `scripts/import-posts.mjs`, `.specclaw/changes/008-model-selection/reports/T12.md` (new)
  - Estimate: large
  - Kind: test
  - Depends: T2, T10, T11
  - Notes:
    - **Covers:** FR-06 (the round trip), FR-10 (scripts), NFR-01. **ACs:** AC-15 to AC-24.
    - **The suite is §Y in mock API mode**, and uses `DELETE`/`GET /api/test/model-calls` around each case. Seeds that set stamps directly go through the test DB, as 012's §W does.
    - **AC-23** runs on a scratch DB, `CREATE DATABASE bistec_studio_008rt TEMPLATE bistec_studio_test`, then drops it. It applies the down script, `prisma migrate deploy` with that `DATABASE_URL`, and the `information_schema` check. **Never against the dev DB.**
    - **Expected pre-existing edits:**
      - cases asserting the old model aliases or `CLAUDE_CLI_MODEL` override behaviour (search the E2E tree for `haiku`, `sonnet` and `CLAUDE_CLI_MODEL`);
      - any `DraftDetail` deep-equality on the draft GET.

      Each edit is listed with its reason.

    - **Scripts:** `export-posts`/`import-posts` copy `Brief.captionModel`, `Brief.designModel` and the eight stamp columns; a `--dry-run` shows them.
    - **The gate:** the full per-wave procedure, 0 failed and 0 flaky, then push `v2` and check `gh run list --branch v2`. **T2's report must exist before this gate is called passed.**

### Wave 2 — Choice

- [x] `T13` — The `model` body fields and the `Brief` initial request
  - Files: `src/lib/models/requests.ts` (new), `src/app/api/briefs/route.ts`, `src/lib/brief/briefDraftPayload.ts`, `src/lib/captions/requests.ts`, `src/app/api/drafts/[id]/regenerate-copy/route.ts`, `src/app/api/drafts/[id]/regenerate-design/route.ts`, `src/app/api/drafts/[id]/refine/route.ts`, `src/app/api/campaigns/[id]/briefing/chat/route.ts`, `src/app/api/admin/brandkits/[id]/assistant/chat/route.ts`, `src/lib/campaign/briefingAssistant.ts`, `src/lib/brandkit/assistant.ts`, `tests/unit/modelRequests.test.ts` (new), `tests/unit/captionRequests.test.ts`, `tests/unit/briefDraftPayload.test.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T12
  - Notes:
    - **Covers:** FR-10 (the write side), FR-17. **ACs:** AC-25.
    - **`requests.ts`** holds `modelKeySchema = z.enum(MODEL_KEYS)` and `modelError(result)`, which maps a failed `decideModel` to `400 { error, code: 'MODEL_NOT_ALLOWED' }` with spec FR-17's messages.
    - **`parseRegenerateBody`** keeps its strictness. `model` is optional on all three forms, and `{ channel, headline, model }` stays a 400.
    - **`POST /api/briefs`** validates `captionModel`/`designModel` against the effective sets (`designModel` by `designMode`) and writes them.
    - **The order everywhere:** parse → resolve (400 on an explicit miss) → claim. A 400 claims nothing.
    - **The two chat lib functions** gain an optional `requested`.

- [x] `T14` — The shared `ModelPicker`, `useModels()` and the pure picker helpers
  - Files: `src/components/ui/ModelPicker.tsx` (new), `src/lib/hooks/useModels.ts` (new), `src/lib/models/pickerState.ts` (new), `tests/unit/modelPicker.test.ts` (new), `tests/unit/uiPrimitives.test.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T13
  - Notes:
    - **Covers:** FR-18, FR-22 (`teamTokenNotice`). **ACs:** AC-26.
    - **`pickerState.ts`** is pure: `pickerOptions`, `preselection` (= `decideModel` with no `requested`), `hintText` (spec FR-18's strings) and `teamTokenNotice`.
    - **The component** follows design §9 and spec FR-18. It reports `undefined` until the user picks a different value (A5).
    - **`uiPrimitives.test.ts`** gains the picker's accessible-name and hidden-when-one-option cases, in the existing style.

- [x] `T15` — The brief wizard's Review step pickers
  - Files: `src/components/brief/ReviewStep.tsx`, `src/components/brief/useBriefWizard.ts`, `src/components/brief/types.ts`, `src/components/brief/ReviewRow.tsx` (if a row helper is needed)
  - Estimate: small
  - Kind: impl
  - Depends: T14
  - Notes:
    - **Covers:** FR-19. **ACs:** AC-28 (at T18).
    - **The picks live in wizard state and the autosave payload** (T13 widened the schema). `designModel` resets to `undefined` when the design path makes it ineligible, with the hint.
    - **The submit** omits a field that is `undefined`.

- [x] `T16` — The draft page pickers and "Generated with"
  - Files: `src/components/drafts/RefinementPanel.tsx`, `src/components/drafts/CaptionPanel.tsx`, `src/components/drafts/CaptionPanels.tsx`, `src/components/drafts/HeadlinePanel.tsx`, `src/app/(app)/drafts/[id]/page.tsx`
  - Estimate: medium
  - Kind: impl
  - Depends: T14
  - Notes:
    - **Covers:** FR-20, FR-22 (the refine notice). **ACs:** AC-29, AC-31 (at T18).
    - **The pickers' contexts:**
      - the refine box takes `designPath`;
      - each caption panel takes its row's `model`;
      - the headline panel takes `headlineModel`;
      - "Regenerate all" takes the three rows' stamps through `regenerateStampTier`;
      - the design regenerate takes `designModel`.
    - **No new settle logic** (015, L25): each control already posts then awaits the refetch; the picker only adds `model` to the body.
    - **"Generated with":** a muted line per panel and in the Versions sheet. Its display name comes from `entryForStamp`; it falls back to the raw stamp, and adds "(substituted)" with a `title` naming `substitutedFrom`.

- [x] `T17` — The assistant chat header pickers and the team-token notice wiring
  - Files: `src/components/campaigns/BriefingAssistantPanel.tsx`, `src/components/admin/brandkits/BrandKitAssistantPanel.tsx`
  - Estimate: small
  - Kind: impl
  - Depends: T14
  - Notes:
    - **Covers:** FR-21, FR-22. **ACs:** AC-30 (at T18).
    - **The pick is client state for the open chat.** It is sent on each turn once changed, and resets on reload (no remembered choice).
    - **The notice** comes from `ModelPicker`'s own `teamTokenNotice` slot. Nothing is duplicated.

- [x] `T18` — Wave-2 E2E and the gate
  - Files: `tests/e2e/model-selection.test.ts`, edited pre-existing E2E files (listed in the report), `.specclaw/changes/008-model-selection/reports/T18.md` (new)
  - Estimate: medium
  - Kind: test
  - Depends: T15, T16, T17
  - Notes:
    - **Covers:** NFR-01, NFR-07. **ACs:** AC-27 to AC-31, AC-33.
    - **AC-31's CLI-mode state** is faked client-side with `page.route` on `/api/me` and `/api/models`. The server stays in API mock mode.
    - **The axe blocks** on the wizard Review step, the draft page and `/team` (014) run with the pickers present.
    - **The gate:** the full per-wave procedure, 0 failed and 0 flaky, then push `v2` and check `gh run list --branch v2`.

- [x] `T19` — Docs, the runbook and the ROADMAP
  - Files: `CLAUDE.md`, `docs/handoff.md`, `docs/mcp-acp-guide.md`, `docs/ui-reference/DESIGN_SYSTEM.md`, `docs/e2e-test-plan.md`, `.specclaw/ROADMAP.md`
  - Estimate: small
  - Kind: docs
  - Depends: T18
  - Notes:
    - **Covers:** FR-23.
    - **The handoff runbook:**
      - the migration and the down script (which un-records itself);
      - the `CLAUDE_CLI_MODEL` change and the boot error on `default`;
      - the add-a-model and surface-split procedures (design §2, spec FR-02);
      - T2's outcome;
      - AC-32's operator step;
      - the release note (spec FR-23).
    - **The ROADMAP** records 008's status and changes 006's dependency line to the real stamp names (`DraftCaption.model`, `Draft.headlineModel`, `Draft.designModel`, `DraftRevision.model`) and the catalogue's numeric prices.
    - **`DESIGN_SYSTEM.md` §8.19:** the model picker, its hint line, and the team-token notice.
