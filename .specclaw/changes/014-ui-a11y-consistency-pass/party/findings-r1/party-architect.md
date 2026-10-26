### [WARN] party-architect — New field labels are not tied to the existing FieldLabel, so A and C could produce two label styles

**Quotes:** > - Proper `<label>`s for placeholder-named inputs:
**Quotes:** > - Select labels use the small-caps `FieldLabel`.
**Quotes:** > - the brief topic field and the brief kit select.
**Problem:** The proposal names one existing label mechanism, `FieldLabel`, and then has part A add "proper `<label>`s" without saying they are `FieldLabel`. A could therefore add plain `<label>` elements in a second style, which C would then have to rework. The two parts also overlap on at least one element: the brief kit select gets a new label in A and the `FieldLabel` treatment in C. The artifact also doesn't say where C's fix goes: inside the shared Select primitive (one place) or at each call site where a Select is used. Two implementers would build this differently.
**Fix:** State that every label added in A is a `FieldLabel`. State whether C changes the Select primitive or its call sites. Assign the brief kit select to a single task.
**Status:** upheld

### [WARN] party-architect — The PageHead / Section / Notice contract leaves out heading level, element type and form

**Quotes:** > **B. One shared page-head / section / notice primitive** in `src/components/ui/` replaces the local copies. Screens import it, and the local files are deleted or reduced to screen-specific bits.
**Quotes:** > This is visually a no-op: the captures before and after are compared.
**Quotes:** > - **The shared primitive's name.** Proposed: `PageHead`, `Section` and `Notice` in `src/components/ui/`.
**Problem:** B promises a _visual_ no-op only. It doesn't say whether the primitive keeps each screen's current heading element and level, or its landmark and role. Those are what the E2E role/name selectors match, and A is the only part that is allowed to move them. Most of the copies it replaces are `.ts` files (`cardCls.ts`, `drafts/folio.ts`, `campaigns/folio.ts`, `admin/brandkits/folio.ts`), but one is `team/folio.tsx`. So the implementer also has to guess the primitive's form: React components or exported class strings. The proposal says 012, 008 and 010 will depend on this primitive, so this is a shared contract built on guesses.
**Fix:** In the artifact, define each primitive's props, including a heading-level or `as` prop and its default. Say that B must not change any accessible name or role, so that any E2E selector moving in a B task counts as a defect.
**Status:** upheld

### [WARN] party-architect — The list of copies to consolidate is short of the stated count, so one duplicate can survive the merge

**Quotes:** > 2. **About eight local copies of the page-head / section / notice styling** (the handoff counts eight; the exact list is confirmed at plan time):
**Quotes:** > - dashboard and library inline;
**Quotes:** > the local files are deleted or reduced to screen-specific bits.
**Problem:** The bullet list names seven locations: dashboard, library, `brief/cardCls.ts`, `drafts/folio.ts`, `campaigns/folio.ts`, `admin/brandkits/folio.ts` and `team/folio.tsx`. The stated count is eight. B exists to leave one copy. An unlisted copy is a co-change nobody has named, and a later screen can still imitate it. Files "reduced to screen-specific bits" also stay in place as local style modules, and the artifact doesn't define what may stay in them.
**Fix:** Name the eighth copy in the proposal, or correct the count. Define what a reduced local file may keep (for example: no page-head, section or notice styling).
**Status:** upheld

### [WARN] party-architect — The conditional scroll-region focusability has no named owner and no deterministic test seam

**Quotes:** > - Scroll regions get `tabIndex=0` and a label **only when they overflow**.
**Quotes:** > - A max-height on the kit list, with internal scroll.
**Problem:** "Only when they overflow" needs runtime layout measurement, through a resize observer or a scrollHeight/clientHeight check. The proposal doesn't say whether this is one shared hook or primitive in `src/components/ui/`, or logic repeated in each scroll region. Repeated logic is a second copy of the thing B is removing. The proposal doesn't list which scroll regions are affected. C also creates a new one, the max-height kit list, and the proposal doesn't say it gets the A treatment, so the two parts depend on each other without saying so. On testing: unit tests run in a DOM with no layout, so overflow is always false there. In E2E the result depends on viewport size and on how much seeded content there is, so the test can pass or fail depending on data rather than code.
**Fix:** Name one shared hook or primitive and list the regions that use it, including the new kit list. Specify a deterministic test, for example a unit test with stubbed scroll dimensions, plus an E2E case with fixed viewport and fixture content sized to overflow and not overflow.
**Status:** upheld

### [WARN] party-architect — Extending the token guard has to land in the same commit as removing every current use, and the proposal never says whether there are any

**Quotes:** > - the `uiTokenGuard` misses `glow-blob`, `animate-scale-in`, `text-primary` and `font-inter`.
**Quotes:** > - `uiTokenGuard` also fails on `glow-blob`, `animate-scale-in`, `text-primary` and `font-inter`.
**Problem:** "Misses" says the guard doesn't detect these four tokens. It doesn't say whether they still appear in `src/`. If they do, adding them to the guard fails the unit gate unless every occurrence is removed in the same commit, or opted out. That removal list is the co-change, and it isn't enumerated. The proposal also doesn't say how the match works: literal substring or class-token boundary. `text-primary` could match a longer class name, so two implementers would write different rules.
**Fix:** State whether each of the four tokens has current occurrences. If it does, list the removals as part of the same task. Specify how the guard matches each one (whole class token, not substring).
**Status:** upheld

### [WARN] party-architect — "One shared control height" doesn't say where the value lives or what the sizes are

**Quotes:** > - One shared control height for buttons and inputs, per size.
**Quotes:** > plus `DESIGN_SYSTEM.md` updates where a rule is added or clarified, for example the shared primitive in §8 and the control heights.
**Problem:** The proposal doesn't name the layer that owns the height: a design token or CSS variable, a shared class constant, or a size prop on the Button and Input primitives. It also doesn't name the size scale ("per size"). Without one named source, the height values are still written in more than one place, the drift the change exists to remove. Two implementers would put the value in different places.
**Fix:** Name the single source (for example a token per size in the theme layer, read by both Button and Input) and list the sizes and values. Make `DESIGN_SYSTEM.md` point to that source rather than repeat the numbers.
**Status:** upheld

### [WARN] party-architect — The stepper change edits a different change's acceptance criterion without saying which artifact changes

**Quotes:** > - `aria-disabled` on stepper steps that aren't reached yet. This updates the 011 T8 AC-17 expectation.
**Problem:** This change reaches into change 011's acceptance criterion. The proposal doesn't say whether 011's spec text is edited, or only the E2E assertion that checks it, or both. If only the test moves, 011's AC-17 and its test disagree. If 011's spec is edited, a later verify of 011 checks against an amended criterion that 014 owns. Either way, the co-change has a target nobody has specified.
**Fix:** Name the exact files edited for AC-17 (011's spec and/or the specific E2E test). State whether 011's AC-17 wording is amended or superseded by a 014 criterion.
**Status:** upheld

### [WARN] party-architect — The "visually a no-op" check for B has no defined, repeatable comparison

**Quotes:** > This is visually a no-op: the captures before and after are compared.
**Quotes:** > It is mitigated by small tasks, a full E2E run per task, and a capture diff for B.
**Problem:** The capture diff is the only check on B's main claim, and it isn't specified. The proposal doesn't say whether the comparison is pixel-exact or has a threshold, whether it is automated or read by eye, or what viewport, theme and seeded data it uses. Screenshots of a live app with relative timestamps and web fonts don't compare the same way twice. As written, the comparison is a judgement call, not a test, and it may simply be skipped.
**Fix:** Specify the capture set: routes, viewport, light and dark themes, and fixed seed data with frozen time. Specify the comparison method and its pass threshold, or say outright that B's no-op claim rests on manual review.
**Status:** upheld
