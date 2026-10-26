### [BLOCK] party-po — Three unrelated bundles ship as one change with a full E2E run per task and no named cut line

**Quotes:**

> One change, built as several small tasks, subagent-driven, one at a time, each ending with the full mock E2E.
> **Size:** architectural. It adds a shared UI primitive that 012, 008 and 010 will depend on, and it touches screens across the app.
> **Files affected:** about 45
> **Problem:** Round 1 stands. A (a11y naming), B (shared primitives) and C (consistency) share no dependency. Bundling them means a full 312-test E2E run per task, and the task count is still not stated. The architect's findings add more weight. They show B's contract (heading level, props, capture method) is undefined, and that the change reaches into 011's AC-17. That is more reason to ship B on its own.
> **Fix:** Split into 014a (A + C) and 014b (B). Run the full E2E once per wave. State the task count and total E2E runs.
> **Status:** upheld

### [WARN] party-po — B's shared primitive is justified by future screens, not by current value, and its "visual no-op" is costly to prove

**Quotes:**

> They drift: 012, 008 and 010 will each build new screens and pick one copy to imitate.
> This is visually a no-op: the captures before and after are compared.
> Proposed: `PageHead`, `Section` and `Notice` in `src/components/ui/`.
> **Problem:** Round 1 stands. Party-ba shows the "eight copies" count is unconfirmed, and the proposal's own list names six or seven. Party-architect shows the no-op check is not repeatable. Together these show B's cost is unknown and its only proof is a judgement call. The value stated is only for screens not yet built.
> **Fix:** State what breaks if B is skipped. Compare it against a "pick one canonical copy and document it in DESIGN_SYSTEM §8" variant.
> **Status:** upheld

### [WARN] party-po — "Overflow-only" focusable scroll regions and a per-input label sweep add logic and tests for marginal value

**Quotes:**

> Scroll regions get `tabIndex=0` and a label **only when they overflow**.
> Proper `<label>`s for placeholder-named inputs:
> **Problem:** Round 1 stands. Party-architect independently found that the overflow rule needs runtime measurement, has no named owner, and cannot be tested deterministically. That supports a static rule: always focusable with a label, or never. The label sweep should go to the high-traffic brief fields first.
> **Fix:** Drop the overflow measurement and use one static rule. Label the brief fields first, and treat the admin forms as a later increment.
> **Status:** upheld

### [NOTE] party-po — Control-height unification and the kit-list height cap carry no stated value

**Quotes:**

> One shared control height for buttons and inputs, per size.
> A max-height on the kit list, with internal scroll.
> **Problem:** Round 1 stands. Party-architect adds that the height's source and size scale are undefined, so this is the highest blast-radius item in C with no stated return. The kit-list cap also creates a nested scroll region, which pulls in A's overflow rule.
> **Fix:** Ship these last and separately, or cut the list cap if no one has reported a long-list problem.
> **Status:** upheld
