'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Send, Loader2, AlertTriangle, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { apiFetch } from '@/lib/apiFetch'

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

// POST /api/drafts/[id]/refine — either a brand-conflict card, or the
// committed revision.
type RefineResponse =
  | { conflict: true; explanation: string; conflictId: string }
  | { reply: string; revisionId: string; exportUrl: string | null }

const SUGGESTIONS = [
  'Make the background darker',
  'Move the headline to top',
  'Increase font size',
]

export interface RefinementPanelProps {
  draftId: string
  onRefined: () => void
}

// ─── Refinement panel ─────────────────────────────────────────────────────────

export function RefinementPanel({ draftId, onRefined }: RefinementPanelProps) {
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
      const data = await apiFetch<RefineResponse>(`/api/drafts/${draftId}/refine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction, overrideConflictId }),
      })
      if ('conflict' in data && data.conflict) {
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

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!running) send(input)
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={running}
          placeholder="e.g. Make the logo larger…"
          className="glass-input rounded-xl px-3 py-2 text-sm flex-1 text-light-text dark:text-dark-text"
        />
        <Button type="submit" size="sm" disabled={running || !input.trim()}>
          {running ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </Button>
      </form>
    </GlassPanel>
  )
}
