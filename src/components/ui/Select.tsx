import React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[]
  label?: string
  error?: string
}

export function Select({
  options,
  label,
  error,
  id,
  className,
  ...props
}: SelectProps) {
  // Stable, collision-free fallback: an explicit id wins, otherwise React.useId.
  const generatedId = React.useId()
  const selectId = id ?? (label ? generatedId : undefined)

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={selectId}
          className="text-sm font-medium text-light-text dark:text-dark-text"
        >
          {label}
        </label>
      )}
      {/* The chevron is a real positioned element, not a background-image:
          bg-image utilities are one `background` shorthand away from being
          wiped (happened once via .glass-input), and Tailwind arbitrary
          values silently drop URLs containing spaces. */}
      <div className="relative">
        <select
          id={selectId}
          className={cn(
            'glass-input',
            'w-full rounded-xl px-3 py-2 text-sm',
            'text-light-text dark:text-dark-text',
            'focus:outline-none',
            'appearance-none pr-8',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error && 'border-red-500',
            className,
          )}
          {...props}
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-light-text-muted dark:text-dark-text-muted"
        />
      </div>
      {error && (
        <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
      )}
    </div>
  )
}
