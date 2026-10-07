# Spec: App visual redesign

**Change:** 011-app-visual-redesign
**Created:** 2026-10-06
**Status:** 🟡 Draft

## Overview

011 replaces the inherited "Frozen Light" look with a designed visual system, and fixes its main legibility defect: translucent fixed and floating surfaces that let text show through. It also adds one small behaviour, a floating **Create post** button.

The work runs in this order, and each step is shippable on its own:

1. the floating Create post button, in today's style;
2. three direction studies, from which the user picks one;
3. a new `DESIGN_SYSTEM.md` for the chosen direction, with Frozen Light archived;
4. a token foundation;
5. shared primitives and the opaque surface model;
6. the app shell;
7. a screen-by-screen restyle;
8. a cleanup that removes the legacy tokens and glass utilities.

**Binding decisions** come from `proposal.md` (2026-09-23) and its Decisions section (2026-10-06). They are not re-litigated here:

- **A new direction, not a refresh of Frozen Light.** Design it with the `high-end-visual-design` skill as guidance only. None of the skill's files enter the repo.
- **Neutral tool UI.** No BISTEC Global brand cues: each team's brand kit is the only brand on screen, because Hearts Academy is a separate tenant. **This supersedes the proposal's problem 3 ("no product identity").** The app's identity comes from craft, not brand colours.
- **Three direction studies**, applied to the draft review page. **The user picks one alone.**
- **The default theme follows the OS preference**, and a manual toggle is remembered, as today. Light and dark are both mandatory and both designed deliberately.
- **The Create post button sits fixed bottom-right** on every `(app)` page, is hidden on `/brief`, and links to `/brief`. The dashboard quick action stays.
- **Self-hosted assets only.** No runtime font or icon CDN. `next/font/google` is allowed, because it downloads at build time and serves the files locally.

### Assumptions (the proposal's remaining open questions, resolved here; veto at plan review)

- **A1: no visual-regression assertions.** The E2E suite gains no pixel-diff gate, because a restyle would churn every baseline on every task. Instead, a capture script saves a screenshot of each screen in each theme as a review artifact (FR-14). The gates stay functional: roles, names and flows.
- **A2: the Create post button shows icon + label at `md` and wider, and icon only below `md`.** The icon-only form keeps its accessible name and gets a tooltip.
- **A3: the button always starts a fresh brief.** Resuming an unfinished brief stays on the dashboard's Recent Drafts card (change 002).
- **A4: responsive floor, not a mobile redesign.** The shell becomes fully responsive. Every screen must work at 375 px wide with no horizontal page scroll. A phone-first layout for individual screens is out of scope; 010 builds its own handoff screen in the new style.

## Requirements

### Functional Requirements

#### Create post button

**FR-01: A floating Create post button in the app shell.** It is rendered by `AppShell` on every `(app)` page **except `/brief`**, fixed bottom-right, and it links to `/brief`.

- Its accessible name is "Create post" at every width.
- Its form follows A2.
- Its focus state is visible.
- Its surface is opaque (FR-08).
- It sits above page content, and below modals, the mobile sidebar overlay and the lightbox.
- It is keyboard reachable as part of the normal tab order.

**FR-02: Toasts never overlap the button.** Sonner's `Toaster` (`src/components/providers/ToastProvider.tsx:28`, `position="bottom-right"`) gets an offset so toasts stack above the button. On `/brief`, where the button is hidden, the offset may stay; it is not required to collapse.

**FR-03: The dashboard Create Post quick action stays** (`src/app/(app)/page.tsx`), unchanged in behaviour.

#### Direction

**FR-04: Three direction studies.** Each study is a self-contained HTML mockup of the **draft review page** at desktop width, in light and dark. Each uses realistic content: a post preview, the caption editor, the refine panel, version history and the action bar. Each defines:

- a palette, including both themes;
- a type pairing and scale, using fonts that can be self-hosted;
- a surface and elevation model that satisfies FR-08;
- a density and spacing scale;
- a radius scale;
- a motion stance.

The three studies must be meaningfully different, not one palette with three accents. They live in `docs/ui-reference/direction-studies/` and are presented to the user on a single comparison page.

**FR-05: The user picks one direction, and the pick is recorded.** Once the user picks, the chosen study becomes the new `docs/ui-reference/DESIGN_SYSTEM.md`. The current Frozen Light document moves to `docs/ui-reference/archive/frozen-light/`, together with its screenshots and the Synthetix reference HTML. It is **archived, not deleted**. The new document records:

- the tokens, as values per theme;
- the surface model;
- the type scale;
- component rules;
- the accessibility floor (NFR-01 to NFR-03);
- the build decisions carried over from Frozen Light §0 (theme default and persistence, self-hosted assets).

No work after this point starts until the pick is recorded.

#### Foundation

**FR-06: Semantic tokens in one place.** Colour, type scale, spacing, radius, elevation (shadow) and motion (duration and easing) are defined as CSS custom properties in `src/app/globals.css`. Each property has a value per theme, switched by the existing `.dark` class on `<html>`. Each is exposed through `tailwind.config.ts` under **semantic names**, for example `bg-canvas`, `bg-surface`, `bg-surface-raised`, `text-fg`, `text-fg-muted`, `border-line`, `bg-accent`, `ring-focus` and `shadow-raised`.

- Colours use the `rgb(var(--x) / <alpha-value>)` form, so Tailwind opacity modifiers keep working.
- A semantic colour utility needs **no `dark:` twin**: the variable switches. This is the reason for the foundation. Today's pattern of `bg-light-surface dark:bg-dark-surface` pairs (941 `light-*`/`dark-*` colour utilities and 796 `dark:` variants in `src/`) collapses to single classes.
- The status tokens (`status-*`) move onto the same mechanism, with the same five statuses.

**FR-07: Legacy tokens coexist until the cleanup.** The Frozen Light colour names (`light-*`, `dark-*`, `primary*`) and the glass utilities keep working, unchanged, until FR-13. Screens therefore migrate one at a time, and an unmigrated screen still renders correctly.

**FR-08: An opaque surface model.** Every surface that content can scroll beneath, or that floats over other content, has a fully opaque background (alpha 1) and no `backdrop-filter`. Depth comes from elevation and borders. The surfaces covered are:

- the fixed header;
- the sidebar, desktop and mobile overlay;
- dropdown menus and popovers, including the team switcher;
- modals and confirm dialogs;
- toasts;
- the lightbox chrome (its caption and buttons; the dimmed backdrop scrim is exempt);
- sticky bars;
- the Create post button.

The measurable rule: **text behind a fixed or floating surface is never perceptible.** Translucency is allowed only on surfaces with nothing legible behind them, such as the modal scrim.

**FR-09: Shared primitives are rebuilt on the tokens.** The primitives are the components in `src/components/ui/`: Button, Modal, ConfirmDialog, Select, GlassInput (renamed `Input`, with a re-export alias until FR-13), GlassPanel (renamed `Panel`, the same alias rule), SegmentedToggle, StatusChip, ImageLightbox and QueryError, plus the toast styling in `ToastProvider`.

- Each consumes semantic tokens only.
- Public props and exports stay compatible, so screens keep compiling before they are restyled.
- Accessible names, roles and `data-*` hooks used by tests are unchanged.

#### Restyle

**FR-10: The app shell is restyled and responsive.** The shell covers the header, sidebar (desktop and mobile), team switcher, theme toggle, logo placement and the Create post button.

- The sidebar keeps its current sections: Create, Organize, Admin, and the bottom-pinned Settings and Sign out.
- It keeps its role-gating.

**FR-11: Every screen is restyled to the chosen direction**, in this order of use, each a separately shippable unit:

1. dashboard and library;
2. brief wizard;
3. draft review and refine;
4. campaigns, projects and the queue;
5. brand kits admin;
6. `/team`, `/settings`, `/admin/users`, `/admin/teams`;
7. login and choose-team (with the shell).

A restyled screen uses semantic tokens only: no `light-*`/`dark-*` colour utilities, no `glass*` classes and no raw palette colours (`slate-500`, `sky-600`, …). The exceptions are documented ones, such as a brand-kit colour swatch, which shows the kit's own value.

**FR-12: Behaviour does not change.** Apart from FR-01 and FR-02, no route, API call, data shape, flow, accessible name, role or keyboard interaction changes. Layout may change within a screen. Every control that existed is still present and reachable.

**FR-13: Cleanup.** When every screen is migrated, remove:

- the legacy colour tokens from `tailwind.config.ts` and `globals.css`;
- the `.glass`, `.glass-panel`, `.glass-popover` and `.glass-input` utilities;
- the decorative `.glow-blob`, unless the chosen direction keeps it;
- the `GlassInput`/`GlassPanel` aliases.

A guard test fails if any of them reappear in `src/`.

**FR-14: A screenshot capture script.** `scripts/capture-ui.mjs` (Playwright) logs in against a running server and saves PNGs of every screen in FR-11, plus the shell with the mobile sidebar open, in **light and dark**, at 1440 px and 375 px wide. The output goes to a gitignored folder. It is a review tool, not a gate (A1). The final set refreshes `docs/ui-reference/screen-light.png` and `screen-dark.png`.

### Non-Functional Requirements

- **NFR-01: Contrast.** Every text-on-surface token pair in both themes meets **WCAG 2.2 AA**: 4.5:1 for body text, 3:1 for large text (≥ 24 px, or ≥ 18.66 px bold). Every non-text UI boundary, such as an input border or focus ring, meets 3:1 against its adjacent surface. This is checked by a unit test over the declared token pairs, not by eye.
- **NFR-02: Visible focus.** Every interactive element has a visible `:focus-visible` indicator, a ring or outline, that meets 3:1 against its surroundings in both themes. `outline: none` without a replacement is not allowed.
- **NFR-03: Reduced motion.** Under `prefers-reduced-motion: reduce`, transitions and keyframe animations are disabled or reduced to opacity-only fades of 150 ms or less. Centring transforms, such as the modal's `translate(-50%,-50%)`, keep working (see the `modalIn` note in `globals.css`).
- **NFR-04: No flash of the wrong theme.** The existing `themeInitScript` runs before first paint, and the token switch relies on the same `.dark` class.
- **NFR-05: Self-hosted assets.** No runtime request to a font or icon CDN. Fonts load through `next/font` and are served by the app. Icons stay `lucide-react`, unless the chosen direction requires a change (proposal Out of Scope).
- **NFR-06: The E2E suite stays green after every screen task.** That means a full mock E2E with 0 failed and 0 flaky, and no existing case changing outcome. Tests change only where a test reached into styling, never to weaken an assertion.
- **NFR-07: Per-screen revertability.** Each restyle task is its own commit or commits and touches only its screen's files, plus any primitive it consumes. Reverting a screen task leaves the app working, because FR-07 keeps the legacy tokens in place until FR-13.
- **NFR-08: No new runtime dependency** unless the chosen direction requires one; the design must justify any it adds. A font package served by `next/font` does not count.

## Acceptance Criteria

- **AC-01 (FR-01):** E2E: on `/`, `/library`, `/campaigns` and `/drafts/[id]`, a link with accessible name "Create post" is visible bottom-right and navigates to `/brief`. On `/brief` it is absent.
- **AC-02 (FR-01, A2):** E2E: at 1440 px the button shows the text "Create post". At 375 px it shows the icon only and still has the accessible name "Create post". At both widths it is reachable with Tab and shows a visible focus indicator (non-`none` outline or box-shadow on `:focus-visible`).
- **AC-03 (FR-02):** E2E: with the button visible, fire three toasts. No toast's bounding box intersects the button's bounding box.
- **AC-04 (FR-03):** The dashboard Create Post quick action still links to `/brief` (existing coverage stays green).
- **AC-05 (FR-04):** `docs/ui-reference/direction-studies/` holds three self-contained HTML studies of the draft review page, each with light and dark. A comparison page shows all three. Each study states its palette, type pairing, surface model, density, radius and motion. No study makes a runtime CDN request, except a font loaded only to preview the study, which the study names as to be self-hosted.
- **AC-06 (FR-05):** The user's pick is recorded, with its date, in `proposal.md` → Decisions and at the top of the new `DESIGN_SYSTEM.md`. The new document has all the FR-05 sections. Frozen Light lives under `docs/ui-reference/archive/frozen-light/`, and nothing is deleted.
- **AC-07 (FR-06):** Unit: a token test parses `globals.css` and asserts that every semantic token exists in both `:root` and `.dark`, and that `tailwind.config.ts` maps every semantic colour to `rgb(var(--…) / <alpha-value>)`.
- **AC-08 (FR-07, NFR-07):** After the token task, before any screen task, the full mock E2E passes and an unmigrated screen renders unchanged (spot-checked with the FR-14 capture script).
- **AC-09 (FR-08):** E2E: for each surface in FR-08 that is reachable (header, sidebar, mobile overlay sidebar, team-switcher menu, a modal, a confirm dialog, a toast, lightbox chrome, the Create post button), the computed `background-color` has alpha 1, and the computed `backdrop-filter` is `none`, in both themes.
- **AC-10 (FR-09):** `src/components/ui/*` and `ToastProvider` contain no `light-*`/`dark-*` colour utilities, no `glass*` class and no raw palette colour. Every existing import of the primitives still compiles (`tsc` clean).
- **AC-11 (FR-10, A4):** E2E: at 375 px, the mobile sidebar opens, traps focus and closes. Every sidebar link is reachable. The page has no horizontal scroll (`scrollWidth <= clientWidth` on `document.documentElement`).
- **AC-12 (FR-11, A4):** For each screen group in FR-11, a grep over that group's files finds no `light-*`/`dark-*` colour utility, no `glass*` class and no raw palette colour outside the documented exceptions. E2E: each screen loads at 375 px with no horizontal page scroll.
- **AC-13 (FR-12, NFR-06):** After every screen task, the full mock E2E is 0 failed and 0 flaky, with no existing case changing outcome. Any test edit is listed in that task's report with its reason.
- **AC-14 (FR-13):** Unit: a guard test greps `src/` and finds zero `light-*`/`dark-*` colour utilities, zero `glass`/`glass-panel`/`glass-popover`/`glass-input` classes, zero `GlassInput`/`GlassPanel` references and no definition of those utilities in `globals.css`.
- **AC-15 (FR-14):** `node scripts/capture-ui.mjs` against a running test server writes light and dark PNGs at 1440 px and 375 px for every FR-11 screen. `docs/ui-reference/screen-light.png` and `screen-dark.png` are replaced from the final run.
- **AC-16 (NFR-01):** Unit: a contrast test computes the WCAG ratio for every declared text/surface and boundary/surface token pair in both themes, and asserts the NFR-01 thresholds.
- **AC-17 (NFR-02):** E2E: on one screen per FR-11 group, tabbing to the first three interactive elements shows a visible focus indicator on each.
- **AC-18 (NFR-03):** E2E with `reducedMotion: 'reduce'`: opening a modal leaves it centred in the viewport (its bounding-box centre is within 2 px of the viewport centre). The computed `animation-duration` of the modal is 150 ms or less, or `0s`.
- **AC-19 (NFR-04, NFR-05):** With a fresh profile set to OS dark, the first paint has `html.dark` (no light flash). A full E2E run records no request to `fonts.googleapis.com`, `fonts.gstatic.com` or any icon CDN.
- **AC-20 (gates):** At the end, `npm run test:unit`, `npm run lint` (0 errors) and `npm run build` pass, and the render harness (`npm run test:render`) is unchanged at 15/15, since 011 does not touch generated posts.

## Edge Cases

- **A test that keyed on a class.** The survey found no E2E selector on `glass*` or the colour utilities: the `class=` hits in `agui-refinement` and `draft-inline-edit` are inside generated-post HTML fixtures. If a restyle breaks a selector anyway, fix the selector to a role or name, and record it (AC-13).
- **Brand-kit colours on screen.** The brand-kit admin and the brief wizard show the **kit's own colours** as swatches. Those stay inline styles from data, and are the documented exception to FR-11's no-raw-colour rule.
- **Generated-post previews.** The post preview, the lightbox image and the library thumbnails show the post as rendered. Tokens never restyle them.
- **Status colours** must still meet NFR-01 on the new surfaces, in both themes. StatusChip moves onto the tokens (FR-06).
- **Dark-mode logo.** `Logo.tsx` applies `dark:invert` to a black PNG. That class is about the asset, not the palette, and stays unless the direction changes the logo treatment.
- **Sonner theme.** `ToastProvider` passes `theme` to Sonner. Token-styled toasts must not fight Sonner's own theme colours (set `unstyled` or override fully).
- **Third-party portals** (Radix Dialog and DropdownMenu) render outside the shell. Their surfaces must take tokens from `:root`/`.dark` on `<html>`, not from an ancestor class.
- **A user with a stored manual theme** keeps it. NFR-04's init script is unchanged.
- **The pick never comes.** Tasks after the studies are blocked. The Create post button (wave 1) can still ship alone.

## Dependencies

- **No hard code dependency.** 004 and 005 are complete on `v2`, and 011 lands on `v2` under the release rule (merge to `main` only on the user's go-ahead).
- **Soft, by roadmap:** 012's caption panels and 008's pickers are built **in this style** after FR-06 and FR-09 land, so they are built once.
- **Shared files** (roadmap "Parallel-work caution"): the brief wizard's Review step (008), `PublishDialog.tsx` (010), the refine panel (004, 008) and the draft page caption area (012). None of these changes is in flight, so there is no conflict now.

## Notes

- **The operator step is the pick (FR-05).** It is the only point where the build waits on the user.
- **Never run two implementers in one checkout.** lint-staged stashes, so the screen tasks run one at a time, even where the waves would allow parallel work.
- **Before each full E2E run:** stop stray node processes, `rm -rf .next`, and drop and recreate the test DB.
