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
  Clock,
} from 'lucide-react'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import { Button } from '@/components/ui/Button'
import { Panel } from '@/components/ui/Panel'
import { StatusChip } from '@/components/ui/StatusChip'
import { PublishDialog } from '@/components/library/PublishDialog'
import { CaptionPanels } from '@/components/drafts/CaptionPanels'
import { RefinementPanel } from '@/components/drafts/RefinementPanel'
import { InlineEditModal } from '@/components/drafts/InlineEditModal'
import { BackgroundNotice } from '@/components/drafts/BackgroundNotice'
import { Notice } from '@/components/ui/Notice'
import { CompositionNotice } from '@/components/drafts/CompositionNotice'
import { GeneratedWith, PostStyleLine } from '@/components/drafts/GeneratedWith'
import { FactsCheckNotice } from '@/components/drafts/FactsCheckNotice'
import { HeadlineImageNotice } from '@/components/drafts/HeadlineImageNotice'
import { ModelPicker } from '@/components/ui/ModelPicker'
import { PageTitle } from '@/components/ui/PageHead'
import { EYEBROW, FOCUS, ICON, ICON_SM, PILL_BADGE } from '@/components/ui/atoms'
import { ApiError, apiFetch } from '@/lib/apiFetch'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useUndoableAction } from '@/lib/hooks/useUndoableAction'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { applyFailureNotice, APPLY_FAILURES, type ApplyFailure } from '@/lib/applyText'
import type { DraftDetail } from '@/lib/api-types'
import { ASPECT_LABELS, aspectClassFor, dimensionsFor } from '@/lib/aspectRatio'
import { channelLabel } from '@/lib/channels'
import { formatDateTime } from '@/lib/format'
import type { ModelKey } from '@/lib/models/catalogue'
import { generatedWith } from '@/lib/models/stampLabel'

// The words on the preview overlay while a design action runs (no ellipsis).
function designOverlayLabel(action: DraftDetail['pendingAction']): string {
  if (action === 'REFINE') return 'Refining design'
  if (action === 'APPLY_TEXT') return 'Applying headline'
  return 'Regenerating design'
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface Revision {
  id: string
  revisionNumber: number
  instruction: string
  exportUrl: string | null
  createdAt: string
  // 008 FR-16: the model whose output this version's HTML is (null = unknown).
  model: string | null
  // …and the refused value it replaced, or null (FR-20's "(substituted)").
  modelSubstitutedFrom: string | null
}

const STATUS_TO_CHIP: Record<DraftDetail['status'], 'draft' | 'exported' | 'published' | 'failed'> =
  {
    IN_PROGRESS: 'draft',
    EXPORTED: 'exported',
    PUBLISHED: 'published',
    FAILED: 'failed',
  }

// The revision list's retry backoff after a failed fetch (018 FR-06).
const REVISION_RETRY_DELAYS_MS = [2000, 4000, 8000]

// The expand badge sits on the post image, which can be any colour, so it
// uses the study's fixed .expand values, paper on ink, that read in both
// themes: 32 × 32, inset 10 px, shown while the post is hovered or focused.
const EXPAND_BADGE =
  'absolute right-2.5 top-2.5 inline-flex h-control-sm w-control-sm items-center justify-center rounded-[10px] bg-[#fbfaf8] text-[#181816] shadow-[0_4px_12px_-4px_rgb(0_0_0/0.3)] opacity-0 transition-opacity duration-fast ease-standard group-hover:opacity-100 group-focus-visible:opacity-100' // ui-exception: drawn on the post image, fixed paper-on-ink per DESIGN_SYSTEM.md §8.12

// A version cell (the study's .v): thumbnail over the number and label. The
// current one adds the nav "current" look with a 1.5 px ink ring.
const VERSION_CELL =
  'flex w-full min-w-0 flex-col items-center gap-2 rounded-ui-md px-1 pb-1.5 pt-2 text-center transition-colors duration-fast ease-standard'

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
  const { isTeamAdmin } = useCurrentUser()
  const [showPublish, setShowPublish] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showInlineEdit, setShowInlineEdit] = useState(false)
  const [regenDesign, setRegenDesign] = useState(false)
  const [applyingText, setApplyingText] = useState(false)
  const confirm = useConfirm()
  // 008 FR-20: the design regenerate's model pick (undefined = the current
  // design's stamp, A5) and a refused pick's 400 message.
  const [designModel, setDesignModel] = useState<ModelKey | undefined>(undefined)
  const [designModelError, setDesignModelError] = useState<string | undefined>(undefined)
  const pickDesignModel = useCallback((next: ModelKey | undefined) => {
    setDesignModel(next)
    setDesignModelError(undefined)
  }, [])
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

  // Resolves true when the list loaded, false when the request failed.
  const fetchRevisions = useCallback(async (): Promise<boolean> => {
    try {
      setRevisions(await apiFetch<Revision[]>(`/api/drafts/${draftId}/revisions`))
      return true
    } catch {
      // Non-fatal — revision list is supplementary.
      return false
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

  // The revision list follows the draft: whenever the current revision is not
  // in the loaded list (a background refine or regenerate created it),
  // refetch the list. State, not a pendingAction non-null → null edge — an
  // action that finishes before its post-202 refetch is served is never seen
  // running, so that edge never comes (change 015). One request per missing
  // number, so a list that still lacks it can't loop. A request that FAILED
  // resets the guard and tries again after 2, 4 then 8 s (018 FR-06); a
  // success that still lacks the number is never retried.
  const requestedRevisionRef = useRef<number | null>(null)
  const revisionRetryRef = useRef<{ revision: number | null; tries: number }>({
    revision: null,
    tries: 0,
  })
  const revisionRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [revisionRetryTick, setRevisionRetryTick] = useState(0)
  useEffect(() => {
    const current = draft?.currentRevisionNumber
    if (current == null || revisions.some((r) => r.revisionNumber === current)) return
    if (requestedRevisionRef.current === current) return
    requestedRevisionRef.current = current
    void fetchRevisions().then((ok) => {
      if (ok) return
      const prior = revisionRetryRef.current
      const tries = prior.revision === current ? prior.tries : 0
      if (tries >= REVISION_RETRY_DELAYS_MS.length) return
      revisionRetryRef.current = { revision: current, tries: tries + 1 }
      revisionRetryTimer.current = setTimeout(() => {
        // Only while this number is still the one asked for.
        if (requestedRevisionRef.current !== current) return
        requestedRevisionRef.current = null
        setRevisionRetryTick((t) => t + 1)
      }, REVISION_RETRY_DELAYS_MS[tries])
    })
  }, [draft?.currentRevisionNumber, revisions, fetchRevisions, revisionRetryTick])
  useEffect(
    () => () => {
      if (revisionRetryTimer.current) clearTimeout(revisionRetryTimer.current)
    },
    [],
  )

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
    const previousUndo = designUndo.snapshot
    if (draft.currentRevisionNumber != null) {
      designUndo.capture(draft.currentRevisionNumber)
    } else {
      designUndo.clear()
    }
    setDesignModelError(undefined)
    try {
      // {} or { model }: an undefined pick is dropped, so the server resolves
      // the stamp default (A5).
      await apiFetch(`/api/drafts/${draftId}/regenerate-design`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: designModel }),
      })
      // Refetch immediately to pick up pendingAction; the poll takes over.
      await fetchDraft()
    } catch (e: unknown) {
      // A refused model pick (400, nothing claimed) shows on the design
      // picker, not as a toast, and puts back the Undo target it replaced.
      if (e instanceof ApiError && e.code === 'MODEL_NOT_ALLOWED') {
        setDesignModelError(e.message)
        if (previousUndo === null) designUndo.clear()
        else designUndo.capture(previousUndo)
      } else {
        toast.error(e instanceof Error ? e.message : 'Failed to regenerate design')
      }
    } finally {
      setRegenDesign(false)
    }
  }

  // 031 FR-44: put the new headline on the image (no model call). A refusal is a
  // 422 before anything is claimed; a render-time failure arrives later as
  // pendingActionError. Undo is captured first, as for regenerate.
  async function handleApplyText() {
    if (!draft) return
    const oldText = draft.headlineImage?.renderedHeadline ?? ''
    const confirmed = await confirm({
      title: 'Apply to image',
      description: `Replace “${oldText}” with “${draft.headline ?? ''}” in the image. Styling inside the headline (for example a colored word or a line break) becomes plain text. Undo brings the old version back.`,
      confirmLabel: 'Apply to image',
      danger: false,
    })
    if (!confirmed) return
    setApplyingText(true)
    const previousUndo = designUndo.snapshot
    if (draft.currentRevisionNumber != null) {
      designUndo.capture(draft.currentRevisionNumber)
    } else {
      designUndo.clear()
    }
    try {
      await apiFetch(`/api/drafts/${draftId}/apply-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'headline' }),
      })
      await fetchDraft()
    } catch (e: unknown) {
      // Nothing was claimed or written: put back the Undo target it replaced.
      if (previousUndo === null) designUndo.clear()
      else designUndo.capture(previousUndo)
      const code = e instanceof ApiError ? e.code : undefined
      const known = (APPLY_FAILURES as readonly string[]).includes(code ?? '')
      toast.error(known ? applyFailureNotice(code as ApplyFailure) : e instanceof Error ? e.message : 'Could not apply the headline')
    } finally {
      setApplyingText(false)
    }
  }

  const isPathB = draft?.brief.designMode === 'GENERATE'
  const isGenerating = draft?.status === 'IN_PROGRESS'
  // An async action (regenerate/refine) is running in the background.
  const actionPending = draft?.pendingAction != null
  const designActionPending =
    draft?.pendingAction === 'REGENERATE_DESIGN' ||
    draft?.pendingAction === 'REFINE' ||
    draft?.pendingAction === 'APPLY_TEXT'
  const isFailed = draft?.status === 'FAILED'
  const ready = draft?.status === 'EXPORTED' || draft?.status === 'PUBLISHED'

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={28} strokeWidth={1.4} className="animate-spin text-fg-muted" />
      </div>
    )
  }

  if (error || !draft) {
    return (
      <Panel className="mx-auto mt-12 max-w-md p-12 text-center">
        <p className="mb-3 text-ui-sm text-fg">{error ?? 'Draft not found.'}</p>
        <Link href="/library">
          <Button variant="secondary" size="sm">
            <ArrowLeft {...ICON} /> Back to library
          </Button>
        </Link>
      </Panel>
    )
  }

  const { width, height } = dimensionsFor(draft.brief.aspectRatio)
  const ratioShort = ASPECT_LABELS[draft.brief.aspectRatio ?? 'SQUARE'].split(' ')[0]
  const currentRevision = revisions.find((r) => r.revisionNumber === draft.currentRevisionNumber)
  // The versions read left to right, oldest first, like the study (§8.13);
  // the API lists newest first.
  const versions = [...revisions].sort((a, b) => a.revisionNumber - b.revisionNumber)
  // Regenerate design's Undo — Path B only, like the button itself.
  const showUndo = designUndo.snapshot !== null
  // The meta row (the study's .meta): channels, kit and size, split by 3 px dots.
  const meta = [
    draft.brief.channels.map(channelLabel).join(' · '),
    draft.brandKitName,
    ratioShort,
  ].filter((m): m is string => Boolean(m))

  return (
    <>
      {/* The page head (021 FR-11, the study's .page-head): the back link, the
          h1 and the meta row on the left, the action bar on the right. It
          comes before the stage, so it is also first in the tab order. */}
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
        <div className="min-w-0">
          <Link
            href="/library"
            className={`mb-2 inline-flex items-center gap-1.5 text-ui-xs font-medium text-fg-muted transition-colors duration-fast ease-standard hover:text-fg ${FOCUS}`}
          >
            <ArrowLeft {...ICON_SM} aria-hidden /> Library
          </Link>
          {/* The page eyebrow stays (021 A7), as the Graphite micro-label; the
              kit is in the meta row below. */}
          <p className={EYEBROW}>Draft</p>
          <PageTitle className="mt-2 break-words lg:truncate">
            <span title={draft.brief.topic}>{draft.brief.topic}</span>
          </PageTitle>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-ui-sm text-fg-muted">
            <StatusChip status={STATUS_TO_CHIP[draft.status]} />
            {meta.map((m, i) => (
              <React.Fragment key={i}>
                {i > 0 && (
                  <span aria-hidden className="size-[3px] flex-shrink-0 rounded-full bg-fg-muted" />
                )}
                <span>{m}</span>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* The action bar (§8.17, within FR-12): every control stays a visible
            button with its own name, Publish the one primary. No More menu
            and no Refine button (021 A5). It wraps, never scrolls. */}
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {/* Regenerate design — Path B (freeform) only. Produces a fresh design
              variant; the prior one is saved to history and offered as Undo. */}
          {isPathB && (
            <Button
              variant="secondary"
              onClick={handleRegenerateDesign}
              disabled={regenDesign || designUndo.undoing || !draft.htmlContent || actionPending}
              title="Generate a brand-new design from the same brief"
            >
              {regenDesign || draft.pendingAction === 'REGENERATE_DESIGN' ? (
                <Loader2 {...ICON} className="animate-spin" />
              ) : (
                <Sparkles {...ICON} />
              )}
              Regenerate design
            </Button>
          )}
          {ready && (
            <Button
              variant="secondary"
              onClick={() => setShowInlineEdit(true)}
              disabled={actionPending || !draft.htmlContent}
              title="Manually edit text and images, then re-export"
            >
              <Pencil {...ICON} /> Edit inline
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={handleExport}
            disabled={exporting || !draft.htmlContent || actionPending}
          >
            {exporting ? <Loader2 {...ICON} className="animate-spin" /> : <Download {...ICON} />}
            {draft.exportUrl ? 'Re-export' : 'Export'}
          </Button>
          {isTeamAdmin && (
            <Button
              variant="primary"
              disabled={!draft.exportUrl || actionPending}
              onClick={() => setShowPublish(true)}
            >
              Publish
            </Button>
          )}
        </div>
      </div>

      {isPathB && regenDesign && (
        <p className="mb-4 flex items-center gap-1.5 text-ui-xs text-fg-muted">
          <Loader2 {...ICON} className="animate-spin" /> Designing a new variant — up to a minute…
        </p>
      )}

      {/* A background action failed — surface the error inline; the
          buttons above are re-enabled so the user can simply re-trigger.
          Claiming a new run does not clear the message (it is hidden
          while that run is pending); the run settling does: success
          clears it, a failure replaces it. */}
      {draft.pendingActionError && !actionPending && (
        <p className="mb-4 flex items-start gap-1.5 text-ui-xs text-status-failed">
          <AlertTriangle {...ICON} className="mt-0.5 flex-shrink-0" />
          <span className="line-clamp-3">{draft.pendingActionError}</span>
        </p>
      )}

      {/* The grid (021 FR-11, 026 FR-08): the stage and Refine design left, the
          captions right from xl (1280 px); one column below it: Preview,
          Refine design, Captions. */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="flex min-w-0 flex-col gap-3.5">
          {/* ── The stage (§8.12): a bezel card holding the post ──────────── */}
          <section aria-label="Preview" className="surface-bezel min-w-0 p-5 sm:p-7">
            <div className="mb-[18px] flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <span className={EYEBROW}>Preview</span>
              <span className="font-mono text-ui-2xs text-fg-muted">
                {width} × {height}
                {currentRevision && ` · v${currentRevision.revisionNumber} of ${revisions.length}`}
              </span>
            </div>

            {/* The post, at its own aspect ratio, never cropped, rounded or
              restyled (021 A3): its immediate wrapper is square too. */}
            <div
              className={`relative mx-auto ${aspectClassFor(draft.brief.aspectRatio)} w-full max-w-[392px] bg-canvas`}
            >
              {draft.exportUrl ? (
                <button
                  onClick={() => setShowPreview(true)}
                  aria-label="View full screen"
                  title="View full screen"
                  className={`group relative block h-full w-full cursor-zoom-in ${FOCUS}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={draft.exportUrl}
                    alt={draft.brief.topic}
                    className="block h-full w-full object-contain"
                  />
                  <span aria-hidden className={EXPAND_BADGE}>
                    <Maximize2 {...ICON_SM} />
                  </span>
                </button>
              ) : isGenerating ? (
                <div
                  className="absolute inset-0 flex animate-pulse flex-col items-center justify-center gap-3 bg-canvas"
                  aria-label="Generating design"
                  role="status"
                >
                  <Loader2 size={28} strokeWidth={1.4} className="animate-spin text-fg-muted" />
                  <span className="text-ui-xs text-fg-muted">Designing your post…</span>
                </div>
              ) : isFailed ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <AlertTriangle size={28} strokeWidth={1.4} className="text-status-failed" />
                  <span className="text-ui-sm font-semibold text-fg">Generation failed</span>
                  <span className="line-clamp-3 text-ui-xs text-fg-muted">
                    {draft.failureReason ?? 'Something went wrong while generating this post.'}
                  </span>
                  <Button variant="secondary" size="sm" onClick={handleRetry} disabled={retrying}>
                    {retrying ? (
                      <Loader2 {...ICON} className="animate-spin" />
                    ) : (
                      <RotateCcw {...ICON} />
                    )}
                    Retry
                  </Button>
                </div>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2">
                  <ImageIcon size={32} strokeWidth={1.4} className="text-fg-muted" />
                  <span className="text-ui-xs text-fg-muted">No preview available</span>
                </div>
              )}
              {/* In-progress overlay for background design actions — the current
                image stays visible underneath (NOT the generation skeleton).
                The words sit on an opaque label, never on the scrim (§4.2). */}
              {designActionPending && (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center bg-scrim/40"
                  aria-label={
                    designOverlayLabel(draft.pendingAction)
                  }
                  role="status"
                >
                  <span className="surface-raised flex items-center gap-2 px-3 py-2 text-ui-xs font-semibold text-fg">
                    <Loader2 {...ICON} className="animate-spin" />
                    {designOverlayLabel(draft.pendingAction)}…
                  </span>
                </div>
              )}
            </div>

            {/* 008 FR-20: the model that made the current design. */}
            {!isFailed && (
              <GeneratedWith
                stamp={draft.designModel}
                substitutedFrom={draft.designModelSubstitutedFrom}
                className="mt-4 text-center"
              />
            )}

            {/* 027 FR-13: the post style the draft was made with. */}
            {!isFailed && <PostStyleLine style={draft.postStyle} className="mt-1 text-center" />}

            {/* 005 FR-07: why this design has no AI background, when that
              was not the model's choice. Non-blocking. */}
            {draft.backgroundSkipped && <BackgroundNotice skipped={draft.backgroundSkipped} />}

            {/* 031 FR-14: the user's own image key failed and the team's provider
              made the image. Non-blocking. */}
            {draft.imageSourceNotice && (
              <Notice tone="warning" role="status" data-testid="image-source-notice" className="mt-4">
                <p className="text-ui-xs text-fg">{draft.imageSourceNotice.message}</p>
              </Notice>
            )}

            {/* 031 FR-24: the render could not load a post font and used a
              fallback. Non-blocking. */}
            {draft.fontNotice && (
              <Notice tone="warning" role="status" data-testid="font-notice" className="mt-4">
                <p className="text-ui-xs text-fg">{draft.fontNotice.message}</p>
              </Notice>
            )}

            {/* 009 FR-15: the image style asked for was not (fully) applied. */}
            {draft.compositionNotice && <CompositionNotice notice={draft.compositionNotice} />}

            {/* 027 FR-13: values the post states that the brief does not. Never blocks. */}
            <FactsCheckNotice check={draft.factsCheck} />

            {/* 030 FR-13: the image does not show the current headline. Never blocks. */}
            {draft.headlineImage && (
              <HeadlineImageNotice
                image={draft.headlineImage}
                canEditInline={ready && !!draft.htmlContent}
                canRegenerate={isPathB && !!draft.htmlContent}
                canApply={ready && !!draft.htmlContent}
                disabled={actionPending || regenDesign || applyingText || designUndo.undoing}
                onEditInline={() => setShowInlineEdit(true)}
                onRegenerateDesign={handleRegenerateDesign}
                onApply={handleApplyText}
              />
            )}

            {/* The versions (§8.13, the study's .v): a thumbnail at the post's
              ratio, the number, the instruction. The current one is ringed in
              ink with a "Current" pill. No previous/next arrows (021 A5). */}
            <h2 className="sr-only">Revision History</h2>
            {revisions.length === 0 ? (
              <p className="mt-5 text-ui-sm text-fg-muted">No revisions yet.</p>
            ) : (
              <ul aria-label="Versions" className="mt-5 grid grid-cols-4 gap-2">
                {versions.map((r) => {
                  const isCurrent = r.revisionNumber === draft.currentRevisionNumber
                  // 008 FR-20: the model that made this version. The cell is too
                  // narrow for the sentence, so it shows the name and keeps the
                  // sentence for the tooltip and screen readers.
                  const madeWith = generatedWith(r.model, r.modelSubstitutedFrom)
                  const frame = (
                    <>
                      {/* A version's own render, shown as rendered (§8.12): square. */}
                      <span
                        className={`relative block w-11 flex-shrink-0 ${aspectClassFor(draft.brief.aspectRatio)} bg-canvas`}
                      >
                        {r.exportUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.exportUrl}
                            alt=""
                            className="block h-full w-full object-contain"
                          />
                        )}
                      </span>
                      <span className="block w-full min-w-0">
                        <span className="flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5 font-mono text-ui-xs font-semibold text-fg">
                          v{r.revisionNumber}
                          {isCurrent && <span className={`${PILL_BADGE} font-sans`}>Current</span>}
                          {restoringRev === r.revisionNumber && (
                            <Loader2 {...ICON_SM} className="animate-spin text-fg-muted" />
                          )}
                        </span>
                        <span className="mt-0.5 line-clamp-2 break-words text-ui-2xs leading-snug text-fg-muted">
                          {r.instruction}
                        </span>
                        <span className="mt-0.5 block text-ui-2xs leading-snug text-fg-muted">
                          {formatDateTime(r.createdAt)}
                        </span>
                        {madeWith && (
                          <span
                            className="mt-0.5 block break-words text-ui-2xs leading-snug text-fg-muted"
                            title={madeWith.text}
                          >
                            <span className="sr-only">Generated with </span>
                            {madeWith.name}
                            {madeWith.substitutedTitle && (
                              <>
                                {' '}
                                <span title={madeWith.substitutedTitle}>(substituted)</span>
                                <span className="sr-only">: {madeWith.substitutedTitle}</span>
                              </>
                            )}
                          </span>
                        )}
                      </span>
                    </>
                  )
                  return (
                    <li key={r.id} className="min-w-0">
                      {/* Cells are narrow, so the clamped instruction is repeated in
                        the tooltip; the accessible name stays "Switch to vN". */}
                      {isCurrent ? (
                        <div
                          aria-current="true"
                          title={r.instruction ?? undefined}
                          className={`${VERSION_CELL} bg-surface-raised shadow-panel ring-[1.5px] ring-inset ring-fg`}
                        >
                          {frame}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRestore(r.revisionNumber)}
                          disabled={restoringRev !== null || actionPending}
                          aria-label={`Switch to v${r.revisionNumber}`}
                          title={`Switch to v${r.revisionNumber}${r.instruction ? ` — ${r.instruction}` : ''}`}
                          className={`${VERSION_CELL} enabled:hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
                        >
                          {frame}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}

            {/* The note and Undo (the study's .vnote). */}
            {(versions.length > 1 || showUndo) && (
              <div className="mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-ui-xs text-fg-muted">
                {versions.length > 1 && (
                  <span className="flex min-w-0 items-center gap-2">
                    <Clock {...ICON_SM} aria-hidden className="flex-shrink-0" />
                    Switching is instant — each version keeps its own export.
                  </span>
                )}
                {showUndo && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={designUndo.undo}
                    disabled={regenDesign || designUndo.undoing || actionPending}
                    title="Go back to the previous design"
                  >
                    {designUndo.undoing ? (
                      <Loader2 {...ICON_SM} className="animate-spin" />
                    ) : (
                      <Undo2 {...ICON_SM} />
                    )}
                    Undo
                  </Button>
                )}
              </div>
            )}

            {/* The design regenerate's model (008 FR-20), pre-selected from the
              current design's stamp (FR-09). Path B only, like the button. */}
            {isPathB && ready && (
              <div className="mt-5 border-t border-line-subtle pt-4">
                <ModelPicker
                  id="draft-design-model"
                  surface="DESIGN_FREEFORM"
                  context={{ stamp: draft.designModel, designPath: 'B' }}
                  value={designModel}
                  onChange={pickDesignModel}
                  label="Design model"
                  disabled={regenDesign || designUndo.undoing || actionPending}
                  error={designModelError}
                  className="sm:max-w-xs"
                />
              </div>
            )}
          </section>

          {/* Refinement only makes sense once there's a rendered design to refine. */}
          {ready && (
            <RefinementPanel
              draftId={draftId}
              designPath={isPathB ? 'B' : 'A'}
              pendingAction={draft.pendingAction}
              pendingActionError={draft.pendingActionError}
              conflict={draft.conflict}
              notApplied={draft.notApplied}
              currentRevisionNumber={draft.currentRevisionNumber}
              onActionStarted={fetchDraft}
              onRefined={refreshAfterChange}
            />
          )}
        </div>

        {/* ── The cards (§8.14): the captions ───────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-3.5">
          {/* Captions resolve independently of the image, each panel by its own
              row: a skeleton only while that row is PENDING, so empty text on a
              written row is always an editable field (TC-ASYNC-10). */}
          <CaptionPanels draft={draft} onSaved={() => fetchDraft()} onActionStarted={fetchDraft} />
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
          headlineState={draft.headlineImage?.state}
          onClose={() => {
            // A partial failure closes here, not via onSuccess, and the
            // channels that did publish can change the draft's status.
            setShowPublish(false)
            fetchDraft()
          }}
          onSuccess={() => {
            setShowPublish(false)
            fetchDraft()
          }}
        />
      )}

      {/* Manual inline edit — sandboxed iframe; whole-document text + image
          edits, or single-element edits (change 004 T24). Mounted per open so
          the modal reads html + revision pointer from THIS draft read, once. */}
      {draft.htmlContent && showInlineEdit && (
        <InlineEditModal
          open={showInlineEdit}
          onClose={() => setShowInlineEdit(false)}
          draftId={draftId}
          html={draft.htmlContent}
          baseRevisionNumber={draft.currentRevisionNumber}
          aspectRatio={draft.brief.aspectRatio}
          compositeKey={draft.composition?.composites?.[0]?.source.key ?? null}
          onSaved={refreshAfterChange}
        />
      )}
    </>
  )
}
