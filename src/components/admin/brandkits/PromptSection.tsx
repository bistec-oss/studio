'use client'

import React, { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { Sparkles, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'
import { fieldClasses, fieldEdge } from '@/components/ui/Input'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { Notice } from '@/components/ui/Notice'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { apiFetch } from '@/lib/apiFetch'
import { cn } from '@/lib/utils'
import { COMPACT_FIELD, ICON, PILL_BADGE, SCROLL_FOCUS } from '@/components/ui/atoms'
import type { BrandKitPrompt as Prompt, ImprovePromptResponse, UpgradeResponse } from '@/lib/api-types'
import { RuleReviewPanel } from '@/components/textUpgrade/RuleReviewPanel'
import { useRuleReview } from '@/components/textUpgrade/useRuleReview'

// ─── Prompt Section ───────────────────────────────────────────────────────────

interface PromptSectionProps {
  kitId: string
  prompts: Prompt[]
  onRefresh: () => void
}

export function PromptSection({ kitId, prompts, onRefresh }: PromptSectionProps) {
  const [draft, setDraft] = useState('')
  const [aiDraft, setAiDraft] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<'active' | 'history' | 'new'>('active')
  // The version an upgrade-seeded editor started from; null for any other draft.
  const [seededBase, setSeededBase] = useState<number | null>(null)
  const [lostRules, setLostRules] = useState<string[]>([])
  const descriptionId = React.useId()
  const draftId = React.useId()
  const confirm = useConfirm()

  const active = prompts.find(p => p.isActive)
  const baseVersion = seededBase ?? active?.version ?? 0

  const request = useCallback(
    (text: string) =>
      apiFetch<UpgradeResponse>(`/api/admin/brandkits/${kitId}/prompts/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, baseVersion }),
      }),
    [kitId, baseVersion],
  )
  const review = useRuleReview({ text: draft, setText: setDraft, request })

  // Any new editor text (generate, improve, manual, seeded) starts a fresh review.
  function startDraft(text: string, base: number | null, lost: string[] = []) {
    setDraft(text); setSeededBase(base); setLostRules(lost); review.reset()
  }

  async function generate() {
    setLoading(true)
    try {
      const data = await apiFetch<{ draft: string }>(`/api/admin/brandkits/${kitId}/prompts/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      })
      setAiDraft(data.draft)
      startDraft(data.draft, null)
      setView('new')
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setLoading(false) }
  }

  async function improve() {
    setLoading(true)
    try {
      const data = await apiFetch<ImprovePromptResponse>(`/api/admin/brandkits/${kitId}/prompts/improve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      setAiDraft(data.draft)
      startDraft(data.draft, null, data.lostRules ?? [])
      setView('new')
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setLoading(false) }
  }

  async function saveVersion() {
    if (!draft.trim()) return
    // The save route cannot reject a stale base, so an upgrade-seeded editor
    // checks the active version first (a narrowing, not a guarantee).
    if (seededBase !== null) {
      try {
        const list = await apiFetch<Prompt[]>(`/api/admin/brandkits/${kitId}/prompts`)
        const current = list.find(p => p.isActive)?.version ?? 0
        if (current !== seededBase) {
          const ok = await confirm({
            title: `Version ${current} was saved since you started this text. Saving now will replace it as the live prompt. Save anyway?`,
            confirmLabel: 'Save anyway',
            danger: false,
          })
          if (!ok) return
        }
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Something went wrong')
        return
      }
    }
    try {
      await apiFetch(`/api/admin/brandkits/${kitId}/prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft }),
      })
      startDraft('', null); setAiDraft(''); setView('active')
      onRefresh()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
  }

  async function activate(promptId: string) {
    try {
      await apiFetch(`/api/admin/brandkits/${kitId}/prompts/${promptId}/activate`, { method: 'POST' })
      onRefresh()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
  }

  return (
    <div className="space-y-4">
      <SegmentedToggle
        options={[
          { value: 'active', label: 'Active' },
          { value: 'history', label: 'History' },
          { value: 'new', label: 'New Version' },
        ]}
        value={view}
        onChange={v => setView(v as 'active' | 'history' | 'new')}
        label="Prompt view"
      />

      {view === 'active' && (
        <div className="space-y-3">
          {active ? (
            // The active prompt, read-only: a recessed canvas well in the card.
            <div className="whitespace-pre-wrap break-words rounded-ui-md bg-canvas px-4 py-3 text-ui-sm leading-relaxed text-fg ring-1 ring-inset ring-line-subtle">
              {active.content}
            </div>
          ) : (
            <p className="text-ui-sm text-fg-muted">No active prompt. Generate one below.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {active ? (
              <Button variant="secondary" size="sm" onClick={improve} disabled={loading}>
                <RefreshCw {...ICON} className={loading ? 'animate-spin' : ''} />
                {loading ? 'Improving…' : 'Improve with AI'}
              </Button>
            ) : (
              <div className="flex w-full flex-col gap-1.5">
                <FieldLabel htmlFor={descriptionId}>Brand description</FieldLabel>
                <div className="flex w-full flex-wrap gap-2">
                  <input
                    id={descriptionId}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Describe your brand in a few sentences…"
                    className={`${COMPACT_FIELD} min-w-0 flex-1 basis-56`}
                  />
                  <Button variant="secondary" size="sm" onClick={generate} disabled={loading || !description.trim()}>
                    <Sparkles {...ICON} />
                    {loading ? 'Generating…' : 'Generate'}
                  </Button>
                </div>
              </div>
            )}
            {active && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { startDraft(active.content, active.version); setAiDraft(''); setView('new') }}
              >
                Improve this version
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => { startDraft('', null); setView('new') }}>
              Write manually
            </Button>
          </div>
        </div>
      )}

      {view === 'history' && (
        prompts.length === 0 ? (
          <p className="text-ui-sm text-fg-muted">No versions yet.</p>
        ) : (
          // Ruled version rows on --line-subtle (§8.13's vocabulary). The list
          // scrolls inside its own box once it is long, so the box is a
          // focusable, labelled region (WCAG 2.1.1, the T7 rule).
          <div
            tabIndex={0}
            role="region"
            aria-label="Prompt history"
            className={`max-h-64 overflow-y-auto ${SCROLL_FOCUS}`}
          >
            <ul className="divide-y divide-line-subtle">
              {prompts.map(p => (
                <li key={p.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-ui-sm font-semibold text-fg">v{p.version}</span>
                      {p.isActive && <span className={PILL_BADGE}>active</span>}
                    </div>
                    <p className="mt-0.5 line-clamp-2 break-words text-ui-xs text-fg-muted" title={p.content}>
                      {p.content}
                    </p>
                    {p.previousFonts && (
                      <p className="mt-0.5 break-words text-ui-xs text-fg-muted" data-testid="previous-fonts">
                        Fonts before this version:{' '}
                        {[
                          ...p.previousFonts.fonts.slice(0, 2).map(f => f.name),
                          ...(p.previousFonts.scriptFonts?.sinhala ? [`Sinhala: ${p.previousFonts.scriptFonts.sinhala}`] : []),
                        ].join(', ') || 'none'}
                      </p>
                    )}
                  </div>
                  {!p.isActive && (
                    <Button variant="ghost" size="sm" onClick={() => activate(p.id)}>Restore</Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      )}

      {view === 'new' && (
        <div className="space-y-3">
          {aiDraft && (
            <p className="text-ui-xs text-fg-muted">AI-generated draft — review and edit before saving.</p>
          )}
          {lostRules.length > 0 && (
            <Notice tone="warning" role="status">
              The rewrite dropped {lostRules.length} measurable rules: {lostRules.join(', ')}
            </Notice>
          )}
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor={draftId}>Brand voice prompt</FieldLabel>
            <textarea
              id={draftId}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={8}
              placeholder="Write your brand voice prompt…"
              className={cn(fieldClasses, fieldEdge(), 'resize-none leading-relaxed')}
            />
          </div>
          <RuleReviewPanel review={review} />
          <p className="text-ui-xs text-fg-muted">
            Save makes this the live prompt for new posts straight away. Restoring an older version later only changes posts you make after that; posts already made keep what they were generated with.
          </p>
          <div className="flex flex-wrap gap-2">
            {/* An inline-form submit: Ink, so the kit's Save stays the view's
                one accent primary (§8.2, 014 FR-08). */}
            <Button variant="ink" size="sm" onClick={saveVersion} disabled={!draft.trim()}>Save as new version</Button>
            <Button variant="ghost" size="sm" onClick={() => { startDraft('', null); setAiDraft(''); setView('active') }}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}
