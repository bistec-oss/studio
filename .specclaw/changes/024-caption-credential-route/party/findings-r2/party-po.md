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
