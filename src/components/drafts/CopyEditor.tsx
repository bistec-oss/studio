'use client'

import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Check, Sparkles, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { apiFetch } from '@/lib/apiFetch'
import { channelLabel, channelCopyLimit } from '@/lib/channels'
import { useUndoableAction } from '@/lib/hooks/useUndoableAction'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CopyEditorDraft {
  id: string
  copyText: string
  brief: {
    channels: string[]
  }
}

export interface CopyEditorProps {
  draft: CopyEditorDraft
  onSaved: (copyText: string) => void
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

export function CopyEditor({ draft, onSaved }: CopyEditorProps) {
  const [value, setValue] = useState(draft.copyText)
  const [saved, setSaved] = useState(true)
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
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
    setRegenerating(true)
    try {
      const data = await apiFetch<{ copyText: string; previousCopyText: string }>(
        `/api/drafts/${draft.id}/regenerate-copy`,
        { method: 'POST' }
      )
      undoAction.capture(data.previousCopyText)
      setValue(data.copyText)
      setSaved(true)
      onSaved(data.copyText)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to regenerate copy')
    } finally {
      setRegenerating(false)
    }
  }

  const busy = regenerating || undoAction.undoing

  return (
    <GlassPanel className="p-4">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-light-text-muted dark:text-dark-text-muted">
          Copy
        </h3>
        <div className="flex items-center gap-2">
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
          {undoAction.snapshot !== null && (
            <Button variant="ghost" size="sm" onClick={undoAction.undo} disabled={busy} title="Restore the previous copy">
              {undoAction.undoing ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />} Undo
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={regenerate} disabled={busy}>
            {regenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Regenerate
          </Button>
        </div>
      </div>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setSaved(false)
        }}
        onBlur={save}
        disabled={busy}
        rows={8}
        className="glass-input rounded-xl px-3 py-2.5 text-sm w-full text-light-text dark:text-dark-text resize-y leading-relaxed disabled:opacity-60"
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
