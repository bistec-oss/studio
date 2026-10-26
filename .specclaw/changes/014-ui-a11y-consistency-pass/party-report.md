# Party Report: 014-ui-a11y-consistency-pass

**Reviewed:** 2026-10-09
**Tier:** standard (classifier) — Consolidates eight duplicate page-head/section patterns into one shared primitive while adding accessible names and ARIA attributes across 45 files and updating DESIGN_SYSTEM.md; all changes are visual/accessibility consistency with no data or API impact and are fully revertible.
**Panel:** party-po(sonnet), party-architect(opus), party-ba(sonnet)
**Verdict:** CHANGES_REQUESTED

## Summary

18 findings: 1 BLOCK, 13 WARN, 4 NOTE upheld — 0 withdrawn

## Findings

### [WARN] party-architect — New field labels are not tied to the existing FieldLabel, so A and C could produce two label styles

**Quotes:** > - Proper `<label>`s for placeholder-named inputs:
**Quotes:** > - Select labels use the small-caps `FieldLabel`.
**Quotes:** > - the brief topic field and the brief kit select.
**Problem:** The proposal names one existing label mechanism, `FieldLabel`, and then has part A add "proper `<label>`s" without saying they are `FieldLabel`. A could therefore add plain `<label>` elements in a second style, which C would then have to rework. The two parts also overlap on at least one element: the brief kit select gets a new label in A and the `FieldLabel` treatment in C. The artifact also doesn't say where C's fix goes: inside the shared Select primitive (one place) or at each call site where a Select is used. Two implementers would build this differently. No round-1 finding from another seat addresses this.
**Fix:** State that every label added in A is a `FieldLabel`. State whether C changes the Select primitive or its call sites. Assign the brief kit select to a single task.
**Status:** upheld

### [WARN] party-architect — The PageHead / Section / Notice contract leaves out heading level, element type and form

**Quotes:** > **B. One shared page-head / section / notice primitive** in `src/components/ui/` replaces the local copies. Screens import it, and the local files are deleted or reduced to screen-specific bits.
**Quotes:** > This is visually a no-op: the captures before and after are compared.
**Quotes:** > - **The shared primitive's name.** Proposed: `PageHead`, `Section` and `Notice` in `src/components/ui/`.
**Problem:** B promises a _visual_ no-op only. It doesn't say whether the primitive keeps each screen's current heading element and level, or its landmark and role. Those are what the E2E role/name selectors match, and A is the only part allowed to move them. On form: the PascalCase names in the open question suggest React components, which partly settles that question. But most of the copies being replaced are `.ts` class-string modules (`cardCls.ts`, `drafts/folio.ts`, `campaigns/folio.ts`, `admin/brandkits/folio.ts`), so the artifact still doesn't say whether class-string exports survive alongside the components. The proposal says 012, 008 and 010 will depend on this primitive, so this is a shared contract with its heading semantics left unspecified.
**Fix:** In the artifact, define each primitive's props, including a heading-level or `as` prop and its default. Say that B must not change any accessible name or role, so that any E2E selector moving in a B task counts as a defect.
**Status:** upheld

### [WARN] party-architect — The list of copies to consolidate is short of the stated count, so one duplicate can survive the merge

**Quotes:** > 2. **About eight local copies of the page-head / section / notice styling** (the handoff counts eight; the exact list is confirmed at plan time):
**Quotes:** > - dashboard and library inline;
**Quotes:** > the local files are deleted or reduced to screen-specific bits.
**Problem:** The bullet list names seven locations: dashboard, library, `brief/cardCls.ts`, `drafts/folio.ts`, `campaigns/folio.ts`, `admin/brandkits/folio.ts` and `team/folio.tsx`. The stated count is eight. B exists to leave one copy. An unlisted copy is a co-change nobody has named, and a later screen can still imitate it. Files "reduced to screen-specific bits" also stay in place as local style modules, and the artifact doesn't define what may stay in them. party-ba's finding covers the evidence side of the count; this finding covers the unnamed co-change and the undefined residue, which party-ba's does not.
**Fix:** Name the eighth copy in the proposal, or correct the count. Define what a reduced local file may keep (for example: no page-head, section or notice styling).
**Status:** upheld

### [WARN] party-architect — The conditional scroll-region focusability has no named owner and no deterministic test seam

**Quotes:** > - Scroll regions get `tabIndex=0` and a label **only when they overflow**.
**Quotes:** > - A max-height on the kit list, with internal scroll.
**Problem:** "Only when they overflow" needs runtime layout measurement, through a resize observer or a scrollHeight/clientHeight check. The proposal doesn't say whether this is one shared hook or primitive in `src/components/ui/`, or logic repeated in each scroll region. Repeated logic is a second copy of the thing B is removing. The proposal doesn't list which scroll regions are affected. C also creates a new one, the max-height kit list, and doesn't say it gets the A treatment, so the two parts depend on each other without saying so. On testing: unit tests run in a DOM with no layout, so overflow is always false there. In E2E the result depends on viewport size and on how much seeded content there is, so the test can pass or fail depending on data rather than code. party-po's suggested static rule (always or never focusable) would remove the measurement entirely. That is a scope decision for the proposal author, and until it is made this finding stands.
**Fix:** Name one shared hook or primitive and list the regions that use it, including the new kit list. Specify a deterministic test, for example a unit test with stubbed scroll dimensions, plus an E2E case with fixed viewport and fixture content sized to overflow and not overflow. Alternatively, adopt a static rule and state it.
**Status:** upheld

### [WARN] party-architect — Extending the token guard has to land in the same commit as removing every current use, and the proposal never says whether there are any

**Quotes:** > - the `uiTokenGuard` misses `glow-blob`, `animate-scale-in`, `text-primary` and `font-inter`.
**Quotes:** > - `uiTokenGuard` also fails on `glow-blob`, `animate-scale-in`, `text-primary` and `font-inter`.
**Problem:** "Misses" says the guard doesn't detect these four tokens. It doesn't say whether they still appear in `src/`. If they do, adding them to the guard fails the unit gate unless every occurrence is removed or opted out in the same commit. That removal list is the co-change, and it isn't enumerated. The proposal also doesn't say how the match works: literal substring or class-token boundary. `text-primary` could match a longer class name, so two implementers would write different rules.
**Fix:** State whether each of the four tokens has current occurrences. If it does, list the removals as part of the same task. Specify how the guard matches each one (whole class token, not substring).
**Status:** upheld

### [WARN] party-architect — "One shared control height" doesn't say where the value lives or what the sizes are

**Quotes:** > - One shared control height for buttons and inputs, per size.
**Quotes:** > plus `DESIGN_SYSTEM.md` updates where a rule is added or clarified, for example the shared primitive in §8 and the control heights.
**Problem:** The proposal doesn't name the layer that owns the height: a design token or CSS variable, a shared class constant, or a size prop on the Button and Input primitives. It also doesn't name the size scale ("per size"). Without one named source, the height values are still written in more than one place, which is the drift this change exists to remove. Two implementers would put the value in different places. party-ba's NOTE covers the ambiguous wording of "per size". This finding covers which layer owns the value.
**Fix:** Name the single source (for example a token per size in the theme layer, read by both Button and Input) and list the sizes and values. Make `DESIGN_SYSTEM.md` point to that source rather than repeat the numbers.
**Status:** upheld

### [WARN] party-architect — The stepper change edits a different change's acceptance criterion without saying which artifact changes

**Quotes:** > - `aria-disabled` on stepper steps that aren't reached yet. This updates the 011 T8 AC-17 expectation.
**Problem:** This change reaches into change 011's acceptance criterion. The proposal doesn't say whether 011's spec text is edited, only the E2E assertion that checks it, or both. If only the test moves, 011's AC-17 and its test disagree. If 011's spec is edited, a later verify of 011 checks against an amended criterion that 014 owns. 011's verify is still pending, so whichever order 011-verify and this edit land in decides what that verify checks against. Either way, the co-change has a target nobody has specified.
**Fix:** Name the exact files edited for AC-17 (011's spec and/or the specific E2E test). State whether 011's AC-17 wording is amended or superseded by a 014 criterion.
**Status:** upheld

### [WARN] party-architect — The "visually a no-op" check for B has no defined, repeatable comparison

**Quotes:** > This is visually a no-op: the captures before and after are compared.
**Quotes:** > It is mitigated by small tasks, a full E2E run per task, and a capture diff for B.
**Problem:** The capture diff is the only check on B's main claim, and it isn't specified. The proposal doesn't say whether the comparison is pixel-exact or uses a threshold, whether it is automated or done by eye, or what viewport, theme and seeded data it uses. Screenshots of a live app with relative timestamps and web fonts don't compare the same way twice. As written, the comparison is a judgement call, not a test, and it may be skipped. party-ba's finding asks whether the claim _can fail_ (an acceptance-criterion question). This finding asks whether the capture run is _repeatable_ (fixed seed, frozen time, fonts loaded, viewport set), which is test strategy. The two overlap but are not duplicates.
**Fix:** Specify the capture set: routes, viewport, light and dark themes, and fixed seed data with frozen time. Specify the comparison method and its pass threshold, or say outright that B's no-op claim rests on manual review.
**Status:** upheld

### [NOTE] party-architect — Rebuttal to party-po's BLOCK: A and C are coupled, so the split works only because it keeps them together, and deferring B leaves 012's stated dependency dangling

**Quotes:** > One change, built as several small tasks, subagent-driven, one at a time, each ending with the full mock E2E.
**Quotes:** > - A max-height on the kit list, with internal scroll.
**Quotes:** > - **Any 012 caption UI.** 012 builds its panels on the new shared primitive afterwards.
**Problem:** party-po's BLOCK rests on "A, B and C share no dependency". Structurally that is false for A and C. They couple at two points in the artifact's own text. First, C's kit-list max-height creates a scroll region that A's overflow rule must then cover (party-po's own NOTE says so). Second, the brief kit select is labelled in A and restyled to `FieldLabel` in C. The proposed 014a (A + C) keeps both coupling points in one change, so the split itself is structurally sound. But the stated premise should not carry forward into planning as "A and C can be split apart too". Deferring B (014b) also leaves a co-change the BLOCK doesn't name: the Out of Scope line says 012 "builds its panels on the new shared primitive afterwards". If B is deferred, that line, and any 012 artifact that assumes the primitive exists, must be amended together with the split. This is a coupling fact, not a release-order recommendation. Whether to split remains party-po's call.
**Fix:** If the split is adopted, record the A–C coupling points in 014a, and amend the 012 dependency line together with the split.
**Status:** upheld

### [NOTE] party-architect — Correction to party-ba's count: the proposal lists seven locations, not six

**Quotes:** > - dashboard and library inline;
**Quotes:** > - `team/folio.tsx`.
**Problem:** party-ba counts "dashboard and library inline, plus four files" and gets six. The list names five files: `brief/cardCls.ts`, `drafts/folio.ts`, `campaigns/folio.ts`, `admin/brandkits/folio.ts` and `team/folio.tsx`. With dashboard and library that makes seven, so the shortfall against "eight" is one copy, not two. party-ba's conclusion still holds: the count and the list disagree, and the list is unconfirmed. Only the arithmetic changes. It matters because "find one missing copy" and "find two" are different plan-time searches.
**Fix:** party-ba may restate the gap as seven listed against eight claimed.
**Status:** upheld

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

## Dissent

No withdrawals.
