### [BLOCK] party-po — Seven looks and 17 contracts are bought up front with no cheaper cut line, and no use data justifies five of them

**Quotes:**

> Five new looks (`product-showcase-light`, `editorial-split-light`, `abstract-forms`, `full-bleed-scene`, `spotlight`), each at SQUARE, PORTRAIT and STORY.
> OP-1 showed the styled looks are wanted
> It covered two looks at two sizes; it says nothing about the new ones.
> **Problem:** The only evidence of value is OP-1 on two looks. Five more looks at three sizes each means 15 new contracts plus 2 STORY additions. Each contract needs a pass fixture, a fail fixture, prompt wording, tuning and a real-image render. Open Question 4 asks whether fewer sizes would do, but the proposal never prices the cheaper variant. The cheapest variant that captures the stated value is a first cut that does two things:

- Add STORY to the two existing looks. This is a data row each, and it is the user's explicit problem 1.
- Ship one or two new looks that fix the "six of eight styles default to classic" problem. Full-bleed scene (Event, Hiring) and Spotlight (Promotion, Milestone) between them cover four of the six classic-default rows.

The `-light` variants and Abstract forms could wait for usage data. The proposal has no cut line, and its own estimate is about 25 files and "large".
**Fix:** Name a cut line. Either ship STORY plus Full-bleed and Spotlight first, with the other three looks as a follow-up after fallback rates are known, or state why the full set cannot be sequenced.
**Status:** upheld

### [WARN] party-po — The unattended-surface gate costs the whole real-image check and returns value only to a path the user did not size

**Quotes:**

> **Hard cap: 34 hero image calls**; the runner refuses to go past it.
> Scheduled, MCP and ACP posts are always classic
> A contract passes when its render keeps the style (no fallback) and the user marks it acceptable.
> **Problem:** The 34-call real check, plus operator time to judge 17 or more renders, exists mainly to populate the `realCheck` allow-list that unlocks scheduled, MCP and ACP use. The proposal gives no number for how many unattended posts exist or would use a look. It also never prices the cheaper alternative: leave unattended surfaces classic and skip the allow-list. That removes the `realCheck` record, the `unproven-classic` note and the resolver branch. The pass bar is one acceptable render per contract, which is a single sample. The operator-attention cost is unstated.
> **Fix:** State the expected volume of unattended styled posts and the operator time budget, or defer the allow-list to a later change that covers only the looks interactive users actually pick.
> **Status:** upheld

### [WARN] party-po — Shipped defaults silently move five post styles onto unproven looks, and no running cost is stated for the slower render

**Quotes:**

> **Post-style defaults move** in a new post-style version (`versions[2]`, never an edit): Promotion → Spotlight, Event → Full-bleed scene, Hiring → Full-bleed scene, Tip → Abstract brand forms, Milestone → Spotlight.
> It takes longer: 11 to 22 s with `IMAGE_QUALITY` unset, on OP-1's numbers.
> **Problem:** A user who never edits anything gets five post styles that previously rendered classic and now render a hero look on every interactive brief. That is a latency and behaviour change on upgrade. The real check is a tuning step and not a merge gate, so the default can move onto a look with no `realCheck` record. The "no new call" claim hides the cost of a failed pixel check, which wastes the hero generation and reuses it as classic. The expected fallback rate is not stated (OP-1 saw 2 of 12 renders record layout-violation observations).
> **Fix:** Make a default move conditional on the look having a `realCheck` record, or ship new looks as opt-in picks first. State the expected fallback rate and the wasted-call cost.
> **Status:** upheld

### [NOTE] party-po — Insights fallback section is optional scope with the answer already listed as an open question

**Quotes:**

> - Fallback outcomes per look on `/admin/insights`.
>
> 5. **Insights:** is a fallback-rate-per-look section on `/admin/insights` wanted now, or is the composition stamp enough until there is usage?
>    **Problem:** The section is listed In Scope and also raised as an open question, so the scope contradicts itself. The composition stamp already records the outcome per draft, and a handoff evidence query gave OP-1 its data. A UI section is recurring maintenance with no stated decision it serves. It is the first thing to defer if the change is split.
>    **Fix:** Default Open Question 5 to "stamp only, with a handoff query", and move the insights section to the follow-up.
>    **Status:** upheld
