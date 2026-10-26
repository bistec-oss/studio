# Tasks: UI accessibility naming, shared page primitives and consistency pass

**Change:** 014-ui-a11y-consistency-pass
**Created:** 2026-10-09
**Total Tasks:** 18

## Summary

There are **18 tasks in 3 waves**, all on `v2`. **The full clean mock E2E runs 3 times, once per wave** (the user's decision, 2026-10-09).

| Wave | Content                                                                                                                                                                           | Tasks   | Full E2E                            |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------- |
| 1    | **B:** capture baseline, shared primitives, then one screen group per task; `StatusWord` fold; name guard                                                                         | T1–T8   | 1, plus the capture compare (AC-04) |
| 2    | **C, plus the A items it couples to:** the field-label style (with the brief kit select), control heights, brand kits (with the kit-list region), guard tokens and `tabular-nums` | T9–T12  | 1                                   |
| 3    | **A:** labels screen by screen (brief first), ARIA states, the axe scan and close-out                                                                                             | T13–T18 | 1                                   |

**Per task:**

- `npm run lint` (0 errors), `npm run test:unit` and `npx tsc --noEmit -p .`;
- the task's own new E2E block may be run alone (`npx playwright test tests/e2e/a11y.test.ts -g "<block>"`) against a running test server, but that does not replace the wave run;
- each task is one commit, implemented by a subagent, reviewed by `specclaw:code-reviewer`, and committed by the orchestrator.

**Per wave:**

- stop stray node processes, `rm -rf .next`, drop and recreate the test DB, then `npm run test:e2e:serve` and `npm run test:e2e:mock`;
- the result must be **0 failed and 0 flaky**, with no pre-existing case changing outcome (NFR-02, AC-21);
- push `v2` after the wave passes.

**Run tasks one at a time,** even inside a wave: lint-staged stashes.

**Wave 1 edits nothing under `tests/e2e/`** (FR-04). An E2E selector change in a B task is a defect, not a fix.

## Tasks

### Wave 1 — B: shared page primitives

- [x] `T1` — Capture compare script and the `before` baseline
  - Files: `scripts/compare-captures.mjs` (new)
  - Estimate: small
  - Kind: config
  - Notes:
    - **Covers:** AC-04 (setup).
    - **The script:** as in `design.md` §7. It decodes with `sharp`, compares every pixel exactly, writes a diff PNG per differing shot, prints identical/different/total, and takes `--expect <glob>` plus `<before>/../noise.txt`.
      - It exits 1 if a differing shot is neither expected nor noise.
      - It fails with a clear message if `sharp` won't load.
    - **The baseline, before any `src/` change:** recreate the test DB, `rm -rf .next`, then `test:e2e:serve`.
      - Capture `ui-captures/014-warmup`, then `ui-captures/014-before`.
      - Compare warm-up against `before`, and write each differing shot's name to `ui-captures/014-noise.txt`.
      - **Do not recreate the DB again until the wave-1 gate.** `ui-captures/` is gitignored.
    - **The report records:** the commit SHA of the baseline, the shot count (58 expected) and the noise list.

- [x] `T2` — Shared primitives in `src/components/ui/`, with no consumer
  - Files: `src/components/ui/folio.ts`, `PageHead.tsx`, `SectionHead.tsx`, `Notice.tsx`, `FieldLabel.tsx` (all new), `src/components/ui/StatusChip.tsx`, `src/components/ui/index.ts`, `tests/unit/uiPrimitives.test.ts` (new)
  - Estimate: medium
  - Kind: impl
  - Depends: T1
  - Notes:
    - **Covers:** FR-01, FR-03 (the chip side). **ACs:** AC-01.
    - **Contracts:** exactly `design.md` §2. **No primitive has an outer margin.**
    - **`ui/folio.ts` strings are copied byte for byte** from today's majority copies (spec "The copies B replaces"):
      - `SMALL_CAPS` without colour, and `EYEBROW` = `SMALL_CAPS text-fg-muted`;
      - `SUB_HEAD` with `leading-snug text-fg`;
      - `PAGE_TITLE` **without** `mt-2`.
    - **`FieldLabel`:** classes `EYEBROW block`, with `htmlFor`, `id` and `as`. The brief copy stays until T4.
    - **`StatusChip`:** add the `tone` + children union, plus `flex-shrink-0 whitespace-nowrap`. The `status` path renders the same class set as today, plus those two utilities.
    - **Unit tests** use `react-dom/server` `renderToStaticMarkup` in a `.test.ts` file (`React.createElement`, no JSX). If a `.tsx` import fails under vitest, add `esbuild: { jsx: 'automatic' }` to `vitest.config.ts`, and change nothing else there.
    - Run `uiTokenGuard` and `designTokens` to confirm they are still green.

- [x] `T3` — Dashboard, library, the brief page head, choose-team and the shell onto the primitives
  - Files: `src/app/(app)/page.tsx`, `src/app/(app)/library/page.tsx`, `src/app/(app)/brief/page.tsx`, `src/app/(app)/choose-team/page.tsx`, `src/components/layout/AppShell.tsx`, `src/components/dashboard/RecentDraftsCard.tsx`
  - Estimate: small
  - Kind: refactor
  - Depends: T2
  - Notes:
    - **Covers:** FR-02 (copies #1–#3 and the inline atoms), FR-04.
    - **Page heads:**
      - the dashboard, library and brief inline `EYEBROW`/`PAGE_TITLE` go;
      - dashboard → `PageHead className="mb-8"`;
      - library → `PageHead` with the search box in `actions`, `className="mb-8"`;
      - brief → `PageHead className="mb-10"`;
      - choose-team → `PageTitle` (its `text-ui-base` lead stays local).
    - **The dashboard's Activity `h2` and the Recent Drafts `h2`** use `SECTION_HEAD` from ui, keeping their own row classes.
    - **`RecentDraftsCard`:**
      - its local `FOCUS` becomes `` `${FOCUS} rounded-ui-sm` `` (the class set is identical);
      - its `TEXT_LINK` and table-head literal come from ui.
    - **`AppShell`:** the `:142` literal → `EYEBROW`; the local `ICON_BUTTON` is renamed `SHELL_ICON_BUTTON` (same value).
    - **Heading levels as in `design.md` §3.** No file under `tests/` changes.

- [x] `T4` — Brief wizard onto the primitives
  - Files: `src/components/brief/cardCls.ts`, `StepHead.tsx`, `Stepper.tsx`, `ContentStep.tsx`, `SizeDesignStep.tsx`, `ReviewStep.tsx`, `ReviewRow.tsx`, `CampaignStep.tsx`, `CampaignRow.tsx`, `ImagesStep.tsx`, `TemplateCard.tsx`; delete `src/components/brief/FieldLabel.tsx`
  - Estimate: medium
  - Kind: refactor
  - Depends: T3
  - Notes:
    - **Covers:** FR-02 (copy #4), FR-04.
    - **`cardCls.ts`** keeps only `cardCls` and `rowCls`. They import `FOCUS` from ui.
    - **Every former `SMALL_CAPS` use here relied on its baked-in `text-fg-muted`,** so each call site now uses `EYEBROW`, or `SMALL_CAPS` plus the colour it actually shows (for example `ContentStep:102`'s `text-accent`).
    - **`StepHead` stays** (bespoke) but builds from `SECTION_NUMERAL`, `SECTION_HEAD` and `PAGE_LEAD`-equivalent strings from ui, keeping its own `flex items-baseline gap-3.5` row and `mt-2 mb-8` lead. **The values are unchanged.**
    - **`FieldLabel` imports switch to ui,** and the brief call sites pass `className="mb-2.5"`. They are still unassociated: A comes in T9 and T13.
    - **`ReviewStep` notices → `Notice`:** `warning` (`:93`), `error` (`:100`) and `info` (`:106`), with the same extra classes.
    - **`Stepper.tsx:52`'s literal → `SMALL_CAPS`.** `ContentStep`'s local `SCROLL_FOCUS` comes from ui.

- [x] `T5` — Draft page onto the primitives
  - Files: `src/app/(app)/drafts/[id]/page.tsx`, `src/components/drafts/CopyEditor.tsx`, `RefinementPanel.tsx`, `BackgroundNotice.tsx`, `NotAppliedCard.tsx`, `ElementEditPanel.tsx`; delete `src/components/drafts/folio.ts`, `src/components/drafts/SectionHead.tsx`
  - Estimate: medium
  - Kind: refactor
  - Depends: T4
  - Notes:
    - **Covers:** FR-02 (copy #5), FR-04.
    - **The heads:**
      - `h1` → `PageTitle className="mb-3 mt-2 break-words"`;
      - the eyebrow `p` keeps `SMALL_CAPS text-fg-muted` from ui;
      - "Revision History" `h2` takes ui `SUB_HEAD` (**D3**, expected drift);
      - Copy and Refine Design → ui `SectionHead className="mb-3"` (**D1**, expected drift at 375 px).
    - **`SECTION` (`pt-[22px] pb-1.5`)** is used only here. Inline it at its call sites; it is not in the FR-05 list, but there is no module left to hold it.
    - **Notices → `Notice`:**
      - `BackgroundNotice` (`warning`, keeping `role="status"`, `data-testid` and `data-reason`);
      - `NotAppliedCard` (`error`, keeping `role="alert"`);
      - `RefinementPanel:282` (`warning`);
      - `ElementEditPanel:181` (`warning`). **Keep its `text-ui-xs`**: B carries the class set as it is.

- [x] `T6` — Campaigns and projects onto the primitives
  - Files: `src/app/(app)/campaigns/page.tsx`, `campaigns/[id]/page.tsx`, `projects/page.tsx`, `projects/[id]/page.tsx`, `src/components/campaigns/folio.ts`, `BriefingAssistantPanel.tsx`, `CampaignBriefingSection.tsx`, `ScheduledQueueSection.tsx`, `QueueEntryModal.tsx`; delete `src/components/campaigns/SectionHead.tsx`
  - Estimate: medium
  - Kind: refactor
  - Depends: T5
  - Notes:
    - **Covers:** FR-02 (copy #6), FR-04.
    - **`campaigns/folio.ts`** keeps `ROW_TITLE`, `CRUMB_LINK`, `CRUMB_CURRENT` and `ASIDE_BLOCK`. Everything else comes from ui.
    - **`ASIDE_HEAD` call sites** → `` `${EYEBROW} mb-3` ``.
    - **The heads:**
      - list pages → `PageHead className="mb-8"` with the buttons in `actions`;
      - detail pages → `PageTitle className="mb-10 break-words"`;
      - Briefing and Planned Posts → `SectionHead className="mb-3"` (the same `gap-y-2` row);
      - the campaigns group head and the projects/[id] head stay bespoke, with ui strings.

- [x] `T7` — Brand kits onto the primitives
  - Files: `src/app/(app)/admin/brandkits/page.tsx`, `src/components/admin/brandkits/folio.ts`, `shared.tsx`, `KitDetail.tsx`, `PromptSection.tsx`, `BrandKitAssistantPanel.tsx`, `ColorEditor.tsx`, `FontEditor.tsx`
  - Estimate: medium
  - Kind: refactor
  - Depends: T6
  - Notes:
    - **Covers:** FR-02 (copy #7), FR-04.
    - **`brandkits/folio.ts`** keeps `rowCls`, `optionCls`, `CODE_FIELD` and `TITLE_FIELD`. **`FIELD_LABEL`, `KIT_TITLE` and the h3-style `SECTION_HEAD` are removed.**
    - **`SectionHeader` (`shared.tsx`) is deleted.** Its 6 uses become `SectionHead level={3} className="mb-3"`, with `action` passed as children (**D2**: tail `gap-x` 12 → 14 px plus `text-ui-xs`, expected drift).
    - **The kit name `h2`** keeps its own flex row, with ui `SECTION_HEAD`. The page head → `PageHead className="mb-8"` with Add Kit in `actions`.

- [x] `T8` — Team, settings and admin onto the primitives; `StatusWord` folded; name guard; docs
  - Files: `src/app/(app)/team/page.tsx`, `settings/page.tsx`, `admin/users/page.tsx`, `admin/teams/page.tsx`, `admin/layout.tsx`, `src/components/team/folio.tsx`, `ApiKeysCard.tsx`, `TeamClaudeTokenCard.tsx`, `src/components/settings/ClaudeTokenCard.tsx`, `ClaudeTokenPrompt.tsx`, `OpenAiKeyCard.tsx`, `ChangePasswordCard.tsx`, `ClaudeConnectGuide.tsx`, `tests/unit/uiTokenGuard.test.ts`, `docs/ui-reference/DESIGN_SYSTEM.md`
  - Estimate: medium
  - Kind: refactor
  - Depends: T7
  - Notes:
    - **Covers:** FR-02 (copy #8), FR-03, FR-04, FR-05, FR-20 (§8.18, §8.5). **ACs:** AC-02, AC-03.
    - **`team/folio.tsx`** keeps `BLOCK`, `ROW` and `GateNotice`, which uses ui `SECTION_HEAD` and `TEXT_LINK`.
    - **`PageHead` callers pass `className="mb-8"`**, the margin the old team `PageHead` had built in.
    - **`GROUP_HEAD` → `EYEBROW`.**
    - **The 15 `StatusWord` uses → `<StatusChip tone=…>`.**
    - **Notices:**
      - `WARN_NOTICE` uses → `Notice tone="warning"`;
      - the two `bg-surface text-line` notices → `Notice tone="neutral"`. This is the T12 NOTE fix. It is a pixel no-op only because every child sets its own colour, so check that in the diff.
    - **The FR-05 name guard and its self-test** go into `uiTokenGuard.test.ts`: `design.md` §5.
    - **`DESIGN_SYSTEM.md`:**
      - new §8.18 "Page primitives": props, the use rule, the no-outer-margin rule, the residue rule;
      - §8.5 gets the `tone` variant.
    - **Wave-1 gate, after this task:**
      1. The full clean E2E, with the **same DB as T1**: do not recreate it before the capture. Run the capture first, then recreate for the E2E.
      2. `ui-captures/014-after`, then `node scripts/compare-captures.mjs ui-captures/014-before ui-captures/014-after ui-captures/014-diff --expect "draft-*" --expect "brandkits-*"`.
      3. `git diff <T1 SHA>..HEAD -- tests/e2e` must be empty (AC-04).
      4. The report crops every differing shot.

### Wave 2 — C, plus the A items it couples to

- [x] `T9` — One field-label style; the brief kit select; the queue and template labels; test helpers
  - Files: `src/components/ui/Input.tsx`, `Select.tsx`, `src/components/library/PublishDialog.tsx`, `src/components/campaigns/QueueEntryModal.tsx`, `src/components/admin/brandkits/KitDetail.tsx`, `src/components/drafts/ElementEditPanel.tsx`, `src/components/brief/SizeDesignStep.tsx`, `tests/helpers/ui.ts` (new), `tests/e2e/surfaces.test.ts`, `tests/e2e/a11y.test.ts` (new), `docs/ui-reference/DESIGN_SYSTEM.md`
  - Estimate: medium
  - Kind: impl
  - Depends: T8
  - Notes:
    - **Covers:** FR-06; FR-12 rows **6, 14, 21, 22**. **ACs:** AC-05; AC-11 for those rows.
    - **`Input`/`Select`** render `label` via `<FieldLabel htmlFor={id}>`. `fieldLabelClasses` is deleted, and every call site becomes `FieldLabel`:
      - `PublishDialog:107`, `QueueEntryModal:171/189/201` and `KitDetail:441` → `as="span"`;
      - `QueueEntryModal:153` (Post specifics) → `htmlFor` its textarea;
      - `QueueEntryModal:215` (Template) → `<Select label="Template">`;
      - `KitDetail:463` → `htmlFor` the HTML/CSS textarea;
      - `ElementEditPanel:79` `LABEL` → `FieldLabel`.
    - **The brief kit select is this task's alone:** `SizeDesignStep:94-95` → `<Select label="Brand Kit" …>`, and its separate `FieldLabel` is removed.
    - **Tests:**
      - move the helpers in `design.md` §6 to `tests/helpers/ui.ts`, as a pure move, and switch `surfaces.test.ts` to import them;
      - **`surfaces.test.ts:615`** → `getByRole('combobox', { name: 'Brand Kit' })`;
      - `a11y.test.ts` gets the AC-05 block and the AC-11 cases for rows 6, 14, 21 and 22.
    - **This is a visible change:** every field label becomes small caps (A3). `DESIGN_SYSTEM.md` §8.3 gets the field-label rule.

- [x] `T10` — One control height per size, from tokens
  - Files: `src/app/globals.css`, `tailwind.config.ts`, `src/components/ui/Button.tsx`, `Input.tsx`, `Select.tsx`, `ui/folio.ts`, `src/components/layout/AppShell.tsx`, `src/app/(app)/page.tsx`, `src/app/(app)/library/page.tsx`, `src/components/brief/ContentStep.tsx`, `ImagesStep.tsx`, `src/components/admin/brandkits/FontEditor.tsx`, `src/components/library/PostCard.tsx`, `src/components/drafts/ElementEditPanel.tsx`, `tests/unit/designTokens.test.ts`, `tests/e2e/a11y.test.ts`, `docs/ui-reference/DESIGN_SYSTEM.md`
  - Estimate: medium
  - Kind: impl
  - Depends: T9
  - Notes:
    - **Covers:** FR-07, FR-20 (§6, §8.2, §8.3). **ACs:** AC-06.
    - **Tokens and Tailwind:** `design.md` §4.
    - **`Input.tsx`:** add `inputClasses` (single-line, `h-control-md px-3.5`). `fieldClasses` stays for textareas.
    - **Switch the three raw single-line inputs** to `inputClasses`: library search, brief topic and font search.
    - **`COMPACT_FIELD` → `h-control-sm`** in place of `py-1.5`. `ICON_BUTTON` → `h-control-sm w-control-sm`.
    - **Replace the literals:**
      - `SHELL_ICON_BUTTON` `h-9 w-9` and the dashboard `QuickAction` `h-9` → md;
      - `ImagesStep:61` and `PostCard:160` → sm;
      - `ElementEditPanel:382` `h-9` → md.
    - **Leave alone:** textareas, `CODE_FIELD`, `TITLE_FIELD`, the prompt fields and the library skeleton bar.
    - **DESIGN_SYSTEM:** §6, §8.2 and §8.3 name `--control-*` as the source.

- [x] `T11` — Brand kits: labels, the kit-list cap and region, read-once swatches, one accent primary
  - Files: `src/app/(app)/admin/brandkits/page.tsx`, `src/components/admin/brandkits/shared.tsx`, `ColorEditor.tsx`, `FontEditor.tsx`, `PromptSection.tsx`, `BrandKitAssistantPanel.tsx`, `KitDetail.tsx`, `tests/e2e/surfaces.test.ts`, `tests/e2e/a11y.test.ts`, `docs/ui-reference/DESIGN_SYSTEM.md`
  - Estimate: medium
  - Kind: impl
  - Depends: T10
  - Notes:
    - **Covers:** FR-08, FR-09; FR-12 rows **12, 13, 15, 16, 17**; FR-16 (swatches); FR-17 (the kit-list region); FR-20 (the §8.2 reading). **ACs:** AC-07, AC-08, AC-15 (kit part), AC-11 for those rows.
    - **This is the A+C coupling the user named:** the cap (C) and its region (A) land together.
    - **The kit list:** `max-h-[32rem] overflow-y-auto`, `tabIndex={0}`, `role="region"`, `aria-label="Brand kits"`, `SCROLL_FOCUS`.
    - **`ColorSwatch decorative`** → `aria-hidden="true"`, passed on the kit-row only.
    - **`KitDetail:473` Save template and `PromptSection:177` Save as new version → `variant="ink"`.**
    - **Labels** per the FR-12 table, all `FieldLabel htmlFor`, with placeholders unchanged.
    - **E2E edits:**
      - **`surfaces.test.ts:1044-1047`**: the brand-kit AC-17 stops become `['Add Kit', 'Brand kits', <first kit row>]`, because the region is now a stop;
      - **`:1006-1009`**: the `kitRow` comment no longer says the swatch titles follow the name.

      List both in the report as 014 superseding 011 expectations.

- [x] `T12` — Guard tokens and body `tabular-nums`
  - Files: `tests/unit/uiTokenGuard.test.ts`, `src/components/ui/Modal.tsx`, `src/app/globals.css`, `tests/unit/designTokens.test.ts`, `tests/e2e/a11y.test.ts`, `docs/ui-reference/DESIGN_SYSTEM.md`
  - Estimate: small
  - Kind: impl
  - Depends: T11
  - Notes:
    - **Covers:** FR-10, FR-11, FR-20 (§11). **ACs:** AC-09, AC-10.
    - **Patterns:** `design.md` §5, with the AC-10 positive and negative self-test lines.
    - **`Modal.tsx:84`** is reworded in **this** commit ("not the old scale-in keyframe"), so the tree scan is green. It is the only current occurrence.
    - **`globals.css` body:** add `font-variant-numeric: tabular-nums;`.
    - **Wave-2 gate after this task:** the full clean E2E, 0 failed and 0 flaky.

### Wave 3 — A: accessibility naming

- [x] `T13` — Login, library and brief labels; the login `h1`
  - Files: `src/app/(auth)/login/page.tsx`, `src/app/(app)/library/page.tsx`, `src/components/brief/ContentStep.tsx`, `tests/e2e/a11y.test.ts`
  - Estimate: small
  - Kind: impl
  - Depends: T12
  - Notes:
    - **Covers:** FR-12 rows **1–5**, FR-14. **ACs:** AC-11 for those rows, AC-13.
    - **Brief first** (party-po).
    - **Login:** `Input label="Username"` and `label="Password"` (the names are unchanged), plus `<h1 className="sr-only">Sign in to Studio</h1>`.
    - **Library:** `FieldLabel htmlFor` "Search by topic" in the `PageHead` `actions` slot. **The 011 AC-17 helper still reads the placeholder,** so `surfaces.test.ts:469` is unchanged.
    - **Brief:** "Topic" and "Brief" get `htmlFor`.

- [x] `T14` — Campaigns and projects labels
  - Files: `src/app/(app)/campaigns/[id]/page.tsx`, `src/app/(app)/projects/[id]/page.tsx`, `src/components/campaigns/BriefingAssistantPanel.tsx`, `CampaignBriefingSection.tsx`, `tests/e2e/a11y.test.ts`
  - Estimate: small
  - Kind: impl
  - Depends: T13
  - Notes:
    - **Covers:** FR-12 rows **18, 19, 20, 23, 24, 25**. **ACs:** AC-11 for those rows.
    - **Rows 23–25:** give the `dt` an `id` (`useId`) and pass `aria-labelledby` to the `Select`. `Select` passes extra props through to `<select>`. The `dt` keeps its spinner icon, which is `aria-hidden`.
    - **Row 18:** `aria-label="Post topic"` (A6).
    - **Rows 19 and 20:** `FieldLabel htmlFor`.
    - **`surfaces.test.ts:875/897`** (combobox counts) are unaffected.

- [x] `T15` — Draft page labels
  - Files: `src/components/drafts/CopyEditor.tsx`, `src/components/drafts/RefinementPanel.tsx`, `tests/e2e/a11y.test.ts`
  - Estimate: small
  - Kind: impl
  - Depends: T14
  - Notes:
    - **Covers:** FR-12 rows **26, 27**. **ACs:** AC-11 for those rows.
    - **Pass `id`** (`useId`) to `SectionHead` for "Copy" and "Refine Design", and `aria-labelledby` on the caption textarea and the refine input. There is no visual change.
    - **012 rebuilds `CopyEditor` later.** Keep this edit to the two attributes.

- [x] `T16` — Team labels and the provider On/Off word
  - Files: `src/app/(app)/team/page.tsx`, `tests/e2e/a11y.test.ts`
  - Estimate: small
  - Kind: impl
  - Depends: T15
  - Notes:
    - **Covers:** FR-12 rows **7–11**, FR-19. **ACs:** AC-11 for those rows, AC-18.
    - **Rows 7 and 10:** `FieldLabel htmlFor` **above** the `relative` wrapper that holds the eye button, with `id` passed to `Input`. That keeps the eye button centred on the field (spec Edge Cases).
    - **Rows 8, 9 and 11:** `Input label`.
    - **The On/Off word** sits beside the toggle button, outside it, `aria-hidden`, `SMALL_CAPS`: `text-accent` "On", `text-fg-muted` "Off".
    - **E2E:** scope each channel's "Access token" to its row, and use `{ exact: true }`, because "Show API key" would otherwise match `getByLabel('API key')`.

- [x] `T17` — ARIA states: named tablists, stepper, breadcrumb tail, static scroll regions, the Discard target
  - Files: `src/components/ui/SegmentedToggle.tsx`, `src/app/(app)/library/page.tsx`, `src/app/(app)/team/page.tsx`, `src/components/admin/brandkits/PromptSection.tsx`, `src/components/campaigns/CampaignBriefingSection.tsx`, `QueueEntryModal.tsx`, `src/components/drafts/InlineEditModal.tsx`, `src/components/brief/Stepper.tsx`, `src/app/(app)/campaigns/[id]/page.tsx`, `src/app/(app)/projects/[id]/page.tsx`, `src/components/admin/brandkits/BrandKitAssistantPanel.tsx`, `src/components/campaigns/BriefingAssistantPanel.tsx`, `src/components/drafts/RefinementPanel.tsx`, `src/components/dashboard/RecentDraftsCard.tsx`, `tests/e2e/surfaces.test.ts`, `tests/e2e/a11y.test.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T16
  - Notes:
    - **Covers:** FR-13, FR-15, FR-16 (breadcrumb), FR-17, FR-18. **ACs:** AC-12, AC-14, AC-15 (breadcrumb part), AC-16, AC-17.
    - **`SegmentedToggle`:** a required `label` → `aria-label`, with the 7 names from FR-13. `tsc` proves every call site passes one.
    - **The stepper:**
      - **first** grep `tests/e2e` for any click on a step that isn't done (Playwright won't click an `aria-disabled` element);
      - then add `aria-disabled={!done && !active || undefined}`;
      - **edit `surfaces.test.ts:585-594` only**, adding the AC-14 expectations. Report it as superseding 011 AC-17 for the stepper; 011's spec is not edited.
    - **The breadcrumb tail:** `aria-hidden="true"`, with `aria-current` removed, at `campaigns/[id]:138` and `projects/[id]:82`. **Edit `surfaces.test.ts:891`** to the AC-15 assertions.
    - **Regions:** drop the `messages.length > 0 ? {…} : {}` spreads at `BrandKitAssistantPanel:252`, `BriefingAssistantPanel:300` and `RefinementPanel:219`. The attributes become unconditional.
    - **Discard:** `inline-flex h-6 w-6 items-center justify-center` (24 × 24).

- [x] `T18` — The axe scan and close-out
  - Files: `package.json`, `package-lock.json`, `tests/e2e/a11y.test.ts`, `docs/ui-reference/DESIGN_SYSTEM.md`
  - Estimate: medium
  - Kind: test
  - Depends: T17
  - Notes:
    - **Covers:** A4, FR-20 (§1, §8.15, §8.17 no "More" menu, §9). **ACs:** AC-19, AC-20, AC-21.
    - **`axe-core`:** declare it as a devDependency at the lockfile's version (4.12.1). Only the root dependency entry changes; no new download. **The user can veto this (A4)**, in which case skip AC-19 and record that.
    - **The scan:** `design.md` §6, on the AC-19 routes and rules. **If a listed rule reports a violation outside FR-12 to FR-19, stop and report it.** Do not drop the rule, and do not fix unrelated screens silently.
    - **`DESIGN_SYSTEM.md`:**
      - §1 gets the 2026-10-09 decision rows;
      - §8.15 gets the static rule and its exemptions;
      - §9 gets labels, named tablists, `aria-disabled` steps and the 24 px box.
    - **Wave-3 gate after this task:** the full clean E2E, 0 failed and 0 flaky, plus `npm run build`, `npm run test:render` (15/15) and `tsc` (AC-21).

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
- `[>]` Deferred — correctly blocked on a sibling change, not incomplete through any fault of its own; excluded from the incomplete-task count that gates `verify`

**Task format:**

```
- [ ] `T<n>` — <title>
  - Files: <files to create/modify>
  - Estimate: small | medium | large
  - Kind: docs | test | config | refactor | impl | migration   (optional; hints the build subagent's role, tools, and model)
  - Depends: <task ids> (if any)
  - Notes: <additional context>
  - Deferred-Reason: <why this can't be built yet>            (required when marker is `[>]`)
  - Deferred-Blocked-On: <sibling change name, if known>      (optional; free text, not a structured link)
```
