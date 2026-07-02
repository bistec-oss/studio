'use client'

import React from 'react'

// Small presentational helpers shared across the brand kit admin components
// (ColorEditor, KitDetail, and the brand kits list page).

interface ColorSwatchProps {
  color: string
}

export function ColorSwatch({ color }: ColorSwatchProps) {
  return (
    <span
      className="inline-block w-5 h-5 rounded-md border border-black/10 dark:border-white/10 flex-shrink-0"
      style={{ background: color }}
      title={color}
    />
  )
}

interface SectionHeaderProps {
  title: string
  action?: React.ReactNode
}

export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-light-text-muted dark:text-dark-text-muted">
        {title}
      </h3>
      {action}
    </div>
  )
}
