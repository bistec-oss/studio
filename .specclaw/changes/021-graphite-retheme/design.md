# Design: Re-theme the app from Folio to Graphite

**Change:** 021-graphite-retheme
**Created:** 2026-10-18

The source of truth for the look is `docs/ui-reference/direction-studies/study-a-graphite.html` (token block at lines 25–99, component CSS at lines 102–335; screenshots `shots/a-light.png` and `shots/a-dark.png`). This document turns it into concrete edits on the fork's structure. Where the two disagree, this document records the decision and the reason. Until T8, this document and the study supersede the Folio `DESIGN_SYSTEM.md` for 021 work.

## Technical Approach

### 1. Token map (FR-01, R4)

**Every name is kept, and only values change.** The `:root` / `.dark` blocks in `globals.css` stay in the R G B-triplet shape. Values are the study's, verbatim. A `/* prettier-ignore */` stays on `:root`, as in 011 T4, so `0.10` is not reprinted as `0.1`.

| Token                          | Folio light → **Graphite light**                                                               | Folio dark → **Graphite dark**                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `--canvas`                     | 246 243 237 → **241 240 237**                                                                  | 25 22 19 → **17 17 16**                                                                                               |
| `--surface-1`                  | 251 249 245 → **251 251 250**                                                                  | 32 28 24 → **26 26 24**                                                                                               |
| `--surface-2`                  | 255 254 251 → **255 255 255**                                                                  | 41 36 31 → **35 35 32**                                                                                               |
| `--fg`                         | 33 28 24 → **24 24 22**                                                                        | 240 234 223 → **238 237 234**                                                                                         |
| `--fg-muted`                   | 104 95 86 → **99 97 92**                                                                       | 170 159 144 → **160 157 150**                                                                                         |
| `--line`                       | 145 134 122 → **134 131 124**                                                                  | 126 116 104 → **116 113 106**                                                                                         |
| `--line-subtle`                | 226 219 207 → **226 224 219**                                                                  | 58 52 45 → **46 46 43**                                                                                               |
| `--accent`                     | 140 72 18 → **24 24 22**                                                                       | 230 152 96 → **238 237 234**                                                                                          |
| `--accent-fg`                  | 255 254 251 → **250 250 249**                                                                  | 25 22 19 → **24 24 22**                                                                                               |
| `--focus`                      | 140 72 18 → **24 24 22**                                                                       | 230 152 96 → **238 237 234**                                                                                          |
| `--status-draft`               | 104 95 86 → **95 93 87**                                                                       | 176 166 152 → **181 178 171**                                                                                         |
| `--status-exported`            | 107 63 160 → **105 65 198**                                                                    | 198 168 242 → **185 163 255**                                                                                         |
| `--status-scheduled`           | 120 84 0 → **138 76 0**                                                                        | 226 184 84 → **245 181 71**                                                                                           |
| `--status-published`           | 44 102 55 → **30 112 62**                                                                      | 142 198 142 → **111 207 142**                                                                                         |
| `--status-failed`              | 176 36 30 → **180 35 24**                                                                      | 246 142 122 → **255 138 122**                                                                                         |
| `--shadow-panel`               | `none` → **`0 1px 2px rgb(24 24 22 / 0.04), 0 6px 20px -10px rgb(24 24 22 / 0.10)`**           | `none` → **`inset 0 1px 0 rgb(255 255 255 / 0.04), 0 1px 2px rgb(0 0 0 / 0.30), 0 8px 24px -12px rgb(0 0 0 / 0.50)`** |
| `--shadow-raised`              | `4px 4px 0 0 …` → **`0 1px 2px rgb(24 24 22 / 0.06), 0 14px 36px -14px rgb(24 24 22 / 0.22)`** | **`inset 0 1px 0 rgb(255 255 255 / 0.06), 0 2px 4px rgb(0 0 0 / 0.30), 0 18px 44px -14px rgb(0 0 0 / 0.70)`**         |
| `--shadow-overlay`             | `6px 6px 0 0 …` → **`0 2px 6px rgb(24 24 22 / 0.06), 0 32px 64px -24px rgb(24 24 22 / 0.30)`** | **`inset 0 1px 0 rgb(255 255 255 / 0.07), 0 4px 10px rgb(0 0 0 / 0.30), 0 40px 80px -24px rgb(0 0 0 / 0.80)`**        |
| `--scrim`                      | 33 28 24 → **24 24 22**                                                                        | 0 0 0 → **0 0 0**                                                                                                     |
| `--radius-sm` / `md` / `lg`    | 2 / 4 / 6 px → **8 / 12 / 18 px**                                                              | (`:root` only)                                                                                                        |
| `--radius-pill`                | 999px → **999px**                                                                              |                                                                                                                       |
| `--control-sm` / `md` / `lg`   | 30 / 36 / 40 px → **32 / 38 / 44 px** (A1; not in the study)                                   |                                                                                                                       |
| `--dur-fast` / `base` / `slow` | 120 / 180 / 240 ms → **140 / 220 / 380 ms**                                                    |                                                                                                                       |
| `--ease-standard`              | `cubic-bezier(0.2, 0, 0, 1)` → **`cubic-bezier(0.32, 0.72, 0, 1)`**                            |                                                                                                                       |
| `--ease-exit`                  | `cubic-bezier(0.3, 0, 1, 1)` → **`cubic-bezier(0.4, 0, 0.7, 0.2)`**                            |                                                                                                                       |
| `--text-2xs` … `--text-2xl`    | 11 / 12 / 13.5 / 15 / 18 / 24 / 42 px → **11 / 12 / 13 / 14 / 16 / 20 / 28 px**                |                                                                                                                       |
| `--space-1` … `--space-8`      | unchanged values (4 / 8 / 12 / 16 / 24 / 32)                                                   |                                                                                                                       |

**Keys added:**

- `--radius-xl: 26px`, for bezel cards;
- `--space-5: 20px`;
- `--space-10: 40px`.

**Keys removed:**

- `--space-12`, which is not in the study and has no user (`grep 'var(--space' src` is 0);
- `--font-display`, a next/font variable, gone with Fraunces.

**Not copied from the study:**

- `--font-sans` / `--font-mono`: next/font supplies them (the 011 T4 rule, asserted by the existing designTokens case);
- `--control-*`: kept as 014's keys.

**Totals:** `:root` goes from 45 to 47 declarations, and `.dark` stays at 19.

The **deviation map is empty**: every study value passes the 011 thresholds (§9).

### 2. Tailwind mapping (FR-02)

| Key                                                                                                                       | Change                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `colors.*` (canvas, surface, surface.raised, fg, fg.muted, line, line.subtle, accent, accent.fg, focus, scrim, status-×5) | **Unchanged.** Still `rgb(var(--x) / <alpha-value>)`.                                                                                                                                                                         |
| `boxShadow.panel / raised / overlay`                                                                                      | Unchanged (`var(--shadow-*)`). Graphite's values are layered, and Tailwind's ring and shadow composition still works because the value is a var.                                                                              |
| `borderRadius`                                                                                                            | **Add `'ui-xl': 'var(--radius-xl)'`.** `ui-sm`, `ui-md`, `ui-lg` and `ui-pill` are unchanged keys. Tailwind defaults are not redefined. The existing `xl` / `2xl` / `full` entries are equal to Tailwind's defaults and stay. |
| `opacity`                                                                                                                 | **Add `'12': '0.12'`**, so `bg-status-failed/12` works (A2).                                                                                                                                                                  |
| `letterSpacing`                                                                                                           | **Add `label: '0.14em'`**: the one small-caps tracking, used only in `SMALL_CAPS`. Headings use Tailwind's default `tracking-tight` (−0.025em, the study's h1).                                                               |
| `fontFamily`                                                                                                              | **Exactly `sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif']` and `mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace']`.** `display` and `text` are removed (R5).                  |
| `spacing.control-*`, `fontSize.ui-*`, `transitionDuration`, `transitionTimingFunction`, `maxWidth.canvas`                 | Unchanged keys; the values come through the vars.                                                                                                                                                                             |

### 3. Fonts (FR-03, R5)

`src/app/layout.tsx`:

- `Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap', fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'] })`, which is a variable font, so weights 400–700 need no list;
- `JetBrains_Mono`, unchanged (`--font-mono`);
- the body class is `${jakarta.variable} ${jetbrainsMono.variable} font-sans`.

The `Fraunces` and `Instrument_Sans` imports are deleted.

**Use-site map.** `font-text` is confirmed as a pure alias of `font-sans` (`fontFamily.text = ['var(--font-sans)']`).

| Utility        | Today                      | Use sites                                                                                  | Action in T1                                                                                                                                                                                                                                        |
| -------------- | -------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `font-sans`    | Instrument Sans (the body) | 5                                                                                          | Points at Plus Jakarta Sans. Kept.                                                                                                                                                                                                                  |
| `font-mono`    | JetBrains Mono             | 17                                                                                         | Kept.                                                                                                                                                                                                                                               |
| `font-text`    | Instrument Sans (alias)    | **43 occurrences in 32 files** (incl. the `tailwind.config.ts` key and the layout comment) | **Delete the token** from each class string. The body sets `font-sans`, and preflight sets `font-family: inherit` on form controls. If a site sits inside a `font-mono` ancestor, it becomes `font-sans` (none is expected; the implementer greps). |
| `font-display` | Fraunces                   | **38 occurrences in 25 files** (incl. 2 in layout and globals comments)                    | **Delete the token.** Delete any `[font-variation-settings:'opsz'_N]` beside it (12 lines). `italic` and the weight stay until the shared atoms (T2) or the screen task (wave 2) restyle the heading.                                               |

The whole-class-token count is **79** (81 line hits minus the two `--font-*` var references). After T1 the guard forbids both names (§6, patterns 2–3).

### 4. Primitives (FR-04, FR-05)

#### 4.1 Surface classes (`globals.css`, `@layer components`)

Each sets `background-color`, never the shorthand, and none has `backdrop-filter` or an alpha. Hairlines are drawn as box-shadow rings, as the study does, not borders, so no layout shifts by 1 px.

| Class                      | Use                                                      | Values                                                                                                                                                                                                                 |
| -------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.surface`                 | in-flow panel, card                                      | `surface-1`, `radius-lg`, `box-shadow: var(--shadow-panel)`                                                                                                                                                            |
| `.surface-bezel` **(new)** | page-level section card, the preview stage (A4)          | `surface-1` fill, `border: 6px solid rgb(var(--line-subtle))`, `border-radius: var(--radius-xl)` (so the inner radius is 20 px), `background-clip: padding-box`, no shadow. The caller adds padding (study: 18–20 px). |
| `.surface-raised`          | menus, popovers, the font listbox                        | `surface-2`, `radius-md`, `box-shadow: var(--shadow-raised), 0 0 0 1px rgb(var(--line-subtle))`                                                                                                                        |
| `.surface-overlay`         | modals, the drawer, confirm, toasts, the lightbox chrome | `surface-2`, `radius-lg`, `box-shadow: var(--shadow-overlay), 0 0 0 1px rgb(var(--line-subtle))`                                                                                                                       |

**Keyframes:**

- `drop` / `.animate-drop` are deleted.
- They are replaced by `pop` (`translateY(-4px) scale(0.97)` → none, over `--dur-base` `--ease-standard`, `transform-origin` set by the caller; menus) and `rise` (`translateY(12px) scale(0.98)` → none, over `--dur-slow`; toasts), each with an `.animate-pop` / `.animate-rise` class. Neither is used on a transform-centred element.
- `modalIn` keeps its `translate(-50%,-50%)` and moves to `var(--dur-base) var(--ease-standard)`.

The reduced-motion block is unchanged except that its fade selector covers `.surface-raised`, the toast and `.animate-pop`.

#### 4.2 Shared atoms (`src/components/ui/atoms.ts`, ex-`folio.ts`)

| Atom                    | Graphite value                                                                                                                                        | Study source                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `FOCUS`, `SCROLL_FOCUS` | unchanged (a 2 px `--focus` outline, offset 2 / inset)                                                                                                | `:focus-visible`                         |
| `SMALL_CAPS`            | `text-ui-2xs font-semibold uppercase tracking-label`                                                                                                  | `.label`, `.nav-sec > span`              |
| `EYEBROW`               | `${SMALL_CAPS} text-fg-muted`                                                                                                                         | the same                                 |
| `PAGE_TITLE`            | `text-ui-xl md:text-ui-2xl font-bold leading-[1.15] tracking-tight`                                                                                   | `.page-head h1` (28 px / 700 / −0.025em) |
| `PAGE_LEAD`             | `mt-1.5 text-ui-sm text-fg-muted`                                                                                                                     | `.meta`                                  |
| `SECTION_HEAD`          | `text-ui-lg font-semibold leading-snug tracking-[-0.01em]`                                                                                            | `.card-hd h2` (16 px / 600)              |
| `SUB_HEAD`              | `text-ui-base font-semibold leading-snug text-fg`                                                                                                     | the `.toast b` / `.thread p` weight      |
| `SECTION_NUMERAL`       | **removed in T8** (unrendered by SectionHead from T2; direct spans removed in wave 2)                                                                 | none                                     |
| `NOTICE`                | `rounded-ui-md px-4 py-3 text-ui-sm`. No currentColor ring: the 0.12 tint carries it.                                                                 | `.st-*` tint                             |
| `ICON` / `ICON_SM`      | `{ size: 16, strokeWidth: 1.6 }` / `{ size: 14, strokeWidth: 1.6 }`                                                                                   | `.i`, `.i-sm`                            |
| `ICON_BUTTON`           | `inline-flex h-control-sm w-control-sm … rounded-ui-pill text-fg-muted …` (callers add `hover:bg-surface-raised hover:text-fg`)                       | `.vnav`, `.x`                            |
| `TEXT_LINK`             | unchanged (accent = ink, underlined in `--line`)                                                                                                      | none                                     |
| `TAG`                   | `inline-flex max-w-full items-center gap-1 rounded-ui-pill bg-canvas px-2.5 py-0.5 text-ui-xs font-medium text-fg ring-1 ring-inset ring-line-subtle` | `.sugg button`                           |
| `PILL_BADGE` **(new)**  | `inline-block rounded-ui-pill bg-accent px-1.5 text-[10px] font-semibold leading-4 text-accent-fg` ("Current", "active", "Default")                   | `.v .cur`                                |
| `TABLE_HEAD_ROW`        | `border-b border-line-subtle text-left text-ui-2xs font-semibold text-fg-muted` (no uppercase)                                                        | `.ct th`                                 |
| `COMPACT_FIELD`         | the §4.3 field at `text-ui-sm`, `h-control-sm`, `rounded-ui-pill px-3`                                                                                | `.ask`                                   |
| `COMPACT_TEXTAREA`      | the same at `rounded-ui-md py-1.5`                                                                                                                    | `.field`                                 |
| `ROW` (from team)       | `border-b border-line-subtle py-3`                                                                                                                    | `.thread li + li`                        |
| `BLOCK` (from team)     | `border-t border-line-subtle pt-4` (the 2 px ink rule goes). T7 may replace it with a bezel card; T8 deletes it if it is unused.                      | none                                     |

#### 4.3 Components

| Primitive                                    | Graphite restyle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Kept                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| **Button**                                   | **Base:** `rounded-ui-pill font-semibold`, transition on transform / bg / shadow at `duration-fast ease-standard`, `enabled:active:scale-[0.98] motion-reduce:enabled:active:scale-100`, focus `focus-visible:outline-2 outline-offset-2 outline-focus` (no ring, so the hairline ring is free). **Variants:** `primary` = `bg-accent text-accent-fg shadow-raised` (`.btn-pri`); `secondary` = `bg-surface-raised text-fg shadow-panel ring-1 ring-inset ring-line-subtle`, hover `shadow-raised`, `aria-expanded:ring-line` (`.btn-sec`); `ghost` = `bg-transparent text-fg-muted hover:text-fg hover:bg-surface-raised` with no underline (`.btn-ghost`); `danger` = the secondary shape with `text-status-failed`; `ink` = `bg-fg text-canvas shadow-none` (A13). **Sizes:** `h-control-sm px-3 text-ui-xs` / `h-control-md px-4 text-ui-sm` / `h-control-lg px-5 text-ui-base`. | variant names, sizes, props                              |
| **Panel**                                    | `cn(bezel ? 'surface-bezel' : 'surface', className)`. New optional `bezel?: boolean`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | the div, props                                           |
| **Input / Select / `fieldClasses`**          | Single-line: `rounded-ui-pill h-control-md px-4 border bg-surface-raised text-ui-sm`. Textarea (`fieldClasses`): `rounded-ui-md px-4 py-3.5 leading-relaxed`. Focus: `focus:outline-2 focus:outline-offset-2 focus:outline-focus`, edge `fieldEdge()` unchanged (`border-line` / `border-status-failed`). The Select chevron is unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | ids, labels, `aria-*`, `inputClasses` height             |
| **FieldLabel**                               | `block text-ui-sm font-semibold text-fg` (sentence case).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `label`/`span`, `htmlFor`, `id`                          |
| **SectionHead**                              | `SECTION_HEAD` / `SUB_HEAD`. **Does not render `numeral`** (A11); the prop stays typed until T8. The wrapper is `flex flex-wrap items-center justify-between gap-x-3 gap-y-2`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `title`, `level`, `id`, tail slot                        |
| **PageHead / PageTitle**                     | `PAGE_TITLE`, `PAGE_LEAD`, and `EYEBROW` above (A7).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | the props, h1                                            |
| **StatusChip**                               | `inline-flex items-center gap-1.5 h-6 pl-2 pr-2.5 rounded-ui-pill text-ui-xs font-semibold whitespace-nowrap flex-shrink-0`, plus a 6 px `before:` dot in `currentColor` and `bg-status-x/12 text-status-x` (`.chip`). No uppercase and no ring.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | labels, tones, overloads                                 |
| **Notice**                                   | `NOTICE` plus tone `bg-status-x/12 text-status-x`. Info: `bg-accent/12 text-accent`. Neutral: `bg-surface text-fg ring-1 ring-inset ring-line-subtle`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | the no-role rule, pass-through                           |
| **SegmentedToggle**                          | **Track:** `inline-flex gap-0.5 p-[3px] rounded-ui-pill bg-canvas ring-1 ring-inset ring-line-subtle`. **Tab:** `rounded-ui-pill px-3 py-1.5 text-ui-xs font-semibold`; active `bg-surface-raised text-fg shadow-panel`, idle `text-fg-muted hover:text-fg`; focus outline (no `overflow-hidden` any more). (`.theme-btn`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `tablist` / `tab`, `aria-selected`, the required `label` |
| **Modal / Drawer**                           | Content `.surface-overlay`; the title is `SECTION_HEAD`; the close button is `ICON_BUTTON`. The scrim is `bg-scrim/50` (unchanged).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `animate-modal-in`, sizes, Radix                         |
| **ConfirmDialog**                            | On Modal; its buttons are Button variants.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | names, roles                                             |
| **ImageLightbox**                            | The chrome (close, caption) is `.surface-overlay rounded-ui-pill`; content `animate-pop`; the scrim is `bg-scrim/80`. The image is untouched.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | names, download                                          |
| **QueryError**, **ModelPicker**              | On Panel and the field helpers; `font-text` removed (T1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | props, names                                             |
| **ToastProvider**                            | The toast is `.surface-overlay rounded-ui-lg`, 340 px wide, `animate-rise`. The title is `text-ui-sm font-semibold`, the body `text-ui-xs text-fg-muted`, and there is a 30 px status disc (`bg-status-x/12`). The offset is `{ bottom: 96, right: 24 }`, with the same `mobileOffset` (the 52 px FAB at 24 px, plus a 20 px gap).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | unstyled Sonner, the back-toast rule                     |
| **GateNotice** (moved from `team/folio.tsx`) | A bezel Panel, the icon, `SECTION_HEAD`, and a muted body.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | props, `Back to Dashboard` link                          |

### 5. Shell, logo, login and choose-team (FR-08, FR-09)

- **Header** (`AppShell.tsx`): `fixed top-0 inset-x-0 z-40 h-20 bg-canvas` (the band), holding the island `absolute inset-x-3 top-3 h-14 flex items-center justify-between pl-[18px] pr-2.5 bg-surface-raised rounded-ui-lg shadow-panel`. The band keeps scrolled content out of the 12 px gutter.
- **Desktop sidebar:** a band `fixed left-0 top-20 bottom-0 w-[268px] bg-canvas`, holding the island `absolute left-3 right-3 top-0 bottom-3 flex flex-col gap-[18px] p-3 bg-surface rounded-ui-lg shadow-panel`.
- **Mobile sidebar:** the same island inside the Radix Dialog (`fixed left-3 top-3 bottom-3 w-[244px]`), with the `bg-scrim/30` overlay unchanged.
- **Nav items:**
  - layout: `flex items-center gap-[11px] px-2.5 py-2 rounded-ui-sm text-ui-sm font-medium text-fg-muted hover:bg-canvas hover:text-fg`;
  - current page: `bg-surface-raised text-fg shadow-panel ring-1 ring-inset ring-line-subtle`;
  - icons (A9), `aria-hidden`, at `ICON`: LayoutDashboard (Dashboard), BookOpen (Library), FolderOpen (Projects), Megaphone (Campaigns), Palette (Brandkits), Building2 (Team Settings, Teams), Users (Users), UserCog (Settings), LogOut (Sign out);
  - section labels: `EYEBROW px-2.5 pb-1`;
  - the footer sits above a `border-t border-line-subtle` rule.
- **Main:** `md:ml-[268px]`. Inner padding is `pt-[10px]` (content starts 90 px down, as in the study), `pb-[140px]`, `px-4 md:pl-5 md:pr-7`, `max-w-canvas`.
- **TeamSwitcher** (`.team`): `w-full flex items-center gap-2.5 p-2 rounded-ui-md bg-surface-raised ring-1 ring-inset ring-line-subtle`, then:
  - a 32 px `rounded-[10px] bg-canvas` initials avatar (`aria-hidden`);
  - the name at `text-ui-sm font-semibold`, over the role line at `text-ui-2xs text-fg-muted`;
  - an up/down chevron.

  The menu is `.surface-raised animate-pop`, with `origin-top-left`. `aria-label="Switch team"` is kept.

- **ThemeToggle** (A8): a `group "Theme"`, with a canvas pill track and two 32 × 30 segments holding Sun and Moon icons. The current one is `bg-surface-raised text-fg shadow-panel`. The `aria-label`s are "Light" and "Dark" (each with a `title`), and `aria-pressed` is kept. Highlighting still keys on `.dark`, so first paint is right.
- **CreatePostButton** (`.fab`):
  - placement and size: `fixed bottom-6 right-6 z-30 inline-flex items-center gap-2.5 h-[52px] rounded-ui-pill pl-[7px] pr-5`; below `md` it is a 52 × 52 circle with the icon only;
  - colour: `bg-accent text-accent-fg text-ui-sm font-semibold shadow-overlay`;
  - the nub: a 38 px circle `bg-accent-fg/[0.14]` holding Plus, `group-hover:rotate-90 motion-reduce:group-hover:rotate-0`;
  - press: `active:scale-[0.98] motion-reduce:active:scale-100`.

  The hover lift and the hard press shadow are removed. Its name, testid and `title` are kept.

- **Logo** (A6):
  - `git checkout 7fdbe38^ -- public/BistecStudioLogo.png`;
  - `Logo.tsx` is restored to its `7fdbe38^` content, with the header comment refreshed;
  - the callers are `<Logo height={32} />` in the header and `<Logo height={48} />` on login.
- **Login:**
  - a centred `max-w-sm` bezel Panel (`p-8`) holding the logo, the muted "Sign in to continue", the Inputs and a full-width primary Button;
  - the `sr-only` h1 "Sign in to Studio" is kept (014 FR-14);
  - the 2 px ink rule goes.
- **Choose-team:** a PageTitle, then a bezel card listing teams as `.team`-style buttons (name, plus a role line). Each button's name is still the team name.

### 6. The guard deny-list (FR-13, R7) and its staging

These are added to `tests/unit/uiTokenGuard.test.ts` beside the existing 011 and 014 patterns. The scan stays `src/**/*.{ts,tsx,css}`.

- `START` / `END` are the existing whole-token boundaries.
- Each pattern gets a "fires" sample and a "passes" sample in the self-test.
- `ui-exception:` does **not** exempt patterns 1–10: there is no legitimate Folio leftover.

| #   | Pattern                                                                                                | Catches                                                                                                                             | Last hit removed in → switched on in                                           |
| --- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | `/fraunces\|instrument[ _]sans/i`                                                                      | the Folio families                                                                                                                  | T1                                                                             |
| 2   | `${START}font-(?:display\|text)${END}`                                                                 | removed font utilities                                                                                                              | T1                                                                             |
| 3   | `/opsz\|font-variation-settings/`                                                                      | Fraunces optical-size settings                                                                                                      | T1                                                                             |
| 4a  | a file whose name matches `/folio/i`, and `/from\s+['"][^'"]*folio[^'"]*['"]/`                         | the module paths                                                                                                                    | T2                                                                             |
| 4b  | `/\bfolio\b/i` on any line, comments included                                                          | Folio names in comments and identifiers. `portfolio` passes.                                                                        | T8 (wave 2 rewords the comments)                                               |
| 5   | `/tracking-\[0?\.\d+em\]/`                                                                             | a literal positive letter-spacing (the small-caps literal, Folio's `0.1em` table head)                                              | T6 (the last hit is `KitDetail.tsx:517`)                                       |
| 6   | `${START}uppercase${END}` in `src/app/**` and `src/components/**`, except `src/components/ui/atoms.ts` | small caps outside the one atom                                                                                                     | T6 (the same line)                                                             |
| 7   | `/proof[- ]plate\|crop[- ]mark/i` and `/\bCROP\b/`                                                     | the Folio post plate                                                                                                                | T5                                                                             |
| 8   | `/(?<![\d.-])[1-9]\d*px[ _][1-9]\d*px[ _]0(?:px)?(?=[ _])/`                                            | a hard offset shadow (non-zero x and y, zero blur), in CSS or an arbitrary class. Graphite's `0 1px 2px` / `0 6px 20px -10px` pass. | T3 (the last hit is `CreatePostButton.tsx:33`; T1 removes the four token hits) |
| 9   | `${START}border-[tb]-2${END}`                                                                          | Folio's 2 px block rule                                                                                                             | T8 (wave 2 removes 34 sites in 23 files)                                       |
| 10  | `${START}animate-drop${END}`                                                                           | Folio's entrance                                                                                                                    | T2                                                                             |

**Existing patterns, changed:**

- 014's `SMALL_CAPS_LITERAL` (`tracking-[0.14em]` outside `ui/`) is superseded by pattern 5, which applies inside `ui/` too.
- The shared-name list gains `PILL_BADGE` and `GateNotice`.
- The self-test file paths move from `team/folio.tsx` / `ui/folio.ts` to `team/ApiKeysCard.tsx` / `ui/atoms.ts`.

`designTokens.test.ts`'s walk list moves from `ui/folio.ts` to `ui/atoms.ts`.

**Dry run at plan time** (current `v2`): pattern 1 has 9 line hits, 2 has 79, 3 has 12, 7 has 8, and 8 has 5. Every pattern matches only Folio code, with no false positive in `src/lib`, `src/mcp` or the API routes.

### 7. The helper fold (FR-06, R8)

The rule: **an atom used by more than one screen group lives in `src/components/ui/atoms.ts`; an atom used by one group lives in that group's `classes.ts`**, and those are named below. The modules move with `git mv`, then their imports are rewritten. The only content changes are §4.2's.

| From                                                                                                                              | To                                                                                                                          | Contents                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/ui/folio.ts` (43 importers, plus the `index.ts` re-export)                                                        | `src/components/ui/atoms.ts`                                                                                                | every shared atom (§4.2)                                                                                                                                                                                          |
| `src/components/team/folio.tsx` (12 importers across `/team`, `/settings`, `/admin/users`, `/admin/teams` and `admin/layout.tsx`) | `BLOCK` and `ROW` into `ui/atoms.ts`; `GateNotice` into **`src/components/ui/GateNotice.tsx`**, exported from `ui/index.ts` | It spans four screens, so it goes to `ui`.                                                                                                                                                                        |
| `src/components/campaigns/folio.ts` (4 importers)                                                                                 | `src/components/campaigns/classes.ts`                                                                                       | **Feature-only:** `ROW_TITLE` (campaign/project list titles), `CRUMB_LINK` and `CRUMB_CURRENT` (campaign/project detail breadcrumbs), `ASIDE_BLOCK` (detail aside). Used only by the four campaign/project pages. |
| `src/components/admin/brandkits/folio.ts` (2 importers)                                                                           | `src/components/admin/brandkits/classes.ts`                                                                                 | **Feature-only:** `rowCls` (the kit list row), `optionCls` (the template size option), `CODE_FIELD` (the template HTML field), `TITLE_FIELD` (the kit name editor). Used only by the brand kits admin.            |

`src/components/brief/cardCls.ts` is already neutrally named and feature-only (`cardCls`, `rowCls`), so it is not moved.

### 8. Screens (FR-10, FR-11)

Every screen task applies the same rules:

- **Page sections** become `<Panel bezel className="p-5">` (or `.surface-bezel`), with a `SectionHead` at `mb-3`.
- **Lists** are ruled rows (`ROW`, `divide-y divide-line-subtle`).
- **Selected rows and cards** take the nav "current" look: `bg-surface-raised shadow-panel ring-1 ring-inset ring-line-subtle`. A selected version or template is `ring-[1.5px] ring-inset ring-fg` (`.v[aria-current]`).
- **Remove** `border-t-2` / `border-b-2` block rules and the `numeral=` arguments.
- **`SMALL_CAPS` uses** become `PILL_BADGE` (badges), a sentence-case `text-ui-xs font-semibold` in the status colour (status words), or stay (captions), per FR-07.
- **Reword** comments that name Folio. Keep the `§` numbers (A10).
- **Raw submit / Send buttons** take the study's `.send`: a 34 px `rounded-full bg-accent text-accent-fg` circle with the icon, keeping `aria-label` / visible text as today. Where a test reads the visible word, keep the word.

**Groups:**

| Task | Group                                  | Files                                                                                                                                                                                             |
| ---- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T4   | dashboard, library, brief wizard       | `src/app/(app)/page.tsx`, `src/components/dashboard/*`, `src/app/(app)/library/page.tsx`, `src/components/library/*`, `src/app/(app)/brief/page.tsx`, `src/components/brief/*`                    |
| T5   | draft review and refine                | `src/app/(app)/drafts/[id]/page.tsx`, `src/components/drafts/*`                                                                                                                                   |
| T6   | campaigns, projects, queue, brand kits | `src/app/(app)/campaigns/**`, `src/app/(app)/projects/**`, `src/components/campaigns/*`, `src/app/(app)/admin/brandkits/page.tsx`, `src/components/admin/brandkits/*`                             |
| T7   | team, settings, admin users and teams  | `src/app/(app)/team/{layout,page}.tsx`, `src/components/team/*`, `src/app/(app)/settings/page.tsx`, `src/components/settings/*`, `src/app/(app)/admin/{layout.tsx,users/page.tsx,teams/page.tsx}` |

**The draft page (T5), replacing the proof plate** (`.stage-shell`, `.stage-core`, `.versions`):

- **Page head across the top:**
  - the "← Library" back link (`text-ui-xs font-medium text-fg-muted`);
  - the h1 (`PAGE_TITLE`, truncating with a `title`);
  - the meta row: `StatusChip` · channels · kit · size, with 3 px dots;
  - the action bar on the right: Regenerate design (secondary), Edit inline, Re-export / Export (secondary), and Publish (primary, team admin), optionally with the `.btn-pri` nub span. Every name is unchanged.
- **The grid:** `grid gap-5 xl:grid-cols-[0.92fr_1.08fr] items-start`. The preview comes first in DOM order, so it is on top below `xl`.
- **The stage:** `<section aria-label="Preview" className="surface-bezel p-7">`, holding:
  - the bar: `EYEBROW` "Preview" and a mono `text-[11px] text-fg-muted` "1080 × 1350 · vN of M";
  - the post: max 392 px wide, centred, at its own ratio, `object-contain`. **The immediate wrapper is square, with no radius or filter** (A3, the existing E2E). The expand button keeps its `ui-exception`.
  - the versions: `grid grid-cols-4 gap-2` of `.v` buttons (a 44 × 55 thumbnail at the post ratio, `v1` in mono, the label in `text-ui-2xs` muted). The current one gets the 1.5 px `fg` ring and a `PILL_BADGE` "Current";
  - the note (`text-ui-xs` muted, with a clock icon) and Undo (a ghost sm Button), as today.
  - **No previous/next arrows** (A5).
- **The right column:** `HeadlinePanel`, `CaptionPanels` / `CaptionPanel` and `RefinementPanel` as bezel cards, each with a `.card-hd`.
  - **Fields:** `fieldClasses`. The counter is mono and right-aligned.
  - **Saved / Unsaved:** `text-ui-xs font-semibold` in `status-published` / `status-scheduled`.
  - **Refine log rows:** a 22 px status disc (`bg-status-x/12 text-status-x`, with a check or alert icon), the instruction (`text-ui-sm font-medium`), a muted `text-ui-2xs` status line ("Applied"; "Brand conflict" in `status-scheduled` 600), and a mono time (the session-local time the request was sent), on `line-subtle` dividers. The status line carries no version number (T5 review: the row holds none in state, and adding one would change behaviour).
  - **Suggestions:** `TAG` pills.
  - **Prompt:** a pill `COMPACT_FIELD`-style form with the round `.send` Send. The "Refine requests" region, its focusability and every name are kept.
- **`NotAppliedCard`** (red, `role="alert"`) and **`BackgroundNotice`** (amber, `role="status"`, `data-testid`, `data-reason`) move onto `Notice` at 0.12.
- **`InlineEditModal` `EDITOR_STYLE`:** the injected hover and focus outlines change from `rgba(140,72,18,.35|.9)` to `rgba(24,24,22,.35|.9)`, with a `// ui-exception:` saying the CSS runs inside the post iframe.

### 9. Contrast check of the study tokens (R10, NFR-01)

Computed at plan time with `tests/unit/contrast.test.ts`'s method: WCAG 2.2 relative luminance, chips as the status colour over its own tint, 8-bit rounded, over the worst of canvas / surface-1 / surface-2. Thresholds: 4.5:1 for text, 3:1 for `line` and `focus`. The script is in the session scratchpad (`contrast-graphite.mjs`).

| Pair (worst case)                                                        | Light                                | Dark                             | Needs |
| ------------------------------------------------------------------------ | ------------------------------------ | -------------------------------- | ----- |
| fg / canvas · surface-1 · surface-2                                      | 15.60 · 17.17 · 17.78                | 16.14 · 14.89 · 13.46            | 4.5   |
| fg-muted / canvas · surface-1 · surface-2                                | 5.43 · 5.97 · 6.19                   | 6.98 · 6.44 · 5.82               | 4.5   |
| accent-fg / accent                                                       | 17.02                                | 15.19                            | 4.5   |
| accent / canvas · surface-1 · surface-2                                  | 15.60 · 17.17 · 17.78                | 16.14 · 14.89 · 13.46            | 4.5   |
| status-draft · exported · scheduled · published · failed chip **@ 0.12** | 4.89 · 4.89 · 4.97 · **4.56** · 4.75 | 5.88 · 5.83 · 6.70 · 6.43 · 5.59 | 4.5   |
| the same @ 0.10 (today's test alpha)                                     | 5.03 · 5.04 · 5.14 · 4.67 · 4.93     | 6.15 · 6.05 · 7.02 · 6.75 · 5.80 | 4.5   |
| line / canvas · surface-1 · surface-2                                    | 3.32 · 3.65 · 3.78                   | 3.88 · 3.58 · 3.24               | 3     |
| focus / canvas · surface-1 · surface-2                                   | 15.60 · 17.17 · 17.78                | 16.14 · 14.89 · 13.46            | 3     |
| (extra) status colours as plain text, worst surface                      | ≥ 5.35                               | ≥ 6.88                           | 4.5   |
| (extra) `info` notice: accent on accent/0.12                             | ≥ 12.7                               | ≥ 10.2                           | 4.5   |

- **Result: no study token fails** at the 011 thresholds, in either theme, at the study's 0.12 chip tint. So the deviation map is empty and no value is adjusted.
- **The one failing case is not a token.** The study's 0.14 tint (`.st-warn`) would put **published** text at **4.41:1** in light. A2 normalises every tint to 0.12, and `contrast.test.ts` moves `CHIP_ALPHA` from 0.10 to 0.12, the stricter case.
- **`--line-subtle`** is 1.16–1.39:1 against the surfaces. It stays out of the test, because it is decorative only (011 T2 note 1).

### 10. The 011 T2 carry-over notes, decided for Graphite

| Note                                                                                               | Applies?   | Decision                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. `--line-subtle` as decorative-only, `--line` as the 3:1 boundary                                | **Yes**    | Kept. `line-subtle` is dividers, the bezel tray and the hairline rings; every field edge is `line`.                                                       |
| 2. Reduced-motion `transition-duration: 1ms` on `*` makes computed reads catch intermediate values | **Yes**    | The block is kept as is (NFR-03). New E2E reads poll (`expect.poll`), as 011 T6 did. Press scale and nub rotation are switched off under `motion-reduce`. |
| 3. `scheduled` is amber, not blue                                                                  | **Yes**    | Graphite's own amber, unchanged. Amber notices stay `status-scheduled`.                                                                                   |
| 4. The studies regroup controls (More menu, Undo by versions, etc.)                                | **Partly** | Undo by the versions is already built (011 T9). The More menu, the Refine button, the prev/next arrows and Delete draft are **not** built (A5).           |

### 11. Tests that reach into styling: the audit, and the expected edits

**The audit (FR-12):**

- No E2E selector keys on CSS-uppercased text. Playwright's `getByText`, `toHaveText` and role names read DOM text, and every small-caps label is uppercased in CSS.
- The three `innerText()` reads are on text that is not uppercased: the register button, and the Windows guide commands.

**Style-coupled assertions, and the task that edits each:**

| Test                                               | Assertion today                                                                            | Edit                                                                                                    | Task                                                                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/noTeamNotice.test.ts:22`               | `<h2 class="font-display …">`                                                              | the class string without `font-display`, then T4's                                                      | T1, T4                                                                                                                    |
| `tests/unit/designTokens.test.ts`                  | the Folio key list, controls 30/36/40, `fonts.display` / `fonts.text`, `ui/folio.ts`       | §1–§3 values; the study-equality case; `ui/atoms.ts`                                                    | T1, T2                                                                                                                    |
| `tests/unit/contrast.test.ts`                      | `CHIP_ALPHA = 0.1`                                                                         | 0.12                                                                                                    | T1                                                                                                                        |
| `tests/unit/uiTokenGuard.test.ts`                  | the Folio-era samples                                                                      | §6                                                                                                      | T1–T8                                                                                                                     |
| `tests/e2e/surfaces.test.ts:298–312`               | the "Studio" wordmark in Fraunces italic                                                   | `img` "Bistec Studio" with a PNG background and `invert(1)` in dark (AC-10)                             | T1                                                                                                                        |
| `tests/e2e/a11y.test.ts:352–414` (AC-07)           | the accent-fill buttons in main                                                            | accent fill **and** a non-`none` resting `box-shadow` (A13); Ink compares on fill **and** `none` shadow | T1 (with Primary's resting `shadow-raised` and Ink's `shadow-none`, the minimal Button change that keeps the suite green) |
| `tests/unit/uiPrimitives.test.ts`                  | the exact Folio class strings (StatusChip, SectionHead numeral "01", FieldLabel `EYEBROW`) | the Graphite strings (AC-07)                                                                            | T2                                                                                                                        |
| `tests/e2e/a11y.test.ts:136–138` (AC-05)           | `textTransform` `uppercase`, `11px`                                                        | `none`, `13px`; the equality across labels stays                                                        | T2                                                                                                                        |
| `tests/e2e/surfaces.test.ts:333–341`               | the FAB lifts 1 px on hover                                                                | the nub rotates 90° on hover (AC-11)                                                                    | T3                                                                                                                        |
| `tests/e2e/surfaces.test.ts:1310–1316`             | the FAB transform is `none` under reduced motion                                           | the FAB and nub transforms are `none`                                                                   | T3                                                                                                                        |
| `tests/e2e/surfaces.test.ts:600–602` (AC-17 draft) | stops `Library`, `View full screen`, `Regenerate design`                                   | the new DOM order: `Library`, then the action bar's first two (FR-11)                                   | T5                                                                                                                        |
| `tests/e2e/surfaces.test.ts:666`                   | the test title says "proof plate"                                                          | the title only ("post stage"); the assertions are unchanged                                             | T5                                                                                                                        |

**New cases:**

- T1: the body font (AC-04);
- T3: header and sidebar geometry, and the sidebar small-caps label (AC-09, AC-11);
- T5: the layout, and no crop marks (AC-12);
- Button press under reduced motion (AC-18), in T2.

Anything outside this table is a defect to explain in the task report.

## Architecture

```
study-a-graphite.html  :root/.dark token block  (source of truth)
        │   values copied verbatim (designTokens.test.ts asserts equality)
globals.css  :root / .dark  ── same names as Folio, Graphite values (+radius-xl, space-5/10; −space-12)
        │
tailwind.config.ts  ── colours unchanged · +ui-xl · +opacity.12 · +tracking-label · fontFamily {sans, mono}
        │
layout.tsx  ── next/font: Plus_Jakarta_Sans → --font-sans · JetBrains_Mono → --font-mono
        │
src/components/ui/atoms.ts  (ex-folio.ts) + .surface / .surface-bezel / .surface-raised / .surface-overlay
        │
src/components/ui/*  (Button pill · Panel/bezel · Input pill · FieldLabel · SectionHead · StatusChip · …)
        │
AppShell islands · Logo (PNG, dark:invert) · login · choose-team        ← the wave 1 cut
        │
screens: T4 dashboard/library/brief · T5 draft · T6 campaigns/projects/brandkits · T7 team/settings/admin
        │
uiTokenGuard deny-list (staged on per task, all on at T8) · new DESIGN_SYSTEM.md
```

The theme mechanism is unchanged: `themeInitScript` and the `.dark` class on `<html>`.

## File Changes Map

| File                                                                                                                                                                                                                                  | Action              | Description                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/globals.css`                                                                                                                                                                                                                 | modify              | Graphite token values and new keys (§1); surface classes incl. `.surface-bezel` (§4.1); `pop` / `rise` replace `drop`; Folio comments reworded (T1, T2) |
| `tailwind.config.ts`                                                                                                                                                                                                                  | modify              | `ui-xl`, `opacity.12`, `letterSpacing.label`; `fontFamily` = sans + mono (§2) (T1)                                                                      |
| `src/app/layout.tsx`                                                                                                                                                                                                                  | modify              | Plus Jakarta Sans + JetBrains Mono only (§3) (T1)                                                                                                       |
| ~40 files under `src/` with `font-display` / `font-text` / `opsz`                                                                                                                                                                     | modify (mechanical) | delete the tokens (§3) (T1)                                                                                                                             |
| `src/components/Logo.tsx`, `public/BistecStudioLogo.png`, `src/app/(auth)/login/page.tsx` and `AppShell.tsx` (the `<Logo>` call only)                                                                                                 | restore / modify    | the PNG logo (A6) (T1); restyled with the shell in T3                                                                                                   |
| `src/components/ui/Button.tsx`                                                                                                                                                                                                        | modify              | T1: Primary's resting `shadow-raised` and Ink's `shadow-none`. T2: the full Graphite restyle                                                            |
| `src/components/ui/folio.ts` → `src/components/ui/atoms.ts`                                                                                                                                                                           | rename + modify     | Graphite atoms, plus `BLOCK`, `ROW`, `PILL_BADGE` (§4.2) (T2)                                                                                           |
| `src/components/ui/GateNotice.tsx`                                                                                                                                                                                                    | create (moved)      | from `team/folio.tsx` (T2)                                                                                                                              |
| `src/components/team/folio.tsx`                                                                                                                                                                                                       | delete              | folded (T2)                                                                                                                                             |
| `src/components/campaigns/folio.ts` → `classes.ts`; `src/components/admin/brandkits/folio.ts` → `classes.ts`                                                                                                                          | rename              | feature-only atoms (§7) (T2)                                                                                                                            |
| ~60 importers of the four modules                                                                                                                                                                                                     | modify (mechanical) | import paths only (T2)                                                                                                                                  |
| `src/components/ui/{Button,Panel,Input,Select,FieldLabel,SectionHead,PageHead,StatusChip,Notice,SegmentedToggle,Modal,ConfirmDialog,ImageLightbox,QueryError,ModelPicker,index}.tsx/ts`, `src/components/providers/ToastProvider.tsx` | modify              | §4.3 (T2)                                                                                                                                               |
| `src/components/layout/{AppShell,TeamSwitcher,CreatePostButton}.tsx`, `src/components/theme/ThemeToggle.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(app)/choose-team/page.tsx`                                                   | modify              | §5 (T3)                                                                                                                                                 |
| screen groups (§8 table)                                                                                                                                                                                                              | modify              | §8 (T4–T7)                                                                                                                                              |
| `tests/unit/{designTokens,contrast,uiTokenGuard,uiPrimitives,noTeamNotice}.test.ts`                                                                                                                                                   | modify              | §11 (T1, T2, staged guard entries T3–T8)                                                                                                                |
| `tests/e2e/{surfaces,a11y}.test.ts`                                                                                                                                                                                                   | modify              | §11 (T1, T2, T3, T5)                                                                                                                                    |
| `docs/ui-reference/DESIGN_SYSTEM.md`                                                                                                                                                                                                  | rewrite             | Graphite (FR-15) (T8)                                                                                                                                   |
| `docs/ui-reference/screen-light.png`, `screen-dark.png`                                                                                                                                                                               | replace             | from the final captures (T8)                                                                                                                            |
| `CLAUDE.md`                                                                                                                                                                                                                           | modify              | the "UI / Design system" pointer only (T8)                                                                                                              |

Estimate: about 95 files touched, 40 of them by the T1 font sweep and 60 by the T2 import rewrite (overlapping), plus 7 tests and 3 docs.

## Data Model Changes

None.

## API Changes

None.

## Key Decisions

1. **Swap values under the same names** (R4), and verify them against the study file itself. A test that parses `study-a-graphite.html` makes "token values equal the study" falsifiable, and catches a hand-typed digit.
2. **Small caps survive in one atom only** (R6). The study uses an uppercase, tracked micro-label for nav sections and the stage label, and sentence case everywhere else. Expressing its tracking as `tracking-label` lets the guard ban every literal, including inside `ui/`, which is stricter than 014's rule.
3. **Fold by reach** (R8). Shared atoms go to `ui/atoms.ts`. Feature-only atoms stay beside their one screen group under a neutral name, and every one is named in §7. `GateNotice` spans four screens, so it becomes a `ui` primitive.
4. **Stage the deny-list.** Each pattern goes on in the task that removes its last hit, so every task ends green, and the end state has every pattern on (T8). Folio comments are reworded by the screen tasks that own the files, not in a separate sweep.
5. **The fonts and the logo move in T1, not T3.** Removing Fraunces would otherwise break the wordmark E2E between tasks. The Primary/Ink resting-shadow change moves into T1 for the same reason (A13): `--accent` equals `--fg` as soon as T1 lands.
6. **Keep the post square** (A3). It follows 011's "shown as rendered" rule and its existing E2E, over the study's rounded placeholder.
7. **The double bezel as a 6 px border** (A4), not wrapper DOM. Panel's `className` stays on the one element, so grid and margin utilities keep working, and the concentric inner radius comes for free.
8. **Three full E2E runs** (R3): T3, T7 and T8. Each task runs the targeted specs for its screens.

## Risks & Mitigations

| Risk                                                                              | Mitigation                                                                                  |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `accent` = `fg` collapses visual distinctions the 014 tests rely on               | A13. The AC-07 helper keys on the resting shadow, edited in T1 alongside the Button change. |
| The T1/T2 mechanical sweeps touch about 60 files, and a missed import fails `tsc` | `tsc` per task; guard pattern 4a; `find src -iname '*folio*'`                               |
| Wider type (Plus Jakarta) and pills break 375 px layouts                          | The existing no-horizontal-scroll E2E per screen; the per-wave capture review               |
| A screen keeps Folio leftovers that compile and pass E2E                          | The staged deny-list (§6), fully on at T8; AC-13's per-task grep                            |
| A study detail conflicts with FR-12 (More menu, arrows, the rounded post)         | A3 and A5, recorded in DESIGN_SYSTEM.md's decision record                                   |
| The bezel's 6 px border changes inner widths and wraps                            | Applied per screen in wave 2, with 375 px checks                                            |
| The reduced-motion 1 ms transitions catch intermediate styles                     | `expect.poll` on every new computed-style read (§10, note 2)                                |
| A stale `.next` after a build serves old CSS                                      | The clean-run recipe before every full E2E (CLAUDE.md gotchas)                              |
| The D: drive I/O errors                                                           | Push `v2` after each commit                                                                 |

## Grounding sources

- `docs/ui-reference/direction-studies/study-a-graphite.html`:
  - lines 25–99, the token block (§1);
  - `.btn*`, `.chip`, `.field`, `.ask`, `.sugg`, `.card*`, `.stage-*`, `.v*`, `.nav*`, `.team`, `.theme-btn`, `.fab`, `.menu`, `.toast`, `.thread` and `.label` (§4, §5, §8);
  - its own contrast table (lines 435–482), which this plan reproduces at 0.12.
- The study's spec text, quoted:
  - _"Buttons and inputs are pills; cards 26 px outer, 20 px inner"_ (A4, A12);
  - _"Controls 38 px (32 small). Body 14 px / 1.5"_ (A1);
  - _"Three shadows — panel, raised (menus, FAB), overlay (toasts, modals). All alpha-1 backgrounds, no `backdrop-filter`"_ (§4.1);
  - _"Reduced motion: 150 ms opacity only"_ (NFR-03).
- `.specclaw/changes/011-app-visual-redesign/reports/T2.md`, "Concerns and notes for T3/T4" 1–4 (§10). Its tuning note: _"A light `--status-scheduled`: chip 4.26 → 4.5+; A light `--line` against canvas: 2.98 → 3.32"_. The study already carries the tuned values.
- `.specclaw/changes/011-app-visual-redesign/reports/T6.md` and `git show 7fdbe38`: the pre-T6 `Logo.tsx` (_"We CSS-crop to that region … on the dark theme we invert it to white (`dark:invert`)"_), `<Logo height={40} />` in the shell and `<Logo height={48} />` on login, and the PNG deleted at `7fdbe38`.
- `.specclaw/changes/011-app-visual-redesign/reports/T4.md`: the `prettier-ignore` on `:root`, and the reduced-motion exemptions for spin and pulse.
- `.specclaw/changes/011-app-visual-redesign/reports/T9.md`: _"No More menu … every control stays a visible `button` with its existing name, because a Radix `menuitem` would change roles the suite drives with `getByRole('button')`"_ (A5).
- `.specclaw/changes/011-app-visual-redesign/reports/T13.md`: the capture run (the 62-PNG set) and the reference screenshot refresh.
- `docs/ui-reference/DESIGN_SYSTEM.md` §1 decision record (2026-10-07: _"No 'More' menu on the draft page"_; 2026-10-09: _"Every field label is the small-caps `FieldLabel`, app-wide"_, which 021 turns into one sentence-case style, still app-wide).
- `tests/unit/contrast.test.ts` (the method, the 21 pairs, `CHIP_ALPHA`), `tests/unit/uiTokenGuard.test.ts` (`START` / `END`, `SHARED_NAME`, `SMALL_CAPS_LITERAL`), and `tests/unit/designTokens.test.ts` (the token lists, control heights, the literal-height guard).
- `src/components/ui/folio.ts` header: _"These are the only definitions of the shared atoms: a screen imports them from here … and never keeps a copy of its own (014 FR-01, FR-05)"_. 021 keeps that rule under the new name.
- The proposal's "Panel rulings (orchestrator, 2026-10-18)" 1–13, and party-report.md's 16 upheld findings: each one is answered by a ruling above or by spec A1–A13.
