'use client'

import React from 'react'

// ─── Field label ─────────────────────────────────────────────────────────────

interface FieldLabelProps {
  children: React.ReactNode
}

export function FieldLabel({ children }: FieldLabelProps) {
  return (
    <label className="text-xs font-bold tracking-widest uppercase text-light-text-muted dark:text-dark-text-muted mb-2 block">
      {children}
    </label>
  )
}
