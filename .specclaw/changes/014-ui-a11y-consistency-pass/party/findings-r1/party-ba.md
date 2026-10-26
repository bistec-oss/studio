### [WARN] party-ba — Accessibility gaps are listed as fact with no audit source or severity

**Quotes:**

> 1. **Accessibility gaps** a screen-reader or keyboard user hits today:
>    The follow-ups are recorded in `docs/handoff.md` (2026-10-08, step 3) and in the 011 task reviews.
>    **Problem:** The proposal says users "hit" these gaps today. It cites no audit, tool run or user report. The only source is a handoff note and code-review remarks. The gaps are plausible, but nothing shows which are real failures and which are reviewer preferences. For example, a scroll region that doesn't scroll, or a tab list with no name, might not be a failure at all. The proposal never names who is affected. It offers no sign that a screen-reader user has tried these screens.
>    **Fix:** Cite the audit (axe, Lighthouse or a manual pass) that produced the list. Mark which items are WCAG failures and which are polish.
>    **Status:** upheld

### [WARN] party-ba — The main goals have no falsifiable acceptance criteria

**Quotes:**

> This is visually a no-op: the captures before and after are compared.
> Scroll regions get `tabIndex=0` and a label **only when they overflow**.
> Remove targets of at least 24 × 24 px (WCAG 2.2 SC 2.5.8).
> **Problem:** The proposal has no acceptance-criteria section. Three claims need a pass/fail test and have none.

- **Visual no-op.** "Captures are compared", but no tolerance is set. The proposal does not say who judges the diff or what counts as a difference. The capture tool is described elsewhere as "a review tool, not a gate", so the claim cannot fail.
- **Overflow-only scroll regions.** The proposal never says what "overflow" means: at which viewport, at what content length, or whether it is measured at load or on resize. The E2E suite runs one viewport, so it cannot check this.
- **24 px targets.** The proposal does not say which elements are covered, or whether the 24 px is the box or the hit area.
  The goal "a screen-reader or keyboard user hits" fewer gaps has no matching check at all. The proposal does not say whether an automated audit must come back clean.
  **Fix:** Add numbered criteria, each with an observation that could fail. Examples: an axe run with zero violations on named routes, a pixel-diff threshold for B, and a measured bounding box for the 24 px targets.
  **Status:** upheld

### [WARN] party-ba — The "eight copies" count is contradicted by the proposal's own list

**Quotes:**

> **About eight local copies of the page-head / section / notice styling** (the handoff counts eight; the exact list is confirmed at plan time):
> dashboard and library inline;
> `brief/cardCls.ts`;
> **Problem:** The proposal lists dashboard and library inline, plus four files. Counting dashboard and library as two, that is six, not eight. The proposal admits the list is unconfirmed, yet it uses the count to justify an "architectural" change that touches about 45 files. The count may be the handoff's own estimate, carried forward without checking. The "one copy to imitate" argument for 012, 008 and 010 is also an assertion. No evidence shows the copies have actually diverged in a way that changes what users see.
> **Fix:** Enumerate the copies now and show the actual drift between them. Or restate the need as "new screens should share one primitive", which does not depend on the number.
> **Status:** upheld

### [NOTE] party-ba — "Consistency" claims mix real drift with a rule that two readings could resolve differently

**Quotes:**

> brand kits can show two accent primaries in one view, against §8.2;
> One shared control height for buttons and inputs, per size.
> **Problem:** Two terms carry more than one meaning.

- **"Accent primary".** It could mean one primary button, one accent-coloured element, or one primary per kit card. Each reading gives a different build.
- **"Per size".** The proposal does not say which sizes exist. It also does not say whether "one height" means buttons and inputs match each other, or each is internally uniform.
  Neither term is defined on the page, and the fix depends on which reading is meant.
  **Fix:** Quote the §8.2 rule and the size scale in the proposal, or state the intended reading.
  **Status:** upheld
