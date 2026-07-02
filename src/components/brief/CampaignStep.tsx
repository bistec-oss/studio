'use client'

import React from 'react'
import { Loader2, Check } from 'lucide-react'
import type { Campaign } from '@/lib/api-types'
import { SOURCE_LABEL } from './constants'
import type { ResolvedKit } from './types'
import { cardCls } from './cardCls'
import { CampaignRow } from './CampaignRow'
import type { ProjectCampaignGroup } from './useBriefWizard'

// ─── Step 0 — Campaign ───────────────────────────────────────────────────────

interface CampaignStepProps {
  campaignId: string
  kitLoading: boolean
  resolvedKit: ResolvedKit | null
  projectsWithCampaigns: ProjectCampaignGroup[]
  standaloneCampaigns: Campaign[]
  onSelectCampaign: (id: string) => void
  onClearCampaign: () => void
}

export function CampaignStep({
  campaignId,
  kitLoading,
  resolvedKit,
  projectsWithCampaigns,
  standaloneCampaigns,
  onSelectCampaign,
  onClearCampaign,
}: CampaignStepProps) {
  return (
    <div>
      <h2 className="text-base font-bold text-light-text dark:text-dark-text mb-1">Select Campaign</h2>
      <p className="text-sm text-light-text-muted dark:text-dark-text-muted mb-5">
        Group this post under a campaign. Its brand kit (or the parent project&apos;s) becomes the
        default on the next step — you can still change it.
      </p>

      {/* Resolved brand-kit banner */}
      {campaignId && (
        <div className="flex items-center gap-2.5 mb-4 p-3 rounded-xl bg-primary/8 dark:bg-primary-light/10 border border-primary/20 dark:border-primary-light/20">
          {kitLoading ? (
            <span className="text-sm text-light-text-muted dark:text-dark-text-muted flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Resolving brand kit…
            </span>
          ) : resolvedKit ? (
            <>
              <span className="text-sm font-semibold text-primary dark:text-primary-light">{resolvedKit.name}</span>
              <span className="px-1.5 py-0.5 rounded text-[0.62rem] font-semibold bg-white/50 dark:bg-white/10 text-light-text-muted dark:text-dark-text-muted">
                {SOURCE_LABEL[resolvedKit.source] ?? resolvedKit.source}
              </span>
              <span className="text-xs text-light-text-muted dark:text-dark-text-muted ml-auto">Default for this post</span>
            </>
          ) : (
            <span className="text-sm text-light-text-muted dark:text-dark-text-muted">No brand kit resolved.</span>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        {/* Uncategorized */}
        <button
          type="button"
          onClick={onClearCampaign}
          className={cardCls(campaignId === '', 'w-full flex items-center gap-3 p-3.5')}
        >
          <span className="w-3 h-3 rounded border-2 border-dashed border-light-text-muted dark:border-dark-text-muted flex-shrink-0" />
          <span className="flex-1">
            <span className={['block text-sm font-semibold', campaignId === '' ? 'text-primary dark:text-primary-light' : 'text-light-text dark:text-dark-text'].join(' ')}>
              No campaign (Uncategorized)
            </span>
            <span className="block text-xs text-light-text-muted dark:text-dark-text-muted">
              Pick a brand kit yourself on the next step.
            </span>
          </span>
          {campaignId === '' && <Check size={15} className="text-primary dark:text-primary-light flex-shrink-0" />}
        </button>

        {/* Grouped by project */}
        {projectsWithCampaigns.map(({ project, campaigns: pcs }) => (
          <div key={project.id}>
            <div className="px-1 pt-3 pb-1 text-[0.62rem] font-bold uppercase tracking-widest text-light-text-muted dark:text-dark-text-muted">
              {project.name}
            </div>
            {pcs.map(c => (
              <CampaignRow
                key={c.id}
                campaign={c}
                selected={campaignId === c.id}
                onSelect={() => onSelectCampaign(c.id)}
              />
            ))}
          </div>
        ))}

        {/* Standalone */}
        {standaloneCampaigns.length > 0 && (
          <div>
            <div className="px-1 pt-3 pb-1 text-[0.62rem] font-bold uppercase tracking-widest text-light-text-muted dark:text-dark-text-muted">
              Standalone
            </div>
            {standaloneCampaigns.map(c => (
              <CampaignRow
                key={c.id}
                campaign={c}
                selected={campaignId === c.id}
                onSelect={() => onSelectCampaign(c.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
