### [WARN] party-visionary — The Anthropic COPY row becomes both "the team's API key" and "the switch that moves captions off OAuth"

**Quotes:**

> Recommendation: reuse the existing `AvailableProvider` COPY row as the source of truth, and add no new column.
>
> - A team that has an enabled default `anthropic` COPY row is on `API_KEY`.
>   They use `resolveAnthropicApiKey` (`registry.ts:159-167`), which reads only the default `anthropic` COPY row, then `ANTHROPIC_API_KEY`.
>   **Problem:** Under the recommendation, one row answers two questions. It holds the key that `resolveAnthropicApiKey` hands the assistants, and its existence is also the caption route switch. Open question 7 already points at the next change: let the briefing assistant, brand-kit assistant, vision or refine verifier use a team Anthropic key in CLI mode, so those surfaces stop needing a Claude token. That change cannot give an admin "a key for the assistants, but captions stay on OAuth". Registering the row flips captions, and nothing else expresses intent. A later `Team.captionRoute` column then has to backfill from row existence, which means guessing whether each team registered its key to move captions or for some other reason. That guess gets worse with every row admins create after this merge, because the new `/team` copy teaches them that the row is the switch. A contributor building a per-team design route (Out of Scope says it would "need the SDK tool-use loop per team") will reach for the same row, because it is the only per-team route signal this change leaves behind. Open question 1 names the trade-off ("lets an admin hold a key without using it"). It does not name the cost of migrating out of the overload later, which grows with each team that registers a key after merge day.
>   **Fix:** If the derived route stays, say in the artifact that the row's presence is a route decision. Name the backfill rule a future explicit setting would use, so the migration out is designed now rather than inferred later. Otherwise take the column now, while every team's backfill is trivially `CLI` except the few that already hold a row.
>   **Status:** upheld

### [WARN] party-visionary — The recommended "derive the route from the stamp" cannot work, so every caption written after merge has no recoverable route

**Quotes:**

> Recommendation: derive the route from the stamp's provider where possible, and add no column.
> Today `apiId` equals `cliArg` for every entry (`catalogue.ts:118-119`, `:143-144`, `:165-166`).
>
> - **Risk:** medium. A wrong route bills the wrong account
>   **Problem:** By the artifact's own facts, the stamped model ID is the same string on both routes. Derivation from the model ID returns nothing, even for a draft written one second ago. Open question 5 calls derivation "only a best guess for old drafts". It is no guess at all for any draft. The one risk the artifact names is billing the wrong account. The first time someone has to answer "which account paid for this team's captions last month", the evidence will not exist for any draft written between this merge and whichever later change adds the column. That history cannot be backfilled: a one-way loss, accepted by default.
>   **Fix:** Either record the route next to the model ID when the caption is written, or state plainly that route attribution is given up for every draft until a future change adds it. Drop the derivation recommendation, which the catalogue facts above make impossible.
>   **Status:** upheld

### [WARN] party-visionary — A guard pinning `apiId === cliArg` would turn a latent bug into a constraint every future catalogue entry must meet

**Quotes:**

> - Unit: the route helper (row present or absent, mode, explicit key), the no-credential messages, and a guard that `apiId` and `cliArg` stay equal or that the route passes the right `arg`.
>   Should `ResolvedModel` take the route as an input, or should a guard test pin `apiId === cliArg`?
>   **Problem:** The catalogue carries two fields because the two strings are allowed to differ. The equality guard makes 024's correctness depend on them never differing. Picture the next change that adds a model whose CLI argument is an alias and whose API ID is a dated string. Its author meets a failing test whose name says nothing about catalogue shape, and either deletes the guard (the latent bug ships) or bends the entry to fit (the CLI path gets a less suitable argument). The "or" in Tests leaves this choice for the plan to make by default, though only one branch keeps the catalogue as open as 008 left it. In Scope already commits to "Model `arg` selection that follows the route", so the guard branch would also contradict the scope.
>   **Fix:** Settle open question 3 in the proposal: the route is an input to `arg` selection, and the test asserts that each route passes its own field. Rule the equality guard out by name.
>   **Status:** upheld

### [WARN] party-visionary — Stored brief keys become a second, persisted route source that an admin's `/team` change cannot reach

**Quotes:**

> Make the caption route an explicit per-team setting with two values.
>
> 1. The brief's explicit `copyProviderKey` row, if it is enabled and in the team (`registry.ts:59-65`).
> 2. **Brief `copyProviderKey`.** The wizard stores `'cli'` when no key is given (`copyProvider.ts:23`), and an explicit key is existence-checked.
>    **Problem:** The route is presented as a per-team setting, but tier 1 makes it per-brief as well, and briefs persist. Today the CLI-mode register form drops the COPY slot. Once it offers `anthropic` in CLI mode, CLI-mode briefs can begin to carry explicit keys, and scheduled entries hold those briefs for days or weeks. The next change likely to touch this surface is an admin moving a team back to `CLI`, or answering open question 8 with "briefs should not carry a key". It will find a population of stored briefs that still name the old row. Each one either falls through silently ("if it is enabled and in the team" implies a fall-through, which is the cross-route fallback open question 2 recommends against) or fails. The `/team` state line will report one route while queued posts run on another. The artifact leaves open question 8 open and does not record that every brief written meanwhile makes the eventual answer more expensive.
>    **Fix:** Answer open question 8 before merge. Either briefs stop carrying a route-bearing key (the team route is the only source), or the proposal states that stored brief keys override the team route and says what `/team` shows when queued work disagrees with it.
>    **Status:** upheld

### [NOTE] party-visionary — The helper is named for one surface, though the next two changes in view need the same decision for other surfaces

**Quotes:**

> A small pure helper (for example `captionRouteFor(row, mode)`) returns `'CLI' | 'API_KEY'`, and `/team`, `resolveCopyProvider` and `copyProviderIsClaude` (`registry.ts:91-94`) all use it. 7. **Other COPY consumers.** Should the briefing assistant, brand-kit assistant, vision and refine verifier follow the team's route, so a team on `API_KEY` does not also need a Claude token for them?
> **Problem:** 008 already models calls by surface (`resolveModel` on the `CAPTION` surface). A route helper keyed the same way, `routeFor(surface, team, mode)` with only `CAPTION` live, costs nothing extra here. The open question 7 follow-up would then add surfaces to it instead of writing a second helper that reads the same row with slightly different rules. A later per-team design route would extend it the same way. As named, `captionRouteFor` guarantees that whichever change comes next forks the concept.
> **Fix:** Key the helper and its `/team` state line by 008's surface enum, with only `CAPTION` routed in this change.
> **Status:** upheld
