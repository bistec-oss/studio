# Spec: Caption credential route

**Change:** 024-caption-credential-route · **Size:** architectural · **Proposal:** [proposal.md](proposal.md) · **Party:** [party-report.md](party-report.md)
**Created:** 2026-10-22
**Status:** 🟡 Draft

## Overview

A team's captions run on one of two credentials: `claude -p` on the OAuth chain (a member's personal token, then the team token), or the SDK on an Anthropic API key. Today the choice is made by accident. `resolveCopyProvider` (`src/providers/registry.ts:102-144`) walks a brief-key lookup, then the team's default COPY row, then the server mode, then the server `ANTHROPIC_API_KEY`. `/team` hides the COPY slot in CLI mode and labels an existing row "Not used in CLI mode — safe to delete" (`src/app/(app)/team/page.tsx:486-513`), which is false for an `anthropic` row, because `registry.ts:119-125` runs it. Nothing records which credential a caption used, and a lost key silently moves a team to another billing account.

This change makes the route an explicit, stored, team-level decision:

- **`Team.captionRoute`** (`CLI` | `API_KEY` | null) is set by a team admin at `/team`. Null means "never chosen" and keeps today's behaviour exactly.
- **One selector** owns the whole decision (team setting, the team's COPY rows, the server mode → route and row). `resolveCopyProvider`, `copyProviderIsClaude`, `/team`, the brief wizard and the Opus gate all read its answer. `/team` never re-derives it.
- **Fail closed.** A chosen route that cannot run stops with a route-named error and a "route not ready" state on `/team`. It never falls to the other route or to the server `ANTHROPIC_API_KEY`.
- **The route that ran is stamped** on each caption and on the headline at write time, and logged.
- **A chosen team route outranks the brief.** A brief's stored `copyProviderKey` no longer picks the billing route.

The design step, the assistants (briefing, brand kit), vision and the refine verifier are untouched (see Scope). This change does not fix prod's scheduled and MCP runs by itself: the design step still needs a team Claude token. It removes the caption half of that need for a team that chooses `API_KEY`, and it makes the route visible, chosen and auditable.

All facts below were read at HEAD `6f62517` on 2026-10-22.

## Approach

**One decision: the route is a pure function of the team setting, the team's COPY rows and the server mode.** `selectRoute('CAPTION', input)` (new `src/lib/models/route.ts`, keyed by 008's surface so later surfaces extend it) returns the route and the row. A thin loader (`src/providers/captionRoute.ts`) reads `Team.captionRoute` and the team's enabled COPY rows and calls it. Every reader calls the loader.

The decisions (user, 2026-10-22) bind this spec:

- **A. The safe full route.** A stored team setting, one shared selector, fail-closed, a stamp, a log line, a guard test that pins `apiId === cliArg` (the `arg` rework is cut), and a `route` field on the existing model-calls record (a new test route is cut).
- **B. The Opus gate stays.** A chosen `API_KEY` caption run counts as credential tier `team`.
- **C. Team setting only.** Once a route is chosen it is decided at run time from the team setting alone; the stored `'cli'` marker on a brief means "use the team route".

Details are in [design.md](design.md). File map:

- **New:** `prisma/migrations/20261023120000_caption_route/migration.sql`, `prisma/rollback/024-caption-credential-route.down.sql`, `src/lib/models/route.ts` (pure), `src/providers/captionRoute.ts` (loader), `src/app/api/team/caption-route/route.ts`, `src/components/team/CaptionRouteCard.tsx`, `tests/unit/{captionRouteSelect,captionRouteResolve,captionRouteStamp,captionRouteGate,captionRouteApi,modelArgParity}.test.ts`, `tests/e2e/caption-route.test.ts`.
- **Modified:** `prisma/schema.prisma`, `src/providers/registry.ts`, `src/providers/interfaces/CopyProvider.ts`, `src/providers/implementations/copy/{anthropic,claude-cli,openai}.ts`, `src/lib/captions/{generate,store,actionTargets}.ts`, `src/lib/models/{policy,modelCalls,pickerState}.ts`, `src/lib/brief/copyProvider.ts`, `src/app/api/briefs/route.ts`, `src/app/api/models/route.ts` (via `loadModelsView`), `src/lib/api-types.ts`, `src/components/brief/useBriefWizard.ts` and its Review step warning, `src/app/(app)/team/page.tsx`, `src/mcp/server.ts` (the description text only).
- **Docs:** `docs/handoff.md`, `docs/e2e-test-plan.md`, `CLAUDE.md`, `.specclaw/ROADMAP.md`.

## Requirements

### Functional Requirements

- **FR-01 — The model, the migration and the down script.**
  - **Schema.** `prisma/schema.prisma` gets:

    ```
    enum CaptionRoute { CLI  API_KEY }

    model Team       { … captionRoute CaptionRoute? }   // null = never chosen (today's behaviour)
    model Draft      { … headlineRoute String? }        // 024: the route that wrote the headline; null = before 024 or unknown
    model DraftCaption { … route String? }              // 024: the route that wrote this row's text; null = before 024, or no text
    ```

    The stamp columns are `TEXT`, not the enum, because the stamp domain is wider than the setting (FR-02): `CLI | API_KEY | SERVER_KEY | OTHER`. Comments say so, and that the stamp is written only with validated text, beside `model` (008 FR-08).

  - **Migration** `20261023120000_caption_route`. It sorts after the current head `20261022120000_hero_composition`. It runs one `CREATE TYPE "CaptionRoute"`, one `ALTER TABLE "Team" ADD COLUMN "captionRoute" "CaptionRoute"`, and two `ADD COLUMN ... TEXT` (`"Draft"."headlineRoute"`, `"DraftCaption"."route"`). Every column is nullable with no default, so Postgres does not rewrite a table. Its header says, as 019's, 023's and 009's did, that it is additive only, so the previous image keeps working against the migrated schema (it never reads or writes the three columns, and a `team.create` omits `captionRoute`), and it names the down script. No backfill: every existing team stays null.
  - **Down script** `prisma/rollback/024-caption-credential-route.down.sql`, in the 019/023 shape: a manual header (outside `prisma/migrations/` on purpose; an image rollback does not need it), `ALTER TABLE ... DROP COLUMN IF EXISTS` for the three columns, `DROP TYPE IF EXISTS "CaptionRoute"`, and the L24 `DELETE FROM "_prisma_migrations"` for `20261023120000_caption_route`, so a later redeploy re-applies it. The header says it discards every team's chosen route and every stamp.
- **FR-02 — The selector** (`src/lib/models/route.ts`; pure: no `prisma`, no `next`, no `env`, no `Date`).
  - **Types.**

    ```
    type RouteSurface   = 'CAPTION'                       // only CAPTION is live; 008's surface enum keys it
    type RouteSetting   = 'CLI' | 'API_KEY'               // Team.captionRoute (null = never chosen)
    type CaptionRoute   = 'CLI' | 'API_KEY' | 'SERVER_KEY' | 'OTHER'    // the route that runs / the stamp
    type CopyRow        = { id: string; providerKey: string; providerName: string; isDefault: boolean; createdAt: Date }
    type RouteInput     = { setting: RouteSetting | null; mode: 'cli' | 'api'; rows: CopyRow[]  /* the team's ENABLED COPY rows */;
                            briefKey?: string; serverAnthropicKey: boolean }
    type RouteDecision  = { ok: true;  route: CaptionRoute; chosen: boolean; row: CopyRow | null; isClaude: boolean }
                        | { ok: false; route: RouteSetting | null; chosen: boolean; code: 'ROUTE_NOT_READY' | 'NO_PROVIDER'; message: string }
    ```

    `chosen` is `setting !== null`. `isClaude` replaces the question `copyProviderIsClaude` answers today (FR-03).

  - **The rule, in order.** `selectRoute('CAPTION', input)`:
    1. **`setting === 'API_KEY'`.** Candidates are the rows whose `providerName` lowercased is `anthropic`. The row is the `isDefault` one, else the oldest (`createdAt` ascending, then `id`). That is the same tie-break `resolveImageProvider` uses (`registry.ts:195-197`). With a row: `{ ok: true, route: 'API_KEY', chosen: true, row, isClaude: true }`. With none: `{ ok: false, route: 'API_KEY', chosen: true, code: 'ROUTE_NOT_READY', message }`. **No server key, no `cli` row, no other provider is consulted, in either server mode. The brief key is ignored.**
    2. **`setting === 'CLI'`.** With `mode === 'cli'`: `{ ok: true, route: 'CLI', chosen: true, row: null, isClaude: true }`. With `mode === 'api'`: `{ ok: false, route: 'CLI', code: 'ROUTE_NOT_READY' }`, because `withClaudeAuth` is a pass-through outside CLI mode (`src/lib/agent/userToken.ts:77`), so a spawn would have no credential in scope. No row is consulted. The brief key is ignored.
    3. **`setting === null` (never chosen): today's resolution, unchanged.**
       - The row is `findCopyProviderRecord`'s today: the brief's `briefKey` when it names an enabled row of the team, else the team's enabled `isDefault` row, else none.
       - A row maps by `providerName`: `cli` → `CLI`; `anthropic` → `API_KEY`; any other name (`openai`, or an unknown placeholder) → `OTHER`. `isClaude` is `COPY_PROVIDER_FAMILY[name] !== 'other'`, so an unknown name stays "Claude", as `copyProviderIsClaude` has it (`registry.ts:91-94`).
       - No row, `mode === 'cli'` → `CLI` (the `registry.ts:134` default).
       - No row, `mode === 'api'`, `serverAnthropicKey` → `SERVER_KEY` (`registry.ts:140-141`).
       - None of these → `{ ok: false, route: null, chosen: false, code: 'NO_PROVIDER', message }` with today's `registry.ts:143` text.
  - **The full output domain** is therefore: `API_KEY` (a team `anthropic` row, chosen or legacy), `CLI` (chosen, or a legacy `cli` row, or CLI-mode default), `SERVER_KEY` (legacy only), `OTHER` (legacy only), and the two failures. **A chosen team (`chosen: true`) can only ever get `CLI`, `API_KEY` or `ROUTE_NOT_READY`.** `SERVER_KEY` and `OTHER` are reachable only while the team has never chosen.
  - **Messages.** Route-named, and say what to do (no secret in any of them):
    - API_KEY not ready: `Captions are set to the API key route, but this team has no enabled Anthropic key for captions. Add one at /team → AI Providers, or choose another route.`
    - CLI not ready: `Captions are set to the CLI route, but this server is not in CLI mode (DESIGN_PROVIDER=cli). Choose the API key route at /team, or run the server in CLI mode.`
  - **Pinned elsewhere.** The legacy branch is a transcription of today's `resolveCopyProvider` and `copyProviderIsClaude`; a unit table (AC-02) pins every legacy case to today's outcome.
- **FR-03 — The loader and the registry.**
  - **`loadCaptionRoute(teamId, briefKey?)`** (`src/providers/captionRoute.ts`) reads `Team.captionRoute` and the team's enabled COPY rows (team-scoped, `isEnabled: true`, selecting the row columns FR-02 needs and **never `encryptedApiKey`**), reads `pipelineMode()` and `Boolean(env.ANTHROPIC_API_KEY)`, and returns `selectRoute('CAPTION', …)`. It is the only reader of `Team.captionRoute` for a decision.
  - **`resolveCopyProvider(teamId, providerKey?)`** (`registry.ts`) calls the loader first, **before the `MOCK_AI` short-circuit** (FR-07), then:
    - `ok: false` with `chosen: true` throws `RouteNotReadyError(decision)`, whose `message` is the FR-02 message. Under `MOCK_AI` it throws too (a chosen route fails closed in the mock as in prod).
    - `ok: false` with `chosen: false` throws today's `registry.ts:143` error in production, and under `MOCK_AI` is ignored, as today (the mock never threw).
    - `ok: true`: the provider is built from the decision: `CLI` → `ClaudeCliCopyProvider`; `API_KEY` with a row → `instantiateCopyProvider(row.providerName, decrypt(row key))`, which for a chosen team loads `encryptedApiKey` for the one selected row only; `SERVER_KEY` → `new AnthropicCopyProvider(env.ANTHROPIC_API_KEY, 'SERVER_KEY')`; `OTHER` → `instantiateCopyProvider` as today.
    - The provider is wrapped (FR-04's `reportRoute`, and the credential decorator below).
    - It logs once per call: `[captions] route=<route> chosen=<true|false> team=<teamId>`. It never logs a key, a prefix or a row id.
  - **`copyProviderIsClaude(teamId, providerKey?)`** returns `decision.isClaude` (a `not ok` decision returns `true`, because the picker stays visible and the run fails closed on its own). It stays async and keeps its signature and callers (`briefs/route.ts:219`, `regenerate-copy/route.ts:84`, `drafts/[id]/route.ts:146`, `policy.ts:285`).
  - **The CLI no-credential error is named at the caption call site, not the spawn site.** `resolveCopyProvider` wraps a `CLI`-route provider in a decorator that catches an error whose message matches `/no claude credential/i` and rethrows `Captions are set to the CLI route, but no Claude credential is available: <original message>`, keeping `cause`. `claudeCli.ts` is untouched (design uses it too), and `humanizeGenerationError`'s `/no claude credential/i` (`generationErrors.ts:20`) still matches.
  - `resolveAnthropicApiKey` stays separate (FR-12).
- **FR-04 — The stamp.** The route that ran is recorded where the caption is written.
  - `CaptionReply` (`src/providers/interfaces/CopyProvider.ts`) gains `route: CaptionRoute | null`. The Claude CLI provider reports `'CLI'`; `AnthropicCopyProvider` takes a constructor `route` (`'API_KEY'` by default, `'SERVER_KEY'` for the server key); the OpenAI provider reports `'OTHER'`; the `MOCK_AI` provider reports the decision's route (null when there is none).
  - `CaptionStamp` (`actionTargets.ts:52`) gains `route: string | null`, and `captionStamp(model, modelId, route)` (`generate.ts:39`) fills it.
  - Every writer that writes `model` writes `route` beside it, and only with validated text: `captionRowsFromFields` (`store.ts:140-170`), `settleCaptionRow` (`actionTargets.ts:75-83`), the `Draft` headline write `headlineStampFields` (`store.ts:173-178`), and the `CAPTION_SELECT` column list (`store.ts:38`). A failed field writes no route and keeps the route of the text it keeps (008 A7). The failure settles and the stale sweep pass no stamp and never touch it.
  - `writeCaptions` logs `[captions] route=<route> model=<modelId>` after the reply, next to the existing `[captions] caption call` line (`generate.ts:50`) and the model log.
  - **Old rows stay null.** No backfill. "Before 024" and "unknown" are both null, and the handoff says so.
- **FR-05 — The brief's `copyProviderKey` (decision C), every reader.**
  - **`Brief.copyProviderKey` is not removed** (old briefs and queued entries carry it; the column is NOT NULL). Its meaning changes only for a team that has chosen a route.
  - **Writers (store the key):**
    - `POST /api/briefs` (`briefs/route.ts:120-189`) calls `resolveBriefCopyKey(provided, cliMode, routeChosen)` (`src/lib/brief/copyProvider.ts`). When the team has chosen a route, the stored key is the literal `'cli'` marker, the provided key is ignored, there is no existence check, and an API-mode submission without a key is accepted (today it is `400 copyProviderKey is required`). When the team has never chosen, the function is exactly today's.
    - `POST /api/briefs` also refuses early when the team's chosen route is not ready: `422 { error: <FR-02 message>, code: 'CAPTION_ROUTE_NOT_READY' }`, before any brief row is created. A never-chosen team is unaffected.
    - The scheduler's brief (`generationRunner.ts:87`) and MCP/ACP's (`mcp/tools/generate.ts:67`) still write `'env-default'`; unchanged. `src/mcp/server.ts:87`'s `copyProviderKey` description gains "ignored once the team has chosen a caption route".
  - **Readers (resolve with the key):** `generateDraft.ts:233` and `:325`, `regenerate-copy/route.ts:84,98`, `drafts/[id]/route.ts:146`, `generate/copy/route.ts:35`, `briefs/route.ts:219`. None changes its call. They pass the brief's key to the loader, and **the selector ignores it whenever the team has chosen a route.** A queued brief written before the admin chose a route therefore runs on the chosen route.
  - **The stored `'cli'` marker** means "use the team route": under a chosen route it is ignored with every other key; under never-chosen it behaves as today (it matches a legacy `cli` row if one exists, else falls to the team default).
  - **The wizard (`useBriefWizard.ts:341-359,499`).** FR-10.
- **FR-06 — The Opus gate (decision B).**
  - **`credentialTier` for the CAPTION surface.** `resolveModel('CAPTION', …)` (`policy.ts:244`) reads the team's chosen route through the loader (one query). When `Team.captionRoute === 'API_KEY'`, the credential is `'team'`, whoever the caller is, **regardless of server mode**. Otherwise the credential is `credentialTier(userId, mode)`, unchanged. Every other surface is unchanged. `decideModel`, `gateApplies` (`resolve.ts:88-90`) and the catalogue are unchanged: **no new parameter on `resolveModel`, no caller changes.**
  - **The effect.** In CLI mode, with the team's Opus gate on, a chosen `API_KEY` caption run is gated like a team-token run: Opus is refused (`NEEDS_PERSONAL_TOKEN` on an explicit pick, a substitution on a stored or default one) unless the admin has the gate off. A user's personal Claude token does not lift it, because it is not the credential that bills. In API mode the gate never applied to any surface (`gateApplies` needs `mode === 'cli'`, A3); that is unchanged, so an `API_KEY` team on an API-mode server is not gated (stated, not new).
  - **The pickers.** `ModelsView` (`api-types.ts:261`) gains `captionCredential: CredentialTier`, computed by the same function as above. `pickerState.ts` reads it for the CAPTION surface (`decideInput`, `teamTokenNotice`) and `credential` for the others, so a caption picker never offers a model the server will refuse.
- **FR-07 — The `MOCK_AI` seam and the model-calls record.**
  - `ModelCallRecord` (`modelCalls.ts:20-30`) gains `route: CaptionRoute | null`. `modelCallFor(model, mode, label, route?)` fills it; every other caller passes none and records `null`.
  - **`resolveCopyProvider` computes the decision before the `MOCK_AI` branch** (FR-03). The mock provider records `modelCallFor(model, pipelineMode(), 'copy', decision.route)`, so `GET /api/test/model-calls` returns `route` for the caption call.
  - **The seam keeps its gating** (`api/test/model-calls/route.ts`: 404 in production, 404 unless `MOCK_AI`, admin-only) and its shape (the record gains one field). No new test route, no new recorder.
- **FR-08 — The team route API.** `src/app/api/team/caption-route/route.ts`.
  - **`GET`**, `withTeamAuth` (any role on a resolved team). Any member may read it, because the brief wizard needs it. Response (`CaptionRouteState` in `api-types.ts`):

    ```
    { setting: 'CLI' | 'API_KEY' | null,
      state: 'unset' | 'ready' | 'not-ready',
      effective: 'CLI' | 'API_KEY' | 'SERVER_KEY' | 'OTHER' | null,
      servingProviderId: string | null,
      message: string | null,
      mode: 'cli' | 'api' }
    ```

    `state` is `unset` when `setting` is null (whatever the legacy decision), `ready` when a chosen route's decision is ok, `not-ready` when it is not. `effective` is the decision's route (null when not ok). `servingProviderId` is the selected row's id when there is one (the id of the caller's own team's row; never a key, prefix or ciphertext). `message` is the FR-02 message when not ready, else null. **`/team` renders this and never re-derives it.**

  - **`PUT`**, `withTeamAdmin`, body `{ route: 'CLI' | 'API_KEY' | null }`, strict (`z.object(...).strict()`, `parseBody`). It writes `Team.captionRoute` for the **session's** team (`user.teamId`; no id in the body) and returns the new `CaptionRouteState`. Null clears the choice back to "never chosen". `API_KEY` is accepted with no key registered, and `CLI` is accepted in an API-mode server; both then read `not-ready`, because an admin may register the key next, and the state line says what is missing. An unknown value or extra field is `400`. An editor is `403`, an unauthenticated request `401`.
  - **Tenancy.** Both handlers read and write only `user.teamId`. Another team's setting is never readable or writable (cross-team is not addressable at all: there is no id). The loader's row query carries `teamId`.
  - Both send `Cache-Control: no-store`.
- **FR-09 — `/team`.** `src/app/(app)/team/page.tsx`, with a new `src/components/team/CaptionRouteCard.tsx`.
  - **A "Caption route" bezel card, placed first, above AI Providers.** It reads `GET /api/team/caption-route` (`['team','caption-route']`) and has:
    - a **segmented choice** of "Claude CLI (OAuth)" and "Anthropic API key", the current `setting` selected, and a "Use the default" action (`PUT { route: null }`) when a route is chosen. A change calls `PUT` and shows the server's message inline on a refusal.
    - a **state line** (`data-testid="caption-route-state"`, `data-state` = `unset` | `ready` | `not-ready`): `unset` says "No route chosen — captions use <the server default: effective>"; `ready` says "Captions run on <the chosen route>"; `not-ready` is a `Notice tone="warning"` carrying the server's `message`. In `not-ready`, **new captions fail until it is fixed**, and the line says so.
    - the Graphite atoms only (`Notice`, `SectionHead`, existing button and segmented atoms; no raw colour, no new class string).
  - **The COPY slot is visible in both modes.** `ProvidersSection` drops the `cliMode && copyRows.length === 0` hiding (`page.tsx:486-492`), the explanatory paragraph (`:496-503`) and the false "Not used in CLI mode — safe to delete" label (`:510-513`).
  - **Each COPY row is labelled from the server's answer.** The row whose `id` equals `servingProviderId` shows a "Serving captions" chip; every other COPY row shows "Not serving captions" (a team with a chosen route, or a legacy team whose default row is another one). No client-side rule.
  - **The register form** offers the COPY slot in CLI mode too (`allowCopySlot`, `page.tsx:531`), restricted to `anthropic` there (API mode keeps today's provider list). The button reads "Register Provider" in both modes (it reads "Register image key" today in CLI mode).
  - `ModelsCard` is unchanged (008 owns model choice).
- **FR-10 — The brief wizard.**
  - `useBriefWizard.ts` reads the route state through a `useCaptionRoute()` hook (the `GET` in FR-08, member access). `canSubmitBrief(copyProviderKey, cliMode, routeChosen)` takes the new third argument and returns true when `routeChosen` is true and the state is `ready`, and today's result otherwise. `canSubmitBrief` stays defined as the negation of `resolveBriefCopyKey`'s error case (its existing contract, `copyProvider.ts:27-39`), so the button is live exactly when `POST /api/briefs` would accept the submission.
  - **When the team has chosen a route** the wizard sends no `copyProviderKey` (`useBriefWizard.ts:499`). When it is `not-ready`, Generate is disabled and the existing amber warning in the Review step shows the server's `message`, not the generic "no provider" text. The "route state loaded" flag joins `providersLoaded`, so the warning does not flash on first paint (the PR #40 lesson).
  - **When the team has never chosen,** the wizard is byte-identical to today.
- **FR-11 — The `arg` guard test (the `arg` rework is cut).** `tests/unit/modelArgParity.test.ts` asserts `entry.apiId === entry.cliArg` for every `CATALOGUE` entry. Its failure message names the deferred decision: `"<key>: apiId and cliArg diverged. API_KEY teams in a CLI-mode server send cliArg to the SDK; make arg follow the route (ResolvedModel takes the route) before these diverge."` The test is shown failing on a planted catalogue (the `modelCatalogue.test.ts` `planted` pattern). `resolve.ts:123` (`arg: mode === 'api' ? apiId : cliArg`) is untouched.
- **FR-12 — Other COPY consumers are out of scope, and `resolveAnthropicApiKey` stays separate.**
  - The briefing assistant, the brand-kit assistant, vision, the voice drafter and the refine verifier choose CLI or API by **server mode** (`briefingAssistant.ts:86`, `vision.ts:60`, `refineVerify.ts`) and take a raw key from `resolveAnthropicApiKey` (`registry.ts:159-167`), which reads **only the default enabled `anthropic` COPY row, then `ANTHROPIC_API_KEY`**, and never a brief's key. They are not captions and have no route stamp. They keep that behaviour, and a team on `API_KEY` still needs a Claude token (CLI mode) or the default Anthropic row (their own rule) for them.
  - `resolveAnthropicApiKey` stays a separate function because it answers a different question (a raw key for direct SDK calls that bypass the `CopyProvider` abstraction), serves surfaces the selector does not key (008's surface enum keeps them separate), and must keep working for a team that has never chosen. A unit test (AC-12) pins that, for a team whose default enabled row is `anthropic`, the selector's `API_KEY` row and `resolveAnthropicApiKey` decrypt the same key, so the two cannot silently drift. Making the assistants follow the route is a later change that extends `selectRoute` with another surface (design §8).
- **FR-13 — The prod checklist line and the docs.**
  - **`docs/handoff.md` "Check before the merge"** gets one 024 line, a check and not a blocking step:
    - the migration `20261023120000_caption_route` is additive: one enum, one nullable column on `Team` and two nullable `TEXT` columns, no rewrite. A redeploy applies it;
    - the previous image runs against it, so an image rollback needs no down script. The manual down script is `prisma/rollback/024-caption-credential-route.down.sql` and it discards every chosen route and every route stamp;
    - **nothing changes for a team that has not chosen a route.** After the deploy the operator may set each team's route at `/team`; until then behaviour is today's. A team that chooses `API_KEY` must have an enabled `anthropic` COPY row first, or its captions (interactive, scheduled and MCP) fail closed with the route-named error;
    - the design step still needs a team Claude token, so this change alone does not make a scheduled post succeed on a team with none.
  - A handoff **024 section** with the evidence query: `SELECT "route", count(*) FROM "DraftCaption" WHERE "route" IS NOT NULL GROUP BY 1;`.
  - **`docs/e2e-test-plan.md`** gets section AB (`caption-route.test.ts`, TC-ROUTE-01 to TC-ROUTE-09) with an AC-to-case table, and the model-calls seam note gains the `route` field.
  - **`CLAUDE.md`'s** top "Outstanding work" entry records 024 (state, gates, the new migration), and the 005 item 2 (COPY route) references that say "deferred" are marked done by 024.
  - **`.specclaw/ROADMAP.md`** gets the 024 row and the 005-item-2 note; the verified order stays 024 → 007 → 025 → 006.

### Non-Functional Requirements

- **NFR-01: byte-identical for a team that never chose.** For `Team.captionRoute = null` the provider chosen, the errors thrown, the wizard's gate, `POST /api/briefs`'s accept/refuse behaviour, `copyProviderIsClaude`'s answer and the credential tier are exactly today's. The only differences are the additive stamp, the log line, the `route` field on the test record and the new `/team` card. A unit table pins this (AC-02) and the existing suites pass unchanged (AC-15).
- **NFR-02: fail closed.** A chosen route that cannot run throws a route-named error. No code path from a chosen route reaches `ClaudeCliCopyProvider` (when `API_KEY`), a team `anthropic` row (when `CLI`), another provider, or `env.ANTHROPIC_API_KEY`. A unit test enumerates the states (AC-03).
- **NFR-03: tenancy.** The setting, the rows, the state and the stamp are team-scoped. No endpoint takes a team id from the body or a URL. A cross-team read or write is not addressable (404 by absence, as for every team-scoped route); the loader's row query and `PUT`'s write use `user.teamId` only.
- **NFR-04: no secret leaves the server.** The loader never selects `encryptedApiKey` except for the one row the decision picked, and only inside `resolveCopyProvider`. `GET /api/team/caption-route` returns no key, prefix or ciphertext. Logs carry the route, the `chosen` flag and the team id, never a key, a prefix or a row id. A unit test asserts the response keys (AC-10).
- **NFR-05: applied migrations are never edited.** `git diff --name-only 6f62517 -- prisma/migrations` lists only the new directory.
- **NFR-06: the previous image keeps working** against the migrated schema (additive, nullable, no default, no drop).
- **NFR-07: shared databases.** No prisma or DB command runs without an explicit `DATABASE_URL` that points at `bistec_studio_test` or a named scratch database. `bistec_studio` is never touched (CLAUDE.md gotchas). `export MSYS_NO_PATHCONV=1` before any docker command with a container path.
- **NFR-08: no real model calls.** Every test runs on the `MOCK_AI` seam or a faked provider. No Anthropic key, no Claude token is used.
- **NFR-09: Graphite.** The card uses existing atoms only (DESIGN_SYSTEM.md §8). It adds no colour, class string or atom copy, so `uiTokenGuard`, `uiPrimitives` and `contrast` pass with no `// ui-exception`.
- **NFR-10: existing tests are adapted, never deleted.** `copyProviderCliMode.test.ts`, `briefCopyProvider.test.ts`, `modelBoundary.test.ts`, `modelRequests.test.ts` and any test that deep-equals a `ModelCallRecord` are adapted for the new `route` field and the selector.
- **NFR-11: scope stays out.** The design route (`DESIGN_PROVIDER`), image providers, model choice and the catalogue, the assistants, vision, the verifier, the scheduler worker and the claim logic are unchanged. No `arg` rework. No new test route.

## Acceptance Criteria

Each criterion must pass for the change to be considered complete.

- **AC-01 (FR-01, NFR-05, NFR-06): the migration and the down script.**
  - `npx prisma validate` passes.
  - **On a scratch database `bistec_studio_024_scratch`,** with an explicit `DATABASE_URL`, created and dropped through `docker exec designer-postgres-1 psql -U bistec -d postgres`:
    1. `migrate deploy` creates the enum and the three columns;
    2. the down script (`psql -v ON_ERROR_STOP=1`) drops them and the type and deletes the migration row (`DELETE 1`);
    3. `migrate deploy` re-applies the migration (the L24 roll-forward);
    4. `prisma migrate diff --from-url <scratch> --to-schema-datamodel prisma/schema.prisma --exit-code` exits 0.
  - `npm run test:upgrade` prints PASS for all 3 scenarios.
  - `git diff --name-only 6f62517 -- prisma/migrations` lists only the new directory.
  - Everything is recorded in `reports/T1.md`, with the `pg_database` check showing the scratch database is gone.
- **AC-02 (FR-02, NFR-01): the selector, legacy table** (`tests/unit/captionRouteSelect.test.ts`). With `setting: null`, the decision equals today's `resolveCopyProvider` / `copyProviderIsClaude` outcome for every row of this table (rows × mode × server key × brief key):
  - an explicit enabled brief key beats the default row (any provider); a disabled or foreign key falls to the default;
  - a default `anthropic` row → `API_KEY`; `cli` row → `CLI`; `openai` row → `OTHER`, `isClaude: false`; an unknown placeholder name → `OTHER`, `isClaude: true`;
  - no row: CLI mode → `CLI`; API mode with a server key → `SERVER_KEY`; API mode without one → `NO_PROVIDER` with today's message;
  - a brief key of `'cli'` with no `cli` row falls to the default row.
- **AC-03 (FR-02, NFR-02): the chosen routes and fail-closed** (same file). With a chosen setting:
  - `API_KEY` + an enabled `anthropic` row → `API_KEY` and that row, in CLI mode and in API mode, whatever the brief key and whatever other rows exist;
  - `API_KEY` picks the `isDefault` anthropic row, else the oldest; an `openai` default row never wins;
  - `API_KEY` with no enabled anthropic row (none, disabled, only `openai`, only `cli`, only a server key) → `ROUTE_NOT_READY` naming the API key route, in both modes. **The result is never `SERVER_KEY`, `CLI` or `OTHER`.**
  - `CLI` + `mode: 'cli'` → `CLI` with no row consulted (an `anthropic` row is ignored); `CLI` + `mode: 'api'` → `ROUTE_NOT_READY` naming the CLI route.
  - A chosen decision never has `route` `SERVER_KEY` or `OTHER` (a property check over the whole input space).
- **AC-04 (FR-03): the resolver** (`tests/unit/captionRouteResolve.test.ts`, prisma and providers faked).
  - `resolveCopyProvider` with a chosen `API_KEY` and an anthropic row returns an SDK provider (`AnthropicCopyProvider`) built from that row's key, even in CLI mode; with the row removed it throws `RouteNotReadyError` naming the route and **never** constructs `ClaudeCliCopyProvider` or reads `ANTHROPIC_API_KEY`.
  - A chosen `CLI` in CLI mode returns the CLI provider, and an `anthropic` row's key is not decrypted.
  - A never-chosen team resolves exactly as before (the `copyProviderCliMode.test.ts` cases pass, adapted only for the new args).
  - The CLI-route provider's `/no claude credential/i` failure is rethrown as `Captions are set to the CLI route, but no Claude credential is available: …` with the original message inside; `claudeCli.ts` is unchanged (`git diff` is empty for it).
  - The log line carries `route=` and `chosen=` and never a key; the loader's row query has no `encryptedApiKey` in its `select`.
  - `copyProviderIsClaude` returns `false` only for an `openai` row under a never-chosen team.
- **AC-05 (FR-04): the stamp** (`tests/unit/captionRouteStamp.test.ts`, plus E2E TC-ROUTE-02).
  - Each provider reports its route in `CaptionReply.route` (`CLI`, `API_KEY`, `SERVER_KEY`, `OTHER`, and the mock's decision route).
  - `captionRowsFromFields` writes `route` beside `model` on a validated row, and writes neither on a failed one; `settleCaptionRow` with a stamp writes both and without a stamp writes neither; `headlineStampFields` carries `headlineRoute` beside `headlineModel`.
  - A failed regenerate keeps the route of the text it keeps; the stale sweep and the failure settles never touch `route`.
  - `writeCaptions` logs `route=` and `model=`.
- **AC-06 (FR-05, decision C): the brief key** (`tests/unit/briefCopyProvider.test.ts` adapted, E2E TC-ROUTE-05).
  - `resolveBriefCopyKey` with `routeChosen` true returns `{ key: 'cli', validateExists: false }` for a provided key, for none, in CLI mode and in API mode (today's API-mode `copyProviderKey is required` does not apply). With `routeChosen` false every existing case is unchanged.
  - `canSubmitBrief(key, cliMode, routeChosen)` is true exactly when `resolveBriefCopyKey` is not an error.
  - E2E: a brief created with `copyProviderKey` set to an `openai` row's key, on a team that chose `API_KEY`, is stored with `'cli'` and its caption run records route `API_KEY`. On a never-chosen team the same key still selects the `openai` row (route `OTHER`).
  - `POST /api/briefs` on a chosen team whose route is not ready is `422` with `code: 'CAPTION_ROUTE_NOT_READY'` and the route-named message, and creates no brief row.
- **AC-07 (FR-06, decision B): the Opus gate** (`tests/unit/captionRouteGate.test.ts`, prisma faked, `pipelineMode` mocked).
  - CLI mode, gate on, team `API_KEY`, caller **with an active personal token**: `resolveModel('CAPTION', { requested: 'OPUS' })` is refused (`NEEDS_PERSONAL_TOKEN`); the same call on a never-chosen team (personal credential) is allowed.
  - With the gate off, Opus is allowed on `API_KEY`. A caller with `userId: null` is `team` as before.
  - Every other surface's credential (`DESIGN_FREEFORM`, `REFINE`, the assistants) is unchanged by the team's route.
  - API mode: the gate does not apply to any surface, and the `API_KEY` team is unchanged (stated in the test).
  - `GET /api/models` returns `captionCredential: 'team'` for an `API_KEY` team and `credential` for the rest, and `pickerState` offers no gated model on CAPTION when `captionCredential` is `team` and the gate is on (E2E TC-ROUTE-07 covers the field; the unit covers the picker).
- **AC-08 (FR-07): the seam** (E2E TC-ROUTE-01 to TC-ROUTE-04, TC-ROUTE-06; `tests/unit/modelCalls` adapted).
  - `GET /api/test/model-calls` returns a `route` for every caption record: the decision's route for a caption run, `null` for the other labels.
  - A chosen route that is not ready makes the caption run fail under `MOCK_AI` with the route-named error and **records no model call**.
  - A never-chosen team whose legacy resolution would throw in production does not throw under `MOCK_AI` (today's mock behaviour), and records route `null`.
  - The seam's gating is unchanged: 404 without `MOCK_AI`, 404 in a production build, 403 for a non-admin (the existing `model-selection.test.ts` gate case still passes). No new file under `src/app/api/test/`.
- **AC-09 (FR-08, NFR-03): the API** (`tests/unit/captionRouteApi.test.ts`, E2E TC-ROUTE-08).
  - `GET` and `PUT` are wrapped in `withTeamAuth` and `withTeamAdmin`. Unauthenticated is `401`, an editor's `PUT` is `403`, an unknown route or extra field is `400`, and `PUT { route: null }` clears the setting.
  - `PUT` writes only the session team's row: after team A's `PUT`, team B's `GET` still reads `unset` (E2E, with two teams).
  - `API_KEY` can be saved with no row (`state: 'not-ready'`), and with a row the state is `ready` with `servingProviderId` equal to that row's id.
- **AC-10 (FR-08, NFR-04): the response is exact.** `GET`'s body has exactly the keys `setting`, `state`, `effective`, `servingProviderId`, `message`, `mode`; no key, prefix or ciphertext appears in the body (a recursive key scan in the unit test) and the loader's `select` has no `encryptedApiKey` outside the resolver.
- **AC-11 (FR-09, FR-10): `/team` and the wizard** (E2E TC-ROUTE-08, TC-ROUTE-09).
  - **The reported example.** With an Anthropic COPY row and route `API_KEY`, `/team` shows state `ready` with the API key route selected, the row carries "Serving captions", and a caption run records route `API_KEY` on the SDK provider.
  - With no choice, `/team` shows `unset`, and a caption run is byte-identical to today (AC-02's table; the recorded route equals the legacy decision's).
  - With `API_KEY` chosen and the row removed, `/team` shows `not-ready` with the route-named message, the wizard's Generate is disabled with that message, and `POST /api/briefs` is `422`.
  - The COPY slot is visible in an API-mode server and, in the unit render, in CLI mode with no rows; the strings "Not used in CLI mode" and "safe to delete" appear nowhere in `src/` (`grep`).
  - A never-chosen team's wizard gate and submit behaviour are unchanged (the existing `ui.test.ts` provider cases pass).
- **AC-12 (FR-12): other consumers are untouched.** `git diff --name-only 6f62517` shows no change to `src/lib/campaign/briefingAssistant.ts`, `src/lib/agent/vision.ts`, `src/lib/drafts/refineVerify.ts`, `src/lib/brandkit/`, `src/lib/agent/claudeCli.ts` or `src/lib/models/resolve.ts`. A unit test pins that `resolveAnthropicApiKey` and the selector's `API_KEY` row decrypt the same key when the team's default enabled row is `anthropic`.
- **AC-13 (FR-11): the guard.** `tests/unit/modelArgParity.test.ts` passes on the catalogue (`apiId === cliArg` for every entry) and, on a planted catalogue where one entry diverges, fails with a message containing `API_KEY teams in a CLI-mode server send cliArg to the SDK; make arg follow the route`.
- **AC-14 (FR-05, scheduler and MCP): machine callers use the team route** (unit; E2E TC-ROUTE-06).
  - A scheduled generation (a brief with `copyProviderKey: 'env-default'`, `userId: null`) on a team that chose `API_KEY` resolves the `API_KEY` row (recorded route `API_KEY` in the E2E through the generation tick seam). The same on `CLI` resolves the CLI provider. With `API_KEY` and no row the entry fails with the route-named `errorReason` (and retries by the existing backoff).
  - The MCP and ACP `generate_post` path calls the same `generateDraftForBrief` with `userId: null`, so the unit test (a faked provider) asserts the same decision for it; no per-caller branch exists in `registry.ts` (`grep`).
- **AC-15 (NFR-01, NFR-10): the other suites stay green.** In the full clean mock E2E no case outside §AB fails or flakes. In particular the §Y model-selection cases (`copyProviderIsClaude`, the caption picker), `captions.test.ts`, `team-isolation.test.ts` (providers), `ui.test.ts` (the wizard and `/team`) and the scheduler suites pass with no change other than adapted `ModelCallRecord` shapes.
- **AC-16 (FR-13): the docs.**
  - A review confirms the 024 line in the handoff checklist (a check, no blocking step, with the "design still needs a team token" sentence), the handoff 024 section and its evidence query, the `CLAUDE.md` entry, the §AB entry in the e2e plan with its AC-to-case table, and the ROADMAP row.
  - The 005 item 2 "deferred" references are marked done.
- **AC-17: the gate.**
  - tsc is clean, and `npm run lint` gives 0 errors and no more than the 7-warning baseline.
  - `npm run test:unit` passes in full, at least the 2947 baseline plus the new cases, including `uiTokenGuard`, `uiPrimitives`, `contrast`, `modelLiteralGuard` and `modelCatalogue`, with no `// ui-exception` added.
  - `npm run test:render` passes 47/47; `npm run build` passes (`rm -rf .next` after it); `npm run test:upgrade` passes 3/3.
  - A full clean mock E2E (the test database dropped first) gives 0 failed and 0 flaky, against the 422/3/0/0 baseline plus the new §AB cases.
  - `gh run list --branch v2` shows CI green at the change's last commit.

## Edge Cases

- **A team that chose `API_KEY`, then lost its key** (row deleted, disabled, or replaced by an `openai` default). The setting still says `API_KEY`, so the state is `not-ready` and every caption run, interactive, scheduled and MCP, fails closed with the route-named error. It does not fall to the OAuth chain or the server key. This is the point of storing the choice.
- **A queued brief written before the admin chose a route** carries an old key (an explicit row's key, or `'env-default'`). It runs on the chosen route; the old key is ignored (FR-05).
- **A chosen `CLI` on an API-mode server** is `not-ready`. It can be saved (an admin may be preparing a server change), and the state line says the server is not in CLI mode.
- **A team with two `anthropic` rows** and `API_KEY` chosen uses the `isDefault` one, else the oldest. The `/team` row chips show which one is "Serving captions". `resolveAnthropicApiKey` reads only the default row, so a team whose serving row is not the default would have assistants on a different key; the chip makes the serving row visible, and the unit test pins the default-row case (FR-12).
- **An `openai` default row on a team that chose `API_KEY`** is ignored for captions (the route needs an `anthropic` row). Captions on OpenAI are only reachable while the team has never chosen.
- **Under a chosen route, a caption model pick for a non-Claude provider** cannot occur: both chosen routes are Claude, so `copyProviderIsClaude` is true and the picker stays visible.
- **A regenerate on a draft written before 024** stamps its new row with the route that ran now; the old rows keep a null route.
- **A deleted team** reads and writes nothing (`withTeamAuth` resolves live teams only).
- **A mixed-image rollout.** The previous image ignores `captionRoute` and runs today's resolution for every team, including one that chose `API_KEY`. That is documented in the checklist: choose the route only after the new image is serving every container, including the scheduler.
- **`MOCK_AI` with no COPY row and no server key** (a never-chosen team in the E2E) records route `null` and does not throw, as the mock never threw.

## Assumptions

- **A1:** every caption caller resolves through `resolveCopyProvider` (`generateDraft.ts:233,325`, `regenerate-copy/route.ts:98`, `generate/copy/route.ts:35`). Verified by `grep`; MCP, ACP and the scheduler enter through `generateDraftForBrief`.
- **A2:** `withClaudeAuth` is a pass-through outside CLI mode (`userToken.ts:77`), so a CLI-route spawn in an API-mode server has no credential. That is why `CLI` is not ready there.
- **A3:** `.env.test` runs API mode (`DESIGN_PROVIDER=claude-html`), so the E2E cannot run the CLI route end to end. The CLI route's happy path is covered by unit tests of the selector and the resolver (`mode` is an input, and `pipelineMode` is mocked); the E2E covers the chosen `API_KEY` route, never-chosen behaviour, not-ready states (including `CLI` in an API-mode server), the brief key, the scheduler and the UI.
- **A4:** the `MOCK_AI` model-calls ring is global (not per team), as 008 built it; the E2E suite is serial and clears it per case, and filters records by label `copy`.
- **A5:** the registered COPY providers are `cli`, `openai` and `anthropic` (`registry.ts:17-29`, `COPY_PROVIDER_FAMILY`). A new COPY provider name is a later change to both maps.

## Open Questions

None. Item 1 below was **resolved by the user on 2026-10-22: keep today's rule** for a never-chosen team.

1. **(Resolved: keep today's rule.) A never-chosen team keeps the brief's key as a row picker.** Decision C says a brief's `copyProviderKey` no longer picks the billing route. This spec applies it from the moment a team **chooses** a route. A team that has never chosen keeps today's rule exactly (an explicit enabled brief key beats the default row), because the user's decision A says "no choice, byte-identical to today" and the E2E suite and API-mode wizard (which sends `pickDefault`) depend on it. The cost: an editor on a never-chosen team can still point a brief at any enabled COPY row, as today. If the user wants the key ignored for every team (so an unset team resolves the default row only), `selectRoute`'s legacy branch drops its `briefKey` step and the API-mode wizard stops needing a key; it is a one-line change to FR-02 step 3 and to AC-02, and it makes an unset team non-byte-identical for a multi-row API-mode team.

## Dependencies

- **008** model selection: the surface enum, `resolveModel`, the catalogue, the model-calls recorder and the model stamps this change sits beside (`captionModel`, `headlineModel`).
- **012** per-channel captions: `DraftCaption`, `captionRowsFromFields`, `settleCaptionAction`.
- **019/023/009:** the migration, down-script and checklist conventions, and the migration head `20261022120000_hero_composition` this migration sorts after.
- **022:** `npm run test:upgrade` and the merge checklist.
- **021:** the Graphite atoms and the token guard.
- 007 and 025 follow this change (ROADMAP order 024 → 007 → 025 → 006); neither blocks it.
- Merging to `main`, the missing team Claude tokens, B4 and the design route are out of scope.

## Notes

**Corrections to the proposal (2026-10-22), re-derived at `6f62517`:**

- **Storage.** The proposal recommended deriving the route from the COPY row and adding no column. The user decided on an explicit stored setting (A); the party's fail-open finding (a lost key silently moves a team to another account) is what that fixes. One nullable column replaces "no migration".
- **The enum is wider than two.** The proposal's `'CLI' | 'API_KEY'` could not name the server-key fallback, a non-Anthropic default row or a legacy `cli` row. The setting is two values; the route and the stamp are four (`CLI | API_KEY | SERVER_KEY | OTHER`), and FR-02 says which states reach which, and that a chosen team reaches only two.
- **The selector owns the row.** The proposal's `captionRouteFor(row, mode)` took a row, so `/team` would have had to pick one. `selectRoute` takes the rows, the brief key and the mode, and returns the route and the row; `findCopyProviderRecord`'s lookup becomes its legacy branch.
- **The stamp.** "Derive the route from the stamp" was unbuildable (`apiId === cliArg`, so the model ID is the same on both routes). The route is recorded at write time instead (FR-04).
- **The `arg` rework and the new test route are cut.** A guard test and a `route` field on the existing record replace them. The Opus-gate item is kept (B) and costs one credential-tier rule in `policy.ts`, not a new parameter on `resolveModel`.
- **A chosen `API_KEY` is gated in CLI mode only.** The gate acts only when `mode === 'cli'` (A3); an API-mode server has never had one.
- **`CLI` is not ready in an API-mode server** (A2), which the proposal did not consider.
- **Files.** The proposal's "8 to 12" is now 8 new and about 23 modified code, schema and test files, plus 4 docs. The size is architectural (a column, a shared selector, a stamp, a UI card and an API), as the proposal said it would become.
- **Line pointers.** `registry.ts:102-144` (the resolver), `:54-70` (`findCopyProviderRecord`), `:91-94` (`copyProviderIsClaude`), `:159-167` (`resolveAnthropicApiKey`), `team/page.tsx:486-531`, `copyProvider.ts:17-39`, `policy.ts:151` and `resolve.ts:88-90` were all re-read at HEAD. `policy.ts`'s `credentialTier` is now at `:151-162` of the file read; the proposal's `:151` still points into it.
