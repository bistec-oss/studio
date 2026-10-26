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
