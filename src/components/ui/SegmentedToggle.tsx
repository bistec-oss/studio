'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { FOCUS } from './atoms'

interface SegmentOption {
  value: string
  label: string
}

interface SegmentedToggleProps {
  options: SegmentOption[]
  value: string
  onChange: (value: string) => void
  /** The tablist's accessible name (014 FR-13): every tablist is named. */
  label: string
  className?: string
}

// The segmented toggle (DESIGN_SYSTEM.md §8.4, the study's .theme-btn): a
// canvas pill track with a hairline ring, and the selected segment raised on
// it (--surface-2, --fg, the panel shadow). Nothing clips the track, so the
// focus outline sits outside the segment like everywhere else.
export function SegmentedToggle({
  options,
  value,
  onChange,
  label,
  className,
}: SegmentedToggleProps) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-0.5 p-[3px]',
        'rounded-ui-pill bg-canvas ring-1 ring-inset ring-line-subtle',
        className,
      )}
    >
      {options.map(opt => {
        const isActive = opt.value === value
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-ui-pill px-3 py-1.5 text-ui-xs font-semibold',
              'transition-[background-color,color,box-shadow] duration-fast ease-standard',
              FOCUS,
              isActive ? 'bg-surface-raised text-fg shadow-panel' : 'text-fg-muted hover:text-fg',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
