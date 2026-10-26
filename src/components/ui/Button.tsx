import React from 'react'
import { cn } from '@/lib/utils'
import { FOCUS } from './atoms'

// Graphite buttons (021 design.md §4.3, the study's .btn*): pills. The variant
// names stay, so callers compile unchanged: `secondary` is the study's
// .btn-sec, `ghost` its .btn-ghost, and `ink` the flat ink fill of the inline
// form submits.
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ink'
type ButtonSize    = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

// The secondary shape: a raised paper pill with a hairline ring, lifting to
// the raised shadow on hover. Danger is the same shape in the failed colour.
const RAISED_PILL =
  'bg-surface-raised shadow-panel ring-1 ring-inset ring-line-subtle enabled:hover:shadow-raised'

const variantClasses: Record<ButtonVariant, string> = {
  // Graphite's --accent equals --fg, so fill alone no longer tells Primary
  // from Ink: Primary is the ink pill with the raised shadow at rest, Ink the
  // same fill, flat (021 A13). As in the study's .btn-pri, the shadow does not
  // change on hover: the press scale is the feedback.
  primary: 'bg-accent text-accent-fg shadow-raised',
  // An open menu button keeps a --line ring while its menu is open.
  secondary: `${RAISED_PILL} text-fg aria-expanded:ring-line`,
  ghost: 'bg-transparent text-fg-muted enabled:hover:bg-surface-raised enabled:hover:text-fg',
  danger: `${RAISED_PILL} text-status-failed`,
  ink: 'bg-fg text-canvas shadow-none',
}

// One class per property and size: `cn` is a plain join (no tailwind-merge),
// so two competing paddings would be settled by CSS source order. The heights
// are the --control-* tokens (014 FR-07, DESIGN_SYSTEM.md §6).
const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-control-sm px-3 text-ui-xs',
  md: 'h-control-md px-4 text-ui-sm',
  lg: 'h-control-lg px-5 text-ui-base',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap',
        'font-semibold rounded-ui-pill',
        'transition-[transform,background-color,color,box-shadow] duration-fast ease-standard',
        // The press: a 0.98 scale, off under reduced motion (NFR-03, AC-18).
        'enabled:active:scale-[0.98] motion-reduce:enabled:active:scale-100',
        // An outline, not a ring, so the secondary hairline ring stays free.
        FOCUS,
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}
