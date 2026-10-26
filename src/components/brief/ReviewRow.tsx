'use client'

import React from 'react'

// ─── Review row ──────────────────────────────────────────────────────────────
// One ruled row of the Review step's <dl> (DESIGN_SYSTEM.md §8.15): a
// sentence-case muted term beside its value, as the study draws its table
// headers (021 FR-07).

export interface ReviewRowProps {
  label: string
  value: string
  capitalize?: boolean
}

export function ReviewRow({ label, value, capitalize = false }: ReviewRowProps) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] sm:grid-cols-[8rem_minmax(0,1fr)] gap-4 py-2.5 border-b border-line-subtle">
      <dt className="text-ui-xs font-semibold text-fg-muted pt-0.5">{label}</dt>
      <dd className={`text-ui-sm text-fg leading-relaxed break-words${capitalize ? ' capitalize' : ''}`}>{value}</dd>
    </div>
  )
}
