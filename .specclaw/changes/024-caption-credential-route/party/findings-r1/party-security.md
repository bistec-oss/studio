### [BLOCK] party-security — Deriving the route from the row turns "API_KEY route lost its key" into a silent switch to another billing account

**Quotes:**

> - A team that has an enabled default `anthropic` COPY row is on `API_KEY`.
> - A team with no row is on the server mode's default (`CLI` in CLI mode).
>
> 3. The server default route: CLI in CLI mode, else the `ANTHROPIC_API_KEY` fallback.
>    **When the chosen route has no credential.** Open question 2. Recommendation: fail closed with a clear error, never fall back to the other route.
>    **Problem:** The fail-closed promise cannot hold under the recommended storage. With the route derived from the row, "the admin chose API_KEY and the key is now gone" looks exactly like "the admin never chose API_KEY". If the row is disabled, loses its `isDefault` flag, is deleted, or is replaced by a non-`anthropic` default, the order drops to tier 3. In CLI mode, tier 3 runs captions on the OAuth chain, which bills a personal subscription or the team token. In API mode, tier 3 runs them on the server-wide `ANTHROPIC_API_KEY`, which bills the operator's account, not the team's. Both are the silent cross-account fallback that the proposal itself rules out ("would bill a different account than the admin chose"). They succeed, so no error is raised and no "route not ready" state shows. Scheduled and MCP runs then spend money with no person watching, and the spend cannot be undone.
>    **Fix:** Keep an explicit record that the team chose `API_KEY`, either the `Team.captionRoute` column from open question 1 or a sticky flag set when the key is registered. When that record says `API_KEY` and no usable enabled `anthropic` row exists, throw the route-named error and show "route not ready" on `/team`. Never fall through to tier 3. Tier 3 should apply only to teams that never chose a route.
>    **Status:** upheld

### [WARN] party-security — The brief's own `copyProviderKey` outranks the admin's route, so an editor or a stale queued brief picks the billing account

**Quotes:**

> 1. The brief's explicit `copyProviderKey` row, if it is enabled and in the team (`registry.ts:59-65`).
>    The wizard stores `'cli'` when no key is given (`copyProvider.ts:23`), and an explicit key is existence-checked.
>    **Problem:** The route is presented as a per-team admin setting, but tier 1 lets a value on the brief override it. Editors author briefs, and a brief's stored value is read again later by scheduled entries. So an editor can send captions to any enabled team row, whatever the admin chose. A brief queued before the admin changed the route keeps billing the old route. The stored `'cli'` sentinel is the worst case, because the proposal does not say whether tier 1 treats `'cli'` as an explicit CLI choice. If it does, every wizard brief pins captions to the OAuth chain and the `API_KEY` setting has no effect on interactive runs. If it does not, the sentinel is ignored and the meaning of the field changes without notice. Either way, a value the admin does not control decides whose account is charged.
>    **Fix:** Decide the billing route from the team setting alone, at run time. If a brief-level key is kept (open question 8), accept it only when it matches the team's current route, and reject it otherwise. State that `'cli'` on a stored brief means "use the team route", not "force CLI".
>    **Status:** upheld

### [WARN] party-security — Exempting API-key runs from the Opus gate lets any caller spend the team's metered key on Opus

**Quotes:**

> - The Opus gate does not apply to an API-key caption run (open question 4).
> - The Opus "requires a personal token" gate (`resolve.ts:88-90`) is about the Claude OAuth tier. It should not apply to an API-key run.
>   **Problem:** The gate stops Opus from running on a shared team credential. A team's Anthropic API key is also a shared team credential, and it is billed per token, so the reason for the gate applies even more strongly here. With the exemption, every editor, every scheduled entry and every MCP caller (all of which pass no user) can run Opus captions on the team's key. Nothing bounds that spend, and a scheduled queue repeats it with no person present.
>   **Fix:** Treat an `API_KEY` caption run as credential tier `team` for the Opus gate. Allow Opus on the team key only through an explicit admin allowance on the team (for example, the team allow-list explicitly including Opus for the API-key route).
>   **Status:** upheld

### [WARN] party-security — The proposal admits a wrong route bills the wrong account, but nothing records which route ran

**Quotes:**

> - A draft caption already records the full model ID that ran (`claude-cli.ts:23`, `anthropic.ts:39`). It does not record the route.
> - Today `apiId` equals `cliArg` for every entry (`catalogue.ts:118-119`, `:143-144`, `:165-166`).
> - **Risk:** medium. A wrong route bills the wrong account, and the CLI-mode prod teams run captions on the OAuth chain today.
>   **Problem:** `apiId` and `cliArg` are equal, so the model ID stamp is byte-for-byte the same on both routes and says nothing about the route. The team's row can change after the draft is written, so working the route out from the current row is a guess (the proposal says so in open question 5). If a misroute happens, for example through the tier-3 fall-through above, the operator cannot tell which captions billed which account. The failure leaves no trace, so it cannot be found or reconciled.
>   **Fix:** Write the route, and the provider row id when it is `API_KEY`, onto the caption stamp at write time. Log the chosen route on every caption call, next to the model log. A column here is cheaper than an unresolvable billing dispute.
>   **Status:** upheld

### [NOTE] party-security — The new route-report seam exposes a team's credential routing and must be gated like the existing seams

**Quotes:**

> A test seam is needed that reports the chosen route, in the style of `GET /api/test/model-calls` (`src/lib/models/modelCalls.ts`).
> **Problem:** A route that reports which credential path a team's captions take tells a caller whether the team holds an API key and whether it relies on the OAuth chain. If the seam is reachable outside the mock setup, it leaks that.
> **Fix:** Gate it like `POST /api/test/scheduler-tick`: return 404 when `NODE_ENV==='production'`, return 404 unless `MOCK_AI` is set, require admin, and scope it to the caller's team. Add a test that asserts the 404 in a production build.
> **Status:** upheld
