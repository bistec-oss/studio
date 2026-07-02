import React from 'react'
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
      <select
        id={selectId}
        className={cn(
          'glass-input',
          'w-full rounded-xl px-3 py-2 text-sm',
          'text-light-text dark:text-dark-text',
          'focus:outline-none',
          'appearance-none',
          'bg-no-repeat bg-right',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          // Chevron icon via inline SVG background
          "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")] pr-8",
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
      {error && (
        <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
      )}
    </div>
  )
}
