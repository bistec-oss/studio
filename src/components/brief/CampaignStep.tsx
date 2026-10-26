'use client'

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Check, ChevronDown, ChevronRight } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import type { Campaign, CampaignBriefing } from '@/lib/api-types'
import { SOURCE_LABEL } from './constants'
import type { ResolvedKit } from './types'
import { EYEBROW, FOCUS, ICON, TAG } from '@/components/ui/atoms'
import { rowCls } from './cardCls'
import { StepHead } from './StepHead'
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

// Read-only preview of the campaign's active briefing so the author knows what
// context every post under this campaign already carries (and doesn't repeat it
// in the post prompt). Collapsed by default.
function BriefingPreview({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false)
  const { data: briefings = [] } = useQuery({
    queryKey: ['campaigns', campaignId, 'briefing'],
    queryFn: () => apiFetch<CampaignBriefing[]>(`/api/campaigns/${campaignId}/briefing`),
  })
  const active = briefings.find(b => b.isActive)
  if (!active) return null

  return (
    <div className="mb-6 border-b border-line-subtle">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className={`w-full flex items-center gap-2 py-3 text-left text-ui-sm font-semibold text-fg rounded-ui-sm ${FOCUS}`}
      >
        {open ? <ChevronDown {...ICON} aria-hidden /> : <ChevronRight {...ICON} aria-hidden />}
        Campaign briefing (applies to every post)
        <span className="ml-auto text-ui-xs font-normal text-fg-muted">
          v{active.version}
        </span>
      </button>
      {open && (
        <p className="pb-4 pl-[23px] text-ui-sm text-fg whitespace-pre-wrap leading-relaxed">
          {active.content}
        </p>
      )}
    </div>
  )
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
      <StepHead title="Select a campaign (optional)">
        Group this post under a campaign. Its brand kit (or the parent project&apos;s) becomes the
        default on the next step — you can still change it.
      </StepHead>

      {/* Resolved brand-kit line */}
      {campaignId && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-4 rounded-ui-md bg-canvas px-4 py-3 ring-1 ring-inset ring-line-subtle">
          {kitLoading ? (
            <span className="text-ui-sm text-fg-muted flex items-center gap-2">
              <Loader2 {...ICON} aria-hidden className="animate-spin" /> Resolving brand kit…
            </span>
          ) : resolvedKit ? (
            <>
              <span className="text-ui-sm font-semibold text-fg">{resolvedKit.name}</span>
              <span className={TAG}>
                {SOURCE_LABEL[resolvedKit.source] ?? resolvedKit.source}
              </span>
              <span className="text-ui-xs text-fg-muted sm:ml-auto">Default for this post</span>
            </>
          ) : (
            <span className="text-ui-sm text-fg-muted">No brand kit resolved.</span>
          )}
        </div>
      )}

      {/* Active campaign briefing preview */}
      {campaignId && <BriefingPreview campaignId={campaignId} />}

      {/* Ruled list on --line-subtle; the selected row is raised (021 design.md §8) */}
      <div>
        {/* Uncategorized */}
        <button
          type="button"
          onClick={onClearCampaign}
          aria-pressed={campaignId === ''}
          className={rowCls(campaignId === '', 'flex items-center gap-3 py-3.5 pl-4 pr-3')}
        >
          <span className="flex-1 min-w-0">
            <span className={['block text-ui-sm text-fg', campaignId === '' ? 'font-semibold' : 'font-medium'].join(' ')}>
              No campaign (Uncategorized)
            </span>
            <span className="block text-ui-xs text-fg-muted">
              Pick a brand kit yourself on the next step.
            </span>
          </span>
          {campaignId === '' && <Check {...ICON} aria-hidden className="text-accent flex-shrink-0" />}
        </button>

        {/* Grouped by project */}
        {projectsWithCampaigns.map(({ project, campaigns: pcs }) => (
          <div key={project.id}>
            <div className={`${EYEBROW} pt-6 pb-2 border-b border-line-subtle`}>
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
            <div className={`${EYEBROW} pt-6 pb-2 border-b border-line-subtle`}>
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
