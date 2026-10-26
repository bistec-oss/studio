# Verification Report: 024-caption-credential-route

**Verified:** 2026-10-23
**Model:** Sonnet
**Verdict:** PASS (17/17 ACs)

The report is at HEAD `cd9d411`. The code commits are T1 `d772715`, T2 `d4d14f2` and T3 `03961b9`; T4 `cd9d411` changes docs and the gate. The verifier read the selector, the loader, the registry diff, the policy and picker diffs, the brief route and wizard diffs, the API route, the migration and the down script. It read the task reports, the reviews and the docs, and ran the scope diffs. It ran seven unit files (84/84 passed): the five new `captionRoute*` files, `modelArgParity` and `briefCopyProvider`. It ran no DB command, no E2E and no server. The lint, build, full unit, E2E, render and `test:upgrade` results come from the orchestrator's 2026-10-23 runs (`reports/T4.md`). CI for `cd9d411` was pending at the time of this report; the orchestrator appends the result.

## Acceptance Criteria

- ✅ **AC-01: the migration and the down script.**
  - `20261023120000_caption_route/migration.sql` is one `CREATE TYPE "CaptionRoute"`, one nullable `Team.captionRoute`, and two nullable `TEXT` columns (`Draft.headlineRoute`, `DraftCaption.route`). There is no default and no backfill. Its header says "Additive only" and names the down script.
  - `prisma/rollback/024-caption-credential-route.down.sql` drops the three columns and the type with `IF EXISTS`, and has the L24 `_prisma_migrations` delete for `20261023120000_caption_route`.
  - `git diff --name-only 6f62517 -- prisma/migrations` lists only the new migration (re-run by the verifier).
  - The scratch-database proof (deploy, down script, re-apply, `migrate diff --exit-code`, dropped DB) is in `reports/T1.md`. `test:upgrade` 3/3 PASS is in `reports/T4.md`.
- ✅ **AC-02: the selector, legacy table.**
  - `route.ts` `selectRoute`, `setting === null` branch: the row is the brief key's row, else the enabled default. `legacyRoute` maps `cli` to `CLI`, `anthropic` to `API_KEY` and anything else to `OTHER`. `isClaude` is `COPY_PROVIDER_FAMILY[name] !== 'other'`, so an unknown name stays Claude.
  - With no row, the order is: CLI mode gives `CLI`, a server key gives `SERVER_KEY`, else `NO_PROVIDER` with today's message text.
  - `tests/unit/captionRouteSelect.test.ts` passes (run by the verifier).
- ✅ **AC-03: chosen routes and fail-closed.**
  - `API_KEY` takes the anthropic rows only: the default, else the oldest (`oldestFirst`). Without one it returns `ROUTE_NOT_READY` with the route-named message. It never returns `SERVER_KEY`, `CLI` or `OTHER`.
  - `CLI` is ok only when `mode === 'cli'`, with no row consulted; in API mode it returns `ROUTE_NOT_READY`.
  - The brief key is never read on either chosen branch. The property check is in `captionRouteSelect.test.ts`.
- ✅ **AC-04: the resolver.**
  - `registry.ts` calls `loadCaptionRoute` first and throws `RouteNotReadyError` on a chosen not-ok decision, before the `MOCK_AI` branch.
  - A chosen `API_KEY` reads the one selected row's key (`findFirst({ id, teamId })`) and builds the provider from it. It never reaches `ClaudeCliCopyProvider` or `env.ANTHROPIC_API_KEY`.
  - A chosen `CLI` returns the CLI provider wrapped by `withRouteNamedCredentialError`, which rethrows `/no claude credential/i` as "Captions are set to the CLI route, but no Claude credential is available: …" with `cause`.
  - The log line is `route= chosen= team=`, with no key.
  - `claudeCli.ts` has an empty diff. The loader's `select` has no `encryptedApiKey`, asserted at `captionRouteResolve.test.ts:155-157`.
  - `copyProviderIsClaude` returns `decision.isClaude`, or `true` when the decision is not ok.
- ✅ **AC-05: the stamp.**
  - `CaptionReply.route` is set by each provider: CLI `'CLI'` (`claude-cli.ts:23`), Anthropic via its constructor (`'API_KEY'` default, `'SERVER_KEY'` for the server key), OpenAI `'OTHER'`, and the mock the decision's route.
  - `captionRowsFromFields` writes `route` beside `model` on a validated row and `null` on a failed one. `settleCaptionRow` writes it only with a stamp. `headlineStampFields` carries `headlineRoute`, and `ROW_SELECT` includes `route`.
  - `writeCaptions` logs `route=… model=…`.
  - `captionRouteStamp.test.ts` passes.
- ✅ **AC-06: the brief key.**
  - `resolveBriefCopyKey(…, routeChosen)` returns `{ key: 'cli', validateExists: false }` for a chosen route, in both modes. `canSubmitBrief` is still the negation of its error case.
  - `POST /api/briefs` returns `422 { code: 'CAPTION_ROUTE_NOT_READY' }` before any brief row is created. The wizard sends no key when a route is chosen.
  - `briefCopyProvider.test.ts` passes. E2E TC-ROUTE-05 is in the 431/3/0/0 run.
- ✅ **AC-07: the Opus gate.**
  - `resolveModel`: for `CAPTION`, `captionCredentialFor(teamId)` returns `'team'` when `Team.captionRoute === 'API_KEY'`, else the caller's own tier. Other surfaces are unchanged.
  - `loadModelsView` adds `captionCredential`. `pickerState` reads it only for the CAPTION surface, through `credentialFor` and `teamTokenNotice(…, surface)`.
  - `captionRouteGate.test.ts` passes. The `GET /api/models` field is covered by E2E TC-ROUTE-07.
- ✅ **AC-08: the seam.**
  - `ModelCallRecord.route` and `modelCallFor(…, route?)` are present, and every other caller records `null`.
  - The decision is computed before the `MOCK_AI` branch. A chosen not-ready route throws before the mock records anything. A never-chosen not-ok decision is ignored by the mock, with route `null`.
  - No new file under `src/app/api/test/`: the directory holds `generation-tick`, `model-calls`, `scheduler-tick` and `worker-heartbeat`, all earlier changes. TC-ROUTE-01 to 04 and 06 cover the behaviour.
- ✅ **AC-09: the API.**
  - `GET` uses `withTeamAuth` and `PUT` uses `withTeamAdmin`. The body schema is `z.object({ route: z.enum(['CLI','API_KEY']).nullable() }).strict()`.
  - `PUT` writes only `where: { id: user.teamId }`. `API_KEY` can be saved with no row, and the state then reads `not-ready`.
  - Both send `no-store`. `captionRouteApi.test.ts` passes. TC-ROUTE-08 covers the two-team case.
- ✅ **AC-10: the response is exact.**
  - `stateFor` returns exactly `setting`, `state`, `effective`, `servingProviderId`, `message` and `mode`. The loader's row select carries no key, prefix or ciphertext.
  - The recursive key scan is in `captionRouteApi.test.ts`.
- ✅ **AC-11: `/team` and the wizard.**
  - `CaptionRouteCard.tsx` is new, has `data-testid="caption-route-state"` and shows the server's state and message. `team/page.tsx:248` has the "Serving captions" and "Not serving captions" chips.
  - The register button reads "Register Provider" in both modes. `grep` for "Not used in CLI mode" and "safe to delete" in `src/` finds nothing.
  - The wizard gates on the server state through `useCaptionRoute`, `captionRouteLoaded` joins `providersLoaded`, and the Review step shows the server's message. A never-chosen team's path is unchanged.
  - TC-ROUTE-02, 08 and 09 cover it.
- ✅ **AC-12: other consumers are untouched.**
  - `git diff --name-only 6f62517` over `briefingAssistant.ts`, `vision.ts`, `refineVerify.ts`, `src/lib/brandkit/`, `claudeCli.ts` and `resolve.ts` is empty (re-run by the verifier).
  - The `resolveAnthropicApiKey` parity case is `captionRouteApi.test.ts:270`.
- ✅ **AC-13: the guard.** `modelArgParity.test.ts` passes on `CATALOGUE`. On a planted entry it fails with a message containing "API_KEY teams in a CLI-mode server send cliArg to the SDK; make arg follow the route". `resolve.ts` is untouched.
- ✅ **AC-14: machine callers use the team route.**
  - `registry.ts` has no per-caller branch. `captionRouteResolve.test.ts:241-256` checks that the scheduler's `'env-default'` key and MCP's absent key resolve the same chosen row, and has a "no per-caller branch" case.
  - TC-ROUTE-06 covers the scheduled entry and its route-named failure.
- ✅ **AC-15: other suites stay green.** The full clean mock E2E gives 431/3/0/0, which is the 422 baseline plus 9 §AB cases. The existing unit tests changed only by adaptation: the new `route` field, an extra argument, mocks.
- ✅ **AC-16: the docs.**
  - `docs/handoff.md` has the 024 section, the checklist line at 182 onward (a check, not a blocking step) and the evidence query at about line 38.
  - `docs/e2e-test-plan.md` §AB has the AC-to-case table (844 to 873) and the seam note with the `route` field.
  - `CLAUDE.md` has the top entry, the 024 entry and the architecture bullet, and marks item 2 "done by 024" at line 131.
  - The ROADMAP has the 024 row and the 005-item-2 note.
  - The CI placeholders read "(pending)" and are the orchestrator's to fill.
- ✅ **AC-17: the gate.**
  - Orchestrator-run, from `reports/T4.md`: tsc clean; lint 0 errors / 7 warnings; unit 3024/3024; render 47/47; build passes; `test:upgrade` 3/3; E2E 431/3/0/0.
  - CI at `cd9d411`: pending at time of report.

## Test Results

- **Verifier-run unit:** 7 files, 84/84 passed.
- **Unit (orchestrator):** 3024/3024, against a 2947 baseline.
- **Lint:** 0 errors, 7 warnings (the baseline). **tsc:** clean. **Build:** passes.
- **Render:** 47/47.
- **E2E:** there is no `e2e_command`, so the evidence is the T4 full clean mock run: 431 passed, 3 skipped, 0 failed, 0 flaky (`reports/T4.md`).
- **`npm run test:upgrade`:** 3/3 PASS.
- **CI:** pending at time of report.

## Scope

- `git diff --name-only 6f62517 -- prisma/migrations` lists only `20261023120000_caption_route`.
- The out-of-scope diff (assistants, vision, the verifier, brand kits, `claudeCli.ts`, `resolve.ts`) is empty.
- `/api/test/model-calls` carries the new field, and no new test route was added.
- The user decisions hold:
  - A (a stored setting, one selector, fail-closed, a stamp, a guard test instead of the `arg` rework, a `route` field instead of a new test route);
  - B (the Opus gate stays, and an `API_KEY` caption run counts as the team tier);
  - C and the 2026-10-22 ruling (a chosen route ignores the brief key; a never-chosen team keeps today's behaviour, including the brief key picking the row).

## Known limits

- The CLI route's happy path has no E2E, because `.env.test` runs API mode (spec A3). It is covered by the unit tests of the selector and the resolver, with `pipelineMode` mocked. The E2E covers `CLI` as not-ready in an API-mode server.
- The CLI-mode COPY key restriction (only `anthropic` can be registered in the COPY slot there) is client-only, in the register form. The server accepts any provider name in that slot, as it did before.
- 024 alone does not make scheduled posts work on a team with no Claude token. The design step still needs a team token. It removes only the caption half of the need, for a team that chooses `API_KEY`.
- The assistants, vision and the refine verifier still choose by server mode and read `resolveAnthropicApiKey`, so they do not follow the route (FR-12, out of scope).
- A mixed-image rollout: the previous image ignores `captionRoute`. The checklist says to choose a route only after the new image serves every container.

## Per-task reviews

- T1 — PASS
- T2 — WARN(2) (one fixed; one by plan, resolved in T3)
- T3 — NOTE(6) (four fixed)
- T4 — no separate review (docs and the gate)

## Issues Found

There are no blocking issues. The CI result for `cd9d411` is pending and is appended by the orchestrator.

## Summary

**Passed:** 17/17 criteria
**Failed:** 0/17 criteria
**Verdict:** PASS

## CI (appended by the orchestrator, 2026-10-23)

Green at `cd9d411`: push run 39837152549 (E2E 431 passed / 3 skipped); PR run 39837162772 failed once in the render harness with "TimeoutError: Timed out after 30000 ms while waiting for the WS endpoint URL" (a Chromium launch timeout on the runner; 024 touches no render code, and the push run of the same commit passed render 47/47) and passed on one rerun of the failed job (build, e2e and unit all success).
