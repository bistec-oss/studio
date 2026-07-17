'use client'

import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Check, Sparkles, Undo2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { apiFetch } from '@/lib/apiFetch'
import { channelLabel, channelCopyLimit } from '@/lib/channels'
import { useUndoableAction } from '@/lib/hooks/useUndoableAction'
import type { DraftAction } from '@/lib/api-types'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CopyEditorDraft {
  id: string
  copyText: string
  pendingAction: DraftAction | null
  pendingActionError: string | null
  brief: {
    channels: string[]
  }
}

export interface CopyEditorProps {
  draft: CopyEditorDraft
  onSaved: (copyText: string) => void
  /** Called right after an async action is accepted (202) so the parent can
   *  refetch the draft and start polling `pendingAction`. */
  onActionStarted: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function copyLimitFor(channels: string[]): { channel: string; limit: number } {
  let chosen = { channel: 'LinkedIn', limit: 3000 }
  for (const ch of channels) {
    const limit = channelCopyLimit(ch)
    if (limit !== undefined && limit < chosen.limit) {
      chosen = { channel: channelLabel(ch), limit }
    }
  }
  return chosen
}

// ─── Copy editor ────────────────────────────────────────────────────────────

export function CopyEditor({ draft, onSaved, onActionStarted }: CopyEditorProps) {
  const [value, setValue] = useState(draft.copyText)
  const [saved, setSaved] = useState(true)
  const [saving, setSaving] = useState(false)
  // True only while the regenerate POST itself is in flight (202 arrives fast);
  // the background run is tracked via the polled `draft.pendingAction`.
  const [firing, setFiring] = useState(false)
  // Background-failure message surfaced inline next to the Regenerate button.
  const [regenError, setRegenError] = useState<string | null>(null)
  // Holds the copy that was live before the last regenerate, enabling one-click Undo.
  const undoAction = useUndoableAction<string>(async (previousCopy) => {
    await apiFetch(`/api/drafts/${draft.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ copyText: previousCopy }),
    })
    setValue(previousCopy)
    setSaved(true)
    onSaved(previousCopy)
  })

  useEffect(() => {
    setValue(draft.copyText)
    setSaved(true)
  }, [draft.copyText])

  // A regenerate is running in the background; the new copy arrives via the
  // parent's poll (the effect above syncs it into the textarea).
  const copyActionPending = draft.pendingAction === 'REGENERATE_COPY'
  // Any in-flight action (incl. design/refine) blocks firing a new one — the
  // server would 409 anyway.
  const anyActionPending = draft.pendingAction !== null

  // Detect the REGENERATE_COPY → null transition: on background failure show
  // the error inline and drop the (now pointless) undo snapshot.
  const prevActionRef = useRef<DraftAction | null>(draft.pendingAction)
  const undoClear = undoAction.clear
  useEffect(() => {
    const prev = prevActionRef.current
    prevActionRef.current = draft.pendingAction
    if (prev === 'REGENERATE_COPY' && draft.pendingAction === null && draft.pendingActionError) {
      setRegenError(draft.pendingActionError)
      undoClear()
    }
  }, [draft.pendingAction, draft.pendingActionError, undoClear])

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
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function regenerate() {
    setFiring(true)
    setRegenError(null)
    // The action runs in the background (202, no payload) — capture the Undo
    // target BEFORE firing; the regenerated copy arrives via the parent's poll.
    undoAction.capture(draft.copyText)
    try {
      await apiFetch(`/api/drafts/${draft.id}/regenerate-copy`, { method: 'POST' })
      // Refetch immediately so the parent picks up pendingAction and polls.
      onActionStarted()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to regenerate copy')
    } finally {
      setFiring(false)
    }
  }

  const regenerating = firing || copyActionPending
  const busy = regenerating || undoAction.undoing

  return (
    <GlassPanel className="p-4">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-light-text-muted dark:text-dark-text-muted">
          Copy
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs flex items-center gap-1.5">
            {copyActionPending ? (
              <span className="text-light-text-muted dark:text-dark-text-muted flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" /> Regenerating…
              </span>
            ) : saving ? (
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
          {undoAction.snapshot !== null && (
            <Button
              variant="ghost"
              size="sm"
              onClick={undoAction.undo}
              disabled={busy || anyActionPending}
              title="Restore the previous copy"
            >
              {undoAction.undoing ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />} Undo
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={regenerate} disabled={busy || anyActionPending}>
            {regenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Regenerate
          </Button>
        </div>
      </div>
      {regenError && (
        <p className="mb-2 text-xs text-red-500 flex items-start gap-1.5">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <span className="line-clamp-3">{regenError}</span>
        </p>
      )}
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setSaved(false)
        }}
        onBlur={save}
        disabled={busy}
        rows={8}
        className={`glass-input rounded-xl px-3 py-2.5 text-sm w-full text-light-text dark:text-dark-text resize-y leading-relaxed disabled:opacity-60 ${
          copyActionPending ? 'animate-pulse' : ''
        }`}
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
