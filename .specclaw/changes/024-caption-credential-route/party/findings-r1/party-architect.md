### [BLOCK] party-architect — The route helper takes a row, so every caller must pick that row itself, and the proposal states the selection rule two different ways

**Quotes:** > A small pure helper (for example `captionRouteFor(row, mode)`) returns `'CLI' | 'API_KEY'`, and `/team`, `resolveCopyProvider` and `copyProviderIsClaude` (`registry.ts:91-94`) all use it.
**Quotes:** > - A team that has an enabled default `anthropic` COPY row is on `API_KEY`.
**Quotes:** > 2. The team's enabled default COPY row (`registry.ts:66-69`).
**Quotes:** > They use `resolveAnthropicApiKey` (`registry.ts:159-167`), which reads only the default `anthropic` COPY row, then `ANTHROPIC_API_KEY`.
**Problem:** The helper's input is a row that has already been chosen. Choosing the row (explicit key or team default, enabled, in the team, and which provider) is the real decision, and the helper does not own it. `resolveCopyProvider` chooses through `findCopyProviderRecord`. The proposal names no equivalent for `/team`, so `/team` has to re-implement the choice to get a row to pass in. That makes a second selector for the same fact. The proposal already disagrees with itself about the rule: line 44 says an enabled default `anthropic` row, and line 51 says an enabled default COPY row of any provider. `resolveAnthropicApiKey` is a third reader of the same default-anthropic-row fact, and it does not go through the helper. Three readers with two stated rules will diverge at merge. The `/team` state line can then report a route that the resolver does not take.
**Fix:** Make the single helper own the selection. It takes the team's COPY rows, the optional explicit key and the mode, and returns the route plus the row. `findCopyProviderRecord` becomes its internal step. `/team` gets the route from the server through that same function, so it never re-derives it. State one selection rule in the artifact, and say whether `resolveAnthropicApiKey` calls the helper or why it may stay separate.
**Status:** upheld

### [BLOCK] party-architect — The in-scope `arg` and Opus-gate changes make 008's resolver depend on the route, which contradicts "no new interface" and leaves its callers unnamed

**Quotes:** > - The model key (`HAIKU` / `SONNET` / `OPUS`) still comes from `resolveModel` on the `CAPTION` surface. The route only decides which provider class receives the resolved model.
**Quotes:** > - Model `arg` selection that follows the route, not only the server mode (open question 3).
**Quotes:** > - The Opus gate does not apply to an API-key caption run (open question 4).
**Quotes:** > adds no model, no migration and no new interface.
**Quotes:** > `models/policy.ts` or `resolve.ts` for `arg` and the gate
**Problem:** Two in-scope items need `resolveModel` to know the route. One is choosing `apiId` or `cliArg`, which is done today by `pipelineMode()` at `resolve.ts:123`. The other is the Opus gate, which keys on `credentialTier` (`policy.ts:151`), and that has no value for an API-key run. Either way the route has to be computed before the model is resolved and passed into it. That is a new parameter on `ResolvedModel`/`resolveModel`, a new tier value or an exemption in `credentialTier`, or both. This contradicts line 58 ("The route only decides which provider class receives the resolved model") and line 112 ("no new interface"). Every CAPTION-surface caller of `resolveModel` would have to compute the route first and pass it in. The files list does not name those callers. The proposal itself cites `generateDraft.ts:233` and `:325` as the places that call `resolveCopyProvider`, but leaves them out of the impact list. A merge that changes `resolve.ts` and not those callers half-lands.
**Fix:** Decide which way the dependency runs. One option is that the route is an input to `resolveModel` on the CAPTION surface: name the new parameter and the `credentialTier` value, list every caller that must pass it, and drop "no new interface". The other is to keep 008 untouched and pin `apiId === cliArg` with a guard test, taking the two route-dependent items out of scope. Open questions 3 and 4 cannot both stay open while their outcomes are listed In Scope.
**Status:** upheld

### [WARN] party-architect — The two-value route enum does not cover states the resolver already reaches

**Quotes:** > - **`API_KEY`**: captions run on the team's registered Anthropic COPY row through the SDK.
**Quotes:** > 3. The server default route: CLI in CLI mode, else the `ANTHROPIC_API_KEY` fallback.
**Quotes:** > - Gemini and OpenAI as caption routes. `openai` stays a registered `other`-family provider (`registry.ts:76-80`).
**Quotes:** > The wizard sends `'cli'` or a key (`copyProvider.ts:17-25`)
**Problem:** `captionRouteFor` returns only `'CLI' | 'API_KEY'`, and `API_KEY` is defined as "the team's registered Anthropic COPY row". The resolution order produces other outcomes that the enum does not define:

- the server-wide `ANTHROPIC_API_KEY` fallback, which is not a team row;
- a team default COPY row whose provider is `openai` (step 2 accepts any provider);
- a team row whose key is `cli`;
- a brief whose stored `copyProviderKey` is the literal `'cli'` on a team that has an anthropic default row. It is unclear whether that is an explicit CLI request that beats the team route, or a non-row that falls through to the team default.

Two implementers would map these states differently. The `/team` state line, the route-named errors and the test seam all depend on that mapping.
**Fix:** List the full output domain of the helper. Either add values (for example a server-key route, or an "other provider" route) or say which existing value each of these states maps to. State whether a brief-level `'cli'` key overrides the team route.
**Status:** upheld

### [WARN] party-architect — The proposed route seam cannot see the route under `MOCK_AI` as specified, and it would be a second test recorder next to model-calls

**Quotes:** > - E2E: `resolveCopyProvider` short-circuits on `MOCK_AI` and records the caption model (`registry.ts:110-117`), so the route is invisible to the mock seams today. A test seam is needed that reports the chosen route, in the style of `GET /api/test/model-calls` (`src/lib/models/modelCalls.ts`). Open question 6.
**Problem:** Under `MOCK_AI`, the short-circuit returns before any route is chosen. A route-report seam added without moving that branch would report nothing deterministic. So the seam only works if route selection runs before the mock branch in `resolveCopyProvider`. That reorder is a co-change the proposal does not commit to. "In the style of" model-calls also implies a second recorder and a second test route. The same short-circuit already writes a model-calls record that could carry a `route` field.
**Fix:** Commit to computing the route before the `MOCK_AI` short-circuit. Record it as a field on the existing model-calls record instead of adding a new recorder and route. Then the E2E assertion reads one seam for both model and route.
**Status:** upheld

### [WARN] party-architect — Deriving the route from the stamp cannot work while `apiId` equals `cliArg`, and it would be read from mutable current state

**Quotes:** > - A draft caption already records the full model ID that ran (`claude-cli.ts:23`, `anthropic.ts:39`). It does not record the route.
**Quotes:** > - Recommendation: derive the route from the stamp's provider where possible, and add no column.
**Quotes:** > - Today `apiId` equals `cliArg` for every entry (`catalogue.ts:118-119`, `:143-144`, `:165-166`).
**Problem:** The proposal's own facts are that the stamp holds only the model ID and that the model ID is the same on both routes. So the stamp holds nothing to derive the route from. The only other input open question 5 offers is "the team's current row", which is current state. It answers "which route would run now", not "which route ran". The audit contract is therefore undefined: an implementer cannot build "derive from the stamp's provider" from what the stamp is stated to contain.
**Fix:** Either record the route where the caption is written (the provider classes already know which one they are), or drop route auditing from this change and say so. Do not describe a derivation that the stated stamp cannot support.
**Status:** upheld

### [NOTE] party-architect — The route-named CLI error belongs at the caption call site, not the shared spawn site

**Quotes:** > - Today `API_KEY` with no `ANTHROPIC_API_KEY` throws a clear message (`registry.ts:143`), and CLI with no token hard-fails in `claudeCli.ts` (`userToken.ts:20-22`).
**Quotes:** > - Route-aware credential errors that name the route.
**Problem:** According to the proposal, the CLI no-credential failure comes from `claudeCli.ts`. Design also uses that spawn site, and design stays on the global `DESIGN_PROVIDER`. Putting caption-route wording there would make a shared layer aware of one caller's route.
**Fix:** Add the route-named message where the caption provider is resolved or invoked, by wrapping the existing typed error. Leave the spawn site route-agnostic.
**Status:** upheld
