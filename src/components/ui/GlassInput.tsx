import React from 'react'
import { cn } from '@/lib/utils'

interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function GlassInput({
  label,
  error,
  id,
  className,
  ...props
}: GlassInputProps) {
  // Stable, collision-free fallback: an explicit id wins, otherwise React.useId.
  // (The old label-derived id collided when two inputs shared the same label text.)
  const generatedId = React.useId()
  const inputId = id ?? (label ? generatedId : undefined)

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-light-text dark:text-dark-text"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          'glass-input',
          'w-full rounded-xl px-3 py-2 text-sm',
          'text-light-text dark:text-dark-text',
          'placeholder:text-light-text-muted dark:placeholder:text-dark-text-muted',
          'focus:outline-none',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          error && 'border-red-500 focus:border-red-500 focus:shadow-[0_0_0_2px_rgba(239,68,68,0.15)]',
          className,
        )}
        {...props}
      />
      {error && (
        <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
      )}
    </div>
  )
}
