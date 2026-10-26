### [WARN] party-ba — Accessibility gaps are listed as fact with no audit source or severity

**Quotes:**

> 1. **Accessibility gaps** a screen-reader or keyboard user hits today:
>    The follow-ups are recorded in `docs/handoff.md` (2026-10-08, step 3) and in the 011 task reviews.
>    **Problem:** The proposal says users "hit" these gaps today. It cites no audit, tool run or user report. The only sources are a handoff note and code-review remarks. The gaps are plausible, but nothing shows which are real failures and which are reviewer preferences. A scroll region that doesn't scroll, or a tab list with no name, might not be a failure at all. The proposal never names who is affected. Round 2 did not change this. No other seat supplied an audit source.
>    **Fix:** Cite the audit (axe, Lighthouse or a manual pass) that produced the list. Mark which items are WCAG failures and which are polish.
>    **Status:** upheld

### [WARN] party-ba — The main goals have no falsifiable acceptance criteria

**Quotes:**

> This is visually a no-op: the captures before and after are compared.
> Scroll regions get `tabIndex=0` and a label **only when they overflow**.
> Remove targets of at least 24 × 24 px (WCAG 2.2 SC 2.5.8).
> **Problem:** The proposal has no acceptance-criteria section. Three claims need a pass/fail test and have none.

- **Visual no-op.** "Captures are compared", but no tolerance is set, and nobody is named to judge the diff. The capture tool is described elsewhere as "a review tool, not a gate", so the claim cannot fail. party-architect's finding on the same line reaches the same conclusion from the test side.
- **Overflow-only scroll regions.** "Overflow" is not defined: which viewport, which content length, measured at load or on resize.
- **24 px targets.** The proposal does not say which elements are covered, or whether 24 px is the box or the hit area.

The goal that screen-reader and keyboard users hit fewer gaps has no matching check at all. The proposal does not say whether an automated audit must come back clean.
**Fix:** Add numbered criteria, each with an observation that could fail. Examples: an axe run with zero violations on named routes, a pixel-diff threshold for B, and a measured bounding box for the 24 px targets.
**Status:** upheld

### [WARN] party-ba — The "eight copies" count is contradicted by the proposal's own list

**Quotes:**

> **About eight local copies of the page-head / section / notice styling** (the handoff counts eight; the exact list is confirmed at plan time):
> dashboard and library inline;
> `brief/cardCls.ts`;
> **Problem:** The proposal lists seven locations, not eight. That is dashboard and library inline, plus five files. My round-1 text said six, which was an arithmetic slip, and I correct it here. party-architect independently counted seven, and the verdict is unchanged. The proposal admits the list is unconfirmed, yet it uses the count to justify an "architectural" change touching about 45 files. The "one copy to imitate" argument for 012, 008 and 010 is also an assertion. No evidence shows the copies have diverged in a way that changes what users see.
> **Fix:** Enumerate the copies now and show the actual drift between them. Or restate the need as "new screens should share one primitive", which does not depend on the number.
> **Status:** upheld

### [NOTE] party-ba — "Consistency" claims mix real drift with a rule that two readings could resolve differently

**Quotes:**

> brand kits can show two accent primaries in one view, against §8.2;
> One shared control height for buttons and inputs, per size.
> **Problem:** Two terms carry more than one meaning.

- **"Accent primary".** It could mean one primary button, one accent-coloured element, or one primary per kit card. Each reading gives a different build.
- **"Per size".** The proposal does not say which sizes exist. It also does not say whether "one height" means buttons and inputs match each other, or each is internally uniform. party-architect found that the owning layer is unnamed as well.

Neither term is defined on the page, and the fix depends on which reading is meant.
**Fix:** Quote the §8.2 rule and the size scale in the proposal, or state the intended reading.
**Status:** upheld
