'use client'

import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Loader2, Sparkles, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, fieldErrorClasses } from '@/components/ui/Input'
import { SectionHead } from '@/components/ui/SectionHead'
import { ModelPicker } from '@/components/ui/ModelPicker'
import { ICON } from '@/components/ui/atoms'
import { apiFetch } from '@/lib/apiFetch'
import { HEADLINE_MAX, validateHeadline } from '@/lib/captions/headline'
import { useUndoableAction } from '@/lib/hooks/useUndoableAction'
import type { ModelKey } from '@/lib/models/catalogue'
import { SaveState, count, type RegenerateResult } from './CaptionPanel'
import { GeneratedWith } from './GeneratedWith'

export interface HeadlinePanelProps {
  draftId: string
  /** null until the caption call writes a valid one. */
  headline: string | null
  /** 008 FR-08: the model that wrote the headline, and the refused value it replaced. */
  headlineModel: string | null
  headlineModelSubstitutedFrom: string | null
  /** Whether this draft's own caption provider is Claude (it writes the headline too). */
  captionProviderIsClaude?: boolean
  /** The headline is being written: a generation, or a headline-only action
   *  (captionActionTargets). */
  busy: boolean
  /** The draft can take a caption action (EXPORTED or PUBLISHED). */
  ready: boolean
  /** Any action is firing or running on the draft (single-flight, A2). */
  locked: boolean
  /** The polled `pendingAction` is non-null: an action is running on the draft. */
  actionPending: boolean
  /** A caption action holds the draft, so a headline edit would 409. */
  editLocked: boolean
  /** Fires the headline-only regenerate, with the model pick when one was made (A5).
   *  Resolves once the post-202 refetch has landed. */
  onRegenerate: (model?: ModelKey) => Promise<RegenerateResult>
  /** Called after an edit is saved, so the parent refetches the draft. */
  onSaved: () => void
}

// The on-image headline (012 FR-18/FR-19): its h3 with the tail (save state,
// Undo, Generate/Regenerate headline), a single-line pill field named by that
// heading, saved on blur with the
// server's 400 reason shown inline, the n / 100 counter and the helper text.
// "Regenerate all" never writes it (A9).
export function HeadlinePanel({
  draftId,
  headline,
  headlineModel,
  headlineModelSubstitutedFrom,
  captionProviderIsClaude,
  busy,
  ready,
  locked,
  actionPending,
  editLocked,
  onRegenerate,
  onSaved,
}: HeadlinePanelProps) {
  const headingId = useId()
  const helpId = useId()
  const errorId = useId()
  const counterId = useId()
  const stored = headline ?? ''
  const [value, setValue] = useState(stored)
  const [saved, setSaved] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 008 FR-20: the headline's model pick (undefined = the stamp's
  // pre-selection, A5) and a refused pick's 400 message.
  const [model, setModel] = useState<ModelKey | undefined>(undefined)
  const [modelError, setModelError] = useState<string | undefined>(undefined)
  const pickModel = useCallback((next: ModelKey | undefined) => {
    setModel(next)
    setModelError(undefined)
  }, [])
  // The headline before the last regenerate; Undo restores only the headline.
  const undo = useUndoableAction<string>(async (previous) => {
    await apiFetch(`/api/drafts/${draftId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headline: previous }),
    })
    setValue(previous)
    setSaved(true)
    setError(null)
    onSaved()
  })

  // A regenerate's new headline arrives through the parent's poll; the field
  // follows it, adjusted during render rather than in an effect.
  const [shown, setShown] = useState(stored)
  if (stored !== shown) {
    setShown(stored)
    setValue(stored)
    setSaved(true)
    setError(null)
  }
  // A save refused while a caption action held the draft (409) is stale once
  // the lock lifts; the field stays unsaved, so the next blur retries.
  const [wasEditLocked, setWasEditLocked] = useState(editLocked)
  if (editLocked !== wasEditLocked) {
    setWasEditLocked(editLocked)
    if (!editLocked) setError(null)
  }

  // The blur-save in flight, if any (see regenerate).
  const inFlightSave = useRef<Promise<void>>(Promise.resolve())

  // Set once the post-202 refetch has landed: from then on the polled props
  // describe this regenerate, never the state from before it was fired.
  const [settleArmed, setSettleArmed] = useState(false)

  // A regenerate that settled without changing the headline (it failed; the
  // reason is the page's pendingActionError) leaves nothing to undo. This
  // settles on state once armed, not on an observed busy → idle edge: a
  // regenerate that finishes before the refetch is served is never seen
  // running, and the edge never comes (change 015, L25).
  const clearUndo = undo.clear
  useEffect(() => {
    if (!settleArmed || actionPending || busy) return
    // Settle on state (018 FR-05, the 015 pattern): the reset also calls
    // clearUndo, so it stays in the effect rather than in render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettleArmed(false)
    if (headline === undo.snapshot) clearUndo()
  }, [settleArmed, actionPending, busy, headline, undo.snapshot, clearUndo])

  const over = value.length > HEADLINE_MAX
  const verb = stored === '' ? 'Generate headline' : 'Regenerate headline'

  async function save() {
    if (saved || value === stored) {
      setSaved(true)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/api/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headline: value }),
      })
      setSaved(true)
      onSaved()
    } catch (e: unknown) {
      // The field keeps the typed value, so the reason sits beside it.
      setError(e instanceof Error ? e.message : 'The headline was not saved')
    } finally {
      setSaving(false)
    }
  }

  async function regenerate() {
    // Clicking here blurs the field first: let that PATCH land, or it races
    // the claim and 409s, leaving the typed headline unsaved.
    await inFlightSave.current
    // Capture the Undo target BEFORE firing (202, no payload): what the field
    // shows, as the caption panels do, since its blur-save may not have
    // refetched yet. A value the PATCH would refuse (empty, over 100, a fence)
    // falls back to the stored headline, or to nothing to undo.
    const previous = undo.snapshot
    const target = validateHeadline(value).ok ? value : headline
    if (target) undo.capture(target)
    else undo.clear()
    // Refused: put back the snapshot this call replaced, never an earlier one.
    setModelError(undefined)
    const result = await onRegenerate(model)
    if (result.ok) setSettleArmed(true)
    else {
      if (previous === null) undo.clear()
      else undo.capture(previous)
      if (result.modelError) setModelError(result.modelError)
    }
  }

  return (
    <div>
      <SectionHead level={3} title="Headline" id={headingId} className="mb-3">
        {!busy && <SaveState saving={saving} saved={saved} />}
        {undo.snapshot !== null && (
          <Button
            variant="ghost"
            size="sm"
            onClick={undo.undo}
            disabled={locked || undo.undoing}
            aria-label="Undo headline"
            title="Restore the previous headline"
          >
            {undo.undoing ? <Loader2 {...ICON} className="animate-spin" /> : <Undo2 {...ICON} />} Undo
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={regenerate} disabled={!ready || locked || undo.undoing}>
          {busy ? <Loader2 {...ICON} className="animate-spin" /> : <Sparkles {...ICON} />} {verb}
        </Button>
      </SectionHead>

      {busy ? (
        <div className="animate-pulse" aria-label="Generating the headline" role="status">
          <div className="h-control-md w-2/3 rounded-ui-pill bg-line-subtle" />
        </div>
      ) : (
        <>
          <Input
            aria-labelledby={headingId}
            aria-describedby={error ? `${errorId} ${helpId} ${counterId}` : `${helpId} ${counterId}`}
            aria-invalid={error ? true : undefined}
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setSaved(false)
            }}
            onBlur={() => {
              inFlightSave.current = save()
            }}
            disabled={editLocked}
            placeholder="Write the headline…"
            // Beats the field's border-line by specificity, not source order.
            className="aria-[invalid=true]:border-status-failed"
          />
          {error && (
            <p id={errorId} role="alert" className={`mt-1.5 ${fieldErrorClasses}`}>
              {error}
            </p>
          )}
          <div className="mt-2 flex items-baseline justify-between gap-4">
            <p id={helpId} className="text-ui-xs text-fg-muted">
              The text on the image. To put a changed headline on the image, use Edit inline, or Apply to image when the image is out of date. On Freeform posts, Regenerate design also works.
            </p>
            <span
              id={counterId}
              className={`shrink-0 font-mono text-ui-2xs ${over ? 'font-semibold text-status-failed' : 'text-fg-muted'}`}
            >
              {count(value.length)} / {count(HEADLINE_MAX)}
            </span>
          </div>
        </>
      )}

      {/* The panel's tail (008 FR-20): the model that wrote the headline (not
          while it is rewritten), then the headline's regenerate model,
          pre-selected from that stamp (FR-09). */}
      {!busy && (
        <GeneratedWith stamp={headlineModel} substitutedFrom={headlineModelSubstitutedFrom} className="mt-2" />
      )}
      {ready && (
        <ModelPicker
          id="draft-headline-model"
          surface="CAPTION"
          context={{ stamp: headlineModel, stampNoun: 'headline' }}
          value={model}
          onChange={pickModel}
          label="Headline model"
          disabled={locked || undo.undoing}
          captionProviderIsClaude={captionProviderIsClaude}
          error={modelError}
          className="mt-3 sm:max-w-xs"
        />
      )}
    </div>
  )
}
