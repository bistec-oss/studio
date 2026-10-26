# Proposal: Caption credential route (005 item 2)

**Created:** 2026-10-22
**Status:** 🟡 Draft

## Problem

005 item 2 was deferred so it could sit on 008's model resolver (`.specclaw/changes/005-provider-flexibility-onboarding/proposal.md:65`, `spec.md:9`, `spec.md:266`; ROADMAP soft dependency, `.specclaw/ROADMAP.md:61`). 008 is built, so the resolver now exists. The route choice is still missing, and it is half-built by accident.

**What the code does today**

- The route captions run on is chosen by one global env var. `isCliMode()` is true when `DESIGN_PROVIDER === 'cli'` (`src/lib/agent/config.ts:12-14`).
- `resolveCopyProvider` (`src/providers/registry.ts:102-144`) picks in this order:
  1. a registered COPY row for the team (`registry.ts:119-125`);
  2. in CLI mode, `ClaudeCliCopyProvider` on the OAuth chain (`registry.ts:134`);
  3. the server-wide `ANTHROPIC_API_KEY` (`registry.ts:140-141`);
  4. otherwise an error (`registry.ts:143`).
- So a per-team route already exists in the resolver. A team that registers an `anthropic` COPY row gets the SDK route even in CLI mode. The row is found by `findCopyProviderRecord` (`registry.ts:54-70`) and built by `instantiateCopyProvider` (`registry.ts:17-29`).
- The UI contradicts the resolver. In CLI mode `/team` hides the COPY slot when the team has no COPY row (`src/app/(app)/team/page.tsx:486-492`). The register form drops the COPY slot (`page.tsx:531`). An existing row is labelled "Not used in CLI mode — safe to delete" (`page.tsx:510-513`). That label is wrong for a registered `anthropic` row, because `registry.ts:119-125` runs it.
- In API mode the same rows are required, and the brief route demands a `copyProviderKey` (`src/lib/brief/copyProvider.ts:24`).

**Why it matters**

- Scheduled and MCP runs pass no user, so they have no personal-token tier (`src/lib/agent/userToken.ts:25-49`; `src/lib/scheduler/generationRunner.ts:166`; `src/mcp/tools/generate.ts:88`). `credentialTier` also treats a null user as `team` (`src/lib/models/policy.ts:151`).
- `CLAUDE.md` records that neither prod team has a team Claude token. In CLI mode their scheduled and MCP captions therefore fail on credentials.
- The code supports an alternative for those runs. A per-team Anthropic API key would make the caption step independent of that token. It would not fix the design step, which stays on the CLI (see Out of Scope), so a scheduled post would still need the team token. This change cannot fix prod's scheduled runs alone. It removes one of the two credential needs.
- The user cannot see or choose the route. The wizard sends `'cli'` or a key (`copyProvider.ts:17-25`), and nothing in the UI says which route a team's captions will use.

**What 008 already covers**

- 008 picks which Claude model runs, through `resolveModel` / `decideModel` (`src/lib/models/resolve.ts:176-247`). It states that the route is out of scope and that the two compose (`.specclaw/changes/008-model-selection/spec.md:132`, `spec.md:754`).
- The catalogue carries both an `apiId` and a `cliArg` per model (`src/lib/models/catalogue.ts:83-84`, `:119-120`). A resolved model's `arg` is the apiId in API mode and the cliArg in CLI mode (`resolve.ts:123`).
- Today `apiId` equals `cliArg` for every entry (`catalogue.ts:118-119`, `:143-144`, `:165-166`). So a model chosen in CLI mode is also a valid SDK model string. This must be tested, not assumed (see Open Questions).

## Proposed Solution

Make the caption route an explicit per-team setting with two values. Everything else in caption generation stays as it is.

- **`CLI`**: captions run on `claude -p` on the OAuth chain (personal token, then team token).
- **`API_KEY`**: captions run on the team's registered Anthropic COPY row through the SDK.

**Where it is stored.** Open question 1. Recommendation: reuse the existing `AvailableProvider` COPY row as the source of truth, and add no new column.

- A team that has an enabled default `anthropic` COPY row is on `API_KEY`.
- A team with no row is on the server mode's default (`CLI` in CLI mode).
- This keeps today's behaviour exactly, so nothing migrates. It also makes the `/team` UI honest about what the resolver already does.

**Resolution order.** Pure and unit-testable, with no new tiers.

1. The brief's explicit `copyProviderKey` row, if it is enabled and in the team (`registry.ts:59-65`).
2. The team's enabled default COPY row (`registry.ts:66-69`).
3. The server default route: CLI in CLI mode, else the `ANTHROPIC_API_KEY` fallback.

That is today's order. The change is to name it and surface it, not to reorder it. A small pure helper (for example `captionRouteFor(row, mode)`) returns `'CLI' | 'API_KEY'`, and `/team`, `resolveCopyProvider` and `copyProviderIsClaude` (`registry.ts:91-94`) all use it.

**Composition with 008.**

- The model key (`HAIKU` / `SONNET` / `OPUS`) still comes from `resolveModel` on the `CAPTION` surface. The route only decides which provider class receives the resolved model.
- `ClaudeCliCopyProvider` passes `model.arg` to `--model` (`src/providers/implementations/copy/claude-cli.ts:18-21`). `AnthropicCopyProvider` passes it through `createMessage` (`src/providers/implementations/copy/anthropic.ts:24-33`).
- The model's `arg` depends on `pipelineMode()` (`resolve.ts:123`), which today follows the server's mode, not the team's route. A team on `API_KEY` inside a CLI-mode server would send `cliArg` to the SDK. That works while the two strings are equal, and it is a latent bug if they diverge. Open question 3.
- The Opus "requires a personal token" gate (`resolve.ts:88-90`) is about the Claude OAuth tier. It should not apply to an API-key run. Open question 4.

**When the chosen route has no credential.** Open question 2. Recommendation: fail closed with a clear error, never fall back to the other route.

- A silent fallback would bill a different account than the admin chose.
- Today `API_KEY` with no `ANTHROPIC_API_KEY` throws a clear message (`registry.ts:143`), and CLI with no token hard-fails in `claudeCli.ts` (`userToken.ts:20-22`).
- Fail-closed is the existing behaviour. The change adds a readable message that names the route, and a "route not ready" state on `/team`.

**UI at `/team`.**

- Show the COPY slot in both modes.
- Replace the CLI-mode "Not used in CLI mode — safe to delete" text (`page.tsx:510-513`) with a statement of which route the team is on and why.
- In CLI mode, let the register form offer the COPY slot restricted to `anthropic` (`allowCopySlot`, `page.tsx:531`).
- In CLI mode, tell the admin that registering an Anthropic COPY key switches captions off the OAuth chain.
- Remove the amber/gray explanatory paragraph (`page.tsx:496-503`) once the state line carries the same fact.
- `ModelsCard` (`src/components/team/ModelsCard.tsx:82`) already shows its own "Only applies in CLI mode" note. Add no second picker. 008 owns model choice and this change owns the route.

**Audit and stamp.**

- A draft caption already records the full model ID that ran (`claude-cli.ts:23`, `anthropic.ts:39`). It does not record the route.
- Recommendation: derive the route from the stamp's provider where possible, and add no column. Open question 5 asks whether a stored route is worth a migration.

**Tests.**

- Unit: the route helper (row present or absent, mode, explicit key), the no-credential messages, and a guard that `apiId` and `cliArg` stay equal or that the route passes the right `arg`.
- E2E: `resolveCopyProvider` short-circuits on `MOCK_AI` and records the caption model (`registry.ts:110-117`), so the route is invisible to the mock seams today. A test seam is needed that reports the chosen route, in the style of `GET /api/test/model-calls` (`src/lib/models/modelCalls.ts`). Open question 6.
- `/team` UI: the COPY slot is visible in both modes, and the register form offers `anthropic` in CLI mode.

## Scope

### In Scope

- A named per-team caption route (`CLI` or `API_KEY`), derived from the existing COPY row, with one pure helper shared by the resolver and `/team`.
- `/team` AI Providers: the COPY slot is visible and honest in both modes. Registering an Anthropic COPY key in CLI mode is possible.
- Route-aware credential errors that name the route.
- Model `arg` selection that follows the route, not only the server mode (open question 3).
- The Opus gate does not apply to an API-key caption run (open question 4).
- Unit tests, an E2E route-report seam, and the doc updates (`docs/handoff.md`, `docs/e2e-test-plan.md`, ROADMAP row, 005 item 2 closed).

### Out of Scope

- The design route (Path A/B). `DESIGN_PROVIDER` stays global. Design runs on the CLI, and an API-key route for design would need the SDK tool-use loop per team. I found no strong reason to move it here.
- Image providers and image routing.
- Model choice. 008 owns it, and no model picker moves.
- A new "team route" column or a migration, unless open question 1 or 5 decides otherwise.
- Other COPY consumers. The briefing assistant, brand-kit assistant and refine verifier use `resolveAnthropicApiKey` (`registry.ts:159-167`), which reads only the default `anthropic` COPY row, then `ANTHROPIC_API_KEY`. They choose CLI versus API by server mode (`src/lib/campaign/briefingAssistant.ts:86`, `:104`). The route choice does not reach them in this change. Whether it should is open question 7.
- Gemini and OpenAI as caption routes. `openai` stays a registered `other`-family provider (`registry.ts:76-80`).
- Fixing prod's missing team token or the B4 scheduler. This change reduces one credential need only.

## Impact

- **Size:** bounded, because it names and surfaces a behaviour the resolver already has (`registry.ts:119-134`), reuses the existing COPY row, and adds no model, no migration and no new interface. It would become architectural if open question 1 or 5 adds a column or a stored route.
- **Files affected:** about 8 to 12 (`registry.ts`, a new route helper, `team/page.tsx`, the provider routes and register form, `models/policy.ts` or `resolve.ts` for `arg` and the gate, `testHooks.ts` and one test route, unit and E2E tests, docs). Estimate only; not counted from the code.
- **Complexity:** small to medium
- **Risk:** medium. A wrong route bills the wrong account, and the CLI-mode prod teams run captions on the OAuth chain today. The default must stay unchanged for any team without a COPY row.

## Decisions (user, 2026-10-22, after the party panel)

These supersede the Proposed Solution where they differ.

1. **Scope: the safe full route.** The admin sets the caption route at `/team`, and it is stored on the team (an explicit record, not inferred from the COPY row). One shared selector, keyed by 008's surface with only `CAPTION` live, decides the route and the row; `/team` reads the same answer from the server. A chosen `API_KEY` route with no usable key fails closed with a route-named error and a "route not ready" state on `/team`; it never falls through to another route. The route ran is stamped on each caption at write time. **Cut:** the model `arg` rework (a guard test with a message naming the deferred decision instead) and a new test route (the route is a field on the existing model-calls record).
2. **The Opus gate stays.** An `API_KEY` caption run counts as the team credential tier, so Opus on the team key needs the admin's explicit allowance, as on a team token.
3. **Team setting only.** The route is decided at run time from the team setting. A brief's stored `copyProviderKey` no longer picks the billing route; the stored `'cli'` marker means "use the team route".

## Open Questions

1. **Storage.** Derive the route from the COPY row (recommended, no migration), or add a `Team.captionRoute` setting? The explicit setting lets an admin hold a key without using it, and costs a migration and a second source of truth.
2. **No credential on the chosen route.** Fail closed with a route-named error (recommended), or fall back to the other route? Fallback is friendlier but bills a different account silently.
3. **Which `arg` a team on `API_KEY` sends in CLI mode.** `resolved()` uses the server mode (`resolve.ts:123`). Should `ResolvedModel` take the route as an input, or should a guard test pin `apiId === cliArg`? I did not verify what the E2E recorder (`modelCalls.ts`) would show for each.
4. **The Opus gate on an API-key run.** The gate keys on credential tier `team` in CLI mode (`resolve.ts:88-90`). An API-key caption run is neither personal nor team. Should it be exempt, or is `n/a` the right tier?
5. **Stamp.** Is recording the route worth a column on `DraftCaption`, or is the model ID plus the team's current row enough? A row can change after a draft is written, so derivation is only a best guess for old drafts. I did not read `src/lib/captions/store.ts` closely enough to say what a stamp row holds beyond the model ID.
6. **Test seam.** `MOCK_AI` replaces the provider before the route is chosen (`registry.ts:110-117`). Is a route-report seam enough, or should the mock be split so the route logic runs under `MOCK_AI`?
7. **Other COPY consumers.** Should the briefing assistant, brand-kit assistant, vision and refine verifier follow the team's route, so a team on `API_KEY` does not also need a Claude token for them? They use server mode today. Including them widens the change toward architectural.
8. **Brief `copyProviderKey`.** The wizard stores `'cli'` when no key is given (`copyProvider.ts:23`), and an explicit key is existence-checked. With an explicit route, should the brief still carry a provider key at all? I did not check how many callers read `Brief.copyProviderKey`.
9. **Scheduler and MCP on a prod team with only an API key.** Does the default-row lookup run for those callers the same way as for interactive ones? `generateDraft.ts:233` and `:325` call `resolveCopyProvider` with the brief's team for both, so I expect yes. The design step still needs a team token, so the net prod effect should be confirmed with the user before this is sold as a fix.

---

**To proceed:** Review this proposal and approve to begin planning.

### Party panel (2026-10-22, CHANGES_REQUESTED) — upheld findings, see party-report.md

- (party-ba, BLOCK) The named pain (scheduled/MCP credential failures) is not removed by this change; the real problem is that `/team` mislabels a route the resolver already runs.
- (party-ba) No acceptance criteria; the "see or choose the route" claim has no falsifiable check.
- (party-ba) "Route" means both a team setting and a per-brief outcome; "default" is ambiguous between `isDefault` and any enabled row.
- (party-ba) Admin demand for an API-key caption route is assumed, not established.
- (party-po, BLOCK) Do-nothing is not priced against the change's cost.
- (party-po, BLOCK) The cheaper `/team`-only variant is never compared with the full package.
- (party-po) Scope items 3 (`arg` follows the route) and 4 (Opus exemption) fix problems that do not exist yet.
- (party-po) The new E2E route seam is priced at zero.
- (party-po) Open questions 5, 7 and 8 are scope cut lines and should be named as such.
- (party-architect, BLOCK) The helper must own the row selection (rows + explicit key + mode → route + row); one selection rule, one owner.
- (party-architect, BLOCK) The `arg` and Opus-gate items make 008's resolver depend on the route; decide the direction or cut them.
- (party-architect) The two-value enum does not cover the server-key fallback, a non-anthropic default row, a `cli` row, or a brief's stored `'cli'`.
- (party-architect) The route seam cannot see the route under `MOCK_AI` unless selection runs first; fold the route into the model-calls record instead.
- (party-architect) "Derive the route from the stamp" cannot work while `apiId` equals `cliArg`.
- (party-architect) Route-named CLI errors belong at the caption call site, not the shared spawn site.
- (party-architect) A UI-only slice that keeps a route state line still needs the shared selector.
- (party-security, BLOCK) Deriving the route from the row makes a lost key silently fall to another billing account; keep an explicit record of an `API_KEY` choice and fail closed.
- (party-security) A brief's `copyProviderKey` lets an editor or a stale queued brief pick the billing account; decide the route from the team setting alone.
- (party-security) Exempting API-key runs from the Opus gate lets any caller spend the team's metered key on Opus.
- (party-security) Nothing records which route ran; stamp the route at write time and log it.
- (party-security) Any route-reporting test surface must be gated like `scheduler-tick`.
- (party-security) A UI-only slice that opens COPY registration in CLI mode without the fail-closed check widens the fail-open path.
- (party-visionary) The Anthropic COPY row would be both the team's key and the route switch; take an explicit setting now or name the future backfill rule.
- (party-visionary) Without a route stamp, route history is lost for every caption until a later change adds it.
- (party-visionary) Stored brief keys become a second persisted route source a `/team` change cannot reach.
- (party-visionary) Key the helper by 008's surface enum (only `CAPTION` live) so later surfaces extend it.
- (party-visionary) A UI-only slice without the shared helper rebuilds the drift this change exists to fix.
