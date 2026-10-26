# Tasks: Caption credential route

**Change:** 024-caption-credential-route · **Size:** architectural
**Created:** 2026-10-22
**Total Tasks:** 4

## Summary

This change has **4 tasks in 4 waves**:

1. the schema, the migration and its down script;
2. the shared selector, the resolver, the stamp, the Opus-gate rule, the brief-key change, the seam's `route` field and the guard test, with their unit tests;
3. the team route API, the `/team` card, the wizard gate and the E2E section AB;
4. the docs, the full gate and CI.

T2 is the one large task. The selector, the resolver, the stamp and the brief key share one set of types and one test table, so splitting them would leave a task that cannot compile or be reviewed alone.

## Process / Gates

- **One task at a time:**
  1. an implementer subagent does the task;
  2. `specclaw:code-reviewer` reviews it;
  3. the orchestrator re-runs tsc, `npm run lint` and `npm run test:unit`, then commits.

  Never run two implementers in this checkout.

- **No real model calls.** Every test runs on the `MOCK_AI` seam or a faked provider. No Anthropic key and no Claude token is used.
- **The databases are shared.** Never run a prisma or DB command without an explicit `DATABASE_URL` that points at `bistec_studio_test` or a named scratch database. `bistec_studio` is never touched. Use `export MSYS_NO_PATHCONV=1` before any docker command that takes a container path.
- **Baselines (009 T6, 2026-10-21):**
  - unit 2947/2947;
  - render 47/47;
  - lint 0 errors / 7 warnings;
  - full clean mock E2E 422/3/0/0.

  A task may add unit cases; it may not lower the pass count or add a lint warning.

- **No open questions.** The user resolved the last one on 2026-10-22: a team that has never chosen a route keeps today's rule (the brief's `copyProviderKey` still picks the row); once a route is chosen, the brief key is ignored.

## Tasks

### Wave 1 — Migration

- [x] `T1` — The `CaptionRoute` enum, the three columns, the migration and the down script
  - Files: `prisma/schema.prisma`, `prisma/migrations/20261023120000_caption_route/migration.sql` (new), `prisma/rollback/024-caption-credential-route.down.sql` (new)
  - Estimate: small
  - Kind: migration
  - Depends: none
  - Notes:
    - **Covers:** FR-01, NFR-05, NFR-06; AC-01.
    - **Write the migration by hand.** Follow the 019, 023 and 009 header style (additive only; the previous image keeps working; it names the down script) and the 023 down script's shape: a manual header, `IF EXISTS`, and the L24 `DELETE FROM "_prisma_migrations"` for its own row. Copy `prisma/rollback/023-scheduler-heartbeat.down.sql` for the layout. The migration is exactly the four statements in `design.md` (Data Model Changes): `CREATE TYPE`, then `ADD COLUMN` on `Team`, `Draft` and `DraftCaption`, all nullable with no default.
    - **The schema comments** say: null on `Team.captionRoute` means never chosen (today's behaviour); the stamp columns are `TEXT` because their domain (`CLI | API_KEY | SERVER_KEY | OTHER`) is wider than the setting's; they sit beside `headlineModel` and `DraftCaption.model` and are written only with validated text.
    - **Prove it on `bistec_studio_024_scratch` only,** created and dropped through `docker exec designer-postgres-1 psql -U bistec -d postgres`:
      1. `migrate deploy`;
      2. the down script (`psql -v ON_ERROR_STOP=1`; expect `DELETE 1`);
      3. `migrate deploy` again, which re-applies the migration;
      4. `prisma migrate diff --from-url <scratch> --to-schema-datamodel prisma/schema.prisma --exit-code` (exit 0).
    - **Then:** `npx prisma generate`, `npx prisma validate` and `npm run test:upgrade` (3/3 PASS). `test:upgrade` uses its own scratch database; pass an explicit `DATABASE_URL` if its script reads one.
    - **Report:** paste the outputs into `reports/T1.md`, with the `pg_database` check showing the scratch database is gone.
    - The app does not use the columns yet, so tsc and unit stay green. `git diff --name-only 6f62517 -- prisma/migrations` lists only the new directory.

### Wave 2 — The selector, the resolver, the stamp and the gate

- [x] `T2` — `selectRoute`, the loader, `resolveCopyProvider`, the stamp, the Opus-gate rule, the brief key, the seam field and the guard test
  - Files: `src/lib/models/route.ts` (new), `src/providers/captionRoute.ts` (new), `src/providers/registry.ts`, `src/providers/interfaces/CopyProvider.ts`, `src/providers/implementations/copy/{anthropic,claude-cli,openai}.ts`, `src/lib/captions/{generate,store,actionTargets}.ts`, `src/lib/models/{policy,modelCalls,pickerState}.ts`, `src/lib/api-types.ts`, `src/lib/brief/copyProvider.ts`, `src/app/api/briefs/route.ts`, `src/mcp/server.ts`, `tests/unit/{captionRouteSelect,captionRouteResolve,captionRouteStamp,captionRouteGate,modelArgParity}.test.ts` (new), and the adapted `tests/unit/{copyProviderCliMode,briefCopyProvider,modelBoundary,modelRequests}.test.ts` and any test that deep-equals a `ModelCallRecord`
  - Estimate: large
  - Kind: impl
  - Depends: T1
  - Notes:
    - **Covers:** FR-02 to FR-07, FR-11, FR-12, NFR-01, NFR-02, NFR-04, NFR-10, NFR-11; AC-02 to AC-08, AC-12 (the diff half), AC-13, AC-14 (unit half).
    - **Do it in this order, one commit at the end:**
      1. `route.ts`, pure: the types, `selectRoute('CAPTION', input)` exactly as FR-02 states it (the three branches, the messages, the `RouteNotReadyError`). Write `captionRouteSelect.test.ts` first from AC-02's and AC-03's tables, including the property check that a chosen decision is never `SERVER_KEY` or `OTHER`. The legacy table is today's `resolveCopyProvider` and `copyProviderIsClaude`, transcribed; do not improve it.
      2. `captionRoute.ts`: `loadCaptionRoute(teamId, briefKey?)` with a `select` that has no `encryptedApiKey`, and `captionCredentialFor(teamId)`. `resolveCopyProvider` reads the one chosen row's key in its own query, after the decision.
      3. `registry.ts`: the loader before the `MOCK_AI` branch (FR-03, FR-07); the mock throws for `ok:false && chosen`, ignores `ok:false && !chosen`; the credential-message decorator on the CLI provider (match `/no claude credential/i`, keep `cause` and the original text); the `[captions] route=… chosen=… team=…` log (no key, no prefix, no row id); `copyProviderIsClaude` returns `decision.isClaude` (`true` on a not-ok decision). **Leave `resolveAnthropicApiKey` and `claudeCli.ts` untouched.**
      4. The stamp (FR-04): `CaptionReply.route`; each provider's route (`AnthropicCopyProvider` takes a constructor `route`, default `'API_KEY'`); `CaptionStamp.route`; `captionStamp(model, modelId, route)`; `captionRowsFromFields`, `settleCaptionRow`, `headlineStampFields` and the caption select list write `route` / `headlineRoute` beside `model` and only with validated text; the `[captions] route=… model=…` log after the reply.
      5. The gate (FR-06): in `resolveModel`, for surface `CAPTION` and `Team.captionRoute === 'API_KEY'`, credential is `'team'` whoever calls; everything else unchanged. `loadModelsView` adds `captionCredential`; `pickerState.ts` reads it for CAPTION (and for `teamTokenNotice`). **`decideModel`, `gateApplies`, `resolve.ts` and every `resolveModel` caller stay unchanged.**
      6. The brief key (FR-05): `resolveBriefCopyKey(provided, cliMode, routeChosen)` and `canSubmitBrief(key, cliMode, routeChosen)`; `POST /api/briefs` reads the route state once, passes `routeChosen`, and returns `422 { error, code: 'CAPTION_ROUTE_NOT_READY' }` before creating a brief when a chosen route is not ready. The `src/mcp/server.ts` description text only.
      7. The seam (FR-07): `ModelCallRecord.route`, `modelCallFor(model, mode, label, route?)` (the other callers pass none and record `null`). Adapt the tests that deep-equal a record.
      8. `modelArgParity.test.ts` (FR-11): the parity assertion and the planted-catalogue failure, with the failure message FR-11 words (`API_KEY teams in a CLI-mode server send cliArg to the SDK; make arg follow the route …`).
    - **Unit tests to write** (prisma and providers faked, `pipelineMode` mocked as `tests/unit/copyProviderCliMode.test.ts` does):
      - `captionRouteResolve.test.ts`: AC-04 and AC-14's unit half. A chosen `API_KEY` with an anthropic row returns the SDK provider in CLI mode and API mode; with the row removed it throws the route-named error and never builds the CLI provider or reads the server key; a chosen `CLI` never decrypts an `anthropic` row; the decorator rewrites only the no-credential error; a never-chosen team resolves as before; the scheduler's `'env-default'` brief with `userId: null` and a faked MCP-style caller resolve the same chosen route; `grep` finds no per-caller branch in `registry.ts`.
      - `captionRouteStamp.test.ts`: AC-05 (each provider's route, the writers, a failed regenerate keeps the old route, the sweep and failure settles pass none, the log line).
      - `captionRouteGate.test.ts`: AC-07's CLI-mode cases (personal-token caller on `API_KEY` refused Opus; never-chosen allowed; gate off allowed; other surfaces unchanged; API mode unchanged) and the picker's `captionCredential` behaviour.
    - **The AC-12 diff half:** `git diff --name-only 6f62517` shows no change to `briefingAssistant.ts`, `vision.ts`, `refineVerify.ts`, `src/lib/brandkit/`, `claudeCli.ts` or `resolve.ts`. The `resolveAnthropicApiKey` parity test is in T3's `captionRouteApi.test.ts`.
    - **Before you finish,** run `grep -rn "copyProviderKey\|resolveCopyProvider\|copyProviderIsClaude\|canSubmitBrief\|resolveBriefCopyKey" src tests` and report any caller that needed a change beyond the files above, so T3 is not a surprise.
    - **Gate for this task:** tsc, `npm run lint`, `npm run test:unit` (2947 plus the new cases), and `npm run build`; `rm -rf .next` after the build. No E2E here (T3 runs the targeted suites).

### Wave 3 — The team route, the card, the wizard and the E2E

- [x] `T3` — `GET/PUT /api/team/caption-route`, the `/team` card, the COPY slot, the wizard gate and E2E section AB
  - Files: `src/app/api/team/caption-route/route.ts` (new), `src/components/team/CaptionRouteCard.tsx` (new), `src/app/(app)/team/page.tsx`, `src/components/brief/useBriefWizard.ts` (and the Review step's warning component it feeds), `src/lib/api-types.ts`, `tests/unit/captionRouteApi.test.ts` (new), `tests/e2e/caption-route.test.ts` (new)
  - Estimate: large
  - Kind: impl
  - Depends: T2
  - Notes:
    - **Covers:** FR-08, FR-09, FR-10, NFR-03, NFR-04, NFR-09; AC-09, AC-10, AC-11, AC-12 (the parity test), AC-14 (E2E half), AC-15 (the targeted half).
    - **The route** copies `src/app/api/team/model-policy/route.ts`'s pattern: `GET` under `withTeamAuth` (any member), `PUT` under `withTeamAdmin` with a strict zod body `{ route: 'CLI' | 'API_KEY' | null }` through `parseBody`. Both use `user.teamId` only (no id from the body or URL) and send `Cache-Control: no-store`. The response is `loadCaptionRoute(user.teamId)` mapped to the FR-08 shape: `setting`, `state` (`unset` when the setting is null, else `ready` / `not-ready`), `effective`, `servingProviderId`, `message`, `mode`. **No key, prefix or ciphertext in it.** `API_KEY` is accepted with no key registered and `CLI` in an API-mode server (both read `not-ready`).
    - **`captionRouteApi.test.ts`** (prisma faked): the wrappers, 401 / 403 / 400, `PUT { route: null }` clears, the writes target only the session team, the body's exact keys and a recursive key scan for secrets, and the `resolveAnthropicApiKey` parity case (a team whose default enabled row is `anthropic`: the selector's `API_KEY` row and `resolveAnthropicApiKey` decrypt the same key).
    - **`CaptionRouteCard.tsx`:** read DESIGN_SYSTEM.md §8 first, and reuse `SectionHead`, `Notice`, the existing segmented and button atoms, as `ModelsCard.tsx` does. It reads `['team','caption-route']`, shows the segmented choice, the state line (`data-testid="caption-route-state"`, `data-state`), and "Use the default" when a route is chosen; a refusal shows the server's message inline. **No raw colour, no new class string, no `// ui-exception`.**
    - **`team/page.tsx`:** place the card first; make the COPY slot visible in both modes (delete the `cliMode && copyRows.length === 0` hiding, the CLI-mode paragraph and the "Not used in CLI mode — safe to delete" label, and `grep` that neither "Not used in CLI mode" nor "safe to delete" remains in `src/`); label each COPY row from `servingProviderId` ("Serving captions" / "Not serving captions"); allow COPY registration in CLI mode, restricted to `anthropic`; the button reads "Register Provider" in both modes. No client-side route rule.
    - **The wizard:** add `useCaptionRoute()`; pass `routeChosen` to `canSubmitBrief`; send no `copyProviderKey` under a chosen route; on `not-ready` disable Generate and show the server's `message` in the Review warning; fold the route state's loaded flag into `providersLoaded`. A never-chosen team's wizard must be unchanged (the `ui.test.ts` provider cases are the check).
    - **E2E (`caption-route.test.ts`, §AB):** serial (`test.describe.configure({ mode: 'serial' })`); skip without `MOCK_AI` and `dbAvailable`, like its neighbours; use a team created for the suite (the `team-isolation.test.ts` helper pattern) so the Bistec and ClientX teams stay on "never chosen"; reset the setting and clear the model-calls ring (`DELETE /api/test/model-calls`) in `beforeEach` and `afterAll`; read the route from `GET /api/test/model-calls`, filtering records by label `copy`. Copy the small login and `waitForDraft` helpers, do not import across spec files. Cases:
      - **TC-ROUTE-01:** a never-chosen team with a default `anthropic` row: `GET` says `unset`, a caption run records route `API_KEY`; with an `openai` default row it records `OTHER` (byte-identical to today).
      - **TC-ROUTE-02:** `PUT API_KEY` with an `anthropic` row: state `ready`, `servingProviderId` is the row, a generated draft's caption rows and headline carry route `API_KEY` (read through prisma, gated on `dbAvailable`) and the record says `API_KEY`.
      - **TC-ROUTE-03:** `API_KEY` chosen, the row deleted: state `not-ready` with the route-named message; a caption run fails under `MOCK_AI` with that message and records no `copy` call; the server key is not used.
      - **TC-ROUTE-04:** `CLI` chosen in this API-mode server: state `not-ready` naming the CLI route and the server mode; the run fails closed.
      - **TC-ROUTE-05:** a brief created with an `openai` row's key on an `API_KEY` team is stored as `'cli'` and records `API_KEY`; on a never-chosen team the same key still gives `OTHER`; `POST /api/briefs` with a not-ready chosen route is `422 CAPTION_ROUTE_NOT_READY` and creates no brief.
      - **TC-ROUTE-06:** a scheduled entry run through the generation tick seam on an `API_KEY` team records route `API_KEY`; with the row removed the entry's `errorReason` names the route.
      - **TC-ROUTE-07:** `GET /api/models` returns `captionCredential: 'team'` for an `API_KEY` team and the plain `credential` otherwise.
      - **TC-ROUTE-08:** `PUT` is 401 with no session and 403 for an editor, `400` for a bad body; team A's `PUT` leaves team B's `GET` at `unset`; `/team` shows the card, state line and row chips; the COPY slot is visible; neither stale string appears.
      - **TC-ROUTE-09:** the wizard on a `not-ready` team has Generate disabled with the route-named message; on a never-chosen team it is unchanged.
    - **The CLI route's happy path has no E2E** (`.env.test` runs API mode, spec A3); T2's unit tests cover it. Say so in the E2E file's header comment and in the e2e plan.
    - **Run the targeted E2E suites** against a fresh `:3001` server (stop stray node processes, `rm -rf .next`, test database only): `caption-route.test.ts`, `model-selection.test.ts`, `captions.test.ts`, `team-isolation.test.ts`, `ui.test.ts`, `campaign-scheduling.test.ts`. Report any test that asserts on the shape of a model-calls record.

### Wave 4 — Docs and the gate

- [x] `T4` — The docs, the full gate and CI
  - Files: `docs/handoff.md`, `docs/e2e-test-plan.md`, `CLAUDE.md`, `.specclaw/ROADMAP.md`
  - Estimate: small
  - Kind: docs
  - Depends: T3
  - Notes:
    - **Covers:** FR-13; AC-01 (the final `git diff` check), AC-12 (the diff check), AC-15, AC-16, AC-17.
    - **The checklist line.** Add the 024 line to "Check before the merge" in `docs/handoff.md`, as `spec.md` FR-13 words it: the additive migration `20261023120000_caption_route`; an image rollback needs no down script (`prisma/rollback/024-caption-credential-route.down.sql`, which discards every chosen route and every stamp); nothing changes for a team that has not chosen; choose a team's route only after every container serves the new image; an `API_KEY` team needs an enabled `anthropic` COPY row first, or its captions fail closed; the design step still needs a team Claude token. It adds no blocking step.
    - **The handoff 024 section and "Where things stand" row,** with the evidence query `SELECT "route", count(*) FROM "DraftCaption" WHERE "route" IS NOT NULL GROUP BY 1;`.
    - **`docs/e2e-test-plan.md`:** section AB (TC-ROUTE-01 to TC-ROUTE-09, with an AC-to-case table like section X), the `route` field in the model-calls seam note, and the CLI-route note.
    - **`CLAUDE.md`:** the top "Outstanding work" entry (024 state, gates, the new migration `20261023120000_caption_route`), the model-calls and caption-provider notes in "Architecture decisions to remember" (the selector, the stored setting, fail closed, the stamp), and mark the 005 item 2 "COPY route stays deferred" references done by 024.
    - **`.specclaw/ROADMAP.md`:** the 024 row (state and gates), the 005 item 2 note, and the order 024 → 007 → 025 → 006 kept.
    - **Prepare for the full run:**
      - stop stray node processes;
      - `rm -rf .next`;
      - `export MSYS_NO_PATHCONV=1`, then `docker exec designer-postgres-1 psql -U bistec -d postgres -c "DROP DATABASE IF EXISTS bistec_studio_test WITH (FORCE);"`, then `npm run test:e2e:db`.
    - **Then run:**
      - `npm run test:e2e:serve` and `npm run test:e2e:mock`, for 0 failed and 0 flaky against the 422/3/0/0 baseline plus the new §AB cases (wait for the log's `MOCK_EXIT` line; a haiku gate agent has twice handed back early);
      - tsc, `npm run lint`, `npm run test:unit`, `npm run test:render`, `npm run build` and `npm run test:upgrade`;
      - `rm -rf .next` after the build.
    - **Run the AC-01, AC-12 and AC-16 checks** (`git diff --name-only 6f62517 -- prisma/migrations`, the out-of-scope file diff, the docs review) and paste them into `reports/T4.md`.
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

None. The user's three decisions and the 2026-10-22 answer on never-chosen teams (keep today's rule) resolve them all.
