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
