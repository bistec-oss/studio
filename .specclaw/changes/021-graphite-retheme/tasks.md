# Tasks: Re-theme the app from Folio to Graphite

**Change:** 021-graphite-retheme
**Created:** 2026-10-18
**Total Tasks:** 8

## Summary

There are 8 tasks in 3 waves. All the work lands on `v2`, after 018 and 022 (R12).

| Wave                         | Content                                                                                                        | Full clean mock E2E | Capture run                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------- |
| 1 — foundation (**the cut**) | T1 tokens, fonts, Tailwind, logo, guards · T2 primitives and helper fold · T3 shell, login, choose-team        | end of T3           | end of T3                                       |
| 2 — screens                  | T4 dashboard, library, brief · T5 draft review · T6 campaigns, projects, brand kits · T7 team, settings, admin | end of T7           | end of T7                                       |
| 3 — cleanup                  | T8 deny-list fully on, prop cleanup, `DESIGN_SYSTEM.md`, CLAUDE.md pointer, final gates                        | end of T8           | end of T8 (refreshes the reference screenshots) |

**Process.**

- **One task at a time,** even within a wave. Two implementers never share one checkout, because lint-staged stashes.
- **Per task:** an implementer subagent builds it and writes `reports/T<n>.md`; then `specclaw:code-reviewer` reviews it; then the orchestrator commits and pushes `v2`.
- **No real model calls.** E2E runs on the `MOCK_AI` / `MOCK_PUPPETEER` / `MOCK_SOCIAL` seams only, and nothing calls `claude -p` or an AI API.

**Gates.**

- **Every task:** `npx tsc --noEmit -p .`, `npm run lint` (0 errors), `npm run test:unit`, and the **targeted E2E specs** named in its Notes, run with `--retries=0` against `test:e2e:serve`.
- **End of each wave** (T3, T7, T8): one **full clean mock E2E**. That means stop stray node processes, `rm -rf .next`, drop and recreate the test DB, then `npm run test:e2e:serve` and `npm run test:e2e:mock`. It must be 0 failed / 0 flaky, with the count at or above the baseline (NFR-06). Then a capture run, `node scripts/capture-ui.mjs --out ui-captures/021-<task>`: 62 PNGs, and the orchestrator views a light and a dark shot of every screen.
- **Each task report** lists every test it edited and why. The list must match design.md §11, or explain the new entry.
- **Baseline:** the last full clean mock E2E count on `v2` after 022, from 022's verify report. If none exists, T1 runs one before its first edit and records it.

**Sources for every task:** design.md (the authoritative spec for 021), the Graphite study `docs/ui-reference/direction-studies/study-a-graphite.html` and its `shots/`. Until T8, these supersede the Folio `DESIGN_SYSTEM.md`.

## Tasks

### Wave 1 — Foundation: tokens, fonts, primitives, shell (the shippable cut)

- [x] `T1` — Graphite tokens, fonts and Tailwind mapping; the PNG logo back; token, contrast and guard tests
  - Files: `src/app/globals.css`, `tailwind.config.ts`, `src/app/layout.tsx`, `src/components/Logo.tsx` (restore from `7fdbe38^`), `public/BistecStudioLogo.png` (restore from `7fdbe38^`), `src/app/(auth)/login/page.tsx` and `src/components/layout/AppShell.tsx` (the `<Logo>` call only), `src/components/ui/Button.tsx` (the resting shadows only), every `src/**` file with a `font-display` / `font-text` / `opsz` token (mechanical; about 40 files), `tests/unit/designTokens.test.ts`, `tests/unit/contrast.test.ts`, `tests/unit/uiTokenGuard.test.ts`, `tests/unit/noTeamNotice.test.ts`, `tests/e2e/surfaces.test.ts` (the wordmark case → logo case; the new body-font case), `tests/e2e/a11y.test.ts` (the AC-07 helper)
  - Estimate: large
  - Kind: impl
  - Depends: 022 complete on `v2`
  - Notes:
    - **Covers:** FR-01, FR-02, FR-03, FR-08 (logo), FR-13 (patterns 1–3), FR-14, NFR-01, NFR-05.
    - **ACs:** AC-01, AC-02, AC-03, AC-04, AC-10, AC-15 (partly).
    - **Tokens:** design.md §1, verbatim from the study. Add `--radius-xl`, `--space-5` and `--space-10`; remove `--space-12`; set `--control-*` to 32 / 38 / 44 px (A1). Keep the `/* prettier-ignore */` on `:root`. Reword the Folio comments in `globals.css`.
    - **Tailwind:** design.md §2. Add `ui-xl`, `opacity['12']` and `letterSpacing.label`; `fontFamily` is exactly `{ sans, mono }`.
    - **Fonts:** design.md §3. `Plus_Jakarta_Sans` → `--font-sans`; `JetBrains_Mono` → `--font-mono`; Fraunces and Instrument Sans removed. Then delete every whole-token `font-display` / `font-text` (79 sites) and every `[font-variation-settings:'opsz'_N]` (12). Check that no deleted `font-text` sits under a `font-mono` ancestor.
    - **Logo (A6):** `git checkout 7fdbe38^ -- public/BistecStudioLogo.png`; restore `Logo.tsx` from `7fdbe38^`; `<Logo height={32} />` in the header and `<Logo height={48} />` on login. It is done here because removing Fraunces breaks the wordmark E2E (design.md Key Decision 5). Verify AC-10's `git hash-object` equality.
    - **Button (A13):** only `primary` gains a resting `shadow-raised` and `ink` gets `shadow-none`, so that the `a11y.test.ts` AC-07 helper can key on fill **and** resting shadow. `--accent` equals `--fg` from this task on. Everything else in Button is T2's.
    - **Tests:**
      - `designTokens`: the study-equality case parses `study-a-graphite.html` `:root` / `.dark` and compares every non-font token, with an empty `DEVIATIONS` map. Add the key and Tailwind assertions (AC-02) and the control heights 32 / 38 / 44.
      - `contrast`: `CHIP_ALPHA = 0.12`; the 21 pairs stay.
      - `uiTokenGuard`: patterns 1–3 on, with self-tests.
      - `noTeamNotice`: its class string.
      - `surfaces`: the logo case (AC-10), plus the body-font case (AC-04).
    - **Mutation check:** change one dark token by one digit, and confirm the study-equality case fails; then restore.
    - **Targeted E2E:** `surfaces.test.ts`, `a11y.test.ts`, `create-post-button.test.ts`, `auth.test.ts`, `ui.test.ts`.
    - **Visual:** capture login and the dashboard in both themes at 1440 and 375, as a review artifact.

- [x] `T2` — Primitives on Graphite; surface classes; fold the four folio modules into `ui/atoms.ts` and two feature-local `classes.ts`
  - Files: `src/app/globals.css` (surface classes; `pop` / `rise` replace `drop`; the reduced-motion selectors), `src/components/ui/folio.ts` → `src/components/ui/atoms.ts` (`git mv`), `src/components/ui/GateNotice.tsx` (new, from `src/components/team/folio.tsx`, which is deleted), `src/components/campaigns/folio.ts` → `src/components/campaigns/classes.ts` (`git mv`), `src/components/admin/brandkits/folio.ts` → `src/components/admin/brandkits/classes.ts` (`git mv`), `src/components/ui/{Button,Panel,Input,Select,FieldLabel,SectionHead,PageHead,StatusChip,Notice,SegmentedToggle,Modal,ConfirmDialog,ImageLightbox,QueryError,ModelPicker,index}.tsx/ts`, `src/components/providers/ToastProvider.tsx`, every importer of the four modules (import paths only; about 60 files), `tests/unit/uiPrimitives.test.ts`, `tests/unit/designTokens.test.ts` (import path, walk list), `tests/unit/uiTokenGuard.test.ts`, `tests/e2e/a11y.test.ts` (the AC-05 expectation), `tests/e2e/surfaces.test.ts` (the press-under-reduced-motion case)
  - Estimate: large
  - Kind: impl
  - Depends: T1
  - Notes:
    - **Covers:** FR-04, FR-05, FR-06, FR-07 (atom level), FR-13 (patterns 4a and 10; 014's small-caps-literal rule superseded per design.md §6), NFR-02, NFR-03.
    - **ACs:** AC-06, AC-07, AC-08, AC-09 (labels), AC-18.
    - **Surfaces:** design.md §4.1. `.surface`, the new `.surface-bezel`, `.surface-raised` and `.surface-overlay`, all opaque with no `backdrop-filter`. Hairlines are box-shadow rings.
    - **Atoms:** design.md §4.2.
      - `SMALL_CAPS` uses `tracking-label`, and nothing in `src/` writes `tracking-[0.14em]`.
      - `TABLE_HEAD_ROW` loses `uppercase`.
      - Add `PILL_BADGE`, `BLOCK` (hairline, not ink) and `ROW`.
      - `SECTION_NUMERAL` stays until T8.
    - **Components:** design.md §4.3, one by one.
      - Keep every export, prop, name, role and `data-*` hook.
      - `Panel` gains an optional `bezel`.
      - `SectionHead` stops rendering `numeral` but keeps the prop typed (A11).
    - **Fold (design.md §7):** move each module with `git mv`, then rewrite the imports. The two feature-local `classes.ts` hold exactly the atoms named in §7. No file or import path under `src/` may contain `folio` (pattern 4a on).
    - **Guard:** patterns 4a and 10 on. Add `PILL_BADGE` and `GateNotice` to the shared-name list. Move the self-test sample paths to `team/ApiKeysCard.tsx` / `ui/atoms.ts`.
    - **Tests:**
      - `uiPrimitives`: the Graphite strings (AC-07).
      - `a11y` AC-05: `textTransform` `none` and `13px`, with the equality across labels kept.
      - `surfaces`: a pressed primary Button computes no scale under `reducedMotion: 'reduce'` (AC-18).
    - **Mutation check:** give `.surface-raised` an alpha background. The AC-09 team-menu case must fail; then restore.
    - **Targeted E2E:** `a11y.test.ts`, `surfaces.test.ts`, `ui.test.ts`, `create-post-button.test.ts`, `library.test.ts` (the publish modal), `publish.test.ts`.
    - **Visual:** capture the library, the publish modal, a toast, the team menu and `/team`, in both themes at 1440 and 375.

- [x] `T3` — App shell islands, team switcher, theme toggle, Create post button, login and choose-team; wave 1 full E2E and captures
  - Files: `src/components/layout/AppShell.tsx`, `src/components/layout/TeamSwitcher.tsx`, `src/components/layout/CreatePostButton.tsx`, `src/components/theme/ThemeToggle.tsx`, `src/components/providers/ToastProvider.tsx` (offset), `src/app/(auth)/login/page.tsx`, `src/app/(app)/choose-team/page.tsx`, `tests/e2e/surfaces.test.ts`, `tests/unit/uiTokenGuard.test.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T2
  - Notes:
    - **Covers:** FR-08 (placement), FR-09, FR-13 (pattern 8), FR-16 (wave 1 run), NFR-03, NFR-06.
    - **ACs:** AC-08, AC-09 (the sidebar label), AC-11, AC-14 (wave 1), AC-17 (wave 1 run).
    - **Shell:** design.md §5.
      - The header island is on an 80 px canvas band.
      - The sidebar island is 244 px wide on a 268 px band, with the nav icons back (A9) and the nav "current" look.
      - Main padding is per §5.
      - The mobile sidebar is the same island inside the existing Radix Dialog.
      - Keep the sections, role-gating, the focus trap and every `aria-label`.
    - **Team switcher:** `.team`, with an initials avatar (`aria-hidden`) and the menu as `.surface-raised animate-pop`.
    - **Theme toggle (A8):** sun/moon segments named "Light" and "Dark", in `group "Theme"`, with `aria-pressed`. The shell's AC-17 stops stay `Light`, `Dark`, `Switch team`.
    - **Create post button:** the 52 px ink pill with the nub, which rotates 90° on hover. Press is scale 0.98, and both are off under `motion-reduce`. Remove the hover lift and the hard press shadow; then turn pattern 8 on. Toast offset `{ bottom: 96, right: 24 }`; the AC-03 no-overlap case must stay green.
    - **Login and choose-team:** bezel cards per §5. The `sr-only` h1 "Sign in to Studio" is kept.
    - **Tests (surfaces):**
      - the FAB hover case becomes the nub rotation, and the reduced-motion FAB case covers the nub (design.md §11);
      - new: header and sidebar geometry (AC-11), and the "Create" section label's `uppercase` / `1.54px` (AC-09).
    - **Targeted E2E:** `surfaces.test.ts`, `create-post-button.test.ts`, `a11y.test.ts`, `auth.test.ts`, `team-isolation.test.ts`.
    - **Wave 1 close:**
      - a **full clean mock E2E** (0 failed / 0 flaky, at or above the baseline);
      - a **capture run** to `ui-captures/021-t3` (62 PNGs), with the orchestrator viewing every screen in both themes;
      - push `v2`.

      This is the named cut: wave 1 alone is shippable on `v2`.

### Wave 2 — Screens

- [x] `T4` — Restyle the dashboard, library and brief wizard
  - Files: `src/app/(app)/page.tsx`, `src/components/dashboard/*`, `src/app/(app)/library/page.tsx`, `src/components/library/*`, `src/app/(app)/brief/page.tsx`, `src/components/brief/*`, `tests/unit/noTeamNotice.test.ts` (if its string changes), `tests/e2e/surfaces.test.ts` (only if an 011 T7/T8 case reads a removed class)
  - Estimate: medium
  - Kind: impl
  - Depends: T3
  - Notes:
    - **Covers:** FR-10 (group 1), FR-07 (screen uses), FR-12.
    - **ACs:** AC-13, AC-12's "shown as rendered" library case.
    - **Common rules:** design.md §8. Bezel section cards; ruled rows on `line-subtle`; remove the `border-[tb]-2` rules and `numeral=`; map `SMALL_CAPS` per FR-07; reword the Folio comments.
    - **Dashboard:** the KPIs in a bezel card with mono or `tabular-nums` numerals; quick actions as secondary pills ("Create Post" keeps its capital P); Recent Drafts on `TABLE_HEAD_ROW` with the `PILL_BADGE` "Unfinished" chip; the budgets unchanged.
    - **Library:** the search is a pill field; `SegmentedToggle` gets the Graphite track; `PostCard` tiles keep the post square and unrounded inside its frame (A3); `PublishDialog` and `PublishHistoryDrawer` go onto the overlay surface. `PublishDialog`'s props stay stable (it is shared with 010).
    - **Brief:**
      - `cardCls` / `rowCls`: the selected look is per §8;
      - `Stepper` labels: `SMALL_CAPS` stays (a micro label), and the Folio italic numerals go; the Stepper keeps its step numbers in 22 px discs, because the number is part of each step button's name (`1Campaign`, FR-12; ruled at the T4 review, wording amended in T8);
      - `StepHead`: drop the `SECTION_NUMERAL` span;
      - template swatches keep their `ui-exception`;
      - the Review step stays extensible (008).
    - **AC-13 grep** over the group's files: no `border-[tb]-2`, `numeral=` or `\bfolio\b`.
    - **Targeted E2E:** `library.test.ts`, `brief-draft-recovery.test.ts`, `path-a.test.ts`, `path-b.test.ts`, `async-generation.test.ts`, `model-selection.test.ts`, `ui.test.ts`, `surfaces.test.ts`, `a11y.test.ts`, `create-post-button.test.ts`.
    - **Visual:** capture the dashboard, library and brief in both themes at 1440 and 375.

- [x] `T5` — Restyle the draft review and refine page: page head, the post stage instead of the proof plate, bezel cards
  - Files: `src/app/(app)/drafts/[id]/page.tsx`, `src/components/drafts/*`, `tests/e2e/surfaces.test.ts`, `tests/unit/uiTokenGuard.test.ts`
  - Estimate: large
  - Kind: impl
  - Depends: T3
  - Notes:
    - **Covers:** FR-10 (group 2), FR-11, FR-12, FR-13 (pattern 7).
    - **ACs:** AC-12, AC-13.
    - **Layout:** design.md §8, "The draft page".
      - The page head across the top (back link, h1, meta row, action bar), then `xl:grid-cols-[0.92fr_1.08fr]` with the stage first.
      - **Stage:** the "Preview" label, the mono dims and version line, the post at its ratio (its immediate wrapper square), the version thumbnails with the `PILL_BADGE` "Current" and the 1.5 px ink ring, the note and Undo.
    - **Remove** the proof plate, `CROP` and the crop-mark spans; then turn pattern 7 on.
    - **Do not build** the More menu, the Refine button, the prev/next arrows or Delete (A5). Every existing control keeps its role and name.
    - **Cards:** `HeadlinePanel`, `CaptionPanels` / `CaptionPanel` and `RefinementPanel` on `.surface-bezel` with card heads.
      - **Refine log:** status discs at 0.12, status lines in sentence case, a mono time.
      - **Suggestions:** `TAG` pills.
      - **Prompt:** a pill with the round Send. Keep `aria-label="Send"`, and keep the visible word if a test reads it.
    - **Notices:** `NotAppliedCard` (red, `role="alert"`) and `BackgroundNotice` (amber, `role="status"`, `data-testid`, `data-reason`) go onto `Notice`.
    - **`InlineEditModal` `EDITOR_STYLE`:** `rgba(140,72,18,…)` becomes `rgba(24,24,22,…)`, with a `// ui-exception:` comment (the post iframe). Shared with 012 (captions) and 008 (refine): keep the components separable.
    - **Tests (surfaces):**
      - the AC-17 draft stops follow the new DOM order (design.md §11);
      - the "proof plate" title is renamed, with the assertions unchanged;
      - new: the layout and no-crop-marks cases (AC-12).
    - **Targeted E2E:** `agui-refinement.test.ts`, `async-actions.test.ts`, `captions.test.ts`, `background-notice.test.ts`, `refine-not-applied.test.ts`, `rejected-revisions.test.ts`, `draft-inline-edit.test.ts`, `export.test.ts`, `publish.test.ts`, `settle-race.test.ts`, `model-selection.test.ts`, `surfaces.test.ts`, `a11y.test.ts`.
    - **Visual:** capture the draft page in both themes at 1440 and 375, and compare it with `shots/a-light.png` and `a-dark.png`.

- [x] `T6` — Restyle campaigns, projects, the scheduled queue and the brand kits admin
  - Files: `src/app/(app)/campaigns/page.tsx`, `src/app/(app)/campaigns/[id]/page.tsx`, `src/app/(app)/projects/page.tsx`, `src/app/(app)/projects/[id]/page.tsx`, `src/components/campaigns/*` (incl. `classes.ts`), `src/app/(app)/admin/brandkits/page.tsx`, `src/components/admin/brandkits/*` (incl. `classes.ts`), `tests/unit/uiTokenGuard.test.ts`
  - Estimate: large
  - Kind: impl
  - Depends: T3
  - Notes:
    - **Covers:** FR-10 (group 3), FR-07 (screen uses), FR-12, FR-13 (patterns 5 and 6).
    - **ACs:** AC-09 (guard), AC-13.
    - **Campaigns and projects:**
      - group heads as `SECTION_HEAD` links with counts;
      - campaign and project rows as ruled rows, with `ROW_TITLE` restyled (16 px / 600, underlined on hover, since `accent` = ink);
      - kit and tone chips as `TAG`;
      - breadcrumbs (`CRUMB_*`) per §8;
      - the detail main column (briefing, queue) as bezel cards, and the aside blocks under `EYEBROW` heads;
      - kit swatches keep their `ui-exception`;
      - `projects/[id]`: drop the `SECTION_NUMERAL` span.
    - **Queue:** the table on `TABLE_HEAD_ROW`, with sentence-case headers; `QueueEntryModal` on the overlay surface, with pill fields; the admin postAction gate unchanged.
    - **Assistants** (briefing, brand kit): a ruled chat log; plan-review rows; the round Send; "Before" / "AI suggestion" captions stay `SMALL_CAPS`; the "active" version label is `PILL_BADGE`.
    - **Brand kits:**
      - `rowCls`: no accent bar; the selected row is the nav "current" look;
      - `optionCls`: a 1.5 px ink ring when selected;
      - `CODE_FIELD` / `TITLE_FIELD`: `radius-md`;
      - kit sections as bezel cards; the `SectionHeader` numerals go;
      - **`KitDetail.tsx:517`'s artifact-type label** (`uppercase tracking-[0.1em]`) becomes `EYEBROW` or sentence case. Then turn patterns 5 and 6 on.
      - Kit swatches (`shared.tsx`) keep their `ui-exception`.
      - 014's one-accent-primary rule now reads as one primary (A13), so the `a11y.test.ts` AC-07 cases must stay green.
    - **AC-13 grep** over the group's files.
    - **Targeted E2E:** `campaign-scheduling.test.ts`, `briefing-assistant.test.ts`, `brand-kit.test.ts`, `brandkit-assistant.test.ts`, `image-to-template.test.ts`, `team-isolation.test.ts`, `surfaces.test.ts`, `a11y.test.ts`.
    - **Visual:** capture campaigns, campaign detail, projects, project detail and brand kits in both themes at 1440 and 375.

- [x] `T7` — Restyle team, settings and admin users and teams; wave 2 full E2E and captures
  - Files: `src/app/(app)/team/layout.tsx`, `src/app/(app)/team/page.tsx`, `src/components/team/*`, `src/app/(app)/settings/page.tsx`, `src/components/settings/*`, `src/app/(app)/admin/layout.tsx`, `src/app/(app)/admin/users/page.tsx`, `src/app/(app)/admin/teams/page.tsx`
  - Estimate: medium
  - Kind: impl
  - Depends: T3, T4, T5, T6
  - Notes:
    - **Covers:** FR-10 (group 4), FR-07 (screen uses), FR-12, FR-16 (wave 2 run), NFR-06.
    - **ACs:** AC-13, AC-14 (wave 2), AC-17 (wave 2 run).
    - **Settings and the token cards:** each card (`ClaudeTokenCard`, `OpenAiKeyCard`, `ChangePasswordCard`, `TeamClaudeTokenCard`, `ApiKeysCard`, `ModelsCard`) becomes a bezel card with a card head.
      - Remove the forwarded `numeral` props and their arguments, which are internal component props.
      - `BLOCK` is no longer needed where the bezel replaces it.
      - Masked prefixes stay in mono, unchanged; secrets are shown exactly as before.
    - **`ClaudeConnectGuide`:** keep `tablist "Operating system"` and its roles; the tabs take the `SegmentedToggle` track look.
    - **`/team`:**
      - provider rows are ruled rows;
      - "Default" is `PILL_BADGE`;
      - the On/Off word stays in sentence case and keeps its `text-accent` class (`a11y.test.ts:835`);
      - the slot labels `COPY` / `IMAGE` are source strings, unchanged;
      - `ImageDefaultState` stays amber, with its `data-testid` and `data-state`.
    - **Admin users and teams:** tables on `TABLE_HEAD_ROW`, inside their `relative`, focusable, labelled regions; the members panel as a bezel card; `GateNotice` (now in `ui`) unchanged in props.
    - **AC-13 grep** over the group's files.
    - **Targeted E2E:** `team-settings.test.ts`, `settings-claude-token.test.ts`, `provider-registration.test.ts`, `user-management.test.ts`, `team-image-default.test.ts`, `model-selection.test.ts`, `team-isolation.test.ts`, `surfaces.test.ts`, `a11y.test.ts`.
    - **Wave 2 close:**
      - a **full clean mock E2E** (0 failed / 0 flaky, at or above the baseline);
      - a **capture run** to `ui-captures/021-t7` (62 PNGs), with the orchestrator viewing every screen in both themes;
      - push `v2`.

### Wave 3 — Cleanup, docs and final gates

- [x] `T8` — Full deny-list on; remove the numeral prop and leftovers; new Graphite `DESIGN_SYSTEM.md`; CLAUDE.md pointer; final gates and captures
  - Files: `tests/unit/uiTokenGuard.test.ts`, `src/components/ui/SectionHead.tsx`, `src/components/ui/atoms.ts`, any `src/` file still holding a `\bfolio\b` comment, a `border-[tb]-2` rule or an unused atom, `docs/ui-reference/DESIGN_SYSTEM.md`, `docs/ui-reference/screen-light.png`, `docs/ui-reference/screen-dark.png`, `CLAUDE.md` (the "UI / Design system" section only)
  - Estimate: medium
  - Kind: refactor
  - Depends: T4, T5, T6, T7
  - Notes:
    - **Covers:** FR-13 (all patterns on), FR-15, FR-16 (final run), NFR-06, NFR-10.
    - **ACs:** AC-05, AC-13, AC-14 (final), AC-16, AC-17 (final), AC-19.
    - **Cleanup:**
      - Delete `SectionHead`'s `numeral` prop and `SECTION_NUMERAL`; `tsc` proves no caller is left.
      - Delete `BLOCK` and any other atom with no importer.
      - Turn on patterns 4b (`\bfolio\b`, comments included) and 9 (`border-[tb]-2`), and fix any straggler.
      - With every §6 pattern on, the guard is 0 hits. Then run AC-05's two shell greps.
    - **`DESIGN_SYSTEM.md` (FR-15, A10):** rewrite it for Graphite under the current section numbering.
      - The decision record: the 2026-10-18 pick, the rulings R1–R12, A1–A13 and the logo (which reverses the 2026-10-07 wordmark decision).
      - The token block per theme, copied from `globals.css`, and the contrast table (design.md §9).
      - §3's **deviation list**: "none" unless a deviation was forced, each with its pair and ratio.
      - The surface model, including `.surface-bezel`.
      - Type, spacing, radius and motion, including reduced motion.
      - The component rules (§8.1 logo, §8.12 post stage, §8.13 versions, §8.14 caption and refine cards, §8.17 no More menu).
      - The accessibility floor, the §0 carry-overs and the `ui-exception` convention.
      - **No** Folio archive copy (R9); the Frozen Light archive pointer stays.
    - **CLAUDE.md:** only the "UI / Design system" pointer, which becomes Graphite, `study-a-graphite.html`, and the refreshed screenshots.
    - **Final gates:**
      - `tsc`; `npm run lint` (0 errors); `npm run test:unit`;
      - `rm -rf .next && npm run build && rm -rf .next`;
      - `npm run test:render` 15/15, with nothing on :3001 and `.next` removed;
      - a **full clean mock E2E** (0 failed / 0 flaky, at or above the baseline);
      - a **capture run** to `ui-captures/021-final` (62 PNGs, all viewed).
    - **Reference screenshots:** refresh `docs/ui-reference/screen-{light,dark}.png` from the draft page at 1440 (011 T13's method, with the dev badge hidden).
    - **Report:** list every test edited across 021 against design.md §11.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
- `[>]` Deferred
