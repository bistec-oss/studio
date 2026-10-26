### [BLOCK] party-po — Seven looks and 17 contracts are bought up front with no cheaper cut line, and no use data justifies five of them

**Quotes:**

> Five new looks (`product-showcase-light`, `editorial-split-light`, `abstract-forms`, `full-bleed-scene`, `spotlight`), each at SQUARE, PORTRAIT and STORY.
> OP-1 showed the styled looks are wanted
> It covered two looks at two sizes; it says nothing about the new ones.
> **Problem:** The only evidence of value is OP-1 on two looks. Five more looks at three sizes each means 15 new contracts plus 2 STORY additions. Each contract needs a pass fixture, a fail fixture, prompt wording, tuning and a real-image render. The proposal's own Open Question 4 asks whether fewer sizes would do, but it never prices the cheaper variant. The cheapest variant that captures the stated value is phase b1, which does two things:

- Add STORY to the two existing looks. This is a data row each, and it is the user's explicit problem 1.
- Ship one or two new looks that fix the "six of eight styles default to classic" problem. Full-bleed scene (Event, Hiring) and Spotlight (Promotion, Milestone) between them cover four of the six classic-default rows.

The `-light` variants, Abstract forms and the General question could wait for usage data. The proposal has no cut line and treats all seven looks as one change. Its own estimate is about 25 files and "large", so this should be split.
**Fix:** Name a cut line. Either ship STORY plus Full-bleed and Spotlight first, with the other three looks as a follow-up after the insights show fallback rates, or state why the full set cannot be sequenced.
**Status:** upheld

### [WARN] party-po — The unattended-surface gate costs the whole real-image check and returns value only to a path the user did not size

**Quotes:**

> **Hard cap: 34 hero image calls**; the runner refuses to go past it.
> Scheduled, MCP and ACP posts are always classic
> A contract passes when its render keeps the style (no fallback) and the user marks it acceptable.
> **Problem:** The 34-call real check, plus operator time to judge 17 renders, exists mainly to populate the `realCheck` allow-list that unlocks scheduled, MCP and ACP use. The proposal gives no number for how many unattended posts exist or would use a look. It also gives no price for the cheaper alternative, which is to leave unattended surfaces classic and skip the allow-list. That alternative removes the `realCheck` record, the `unproven-classic` note and the resolver branch. The interactive surface already has a fail-closed fallback. Two weaknesses compound this:

- The pass bar is "the user marks it acceptable" on one render per contract, which is a single sample and barely evidence.
- The 34-call figure assumes at most one re-run per failing contract, but the proposal states no expected failure rate.

The cost is a one-off, so it is bounded. The unstated part is the operator attention for 17 or more judgments.
**Fix:** State the value of unattended looks, such as how many queue entries are expected. Consider deferring the allow-list to a later change that ships only the looks interactive users actually pick. Otherwise state the operator time budget.
**Status:** upheld

### [WARN] party-po — Shipped defaults silently move six post styles onto unproven looks, and no running cost is stated for the slower render

**Quotes:**

> **Post-style defaults move** in a new post-style version (`versions[2]`, never an edit): Promotion → Spotlight, Event → Full-bleed scene, Hiring → Full-bleed scene, Tip → Abstract brand forms, Milestone → Spotlight.
> It takes longer: 11 to 22 s with `IMAGE_QUALITY` unset, on OP-1's numbers.
> **Problem:** A user who never edits anything gets five post styles that previously rendered classic and now render a hero image look on every interactive brief. That is a latency and behaviour change on upgrade. The look is unproven when the default moves, because the real check is a one-off tuning step and not a merge gate. The proposal's "no new call" claim hides this change: classic Path B already makes a background image call, but the hero replaces it, and a failed pixel check wastes the hero generation and reuses it as classic. The fallback rate for the new contracts is unknown, so the expected per-post cost is unstated. OP-1 saw 2 of 12 renders record layout-violation observations. The "recurring cost" section covers only the happy path. The default move also bumps `PROMPT_VERSION`.
> **Fix:** Keep the new defaults unchanged until a look has a `realCheck` record. Make the defaults conditional on that record, or ship new looks as opt-in picks first. State the expected fallback rate and the wasted-call cost.
> **Status:** upheld

### [NOTE] party-po — Insights fallback section is optional scope with the answer already listed as an open question

**Quotes:**

> - Fallback outcomes per look on `/admin/insights`.
>
> 5. **Insights:** is a fallback-rate-per-look section on `/admin/insights` wanted now, or is the composition stamp enough until there is usage?
>    **Problem:** The section is listed In Scope and also raised as an open question, so the scope contradicts itself. The composition stamp already records the outcome per draft, and a one-line evidence query in the handoff gave OP-1 its data. A UI section is recurring maintenance with no stated decision it serves. It is the first thing to cut or defer if the change is split.
>    **Fix:** Default Open Question 5 to "stamp only, with a handoff query", and move the insights section to the follow-up.
>    **Status:** upheld
