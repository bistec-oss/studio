import React from 'react'
import { cn } from '@/lib/utils'

interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
  className?: string
  /** The double-bezel card (`.surface-bezel`): page-level sections and the preview stage (021 A4). */
  bezel?: boolean
}

// An in-flow panel on the `.surface` card class, or with `bezel` on the
// `.surface-bezel` double-bezel card (DESIGN_SYSTEM.md §4.1, 021 design.md
// §4.1). One element either way, so the caller's grid and margin utilities
// keep working; the caller adds the padding.
export function Panel({ className, children, bezel, ...props }: PanelProps) {
  return (
    <div className={cn(bezel ? 'surface-bezel' : 'surface', className)} {...props}>
      {children}
    </div>
  )
}
