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
