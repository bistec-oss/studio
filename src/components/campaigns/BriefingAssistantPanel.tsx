'use client'

import React, { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Loader2, Paperclip, Send, Trash2, ArrowUp, ArrowDown, CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Modal'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { Select } from '@/components/ui/Select'
import { postStyleLabel, postStyleOptions } from '@/components/campaigns/postStyleOptions'
import { ModelPicker } from '@/components/ui/ModelPicker'
import { ApiError, apiFetch } from '@/lib/apiFetch'
import type { ModelKey } from '@/lib/models/catalogue'
import { CHANNEL_VALUES } from '@/lib/channels'
import { COMPACT_FIELD, EYEBROW, FOCUS, ICON, ICON_BUTTON, ICON_SM, SCROLL_FOCUS } from '@/components/ui/atoms'

// Shape the model proposes inside a ```schedule block (see briefingAssistant.ts).
interface SchedulePlanItem {
  topic: string
  postStyle: string
  styleReplaced?: { proposed: string }
  tone: string
  daysFromNow: number
  postAction: 'HOLD' | 'SCHEDULE_PUBLISH' | 'PUBLISH_NOW'
}

// An editable row in the plan the admin reviews before approving. generateAt is
// a datetime-local string ("YYYY-MM-DDTHH:mm") for the native picker.
interface PlanRow {
  topic: string
  postStyle: string
  /** The key the assistant proposed when it was replaced (031 FR-30). */
  proposedStyle?: string
  tone: string
  postAction: 'HOLD' | 'SCHEDULE_PUBLISH' | 'PUBLISH_NOW'
  generateAt: string
}

// datetime-local value N days from now at 09:00 local.
function localDateTimeInDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(9, 0, 0, 0)
  // Adjust for the local timezone offset so toISOString slicing keeps local time.
  const tzOffsetMs = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 16)
}

// AI briefing assistant: hand in source documents, converse until the model
// converges on a briefing draft, then Apply drops it into the briefing editor
// (saving still goes through the normal versioned flow). The conversation is
// ephemeral — the transcript lives in component state and is sent whole to the
// stateless chat route each turn.

interface CampaignDocumentMeta {
  id: string
  name: string
  contentType: string
  sizeBytes: number
  truncated: boolean
  createdAt: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  briefingDraft?: string | null
  schedulePlan?: SchedulePlanItem[] | null
}

interface BriefingAssistantPanelProps {
  campaignId: string
  open: boolean
  onClose: () => void
  onApply: (text: string) => void
}

const ACCEPT =
  '.pdf,.docx,.txt,.md,.png,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,image/png,image/jpeg'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function BriefingAssistantPanel({ campaignId, open, onClose, onApply }: BriefingAssistantPanelProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [uploading, setUploading] = useState(false)
  // The plan the admin is currently reviewing (from the latest ```schedule block).
  const [plan, setPlan] = useState<PlanRow[] | null>(null)
  const [scheduling, setScheduling] = useState(false)
  const messageId = React.useId()
  // 008 FR-21: the header model pick. It is client state for this open chat
  // only (no remembered choice; a reload resets it). Undefined means the team
  // or system default (A5), so an untouched picker sends today's body. A
  // refused pick's 400 message shows on the picker.
  const [model, setModel] = useState<ModelKey | undefined>(undefined)
  const [modelError, setModelError] = useState<string | undefined>(undefined)
  const pickModel = useCallback((next: ModelKey | undefined) => {
    setModel(next)
    setModelError(undefined)
  }, [])

  const { data: docs = [] } = useQuery({
    queryKey: ['campaigns', campaignId, 'documents'],
    queryFn: () => apiFetch<CampaignDocumentMeta[]>(`/api/campaigns/${campaignId}/documents`),
    enabled: open,
  })

  function invalidateDocs() {
    return queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'documents'] })
  }

  async function uploadFile(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const doc = await apiFetch<CampaignDocumentMeta>(`/api/campaigns/${campaignId}/documents`, {
        method: 'POST',
        body: fd,
      })
      await invalidateDocs()
      toast.success(
        doc.truncated
          ? `${file.name} uploaded — the text was long and was truncated for the AI context.`
          : `${file.name} uploaded`,
      )
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function deleteDoc(doc: CampaignDocumentMeta) {
    try {
      await apiFetch(`/api/campaigns/${campaignId}/documents/${doc.id}`, { method: 'DELETE' })
      await invalidateDocs()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const content = input.trim()
    if (!content || pending) return

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content }]
    setMessages(nextMessages)
    setInput('')
    setPending(true)
    setModelError(undefined)
    // Let the new message render before scrolling to it.
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
    try {
      const result = await apiFetch<{
        reply: string
        briefingDraft: string | null
        schedulePlan: SchedulePlanItem[] | null
      }>(
        `/api/campaigns/${campaignId}/briefing/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: nextMessages.map(m => ({ role: m.role, content: m.content })),
            // Dropped by JSON.stringify while undefined (A5).
            model,
          }),
        },
      )
      setMessages([
        ...nextMessages,
        { role: 'assistant', content: result.reply, briefingDraft: result.briefingDraft, schedulePlan: result.schedulePlan },
      ])
      // A fresh plan supersedes any prior one under review.
      if (result.schedulePlan?.length) {
        setPlan(
          result.schedulePlan.map(p => ({
            topic: p.topic,
            postStyle: p.postStyle,
            proposedStyle: p.styleReplaced?.proposed,
            tone: p.tone,
            postAction: p.postAction,
            generateAt: localDateTimeInDays(p.daysFromNow),
          })),
        )
      }
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
    } catch (err: unknown) {
      // A refused model pick (400, nothing ran) shows on the picker; any other
      // failure toasts.
      if (err instanceof ApiError && err.code === 'MODEL_NOT_ALLOWED') setModelError(err.message)
      else toast.error(err instanceof Error ? err.message : 'The assistant failed to reply')
      // Roll the failed turn back so it can be resent.
      setMessages(messages)
      setInput(content)
    } finally {
      setPending(false)
    }
  }

  function updateRow(i: number, patch: Partial<PlanRow>) {
    setPlan(prev => (prev ? prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) : prev))
  }
  function removeRow(i: number) {
    setPlan(prev => {
      const next = prev ? prev.filter((_, idx) => idx !== i) : prev
      return next && next.length ? next : null
    })
  }
  function moveRow(i: number, dir: -1 | 1) {
    setPlan(prev => {
      if (!prev) return prev
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  async function scheduleAll() {
    if (!plan || plan.length === 0) return
    // Channels, size, and design path default here; the AI plan only carries
    // topic/post style/tone/date/action. Path B (GENERATE) needs no template, so it's
    // the safe default — per-entry channel/size edits happen in the queue table.
    const entries = plan.map(r => ({
      topic: r.topic.trim(),
      postStyle: r.postStyle,
      tone: r.tone.trim() || 'professional',
      channels: CHANNEL_VALUES,
      aspectRatio: 'SQUARE' as const,
      designMode: 'GENERATE' as const,
      generateAt: new Date(r.generateAt).toISOString(),
      postAction: r.postAction,
    }))
    setScheduling(true)
    try {
      const res = await apiFetch<{ count: number }>(`/api/campaigns/${campaignId}/queue/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      })
      await queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'queue'] })
      toast.success(`Scheduled ${res.count} post${res.count === 1 ? '' : 's'} for generation.`)
      setPlan(null)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to schedule the plan')
    } finally {
      setScheduling(false)
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Draft briefing with AI">
      <div className="flex h-full flex-col">
        {/* The chat header's model picker (008 FR-21), pre-selected to the team
            or system default. Its team-token notice is the picker's own
            (FR-22). It renders nothing until /api/models loads. */}
        <ModelPicker
          id="briefing-assistant-model"
          surface="ASSISTANT_BRIEFING"
          value={model}
          onChange={pickModel}
          label="Briefing assistant model"
          disabled={pending}
          error={modelError}
          className="flex-shrink-0 border-b border-line-subtle px-5 py-4"
        />
        {/* Documents */}
        <div className="space-y-2 border-b border-line-subtle px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className={EYEBROW}>
              Source documents &amp; images ({docs.length}/5)
            </p>
            <Button
              variant="ghost"
              size="sm"
              disabled={uploading || docs.length >= 5}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? <Loader2 {...ICON} className="animate-spin" /> : <Paperclip {...ICON} />}
              {uploading ? 'Uploading…' : 'Add document'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) void uploadFile(file)
              }}
            />
          </div>
          {docs.length === 0 ? (
            <p className="text-ui-xs text-fg-muted">
              Hand in strategy decks or one-pagers (PDF, DOCX, TXT, MD — max 10MB each). The
              assistant grounds the briefing in them.
            </p>
          ) : (
            <ul className="divide-y divide-line-subtle">
              {docs.map(doc => (
                <li key={doc.id} className="flex items-center gap-2 py-1 text-ui-sm text-fg">
                  <FileText {...ICON} aria-hidden className="flex-shrink-0 text-fg-muted" />
                  <span className="min-w-0 flex-1 truncate" title={doc.name}>{doc.name}</span>
                  <span className="whitespace-nowrap text-ui-xs text-fg-muted">
                    {formatSize(doc.sizeBytes)}
                    {doc.truncated && ' · truncated'}
                  </span>
                  <button
                    type="button"
                    aria-label={`Delete ${doc.name}`}
                    onClick={() => deleteDoc(doc)}
                    className={`${ICON_BUTTON} hover:text-status-failed ${FOCUS}`}
                  >
                    <Trash2 {...ICON} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* The conversation (§8.14's log vocabulary, the study's .thread):
            rows ruled apart on --line-subtle, newest last.
            It scrolls inside its own box, so the box is always a focusable,
            labelled region, even before the first turn (WCAG 2.1.1; the static
            rule, 014 FR-17). */}
        <div
          tabIndex={0}
          role="region"
          aria-label="Conversation"
          className={`flex-1 overflow-y-auto px-5 py-4 ${SCROLL_FOCUS}`}
        >
          {messages.length === 0 && (
            <p className="text-ui-sm text-fg-muted">
              Describe the campaign — goal, audience, timing — and the assistant will interview
              you and converge on a briefing draft. Each draft it proposes can be applied to the
              editor.
            </p>
          )}
          {messages.length > 0 && (
            <ol className="divide-y divide-line-subtle">
              {messages.map((m, i) => (
                <li key={i} className="py-3 first:pt-0">
                  <p className={`${EYEBROW} mb-1`}>
                    {m.role === 'user' ? 'You' : 'Assistant'}
                  </p>
                  <p
                    className={
                      m.role === 'user'
                        ? 'whitespace-pre-wrap break-words text-ui-sm font-medium leading-snug text-fg'
                        : 'whitespace-pre-wrap break-words text-ui-sm leading-relaxed text-fg'
                    }
                  >
                    {m.content}
                  </p>
                  {m.briefingDraft && (
                    <div className="mt-2.5">
                      <Button variant="secondary" size="sm" onClick={() => onApply(m.briefingDraft!)}>
                        Apply this draft to the editor
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
          {pending && (
            <div className="mt-3 flex items-center gap-2 text-ui-sm text-fg-muted">
              <Loader2 {...ICON} className="animate-spin" aria-hidden />
              Thinking — this can take up to a minute…
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Schedule plan review (F4): editable rows ruled apart, on --surface-1
            under a hairline. */}
        {plan && (
          <div
            tabIndex={0}
            role="region"
            aria-label="Proposed schedule"
            className={`max-h-72 flex-shrink-0 overflow-y-auto border-t border-line-subtle bg-surface px-5 py-4 ${SCROLL_FOCUS}`}
          >
            <div className="mb-2 flex items-center gap-2">
              <CalendarClock {...ICON} aria-hidden className="flex-shrink-0 text-fg-muted" />
              <p className={EYEBROW}>
                Proposed schedule ({plan.length}) — review, edit, then schedule
              </p>
            </div>
            <ul className="divide-y divide-line-subtle">
              {plan.map((row, i) => (
                <li key={i} className="space-y-2 py-2.5">
                  <div className="flex items-center gap-1">
                    <input
                      aria-label="Post topic"
                      value={row.topic}
                      onChange={e => updateRow(i, { topic: e.target.value })}
                      placeholder="Post topic"
                      className={`${COMPACT_FIELD} min-w-0 flex-1`}
                    />
                    <button
                      type="button"
                      aria-label="Move up"
                      disabled={i === 0}
                      onClick={() => moveRow(i, -1)}
                      className={`${ICON_BUTTON} enabled:hover:text-fg ${FOCUS}`}
                    >
                      <ArrowUp {...ICON} />
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      disabled={i === plan.length - 1}
                      onClick={() => moveRow(i, 1)}
                      className={`${ICON_BUTTON} enabled:hover:text-fg ${FOCUS}`}
                    >
                      <ArrowDown {...ICON} />
                    </button>
                    <button
                      type="button"
                      aria-label="Remove post"
                      onClick={() => removeRow(i)}
                      className={`${ICON_BUTTON} hover:text-status-failed ${FOCUS}`}
                    >
                      <Trash2 {...ICON} />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <input
                      type="datetime-local"
                      aria-label="Generate at"
                      value={row.generateAt}
                      onChange={e => updateRow(i, { generateAt: e.target.value })}
                      className={`${COMPACT_FIELD} max-w-full`}
                    />
                    <Select
                      aria-label="Post style"
                      options={postStyleOptions('General', row.postStyle).filter(o => o.value !== '')}
                      value={row.postStyle}
                      onChange={e => updateRow(i, { postStyle: e.target.value, proposedStyle: undefined })}
                    />
                    <span className="break-words text-ui-2xs text-fg-muted">
                      {row.tone} · {row.postAction === 'HOLD' ? 'hold for review' : row.postAction.toLowerCase()}
                    </span>
                  </div>
                  {row.proposedStyle && (
                    <p data-testid="style-replaced" className="text-ui-2xs text-fg-muted">
                      Suggested style {row.proposedStyle} is not available; using {postStyleLabel(row.postStyle) ?? row.postStyle}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={scheduleAll} disabled={scheduling}>
                {scheduling ? <Loader2 {...ICON} className="animate-spin" /> : <CalendarClock {...ICON} />}
                Schedule {plan.length} post{plan.length === 1 ? '' : 's'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPlan(null)} disabled={scheduling}>
                Discard
              </Button>
            </div>
            <p className="mt-2 text-ui-2xs text-fg-muted">
              Posts generate as HOLD drafts for review by default. Channels (both feeds) and size
              can be adjusted per entry in the queue after scheduling.
            </p>
          </div>
        )}

        {/* The prompt (§8.3, §8.14, the study's .ask): a pill field with the
            round ink Send inside it (the study's .send); the wrapper shows the
            focus outline. Send is named by its aria-label. */}
        <form onSubmit={send} className="flex-shrink-0 border-t border-line-subtle px-5 py-4">
          <FieldLabel htmlFor={messageId} className="mb-1.5">Message</FieldLabel>
          <div className="flex items-center gap-2 rounded-ui-pill border border-line bg-surface-raised py-[5px] pl-4 pr-[5px] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
            <input
              id={messageId}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Tell the assistant about this campaign…"
              className="min-w-0 flex-1 bg-transparent text-ui-sm text-fg placeholder:text-fg-muted focus:outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim() || pending}
              aria-label="Send"
              title="Send"
              className={`inline-flex size-[34px] flex-shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition-transform duration-fast ease-standard enabled:active:scale-[0.98] motion-reduce:enabled:active:scale-100 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
            >
              {pending ? <Loader2 {...ICON_SM} className="animate-spin" aria-hidden /> : <Send {...ICON_SM} aria-hidden />}
            </button>
          </div>
        </form>
      </div>
    </Drawer>
  )
}
