// The shared Graphite class strings (021 design.md §4.2; DESIGN_SYSTEM.md
// §3.2, §5.2, §6, §8.3, §8.5, §8.14–§8.16, §9). These are the only definitions
// of the shared atoms: a screen imports them from here, or uses the PageHead /
// SectionHead / Notice / FieldLabel components built on them, and never keeps
// a copy of its own (014 FR-01, FR-05). An atom used by one screen group alone
// lives in that group's classes.ts instead (021 design.md §7). No 'use client'
// and no hooks, so server components can import them. None of them carries an
// outer margin: the caller adds it.

// The §9 focus outline, for the raw <button>s and links a screen draws itself.
export const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

// A scroll container's focus outline, inset so its own overflow can't clip it.
export const SCROLL_FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus'

// The micro-label (021 FR-07): uppercase, tracked, with no colour; the caller
// adds the one it shows. The only place `uppercase` and the label tracking are
// written: nav section labels, eyebrows, panel captions, stepper labels.
export const SMALL_CAPS = 'text-ui-2xs font-semibold uppercase tracking-label'
// The micro-label in --fg-muted: eyebrows, aside heads, captions.
export const EYEBROW = `${SMALL_CAPS} text-fg-muted`

// Page title (the study's .page-head h1): 28 px / 700 / -0.025em, stepping
// down to 20 px below md. No top margin: PageHead adds `mt-2` under an eyebrow.
export const PAGE_TITLE = 'text-ui-xl md:text-ui-2xl font-bold leading-[1.15] tracking-tight'
export const PAGE_LEAD = 'mt-1.5 text-ui-sm text-fg-muted'

// A card head (the study's .card-hd h2): 16 px / 600.
export const SECTION_HEAD = 'text-ui-lg font-semibold leading-snug tracking-[-0.01em]'

// A sub-head (§5.2 h3), at the weight of the study's toast and thread titles.
export const SUB_HEAD = 'text-ui-base font-semibold leading-snug text-fg'

// A notice on its status tint (§3.2): the text in the status colour on its
// 0.12 fill (the pair contrast.test.ts checks, 021 A2). No ring: the tint
// carries it. Notice adds the tone's bg and text.
export const NOTICE = 'rounded-ui-md px-4 py-3 text-ui-sm'

// Icons (§8.16): 16 px (14 px small), stroke 1.6, currentColor.
export const ICON = { size: 16, strokeWidth: 1.6 } as const
export const ICON_SM = { size: 14, strokeWidth: 1.6 } as const

// A quiet icon-only button (§8.16, the study's .vnav and .x): a round
// --control-sm target in --fg-muted (014 FR-07). Callers add the hover
// (hover:bg-surface-raised hover:text-fg), FOCUS, and always an aria-label.
export const ICON_BUTTON =
  'inline-flex h-control-sm w-control-sm flex-shrink-0 items-center justify-center rounded-ui-pill text-fg-muted transition-colors duration-fast ease-standard disabled:cursor-not-allowed disabled:opacity-40'

// Links in text: --accent, underlined (§3.2). The accent is ink in Graphite,
// so the underline is what marks a link (never colour alone).
export const TEXT_LINK =
  'text-accent underline decoration-line underline-offset-4 hover:decoration-accent'

// A UI tag (a brand-kit or tone chip, a template size, a provider slot, a
// suggestion): not a status, so it is neutral, the study's .sugg pill on the
// canvas with a hairline ring. Brand data never colours it.
export const TAG =
  'inline-flex max-w-full items-center gap-1 rounded-ui-pill bg-canvas px-2.5 py-0.5 text-ui-xs font-medium text-fg ring-1 ring-inset ring-line-subtle'

// A small ink pill badge (the study's .v .cur): "Current", "active", "Default".
export const PILL_BADGE =
  'inline-block rounded-ui-pill bg-accent px-1.5 text-[10px] font-semibold leading-4 text-accent-fg'

// The header row of a ruled data table (§8.15, the study's .ct th): sentence
// case, 600, --fg-muted.
export const TABLE_HEAD_ROW =
  'border-b border-line-subtle text-left text-ui-2xs font-semibold text-fg-muted'

// A ruled row (§6: lists as ruled rows, not cards; the study's .thread li + li).
export const ROW = 'border-b border-line-subtle py-3'

// A compact field, the §8.3 field at --text-sm. Written out in full because
// `cn` is a plain join: overriding fieldClasses' padding would leave two
// competing utilities.
const COMPACT_BOX =
  'border border-line bg-surface-raised text-ui-sm text-fg placeholder:text-fg-muted transition-[border-color,box-shadow] duration-fast ease-standard focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-focus disabled:cursor-not-allowed disabled:opacity-50'
// Single-line (the study's .ask): a pill at the sm control height
// (--control-sm, 014 FR-07), so it lines up with the sm Button beside it.
export const COMPACT_FIELD = `${COMPACT_BOX} h-control-sm rounded-ui-pill px-3`
// Multi-line (a textarea, the study's .field): radius-md. Its height comes from
// its rows and padding, never from a control token (FR-07 excludes textareas).
export const COMPACT_TEXTAREA = `${COMPACT_BOX} rounded-ui-md px-3 py-1.5`
