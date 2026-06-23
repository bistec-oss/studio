'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface SegmentOption {
  value: string
  label: string
}

interface SegmentedToggleProps {
  options: SegmentOption[]
  value: string
  onChange: (value: string) => void
  className?: string
}

export function SegmentedToggle({
  options,
  value,
  onChange,
  className,
}: SegmentedToggleProps) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex items-center gap-0.5 p-1',
        'glass-panel rounded-xl',
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
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:focus-visible:ring-primary-light/50',
              isActive
                ? [
                    'bg-primary/10 dark:bg-primary-light/15',
                    'text-primary dark:text-primary-light',
                    'border border-primary/20 dark:border-primary-light/25',
                    'shadow-sm',
                  ].join(' ')
                : [
                    'text-light-text-muted dark:text-dark-text-muted',
                    'hover:text-light-text dark:hover:text-dark-text',
                    'hover:bg-primary/5 dark:hover:bg-primary-light/5',
                    'border border-transparent',
                  ].join(' '),
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
