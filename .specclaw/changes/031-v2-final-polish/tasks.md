# Tasks: v2 final polish before the merge to main

**Change:** 031-v2-final-polish · **Size:** architectural
**Created:** 2026-10-26
**Total tasks:** 19 in 9 waves, run one at a time. T17 is the operator step OP-031.

## Summary

1. **H, the leftovers** (T1): temp dirs, one lost-claim cleanup, the AC-17 recheck.
2. **G, wording** (T2, T3): the MEDIUM items and the docs; then the glossary, the LOW sweep, the guard and the early full E2E run.
3. **C, the image generation key** (T4, T5): the backend, then the UI and E2E.
4. **B, fonts** (T6, T7, T8): the catalogue and validation; injection, the render note and the stamp; the picker.
5. **E, typography and the second host** (T9, T10).
6. **F, the assistants** (T11, T12).
7. **A, Apply to image** (T13, T14, T15): the measure gate and the pure module; the render check; the action, UI and E2E.
8. **D, Spotlight SQUARE v2** (T16, T17, T18): evidence, contract and runner; OP-031; apply the result.
9. **Docs, screenshots, the full gate and CI** (T19).

## Process / Gates

- **One task at a time:**
  1. an implementer subagent does the task, on the model listed for it (the user's standing rule: the cheapest workable model);
  2. `specclaw:code-reviewer` (sonnet) reviews it;
  3. the orchestrator re-runs tsc, `npm run lint` and `npm run test:unit`, then commits.

  Never run two implementers in this checkout.

- **No real model or image calls,** except OP-031 (T17, at most 4, on the user's go). Every test uses the `MOCK_AI` / `MOCK_PUPPETEER` seams, or real Chromium on local fixtures. The FR-16 metadata fetch (T6) and the FR-35 re-measure (T13) are not model calls.
- **Databases:**
  - Every prisma or DB command takes an explicit `DATABASE_URL`: `bistec_studio_test` for tests and migrations.
  - `bistec_studio_op1` is used read-only, only in T13 (re-measure) and T17 (OP-031, after T4, T7 and T15's migrations are applied there, on the user's go).
  - Never touch `bistec_studio`.
  - Run `export MSYS_NO_PATHCONV=1` before any docker command with a container path.
- **A :3002 dev server may be running** and shares `.next`. Before a build or E2E run, ask the orchestrator; do not kill it yourself.
- **A clean E2E gate** first runs `docker exec designer-postgres-1 psql -U bistec -d postgres -c "DROP DATABASE IF EXISTS bistec_studio_test WITH (FORCE);"`, then `rm -rf .next`. Run the full suite in T3, T15 and T19. The other UI tasks run their own section plus any suite whose locators they touch.
- **A `page.waitForResponse` must be created before the action that triggers it.**
- **Read `docs/ui-reference/DESIGN_SYSTEM.md` before any UI task** (T2, T3, T5, T8, T9, T10, T11, T12, T15). After T3, also follow its §12 "Words". No new shared atom, and no new `// ui-exception`.
- **Baselines (030, CI green at `57fce05`):**
  - unit 4253; render 134; lint 0 errors / 7 warnings; full clean mock E2E 559 passed / 3 skipped / 0 failed / 0 flaky.
  - A task may add cases. It may not lower a pass count or add a lint warning.
  - An existing case may be adapted (list it in the report), never deleted.
- **Hard rules for every task:**
  - `PROMPT_VERSION_BASE` changes only in T7.
  - The post-style revision changes only in T18, and only on a pass.
  - No other file under `src/lib/agent/prompts/` changes, except `shared.ts` in T7.
  - `git diff --name-only 0f42017 -- src/lib/scheduler src/mcp src/acp src/app/api/acp` lists only `src/mcp/server.ts` and `src/mcp/tools/brandkit.ts` (T6).
- **Unit tests that reach `renderPost` mock it** (the 030 lesson: mocking only `renderHtmlToPng` launches a real Chromium on CI).
- **Report footers.** Each task writes `reports/T<n>.md` ending with a `## Verification` heading exactly (`Command:` / `Exit:` / `Output (tail):`), for `specclaw-build check-report`. Re-read it after prettier.
- **Build context:** do not hand an implementer the `specclaw-build-context` payload (~500 KB). Give it `spec.md`, `design.md`, this task's block and the files listed, as a brief in `briefs/T<n>.md`.

## Tasks

### Wave 1: H, the leftovers

- [x] `T1` — Temp-dir cleanup, one lost-claim cleanup, AC-17 recheck
  - Files: `src/lib/agent/claudeCli.ts`, `src/lib/drafts/revisions.ts`, `src/app/api/drafts/[id]/regenerate-design/route.ts`, `tests/unit/claudeCliTempDir.test.ts` (new), `tests/unit/lostClaimCleanup.test.ts` (new)
  - Estimate: small
  - Kind: impl
  - Model: sonnet
  - Depends: none
  - Notes:
    - **Covers:** FR-01 to FR-03; AC-01 to AC-03; NFR-08.
    - Design §2. Delete by exact path and exact key only; no glob, no prefix sweep.
    - Confirm `exportKey()` uniqueness (spec A4) by reading it, and quote it in the report.
    - AC-01: list `bistec-cli-*` in `os.tmpdir()` before and after `npm run test:unit`, and paste both listings.
    - AC-03: `docker build -t bistec-studio:031 . 2>&1 | tee` a log in the scratchpad, `grep -c EBADENGINE`, and `docker run --rm --entrypoint claude bistec-studio:031 --version`. Paste the outputs. Add one line to `.specclaw/changes/005-provider-flexibility-onboarding/verify-report.md`'s follow-up list: "AC-17 rechecked under node:22 by 031 T1: <output>".
    - **Gate:** tsc, lint, unit.

### Wave 2: G, wording

- [x] `T2` — The MEDIUM wording items and the stale docs
  - Files: as listed by W-03 to W-12, W-14, W-17, W-18, W-19 (the wording part), W-20 to W-26 and W-39 to W-41 in `wording-scan.md`; any E2E file whose locator matches a changed string
  - Estimate: medium
  - Kind: refactor
  - Model: sonnet
  - Depends: T1
  - Notes:
    - **Covers:** part of FR-07.
    - Use the scan's suggested text, adjusted to the glossary in spec FR-05. Check spec A3: what reads the `COPY` row. If brand-voice drafting does, the "Captions" helper text says so.
    - W-25: inline the plan facts (a Pro, Max, Team or Enterprise plan is needed; the free plan does not work), and remove the repo path.
    - W-40: rewrite `docs/PRD.md`'s stale parts to describe the product as it is: Claude design via HTML and Puppeteer, an image provider for backgrounds and hero images, no Canva.
    - Do not touch W-01, W-02, W-13 or W-16 (owned by T5, T11 and T12).
    - Run the E2E suites whose locators you changed (`grep -rl` for each old string under `tests/e2e`).
    - Report: one row per item handled ("W-nn | file | what changed").
    - **Gate:** tsc, lint, unit, and the touched E2E suites.

- [x] `T3` — Glossary, the LOW naming sweep, the wording guard, the early full E2E run
  - Files: `docs/ui-reference/DESIGN_SYSTEM.md` (§12), `tests/unit/uiWordingGuard.test.ts` (new), the files of W-15 and W-27 to W-38, E2E files with adapted locators
  - Estimate: large
  - Kind: refactor
  - Model: sonnet
  - Depends: T2
  - Notes:
    - **Covers:** FR-05 to FR-08; AC-04 to AC-07.
    - Write §12 exactly as spec FR-05's table, plus a UI-to-code mapping list (post ↔ `Brief`, published post ↔ `Post`, Template ↔ `designMode: TEMPLATE`, Freeform ↔ `GENERATE`, Captions ↔ `COPY`, Images ↔ `IMAGE`, Image generation key ↔ `UserOpenAiKey`).
    - The guard follows design §3.1. Self-tests: each pattern flagged; comments ignored; `wording-exception:` honoured.
    - Sweep `src/app/(app)` and `src/components` until the guard passes. Use a `wording-exception` only where a string is a code value shown verbatim (state why).
    - `reports/T3.md` holds the full W-01 to W-41 table (spec FR-07). The rows owned by T5, T11, T12 and T15 say "owned by Tn"; T19 fills them in.
    - **Full clean mock E2E** (AC-07). List every adapted locator.
    - **Gate:** tsc, lint, unit, full clean mock E2E.

### Wave 3: C, the image generation key

- [x] `T4` — Prefix detector, migration, personal route, resolver, fallback, `imageSource`, upgrade scenario
  - Files: `src/providers/keyPrefix.ts` (new), `src/providers/registry.ts`, `src/lib/agent/background.ts`, `src/lib/agent/openAiKey.ts`, `src/app/api/me/openai-key/route.ts`, `src/app/api/admin/providers/route.ts`, `prisma/schema.prisma`, `prisma/migrations/20261028120000_personal_image_key_provider/` (new), `prisma/rollback/031-v2-final-polish.down.sql` (new, section C), `src/lib/api-types.ts`, `src/lib/drafts/imageSourceNotice.ts` (new), `src/lib/drafts/backgroundNotice.ts`, `src/lib/agent/generateDraft.ts`, `src/app/api/drafts/[id]/refine/route.ts`, `src/app/api/drafts/[id]/route.ts`, `src/lib/testHooks.ts`, `scripts/test-upgrade-path.mjs`, `tests/unit/{keyPrefix,personalImageKey,imageProviderResolution,imageSourceNotice}.test.ts`
  - Estimate: large
  - Kind: impl
  - Model: sonnet
  - Depends: T3
  - Notes:
    - **Covers:** FR-09 to FR-14 (backend), FR-15's `NO_PROVIDER` text; AC-08 to AC-11, AC-13; NFR-07.
    - Design §4. The team page's detector switch moves to T5; this task changes only the admin providers route.
    - The migration is additive. Apply it to `bistec_studio_test` with an explicit `DATABASE_URL`.
    - AC-13: in the test database, insert a `gemini` row, run the down section, and check that the OpenAI rows remain and the column is gone. Then re-apply. Record it in the report.
    - `test:upgrade` scenario 4 (AC-10).
    - Mock sentinel `__MOCK_BG_PERSONAL_FAIL__` (design §4.3).
    - **Gate:** tsc, lint, unit, `npm run test:upgrade`.

- [x] `T5` — The image generation key card, the team page, the notice on the draft page, §AI
  - Files: `src/components/settings/OpenAiKeyCard.tsx`, `src/app/(app)/team/page.tsx`, `tests/unit/uiWordingGuard.test.ts`, `src/app/(app)/drafts/[id]/page.tsx`, `tests/e2e/image-key.test.ts` (new), `docs/e2e-test-plan.md` (§AI), E2E files with adapted locators
  - Estimate: medium
  - Kind: impl
  - Model: sonnet
  - Depends: T4
  - Notes:
    - **Covers:** FR-09 (team page), FR-14 (UI), FR-15; AC-12; W-01, W-02, W-03 (team page).
    - Add `OpenAI key` to the `uiWordingGuard.test.ts` patterns (spec FR-06).
    - TC-IK-01 to TC-IK-06: connect OpenAI, connect Gemini (provider shown), refuse `sk-ant-` and random strings, personal Gemini with `__MOCK_BG__` records the tier, `__MOCK_BG_PERSONAL_FAIL__` shows the fallback notice, disconnect.
    - **Gate:** tsc, lint, unit, §AI plus the suites using `/api/me/openai-key` (`background-notice`, `settings-claude-token`, `team-image-default`).

### Wave 4: B, fonts

- [x] `T6` — The catalogue snapshot, refresh script, lookup, URL builder, `/api/fonts`, save validation
  - Files: `src/lib/fonts/{types,catalogue.json,catalogue,url,merge,validateKitFonts,index}.ts` (new), `scripts/refresh-google-fonts.mjs` (new), `src/app/api/fonts/route.ts` (new), `src/app/api/admin/brandkits/route.ts`, `src/app/api/admin/brandkits/[id]/route.ts`, `src/mcp/server.ts`, `src/mcp/tools/brandkit.ts`, `tests/unit/{fontsMerge,fontsUrl,fontsValidate,fontsRoute}.test.ts`
  - Estimate: large
  - Kind: impl
  - Model: sonnet
  - Depends: T5
  - Notes:
    - **Covers:** FR-16 to FR-20 and the FR-21 validation; AC-14 to AC-17; NFR-09.
    - **Evidence first (AC-16).** Fetch the current URL for Instrument Serif (`googleFontsUrl` as it is today) and record the HTTP status, then do the same for the new URL. One manual `curl -s -o /dev/null -w '%{http_code}'` each.
    - Run the refresh script once to create `catalogue.json` (spec A1: if the fetch fails, stop and report). Check its size (NFR-09).
    - `googleFonts.ts` stays until T8 (the picker still imports it); T8 deletes it.
    - `catalogue.ts` starts with `import 'server-only'`.
    - **Gate:** tsc, lint, unit.

- [x] `T7` — Script fonts, code injection, prompt version, the render font check, `renderNotes`, the font notice
  - Files: `prisma/schema.prisma`, `prisma/migrations/20261029120000_post_fonts/` (new), the down-script section B, `src/lib/fonts/{plan,inject}.ts` (new), `src/lib/brandkit/systemContext.ts`, `src/lib/agent/prompts/shared.ts`, `src/lib/agent/pathA.ts`, `src/lib/agent/pathB.ts`, `src/app/api/drafts/[id]/refine/route.ts`, `src/lib/renderer/puppeteer.ts`, `src/lib/drafts/revisions.ts`, `src/lib/agent/generateDraft.ts`, `src/app/api/drafts/[id]/regenerate-design/route.ts`, every `currentRenderStamp` caller, `src/lib/drafts/fontNotice.ts` (new), `src/app/api/drafts/[id]/route.ts`, `src/app/(app)/drafts/[id]/page.tsx`, `src/app/api/admin/brandkits/[id]/route.ts` (`scriptFonts`), `tests/unit/{applyPostFonts,fontInjectionSites,renderStampWriters,fontNotice}.test.ts`, `tests/render/postFonts.test.ts` (new) and fixtures
  - Estimate: large
  - Kind: impl
  - Model: opus
  - Depends: T6
  - Notes:
    - **Covers:** FR-21 to FR-24; AC-19 to AC-23 (AC-22 E2E in T8); NFR-03, NFR-06.
    - Design §5.3 to §5.6.
    - The migration holds `BrandKit.scriptFonts`, `Draft.renderNotes`, `DraftRevision.renderNotes` and `BrandKitPrompt.previousFonts` (T12 uses the last).
    - Bump `PROMPT_VERSION_BASE` once, with a history line. Update every test that pins the prompt version, and list them.
    - AC-21 render fixture: serve a small Sinhala-capable font as a `data:` URI in an `@font-face` (no network). Assert through `document.fonts` which face painted.
    - Model is opus because the CSS tokenizer and the stamp ripple are the riskiest edits in the change.
    - **Gate:** tsc, lint, unit, `npm run test:render`, `npm run test:upgrade`.

- [x] `T8` — The searchable picker, the Sinhala picker, the snapshot date; delete the list of 100; §AJ
  - Files: `src/components/admin/brandkits/FontEditor.tsx`, `src/components/admin/brandkits/ScriptFontPicker.tsx` (new), `src/components/admin/brandkits/KitDetail.tsx`, `src/components/admin/brandkits/googleFonts.ts` (deleted), `tests/unit/uiTokenGuard.test.ts` (exemption removed), `src/app/api/admin/brandkits/[id]/route.ts` (GET `fontCatalogueDate`), `tests/e2e/post-fonts.test.ts` (new), `docs/e2e-test-plan.md` (§AJ)
  - Estimate: medium
  - Kind: impl
  - Model: sonnet
  - Depends: T7
  - Notes:
    - **Covers:** FR-18 (the deletion), FR-25; AC-18, AC-22, AC-23 (E2E part), AC-24.
    - TC-PF-01 to TC-PF-08: search "instr" and save Instrument Serif; the Sinhala picker lists only Sinhala families and saves; the date shows; an unknown family is refused on save (API); generation with a Sinhala kit stores the marked link and the stack entry; `__MOCK_FONT_MISSING__` shows the notice; clearing the Sinhala font works; a FONT artifact entry survives a save.
    - AC-18: paste the grep showing no other font list.
    - **Gate:** tsc, lint, unit, §AJ plus the brand-kit suites.

### Wave 5: E, typography and the second host

- [x] `T9` — Typography entries and the coded kit rules
  - Files: `src/lib/designData/authoring/{entries,measurable,typography}.ts`, `src/app/api/admin/brandkits/[id]/route.ts` (GET `typographyFindings`), `src/components/admin/brandkits/FontEditor.tsx` or `KitDetail.tsx` (warnings), `src/lib/testHooks.ts` (if a mock replacement needs it), `tests/unit/{designAuthoring,kitTypography,designDetect}.test.ts`
  - Estimate: medium
  - Kind: impl
  - Model: sonnet
  - Depends: T8
  - Notes:
    - **Covers:** FR-26, FR-27; AC-25, AC-26; NFR-03 (no generation file changes: `generationUntouched.test.ts` still passes).
    - The `source` text of each entry is copied from spec FR-26. Do not invent other citations.
    - Templates name roles only; `containsForbidden` must hold.
    - **Gate:** tsc, lint, unit, the kit-upgrade E2E (§AC).

- [x] `T10` — `runRuleUpgrade`, the briefing upgrade route, the panel in the briefing editor; §AK
  - Files: `src/lib/kitUpgrade/upgrade.ts`, `src/app/api/admin/brandkits/[id]/prompts/upgrade/route.ts`, `src/app/api/campaigns/[id]/briefing/upgrade/route.ts` (new), `src/components/campaigns/CampaignBriefingSection.tsx`, `src/components/textUpgrade/RuleReviewPanel.tsx`, `tests/unit/{ruleUpgrade,briefingUpgradeRoute}.test.ts`, `tests/e2e/briefing-upgrade.test.ts` (new), `docs/e2e-test-plan.md` (§AK)
  - Estimate: medium
  - Kind: impl
  - Model: sonnet
  - Depends: T9
  - Notes:
    - **Covers:** FR-28, FR-29; AC-27, AC-28.
    - TC-BU-01 to TC-BU-05: flag and upgrade; accept edits the textarea, and Save makes a version; editor 403; stale base 409; the recorder label `briefing-upgrade` on the briefing surface.
    - **Gate:** tsc, lint, unit, §AK and §AC.

### Wave 6: F, the assistants

- [x] `T11` — The briefing assistant schedule with post styles; part of §AL
  - Files: `src/lib/campaign/briefingAssistant.ts`, `src/components/campaigns/BriefingAssistantPanel.tsx`, `src/lib/testHooks.ts` (mock reply), `tests/unit/schedulePlan.test.ts` (new), `tests/e2e/assistants-031.test.ts` (new), `docs/e2e-test-plan.md` (§AL)
  - Estimate: medium
  - Kind: impl
  - Model: sonnet
  - Depends: T10
  - Notes:
    - **Covers:** FR-30 to FR-32; AC-29, AC-30; W-13.
    - Import post styles only through `@/lib/postStyles` (the boundary test).
    - TC-AS-01 to TC-AS-03.
    - **Gate:** tsc, lint, unit, §AL and the briefing-assistant suite.

- [x] `T12` — The brand-kit assistant fonts, the apply route, `previousFonts` in History; the rest of §AL
  - Files: `src/lib/brandkit/assistant.ts`, `src/components/admin/brandkits/BrandKitAssistantPanel.tsx`, `src/app/api/admin/brandkits/[id]/assistant/apply/route.ts` (new), `src/app/api/admin/brandkits/[id]/prompts/route.ts` (extract `createPromptVersion`), `src/components/admin/brandkits/PromptSection.tsx`, `src/lib/testHooks.ts`, `tests/unit/{brandKitBlock,brandKitApply}.test.ts`, `tests/e2e/assistants-031.test.ts`
  - Estimate: medium
  - Kind: impl
  - Model: sonnet
  - Depends: T11
  - Notes:
    - **Covers:** FR-33, FR-34; AC-31, AC-32; W-16.
    - The route validates through `validateKitFonts` and `validateScriptFonts` (T6). It is all or nothing.
    - TC-AS-04 to TC-AS-06.
    - **Gate:** tsc, lint, unit, §AL and the brand-kit assistant suite.

### Wave 7: A, Apply to image

- [x] `T13` — The pure module and the re-measure gate
  - Files: `package.json` and `package-lock.json` (`parse5`), `src/lib/applyText/{vocab,candidates,splice,noticeText,index}.ts` (new), `.specclaw/changes/031-v2-final-polish/measure/` (new: script and results), `tests/unit/{applyTextCandidates,applyTextSplice}.test.ts`
  - Estimate: medium
  - Kind: impl
  - Model: sonnet
  - Depends: T12
  - Notes:
    - **Covers:** FR-35 to FR-39; AC-33 to AC-36.
    - Install `parse5` (exact version pinned); a new dependency is approved by the proposal.
    - **The re-measure:**
      - It reads the 35 Path B drafts' `htmlContent` and `headline` from `bistec_studio_op1`, read-only, with an explicit `DATABASE_URL` and a `SELECT` only. It also covers the seeded Path A templates filled with their own sample headline (spec A5).
      - It runs `precheckApply(html, headline, headline + ' (new)')`.
      - It reports: the rate with exactly one safe candidate; the share with child elements; a count per failure.
      - Write `measure/results.md`, which states the 35-draft sample is non-representative.
      - Set `APPLY_TEXT_BETA` from the rate against 80%.
    - **Gate:** tsc, lint, unit.

- [x] `T14` — The in-render Apply check, `acceptRender` on `commitDraftRevision`, render fixtures
  - Files: `src/lib/renderer/puppeteer.ts`, `src/lib/drafts/revisions.ts`, `src/lib/renderedText/mockCheck.ts`, `src/lib/testHooks.ts`, `tests/unit/{renderPost,commitAcceptRender}.test.ts`, `tests/render/applyCheck.test.ts` (new) and fixtures
  - Estimate: medium
  - Kind: impl
  - Model: sonnet
  - Depends: T13
  - Notes:
    - **Covers:** FR-40; AC-37.
    - Design §8.2. The `absent` texts reuse `collectHeadlineFacts` and `evaluateHeadlineFacts`; do not write a second collector.
    - **Gate:** tsc, lint, unit, `npm run test:render`.

- [x] `T15` — The `apply-text` action, migration, claim co-changes, event, UI; §AM; full E2E
  - Files: `prisma/schema.prisma`, `prisma/migrations/20261030120000_apply_text_action/` (new), the down-script section A, `src/app/api/drafts/[id]/apply-text/route.ts` (new), `src/lib/applyText/track.ts` (new), `src/lib/analytics/catalogue.ts`, `src/lib/api-types.ts`, `src/components/drafts/HeadlineImageNotice.tsx`, `src/components/drafts/HeadlinePanel.tsx` (W-19 Apply clause), `src/app/(app)/drafts/[id]/page.tsx`, `tests/unit/{applyTextRoute,applyTextCoverage}.test.ts`, `tests/e2e/apply-text.test.ts` (new), `docs/e2e-test-plan.md` (§AM)
  - Estimate: large
  - Kind: impl
  - Model: sonnet
  - Depends: T14
  - Notes:
    - **Covers:** FR-41 to FR-45; AC-38 to AC-40; NFR-05.
    - Record `SELECT version()` of the test database in the report (design §13).
    - TC-AP-01 to TC-AP-10:
      - apply on stale (confirm text, badge cleared, stamp verified, new revision);
      - Undo restores HTML byte for byte;
      - each of the three sentinels;
      - no button on fresh, unconfirmed or unknown;
      - 409 during Apply;
      - a 422 refusal toast (`ambiguous`, from a seeded twice-shown headline);
      - the events read through the analytics seam;
      - the Beta chip when `APPLY_TEXT_BETA`.
    - **Full clean mock E2E.**
    - **Gate:** tsc, lint, unit, render, full clean mock E2E, `npm run test:upgrade`.

### Wave 8: D, Spotlight SQUARE v2

- [x] `T16` — The busy evidence, the v2 contract, candidate fixtures, the probe version, the OP-031 runner
  - Files: `scripts/look-check/recheck.ts`, `.specclaw/changes/031-v2-final-polish/look-check/evidence.md` (new), `src/lib/designData/composition.ts`, `src/lib/designData/plan.ts`, `src/app/api/admin/look-probe/route.ts`, `scripts/look-check/{lookCheck,run-look-check}.mjs`, `tests/render/lookFixtureTable.ts`, `tests/render/lookFixtures.ts`, `tests/unit/{lookDataset,planOverrideBoundary,op031Verdict,lookCheck}.test.ts`
  - Estimate: medium
  - Kind: impl
  - Model: sonnet
  - Depends: T15
  - Notes:
    - **Covers:** FR-46 to FR-49; AC-41 to AC-44.
    - Evidence first: run `recheck.ts --regions` on both OP-028 SQUARE renders. Choose the v2 SQUARE geometry from it. The spec's default applies only if the bands are busy at their inner edge; otherwise state the chosen change and why.
    - `current` stays 1. The v1 hashes must not change.
    - Dry-run the runner (`--dry-run`) against a fake out-dir in the scratchpad to show the cap and the slot set.
    - **Gate:** tsc, lint, unit, `npm run test:render`.

- [x] `T17` — OP-031, the operator real-image check (on the user's go)
  - Files: `.specclaw/changes/031-v2-final-polish/look-check/{ledger.jsonl,results.json,renders/}`
  - Estimate: small
  - Kind: config
  - Model: orchestrator (no subagent)
  - Depends: T16
  - Notes:
    - **Covers:** FR-49, FR-50 (the result); AC-45 (the run); NFR-01.
    - **Ask the user before any call:** show the cap (4), the database (`bistec_studio_op1`) and the account.
    - Apply the 031 migrations to `bistec_studio_op1` with an explicit `DATABASE_URL`, and confirm with the user first.
    - Start the :3002 server from the OP-1 env file (CLAUDE.md gotchas).
    - Run `--probe --slot-set op031`. The user gives each verdict on the render. Stop as soon as the verdict is decided.
    - Commit the ledger and the results; renders stay gitignored.

- [x] `T18` — Apply the OP-031 result
  - Files: on a pass, `src/lib/designData/composition.ts`, `tests/render/lookFixtureTable.ts`, `src/lib/postStyles/styles.ts` and its hash table, `tests/unit/{lookDataset,lookCheckResults,lookFixtureCompleteness}.test.ts`, and the E2E cases pinning Promotion and Milestone defaults; on a fail, `tests/unit/lookCheckResults.test.ts` only
  - Estimate: small
  - Kind: impl
  - Model: sonnet
  - Depends: T17
  - Notes:
    - **Covers:** FR-50; AC-45.
    - Design §9.4. On a pass, run the post-styles E2E and every test that pins `+ps10`, and list them.
    - **Gate:** tsc, lint, unit, render; on a pass also `post-styles` and `image-looks` E2E.

### Wave 9: Close

- [x] `T19` — Docs, screenshots, the W table, the full gate and CI
  - Files: `docs/handoff.md`, `CLAUDE.md`, `docs/e2e-test-plan.md`, `.specclaw/ROADMAP.md`, `docs/ui-reference/screen-light.png`, `docs/ui-reference/screen-dark.png`, `reports/T3.md` (owned rows filled), `docs/cold-start.md` (the font refresh operator step)
  - Estimate: medium
  - Kind: docs
  - Model: haiku
  - Depends: T18
  - Notes:
    - **Covers:** FR-04; AC-05 (completed), AC-46.
    - The handoff 031 section:
      - the groups as built;
      - the three migrations, each with a "Check before the merge" line;
      - the release notes:
        - a personal Gemini key is mock-verified only;
        - a rollback deletes non-OpenAI personal keys;
        - the font snapshot date and the refresh step;
        - the Apply rate and whether it is beta;
        - the OP-031 verdict;
      - the known limits L1 to L5.
    - CLAUDE.md: a new top entry, and architecture bullets for fonts, the image generation key, Apply and the wording guard.
    - Screenshots: 011 T13's method (spec FR-04), against a mock server.
    - **Full clean mock E2E,** `test:upgrade`, then push `v2` and check `gh run list --branch v2` until green.
    - **Gate:** AC-46.
