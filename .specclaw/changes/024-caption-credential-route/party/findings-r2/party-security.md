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
