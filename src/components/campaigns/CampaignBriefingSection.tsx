'use client'

import React, { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Sparkles, MessageSquareText } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { fieldClasses, fieldEdge } from '@/components/ui/Input'
import { apiFetch } from '@/lib/apiFetch'
import { cn } from '@/lib/utils'
import { SectionHead } from '@/components/ui/SectionHead'
import { ICON, PILL_BADGE, SCROLL_FOCUS, SMALL_CAPS } from '@/components/ui/atoms'
import { BriefingAssistantPanel } from '@/components/campaigns/BriefingAssistantPanel'
import { RuleReviewPanel } from '@/components/textUpgrade/RuleReviewPanel'
import { useRuleReview } from '@/components/textUpgrade/useRuleReview'
import type { CampaignBriefing, UpgradeResponse } from '@/lib/api-types'

// Versioned campaign briefing editor — the campaign-level context injected
// into every generation under this campaign (on top of the brand voice).
// Mirrors the brand-kit PromptSection UX (Active / History / New Version,
// Restore) but on React Query, matching the campaign detail page's data layer.
// Writes are admin-only; editors see the active briefing read-only.

interface CampaignBriefingSectionProps {
  campaignId: string
  isTeamAdmin: boolean
}

export function CampaignBriefingSection({ campaignId, isTeamAdmin }: CampaignBriefingSectionProps) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState<'active' | 'history' | 'new'>('active')
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [enhancing, setEnhancing] = useState(false)
  // Before/after review: the AI rewrite is only committed to the textarea on Accept.
  const [enhanceResult, setEnhanceResult] = useState<{ original: string; draft: string } | null>(null)
  const draftId = React.useId()

  const { data: briefings = [] } = useQuery({
    queryKey: ['campaigns', campaignId, 'briefing'],
    queryFn: () => apiFetch<CampaignBriefing[]>(`/api/campaigns/${campaignId}/briefing`),
  })

  const active = briefings.find(b => b.isActive)

  const activeVersion = active?.version ?? 0
  const request = useCallback(
    (text: string) =>
      apiFetch<UpgradeResponse>(`/api/campaigns/${campaignId}/briefing/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, baseVersion: activeVersion }),
      }),
    [campaignId, activeVersion],
  )
  const review = useRuleReview({ text: draft, setText: setDraft, request })

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
      review.reset()
      setView('active')
      await invalidate()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save briefing')
    } finally {
      setSaving(false)
    }
  }

  async function enhance() {
    setEnhancing(true)
    try {
      const { draft: aiDraft } = await apiFetch<{ draft: string }>(
        `/api/campaigns/${campaignId}/briefing/enhance`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: draft }),
        },
      )
      setEnhanceResult({ original: draft, draft: aiDraft })
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Enhance failed')
    } finally {
      setEnhancing(false)
    }
  }

  function applyAssistantDraft(text: string) {
    setDraft(text)
    review.reset()
    setEnhanceResult(null)
    setView('new')
    setAssistantOpen(false)
    toast.success('Briefing draft applied — review and save it as a new version.')
  }

  async function activate(briefingId: string) {
    try {
      await apiFetch(`/api/campaigns/${campaignId}/briefing/${briefingId}/activate`, { method: 'POST' })
      await invalidate()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to restore version')
    }
  }

  // The read-only briefing text (Active, and the editor's view for editors):
  // a recessed canvas well inside the card.
  const activeBlock = active ? (
    <div className="whitespace-pre-wrap break-words rounded-ui-md bg-canvas px-4 py-3 text-ui-sm leading-relaxed text-fg ring-1 ring-inset ring-line-subtle">
      {active.content}
    </div>
  ) : (
    <p className="text-ui-sm text-fg-muted">
      No briefing yet — posts under this campaign use only the brand voice.
    </p>
  )

  return (
    // A bezel card (021 design.md §8), its head the study's .card-hd.
    <section className="surface-bezel min-w-0 p-5">
      <SectionHead title="Campaign Briefing" className="mb-3">
        {isTeamAdmin && (
          <Button variant="ghost" size="sm" onClick={() => setAssistantOpen(true)}>
            <MessageSquareText {...ICON} /> Draft with AI
          </Button>
        )}
        {active && <span className="font-mono text-ui-2xs text-fg-muted">v{active.version}</span>}
      </SectionHead>
      <p className="mb-4 text-ui-sm text-fg-muted">
        Shared context for every post generated under this campaign — injected into captions and
        design prompts alongside the brand voice.
      </p>

      {isTeamAdmin ? (
        <div className="space-y-4">
          <SegmentedToggle
            options={[
              { value: 'active', label: 'Active' },
              { value: 'history', label: 'History' },
              { value: 'new', label: 'New Version' },
            ]}
            value={view}
            onChange={v => setView(v as 'active' | 'history' | 'new')}
            label="Briefing view"
          />

          {view === 'active' && (
            <div className="space-y-3">
              {activeBlock}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setDraft(active?.content ?? ''); review.reset(); setView('new') }}
              >
                {active ? 'Edit as new version' : 'Write briefing'}
              </Button>
            </div>
          )}

          {view === 'history' && (
            briefings.length === 0 ? (
              <p className="text-ui-sm text-fg-muted">No versions yet.</p>
            ) : (
              // Ruled version rows on --line-subtle (§8.13's vocabulary). The list
              // scrolls inside its own box once it is long, so the box is a
              // focusable, labelled region (WCAG 2.1.1, the T7 rule).
              <div
                tabIndex={0}
                role="region"
                aria-label="Briefing history"
                className={`max-h-64 overflow-y-auto ${SCROLL_FOCUS}`}
              >
                <ul className="divide-y divide-line-subtle">
                  {briefings.map(b => (
                    <li key={b.id} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-ui-sm font-semibold text-fg">v{b.version}</span>
                          {b.isActive && <span className={PILL_BADGE}>active</span>}
                        </div>
                        <p className="mt-0.5 line-clamp-2 break-words text-ui-xs text-fg-muted" title={b.content}>
                          {b.content}
                        </p>
                      </div>
                      {!b.isActive && (
                        <Button variant="ghost" size="sm" onClick={() => activate(b.id)}>Restore</Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )
          )}

          {view === 'new' && (
            <div className="space-y-3">
              {enhanceResult ? (
                <div className="space-y-4">
                  {enhanceResult.original.trim() && (
                    <div>
                      <p className={`${SMALL_CAPS} mb-1.5 text-fg-muted`}>Before</p>
                      <div
                        tabIndex={0}
                        role="region"
                        aria-label="Before"
                        className={`max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-ui-md bg-canvas px-4 py-3 text-ui-sm leading-relaxed text-fg-muted ring-1 ring-inset ring-line-subtle ${SCROLL_FOCUS}`}
                      >
                        {enhanceResult.original}
                      </div>
                    </div>
                  )}
                  <div>
                    <p className={`${SMALL_CAPS} mb-1.5 text-accent`}>AI suggestion</p>
                    <div
                      tabIndex={0}
                      role="region"
                      aria-label="AI suggestion"
                      className={`max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-ui-md bg-surface-raised px-4 py-3 text-ui-sm leading-relaxed text-fg ring-[1.5px] ring-inset ring-fg ${SCROLL_FOCUS}`}
                    >
                      {enhanceResult.draft}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => { setDraft(enhanceResult.draft); review.reset(); setEnhanceResult(null) }}>
                      Accept suggestion
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEnhanceResult(null)}>
                      Discard
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <FieldLabel htmlFor={draftId}>Briefing</FieldLabel>
                    <textarea
                      id={draftId}
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      rows={8}
                      placeholder="Audience, key messages, themes, do's and don'ts for this campaign…"
                      className={cn(fieldClasses, fieldEdge(), 'resize-none leading-relaxed')}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={saveVersion} disabled={!draft.trim() || saving}>
                      {saving ? 'Saving…' : 'Save as new version'}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={enhance} disabled={enhancing}>
                      <Sparkles {...ICON} /> {enhancing ? 'Enhancing…' : 'Enhance with AI'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setDraft(''); review.reset(); setEnhanceResult(null); setView('active') }}>
                      Cancel
                    </Button>
                  </div>
                  <RuleReviewPanel
                    review={review}
                    staleBaseText="The briefing changed since you started; reload it."
                  />
                  {enhancing && (
                    <p className="text-ui-xs text-fg-muted">
                      Rewriting with brand voice and campaign documents — this can take up to a minute.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        activeBlock
      )}

      {isTeamAdmin && (
        <BriefingAssistantPanel
          campaignId={campaignId}
          open={assistantOpen}
          onClose={() => setAssistantOpen(false)}
          onApply={applyAssistantDraft}
        />
      )}
    </section>
  )
}
