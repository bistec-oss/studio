'use client'

import React, { useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Check, AlertTriangle, Copy, Sparkles, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SectionHead } from '@/components/ui/SectionHead'
import { Notice } from '@/components/ui/Notice'
import { fieldClasses, fieldEdge } from '@/components/ui/Input'
import { ModelPicker } from '@/components/ui/ModelPicker'
import { ICON } from '@/components/ui/atoms'
import { apiFetch } from '@/lib/apiFetch'
import { captionLength, captionSpec } from '@/lib/channels'
import { useUndoableAction } from '@/lib/hooks/useUndoableAction'
import type { DraftCaptionDetail } from '@/lib/api-types'
import type { ModelKey } from '@/lib/models/catalogue'
import { GeneratedWith } from './GeneratedWith'

// The caption field (021 design.md §8, the study's .field): the shared
// multi-line field at radius-md, relaxed leading, resizable, and no longer
// ruled (021 FR-11).
const CAPTION_FIELD = `${fieldClasses} ${fieldEdge()} block resize-y`

export const count = (n: number) => n.toLocaleString('en-US')

// A panel's save state, in its head's tail: Saving… / Saved / Unsaved changes.
export function SaveState({ saving, saved }: { saving: boolean; saved: boolean }) {
  if (saving) {
    return (
      <span className="flex items-center gap-1.5 text-fg-muted">
        <Loader2 {...ICON} className="animate-spin" aria-hidden /> Saving…
      </span>
    )
  }
  if (saved) {
    return (
      <span className="flex items-center gap-1.5 font-semibold text-status-published">
        <Check {...ICON} aria-hidden /> Saved
      </span>
    )
  }
  return <span className="font-semibold text-status-scheduled">Unsaved changes</span>
}

/** Lets "Regenerate all" take every caption panel's undo snapshot before it
 *  fires. `capture` returns how to put back the snapshot it replaced; `flush`
 *  resolves once the panel's blur-save, if any, has landed; `arm` is called
 *  once the post-202 refetch has landed, so the panel settles its Undo. */
export interface CaptionUndoHandle {
  capture: () => () => void
  flush: () => Promise<void>
  arm: () => void
}

/** A regenerate's answer. A refused model pick (400 MODEL_NOT_ALLOWED) carries
 *  its message, which the firing panel shows on its picker (008 FR-20). */
export type RegenerateResult = { ok: true } | { ok: false; modelError: string | null }

export interface CaptionPanelProps {
  draftId: string
  caption: DraftCaptionDetail
  /** The draft can take a caption action (EXPORTED or PUBLISHED). */
  ready: boolean
  /** Any action is firing or running on the draft (single-flight, A2). */
  locked: boolean
  /** The polled `pendingAction` is non-null: an action is running on the draft. */
  actionPending: boolean
  /** Whether this draft's own caption provider is Claude (GET /api/drafts/[id]),
   *  so the picker hides exactly when the server would refuse a pick. */
  captionProviderIsClaude?: boolean
  /** Fires this channel's regenerate, with the model pick when one was made (A5).
   *  Resolves once the post-202 refetch has landed. */
  onRegenerate: (model?: ModelKey) => Promise<RegenerateResult>
  undoRef?: React.Ref<CaptionUndoHandle>
  /** Called after an edit is saved, so the parent refetches the draft. */
  onSaved: () => void
}

// One channel's caption (012 FR-18/FR-19): its h3 with the tail (save state,
// Undo, Copy, Generate/Regenerate), the textarea named by that heading
// and saved on blur, the per-registry counter with its limit or guide warning,
// the review / FAILED / last-regenerate-failed notices, and a skeleton
// only while the row is PENDING. Empty text on a row that is not PENDING always
// shows the editable field (TC-ASYNC-10).
export function CaptionPanel({
  draftId,
  caption,
  ready,
  locked,
  actionPending,
  captionProviderIsClaude,
  onRegenerate,
  undoRef,
  onSaved,
}: CaptionPanelProps) {
  const spec = captionSpec(caption.channel)
  // 008 FR-20: this channel's model pick (undefined = the stamp's pre-selection,
  // A5) and a refused pick's 400 message.
  const [model, setModel] = useState<ModelKey | undefined>(undefined)
  const [modelError, setModelError] = useState<string | undefined>(undefined)
  const pickModel = useCallback((next: ModelKey | undefined) => {
    setModel(next)
    setModelError(undefined)
  }, [setModel, setModelError])
  const headingId = useId()
  const failureId = useId()
  const counterId = useId()
  const warningId = useId()
  const [value, setValue] = useState(caption.text)
  const [saved, setSaved] = useState(true)
  const [saving, setSaving] = useState(false)
  // The caption before the last regenerate; Undo restores only this channel.
  const undo = useUndoableAction<string>(async (previous) => {
    await apiFetch(`/api/drafts/${draftId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: caption.channel, text: previous }),
    })
    setValue(previous)
    setSaved(true)
    onSaved()
  })

  // A regenerate's new text arrives through the parent's poll.
  useEffect(() => {
    setValue(caption.text)
    setSaved(true)
  }, [caption.text])

  const pending = caption.status === 'PENDING'

  // An empty caption has nothing to go back to. The snapshot is what the
  // field shows, typed or saved. Returns a revert for a refused request, so a
  // refusal only undoes its own capture and never drops an earlier live Undo.
  const captureUndo = () => {
    const previous = undo.snapshot
    if (value === '') undo.clear()
    else undo.capture(value)
    return () => (previous === null ? undo.clear() : undo.capture(previous))
  }
  // The blur-save in flight, if any. Clicking Regenerate blurs the field first,
  // so a regenerate waits for that PATCH to land; racing the claim, it would 409.
  const inFlightSave = useRef<Promise<void>>(Promise.resolve())
  const flushSave = () => inFlightSave.current
  // Set once the post-202 refetch has landed: from then on the polled props
  // describe this regenerate, never the state from before it was fired.
  const [settleArmed, setSettleArmed] = useState(false)
  const arm = () => setSettleArmed(true)
  useImperativeHandle(undoRef, () => ({ capture: captureUndo, flush: flushSave, arm }))

  // A regenerate that settled without changing the text (it failed, and A7
  // kept the caption) leaves nothing to undo. This settles on state once
  // armed, not on an observed PENDING → READY edge: a regenerate that finishes
  // before the refetch is served is never seen running, and the edge never
  // comes (change 015, L25).
  const clearUndo = undo.clear
  useEffect(() => {
    if (!settleArmed || actionPending || pending) return
    // Settle on state (018 FR-05, the 015 pattern): the reset also calls
    // clearUndo, so it stays in the effect rather than in render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettleArmed(false)
    if (caption.text === undo.snapshot) clearUndo()
  }, [settleArmed, actionPending, pending, caption.text, undo.snapshot, clearUndo])

  const length = captionLength(value)
  const over = spec.hardLimit !== null && length > spec.hardLimit
  const counter =
    spec.hardLimit !== null
      ? `${count(length)} / ${count(spec.hardLimit)} (${spec.label})`
      : `${count(length)} characters`
  const warning = over ? `Over the ${spec.label} limit` : null
  const lastFailed = caption.status === 'READY' && caption.failureReason !== null
  // The field's description: the notices about it, the counter
  // and any limit warning.
  const describedBy = [
    (caption.status === 'FAILED' || lastFailed) && failureId,
    counterId,
    warning && warningId,
  ]
    .filter(Boolean)
    .join(' ')
  const verb = value === '' ? 'Generate' : 'Regenerate'

  async function save() {
    if (saved || value === caption.text) {
      setSaved(true)
      return
    }
    setSaving(true)
    try {
      await apiFetch(`/api/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: caption.channel, text: value }),
      })
      setSaved(true)
      onSaved()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function regenerate() {
    // The action runs in the background (202, no payload): capture the Undo
    // target BEFORE firing, and put the previous one back if refused.
    await flushSave()
    const revert = captureUndo()
    setModelError(undefined)
    const result = await onRegenerate(model)
    if (result.ok) arm()
    else {
      revert()
      if (result.modelError) setModelError(result.modelError)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      toast.success('Caption copied')
    } catch {
      // Clipboard can be blocked (insecure origin, no permission).
      toast.error("Couldn't copy. Select the text and copy it manually.")
    }
  }

  return (
    <div>
      <SectionHead level={3} title={spec.label} id={headingId} className="mb-3">
        {!pending && <SaveState saving={saving} saved={saved} />}
        {undo.snapshot !== null && (
          <Button
            variant="ghost"
            size="sm"
            onClick={undo.undo}
            disabled={locked || undo.undoing}
            aria-label={`Undo ${spec.label} caption`}
            title="Restore the previous caption"
          >
            {undo.undoing ? <Loader2 {...ICON} className="animate-spin" /> : <Undo2 {...ICON} />} Undo
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={copy}
          disabled={pending || value === ''}
          aria-label={`Copy ${spec.label} caption`}
        >
          <Copy {...ICON} /> Copy
        </Button>
        {/* Any in-flight action blocks a new one — the server would 409 anyway. */}
        <Button
          variant="ghost"
          size="sm"
          onClick={regenerate}
          disabled={!ready || locked || undo.undoing}
          aria-label={`${verb} ${spec.label} caption`}
        >
          {pending ? <Loader2 {...ICON} className="animate-spin" /> : <Sparkles {...ICON} />} {verb}
        </Button>
      </SectionHead>

      {caption.status === 'FAILED' && (
        <Notice
          id={failureId}
          tone="error"
          className="mb-3"
          icon={<AlertTriangle {...ICON} className="mt-0.5 flex-shrink-0" aria-hidden />}
        >
          The {spec.label} caption failed to generate ({caption.failureReason ?? 'no reason given'}). Write it
          below, or use Generate.
        </Notice>
      )}

      {/* A failed regenerate keeps the READY text (A7) and records why. */}
      {lastFailed && (
        <Notice
          id={failureId}
          tone="warning"
          className="mb-3"
          icon={<AlertTriangle {...ICON} className="mt-0.5 flex-shrink-0" aria-hidden />}
        >
          The last regenerate failed: {caption.failureReason}. The caption below is unchanged.
        </Notice>
      )}

      {pending ? (
        <div
          className="animate-pulse space-y-2.5"
          aria-label={`Generating the ${spec.label} caption`}
          role="status"
        >
          <div className="h-4 w-3/4 rounded-ui-sm bg-line-subtle" />
          <div className="h-4 w-full rounded-ui-sm bg-line-subtle" />
          <div className="h-4 w-5/6 rounded-ui-sm bg-line-subtle" />
        </div>
      ) : (
        <>
          <textarea
            aria-labelledby={headingId}
            aria-describedby={describedBy}
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setSaved(false)
            }}
            onBlur={() => {
              inFlightSave.current = save()
            }}
            rows={8}
            className={CAPTION_FIELD}
            placeholder={`Write the ${spec.label} caption…`}
          />
          <div className="mt-2 flex items-baseline gap-4">
            <span
              id={counterId}
              className={`ml-auto shrink-0 font-mono text-ui-2xs ${over ? 'font-semibold text-status-failed' : 'text-fg-muted'}`}
            >
              {counter}
            </span>
          </div>
          {/* Never blocks the save: a hard limit is enforced at publish (FR-14). */}
          {warning && (
            <p
              id={warningId}
              className={`mt-1 text-right text-ui-xs font-semibold ${over ? 'text-status-failed' : 'text-status-scheduled'}`}
            >
              {warning}
            </p>
          )}
        </>
      )}

      {/* The panel's tail (008 FR-20): the model that wrote this caption (not
          while it is rewritten, and not for a FAILED row, whose stamp may
          belong to text since cleared), then this channel's regenerate model,
          pre-selected from that stamp (FR-09). */}
      {!pending && caption.status !== 'FAILED' && (
        <GeneratedWith stamp={caption.model} substitutedFrom={caption.modelSubstitutedFrom} className="mt-2" />
      )}
      {ready && (
        <ModelPicker
          id={`draft-caption-model-${caption.channel.toLowerCase()}`}
          surface="CAPTION"
          context={{ stamp: caption.model }}
          value={model}
          onChange={pickModel}
          label={`${spec.label} caption model`}
          disabled={locked || undo.undoing}
          captionProviderIsClaude={captionProviderIsClaude}
          error={modelError}
          className="mt-3 sm:max-w-xs"
        />
      )}
    </div>
  )
}
