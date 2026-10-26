# Party Report: 024-caption-credential-route

**Reviewed:** 2026-10-22
**Tier:** deep (classifier) — It makes a team's caption credential route (OAuth chain or a registered Anthropic API key) an explicit setting that decides which account bills and which credential is used, and two open questions (where the route is stored, and which model arg a team on API_KEY sends in CLI mode) would change the design and file list if answered differently.
**Panel:** party-po(sonnet), party-architect(opus), party-ba(sonnet), party-security(opus), party-visionary(opus)
**Verdict:** CHANGES_REQUESTED

## Summary

28 findings: 6 BLOCK, 15 WARN, 6 NOTE upheld — 1 withdrawn

## Findings

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

### [BLOCK] party-ba — The pain the proposal names is not removed by it, and the proposal says so itself

**Quotes:**

> `CLAUDE.md` records that neither prod team has a team Claude token. In CLI mode their scheduled and MCP captions therefore fail on credentials.
> It would not fix the design step, which stays on the CLI (see Out of Scope), so a scheduled post would still need the team token. This change cannot fix prod's scheduled runs alone.
> **Problem:** The "Why it matters" section is built on scheduled and MCP runs failing on credentials. The same section concedes that those runs still fail after this ships and works perfectly, because the design step still needs the team token. What remains is a different problem: the `/team` UI contradicts the resolver. That problem is real, but the proposal never states it as the problem. No blocked user is named, and nothing says any team wants an Anthropic API key for captions. The claim that "CLAUDE.md records" the missing token has no date or method of check. Open question 9 half-admits the framing issue ("before this is sold as a fix") but leaves the framing in the Problem section.
> **Fix:** State the real problem, which is that the UI mislabels a route the resolver already runs. Or name a team that would gain a working path from this change. Drop the scheduled-run framing, or state the proposal's own admission as a precondition.
> **Status:** upheld

### [WARN] party-ba — No acceptance criteria, and the main claim has no falsifiable check

**Quotes:**

> **To proceed:** Review this proposal and approve to begin planning.
> Replace the CLI-mode "Not used in CLI mode — safe to delete" text (`page.tsx:510-513`) with a statement of which route the team is on and why.
> A team that has an enabled default `anthropic` COPY row is on `API_KEY`.
> **Problem:** The proposal lists tests but no pass/fail criteria. "Honest" and "a statement of which route" can be satisfied by any text. The problem sentence says the user "cannot see or choose the route". The recommended design derives the route from the row, so the admin gets no choice separate from registering a key. Open question 1 concedes this.
> **Fix:** Write the acceptance criteria. For example: with an Anthropic COPY row in CLI mode, `/team` displays route API_KEY and a caption run uses the SDK provider. With no row, it displays CLI and runs on `claude -p`. A team with no row behaves byte-identically to today.
> **Status:** upheld

### [WARN] party-ba — "Route" and "default" each carry two meanings

**Quotes:**

> A team that has an enabled default `anthropic` COPY row is on `API_KEY`.
>
> 1. The brief's explicit `copyProviderKey` row, if it is enabled and in the team (`registry.ts:59-65`).
>    That is today's order. The change is to name it and surface it, not to reorder it.
>    **Problem:** "Route" means a per-team setting in one place and a per-brief outcome in another, because an explicit brief key can override the team row. A team shown as `CLI` on `/team` can therefore run a given brief on `API_KEY`, and the reverse. It is also unclear whether "default" means the `isDefault` flag or any enabled row. The `captionRouteFor(row, mode)` helper would be built differently under each reading.
>    **Fix:** Define "route" as a per-run resolution with a team-level default. Say what `/team` shows when a brief overrides it. Say whether a non-default enabled anthropic row counts.
>    **Status:** upheld

### [NOTE] party-ba — Admin behaviour assumed, never established

**Quotes:**

> In CLI mode, tell the admin that registering an Anthropic COPY key switches captions off the OAuth chain.
> A silent fallback would bill a different account than the admin chose.
> **Problem:** The proposal assumes that admins read the `/team` note and register keys deliberately. It also assumes they hold Anthropic API keys and care about which account is billed. That is probably safe, but it is the only demand evidence offered for the feature.
> **Fix:** Name one team or admin who asked for it, or mark it as speculative.
> **Status:** upheld

### [BLOCK] party-po — Do-nothing is not priced, and the proposal admits it cannot fix the one cost it cites

**Quotes:**

> `CLAUDE.md` records that neither prod team has a team Claude token. In CLI mode their scheduled and MCP captions therefore fail on credentials.
> It would not fix the design step, which stays on the CLI (see Out of Scope), so a scheduled post would still need the team token. This change cannot fix prod's scheduled runs alone.
> The user cannot see or choose the route.
> **Problem:** The only concrete harm named is prod scheduled and MCP failures. The proposal itself says this change does not fix them, because the design step still needs the team token. That leaves the do-nothing option as "an admin cannot see which caption route a team is on". No rate, incident or user ask is given for that. The resolver already supports the per-team route, so a team can get an API-key caption route today by registering an `anthropic` COPY row. The change buys visibility and honest copy text, and its stated reach is small. It is sized at 8 to 12 files, a new seam, and a rework of `arg` and the Opus gate.
> **Fix:** State what breaks if this ships in no form. If the answer is only a misleading label and a hidden slot, ship the cheaper variant in the next finding, or tie the work to a concrete need, such as a team that wants an API-key caption route.
> **Status:** upheld

### [BLOCK] party-po — The cheaper variant (fix the `/team` UI only) is never considered

**Quotes:**

> Show the COPY slot in both modes.
> Replace the CLI-mode "Not used in CLI mode — safe to delete" text (`page.tsx:510-513`) with a statement of which route the team is on and why.
> In CLI mode, let the register form offer the COPY slot restricted to `anthropic` (`allowCopySlot`, `page.tsx:531`).
> **Problem:** The behaviour already exists, and the defect is the UI contradicting the resolver. The smallest fix is a `/team`-only change with three parts: stop hiding the slot, correct the label, and allow `anthropic` in CLI mode. It needs no new helper, no route-report seam, no `ResolvedModel` change and no Opus-gate change. The proposal never compares this UI-only slice with the full package, so the extra scope is unjustified. The helper `captionRouteFor` does hold the UI state line and the resolver together, but its value is only drift-prevention for a two-branch `if`.
> **Fix:** Ship the UI correction (and the error-message wording) as the base. List the helper, the `arg` follow-route work, the Opus exemption and the E2E seam as separate, optional follow-ups with their own value statements.
> **Status:** upheld

### [WARN] party-po — Scope items 3 and 4 solve problems the proposal says do not exist yet

**Quotes:**

> That works while the two strings are equal, and it is a latent bug if they diverge.
> Model `arg` selection that follows the route, not only the server mode (open question 3).
> The Opus gate does not apply to an API-key caption run (open question 4).
> **Problem:** Scope item 3 repairs a bug the proposal calls latent: `apiId` equals `cliArg` for every entry today. A guard test pinning equality (already listed under Tests) captures all of the value for a few lines. Changing `ResolvedModel` to take a route is a cross-cutting edit in the 008 resolver for a case that cannot occur. Scope item 4 matters only if an API-key team runs Opus in CLI mode, and nothing says anyone does. Both items are also listed as open questions, so the scope list commits to work the proposal has not decided.
> **Fix:** Cut both from In Scope. Keep the equality guard test. Revisit the Opus gate when a team reports it.
> **Status:** upheld

### [WARN] party-po — A new E2E seam is priced at zero while the value is test-only

**Quotes:**

> A test seam is needed that reports the chosen route, in the style of `GET /api/test/model-calls` (`src/lib/models/modelCalls.ts`).
> Unit tests, an E2E route-report seam, and the doc updates
> **Problem:** The seam adds `testHooks.ts` surface, a test route, and E2E cases to the roughly 422-case suite that already runs on every push. It serves a behaviour that does not change. The pure helper is unit-testable and the UI rendering is covered by a UI test, so the seam duplicates cover. The proposal states no per-run CI cost.
> **Fix:** Drop the seam. Cover the route with unit tests of the pure helper and one `/team` UI E2E case. Add the seam only if route-dependent behaviour later appears under `MOCK_AI`.
> **Status:** upheld

### [NOTE] party-po — Open questions 5, 7 and 8 name cut lines; only 7 is flagged as widening scope

**Quotes:**

> Including them widens the change toward architectural.
> Is recording the route worth a column on `DraftCaption`, or is the model ID plus the team's current row enough?
> With an explicit route, should the brief still carry a provider key at all?
> **Problem:** Questions 5 and 8 also reach beyond the shipped slice: the stamp column adds a migration and the brief-key rethink touches callers the author did not count. The proposal marks only question 7 as scope-widening. It should name the cut line itself, so the approver sees the minimum change as separable from these three.
> **Fix:** Add a line that the base slice (the UI fix plus the route-named error messages) ships alone, and that questions 5, 7 and 8 each become their own change only if the user asks.
> **Status:** upheld

### [BLOCK] party-security — Deriving the route from the row turns "API_KEY route lost its key" into a silent switch to another billing account

**Quotes:**

> - A team that has an enabled default `anthropic` COPY row is on `API_KEY`.
> - A team with no row is on the server mode's default (`CLI` in CLI mode).
>
> 3. The server default route: CLI in CLI mode, else the `ANTHROPIC_API_KEY` fallback.
>    **When the chosen route has no credential.** Open question 2. Recommendation: fail closed with a clear error, never fall back to the other route.
>    **Problem:** The fail-closed promise cannot hold under the recommended storage. When the route is derived from the row, "the admin chose API_KEY and the key is now gone" looks exactly like "the admin never chose API_KEY". The row can be disabled, lose its `isDefault` flag, be deleted, or be replaced by a default that is not `anthropic`. In each case the order drops to tier 3. In CLI mode, tier 3 runs captions on the OAuth chain, which bills a personal subscription or the team token. In API mode, it runs them on the server-wide `ANTHROPIC_API_KEY`, which bills the operator's account. Either way the run succeeds, so there is no error and no "route not ready" state. Scheduled and MCP runs then spend money that cannot be recovered, with no person watching. No seat rebutted this in round 1. party-visionary's row-overload finding and party-architect's two-rule finding both describe the same missing record of intent from other angles.
>    **Fix:** Keep an explicit record that the team chose `API_KEY`. That can be the `Team.captionRoute` column from open question 1, or a flag that is set when the key is registered and stays set. When the record says `API_KEY` and no usable enabled `anthropic` row exists, throw the route-named error and show "route not ready" on `/team`. Never fall through to tier 3. Tier 3 applies only to teams that never chose a route.
>    **Status:** upheld

### [WARN] party-security — The brief's own `copyProviderKey` outranks the admin's route, so an editor or a stale queued brief picks the billing account

**Quotes:**

> 1. The brief's explicit `copyProviderKey` row, if it is enabled and in the team (`registry.ts:59-65`).
>    The wizard stores `'cli'` when no key is given (`copyProvider.ts:23`), and an explicit key is existence-checked.
>    **Problem:** The route is presented as a per-team admin setting, but tier 1 lets a value on the brief override it. Editors write briefs, and scheduled entries read a brief's stored value again later. So an editor can send captions to any enabled row in the team, whatever the admin chose, and a brief queued before the admin changed the route keeps billing the old route. The proposal does not say whether tier 1 treats the stored `'cli'` sentinel as an explicit CLI choice. If it does, the `API_KEY` setting has no effect on interactive runs. Three seats reached the same unresolved point: party-architect (the enum does not cover a brief's `'cli'`), party-ba ("route" is both a team setting and a per-brief outcome), and party-visionary (stored brief keys are a second route source that a `/team` change cannot reach). None of them showed that the override is safe.
>    **Fix:** Decide the billing route at run time from the team setting alone. If a brief-level key is kept (open question 8), accept it only when it matches the team's current route, and reject it otherwise. State that `'cli'` on a stored brief means "use the team route", not "force CLI".
>    **Status:** upheld

### [WARN] party-security — Exempting API-key runs from the Opus gate lets any caller spend the team's metered key on Opus

**Quotes:**

> - The Opus gate does not apply to an API-key caption run (open question 4).
> - The Opus "requires a personal token" gate (`resolve.ts:88-90`) is about the Claude OAuth tier. It should not apply to an API-key run.
>   **Problem:** The gate stops Opus from running on a shared team credential. A team's Anthropic API key is also a shared team credential, and it is billed per token. Under the exemption, every editor, every scheduled entry and every MCP caller (none of which passes a user) can run Opus captions on the team's key, with no bound on the spend. party-po (cut the exemption from scope) and party-architect (the exemption needs a new `credentialTier` value) both question the item on other grounds. Neither argues that the exemption is safe, so the failure-mode reading stands.
>   **Fix:** Treat an `API_KEY` caption run as credential tier `team` for the Opus gate. Allow Opus on the team key only through an explicit admin allowance. If the item is cut from scope as party-po proposes, the gate stays in force as it is today, which also resolves this finding.
>   **Status:** upheld

### [WARN] party-security — The proposal admits a wrong route bills the wrong account, but nothing records which route ran

**Quotes:**

> - A draft caption already records the full model ID that ran (`claude-cli.ts:23`, `anthropic.ts:39`). It does not record the route.
> - Today `apiId` equals `cliArg` for every entry (`catalogue.ts:118-119`, `:143-144`, `:165-166`).
> - **Risk:** medium. A wrong route bills the wrong account, and the CLI-mode prod teams run captions on the OAuth chain today.
>   **Problem:** The model ID stamp is the same on both routes, so it carries no information about the route. Deriving the route from the team's current row only answers "which route would run now". If a misroute happens, for example through the tier-3 fall-through above, the operator cannot tell which captions billed which account. party-architect and party-visionary independently reached the same conclusion: the stated stamp cannot support the derivation, and the history cannot be backfilled.
>   **Fix:** At write time, record the route on the caption stamp, plus the provider row id when the route is `API_KEY`. Log the chosen route on every caption call, next to the model log.
>   **Status:** upheld

### [NOTE] party-security — The new route-report seam exposes a team's credential routing and must be gated like the existing seams

**Quotes:**

> A test seam is needed that reports the chosen route, in the style of `GET /api/test/model-calls` (`src/lib/models/modelCalls.ts`).
> **Problem:** A route that reports which credential path a team's captions take reveals whether the team holds an API key and whether it relies on the OAuth chain. If the seam can be reached outside the mock setup, it leaks that. Two other seats would shrink this surface: party-po proposes dropping the seam, and party-architect proposes carrying the route as a field on the existing model-calls record. Either outcome leaves the hardening point standing, but makes it smaller.
> **Fix:** If any route-reporting surface ships, as a new route or as a new field on model-calls, gate it like `POST /api/test/scheduler-tick`. That means 404 when `NODE_ENV==='production'`, 404 unless `MOCK_AI` is set, admin only, and scoped to the caller's team. Add a test that asserts the 404 in a production build.
> **Status:** upheld

### [WARN] party-security — Rebuttal to party-po: the "UI-only" slice is not safety-neutral, because it widens the path into the fail-open fall-through

**Quotes:**

> Show the COPY slot in both modes.
> In CLI mode, let the register form offer the COPY slot restricted to `anthropic` (`allowCopySlot`, `page.tsx:531`).
> In CLI mode, tell the admin that registering an Anthropic COPY key switches captions off the OAuth chain.
> **Problem:** party-po calls the `/team` changes the cheap, separable base and the route-named errors, route recording and helper optional follow-ups. From the failure-mode side, the UI changes are the part that creates the exposure. Today a CLI-mode admin cannot register a COPY row from the form. After the UI slice ships, they can, and the UI tells them the row is the switch. Each registered row then opens two silent paths: a row that is disabled or deleted silently moves captions back to the OAuth chain, and editor briefs can override the row. The route-named error and the route record are what make those paths visible. Shipping the UI slice without them gives admins a working switch that fails open and leaves no trace.
> **Fix:** If the base slice ships alone, it must include the fail-closed check on a recorded `API_KEY` choice and the route-named "route not ready" state on `/team`. If it does not include them, keep the CLI-mode register form closed to COPY and change only the misleading label. Dropping the seam, the `arg` rework or the Opus exemption raises no security objection. Cutting the Opus exemption removes one of my findings.
> **Status:** upheld

### [WARN] party-visionary — The Anthropic COPY row becomes both "the team's API key" and "the switch that moves captions off OAuth"

**Quotes:**

> Recommendation: reuse the existing `AvailableProvider` COPY row as the source of truth, and add no new column.
>
> - A team that has an enabled default `anthropic` COPY row is on `API_KEY`.
>   They use `resolveAnthropicApiKey` (`registry.ts:159-167`), which reads only the default `anthropic` COPY row, then `ANTHROPIC_API_KEY`.
>   **Problem:** Under the recommendation, one row answers two questions. It holds the key that `resolveAnthropicApiKey` gives the assistants, and its existence is also the caption route switch. Open question 7 already names the next change: let the briefing assistant, brand-kit assistant, vision or refine verifier use a team Anthropic key in CLI mode. That change cannot give an admin "a key for the assistants, but captions stay on OAuth", because registering the row flips captions and nothing else records intent. A later `Team.captionRoute` column would have to backfill from whether the row exists, which means guessing why each team registered its key. The guess gets worse with every row added after this merge, because the new `/team` text teaches admins that the row is the switch. Round 2 makes this stronger. party-security's BLOCK shows that the same overload makes a lost key look the same as "never chose API_KEY", so the cost of the overload arrives on merge day for billing, as well as for the next change.
>   **Fix:** If the derived route stays, say in the artifact that the row's presence is a route decision, and name the backfill rule a future explicit setting would use. Otherwise take the column now, while the backfill for every team is `CLI`, except the few teams that already hold a row.
>   **Status:** upheld

### [WARN] party-visionary — The recommended "derive the route from the stamp" cannot work, so every caption written after merge has no recoverable route

**Quotes:**

> Recommendation: derive the route from the stamp's provider where possible, and add no column.
> Today `apiId` equals `cliArg` for every entry (`catalogue.ts:118-119`, `:143-144`, `:165-166`).
>
> - **Risk:** medium. A wrong route bills the wrong account
>   **Problem:** By the artifact's own facts, the stamped model ID is the same string on both routes, so deriving the route from it gives nothing for any draft. party-architect (the audit contract is undefined) and party-security (a misroute leaves no trace) reach the same defect from the merge-day side. My finding is about the lasting part. Route history for every caption written between this merge and whichever later change adds a stamp field cannot be backfilled. That is a one-way loss, accepted by default and not acknowledged. Three seats reached the same fact independently, so the derivation recommendation should not survive into the plan.
>   **Fix:** Record the route next to the model ID when the caption is written. Or say plainly that route attribution is given up for every draft until a future change adds it, and drop the derivation recommendation.
>   **Status:** upheld

### [WARN] party-visionary — Stored brief keys become a second, persisted route source that an admin's `/team` change cannot reach

**Quotes:**

> Make the caption route an explicit per-team setting with two values.
>
> 1. The brief's explicit `copyProviderKey` row, if it is enabled and in the team (`registry.ts:59-65`).
> 2. **Brief `copyProviderKey`.** The wizard stores `'cli'` when no key is given (`copyProvider.ts:23`), and an explicit key is existence-checked.
>    **Problem:** Tier 1 makes the route per-brief as well as per-team, and briefs persist in scheduled entries for days or weeks. party-security's WARN covers who controls the value today. My finding is about the population that builds up after merge. Once the CLI-mode register form offers `anthropic`, briefs can start to carry explicit keys. The next change on this surface, an admin moving a team back to `CLI` or open question 8 answered as "briefs carry no key", will find stored briefs that still name the old row. Each of them either falls through silently or fails. Every brief written while question 8 stays open makes the eventual answer more expensive, and the artifact does not record that.
>    **Fix:** Answer open question 8 before merge. Either the team route is the only source, or the proposal states that stored brief keys override it and says what `/team` shows when queued work disagrees.
>    **Status:** upheld

### [NOTE] party-visionary — The helper is named for one surface, though the next two changes in view need the same decision for other surfaces

**Quotes:**

> A small pure helper (for example `captionRouteFor(row, mode)`) returns `'CLI' | 'API_KEY'`, and `/team`, `resolveCopyProvider` and `copyProviderIsClaude` (`registry.ts:91-94`) all use it. 7. **Other COPY consumers.** Should the briefing assistant, brand-kit assistant, vision and refine verifier follow the team's route, so a team on `API_KEY` does not also need a Claude token for them?
> **Problem:** This fits party-architect's first BLOCK, which asks for a helper that takes the team's rows, the explicit key and the mode, and owns the selection. That fix should also take 008's surface as its key, as in `routeFor(surface, team, mode)` with only `CAPTION` live. The open question 7 follow-up would then add surfaces to it instead of forking a second reader of the same row. As named, `captionRouteFor` makes whichever change comes next fork the concept.
> **Fix:** Key the helper and its `/team` state line by 008's surface enum, with only `CAPTION` routed in this change.
> **Status:** upheld

### [WARN] party-visionary — Rebuttal of party-po's UI-only slice: without the shared helper, the `/team` route line is a second copy of the resolver's rule, which is the drift this change exists to fix

**Quotes:**

> - Replace the CLI-mode "Not used in CLI mode — safe to delete" text (`page.tsx:510-513`) with a statement of which route the team is on and why.
>   That label is wrong for a registered `anthropic` row, because `registry.ts:119-125` runs it.
>   **Problem:** party-po's second BLOCK proposes shipping the `/team` correction alone and treating the helper as optional, "drift-prevention for a two-branch `if`". By the artifact's own account, the defect being fixed is drift: a `/team` label stated a fact about the resolver, the resolver's behaviour moved on, and the label stayed wrong. A UI-only slice prints "which route the team is on and why" from logic held in `page.tsx`, while `resolveCopyProvider` keeps its own. That rebuilds the same pair that broke. The next change that touches resolution trips on it. Open question 7 (assistants follow the route), open question 8 (briefs stop carrying a key) and party-security's fix (a sticky API_KEY choice that never falls to tier 3) all change the resolver's rule. Each will leave the `/team` line reporting the old route, and nothing fails when only one copy is edited. Of all the scope party-po proposes cutting, the helper is the one item whose value accumulates after merge. The others are fair cuts on cost.
>   **Fix:** If the slice is narrowed, keep one function that both the resolver and `/team` call, which is party-architect's selector, as the minimum. Cut the `arg` rework, the Opus exemption and the route seam instead.
>   **Status:** upheld

## Dissent

_Withdrawn findings. The severity token is prefixed WITHDRAWN so these do not count as live findings._

### [WITHDRAWN WARN] party-visionary — A guard pinning `apiId === cliArg` would turn a latent bug into a constraint every future catalogue entry must meet

**Quotes:**

> - Unit: the route helper (row present or absent, mode, explicit key), the no-credential messages, and a guard that `apiId` and `cliArg` stay equal or that the route passes the right `arg`.
>   Should `ResolvedModel` take the route as an input, or should a guard test pin `apiId === cliArg`?
>   **Problem:** Withdrawn, see Status.
>   **Fix:** None.
>   **Status:** withdrawn — party-architect's second BLOCK shows that the alternative I pushed for, the route as an input to `arg` selection, is a new parameter on `resolveModel` that every CAPTION caller must compute and pass today. party-po shows that the divergence it guards against cannot happen yet. My objection assumed a guard whose failure says nothing. A guard whose failure message names the deferred decision ("API_KEY teams in CLI mode send cliArg to the SDK; make arg follow the route before these diverge") does not add cost. It moves the cost to the one change that triggers it, which would pay it anyway. That is a legitimate deferral, not a tax. The remaining contradiction between this branch and the In Scope line belongs to party-architect and party-po, who already filed it.
