# Design: App visual redesign

**Change:** 011-app-visual-redesign
**Created:** 2026-10-06

## Technical Approach

### 1. Create post button (FR-01 to FR-03), in today's style

- **A new `src/components/layout/CreatePostButton.tsx`.** It is a Next `<Link href="/brief">` with `aria-label="Create post"`. It shows a lucide `Plus` icon, plus a `<span className="hidden md:inline">Create post</span>`. Below `md` it gets a `title` tooltip.
- **`AppShell` renders it** unless `pathname === '/brief'` or `pathname.startsWith('/brief?')`. `usePathname()` already excludes the query string, so the check is `pathname !== '/brief'`.
- **Position and layering:** `fixed bottom-6 right-6 z-30`. The header is `z-40`, and the mobile sidebar overlay and Radix modals sit above that, so the button never covers a dialog.
- **Opaque from day one:** solid `bg-primary text-white` plus a shadow. FR-08 holds even before the token foundation lands.
- **Toasts:** `ToastProvider` adds `offset={{ bottom: 96, right: 24 }}` (Sonner 2 accepts an object offset) and the same `mobileOffset`, so toasts stack above the button's 56 px height plus its 24 px gap.
- **Name clash:** the dashboard quick action's name is "Create Post", and Playwright name matching is case-insensitive and substring by default. New tests use `{ name: 'Create post', exact: true }` and scope to the button by `data-testid="create-post-fab"`. The survey found no existing test that targets "Create Post".

### 2. Direction studies (FR-04, FR-05)

- **Three self-contained HTML files** in `docs/ui-reference/direction-studies/`, named `study-a-<slug>.html`, `study-b-<slug>.html` and `study-c-<slug>.html`. Each reproduces the **draft review page** at 1440 px:
  - the app shell header and sidebar;
  - the post preview, using a placeholder image, not a real post;
  - the caption editor;
  - the refine panel with history;
  - the version switcher;
  - the action bar (Regenerate, Refine, Publish);
  - a status chip;
  - a toast;
  - an open dropdown, to show the opaque surface rule.
- **Light and dark** are switched by a toggle in each file that flips `.dark` on `<html>`. This is the same mechanism the app uses, so the token blocks transfer directly.
- **Each study opens with a `:root` / `.dark` token block** written in the exact shape FR-06 will use. Choosing a study then means copying its token block, not re-deriving it. Each also carries a short header describing its palette, type, surface, density, radius and motion.
- **Studies may load preview fonts from Google Fonts**, because they are docs, not the app (AC-05). Each names the `next/font` equivalent the app will self-host.
- **`index.html` in the same folder** is the comparison page. It holds three iframes side by side, a theme switch that drives all three, and a one-paragraph rationale per study.
- **The studies are published to the user as one Artifact**, for comparison. Publishing goes through the Artifact tool's own rules, and the user picks. **That pick is the operator gate.**
- **Guidance:** the build agent loads the `high-end-visual-design` skill and uses it as a guide. Nothing from the skill is copied into the repo.
- **The neutral constraint:** no study may lean on BISTEC navy, blue or green as its identity. Accents are neutral or single-hue, so brand-kit swatches and post previews remain the only brand colour on screen.

### 3. Design-system document (FR-05)

- **Archive first:** `git mv docs/ui-reference/{DESIGN_SYSTEM.md,screen-dark.png,screen-light.png,synthetix-original-reference.html}` into `docs/ui-reference/archive/frozen-light/`.
- **Then write the new `DESIGN_SYSTEM.md`.** It covers the decision record (pick and date), tokens per theme, the surface model (opaque rule, elevation levels), the type scale, spacing, radius, motion and reduced-motion, the component rules (Button variants, inputs, panels, modals, menus, toasts, chips, the Create post button), the accessibility floor, and the carried-over build decisions.
- **Fix the references.** CLAUDE.md and the `project_ui_design_system` memory point at `DESIGN_SYSTEM.md`. The path stays the same, so those links keep working. The archive path is noted in the new document's header.

### 4. Token foundation (FR-06, FR-07)

`globals.css`:

```css
:root {
  /* new semantic tokens — values from the chosen study, as R G B triplets */
  --canvas: 248 250 252;
  --surface-1: 255 255 255;
  --surface-2: …; /* raised */
  --fg: …;
  --fg-muted: …;
  --line: …;
  --accent: …;
  --accent-fg: …;
  --focus: …;
  --status-draft: …; /* … the five statuses */
  --shadow-raised: 0 1px 2px …, 0 8px 24px …;
  --radius-sm: …; --radius-md: …; --radius-lg: …;
  --dur-fast: 120ms; --dur-base: 200ms; --ease-standard: cubic-bezier(…);
  /* legacy Frozen Light vars kept verbatim until the cleanup (FR-07) */
  --background: #f1f5f9; …
}
.dark { /* the same names, dark values */ }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; }
}
```

- **One naming conflict to resolve:** the legacy `--surface`, `--border` and `--text` hold hex values that `AppShell` reads directly (`style={{ background: 'var(--background)' }}`). The new triplets therefore take **new names** (`--canvas`, `--surface-1`, `--fg`, `--line`) and never reuse a legacy name. The legacy vars are deleted in the cleanup.
- **`tailwind.config.ts`** adds semantic entries next to the legacy ones: `canvas`, `surface: { DEFAULT → --surface-1, raised → --surface-2 }`, `fg: { DEFAULT, muted }`, `line`, `accent: { DEFAULT, fg }`, `focus` and `status-*`, each as `rgb(var(--x) / <alpha-value>)`. It also adds `boxShadow.raised`, the `borderRadius` scale, `transitionDuration` and `transitionTimingFunction`. **Name clash:** `primary` and `status-*` already exist. The status tokens are redefined onto vars under their **same names**, with the same `DEFAULT`/`dark` keys mapping to the one var, so `StatusChip` keeps compiling. `primary` stays legacy until the cleanup, and the new accent is `accent`.
- **Fonts:** the chosen pairing loads through `next/font/google` in `src/app/layout.tsx`, with the CSS variable names kept as `--font-sans` and `--font-mono`. `tailwind.config.ts`'s `fontFamily` points at those. Inter and JetBrains Mono stay only if the study chose them.
- **The reduced-motion block** keeps `modalIn`'s translate by shortening durations, not removing animations, so the `fill: both` final frame (which carries the centring) still applies.
- **Tests (new):**
  - `tests/unit/designTokens.test.ts` (AC-07) parses `globals.css` with a small regex reader. It asserts every semantic token in both blocks, and that the Tailwind config maps each colour to `rgb(var(--…) / <alpha-value>)`.
  - `tests/unit/contrast.test.ts` (AC-16) declares the pairs (fg/canvas, fg/surface, fg-muted/surface, accent-fg/accent, each status/surface, line/surface, focus/surface), computes the WCAG relative-luminance ratio in about 20 lines, and asserts the thresholds per theme.

### 5. Primitives and the opaque surface model (FR-08, FR-09)

- **The surface classes, in `@layer components`,** are the only way a primitive gets a surface: `.surface` (in-flow panel: `bg-surface`, hairline `line` border), `.surface-raised` (menus, popovers, toasts, the Create post button: opaque `surface-raised` plus `shadow-raised`) and `.surface-overlay` (modals and the lightbox chrome: opaque, with a stronger shadow). **None of them uses `backdrop-filter` or an alpha background.** The modal **scrim** is the one translucent layer: `bg-black/50`, with nothing interactive on it.
- **Primitives:**
  - Modal, ConfirmDialog and ImageLightbox use `.surface-overlay`.
  - The menu content in Select and TeamSwitcher uses `.surface-raised`.
  - `GlassPanel` becomes `Panel` (`.surface`), and `GlassInput` becomes `Input` (token border, `ring-focus`). `index.ts` exports both new names plus aliases `GlassPanel = Panel` and `GlassInput = Input`, so screens compile untouched.
  - Button variants move to tokens, with a `focus-visible:ring-2 ring-focus ring-offset-2 ring-offset-canvas` ring.
- **The 57 `glass-input` uses** across screens are plain classNames on raw `<input>`/`<textarea>`, not the primitive. They migrate in their screen tasks. For the glass classes still in use, the opaque rule is closed **at the source**: the legacy `.glass` (header, toasts, lightbox) and `.glass-popover` are redefined to opaque values (alpha 1, no backdrop-filter) in the primitives task. Every fixed or floating surface therefore passes AC-09 the moment the task lands, before any screen restyle. `.glass-panel` and `.glass-input` are in-flow and may stay translucent until their screens migrate.
- **Toasts:** `ToastProvider` switches to `toastOptions={{ unstyled: true, classNames: { toast: 'surface-raised …', … } }}`, so Sonner's theme colours never fight the tokens.
- **AC-09 E2E (new) `tests/e2e/surfaces.test.ts`.** A helper `expectOpaque(locator)` evaluates `getComputedStyle(el)`. It parses the `backgroundColor` alpha, which must be 1 (an `rgb(…)` value, or `rgba(…, 1)`), and asserts `backdropFilter === 'none'`. It runs in both themes by setting `localStorage['bistec-theme']` before load. It covers the header, desktop sidebar, mobile sidebar (at 375 px), team-switcher menu (it needs a multi-team user; the seed's `clientx.admin` has one team, so use the seeded super admin, who can switch), a modal (publish dialog), a confirm dialog (draft delete as admin, cancelled), a toast (any save) and the lightbox chrome. Its other cases: AC-02 and AC-03 (Create post button, if not already covered by the button task's test file), AC-11, AC-17, AC-18 and AC-19.

### 6. App shell (FR-10)

- **Files:** `AppShell.tsx`, `TeamSwitcher.tsx`, `ThemeToggle.tsx`, `CreatePostButton.tsx` (restyled onto tokens), `Logo.tsx` (only if the direction changes its treatment), and the login and choose-team pages.
- **Keep:** section labels, role-gating, the Radix Dialog mobile overlay (its focus trap is today's behaviour), and every `aria-label`.

### 7. Screen restyles (FR-11, FR-12)

**Per screen:** replace legacy pairs with semantic classes, swap `glass-panel`/`glass-input` for `Panel`/`Input`/`.surface`, and apply the chosen layout and density. Then run the AC-12 grep and the full mock E2E.

**The grep (AC-12, and the cleanup guard's per-path form):**

```
(bg|text|border|ring|from|to|via|fill|stroke|divide|outline|placeholder)-(light|dark)-[a-z-]+
\bglass(-panel|-popover|-input)?\b
(bg|text|border|ring|fill|stroke)-(slate|gray|zinc|neutral|stone|sky|blue|red|green|amber|emerald|violet|purple|indigo|rose|orange|yellow|teal|cyan|lime|pink|fuchsia)-\d{2,3}
```

A file may opt a line out with `// ui-exception: <reason>`. The guard skips such lines. The only expected uses are brand-kit swatches and the post-preview frame.

**Groups and their files:**

| Task | Screen group                          | Files                                                                                                                                                                                                  |
| ---- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T7   | dashboard + library                   | `src/app/(app)/page.tsx`, `src/components/dashboard/*`, `src/app/(app)/library/page.tsx`, `src/components/library/*`                                                                                   |
| T8   | brief wizard                          | `src/app/(app)/brief/page.tsx`, `src/components/brief/*`                                                                                                                                               |
| T9   | draft review + refine                 | `src/app/(app)/drafts/[id]/page.tsx`, `src/components/drafts/*`                                                                                                                                        |
| T10  | campaigns, projects, queue            | `src/app/(app)/campaigns/**`, `src/app/(app)/projects/**`, `src/components/campaigns/*`                                                                                                                |
| T11  | brand kits admin                      | `src/app/(app)/admin/brandkits/page.tsx`, `src/components/admin/brandkits/*`                                                                                                                           |
| T12  | team, settings, admin users and teams | `src/app/(app)/team/page.tsx`, `src/components/team/*`, `src/app/(app)/settings/page.tsx`, `src/components/settings/*`, `src/app/(app)/admin/{users,teams}/page.tsx`, `src/app/(app)/admin/layout.tsx` |

Login and choose-team go with the shell (T6).

### 8. Cleanup (FR-13) and capture (FR-14)

- **Delete:** the legacy vars and Tailwind colours, the four glass utilities, `.glow-blob` (unless kept), and the aliases.
- **`tests/unit/uiTokenGuard.test.ts`** (AC-14) walks `src/**/*.{ts,tsx,css}` with `fs`, applies the three greps above plus `GlassInput|GlassPanel`, honours `ui-exception`, and fails with file:line.
- **`scripts/capture-ui.mjs`** uses `@playwright/test`'s `chromium`, which is already a devDependency. It reads `TEST_BASE_URL` (default `http://localhost:3001`), logs in as the seeded admin, and visits each screen (it creates one draft through the mock seams if none exists) at 1440 and 375 px, in light and dark, saving to `ui-captures/<date>/`. `ui-captures/` is added to `.gitignore`. The final run's dashboard captures replace `docs/ui-reference/screen-{light,dark}.png`.

## Architecture

```
globals.css  :root / .dark  ── semantic CSS vars (one place, per theme)
       │
tailwind.config.ts  ── semantic names → rgb(var(--x) / <alpha-value>)
       │
src/components/ui/*  + .surface / .surface-raised / .surface-overlay
       │
AppShell (header · sidebar · team switcher · CreatePostButton)
       │
screens (src/app/(app)/**, src/components/<feature>/*) — semantic classes only
```

The theme mechanism is unchanged: `themeInitScript` sets `.dark` on `<html>` before paint, and `ThemeProvider` toggles it. Only what the class switches changes, from paired utilities to variables.

## File Changes Map

| File / area                                                                                                 | Change                                                       | Task                    |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------- |
| `src/components/layout/CreatePostButton.tsx`                                                                | new                                                          | T1 (restyle T6)         |
| `src/components/layout/AppShell.tsx`                                                                        | render the button; later the shell restyle                   | T1, T6                  |
| `src/components/providers/ToastProvider.tsx`                                                                | offset; later unstyled + tokens                              | T1, T5                  |
| `tests/e2e/create-post-button.test.ts`                                                                      | new: AC-01 to AC-03                                          | T1                      |
| `docs/ui-reference/direction-studies/*`                                                                     | new: three studies + `index.html`                            | T2                      |
| `docs/ui-reference/archive/frozen-light/*`                                                                  | moved: old document, screenshots, reference HTML             | T3                      |
| `docs/ui-reference/DESIGN_SYSTEM.md`                                                                        | rewritten                                                    | T3                      |
| `.specclaw/changes/011-app-visual-redesign/proposal.md`                                                     | Decisions: the pick                                          | T3                      |
| `src/app/globals.css`, `tailwind.config.ts`, `src/app/layout.tsx`                                           | semantic tokens, fonts, reduced motion; later legacy removal | T4, T5, T13             |
| `tests/unit/designTokens.test.ts`, `tests/unit/contrast.test.ts`                                            | new                                                          | T4                      |
| `src/components/ui/*`                                                                                       | primitives on tokens, `Panel`/`Input` + aliases              | T5                      |
| `tests/e2e/surfaces.test.ts`                                                                                | new: AC-09, 11, 17, 18, 19                                   | T5 (extended T6)        |
| `TeamSwitcher.tsx`, `ThemeToggle.tsx`, `Logo.tsx`, login, choose-team                                       | shell restyle                                                | T6                      |
| screen groups (table above)                                                                                 | restyle                                                      | T7–T12                  |
| `tests/unit/uiTokenGuard.test.ts`, `scripts/capture-ui.mjs`, `.gitignore`, `docs/ui-reference/screen-*.png` | new / refreshed                                              | T13 (capture script T4) |

Estimate: about 75 files, matching the proposal's 60–90.

## Data Model Changes

None.

## API Changes

None.

## Key Decisions

1. **Semantic CSS variables plus Tailwind mapping, not a component library.** This collapses about 1,700 paired or `dark:` utilities into single classes and puts the direction in one file. Rejected: shadcn/ui or Radix Themes (a new dependency and visual opinions, against NFR-08 and the neutral brief), and CSS-in-JS (a runtime cost and a new pattern).
2. **New variable names, with legacy kept alongside until the end.** This allows per-screen migration and per-screen revert (NFR-07). Reusing `--surface` for a triplet would silently break `var(--background)`-style inline reads mid-migration.
3. **Fix the floating surfaces at the source, in the primitives task.** Redefining `.glass` and `.glass-popover` to opaque makes FR-08 true app-wide in one commit, instead of waiting for seven screen tasks. It is the inverse of the 2026-07-21 one-component patch the proposal criticises.
4. **Studies as standalone HTML, not app branches.** They are cheap, viewable without a server, comparable side by side, and each carries the exact token block the foundation will take. Building three themed versions of the real page would need the token foundation first, which is circular.
5. **No visual-regression gate (A1).** The screenshot script gives review evidence without a baseline that churns on every task.
6. **The cleanup guard is a unit test over source text**, not ESLint. It needs no custom plugin, it runs in the existing `npm run test:unit` gate, and it reports file:line.

## Risks & Mitigations

| Risk                                                                             | Mitigation                                                                                                           |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| A restyle quietly breaks an interaction the E2E suite drives                     | FR-12 keeps names and roles; a full mock E2E after every screen task (AC-13); one implementer at a time              |
| The token migration misses a `dark:` twin, so one theme looks wrong              | The AC-12 grep per screen; the FR-14 captures of both themes reviewed per task; the cleanup guard at the end         |
| The study pick takes a long time                                                 | T1 ships independently; T3 onwards waits, with nothing half-built                                                    |
| Sonner or Radix portals escape the token scope                                   | Tokens live on `:root`/`.dark` on `<html>`, which the portals inherit; AC-09 checks a portaled menu, modal and toast |
| Reduced-motion CSS breaks modal centring (the 2026-07-13 `animate-scale-in` bug) | Shorten durations instead of removing animations; AC-18 asserts the centre                                           |
| Font change shifts layouts and breaks tests that assert text wrapping            | None found in the survey; the full E2E per task catches it                                                           |
| Contrast drift when the direction is tuned later                                 | The contrast unit test (AC-16) fails on any token edit that breaks AA                                                |
| The D: drive I/O errors (2026-10-01)                                             | Push `v2` after each task                                                                                            |

## Grounding sources

- `docs/ui-reference/DESIGN_SYSTEM.md` §0: _"Theme default & persistence: Follow OS preference (`prefers-color-scheme`) on first visit, then remember the user's manual toggle via `localStorage`. Apply the class before first paint"_ and _"Fonts & icons — self-host everything, no external CDN."_ Carried into NFR-04 and NFR-05.
- `docs/ui-reference/DESIGN_SYSTEM.md` header: _"Hard requirement: both a DARK and a LIGHT theme … `darkMode: "class"`."_ This is why the token switch keys on the existing `.dark` class.
- `src/app/globals.css`, the `.glass-input` comment: _"background-COLOR, never the `background` shorthand: the shorthand resets background-image, which erases the Select chevron."_ The new input and surface classes keep to `background-color`.
- `src/app/globals.css`, the `modalIn` comment: _"A keyframe `transform` REPLACES the class transform … These keyframes carry the translate through every frame."_ This is the basis for NFR-03's duration-shortening approach and AC-18.
- `CLAUDE.md`, UI clarity pass 2026-07-20: _"Never use the shorthand in classes that coexist with bg-image utilities."_
- `CLAUDE.md`, team tenancy review fixes: _"new near-opaque `.glass-popover` surface for floating menus (the team-switcher dropdown was see-through over nav text — `.glass-panel`'s 60% alpha is for in-flow panels only)."_ This is the precedent the opaque surface model generalises.
- `CLAUDE.md`, gotchas: _"Never run two implementers in one checkout; lint-staged stashes"_ and _"Before a full E2E run: stop stray node processes, `rm -rf .next`, and drop/recreate the test DB."_
- `.specclaw/ROADMAP.md`, "Parallel-work caution": the brief wizard's Review step, `PublishDialog.tsx`, the refine panel and the draft page's caption area are shared with 008, 010 and 012.
