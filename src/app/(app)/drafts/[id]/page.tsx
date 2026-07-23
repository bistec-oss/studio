'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
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
  Maximize2,
  AlertTriangle,
  Pencil,
} from 'lucide-react'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { StatusChip } from '@/components/ui/StatusChip'
import { PublishDialog } from '@/components/library/PublishDialog'
import { CopyEditor } from '@/components/drafts/CopyEditor'
import { RefinementPanel } from '@/components/drafts/RefinementPanel'
import { InlineEditModal } from '@/components/drafts/InlineEditModal'
import { apiFetch } from '@/lib/apiFetch'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useUndoableAction } from '@/lib/hooks/useUndoableAction'
import type { DraftAction, DraftDetail } from '@/lib/api-types'
import { aspectClassFor } from '@/lib/aspectRatio'
import { formatDateTime } from '@/lib/format'

// ─── Types ──────────────────────────────────────────────────────────────────

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
  const [retrying, setRetrying] = useState(false)
  const [restoringRev, setRestoringRev] = useState<number | null>(null)
  const { isAdmin } = useCurrentUser()
  const [showPublish, setShowPublish] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showInlineEdit, setShowInlineEdit] = useState(false)
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

  // Poll while a draft is still generating — or while an async action
  // (regenerate/refine) is running — so the preview updates without a
  // manual refresh.
  useEffect(() => {
    if (draft?.status !== 'IN_PROGRESS' && draft?.pendingAction == null) return
    const timer = setInterval(fetchDraft, 4000)
    return () => clearInterval(timer)
  }, [draft?.status, draft?.pendingAction, fetchDraft])

  // When a background action completes (pendingAction non-null → null) it may
  // have created a new revision — refresh the revision list.
  const prevPendingActionRef = useRef<DraftAction | null>(null)
  useEffect(() => {
    const prev = prevPendingActionRef.current
    prevPendingActionRef.current = draft?.pendingAction ?? null
    if (prev != null && draft?.pendingAction == null) {
      fetchRevisions()
    }
  }, [draft?.pendingAction, fetchRevisions])

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

  async function handleRetry() {
    setRetrying(true)
    try {
      await apiFetch(`/api/drafts/${draftId}/retry`, { method: 'POST' })
      // Back to IN_PROGRESS — refetch immediately; the poll takes over from here.
      await fetchDraft()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Retry failed')
    } finally {
      setRetrying(false)
    }
  }

  async function handleRegenerateDesign() {
    if (!draft) return
    setRegenDesign(true)
    // The action runs in the background (202, no payload) — capture the Undo
    // target (the revision we're on right now) BEFORE firing. Legacy drafts
    // without a revision pointer have nothing to undo to.
    if (draft.currentRevisionNumber != null) {
      designUndo.capture(draft.currentRevisionNumber)
    } else {
      designUndo.clear()
    }
    try {
      await apiFetch(`/api/drafts/${draftId}/regenerate-design`, { method: 'POST' })
      // Refetch immediately to pick up pendingAction; the poll takes over.
      await fetchDraft()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to regenerate design')
    } finally {
      setRegenDesign(false)
    }
  }

  const isPathB = draft?.brief.designMode === 'GENERATE'
  const isGenerating = draft?.status === 'IN_PROGRESS'
  // An async action (regenerate/refine) is running in the background.
  const actionPending = draft?.pendingAction != null
  const designActionPending =
    draft?.pendingAction === 'REGENERATE_DESIGN' || draft?.pendingAction === 'REFINE'
  const isFailed = draft?.status === 'FAILED'
  // Copy resolves independently of the image: show it the moment it's written,
  // even while the design is still rendering.
  const copyPending = isGenerating && !draft?.copyText
  const ready = draft?.status === 'EXPORTED' || draft?.status === 'PUBLISHED'

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
          {copyPending ? (
            <GlassPanel className="p-4">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-light-text-muted dark:text-dark-text-muted mb-3">
                Copy
              </h3>
              <div className="space-y-2.5 animate-pulse" aria-label="Generating copy" role="status">
                <div className="h-4 w-3/4 rounded bg-light-border/50 dark:bg-dark-border/50" />
                <div className="h-4 w-full rounded bg-light-border/50 dark:bg-dark-border/50" />
                <div className="h-4 w-5/6 rounded bg-light-border/50 dark:bg-dark-border/50" />
                <div className="h-4 w-2/3 rounded bg-light-border/50 dark:bg-dark-border/50" />
              </div>
              <p className="mt-3 text-xs text-light-text-muted dark:text-dark-text-muted flex items-center gap-1.5">
                <Loader2 size={11} className="animate-spin" /> Writing the copy…
              </p>
            </GlassPanel>
          ) : (
            <CopyEditor draft={draft} onSaved={() => fetchDraft()} onActionStarted={fetchDraft} />
          )}
          {/* Refinement only makes sense once there's a rendered design to refine. */}
          {ready && (
            <RefinementPanel
              draftId={draftId}
              pendingAction={draft.pendingAction}
              pendingActionError={draft.pendingActionError}
              conflict={draft.conflict}
              currentRevisionNumber={draft.currentRevisionNumber}
              onActionStarted={fetchDraft}
              onRefined={refreshAfterChange}
            />
          )}
          {ready && (
            <div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowInlineEdit(true)}
                disabled={actionPending || !draft.htmlContent}
                title="Manually edit text and images, then re-export"
              >
                <Pencil size={13} /> Edit inline
              </Button>
            </div>
          )}
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
                <button
                  onClick={() => setShowPreview(true)}
                  aria-label="View full screen"
                  title="View full screen"
                  className="group block w-full h-full cursor-zoom-in focus:outline-none"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={draft.exportUrl}
                    alt={draft.brief.topic}
                    className="w-full h-full object-contain"
                  />
                  <span className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    <Maximize2 size={14} />
                  </span>
                </button>
              ) : isGenerating ? (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center gap-3 animate-pulse bg-gradient-to-br from-light-border/40 to-transparent dark:from-dark-border/40"
                  aria-label="Generating design"
                  role="status"
                >
                  <Loader2 size={28} className="animate-spin text-primary/70 dark:text-primary-light/70" />
                  <span className="text-xs text-light-text-muted dark:text-dark-text-muted">
                    Designing your post…
                  </span>
                </div>
              ) : isFailed ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <AlertTriangle size={28} className="text-red-500" />
                  <span className="text-sm font-medium text-light-text dark:text-dark-text">
                    Generation failed
                  </span>
                  <span className="text-xs text-light-text-muted dark:text-dark-text-muted line-clamp-3">
                    {draft.failureReason ?? 'Something went wrong while generating this post.'}
                  </span>
                  <Button variant="secondary" size="sm" onClick={handleRetry} disabled={retrying}>
                    {retrying ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                    Retry
                  </Button>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                  <ImageIcon size={32} className="text-light-text-muted dark:text-dark-text-muted opacity-40" />
                  <span className="text-xs text-light-text-muted dark:text-dark-text-muted">
                    No preview available
                  </span>
                </div>
              )}
              {/* In-progress overlay for background design actions — the current
                  image stays visible underneath (NOT the generation skeleton). */}
              {designActionPending && (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/45 backdrop-blur-sm"
                  aria-label={draft.pendingAction === 'REFINE' ? 'Refining design' : 'Regenerating design'}
                  role="status"
                >
                  <Loader2 size={28} className="animate-spin text-white/90" />
                  <span className="text-xs font-medium text-white/90">
                    {draft.pendingAction === 'REFINE' ? 'Refining design…' : 'Regenerating design…'}
                  </span>
                </div>
              )}
            </div>

            {/* A background action failed — surface the error inline; the
                buttons below are re-enabled so the user can simply re-trigger
                (which clears this message). */}
            {draft.pendingActionError && !actionPending && (
              <p className="mt-3 text-xs text-red-500 flex items-start gap-1.5">
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                <span className="line-clamp-3">{draft.pendingActionError}</span>
              </p>
            )}

            {/* Export / publish bar */}
            <div className="flex gap-2 mt-3">
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={handleExport}
                disabled={exporting || !draft.htmlContent || actionPending}
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
                  disabled={!draft.exportUrl || actionPending}
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
                  disabled={regenDesign || designUndo.undoing || !draft.htmlContent || actionPending}
                  title="Generate a brand-new design from the same brief"
                >
                  {regenDesign || draft.pendingAction === 'REGENERATE_DESIGN' ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Sparkles size={13} />
                  )}
                  Regenerate design
                </Button>
                {designUndo.snapshot !== null && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={designUndo.undo}
                    disabled={regenDesign || designUndo.undoing || actionPending}
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
                {revisions.map((r) => {
                  const isCurrent = r.revisionNumber === draft.currentRevisionNumber
                  return (
                  <li
                    key={r.id}
                    className={[
                      'glass-input rounded-xl px-3 py-2 flex items-start justify-between gap-2',
                      isCurrent ? 'ring-1 ring-primary/60 dark:ring-primary-light/60' : '',
                    ].join(' ')}
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
                    {isCurrent ? (
                      <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-lg bg-primary/10 dark:bg-primary-light/10 text-primary dark:text-primary-light">
                        Current
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRestore(r.revisionNumber)}
                        disabled={restoringRev !== null || actionPending}
                        className="flex-shrink-0"
                        title={`Switch to v${r.revisionNumber}`}
                      >
                        {restoringRev === r.revisionNumber ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <RotateCcw size={12} />
                        )}
                      </Button>
                    )}
                  </li>
                  )
                })}
              </ul>
            )}
          </GlassPanel>
        </div>
      </div>

      {/* Full-screen preview of the exported PNG. */}
      {draft.exportUrl && (
        <ImageLightbox
          open={showPreview}
          onClose={() => setShowPreview(false)}
          src={draft.exportUrl}
          topic={draft.brief.topic}
          aspectRatio={draft.brief.aspectRatio}
        />
      )}

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

      {/* Manual inline edit — sandboxed iframe, text + image edits, synchronous save. */}
      {draft.htmlContent && (
        <InlineEditModal
          open={showInlineEdit}
          onClose={() => setShowInlineEdit(false)}
          draftId={draftId}
          html={draft.htmlContent}
          aspectRatio={draft.brief.aspectRatio}
          onSaved={refreshAfterChange}
        />
      )}
    </>
  )
}
