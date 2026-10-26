// The brand kits admin's own class helpers (DESIGN_SYSTEM.md §6, §8.3, §8.4,
// §8.6; 021 design.md §7, §8). The shared atoms (FOCUS, SMALL_CAPS, the heading
// strings, ICON, TAG, COMPACT_FIELD…) come from @/components/ui/atoms; this
// module keeps only what this screen group alone uses (014 FR-02's residue
// rule).

import { FOCUS } from '@/components/ui/atoms'

// A ruled list row (the kit list): no box, a --line-subtle rule beneath.
// Selected: the nav "current" look (the study's .nav a[aria-current]): the
// paper fill, the panel shadow and a hairline ring, with its rule hidden.
export function rowCls(selected: boolean, extra = '') {
  return [
    'relative border-b last:border-b-0',
    'transition-[background-color,box-shadow] duration-fast ease-standard',
    selected
      ? 'rounded-ui-sm border-transparent bg-surface-raised shadow-panel ring-1 ring-inset ring-line-subtle'
      : 'border-line-subtle hover:bg-canvas',
    extra,
  ].join(' ')
}

// An option button (the template size), a pill. Idle: raised paper with a
// --line-subtle hairline ring, --line on hover. Selected: the 1.5 px ink ring
// of a selected version or template (the study's .v[aria-current]).
export function optionCls(selected: boolean, extra = '') {
  return [
    'rounded-ui-pill bg-surface-raised text-left',
    'transition-[box-shadow,color] duration-fast ease-standard',
    FOCUS,
    selected
      ? 'text-fg shadow-panel ring-[1.5px] ring-inset ring-fg'
      : 'text-fg-muted ring-1 ring-inset ring-line-subtle hover:text-fg hover:ring-line',
    extra,
  ].join(' ')
}

// A code field (the template's HTML/CSS): the §8.3 textarea (radius-md, the
// --line edge, the focus outline) in the mono face at --text-sm, written out
// in full for the same reason as COMPACT_FIELD.
export const CODE_FIELD =
  'w-full rounded-ui-md border border-line bg-surface-raised px-4 py-3 font-mono text-ui-sm text-fg placeholder:text-fg-muted transition-[border-color,box-shadow] duration-fast ease-standard focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-focus'

// The kit name while editing: the §8.3 field set at the kit title's size.
export const TITLE_FIELD =
  'w-full max-w-md rounded-ui-md border border-line bg-surface-raised px-4 py-1.5 text-ui-xl font-semibold text-fg transition-[border-color,box-shadow] duration-fast ease-standard focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-focus'
