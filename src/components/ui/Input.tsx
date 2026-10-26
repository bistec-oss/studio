import React from 'react'
import { cn } from '@/lib/utils'
import { FieldLabel } from './FieldLabel'

// The Graphite field (021 design.md §4.3, the study's .field and .ask): a 1 px
// --line edge (3:1), a --surface-2 fill, and the 2 px --focus outline while
// focused. Single-line fields are pills, textareas radius-md (021 A12).
// background-COLOR only (bg-*), so a background-image set beside it survives.
const fieldBase = (box: string) => [
  'w-full border bg-surface-raised',
  `${box} text-ui-sm text-fg`,
  'placeholder:text-fg-muted',
  'transition-[border-color,box-shadow] duration-fast ease-standard',
  'focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-focus',
  'disabled:opacity-50 disabled:cursor-not-allowed',
].join(' ')

// A multi-line field (textareas): its height comes from its rows and padding.
export const fieldClasses = fieldBase('rounded-ui-md px-4 py-3.5 leading-relaxed')

// A single-line field (Input, Select and raw <input>s): a pill at the md
// control height (--control-md, 014 FR-07), so it lines up with the md Button
// beside it. Horizontal padding only: a vertical one would compete with the
// height.
export const inputClasses = fieldBase('rounded-ui-pill h-control-md px-4')

// The edge colour, kept out of fieldClasses: cn is a plain join, so two
// competing border colours would be settled by CSS source order.
export const fieldEdge = (error?: string) => (error ? 'border-status-failed' : 'border-line')

export const fieldErrorClasses = 'text-ui-xs text-status-failed'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({
  label,
  error,
  id,
  className,
  ...props
}: InputProps) {
  // Stable, collision-free fallback: an explicit id wins, otherwise React.useId.
  // (The old label-derived id collided when two inputs shared the same label text.)
  const generatedId = React.useId()
  const inputId = id ?? (label ? generatedId : undefined)

  // The label is the shared FieldLabel (014 FR-06): one sentence-case
  // field-label style app-wide, the same in Select (021 FR-07).
  return (
    <div className="flex flex-col gap-1.5">
      {label && <FieldLabel htmlFor={inputId}>{label}</FieldLabel>}
      <input
        id={inputId}
        className={cn(inputClasses, fieldEdge(error), className)}
        {...props}
      />
      {error && <p className={fieldErrorClasses}>{error}</p>}
    </div>
  )
}
