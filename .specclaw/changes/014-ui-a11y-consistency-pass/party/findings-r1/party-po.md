### [BLOCK] party-po — Three unrelated bundles ship as one change with a full E2E run per task and no named cut line

**Quotes:**

> One change, built as several small tasks, subagent-driven, one at a time, each ending with the full mock E2E.
> **Size:** architectural. It adds a shared UI primitive that 012, 008 and 010 will depend on, and it touches screens across the app.
> **Files affected:** about 45
> **Problem:** A (a11y naming), B (shared primitives, a visual no-op refactor) and C (consistency) share no dependency. A changes behaviour-visible names, B touches every screen, and C is mostly one-line CSS and guard additions. Bundling them means a full clean mock E2E run per task. That run is about 312 tests, plus the stop-node, rm .next and DB-reset ritual. The task count is never stated, so the run count and wall-clock are never priced. The proposal never names a cheaper variant, and a strictly cheaper one exists. Ship C and the guard additions plus A's cheap attribute-only items (tablist name, hidden h1, aria-hidden, aria-disabled, On/Off word) first. Gate them on lint, unit and a targeted E2E subset. Defer B until a screen that needs it (012) is actually being built. The user has ruled on the work, not on the bundling.
> **Fix:** Split into 014a (A + C, attribute and CSS level) and 014b (B). Run the full E2E once per wave, not per task. State the task count and total E2E runs.
> **Status:** upheld

### [WARN] party-po — B's shared primitive is justified by future screens, not by current value, and its "visual no-op" is costly to prove

**Quotes:**

> They drift: 012, 008 and 010 will each build new screens and pick one copy to imitate.
> This is visually a no-op: the captures before and after are compared.
> Proposed: `PageHead`, `Section` and `Notice` in `src/components/ui/`.
> **Problem:** The only value stated for B is protecting unbuilt work. Nothing gets worse for users if B ships in no form, and the drift cost is one future reviewer comment per screen. The price is a refactor across about 8 files with a capture-diff (a manual, ungated review tool per CLAUDE.md) as the only proof. The "about eight" count is also unconfirmed ("confirmed at plan time"), so the size is unknown. The cheapest variant is to point 012, 008 and 010 at the one best existing copy (e.g. `drafts/folio.ts`) and extract the primitive when the second new consumer appears. Alternatively, extract only PageHead, since that is the one the handoff names.
> **Fix:** State what breaks if B is skipped, and compare it against a "pick one canonical copy, document it in DESIGN_SYSTEM §8" variant.
> **Status:** upheld

### [WARN] party-po — "Overflow-only" focusable scroll regions and a per-input label sweep add logic and tests for marginal value

**Quotes:**

> Scroll regions get `tabIndex=0` and a label **only when they overflow**.
> Proper `<label>`s for placeholder-named inputs:
> **Problem:** Conditional tabIndex needs a ResizeObserver-style measurement hook in every scroll region, which is runtime machinery plus a test for a rule about a tidy edge case. The simpler variant is either always focusable with a label or never. Separately, the label sweep touches seven forms with E2E selectors that move, and each moved selector is a regression risk. No value is stated per item, such as which are on high-traffic paths. The brief topic and kit select are the high-traffic ones. The `/team` provider and social fields are admin-only and rarely used.
> **Fix:** Drop the overflow measurement (use one static rule). Label the brief fields first and treat the admin forms as a later increment.
> **Status:** upheld

### [NOTE] party-po — Control-height unification and the kit-list height cap carry no stated value

**Quotes:**

> One shared control height for buttons and inputs, per size.
> A max-height on the kit list, with internal scroll.
> **Problem:** The height change touches every button and input, which means every captured screen and potentially every layout assertion. The proposal gives no user-visible symptom for either item beyond "differs". The kit-list cap adds a nested scroll region, which then needs A's overflow-focus handling. These are the highest blast-radius items in C for the least stated return.
> **Fix:** Ship them last and separately, or cut the list cap if no one has reported a long-list problem.
> **Status:** upheld
