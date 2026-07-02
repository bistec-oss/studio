'use client'

import React from 'react'
import type { TemplateSummary } from '@/lib/api-types'
import { cardCls } from './cardCls'

// ─── Template card ───────────────────────────────────────────────────────────

interface TemplateCardProps {
  template: TemplateSummary
  selected: boolean
  onSelect: () => void
}

export function TemplateCard({ template, selected, onSelect }: TemplateCardProps) {
  return (
    <button type="button" onClick={onSelect} className={cardCls(selected, 'flex items-center gap-3 p-3')}>
      <span
        className="w-8 h-8 rounded-lg flex-shrink-0 border border-black/5 dark:border-white/10"
        style={{ background: template.previewColor }}
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-light-text dark:text-dark-text truncate">
          {template.name}
        </span>
        <span className="block text-xs text-light-text-muted dark:text-dark-text-muted truncate">
          {template.brandKitName}
        </span>
      </span>
    </button>
  )
}
