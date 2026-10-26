# Proposal: UI accessibility naming, shared page primitives and consistency pass (011 follow-up)

**Created:** 2026-10-09
**Status:** 🟡 Draft

## Problem

011 moved every screen to Folio. It kept three groups of work out on purpose:

- **FR-12 froze accessible names and roles** during the restyle, so the E2E suite could prove behaviour didn't change.
- Some items are **refactors**, not restyles.
- The T7–T13 code reviews found **small inconsistencies** that weren't worth a screen re-run at the time.

The follow-ups are recorded in `docs/handoff.md` (2026-10-08, step 3) and in the 011 task reviews. Left alone, they cause three problems:

1. **Accessibility gaps** a screen-reader or keyboard user hits today:
   - inputs named only by their placeholder;
   - an unnamed tablist;
   - a login page with no `h1`;
   - stepper steps that look disabled but aren't marked so;
   - names read twice;
   - scroll regions focusable when they don't scroll;
   - remove targets under 24 px;
   - a toggle whose state is colour-only.
2. **About eight local copies of the page-head / section / notice styling** (the handoff counts eight; the exact list is confirmed at plan time):
   - dashboard and library inline;
   - `brief/cardCls.ts`;
   - `drafts/folio.ts`;
   - `campaigns/folio.ts`;
   - `admin/brandkits/folio.ts`;
   - `team/folio.tsx`.

   They drift: 012, 008 and 010 will each build new screens and pick one copy to imitate. `StatusWord` duplicates `StatusChip`.

3. **Drift from `DESIGN_SYSTEM.md`:**
   - Select labels don't match the small-caps `FieldLabel`;
   - button and input heights differ;
   - brand kits can show two accent primaries in one view, against §8.2;
   - the kit list has no height cap;
   - body `tabular-nums` (§5) isn't set;
   - the `uiTokenGuard` misses `glow-blob`, `animate-scale-in`, `text-primary` and `font-inter`.

## Proposed Solution

One change, built as several small tasks, subagent-driven, one at a time, each ending with the full mock E2E. The user decided this on 2026-10-09.

**A. Accessibility naming pass.** This deliberately changes accessible names, so each E2E selector that moves is updated in the same task and listed in its report.

- Proper `<label>`s for placeholder-named inputs:
  - the `/team` register-provider and social-channel fields;
  - the brand-kit add-colour field;
  - the template Size and HTML/CSS fields;
  - the brief topic field and the brief kit select.
- An accessible name on the COPY/IMAGE tablist.
- A visually hidden `h1` on `/login`.
- `aria-disabled` on stepper steps that aren't reached yet. This updates the 011 T8 AC-17 expectation.
- `aria-hidden` on the swatch titles inside the kit-row name.
- The breadcrumb tail is read once, not twice.
- Scroll regions get `tabIndex=0` and a label **only when they overflow**.
- Remove targets of at least 24 × 24 px (WCAG 2.2 SC 2.5.8).
- An On/Off word on the provider toggle, so its state isn't colour-only.

**B. One shared page-head / section / notice primitive** in `src/components/ui/` replaces the local copies. Screens import it, and the local files are deleted or reduced to screen-specific bits. `StatusWord` folds into `StatusChip` behind a variant. This is visually a no-op: the captures before and after are compared.

**C. Consistency items:**

- Select labels use the small-caps `FieldLabel`.
- One shared control height for buttons and inputs, per size.
- One accent primary per view in brand kits.
- A max-height on the kit list, with internal scroll.
- `font-variant-numeric: tabular-nums` on `body`, as DESIGN_SYSTEM §5 states.
- `uiTokenGuard` also fails on `glow-blob`, `animate-scale-in`, `text-primary` and `font-inter`.

## Scope

### In Scope

Everything in A, B and C above, plus `DESIGN_SYSTEM.md` updates where a rule is added or clarified, for example the shared primitive in §8 and the control heights.

### Out of Scope

- **New screens or new behaviour.** Routes, API calls, data shapes and flows are unchanged. Only accessible names, labels, ARIA state and visual consistency change.
- **A "More" menu on the draft page.** The user decided against it on 2026-10-07.
- **The refine poll race** ("Applying…" stuck once). It is a behavioural bug with its own debug route, logged in `.specclaw/learnings.md`.
- **The 010 `QueueEntryModal` two-checkbox assertion.** It belongs to 010.
- **Any 012 caption UI.** 012 builds its panels on the new shared primitive afterwards.

## Impact

- **Size:** architectural. It adds a shared UI primitive that 012, 008 and 010 will depend on, and it touches screens across the app.
- **Files affected:** about 45, across `src/components/**`, `src/app/(app)/**`, `src/components/ui/*`, `tests/e2e/*`, `tests/unit/uiTokenGuard.test.ts` and `docs/ui-reference/DESIGN_SYSTEM.md`.
- **Complexity:** medium.
- **Risk:** medium. A changes the accessible names that E2E selectors use, and B touches every screen. It is mitigated by small tasks, a full E2E run per task, and a capture diff for B.

## Decisions (2026-10-09, user)

- **Approved, size architectural.** Visible labels use today's placeholder text, and the primitives are `PageHead`, `Section` and `Notice` in `src/components/ui/`.
- **One change, not split** (the party-po BLOCK was put to the user). The full mock E2E runs **once per wave**, not per task. A and C stay in the same wave wherever they couple (the brief kit select, the kit-list scroll region). **B lands first**, so 012 builds its caption panels on the shared primitive.
- **Scroll regions use a static rule:** every region that can scroll is focusable (`tabIndex=0`) and labelled. There is no overflow measurement, which matches the T7 Recent Drafts fix.
- **011 is verified PASS (2026-10-09),** so the stepper `aria-disabled` change edits only the 011 T8 E2E assertion and 014's own spec. 011's AC-17 wording is left as it is; 014 supersedes it for the stepper.
- The other panel findings (label component, primitive props, guard matching, height source, a repeatable capture check, the copy count) are resolved in 014's spec.

## Open Questions

- **Label text.** For each placeholder-named input, is the visible label the current placeholder text? Proposed default: yes, with the placeholder kept as an example value where it shows one, such as a hex code.
- **The shared primitive's name.** Proposed: `PageHead`, `Section` and `Notice` in `src/components/ui/`.
- (party-po, BLOCK) A, B and C bundled as one change with a full E2E per task and no stated task count; split into 014a (A + C) and 014b (B), and run the full E2E once per wave — see party-report.md
- (party-po) B is justified only by unbuilt screens; compare against "one canonical copy documented in DESIGN_SYSTEM §8" — see party-report.md
- (party-po) Drop the overflow-only focus rule for one static rule; label the brief fields first, admin forms later — see party-report.md
- (party-po) Control-height unification and the kit-list cap carry no stated value; ship last or cut — see party-report.md
- (party-ba) The accessibility gaps cite no audit; mark WCAG failures vs polish — see party-report.md
- (party-ba) No falsifiable acceptance criteria for the visual no-op, overflow rule or 24 px targets — see party-report.md
- (party-ba) The "eight copies" count disagrees with the seven listed — see party-report.md
- (party-ba) "Accent primary" and "per size" are ambiguous — see party-report.md
- (party-architect) Labels added in A must be `FieldLabel`; say whether C changes the Select primitive or its call sites — see party-report.md
- (party-architect) Define PageHead/Section/Notice props, incl. heading level; B must not change any accessible name or role — see party-report.md
- (party-architect) Name the eighth copy; define what a reduced local file may keep — see party-report.md
- (party-architect) Overflow focus needs one owner and a deterministic test, or a static rule — see party-report.md
- (party-architect) Guard extension must remove current uses in the same commit; whole-class-token matching — see party-report.md
- (party-architect) Name the single source and the size scale for control heights — see party-report.md
- (party-architect) Name which artifact the 011 AC-17 stepper change edits — see party-report.md
- (party-architect) The capture-diff no-op check needs a repeatable method and threshold, or is stated as manual review — see party-report.md
- (party-architect) A and C are coupled (kit-list scroll region, brief kit select); deferring B means amending 012's dependency line — see party-report.md
