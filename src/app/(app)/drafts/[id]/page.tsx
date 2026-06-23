'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Send,
  Loader2,
  RotateCcw,
  Download,
  ImageIcon,
  AlertTriangle,
  Check,
  ArrowLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { StatusChip } from '@/components/ui/StatusChip'
import { apiFetch } from '@/lib/apiFetch'

// ─── Types ──────────────────────────────────────────────────────────────────

interface DraftPost {
  id: string
  channel: string
  status: string
  scheduledAt: string | null
  publishedAt: string | null
}

interface DraftDetail {
  id: string
  briefId: string
  copyText: string
  htmlContent: string | null
  exportUrl: string | null
  status: 'IN_PROGRESS' | 'EXPORTED' | 'PUBLISHED' | 'FAILED'
  createdAt: string
  revisionCount: number
  brandKitName: string | null
  brief: {
    id: string
    topic: string
    goal: string
    tone: string
    channels: string[]
    designMode: string
  }
  posts: DraftPost[]
}

interface Revision {
  id: string
  revisionNumber: number
  instruction: string
  exportUrl: string | null
  createdAt: string
}

interface RefineMessage {
  id: string
  instruction: string
  status: 'pending' | 'applied' | 'conflict' | 'error'
  detail?: string
}

interface ConflictState {
  conflictId: string
  explanation: string
  instruction: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CHANNEL_LIMITS: Record<string, number> = { INSTAGRAM: 2200, LINKEDIN: 3000 }

function copyLimitFor(channels: string[]): { channel: string; limit: number } {
  let chosen = { channel: 'LinkedIn', limit: 3000 }
  for (const ch of channels) {
    const limit = CHANNEL_LIMITS[ch]
    if (limit !== undefined && limit < chosen.limit) {
      chosen = { channel: ch === 'INSTAGRAM' ? 'Instagram' : 'LinkedIn', limit }
    }
  }
  return chosen
}

const STATUS_TO_CHIP: Record<DraftDetail['status'], 'draft' | 'exported' | 'published' | 'failed'> = {
  IN_PROGRESS: 'draft',
  EXPORTED: 'exported',
  PUBLISHED: 'published',
  FAILED: 'failed',
}

function timeAgo(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const SUGGESTIONS = [
  'Make the background darker',
  'Move the headline to top',
  'Increase font size',
]

// ─── Copy editor ────────────────────────────────────────────────────────────

function CopyEditor({
  draft,
  onSaved,
}: {
  draft: DraftDetail
  onSaved: (copyText: string) => void
}) {
  const [value, setValue] = useState(draft.copyText)
  const [saved, setSaved] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValue(draft.copyText)
    setSaved(true)
  }, [draft.copyText])

  const { channel, limit } = copyLimitFor(draft.brief.channels)
  const over = value.length > limit

  async function save() {
    if (saved || value === draft.copyText) {
      setSaved(true)
      return
    }
    setSaving(true)
    try {
      await apiFetch(`/api/drafts/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ copyText: value }),
      })
      setSaved(true)
      onSaved(value)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <GlassPanel className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-light-text-muted dark:text-dark-text-muted">
          Copy
        </h3>
        <span className="text-xs flex items-center gap-1.5">
          {saving ? (
            <span className="text-light-text-muted dark:text-dark-text-muted flex items-center gap-1">
              <Loader2 size={12} className="animate-spin" /> Saving…
            </span>
          ) : saved ? (
            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <Check size={12} /> Saved
            </span>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">Unsaved changes</span>
          )}
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setSaved(false)
        }}
        onBlur={save}
        rows={8}
        className="glass-input rounded-xl px-3 py-2.5 text-sm w-full text-light-text dark:text-dark-text resize-y leading-relaxed"
        placeholder="Post copy…"
      />
      <div className="flex justify-end mt-1.5">
        <span
          className={`text-xs font-mono ${
            over ? 'text-red-500' : 'text-light-text-muted dark:text-dark-text-muted'
          }`}
        >
          {value.length} / {limit} ({channel})
        </span>
      </div>
    </GlassPanel>
  )
}

// ─── Refinement panel ─────────────────────────────────────────────────────────

function RefinementPanel({
  draftId,
  onRefined,
}: {
  draftId: string
  onRefined: () => void
}) {
  const [messages, setMessages] = useState<RefineMessage[]>([])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [conflict, setConflict] = useState<ConflictState | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function send(instruction: string, overrideConflictId?: string) {
    if (!instruction.trim() && !overrideConflictId) return
    const msgId = crypto.randomUUID()
    setMessages((prev) => [...prev, { id: msgId, instruction, status: 'pending' }])
    setInput('')
    setRunning(true)
    setConflict(null)
    try {
      const data = await apiFetch(`/api/drafts/${draftId}/refine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction, overrideConflictId }),
      })
      if (data?.conflict) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId ? { ...m, status: 'conflict', detail: data.explanation } : m
          )
        )
        setConflict({ conflictId: data.conflictId, explanation: data.explanation, instruction })
      } else {
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, status: 'applied' } : m))
        )
        onRefined()
      }
    } catch (e: unknown) {
      const detail = e instanceof Error ? e.message : 'Error'
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, status: 'error', detail } : m))
      )
    } finally {
      setRunning(false)
    }
  }

  return (
    <GlassPanel className="p-4 flex flex-col">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-light-text-muted dark:text-dark-text-muted mb-3">
        Refine Design
      </h3>

      <div ref={listRef} className="space-y-2 max-h-72 overflow-y-auto mb-3">
        {messages.length === 0 && (
          <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
            Describe a change in natural language and the design agent will apply it.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="glass-input rounded-xl px-3 py-2">
            <p className="text-sm text-light-text dark:text-dark-text">{m.instruction}</p>
            <div className="mt-1 text-xs flex items-center gap-1.5">
              {m.status === 'pending' && (
                <span className="text-light-text-muted dark:text-dark-text-muted flex items-center gap-1">
                  <Loader2 size={11} className="animate-spin" /> Applying…
                </span>
              )}
              {m.status === 'applied' && (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <Check size={11} /> Applied
                </span>
              )}
              {m.status === 'conflict' && (
                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle size={11} /> Brand conflict
                </span>
              )}
              {m.status === 'error' && (
                <span className="text-red-500" title={m.detail}>
                  Failed: {m.detail}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {conflict && (
        <div className="mb-3 rounded-xl border border-amber-300 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/20 p-3 animate-fade-in">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                This change conflicts with the brand kit
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400/90 mt-1">{conflict.explanation}</p>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  onClick={() => send(conflict.instruction, conflict.conflictId)}
                  disabled={running}
                >
                  Override
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConflict(null)} disabled={running}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mb-3">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setInput(s)}
            disabled={running}
            className="text-xs px-2.5 py-1 rounded-lg bg-primary/5 dark:bg-primary-light/5 text-primary dark:text-primary-light hover:bg-primary/10 dark:hover:bg-primary-light/10 transition-colors disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !running && send(input)}
          disabled={running}
          placeholder="e.g. Make the logo larger…"
          className="glass-input rounded-xl px-3 py-2 text-sm flex-1 text-light-text dark:text-dark-text"
        />
        <Button size="sm" onClick={() => send(input)} disabled={running || !input.trim()}>
          {running ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </Button>
      </div>
    </GlassPanel>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DraftDetailPage() {
  const params = useParams<{ id: string }>()
  const draftId = params.id

  const [draft, setDraft] = useState<DraftDetail | null>(null)
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [restoringRev, setRestoringRev] = useState<number | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const fetchDraft = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/drafts/${draftId}`)
      setDraft(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [draftId])

  const fetchRevisions = useCallback(async () => {
    try {
      setRevisions(await apiFetch(`/api/drafts/${draftId}/revisions`))
    } catch {
      // Non-fatal — revision list is supplementary.
    }
  }, [draftId])

  useEffect(() => {
    fetchDraft()
    fetchRevisions()
  }, [fetchDraft, fetchRevisions])

  useEffect(() => {
    apiFetch('/api/me')
      .then((d: { role?: string }) => {
        setIsAdmin(typeof d?.role === 'string' && d.role.toLowerCase() === 'admin')
      })
      .catch(() => {})
  }, [])

  // Poll while a draft is still generating so the preview updates without a
  // manual refresh.
  useEffect(() => {
    if (draft?.status !== 'IN_PROGRESS') return
    const timer = setInterval(fetchDraft, 4000)
    return () => clearInterval(timer)
  }, [draft?.status, fetchDraft])

  function refreshAfterChange() {
    fetchDraft()
    fetchRevisions()
  }

  async function handleExport() {
    setExporting(true)
    try {
      await apiFetch('/api/generate/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId }),
      })
      await fetchDraft()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error')
    } finally {
      setExporting(false)
    }
  }

  async function handlePublish() {
    if (!draft) return
    const channels = (draft.brief.channels ?? [])
      .map((c) => c.toUpperCase())
      .filter((c) => c === 'INSTAGRAM' || c === 'LINKEDIN')
    if (channels.length === 0) {
      alert('This brief has no Instagram/LinkedIn channel to publish to.')
      return
    }
    if (!confirm(`Publish this design to ${channels.join(' and ')}?`)) return
    setPublishing(true)
    try {
      for (const channel of channels) {
        await apiFetch('/api/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draftId, channel }),
        })
      }
      await fetchDraft()
      alert(`Published to ${channels.join(', ')}.`)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }

  async function handleRestore(rev: number) {
    setRestoringRev(rev)
    try {
      await apiFetch(`/api/drafts/${draftId}/revisions/${rev}/restore`, { method: 'POST' })
      await fetchDraft()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error')
    } finally {
      setRestoringRev(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={28} className="animate-spin text-primary dark:text-primary-light" />
      </div>
    )
  }

  if (error || !draft) {
    return (
      <GlassPanel className="p-12 text-center max-w-md mx-auto mt-12">
        <p className="text-sm text-light-text dark:text-dark-text mb-3">
          {error ?? 'Draft not found.'}
        </p>
        <Link href="/library">
          <Button variant="secondary" size="sm">
            <ArrowLeft size={14} /> Back to Library
          </Button>
        </Link>
      </GlassPanel>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div className="min-w-0">
          <Link
            href="/library"
            className="text-xs text-light-text-muted dark:text-dark-text-muted hover:text-primary dark:hover:text-primary-light inline-flex items-center gap-1 mb-1"
          >
            <ArrowLeft size={12} /> Library
          </Link>
          <h1 className="text-2xl font-bold text-light-text dark:text-dark-text truncate">
            {draft.brief.topic}
          </h1>
          <p className="text-sm text-light-text-muted dark:text-dark-text-muted mt-0.5">
            {draft.brief.channels.join(' · ')}
            {draft.brandKitName ? ` · ${draft.brandKitName}` : ''}
          </p>
        </div>
        <StatusChip status={STATUS_TO_CHIP[draft.status]} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column */}
        <div className="lg:col-span-8 space-y-6">
          <CopyEditor draft={draft} onSaved={() => fetchDraft()} />
          <RefinementPanel draftId={draftId} onRefined={refreshAfterChange} />
        </div>

        {/* Right column */}
        <div className="lg:col-span-4 space-y-6">
          {/* Preview */}
          <GlassPanel className="p-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-light-text-muted dark:text-dark-text-muted mb-3">
              Preview
            </h3>
            <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-light-border/30 dark:bg-dark-border/30">
              {draft.exportUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={draft.exportUrl}
                  alt={draft.brief.topic}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                  <ImageIcon size={32} className="text-light-text-muted dark:text-dark-text-muted opacity-40" />
                  <span className="text-xs text-light-text-muted dark:text-dark-text-muted">
                    No preview available
                  </span>
                </div>
              )}
            </div>

            {/* Export / publish bar */}
            <div className="flex gap-2 mt-3">
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={handleExport}
                disabled={exporting || !draft.htmlContent}
              >
                {exporting ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Download size={13} />
                )}
                {draft.exportUrl ? 'Re-export' : 'Export'}
              </Button>
              {isAdmin && (
                <Button
                  variant="primary"
                  size="sm"
                  className="flex-1"
                  disabled={!draft.exportUrl || publishing}
                  onClick={handlePublish}
                >
                  {publishing ? <Loader2 size={13} className="animate-spin" /> : null}
                  Publish
                </Button>
              )}
            </div>
          </GlassPanel>

          {/* Revision history */}
          <GlassPanel className="p-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-light-text-muted dark:text-dark-text-muted mb-3">
              Revision History
            </h3>
            {revisions.length === 0 ? (
              <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
                No revisions yet.
              </p>
            ) : (
              <ul className="space-y-2 max-h-80 overflow-y-auto">
                {revisions.map((r) => (
                  <li
                    key={r.id}
                    className="glass-input rounded-xl px-3 py-2 flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs text-light-text dark:text-dark-text line-clamp-2">
                        <span className="font-mono text-light-text-muted dark:text-dark-text-muted">
                          v{r.revisionNumber}
                        </span>{' '}
                        {r.instruction}
                      </p>
                      <p className="text-[11px] text-light-text-muted dark:text-dark-text-muted mt-0.5">
                        {timeAgo(r.createdAt)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRestore(r.revisionNumber)}
                      disabled={restoringRev !== null}
                      className="flex-shrink-0"
                    >
                      {restoringRev === r.revisionNumber ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <RotateCcw size={12} />
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </GlassPanel>
        </div>
      </div>
    </>
  )
}
