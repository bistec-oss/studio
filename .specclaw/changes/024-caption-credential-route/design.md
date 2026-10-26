# Design: Caption credential route

**Change:** 024-caption-credential-route
**Created:** 2026-10-22
**Spec:** [spec.md](spec.md) (FR/NFR/AC numbers below refer to it)

## Technical Approach

**One decision, owned in one place.** Which credential a team's captions run on is a pure function of three inputs: the team's stored setting (`Team.captionRoute`), the team's enabled COPY rows, and the server mode. `selectRoute('CAPTION', input)` computes it and returns the route and the row. A loader reads the inputs, and every reader calls the loader: `resolveCopyProvider`, `copyProviderIsClaude`, the `/api/team/caption-route` state, the brief wizard's gate, `POST /api/briefs`, the credential tier for the Opus gate. `/team` renders the server's answer and never re-derives it.

**The setting changes the rule only once it is chosen.** With `Team.captionRoute = null` the selector's legacy branch is a transcription of today's `resolveCopyProvider` (brief key → team default row → CLI-mode default → server key → error), so nothing changes for a team that never chooses (NFR-01). With `CLI` or `API_KEY` the selector takes a different, shorter path that consults no other tier, so a chosen route can only run, or fail closed (NFR-02).

**The route that ran is recorded at write time.** The provider classes know which route they are, so `CaptionReply` carries it, `captionStamp` copies it into the stamp, and the same writers that write `model` write `route` beside it.

**No change to 008's resolver shape.** The Opus decision (B) costs one rule where `resolveModel` computes the credential tier for the CAPTION surface. `decideModel`, the catalogue and every `resolveModel` caller are unchanged. The `arg` rework is cut and a unit guard (`apiId === cliArg`) replaces it.

## Architecture

### Resolution flow (text)

```
caller (wizard POST /api/briefs | regenerate-copy | generate/copy | generateDraftForBrief
        [interactive, scheduler (userId null), MCP/ACP (userId null)])
   │  brief.copyProviderKey  (kept, but ignored once the team has chosen)
   ▼
resolveCopyProvider(teamId, briefKey)                     src/providers/registry.ts
   │
   ├─ loadCaptionRoute(teamId, briefKey)                  src/providers/captionRoute.ts   (the only I/O)
   │     team.captionRoute            ──┐
   │     COPY rows (enabled, team)    ──┼─► selectRoute('CAPTION', {setting, mode, rows, briefKey, serverAnthropicKey})
   │     pipelineMode(), env key?     ──┘                                                  src/lib/models/route.ts (pure)
   │
   ▼  RouteDecision
 setting = API_KEY ─► anthropic row (default, else oldest)? ── yes ─► { API_KEY, row }
        │                                                    └─ no ──► ROUTE_NOT_READY   (never SERVER_KEY / CLI / OTHER)
 setting = CLI     ─► mode = cli?  ── yes ─► { CLI }
        │                          └─ no ──► ROUTE_NOT_READY
 setting = null    ─► legacy: briefKey row → default row → (cli mode: CLI) → (server key: SERVER_KEY) → NO_PROVIDER
   │
   ├─ ok:false & chosen        → throw RouteNotReadyError(route-named message)     [also under MOCK_AI]
   ├─ ok:false & !chosen       → throw today's registry.ts:143 error               [ignored under MOCK_AI, as today]
   ▼  ok:true
 log  "[captions] route=<r> chosen=<b> team=<id>"
 MOCK_AI?  → mock provider; records modelCallFor(model, mode, 'copy', decision.route); reply.route = decision.route
 else      → build provider: CLI → ClaudeCliCopyProvider (+ credential-message decorator)
                             API_KEY → AnthropicCopyProvider(row key, 'API_KEY')
                             SERVER_KEY → AnthropicCopyProvider(env key, 'SERVER_KEY')
                             OTHER → instantiateCopyProvider(row) (OpenAI)
   ▼
writeCaptions(...) → reply { raw, modelId, route } → stamp { model, substitutedFrom, route }
   → captionRowsFromFields / settleCaptionRow / headlineStampFields write model + route together
   → log "[captions] route=<r> model=<id>"
```

### Credential tier for the Opus gate (decision B)

```
resolveModel(surface, opts)                                   src/lib/models/policy.ts
   credential = surface === 'CAPTION' && team.captionRoute === 'API_KEY'
                  ? 'team'                                     // the team key bills; a personal Claude token does not lift the gate
                  : credentialTier(userId, mode)               // unchanged
   decideModel(...)  // gateApplies = gateOn && credential === 'team' && mode === 'cli'   (resolve.ts:88-90, unchanged)
```

The read of `Team.captionRoute` reuses the loader's team query (a one-column `select`). `loadModelsView` computes `captionCredential` by the same helper so the pickers match the server.

### The state the UI reads

`GET /api/team/caption-route` = `loadCaptionRoute(user.teamId)` mapped to `{ setting, state, effective, servingProviderId, message, mode }`. `/team` and the wizard use it. The wizard gates with `canSubmitBrief(key, cliMode, routeChosen)`, defined as the negation of `resolveBriefCopyKey`'s error case, so the button and `POST /api/briefs` share one rule (the PR #40 pattern, `copyProvider.ts:27-39`).

## File Changes Map

| File                                                                                                                          | Action | Description                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `prisma/schema.prisma`                                                                                                        | modify | `enum CaptionRoute`, `Team.captionRoute`, `Draft.headlineRoute`, `DraftCaption.route` (FR-01)                                                                                                                                                                                                                                        |
| `prisma/migrations/20261023120000_caption_route/migration.sql`                                                                | new    | additive: one enum, three nullable columns; header names the down script                                                                                                                                                                                                                                                             |
| `prisma/rollback/024-caption-credential-route.down.sql`                                                                       | new    | drop columns and type, L24 `DELETE FROM "_prisma_migrations"`                                                                                                                                                                                                                                                                        |
| `src/lib/models/route.ts`                                                                                                     | new    | pure `selectRoute`, types, messages, `RouteNotReadyError`                                                                                                                                                                                                                                                                            |
| `src/providers/captionRoute.ts`                                                                                               | new    | `loadCaptionRoute` (the only reader of `Team.captionRoute` for a decision; no `encryptedApiKey` in its `select`); `captionCredentialFor(teamId)`                                                                                                                                                                                     |
| `src/providers/registry.ts`                                                                                                   | modify | `resolveCopyProvider` uses the loader before `MOCK_AI`; `copyProviderIsClaude` returns `decision.isClaude`; `findCopyProviderRecord` becomes the legacy step's helper (or is folded into `selectRoute` + one decrypting read of the chosen row); the credential-message decorator; the route log. `resolveAnthropicApiKey` unchanged |
| `src/providers/interfaces/CopyProvider.ts`                                                                                    | modify | `CaptionReply.route`                                                                                                                                                                                                                                                                                                                 |
| `src/providers/implementations/copy/anthropic.ts`                                                                             | modify | constructor `route` (default `'API_KEY'`), reply carries it                                                                                                                                                                                                                                                                          |
| `src/providers/implementations/copy/claude-cli.ts`                                                                            | modify | reply `route: 'CLI'`                                                                                                                                                                                                                                                                                                                 |
| `src/providers/implementations/copy/openai.ts`                                                                                | modify | reply `route: 'OTHER'`                                                                                                                                                                                                                                                                                                               |
| `src/lib/captions/generate.ts`                                                                                                | modify | `captionStamp(model, modelId, route)`; the route log line                                                                                                                                                                                                                                                                            |
| `src/lib/captions/actionTargets.ts`                                                                                           | modify | `CaptionStamp.route`; `settleCaptionRow` writes it with a stamp                                                                                                                                                                                                                                                                      |
| `src/lib/captions/store.ts`                                                                                                   | modify | `captionRowsFromFields`, `headlineStampFields`, the caption select list carry `route` / `headlineRoute`                                                                                                                                                                                                                              |
| `src/lib/models/modelCalls.ts`                                                                                                | modify | `ModelCallRecord.route`; `modelCallFor(…, route?)`                                                                                                                                                                                                                                                                                   |
| `src/lib/models/policy.ts`                                                                                                    | modify | the CAPTION credential rule; `loadModelsView` gains `captionCredential`                                                                                                                                                                                                                                                              |
| `src/lib/models/pickerState.ts`                                                                                               | modify | CAPTION reads `captionCredential`                                                                                                                                                                                                                                                                                                    |
| `src/lib/api-types.ts`                                                                                                        | modify | `CaptionRouteState`, `ModelsView.captionCredential`                                                                                                                                                                                                                                                                                  |
| `src/lib/brief/copyProvider.ts`                                                                                               | modify | `resolveBriefCopyKey(provided, cliMode, routeChosen)`, `canSubmitBrief(..., routeChosen)`                                                                                                                                                                                                                                            |
| `src/app/api/briefs/route.ts`                                                                                                 | modify | pass `routeChosen`; the early `422 CAPTION_ROUTE_NOT_READY`                                                                                                                                                                                                                                                                          |
| `src/app/api/team/caption-route/route.ts`                                                                                     | new    | `GET` (`withTeamAuth`), `PUT` (`withTeamAdmin`, strict zod body)                                                                                                                                                                                                                                                                     |
| `src/components/team/CaptionRouteCard.tsx`                                                                                    | new    | the segmented choice, the state line, "Use the default"                                                                                                                                                                                                                                                                              |
| `src/app/(app)/team/page.tsx`                                                                                                 | modify | card first; COPY slot always visible; the false label and paragraph deleted; row chips from `servingProviderId`; register form's COPY slot in CLI mode (anthropic only)                                                                                                                                                              |
| `src/components/brief/useBriefWizard.ts`                                                                                      | modify | `useCaptionRoute`, the gate, no `copyProviderKey` sent under a chosen route, the not-ready message in the Review warning                                                                                                                                                                                                             |
| `src/mcp/server.ts`                                                                                                           | modify | `copyProviderKey` description text only                                                                                                                                                                                                                                                                                              |
| `tests/unit/captionRouteSelect.test.ts`                                                                                       | new    | AC-02, AC-03                                                                                                                                                                                                                                                                                                                         |
| `tests/unit/captionRouteResolve.test.ts`                                                                                      | new    | AC-04, AC-14                                                                                                                                                                                                                                                                                                                         |
| `tests/unit/captionRouteStamp.test.ts`                                                                                        | new    | AC-05                                                                                                                                                                                                                                                                                                                                |
| `tests/unit/captionRouteGate.test.ts`                                                                                         | new    | AC-07                                                                                                                                                                                                                                                                                                                                |
| `tests/unit/captionRouteApi.test.ts`                                                                                          | new    | AC-09, AC-10, AC-12 (`resolveAnthropicApiKey` parity)                                                                                                                                                                                                                                                                                |
| `tests/unit/modelArgParity.test.ts`                                                                                           | new    | AC-13                                                                                                                                                                                                                                                                                                                                |
| `tests/unit/{copyProviderCliMode,briefCopyProvider,modelBoundary,modelRequests}.test.ts` and any `ModelCallRecord` deep-equal | adapt  | the new args and the `route` field; none deleted (NFR-10)                                                                                                                                                                                                                                                                            |
| `tests/e2e/caption-route.test.ts`                                                                                             | new    | §AB, TC-ROUTE-01 to TC-ROUTE-09                                                                                                                                                                                                                                                                                                      |
| `docs/handoff.md`, `docs/e2e-test-plan.md`, `CLAUDE.md`, `.specclaw/ROADMAP.md`                                               | modify | FR-13                                                                                                                                                                                                                                                                                                                                |

Not touched (AC-12): `claudeCli.ts`, `userToken.ts`, `resolve.ts`, `catalogue.ts`, `briefingAssistant.ts`, `vision.ts`, `refineVerify.ts`, `src/lib/brandkit/`, the scheduler files, `src/app/api/test/`.

## Data Model Changes

```
enum CaptionRoute { CLI  API_KEY }

model Team         { … captionRoute  CaptionRoute? }   // null = never chosen = today's behaviour
model Draft        { … headlineRoute String? }          // sits beside headlineModel
model DraftCaption { … route         String? }          // sits beside model
```

Migration `20261023120000_caption_route` (hand-written, additive):

```sql
CREATE TYPE "CaptionRoute" AS ENUM ('CLI', 'API_KEY');
ALTER TABLE "Team"         ADD COLUMN "captionRoute"  "CaptionRoute";
ALTER TABLE "Draft"        ADD COLUMN "headlineRoute" TEXT;
ALTER TABLE "DraftCaption" ADD COLUMN "route"         TEXT;
```

- All nullable, no default: no rewrite, the previous image never reads or writes them, a `team.create` or `draftCaption.create` from it omits them.
- The stamp is `TEXT` because its domain (`CLI | API_KEY | SERVER_KEY | OTHER`) is wider than the setting's, and a later provider must not need an enum migration.
- No backfill. Null on a team means "never chosen"; null on a stamp means "before 024, or no text".
- `DraftRevision` is not stamped: a revision records design, not captions.
- Down script (manual): `ALTER TABLE ... DROP COLUMN IF EXISTS` ×3, `DROP TYPE IF EXISTS "CaptionRoute"`, then `DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261023120000_caption_route'`.

## API Changes

| Endpoint                                                                        | Change                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/team/caption-route`                                                   | new, `withTeamAuth`; `{ setting, state, effective, servingProviderId, message, mode }`; `no-store`                                                                                                                                   |
| `PUT /api/team/caption-route`                                                   | new, `withTeamAdmin`; body `{ route: 'CLI' \| 'API_KEY' \| null }` strict; writes the session team only; returns the same state                                                                                                      |
| `POST /api/briefs`                                                              | when the team has chosen a route: stores `'cli'`, ignores any provided key, no existence check, API-mode no-key accepted; `422 { code: 'CAPTION_ROUTE_NOT_READY' }` when the chosen route is not ready. Never-chosen teams unchanged |
| `GET /api/models`                                                               | `ModelsView.captionCredential` added (additive)                                                                                                                                                                                      |
| `GET /api/test/model-calls`                                                     | each record gains `route` (additive; gating unchanged)                                                                                                                                                                               |
| Every caption action (`regenerate-copy`, `generate/copy`, the generation paths) | unchanged contract; may fail with the route-named message (a draft's `failureReason` / `pendingActionError`, a 422 where the route already maps errors)                                                                              |

`copyProviderKey` on `POST /api/briefs`, MCP `generate_post` and ACP stays in the contract and is ignored for a team that has chosen a route.

## Key Decisions

1. **An explicit stored setting, not derived from the row (user decision A; party-security BLOCK).** Deriving the route from "an enabled default anthropic row exists" makes "the admin chose API_KEY and the key is gone" indistinguishable from "never chose". The run would silently succeed on another billing account, unwatched in the scheduler. Rejected: derive-from-row (the proposal's recommendation), and a boolean set at key registration (a second source of truth that lies after deletion).
2. **One selector owns route and row (party-architect BLOCK).** Taking a row as input (`captionRouteFor(row, mode)`) made `/team` pick a row itself, a second selector. `selectRoute` takes the rows and returns both; `findCopyProviderRecord`'s lookup becomes the legacy branch, and `resolveAnthropicApiKey` stays separate (below). Keyed by 008's surface so 007/025 or the assistants extend it instead of forking the concept.
3. **Setting values are two; routes and stamps are four.** `SERVER_KEY` and `OTHER` exist only for a team that never chose, to describe today's outcomes truthfully in the stamp. A chosen team cannot reach them (a property test pins it).
4. **Fail closed, never fall through.** A chosen `API_KEY` with no anthropic row, and a chosen `CLI` in an API-mode server, are errors with route-named messages and a "not ready" state, not a fall to the other route or the server key (party-security).
5. **Row tie-break: the default anthropic row, else the oldest.** The same pair `resolveImageProvider` uses, so a team that registered two keys gets a deterministic answer and `/team` shows which row serves.
6. **The brief's key is ignored once a route is chosen (decision C).** A never-chosen team keeps the brief key as a row picker so "no choice = byte-identical" holds (spec Open Question 1). Rejected: a brief override of the team route (an editor or a stale queued brief would pick the billing account); rejected: honouring the key only when it matches the route (more states, no benefit).
7. **The Opus gate stays, via the credential tier (decision B).** A chosen `API_KEY` run is tier `team`. Rejected: exempting API-key runs (any editor, scheduled entry or MCP caller could spend the team's metered key on Opus); rejected: a new `credentialTier` value or a `route` parameter on `resolveModel` (every CAPTION caller would change). Cost: one rule in `policy.ts` and a `captionCredential` field for the pickers. The gate still only acts in CLI mode (A3); an API-mode server has never gated any surface.
8. **The `arg` rework is cut (decision A).** `apiId === cliArg` for every entry today (`catalogue.ts:118-119,143-144,165-166`). A guard test fails with a message naming the deferred decision, so the cost moves to the one change that diverges the strings. Rejected: making `ResolvedModel` take the route (a cross-cutting 008 edit for a case that cannot occur).
9. **No new test route; the record carries `route` (decision A; party-architect).** The `MOCK_AI` branch used to return before any decision, so the route was invisible. The decision now runs first, and the mock provider records it on the existing model-calls record. One seam, one gating (404 in production, 404 without `MOCK_AI`, admin-only). The mock throws for a chosen not-ready route, so fail-closed is E2E-testable; a never-chosen "no provider" stays ignored, as today.
10. **Route-named CLI error at the caption call site.** A decorator on the CLI provider rewrites the no-credential error, keeping the original message and `cause`. `claudeCli.ts` stays route-agnostic because design shares it (party-architect NOTE).
11. **`CLI` is not ready in an API-mode server.** `withClaudeAuth` passes through outside CLI mode (`userToken.ts:77`), so a CLI spawn there has no credential. Surfacing this at selection beats failing at spawn. It can still be saved.
12. **`resolveAnthropicApiKey` stays separate** (FR-12). It returns a raw key for surfaces that bypass `CopyProvider` and choose CLI or API by server mode; it serves the assistants, vision, the voice drafter and the verifier, which are out of scope. A parity unit test (default `anthropic` row → same key) is the drift tripwire. Folding it into the selector now would change those surfaces' behaviour for a never-chosen team.
13. **`GET` is open to every member.** The wizard needs the readiness to gate Generate. The body carries no key, prefix or ciphertext, only a row id of the caller's own team, which `/api/providers/available` already exposes to members.
14. **The stamp is the route, not the row id.** The route answers "which account class billed"; a row id would need a join to mean anything after a row is deleted. If an audit needs the row, a later column can add it.
15. **`PUT` accepts a route that is not ready.** An admin may choose `API_KEY` first and register the key next; refusing would force the order. The not-ready state is the warning, and generation is what fails closed.

## Risks & Mitigations

| Risk                                                                         | Mitigation                                                                                                                                                                                             |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The legacy branch drifts from today's resolver, changing a never-chosen team | AC-02 pins every legacy case against today's outcome; the existing `copyProviderCliMode`, `briefCopyProvider` and §Y suites run unchanged; the legacy branch is a transcription, not a redesign        |
| A chosen route silently bills the wrong account                              | The selector has no fall-through for a chosen setting (AC-03 property test); the stamp and the log record the route per caption; the E2E records the route on the model-calls seam                     |
| Admin chooses `API_KEY`, then deletes the key, and scheduled captions stop   | By design (fail closed). `/team` shows `not-ready` with the fix; the scheduler's `errorReason` shows the route-named message while the entry retries (023); the handoff says to register the key first |
| A mixed-image rollout (old scheduler image, new web image)                   | The old image ignores the setting and runs today's resolution. The checklist says to choose the route only after every container serves the new image                                                  |
| `API_KEY` team on a CLI-mode server sends `cliArg` to the SDK                | Equal to `apiId` today; AC-13's guard fails the unit gate, naming the decision, the moment they diverge                                                                                                |
| `MOCK_AI` hides the CLI route (E2E runs API mode)                            | The selector and resolver are unit-tested with `mode` as an input; the E2E covers everything reachable in API mode (A3). The CLI happy path has no E2E, stated                                         |
| A secret leaks through the new route or the logs                             | The response has a fixed key set (AC-10); the loader never selects `encryptedApiKey` except for the one chosen row inside the resolver; logs carry route, `chosen`, team id only                       |
| The Opus gate is defeated by a personal token on `API_KEY`                   | The credential tier is `team` for a chosen `API_KEY` whoever calls (AC-07); the picker reads the same value (`captionCredential`)                                                                      |
| Existing tests deep-equal `ModelCallRecord`                                  | They are adapted for the `route` field, never deleted (NFR-10); the field is additive                                                                                                                  |
| Wizard flashes a false warning on first paint                                | The route-state loaded flag joins `providersLoaded` (the PR #40 lesson)                                                                                                                                |
| Two `anthropic` rows: assistants and captions use different keys             | Row chips show the serving row; the default-row case is parity-tested; the difference for a non-default serving row is documented (spec edge case)                                                     |

## Grounding sources

Quoted from the code at HEAD `6f62517` (read 2026-10-22).

- Today's resolution order, which the legacy branch transcribes (`src/providers/registry.ts:119-143`):
  > `const record = await findCopyProviderRecord(teamId, providerKey, {…})` / `if (record) { return instantiateCopyProvider(record.providerName, providerApiKey(record)) }` / `if (isCliMode()) return new ClaudeCliCopyProvider()` / `const anthropicKey = env.ANTHROPIC_API_KEY` / `if (anthropicKey) return new AnthropicCopyProvider(anthropicKey)` / `throw new Error("No COPY provider configured — set ANTHROPIC_API_KEY, add a default COPY AvailableProvider, or run in CLI mode with a connected Claude token")`
- The `MOCK_AI` branch that returns before any route is chosen, and records the model (`registry.ts:110-117`):
  > `if (MOCK_AI) { return { generateCaptions: async (brief, targets, model) => { recordModelCall(modelCallFor(model, pipelineMode(), 'copy')) … return { raw: buildMockCaptionReply(…), modelId: model.arg } } } }`
- The row lookup the legacy branch keeps (`registry.ts:59-69`): an explicit `providerKey` row `{ slot: "COPY", providerKey, teamId, isEnabled: true }`, else `{ slot: "COPY", teamId, isDefault: true, isEnabled: true }`.
- The tie-break the API_KEY row reuses (`registry.ts:195-197`): `const oldestFirst = [{ createdAt: "asc" as const }, { id: "asc" as const }]`.
- The family map `isClaude` keeps (`registry.ts:76-80`): `cli: "claude", anthropic: "claude", openai: "other"`; and `copyProviderIsClaude` (`registry.ts:91-94`): `return !record || COPY_PROVIDER_FAMILY[record.providerName.toLowerCase()] !== "other"`.
- `resolveAnthropicApiKey` reads only the default row, then the env key (`registry.ts:159-167`): `where: { slot: "COPY", teamId, isDefault: true, isEnabled: true }` … `return env.ANTHROPIC_API_KEY ?? null`.
- Why `CLI` is not ready in an API-mode server (`src/lib/agent/userToken.ts:77`): `if (!isCliMode()) return fn()`. And `isCliMode` (`src/lib/agent/config.ts:12-14`): `return env.DESIGN_PROVIDER === 'cli'`.
- The credential tier and the gate (`src/lib/models/policy.ts`, `credentialTier`):
  > `if (mode === 'api') return 'n/a'` / `if (!userId) return 'team'` — and `src/lib/models/resolve.ts` `gateApplies`: `return input.policy.gateOn && input.credential === 'team' && input.mode === 'cli'`.
- `arg` is the mode's string (`resolve.ts:123`): `arg: mode === 'api' ? entry.apiId : entry.cliArg`; and `apiId === cliArg` today (`src/lib/models/catalogue.ts`): `apiId: 'claude-haiku-4-5', cliArg: 'claude-haiku-4-5'`, `apiId: 'claude-sonnet-5-5', cliArg: 'claude-sonnet-5-5'`.
- The stamp, written beside the model (`src/lib/captions/actionTargets.ts:52-55`): `export interface CaptionStamp { model: string; substitutedFrom: string | null }`; `captionStamp` (`src/lib/captions/generate.ts:39-41`): `return { model: modelId, substitutedFrom: modelId === model.arg ? model.substitutedFrom : null }`; `headlineStampFields` (`src/lib/captions/store.ts:173-178`): `return { headlineModel: stamp.model, headlineModelSubstitutedFrom: stamp.substitutedFrom }`; the log line to extend (`generate.ts:50`): `console.info(\`[captions] caption call (prompt ${CAPTION_PROMPT_VERSION}) for ${targets.join(', ')}\`)`.
- The recorder to extend, and its gating (`src/lib/models/modelCalls.ts:20-30`: `ModelCallRecord { at, surface, key, arg, mode, source, substitutedFrom, label }`; `src/app/api/test/model-calls/route.ts`: `if (process.env.NODE_ENV === 'production') … 404`, `if (!MOCK_AI) … 404`, `requireRole('admin')`).
- The brief key's writers and readers (`src/lib/brief/copyProvider.ts:17-25`): `if (trimmed) return { key: trimmed, validateExists: true }` / `if (cliMode) return { key: 'cli', validateExists: false }` / `return { error: 'copyProviderKey is required' }`; the wizard (`src/components/brief/useBriefWizard.ts:351-359`): `const copyProviderKey = pickDefault(copyProviders)` … `canSubmitBrief(copyProviderKey || undefined, cliMode)`; the scheduler (`src/lib/scheduler/generationRunner.ts:87`) `copyProviderKey: "env-default"` and MCP (`src/mcp/tools/generate.ts:67`) `copyProviderKey: args.copyProviderKey ?? 'env-default'`.
- The `/team` defects to remove (`src/app/(app)/team/page.tsx:486-492,510-513,531`): `cliMode && copyRows.length === 0 ? ['IMAGE'] : ['COPY', 'IMAGE']`, `Not used in CLI mode — safe to delete.`, `allowCopySlot={!cliMode}`.
- The team-settings and gate pattern the new route copies (`src/app/api/team/model-policy/route.ts`): `export const GET = withTeamAdmin(…)`, `export const PUT = withTeamAdmin(async (req, _ctx, user) => { const body = await parseBody(req, putSchema) … })` with `.strict()` zod; `withTeamAdmin = withTeamAuth(handler, { teamRole: 'ADMIN' })` (`src/lib/api/handler.ts:111-112`).
- The caption action routes that resolve the provider with the brief's key and the claim (`src/app/api/drafts/[id]/regenerate-copy/route.ts:84,98`; `src/lib/agent/generateDraft.ts:233,325`; `src/app/api/generate/copy/route.ts:35`).
- The migration head and conventions (`ls prisma/migrations`: `20261022120000_hero_composition`); down-script shape from `prisma/rollback/023-scheduler-heartbeat.down.sql` (manual header, `IF EXISTS`, `DELETE FROM "_prisma_migrations"`).
- The decisions: `proposal.md` "Decisions (user, 2026-10-22, after the party panel)" 1–3; the party findings upheld in `party-report.md` (architect BLOCK ×2, security BLOCK, ba BLOCK, po BLOCK ×2).
