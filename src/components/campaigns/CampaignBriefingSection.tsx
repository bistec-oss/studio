'use client'

import React, { useState } from 'react'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { apiFetch } from '@/lib/apiFetch'
import type { CampaignBriefing } from '@/lib/api-types'

// Versioned campaign briefing editor — the campaign-level context injected
// into every generation under this campaign (on top of the brand voice).
// Mirrors the brand-kit PromptSection UX (Active / History / New Version,
// Restore) but on React Query, matching the campaign detail page's data layer.
// Writes are admin-only; editors see the active briefing read-only.

interface CampaignBriefingSectionProps {
  campaignId: string
  isAdmin: boolean
}

export function CampaignBriefingSection({ campaignId, isAdmin }: CampaignBriefingSectionProps) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState<'active' | 'history' | 'new'>('active')

  const { data: briefings = [] } = useQuery({
    queryKey: ['campaigns', campaignId, 'briefing'],
    queryFn: () => apiFetch<CampaignBriefing[]>(`/api/campaigns/${campaignId}/briefing`),
  })

  const active = briefings.find(b => b.isActive)

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'briefing'] })
  }

  async function saveVersion() {
    if (!draft.trim()) return
    setSaving(true)
    try {
      await apiFetch(`/api/campaigns/${campaignId}/briefing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft }),
      })
      setDraft('')
      setView('active')
      await invalidate()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save briefing')
    } finally {
      setSaving(false)
    }
  }

  async function activate(briefingId: string) {
    try {
      await apiFetch(`/api/campaigns/${campaignId}/briefing/${briefingId}/activate`, { method: 'POST' })
      await invalidate()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to restore version')
    }
  }

  return (
    <GlassPanel className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-light-text-muted dark:text-dark-text-muted">
          Campaign Briefing
        </h3>
        {active && (
          <span className="font-mono text-xs text-light-text-muted dark:text-dark-text-muted">
            v{active.version}
          </span>
        )}
      </div>
      <p className="text-xs text-light-text-muted dark:text-dark-text-muted mb-3">
        Shared context for every post generated under this campaign — injected into copy and
        design prompts alongside the brand voice.
      </p>

      {isAdmin ? (
        <div className="space-y-3">
          <SegmentedToggle
            options={[
              { value: 'active', label: 'Active' },
              { value: 'history', label: 'History' },
              { value: 'new', label: 'New Version' },
            ]}
            value={view}
            onChange={v => setView(v as 'active' | 'history' | 'new')}
          />

          {view === 'active' && (
            <div className="space-y-3">
              {active ? (
                <div className="glass-input rounded-xl p-3 text-sm text-light-text dark:text-dark-text whitespace-pre-wrap leading-relaxed">
                  {active.content}
                </div>
              ) : (
                <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
                  No briefing yet — posts under this campaign use only the brand voice.
                </p>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setDraft(active?.content ?? ''); setView('new') }}
              >
                {active ? 'Edit as new version' : 'Write briefing'}
              </Button>
            </div>
          )}

          {view === 'history' && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {briefings.length === 0 && (
                <p className="text-sm text-light-text-muted dark:text-dark-text-muted">No versions yet.</p>
              )}
              {briefings.map(b => (
                <div key={b.id} className="glass-input rounded-xl p-3 flex items-start justify-between gap-3">
                  <div>
                    <span className="font-mono text-xs text-light-text-muted dark:text-dark-text-muted">v{b.version}</span>
                    {b.isActive && (
                      <span className="ml-2 text-xs bg-primary/10 dark:bg-primary-light/10 text-primary dark:text-primary-light px-1.5 py-0.5 rounded-full">active</span>
                    )}
                    <p className="text-xs text-light-text dark:text-dark-text mt-1 line-clamp-2">{b.content}</p>
                  </div>
                  {!b.isActive && (
                    <Button variant="ghost" size="sm" onClick={() => activate(b.id)}>Restore</Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {view === 'new' && (
            <div className="space-y-3">
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                rows={8}
                placeholder="Audience, key messages, themes, do's and don'ts for this campaign…"
                className="glass-input rounded-xl px-3 py-2.5 text-sm w-full text-light-text dark:text-dark-text resize-none"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={saveVersion} disabled={!draft.trim() || saving}>
                  {saving ? 'Saving…' : 'Save as new version'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setDraft(''); setView('active') }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : active ? (
        <div className="glass-input rounded-xl p-3 text-sm text-light-text dark:text-dark-text whitespace-pre-wrap leading-relaxed">
          {active.content}
        </div>
      ) : (
        <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
          No briefing yet — posts under this campaign use only the brand voice.
        </p>
      )}
    </GlassPanel>
  )
}
