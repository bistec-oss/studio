# bistec-studio — UI Design System

**Direction:** Graphite (study A of change 011).
**Chosen:** 2026-10-18, by the user, over keeping Folio. Built by change 021 (`.specclaw/changes/021-graphite-retheme/`).
**Status:** authoritative for all UI work from 021 T8 onward.
**Source study:** [`direction-studies/study-a-graphite.html`](direction-studies/study-a-graphite.html), with its screenshots `direction-studies/shots/a-light.png` and `a-dark.png`. The 2026-10-07 comparison page is [`direction-studies/pick.html`](direction-studies/pick.html).
**Reference screenshots:** the app itself, on the draft review page at 1440 px: [`screen-light.png`](screen-light.png) and [`screen-dark.png`](screen-dark.png) (021 T8).
**Replaces:** Folio (011, 2026-10-07 to 2026-10-18). Git history keeps the Folio version of this file; there is no archive copy (R9). Frozen Light, the theme before Folio, stays archived at [`archive/frozen-light/`](archive/frozen-light/), together with its screenshots and the Synthetix reference HTML.

> Read this before building or changing any page or component. Where a value is given here, use it; do not approximate it. Where this document says nothing, follow the source study, then ask.

The section numbers are the ones the code's comments cite (§1–§12, §8.1–§8.19), kept from the Folio version so those references stay valid (021 A10).

---

## 1. Decision record

| Date       | Decision                                                                                                                                                                              | By           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 2026-10-06 | Neutral tool UI: no BISTEC Global brand cues on the chrome. Each team's brand kit is the only brand inside the work. The logo (below) is the product's own mark.                      | user         |
| 2026-10-06 | Three direction studies of the draft review page; the user picks one alone.                                                                                                           | user         |
| 2026-10-06 | The default theme follows the OS. Light and dark are both mandatory.                                                                                                                  | user         |
| 2026-10-07 | Direction B, Folio, picked over A Graphite and C Instrument. _Superseded on 2026-10-18._                                                                                              | user         |
| 2026-10-07 | Logo: the typeset "Studio" wordmark. _Reversed on 2026-10-18 (R11): the Bistec Studio PNG logo is back (§8.1)._                                                                       | user         |
| 2026-10-07 | **No "More" menu on the draft page.** Every action stays a visible button (§8.17). Still in force.                                                                                    | user         |
| 2026-10-09 | **014 (accessibility and consistency) is one change,** with the full clean mock E2E once per wave and lint, unit and `tsc` per task. The shared page primitives land first (§8.18).   | user         |
| 2026-10-09 | **Scroll regions follow a static rule:** every container that can scroll on its own is a focusable, labelled region whether or not it overflows now (§8.15).                          | user         |
| 2026-10-09 | **All 27 fields found by the plan-time sweep get a label** (014 A1). A placeholder is an example value, never a field's only name (§8.3).                                             | user         |
| 2026-10-09 | **One field-label style, app-wide** (014 A3). Under Folio it was small caps; under Graphite it is the sentence-case `FieldLabel` (021 FR-07), still one style for every field (§8.3). | user, 021    |
| 2026-10-09 | **`axe-core` is a devDependency** (014 A4), at 4.12.1. The E2E injects it with `page.addScriptTag` (§9).                                                                              | user         |
| 2026-10-09 | **The primitives' three micro-drifts are accepted** (014 A5).                                                                                                                         | user         |
| 2026-10-18 | **Direction A, Graphite**, picked so that this system looks different from the fork's Folio. A reskin on the fork's structure (R1).                                                   | user         |
| 2026-10-18 | **Logo: `public/BistecStudioLogo.png` comes back,** with its dark-mode inversion (R11). This reverses the 2026-10-07 wordmark decision.                                               | user         |
| 2026-10-18 | **Build order:** 018, then 022, then 021, then 019 and 020, so that 019 and 020 are written once, in Graphite (R12).                                                                  | user         |
| 2026-10-18 | The panel rulings R1–R12 and the assumptions A1–A13 below.                                                                                                                            | orchestrator |

### 1.1 Rulings (021 proposal, "Panel rulings", 2026-10-18)

- **R1. Full swap.** Every value and shape changes; the token layer, the primitives, the 014 accessibility work, the opaque-surface rule and the OS-follow theme rule stay.
- **R2. Two waves with a named cut.** Wave 1 (021 T1–T3) is the foundation, wave 2 (T4–T7) the screens, T8 the cleanup.
- **R3. E2E cost.** One full clean mock E2E per wave, plus one at the end.
- **R4. Token names kept.** Only values change. Keys are added where Graphite has more (`--radius-xl`, `--space-5`, `--space-10`) and removed where it has fewer (`--space-12`).
- **R5. Fonts.** `font-sans` is Plus Jakarta Sans and `font-mono` is JetBrains Mono. `font-display` and `font-text` are gone.
- **R6. Small caps follow the study:** one atom, used in a few named places (§5.2).
- **R7. A deny-list sweep guard** over `src/` for every Folio leftover (§11).
- **R8. The helper modules fold into one neutral `ui` module** (`src/components/ui/atoms.ts`), with feature-only atoms in a named `classes.ts` beside their screen group (§8.18).
- **R9. No archive copy of Folio.**
- **R10. Contrast wins over a study value.** A value that fails is adjusted and listed in §3.5. None was needed.
- **R11. The logo is the old PNG, with its dark-mode treatment.**
- **R12. Order:** 018 → 022 → 021 → 019 → 020.

### 1.2 Assumptions (021 spec, A1–A13, accepted at plan review)

- **A1. Control heights are 32 / 38 / 44 px** (`--control-sm|md|lg`). The study gives 38 and 32; 44 is the planner's large size.
- **A2. One status tint alpha, 0.12,** for chips, notices and status discs. The study's 0.14 amber disc is normalised to 0.12, because published text on a 0.14 tint would fail (4.41:1).
- **A3. The rendered post is never rounded or clipped.** It sits square inside a square immediate wrapper; the rounding lives on the stage around it (§8.12).
- **A4. The double bezel** (§4.1) is for page-level section cards and the preview stage only. The study's 30 / 22 px stage radii are normalised to 26 / 20.
- **A5. The study's regrouped controls are not built:** no More menu, Refine button, previous/next arrows or Delete draft on the draft page (§8.17).
- **A6. The logo** is `Logo.tsx` as it was before 011 T6, and the PNG is byte-identical to that version (§8.1).
- **A7. Page eyebrows stay** ("Overview", "Posts", "Draft", …), as Graphite micro-labels.
- **A8. The theme toggle is the study's sun and moon segments,** named "Light" and "Dark", in the `group "Theme"`, with `aria-pressed` (§8.4).
- **A9. The nav has its icons back** (lucide, `aria-hidden`; §8.6).
- **A10. This document keeps the Folio section numbering.**
- **A11. The Folio section numerals ("i.", "ii.") are gone,** and `SectionHead` has no `numeral` prop (021 T8).
- **A12. Single-line fields are pills; textareas are `radius-md`** (§8.3).
- **A13. Primary versus Ink.** `--accent` equals `--fg` in both themes, so fill no longer tells them apart. **Primary is the ink pill with the raised shadow; Ink is the same fill, flat** (§8.2). 014's "one accent primary per view" now reads "one primary per view".

---

## 2. The direction in one paragraph

Calm, precise and soft-edged. A warm-grey canvas (`#F1F0ED`) with near-black ink in light; an `#111110` canvas with bone ink in dark. **The accent is the ink itself:** the primary action, the current version and focus are drawn in `--fg`, so the screen reads in greys and lets the posts carry the colour. One sans (Plus Jakarta Sans) speaks for everything, from the 28 px page title to the 11 px micro-label; JetBrains Mono marks numbers that are data (dimensions, counters, times, versions). **Buttons and single-line fields are pills.** Cards are rounded and opaque, with soft layered shadows, and a page-level section sits in a **double bezel**: a 6 px `--line-subtle` tray around its paper core. The header and the sidebar float as islands on the canvas. The post sits on a **stage**, square and as rendered.

What Graphite removes from Folio: Fraunces and Instrument Sans, the burnt-sienna accent, the 2 px ink block rules, the hard offset shadows, the italic section numerals, the small-caps field labels, status chips and table heads, and the proof plate with its crop marks.

---

## 3. Tokens

All tokens live in `src/app/globals.css`, on `:root` (light) and `.dark` (dark), switched by the `.dark` class on `<html>`.

- **Colours are R G B triplets.** Consume them as `rgb(var(--x))`, or `rgb(var(--x) / a)` for a tint, or through the Tailwind names (§3.4). Never write the hex. The exceptions are the marked `ui-exception` lines (§11).
- **The status tint alpha is 0.12 in both themes** (A2): chips, notices and status discs. Tailwind has `opacity['12']`, so `bg-status-failed/12` works.
- **Theme-independent tokens are declared once, on `:root`:** radius, the control heights, motion, type and spacing. Colour, shadow and scrim tokens are declared in both blocks.
- **`tests/unit/designTokens.test.ts` parses the study file** and asserts that every token in `globals.css` (except the two `--font-*` lines) equals the study's, minus the deviation map, which is empty (§3.5). It also pins the key set (47 on `:root`, 19 on `.dark`), the Tailwind mapping and the control heights.

### 3.1 Token block (exact, from `globals.css`)

<!-- prettier-ignore -->
```css
:root {
  /* colour */
  --canvas: 241 240 237;
  --surface-1: 251 251 250;
  --surface-2: 255 255 255;
  --fg: 24 24 22;
  --fg-muted: 99 97 92;
  --line: 134 131 124;
  --line-subtle: 226 224 219;
  --accent: 24 24 22;
  --accent-fg: 250 250 249;
  --focus: 24 24 22;
  --status-draft: 95 93 87;
  --status-exported: 105 65 198;
  --status-scheduled: 138 76 0;
  --status-published: 30 112 62;
  --status-failed: 180 35 24;
  /* elevation — soft layered shadows */
  --shadow-panel: 0 1px 2px rgb(24 24 22 / 0.04), 0 6px 20px -10px rgb(24 24 22 / 0.10);
  --shadow-raised: 0 1px 2px rgb(24 24 22 / 0.06), 0 14px 36px -14px rgb(24 24 22 / 0.22);
  --shadow-overlay: 0 2px 6px rgb(24 24 22 / 0.06), 0 32px 64px -24px rgb(24 24 22 / 0.30);
  --scrim: 24 24 22;
  /* radius */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 18px;
  --radius-xl: 26px;
  --radius-pill: 999px;
  /* control heights — one per size: buttons, single-line fields, icon buttons
     (014 FR-07, 021 A1) */
  --control-sm: 32px;
  --control-md: 38px;
  --control-lg: 44px;
  /* motion */
  --dur-fast: 140ms;
  --dur-base: 220ms;
  --dur-slow: 380ms;
  --ease-standard: cubic-bezier(0.32, 0.72, 0, 1);
  --ease-exit: cubic-bezier(0.4, 0, 0.7, 0.2);
  /* type */
  --text-2xs: 11px;
  --text-xs: 12px;
  --text-sm: 13px;
  --text-base: 14px;
  --text-lg: 16px;
  --text-xl: 20px;
  --text-2xl: 28px;
  /* spacing (4px base, comfortable) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
}
.dark {
  --canvas: 17 17 16;
  --surface-1: 26 26 24;
  --surface-2: 35 35 32;
  --fg: 238 237 234;
  --fg-muted: 160 157 150;
  --line: 116 113 106;
  --line-subtle: 46 46 43;
  --accent: 238 237 234;
  --accent-fg: 24 24 22;
  --focus: 238 237 234;
  --status-draft: 181 178 171;
  --status-exported: 185 163 255;
  --status-scheduled: 245 181 71;
  --status-published: 111 207 142;
  --status-failed: 255 138 122;
  --shadow-panel: inset 0 1px 0 rgb(255 255 255 / 0.04), 0 1px 2px rgb(0 0 0 / 0.30), 0 8px 24px -12px rgb(0 0 0 / 0.50);
  --shadow-raised: inset 0 1px 0 rgb(255 255 255 / 0.06), 0 2px 4px rgb(0 0 0 / 0.30), 0 18px 44px -14px rgb(0 0 0 / 0.70);
  --shadow-overlay: inset 0 1px 0 rgb(255 255 255 / 0.07), 0 4px 10px rgb(0 0 0 / 0.30), 0 40px 80px -24px rgb(0 0 0 / 0.80);
  --scrim: 0 0 0;
}
```

**Not in the block, on purpose:**

- **`--font-sans` / `--font-mono`.** `next/font` serves self-hosted fonts under generated family names, so a literal `"Plus Jakarta Sans"` would not match the self-hosted file. The two variables come from `next/font`'s `variable` option on `<body>` (`src/app/layout.tsx`), with the study's fallback stacks there.
- **The `/* prettier-ignore */` comments** on both blocks keep the values byte-identical to the study (Prettier would print `0.10` as `0.1` and wrap the dark shadows).
- **The `--control-*` heights** are 014's keys, which the study does not declare (A1).

### 3.2 Colour roles

| Token                | Role                                                                                                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--canvas`           | Page ground, the band behind the header and sidebar islands, recessed wells inside a card, the segmented-toggle track, and the hover fill of a nav or menu item.                 |
| `--surface-1`        | The sidebar island, in-flow cards (`.surface`) and the core of a bezel card (`.surface-bezel`).                                                                                  |
| `--surface-2`        | The header island, floating surfaces (menus, toasts, modals), fields, secondary buttons, and the raised "current" item.                                                          |
| `--fg`               | Primary text, the Ink button fill (with `--canvas` text) and the 1.5 px ring of a selected version or template.                                                                  |
| `--fg-muted`         | Secondary text, metadata, micro-labels, idle nav items.                                                                                                                          |
| `--line`             | **Any boundary a user must see:** field edges, a hovered option, an open menu button's ring. It holds 3:1 on every surface.                                                      |
| `--line-subtle`      | **Decorative only:** row dividers, hairline rings on cards and pills, and the bezel tray. Exempt from 3:1 (WCAG 1.4.11; 1.16–1.39:1). Never text, never a control edge.          |
| `--accent`           | Equal to `--fg` (A13): the Primary fill, the Create post button, the round Send, the "Current" / "active" / "Default" pills, links in text (underlined, so never colour alone).  |
| `--accent-fg`        | Text and icons on `--accent`.                                                                                                                                                    |
| `--focus`            | The focus outline. The same value as `--accent`, kept as its own token so it can be tuned alone.                                                                                 |
| `--status-draft`     | Draft, Cancelled.                                                                                                                                                                |
| `--status-exported`  | Exported, Generating. A violet.                                                                                                                                                  |
| `--status-scheduled` | Scheduled, Queued, **and every warning state** ("Brand conflict", "Not applied", the skipped-background notice, invalid-token notices, "Unsaved changes"). An amber, never blue. |
| `--status-published` | Published, Generated, "Applied", "Saved", Connected, Active.                                                                                                                     |
| `--status-failed`    | Failed, errors, destructive actions (Delete, Deactivate, Revoked).                                                                                                               |
| `--shadow-panel`     | In-flow cards, the islands, the raised "current" item, secondary buttons at rest.                                                                                                |
| `--shadow-raised`    | Menus and popovers, the Primary button at rest, a secondary button on hover.                                                                                                     |
| `--shadow-overlay`   | Toasts, modals, the drawer, the lightbox chrome and the Create post button.                                                                                                      |
| `--scrim`            | The dimmed layer behind modals, the drawer, the lightbox and the mobile sidebar. Used only with an alpha (§4.2).                                                                 |

### 3.3 Contrast (WCAG 2.2, computed from the token block)

Computed with `tests/unit/contrast.test.ts`'s method: relative luminance, a status colour measured as text on its own 0.12 tint over the worst of canvas, surface-1 and surface-2, rounded to the 8-bit colour the browser paints. **All 42 checks pass** (21 pairs × 2 themes). The test re-computes the same pairs from `globals.css` on every run; `line-subtle` is left out on purpose (decorative, §3.2).

| Pair                                     | Light   | Dark    | Needs | Result  |
| ---------------------------------------- | ------- | ------- | ----- | ------- |
| fg / canvas                              | 15.60:1 | 16.14:1 | 4.5:1 | AA pass |
| fg / surface-1                           | 17.17:1 | 14.89:1 | 4.5:1 | AA pass |
| fg / surface-2                           | 17.78:1 | 13.46:1 | 4.5:1 | AA pass |
| fg-muted / canvas                        | 5.43:1  | 6.98:1  | 4.5:1 | AA pass |
| fg-muted / surface-1                     | 5.97:1  | 6.44:1  | 4.5:1 | AA pass |
| fg-muted / surface-2                     | 6.19:1  | 5.82:1  | 4.5:1 | AA pass |
| accent-fg / accent                       | 17.02:1 | 15.19:1 | 4.5:1 | AA pass |
| accent / canvas (text, links)            | 15.60:1 | 16.14:1 | 4.5:1 | AA pass |
| accent / surface-1 (text, links)         | 17.17:1 | 14.89:1 | 4.5:1 | AA pass |
| accent / surface-2 (text, links)         | 17.78:1 | 13.46:1 | 4.5:1 | AA pass |
| status-draft / its 0.12 tint (worst)     | 4.89:1  | 5.88:1  | 4.5:1 | AA pass |
| status-exported / its 0.12 tint (worst)  | 4.89:1  | 5.83:1  | 4.5:1 | AA pass |
| status-scheduled / its 0.12 tint (worst) | 4.97:1  | 6.70:1  | 4.5:1 | AA pass |
| status-published / its 0.12 tint (worst) | 4.56:1  | 6.43:1  | 4.5:1 | AA pass |
| status-failed / its 0.12 tint (worst)    | 4.75:1  | 5.59:1  | 4.5:1 | AA pass |
| line / canvas (control edge)             | 3.32:1  | 3.88:1  | 3:1   | AA pass |
| line / surface-1 (control edge)          | 3.65:1  | 3.58:1  | 3:1   | AA pass |
| line / surface-2 (control edge)          | 3.78:1  | 3.24:1  | 3:1   | AA pass |
| focus / canvas                           | 15.60:1 | 16.14:1 | 3:1   | AA pass |
| focus / surface-1                        | 17.17:1 | 14.89:1 | 3:1   | AA pass |
| focus / surface-2                        | 17.78:1 | 13.46:1 | 3:1   | AA pass |

Two checks outside the table, from 021 design.md §9: every status colour as plain text on the worst surface is at least 5.35:1 (light) and 6.88:1 (dark); the `info` notice (accent on its 0.12 tint) is at least 12.7:1 and 10.2:1. The tightest pair is `status-published` on its tint in light, at 4.56:1. **That is why the tint is 0.12 and never 0.14** (4.41:1, a fail; A2).

### 3.4 Tailwind mapping

Each colour is `rgb(var(--x) / <alpha-value>)`.

| Tailwind                                                       | Variable / value                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `canvas`                                                       | `--canvas`                                                                           |
| `surface` (`DEFAULT`) / `surface-raised`                       | `--surface-1` / `--surface-2`                                                        |
| `fg` (`DEFAULT`) / `fg-muted`                                  | `--fg` / `--fg-muted`                                                                |
| `line` (`DEFAULT`) / `line-subtle`                             | `--line` / `--line-subtle`                                                           |
| `accent` (`DEFAULT`) / `accent-fg`                             | `--accent` / `--accent-fg`                                                           |
| `focus`, `scrim`, `status-*`                                   | `--focus`, `--scrim`, `--status-*`                                                   |
| `boxShadow.panel` / `.raised` / `.overlay`                     | `var(--shadow-…)` (full values)                                                      |
| `borderRadius.ui-sm` / `ui-md` / `ui-lg` / `ui-xl` / `ui-pill` | `var(--radius-…)`                                                                    |
| `spacing.control-sm` / `md` / `lg`                             | `var(--control-…)` (`h-control-md`, `w-control-sm`, …)                               |
| `fontSize.ui-2xs` … `ui-2xl`                                   | `var(--text-…)`                                                                      |
| `fontFamily.sans` / `.mono`                                    | `var(--font-sans)` / `var(--font-mono)` plus fallbacks. **There are no other keys.** |
| `opacity.12`                                                   | `0.12` (the status tint, A2)                                                         |
| `letterSpacing.label`                                          | `0.14em` (the one micro-label tracking, used only by `SMALL_CAPS`)                   |
| `transitionDuration.fast` / `.base` / `.slow`                  | `var(--dur-…)`                                                                       |
| `transitionTimingFunction.standard` / `.exit`                  | `var(--ease-…)`                                                                      |
| `maxWidth.canvas`                                              | the main column's cap                                                                |

**Tailwind's defaults are not redefined.** The app uses the `ui-*` keys for radius and type; `--space-N` equals Tailwind's default step `N` (1, 2, 3, 4, 5, 6, 8, 10 = 4 … 40 px), so `p-4`, `gap-5` and so on are the spacing.

### 3.5 Deviations from the study

**None.** Every study value passes the thresholds in §3.3 at the 0.12 tint, so no value was adjusted (R10) and `designTokens.test.ts`'s `DEVIATIONS` map is empty. A future deviation is added there and here, each with its pair and ratio.

---

## 4. Surface model

**The rule (011 FR-08): text behind a fixed or floating surface is never perceptible.** Every such surface has an opaque background (alpha 1) and no `backdrop-filter`, anywhere, scrims included.

### 4.1 The surface classes

They live in `@layer components` in `globals.css`. A primitive gets a surface only through one of them. All of them set `background-color`, **never the `background` shorthand**, which would erase a Select's chevron `background-image`. **Hairlines are box-shadow rings,** as the study draws them, so an edge never adds to an element's box.

| Class              | Background    | Edge                                     | Radius                       | Shadow             | Used for                                                                                                     |
| ------------------ | ------------- | ---------------------------------------- | ---------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------ |
| `.surface`         | `--surface-1` | none                                     | `--radius-lg` (18)           | `--shadow-panel`   | In-flow cards: library tiles, detail asides, the brief stepper strip, the kit list.                          |
| `.surface-bezel`   | `--surface-1` | a 6 px `--line-subtle` border (the tray) | `--radius-xl` (26; inner 20) | none               | **Page-level section cards and the preview stage** (A4). `background-clip: padding-box`. The caller pads it. |
| `.surface-raised`  | `--surface-2` | a 1 px `--line-subtle` ring              | `--radius-md` (12)           | `--shadow-raised`  | Dropdown menus, popovers, the team-switcher menu, the font listbox.                                          |
| `.surface-overlay` | `--surface-2` | a 1 px `--line-subtle` ring              | `--radius-lg` (18)           | `--shadow-overlay` | Modals, confirm dialogs, the drawer (square), toasts, the lightbox chrome.                                   |

- **The double bezel is one element.** The tray is the border, so a `Panel bezel` keeps its `className` (grid and margin utilities work) and the inner radius is concentric for free. The study draws it as two elements with a shadow on the core; that shadow is not drawn (A4).
- **`Panel`** renders `.surface`, or `.surface-bezel` with `bezel`.
- **The Create post button and the header island** are not surface classes: the button is `--accent` with `--shadow-overlay`, and the header is `bg-surface-raised rounded-ui-lg shadow-panel`. Both are opaque.

### 4.2 Fixed surfaces and the scrim exception

| Surface                        | Treatment                                                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header                         | An 80 px `--canvas` band (fixed, full width) holding the island: the `<header>` itself, inset 12 px, 56 px tall, `--surface-2`, `--radius-lg`, `--shadow-panel`. The band keeps scrolled content out of the gutter. |
| Desktop sidebar                | A 268 px `--canvas` band from 80 px down, holding the `<aside>` island: 244 px wide, inset 12 px, `--surface-1`, `--radius-lg`, `--shadow-panel`.                                                                   |
| Mobile sidebar                 | The same island inside the Radix Dialog, fixed 12 px from the left, top and bottom, 244 px wide, over a 0.3 scrim. Focus-trapped.                                                                                   |
| **Scrims (the one exception)** | `rgb(var(--scrim) / a)`, with nothing legible or interactive on them: modal, confirm and drawer 0.5, lightbox 0.8, mobile sidebar 0.3.                                                                              |

---

## 5. Type

### 5.1 Families

| Token         | Family                | `next/font/google` import | Use                                                                                                                                        |
| ------------- | --------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `--font-sans` | **Plus Jakarta Sans** | `Plus_Jakarta_Sans`       | Everything: titles, heads, body, controls, micro-labels. A variable font, weights 400–700.                                                 |
| `--font-mono` | **JetBrains Mono**    | `JetBrains_Mono`          | Numbers that are data: pixel dimensions and the version line, character counters, refine times, `vN`, masked key prefixes, commands, code. |

- **Self-hosted (NFR-05).** `next/font/google` downloads at build time and serves the files from the app; there is no runtime CDN request. The study's `fonts.googleapis.com` link is preview-only.
- **`font-display` and `font-text` do not exist** (R5), and the guard forbids them (§11). The body sets `font-sans`, and Tailwind's preflight makes form controls inherit it, so a class never needs to name the sans.
- **Non-Latin text a user types** falls back to the system font (the Google subset is Latin). Generated posts are unaffected: they render in their own fonts (NFR-10).

### 5.2 Scale

Seven steps: `--text-2xs` 11 · `--text-xs` 12 · `--text-sm` 13 · `--text-base` 14 · `--text-lg` 16 · `--text-xl` 20 · `--text-2xl` 28 (px).

The body is `--font-sans` at the browser's line-height for its size, with `font-variant-numeric: tabular-nums` and antialiasing.

The brand kit's title sits one step above its section heads (`--text-xl` against `--text-lg`), because those heads are bezel-card heads at the card-head size (021 T8 review).

| Role                           | Atom / class             | Size                                | Weight                            | Tracking                    |
| ------------------------------ | ------------------------ | ----------------------------------- | --------------------------------- | --------------------------- |
| Page title (`h1`)              | `PAGE_TITLE`             | `--text-2xl` (`--text-xl` below md) | 700                               | `tracking-tight` (−0.025em) |
| Page lead                      | `PAGE_LEAD`              | `--text-sm`, `--fg-muted`           | 400                               | 0                           |
| Kit title (`h2`, brand kits)   | `KitDetail`              | `--text-xl`                         | 600                               | `tracking-tight`            |
| Card head (`h2`)               | `SECTION_HEAD`           | `--text-lg`                         | 600                               | −0.01em                     |
| Card head (`h3`, `card`)       | `SectionHead` `card`     | `--text-lg`                         | 600                               | −0.01em                     |
| Sub-head (`h3`)                | `SUB_HEAD`               | `--text-base`                       | 600                               | 0                           |
| Body, controls, nav items      | —                        | `--text-sm`                         | 400 / 500 on nav / 600 on buttons | 0                           |
| Field label                    | `FieldLabel`             | `--text-sm`, `--fg`                 | 600                               | 0 (sentence case)           |
| Small text, status chips, meta | —                        | `--text-xs`                         | 400–600                           | 0                           |
| Table head                     | `TABLE_HEAD_ROW`         | `--text-2xs`, `--fg-muted`          | 600                               | 0 (sentence case)           |
| **Micro-label**                | `SMALL_CAPS` / `EYEBROW` | `--text-2xs`, uppercase             | 600                               | `tracking-label` (0.14em)   |
| Data numbers                   | `font-mono`              | `--text-2xs`–`--text-xs`            | 400–600                           | 0                           |

**The micro-label is the only uppercase text** (021 FR-07, R6). It lives in one atom, `SMALL_CAPS` (with `EYEBROW` as its muted form), and is used for: nav section labels (Create, Organize, Admin), page eyebrows (A7), panel captions ("Before", "AI suggestion", the stage's "Preview"), aside block heads, group heads inside a card, and stepper labels. **Everything else is sentence case:** field labels, status chips and status words, the "Current" / "active" / "Default" pills, table heads, KPI labels. `uppercase` and any literal positive tracking are banned outside `ui/atoms.ts` (§11). `text-transform` never changes the DOM text, so accessible names stay as written.

---

## 6. Spacing, layout and density

**A 4 px base, comfortable.** Spacing tokens: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 px (`--space-1` to `--space-10`, equal to Tailwind's default steps). Cards and grids sit on 20 px gaps (`gap-5`); a card is padded 20 px (`p-5`); a card head sits 12 px above its body (`mb-3`).

**Control heights come from three tokens (014 FR-07, A1):** `--control-sm` 32, `--control-md` 38 (the default), `--control-lg` 44. Tailwind exposes them as `h-control-*` / `w-control-*`. Buttons, single-line fields (`Input`, `Select`, `inputClasses`, `COMPACT_FIELD`), icon buttons (`ICON_BUTTON`, the shell's `SHELL_ICON_BUTTON`) and the theme segments read them; a control never writes its height as a literal (`h-9`, `h-10`, `h-[30px]`, `w-[30px]` are banned by `designTokens.test.ts`). Textareas, the 52 px Create post button, status discs (22–30 px, drawn with `size-[…]`) and skeleton bars are not controls of a size.

| Element         | Desktop                                                                                                                                                  | At 375 px                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Header island   | 56 px tall, inset 12 px, logo 18 px from its left edge, theme toggle at its right                                                                        | the same, with the menu button before the logo |
| Sidebar island  | 244 px on a 268 px band                                                                                                                                  | hidden; opens as the Radix Dialog island       |
| Main column     | `md:ml-[268px]`; padding 10 px top (content starts 90 px down), 20 px left, 28 px right, 140 px bottom (room for the Create post button); `max-w-canvas` | 16 px sides                                    |
| Draft page grid | from `xl` (1280 px): `0.92fr 1.08fr`, 20 px gap, the stage first                                                                                         | one column, the stage first                    |
| Versions        | 4 columns, 8 px gap, 44 px thumbnails                                                                                                                    | 4 columns; the cell text wraps                 |
| Action bars     | one row, 8 px gap                                                                                                                                        | wrap (`flex-wrap`); never scroll sideways      |

**No screen scrolls horizontally at 375 px** (`scrollWidth <= clientWidth` on `<html>`). A wide table scrolls inside its own region (§8.15); the page never does.

**Every screen carries the study's patterns** (021 design.md §8): a page head (eyebrow, title, lead, actions); **page-level sections as bezel cards** with a card head; lists as ruled rows on `--line-subtle` (`ROW`, `divide-y divide-line-subtle`); the selected row or card in the nav "current" look (`bg-surface-raised shadow-panel ring-1 ring-inset ring-line-subtle`), and a selected version, template or option with a 1.5 px ink ring (`ring-[1.5px] ring-inset ring-fg`); recessed forms and code blocks as canvas wells (`bg-canvas` with a hairline ring) inside a card.

---

## 7. Radius and motion

### 7.1 Radius

| Token           | Value  | Used for                                                                                                                             |
| --------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `--radius-sm`   | 8 px   | Nav items, menu items, a selected list row, small close buttons.                                                                     |
| `--radius-md`   | 12 px  | Textareas, notices, menus (`.surface-raised`), the team card, version cells, logo frames.                                            |
| `--radius-lg`   | 18 px  | Cards (`.surface`), the islands, modals, toasts, canvas wells.                                                                       |
| `--radius-xl`   | 26 px  | The bezel (`.surface-bezel`; 20 px inside).                                                                                          |
| `--radius-pill` | 999 px | **Buttons, single-line fields, chips, tags, pill badges, the segmented track, the Create post button, round icon buttons and Send.** |

**Never rounded:** the rendered post, its immediate wrapper, version thumbnails, library thumbnails and the lightbox image (A3, §8.12).

### 7.2 Motion

**Soft and quick.** Elements enter with a small rise or pop; a press is a 0.98 scale.

| Token             | Value                            | Used for                                                                         |
| ----------------- | -------------------------------- | -------------------------------------------------------------------------------- |
| `--dur-fast`      | 140 ms                           | Hover colour, ring and shadow changes; the button press.                         |
| `--dur-base`      | 220 ms                           | Menu entrance (`pop`), the modal entrance (`modalIn`), the Create post nub turn. |
| `--dur-slow`      | 380 ms                           | Toast entrance (`rise`).                                                         |
| `--ease-standard` | `cubic-bezier(0.32, 0.72, 0, 1)` | Everything entering or changing.                                                 |
| `--ease-exit`     | `cubic-bezier(0.4, 0, 0.7, 0.2)` | Elements leaving.                                                                |

- **`pop`** (menus and popovers, `.animate-pop`): from `opacity: 0; transform: translateY(-4px) scale(0.97)` to none, at `--dur-base`. The caller sets the `transform-origin` (`origin-top-left` under a trigger).
- **`rise`** (toasts, `.animate-rise`): from `opacity: 0; transform: translateY(12px) scale(0.98)`, at `--dur-slow`, with `backwards` fill, because Sonner positions each toast with its own transform.
- **The modal keeps `modalIn`,** whose keyframes carry `translate(-50%, -50%)` through every frame. Never put a keyframe `transform` (`pop`, `rise`, a scale) on a transform-centred element (the 2026-07-13 `animate-scale-in` bug).
- **Press:** every Button and the Create post button scale to 0.98 while pressed (`enabled:active:scale-[0.98]`).
- **The Create post button's nub** turns 90° on hover. The button itself does not move on hover.
- **The Primary button does not change on hover** (its raised shadow is its identity, A13); secondary and danger buttons lift to `--shadow-raised`.

### 7.3 Reduced motion (NFR-03)

Under `@media (prefers-reduced-motion: reduce)` (`globals.css`):

```css
*,
*::before,
*::after {
  animation-duration: 1ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 1ms !important;
}
/* loading indicators keep moving, slowly */
.animate-spin {
  animation-duration: 1.5s !important;
  animation-iteration-count: infinite !important;
}
.animate-pulse {
  animation-duration: 2s !important;
  animation-iteration-count: infinite !important;
}
/* menus and toasts swap their entrance for a 150 ms opacity-only fade */
.surface-raised,
.animate-pop,
[data-sonner-toaster] [data-sonner-toast] {
  animation: fade 150ms linear both !important;
}
```

- **Durations are shortened, not removed,** so `modalIn`'s final frame still applies and the modal stays centred.
- **Loading indicators are status,** so `animate-spin` and `animate-pulse` keep looping, slowly. A new looping loader uses one of them or adds its own exemption here.
- **The press scale and the nub turn are off:** `motion-reduce:enabled:active:scale-100` on Button, and `motion-reduce:active:transform-none` / `motion-reduce:group-hover:transform-none` on the Create post button and its nub.
- **Side effect:** `transition-duration: 1ms` on `*` turns on a 1 ms transition for every property. An E2E read of a computed style right after a state change polls (`expect.poll`) or waits briefly.

---

## 8. Components

### 8.1 Logo

- **The logo is the Bistec Studio image,** `public/BistecStudioLogo.png` (R11, A6), restored by 021 T1 byte-identical to its version before 011 T6 (`git hash-object` equals `7fdbe38^:public/BistecStudioLogo.png`).
- **`src/components/Logo.tsx`** renders a `div role="img" aria-label="Bistec Studio"` with the PNG as a cropped `background-image` at a 3:1 aspect (the black wordmark occupies part of a 1536 × 1024 canvas).
- **Dark theme: `dark:invert`.** The logo is solid black, so it inverts to white on dark surfaces. Its computed `filter` is `none` in light and `invert(1)` in dark (AC-10).
- **Sizes:** `<Logo height={32} />` in the 56 px header island, `<Logo height={48} />` on the login card.
- **This reverses the 2026-10-07 wordmark decision** (§1). The accessible name went back from "Studio" to "Bistec Studio", the only name change in 021.
- The PNG is about 2 MB; optimising it is a follow-up, not part of 021.

### 8.2 Buttons

All buttons (`src/components/ui/Button.tsx`): `inline-flex`, `gap: 8px`, 600, `white-space: nowrap`, **pill**, transitions on transform, background, colour and shadow at `--dur-fast`, the 0.98 press (off under reduced motion), and the §9 focus outline (not a ring, so the hairline ring stays free).

| Variant       | Fill / edge / text                                                                | Hover                                 |
| ------------- | --------------------------------------------------------------------------------- | ------------------------------------- |
| **primary**   | `--accent` fill, `--accent-fg` text, **`--shadow-raised` at rest**                | no change (the press is the feedback) |
| **secondary** | `--surface-2` fill, `--fg` text, `--shadow-panel` and a 1 px `--line-subtle` ring | `--shadow-raised`                     |
| **ghost**     | transparent, `--fg-muted` text                                                    | `--surface-2` fill, `--fg` text       |
| **danger**    | the secondary shape with `--status-failed` text                                   | `--shadow-raised`                     |
| **ink**       | `--fg` fill, `--canvas` text, **flat** (`shadow-none`)                            | —                                     |

| Size | Height         | Padding | Text          |
| ---- | -------------- | ------- | ------------- |
| sm   | `--control-sm` | 0 12 px | `--text-xs`   |
| md   | `--control-md` | 0 16 px | `--text-sm`   |
| lg   | `--control-lg` | 0 20 px | `--text-base` |

- **One primary per view** (A13, 014 FR-08). "A view" is the page's `main` content in its current state; a modal or drawer is its own view; the floating Create post button is shell chrome, outside every view. "One" means **at most one** control with the ink fill **and** a resting shadow. A submit attached to a field or sitting in an inline form uses **Ink**, and per-item actions in repeated lists use **secondary** or **ghost**.
  - **Brand kits:** the open kit's **Save** (edit mode) is the primary, and **Add Kit** is primary only while no kit is open. **Save template** and **Save as new version** are Ink.
  - `tests/e2e/a11y.test.ts` (AC-07) counts primaries by fill **and** a visible resting `box-shadow`.
- **The round Send** (the refine prompt and the assistant drawers, the study's `.send`) is a 34 px `rounded-full` `--accent` circle holding the icon, with `aria-label="Send"` and `title="Send"`. It has no resting shadow, so it is not a primary.
- **An open menu button** (`aria-expanded="true"`) keeps a `--line` ring.
- **Disabled:** 50% opacity and `cursor: not-allowed`.
- The study's optional `.btn-pri` nub on Publish is not built.

### 8.3 Inputs, selects and textareas

- **Edge:** 1 px `--line` (3:1); a field in error takes `--status-failed` (`fieldEdge()`). **Fill:** `--surface-2`. Text `--text-sm`, placeholder `--fg-muted`.
- **Single-line fields are pills** (A12): `Input`, `Select` and a raw `<input>` with `inputClasses` are `--control-md` tall with 16 px side padding. `COMPACT_FIELD` is the pill at `--control-sm`, beside small buttons.
- **Textareas are `--radius-md`** (`fieldClasses`): padding 14 px 16 px, relaxed leading; their rows set the height. `COMPACT_TEXTAREA` is the compact form. The caption fields are plain textareas (the Folio ruled lines are gone), with `resize-y`.
- **Focus:** the §9 outline. Where a field sits in a wrapper with an attached button (the refine prompt, the assistant prompts: a `--line` pill on `--surface-2` with the round Send inside), the wrapper shows the outline on `:focus-within`.
- **Selects** use `background-color` for the fill, so the chevron `background-image` survives; the chevron sits 16 px from the right.
- **Field labels are one style app-wide** (014 FR-06, 021 FR-07): the sentence-case `FieldLabel`, `--text-sm` 600 in `--fg`, 6 px above the field. `Input` and `Select` render their `label` prop through it.
  - A field's label is visible and associated: the `label` prop, or `FieldLabel htmlFor` with the field's `id` (from `React.useId()`). A placeholder is never a field's only name.
  - The caption over a group of controls is `FieldLabel as="span"`. The group carries its own name: a checkbox set is `role="group"`, a radio set `role="radiogroup"`, each `aria-labelledby` the caption's `id`; a set of option buttons has its own `aria-label`; a segmented toggle's tablist is named by the toggle itself.

### 8.4 Segmented toggles (`SegmentedToggle`, the theme toggle, the OS tabs)

- **Track:** a `--canvas` pill, 3 px padding, a 1 px inset `--line-subtle` ring, 2 px between segments.
- **Segment:** a pill, 6 px 12 px, `--text-xs` 600, `--fg-muted` (→ `--fg` on hover). **The selected segment is raised:** `--surface-2` fill, `--fg` text, `--shadow-panel`. Focus is the §9 outline (no `overflow: hidden` on the track, so nothing clips it).
- `SegmentedToggle` renders a `tablist` with a **required** `label` and `tab`s with `aria-selected`.
- **The theme toggle** (`src/components/theme/ThemeToggle.tsx`, A8) is the same track with two icon segments, Sun and Moon, in a `group "Theme"`, each `aria-label` / `title` "Light" / "Dark" with `aria-pressed`. The segments are `--control-sm` squares (32 × 32; the study draws 32 × 30, but `h-[30px]` is a banned control literal). The highlight keys on `.dark`, so first paint is right.
- **The Claude connect guide's OS tabs** draw the same track and segments by hand, because each tab keeps its own `id` and `aria-controls`.

### 8.5 Status chips

`StatusChip` (the study's `.chip`): a pill, `h-6`, padding 0 10 px 0 8 px, `--text-xs` 600, **sentence case**, a 6 px `::before` dot in `currentColor`, the text in the status colour on the same colour at **0.12** (A2). No ring, no uppercase. A chip never shrinks or wraps (`flex-shrink-0 whitespace-nowrap`). Status is never colour alone: every chip carries its text label.

It takes one of two props (014 FR-03):

- **`status`:** one of the nine known states (draft, exported, scheduled, published, failed, queued, generating, generated, cancelled). The label comes from the chip.
- **`tone` with `children`:** for a state the chip has no entry for (Connected, Not connected, Invalid — reconnect, Active, Deactivated, Revoked). `tone` is `published`, `draft`, `scheduled`, `failed` or `exported`.

**Pill badges** (`PILL_BADGE`, the study's `.v .cur`) are a different thing: a small ink pill, 10 px 600 on 16 px, `--accent` fill and `--accent-fg` text, for "Current", "active", "Default", "System default", "default" and "Unfinished".

### 8.6 Sidebar nav and team switcher

- **Nav items** (`AppShell.tsx`): `flex`, 11 px gap, padding 8 px 10 px, `--radius-sm`, `--text-sm` 500 in `--fg-muted`; hover → `--canvas` fill and `--fg`.
- **Each item has its lucide icon** (A9) at `ICON` (16 px, stroke 1.6), `aria-hidden`: LayoutDashboard (Dashboard), BookOpen (Library), FolderOpen (Projects), Megaphone (Campaigns), Palette (Brandkits), Building2 (Team Settings, Teams), Users (Users), UserCog (Settings), LogOut (Sign out). Link names are unchanged.
- **The current page** (`aria-current="page"`) is raised: `--surface-2` fill, `--fg`, `--shadow-panel` and a 1 px inset `--line-subtle` ring. The same "current" look marks a selected row anywhere (§6).
- **Section labels** (Create, Organize, Admin) are the micro-label (`EYEBROW`), 10 px from the item's left. The sections, the role-gating and the bottom-pinned Settings and Sign out (above a `--line-subtle` rule) are unchanged.
- **Team switcher** (the study's `.team`, `TeamSwitcher.tsx`): a card at the top of the island, `--surface-2`, `--radius-md`, a 1 px inset `--line-subtle` ring (→ `--line` on hover), padding 8 px. It holds a 32 px `TeamAvatar` (initials on `--canvas`, 10 px radius, `aria-hidden`), the team name at `--text-sm` 600 over the role at `--text-2xs` `--fg-muted`, and an up-down chevron. The multi-team trigger keeps `aria-label="Switch team"`. Its menu is `.surface-raised` with `origin-top-left animate-pop`.
- **Breadcrumbs** (campaign and project detail): `--text-xs` 500 in `--fg-muted` (the study's `.back`), `--fg` with an underline on hover; the current crumb in `--fg`, `aria-hidden` (the `h1` carries the name). The draft page's "← Library" link is the same.

### 8.7 Menus

`.surface-raised`, padding 6 px. Items: padding 8 px 10 px, `--radius-sm`, `--text-sm`, a 16 px icon with a 10 px gap. Hover or highlight fill: `--canvas`. Separator: 1 px `--line-subtle`. A destructive item is `--status-failed`. Entrance: `pop` at `--dur-base`.

### 8.8 Toasts

`ToastProvider.tsx` (Sonner, `unstyled`, so its own theme never fights the tokens): `.surface-overlay` at `--radius-lg`, 340 px wide, `animate-rise`. A 30 px status disc on the status colour's 0.12 tint holds the icon; the title is `--text-sm` 600 and the body `--text-xs` `--fg-muted`; the close button is a 24 px `--radius-sm` square. **Offset** `{ bottom: 96, right: 24 }`, and the same bottom on mobile: the 52 px Create post button at 24 px, plus a 20 px gap. The content of a toast stacked behind the front one is hidden (`globals.css`).

### 8.9 Create post button

- **The study's `.fab`** (`CreatePostButton.tsx`): fixed 24 px from the right and bottom, `z-30`, 52 px tall, `--accent` fill with `--accent-fg` `--text-sm` 600 text, pill, `--shadow-overlay`, padding 0 20 px 0 7 px, 10 px gap.
- **The nub:** a 38 px circle on `--accent-fg` at 0.14, holding the Plus icon. It turns 90° on hover over `--dur-base`.
- **Press:** 0.98. **Reduced motion:** neither the button nor the nub moves.
- **Below `md`** it is a 52 × 52 circle showing the nub alone, with the same accessible name, "Create post", a `title` tooltip and its `data-testid`.
- **Layering:** above page content, below the header, the mobile sidebar overlay, modals and the lightbox. It is hidden on `/brief` and on the draft page (020), where the page's own actions, the refine Send button among them, sit in that corner.
- **Known:** being fixed bottom-right, it covers the right end of the last visible row on some screens at rest; the 140 px bottom padding of `main` lets every row scroll clear of it. The padding still serves the pages that show the button; on the draft page it clears nothing and is left alone.

### 8.10 Modals, drawers and confirm dialogs

- **Modal** (`ui/Modal.tsx`): `.surface-overlay` over a 0.5 scrim, padding 24 px, `--text-base`, centred with `animate-modal-in`. The title is `SECTION_HEAD` (16 px 600); the close button is a round `ICON_BUTTON` with `aria-label="Close"`. Never taller than the viewport: the header and footer stay pinned and the body scrolls. Widen with `size`, never with `className` (`cn` is a plain join).
- **Drawer** (the assistant drawers, publish history): `.surface-overlay` with square corners, full height, up to 448 px wide, from the right (`animate-slide-in`), its header ruled off by `--line-subtle`.
- **ConfirmDialog:** on Modal; its buttons are Button variants, with the primary (or danger, in a destructive confirm) rightmost.

### 8.11 Lightbox

`ImageLightbox`: the image is shown as rendered, never restyled. The close button and the caption bar are `.surface-overlay` pills; the content enters with `pop`. Scrim 0.8. The download button and its name are unchanged.

### 8.12 The post stage

The draft page's preview (021 FR-11), in place of Folio's proof plate:

- **The stage** is `<section aria-label="Preview" className="surface-bezel p-5 sm:p-7">`: a bezel card.
- **The bar:** the micro-label "Preview" (`EYEBROW`) on the left, and a mono `--text-2xs` `--fg-muted` line on the right, "1080 × 1350 · v2 of 4".
- **The post** is centred, up to 392 px wide, **at its own aspect ratio** (1:1, 4:5 or 9:16), on `--canvas`, `object-contain`. **The post and its immediate wrapper are never rounded, filtered or transformed** (A3, the "shown as rendered" E2E).
- **The expand badge** sits on the post's top right, inset 10 px, shown on hover and keyboard focus; the post itself is the "View full screen" button. The badge is a `--control-sm` square at 10 px radius with fixed paper-on-ink values (`#fbfaf8` fill, `#181816` icon, its own drop shadow), because it sits on an image of any colour. It is a documented `ui-exception` (§11). The library tiles' expand button uses the same values.
- **Below the stage (026):** the Refine Design card (§8.14) sits directly under this card in the same left column (`flex min-w-0 flex-col gap-3.5`), shown once the draft is ready. Below the `xl` breakpoint the order is Preview, Refine Design, Captions.
- Under the post: the 008 "Generated with" line, then `BackgroundNotice` (§8.14), then the versions (§8.13), the note and Undo, and at the foot, under a `--line-subtle` rule, the Design model picker (Path B, once ready).
- **Library tiles** (`PostCard`) are `.surface` cards, padding 10 px, `hover:shadow-raised`. The thumbnail inside stays square-cornered with no filter; the title is `--text-base` 600, then the meta row and the status chip, then Publish (secondary sm), History (ghost sm) and Delete (`ICON_BUTTON`).
- **There are no crop marks and no proof plate** anywhere; the guard forbids their names (§11, pattern 7).

### 8.13 Versions

- **The cells** (the study's `.v`): `<ul aria-label="Versions">` in a 4-column grid, 8 px gap, under an `sr-only` h2 "Revision History" (the heading outline is kept, FR-12). Each cell, `--radius-md`, holds a 44 px thumbnail at the post's ratio (square-cornered, as rendered), `vN` in mono 600, and the instruction, the date and the model name in `--text-2xs` `--fg-muted` (the model name keeps its `title`, "Generated with …").
- **The current version** is a `div aria-current="true"` in the raised "current" look with a **1.5 px `--fg` ring** and a `PILL_BADGE` "Current". Other cells are buttons named "Switch to vN", with a `--surface-2` hover.
- **The note** (`--text-xs` `--fg-muted`, with a clock icon) reads "Switching is instant — each version keeps its own export." when there are two or more versions. **Undo** (Path B) is a ghost sm Button at the right of that row, beside the versions.
- **No previous/next arrows** (A5).

### 8.14 Caption and refine cards

Since 026 the draft page has two columns. The left column holds the Preview card (§8.12) and, under it, the **Refine Design** bezel card. The right column holds the **Captions** bezel card. Each card has a card head (`SectionHead`, 16 px 600, the study's `.card-hd`).

**The Captions card (012).** `CaptionPanels` (`src/components/drafts/`) is a `<section>` bezel card whose h2 "Captions" has **"Regenerate all"** in its tail (and "Regenerating…" while it runs). Under the head sit the "All captions model" picker and, while the draft generates, "Writing the captions…". Inside are **three sub-panels**, ruled apart on `--line-subtle` (`divide-y`, 20 px each), each a `SectionHead level={3}` with a `useId` id, in this order:

| h3            | Field                                                                   | Helper text                                                               | Counter (mono, right)                 |
| ------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------- |
| **Headline**  | single-line pill `Input`, placeholder "Write the headline…"             | "The text on the image. Regenerate the design to use a changed headline." | `n / 100`, `--status-failed` past 100 |
| **Instagram** | the caption textarea (§8.3), placeholder "Write the Instagram caption…" | none                                                                      | `1,234 / 2,200 (Instagram)`           |
| **LinkedIn**  | the caption textarea                                                    | none                                                                      | `412 / 3,000 (LinkedIn)`              |

- **Names (014 FR-12).** Every field is `aria-labelledby` its h3, so its accessible name is "Headline", "Instagram" or "LinkedIn". Its `aria-describedby` lists only what is rendered, in this order: the failure notice, the helper text, the counter, the limit warning. The headline's lists its inline error, the helper and the counter.
- **Saving.** Every field saves on blur (the PATCH). The tail shows Saving… / Saved (`--status-published` 600) / Unsaved changes (`--status-scheduled` 600). Saving is **never** blocked by a limit. A headline PATCH error shows inline as `<p role="alert">`, with `aria-invalid` and a `--status-failed` edge; the typed value stays.
- **The panel tail, in order:** save state · **Undo** (only while a snapshot exists) · **Copy** · **Generate / Regenerate**. The headline's tail has no Copy.
  - **Generate / Regenerate:** "Generate" when the field is empty, otherwise "Regenerate"; named "Generate <Label> caption" / "Regenerate <Label> caption" (the headline: "Generate headline" / "Regenerate headline"). A spinner shows while that panel's own row is `PENDING`.
  - **Undo:** one per panel, named "Undo <Label> caption" / "Undo headline". It restores **only its own panel** through the PATCH.
  - **Copy:** `navigator.clipboard.writeText`, named "Copy <Label> caption". Toast "Caption copied"; on failure "Couldn't copy. Select the text and copy it manually." Disabled while the row is `PENDING` or the field is empty.
- **"Regenerate all"** regenerates the two captions and **never the headline** (012 A9). It first waits for every panel's in-flight blur-save, then captures an Undo snapshot in each caption panel.
- **Locking.** While any regenerate POST is in flight, or the draft has a pending action, every Regenerate, Undo and "Regenerate all" is disabled. The headline field is disabled while a `REGENERATE_COPY` action holds the draft.
- **Skeletons.** Only a `PENDING` row shows one: a `role="status"` region named "Generating the <Label> caption" (the headline: "Generating the headline"). **Empty text on a row that is not `PENDING` always shows the editable field** (the TC-ASYNC-10 lesson).
- **Notices** (`Notice`, §8.18; icon `AlertTriangle`, `aria-hidden`), above the field:

  | Notice                 | Shown when                            | Tone      | Role | Text                                                                                |
  | ---------------------- | ------------------------------------- | --------- | ---- | ----------------------------------------------------------------------------------- |
  | Failed                 | `status` FAILED                       | `error`   | none | The <Label> caption failed to generate (<reason>). Write it below, or use Generate. |
  | Last regenerate failed | `status` READY with a `failureReason` | `warning` | none | The last regenerate failed: <reason>. The caption below is unchanged.               |

  The last-failed notice goes once the row is saved after an edit, or regenerated successfully. Failed and last-failed never show together. (The Review notice was removed by change 016.)

- **Limits and warnings** (from the channel registry, `src/lib/channels.ts`; numbers `en-US`): past a **hard** limit the counter turns 600 `--status-failed` and a line below reads "Over the <Label> limit". A channel with no limit shows `n characters`. (WhatsApp had a soft 1,000 guide and a "Not published from Studio yet" helper until 026 removed the WhatsApp caption; `CaptionChannelSpec` no longer has `softLimit` or `publishable`.)

**The Refine Design card** (`RefinementPanel`): a `<section>` bezel card, its h2 "Refine Design" (whose `id` names the prompt) with the request count in mono `--text-2xs`.

- **The log** (the study's `.thread`): the focusable "Refine requests" region (`SCROLL_FOCUS`, capped height, §8.15), an `ol` ruled on `--line-subtle`. Each row holds a 22 px **status disc** (`aria-hidden`): a check in `--status-published`, or an alert in `--status-scheduled` (brand conflict, not applied) or `--status-failed` (error), on the colour's 0.12 tint, or a spinner on `--canvas` while pending; then the instruction at `--text-sm` 500; then a `--text-2xs` `--fg-muted` status line in **sentence case** ("Applying…", "Applied", "Brand conflict" and "Not applied" in `--status-scheduled` 600, "Failed: …" in `--status-failed`); and on the right a mono `<time>`, the session-local time the request was sent. The status line carries no version number.
- **Suggestions:** a muted "Try:", then each suggestion as a `TAG` pill (28 px, `--line` ring on hover).
- **The prompt:** the `--line` pill form with the input (named by the card's heading) and the round Send (§8.2).
- **Notices:** `NotAppliedCard` (red, `role="alert"`, with "Use anyway") and the conflict notice (amber) are `Notice`s at 0.12. **`BackgroundNotice`** (under the post) is the amber `Notice` with `role="status"`, `data-testid="background-notice"` and `data-reason`.

### 8.15 Data tables

Ruled rows (1 px `--line-subtle`), the last row without its rule, under `TABLE_HEAD_ROW`: **sentence case**, `--text-2xs` 600 `--fg-muted` (the study's `.ct th`). Numbers align right and use the body's tabular figures. A table sits inside a bezel card.

**A container that scrolls on its own** (a wide table at 375 px, a long list) is a focusable, labelled region: `tabIndex={0}`, `role="region"` and an `aria-label`. It is `relative` when it holds `sr-only` cells: an `sr-only` element is absolutely positioned, and without a positioned ancestor inside the container it widens the page. The admin tables keep the region inside the bezel card, so its inset focus outline is not drawn over the tray.

**The rule is static (014 FR-17).** Any `overflow-*-auto` box with a height or width cap has `tabIndex={0}`, `role="region"`, an `aria-label` and the inset `SCROLL_FOCUS` **unconditionally**, whether or not it overflows now. Examples: the kit list "Brand kits", the assistant drawers' "Conversation", the draft page's "Refine requests", "Planned posts", "Recent drafts", the admin "Teams" and "Users" tables.

**Exempt, with the reason:**

- **The app shell's `main` and sidebar:** page-level scroll, and each is already a landmark.
- **`Modal` and `Drawer` bodies, and the `ElementEditPanel` aside inside the inline-edit dialog:** Radix moves focus to the first focusable element, so a tab stop on the body would change every dialog's initial focus.
- **The `FontEditor` listbox:** a popup that manages its own focus.

### 8.16 Icons

`lucide-react` stays (NFR-05). Icons are `ICON` (16 px) or `ICON_SM` (14 px), `strokeWidth` 1.6, in `currentColor`, and `aria-hidden` beside text. The nav has them (§8.6). An icon-only button always has an `aria-label`. **`ICON_BUTTON`** is the quiet round `--control-sm` target in `--fg-muted` (the study's `.vnav` and `.x`); the caller adds the hover (`hover:bg-surface-raised hover:text-fg`) and `FOCUS`.

### 8.17 Draft page: the page head, and no More menu

**The draft page has no "More" menu** (user decision, 2026-10-07; A5). The study regroups some actions (a More menu, a Refine button, previous/next arrows, Delete draft); **none of that is built.** Every action is a visible button with its own name.

- **The page head runs across the top:** the "← Library" back link; the `Draft` eyebrow (A7); the h1 (`PageTitle`, truncating from lg with a `title`); the meta row (`StatusChip` · channels · kit · size, split by 3 px `--fg-muted` dots); and on the right the action bar: **Regenerate design** (secondary, Path B), **Edit inline** (secondary, once ready), **Export** / **Re-export** (secondary) and **Publish** (primary, team admins only), the view's one primary. The head stacks below lg, and the bar wraps; it never scrolls.
- **Then the grid** (§6): the stage (§8.12) first in the DOM, so the tab order is the head, then the stage, then the cards (FR-12; the AC-17 draft stops are `Library`, `Regenerate design`, `Edit inline`).
- **View full screen** is the button on the post itself (§8.12), not a bar action. **Undo sits beside the versions** (§8.13).

**FR-12 binds this layout, which is why there is no menu.** Every control stays present and reachable, with its accessible name and **role** unchanged. The E2E suite opens the inline editor with `getByRole('button', { name: 'Edit inline' })`. An item inside a Radix menu is a `menuitem`, not a `button`, and is hidden until the menu opens, so moving an action into a menu would change its role. No action is added or regrouped into a menu without a new decision.

### 8.18 Page primitives and the shared atoms

The page heads, section heads, notices, field labels and the gate notice are shared components in `src/components/ui/` (014 FR-01). The class strings they are built from live in **`src/components/ui/atoms.ts`**, for the few heads and screens with a bespoke structure.

**The components:**

- **`PageHead({ eyebrow?, title, lead?, actions?, actionsClassName?, className? })`** renders the page's `h1`, always level 1. The eyebrow is the micro-label above the title, which then takes `mt-2`. `actions` sits on the right and drops below the title at 375 px; a caller with a fixed-width control that should shrink passes `actionsClassName="min-w-0"`.
- **`PageTitle({ children, className? })`** is the `h1` alone, for detail pages whose head is a breadcrumb plus a title.
- **`SectionHead({ title, level = 2, card?, id?, className?, children? })`** renders an `h2` in the card-head style (`SECTION_HEAD`, 16 px 600), or with `level={3}` an `h3` in the sub-head style (`SUB_HEAD`, 14 px 600). **`card`** gives an `h3` the card-head style while keeping its level: the brand kit's six sections are bezel cards headed by h3s under the kit's h2 (021 T8).
  - `id` goes on the heading, for `aria-labelledby`.
  - `children` is the right-hand tail (a status, a count, small buttons), at `--text-xs`.
  - The row wraps at 375 px, and the tail keeps right. There is no numeral (A11).
- **`Notice({ tone, role?, icon?, className?, children, ...rest })`** is a notice on its status tint: `warning` (`--status-scheduled`), `error` (`--status-failed`) and `info` (`--accent`), the text in that colour on its 0.12 fill, `--radius-md`, padding 12 px 16 px, no ring. `neutral` is a `--surface-1` fill with `--fg` text and a 1 px inset `--line-subtle` ring.
  - It renders **no `role` of its own.** The caller passes `role="status"` or `role="alert"`; `role`, `aria-*` and `data-*` pass through.
  - `icon` puts the icon and a flexible body in a row.
- **`FieldLabel({ htmlFor?, id?, as = 'label', className?, children })`** is the sentence-case field label (§8.3).
- **`GateNotice({ title, … })`** (`ui/GateNotice.tsx`) is the "you can't see this page" card for the team and admin pages: a bezel Panel with the icon, a card head, a muted body and a "Back to Dashboard" link.
- **`Panel({ bezel?, className?, … })`** is `.surface` or `.surface-bezel` (§4.1).
- **`StatusChip`** is §8.5.

**The atoms** (`ui/atoms.ts`): `FOCUS`, `SCROLL_FOCUS`, `SMALL_CAPS`, `EYEBROW`, `PAGE_TITLE`, `PAGE_LEAD`, `SECTION_HEAD`, `SUB_HEAD`, `NOTICE`, `ICON`, `ICON_SM`, `ICON_BUTTON`, `TEXT_LINK`, `TAG` (the neutral canvas pill for kit, tone, size and slot tags and suggestions), `PILL_BADGE` (§8.5), `TABLE_HEAD_ROW`, `ROW` (a ruled row), `COMPACT_FIELD` and `COMPACT_TEXTAREA`. None carries an outer margin.

**The fold rule (021 R8, design.md §7).** An atom used by more than one screen group lives in `ui/atoms.ts`. An atom used by one group lives in that group's own module, named for what it holds, never for a theme:

| Module                                      | Holds                                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/components/campaigns/classes.ts`       | `ROW_TITLE`, `CRUMB_LINK`, `CRUMB_CURRENT`, `ASIDE_BLOCK` (campaign and project pages) |
| `src/components/admin/brandkits/classes.ts` | `rowCls`, `optionCls`, `CODE_FIELD`, `TITLE_FIELD` (the brand kits admin)              |
| `src/components/brief/cardCls.ts`           | `cardCls`, `rowCls` (the brief wizard)                                                 |

A feature module never redefines a shared name.

**No primitive owns its outer margin.** The caller passes spacing in `className`: `mb-6` after a page head, `mb-3` under a card head. Pass spacing only: `cn` is a plain join, so a `className` that repeats a property the primitive sets is settled by CSS source order.

**The guard.** `tests/unit/uiTokenGuard.test.ts` fails when any file under `src/` outside `src/components/ui/` declares a `const` or `function` with a shared name: `FOCUS`, `SCROLL_FOCUS`, `SMALL_CAPS`, `EYEBROW`, `FIELD_LABEL`, `PAGE_TITLE`, `PAGE_LEAD`, `SECTION_HEAD`, `SECTION_NUMERAL`, `SUB_HEAD`, `KIT_TITLE`, `STEP_HEAD`, `STEP_NUMERAL`, `STEP_LEAD`, `GROUP_HEAD`, `ASIDE_HEAD`, `NOTICE`, `WARN_NOTICE`, `ICON`, `ICON_SM`, `ICON_BUTTON`, `TEXT_LINK`, `TAG`, `TABLE_HEAD_ROW`, `ROW`, `COMPACT_FIELD`, `COMPACT_TEXTAREA`, `PILL_BADGE`, `PageHead`, `PageTitle`, `SectionHead`, `SectionHeader`, `Notice`, `FieldLabel`, `StatusWord` and `GateNotice`. A copy has no legitimate exception, so `// ui-exception:` does not apply. Import the atom, or give a genuinely different thing a different name (`SHELL_ICON_BUTTON`, `ROW_TITLE`).

### 8.19 The model picker, its hint line and the team-token notice (008)

**`ModelPicker`** (`src/components/ui/ModelPicker.tsx`) is the one control for choosing a Claude model. It is a `Select` (§8.3) with its `FieldLabel`, then a hint line, then an optional notice. Every answer it shows comes from the pure helpers in `src/lib/models/pickerState.ts`, which call the server's own resolver (`decideModel`) over `GET /api/models` (`useModels()`, React Query key `['models']`). It adds no rule of its own.

- **Options:** only the models this user can run on this surface on this team: the team's allowed models that the surface supports, minus Opus when the switch applies. They are cheapest first, valued by key (`HAIKU`, `SONNET`, `OPUS`), and labelled `<name> · <tier> (<speed>)`, for example "Sonnet 5.5 · $$ (medium)".
- **Pre-selection:** what the server would run if the picker is left alone (the stamp, then the team default, then the system default).
- **The send rule:** the picker reports `undefined` until the user picks a different model, and the caller then omits `model` from the request. Picking the pre-selected model again reports `undefined` too.
- **Accessible name:** `FieldLabel` "Model", or a surface-specific name wherever more than one picker shares a screen: "Caption model" and "Design model" (wizard Review); "Refine model", "Design model", "Headline model", "All captions model" and "Instagram / LinkedIn caption model" (draft page); "Briefing assistant model" and "Brand kit assistant model" (the assistant drawers). Each is unique on its screen.
- **Disabled** while any action on the screen is pending, like the controls beside it.
- **One model** shows as plain text, `--text-sm` `--fg`, "Model: Haiku 4.5", with no select.
- **Hidden** (renders nothing) while `/api/models` loads, when no model can run the surface, and for captions when the caption provider isn't Claude.
- **A refused pick** (the server's `400 MODEL_NOT_ALLOWED`) is shown as the `Select`'s field error: `<id>-error`, joined to `aria-describedby`, with `aria-invalid="true"`. It is not a toast. A new pick clears it.
- **A pick that stops being offered** is reset to `undefined` by the picker, so it is never sent.

**The hint line** is `--text-xs` `--fg-muted` under the select, with the id `<id>-hint`, tied to the select by `aria-describedby`. It says why the pre-selection is what it is. Once the user picks, the pre-selection line drops; the gated line and the caller's note stay.

| Why                                         | Text                                                                                          |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| The draft's stamp                           | "Same model as the current caption" (or "headline", or "design")                              |
| The team default                            | "Team default"                                                                                |
| The system default                          | "Default"                                                                                     |
| The fallback                                | "Default (the team's choice isn't available)"                                                 |
| A stamp the team no longer allows           | "Opus 5.5 is no longer available on this team — using Sonnet 5.5" (the stamped and run names) |
| The switch hides Opus from this user        | "Opus requires a personal Claude token on this team — connect one in Settings"                |
| The caller's note (the wizard's path reset) | "Opus 5.5 isn't available for template fill"                                                  |

**The team-token notice** is `Notice tone="warning" role="status"` under the hint, non-blocking: "This run uses your team's Claude allowance. Connect your own token in Settings to use yours." It shows only in CLI mode, on the team credential, when the shown model is one the switch can gate (today, Opus).

**"Generated with"** (`src/components/drafts/GeneratedWith.tsx`) is a muted `<p>`, `--text-xs` `--fg-muted`, in each caption panel's tail, the headline panel's tail and under the post: "Generated with Sonnet 5.5". A stamp no catalogue entry describes shows the raw ID. A substitution adds "(substituted)", whose `title` reads "Substituted for <name>", with an `sr-only` copy. It is hidden while the row is generating, for a FAILED caption row and on a FAILED draft. In the version cells (§8.13) the model name shows alone, with the sentence in its `title` and an `sr-only` "Generated with".

**Where pickers sit:**

| Screen                    | Placement                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brief wizard, Review step | Two pickers in a `sm:grid-cols-2` grid under the summary list; the summary gains "Caption model" and "Design model" rows                          |
| Draft page, refine        | Under the instruction form                                                                                                                        |
| Draft page, captions      | In each caption panel's and the headline panel's tail; "All captions model" under the Captions card head                                          |
| Draft page, design        | At the foot of the stage, under a `--line-subtle` rule, Path B only and once the draft is ready (§8.12)                                           |
| Assistant drawers         | The first strip under the drawer's title bar, with a `--line-subtle` rule below; nothing renders, not even the strip, until the models view loads |

**`/team` → Models** is the admin side, a bezel card: a named group of checkboxes, "Allowed models", labelled `<name> · <tier> · <speed>` with a "New" `StatusChip` outside the label for a model added since the team saved; six `Select`s in a "Defaults" group, each starting with "System default (<name>)"; the switch "Opus requires a personal token" with its helper text (disabled in API mode, "Only applies in CLI mode."); and an Ink Save (§8.2). A 400 shows inline as `Notice tone="error" role="alert"`.

---

## 9. Accessibility floor

- **NFR-01, contrast.** Every text-on-surface pair meets WCAG 2.2 AA in both themes: 4.5:1 for body text. Every non-text boundary a user must perceive (field and control edges, focus) meets 3:1. §3.3 shows every declared pair passing; `tests/unit/contrast.test.ts` enforces it. `--line-subtle` is decorative and is never a boundary or a text colour.
- **NFR-02, visible focus.** Every interactive element shows `outline: 2px solid rgb(var(--focus))` with `outline-offset: 2px` on `:focus-visible` (`FOCUS`): at least 13.46:1 in both themes. A scroll container uses the inset form (`SCROLL_FOCUS`), so its own overflow can't clip it. `outline: none` without a replacement is never allowed.
- **NFR-03, reduced motion.** §7.3.
- **Status is never colour alone.** Chips, status words and refine outcomes always carry a text label; links are underlined.
- **Targets.** Controls take their height from the `--control-*` tokens (§6), all above WCAG 2.2's 24 × 24 px minimum.
  - **The 24 px box (014 FR-18).** A remove or delete target is at least 24 × 24 px as its own border box. An icon-only remove button that is not an `ICON_BUTTON` (32 × 32) is `inline-flex h-6 w-6 items-center justify-center` (the ColorEditor and FontEditor "Remove …" buttons, the Recent Drafts "Discard unfinished brief").
- **Every field has a label (014 FR-12).** A visible, associated label (§8.3): the `label` prop, `FieldLabel htmlFor`, or `aria-labelledby` a visible heading or `dt` (the draft captions and refine prompt, the campaign and project aside selects). `aria-label` alone is kept only where a visible label would repeat a sibling's.
- **Every tablist has a name (014 FR-13).** `SegmentedToggle` takes a **required** `label`, rendered as the `tablist`'s `aria-label` ("Filter by status", "Provider slot", "Prompt view", "Briefing view", "Size", "Design", "Edit mode"; the guide's "Operating system"). `tsc` fails without it.
- **Stepper steps not yet reached are `aria-disabled="true"` (014 FR-15).** They stay focusable; the current step is `aria-current="step"`. Each step keeps its number in a 22 px disc, which is part of the step button's name (`1Campaign`).
- **A name is read once (014 FR-16).** Decorative duplicates are `aria-hidden`: a kit row's colour swatches (they keep their `title`), a breadcrumb's current crumb, nav and button icons, the team avatar, status discs, and `/team`'s On/Off word beside its toggle.
- **One `h1` per page,** including `/login` (a `sr-only` "Sign in to Studio", 014 FR-14).
- **The axe scan (014 AC-19).** `tests/e2e/a11y.test.ts` injects `axe-core` and runs `label`, `select-name`, `aria-input-field-name`, `aria-toggle-field-name`, `button-name`, `link-name`, `page-has-heading-one`, `scrollable-region-focusable`, `target-size`, `aria-allowed-attr`, `aria-valid-attr-value` and `aria-required-attr` on the main routes, in light theme at 1440 px, and expects zero violations. A rule is never removed to make the scan pass.
- **375 px.** Every screen works at 375 px wide with no horizontal page scroll.

---

## 10. Build decisions carried over from Frozen Light §0

| Frozen Light §0 decision                                                                                                                                                                                      | Status under Graphite                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Theme default and persistence.** Follow the OS (`prefers-color-scheme`) on first visit, then remember the user's manual toggle in `localStorage`. Apply the class before first paint. Not stored in the DB. | **Kept, unchanged.** The key is `bistec-theme`; `themeInitScript` (`src/components/theme/ThemeProvider.tsx`) sets `.dark` on `<html>` before paint (NFR-04). A stored choice survived both redesigns.                                   |
| **Both a dark and a light theme are mandatory**, switched by the `dark` class on `<html>` (Tailwind `darkMode: "class"`).                                                                                     | **Kept.** The token switch keys on the same class. Portaled Radix and Sonner surfaces inherit the tokens from `<html>`.                                                                                                                 |
| **Self-host fonts and icons; no runtime CDN.**                                                                                                                                                                | **Kept; the fonts changed again.** Plus Jakarta Sans and JetBrains Mono through `next/font/google` (build-time download, served by the app; the E2E fails on any CDN request). Icons stay `lucide-react`.                               |
| **Design fidelity: Frozen Light is a starting point, not a rigid spec;** deviate where a screen needs it.                                                                                                     | **Changed (since 011).** Screens may change layout within the page (FR-12 allows it), but **never through ad-hoc values**: colours, sizes, radii, shadows and durations come from the tokens. A raw value needs a `ui-exception` (§11). |
| **Shared foundation first:** theme config, utilities, theme provider and base components before screen work.                                                                                                  | **Kept.** 021 wave 1 (tokens, primitives, shell) landed before any screen task.                                                                                                                                                         |

Rules that **no longer hold**: the glass utilities and glow blobs; the ice-blue accent and `primary-light`; Material Symbols; and, from Folio, the serif display face, the sienna accent, hard offset shadows, the 2 px ink block rule, the section numerals, small-caps labels and chips, the proof plate, and the typeset wordmark.

---

## 11. The `// ui-exception:` convention and the guards

**App code uses semantic tokens only.** `tests/unit/uiTokenGuard.test.ts` walks every `.ts`, `.tsx` and `.css` file under `src/` and fails with `file:line` for each hit. Comments are scanned like code: a comment that names a retired token by its class name fails; describe it instead.

**1. The token guard (011 AC-14, 014 FR-11).** It flags:

```
(bg|text|border|ring|from|to|via|fill|stroke|divide|outline|placeholder)-(light|dark)-[a-z-]+
\bglass(-panel|-popover|-input)?\b
(bg|text|border|ring|fill|stroke)-(slate|gray|zinc|neutral|stone|sky|blue|red|green|amber|emerald|violet|purple|indigo|rose|orange|yellow|teal|cyan|lime|pink|fuchsia)-\d{2,3}
```

the names `GlassInput` and `GlassPanel`, and, as **whole class tokens**, `glow-blob`, `animate-scale-in` (use `animate-modal-in`, §7.2), `font-inter` and the legacy `primary` colour family (`text-primary`, `bg-primary-light`, `text-primary-500`, …). A token starts at the start of the line or after one of ``\s " ' ` { ( : !``, and ends at the end of the line or before one of ``\s " ' ` } ) ] /`` or `, . ; :`. So `variant="primary"`, `my-glow-blob-x` and `animate-scale-in-out` pass.

**2. The Folio deny-list (021 FR-13, R7).** Every pattern is on, and none of them honours `ui-exception:` (there is no legitimate Folio leftover):

| #   | Catches                                                                                                                                   | Notes                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `fraunces`, `instrument sans` / `instrument_sans`                                                                                         | `src/components/admin/brandkits/googleFonts.ts` is excluded: it lists Instrument Sans as one of the Google Fonts a brand kit may use for its posts (data, not the app's face). |
| 2   | `font-display`, `font-text` as class tokens                                                                                               |                                                                                                                                                                                |
| 3   | `opsz`, `font-variation-settings`                                                                                                         |                                                                                                                                                                                |
| 4a  | a file named `*folio*`; an import path containing `folio`                                                                                 |                                                                                                                                                                                |
| 4b  | the word `folio` on any line, comments included                                                                                           | `portfolio` passes                                                                                                                                                             |
| 5   | a positive literal letter-spacing in em: `tracking-[0.14em]`, `[letter-spacing:0.1em]`, `letter-spacing: 0.1em`, `letterSpacing: '0.1em'` | everywhere, `ui/` included; the one tracking is `tracking-label`                                                                                                               |
| 6   | `uppercase` as a whole token, any case (the class, `[text-transform:uppercase]`, CSS, a style object)                                     | in `src/app/` and `src/components/` except `ui/atoms.ts` (§5.2)                                                                                                                |
| 7   | `proof plate`, `crop mark`, the `CROP` constant                                                                                           |                                                                                                                                                                                |
| 8   | a hard offset shadow: non-zero x and y offsets (either sign) and a zero blur, in CSS or an arbitrary class                                | Graphite's soft layers and the dark inset highlight (`inset 0 1px 0 …`) pass                                                                                                   |
| 9   | `border-t-2`, `border-b-2` (Folio's 2 px block rule)                                                                                      |                                                                                                                                                                                |
| 10  | `animate-drop`                                                                                                                            | use `animate-pop` (§7.2)                                                                                                                                                       |

**3. The shared-name guard (014 FR-05)** is §8.18. `// ui-exception:` does not apply to it.

**4. `designTokens.test.ts`** pins the tokens to the study (§3), the Tailwind mapping, the surface classes and the control-height literals (§6).

**A line may opt out of guard 1** by carrying `// ui-exception: <reason>` on the same line. Inside JSX children, where `//` is not a comment, write `{/* ui-exception: <reason> */}`. The reason says why a token cannot serve.

**The expected exceptions are only these:**

- **Brand-kit colour swatches** in the brand-kit admin (`shared.tsx`), the brief wizard (`TemplateCard.tsx`) and the campaign detail page. They show the kit's own colour, as an inline style from data.
- **The post-preview frame:** the post preview, the lightbox image, library thumbnails, and controls drawn on top of a post (the expand buttons, §8.12, with their fixed `#fbfaf8` / `#181816` values). Tokens never restyle a rendered post.
- **The inline editor's outlines** (`InlineEditModal`'s `EDITOR_STYLE`): CSS injected into the post's own iframe, where the app's variables don't reach, so it carries the light `--fg` as the literal `rgba(24,24,22,…)`.

Anything else that seems to need an exception is a missing token. Raise it rather than writing the raw value.

---

## 12. Words

**The glossary for every word a person reads in the app (031 FR-05).** Routes, API fields, Prisma names, enum values, analytics names and code identifiers do not change; only the words on screen and in user-facing messages do. `tests/unit/uiWordingGuard.test.ts` enforces the retired terms in `src/app/(app)/**` and `src/components/**`; a line opts out only with `// wording-exception: <reason>` (JSX form: `{/* wording-exception: <reason> */}`), and the reason names the code value that is shown verbatim.

| Rule                                                       | Applies to                                                                                                                                                                                | Does not apply to                                                                                                                                                                    |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **post**, not "brief"                                      | page titles, buttons, lists, toasts, empty states and errors for the thing a user creates (`/brief` page title "New post"; "Create post"); the Content step's text field is "Description" | routes (`/brief`), API fields, Prisma models (`Brief`, `Post`), analytics names, code, docs about code. The publish record is "published post" in the UI where it must be told apart |
| **Template** / **Freeform**, not "Path A" / "Path B"       | every UI label, column and badge                                                                                                                                                          | `designMode` values, code, docs about code, E2E test names                                                                                                                           |
| **Brand kit** (sentence case; "brand kits" plural)         | all UI text, the nav item, model-catalogue labels shown in the UI                                                                                                                         | route segments (`/admin/brandkits`), code identifiers                                                                                                                                |
| **Team settings**                                          | the `/team` page title, nav and every pointer to it ("Team settings > AI providers")                                                                                                      | the route `/team`                                                                                                                                                                    |
| **Captions** / **Images** for the `COPY` / `IMAGE` slots   | `/team` toggles, tags, headings and server messages shown to users. Helper text: "Captions: writes captions and headlines."                                                               | the enum values `COPY` and `IMAGE`                                                                                                                                                   |
| **Image generation key**                                   | the personal key card and every pointer to it                                                                                                                                             | the route `/api/me/openai-key`, the table `UserOpenAiKey`                                                                                                                            |
| **Sentence case** for labels, headings, buttons and titles | all UI                                                                                                                                                                                    | proper nouns and product names (Instagram, LinkedIn, OpenAI, Gemini, Claude)                                                                                                         |
| **US spelling** (color, organize)                          | all UI text and user-facing messages                                                                                                                                                      | code identifiers already in use, Prisma fields                                                                                                                                       |

**UI to code mapping** (what a UI word means in the code):

- post ↔ `Brief` (the thing a user creates); published post ↔ `Post`
- Template ↔ `designMode: TEMPLATE`; Freeform ↔ `designMode: GENERATE`
- Captions ↔ the `COPY` provider slot; Images ↔ the `IMAGE` provider slot
- Image generation key ↔ `UserOpenAiKey` (route `/api/me/openai-key`)
- Brand kit ↔ `BrandKit`; Team settings ↔ the `/team` page

The deny-list today: `Path A`, `Path B`, `Brand Kit`(s), `Brandkits`, `Brand-kit`, `copy provider` (any case), `COPY provider`, `colour`(s), `Organise` and `New Brief`. Change 031 task T5 adds `OpenAI key` once the personal key card is renamed.
