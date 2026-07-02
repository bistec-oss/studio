'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import Link from 'next/link'
import {
  Loader2,
  RotateCcw,
  Download,
  ImageIcon,
  ArrowLeft,
  Sparkles,
  Undo2,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { StatusChip } from '@/components/ui/StatusChip'
import { PublishDialog } from '@/components/library/PublishDialog'
import { CopyEditor } from '@/components/drafts/CopyEditor'
import { RefinementPanel } from '@/components/drafts/RefinementPanel'
import { apiFetch } from '@/lib/apiFetch'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useUndoableAction } from '@/lib/hooks/useUndoableAction'
import type { AspectRatio } from '@prisma/client'
import { aspectClassFor } from '@/lib/aspectRatio'
import { formatDateTime } from '@/lib/format'

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
    aspectRatio: AspectRatio
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

const STATUS_TO_CHIP: Record<DraftDetail['status'], 'draft' | 'exported' | 'published' | 'failed'> = {
  IN_PROGRESS: 'draft',
  EXPORTED: 'exported',
  PUBLISHED: 'published',
  FAILED: 'failed',
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
  const { isAdmin } = useCurrentUser()
  const [showPublish, setShowPublish] = useState(false)
  const [regenDesign, setRegenDesign] = useState(false)
  // Snapshot = revisionNumber of the design taken before the last regenerate (Undo target).
  const designUndo = useUndoableAction<number>(async (rev) => {
    await apiFetch(`/api/drafts/${draftId}/revisions/${rev}/restore`, { method: 'POST' })
    refreshAfterChange()
  })

  const fetchDraft = useCallback(async () => {
    try {
      const data = await apiFetch<DraftDetail>(`/api/drafts/${draftId}`)
      setDraft(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [draftId])

  const fetchRevisions = useCallback(async () => {
    try {
      setRevisions(await apiFetch<Revision[]>(`/api/drafts/${draftId}/revisions`))
    } catch {
      // Non-fatal — revision list is supplementary.
    }
  }, [draftId])

  useEffect(() => {
    fetchDraft()
    fetchRevisions()
  }, [fetchDraft, fetchRevisions])

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
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setExporting(false)
    }
  }

  async function handleRestore(rev: number) {
    setRestoringRev(rev)
    try {
      await apiFetch(`/api/drafts/${draftId}/revisions/${rev}/restore`, { method: 'POST' })
      await fetchDraft()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setRestoringRev(null)
    }
  }

  async function handleRegenerateDesign() {
    setRegenDesign(true)
    try {
      const data = await apiFetch<{ exportUrl: string | null; previousRevisionNumber: number | null }>(
        `/api/drafts/${draftId}/regenerate-design`,
        { method: 'POST' }
      )
      // The prior design is snapshotted as a revision — offer it as a one-click Undo.
      if (data.previousRevisionNumber === null) {
        designUndo.clear()
      } else {
        designUndo.capture(data.previousRevisionNumber)
      }
      refreshAfterChange()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to regenerate design')
    } finally {
      setRegenDesign(false)
    }
  }

  const isPathB = draft?.brief.designMode === 'GENERATE'

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
            <div className={`relative ${aspectClassFor(draft.brief.aspectRatio)} w-full rounded-xl overflow-hidden bg-light-border/30 dark:bg-dark-border/30`}>
              {draft.exportUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={draft.exportUrl}
                  alt={draft.brief.topic}
                  className="w-full h-full object-contain"
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
                  disabled={!draft.exportUrl}
                  onClick={() => setShowPublish(true)}
                >
                  Publish
                </Button>
              )}
            </div>

            {/* Regenerate design — Path B (freeform) only. Produces a fresh design
                variant; the prior one is saved to history and offered as Undo. */}
            {isPathB && (
              <div className="mt-2 flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={handleRegenerateDesign}
                  disabled={regenDesign || designUndo.undoing || !draft.htmlContent}
                  title="Generate a brand-new design from the same brief"
                >
                  {regenDesign ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  Regenerate design
                </Button>
                {designUndo.snapshot !== null && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={designUndo.undo}
                    disabled={regenDesign || designUndo.undoing}
                    title="Go back to the previous design"
                  >
                    {designUndo.undoing ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />}
                    Undo
                  </Button>
                )}
              </div>
            )}
            {isPathB && regenDesign && (
              <p className="mt-2 text-xs text-light-text-muted dark:text-dark-text-muted flex items-center gap-1.5">
                <Loader2 size={11} className="animate-spin" /> Designing a new variant — up to a minute…
              </p>
            )}
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
                        {formatDateTime(r.createdAt)}
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

      {/* Publish dialog — channel + optional schedule (shared with Library). */}
      {showPublish && (
        <PublishDialog
          draftId={draftId}
          onClose={() => setShowPublish(false)}
          onSuccess={() => {
            setShowPublish(false)
            fetchDraft()
          }}
        />
      )}
    </>
  )
}
