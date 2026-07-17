'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Send, Loader2, AlertTriangle, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { apiFetch } from '@/lib/apiFetch'
import type { DraftAction } from '@/lib/api-types'

// ─── Types ──────────────────────────────────────────────────────────────────

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

// POST /api/drafts/[id]/refine — a plain refine is async now (202 {ok:true};
// the result arrives via the parent's draft poll). An Override commits
// already-stored HTML and stays SYNCHRONOUS, returning the committed revision.
type OverrideResponse = { reply: string; revisionId: string; exportUrl: string | null }

// Captured when an async refine is fired; the resolution effect compares the
// polled props against it once pendingAction transitions REFINE → null.
interface PendingResolution {
  msgId: string
  instruction: string
  baselineRevision: number | null
  conflictIdAtSend: string | null
}

const SUGGESTIONS = [
  'Make the background darker',
  'Move the headline to top',
  'Increase font size',
]

export interface RefinementPanelProps {
  draftId: string
  /** Polled draft state driving the async-refine lifecycle. */
  pendingAction: DraftAction | null
  pendingActionError: string | null
  conflict: { conflictId: string; explanation: string } | null
  currentRevisionNumber: number | null
  /** Called right after an async action is accepted (202) so the parent can
   *  refetch the draft and start polling `pendingAction`. */
  onActionStarted: () => void
  onRefined: () => void
}

// ─── Refinement panel ─────────────────────────────────────────────────────────

export function RefinementPanel({
  draftId,
  pendingAction,
  pendingActionError,
  conflict,
  currentRevisionNumber,
  onActionStarted,
  onRefined,
}: RefinementPanelProps) {
  const [messages, setMessages] = useState<RefineMessage[]>([])
  const [input, setInput] = useState('')
  // True only while a POST is in flight; the background refine itself is
  // tracked via the polled `pendingAction` prop.
  const [running, setRunning] = useState(false)
  const [conflictCard, setConflictCard] = useState<ConflictState | null>(null)
  const resolutionRef = useRef<PendingResolution | null>(null)
  const prevActionRef = useRef<DraftAction | null>(pendingAction)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  // Resolve the pending chat message when the polled pendingAction transitions
  // REFINE → null: a NEW conflict (different id than at send) → conflict card;
  // an action error → error; a moved revision pointer → applied.
  useEffect(() => {
    const prev = prevActionRef.current
    prevActionRef.current = pendingAction
    const res = resolutionRef.current
    if (!res || prev !== 'REFINE' || pendingAction !== null) return
    resolutionRef.current = null
    const setStatus = (status: RefineMessage['status'], detail?: string) =>
      setMessages((msgs) => msgs.map((m) => (m.id === res.msgId ? { ...m, status, detail } : m)))
    if (conflict && conflict.conflictId !== res.conflictIdAtSend) {
      setStatus('conflict', conflict.explanation)
      setConflictCard({
        conflictId: conflict.conflictId,
        explanation: conflict.explanation,
        instruction: res.instruction,
      })
    } else if (pendingActionError) {
      setStatus('error', pendingActionError)
    } else if (currentRevisionNumber !== res.baselineRevision) {
      setStatus('applied')
      onRefined()
    } else {
      // Completed with no error, no new conflict and no new revision —
      // shouldn't happen, but never leave the message spinning forever.
      setStatus('error', 'The refinement finished without producing a new revision.')
    }
  }, [pendingAction, pendingActionError, conflict, currentRevisionNumber, onRefined])

  async function send(instruction: string, overrideConflictId?: string) {
    if (!instruction.trim() && !overrideConflictId) return
    const msgId = crypto.randomUUID()
    setMessages((prev) => [...prev, { id: msgId, instruction, status: 'pending' }])
    setInput('')
    setRunning(true)
    setConflictCard(null)
    try {
      if (overrideConflictId) {
        // Override commits stored HTML synchronously — unchanged contract.
        await apiFetch<OverrideResponse>(`/api/drafts/${draftId}/refine`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instruction, overrideConflictId }),
        })
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, status: 'applied' } : m))
        )
        onRefined()
      } else {
        // Async refine: capture the resolution baseline before firing.
        resolutionRef.current = {
          msgId,
          instruction,
          baselineRevision: currentRevisionNumber,
          conflictIdAtSend: conflict?.conflictId ?? null,
        }
        await apiFetch(`/api/drafts/${draftId}/refine`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instruction }),
        })
        // Refetch immediately so the parent picks up pendingAction and polls;
        // the message stays 'pending' until the resolution effect fires.
        onActionStarted()
      }
    } catch (e: unknown) {
      resolutionRef.current = null
      const detail = e instanceof Error ? e.message : 'Error'
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, status: 'error', detail } : m))
      )
    } finally {
      setRunning(false)
    }
  }

  // Block sending while ANY background action is running (the server would 409
  // anyway) or while a refine is still awaiting resolution from the poll.
  const awaitingResolution = messages.some((m) => m.status === 'pending')
  const busy = running || pendingAction !== null || awaitingResolution

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

      {conflictCard && (
        <div className="mb-3 rounded-xl border border-amber-300 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/20 p-3 animate-fade-in">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                This change conflicts with the brand kit
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400/90 mt-1">{conflictCard.explanation}</p>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  onClick={() => send(conflictCard.instruction, conflictCard.conflictId)}
                  disabled={busy}
                >
                  Override
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConflictCard(null)} disabled={busy}>
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
            disabled={busy}
            className="text-xs px-2.5 py-1 rounded-lg bg-primary/5 dark:bg-primary-light/5 text-primary dark:text-primary-light hover:bg-primary/10 dark:hover:bg-primary-light/10 transition-colors disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!busy) send(input)
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          placeholder="e.g. Make the logo larger…"
          className="glass-input rounded-xl px-3 py-2 text-sm flex-1 text-light-text dark:text-dark-text"
        />
        <Button type="submit" size="sm" disabled={busy || !input.trim()}>
          {running || pendingAction === 'REFINE' ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
        </Button>
      </form>
    </GlassPanel>
  )
}
