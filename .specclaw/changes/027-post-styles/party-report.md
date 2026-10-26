# Party Report: 027-post-styles

**Reviewed:** 2026-10-24
**Tier:** deep (classifier) — It adds a post-style column to the brief, queue entry and campaign tables, and four open questions (how old goal-only briefs map, separate light-variant keys, whether a General style exists, and where the checklist sits relative to the briefing and kit voice) would each change what gets built, so it is deep despite the proposal's own 'large' claim being the only reason it is not thin.
**Panel:** party-po(sonnet), party-architect(opus), party-ba(sonnet), party-security(opus), party-visionary(opus)
**Verdict:** CHANGES_REQUESTED

## Summary

29 findings: 3 BLOCK, 19 WARN, 5 NOTE upheld — 2 withdrawn

## Findings

### [BLOCK] party-architect — Style-to-defaults resolution is placed in the wizard pre-fill, but three non-wizard surfaces need the same resolution and no shared resolver is named

**Quotes:** > - a **default tone**: the Tone picker stays and is pre-filled; the user can change it;
**Quotes:** > - a campaign's **default post style**, which pre-fills the wizard the way its default tone does today;
**Quotes:** > - **scheduled queue entries**: they carry a post style, which means they get an image style too (today they are always classic);
**Quotes:** > - **MCP / ACP generate**, which accept a post style key.
**Quotes:** > One additive migration (a post-style column on the brief, the queue entry and the campaign); old briefs have none and behave as today.
**Problem:** The artifact describes turning a post style into a tone and an image style only as a wizard pre-fill. That is client-side behaviour, and the user's override is stored on the brief. Scheduled entries, MCP and ACP have no wizard, yet they "get an image style too". The migration adds only a post-style column to the queue entry, so the queue's image style (and tone) must be worked out from the style somewhere else, probably at generation time. As written, that makes at least two resolvers of the same mapping: the wizard's pre-fill and a server-side derivation for queue, MCP and ACP. They will diverge on precedence, which the artifact never states. A campaign can carry both a default tone and a default post style whose own default tone differs. Which wins? Does an explicit MCP tone or imageStyle input override the style? Does MCP/ACP still force classic? The scope lifts the classic force only for "scheduled entries may now use an image style". A wizard brief and a queue entry with the same style and campaign can come out with different tone and image style. Round 2: party-ba's precedence finding and party-security's unattended-surface findings confirm that the precedence and the per-surface image-style rule are both undefined. One named resolver is the place to define both, so this finding stands.
**Fix:** Name one pure server-side resolver in the post-style dataset: (style, campaign defaults, explicit inputs, path, aspect ratio) → (goal, tone, imageStyle). Have the wizard pre-fill, the briefs route, the queue runner, MCP and ACP all call it. State its precedence order and whether MCP/ACP lift the forced-classic rule.
**Status:** upheld

### [WARN] party-architect — The goal column keeps a writer of its own, and a no-style brief has no goal source once the picker is gone

**Quotes:** > Replace the **Goal** picker with a **Post style** picker.
**Quotes:** > - Storing the post style on the brief (and on scheduled queue entries); the goal is derived from it
**Quotes:** > - Removing the `goal` column (it stays, derived from the style)
**Quotes:** > 3. **A "General" style** for posts that fit none of the seven: needed, or does "no style" (today's Goal/Tone behaviour) cover it?
**Problem:** After this change `goal` is a stored column that is also implied by `postStyle`. The artifact does not say who writes it: the client after deriving, or the server from the style key. It also does not say whether the brief, queue, MCP and ACP inputs still accept a `goal` field, or what happens when a caller sends a goal that contradicts its style. If any of them still accepts one, the column has two writers. Open Question 3 also leans towards "no style" keeping "today's Goal/Tone behaviour". But the Goal picker is removed, so a new no-style brief has no input that sets its goal. The leaning and the replacement cannot both hold. Two implementers would build different input contracts. Round 2: party-visionary (long-horizon meaning of the column) and party-po (keeping the picker) reached the same contradiction from their own lenses. This finding keeps the merge-time part: which writer, and which input fields.
**Fix:** State that the server is the only writer of `goal`, derived from the style key, and that `goal` is rejected (or ignored, said explicitly) as an input on every brief-creating surface. Resolve OQ3 so that a no-style brief has a defined goal value, or keep the Goal picker visible only when no style is chosen.
**Status:** upheld

### [WARN] party-architect — The checklist reaches four first-generation prompt builders; the regenerate and refine rebuilds are neither in scope nor excluded

**Quotes:** > - Prompts: caption, Path B design, background, and the Path A fill receive the style's checklist; prompt versions bumped
**Quotes:** > On Path A (template) the style drives the caption's goal, tone and checklist, and the design fill gets the checklist's on-image rules; the template still fixes the look.
**Problem:** The co-change list names the prompts that run at first generation. A draft is then reworked through further model passes: regenerate caption, regenerate design and refine. The artifact names none of them, in scope or out of scope. If a later pass builds its prompt along its own path, the facts rules ("never invent salary", "date only if stated") apply at generation and drop away on the next pass. Whether these paths are covered is left to the implementer. No round-1 finding addresses this.
**Fix:** List each regenerate and refine prompt site as receiving the checklist, or exclude it in Out of Scope with the reason.
**Status:** upheld

### [WARN] party-architect — The new looks change what the real-pixel check measures, but the artifact treats them as dataset rows

**Quotes:** > 3. **The image styles are narrow.** 009 shipped two (`product-showcase`, `editorial-split`), dark-area only, and **neither supports 9:16**, so Story posts can never use one.
**Quotes:** > - **Five new image styles:** light variants of Showcase and Editorial split (light area, dark text), plus three new looks: **Abstract brand forms**, **Full-bleed scene** and **Spotlight** (centred subject, top headline band, bottom CTA band).
**Quotes:** > - **9:16 for every image style**, including the two existing ones (each gets a new contract version with a STORY layout; existing versions are immutable).
**Problem:** The artifact says the shipped styles are "dark-area only". The light variants need the pixel check to judge the opposite polarity (a light area under dark text). A full-bleed scene has no reserved image band, so whatever the check verifies for it is a new kind of rule, not new numbers. Each of these is a change to the check itself, and to the stamp's vocabulary for it, landing in the same commit. The artifact counts them only as "new archetypes". Separately, the problem statement says Story posts "can never use one". Whatever enforces that today, in the wizard picker and in brief validation, must be lifted in the same commit, and the scope does not name it. Without that, the new STORY contracts are unreachable. Round 2: party-security's fail-open finding is the hostile-failure side of the same gap. This finding is the co-change side, so both stand.
**Fix:** Under Scope, list the pixel-check changes (light polarity, a full-bleed rule) and the removal of the existing 9:16 gate in the wizard and on the brief input as co-changes.
**Status:** upheld

### [WARN] party-architect — "Passes the real-pixel check at every size" has no deterministic test seam named for five new looks across three sizes

**Quotes:** > each passing the real-pixel check at every size it declares
**Quotes:** > - Unit and E2E coverage; a real-model OP check of the new looks (like 009 OP-1), run by the user's decision
**Quotes:** > New image contracts may fail the pixel check often until tuned, but a failure already falls back to classic with no second image call.
**Problem:** The only check named against real images is an optional OP run that needs a live model. The mock E2E path cannot test pixels, because the mocks never produce real images. The artifact does not say what images the scope line's check runs against at merge. For seven contracts across up to three sizes (two existing, each gaining STORY, plus five new), it names no fixture set per contract and size. Without one, the scope line is unverifiable at merge, and the check could fail on every new look in CI without anyone noticing. The fallback to classic hides this, so the E2E suite still passes. Round 2: party-security's fix (a negative fixture per archetype) fits into the fixture set asked for here.
**Fix:** Name a deterministic fixture set (synthetic pass and fail images per contract per size) run by the render harness. Make that the merge-time gate, and keep the real-model OP check as a separate tuning step.
**Status:** upheld

### [NOTE] party-architect — Coupling fact on party-po's cut line: the post-style table cannot ship without the new image looks unless five of its seven defaults change

**Quotes:** > | Promotion / deal | conversion | Bold | Spotlight | offer, price, % and end date only if stated; else open CTA |
**Quotes:** > | Hiring | hiring | Professional | Full-bleed scene | role named; how to apply; no invented salary, location or perks |
**Quotes:** > - a **default image style** for Path B: the image-style picker stays and is pre-filled; the user can change it;
**Problem:** party-po's BLOCK proposes a first release of "the dataset, the wizard picker, the checklist in the prompts and one brief column" with "no new image styles". As tabled, the dataset's default-image-style field points at Spotlight, Full-bleed scene and Abstract brand forms for five of the seven styles (Promotion, Event, Hiring, Tip, Milestone). None of these exists until the new archetypes land. A dataset that validates its default image style against the image-style keys, as a client-safe dataset in `src/lib/designData/` would, cannot compile those rows without them. This is a coupling fact, not a view on release order: the cut party-po describes is structurally possible only if those five defaults are set to `classic` (or the field is made optional) in that release, and the table changes when the looks arrive. A split that leaves the table as written half-lands.
**Fix:** If the panel adopts any split, the proposal states the interim default image style for each row whose look is not yet built, and says where the dataset checks that every default names an existing key.
**Status:** upheld

### [WARN] party-ba — The central claim, that Goal and Tone "mean almost nothing to the model", is asserted from one analogy and never tested

**Quotes:**

> **Goal and Tone are two loose dropdowns that mean almost nothing to the model.**
> The project's own lesson from the IRP fixes is that **adjectival instructions don't stick and measurable ones do**, and these two fields are exactly the adjectival kind.
> **Problem:** The proposal offers no observation of a bad post caused by Goal or Tone. It cites no case where the model ignored `Goal: engagement`, and no user complaint. The only support is an analogy to a different failure: the IRP fixes were about layout and naming rules written for one campaign. The real pain may be missing facts rules (inventing dates, prices or perks). Problem 2 says those rules exist only where someone hand-wrote them into a briefing. If so, the problem is "no default do-not-invent checklist". A new picker, seven presets and five new image looks is a much larger answer to that than the evidence supports. After shipping, nothing in the artifact shows that posts would be better, or that the Goal dropdown was the cause.
> **Fix:** Cite a real failure or a user request (draft IDs, a count, who asked). Or state that the checklist is the real problem and Goal replacement is incidental.
> **Status:** upheld

### [WARN] party-ba — "The user thinks in what a post is for" assumes a user behaviour that is not established

**Quotes:**

> **The user thinks in what a post is for, not in goal plus tone plus look.**
> Today the user assembles that from three separate pickers
> **Problem:** There is no source for how the marketing team picks Goal, Tone and image style today. It never says whether they find three pickers hard. It also never says whether they would choose one of exactly these seven styles. The table's rows come from a user decision on 2026-10-24, but the proposal does not say whether that decision came from observed use. The risk is concrete: a post that fits none of the seven (OQ3) either gets forced into a wrong style, or loses the Goal picker with nothing in its place. The sufferer is named, but their behaviour is assumed.
> **Fix:** Say who picked the seven styles and on what basis, for example past briefs by goal. Or mark the list as a hypothesis, and add an acceptance check that styles are actually chosen.
> **Status:** upheld

### [WARN] party-ba — Problem 3 motivates new looks with a limit that only partly applies, and the "scheduled posts" gap is not tied to any need

**Quotes:**

> **The image styles are narrow.** 009 shipped two (`product-showcase`, `editorial-split`), dark-area only, and **neither supports 9:16**, so Story posts can never use one. Scheduled, MCP and ACP briefs are always classic.
> Five new image styles: light variants of Showcase and Editorial split
> **Problem:** "Narrow" is a judgement. The proposal gives no usage data on how often styles are chosen, how often Story is used, or how often a user wanted a light area. The 009 OP-1 result in the project context shows styled renders preferred, but this proposal does not cite it, so the case for five more looks has no evidence on the page. "Always classic" for scheduled briefs was a deliberate 009 choice. The proposal does not say anyone needs it reversed, and OQ5 admits it is unconfirmed. Three different problems (goal and tone semantics, purpose presets, image variety) are bundled as one, so no single sentence names what would still hurt if the change shipped and worked.
> **Fix:** Tie each new look and each new surface to a stated need. Otherwise drop the ones without one.
> **Status:** upheld

### [WARN] party-ba — No acceptance criteria, and the main claim has no way to fail

**Quotes:**

> Unit and E2E coverage; a real-model OP check of the new looks (like 009 OP-1), run by the user's decision
> **The OP check budget:** how many real renders per new look (009 OP-1 used 6 briefs × 6 briefs × 2 styles).
> **Problem:** The proposal contains no pass bar. The OP check is named but has no threshold. 009 OP-1 had a stated bar of 4 of 6, and this proposal does not carry one over. The central benefit, that checklists reduce invented facts and that captions follow the style, has no test and no measure. "each passing the real-pixel check at every size it declares" tests layout only. It cannot show that a style made the post better, or that a checklist rule held. Nothing would make the headline value claim fail at ship time.
> **Fix:** State a falsifiable bar. An example: on N briefs per style with no stated date or price, zero posts contain an invented date or price, compared against today's Goal/Tone output.
> **Status:** upheld

### [WARN] party-ba — "Default" and "pre-filled" carry two meanings, and the conflict with campaign tone is unresolved

**Quotes:**

> a **default tone**: the Tone picker stays and is pre-filled; the user can change it;
> a campaign's **default post style**, which pre-filled the wizard the way its default tone does today;
> **Where the checklist lives in the prompt** relative to the campaign briefing and the kit voice prompt, and which wins on a conflict
> **Problem:** There are now up to three sources for tone (style default, campaign default tone, the user's pick). The text never says which wins when a campaign has a default tone and a default post style whose tone differs. "Pre-filled" could mean the style overwrites the tone on every style change, or fills only an empty field. These give different builds, and the first silently discards a user's tone pick. "Goal ... derived from it" also leaves open what happens to old and unstyled briefs and campaigns (OQ1). Whether the checklist outranks the briefing is left open, and that decides whether "no invented dates" can actually hold. The proposal's stated purpose depends on it.
> **Fix:** Define the precedence order among campaign tone, style tone and the user's choice. Say whether a style change overwrites a manually chosen tone. Resolve OQ4 before planning.
> **Status:** upheld

### [NOTE] party-ba — "Path A's design prompt does not receive them at all" is a factual claim about code that the proposal does not source

**Quotes:**

> Path A's design prompt does not receive them at all.
> **Problem:** This is stated as fact and justifies applying style to Path A. I cannot check it from the artifact alone. If it is wrong, the Path A scope row changes.
> **Fix:** Cite the file and prompt builder this was read from.
> **Status:** upheld

### [BLOCK] party-po — Scope bundles six separable features, and the proposal never prices a cheaper first cut

**Quotes:**

> Replace the **Goal** picker with a **Post style** picker.
> **Size:** architectural (a new dataset other surfaces depend on; a brief field; new image contracts across three sizes; four surfaces)
> **Files affected:** about 35 to 50 (dataset, wizard, briefs route, queue, campaign forms, MCP/ACP, four prompt builders, designData, tests)
> **Problem:** The proposal is large (35-50 files, an additive migration, seven new image contracts) and ships as one unit. Its core value is the content checklist: the measurable "never invent salary, date or price" rules. A much smaller variant captures that value: a code-owned post-style dataset (goal, tone, checklist), a wizard picker that pre-fills Tone, and the checklist injected into the caption and design prompts. It needs no new image styles, no 9:16 contracts, no queue, campaign, MCP or ACP surfaces. The proposal never describes this variant or says why it is not the first release.
> **Fix:** Name the cut lines. Release 1 is the dataset, the wizard picker, the checklist in the prompts and one brief column. Release 2 is the STORY layouts and the new image looks, gated by a real-model check. Release 3 is the campaign default, queue, MCP and ACP reach, and only if usage shows demand.
> **Status:** upheld

### [WARN] party-po — Do-nothing option is never priced

**Quotes:**

> **The user thinks in what a post is for, not in goal plus tone plus look.**
> **The image styles are narrow.** 009 shipped two (`product-showcase`, `editorial-split`), dark-area only, and **neither supports 9:16**, so Story posts can never use one.
> **Problem:** The problem section describes inconvenience but gives no rate and no consequence. It does not say how often Story posts are made, how often users mis-set Goal or Tone, or how often an invented fact has reached a post.
> **Fix:** State one measurable cost of doing nothing for each of the three problems. If a problem has none, drop its scope.
> **Status:** upheld

### [WARN] party-po — Scheduled, MCP and ACP reach and campaign default carry no stated value

**Quotes:**

> **Post styles reach every surface (user decision):**
> **scheduled queue entries**: they carry a post style, which means they get an image style too (today they are always classic);
> **MCP / ACP generate**, which accept a post style key.
> **Problem:** Unattended surfaces would now run hero image generation, spending extra image calls and seconds on every entry with nobody watching. The proposal gives no per-entry cost number. Open Question 5 concedes the unattended behaviour is unconfirmed. Three more surfaces, each needing its own tests, are in scope with no value stated for them. The "user decision" label records who chose it, not what it returns. Pricing it is still my job.
> **Fix:** Ship the web wizard first. For the unattended surfaces, carry the checklist only (no image cost) and keep them classic until a request appears. State the added image calls and seconds per entry if an image style is enabled there.
> **Status:** upheld

### [WARN] party-po — Running cost of seven new image looks and the real-model check is unbounded

**Quotes:**

> each passing the real-pixel check at every size it declares
> a real-model OP check of the new looks (like 009 OP-1), run by the user's decision 6. **The OP check budget:** how many real renders per new look (009 OP-1 used 6 briefs × 2 styles).
> **Problem:** Seven archetypes at up to three sizes is about 21 contracts, each tuned against real pixels. Matching 009's OP-1 per look would mean roughly 40 to 80 real renders, and no number is given. Every post that uses a style also runs the hero step (11 to 22 s unset on 009's numbers), with no stated recurring cost.
> **Fix:** Cap the OP budget at a stated number of renders. Declare only the sizes each look is needed at. State the added image calls per generation.
> **Status:** upheld

### [NOTE] party-po — Defaults on upgrade and the Goal picker removal

**Quotes:**

> Leaning: leave them; only new briefs get a style. 3. **A "General" style** for posts that fit none of the seven: needed, or does "no style" (today's Goal/Tone behaviour) cover it?
> **Problem:** Replacing the Goal picker removes a working control before the replacement is proven. A user whose post fits none of the seven styles loses the ability to set a goal. The "leave old briefs unstyled" lean is the right cheap default. Pre-filling Tone from each style also silently changes what users get on first use.
> **Fix:** Keep the Goal picker visible, collapsed or secondary, until the style picker is shown to cover most posts. Or add "No style" as an explicit first option that keeps Goal and Tone as they are today.
> **Status:** upheld

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

### [BLOCK] party-visionary — The post-style key becomes a persisted, published vocabulary, and the proposal already expects the change that will have to break it

**Quotes:**

> - Team- or brand-kit-editable post styles (code-owned for now)
> - **MCP / ACP generate**, which accept a post style key.
> - 006 analytics: the post style recorded where the brief's image style is recorded today (imported vocabulary)
>   **Risk:** medium. Prompt changes alter every generation (versions bumped; render harness and mock E2E guard the shape, a real-model check guards the result). New image contracts may fail the pixel check often until tuned, but a failure already falls back to classic with no second image call. One additive migration (a post-style column on the brief, the queue entry and the campaign); old briefs have none and behave as today.
>   **Problem:** "For now" names the next change on this surface: team-editable post styles. Before that change arrives, a bare code key such as `hiring` will be written in five places that a later migration cannot simply rewrite. Three are database columns: Brief, ScheduledGeneration and Campaign. The fourth is the MCP/ACP generate contract, which external clients holding `bstk_` keys hard-code. The fifth is the 006 event store, which is append-only history kept for 180 days. Once team styles exist, a stored `hiring` could mean the code style or a team's own row. That change then has three options, none cheap: build a two-namespace string grammar, migrate three columns to a foreign key while keeping old MCP clients working, or reserve the code names forever. The proposal never calls the key a long-lived contract, and it gives no rule for renaming or retiring a style. Round 2 note: party-security's WARN covers what happens at run time when a stored key no longer resolves, and that half is theirs. This finding is about the decision that cannot be reversed: an un-namespaced key published to external clients and to history. PO's cut lines, which keep the key on the brief only in release 1, would postpone that door but would not remove it.
>   **Fix:** Before shipping, state the key's contract in the proposal: keys are permanent and never reused. Give the key format a namespace now, for example a `system:` prefix or a separate `source` column, so team-owned styles can arrive later without a remap.
>   **Status:** upheld

### [WARN] party-visionary — No stamp records which version of a post style a draft or a pending queue entry used

**Quotes:**

> **Owned in code (user decision):** the post styles are a versioned, client-safe dataset next to the image styles, like 009 and 007. They are not team-editable in this change.
>
> - **scheduled queue entries**: they carry a post style, which means they get an image style too (today they are always classic);
> - Prompts: caption, Path B design, background, and the Path A fill receive the style's checklist; prompt versions bumped
>   **Problem:** The proposal calls the dataset "versioned", but it stores only the key, and it names no per-draft stamp for the post style. Compare 009's `composition` stamp or `promptVersion`. The next plausible change is tuning the Hiring or Promotion checklist after the OP check. That edit lands in the dataset, not in a prompt builder, so nothing forces anyone to bump `PROMPT_VERSION`. Three things follow. A queue entry planned weeks ahead generates under rules its planner never saw. Drafts from before and after the edit look the same in the database. The 006 insights page groups both under one key. Round 2 note: party-architect filed the merge-day half of this (the word "versioned" has no contract behind it). Their option (b), "the prompt-version bump is the only record", is the one this finding argues against for the long run. It leaves a pair, the dataset contents and `PROMPT_VERSION`, that every future checklist edit must keep in sync by hand, and nothing fails when one is edited without the other.
>   **Fix:** Stamp the post-style key and its version on Draft and DraftRevision, the way `composition` is stamped. Or derive the prompt version from the dataset version so one edit cannot happen without the other. Decide whether a queue entry pins a version or always takes the latest, and say so in the proposal.
>   **Status:** upheld

### [WARN] party-visionary — `goal` becomes a field with two meanings: chosen by the user before 027, derived from the style after it

**Quotes:**

> - Storing the post style on the brief (and on scheduled queue entries); the goal is derived from it
> - Removing the `goal` column (it stays, derived from the style)
>
> 1. **Existing briefs and queue entries with a goal but no post style:** map each old goal to the nearest style, or leave them as "no style" (today's behaviour)? Leaning: leave them; only new briefs get a style.
>    **Problem:** Under the leaning answer to OQ1, `Brief.goal` holds a value the user chose on old rows and a value copied from the dataset on new rows. On new rows it also freezes the style's goal as of the day the brief was written. If a later change moves Milestone from awareness to engagement, the column and the dataset disagree, and nothing reports it. Two future changes will trip on this: grouping 006 insights by goal, and finally dropping the column. Each has to work out which rows' `goal` can be trusted, and nothing in the schema says. Round 2 note: party-architect's fix (the server is the only writer, and goal is rejected as an input) settles the writer question for new rows. It does not settle the split in meaning across history. A server-only writer still leaves the pre-027 rows as user choices and the post-027 rows as derived snapshots. This is the same shape as the 2026-07-28 `status` overload that the project wrote down as a lesson.
>    **Fix:** Pick one rule and put it in the proposal. Either `goal` is not written when a style is set and readers derive it from the style, or the column is explicitly a snapshot and something marks which rows were user-chosen. In both cases, adopt architect's rule on MCP/ACP `goal` input.
>    **Status:** upheld

### [WARN] party-visionary — The relabel-but-keep-the-key precedent, plus OQ2's `showcase-light`, leaves the Showcase family with two key grammars from its first addition

**Quotes:**

> - **`product-showcase` is relabelled "Showcase"** (one hero subject: a product, a place or an object). The stored key stays, so existing briefs and stamps keep working.
>
> 2. **Light variants:** separate keys (`showcase-light`) in the image-style picker, or a light/dark toggle beside it? Leaning: separate keys, so the stamp and the pixel check stay one contract per key.
>    **Problem:** The family's dark member is `product-showcase` and its light member is `showcase-light`. The editorial pair will presumably be `editorial-split` and `editorial-split-light`. A contributor adding the next variant, such as a light Spotlight or a light Full-bleed scene, will find no single pattern to follow. Any later change that groups by family or by tone must keep a hand-written alias table. Two examples are an analytics rollup of "Showcase, either tone" and the light/dark toggle that OQ2 sets aside for now. The precedent is sound on its own, since stored keys never change and only labels do. Applied here, though, it means keys and labels drift further apart with every variant. Because these keys are permanent (stamped on drafts and revisions), the first naming is the one that lasts.
>    **Fix:** Since keys are permanent, name the new keys so they form a pattern (for example `product-showcase-light`), or make light/dark a separate stored attribute. Record the key-naming rule in the dataset itself.
>    **Status:** upheld

### [NOTE] party-visionary — The checklist is one step from being a machine-checkable rule set and stops at prose

**Quotes:**

> - a short **content checklist** of measurable rules added to the caption and design prompts (for example Hiring: name the role and how to apply, never invent salary, location or benefits; Promotion: a price, discount or end date appears only if the brief states it, otherwise an open CTA).
>   **Post styles apply on both paths.** On Path A (template) the style drives the caption's goal, tone and checklist, and the design fill gets the checklist's on-image rules; the template still fixes the look. On Path B it also picks the default image style.
>   **Problem:** The proposal already splits rules into caption rules and on-image rules, and calls them measurable. Several can be checked after generation. "Role named" and "headline contains the news" are text-presence checks, and "price, date or salary only if the brief states it" compares the output against the brief. If each rule were a structured entry with a stable id, a scope and an optional predicate, three later changes would come almost free: a post-generation verifier, a per-rule pass rate in 006 insights, and the 007 detector confirming that a new checklist is measurable. Round 2 note: party-security's WARN asks for exactly such a post-generation check on unattended runs. A structured checklist is what lets that check be driven per style from the dataset, instead of being a separate, generic number-extractor that must later be kept in step with the prose rules.
>   **Fix:** Store each checklist rule as `{ id, scope: 'caption' | 'image', text, check? }` in the dataset, even if this change only renders `text` into prompts.
>   **Status:** upheld

## Dissent

_Withdrawn findings. The severity token is prefixed WITHDRAWN so these do not count as live findings._

### [WITHDRAWN WARN] party-architect — The post-style dataset is called "versioned", but nothing records which version a brief used

**Quotes:** > **Owned in code (user decision):** the post styles are a versioned, client-safe dataset next to the image styles, like 009 and 007.
**Quotes:** > One additive migration (a post-style column on the brief, the queue entry and the campaign); old briefs have none and behave as today.
**Problem:** The image styles are versioned through immutable contract versions and a stamp. For post styles, the migration adds only a key column. If a style's checklist or default tone changes in a later version, nothing stored says which version shaped a brief or a pending queue entry. A queue entry written today and generated after the change gets the new rules. The word "versioned" therefore has no contract behind it. One implementer will add a version stamp and another will rely on the prompt-version bump alone.
**Fix:** State whether the post-style version is stamped (and on which row), or drop "versioned" and say the prompt-version bump is the only record.
**Status:** withdrawn — party-visionary's WARN ("No stamp records which version of a post style a draft or a pending queue entry used") is the same finding, more fully argued. Its harm is the next checklist edit and its drift against PROMPT_VERSION. That is a post-merge consequence and belongs to party-visionary. At merge, the gap here is only an ambiguous adjective, so keeping a duplicate costs the panel without adding anything.

### [WITHDRAWN WARN] party-visionary — "Every image style at every size" makes the next size, or the next image style, cost seven or more tuned layouts

**Quotes:**

> - **9:16 for every image style**, including the two existing ones (each gets a new contract version with a STORY layout; existing versions are immutable).
> - Image styles: STORY layouts for both existing archetypes, the "Showcase" relabel, five new archetypes (light Showcase, light Editorial split, Abstract brand forms, Full-bleed scene, Spotlight), each passing the real-pixel check at every size it declares
>   **Problem:** After this change there are seven image styles across three sizes, and the precedent is that every style covers every size. A new post size, or one more image style, would then cost a full set of tuned layouts before it could ship.
>   **Fix:** Say that a style declares the sizes it supports, and define the fallback when a post style's default image style does not support the brief's size.
>   **Status:** withdrawn — On a second reading, the scope line already says "at every size it declares", which is the per-style size declaration this finding asked for. So a future size can arrive with partial coverage, and no tuning cost is forced on it. The remaining gap, the fallback when a post style's default image style lacks the brief's size, is covered by party-architect's BLOCK, whose single resolver takes the aspect ratio as an input. PO's WARN covers the remaining cost question.
