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

### [WARN] party-visionary — A guard pinning `apiId === cliArg` would turn a latent bug into a constraint every future catalogue entry must meet

**Quotes:**

> - Unit: the route helper (row present or absent, mode, explicit key), the no-credential messages, and a guard that `apiId` and `cliArg` stay equal or that the route passes the right `arg`.
>   Should `ResolvedModel` take the route as an input, or should a guard test pin `apiId === cliArg`?
>   **Problem:** Withdrawn, see Status.
>   **Fix:** None.
>   **Status:** withdrawn — party-architect's second BLOCK shows that the alternative I pushed for, the route as an input to `arg` selection, is a new parameter on `resolveModel` that every CAPTION caller must compute and pass today. party-po shows that the divergence it guards against cannot happen yet. My objection assumed a guard whose failure says nothing. A guard whose failure message names the deferred decision ("API_KEY teams in CLI mode send cliArg to the SDK; make arg follow the route before these diverge") does not add cost. It moves the cost to the one change that triggers it, which would pay it anyway. That is a legitimate deferral, not a tax. The remaining contradiction between this branch and the In Scope line belongs to party-architect and party-po, who already filed it.

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
