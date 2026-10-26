# Tasks: Brand-kit design rules, detector and upgrade

**Change:** 007-brandkit-design-system · **Size:** architectural
**Created:** 2026-10-23
**Total Tasks:** 4

## Summary

This change has **4 tasks in 4 waves**:

1. the pure core: the authoring dataset, the detector, the measurable check, the validation and provenance, the review reducer, the fenced-block helper and the boundary guard, with their unit tests;
2. the upgrade route, the `lostRules` field on improve, the MOCK seam and the route's unit tests;
3. the UI (hook, panel, editor integration) and the E2E section AC;
4. the docs, the full gate and CI.

Each wave depends on the one before it, so there is no parallel work and no task is split further. T1 is large because the dataset, the detector, the validator and the reducer share one set of types and one fixture; splitting them would leave a task that cannot compile or be reviewed alone.

## Process / Gates

- **One task at a time:**
  1. an implementer subagent does the task;
  2. `specclaw:code-reviewer` reviews it;
  3. the orchestrator re-runs tsc, `npm run lint` and `npm run test:unit`, then commits.

  Never run two implementers in this checkout.

- **No real model calls.** Every test runs on the `MOCK_AI` seam or a faked model function. No Anthropic key and no Claude token is used.
- **The databases are shared.** Never run a prisma or DB command without an explicit `DATABASE_URL` that points at `bistec_studio_test` or a named scratch database. `bistec_studio` is never touched. This change has no migration and needs no scratch database. Use `export MSYS_NO_PATHCONV=1` before any docker command that takes a container path.
- **Baselines (024 T4, 2026-10-23):**
  - unit 3024/3024;
  - render 47/47;
  - lint 0 errors / 7 warnings;
  - full clean mock E2E 431/3/0/0.

  A task may add unit cases; it may not lower the pass count or add a lint warning.

- **Base commit for the diff checks:** `f0b5c36` (the 007 proposal approval). Every "unchanged" check in this file is `git diff --name-only f0b5c36 -- <paths>`.
- **No open questions.** OQ-1 was resolved by the user on 2026-10-23: **no stamp for now** (no column; log proposals and measure uptake by the version-count query).

## Tasks

### Wave 1 — The pure core

- [x] `T1` — The authoring dataset, the detector, the measurable check, validation and provenance, the review reducer, the fenced-block helper and the boundary guard
  - Files: `src/lib/designData/authoring/{index,entries,measurable,detect,validate,roles}.ts` (new), `src/lib/kitUpgrade/review.ts` (new), `src/lib/agent/fencedBlock.ts` (new), `src/lib/brandkit/assistant.ts` (`extractBrandKitBlock` only), `tests/unit/{designAuthoring,designMeasurable,designDetect,designLostRules,kitUpgradeValidate,kitUpgradeReview,fencedBlock,designDataBoundary,generationUntouched}.test.ts` (new), `tests/unit/fixtures/hearts-kit-adjectives.ts` (new)
  - Estimate: large
  - Kind: impl
  - Depends: none
  - Notes:
    - **Covers:** FR-01 to FR-04, FR-07 (validation and apply logic), FR-08, FR-09 (the role list and `containsForbidden`), FR-12 (the pure core), FR-15 (`lostMeasurableRules`), FR-16, NFR-03, NFR-07; AC-01 to AC-05, AC-07, AC-08 (the type and the provenance rule), AC-09 (the unit half), AC-14 (the unit half), AC-15, AC-16, AC-17 (the golden half), AC-18.
    - **Do it in this order, one commit at the end:**
      1. `fencedBlock.ts` and `fencedBlock.test.ts` first. First pin `extractBrandKitBlock`'s current results against fixtures (valid, missing, bad JSON, bad schema, two blocks) **before** changing it, then rewrite it on `extractFencedJson` and re-run the same fixtures. No other extractor is touched.
      2. `measurable.ts` and `designMeasurable.test.ts` from AC-05's table, including `lostMeasurableRules` and `designLostRules.test.ts` (AC-14's unit half: the dropped span returned in its original spelling, reformatting not a loss).
      3. `entries.ts` (the seven entries, FR-01's table; every `template` filled with its `defaults` must pass `isMeasurable`) and `designAuthoring.test.ts` (AC-04).
      4. `detect.ts`, the fixture `hearts-kit-adjectives.ts` (text built from CLAUDE.md's table; comment in the file that "IRP is fine on-image" is outside the detector and the seam row had no text), and `designDetect.test.ts` for AC-01 to AC-03. Include the `İ` case, the brand-voice word fixture and the "already measurable" case. Matching is by regex over the original string, never `indexOf` on a lower-cased copy.
      5. `roles.ts`, `validate.ts` and `kitUpgradeValidate.test.ts` (AC-07 table, AC-08, AC-09's unit half). `validateProposals(candidates, proposals, kit, text)` is pure and takes no model; build the `Edit` from the candidate, never from the proposal; `setProvenance` has the two values only. Add the assertion that nothing here imports `sampleImageColors`.
      6. `review.ts` and `kitUpgradeReview.test.ts` (AC-15): `locateEdit`, `applyEdit` (replace and insert), `reviewReducer`, `dismissKey`; the test hosts are a plain string and a callback, with no kit import.
      7. `designDataBoundary.test.ts` (AC-16) and `generationUntouched.test.ts` (AC-17's golden half: `buildBrandKitSystemContext` for a fixed kit equals a stored string; `PROMPT_VERSION` equals `'2026-10-21.1'`). Capture the golden string from the code **before** any change in this task.
    - **Check at the end:** `git diff --name-only f0b5c36 -- src/lib/agent/prompts src/lib/brandkit/systemContext.ts src/lib/designData/index.ts src/lib/designData/composition.ts prisma` lists nothing.
    - **Gate for this task:** tsc, `npm run lint`, `npm run test:unit` (3024 plus the new cases), and the existing `brandkit-assistant` unit cases unchanged. No build and no E2E here.

### Wave 2 — The route, the seam and improve

- [x] `T2` — `POST …/prompts/upgrade`, the prompt builder, the MOCK seam and `lostRules` on improve
  - Files: `src/lib/kitUpgrade/{upgrade,prompt}.ts` (new), `src/app/api/admin/brandkits/[id]/prompts/upgrade/route.ts` (new), `src/app/api/admin/brandkits/[id]/prompts/improve/route.ts`, `src/lib/testHooks.ts`, `src/lib/api-types.ts`, `tests/unit/{kitUpgradePrompt,kitUpgradeRoute}.test.ts` (new)
  - Estimate: medium
  - Kind: impl
  - Depends: T1
  - Notes:
    - **Covers:** FR-05, FR-06, FR-09 (the prompt), FR-10, FR-11, FR-15 (the route), FR-17 (the log line), NFR-04 to NFR-06, NFR-10; AC-06 (unit half), AC-08, AC-09 (the prompt assertion), AC-10 to AC-12 (the route half), AC-14, AC-17, AC-19, AC-20 (the log).
    - **The route** copies `improve/route.ts`: `withTeamAdmin`, the kit lookup with `kit.teamId !== user.teamId` giving 404, `withClaudeAuth(user.userId, user.teamId, …)`, the `AssistantModelError` to 422 mapping. Add a strict zod body (`text` 1 to 20 000, `baseVersion` int >= 0) through `parseBody`. The order of checks is FR-05's: 404, 409 `STALE_BASE`, no candidates (200 `none`, no model call), model resolution, call, parse, validate.
    - **`upgrade.ts`** holds `runKitUpgrade` so the route stays thin: the model call is injected (`callModel`) in the unit tests. Under `MOCK_AI` it records `modelCallFor(model, pipelineMode(), 'kit-upgrade')` and uses `buildMockKitUpgradeReply`. It does not call `sampleImageColors` and does not use `collectBrandKitGrounding` in v1 (spec Notes).
    - **`prompt.ts`** is a pure builder (system, roles, candidates, the fenced base text). Golden-test the output for a fixed input; assert the base text appears only inside `fenceUntrusted`, that `UNTRUSTED_CONTENT_GUARD` is present, that no hex and no kit font name appears, and that a base text holding `<<<END-UNTRUSTED-DATA>>>` is neutralised.
    - **The seam** (`testHooks.ts`, beside `buildMockBrandKitReply`): `buildMockKitUpgradeReply(candidates, text)` with the four sentinels (`__MOCK_UPGRADE_UNPARSEABLE__`, `__MOCK_UPGRADE_NONE__`, `__MOCK_UPGRADE_BAD__`, `__MOCK_UPGRADE_OUTOFRANGE__`) as FR-11 words them. Add the fifth sentinel `__MOCK_IMPROVE_DROP_RULES__` for the improve route: when the active prompt holds it, the mock draft is the prompt with its measurable spans removed (otherwise the mock draft is exactly today's string). Export the sentinel names as constants so the E2E and the unit tests use one spelling. Dormant in production, like its neighbours.
    - **Improve:** add `lostRules` (`lostMeasurableRules(currentPrompt, draft)`) to the JSON response only. Do not change its prompt text or its mock draft; add a golden assertion on the prompt text (extract it to a small exported builder only if needed, with no change to the string).
    - **Unit tests (`kitUpgradeRoute.test.ts`, prisma and the model faked):** the three outcomes and the 502 parse failure with the logged raw reply truncated to 2000 characters; 401/403/404/400/409/422; that the 409 and the `no-candidates` case make no model call; that the log line has the FR-05 fields and no prompt text; one model call per request; the recorder label and surface; the provenance rule through the route (a reply `provenance` field is ignored).
    - **Check at the end:** `git diff --name-only f0b5c36 -- 'src/app/api/admin/brandkits/[id]/prompts/route.ts' 'src/app/api/admin/brandkits/[id]/prompts/[promptId]' src/lib/agent/prompts src/lib/brandkit/systemContext.ts prisma` lists nothing (NFR-02, NFR-03).
    - **Gate for this task:** tsc, `npm run lint`, `npm run test:unit`, and `npm run build` (then `rm -rf .next`). No E2E here.

### Wave 3 — The UI and the E2E

- [x] `T3` — The hook, the panel, the editor integration and E2E section AC
  - Files: `src/components/textUpgrade/{useRuleReview.ts,RuleReviewPanel.tsx}` (new), `src/components/admin/brandkits/PromptSection.tsx`, `tests/e2e/kit-upgrade.test.ts` (new)
  - Estimate: large
  - Kind: impl
  - Depends: T2
  - Notes:
    - **Covers:** FR-12 (the hook and panel), FR-13, FR-14, FR-15 (the display), NFR-08; AC-10 to AC-14 (the E2E halves), AC-21.
    - **Read DESIGN_SYSTEM.md §8 first** and reuse the atoms `PromptSection.tsx` already imports (`Button`, `SegmentedToggle`, `FieldLabel`, `PILL_BADGE`, `ICON`, `SCROLL_FOCUS`) and `Notice` (as 024's `CaptionRouteCard` does). **No raw colour, no new class string, no `// ui-exception`.** The flagged list is a labelled region; every control has a visible label and focus; the panel has no horizontal scroll at 390 px.
    - **The hook** takes `{ text, setText, request }` and imports nothing from `@/lib/brandkit`, `components/admin` or prisma (the boundary test covers `components/textUpgrade/`). The debounce is 300 ms and the live detector never calls the server. A response is applied only if the text it carried equals the current text.
    - **`PromptSection.tsx`:** add "Improve this version" (seeds the editor and `baseVersion`); mount the panel under the textarea; add the Save note with FR-13's exact words; wrap `saveVersion` with the stale-base check (refetch `GET …/prompts`, confirm through the existing `useConfirm()`, as the other admin screens do, only when an upgrade seeded the editor); show the `lostRules` warning after Improve. **Leave the `generate` and `improve` request bodies and the save request as they are.**
    - **E2E (`kit-upgrade.test.ts`, section AC):** serial, skip without `MOCK_AI`, like `brandkit-assistant.test.ts`; log in as the seeded admin and editor (`loginAs`), create a kit per case through the API (`POST /api/admin/brandkits`) and its prompt through `POST …/prompts`; clear the model-calls ring (`DELETE /api/test/model-calls`) in `beforeEach` and read `GET /api/test/model-calls` filtered by label `kit-upgrade`. Copy the small helpers; do not import across spec files. Cases:
      - **TC-KU-01:** typing the Hearts fixture into the New Version textarea shows four flagged rows within the debounce and makes no request to `…/upgrade`; the brand-voice fixture shows none.
      - **TC-KU-02:** `POST …/upgrade` with the fixture and the right `baseVersion` returns `edits` with four edits, entry keys as AC-01, `provenance: 'dataset'`, and one `kit-upgrade` record.
      - **TC-KU-03:** every edit's `replacement` is measurable (the test applies the exported `isMeasurable`), and every `quote` occurs exactly once in the posted text.
      - **TC-KU-04:** `UNPARSEABLE` is 502 `UPGRADE_PARSE_FAILED`, not a 200 with an empty list; the UI shows the error and a "Try again" button.
      - **TC-KU-05:** `NONE` is 200 `none` / `model-proposed-none`; a text with no vague phrase is `none` / `no-candidates` with no recorder entry.
      - **TC-KU-06:** `BAD` is 200 `edits` with one edit and the three rejection reasons; `OUTOFRANGE` gives `provenance: 'unverified'` and the UI shows "Number not from the dataset, check it".
      - **TC-KU-07:** the editor flow: Improve this version, Upgrade, each edit shows the removed text beside the inserted text, the provenance label and the rationale; accept two and reject one; the textarea changes and the version list does not; Save creates one new active version whose content equals the textarea; accepting nothing and saving creates a version equal to the base. The Save note's words are on the page.
      - **TC-KU-08:** a second save through the API moves the active version; `…/upgrade` with the old `baseVersion` is 409 `STALE_BASE` with no recorder entry; in the UI, Save in an upgrade-seeded editor shows the "was saved since you started" confirm and saves only on confirm.
      - **TC-KU-09:** editing the textarea so a quote no longer occurs once disables that edit as stale; dismissing a flag hides it until reload.
      - **TC-KU-10:** Improve with AI on a kit whose active prompt holds `__MOCK_IMPROVE_DROP_RULES__` and "1.5 wordmark letters" returns `lostRules` holding `1.5 wordmark letters` (the sentinel makes the mock draft remove measurable spans, FR-11); on a normal kit `lostRules` is `[]` and `draft` is exactly today's shape. The UI shows the dropped spans above the editor.
      - **TC-KU-11:** 401 with no session, 403 for the editor, 404 for another team's kit (the team-isolation helper pattern, a kit of the ClientX team), 400 for a bad body.
    - **Run the targeted E2E suites** against a fresh `:3001` server (stop stray node processes, `rm -rf .next`, test database only): `kit-upgrade.test.ts`, `brandkit-assistant.test.ts`, `team-isolation.test.ts`, `ui.test.ts`, `model-selection.test.ts`. Report any test that asserts on the shape of the improve response.
    - **Take screenshots** of the panel at 390 px and 1440 px, light and dark (`node scripts/capture-ui.mjs --out ui-captures/007`, against the running test server), and look at them; note the result in `reports/T3.md`.

### Wave 4 — Docs and the gate

- [x] `T4` — The docs, the full gate and CI
  - Files: `docs/handoff.md`, `docs/e2e-test-plan.md`, `CLAUDE.md`, `.specclaw/ROADMAP.md`
  - Estimate: small
  - Kind: docs
  - Depends: T3
  - Notes:
    - **Covers:** FR-17, FR-18; AC-17 (the final `git diff` checks), AC-20, AC-21, AC-22.
    - **The checklist line.** Add the 007 line to "Check before the merge" in `docs/handoff.md`: no migration, no env var, nothing changes for a team that does not use the new buttons; generation prompts and `PROMPT_VERSION` are unchanged; the Hearts Academy drift fix is an operator step (below), not a blocker. It adds no blocking step.
    - **The handoff 007 section and "Where things stand" row,** with: the flow in one paragraph (detector, upgrade, accept into the editor, existing Save, what restore means); the limits (text check only, no render verification, the client-only stale-base check, exactly-once quotes); the evidence query from FR-17; the log line and how to grep it; **OQ-1 and the user's answer**; the **operator step for the navy/teal drift** with the Hearts Academy kit id `cms3jg09p000at5ijivpi3zhe` and the steps in FR-18 (the author chooses the numbers); an optional real-model look (one upgrade on a real kit, read the edits) as an operator step, since the build makes no real model call and does not claim it.
    - **`docs/e2e-test-plan.md`:** section AC (TC-KU-01 to TC-KU-11, with an AC-to-case table like section X), the `kit-upgrade` label in the model-calls seam note, and the four sentinels.
    - **`CLAUDE.md`:** the top "Outstanding work" entry (007 state, gates, run IDs), the "Architecture decisions to remember" note (the authoring/generation boundary, the review reducer, the unchanged save route), and update the "One open drift" line only if the operator step is done.
    - **`.specclaw/ROADMAP.md`:** the 007 row (state and gates) and the order 024, 007, 025, 006 kept; the typography follow-up and the briefing host listed as proposals.
    - **Prepare for the full run:**
      - stop stray node processes;
      - `rm -rf .next`;
      - `export MSYS_NO_PATHCONV=1`, then `docker exec designer-postgres-1 psql -U bistec -d postgres -c "DROP DATABASE IF EXISTS bistec_studio_test WITH (FORCE);"`, then `npm run test:e2e:db`.
    - **Then run:**
      - `npm run test:e2e:serve` and `npm run test:e2e:mock`, for 0 failed and 0 flaky against the 431/3/0/0 baseline plus the new §AC cases (wait for the log's `MOCK_EXIT` line; a haiku gate agent has twice handed back early);
      - tsc, `npm run lint`, `npm run test:unit`, `npm run test:render`, `npm run build` and `npm run test:upgrade`;
      - `rm -rf .next` after the build.
    - **Run the AC-17 checks** (`git diff --name-only f0b5c36 -- prisma src/lib/agent/prompts src/lib/brandkit/systemContext.ts 'src/app/api/admin/brandkits/[id]/prompts/route.ts' 'src/app/api/admin/brandkits/[id]/prompts/[promptId]'` empty; `PROMPT_VERSION` literal) and paste them into `reports/T4.md`.
    - **Push `v2` to `origin`** (never `main`), then watch `gh run list --branch v2` until CI is green.
    - **Record the run IDs and the gate numbers** in `CLAUDE.md`'s top entry and the handoff's "Where things stand" row.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
- `[>]` Deferred — correctly blocked on a sibling change, not incomplete through any fault of its own; excluded from the incomplete-task count that gates `verify`

## Open questions

None. OQ-1 (the entry stamp) was resolved by the user on 2026-10-23: no stamp for now.
