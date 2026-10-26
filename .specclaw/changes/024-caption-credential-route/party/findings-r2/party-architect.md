### [BLOCK] party-architect — The route helper takes a row, so every caller must pick that row itself, and the proposal states the selection rule two different ways

**Quotes:** > A small pure helper (for example `captionRouteFor(row, mode)`) returns `'CLI' | 'API_KEY'`, and `/team`, `resolveCopyProvider` and `copyProviderIsClaude` (`registry.ts:91-94`) all use it.
**Quotes:** > - A team that has an enabled default `anthropic` COPY row is on `API_KEY`.
**Quotes:** > 2. The team's enabled default COPY row (`registry.ts:66-69`).
**Quotes:** > They choose CLI versus API by server mode (`src/lib/campaign/briefingAssistant.ts:86`, `:104`).
**Problem:** The helper's input is a row that has already been chosen. Choosing the row is the real decision: explicit key or team default, enabled, in the team, and which provider. The helper does not own that choice. `resolveCopyProvider` chooses through `findCopyProviderRecord`. The proposal names no equivalent for `/team`, so `/team` has to re-implement the choice to get a row to pass in, which makes a second selector for the same fact. The proposal also disagrees with itself about the rule. Line 44 says an enabled default `anthropic` row. Line 51 says an enabled default COPY row of any provider. `resolveAnthropicApiKey` (line 106) is a third reader of the default-anthropic-row fact, and it does not go through the helper. Three readers with two stated rules will diverge at merge, and the `/team` state line can then report a route the resolver does not take. Round 2 strengthens this finding. party-ba's WARN reads "default" as ambiguous between `isDefault` and "any enabled row". party-security's BLOCK shows that the tier the selection falls to decides who is billed. Both depend on one owner of the selection.
**Fix:** Make the single helper own the selection. It takes the team's COPY rows, the optional explicit key and the mode, and returns the route plus the row. `findCopyProviderRecord` becomes its internal step. `/team` gets the route from the server through that same function and never re-derives it. State one selection rule in the artifact. Say whether `resolveAnthropicApiKey` calls the helper, or why it may stay separate.
**Status:** upheld

### [BLOCK] party-architect — The in-scope `arg` and Opus-gate changes make 008's resolver depend on the route, which contradicts "no new interface" and leaves its callers unnamed

**Quotes:** > - The model key (`HAIKU` / `SONNET` / `OPUS`) still comes from `resolveModel` on the `CAPTION` surface. The route only decides which provider class receives the resolved model.
**Quotes:** > - Model `arg` selection that follows the route, not only the server mode (open question 3).
**Quotes:** > - The Opus gate does not apply to an API-key caption run (open question 4).
**Quotes:** > adds no model, no migration and no new interface.
**Quotes:** > `models/policy.ts` or `resolve.ts` for `arg` and the gate
**Problem:** Two in-scope items need `resolveModel` to know the route. The first is choosing `apiId` or `cliArg`, which `pipelineMode()` does today at `resolve.ts:123`. The second is the Opus gate, which keys on `credentialTier` (`policy.ts:151`); an API-key run has no tier value there. Either way the route has to be computed before the model is resolved and passed into it. That means a new parameter on `ResolvedModel`/`resolveModel`, a new tier value or exemption in `credentialTier`, or both. This contradicts line 58 ("The route only decides which provider class receives the resolved model") and line 112 ("no new interface"). Every CAPTION-surface caller of `resolveModel` would have to compute the route first and pass it in, and the files list does not name those callers. The panel did not converge on an answer: party-po says cut both items and keep an equality guard, party-visionary says make the route an input and rule the guard out, and party-security says the gate should treat an API-key run as tier `team`. That split confirms the dependency direction is undecided while both items are listed In Scope. This finding stands whichever way the author goes.
**Fix:** Decide which way the dependency runs. Option one: the route is an input to `resolveModel` on the CAPTION surface. Name the new parameter and the `credentialTier` value, list every caller that must pass it, and drop "no new interface". Option two: keep 008 untouched and take both route-dependent items out of scope. Open questions 3 and 4 cannot both stay open while their outcomes are listed In Scope.
**Status:** upheld

### [WARN] party-architect — The two-value route enum does not cover states the resolver already reaches

**Quotes:** > - **`API_KEY`**: captions run on the team's registered Anthropic COPY row through the SDK.
**Quotes:** > 3. The server default route: CLI in CLI mode, else the `ANTHROPIC_API_KEY` fallback.
**Quotes:** > - Gemini and OpenAI as caption routes. `openai` stays a registered `other`-family provider (`registry.ts:76-80`).
**Quotes:** > The wizard sends `'cli'` or a key (`copyProvider.ts:17-25`)
**Problem:** `captionRouteFor` returns only `'CLI' | 'API_KEY'`, and `API_KEY` is defined as "the team's registered Anthropic COPY row". The resolution order produces outcomes that the enum does not define:

- the server-wide `ANTHROPIC_API_KEY` fallback, which is not a team row;
- a team default COPY row whose provider is `openai`, since step 2 accepts any provider;
- a team row whose key is `cli`;
- a brief whose stored `copyProviderKey` is the literal `'cli'`, on a team that has an anthropic default row.

Two implementers would map these states differently, and the `/team` state line, the route-named errors and the test seam all depend on the mapping. party-security's WARN on the `'cli'` sentinel independently reaches the same unresolved case.
**Fix:** List the full output domain of the helper. Either add values (for example a server-key route or an "other provider" route), or say which existing value each state maps to. State whether a brief-level `'cli'` key overrides the team route.
**Status:** upheld

### [WARN] party-architect — The proposed route seam cannot see the route under `MOCK_AI` as specified, and it would be a second test recorder next to model-calls

**Quotes:** > - E2E: `resolveCopyProvider` short-circuits on `MOCK_AI` and records the caption model (`registry.ts:110-117`), so the route is invisible to the mock seams today. A test seam is needed that reports the chosen route, in the style of `GET /api/test/model-calls` (`src/lib/models/modelCalls.ts`). Open question 6.
**Problem:** Under `MOCK_AI`, the short-circuit returns before any route is chosen, so a route-report seam added without moving that branch would report nothing deterministic. The seam works only if route selection runs before the mock branch in `resolveCopyProvider`, and the proposal does not commit to that reorder as a co-change. "In the style of" model-calls also implies a second recorder and a second test route, when the same short-circuit already writes a model-calls record that could carry a `route` field. Round 2 adds weight. party-po prices a new seam as cost with no value, and party-security asks for any new seam to be gated. Folding the route into the existing record answers both: it adds no new route, and it inherits whatever gating model-calls already has.
**Fix:** Commit to computing the route before the `MOCK_AI` short-circuit. Record it as a field on the existing model-calls record instead of adding a new recorder and route, so the E2E assertion reads one seam for both model and route.
**Status:** upheld

### [WARN] party-architect — Deriving the route from the stamp cannot work while `apiId` equals `cliArg`, and it would be read from mutable current state

**Quotes:** > - A draft caption already records the full model ID that ran (`claude-cli.ts:23`, `anthropic.ts:39`). It does not record the route.
**Quotes:** > - Recommendation: derive the route from the stamp's provider where possible, and add no column.
**Quotes:** > - Today `apiId` equals `cliArg` for every entry (`catalogue.ts:118-119`, `:143-144`, `:165-166`).
**Problem:** By the proposal's own facts, the stamp holds only the model ID, and the model ID is the same on both routes. So the stamp holds nothing to derive the route from. The only other input open question 5 offers is "the team's current row", which answers "which route would run now", not "which route ran". The audit contract is undefined: nobody can build "derive from the stamp's provider" from what the stamp is stated to contain. party-security (billing traceability) and party-visionary (an unrecoverable history) reach the same impossibility from their own lenses. My finding is limited to the contract being unbuildable as written.
**Fix:** Record the route where the caption is written, since the provider classes already know which one they are. Or drop route auditing from this change and say so. Do not describe a derivation that the stated stamp cannot support.
**Status:** upheld

### [NOTE] party-architect — The route-named CLI error belongs at the caption call site, not the shared spawn site

**Quotes:** > - Today `API_KEY` with no `ANTHROPIC_API_KEY` throws a clear message (`registry.ts:143`), and CLI with no token hard-fails in `claudeCli.ts` (`userToken.ts:20-22`).
**Quotes:** > - Route-aware credential errors that name the route.
**Problem:** According to the proposal, the CLI no-credential failure comes from `claudeCli.ts`. Design also uses that spawn site, and design stays on the global `DESIGN_PROVIDER`. Putting caption-route wording there would make a shared layer aware of one caller's route.
**Fix:** Add the route-named message where the caption provider is resolved or invoked, by wrapping the existing typed error. Leave the spawn site route-agnostic.
**Status:** upheld

### [NOTE] party-architect — Rebuttal to party-po: a UI-only slice that shows "which route the team is on" still needs the shared selector

**Quotes:** > - Replace the CLI-mode "Not used in CLI mode — safe to delete" text (`page.tsx:510-513`) with a statement of which route the team is on and why.
**Quotes:** > That is today's order. The change is to name it and surface it, not to reorder it. A small pure helper (for example `captionRouteFor(row, mode)`) returns `'CLI' | 'API_KEY'`, and `/team`, `resolveCopyProvider` and `copyProviderIsClaude` (`registry.ts:91-94`) all use it.
**Problem:** party-po's BLOCK says the UI-only slice needs "no new helper". It also calls the helper's value "only drift-prevention for a two-branch `if`". Structurally, the decision is not a two-branch `if`. Per the proposal's own resolution order it has three tiers: an explicit key that must be enabled and in the team, a default row with the `isDefault`/provider question party-ba flags, and a mode-dependent server fallback. A UI-only slice that keeps the replacement state line has to compute that decision in `/team`. Without a shared function, `/team` becomes a second selector that drifts from `resolveCopyProvider`, which is the duplication my first BLOCK describes. Only a UI slice that drops the state line, and just un-hides the slot and corrects the label, avoids the helper. I take no view on whether the smaller slice is worth shipping; that is party-po's call.
**Fix:** If the UI-only slice is chosen and keeps the route state line, keep the shared selector in it, so `/team` reads the resolver's own answer. If the slice must be helper-free, drop the state line from it.
**Status:** upheld
