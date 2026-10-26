import React from 'react'
import { cn } from '@/lib/utils'

interface FieldLabelProps {
  htmlFor?: string
  id?: string
  as?: 'label' | 'span'
  className?: string
  children: React.ReactNode
}

// A field label (021 design.md §4.3, FR-07): sentence case, 13 px / 600, in
// --fg, one style app-wide (014 FR-06). as="span" is for the caption of a
// group that carries its own aria-label. No spacing of its own: the caller,
// or the Input/Select wrapper, sets it.
export function FieldLabel({ htmlFor, id, as = 'label', className, children }: FieldLabelProps) {
  const classes = cn('block text-ui-sm font-semibold text-fg', className)
  if (as === 'span') {
    return (
      <span id={id} className={classes}>
        {children}
      </span>
    )
  }
  return (
    <label htmlFor={htmlFor} id={id} className={classes}>
      {children}
    </label>
  )
}
