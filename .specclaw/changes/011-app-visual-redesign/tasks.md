# Tasks: App visual redesign

**Change:** 011-app-visual-redesign
**Created:** 2026-10-06
**Total Tasks:** 13

## Summary

There are 13 tasks in 7 waves. All the work lands on `v2`.

| Wave | Content                                                                     |
| ---- | --------------------------------------------------------------------------- |
| 1    | Create post button (today's style) · three direction studies                |
| 2    | **Operator gate: the user picks a study** · new `DESIGN_SYSTEM.md`          |
| 3    | Token foundation + capture script                                           |
| 4    | Primitives + the opaque surface model                                       |
| 5    | App shell (with login and choose-team) · dashboard + library · brief wizard |
| 6    | Draft review · campaigns/projects · brand kits · team/settings/admin        |
| 7    | Cleanup, guard, final captures                                              |

**Operator step:** after T2, the user picks one of the three studies. **T3 cannot start until the pick is recorded.** It is the only task that waits on the user. T1 does not depend on it and can ship alone.

**Run tasks one at a time,** even within a wave. lint-staged stashes, so two implementers in one checkout corrupt each other's work.

**Every task that touches `src/` ends with a full clean mock E2E run:** stop stray node processes, `rm -rf .next`, drop and recreate the test DB, then `test:e2e:serve` and `test:e2e:mock`. The run must have 0 failed and 0 flaky (NFR-06, AC-13). Every task report lists any test it edited, with the reason. Push `v2` after each task.

## Tasks

### Wave 1 — Create post button and direction studies

- [x] `T1` — Floating Create post button, in today's style
  - Files: `src/components/layout/CreatePostButton.tsx` (new), `src/components/layout/AppShell.tsx`, `src/components/providers/ToastProvider.tsx`, `tests/e2e/create-post-button.test.ts` (new)
  - Estimate: small
  - Kind: impl
  - Notes:
    - **Covers:** FR-01 to FR-03, A2, A3.
    - **ACs:** AC-01 to AC-04.
    - **The button:** a `Link` to `/brief`, `aria-label="Create post"`, `data-testid="create-post-fab"`, `fixed bottom-6 right-6 z-30`, opaque `bg-primary` plus a shadow. It shows icon + label at `md` and wider, and the icon only (with a `title`) below `md`. It is hidden when `pathname === '/brief'`.
    - **Toasts:** Sonner `offset` and `mobileOffset`, so toasts stack above the button.
    - **Tests:** use `{ name: 'Create post', exact: true }`, or the testid, because the dashboard quick action is named "Create Post".
    - **Screenshots:** light and dark, desktop and 375 px.

- [x] `T2` — Three direction studies of the draft review page
  - Files: `docs/ui-reference/direction-studies/study-a-*.html`, `study-b-*.html`, `study-c-*.html`, `docs/ui-reference/direction-studies/index.html` (all new)
  - Estimate: medium
  - Kind: docs
  - Notes:
    - **Covers:** FR-04.
    - **ACs:** AC-05.
    - **Load the `high-end-visual-design` skill as guidance.** Copy nothing from it into the repo.
    - **Each study:**
      - is self-contained HTML of the draft review page at 1440 px;
      - covers the shell, post preview, caption editor, refine panel with history, version switcher, action bar, a status chip, a toast and an open dropdown;
      - has a light/dark toggle on `<html>.dark`;
      - opens with a `:root`/`.dark` token block in the FR-06 shape (R G B triplets);
      - has a header stating its palette, type, surface, density, radius and motion.
    - **The three must differ meaningfully.** Neutral tool UI: no BISTEC navy/blue/green identity.
    - **Opaque fixed and floating surfaces** (FR-08) in every study.
    - **Contrast:** every text pair meets AA in both themes. State the ratios in each header.
    - **Fonts:** preview fonts may come from Google Fonts, and each study names the `next/font` equivalent.
    - **`index.html`:** the three studies side by side, with one theme switch and a short rationale each.
    - **Hand-off:** publish the comparison as an Artifact for the user and **stop for the pick**.

### Wave 2 — The pick and the design-system document

- [ ] `T3` — Record the pick; new `DESIGN_SYSTEM.md`; archive Frozen Light
  - Files: `docs/ui-reference/DESIGN_SYSTEM.md`, `docs/ui-reference/archive/frozen-light/` (moved: `DESIGN_SYSTEM.md`, `screen-dark.png`, `screen-light.png`, `synthetix-original-reference.html`), `.specclaw/changes/011-app-visual-redesign/proposal.md`
  - Estimate: medium
  - Kind: docs
  - Depends: T2, the user's pick
  - Notes:
    - **Covers:** FR-05.
    - **ACs:** AC-06.
    - **Archive with `git mv`.** Delete nothing.
    - **The new document has:**
      - the decision record (study and date);
      - the tokens per theme, taken from the chosen study's block;
      - the surface model (`.surface`, `.surface-raised`, `.surface-overlay`, and the scrim exception);
      - the type, spacing, radius and motion scales, including reduced motion;
      - the component rules, including the Create post button;
      - the accessibility floor (NFR-01 to NFR-03);
      - the carried-over §0 build decisions;
      - the `// ui-exception:` convention.
    - **Record the pick** in the proposal's Decisions section, with its date.

### Wave 3 — Token foundation

- [ ] `T4` — Semantic tokens, fonts, reduced motion, token and contrast tests, capture script
  - Files: `src/app/globals.css`, `tailwind.config.ts`, `src/app/layout.tsx`, `tests/unit/designTokens.test.ts` (new), `tests/unit/contrast.test.ts` (new), `scripts/capture-ui.mjs` (new), `.gitignore`
  - Estimate: medium
  - Kind: impl
  - Depends: T3
  - Notes:
    - **Covers:** FR-06, FR-07, FR-14 (script), NFR-01, NFR-03, NFR-04, NFR-05.
    - **ACs:** AC-07, AC-08, AC-16, AC-19 (font half).
    - **New variable names only** (`--canvas`, `--surface-1`, `--surface-2`, `--fg`, `--fg-muted`, `--line`, `--accent`, `--accent-fg`, `--focus`, `--status-*`, shadows, radii, durations, easing). **Legacy vars and Tailwind colours stay verbatim.**
    - **Tailwind:** semantic colours as `rgb(var(--x) / <alpha-value>)`. The `status-*` tokens are remapped onto vars under the same names and keys, so `StatusChip` compiles unchanged.
    - **Fonts:** the chosen pairing via `next/font`, with variables `--font-sans` and `--font-mono`.
    - **Reduced motion:** a block that shortens durations and keeps animations, so the modal centring survives.
    - **Capture script:** as specified in design §8, writing to a gitignored `ui-captures/`.
    - **Proving AC-08:** captures before and after the token change show unmigrated screens unchanged. State the comparison in the report.

### Wave 4 — Primitives and the opaque surface model

- [ ] `T5` — Rebuild `src/components/ui/*` on tokens; opaque fixed and floating surfaces; surfaces E2E
  - Files: `src/app/globals.css` (surface classes; `.glass` and `.glass-popover` made opaque), `src/components/ui/*` (`Panel.tsx` and `Input.tsx` new, from the `Glass*` files, plus aliases in `index.ts`), `src/components/providers/ToastProvider.tsx`, `tests/e2e/surfaces.test.ts` (new)
  - Estimate: large
  - Kind: impl
  - Depends: T4
  - Notes:
    - **Covers:** FR-08, FR-09, NFR-02, NFR-03.
    - **ACs:** AC-09, AC-10, AC-17 (primitive half), AC-18, AC-19.
    - **Fix the opaque rule at the source:** redefine `.glass` and `.glass-popover` to alpha 1 with no `backdrop-filter`, so the header, toasts, lightbox and team switcher pass AC-09 now.
    - **Toasts:** Sonner `unstyled`, with token classNames.
    - **Keep** every export, prop, accessible name and role.
    - **Surfaces E2E:** `expectOpaque` covers the header, desktop and mobile sidebar, team-switcher menu (as the seeded super admin), the publish modal, a cancelled confirm dialog, a toast, the lightbox chrome and the Create post button. Each runs in both themes, set via `localStorage['bistec-theme']`. Also cover AC-18 (reduced motion keeps the modal centred) and AC-19 (dark first paint; no font/icon CDN request during the suite).

### Wave 5 — App shell and the first screens

- [ ] `T6` — App shell restyle, plus login and choose-team
  - Files: `src/components/layout/AppShell.tsx`, `src/components/layout/TeamSwitcher.tsx`, `src/components/layout/CreatePostButton.tsx`, `src/components/theme/ThemeToggle.tsx`, `src/components/Logo.tsx` (only if the direction changes it), `src/app/(auth)/login/page.tsx`, `src/app/(app)/choose-team/page.tsx`, `tests/e2e/surfaces.test.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T5
  - Notes:
    - **Covers:** FR-10, FR-11 (group 7), A4.
    - **ACs:** AC-11, AC-12 (shell group), AC-13, AC-17 (shell).
    - **Keep** the sidebar sections, role-gating, the Radix mobile overlay and every `aria-label`.
    - **The button moves onto tokens** (`bg-accent text-accent-fg`, `.surface-raised` shadow).
    - **Remove** the `style={{ background: 'var(--background)' }}` inline read in favour of `bg-canvas`.

- [ ] `T7` — Restyle the dashboard and library
  - Files: `src/app/(app)/page.tsx`, `src/components/dashboard/RecentDraftsCard.tsx`, `src/app/(app)/library/page.tsx`, `src/components/library/PostCard.tsx`, `src/components/library/PublishDialog.tsx`, `src/components/library/PublishHistoryDrawer.tsx`
  - Estimate: medium
  - Kind: impl
  - Depends: T5
  - Notes:
    - **Covers:** FR-11 (group 1), FR-12.
    - **ACs:** AC-12, AC-13, AC-17.
    - **Post thumbnails are never token-styled.**
    - **`PublishDialog` is shared with 010.** Keep its props stable.

- [ ] `T8` — Restyle the brief wizard
  - Files: `src/app/(app)/brief/page.tsx`, `src/components/brief/*`
  - Estimate: medium
  - Kind: impl
  - Depends: T5
  - Notes:
    - **Covers:** FR-11 (group 2), FR-12.
    - **ACs:** AC-12, AC-13, AC-17.
    - **Brand-kit swatches and template thumbnails stay data-driven,** with `// ui-exception:` where needed.
    - **`cardCls.ts`** is a shared class helper here. Move it onto tokens.
    - **The Review step is shared with 008.** Keep its structure easy to extend.

### Wave 6 — The remaining screens

- [ ] `T9` — Restyle draft review and refine
  - Files: `src/app/(app)/drafts/[id]/page.tsx`, `src/components/drafts/*`
  - Estimate: large
  - Kind: impl
  - Depends: T5
  - Notes:
    - **Covers:** FR-11 (group 3), FR-12.
    - **ACs:** AC-12, AC-13, AC-17.
    - **This is the page the studies were drawn on,** so match the chosen study closely.
    - **The background notice** stays amber and `role="status"`, on tokens.
    - **The post preview frame is a `ui-exception`.**
    - **Shared with 012** (the caption area) and 008 (the refine panel). Keep the components separable.

- [ ] `T10` — Restyle campaigns, projects and the queue
  - Files: `src/app/(app)/campaigns/page.tsx`, `src/app/(app)/campaigns/[id]/page.tsx`, `src/app/(app)/projects/page.tsx`, `src/app/(app)/projects/[id]/page.tsx`, `src/components/campaigns/*`
  - Estimate: medium
  - Kind: impl
  - Depends: T5
  - Notes:
    - **Covers:** FR-11 (group 4), FR-12.
    - **ACs:** AC-12, AC-13, AC-17.

- [ ] `T11` — Restyle the brand kits admin
  - Files: `src/app/(app)/admin/brandkits/page.tsx`, `src/components/admin/brandkits/*`
  - Estimate: medium
  - Kind: impl
  - Depends: T5
  - Notes:
    - **Covers:** FR-11 (group 5), FR-12.
    - **ACs:** AC-12, AC-13, AC-17.
    - **Colour editor swatches, font previews and template previews show kit data.** Mark them `// ui-exception:`.

- [ ] `T12` — Restyle team, settings and admin users and teams
  - Files: `src/app/(app)/team/page.tsx`, `src/components/team/*`, `src/app/(app)/settings/page.tsx`, `src/components/settings/*`, `src/app/(app)/admin/users/page.tsx`, `src/app/(app)/admin/teams/page.tsx`, `src/app/(app)/admin/layout.tsx`
  - Estimate: medium
  - Kind: impl
  - Depends: T5
  - Notes:
    - **Covers:** FR-11 (group 6), FR-12.
    - **ACs:** AC-12, AC-13, AC-17.
    - **`ClaudeConnectGuide`'s OS tabs** keep their `tablist` and `tab` roles. The `settings-claude-token` E2E asserts them.

### Wave 7 — Cleanup

- [ ] `T13` — Remove the legacy tokens and glass utilities; guard test; final captures; docs
  - Files: `src/app/globals.css`, `tailwind.config.ts`, `src/components/ui/index.ts`, `src/components/ui/GlassInput.tsx` and `GlassPanel.tsx` (deleted), `tests/unit/uiTokenGuard.test.ts` (new), `docs/ui-reference/screen-light.png`, `docs/ui-reference/screen-dark.png`, `CLAUDE.md`, `docs/handoff.md`
  - Estimate: medium
  - Kind: refactor
  - Depends: T6, T7, T8, T9, T10, T11, T12
  - Notes:
    - **Covers:** FR-13, FR-14 (final run).
    - **ACs:** AC-14, AC-15, AC-20, plus a final AC-13 run.
    - **The guard** walks `src/**/*.{ts,tsx,css}` with the three design §7 regexes plus `GlassInput|GlassPanel`, honours `// ui-exception:`, and reports file:line.
    - **Remove `.glow-blob`** unless the design system keeps it.
    - **Final gates:** unit, lint (0 errors), build, `npm run test:render` 15/15, and a full clean mock E2E.
    - **Refresh** the two reference screenshots from the capture run.
    - **Docs:** update CLAUDE.md's UI pointers and the handoff.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
- `[>]` Deferred
