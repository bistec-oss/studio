### [WARN] party-security — The facts checklist is enforced only by the prompt, and the proposal sends it to unattended auto-publish runs

**Quotes:**

> - a short **content checklist** of measurable rules added to the caption and design prompts (for example Hiring: name the role and how to apply, never invent salary, location or benefits; Promotion: a price, discount or end date appears only if the brief states it, otherwise an open CTA).
> - **scheduled queue entries**: they carry a post style, which means they get an image style too (today they are always classic);
>   **Problem:** The checklist is the design's only protection against invented facts (prices, discounts, end dates, salaries, milestone numbers), and nothing checks it. It goes into the prompt, and the model decides whether it complied. Whether a fact was "stated" is also left for the model to judge. Scheduled entries can be SCHEDULE_PUBLISH or PUBLISH_NOW, so a made-up price or salary posted to LinkedIn or Instagram is public and cannot be undone. Nobody reviews the post first, and the only fix is deleting it by hand on each platform. A run where the model ignored the rule looks exactly like a run that followed it. Round 2: no seat argued against this. party-visionary's NOTE (store each rule as `{ id, scope, text, check? }`) is the data shape this fix needs. party-po's release cut (checklist first, queue reach later) would shrink the exposure but not remove it once the queue reach ships.
>   **Fix:** Check model output against the source after generation, without a model. Pull currency amounts, percentages, dates and bare numbers from the caption and the rendered headline text, and compare them with the brief, the campaign briefing and the kit text. If an auto-publish entry contains a value that appears in none of them, downgrade it to HOLD, record the reason on the queue entry, and do not publish. Interactive drafts get a visible notice instead.
>   **Status:** upheld

### [WARN] party-security — Unproven image styles go to unattended and machine surfaces, and a fallback there is never seen

**Quotes:**

> 5. **Scheduled entries gaining image styles:** today 009 forces classic for them on purpose. Confirm the hero fallback is acceptable unattended (it fails closed to classic, so the worst case is today's result).
>
> - Unit and E2E coverage; a real-model OP check of the new looks (like 009 OP-1), run by the user's decision
>   New image contracts may fail the pixel check often until tuned, but a failure already falls back to classic with no second image call.
>   **Problem:** The real-model check of the five new looks is optional ("by the user's decision"). Yet the same change lets scheduled entries, MCP and ACP pick those looks implicitly, through a post style's default image style. A look that has never been checked against real images can therefore auto-publish with no one watching. The fallback does fail closed, but it only shows up as a notice on the draft page, and nobody opens the draft page before an unattended publish. MCP and ACP callers are not told about it either. The proposal also expects fallbacks to be frequent ("may fail ... often until tuned"), so the degradation will be common and silent. Saying "the worst case is today's result" understates it: the hero image call is still paid for, and its image is reused in a layout it was not composed for. Round 2: party-architect's BLOCK confirms the proposal never says whether MCP/ACP lift the forced-classic rule, so it is unclear which surfaces are exposed. That supports this finding. party-po's WARN reaches the same remedy (keep unattended surfaces classic) from the cost side.
>   **Fix:** On scheduled, MCP and ACP runs, allow only image styles whose real-model check has passed, recorded per key in the dataset. Other keys resolve to classic there and log that they did. Record each fallback (and its observation) on the ScheduledGeneration row, and return it in the MCP/ACP generate response, so a degraded unattended run can be told apart from a healthy one.
>   **Status:** upheld

### [WARN] party-security — A post-style key that does not resolve has no closed failure, and "no style" quietly removes the facts checklist

**Quotes:**

> - **MCP / ACP generate**, which accept a post style key.
> - Storing the post style on the brief (and on scheduled queue entries); the goal is derived from it
>
> 1. **Existing briefs and queue entries with a goal but no post style:** map each old goal to the nearest style, or leave them as "no style" (today's behaviour)? Leaning: leave them; only new briefs get a style.
>    **Problem:** Post-style keys arrive from machine callers (MCP/ACP) and are stored for later runs (queue entries, campaign defaults) against a dataset that changes with each deploy. In this design, "no style" is a valid state that means today's behaviour. So the obvious way to handle a key that is unknown, misspelled or retired is to treat it as no style. That behaves like success while dropping the style's facts checklist and image style. On a queued auto-publish entry, this removes the only invented-facts guard without leaving any trace. Round 2: party-visionary's BLOCK makes the same retired-key point from the design-commitment side (the key is a long-lived contract). This finding covers the runtime side: what a run does when the key does not resolve. The two do not conflict, and either fix needs the other.
>    **Fix:** Validate the key against the dataset when it is written (400 on MCP/ACP, the queue routes and the campaign routes). At run time, a stored key that no longer resolves should make the entry fail or be held with a named `errorReason`, and should never auto-publish. Do not degrade it to no style. Retired keys stay resolvable, the same way image-style contract versions are kept immutable.
>    **Status:** upheld

### [WARN] party-security — The pixel check for the new archetypes has no stated property it measures, so it can pass everything

**Quotes:**

> 3. **The image styles are narrow.** 009 shipped two (`product-showcase`, `editorial-split`), dark-area only, and **neither supports 9:16**, so Story posts can never use one.
>
> - **Five new image styles:** light variants of Showcase and Editorial split (light area, dark text), plus three new looks: **Abstract brand forms**, **Full-bleed scene** and **Spotlight** (centred subject, top headline band, bottom CTA band).
>   **Problem:** The real-pixel check is the gate that makes a bad hero image fall back to classic. It was built for dark areas. The light variants reverse the polarity, and "Abstract brand forms" and "Full-bleed scene" have no separate hero region and no clear text band. Unless each contract names what is measured in which region, the check for those looks can be empty: nothing to compare, so every image passes. A gate that cannot fail is fail-open, and it looks the same as a healthy pass, including on unattended runs. Round 2: party-architect's two WARNs (pixel-check changes as co-changes; synthetic pass and fail fixtures per contract and size) describe the same gap as structure and test strategy. Their fixes and this one converge. This finding stays filed for the fail-open consequence: an empty check reads as a healthy pass on unattended runs. That point is not in their findings.
>   **Fix:** Each new contract should name the measured property per region and size: luminance polarity and contrast under each text region, and for full-bleed, legibility under the text area. Each archetype also needs at least one real-render negative fixture that must fail the check, asserted in unit tests next to the positive fixtures.
>   **Status:** upheld

### [NOTE] party-security — The recovery path for the migration and for the changes to every prompt is not stated

**Quotes:**

> Prompt changes alter every generation (versions bumped; render harness and mock E2E guard the shape, a real-model check guards the result).
> One additive migration (a post-style column on the brief, the queue entry and the campaign); old briefs have none and behave as today.
> **Problem:** The change alters what every new generation produces, and adds columns on three tables. The proposal does not say how an operator would undo either one. Because the change also enables auto-publish runs with styles, a regression would reach published posts before anyone notices it.
> **Fix:** Ship a manual down script in `prisma/rollback/`, as earlier changes did. State that reverting the deploy restores the old prompts, and that rows already written with a post style are ignored by the old code rather than breaking it.
> **Status:** upheld
