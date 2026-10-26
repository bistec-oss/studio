import React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { inputClasses, fieldEdge, fieldErrorClasses } from './Input'
import { FieldLabel } from './FieldLabel'

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
  'aria-describedby': describedBy,
  ...props
}: SelectProps) {
  // Stable, collision-free fallback: an explicit id wins, otherwise React.useId.
  const generatedId = React.useId()
  const selectId = id ?? (label ? generatedId : undefined)
  // An error is announced with the field: its paragraph joins the caller's
  // aria-describedby, and the select is marked invalid (008 T14).
  const errorId = error && selectId ? `${selectId}-error` : undefined
  const describedByIds = [describedBy, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className="flex flex-col gap-1.5">
      {label && <FieldLabel htmlFor={selectId}>{label}</FieldLabel>}
      {/* The chevron is a real positioned element, not a background-image:
          bg-image utilities are one `background` shorthand away from being
          wiped (happened once via a legacy input class), and Tailwind arbitrary
          values silently drop URLs containing spaces. */}
      <div className="relative">
        <select
          id={selectId}
          className={cn(
            inputClasses,
            'appearance-none pr-10',
            fieldEdge(error),
            className,
          )}
          {...props}
          aria-describedby={describedByIds}
          aria-invalid={error ? true : props['aria-invalid']}
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
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-fg-muted"
        />
      </div>
      {error && (
        <p id={errorId} className={fieldErrorClasses}>
          {error}
        </p>
      )}
    </div>
  )
}
