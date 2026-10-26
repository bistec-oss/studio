'use client'

import React, { createRef, useCallback, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Sparkles } from 'lucide-react'
import type { Channel } from '@prisma/client'
import { Button } from '@/components/ui/Button'
import { SectionHead } from '@/components/ui/SectionHead'
import { ModelPicker } from '@/components/ui/ModelPicker'
import { ICON } from '@/components/ui/atoms'
import { ApiError, apiFetch } from '@/lib/apiFetch'
import { CAPTION_CHANNELS } from '@/lib/channels'
import { captionActionTargets } from '@/lib/captions/actionTargets'
import type { DraftDetail } from '@/lib/api-types'
import type { ModelKey } from '@/lib/models/catalogue'
import { regenerateStampTier } from '@/lib/models/resolve'
import { CaptionPanel, type CaptionUndoHandle, type RegenerateResult } from './CaptionPanel'
import { HeadlinePanel } from './HeadlinePanel'

export interface CaptionPanelsProps {
  draft: Pick<
    DraftDetail,
    | 'id'
    | 'headline'
    | 'headlineModel'
    | 'headlineModelSubstitutedFrom'
    | 'captions'
    | 'captionProviderIsClaude'
    | 'pendingAction'
    | 'pendingActionError'
    | 'status'
  >
  /** Called after an edit is saved, so the parent refetches the draft. */
  onSaved: () => void
  /** Called right after an async action is accepted (202) so the parent can
   *  refetch the draft and start polling `pendingAction`. Awaited: each panel
   *  settles its Undo only on state read after this refetch (change 015). */
  onActionStarted: () => void | Promise<unknown>
}

// The regenerate-copy bodies (012 FR-11): {} is "Regenerate all" (the
// registry captions, never the headline — A9). Each takes the model pick when one was
// made (008 FR-17); JSON.stringify drops an undefined pick (A5).
type RegenerateBody = ({ channel?: Channel } | { headline: true }) & { model?: ModelKey }

// "Regenerate all"'s targets, as the route reads {} (captions/requests.ts).
const ALL_CAPTIONS = CAPTION_CHANNELS.map((s) => s.channel)

// The caption card (012 FR-18; 021 FR-11, the study's Caption card): a bezel
// card whose head is "Captions" with "Regenerate all" in its tail, then the
// headline and one panel per registry channel, in registry order, as ruled
// blocks. Each panel owns its Regenerate and its Undo (FR-19). A background
// failure is shown by the page's pendingActionError line; a channel's own
// failure by its panel.
export function CaptionPanels({ draft, onSaved, onActionStarted }: CaptionPanelsProps) {
  // True while a regenerate POST is in flight and until the refetch after its
  // 202 has landed, so no panel can fire a second request (which would 409) in
  // the gap before pendingAction is seen. The background run is tracked via
  // the polled pendingAction and row status.
  const [firing, setFiring] = useState(false)
  // One undo handle per caption panel, so "Regenerate all" can capture every channel.
  const [undoRefs] = useState(
    () => new Map(CAPTION_CHANNELS.map((s) => [s.channel, createRef<CaptionUndoHandle>()]))
  )
  // 008 FR-20: "Regenerate all"'s model pick (undefined = the pre-selection,
  // A5) and a refused pick's 400 message.
  const [allModel, setAllModel] = useState<ModelKey | undefined>(undefined)
  const [allModelError, setAllModelError] = useState<string | undefined>(undefined)
  const pickAllModel = useCallback((next: ModelKey | undefined) => {
    setAllModel(next)
    setAllModelError(undefined)
  }, [])

  const ready = draft.status === 'EXPORTED' || draft.status === 'PUBLISHED'
  const writing = draft.status === 'IN_PROGRESS' && draft.captions.some((c) => c.status === 'PENDING')
  const regenerating = firing || draft.pendingAction === 'REGENERATE_COPY'
  // Single-flight is draft-level (A2): any in-flight action blocks every
  // panel's Regenerate and Undo — the server would 409 anyway.
  const locked = firing || draft.pendingAction !== null

  async function regenerate(body: RegenerateBody, failure: string): Promise<RegenerateResult> {
    setFiring(true)
    try {
      await apiFetch(`/api/drafts/${draft.id}/regenerate-copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (e: unknown) {
      setFiring(false)
      // A refused model pick is shown on the picker that sent it, not as a toast.
      if (e instanceof ApiError && e.code === 'MODEL_NOT_ALLOWED') return { ok: false, modelError: e.message }
      toast.error(e instanceof Error ? e.message : failure)
      return { ok: false, modelError: null }
    }
    // Accepted (202). Refetch so the parent picks up pendingAction and polls;
    // a failed refetch never turns the accept into a refusal.
    try {
      await onActionStarted()
    } catch {
      // The parent's fetch reports its own errors.
    } finally {
      setFiring(false)
    }
    return { ok: true }
  }

  async function regenerateAll() {
    // Let a blur-save in flight land first, then capture every caption's Undo
    // target BEFORE firing; put the previous ones back if refused.
    await Promise.all([...undoRefs.values()].map((r) => r.current?.flush()))
    const reverts = [...undoRefs.values()].flatMap((r) => (r.current ? [r.current.capture()] : []))
    setAllModelError(undefined)
    const result = await regenerate({ model: allModel }, 'Failed to regenerate the captions')
    // Accepted: every panel captured a snapshot, so every panel settles it.
    if (result.ok) undoRefs.forEach((r) => r.current?.arm())
    else {
      reverts.forEach((revert) => revert())
      if (result.modelError) setAllModelError(result.modelError)
    }
  }

  return (
    <section className="surface-bezel p-5">
      <SectionHead title="Captions" className="mb-3">
        {regenerating && (
          <span className="flex items-center gap-1.5 text-fg-muted">
            <Loader2 {...ICON} className="animate-spin" aria-hidden /> Regenerating…
          </span>
        )}
        <Button variant="ghost" size="sm" onClick={regenerateAll} disabled={!ready || locked}>
          {regenerating ? <Loader2 {...ICON} className="animate-spin" /> : <Sparkles {...ICON} />} Regenerate all
        </Button>
      </SectionHead>
      {/* "Regenerate all"'s model (008 FR-20), pre-selected per FR-09's
          mixed-stamp rule: the rows' common stamp, else the team default. */}
      {ready && (
        <ModelPicker
          id="draft-all-captions-model"
          surface="CAPTION"
          context={{ stamp: regenerateStampTier(ALL_CAPTIONS, draft) }}
          value={allModel}
          onChange={pickAllModel}
          label="All captions model"
          disabled={locked}
          captionProviderIsClaude={draft.captionProviderIsClaude}
          error={allModelError}
          className="mb-4 sm:max-w-xs"
        />
      )}
      {writing && (
        <p className="mb-3 flex items-center gap-1.5 text-ui-xs text-fg-muted">
          <Loader2 {...ICON} className="animate-spin" aria-hidden /> Writing the captions…
        </p>
      )}
      {/* The panels as ruled blocks on line-subtle (§8.14). */}
      <div className="divide-y divide-line-subtle [&>*:first-child]:pt-1 [&>*:last-child]:pb-0 [&>*]:py-5">
        <HeadlinePanel
          draftId={draft.id}
          headline={draft.headline}
          headlineModel={draft.headlineModel}
          headlineModelSubstitutedFrom={draft.headlineModelSubstitutedFrom}
          captionProviderIsClaude={draft.captionProviderIsClaude}
          busy={captionActionTargets(draft).includes('HEADLINE')}
          ready={ready}
          locked={locked}
          actionPending={draft.pendingAction !== null}
          editLocked={draft.pendingAction === 'REGENERATE_COPY'}
          onRegenerate={(model) => regenerate({ headline: true, model }, 'Failed to regenerate the headline')}
          onSaved={onSaved}
        />
        {draft.captions.map((caption) => (
          <CaptionPanel
            key={caption.channel}
            draftId={draft.id}
            caption={caption}
            ready={ready}
            locked={locked}
            actionPending={draft.pendingAction !== null}
            captionProviderIsClaude={draft.captionProviderIsClaude}
            onRegenerate={(model) =>
              regenerate({ channel: caption.channel, model }, 'Failed to regenerate the caption')
            }
            undoRef={undoRefs.get(caption.channel)}
            onSaved={onSaved}
          />
        ))}
      </div>
    </section>
  )
}
