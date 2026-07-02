'use client'

import React, { useState } from 'react'
import { toast } from 'sonner'
import { Sparkles, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'
import { apiFetch } from '@/lib/apiFetch'
import type { BrandKitPrompt as Prompt } from '@/lib/api-types'

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

  const active = prompts.find(p => p.isActive)

  async function generate() {
    setLoading(true)
    try {
      const data = await apiFetch<{ draft: string }>(`/api/admin/brandkits/${kitId}/prompts/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      })
      setAiDraft(data.draft)
      setDraft(data.draft)
      setView('new')
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setLoading(false) }
  }

  async function improve() {
    setLoading(true)
    try {
      const data = await apiFetch<{ draft: string }>(`/api/admin/brandkits/${kitId}/prompts/improve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      setAiDraft(data.draft)
      setDraft(data.draft)
      setView('new')
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setLoading(false) }
  }

  async function saveVersion() {
    if (!draft.trim()) return
    try {
      await apiFetch(`/api/admin/brandkits/${kitId}/prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft }),
      })
      setDraft(''); setAiDraft(''); setView('active')
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
            <p className="text-sm text-light-text-muted dark:text-dark-text-muted">No active prompt. Generate one below.</p>
          )}
          <div className="flex gap-2">
            {active ? (
              <Button variant="secondary" size="sm" onClick={improve} disabled={loading}>
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                {loading ? 'Improving…' : 'Improve with AI'}
              </Button>
            ) : (
              <div className="flex gap-2 w-full">
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Describe your brand in a few sentences…"
                  className="glass-input rounded-xl px-3 py-2 text-sm flex-1 text-light-text dark:text-dark-text"
                />
                <Button variant="secondary" size="sm" onClick={generate} disabled={loading || !description.trim()}>
                  <Sparkles size={13} />
                  {loading ? 'Generating…' : 'Generate'}
                </Button>
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={() => { setDraft(''); setView('new') }}>
              Write manually
            </Button>
          </div>
        </div>
      )}

      {view === 'history' && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {prompts.length === 0 && (
            <p className="text-sm text-light-text-muted dark:text-dark-text-muted">No versions yet.</p>
          )}
          {prompts.map(p => (
            <div key={p.id} className="glass-input rounded-xl p-3 flex items-start justify-between gap-3">
              <div>
                <span className="font-mono text-xs text-light-text-muted dark:text-dark-text-muted">v{p.version}</span>
                {p.isActive && (
                  <span className="ml-2 text-xs bg-primary/10 dark:bg-primary-light/10 text-primary dark:text-primary-light px-1.5 py-0.5 rounded-full">active</span>
                )}
                <p className="text-xs text-light-text dark:text-dark-text mt-1 line-clamp-2">{p.content}</p>
              </div>
              {!p.isActive && (
                <Button variant="ghost" size="sm" onClick={() => activate(p.id)}>Restore</Button>
              )}
            </div>
          ))}
        </div>
      )}

      {view === 'new' && (
        <div className="space-y-3">
          {aiDraft && (
            <p className="text-xs text-light-text-muted dark:text-dark-text-muted">AI-generated draft — review and edit before saving.</p>
          )}
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={8}
            placeholder="Write your brand voice prompt…"
            className="glass-input rounded-xl px-3 py-2.5 text-sm w-full text-light-text dark:text-dark-text resize-none"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={saveVersion} disabled={!draft.trim()}>Save as new version</Button>
            <Button variant="ghost" size="sm" onClick={() => { setDraft(''); setAiDraft(''); setView('active') }}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}
