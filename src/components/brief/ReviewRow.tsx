'use client'

import React from 'react'

// ─── Review row ──────────────────────────────────────────────────────────────

interface ReviewRowProps {
  label: string
  value: string
  capitalize?: boolean
}

export function ReviewRow({ label, value, capitalize = false }: ReviewRowProps) {
  return (
    <div className="flex items-start gap-4 py-2.5 border-b border-white/15 dark:border-white/8">
      <span className="text-xs font-bold tracking-wider uppercase text-light-text-muted dark:text-dark-text-muted w-24 flex-shrink-0 pt-0.5">
        {label}
      </span>
      <span className={`text-sm text-light-text dark:text-dark-text${capitalize ? ' capitalize' : ''}`}>{value}</span>
    </div>
  )
}
