'use client'

import React, { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Loader2, Paperclip, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Modal'
import { apiFetch } from '@/lib/apiFetch'

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
}

interface BriefingAssistantPanelProps {
  campaignId: string
  open: boolean
  onClose: () => void
  onApply: (text: string) => void
}

const ACCEPT = '.pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown'

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
    // Let the new message render before scrolling to it.
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
    try {
      const result = await apiFetch<{ reply: string; briefingDraft: string | null }>(
        `/api/campaigns/${campaignId}/briefing/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: nextMessages.map(m => ({ role: m.role, content: m.content })),
          }),
        },
      )
      setMessages([...nextMessages, { role: 'assistant', content: result.reply, briefingDraft: result.briefingDraft }])
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'The assistant failed to reply')
      // Roll the failed turn back so it can be resent.
      setMessages(messages)
      setInput(content)
    } finally {
      setPending(false)
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Draft briefing with AI">
      <div className="flex flex-col h-full">
        {/* Documents */}
        <div className="px-5 py-4 border-b border-light-border dark:border-dark-border space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-light-text-muted dark:text-dark-text-muted">
              Source documents ({docs.length}/5)
            </p>
            <Button
              variant="ghost"
              size="sm"
              disabled={uploading || docs.length >= 5}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
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
            <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
              Hand in strategy decks or one-pagers (PDF, DOCX, TXT, MD — max 10MB each). The
              assistant grounds the briefing in them.
            </p>
          ) : (
            <ul className="space-y-1">
              {docs.map(doc => (
                <li key={doc.id} className="flex items-center gap-2 text-sm text-light-text dark:text-dark-text">
                  <FileText size={14} className="text-light-text-muted dark:text-dark-text-muted flex-shrink-0" />
                  <span className="truncate flex-1" title={doc.name}>{doc.name}</span>
                  <span className="text-xs text-light-text-muted dark:text-dark-text-muted whitespace-nowrap">
                    {formatSize(doc.sizeBytes)}
                    {doc.truncated && ' · truncated'}
                  </span>
                  <button
                    aria-label={`Delete ${doc.name}`}
                    onClick={() => deleteDoc(doc)}
                    className="p-1 rounded text-light-text-muted dark:text-dark-text-muted hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Chat */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
              Describe the campaign — goal, audience, timing — and the assistant will interview
              you and converge on a briefing draft. Each draft it proposes can be applied to the
              editor.
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={
                  m.role === 'user'
                    ? 'max-w-[85%] rounded-xl px-3 py-2 text-sm bg-primary/10 dark:bg-primary-light/10 text-light-text dark:text-dark-text whitespace-pre-wrap'
                    : 'max-w-[85%] rounded-xl px-3 py-2 text-sm glass-input text-light-text dark:text-dark-text whitespace-pre-wrap'
                }
              >
                {m.content}
                {m.briefingDraft && (
                  <div className="mt-2 pt-2 border-t border-light-border/50 dark:border-dark-border/50">
                    <Button size="sm" onClick={() => onApply(m.briefingDraft!)}>
                      Apply this draft to the editor
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {pending && (
            <div className="flex items-center gap-2 text-sm text-light-text-muted dark:text-dark-text-muted">
              <Loader2 size={14} className="animate-spin" />
              Thinking — this can take up to a minute…
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={send} className="px-5 py-4 border-t border-light-border dark:border-dark-border flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Tell the assistant about this campaign…"
            className="glass-input rounded-xl px-3 py-2 text-sm flex-1 text-light-text dark:text-dark-text focus:outline-none"
          />
          <Button type="submit" size="sm" disabled={!input.trim() || pending} aria-label="Send">
            <Send size={14} />
          </Button>
        </form>
      </div>
    </Drawer>
  )
}
