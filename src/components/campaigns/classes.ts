// Class helpers used only by the campaigns and projects screens
// (DESIGN_SYSTEM.md §6, §8.6; 021 design.md §7, §8). The shared atoms (FOCUS,
// EYEBROW, PAGE_TITLE, SECTION_HEAD, ICON, TAG and the rest) come from
// @/components/ui/atoms (014 FR-02); only these screen-specific strings live
// here.

// A row's title link: 16 px / 600 in --fg. --accent is ink in Graphite, so a
// colour change on hover would show nothing: the hover is an underline.
export const ROW_TITLE =
  'text-ui-lg font-semibold leading-snug text-fg break-words decoration-line underline-offset-4 hover:underline'

// Breadcrumbs (§8.6), drawn as the study's .back link: --text-xs 500 in
// --fg-muted, --fg and underlined on hover; the current page in --fg 500.
export const CRUMB_LINK =
  'inline-flex items-center gap-1.5 rounded-ui-sm font-medium text-fg-muted decoration-line underline-offset-4 transition-colors duration-fast ease-standard hover:text-fg hover:underline'
export const CRUMB_CURRENT = 'min-w-0 break-words font-medium text-fg'

// The aside's blocks (brand kit, details, briefs, projects): an EYEBROW h2
// (plus mb-3) over the block, the blocks ruled apart on --line-subtle by the
// aside's divide-y. The first block has no top padding, the last none below.
export const ASIDE_BLOCK = 'py-4 first:pt-0 last:pb-0'
