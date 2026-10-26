# Design: UI accessibility naming, shared page primitives and consistency pass

**Change:** 014-ui-a11y-consistency-pass
**Created:** 2026-10-09

## Technical Approach

The change runs in three waves, in this order:

1. **Wave 1: B, the primitives (8 tasks).**
   - T1 sets up the capture comparison and takes the `before` baseline.
   - T2 adds the primitives to `src/components/ui/`, with no consumer.
   - T3–T8 move one screen group each onto them, byte for byte, and delete or reduce that group's local module.
   - The wave ends with the FR-05 name guard, one full E2E and the pixel compare.
2. **Wave 2: C, plus the A items that couple to it (4 tasks).**
   - The field-label style (with the brief kit select);
   - control heights;
   - brand kits: labels, the list cap and region, swatches and the one primary;
   - the guard tokens with body `tabular-nums`.
   - One full E2E.
3. **Wave 3: A, the naming (6 tasks).**
   - Labels screen by screen, brief first;
   - the ARIA states;
   - the axe scan.
   - One full E2E.

C goes before A on purpose: once FR-06 lands, every label that A adds is already the final `FieldLabel` style, so no label is restyled twice.

**No data, API or behaviour change.** Every edit is in `src/components/**`, `src/app/(app)/**` pages, `src/app/(auth)/login`, `src/app/globals.css`, `tailwind.config.ts`, the tests, `scripts/compare-captures.mjs` and `DESIGN_SYSTEM.md`.

## Architecture

### 1. Module layout after 014

```
src/components/ui/
  folio.ts          class strings (FR-01 list): the only definitions of the shared atoms
  PageHead.tsx      PageHead, PageTitle
  SectionHead.tsx   SectionHead
  Notice.tsx        Notice
  FieldLabel.tsx    FieldLabel  (moved from components/brief/)
  StatusChip.tsx    + tone/children variant (StatusWord folded in)
  Input.tsx         label → FieldLabel; fieldLabelClasses removed (wave 2); single-line height token
  Select.tsx        label → FieldLabel (wave 2); height token
  Button.tsx        sizeClasses → h-control-* (wave 2)
  SegmentedToggle.tsx  required `label` → aria-label on the tablist (wave 3)
  index.ts          exports all of the above

src/components/brief/cardCls.ts            cardCls, rowCls only
src/components/brief/StepHead.tsx          stays (bespoke: step numeral + lead), built from ui atoms
src/components/campaigns/folio.ts          ROW_TITLE, CRUMB_LINK, CRUMB_CURRENT, ASIDE_BLOCK
src/components/admin/brandkits/folio.ts    rowCls, optionCls, CODE_FIELD, TITLE_FIELD
src/components/admin/brandkits/shared.tsx  ColorSwatch (+ decorative)
src/components/team/folio.tsx              BLOCK, ROW, GateNotice
(deleted) drafts/folio.ts, drafts/SectionHead.tsx, campaigns/SectionHead.tsx, brief/FieldLabel.tsx
```

`ui/folio.ts` has no `'use client'` and no hooks. `PageHead`, `PageTitle`, `SectionHead`, `Notice` and `FieldLabel` are hook-free too, so server components (the dashboard and the admin layout's `GateNotice`) can import them. That is the `team/folio.tsx` property T12 relied on.

### 2. Component contracts (the 012-facing API, NFR-06)

```ts
// PageHead.tsx
export function PageHead(props: {
  eyebrow?: React.ReactNode // EYEBROW div, above the title
  title: React.ReactNode // <h1 className={PAGE_TITLE}> (+ 'mt-2' when eyebrow is set)
  lead?: React.ReactNode // <p className={PAGE_LEAD}>
  actions?: React.ReactNode // right slot: 'flex flex-wrap items-center gap-2'; actionsClassName adds to it: the library passes min-w-0 so its fixed-width search can shrink at md, while a plain button must not shrink or it overflows its column (T3/T8 reviews)
  className?: string // outer spacing only (mb-8 / mb-10)
}): JSX.Element
// root: 'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'; text column 'min-w-0'

export function PageTitle(props: { children: React.ReactNode; className?: string }): JSX.Element
// <h1 className={cn(PAGE_TITLE, className)}>

// SectionHead.tsx
export function SectionHead(props: {
  title: React.ReactNode
  numeral?: string // <span aria-hidden className={SECTION_NUMERAL}>
  level?: 2 | 3 // 2 → <h2 className={SECTION_HEAD}>, 3 → <h3 className={SUB_HEAD}>
  id?: string // on the heading (aria-labelledby target, FR-12 rows 26–27)
  className?: string // outer spacing only
  children?: React.ReactNode // tail
}): JSX.Element
// row: 'flex flex-wrap items-baseline gap-x-3.5 gap-y-2'
// tail: 'ml-auto flex flex-wrap items-center justify-end gap-x-3.5 gap-y-1 text-ui-xs'

// Notice.tsx
type NoticeTone = 'warning' | 'error' | 'info' | 'neutral'
export function Notice(
  props: {
    tone: NoticeTone
    icon?: React.ReactNode
    className?: string
    children: React.ReactNode
  } & React.HTMLAttributes<HTMLDivElement>,
): JSX.Element // role, data-*, aria-* pass through; no default role
// classes: NOTICE + TONE[tone] + className
//   warning: 'bg-status-scheduled/10 text-status-scheduled'
//   error:   'bg-status-failed/10 text-status-failed'
//   info:    'bg-accent/10 text-accent'
//   neutral: 'bg-surface text-fg shadow-[inset_0_0_0_1px_rgb(var(--line))]'   (T12 NOTE fix)
// With `icon`: 'flex items-start gap-2' row, icon then a 'min-w-0 flex-1' body. Without it: children as-is.

// FieldLabel.tsx
export function FieldLabel(props: {
  htmlFor?: string
  id?: string
  as?: 'label' | 'span' // default 'label'
  className?: string
  children: React.ReactNode
}): JSX.Element
// classes: EYEBROW + ' block'  (spacing from the caller or the Input/Select wrapper)

// StatusChip.tsx
type StatusChipProps =
  | { status: PostStatus; tone?: never; children?: never; className?: string }
  | {
      tone: 'published' | 'draft' | 'scheduled' | 'failed' | 'exported'
      children: React.ReactNode
      status?: never
      className?: string
    }
```

**The no-outer-margin rule.** Today the margins are baked in different places:

- `team/folio.tsx` `PageHead` has `mb-8`;
- every `SectionHead` copy has `mb-3`;
- the brief page head has `mb-10`.

The primitives drop all of them, and **the callers pass the margin.** That is what keeps wave 1 pixel-identical, and the page's own layout stays visible at the call site.

**`cn` is a plain join** (`src/lib/utils.ts`). A `className` that repeats a property the primitive already sets is settled by CSS source order, not by attribute order. Callers pass spacing only. B keeps every call site's class set the same, including today's `ElementEditPanel` `text-ui-xs`/`text-ui-sm` pair.

**The FieldLabel `block` class.**

- The brief `FieldLabel` today is `SMALL_CAPS(with muted) mb-2.5 block`.
- After the move, `mb-2.5` comes from the caller, so the brief call sites pass `className="mb-2.5"`.
- Inside `Input` and `Select` (wave 2), the existing wrapper `flex flex-col gap-1.5` sets the spacing.

### 3. Heading levels B must keep (FR-04)

| Screen                                      | Heading elements today (kept)                                                | B uses                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `/login`                                    | none (wave 3 adds a sr-only `h1`)                                            | —                                                                              |
| `/choose-team`                              | `h1` "Choose a team"                                                         | `PageTitle`                                                                    |
| `/` dashboard                               | `h1` Dashboard; `h2` Recent Drafts; `h2` Activity; `h2` in the no-team panel | `PageHead`; `SECTION_HEAD` strings for the two bespoke `h2`s                   |
| `/library`                                  | `h1` Library                                                                 | `PageHead` (search in `actions`)                                               |
| `/brief`                                    | `h1` New Brief; `h2` per step (`StepHead`)                                   | `PageHead` (`className="mb-10"`); `StepHead` on ui atoms                       |
| `/drafts/[id]`                              | `h1` topic; `h2` Revision History; `h2` Copy; `h2` Refine Design             | `PageTitle`; `SUB_HEAD` string on the `h2` (D3); `SectionHead` (D1)            |
| `/campaigns`, `/projects`                   | `h1`; group `h2`                                                             | `PageHead`; `SECTION_HEAD` string (bespoke group head with a link)             |
| `/campaigns/[id]`                           | `h1`; `h2` Campaign Briefing, Planned Posts (n); aside `h2`s                 | `PageTitle`; `SectionHead`; `EYEBROW` + `mb-3` on the aside `h2`s              |
| `/projects/[id]`                            | `h1`; `h2` Campaigns (n); aside `h2`                                         | `PageTitle`; bespoke row with `SECTION_NUMERAL`/`SECTION_HEAD`; `EYEBROW mb-3` |
| `/admin/brandkits`                          | `h1` Brand Kits; kit `h2`; section `h3`s                                     | `PageHead`; `SECTION_HEAD` on the kit `h2`; `SectionHead level={3}` (D2)       |
| `/team`                                     | `h1`; `h2` sections; `h3` "Register new provider"; `h3` group heads          | `PageHead`; `SectionHead`; `SUB_HEAD`; `EYEBROW` on the group `h3`s            |
| `/settings`, `/admin/users`, `/admin/teams` | `h1`; `h2` sections (`Members of …`)                                         | `PageHead`; `SectionHead`                                                      |
| admin gate                                  | `h1` (`GateNotice`)                                                          | `GateNotice` stays in `team/folio.tsx`, with `SECTION_HEAD` from ui            |

### 4. Control heights (FR-07)

```css
/* globals.css, :root (theme-independent, beside --radius-*) */
--control-sm: 30px;
--control-md: 36px;
--control-lg: 40px;
```

```ts
// tailwind.config.ts → theme.extend.spacing
'control-sm': 'var(--control-sm)', 'control-md': 'var(--control-md)', 'control-lg': 'var(--control-lg)',
```

- **`Input.tsx` split.**
  - `fieldClasses` keeps today's multi-line form (`px-3.5 py-2.5`) for textareas.
  - A new `inputClasses` is the same string with `h-control-md px-3.5` in place of the padding pair.
  - `Input` and `Select` use `inputClasses`.
  - The raw single-line inputs that use `fieldClasses` switch to `inputClasses`: `library/page.tsx:166`, `ContentStep.tsx:71` and `FontEditor.tsx:94`.
  - **`COMPACT_FIELD`** (in `ui/folio.ts` after wave 1) swaps `py-1.5` for `h-control-sm`.
- **Why this value.** The `<input>` inherits `line-height: 1.5` from preflight, so at `--text-base` with `py-2.5` it computes to 22.5 + 20 + 2 = 44.5 px, against the 36 px md button beside it. DESIGN_SYSTEM §6 already says 36.

### 5. Guards (FR-05, FR-11): additions to `tests/unit/uiTokenGuard.test.ts`

```ts
// FR-11, whole class tokens. B = start or one of \s " ' ` { ( :    E = end or one of \s " ' ` } ) ] /
const START = String.raw`(?:^|(?<=[\s"'\`{(:]))`
const END = String.raw`(?=$|[\s"'\`})\]/])`
['glow blob', new RegExp(`${START}glow-blob${END}`)],
['scale-in animation', new RegExp(`${START}animate-scale-in${END}`)],
['Inter font', new RegExp(`${START}font-inter${END}`)],
['legacy primary colour', new RegExp(
  `${START}(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline|placeholder|decoration|shadow)-primary(?:-[a-z]+)*${END}`)],

// FR-05, names (run on files outside src/components/ui/ only)
const SHARED = /^\s*(?:export\s+)?(?:const|function)\s+(FOCUS|SCROLL_FOCUS|SMALL_CAPS|EYEBROW|FIELD_LABEL|PAGE_TITLE|PAGE_LEAD|SECTION_HEAD|SECTION_NUMERAL|SUB_HEAD|KIT_TITLE|STEP_HEAD|STEP_NUMERAL|STEP_LEAD|GROUP_HEAD|ASIDE_HEAD|NOTICE|WARN_NOTICE|ICON|ICON_SM|ICON_BUTTON|TEXT_LINK|TAG|TABLE_HEAD_ROW|COMPACT_FIELD|PageHead|PageTitle|SectionHead|SectionHeader|Notice|FieldLabel|StatusWord)\b/
const SMALL_CAPS_LITERAL = /tracking-\[0\.14em\]/
```

- The `ui-exception:` opt-out applies to the FR-11 patterns, as it does today. It does **not** apply to the FR-05 name guard: a copy has no legitimate exception.
- Each new pattern gets a positive and a negative line in the self-test (AC-10, AC-02).

### 6. E2E structure

- **Wave 1 adds and edits no E2E file** (FR-04).
- **T9 moves** the helpers 014 needs from `surfaces.test.ts` into `tests/helpers/ui.ts`. That is a pure move with no assertion change: `pageLogin`, `tabThreeWithVisibleFocus`, `tabThreeFromMain`, `mintBrandKitFixture`, `mintCampaignFixture` and `expectNoHorizontalScroll`.
- **New file `tests/e2e/a11y.test.ts`.** Each wave 2 and 3 task adds its own `describe` block (one per FR), so a task's assertions land with its code. Wave-level runs include them.
- **The axe scan (AC-19):**

  ```ts
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') })
  const result = await page.evaluate(
    (rules) => (window as any).axe.run(document, { runOnly: { type: 'rule', values: rules } }),
    RULES,
  )
  expect(
    result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`),
  ).toEqual([])
  ```

  It runs once per route in the AC-19 list, at light 1440 px, after the page settles (`networkidle` and `document.fonts.ready`).

- **Fixtures** come from the moved helpers, plus an unfinished brief via `PUT /api/brief-drafts` (AC-17), a registered provider (AC-18) and a draft with no refine requests (AC-16).

### 7. The capture method (AC-04)

`scripts/capture-ui.mjs` exists and covers 2 themes × 2 widths × the 14 screens, plus login and the open mobile sidebar: 58 shots. It already hides the dev indicator. 014 adds only the comparison:

```
scripts/compare-captures.mjs <before-dir> <after-dir> <diff-dir> [--expect <glob>...]
  for each PNG in before: decode both with sharp (raw RGBA), compare every pixel exactly,
  count differing pixels, write a red-on-grey diff PNG for any shot with >0, and print
  "identical N, different M, total T", then one line per differing shot with its count.
  --expect marks shots as expected-drift; exit 1 if any differing shot is neither expected nor
  in <before-dir>/../noise.txt.
```

- **`sharp` 0.34.5** is installed as Next's own dependency. It is the same tool 011 T4 used for AC-08. The script fails with a clear message if it can't load sharp. It is a review tool, like `capture-ui.mjs`, and no gate imports it.
- **Procedure (T1, then the wave-1 gate):**
  1. Recreate the test DB, `rm -rf .next`, `npm run test:e2e:serve`.
  2. `node scripts/capture-ui.mjs --out ui-captures/014-warmup`.
  3. `node scripts/capture-ui.mjs --out ui-captures/014-before`.
  4. Compare warm-up against `before`. Every differing shot goes into `ui-captures/014-noise.txt`.
  5. Stop the server. _(T2–T8 happen here.)_
  6. At the wave-1 end, on the **same DB**: `rm -rf .next`, restart, `--out ui-captures/014-after`.
  7. Compare `before` against `after` with `--expect` for D1–D3: `draft-*`, and `brandkits-*` if the capture opens a kit.
  8. Crop and review every differing shot in the wave report.
- **Why the clock isn't frozen.** The relative times on the dashboard are formatted on the server (`relativeTime` in the page), so `page.clock` can't fix them. The noise set handles them instead.
- **Why the same DB.** The captures mint their own draft when none is visible, so a second recreate would change the content.

## File Changes Map

| File                                                                                                                                                                                                                            | Action | Description                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/compare-captures.mjs`                                                                                                                                                                                                  | Create | Pixel-exact capture compare (sharp), noise and expected sets (T1)                                                                                             |
| `src/components/ui/folio.ts`                                                                                                                                                                                                    | Create | Shared class strings (T2); `COMPACT_FIELD` and `ICON_BUTTON` heights to tokens (T10)                                                                          |
| `src/components/ui/PageHead.tsx`                                                                                                                                                                                                | Create | `PageHead`, `PageTitle` (T2)                                                                                                                                  |
| `src/components/ui/SectionHead.tsx`                                                                                                                                                                                             | Create | `SectionHead` (T2)                                                                                                                                            |
| `src/components/ui/Notice.tsx`                                                                                                                                                                                                  | Create | `Notice` (T2)                                                                                                                                                 |
| `src/components/ui/FieldLabel.tsx`                                                                                                                                                                                              | Create | Moved from `brief/FieldLabel.tsx`, plus `htmlFor`/`id`/`as` (T2)                                                                                              |
| `src/components/ui/StatusChip.tsx`                                                                                                                                                                                              | Modify | `tone` + children variant, `flex-shrink-0 whitespace-nowrap` (T2)                                                                                             |
| `src/components/ui/index.ts`                                                                                                                                                                                                    | Modify | Exports (T2)                                                                                                                                                  |
| `src/components/ui/Input.tsx`, `Select.tsx`                                                                                                                                                                                     | Modify | `label` → `FieldLabel`; `fieldLabelClasses` removed (T9); `inputClasses`, height token (T10)                                                                  |
| `src/components/ui/Button.tsx`                                                                                                                                                                                                  | Modify | `sizeClasses` → `h-control-*` (T10)                                                                                                                           |
| `src/components/ui/SegmentedToggle.tsx`                                                                                                                                                                                         | Modify | Required `label` → `aria-label` (T17)                                                                                                                         |
| `src/components/ui/Modal.tsx`                                                                                                                                                                                                   | Modify | Line 84 comment reworded (T12)                                                                                                                                |
| `src/app/(app)/page.tsx`, `library/page.tsx`, `brief/page.tsx`, `choose-team/page.tsx`                                                                                                                                          | Modify | Inline copies → primitives (T3); library search label (T13)                                                                                                   |
| `src/components/layout/AppShell.tsx`                                                                                                                                                                                            | Modify | Literal small caps → `EYEBROW`; `ICON_BUTTON` → `SHELL_ICON_BUTTON` (T3); height token (T10)                                                                  |
| `src/components/dashboard/RecentDraftsCard.tsx`                                                                                                                                                                                 | Modify | Atoms from ui, `SECTION_HEAD`, `TABLE_HEAD_ROW` (T3); Discard 24 × 24 (T17)                                                                                   |
| `src/components/brief/*` (`cardCls.ts`, `StepHead.tsx`, `Stepper.tsx`, `ContentStep.tsx`, `SizeDesignStep.tsx`, `ReviewStep.tsx`, `ReviewRow.tsx`, `CampaignStep.tsx`, `CampaignRow.tsx`, `ImagesStep.tsx`, `TemplateCard.tsx`) | Modify | Atoms and `FieldLabel` from ui, `Notice` (T4); kit select `label` (T9); `ImagesStep` height (T10); topic/brief `htmlFor` (T13); stepper `aria-disabled` (T17) |
| `src/components/brief/FieldLabel.tsx`                                                                                                                                                                                           | Delete | Moved to ui (T4)                                                                                                                                              |
| `src/app/(app)/drafts/[id]/page.tsx`, `src/components/drafts/*` (`CopyEditor`, `RefinementPanel`, `BackgroundNotice`, `NotAppliedCard`, `ElementEditPanel`, `InlineEditModal`)                                                  | Modify | Primitives (T5); `fieldLabelClasses` (T9); colour-well height (T10); `aria-labelledby` (T15); scroll region (T17); tablist name (T17)                         |
| `src/components/drafts/folio.ts`, `src/components/drafts/SectionHead.tsx`                                                                                                                                                       | Delete | (T5)                                                                                                                                                          |
| `src/app/(app)/campaigns/**`, `src/app/(app)/projects/**`, `src/components/campaigns/*`                                                                                                                                         | Modify | Primitives (T6); queue labels (T9); aside `aria-labelledby`, assistant and briefing labels (T14); breadcrumb tail, tablist names, region (T17)                |
| `src/components/campaigns/SectionHead.tsx`                                                                                                                                                                                      | Delete | (T6)                                                                                                                                                          |
| `src/components/campaigns/folio.ts`                                                                                                                                                                                             | Modify | Reduced to the screen-specific helpers (T6)                                                                                                                   |
| `src/app/(app)/admin/brandkits/page.tsx`, `src/components/admin/brandkits/*`                                                                                                                                                    | Modify | Primitives (T7); `fieldLabelClasses` (T9); labels, list cap and region, swatches, ink submits (T11); region and tablist (T17)                                 |
| `src/components/admin/brandkits/folio.ts`, `shared.tsx`                                                                                                                                                                         | Modify | Reduced (T7); `ColorSwatch decorative` (T11)                                                                                                                  |
| `src/app/(app)/team/page.tsx`, `settings/page.tsx`, `admin/users/page.tsx`, `admin/teams/page.tsx`, `admin/layout.tsx`, `src/components/settings/*`, `src/components/team/*`                                                    | Modify | Primitives, `StatusWord` → `StatusChip` (T8); team labels and On/Off (T16); tablist name (T17)                                                                |
| `src/components/team/folio.tsx`                                                                                                                                                                                                 | Modify | Reduced to `BLOCK`, `ROW`, `GateNotice` (T8)                                                                                                                  |
| `src/components/library/PublishDialog.tsx`, `PostCard.tsx`                                                                                                                                                                      | Modify | `FieldLabel` (T9); delete-button height token (T10)                                                                                                           |
| `src/app/(auth)/login/page.tsx`                                                                                                                                                                                                 | Modify | Labels, sr-only `h1` (T13)                                                                                                                                    |
| `src/app/globals.css`                                                                                                                                                                                                           | Modify | `--control-*` (T10); body `tabular-nums` (T12)                                                                                                                |
| `tailwind.config.ts`                                                                                                                                                                                                            | Modify | `spacing.control-*` (T10)                                                                                                                                     |
| `tests/unit/uiPrimitives.test.ts`                                                                                                                                                                                               | Create | AC-01 (T2)                                                                                                                                                    |
| `tests/unit/uiTokenGuard.test.ts`                                                                                                                                                                                               | Modify | FR-05 name guard (T8); FR-11 tokens (T12)                                                                                                                     |
| `tests/unit/designTokens.test.ts`                                                                                                                                                                                               | Modify | Control tokens (T10); `tabular-nums` (T12)                                                                                                                    |
| `tests/helpers/ui.ts`                                                                                                                                                                                                           | Create | Helpers moved out of `surfaces.test.ts` (T9)                                                                                                                  |
| `tests/e2e/surfaces.test.ts`                                                                                                                                                                                                    | Modify | Imports from the helpers (T9); `:615` (T9); `:1006-1009`, `:1044-1047` (T11); `:585-594`, `:891` (T17)                                                        |
| `tests/e2e/a11y.test.ts`                                                                                                                                                                                                        | Create | AC-05–AC-19 blocks, one per task, T9 onwards                                                                                                                  |
| `package.json`                                                                                                                                                                                                                  | Modify | `axe-core` devDependency at the lockfile's version (T18, A4)                                                                                                  |
| `docs/ui-reference/DESIGN_SYSTEM.md`                                                                                                                                                                                            | Modify | §8.18 and §8.5 (T8); §6, §8.2, §8.3 (T9–T11); §11 (T12); §8.15, §9, §1 (T18)                                                                                  |

## Data Model Changes

None.

## API Changes

None. No route, request or response changes (NFR-01).

## Key Decisions

1. **Components plus surviving class strings,** not components only. Six heads have a bespoke structure: a link inside the `h2`, inline marks in the kit title, the step numeral with a lead, the gate panel. Forcing them into `SectionHead` would mean more props or moved pixels. The guard (FR-05) makes `ui/folio.ts` the only place those strings are defined, which is the actual goal.
2. **Primitives own no outer margin.** This is what makes B a byte-for-byte move (AC-04), and it keeps page layout at the page.
3. **The field-label fix lives in the `Input`/`Select` primitives** (FR-06), not at about 25 call sites. That makes it one source, and A's labels inherit it.
4. **C before A.** Labels are added once, in their final style.
5. **The static scroll-region rule** (the user's decision). There is no `ResizeObserver` and no layout-dependent test. The cost is an extra tab stop on short regions, and dialog bodies are exempt for focus-order reasons.
6. **The breadcrumb tail is `aria-hidden`,** not removed. Nothing changes visually; the `h1` right beneath it carries the name. The APG breadcrumb's `aria-current` on the last item is given up in exchange for not reading the name twice. The sidebar keeps `aria-current="page"`, so the page is still identified.
7. **The provider On/Off word sits outside the button.** A visible "On" inside a button named "Enable X" would fail 2.5.3.
8. **`axe-core` through `addScriptTag`,** not `@axe-core/playwright`. It is already installed, and `runOnly` named rules keep the scan deterministic and scoped to what 014 fixes.
9. **The drift is unified at three points only (D1–D3)** and accepted in AC-04. Preserving them would need typography overrides through a plain-join `cn`, which is fragile.

## Risks & Mitigations

| Risk                                                                  | Mitigation                                                                                                                                                                                               |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A B task changes a name or role, and the per-wave E2E catches it late | FR-04: B touches no test file, so any red in the wave-1 run is a B defect by definition. Each B task's reviewer diffs the rendered heading tags (§3 table). `tsc` and unit run per task.                 |
| Five B tasks between E2E runs make a failure harder to bisect         | Each task is one screen group and one commit. On a red wave run, run the failing spec file at each task commit (`git bisect run` over the wave).                                                         |
| The pixel compare is noisy (dev indicator, times, toasts)             | The capture script already hides the dev indicator. The noise set comes from a warm-up-vs-`before` pair, every differing shot is cropped and reviewed, and the same DB is used for `before` and `after`. |
| Playwright `aria-disabled` actionability breaks a stepper click       | T17 greps `tests/e2e` for stepper clicks first. Only done steps are clicked today.                                                                                                                       |
| `renderToStaticMarkup` of `.tsx` in vitest's node env                 | The primitives are hook-free. The fallback is `esbuild: { jsx: 'automatic' }` in `vitest.config.ts` (spec Edge Cases).                                                                                   |
| New tab stops (kit list, empty regions) move existing AC-17 lists     | Only `surfaces.test.ts:1044-1047` moves, and it is edited in T11 and listed. Other regions sit after the first three stops.                                                                              |
| An axe rule finds a violation outside the inventory                   | AC-19's rule: stop and report, never drop the rule. The rule list leaves out `nested-interactive`, a known pre-existing issue.                                                                           |
| Control-height change crowds rows at 375 px                           | The 011 AC-12 no-horizontal-scroll checks run in every wave. Heights only shrink (44.5 → 36, 34 → 30), except Discard (15 → 24).                                                                         |
| 012 starts before wave 1 is done                                      | The roadmap order is 014 wave 1, then 012. The FR-01 contract is fixed in this design (§2).                                                                                                              |
| `sharp` disappears from `node_modules` (a Next upgrade)               | `compare-captures.mjs` is a review tool and fails loudly. AC-04's first check (E2E, no test edits) still stands.                                                                                         |
