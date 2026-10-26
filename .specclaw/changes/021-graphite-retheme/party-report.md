# Party Report: 021-graphite-retheme

**Reviewed:** 2026-10-18
**Tier:** standard (classifier) — Restyles about 80 files across every screen and primitive, but every edit is a token, class or shape change with no behaviour, API, schema or copy change, and the open questions (wordmark font, change order, carry-over notes) are cosmetic or scheduling choices that do not alter what is built.
**Panel:** party-po(sonnet), party-architect(opus), party-ba(sonnet)
**Verdict:** CHANGES_REQUESTED

## Summary

16 findings: 1 BLOCK, 9 WARN, 6 NOTE upheld — 0 withdrawn

## Findings

### [WARN] party-architect — The token contract is contradictory: item 1 swaps values, item 7 swaps names, and the Tailwind mapping is not in the solution

**Quotes:** > 1. **Tokens.** Replace the Folio values in `globals.css` with the Graphite study's token block, for light and dark
**Quotes:** > 7. **Guards and tests.** Update `designTokens`, `contrast` and `uiTokenGuard` to Graphite values and names.
**Quotes:** > - `src/app/globals.css` holds the Folio semantic tokens (66 custom properties). `tailwind.config.*` maps them to `ui-*` radii and colours.
**Problem:** The proposal never says whether the 66 semantic custom-property names stay. Item 1 reads as "same names, new values", which would be one file plus the guard values. Item 7 says the guards move to Graphite "names", which means the names change. If they do, the `tailwind.config.*` `ui-*` mapping and every `ui-*` class string in the 67 files must change in the same commit. Graphite's set does not obviously line up with Folio's one to one: three soft shadow levels instead of hard offset shadows, four radii plus a pill, motion durations and easings. The Problem section names `tailwind.config.*`, but none of the eight solution items does. Two implementers would build two different layers: one keeps Folio's names and drops in Graphite's values, the other ports the study's token block with its own names and rewrites every consumer.
**Fix:** State the naming rule: semantic names are kept and only values change, or here is the old-to-new name map. Add `tailwind.config.*` to item 1, listing the new keys for shadow levels, the pill radius and motion, and the Folio keys that are removed.
**Status:** upheld

### [WARN] party-architect — Dropping two of three fonts leaves the `font-display` / `font-sans` / `font-text` utility contract unspecified

**Quotes:** > - `src/app/layout.tsx` loads Fraunces, Instrument Sans and JetBrains Mono, and maps them to `font-display`, `font-sans` and `font-text`.
**Quotes:** > 2. **Fonts.** Plus Jakarta Sans for all text and JetBrains Mono for numbers and code. Drop Fraunces and Instrument Sans from `layout.tsx`.
**Problem:** Three font utilities are used across the 67 files, and after the change there are two families. The proposal does not say what `font-display` resolves to after Fraunces is gone. It could be kept as an alias of Plus Jakarta Sans, or removed so every use site has to change. `font-text` is also a problem. Read in order, the mapping sentence pairs it with JetBrains Mono, yet item 2 says Plus Jakarta Sans is "for all text". An implementer has to guess whether `font-text` sites move to the sans face, and that would knock numbers and code off the mono face, or stay mono. Utilities that no longer match the font behind them will still compile, so nothing flags the error.
**Fix:** Give the target mapping for each of the three utilities: kept, re-pointed or removed. If any is removed, list its use sites as a co-change, and have `uiTokenGuard` forbid the removed name.
**Status:** upheld

### [WARN] party-architect — No deterministic check that the 67-file Folio sweep is complete

**Quotes:** > - **Risk:** medium. The token layer and the guards contain it, but many class strings carry Folio shapes directly, and E2E selectors may key on visible text such as small-caps labels.
**Quotes:** > - Guards pin Folio: `tests/unit/designTokens.test.ts`, `tests/unit/contrast.test.ts` and `tests/unit/uiTokenGuard.test.ts`. The guard names the Folio atoms and the small-caps tracking literal.
**Quotes:** > - Before/after captures with the existing capture script.
**Problem:** The proposal itself says Folio shapes sit in class strings outside the token layer. Item 7 only re-points the guards to Graphite values. A guard updated that way checks the new layer is right. It does not check the old one is gone. The only remaining check for leftover Folio in screens (Fraunces references, hard offset shadow literals, square-corner overrides, small-caps tracking, crop-mark markup) is the before/after captures, which a person has to inspect. Mock E2E passes whatever the styling, so "screens pick up most of the change through the primitives" has no gate, and a half-swept screen merges green.
**Fix:** In item 7, add a deny-list to `uiTokenGuard` covering Folio family names, the renamed `folio` atoms and the module path, the small-caps tracking literal, and the crop-mark and proof-plate class names. It should scan `src/` so that any leftover fails the unit gate.
**Status:** upheld

### [WARN] party-architect — "The small-caps rules where Graphite uses plain labels" does not say which small-caps survive, and the guard pins that literal

**Quotes:** > 5. **Screens.** Remove Folio-only elements screen by screen: the proof plate and crop marks, serif section heads, the small-caps rules where Graphite uses plain labels.
**Quotes:** > The guard names the Folio atoms and the small-caps tracking literal.
**Problem:** The qualifier "where Graphite uses plain labels" implies some small-caps stay, but the proposal does not say which ones. The answer decides whether the guard keeps the small-caps tracking literal, changes it, or bans it. It also decides whether `FieldLabel`, `SectionHead` and `StatusChip` drop the treatment at the primitive level or each screen does. Two implementers would split it differently, and with the primitives-first order in item 4, a primitive-level answer and a per-screen answer touch different files.
**Fix:** Say whether small-caps survives in Graphite at all. If it does, name the primitive(s) that keep it and the tracking value the guard should pin.
**Status:** upheld

### [NOTE] party-architect — Renaming three `folio.ts` helpers to "neutral names" leaves open whether one helper module or three survive

**Quotes:** > - Three `folio.ts` helper modules exist: `src/components/ui/folio.ts`, `src/components/campaigns/folio.ts` and `src/components/admin/brandkits/folio.ts`.
**Quotes:** > 4. **Primitives first.** Restyle `src/components/ui/*` and rename the `folio.ts` helpers to neutral names, so screens pick up most of the change through the primitives.
**Problem:** Item 4's rename touches every importer of all three modules anyway. The proposal does not say whether the campaigns and brand-kits helpers become feature-local modules under new names, or are folded into the `ui` one. If they keep separate copies of shared class atoms, a restyle that is meant to flow through the primitives still has to be repeated in two side modules.
**Fix:** State the target: one module under `src/components/ui/` that the other two re-export from or fold into, or three modules with a stated reason the feature-local ones hold feature-only atoms.
**Status:** upheld

### [NOTE] party-architect — Rebuttal to party-po: the `folio.ts` helpers' contents do change, so "rename only if contents change" is already met

**Quotes:** > 4. **Primitives first.** Restyle `src/components/ui/*` and rename the `folio.ts` helpers to neutral names, so screens pick up most of the change through the primitives.
**Problem:** party-po's WARN says the rename "changes no pixel" and proposes renaming "only if the helpers' contents change". Structurally, the helpers are where the Folio class atoms live, and item 4 restyles exactly that layer. Their contents change in this change whatever the filename. A module named `folio.ts` that holds Graphite atoms becomes a second, misleading name for the current design system. The proposal says the guard "names the Folio atoms". With the name kept, a deny-list that bans `folio` names, which is how a sweep-completeness check would work, cannot ban the module path. Both outcomes keep the rename. This rebuttal does not touch party-po's archive point, which is outside this lens.
**Fix:** None to the proposal beyond the NOTE above on one module versus three. This only answers the value objection on structural grounds.
**Status:** upheld

### [NOTE] party-architect — Rebuttal to party-po: per the proposal's own text, a token-and-font-only variant does not carry the shapes, and it still forces the guard and font-utility co-changes

**Quotes:** > - The shared primitives in `src/components/ui/` (Button, Panel, FieldLabel, SectionHead, PageHead, StatusChip, Modal and others) encode Folio shapes: square corners, 1 px ink borders, hard offset shadows, small-caps labels.
**Quotes:** > - **Risk:** medium. The token layer and the guards contain it, but many class strings carry Folio shapes directly, and E2E selectors may key on visible text such as small-caps labels.
**Problem:** party-po's BLOCK describes option (a), a token and font swap only, as one that "gets the colours, type and radii". This rebuttal states coupling facts only. It does not argue which option to pick. The proposal says the shapes (square corners, ink borders, hard offset shadows, small-caps) are encoded in the primitives and in class strings directly, not only in `globals.css`. A values-only swap therefore leaves pill buttons, soft shadows and the plain-label treatment unbuilt. Whatever variant is chosen, some things must still land in the same commit as the token swap: the three guards, which pin Folio values, and the `tailwind.config.*` mapping. Dropping Fraunces from `layout.tsx` also forces the `font-display` resolution decision (see the font finding above), because otherwise its use sites silently fall back. So option (a) is cheaper than the full swap, but it is not just the two files it is described as touching.
**Fix:** When party-po's options table is written, give option (a) its real co-change set: `globals.css`, `layout.tsx`, `tailwind.config.*`, the three guards, and the `font-display` use sites if that utility is removed.
**Status:** upheld

### [WARN] party-ba — The user's motive for the change is never stated, so "the problem" is a preference with no acceptance test

**Quotes:**

> The user wants this system to look different from the fork. On 2026-10-18 the user picked **study A, Graphite**, from the same three 011 studies
> Folio is not just a token file. It reaches 67 files under `src/`:
> **Problem:** The Problem section describes the cost of the existing state (67 files) but not what hurts. The only stated reason is "look different from the fork", and that is satisfied by any change. A different direction (Graphite) was picked, but nothing says what Graphite is meant to fix, such as readability, density or brand distance. The proposal has no Acceptance Criteria section. Its only checkable bars are "Contrast must meet the same thresholds as 011" and a "full clean mock E2E". Neither says when the screens look like Graphite. A reviewer cannot fail "restyle every screen" at ship time, so the main claim goes unverified.
> **Fix:** State the actual driver in one sentence. Add falsifiable criteria, for example no Folio-specific tokens, fonts or classes remain under `src/` (grep returns zero). Also require before/after captures of every listed screen in both themes, matched to the study.
> **Status:** upheld

### [WARN] party-ba — Quantities used to size and risk the change are asserted, and two of them disagree

**Quotes:**

> Folio is not just a token file. It reaches 67 files under `src/`:
> Size: architectural. The design system is an interface every later UI change depends on, and the change spans 67+ files.
> **Files affected:** about 80 (estimated), including tests and docs.
> `src/app/globals.css` holds the Folio semantic tokens (66 custom properties).
> **Problem:** The 67-file and 66-property counts come with no method, such as a grep pattern or script. "67 files" is also the count of files that reference Folio, and the proposal treats that as the number of files to restyle. The counts are then used to justify the "architectural" size and "medium" risk. The "about 80" estimate is not tied to the 67 either. The proposal does not say whether the 13 extra files are the tests and docs it lists, or other source files.
> **Fix:** Cite how the 67 was counted, for example the grep or command. Reconcile it with "about 80", or drop the figure from the sizing rationale.
> **Status:** upheld

### [WARN] party-ba — "Look different from the fork" and "keep the structure the fork built" pull in opposite directions

**Quotes:**

> The user wants this system to look different from the fork.
> Swap the visual direction to Graphite, and keep the structure the fork built: the semantic token layer, the primitives, the 014 accessibility work and the opaque-surface rule.
> **Problem:** If the goal is visual distance from the fork, the proposal never says how much distance counts. The fork's primitives, layout, screens and token architecture all stay, so a user comparing the two would see only a reskin. Graphite is also one of the same three studies the fork's team put forward. The proposal does not establish that this reskin satisfies the stated want. A different pick from the same candidate set may not look different enough to the user.
> **Fix:** Say what "different" means, for example the same palette and typography but different structure. Alternatively, record the user's confirmation that a reskin of this kind is what they want.
> **Status:** upheld

### [NOTE] party-ba — "Graphite", "the study" and "Graphite carry-over notes" are treated as a complete spec, but the source is a file not yet checked

**Quotes:**

> Replace the Folio values in `globals.css` with the Graphite study's token block, for light and dark
> Contrast must meet the same thresholds as 011 in both themes.
> Do the same notes apply to Graphite? Planning reads the T2 report and decides.
> **Problem:** The token block and "the same thresholds as 011" are used as the definition of done. The proposal does not say whether the Graphite study's own token block passes those thresholds. The 011 T2 carry-over notes included `--line-subtle` and an amber `scheduled` colour, and those may mean the study's tokens need changing. If so, "replace with the study's block" and "meet the thresholds" can conflict. The proposal defers the check to planning, but the scope claim in item 1 depends on its answer.
> **Fix:** Confirm before build that the study's tokens pass the contrast tests. State which wins if they don't.
> **Status:** upheld

### [NOTE] party-ba — Premise that E2E selectors may break on small-caps labels is asserted, while "no copy change" is declared

**Quotes:**

> E2E selectors may key on visible text such as small-caps labels.
> Any behaviour, API, schema or copy change.
> **Problem:** Small-caps is a CSS rendering, so the DOM text does not change when it goes away. The risk as written mixes two things, CSS text transform and the label text itself. A selector that keys on uppercase text would only break if the transform is applied in the string rather than in CSS, and the proposal does not say which. This affects whether "no copy change" is true.
> **Fix:** Say whether the labels are uppercased in the source strings. Grep the E2E for such selectors before assigning a risk level.
> **Status:** upheld

### [BLOCK] party-po — The do-nothing option and a cheaper token-only variant are never priced against an ~80-file, "large" re-skin

**Quotes:**

> The user wants this system to look different from the fork.
> Folio is not just a token file. It reaches 67 files under `src/`:
> **Size:** architectural. The design system is an interface every later UI change depends on, and the change spans 67+ files.
> **Complexity:** large
> **Problem:** The only stated value is that the user wants the app to look different. That is a legitimate preference, but the proposal never says what gets worse if Folio ships as is. The cost is about 80 files, a full clean mock E2E run per task that touches `src/`, and before/after captures for every screen. The proposal never says what a cheaper variant would give up. It does not consider three smaller options. (a) Token and font swap only: replace the values in `globals.css` and the fonts in `layout.tsx`, update the three guards, and leave screen-level shapes alone. That gets the colours, type and radii, which is most of what "looks different" means. (b) Ship Graphite in two stages, with the token, font and primitive layer first and the screen-by-screen removals after. (c) Keep Folio, since the rebrand is a preference and not a defect. The proposal dismisses the token-only route with "Folio is not just a token file", but it never compares what that route would capture against the cost of the full swap. The screen-by-screen work (item 5) is the largest cost and has no value line of its own.
> **Fix:** Add a short section that prices three options: do nothing, tokens plus fonts plus primitives only, and the full swap. For each one, give the files touched, the E2E run count, and what the user would still see as Folio. Then justify item 5 against option (b), or make it a separate later change.
> **Status:** upheld

### [WARN] party-po — The per-task full E2E and the before/after captures are a recurring cost with no number attached

**Quotes:**

> A full clean mock E2E per task that touches `src/`, as 011 did.
> Before/after captures with the existing capture script.
> **Problem:** The proposal does not say how many tasks there are, so the number of full clean E2E runs cannot be estimated. Each run needs stopping stray node processes, `rm -rf .next`, a test DB recreate and a full suite run. Because the change is purely visual and "Any behaviour, API, schema or copy change" is out of scope, running the whole suite after every task is a large recurring cost compared with what it can catch. The only E2E risk named is selectors that key on text. A grep for those, plus one full run at each wave boundary, could cover that risk. The captures have the same gap: no screen count, and no theme count (light and dark double it).
> **Fix:** State the task count and the total E2E runs. Consider one full run per wave and a targeted subset per task, with a selector audit up front. State how many screens times themes the captures cover.
> **Status:** upheld

### [WARN] party-po — Scope with no stated value: renaming the folio.ts helpers, and a decision record with the archive

**Quotes:**

> rename the `folio.ts` helpers to neutral names, so screens pick up most of the change through the primitives.
> Write a new `DESIGN_SYSTEM.md` for Graphite, with a decision record. Archive the Folio version to `docs/ui-reference/archive/folio/`, as 011 did for Frozen Light.
> **Problem:** The rename touches three modules and every importer, which adds diff and review cost, but it changes no pixel. Graphite is not served better by a new filename. The archive move is "as 011 did", which is precedent, not a value statement. The git history already preserves the Folio version, so the archive duplicates it. Neither item says what it returns.
> **Fix:** Give each a value or cut it. Rename only if the helpers' contents change. Rely on git history for Folio and drop the archive copy. Keep the new `DESIGN_SYSTEM.md`, because the old one becomes wrong.
> **Status:** upheld

### [NOTE] party-po — Sequencing: the cut line between the foundation and the screens is not named, and the default order is untested against the churn it causes

**Quotes:**

> Build 021 before them, after them, or interleave? Default: finish 018 first, because its T1 is half-done, then 021, then 019 and 020.
> **Primitives first.** Restyle `src/components/ui/*` and rename the `folio.ts` helpers to neutral names, so screens pick up most of the change through the primitives.
> **Problem:** The proposal says screens "pick up most of the change through the primitives", but it names no shippable cut at that point. Tokens, fonts and primitives could ship alone as a coherent Graphite-ish state, and the remaining screens could follow. A mixed state of Graphite primitives on Folio screens might look worse than either, and the proposal does not say whether that is acceptable between waves. The 018-then-021 order is sensible, but 019 and 020 touch UI, so building them after 021 means they are written once, in Graphite. If they are built before 021, they get restyled twice. That argues for putting 021 before 019 and 020, as the default already does.
> **Fix:** Name the shippable cut after primitives and say whether a mixed state may land on `v2` between waves. Keep the order 018, then 021, then 019 and 020, and give the restyle-twice cost as its reason.
> **Status:** upheld

## Dissent

No withdrawals.
