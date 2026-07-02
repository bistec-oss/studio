'use client'

import React from 'react'
import { Check } from 'lucide-react'
import type { Campaign } from '@/lib/api-types'
import { cardCls } from './cardCls'

// ─── Campaign row ────────────────────────────────────────────────────────────

interface CampaignRowProps {
  campaign: Campaign
  selected: boolean
  onSelect: () => void
}

export function CampaignRow({ campaign, selected, onSelect }: CampaignRowProps) {
  return (
    <button type="button" onClick={onSelect} className={cardCls(selected, 'w-full flex items-center gap-3 p-3.5 mb-1.5')}>
      <span className="w-2 h-2 rounded-full flex-shrink-0 bg-primary/50 dark:bg-primary-light/50" />
      <span className="flex-1 min-w-0">
        <span className={['block text-sm font-semibold truncate', selected ? 'text-primary dark:text-primary-light' : 'text-light-text dark:text-dark-text'].join(' ')}>
          {campaign.name}
        </span>
        <span className="block text-xs text-light-text-muted dark:text-dark-text-muted">
          {campaign._count?.briefs ?? 0} brief{(campaign._count?.briefs ?? 0) === 1 ? '' : 's'}
          {campaign.brandKit ? ` · ${campaign.brandKit.name}` : ''}
        </span>
      </span>
      {selected && <Check size={15} className="text-primary dark:text-primary-light flex-shrink-0" />}
    </button>
  )
}
