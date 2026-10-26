# Tasks: Post styles, phase a

**Change:** 027-post-styles · **Size:** architectural
**Created:** 2026-10-24
**Total Tasks:** 8

## Summary

This change has **8 tasks in 8 waves**. Each depends on the one before it, so there is no parallel work:

1. the columns, the migration and the post-style dataset, with its guard tests;
2. the resolver, the stamp and the prompt text (pure);
3. the facts check: the pure extractor and comparison, the sources loader, the refresh writer and the seeded corpus;
4. generation wiring: the prompts, the stamps on every writer, the derived prompt versions, the check's write points and the mock seams;
5. the surfaces and the scheduler: briefs, queue, campaign, MCP and ACP inputs, the HOLD downgrade, the readers of the result, and E2E section AE (server cases);
6. the UI: the wizard picker (on step 1, Size & Design), the campaign default, the queue modal and held line, the draft notice, and E2E section AE (UI cases);
7. analytics and the insights "Post styles" section, with its E2E cases;
8. the docs, the full gate and CI.

This is phase a. Phase b (STORY layouts, the five new looks, pixel-check changes, the real-model look check) is a separate proposal and is not in any task. Waves 3 and 4 could be swapped (the check does not need the prompts), but 4 stamps the check's write points, so the order stays.

## Process / Gates

- **One task at a time:**
  1. an implementer subagent does the task;
  2. `specclaw:code-reviewer` reviews it;
  3. the orchestrator re-runs tsc, `npm run lint` and `npm run test:unit`, then commits.

  Never run two implementers in this checkout.

- **No real model calls.** Every test runs on the `MOCK_AI` seam or faked model functions. The optional real-model step (OP-1) is not a task.
- **The databases are shared.** Never run a prisma or DB command without an explicit `DATABASE_URL` that points at `bistec_studio_test` or a named scratch database (for this change, `bistec_studio_027`). `bistec_studio` and `bistec_studio_op1` are never touched. Use `export MSYS_NO_PATHCONV=1` before any docker command with a container path.
- **The OP-1 dev server may be running on :3002** (it uses `.next`). Before any build or E2E run, ask the orchestrator; do not kill it yourself.
- **Read first:** `docs/ui-reference/DESIGN_SYSTEM.md` before any UI task (T5's queue line, T6, T7). Reuse `src/components/ui/` atoms; no raw colour; no new `// ui-exception`.
- **A `page.waitForResponse` must be created before the action that triggers the request** (the 023 TC-HB-01 lesson). Applies to every wizard case that reads a request or response.
- **Baselines (006 verify, at the base commit):** unit 3283/3283; render 47/47; lint 0 errors / 7 warnings; full clean mock E2E 473 passed / 3 skipped / 0 failed / 1 flaky. A task may add cases; it may not lower a pass count or add a lint warning.
- **Base commit for the diff checks:** `e283005` (`git rev-parse --short HEAD` at planning).
- **Hard rule for every task:** `git diff --name-only e283005 -- src/lib/designData src/lib/renderer src/lib/agent/claudeCli.ts src/lib/scheduler/heartbeatStatus.ts src/app/api/scheduler/status/route.ts` lists nothing. No task edits `src/lib/designData`; the boundary tests are extended from `tests/unit`.

## Tasks

### Wave 1: Columns and dataset

- [x] `T1` — The seven columns, the migration, the down script and the post-style dataset
  - Files: `prisma/schema.prisma`, `prisma/migrations/20261025120000_post_styles/migration.sql` (new), `prisma/rollback/027-post-styles.down.sql` (new), `src/lib/postStyles/{types,styles,index}.ts` (new), `tests/unit/{postStylesDataset,postStylesBoundary}.test.ts` (new), `tests/unit/designDataBoundary.test.ts` (walk the two new directories for the purity rule; the authoring rule is unchanged)
  - Estimate: medium
  - Kind: migration
  - Depends: none
  - Notes:
    - **Covers:** FR-01, FR-02, FR-03, NFR-03, NFR-10 (the purity half); AC-01, AC-02, AC-18 (purity, and `designData` never imports `postStyles`).
    - The dataset text is spec FR-03 verbatim. The key-rule header, the deep freeze, `POST_STYLES_REVISION`, `activeStyles`, `getStyle`, `isStyleKey` and the non-production default-image-style assertion are in `styles.ts`; `index.ts` does **not** re-export the raw `styles` record. The hash table is committed in the test (compute it once from the finished dataset).
    - The hash guard is a pure function over a dataset, so the "edited released version fails" case runs on a doctored copy, not by editing the source.
    - **Migration proof on a scratch database** `bistec_studio_027` (explicit `DATABASE_URL`): deploy, run the down script, re-apply, `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <scratch2> --exit-code` clean, drop the scratch databases. Record it in `reports/T1.md`.
    - A unit check (type-level or generated-client shape) that every new column is optional on `Brief`, `ScheduledGeneration`, `Campaign`, `Draft` and `DraftRevision` create inputs (AC-01 last sentence).
    - **Gate:** tsc, lint, unit (3283 plus the new cases), `git diff --name-only e283005 -- prisma/migrations` lists only the new migration; `npx prisma generate` with the scratch `DATABASE_URL`.

### Wave 2: Resolver, stamp, prompt text

- [x] `T2` — `resolvePostStyle`, the stamp schema and the checklist prompt text
  - Files: `src/lib/postStyles/{resolve,stamp,promptText}.ts` (new), `src/lib/postStyles/{types,index}.ts` (`matchToneOption`, exports), `src/components/brief/constants.ts` (`TONE_OPTIONS` built from `TONE_KEYS`; labels unchanged), `tests/unit/{postStylesResolve,postStylesStamp,postStylesPrompts}.test.ts` (new; `postStylesBoundary` extended with the one-resolver guard)
  - Estimate: medium
  - Kind: impl
  - Depends: T1
  - Notes:
    - **Covers:** FR-04 (including the legacy-goal mapping), FR-05 (the schema, the parse and `rulesAtStamp`; the derived prompt versions land in T4), FR-09 (the text function), NFR-02; AC-03, AC-04 (schema half), AC-08 (the text half), AC-18 (the one-resolver guard).
    - Follow design section 4 exactly: the `Surface` set, `UNATTENDED = new Set(['queue','mcp','acp'])`, `supportsSize` through `imageStyleOptions` from `designData` (read-only import), the unknown key and unknown campaign default both `UNKNOWN_POST_STYLE`, `matchToneOption` moved from the wizard unchanged in behaviour.
    - The AC-03 table runs once per surface; add the retired-key case with a fixture dataset (the real dataset has no retired style).
    - `promptText.ts` exact text is pinned in a test; the preamble string is a single exported constant.
    - **Legacy goal (decided 2026-10-24):** `resolvePostStyle` takes `legacyGoal` and owns the one mapping table (`hiring` and `announcement` only); unit cases: `hiring`, `Hiring`, `ANNOUNCEMENT` map; `awareness`, `engagement`, `conversion` and free text fall through to the campaign default then `general`; an explicit style beats a conflicting `legacyGoal`; an unknown explicit key stays `UNKNOWN_POST_STYLE`.
    - The one-resolver guard fails if any file under `src/` outside `src/lib/postStyles/` imports `postStyles/styles` or names a style key literal as an object key or `case` label; planted-fixture assertion, not an edit of a source file.
    - **Gate:** tsc, lint, unit.

### Wave 3: The facts check

- [x] `T3` — The extractor, the comparison, the sources loader, the refresh writer and the seeded corpus
  - Files: `src/lib/factsCheck/{types,normalize,extract,compare,sources,refresh,index}.ts` (new), `tests/unit/fixtures/factsCorpus.ts` (new), `tests/unit/{factsCheckExtract,factsCheckCompare,factsCheckCorpus,factsCheckRefresh}.test.ts` (new), `tests/unit/postStylesBoundary.test.ts` (the purity walk covers `src/lib/factsCheck` except `sources.ts` and `refresh.ts`)
  - Estimate: large
  - Kind: impl
  - Depends: T2
  - Notes:
    - **Covers:** FR-10, FR-11 (the loader and `refreshFactsCheck`; the write points are wired in T4), NFR-05, NFR-06; AC-09, AC-10, AC-11 (the unit halves that need no wiring), AC-19.
    - Follow design section 6: the ordered, consuming patterns; unicode boundaries with the `u` flag; kind-strict support with the `num` widening; the exemptions as data; a single try/catch returning `status: 'error'`; the cap of 20 and the 40-character `value`; `redactText` on the error reason.
    - **The corpus** (`factsCorpus.ts`, at least 24 cases): each is `{ name, sources, texts: [{ where, text }], expected: [{ where, key }] }`. It must cover each family in the headline and in each caption; a value supported by the topic, the description, the briefing, the kit voice text and a campaign document; each exemption; Sinhala, Arabic-Indic and fullwidth digits; a phone present and absent; a numeric date written the other way (flags); `May` as a verb (no match). The corpus test asserts exact set equality per case (AC-10). Write the corpus **before** tuning the patterns and do not loosen an expectation to make a pattern pass without noting why in `reports/T3.md`.
    - **Timing test:** the maximum input (200 000 characters of sources, three texts of 20 000, pathological repeats such as `1,1,1,…` and `((((((`) finishes under 50 ms (assert a generous 150 ms in CI to avoid a flaky bound; record the measured time).
    - `factsCheckRefresh` uses a fake prisma: READY rows only, a PENDING row skipped, a failed write logs and stores `error` when it can, the return of the caller's write unchanged. No real DB.
    - **Gate:** tsc, lint, unit.

### Wave 4: Generation wiring

- [x] `T4` — Prompts, stamps on every writer, derived prompt versions, the check's write points and the mock seams
  - Files: `src/lib/agent/{briefInput,generateDraft,pathA,pathB,background}.ts`, `src/lib/agent/prompts/{caption,pathA,pathB,background,refine,shared}.ts`, `src/providers/interfaces/CopyProvider.ts`, `src/lib/drafts/revisions.ts`, `src/lib/captions/store.ts`, `src/app/api/drafts/[id]/{regenerate-design,regenerate-copy,refine,inline-edit}/route.ts`, `src/app/api/drafts/[id]/rejected/[revisionId]/adopt/route.ts`, `src/app/api/drafts/[id]/revisions/[rev]/restore/route.ts`, `src/app/api/generate/copy/route.ts`, `src/lib/testHooks.ts`, `tests/unit/{postStylesPrompts,postStylesStamp,factsCheckRefresh}.test.ts` (extended), `tests/unit/postStylesWriters.test.ts` (new); existing unit tests whose fakes build a `brief` or `draft` (adapt, never delete)
  - Estimate: large
  - Kind: impl
  - Depends: T3
  - Notes:
    - **Covers:** FR-05 (the derived versions and every writer), FR-09, FR-11 (the write points), FR-15 (the seams), FR-16 (the golden half), NFR-01, NFR-04; AC-04, AC-08, AC-11, AC-15, AC-16 (prompt half), AC-17.
    - `PROMPT_VERSION` and `CAPTION_PROMPT_VERSION` become `` `2026-10-25.1+ps${POST_STYLES_REVISION}` ``. `currentRenderStamp` takes `postStyle` as a required third parameter; every carry-forward writer reads `draftPostStyleStamp(draft)`. Regenerate copy writes `Draft.postStyle` in its settle transaction.
    - `buildBriefInput` sets `captionRules`; `imageRulesFor(brief)` feeds Path A, Path B, the background decision and regenerate design; refine uses `rulesAtStamp`. An unresolvable stored key throws `Post style "x" is not available` at `buildBriefInput` (fail closed); an unresolvable **stamp** passes no rules and warns once.
    - **The golden test:** capture the pre-change prompt text of each builder for a null-style brief at the base commit (a fixture of strings) and assert byte equality after the change, apart from the version string.
    - Sync path: `checkFacts` runs inside `generateDraftForBriefInner` and its result goes in the `tx.draft.create` data; the interactive writers (`saveGenerationCaptions`, `settleCaptionAction`, `saveCaptionEdit`, `saveHeadlineEdit`) call `refreshFactsCheck` after their write. The routes that call `saveCaptionEdit` and `saveHeadlineEdit` do not change shape.
    - Mock seams: the five sentinels and `__MOCK_FACT_ERROR__` per design section 13; a topic with no sentinel is byte-identical to today's reply (unit).
    - **Do not** add a `createMessage`, `runClaudeCli` or `recordModelCall` call site: `git grep -c` against `e283005` (record the count in `reports/T4.md`).
    - **Gate:** tsc, lint, unit, `npm run build` (then `rm -rf .next`; check with the orchestrator about :3002 first). Then the targeted E2E suites for the touched paths against a fresh `:3001` server and test DB: `path-a`, `path-b`, `captions`, `async-actions`, `async-generation`, `agui-refinement`, `refine-not-applied`, `draft-inline-edit`, `rejected-revisions`, `model-selection`, `hero-image`, `campaign-scheduling` (check exact file names) — all green, none edited unless an assertion reads a changed prompt-version string.
    - **Check at the end:** `git diff --name-only e283005 -- src/lib/designData src/lib/renderer src/lib/agent/claudeCli.ts` lists nothing; the verifier prompt golden test passes unchanged.

### Wave 5: Surfaces and scheduler

- [x] `T5` — Briefs, queue, campaign, MCP and ACP inputs; the HOLD downgrade; the draft and tool readers; E2E §AE (server cases)
  - Files: `src/app/api/briefs/route.ts`, `src/app/api/campaigns/{route,[id]/route}.ts`, `src/app/api/campaigns/[id]/queue/{route,[gid]/route,batch/route,[gid]/rerun/route}.ts`, `src/lib/campaign/queue.ts`, `src/lib/scheduler/generationRunner.ts`, `src/mcp/{server.ts,tools/generate.ts}`, `src/acp/agent.ts`, `src/app/api/acp/run/route.ts`, `src/app/api/drafts/[id]/route.ts`, `src/lib/api-types.ts`, `tests/unit/{postStylesApi,postStylesHold,mcpGetDraft}.test.ts`, `tests/e2e/post-styles.test.ts` (new)
  - Estimate: large
  - Kind: impl
  - Depends: T4
  - Notes:
    - **Covers:** FR-06 (the legacy goal passed as `legacyGoal`; MCP/ACP descriptions say it picks a style only when none is given), FR-08 (the API half), FR-12, FR-13 (the API, MCP and ACP half), FR-16 (the E2E half), NFR-04, NFR-11; AC-05, AC-07 (API half), AC-12, AC-13 (API half), AC-16, AC-22 (a, b).
    - Follow design sections 8 and 10: the briefs route's removed `goal` and `tone` required checks and the `UNKNOWN_POST_STYLE` 400; `resolveEntryStyle` shared by the three queue routes; `heldReasonFor` pure and unit-tested; the gate at the `executePostAction` call site (that function and its 023 tests are unchanged); `ensureBrief` fails with the named error on `ok:false`; the rerun clears `heldReason`; `generatePost` returns `postStyle` and `factsCheck`; ACP manifest version `1.2.0`.
    - **E2E §AE, server cases** (serial, skip without `MOCK_AI`): the inputs (briefs with and without `postStyle`, unknown 400, legacy body 201, the queue and batch validation with the entry index, campaign PATCH admin 200 and editor 403, MCP and ACP with and without a style and the unknown-key error); the seeded facts set generated through the API (a price, a percentage, a date, a number, a headline-only value, one brief each; clean briefs with the value stated in the topic, the description, the briefing and a campaign document; an exemptions brief) and the stored `factsCheck` read back through `GET /api/drafts/[id]` equal to the expected sets; the scheduler cases through `POST /api/test/generation-tick` (SCHEDULE_PUBLISH and PUBLISH_NOW held, no Post row, `heldReason`; the clean pair publishes; HOLD unaffected; the forced-error entry held; rerun clears; an entry with an unknown stored key, seeded through the DB seam the 023 suite uses, fails with the named reason and creates no draft and no Post).
    - Run `post-styles.test.ts` three times alone against a fresh `:3001` server (stop stray node processes except the :3002 OP-1 server, `rm -rf .next`, recreate the test DB).
    - **Gate:** tsc, lint, unit, `npm run build`, the E2E above, plus the targeted suites for the touched routes: `campaign-scheduling`, `briefing-assistant`, `acp`, `surfaces`, `team-isolation`, `brief-draft-recovery` (check names).

### Wave 6: UI

- [x] `T6` — The wizard picker (step 1, before the size and design choices), the campaign default, the queue modal and held line, the draft notice; E2E §AE (UI cases)
  - Files: `src/components/brief/{PostStylePicker,ContentStep,ReviewStep,SizeDesignStep,useBriefWizard}.ts(x)`, `src/app/(app)/brief/page.tsx`, `src/lib/brief/briefDraftPayload.ts`, `src/app/(app)/campaigns/page.tsx`, `src/app/(app)/campaigns/[id]/page.tsx`, `src/components/campaigns/{QueueEntryModal,ScheduledQueueSection}.tsx`, `src/components/drafts/{FactsCheckNotice,GeneratedWith}.tsx`, `src/app/(app)/drafts/[id]/page.tsx`, `tests/unit/{briefDraftPayload,postStylesWizard}.test.ts`, `tests/e2e/post-styles.test.ts` (UI cases)
  - Estimate: large
  - Kind: impl
  - Depends: T5
  - Notes:
    - **Covers:** FR-07, FR-08 (the UI half), FR-12 (the queue line), FR-13 (the notice and the style line), NFR-07; AC-06, AC-07 (UI half), AC-13 (UI half), AC-16 (the payload half), AC-20.
    - **Read DESIGN_SYSTEM.md first.** The picker is a radio-card group with keyboard navigation like the size picker; the notice is `Notice tone="warning"` with `role="status"`; the queue line is amber text with the values in its `title`.
    - The wizard logic is pure where it can be: a small `wizardStyleState` reducer (or functions) in `src/lib/brief/` that takes the touched flags and returns tone and image style through `resolvePostStyle`, unit-tested (`postStylesWizard`) before the component uses it. A touched field is never overwritten; selecting a campaign replaces the hook's own tone matching.
    - `briefDraftPayload`: `postStyle` optional, `goal` optional with an `awareness` read default; an old row with `goal` parses and resumes as `general`; an unknown stored key opens as `general`, a retired one stays.
    - **Picker placement (decided 2026-10-24):** `PostStylePicker` is rendered by `SizeDesignStep` above the size and design choices; the Goal select leaves `ContentStep`. The image-style picker on step 1 is pre-filled from the style (untouched rule, re-resolved on style, size and path changes). **Existing wizard E2E suites that step through step 1 may need their interaction updated** (General is preselected, so most keep working); update them in this task and list each in `reports/T6.md`.
    - **E2E §AE, UI cases:** the picker on step 1 above the size choices and no Goal select on the Content step; the image-style picker pre-filled on the same step; the pre-fill and the touched rule; the campaign default selected; the Review rows; 9:16 and Path A show Classic; the request body carries `postStyle`, and `tone`/`imageStyle` only when touched (the response listener is created **before** the click); resume with a stored and an unknown key; the notice on the seeded flagged briefs and none on the clean ones; the notice never disables Publish; the held line in the queue table; the campaign default select (admin) and its absence for an editor; the queue modal sends `postStyle`.
    - **Screenshots** of step 1 with the picker, the Content step, the Review step, the notice and the queue line at 390 px and 1440 px, light and dark, into the gitignored `ui-captures/027/`; look at them; note the result in `reports/T6.md`.
    - Run `post-styles.test.ts` three times alone.
    - **Gate:** tsc, lint, unit, build, the E2E above, plus the suites that drive the wizard and the draft page: `path-a`, `path-b`, `brief-draft-recovery`, `analytics` (wizard events), `hero-image`, `ui`, `a11y`, `create-post-button`, `captions` (check names). `uiTokenGuard.test.ts` passes with no new `// ui-exception`.

### Wave 7: Analytics and the insights section

- [x] `T7` — The catalogue fields, the emitters, `queries.postStyles` and the "Post styles" section; E2E §AE (analytics cases)
  - Files: `src/lib/analytics/{catalogue,queries}.ts`, `src/lib/agent/generateDraft.ts` (the `generation.finished` fields), `src/lib/scheduler/generationRunner.ts` (the settle fields), `src/app/api/briefs/route.ts` (the `brief.submitted` field), `src/components/admin/insights/sections.tsx`, `src/app/(app)/admin/insights/page.tsx`, `tests/unit/{postStylesAnalytics,analyticsCoverage,analyticsQueries}.test.ts`, `tests/e2e/post-styles.test.ts` and `tests/e2e/analytics.test.ts` (extended)
  - Estimate: medium
  - Kind: impl
  - Depends: T6
  - Notes:
    - **Covers:** FR-14, NFR-05; AC-14, AC-22 (c).
    - Additive optional fields only, no `schemaVersion` bump; `POST_STYLE_KEYS` imported from `postStyles` (the coverage test is extended to fail on a copied list). The interactive `generation.finished` is emitted after `refreshFactsCheck`, so it carries the status; the sync path carries it from the check in hand.
    - `shapePostStyles` is pure: one row per dataset style (zeros for unchosen), `flagRate = ratio(flagged, generations)`. `queries.ts` uses tagged-template `$queryRaw` only.
    - Reuse `InsightSection`, `DataTable`, `RateBar`; no raw colour. Super-admin gate unchanged.
    - **E2E:** seeded events through the 006 seam; every figure in the section equals a hand count; an unchosen style shows zeros; no event payload from the suite contains a caption, brief text or flagged value (assert on every event collected); editors and team admins stay gated.
    - Screenshot of the section at 390 px and 1440 px, light and dark, into `ui-captures/027/`; note the result in `reports/T7.md`.
    - **Gate:** tsc, lint, unit, build, `analytics.test.ts` and `post-styles.test.ts` (each three times alone).

### Wave 8: Docs and the gate

- [x] `T8` — The docs, the full gate and CI
  - Files: `docs/handoff.md`, `docs/e2e-test-plan.md`, `CLAUDE.md`, `.specclaw/ROADMAP.md`
  - Estimate: small
  - Kind: docs
  - Depends: T7
  - Notes:
    - **Covers:** AC-17, AC-21, AC-22, and the documentation of every FR.
    - **handoff:** the 027 section (the eight styles, where to edit one: add `versions[n+1]`, never edit a released version; the key rule; the resolver's one-place rule; the facts check, its exemptions, its limits L1 to L7 and how to read the "Post styles" flag rate; the held-entry semantics and where an operator sees `heldReason`; the optional OP-1 plan for a real-model check, with its bar left to the user) and a "Check before the merge" line: one additive migration `20261025120000_post_styles` with its down script; no env var; **release notes:** pre-027 queued auto-publish entries are gated by the facts check on their first run; a pre-027 `goal` sent without a `postStyle` now picks a style (`hiring` and `announcement` map to their styles, anything else to `general`) and is ignored when a style is sent; the ACP manifest is `1.2.0`; the Goal picker is gone and the Post style picker is on wizard step 1. **The A12 release note is mandatory and goes in the "Check before the merge" line itself:** queued auto-publish entries created before this change can be held by the facts check on their first run after deploy (the entry completes with its draft and a `heldReason`, and nothing is published until a person publishes by hand). No blocking step. Also the note for 027b: a variant look key is `<base>-<variant>` (`product-showcase-light`).
    - **e2e-test-plan:** section AE (TC-PS-…), an AC-to-case table, the seams and their gates.
    - **CLAUDE.md:** the top entry (027 state, gates, run IDs; next is 025 after OP-1, then the stale-headline badge, and 027b as a proposal), a "Post styles (027)" note under "Architecture decisions to remember" (the sibling module, the one resolver and its surfaces, the stamp and derived prompt versions, the facts check and the HOLD rule, the key rule, goal as a snapshot), and the migration line.
    - **ROADMAP:** the 027 row; 027b as a proposal.
    - **Full gate:** stop stray node processes (ask about :3002), `rm -rf .next`, drop and recreate `bistec_studio_test`, then `npm run test:e2e:serve` and `npm run test:e2e:mock` (0 failed, 0 flaky against 473/3/0/1 plus section AE; wait for `MOCK_EXIT`), tsc, lint, unit, `npm run test:render`, `npm run build`, `npm run test:upgrade`, `rm -rf .next`. Re-run the AC-17 `git grep` count and the "must not change" `git diff`.
    - **Push `v2`** (never `main`) and watch `gh run list --branch v2` until green; record the run IDs.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
- `[>]` Deferred

## Open questions

None. Decided by the user on 2026-10-24: A3 (campaign documents are sources) and A4 (a year outside a copyright line is flagged unless a source states it), approved with the FR-03 text; FR-03 rule text and defaults (A1/A2, approved), A6 (picker on step 1), A7 (legacy goal maps to `hiring`, `announcement` or `general`) and A12 (the check runs on every generation; the release note is in T8).
