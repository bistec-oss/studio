'use client'

import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Check, FileText, Loader2, Paperclip, Send, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Modal'
import { apiFetch } from '@/lib/apiFetch'
import { ColorEditor } from './ColorEditor'

// F5 — conversational brand-kit extraction from reference images. Mirrors the
// campaign BriefingAssistantPanel: chat grounded on the kit's feedToAI reference
// images, the assistant proposes a brand suggestion, the admin reviews + edits it,
// then applies. Apply writes the VOICE (new active prompt) and the COLOR palette
// (sampled, editable). Font guesses + style are surfaced as read-only suggestions
// — vision font guesses are never auto-committed (they lack real font files).

interface BrandKitSuggestion {
  voice: string
  tone: string
  style: string
  fonts: string[]
  colors: string[]
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  suggestion?: BrandKitSuggestion | null
}

// Assistant source documents & images (BrandKitDocument) — chat grounding only,
// never fed to generation. Mirrors the campaign BriefingAssistantPanel block.
interface BrandKitDocumentMeta {
  id: string
  name: string
  contentType: string
  sizeBytes: number
  truncated: boolean
  createdAt: string
}

const ACCEPT =
  '.pdf,.docx,.txt,.md,.png,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,image/png,image/jpeg'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

interface BrandKitAssistantPanelProps {
  kitId: string
  open: boolean
  onClose: () => void
  onApplied: () => void
}

export function BrandKitAssistantPanel({ kitId, open, onClose, onApplied }: BrandKitAssistantPanelProps) {
  const endRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [docs, setDocs] = useState<BrandKitDocumentMeta[]>([])
  const [uploading, setUploading] = useState(false)
  // The suggestion under review (editable), and which fields to apply.
  const [voice, setVoice] = useState('')
  const [colors, setColors] = useState<string[]>([])
  const [fonts, setFonts] = useState<string[]>([])
  const [style, setStyle] = useState('')
  const [hasSuggestion, setHasSuggestion] = useState(false)
  const [applying, setApplying] = useState(false)

  // Load the kit's source documents when the drawer opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    apiFetch<BrandKitDocumentMeta[]>(`/api/admin/brandkits/${kitId}/documents`)
      .then(list => {
        if (!cancelled) setDocs(list)
      })
      .catch(() => {
        /* the block simply stays empty; uploads will surface real errors */
      })
    return () => {
      cancelled = true
    }
  }, [open, kitId])

  async function uploadFile(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const doc = await apiFetch<BrandKitDocumentMeta>(`/api/admin/brandkits/${kitId}/documents`, {
        method: 'POST',
        body: fd,
      })
      setDocs(prev => [...prev, doc])
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

  async function deleteDoc(doc: BrandKitDocumentMeta) {
    try {
      await apiFetch(`/api/admin/brandkits/${kitId}/documents/${doc.id}`, { method: 'DELETE' })
      setDocs(prev => prev.filter(d => d.id !== doc.id))
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  function loadSuggestion(s: BrandKitSuggestion) {
    setVoice(s.voice)
    setColors(s.colors)
    setFonts(s.fonts)
    setStyle([s.tone, s.style].filter(Boolean).join(' — '))
    setHasSuggestion(true)
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const content = input.trim()
    if (!content || pending) return
    const next: ChatMessage[] = [...messages, { role: 'user', content }]
    setMessages(next)
    setInput('')
    setPending(true)
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
    try {
      const result = await apiFetch<{ reply: string; suggestion: BrandKitSuggestion | null }>(
        `/api/admin/brandkits/${kitId}/assistant/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })) }),
        },
      )
      setMessages([...next, { role: 'assistant', content: result.reply, suggestion: result.suggestion }])
      if (result.suggestion) loadSuggestion(result.suggestion)
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'The assistant failed to reply')
      setMessages(messages)
      setInput(content)
    } finally {
      setPending(false)
    }
  }

  async function apply() {
    if (!voice.trim() && colors.length === 0) return
    setApplying(true)
    try {
      if (voice.trim()) {
        await apiFetch(`/api/admin/brandkits/${kitId}/prompts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: voice.trim() }),
        })
      }
      if (colors.length > 0) {
        await apiFetch(`/api/admin/brandkits/${kitId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ colors }),
        })
      }
      toast.success('Applied brand voice and colors to the kit.')
      setHasSuggestion(false)
      onApplied()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to apply the suggestion')
    } finally {
      setApplying(false)
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Extract brand from references">
      <div className="flex flex-col h-full">
        {/* Documents */}
        <div className="px-5 py-4 border-b border-light-border dark:border-dark-border space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-light-text-muted dark:text-dark-text-muted">
              Source documents &amp; images ({docs.length}/5)
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
              Hand in brand guidelines, past posts, or your logo (PDF, DOCX, TXT, MD, PNG, JPG —
              max 10MB each). They ground this chat only — never the post generator.
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
              Add references above (brand guidelines, past posts, your logo) — or upload
              images in the Artifacts section marked <span className="font-medium">feed to AI</span> —
              then ask me to extract the brand voice and style. I&apos;ll propose a voice,
              palette, and font guesses you can review and apply.
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
              </div>
            </div>
          ))}
          {pending && (
            <div className="flex items-center gap-2 text-sm text-light-text-muted dark:text-dark-text-muted">
              <Loader2 size={14} className="animate-spin" />
              Studying the references — this can take up to a minute…
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Suggestion review + apply */}
        {hasSuggestion && (
          <div className="px-5 py-4 border-t border-light-border dark:border-dark-border bg-primary/[0.03] dark:bg-primary-light/[0.03] max-h-[22rem] overflow-y-auto space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-primary dark:text-primary-light" />
              <p className="text-xs font-semibold uppercase tracking-widest text-light-text-muted dark:text-dark-text-muted">
                Proposed brand — review &amp; edit, then apply
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-light-text-muted dark:text-dark-text-muted">Brand voice</label>
              <textarea
                value={voice}
                onChange={e => setVoice(e.target.value)}
                rows={4}
                className="mt-1 glass-input rounded-xl px-3 py-2 text-sm w-full text-light-text dark:text-dark-text resize-y"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-light-text-muted dark:text-dark-text-muted">
                Color palette (sampled — replaces the current palette)
              </label>
              <div className="mt-1">
                <ColorEditor colors={colors} onChange={setColors} />
              </div>
            </div>

            {fonts.length > 0 && (
              <div>
                <label className="text-xs font-medium text-light-text-muted dark:text-dark-text-muted">
                  Font guesses (not applied — add manually with a font file if correct)
                </label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {fonts.map(f => (
                    <span key={f} className="px-2 py-1 rounded-lg text-xs bg-primary/5 dark:bg-primary-light/5 text-light-text dark:text-dark-text">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {style && (
              <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
                <span className="font-medium">Style:</span> {style}
              </p>
            )}

            <div className="flex gap-2">
              <Button size="sm" onClick={apply} disabled={applying || (!voice.trim() && colors.length === 0)}>
                {applying ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                Apply voice + colors
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setHasSuggestion(false)} disabled={applying}>
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {/* Input */}
        <form onSubmit={send} className="px-5 py-4 border-t border-light-border dark:border-dark-border flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="e.g. Extract the brand voice and style from these references"
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
