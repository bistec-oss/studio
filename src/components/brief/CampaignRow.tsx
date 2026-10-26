'use client'

import React from 'react'
import { Check } from 'lucide-react'
import type { Campaign } from '@/lib/api-types'
import { ICON } from '@/components/ui/atoms'
import { rowCls } from './cardCls'

// ─── Campaign row ────────────────────────────────────────────────────────────
// A ruled row (DESIGN_SYSTEM.md §6: lists as ruled rows, not cards); the
// selected one takes the nav "current" look (rowCls).

interface CampaignRowProps {
  campaign: Campaign
  selected: boolean
  onSelect: () => void
}

export function CampaignRow({ campaign, selected, onSelect }: CampaignRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={rowCls(selected, 'flex items-center gap-3 py-3.5 pl-4 pr-3')}
    >
      <span className="flex-1 min-w-0">
        <span className={['block text-ui-sm text-fg truncate', selected ? 'font-semibold' : 'font-medium'].join(' ')}>
          {campaign.name}
        </span>
        <span className="block text-ui-xs text-fg-muted truncate">
          {campaign._count?.briefs ?? 0} brief{(campaign._count?.briefs ?? 0) === 1 ? '' : 's'}
          {campaign.brandKit ? ` · ${campaign.brandKit.name}` : ''}
        </span>
      </span>
      {selected && <Check {...ICON} aria-hidden className="text-accent flex-shrink-0" />}
    </button>
  )
}
