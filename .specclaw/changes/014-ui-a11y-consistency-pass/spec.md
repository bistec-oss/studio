# Spec: UI accessibility naming, shared page primitives and consistency pass

**Change:** 014-ui-a11y-consistency-pass
**Created:** 2026-10-09
**Status:** 🟡 Draft

## Overview

011 put every screen on Folio and is verified PASS. It left three groups of work out on purpose, and 014 does them:

- **B: shared page primitives.** `PageHead`, `PageTitle`, `SectionHead`, `Notice` and `FieldLabel` go into `src/components/ui/`, with the shared class strings. They replace 8 local style modules and 4 local heading components. `StatusWord` folds into `StatusChip`.
- **C: consistency.**
  - one field-label style;
  - one control height per size, from tokens;
  - one accent primary per view in brand kits;
  - a height cap on the kit list;
  - body `tabular-nums`;
  - four more tokens in the UI guard.
- **A: accessibility naming.**
  - a visible, associated label for every form field named only by its placeholder, or not named at all;
  - named tablists;
  - a login `h1`;
  - `aria-disabled` stepper steps;
  - the kit-row and breadcrumb names read once;
  - one static rule for scroll regions;
  - remove targets of at least 24 × 24 px;
  - an On/Off word on the provider toggle.

**Binding decisions** (proposal → Decisions, 2026-10-09, the user). They are not re-argued here.

- **One change, not split.**
  - The full clean mock E2E runs **once per wave**. Lint, unit and `tsc` run per task.
  - **B lands in the first wave,** so 012 builds on it.
  - A and C stay in the same wave where they couple: the brief kit select and the kit-list scroll region.
- **Visible labels use today's placeholder text.** The placeholder may stay as an example value, such as a hex code.
- **The primitives are `PageHead`, `Section` (built as `SectionHead`) and `Notice`, in `src/components/ui/`.**
- **Scroll regions follow a static rule:** every region that can scroll is `tabIndex=0`, `role="region"` and labelled. There is no overflow measurement.
- **011 is verified PASS.**
  - The stepper `aria-disabled` change edits only the 011 T8 E2E assertion, and 014 owns the new expectation.
  - 011's AC-17 wording is not edited.

### Assumptions (approved by the user 2026-10-09)

The user approved A1 (all 27 fields), A3 (every field label is small caps), A4 (the `axe-core` devDependency) and A5 (accept the micro-drift) on 2026-10-09, and added the §8.17 "More" menu doc fix to FR-20. A2 and A6 follow from A1.

- **A1: the field sweep is wider than the proposal's list.** The plan-time sweep found **27 fields**; the proposal named 9. The other 18 are in the same failure classes, and two of those classes are WCAG A failures (see "Classification"), so they are in scope. FR-12 lists every one.
- **A2: label text where the placeholder is an example, not a name.**
  - Where the placeholder names the field ("Username", "Access token"), the label is that text.
  - Where the placeholder is an example value ("e.g. Q3 product launch", "#1A2B3C", "<!DOCTYPE html>…"), the label is the field's existing visible caption if it has one. Otherwise it is the short noun phrase in FR-12's table.
  - **Placeholders are never edited,** so every `getByPlaceholder` selector keeps working.
- **A3: one field-label style app-wide.** "Select labels match the small-caps `FieldLabel`" cannot be done for Select alone, because Input and Select share one label class (`fieldLabelClasses`, `Input.tsx:20`). A small-caps Select label next to a sentence-case Input label in the same form (the campaign create form) would be a new drift. So every field label becomes the small-caps `FieldLabel`. This is a visible change on every form.
- **A4: `axe-core` is declared as a devDependency.** It is already in `package-lock.json` at 4.12.1, as a transitive devDependency of `eslint-plugin-jsx-a11y`, so nothing new is downloaded. The E2E injects it with `page.addScriptTag`. `@axe-core/playwright` is **not** added. If vetoed, AC-19 is dropped and the other ACs still hold.
- **A5: B unifies three micro-drifts, and accepts the pixels they move** (FR-04, AC-04). Each is 4 px of spacing or less, or a line-height change, with no colour, typeface or size change:
  - **D1:** the draft page's section-head row gap goes from 4 px to 8 px. This shows only when the row wraps at 375 px.
  - **D2:** the brand-kit section-head tail goes from `gap-x` 12 px to 14 px, and gains `text-ui-xs`.
  - **D3:** the draft page's "Revision History" sub-head line-height goes from inherited 1.5 to `leading-snug`.

  Every other copy is consolidated byte for byte.

- **A6: two names are kept by `aria-label`, not a visible label,** against the "visible" default:
  - each row's "Post topic" input in the briefing assistant's proposed schedule. Its sibling date input is already `aria-label="Generate at"` (011 T10);
  - nothing else. The draft page's two fields are labelled by their visible section heading through `aria-labelledby`, which is a visible label.

### Classification (party-ba: WCAG failure or polish)

The sources are the 011 task reviews (T7–T13), the handoff's 2026-10-08 list and this plan's code sweep. No automated audit has run yet; AC-19 adds one.

| Item                                                               | Class                                                                          | Detected by axe?                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| 5 selects with no name (FR-12 rows 6, 22–25)                       | **WCAG failure**: 4.1.2 Name, Role, Value; 1.3.1                               | Yes (`select-name`)                                                         |
| 4 fields whose visible label is not associated (rows 4, 5, 14, 21) | **WCAG failure**: 1.3.1 Info and Relationships                                 | No: the placeholder supplies a name                                         |
| 18 placeholder-only fields (the other rows)                        | **WCAG failure**: 3.3.2 Labels or Instructions. The label vanishes on input.   | No: axe's `label` rule accepts a placeholder                                |
| Stepper steps that look disabled but aren't marked                 | **WCAG failure**: 4.1.2 (the state is not exposed)                             | No                                                                          |
| Unnamed tablists (7 `SegmentedToggle`s)                            | Polish. ARIA does not require a tablist name.                                  | No                                                                          |
| Login has no `h1`                                                  | Polish (axe best practice `page-has-heading-one`)                              | Yes                                                                         |
| Breadcrumb tail read twice; hex codes in the kit-row name          | Polish. 2.5.3 still passes, because the name starts with the visible label.    | No                                                                          |
| Conditional scroll-region attributes                               | Polish. They are focusable whenever the region has content, so 2.1.1 holds.    | `scrollable-region-focusable` only fires on an overflowing, unfocusable box |
| Recent Drafts "Discard" target (15 px)                             | Polish. It passes 2.5.8 only through the spacing exception.                    | `target-size` passes it                                                     |
| Provider toggle state                                              | Polish. 1.4.1 passes, because the icon shape differs (ToggleLeft/ToggleRight). | No                                                                          |

### The copies B replaces (party-architect, party-ba: the count)

**8 style modules or inline blocks:**

| #   | Location                                       | What it defines                                                                                                                                                                  |
| --- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/app/(app)/page.tsx:125-129` (dashboard)   | `EYEBROW`, `PAGE_TITLE` (with `mt-2` baked in), `SECTION_HEAD`                                                                                                                   |
| 2   | `src/app/(app)/library/page.tsx:58-60`         | `EYEBROW`, `PAGE_TITLE` (with `mt-2`)                                                                                                                                            |
| 3   | `src/app/(app)/brief/page.tsx:21-23`           | `EYEBROW`, `PAGE_TITLE` (with `mt-2`). **This is the eighth copy, missing from the proposal's list.**                                                                            |
| 4   | `src/components/brief/cardCls.ts:5-6, 37-48`   | `FOCUS`; `SMALL_CAPS` **with `text-fg-muted` baked in**; `STEP_NUMERAL`, `STEP_HEAD`, `STEP_LEAD`; `NOTICE`                                                                      |
| 5   | `src/components/drafts/folio.ts:1-32`          | `FOCUS`, `SMALL_CAPS`, `PAGE_TITLE`, `SECTION`, `SECTION_NUMERAL`, `SECTION_HEAD`; `SUB_HEAD` **without `leading-snug text-fg`**; `NOTICE`, `ICON`                               |
| 6   | `src/components/campaigns/folio.ts:1-67`       | The atoms (`FOCUS`, `SCROLL_FOCUS`, `SMALL_CAPS`, `EYEBROW`, `ICON*`, `ICON_BUTTON`, `TAG`, `TEXT_LINK`, `TABLE_HEAD_ROW`, `COMPACT_FIELD`), the heading strings and screen bits |
| 7   | `src/components/admin/brandkits/folio.ts:1-87` | The same atoms, plus `FIELD_LABEL`. `SECTION_HEAD` **is the h3 size here**, and `KIT_TITLE` equals everyone else's `SECTION_HEAD`.                                               |
| 8   | `src/components/team/folio.tsx:1-166`          | The atoms; `SUB_HEAD`, `GROUP_HEAD`, `NOTICE`, `WARN_NOTICE`; and the components `PageHead`, `SectionHead`, `StatusWord` and `GateNotice`                                        |

**4 local heading components:**

- `src/components/drafts/SectionHead.tsx` (row `gap-y-1`);
- `src/components/campaigns/SectionHead.tsx` (row `gap-y-2`);
- the `SectionHead` in `team/folio.tsx:93` (its numeral is optional);
- `SectionHeader` in `src/components/admin/brandkits/shared.tsx:35` (an `h3`, `action` prop, tail `gap-x-3`, no `text-ui-xs`).

**Inline atom copies:**

- `RecentDraftsCard.tsx:21-24`: `FOCUS` with `rounded-ui-sm`, and `TEXT_LINK`;
- `RecentDraftsCard.tsx:108`: the section-head string;
- `RecentDraftsCard.tsx:152`: the table-head row;
- `ContentStep.tsx:17`: `SCROLL_FOCUS`;
- `ContentStep.tsx:102`, `Stepper.tsx:52` and `AppShell.tsx:142`: literal small caps;
- `choose-team/page.tsx:51`: the literal page-title string;
- `AppShell.tsx:72`: an `ICON_BUTTON` that is 36 px, not the 30 px one, so it is a different thing with the same name.

**The actual drift:**

- `PAGE_TITLE`, `PAGE_LEAD`, `SECTION_HEAD` (h2), `SECTION_NUMERAL`, `NOTICE`, `FOCUS`, `SCROLL_FOCUS`, `ICON_BUTTON`, `TAG`, `TEXT_LINK`, `TABLE_HEAD_ROW` and `COMPACT_FIELD` are **byte-identical** wherever they are copied. The only differences are where `mt-2` sits, and `rounded-ui-sm` on the Recent Drafts `FOCUS`.
- **The real drift:**
  - `SMALL_CAPS` with or without a colour;
  - `SECTION_HEAD` meaning the h2 style in five places and the h3 style in brand kits;
  - `SUB_HEAD` with or without `leading-snug`;
  - the four `SectionHead` rows (D1, D2);
  - outer margins: page heads are `mb-8` everywhere except `/brief` (`mb-10`).
- Three `SectionHead`s were written **after** the first, each a copy with a small change. That is the "next screen imitates a copy" problem as it already happened, not a forecast (party-po).

## Requirements

### Functional Requirements

#### B: shared page primitives (wave 1)

**FR-01: Shared primitives in `src/components/ui/`.** React components, exported from `src/components/ui/index.ts`. **The class strings survive** in `src/components/ui/folio.ts`, for headings with a bespoke structure.

- **`PageHead({ eyebrow?, title, lead?, actions?, className? })`**
  - renders an `h1` (always level 1; every page head today is an `h1`);
  - the eyebrow is a `div`, the lead a `p`, and `actions` sits in the right-hand slot that drops below the title at 375 px;
  - the layout is the `team/folio.tsx:121` one.
- **`PageTitle({ children, className? })`** is the `h1` with the page-title style, for detail pages whose head is a breadcrumb plus a title (campaigns/[id], projects/[id], drafts/[id], choose-team).
- **`SectionHead({ title, numeral?, level = 2, id?, className?, children? })`**
  - renders `h2` (the `--text-xl` section style) or, with `level={3}`, `h3` (the `--text-lg` sub-head style);
  - the numeral is an `aria-hidden` span outside the heading's name;
  - `children` is the right-hand tail;
  - `id` goes on the heading, so a field can use `aria-labelledby`;
  - the row is `flex flex-wrap items-baseline gap-x-3.5 gap-y-2`, and the tail is `ml-auto flex flex-wrap items-center justify-end gap-x-3.5 gap-y-1 text-ui-xs`.
- **`Notice({ tone, role?, icon?, className?, children, ...rest })`**
  - tones: `warning` (`--status-scheduled`), `error` (`--status-failed`), `info` (`--accent`) and `neutral`;
  - a tone is the text colour on its 10 % fill, with a 1 px inset ring in `currentColor`;
  - **`neutral`** is the `--surface-1` fill, `--fg` text and an explicit `--line` ring. This fixes the T12 NOTE: today `text-line` colours any child that sets no colour of its own;
  - **it renders no `role` unless one is passed.** Callers keep theirs (`role="status"`, `role="alert"`), and `data-*` attributes pass through.
- **`FieldLabel({ htmlFor?, id?, as = 'label', className?, children })`**
  - moves from `src/components/brief/FieldLabel.tsx`, which today renders a `<label>` with no `htmlFor`;
  - the style is small caps (§5.2) in `--fg-muted`;
  - `as="span"` is for captions of groups that carry their own `aria-label`.
- **No primitive owns its outer margin.** The caller passes spacing in `className`: `mb-8` after a page head (`mb-10` on `/brief`), `mb-3` under a section head, `pb-2.5` where a rule follows. That is how B keeps every screen's spacing (FR-04).
- **`src/components/ui/folio.ts` exports:** `FOCUS`, `SCROLL_FOCUS`, `SMALL_CAPS` (no colour), `EYEBROW` (`SMALL_CAPS` plus `text-fg-muted`), `PAGE_TITLE`, `PAGE_LEAD`, `SECTION_HEAD` (the h2 style), `SECTION_NUMERAL`, `SUB_HEAD` (the h3 style, with `leading-snug text-fg`), `NOTICE`, `ICON`, `ICON_SM`, `ICON_BUTTON`, `TEXT_LINK`, `TAG`, `TABLE_HEAD_ROW` and `COMPACT_FIELD`.
- **Use rule:**
  - a screen uses the component wherever its head is "numeral + title + tail" or "eyebrow + title + lead + actions";
  - a bespoke heading uses the class strings: the dashboard's Activity and Recent Drafts heads, the campaigns group head with its link, the projects/[id] head, the kit title with its inline marks, the brief `StepHead` and `GateNotice`.

**FR-02: Every copy is replaced, and local modules keep only screen-specific parts.**

- **Deleted:**
  - `src/components/drafts/folio.ts`;
  - `src/components/drafts/SectionHead.tsx`;
  - `src/components/campaigns/SectionHead.tsx`;
  - `src/components/brief/FieldLabel.tsx`.
- **Reduced:**
  - `brief/cardCls.ts`, `campaigns/folio.ts`, `admin/brandkits/folio.ts` and `team/folio.tsx`;
  - `brandkits/shared.tsx`, which keeps `ColorSwatch`.
- **The residue rule.** A local style module may keep only helpers that **one** screen group uses and that are not defined identically elsewhere, composed from the `ui` atoms. Examples:
  - `cardCls` and `rowCls` (brief);
  - `rowCls`, `optionCls`, `CODE_FIELD` and `TITLE_FIELD` (brand kits);
  - `ROW_TITLE`, `CRUMB_LINK`, `CRUMB_CURRENT` and `ASIDE_BLOCK` (campaigns);
  - `BLOCK`, `ROW` and `GateNotice` (team);
  - the brief `StepHead` component.

  **It may not define any name in the FR-05 list.** `GROUP_HEAD` and `ASIDE_HEAD` are removed; their call sites use `EYEBROW` (plus `mb-3`).

**FR-03: `StatusWord` folds into `StatusChip`.**

- `StatusChip` takes either `status` (today's ten states and labels) or `tone` (`published` | `draft` | `scheduled` | `failed` | `exported`) with `children` as the label.
- It gains `flex-shrink-0 whitespace-nowrap` from `StatusWord`.
- The label is always visible text.
- The 15 `StatusWord` uses move to `<StatusChip tone=…>`, and `StatusWord` is deleted.

**FR-04: B changes no accessible name, role, heading level, landmark or `data-*` hook, and is visually a no-op apart from D1–D3 (A5).**

- Each screen keeps its current heading element and level. The levels are listed in `design.md` §3.
- **Any E2E selector or assertion change in a B task is a defect.** B tasks edit no file under `tests/e2e/`.

**FR-05: A guard against new copies.** A unit test fails when any file under `src/` outside `src/components/ui/` declares a `const` or `function` named:

- **constants:** `FOCUS`, `SCROLL_FOCUS`, `SMALL_CAPS`, `EYEBROW`, `FIELD_LABEL`, `PAGE_TITLE`, `PAGE_LEAD`, `SECTION_HEAD`, `SECTION_NUMERAL`, `SUB_HEAD`, `KIT_TITLE`, `STEP_HEAD`, `STEP_NUMERAL`, `STEP_LEAD`, `GROUP_HEAD`, `ASIDE_HEAD`, `NOTICE`, `WARN_NOTICE`, `ICON`, `ICON_SM`, `ICON_BUTTON`, `TEXT_LINK`, `TAG`, `TABLE_HEAD_ROW`, `COMPACT_FIELD`;
- **components:** `PageHead`, `PageTitle`, `SectionHead`, `SectionHeader`, `Notice`, `FieldLabel`, `StatusWord`;
- **and** when a file outside `src/components/ui/` contains the literal small-caps tracking `tracking-[0.14em]`.

The AppShell's 36 px `ICON_BUTTON` is renamed `SHELL_ICON_BUTTON`.

#### C: consistency (wave 2)

**FR-06: One field-label style, set in the primitives.**

- `Input` and `Select` render their `label` prop through `FieldLabel`, so the fix lives **in the primitives, not at call sites**.
- `fieldLabelClasses` is removed. Its call sites become `FieldLabel`, with `as="span"` for group captions:
  - `PublishDialog.tsx:107`;
  - `QueueEntryModal.tsx:153, 171, 189, 201, 215`;
  - `KitDetail.tsx:441, 463`;
  - `ElementEditPanel.tsx:79`.
- `brandkits/folio.ts`'s `FIELD_LABEL` is removed.
- **The brief kit select is owned by this FR's task (T9) alone.** `SizeDesignStep.tsx:94-95` becomes `<Select label="Brand Kit" …>`, replacing the separate unassociated `FieldLabel`. That both names it (A, FR-12 row 6) and styles it (C).

**FR-07: One control height per size, from one source.**

- **Source:** three theme-independent tokens on `:root` in `globals.css`: `--control-sm: 30px`, `--control-md: 36px` and `--control-lg: 40px`. They map to Tailwind `spacing` keys `control-sm|md|lg`, giving `h-control-md`, `w-control-sm` and so on.
- **The values are today's Button heights** (`Button.tsx:29-33`: sm `h-[30px]`, md `h-9`, lg `h-10`) and DESIGN_SYSTEM §6 ("controls 36 px tall, 30 px small"). `lg` has no caller today and is kept for the prop type.
- **Consumers:**
  - `Button` `sizeClasses`;
  - the single-line `Input` and `Select`, plus raw single-line inputs that use `fieldClasses`: md, horizontal padding only. **Today they compute to about 44.5 px**, which is the drift;
  - `COMPACT_FIELD`: sm. It is about 34 px today;
  - `ICON_BUTTON`: `h-control-sm w-control-sm`;
  - `SHELL_ICON_BUTTON`, the dashboard `QuickAction` and the `ElementEditPanel` colour well: md;
  - the `ImagesStep` intent button and the `PostCard` delete: sm.
- **Excluded:**
  - textareas and `CODE_FIELD` (multi-line);
  - `TITLE_FIELD` (display size);
  - the attached prompt fields (refine, both assistants), which keep §8.3's prompt treatment;
  - skeleton bars.
- `DESIGN_SYSTEM.md` §6, §8.2 and §8.3 point to the tokens instead of restating the numbers.

**FR-08: One accent primary per view in brand kits.**

- **DESIGN_SYSTEM §8.2, quoted:**

  > "**One accent primary per view.** On the draft page it is Publish. A submit attached to a field or sitting in an inline form (the refine Send, inline add and save rows) uses **Ink**, and per-item actions in repeated lists and grids use **Outline**, so the view's one primary stays the only accent fill."

- **Reading:**
  - "a view" is the page's `main` content in its current state;
  - a modal or drawer is its own view;
  - the floating Create post button is shell chrome and outside every view. It sits outside `main`, and the draft page's Publish already coexists with it under 011's PASS;
  - "one" means **at most one** accent-filled control.
- **In brand kits:**
  - the open kit's **Save** (edit mode, `KitDetail.tsx:271`) stays primary, and **Add Kit** stays primary only while no kit is open (it already is);
  - **Save template** (`KitDetail.tsx:473`) and **Save as new version** (`PromptSection.tsx:177`) are inline-form submits, so they become **`ink`**;
  - the assistant drawer's Apply and the Add Kit modal's Create are each the one primary of their own view, and are unchanged.

**FR-09: The kit list has a height cap and is a scroll region.**

- The list container (`admin/brandkits/page.tsx:87`) gets `max-h-[32rem] overflow-y-auto`, about eight rows, at every width.
- It also gets the FR-17 attributes: `tabIndex={0}`, `role="region"`, `aria-label="Brand kits"`, and the inset `SCROLL_FOCUS`.
- **Value:** the E2E test DB holds about 200 kits (handoff: "the test DB fills up"), and a team with many kits pushes the open kit's detail below the fold at 375 px.

**FR-10: `font-variant-numeric: tabular-nums` on `body`** (`globals.css:92-98`), as DESIGN_SYSTEM §5.2 says. The three local `tabular-nums` utilities may stay.

**FR-11: The UI guard catches four more tokens, as whole class tokens.**

- **The tokens:**
  - `glow-blob`;
  - `animate-scale-in`;
  - `font-inter`;
  - the legacy `primary` colour family: `(bg|text|border|ring|from|to|via|fill|stroke|divide|outline|placeholder|decoration|shadow)-primary` with an optional `-<word>` suffix. This includes `text-primary`.
- **Whole-token matching.** A hit must start at the start of the line or after one of `\s " ' \` { ( :`(so`hover:text-primary`is caught), and end at the end of the line or before one of`\s " ' \` } ) ] /`(so`text-primary/50`is caught). So`text-primary-fg`counts as a primary-family token, and`my-glow-blob-x`does not match`glow-blob`.
- **Current occurrences under `src/`:** zero for `glow-blob`, `font-inter` and every `*-primary` utility. `animate-scale-in` appears once, in a **comment** at `src/components/ui/Modal.tsx:84`.
- **Comments are scanned like code,** which is the guard's existing policy (011 T13 accepted the same for `\bglass\b`). The Modal comment is reworded in the same task ("not the old scale-in keyframe"), so the guard is green at that commit.
- The `ui-exception:` opt-out is unchanged.

#### A: accessibility naming (waves 2 and 3)

**FR-12: Every form field has a visible label that is programmatically associated with it.**

- **Mechanisms:**
  - `FieldLabel` with `htmlFor`;
  - an `Input` or `Select` `label` prop, which renders `FieldLabel`;
  - `aria-labelledby` pointing at visible text (a `dt` or a section heading);
  - `aria-label` only for row 18 (A6).
- **Rules:**
  - placeholders are not edited (A2);
  - ids come from `React.useId()`;
  - the inventory below is the complete result of the plan-time sweep (`<input>`, `<textarea>`, `<select>`, `Input` and `Select` in `src/**/*.tsx`, excluding checkbox, radio, file, hidden and color inputs).

| #   | Field                                    | File:line                                                 | Name today                                | Label (mechanism)                                                                                                                             | Class |
| --- | ---------------------------------------- | --------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1   | Login username                           | `src/app/(auth)/login/page.tsx:46`                        | placeholder "Username"                    | "Username" (`label` prop); **the name is unchanged**                                                                                          | 3.3.2 |
| 2   | Login password                           | `login/page.tsx:54`                                       | "Password"                                | "Password" (`label` prop); unchanged                                                                                                          | 3.3.2 |
| 3   | Library search                           | `src/app/(app)/library/page.tsx:166`                      | "Search by topic…"                        | "Search by topic" (`FieldLabel htmlFor`)                                                                                                      | 3.3.2 |
| 4   | Brief topic                              | `src/components/brief/ContentStep.tsx:70-71`              | "e.g. Q3 product launch"                  | the existing "Topic" (`htmlFor`)                                                                                                              | 1.3.1 |
| 5   | Brief description                        | `ContentStep.tsx:84, 123`                                 | "e.g. Announce our…"                      | the existing "Brief" (`htmlFor`)                                                                                                              | 1.3.1 |
| 6   | Brief brand kit select                   | `src/components/brief/SizeDesignStep.tsx:94-95`           | **none**                                  | "Brand Kit" (`Select label`), **in T9 only**                                                                                                  | 4.1.2 |
| 7   | Team: API key                            | `src/app/(app)/team/page.tsx:121`                         | "API key (sk-ant-…, …)"                   | "API key", or "Image API key" when COPY is hidden (`FieldLabel` **outside** the relative wrapper that holds the eye button)                   | 3.3.2 |
| 8   | Team: provider name                      | `team/page.tsx:148`                                       | "Provider name (e.g. groq)"               | "Provider name" (`label`)                                                                                                                     | 3.3.2 |
| 9   | Team: display label                      | `team/page.tsx:153`                                       | "Display label (e.g. …)"                  | "Display label" (`label`)                                                                                                                     | 3.3.2 |
| 10  | Team: channel access token (×2 channels) | `team/page.tsx:338`                                       | "Access token"                            | "Access token" (`FieldLabel` outside the eye-button wrapper)                                                                                  | 3.3.2 |
| 11  | Team: channel metadata (×2)              | `team/page.tsx:355`                                       | "Business Account ID" / "Organization ID" | the same text (`label`)                                                                                                                       | 3.3.2 |
| 12  | Kit: add colour                          | `src/components/admin/brandkits/ColorEditor.tsx:41`       | "#1A2B3C"                                 | "Add color" (`htmlFor`); the hex placeholder stays                                                                                            | 3.3.2 |
| 13  | Kit: font search (combobox)              | `brandkits/FontEditor.tsx:94`                             | "Search Google Fonts…"                    | "Search Google Fonts" (`htmlFor`)                                                                                                             | 3.3.2 |
| 14  | Kit: template HTML/CSS                   | `brandkits/KitDetail.tsx:463-464`                         | "<!DOCTYPE html>…"                        | the existing "HTML/CSS" (`htmlFor`); the "Size" `<label>` at `:441` becomes `FieldLabel as="span"` (its group is already `aria-label="Size"`) | 1.3.1 |
| 15  | Kit: brand description                   | `brandkits/PromptSection.tsx:110`                         | "Describe your brand…"                    | "Brand description" (`htmlFor`)                                                                                                               | 3.3.2 |
| 16  | Kit: voice prompt                        | `PromptSection.tsx:169`                                   | "Write your brand voice prompt…"          | "Brand voice prompt" (`htmlFor`)                                                                                                              | 3.3.2 |
| 17  | Kit assistant: message                   | `brandkits/BrandKitAssistantPanel.tsx:367`                | "e.g. Extract the brand…"                 | "Message" (`FieldLabel htmlFor`, above the prompt form)                                                                                       | 3.3.2 |
| 18  | Briefing assistant: row topic            | `src/components/campaigns/BriefingAssistantPanel.tsx:365` | "Post topic"                              | `aria-label="Post topic"` (A6); unchanged                                                                                                     | 3.3.2 |
| 19  | Briefing assistant: message              | `BriefingAssistantPanel.tsx:433`                          | "Tell the assistant…"                     | "Message" (`htmlFor`)                                                                                                                         | 3.3.2 |
| 20  | Campaign briefing: new version           | `campaigns/CampaignBriefingSection.tsx:229`               | "Audience, key messages…"                 | "Briefing" (`htmlFor`)                                                                                                                        | 3.3.2 |
| 21  | Queue: post specifics                    | `campaigns/QueueEntryModal.tsx:153-156`                   | "What this specific post…"                | the existing "Post specifics" (`htmlFor`)                                                                                                     | 1.3.1 |
| 22  | Queue: template select                   | `QueueEntryModal.tsx:215-216`                             | **none**                                  | "Template" (`Select label`, replacing the loose `<label>`)                                                                                    | 4.1.2 |
| 23  | Campaign aside: project                  | `src/app/(app)/campaigns/[id]/page.tsx:190`               | **none**                                  | `aria-labelledby` the "Project" `dt`                                                                                                          | 4.1.2 |
| 24  | Campaign aside: kit override             | `campaigns/[id]/page.tsx:219`                             | **none**                                  | `aria-labelledby` the "Brand kit override" `dt`                                                                                               | 4.1.2 |
| 25  | Project aside: default kit               | `src/app/(app)/projects/[id]/page.tsx:132`                | **none**                                  | `aria-labelledby` the "Default brand kit" `dt`                                                                                                | 4.1.2 |
| 26  | Draft caption                            | `src/components/drafts/CopyEditor.tsx:180`                | "Post copy…"                              | `aria-labelledby` the "Copy" section heading (`SectionHead id`)                                                                               | 3.3.2 |
| 27  | Draft refine prompt                      | `src/components/drafts/RefinementPanel.tsx:331`           | "e.g. Make the logo larger…"              | `aria-labelledby` the "Refine Design" section heading                                                                                         | 3.3.2 |

- **Name changes that matter to tests:** rows 1, 2, 10, 11 and 18 keep their accessible name; every other row's name changes.
  - The E2E suite reaches all of them by placeholder or by DOM position, so no existing selector breaks.
  - `surfaces.test.ts:615` (`getByRole('combobox')` on the brief kit select) is tightened to `{ name: 'Brand Kit' }` in T9, as the 011 T8 review asked.
  - The AC-17 tab helper (`surfaces.test.ts:269-306`) reads `aria-label ?? placeholder ?? textContent`, not the accessible name, so the library stop stays "Search by topic…".

**FR-13: Every tablist has a name.**

- `SegmentedToggle` takes a **required** `label: string`, rendered as `aria-label` on the `tablist`.
- **All 7 call sites:**
  - library `:178`, "Filter by status";
  - team `:162`, "Provider slot" (the COPY/IMAGE tablist);
  - `PromptSection.tsx:83`, "Prompt view";
  - `CampaignBriefingSection.tsx:132`, "Briefing view";
  - `QueueEntryModal.tsx:190` and `:202`, "Size" and "Design";
  - `InlineEditModal.tsx:616`, "Edit mode".
- The roles stay `tablist`/`tab` (FR-12 of 011 froze them; changing them is out of scope).

**FR-14: `/login` has one visually hidden `h1`,** "Sign in to Studio" (`sr-only`), before the wordmark.

**FR-15: Stepper steps not yet reached carry `aria-disabled="true"`.**

- This applies to `Stepper.tsx:29` when `!done && !active`.
- They stay focusable, so the first three tab stops are unchanged.
- **This edits only the 011 T8 E2E case** (`surfaces.test.ts:585-594`), adding the `aria-disabled` expectations. 014's AC-14 supersedes 011's AC-17 for the stepper; 011's spec is not edited.

**FR-16: Two names are read once.**

- **Kit-row swatches:**
  - `ColorSwatch` (`brandkits/shared.tsx:15`) takes `decorative?: boolean`, which adds `aria-hidden="true"`;
  - the kit-list row (`admin/brandkits/page.tsx:126`) passes it, so the row's name is the kit name (plus "default"), with no hex codes;
  - the `title` tooltips stay, so `span[title=…]` selectors keep working.
- **The breadcrumb tail:**
  - the current-page crumb (`campaigns/[id]/page.tsx:138`, `projects/[id]/page.tsx:82`) becomes `aria-hidden="true"` and loses `aria-current="page"`;
  - the `h1` beneath it carries the name once;
  - it is still visible;
  - `surfaces.test.ts:891` is updated.

**FR-17: The static scroll-region rule.**

- **The rule:** a content container that scrolls on its own (an `overflow-*-auto` box with a height or width cap) is `tabIndex={0}`, `role="region"`, has an `aria-label`, and uses the inset `SCROLL_FOCUS`. It has these **unconditionally**, whether or not it overflows now. This is DESIGN_SYSTEM §8.15, made explicit.
- **Changes:**
  - the three conditional regions become unconditional: `BrandKitAssistantPanel.tsx:252` "Conversation", `BriefingAssistantPanel.tsx:300` "Conversation" and `RefinementPanel.tsx:219` "Refine requests";
  - the kit list is added (FR-09).
- **Already compliant (unchanged):**
  - admin teams `:112` and users `:123`;
  - "Proposed brand", "Prompt history", "Proposed schedule", "Briefing history";
  - both "Before" and "AI suggestion" pairs;
  - "Planned posts" and "Recent drafts".
- **Exempt, with the reason:**
  - **the app shell's `main` and sidebar:** page-level scroll, and a landmark;
  - **`Modal`/`Drawer` bodies** (`Modal.tsx:111, 160`) and the `ElementEditPanel` aside inside the inline-edit dialog. Radix moves focus to the first focusable element, so a tab stop on the body would change every dialog's initial focus. Their content is reached through the controls it holds;
  - **the `FontEditor` listbox,** a popup that manages its own focus.

**FR-18: Remove targets are at least 24 × 24 px, as the button's own border box.**

- **Fix:** the Recent Drafts "Discard unfinished brief" (`RecentDraftsCard.tsx:180-188`) is about 15 × 15 today and becomes `inline-flex h-6 w-6 items-center justify-center`.
- **Already compliant and asserted:**
  - ColorEditor and FontEditor "Remove …" (`h-6 w-6`, 24 × 24);
  - every `ICON_BUTTON` remove or delete (30 × 30);
  - `ImagesStep` "Remove image" (30 × 30).
- **The measure** is the element's `boundingBox()` at zoom 1 and 1440 px, which is the box, not the spacing-exception hit area.

**FR-19: The provider toggle shows its state in words.**

- Beside the enable toggle (`team/page.tsx:233-244`), a small-caps "On" (`--accent`) or "Off" (`--fg-muted`) word.
- **It sits outside the button and is `aria-hidden`.**
  - The button keeps `aria-label="Enable <label>"` and `aria-pressed`, so 2.5.3 Label in Name is not broken by a visible "On" inside it.
  - Screen readers already get the state from `aria-pressed`.

#### Docs

**FR-20: `DESIGN_SYSTEM.md` records the rules.**

- §1: the 2026-10-09 decisions.
- §6, §8.2, §8.3: point to the control tokens. §8.3 adds the field-label rule and single-line height.
- §8.2: the FR-08 reading.
- §8.5: the `tone` variant.
- §8.15: the static rule and its exemptions.
- **New §8.18 "Page primitives":** the FR-01 props, the use rule, the no-outer-margin rule and the residue rule.
- §9: labels, named tablists, `aria-disabled` steps, the 24 px box.
- §11: the new guard tokens and the FR-05 name guard.
- §8.17: the draft page has no "More" menu (user decision 2026-10-07); every action stays a visible button. The stale More-menu text is replaced. Added 2026-10-09 by the user.

### Non-Functional Requirements

- **NFR-01: No behaviour change.**
  - No route, API, data shape, flow or keyboard interaction changes, beyond the FR-15/17 focus semantics.
  - Nothing under `src/app/api`, `src/lib`, `prisma`, `src/mcp` or `src/scheduler` changes.
- **NFR-02: Per wave, the full clean mock E2E is 0 failed and 0 flaky,** and no pre-existing case changes outcome. Every E2E edit is listed with its reason in the task report. **B tasks (wave 1) edit nothing under `tests/e2e/`.**
- **NFR-03: Per task:** `npm run lint` (0 errors, the 7 known warnings), `npm run test:unit` and `npx tsc --noEmit -p .`, all green.
- **NFR-04: Gates that stay green:**
  - `uiTokenGuard`, `designTokens` and `contrast` stay green after every task;
  - the extended guard's own self-test has a positive and a negative sample for each new token.
- **NFR-05: No new runtime dependency.** The only `package.json` change is declaring `axe-core` as a devDependency (A4), at the lockfile's version.
- **NFR-06: A stable contract for 012.** The FR-01 props are stable once wave 1 lands. A later change to them is a 012-visible API change and needs its own note.
- **NFR-07: 375 px still has no horizontal page scroll** on every screen. The existing 011 AC-12 checks stay green.
- **NFR-08: Contrast.** Every colour 014 introduces is an existing token pair checked by `contrast.test.ts`:
  - small caps in `--fg-muted` on canvas and surfaces, at 5.64:1 or better;
  - `--accent` and `--fg-muted` words;
  - ink buttons.

## Acceptance Criteria

- **AC-01 (FR-01):** Unit: `tests/unit/uiPrimitives.test.ts` renders each primitive with `react-dom/server` `renderToStaticMarkup` and asserts:
  - `PageHead` → one `h1`, with an eyebrow and a lead when given;
  - `PageTitle` → `h1`;
  - `SectionHead` → `h2` by default and `h3` with `level={3}`, the numeral `aria-hidden`, the `id` on the heading;
  - `Notice` → no `role` attribute unless passed, and the passed `role` and `data-*` attributes are present;
  - `FieldLabel` → `<label for>` with `htmlFor`, and `<span>` with `as="span"`;
  - `StatusChip` `tone` → the children text in the tone's classes.
- **AC-02 (FR-02, FR-05):**
  - Unit: the name guard (in `uiTokenGuard.test.ts`) finds zero hits. Its self-test flags a sample `export const EYEBROW =` outside `ui` and does not flag the same line inside `src/components/ui/`.
  - The four FR-02 files are gone (`git ls-files` is empty for them).
- **AC-03 (FR-03):** `grep -r StatusWord src` is empty. The AC-01 `tone` case passes. The existing `/team`, `/settings` and `/admin/users` E2E cases that read "Connected", "Active" and so on stay green.
- **AC-04 (FR-04): B is a no-op, by two checks.**
  1. **Roles and names:** the wave-1 full E2E is 0 failed and 0 flaky, and `git diff <wave-1 base>..<wave-1 end> -- tests/e2e` is **empty**.
  2. **Pixels:**
     - the capture method in `design.md` §7 runs: a warm-up pass, then `before` at the wave-1 base, then `after` at the wave-1 end, on the same freshly recreated DB, with `rm -rf .next` and a restart. It covers 58 shots: 2 themes × 2 widths × every screen;
     - `scripts/compare-captures.mjs` reports **0 differing pixels** for every shot outside two sets: the noise set (shots that differ between warm-up and `before`, today the dashboard's relative times) and the expected-drift set (the draft screen shots, D1/D3, and the brand kits shots, D2);
     - each shot in those two sets has a diff crop in the wave report, showing that only the listed drift moved.

  **This is a pixel count plus a reviewed crop, not a fully automated gate.** The server clock can't be frozen, because relative times are rendered server-side.

- **AC-05 (FR-06):**
  - E2E: on `/campaigns` with the create form open, the labels "Campaign name" (Input) and "Project" (Select) compute the same `text-transform` (`uppercase`), `font-size` (11px), `letter-spacing` and `color` as the brief's "Topic" `FieldLabel`.
  - `grep -r fieldLabelClasses src` is empty.
  - `getByRole('combobox', { name: 'Brand Kit' })` resolves on brief step 2.
- **AC-06 (FR-07):**
  - Unit (`designTokens.test.ts`): `:root` declares `--control-sm|md|lg` as `30px|36px|40px`, and `tailwind.config.ts` maps `control-sm|md|lg` to them.
  - E2E: on `/campaigns` with the create form open, the "Campaign name" input, the "Project" select and the md Button each have a `boundingBox().height` of 36 ± 0.5.
  - E2E: on an open kit in edit mode, the add-colour input and its sm "Add" button are both 30 ± 0.5.
  - Grep: `Button.tsx`, `Input.tsx`, `Select.tsx`, `ui/folio.ts` and the FR-07 consumer files contain no `h-9`, `h-10`, `h-[30px]` or `w-[30px]`.
- **AC-07 (FR-08):** E2E on `/admin/brandkits`. Open a kit, press Edit, open the template form ("Add") and open "New Version". Within `main`, exactly **one** button has the computed background colour of `--accent` (the kit's Save). "Save template" and "Save as new version" compute the `--fg` fill (ink).
- **AC-08 (FR-09):** E2E: `getByRole('region', { name: 'Brand kits' })` has `tabindex="0"`, a computed `max-height` of `512px` and `overflow-y: auto`. Tabbing to it shows a visible focus indicator (the 011 helper).
- **AC-09 (FR-10):** Unit: the `body` rule in `globals.css` contains `font-variant-numeric: tabular-nums`. E2E: `getComputedStyle(document.body).fontVariantNumeric === 'tabular-nums'`.
- **AC-10 (FR-11):**
  - Unit: the guard's self-test flags `glow-blob`, `animate-scale-in`, `font-inter`, `text-primary`, `hover:text-primary`, `text-primary/50` and `bg-primary-light`. It does **not** flag `variant="primary"`, `my-glow-blob-x` or `xtext-primary`.
  - The tree scan finds zero hits.
- **AC-11 (FR-12):** E2E (`tests/e2e/a11y.test.ts`): for every row in FR-12's table, on its screen:
  - `getByLabel('<label>', { exact: true })` (or `getByRole(role, { name, exact: true })` for rows 23–27) resolves to exactly that field;
  - its label text is visible (except row 18);
  - `getByPlaceholder('<today's placeholder>')` still resolves to the same element.
- **AC-12 (FR-13):** `tsc` fails if a `SegmentedToggle` has no `label` (the prop is required). E2E: on `/library`, `/team` (register form open), an open kit, a campaign detail, the queue modal and the inline-edit modal, every `role=tablist` has a non-empty accessible name. `/team` has a tablist named "Provider slot".
- **AC-13 (FR-14):** E2E: `/login` has exactly one `h1`, named "Sign in to Studio", with class `sr-only`. The 011 login focus stops stay `['Username', 'Password', 'Sign in']`.
- **AC-14 (FR-15):** E2E, the updated 011 T8 case:
  - on `/brief` step 1, step 1 has `aria-current="step"` and no `aria-disabled`, and steps 2–5 have `aria-disabled="true"`;
  - after Continue to step 2, step 1 has no `aria-disabled`, and steps 3–5 have it;
  - the first three tab stops are still `['1Campaign', '2Size & Design', '3Content']`.
- **AC-15 (FR-16):**
  - E2E: a minted kit's row button has the accessible name `^<kit name>( default)?$`. Its swatch spans are `aria-hidden="true"` and keep `title`.
  - On a campaign detail page, the breadcrumb's `ariaSnapshot()` does not contain the campaign name, the tail crumb is visible with `aria-hidden="true"`, and the `h1` is named by it.
- **AC-16 (FR-17):**
  - E2E: on a draft with no refine requests, `getByRole('region', { name: 'Refine requests' })` exists with `tabindex="0"`.
  - With no turns yet, the brand-kit and briefing assistant drawers each have `getByRole('region', { name: 'Conversation' })` with `tabindex="0"`.
  - Grep: no conditional spread of `role: 'region'` remains under `src/`.
- **AC-17 (FR-18):** E2E at 1440 px: the `boundingBox()` of "Discard unfinished brief" (with a minted unfinished brief), "Remove color …" and "Remove font …" is at least 24 × 24 each.
- **AC-18 (FR-19):**
  - E2E on `/team` with a registered provider: the row shows a visible "On" while `aria-pressed="true"`.
  - After toggling, it shows "Off" and `aria-pressed="false"`.
  - The button's name stays `Enable <label>`.
  - The word has `aria-hidden="true"`.
- **AC-19 (A4, A-wide):** E2E: `axe-core` (injected with `addScriptTag`), with `runOnly: { type: 'rule' }` on these rules, reports **zero violations** in light theme at 1440 px.
  - **Rules:** `label`, `select-name`, `aria-input-field-name`, `aria-toggle-field-name`, `button-name`, `link-name`, `page-has-heading-one`, `scrollable-region-focusable`, `target-size`, `aria-allowed-attr`, `aria-valid-attr-value` and `aria-required-attr`.
  - **Routes:** `/login`; `/`; `/library`; `/brief` steps 1–3; `/drafts/[id]`; `/campaigns`; `/campaigns/[id]`; `/projects/[id]`; `/admin/brandkits` with a kit open in edit mode; `/team` with the register form open; `/settings`; `/admin/users`.
  - **`nested-interactive` is deliberately not in the list:** the library tile's nested button predates 014 (011 T7).
  - **If a listed rule reports a violation that FR-12 to FR-19 does not cover, the task stops and reports it.** A rule is never removed to make the scan pass.
- **AC-20 (FR-20):** `DESIGN_SYSTEM.md` has the FR-20 sections. §6, §8.2 and §8.3 name `--control-*` instead of restating 30/36/40 as the source.
- **AC-21 (gates):**
  - At each wave end: the full clean mock E2E is 0 failed and 0 flaky.
  - At the end: `npm run test:unit`, `npm run lint` (0 errors), `npm run build` and `tsc` pass, and `npm run test:render` is unchanged at 15/15 (014 does not touch generated posts).

## Edge Cases

- **Playwright treats `aria-disabled="true"` as not enabled.** A `click()` on a future stepper step would now wait and time out. Today no test clicks one: the jumps go back to done steps, which are not `aria-disabled`. T17 greps for any such click before it changes the stepper.
- **The eye button on the team key fields** (`team/page.tsx:119-134`, `:336-349`) is `absolute top-1/2` inside a `relative` wrapper around the `Input`. An `Input label` inside that wrapper would move the button off centre. So rows 7 and 10 put `FieldLabel htmlFor` **outside** the wrapper and pass `id` to the `Input`.
- **Duplicate label text.**
  - Two channels each have "Access token". The ids are unique (`useId`), and each sits inside its own channel row.
  - E2E uses `{ exact: true }` and scopes to the row. `getByLabel('API key')` without `exact` would also match the "Show API key" button.
- **Uppercase labels and names.** `text-transform` does not change the DOM text, so accessible names and Playwright's text matching stay sentence case. AC-05 checks the computed style, not the text.
- **Notice class conflicts are carried, not fixed, in B.** `ElementEditPanel.tsx:181` passes `text-ui-xs` next to `NOTICE`'s `text-ui-sm`. CSS order resolves it today, and B keeps the same class set, so the pixels stay the same. Resolving it would be a visual change, so it is left alone.
- **New tab stops shift 011 AC-17 expectations.**
  - The kit-list region (FR-09) becomes a stop between "Add Kit" and the first kit row, so `surfaces.test.ts:1044-1047` changes in T11.
  - The stepper and the conversation regions do not change any 011 first-three-stops list.
- **An empty region is still a stop** (the static rule). Its label must make sense with no content: "Refine requests", "Conversation".
- **The kit-list cap with few kits** does not scroll. It is still a region (static rule), and `max-height` does nothing.
- **Bigger heights in rows.** `h-6` Discard and `h-control-md` inputs change some row heights (C and A, not B). The 375 px no-scroll checks (011 AC-12) stay in force.
- **`renderToStaticMarkup` in vitest's `node` environment.** The primitives are server-safe (`team/folio.tsx` already renders in a server layout). If a `.tsx` import fails under vitest's esbuild defaults, T2 adds `esbuild: { jsx: 'automatic' }` to `vitest.config.ts`, and that is the only config change allowed.
- **The capture noise set can grow** (a toast, a spinner). Any shot that differs warm-up-vs-`before` is in the noise set by definition, and its crop is reviewed. It is never silently passed.

## Dependencies

- **011 is verified PASS** (2026-10-09). 014 edits only these 011 E2E assertions, each listed in its task:
  - `surfaces.test.ts:585-594` (stepper, T17);
  - `:891` (breadcrumb, T17);
  - `:1006-1009` (the `kitRow` comment, T11);
  - `:1044-1047` (brand-kit tab stops, T11);
  - `:615` (kit select name, T9).

  011's `spec.md` is not edited.

- **012 (per-channel captions) builds on wave 1.** Its caption panels import `SectionHead`, `Notice` and `FieldLabel` from `src/components/ui`. Nothing in 014 waits on 012.
  - `CopyEditor.tsx` gets only an `aria-labelledby` (row 26) and the B import swap, so 012's rewrite starts from the shared primitives.
- **010** still owns its `QueueEntryModal` `toHaveCount(2)` assertion (out of scope here).
- **The fork CI (013)** is independent. The gates run locally until Actions are re-enabled.

## Notes

- **Where each party finding is resolved:**

  | Finding                                                                                  | Resolved in                                                                                                       |
  | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
  | architect: labels must be `FieldLabel`; Select primitive or call sites; brief kit select | FR-06 (in the primitive), FR-12 (every label is `FieldLabel` or visible text), FR-06 assigns the kit select to T9 |
  | architect: PageHead/Section/Notice props and heading level                               | FR-01, FR-04, `design.md` §3                                                                                      |
  | architect: the eighth copy and the residue                                               | "The copies B replaces" (#3 `brief/page.tsx`), FR-02's residue rule, FR-05                                        |
  | architect: overflow focus owner and test                                                 | FR-17 (static rule, the user's decision), AC-16                                                                   |
  | architect: guard removals in the same commit; token matching                             | FR-11, AC-10                                                                                                      |
  | architect: the source and scale of control heights                                       | FR-07, AC-06                                                                                                      |
  | architect: which artifact the stepper change edits                                       | FR-15, Dependencies                                                                                               |
  | architect: a repeatable capture diff                                                     | AC-04, `design.md` §7                                                                                             |
  | architect NOTE: A–C coupling; deferring B and 012                                        | Binding decisions; `tasks.md` waves (T9, T11)                                                                     |
  | architect NOTE / ba: the count                                                           | 8 modules plus 4 components plus inline atoms, enumerated above                                                   |
  | ba: no audit or severity                                                                 | "Classification" (sources stated; AC-19 adds the axe audit)                                                       |
  | ba: falsifiable ACs                                                                      | AC-04 (pixels), AC-08 and AC-16 (static regions), AC-17 (boxes), AC-11 (names), AC-19 (axe)                       |
  | ba: "accent primary", "per size"                                                         | FR-08 (quote and reading), FR-07 (the scale)                                                                      |
  | po BLOCK: bundle, E2E per task, no count                                                 | The user's decision (one change, E2E per wave); `tasks.md`: 18 tasks, 3 full E2E runs                             |
  | po: B's value against "one canonical copy, documented"                                   | Below                                                                                                             |
  | po: overflow measurement; brief first                                                    | FR-17 (static); T13 (login, library, brief) opens wave 3                                                          |
  | po: no value stated for heights or the cap                                               | FR-07 (inputs about 44.5 px against 36 px buttons today), FR-09 (about 200 kits in the test DB)                   |

- **Why not "pick one copy and document it" (party-po).** Documentation already said "carry the study's patterns" (DESIGN_SYSTEM §6), and three `SectionHead` components and a fifth `SMALL_CAPS` variant still appeared within one change. A documented canonical copy that is not importable gets copied again. The primitives cost 8 small tasks, and every one is checked by an unchanged E2E suite.
- **Run tasks one at a time,** even within a wave: lint-staged stashes.
- **Before each wave's full E2E:** stop stray node processes, `rm -rf .next`, and drop and recreate the test DB.
