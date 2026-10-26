// Shared class helpers for the brief wizard's pickers, on the Graphite tokens
// (021 design.md §8; DESIGN_SYSTEM.md §8.2–§8.4, §9): opaque, ink for the
// selection, no colour of their own. The shared atoms (FOCUS, SMALL_CAPS, the
// section-head strings, NOTICE) come from @/components/ui; this module keeps
// only the brief's own pickers (014 FR-02).

import { FOCUS } from '@/components/ui/atoms'

// An option card (size, generation path, template, reference). Idle: a raised
// paper card with a --line-subtle hairline ring, --line and the panel shadow
// on hover. Selected: the 1.5 px ink ring of a selected version or template
// (the study's .v[aria-current]).
export function cardCls(selected: boolean, extra = '') {
  return [
    'rounded-ui-md bg-surface-raised text-left',
    'transition-[box-shadow] duration-fast ease-standard',
    FOCUS,
    selected
      ? 'shadow-panel ring-[1.5px] ring-inset ring-fg'
      : 'ring-1 ring-inset ring-line-subtle hover:ring-line hover:shadow-panel',
    extra,
  ].join(' ')
}

// A ruled list row (the campaign list): no box, a --line-subtle rule beneath.
// Selected: the nav "current" look (the study's .nav a[aria-current]): the
// paper fill, the panel shadow and a hairline ring, with its rule hidden.
export function rowCls(selected: boolean, extra = '') {
  return [
    'relative w-full text-left border-b',
    'transition-[background-color,box-shadow] duration-fast ease-standard',
    FOCUS,
    selected
      ? 'rounded-ui-sm border-transparent bg-surface-raised shadow-panel ring-1 ring-inset ring-line-subtle'
      : 'border-line-subtle hover:bg-canvas',
    extra,
  ].join(' ')
}
