### [BLOCK] party-ba — The pain the proposal names is not removed by it, and the proposal says so itself

**Quotes:**

> `CLAUDE.md` records that neither prod team has a team Claude token. In CLI mode their scheduled and MCP captions therefore fail on credentials.
> It would not fix the design step, which stays on the CLI (see Out of Scope), so a scheduled post would still need the team token. This change cannot fix prod's scheduled runs alone.
> **Problem:** The "Why it matters" section is built on scheduled and MCP runs failing on credentials. The same section concedes that, after this ships and works perfectly, those runs still fail, because the design step still needs the team token. What is left is a different problem: the `/team` UI contradicts the resolver. That problem is real, but it has a different owner and different stakes. The proposal never states it as the problem. No user is named who is blocked today and would be unblocked, and nothing says any team wants an Anthropic API key for captions. The "CLAUDE.md records" claim is cited to a memory file the panel cannot check. Nothing in the proposal gives the date or the method of that check.
> **Fix:** State the real problem, which is that the UI mislabels a working route. Or show a named team that would gain a working path from this change. Drop the scheduled-run framing, or state the proposal's own admission as a precondition.
> **Status:** upheld

### [WARN] party-ba — No acceptance criteria, and the main claim has no falsifiable check

**Quotes:**

> **To proceed:** Review this proposal and approve to begin planning.
> Replace the CLI-mode "Not used in CLI mode — safe to delete" text (`page.tsx:510-513`) with a statement of which route the team is on and why.
> A team that has an enabled default `anthropic` COPY row is on `API_KEY`.
> **Problem:** The proposal lists tests but no pass/fail criteria. The goal of making the route visible ("The user cannot see or choose the route") has no observation that would show it worked. "Honest" and "a statement of which route" can be satisfied by any text. The word "choose" is claimed as the problem, yet the recommended design (derive from the row) gives the admin no choice separate from registering a key. The proposal admits that an admin cannot hold a key without using it, and that is the "choose" the problem sentence promised.
> **Fix:** Write the acceptance criteria. For example: with an Anthropic COPY row in CLI mode, `/team` displays route API_KEY and a caption run uses the SDK provider. With no row, it displays CLI and runs on `claude -p`. A team with no row behaves byte-identically to today.
> **Status:** upheld

### [WARN] party-ba — "Route" and "default" each carry two meanings, and the behaviour is asserted without a cited check

**Quotes:**

> A team that has an enabled default `anthropic` COPY row is on `API_KEY`.
>
> 1. The brief's explicit `copyProviderKey` row, if it is enabled and in the team (`registry.ts:59-65`).
> 2. The team's enabled default COPY row (`registry.ts:66-69`).
>    That is today's order. The change is to name it and surface it, not to reorder it.
>    **Problem:** "Route" is used for two things. One is a per-team setting. The other is a per-brief outcome, because an explicit brief key can override the team row in step 1 of the resolution order. So a team shown as `CLI` on `/team` can still run a given brief on `API_KEY`, and the reverse. The `/team` state line then reports a team-level fact that a brief can contradict. It is also unclear whether "default" means the `isDefault` flag or just any enabled row. The bullet above requires "default", but `/team` today hides or shows the COPY slot on "has a COPY row". Two readings give two different builds of the helper `captionRouteFor(row, mode)`.
>    **Fix:** Define "route" as a per-run resolution with a team-level default, and say what `/team` shows when a brief overrides it. Say whether a non-default enabled anthropic row counts.
>    **Status:** upheld

### [NOTE] party-ba — Admin behaviour assumed, never established

**Quotes:**

> In CLI mode, tell the admin that registering an Anthropic COPY key switches captions off the OAuth chain.
> A silent fallback would bill a different account than the admin chose.
> **Problem:** The proposal assumes that team admins read the `/team` note and register a key deliberately. It also assumes that billing a different account is a harm they care about. It does not establish that admins hold Anthropic API keys, or that any team has asked to move captions off the OAuth chain. This is probably safe, but it is the only demand evidence offered for the feature.
> **Fix:** Name one team or admin who has asked for it, or mark it as speculative.
> **Status:** upheld
