# Spec: Re-theme the app from Folio to Graphite

**Change:** 021-graphite-retheme
**Created:** 2026-10-18
**Status:** 🟡 Draft

## Overview

The fork's change 011 built study B, **Folio**, on `v2`: paper and ink, a burnt-sienna accent, Fraunces headings, flat rules and a print-proof plate with crop marks. On 2026-10-18 the user picked study A, **Graphite** (`docs/ui-reference/direction-studies/study-a-graphite.html`), so that this system looks different from the fork. The driver is a visual identity distinct from the fork.

021 is a **reskin on the fork's structure**, which is the outcome the user chose. It keeps:

- the semantic token layer;
- the shared primitives in `src/components/ui/`;
- the 014 accessibility work (labels, ARIA, focus order, control heights, named tablists, scroll regions);
- the opaque-surface rule (011 FR-08);
- the OS-follow theme rule.

What changes is every value and shape: the warm-grey palette with an ink accent, Plus Jakarta Sans and JetBrains Mono, pill buttons and fields, rounded opaque cards with soft shadows, double-bezel section cards, floating header and sidebar islands, and the post stage in place of the proof plate. The Bistec Studio logo image comes back.

**Binding rulings** (proposal.md, "Panel rulings", 2026-10-18) are not re-litigated here:

- **R1. Full swap.**
- **R2. Two waves with a named cut.** Wave 1 is the foundation, wave 2 the screens. A mixed state may sit on `v2` between waves.
- **R3. E2E cost.** One full clean mock E2E per wave, plus one at the end. Each task runs tsc, lint, unit and the targeted E2E specs for the screens it touches.
- **R4. Token names kept.** Only values change. Keys are added where Graphite has more and removed where it has fewer.
- **R5. Fonts.** `font-sans` is Plus Jakarta Sans and `font-mono` is JetBrains Mono. `font-display` and `font-text` are removed.
- **R6. Small caps follow the study.**
- **R7. A deny-list sweep guard.**
- **R8. The helpers fold into one neutral `ui` module.**
- **R9. No archive copy of Folio.**
- **R10. Contrast wins over study values.**
- **R11. The logo is the old PNG, with its dark-mode treatment.**
- **R12. Order:** 018 → 022 → **021** → 019 → 020.

### Plan-time facts (the method is given for each)

| Fact                                                                                         | Value                                                                                                                                                                                                                                                                          | Method                                                    |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Files under `src/` that mention Folio                                                        | 67                                                                                                                                                                                                                                                                             | `grep -rli folio src \| wc -l`                            |
| Folio custom-property declarations in `globals.css`                                          | 64 (45 `:root` + 19 `.dark`). The proposal said 66.                                                                                                                                                                                                                            | `grep -c '^  --' src/app/globals.css`                     |
| `font-display` use sites                                                                     | 38 occurrences in 25 files                                                                                                                                                                                                                                                     | `grep -ro 'font-display' src`                             |
| `font-text` use sites                                                                        | 43 occurrences in 32 files                                                                                                                                                                                                                                                     | `grep -ro 'font-text' src`                                |
| `font-display` / `font-text` as whole class tokens (excluding the `--font-*` var references) | 79                                                                                                                                                                                                                                                                             | guard START/END regex, design.md §6                       |
| What `font-text` maps to today                                                               | `var(--font-sans)`, which is Instrument Sans. It is a pure alias of `font-sans` (`tailwind.config.ts` `fontFamily.text`).                                                                                                                                                      | read                                                      |
| Helper modules named `folio`                                                                 | 4, not 3: `ui/folio.ts` (43 importers), `campaigns/folio.ts` (4), `admin/brandkits/folio.ts` (2), `team/folio.tsx` (12)                                                                                                                                                        | `find src -iname '*folio*'` plus an import grep           |
| Proof-plate / crop-mark sites                                                                | 8 lines, all in `src/app/(app)/drafts/[id]/page.tsx`                                                                                                                                                                                                                           | `grep -rniP 'proof[- ]plate\|crop[- ]mark\|\bCROP\b' src` |
| Hard offset shadow literals                                                                  | 5 (4 tokens in `globals.css`, 1 in `CreatePostButton.tsx`)                                                                                                                                                                                                                     | design.md §6, pattern 8                                   |
| Fraunces / Instrument Sans references                                                        | 9 lines                                                                                                                                                                                                                                                                        | `grep -rniP 'Fraunces\|Instrument[ _]Sans' src`           |
| `opsz` / `font-variation-settings`                                                           | 12 lines                                                                                                                                                                                                                                                                       | `grep -rnP 'opsz\|font-variation-settings' src`           |
| Labels uppercased in **source strings**                                                      | None. Every small-caps label is uppercased by the CSS `uppercase` class. The only all-caps source strings are the `/team` slot options `COPY` and `IMAGE`, which are enum names, and the acronym `HTML/CSS`; neither is a small-caps rendering. **So "no copy change" holds.** | grep, design.md §11                                       |
| E2E selectors on CSS-uppercased text                                                         | None. Playwright's text and role matching reads the DOM text, not the rendered transform. The 3 `innerText()` reads (`a11y.test.ts:748`, `:933`, `settings-claude-token.test.ts:212`) read text that is not uppercased.                                                        | grep, design.md §11                                       |

### Assumptions (veto at plan review)

- **A1. Control heights are 32 / 38 / 44 px** (`--control-sm|md|lg`). The study gives "Controls 38 px (32 small)"; it has no large size, so 44 px is a planner choice. The `--control-*` keys are 014's, not the study's, and are kept (R4).
- **A2. One status tint alpha, 0.12,** for chips, notices and status discs. That is the study's chip tint. The study's 0.14 amber disc behind a warning icon is normalised to 0.12, because the published text at 0.14 would fail (design.md §9). Tailwind gains `opacity.12` for `/12`.
- **A3. The rendered post is never rounded or clipped.** The study rounds its placeholder post 14 px. 021 keeps the post square inside a square immediate wrapper, as 011 required ("shown as rendered", the existing E2E). The rounding lives on the stage around it.
- **A4. The double bezel** (a `line-subtle` tray of 6 px with a concentric inner radius) is used for page-level section cards and the preview stage only. It is drawn as a 6 px border with `radius-xl`, so the outer radius is 26 and the inner 20 px. The study's 30 / 22 px stage radii are normalised to the same 26 / 20. The core's shadow on its tray is not drawn.
- **A5. The study's regrouped controls are not built.** That is the More menu, the Refine button, the previous/next version arrows and Delete draft on the draft page. The 2026-10-07 user decision ("no More menu", DESIGN_SYSTEM §8.17) and FR-12 stand. This answers the 011 T2 carry-over note on regrouped controls.
- **A6. The logo** is `src/components/Logo.tsx` as it was before 011 T6 (`git show 7fdbe38^:src/components/Logo.tsx`):
  - a `div role="img" aria-label="Bistec Studio"`;
  - the PNG as a cropped `background-image`, at a 3:1 aspect;
  - `dark:invert`.

  `public/BistecStudioLogo.png` is restored byte-identical from `7fdbe38^`. The shell uses `height={32}` to fit the 56 px header island; it was 40 before T6, in a taller bar. Login uses `height={48}`, as before. The logo's accessible name goes back from "Studio" to "Bistec Studio". This is the one accessible-name change, and the user made it (R11).

- **A7. Page eyebrows stay** ("Overview", "Posts", "Create", …) as Graphite micro-labels. Removing them would be a copy change.
- **A8. The theme toggle becomes the study's icon segments** (sun / moon). Their accessible names stay "Light" and "Dark", now through `aria-label`, inside the same `group "Theme"`, with `aria-pressed`.
- **A9. The nav gets its icons back** (lucide, `aria-hidden`), as the study draws them. Link names are unchanged.
- **A10. The new `DESIGN_SYSTEM.md` keeps the current section numbering** (§1–§11, §8.1–§8.19), with Graphite content, so the `§x.y` references in code comments stay valid. §8.12 becomes "The post stage", §8.13 "Versions" and §8.14 "Caption and refine cards".
- **A11. The Folio section numerals ("i.", "ii.") go.** `SectionHead` stops rendering `numeral` in wave 1. The wave 2 tasks delete the `numeral=` arguments in their files, and T8 deletes the prop and `SECTION_NUMERAL`.
- **A12. Single-line fields are pills** (Input, Select, the refine prompt), and textareas are `radius-md`. The study says "Buttons and inputs are pills" and draws its textarea at 12 px.
- **A13. Primary versus ink.** In Graphite `--accent` equals `--fg` in both themes, so fill no longer tells the Primary button from Ink. Primary is the ink pill **with the raised shadow**; Ink is the same fill, **flat**. 014's "one accent primary per view" becomes "one primary per view", and its E2E keys on the resting shadow (design.md §11).

## Requirements

### Functional Requirements

#### Foundation (wave 1)

**FR-01: The Graphite token values.** Every custom property in the `:root` and `.dark` blocks of `src/app/globals.css` takes the study's value: colour, shadow, scrim, radius, motion, type and space. The names are kept (R4).

- `--radius-xl`, `--space-5` and `--space-10` are added.
- `--space-12` is removed.
- `--control-*` is kept, with A1's values.
- A value may differ from the study only for contrast (R10). Every such deviation is recorded in one deviation map in `tests/unit/designTokens.test.ts` and in `DESIGN_SYSTEM.md` §3. The map is empty at plan time (design.md §9).

**FR-02: The Tailwind mapping.** `tailwind.config.ts` keeps every semantic colour key.

- It adds:
  - `borderRadius['ui-xl']` → `var(--radius-xl)`;
  - `opacity['12']` → `0.12` (A2);
  - `letterSpacing.label` → `0.14em`, the one small-caps tracking (FR-07).
- `fontFamily` holds exactly `sans` (`var(--font-sans)` + fallbacks) and `mono` (`var(--font-mono)` + fallbacks). `display` and `text` are removed.

**FR-03: The fonts.** `src/app/layout.tsx` loads `Plus_Jakarta_Sans` as `--font-sans` and `JetBrains_Mono` as `--font-mono` through `next/font/google`, and nothing else. Fraunces and Instrument Sans are gone. Every `font-display` and `font-text` use site is moved: the class is deleted, because `font-sans` is inherited from `body` and Tailwind preflight makes form controls inherit it. Every `opsz` font-variation setting goes with it.

**FR-04: Primitives on Graphite.** Each component in `src/components/ui/`, plus `ToastProvider`, takes the shape in design.md §4:

- Button (pills);
- Panel (card, and a `bezel` variant);
- Input and Select (pills; textareas at `radius-md`);
- FieldLabel (a sentence-case label);
- SectionHead (16 px, 600, no numeral);
- PageHead (28 px, 700, tracking-tight);
- StatusChip (a pill with a dot, sentence case);
- Notice;
- SegmentedToggle (a track with a raised thumb);
- Modal, Drawer, ConfirmDialog and ImageLightbox (the overlay surface);
- QueryError and ModelPicker.

Every export, prop, accessible name, role and `data-*` hook is kept, except `SectionHead`'s `numeral` (A11).

**FR-05: The surface classes.** `.surface` (card), `.surface-bezel` (double bezel, new), `.surface-raised` (menus and popovers) and `.surface-overlay` (modals, toasts and the lightbox chrome) take design.md §4.1's values. All stay opaque, with no `backdrop-filter`. Folio's `drop` entrance is replaced by Graphite's `pop` (menus) and `rise` (toasts).

**FR-06: The helpers fold into one neutral module** (R8), per design.md §7.

- `src/components/ui/folio.ts` becomes `src/components/ui/atoms.ts`.
- `team/folio.tsx` folds into `ui/atoms.ts` (`BLOCK`, `ROW`) and a new `ui/GateNotice.tsx`.
- `campaigns/folio.ts` becomes `campaigns/classes.ts`, keeping only campaigns/projects atoms.
- `admin/brandkits/folio.ts` becomes `admin/brandkits/classes.ts`, keeping only brand-kit atoms.

No file under `src/` is named `*folio*`, and no import path contains `folio`.

**FR-07: Small caps follow the study** (R6). Graphite uses an uppercase, tracked micro-label in exactly three places: the sidebar section labels, the preview stage's "Preview" label and its spec-sheet headings. So:

- the treatment survives in **one atom** (`SMALL_CAPS`, with `EYEBROW` as its muted form) in `ui/atoms.ts`, at `text-ui-2xs font-semibold uppercase tracking-label`;
- it is used for nav section labels, page eyebrows, panel captions ("Before", "AI suggestion", the stage label), aside block heads and stepper labels;
- field labels, status chips, status words, "Current" / "active" / "Default" badges and table header rows are **sentence case**, as the study draws its chip, thread status lines, `.cur` pill and table headers;
- the literal tracking (`tracking-[0.14em]`, any positive arbitrary `tracking-[…em]`) is banned everywhere, including `ui/`;
- the `uppercase` class is allowed only in `ui/atoms.ts`.

**FR-08: The logo** (R11, A6). `public/BistecStudioLogo.png` and the pre-T6 `Logo.tsx` are restored, with `dark:invert`, on login and in the shell header.

**FR-09: The app shell, login and choose-team** (design.md §5).

- **Header:** a floating opaque island, 56 px tall, inset 12 px, `surface-2`, `radius-lg`, `shadow-panel`, on an 80 px `canvas` band so scrolled content never shows in the gutter.
- **Sidebar:** an island 244 px wide on a 268 px `canvas` band, `surface-1`, with nav icons. The current page is `surface-2` with `shadow-panel` and a `line-subtle` hairline.
- **Team switcher, theme toggle and Create post button** follow the study (A8). The button is a 52 px ink pill with a nub, and the nub rotates 90° on hover.
- **Login and choose-team** sit on bezel cards.
- **Kept:** the sections, role-gating, the Radix mobile overlay and every `aria-label`.

#### Screens (wave 2)

**FR-10: Every screen is restyled to Graphite** in four groups. Each group is one task and one commit set:

1. dashboard, library and the brief wizard;
2. draft review and refine;
3. campaigns, projects, the queue and the brand kits admin;
4. `/team`, `/settings`, `/admin/users` and `/admin/teams`.

On each screen:

- page-level sections become `surface-bezel` cards with a 16 px / 600 head;
- lists stay ruled rows on `line-subtle`;
- Folio's 2 px ink block rules (`border-t-2` / `border-b-2`) are removed;
- section numerals are removed (A11);
- `SMALL_CAPS` uses follow FR-07;
- comments that name Folio are reworded.

**FR-11: The draft page takes the study's layout and stage** (design.md §8).

- **Page head:** across the top. It holds the back link, the h1, a meta row (StatusChip, channels, kit, size) and the action bar on the right.
- **Below it, from `xl` (1280 px) up:** a 0.92fr | 1.08fr grid, with the preview stage left and the caption, headline and refine cards right. Below `xl` it is one column, stage first.
- **The stage** is a bezel card. It shows a "Preview" micro-label, the mono dimension and version line, the post at its own ratio (A3), the version thumbnails with a "Current" pill, the switching note and Undo.
- **The proof plate and its crop marks are removed.**
- **Every control and name stays** (A5).
- **`InlineEditModal`'s injected `EDITOR_STYLE`** moves from Folio's sienna literal to the Graphite ink.

**FR-12: Behaviour does not change.** No route, API call, data shape, flow, role, heading level or `data-*` hook changes. No accessible name changes, except the logo (A6).

- The tab order within the draft page follows the new DOM order: the page head comes before the stage (FR-11).
- A test edit is allowed only where the test reached into styling or that order. Each one is listed in its task report with the reason. The expected set is in design.md §11.

#### Guards, docs and captures

**FR-13: A deny-list sweep guard** (R7). `tests/unit/uiTokenGuard.test.ts` scans every `.ts`, `.tsx` and `.css` file under `src/` for design.md §6's patterns:

- Fraunces and Instrument Sans;
- `font-display` and `font-text` as class tokens;
- `opsz` and `font-variation-settings`;
- `folio` as a word, in a file name or in an import path;
- a positive arbitrary letter-spacing;
- `uppercase` outside `ui/atoms.ts`;
- proof-plate and crop-mark names;
- a hard offset shadow;
- Folio's 2 px block rule;
- `animate-drop`.

It also keeps every existing 011 and 014 guard. Each pattern is switched on in the task that removes its last hit (design.md §6 staging), and all of them are on after T8. Each pattern has a self-test that it fires.

**FR-14: The tests follow the values.**

- `designTokens.test.ts` asserts:
  - the new key set;
  - every token equal to the study's block, parsed from the study file itself, minus the deviation map;
  - the Tailwind mapping;
  - the control heights.
- `contrast.test.ts` keeps its 21 pairs per theme at 011's thresholds, with the chip tint at 0.12.
- `uiPrimitives.test.ts` and `noTeamNotice.test.ts` assert the Graphite class strings.

**FR-15: A new `docs/ui-reference/DESIGN_SYSTEM.md` for Graphite** (A10). It holds:

- a decision record: the pick (2026-10-18), the rulings, A1–A13 and the logo;
- the token block per theme and the contrast table;
- the deviation list, which is empty unless one is forced;
- the surface model;
- type, spacing, radius and motion, including reduced motion;
- the component rules;
- the accessibility floor;
- the carried-over §0 build decisions;
- the `ui-exception` convention.

There is **no** archive copy of Folio (R9). CLAUDE.md's "UI / Design system" pointer names Graphite and the new source study.

**FR-16: Captures.** `scripts/capture-ui.mjs`, unchanged, runs at the end of each wave and at the end. Each run gives 62 PNGs: 15 screens × light/dark × 1440/375, plus the mobile sidebar open in both themes. The final run refreshes `docs/ui-reference/screen-light.png` and `screen-dark.png` from the draft page at 1440.

### Non-Functional Requirements

- **NFR-01: Contrast** (011 NFR-01, unchanged thresholds). Every declared text/surface pair meets 4.5:1, and every boundary/surface and focus/surface pair 3:1, in both themes. This is checked by `contrast.test.ts`. Contrast wins over a study value (R10).
- **NFR-02: Visible focus.** Every interactive element shows a 2 px `--focus` outline (or an inset ring where an outline would be clipped) that is at least 3:1 in both themes. `outline: none` without a replacement is not allowed.
- **NFR-03: Reduced motion.** The 011 block stays: durations are shortened, not removed; spin and pulse are exempt; menus and toasts swap to a 150 ms opacity fade.
  - Graphite's press scale (0.98) and the button nub's rotation are disabled under `motion-reduce`.
  - The modal stays centred.
  - This answers the 011 T2 carry-over note on reduced-motion timing, so E2E reads after a state change still settle with `expect.poll`.
- **NFR-04: No flash of the wrong theme.** `themeInitScript` and the `.dark` class are unchanged.
- **NFR-05: Self-hosted assets.** The fonts come only through `next/font`, and there is no CDN request (011 AC-19 stays). Icons stay `lucide-react`.
- **NFR-06: E2E.** At the end of wave 1 (T3), wave 2 (T7) and the change (T8), a full clean mock E2E has 0 failed and 0 flaky, and no existing case changes outcome except the listed test edits.
  - "Clean" means: stop stray node processes, `rm -rf .next`, drop and recreate the test DB, then `test:e2e:serve` and `test:e2e:mock`.
  - The count is at or above the pre-021 baseline that T1 records.
- **NFR-07: Per-task gates.** `npx tsc --noEmit -p .`, `npm run lint` (0 errors), `npm run test:unit`, and the targeted E2E specs that tasks.md names.
- **NFR-08: No new runtime dependency.** A `next/font` family does not count.
- **NFR-09: Revertability at the cut.** Wave 1 is one shippable unit: reverting wave 2 leaves Graphite primitives on Folio-structured screens that work. Each wave 2 task touches only its group's files.
- **NFR-10: Generated posts are untouched.** `npm run test:render` stays at 15/15. Brand kits, prompts and the renderer are out of scope.

## Acceptance Criteria

- **AC-01 (FR-01, R10):** Unit: `designTokens.test.ts` parses the `:root` and `.dark` blocks of `study-a-graphite.html` and of `globals.css`. Every study token except `--font-*` exists in `globals.css` with an equal value, unless it is a key in `DEVIATIONS`. Every `DEVIATIONS` entry names its contrast pair and is also listed in `DESIGN_SYSTEM.md` §3.
- **AC-02 (FR-01, FR-02):** Unit:
  - `--radius-xl`, `--space-5` and `--space-10` are on `:root`; `--space-12` is absent;
  - `--control-sm|md|lg` are `32px | 38px | 44px`;
  - Tailwind maps `borderRadius['ui-xl']`, `opacity['12']` and `letterSpacing.label`;
  - `Object.keys(fontFamily)` equals `['sans', 'mono']`;
  - every semantic colour is still `rgb(var(--x) / <alpha-value>)`.
- **AC-03 (NFR-01):** Unit: `contrast.test.ts` passes all 21 pairs × 2 themes with `CHIP_ALPHA = 0.12`.
- **AC-04 (FR-03, NFR-05):**
  - Source: `layout.tsx` imports only `Plus_Jakarta_Sans` and `JetBrains_Mono` from `next/font/google`.
  - E2E: `getComputedStyle(document.body).fontFamily` matches `/Plus.Jakarta.Sans/`.
  - The existing AC-19 no-CDN check stays green.
- **AC-05 (FR-13, FR-06, FR-03):**
  - Unit: the guard finds 0 hits across `src/` with every pattern on, and each pattern's self-test fires on a sample.
  - Shell: `grep -rniE "fraunces|instrument[ _]sans|\bfolio\b" src` prints nothing.
  - Shell: `find src -iname '*folio*'` prints nothing.
- **AC-06 (FR-06):** Exactly these helper modules exist: `src/components/ui/atoms.ts`, `src/components/ui/GateNotice.tsx`, `src/components/campaigns/classes.ts` and `src/components/admin/brandkits/classes.ts`. The two feature-local files hold only design.md §7's named atoms. `tsc` is clean.
- **AC-07 (FR-04, FR-05):** Unit (`uiPrimitives.test.ts`):
  - Button `primary` renders `rounded-ui-pill bg-accent text-accent-fg shadow-raised`, and `ink` renders `shadow-none`;
  - `Input` is `rounded-ui-pill` and `fieldClasses` (textarea) is `rounded-ui-md`;
  - `StatusChip` contains `rounded-ui-pill` and `bg-status-*/12` and no `uppercase`;
  - `FieldLabel` is `text-ui-sm font-semibold` with no `uppercase`;
  - `SectionHead` renders no numeral even when one is passed (until T8 removes the prop).
- **AC-08 (FR-05, 011 FR-08):** E2E: the existing `surfaces.test.ts` AC-09 opaque checks pass in both themes. That covers the header, the desktop and mobile sidebar, the team menu, a toast, the publish modal, a confirm dialog, the lightbox chrome and the Create post button.
- **AC-09 (FR-07):**
  - E2E (the `a11y.test.ts` AC-05 case, updated): the brief "Topic" label and the campaign Input and Select labels compute the same style, with `textTransform` `none` and `fontSize` `13px`.
  - E2E: a sidebar section label ("Create") computes `textTransform` `uppercase` and a `letterSpacing` of `1.54px` (0.14em at 11 px).
  - Unit: the guard's tracking and `uppercase` patterns are on.
- **AC-10 (FR-08):**
  - E2E: on `/login` and in the banner, `getByRole('img', { name: 'Bistec Studio' })` is visible, and its computed `background-image` contains `BistecStudioLogo.png`. Its computed `filter` is `none` in light and `invert(1)` in dark.
  - Shell: `git hash-object public/BistecStudioLogo.png` equals `git rev-parse 7fdbe38^:public/BistecStudioLogo.png`.
- **AC-11 (FR-09):**
  - E2E at 1440, light: the header's bounding box starts at x = 12 and y = 12, with a computed `border-radius` of `18px` and a non-`none` `box-shadow`. The desktop sidebar is 244 px wide, at x = 12.
  - E2E: hovering the Create post button turns its nub; the nub's computed transform is a 90° rotation. Under reduced motion, the button's and the nub's transforms are `none`.
  - The existing AC-11 (375 px mobile sidebar), AC-17 (shell focus stops `Light`, `Dark`, `Switch team`) and Create post button cases stay green.
- **AC-12 (FR-11):**
  - E2E: the draft page has no element whose class or `data-*` names a crop mark.
  - E2E: at 1440 the preview stage's left edge is left of the caption card's, and their tops are within 24 px of each other. At 375 the stage is above the caption card.
  - The existing "shown as rendered" case (no filter, transform or rounding on the post or its immediate wrapper; `object-fit: contain`) and the 375 px no-horizontal-scroll case stay green.
- **AC-13 (FR-10):** After each wave 2 task, the guard patterns staged to that task are on and green. A grep of that group's files for `border-[tb]-2`, `numeral=` and `\bfolio\b` prints nothing.
- **AC-14 (FR-12, NFR-06):** At the end of T3, T7 and T8, a full clean mock E2E is 0 failed / 0 flaky, with a count at or above the T1 baseline. Every test edit across the change is in its task report, and each is in design.md §11's expected list, or is explained there as new.
- **AC-15 (FR-14):** `npm run test:unit` passes, including the updated `designTokens`, `contrast`, `uiTokenGuard`, `uiPrimitives` and `noTeamNotice` tests.
- **AC-16 (FR-15):**
  - `docs/ui-reference/DESIGN_SYSTEM.md` names Graphite, the 2026-10-18 pick and its source study, and has the FR-15 sections under the current numbering.
  - `docs/ui-reference/archive/folio/` does not exist.
  - CLAUDE.md's "UI / Design system" section points at Graphite.
- **AC-17 (FR-16):**
  - Each of the three capture runs writes 62 PNGs, and the orchestrator views a light and a dark shot of every screen.
  - `docs/ui-reference/screen-{light,dark}.png` come from the final run.
- **AC-18 (NFR-03):** E2E: the existing reduced-motion cases stay green: the modal is centred within 2 px with an animation of 150 ms or less, and the menu and toast fade at 150 ms. Under `reducedMotion: 'reduce'`, a pressed primary Button computes no scale transform.
- **AC-19 (NFR-10, gates):** At the end, `npm run build` passes, lint has 0 errors, and `npm run test:render` is 15/15.

## Edge Cases

- **Accent equals ink.** Graphite's `--accent` is `--fg`, so anything that "used the accent to stand out" now reads as ink. That covers links, the "Current" label and the `info` notice tint.
  - Links keep their underline, so they never rely on colour alone.
  - The `a11y.test.ts` AC-07 "one accent fill" helper keys on the primary's resting `box-shadow` (A13).
  - The provider "On" word keeps the `text-accent` class the test reads.
- **The post preview, thumbnails and the lightbox image** are never token-styled, rounded or clipped (A3).
  - The draft page's expand button on the post keeps its `ui-exception`.
  - `InlineEditModal`'s `EDITOR_STYLE` is CSS injected into the post's iframe, which the app's variables cannot reach. It keeps a literal colour, moved to Graphite ink (`rgba(24,24,22,…)`), with a `ui-exception` comment.
- **Brand-kit swatches** keep their data colour on the existing `ui-exception` lines (`TemplateCard.tsx`, `brandkits/shared.tsx`, the campaign kit swatch).
- **The PNG logo is about 2 MB** and is cropped with `background-size` and `background-position`. It is restored as is (A6). Optimising it is a follow-up, not 021.
- **`public/.gitkeep`** (011 T6) stays. It is harmless next to the PNG.
- **The font metrics change** (a 14 px body in place of 15 px; Plus Jakarta's wider set). Truncation and wrapping move. The 375 px no-horizontal-scroll cases, and the per-wave capture review, catch overflow.
- **Mixed state between waves.** After wave 1, the screens show Graphite primitives inside Folio-structured layouts (ruled 2 px blocks, numerals in direct spans). That is allowed on `v2` (R2), which does not deploy.
- **Sonner and Radix portals** inherit the tokens from `:root` / `.dark` on `<html>`, as today.
- **A stored manual theme** is kept. The init script is unchanged.
- **The "scheduled" status stays amber** (011 T2 carry-over note), at Graphite's `138 76 0` / `245 181 71`. Amber warnings (`BackgroundNotice`, invalid-token notices, `ImageDefaultState`) stay on `status-scheduled`.
- **`--line-subtle`** (011 T2 carry-over note) stays decorative only: dividers and the bezel tray, at 1.16–1.39:1 and exempt under WCAG 1.4.11. Every control edge is `--line` (at least 3:1).
- **Sinhala or other non-Latin text that a user types** in UI fields falls back to the system font, as it did with Instrument Sans (Latin subset only).
- **The 014 control-height guard** forbids the literals `h-9`, `h-10`, `h-[30px]` and `w-[30px]`. Graphite sizes use the `control-*` keys. The 52 px Create post button and the 22–24 px discs are not controls.

## Dependencies

- **Order (R12):** 018 (T1 is in progress) and then 022 finish first. 021 starts from their head on `v2`, and 019 and 020 follow, written once in Graphite.
- **Inputs:** the study (`study-a-graphite.html`) and the 011 precedent (spec, design, tasks, reports T2–T13, `scripts/capture-ui.mjs`), plus 014's primitives and guards.
- **No code dependency on other changes.** 021 lands on `v2` under the release rule: `main` only on the user's go-ahead.

## Notes

- **Process:** one task at a time. Each task goes to an implementer subagent, then `specclaw:code-reviewer`, then the orchestrator commits. Two implementers never share one checkout (lint-staged stashes). No real model calls: E2E runs on the mock seams only.
- **The cut is after T3.** Wave 1 alone is a coherent Graphite foundation.
- **Total full E2E runs: 3** (T3, T7, T8). **Total capture runs: 3** (62 PNGs each).
- **Screen list (captures, FR-16):** login, choose-team, dashboard, library, brief, draft review, campaigns, campaign detail, projects, project detail, brand kits, team, settings, admin users, admin teams, plus the mobile sidebar open.
- Until T8 writes the new `DESIGN_SYSTEM.md`, **this change's design.md and the Graphite study supersede the Folio `DESIGN_SYSTEM.md`** for any 021 task.
