# Proposal: Re-theme the app from Folio to Graphite

**Created:** 2026-10-18
**Status:** 🟡 Draft

## Problem

This repo (`bistec-oss/studio`) adopted the fork `EnderGuardian25/ai-studio` `v2` on 2026-10-18 by fast-forward (`c82fdb08` → `1c38dbb9`, 119 commits). The fork built change 011 in **study B, Folio**: paper and ink, a burnt-sienna accent, Fraunces serif headings, flat rules and a print-proof plate with crop marks.

The user wants this system to look different from the fork. On 2026-10-18 the user picked **study A, Graphite**, from the same three 011 studies (`docs/ui-reference/direction-studies/study-a-graphite.html`).

Folio is not just a token file. It reaches 67 files under `src/`:

- `src/app/layout.tsx` loads Fraunces, Instrument Sans and JetBrains Mono, and maps them to `font-display`, `font-sans` and `font-text`.
- `src/app/globals.css` holds the Folio semantic tokens (66 custom properties). `tailwind.config.*` maps them to `ui-*` radii and colours.
- Three `folio.ts` helper modules exist: `src/components/ui/folio.ts`, `src/components/campaigns/folio.ts` and `src/components/admin/brandkits/folio.ts`.
- The shared primitives in `src/components/ui/` (Button, Panel, FieldLabel, SectionHead, PageHead, StatusChip, Modal and others) encode Folio shapes: square corners, 1 px ink borders, hard offset shadows, small-caps labels.
- The draft page shows the post on a proof plate with crop marks.
- The typeset "Studio" wordmark (011 T6) is set in Fraunces.
- Guards pin Folio: `tests/unit/designTokens.test.ts`, `tests/unit/contrast.test.ts` and `tests/unit/uiTokenGuard.test.ts`. The guard names the Folio atoms and the small-caps tracking literal.
- `docs/ui-reference/DESIGN_SYSTEM.md` names Folio as authoritative.

## Proposed Solution

Swap the visual direction to Graphite, and keep the structure the fork built: the semantic token layer, the primitives, the 014 accessibility work and the opaque-surface rule.

1. **Tokens.** Replace the Folio values in `globals.css` with the Graphite study's token block, for light and dark: warm-grey canvas and surfaces, a black-ink accent (bone ink in dark), status colours, three soft shadow levels, radii 8/12/18/26 px and a pill, 14 px body, and the motion durations and easings. Keep the OS-follow theme rule.
2. **Fonts.** Plus Jakarta Sans for all text and JetBrains Mono for numbers and code. Drop Fraunces and Instrument Sans from `layout.tsx`.
3. **Shape.** Pill buttons, rounded opaque cards with soft shadows, two-column draft page as in the study. No glass and no `backdrop-filter`: 011's opaque-surface rule stays.
4. **Primitives first.** Restyle `src/components/ui/*` and rename the `folio.ts` helpers to neutral names, so screens pick up most of the change through the primitives.
5. **Screens.** Remove Folio-only elements screen by screen: the proof plate and crop marks, serif section heads, the small-caps rules where Graphite uses plain labels.
6. **Wordmark.** Re-set the "Studio" wordmark in Plus Jakarta Sans (open question 1).
7. **Guards and tests.** Update `designTokens`, `contrast` and `uiTokenGuard` to Graphite values and names. Contrast must meet the same thresholds as 011 in both themes.
8. **Docs.** Write a new `DESIGN_SYSTEM.md` for Graphite, with a decision record. Archive the Folio version to `docs/ui-reference/archive/folio/`, as 011 did for Frozen Light.

## Scope

### In Scope

- Items 1–8, in light and dark.
- Every screen 011 and 014 restyled: shell, login, choose-team, dashboard, library, brief wizard, draft review and refine, campaigns, projects, queue, brand kits admin, team, settings, admin users and teams.
- Before/after captures with the existing capture script.
- A full clean mock E2E per task that touches `src/`, as 011 did.

### Out of Scope

- Any behaviour, API, schema or copy change.
- The rendered posts. Brand kits and the design agent's prompts are untouched.
- Re-doing the 014 accessibility work. Labels, ARIA and focus order stay. Only colour and shape change, and contrast is re-checked.
- New layout ideas beyond the Graphite study.
- Change 020 (Create post button off the draft page). It stays its own change.

## Impact

- **Size:** architectural. The design system is an interface every later UI change depends on, and the change spans 67+ files.
- **Files affected:** about 80 (estimated), including tests and docs.
- **Complexity:** large
- **Risk:** medium. The token layer and the guards contain it, but many class strings carry Folio shapes directly, and E2E selectors may key on visible text such as small-caps labels.

## Open Questions

1. **Wordmark.** Re-set the typeset "Studio" wordmark in Plus Jakarta Sans, or return to the old `public/BistecStudioLogo.png`? Default: typeset in Plus Jakarta Sans, since 011 decided the UI carries no BISTEC brand cues.
2. **Order against 018–020.** The fork's 018 (T1 WIP), 019 and 020 are still open. Build 021 before them, after them, or interleave? Default: finish 018 first, because its T1 is half-done, then 021, then 019 and 020.
3. **Graphite carry-over notes.** The 011 T2 report raised `--line-subtle`, reduced-motion timing, amber `scheduled` and regrouped controls for the picked study. Do the same notes apply to Graphite? Planning reads the T2 report and decides.

### Party panel (2026-10-18, tier standard, CHANGES_REQUESTED, advisory) — upheld findings

- (party-po, BLOCK) The do-nothing and token-only variants are not priced against the full swap. See party-report.md.
- (party-po) Per-task full E2E and the captures have no count attached.
- (party-po) The `folio.ts` rename and the Folio archive have no stated value.
- (party-po, NOTE) No shippable cut after the primitives, and the order needs its reason.
- (party-ba) The motive is not stated, and there are no falsifiable acceptance criteria.
- (party-ba) The 67/66/80 counts have no method.
- (party-ba) "Look different" conflicts with "keep the structure".
- (party-ba, NOTE) Does the study's token block pass the contrast tests?
- (party-ba, NOTE) Are small-caps labels uppercased in the strings or in CSS?
- (party-architect) Token naming rule and the Tailwind mapping are unspecified.
- (party-architect) The `font-display` / `font-sans` / `font-text` mapping is unspecified.
- (party-architect) No deterministic check that the Folio sweep is complete.
- (party-architect) Which small-caps, if any, survive.
- (party-architect, NOTE) One helper module or three.
- (party-architect, NOTE, rebuttals) The helper contents do change; option (a) still carries the guard, Tailwind and font co-changes.

### Panel rulings (orchestrator, 2026-10-18, under the user's delegation to make judgement calls)

1. **Full swap stands.** On 2026-10-18 the user said "theme needs to change" and picked Graphite over keeping Folio. Graphite's study keeps today's two-column layout by design, so a reskin on the fork's structure is the chosen outcome. The driver is a visual identity distinct from the fork.
2. **Two waves, with a named cut.** Wave 1: tokens, fonts, Tailwind mapping, primitives and guards. Wave 2: screens. A mixed state may sit on `v2` between waves, because `v2` does not deploy.
3. **E2E cost:** one full clean mock E2E per wave plus at the end. Each task runs tsc, lint, unit and the targeted E2E specs for the screens it touches. An up-front grep audits E2E selectors that match label text.
4. **Token naming:** the semantic names are kept and only values change. Keys are added where Graphite has more (shadow levels, pill radius, motion). Keys Graphite lacks are removed. The plan lists both in `tailwind.config.*`.
5. **Fonts:** `font-sans` = Plus Jakarta Sans and `font-mono` = JetBrains Mono. `font-display` and `font-text` are removed and their use sites are moved; the guard forbids both names. The plan confirms what `font-text` maps to today before moving it.
6. **Small-caps:** the plan reads the Graphite study and follows it. Wherever the study does not use small-caps, the treatment goes at the primitive level and the tracking literal is banned. The plan also checks whether any label is uppercased in its source string.
7. **Sweep guard:** `uiTokenGuard` gains a deny-list over `src/` covering Fraunces, Instrument Sans, `folio` module paths and names, the small-caps tracking literal, the proof-plate and crop-mark classes, and the hard offset shadow literal.
8. **Helpers:** fold them into one `src/components/ui/` module under a neutral name. A feature-local module stays only if it holds feature-only atoms, and the plan names them.
9. **Archive:** no archive copy of the Folio DESIGN_SYSTEM.md, since git history keeps it. The direction-study HTML files stay where they are.
10. **Contrast wins over the study.** If a study value fails the 011 thresholds, adjust the value and record the deviation in DESIGN_SYSTEM.md.
11. **Wordmark (user, 2026-10-18):** bring back `public/BistecStudioLogo.png` with its dark-mode treatment. This reverses Folio's typeset wordmark.
12. **Order (user, 2026-10-18):** 018, then 022, then 021, then 019 and 020. Because 019 and 020 come after 021, they are written once, in Graphite.
13. **Counts:** `grep -rli folio src | wc -l` gives 67 files. The remaining 13 of the ~80 are tests and docs.
