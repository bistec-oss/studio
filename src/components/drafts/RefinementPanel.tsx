'use client'

import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Send as SendIcon, Loader2, AlertTriangle, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Notice } from '@/components/ui/Notice'
import { ModelPicker } from '@/components/ui/ModelPicker'
import { SectionHead } from '@/components/ui/SectionHead'
import { FOCUS, ICON, ICON_SM, SCROLL_FOCUS, TAG } from '@/components/ui/atoms'
import { NotAppliedCard } from '@/components/drafts/NotAppliedCard'
import { ApiError, apiFetch } from '@/lib/apiFetch'
import type { DraftAction, DraftNotApplied } from '@/lib/api-types'
import type { DesignPath, ModelKey } from '@/lib/models/catalogue'

// ─── Types ──────────────────────────────────────────────────────────────────

interface RefineMessage {
  id: string
  instruction: string
  status: 'pending' | 'applied' | 'conflict' | 'not-applied' | 'error'
  detail?: string
  // When it was sent, for the row's mono time (021 FR-11). Client-side only.
  sentAt: Date
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
  // Mirrors conflictIdAtSend's trick for the not-applied outcome (T18): a
  // DIFFERENT revisionId than what was live at send means THIS refine is the
  // one that produced it, not a stale outcome left over from before.
  notAppliedRevisionIdAtSend: string | null
}

const SUGGESTIONS = [
  'Make the background darker',
  'Move the headline to top',
  'Increase font size',
]

export interface RefinementPanelProps {
  draftId: string
  /** The draft's path: REFINE's system default follows it (008 A8). */
  designPath: DesignPath
  /** Polled draft state driving the async-refine lifecycle. */
  pendingAction: DraftAction | null
  pendingActionError: string | null
  conflict: { conflictId: string; explanation: string } | null
  /** FR-14/AC-18: a twice-failed refine — a hard failure, separate from
   *  `pendingActionError` (a crashed run). Cleared server-side by the next
   *  successful action, so it disappears here on the next poll. */
  notApplied: DraftNotApplied | null
  currentRevisionNumber: number | null
  /** Called right after an async action is accepted (202) so the parent can
   *  refetch the draft and start polling `pendingAction`. Awaited: the row
   *  settles only on state read after this refetch (change 015). */
  onActionStarted: () => void | Promise<unknown>
  onRefined: () => void
}

// ─── Refinement panel ─────────────────────────────────────────────────────────

export function RefinementPanel({
  draftId,
  designPath,
  pendingAction,
  pendingActionError,
  conflict,
  notApplied,
  currentRevisionNumber,
  onActionStarted,
  onRefined,
}: RefinementPanelProps) {
  const [messages, setMessages] = useState<RefineMessage[]>([])
  const [input, setInput] = useState('')
  // The prompt is named by the "Refine Design" heading (FR-12 row 27).
  const headingId = useId()
  // True only while a POST is in flight; the background refine itself is
  // tracked via the polled `pendingAction` prop.
  const [running, setRunning] = useState(false)
  // T19 "Use anyway" — synchronous (no model call, no pendingAction poll):
  // true only while its own POST is in flight.
  const [adopting, setAdopting] = useState(false)
  const [conflictCard, setConflictCard] = useState<ConflictState | null>(null)
  const resolutionRef = useRef<PendingResolution | null>(null)
  // Set once the post-202 refetch has landed: from then on the polled props
  // describe this refine, never the state from before it was sent.
  const [settleArmed, setSettleArmed] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  // 008 FR-20: the refine model pick (undefined = the team or system default
  // by path, A5) and a refused pick's 400 message.
  const [model, setModel] = useState<ModelKey | undefined>(undefined)
  const [modelError, setModelError] = useState<string | undefined>(undefined)
  const pickModel = useCallback((next: ModelKey | undefined) => {
    setModel(next)
    setModelError(undefined)
  }, [])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  // Resolve the pending chat message once the post-202 refetch has landed and
  // the polled pendingAction is null: a NEW conflict (different id than at
  // send) → conflict card; an action error → error; a moved revision pointer →
  // applied. This settles on state, not on an observed REFINE → null edge: a
  // refine that finishes before the refetch is served is never seen running,
  // and the edge never comes (change 015).
  useEffect(() => {
    const res = resolutionRef.current
    if (!res || !settleArmed || pendingAction !== null) return
    resolutionRef.current = null
    setSettleArmed(false)
    const setStatus = (status: RefineMessage['status'], detail?: string) =>
      setMessages((msgs) => msgs.map((m) => (m.id === res.msgId ? { ...m, status, detail } : m)))
    if (conflict && conflict.conflictId !== res.conflictIdAtSend) {
      setStatus('conflict', conflict.explanation)
      setConflictCard({
        conflictId: conflict.conflictId,
        explanation: conflict.explanation,
        instruction: res.instruction,
      })
    } else if (notApplied && notApplied.revisionId !== res.notAppliedRevisionIdAtSend) {
      setStatus('not-applied', notApplied.reason)
    } else if (pendingActionError) {
      setStatus('error', pendingActionError)
    } else if (currentRevisionNumber !== res.baselineRevision) {
      setStatus('applied')
      onRefined()
    } else {
      // Completed with no error, no new conflict, no not-applied outcome and
      // no new revision — shouldn't happen, but never leave the message
      // spinning forever.
      setStatus('error', 'The refinement finished without producing a new revision.')
    }
  }, [settleArmed, pendingAction, pendingActionError, conflict, notApplied, currentRevisionNumber, onRefined])

  async function send(instruction: string, overrideConflictId?: string) {
    if (!instruction.trim() && !overrideConflictId) return
    const msgId = crypto.randomUUID()
    setMessages((prev) => [...prev, { id: msgId, instruction, status: 'pending', sentAt: new Date() }])
    setInput('')
    setRunning(true)
    setConflictCard(null)
    setModelError(undefined)
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
          notAppliedRevisionIdAtSend: notApplied?.revisionId ?? null,
        }
        await apiFetch(`/api/drafts/${draftId}/refine`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // An undefined pick is dropped, so the server resolves the default (A5).
          body: JSON.stringify({ instruction, model }),
        })
        // Refetch so the parent picks up pendingAction and polls; the message
        // stays 'pending' until the resolution effect settles it. The refetch
        // never throws: on failure the page swaps to its error view.
        await onActionStarted()
        setSettleArmed(true)
      }
    } catch (e: unknown) {
      resolutionRef.current = null
      // A refused model pick (400, before any claim): nothing ran, so the
      // request leaves the log, the instruction goes back in the field, and
      // the reason shows on the picker.
      if (e instanceof ApiError && e.code === 'MODEL_NOT_ALLOWED') {
        setMessages((prev) => prev.filter((m) => m.id !== msgId))
        setInput(instruction)
        setModelError(e.message)
        return
      }
      const detail = e instanceof Error ? e.message : 'Error'
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, status: 'error', detail } : m))
      )
    } finally {
      setRunning(false)
    }
  }

  // T19 "Use anyway": adopts the retained rejected render as a normal,
  // committed revision (POST .../rejected/[revisionId]/adopt — synchronous,
  // { reply, revisionId, exportUrl }, mirroring inline-edit/Override). No
  // undo-snapshot capture: adopt IS the recovery action here, not a change
  // that itself needs undoing, and there is no separate "before" pointer to
  // capture beyond what Revision History already offers via restore.
  async function handleAdopt() {
    if (!notApplied) return
    setAdopting(true)
    try {
      await apiFetch(`/api/drafts/${draftId}/rejected/${notApplied.revisionId}/adopt`, { method: 'POST' })
      onRefined()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not adopt this render')
    } finally {
      setAdopting(false)
    }
  }

  // Block sending while ANY background action is running (the server would 409
  // anyway), while a refine is still awaiting resolution from the poll, or
  // while an adopt POST is in flight (fix round 1, Minor 3 — adopting is a
  // draft mutation too, so it belongs in the same busy gate as every other
  // action, not a bespoke disabled state of its own).
  const awaitingResolution = messages.some((m) => m.status === 'pending')
  const busy = running || pendingAction !== null || awaitingResolution || adopting

  return (
    <section className="surface-bezel p-5">
      <SectionHead title="Refine design" id={headingId} className="mb-3">
        {messages.length > 0 && (
          <span className="font-mono text-ui-2xs text-fg-muted">
            {messages.length} {messages.length === 1 ? 'request' : 'requests'}
          </span>
        )}
      </SectionHead>

      {/* The refine log (§8.14, the study's .thread): ruled rows, newest last,
          each with a status disc, the instruction, a status line and a mono
          time. It scrolls inside its own box once it is long, so the box is
          always a focusable, labelled region, even with no requests yet (WCAG
          2.1.1; the static rule, 014 FR-17). */}
      <div
        ref={listRef}
        tabIndex={0}
        role="region"
        aria-label="Refine requests"
        className={`mb-3.5 max-h-72 overflow-y-auto rounded-ui-md ${SCROLL_FOCUS}`}
      >
        {messages.length === 0 ? (
          <p className="text-ui-sm text-fg-muted">
            Describe a change in natural language and the design agent will apply it.
          </p>
        ) : (
          <ol className="divide-y divide-line-subtle">
            {messages.map((m) => (
              <li key={m.id} className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-2.5 px-2 py-2.5">
                <StatusDisc status={m.status} />
                <div className="min-w-0">
                  <p className="break-words text-ui-sm font-medium text-fg">{m.instruction}</p>
                  <p className="mt-0.5 text-ui-2xs text-fg-muted">
                    {m.status === 'pending' && <span>Applying…</span>}
                    {m.status === 'applied' && <span>Applied</span>}
                    {m.status === 'conflict' && <span className="font-semibold text-status-scheduled">Brand conflict</span>}
                    {m.status === 'not-applied' && (
                      <span className="font-semibold text-status-scheduled" title={m.detail}>
                        Not applied
                      </span>
                    )}
                    {m.status === 'error' && (
                      <span className="break-words text-status-failed" title={m.detail}>
                        Failed: {m.detail}
                      </span>
                    )}
                  </p>
                </div>
                <time dateTime={m.sentAt.toISOString()} className="pt-0.5 font-mono text-ui-2xs text-fg-muted">
                  {m.sentAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </time>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* FR-14/AC-18 hard failure — driven directly by the polled `notApplied`
          prop (not local message state), so it appears and clears exactly
          when the server says so, on the next poll either way. */}
      {notApplied && (
        <NotAppliedCard notApplied={notApplied} onAdopt={handleAdopt} adopting={adopting} disabled={busy} />
      )}

      {conflictCard && (
        <Notice
          tone="warning"
          icon={<AlertTriangle {...ICON} className="mt-0.5 flex-shrink-0" aria-hidden />}
          className="mb-4 animate-fade-in"
        >
          <p className="font-semibold">This change conflicts with the brand kit</p>
          <p className="mt-1 text-ui-xs text-fg">{conflictCard.explanation}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
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
        </Notice>
      )}

      {/* Suggestions (§8.14, the study's .sugg): TAG pills. */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-ui-xs text-fg-muted">Try:</span>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setInput(s)}
            disabled={busy}
            className={`${TAG} h-7 px-3 transition-shadow duration-fast ease-standard enabled:hover:ring-line disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* The prompt (§8.3, §8.14, the study's .ask): a pill field with the
          round ink Send inside it; the wrapper shows the focus outline. */}
      <form
        className="flex items-center gap-2 rounded-ui-pill border border-line bg-surface-raised py-[5px] pl-4 pr-[5px] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus"
        onSubmit={(e) => {
          e.preventDefault()
          if (!busy) send(input)
        }}
      >
        <input
          aria-labelledby={headingId}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          placeholder="e.g. Make the logo larger…"
          className="min-w-0 flex-1 bg-transparent text-ui-sm text-fg placeholder:text-fg-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="submit"
          aria-label="Send"
          title="Send"
          disabled={busy || !input.trim()}
          className={`inline-flex size-[34px] flex-shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition-transform duration-fast ease-standard enabled:active:scale-[0.98] motion-reduce:enabled:active:scale-100 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
        >
          {running || pendingAction === 'REFINE' ? (
            <Loader2 {...ICON_SM} className="animate-spin" aria-hidden />
          ) : (
            <SendIcon {...ICON_SM} aria-hidden />
          )}
        </button>
      </form>

      {/* The refine model (008 FR-20), pre-selected to the team or system
          default by the draft's path; refine has no stamp tier (FR-09). Its
          team-token notice is the picker's own (FR-22). */}
      <ModelPicker
        id="draft-refine-model"
        surface="REFINE"
        context={{ designPath }}
        value={model}
        onChange={pickModel}
        label="Refine model"
        disabled={busy}
        error={modelError}
        className="mt-3 sm:max-w-xs"
      />
    </section>
  )
}

// A refine row's status disc (the study's .st): 22 px, the status colour on
// its 0.12 tint (021 A2), with a check or an alert; a spinner while it runs.
function StatusDisc({ status }: { status: RefineMessage['status'] }) {
  const tone =
    status === 'pending'
      ? 'bg-canvas text-fg-muted'
      : status === 'applied'
        ? 'bg-status-published/12 text-status-published'
        : status === 'error'
          ? 'bg-status-failed/12 text-status-failed'
          : 'bg-status-scheduled/12 text-status-scheduled'
  const Icon = status === 'pending' ? Loader2 : status === 'applied' ? Check : AlertTriangle
  return (
    <span aria-hidden className={`mt-px inline-flex size-[22px] items-center justify-center rounded-full ${tone}`}>
      <Icon {...ICON_SM} className={status === 'pending' ? 'animate-spin' : undefined} />
    </span>
  )
}
