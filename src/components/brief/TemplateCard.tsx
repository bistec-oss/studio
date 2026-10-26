'use client'

import React from 'react'
import type { TemplateSummary } from '@/lib/api-types'
import { cardCls } from './cardCls'

// ─── Template card ───────────────────────────────────────────────────────────
// The swatch is the template's own preview colour, from the brand kit's data:
// it is never token-styled (DESIGN_SYSTEM.md §11).

interface TemplateCardProps {
  template: TemplateSummary
  selected: boolean
  onSelect: () => void
}

export function TemplateCard({ template, selected, onSelect }: TemplateCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cardCls(selected, 'flex items-center gap-3 p-3 min-w-0')}
    >
      <span
        className="w-8 h-8 rounded-ui-sm flex-shrink-0 ring-1 ring-inset ring-line-subtle"
        style={{ background: template.previewColor }} // ui-exception: brand-kit swatch, the template's own colour from data
      />
      <span className="min-w-0">
        <span className="block text-ui-sm font-semibold text-fg truncate">
          {template.name}
        </span>
        <span className="block text-ui-xs text-fg-muted truncate">
          {template.brandKitName}
        </span>
      </span>
    </button>
  )
}
