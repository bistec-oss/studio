'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Check, FileText, Loader2, Paperclip, Send, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Modal'
import { ModelPicker } from '@/components/ui/ModelPicker'
import { ApiError, apiFetch } from '@/lib/apiFetch'
import type { ModelKey } from '@/lib/models/catalogue'
import { ColorEditor } from './ColorEditor'
import { COMPACT_TEXTAREA, EYEBROW, FOCUS, ICON, ICON_BUTTON, ICON_SM, SCROLL_FOCUS } from '@/components/ui/atoms'
import type { FontFamily } from '@/lib/fonts/types'
import { FieldLabel } from '@/components/ui/FieldLabel'

// F5 — conversational brand-kit extraction from reference images. Mirrors the
// campaign BriefingAssistantPanel: chat grounded on the kit's feedToAI reference
// images, the assistant proposes a brand suggestion, the admin reviews + edits it,
// then applies. Apply writes the VOICE (new active prompt) and the COLOR palette
// (sampled, editable) and, since 031, the fonts: each proposed name is looked up in
// the font list (exact match only) and shown as current versus proposed. A name that
// is not in the list is never applied. One Apply calls /assistant/apply (all or nothing).

interface BrandKitSuggestion {
  voice: string
  tone: string
  style: string
  fonts: { heading?: string; body?: string }
  scriptFonts?: Record<string, string>
  colors: string[]
}

// One reviewable font change in the accept view.
interface FontRow {
  key: 'heading' | 'body' | 'sinhala'
  label: string
  current: string
  proposed: string
  // Why the row cannot be applied; null when the proposed name is a usable catalogue family.
  problem: 'not-listed' | 'no-sinhala' | null
  checked: boolean
}

interface KitFontsView {
  fonts: Array<{ name: string }>
  scriptFonts: Record<string, string> | null
}

async function lookupFamily(name: string): Promise<FontFamily | null> {
  try {
    const res = await apiFetch<{ families: FontFamily[] }>(`/api/fonts?q=${encodeURIComponent(name)}`)
    return res.families.find(f => f.family === name) ?? null
  } catch {
    return null
  }
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
  const voiceId = React.useId()
  const messageId = React.useId()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [docs, setDocs] = useState<BrandKitDocumentMeta[]>([])
  const [uploading, setUploading] = useState(false)
  // The suggestion under review (editable), and which fields to apply.
  const [voice, setVoice] = useState('')
  const [colors, setColors] = useState<string[]>([])
  const [fontRows, setFontRows] = useState<FontRow[]>([])
  // The font lookups run after a suggestion arrives; Apply waits for them so a fast click cannot skip the fonts.
  const [fontsLoading, setFontsLoading] = useState(false)
  const [style, setStyle] = useState('')
  const [hasSuggestion, setHasSuggestion] = useState(false)
  const [applying, setApplying] = useState(false)
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

  // FR-33: look each proposed name up (exact match only) and set it beside the kit's current font.
  async function buildFontRows(s: BrandKitSuggestion): Promise<FontRow[]> {
    const proposals: Array<{ key: FontRow['key']; label: string; name: string }> = []
    if (s.fonts?.heading) proposals.push({ key: 'heading', label: 'Heading font', name: s.fonts.heading })
    if (s.fonts?.body) proposals.push({ key: 'body', label: 'Body font', name: s.fonts.body })
    if (s.scriptFonts?.sinhala) proposals.push({ key: 'sinhala', label: 'Sinhala font', name: s.scriptFonts.sinhala })
    if (proposals.length === 0) return []
    let kit: KitFontsView | null = null
    try {
      kit = await apiFetch<KitFontsView>(`/api/admin/brandkits/${kitId}`)
    } catch {
      /* "Current" shows as none; Apply still validates on the server */
    }
    const storedFonts = Array.isArray(kit?.fonts) ? kit!.fonts : []
    return Promise.all(
      proposals.map(async p => {
        const found = await lookupFamily(p.name)
        const problem: FontRow['problem'] = !found
          ? 'not-listed'
          : p.key === 'sinhala' && !found.scripts.includes('sinhala')
            ? 'no-sinhala'
            : null
        const current =
          p.key === 'heading' ? storedFonts[0]?.name : p.key === 'body' ? storedFonts[1]?.name : kit?.scriptFonts?.sinhala
        return { key: p.key, label: p.label, current: current ?? 'none', proposed: p.name, problem, checked: problem === null }
      }),
    )
  }

  function loadSuggestion(s: BrandKitSuggestion) {
    setVoice(s.voice)
    setColors(s.colors)
    setFontRows([])
    setFontsLoading(true)
    void buildFontRows(s)
      .then(setFontRows)
      .finally(() => setFontsLoading(false))
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
    setModelError(undefined)
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
    try {
      const result = await apiFetch<{ reply: string; suggestion: BrandKitSuggestion | null }>(
        `/api/admin/brandkits/${kitId}/assistant/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // model is dropped by JSON.stringify while undefined (A5).
          body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })), model }),
        },
      )
      setMessages([...next, { role: 'assistant', content: result.reply, suggestion: result.suggestion }])
      if (result.suggestion) loadSuggestion(result.suggestion)
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
    } catch (err: unknown) {
      // A refused model pick (400, nothing ran) shows on the picker; any other
      // failure toasts. Either way the turn rolls back so it can be resent.
      if (err instanceof ApiError && err.code === 'MODEL_NOT_ALLOWED') setModelError(err.message)
      else toast.error(err instanceof Error ? err.message : 'The assistant failed to reply')
      setMessages(messages)
      setInput(content)
    } finally {
      setPending(false)
    }
  }

  const chosenFonts = fontRows.filter(r => r.checked && r.problem === null)
  const canApply = voice.trim() !== '' || colors.length > 0 || chosenFonts.length > 0

  async function apply() {
    if (!canApply) return
    setApplying(true)
    try {
      const fonts: { heading?: string; body?: string } = {}
      for (const r of chosenFonts) if (r.key !== 'sinhala') fonts[r.key] = r.proposed
      const sinhala = chosenFonts.find(r => r.key === 'sinhala')
      // One call, all or nothing (FR-34): voice, colors, fonts and script fonts together.
      await apiFetch(`/api/admin/brandkits/${kitId}/assistant/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(voice.trim() && { voice: voice.trim() }),
          ...(colors.length > 0 && { colors }),
          ...(Object.keys(fonts).length > 0 && { fonts }),
          ...(sinhala && { scriptFonts: { sinhala: sinhala.proposed } }),
        }),
      })
      toast.success('Applied the suggestion to the kit.')
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
      <div className="flex h-full flex-col">
        {/* The chat header's model picker (008 FR-21), pre-selected to the team
            or system default. Its team-token notice is the picker's own
            (FR-22). It renders nothing until /api/models loads. */}
        <ModelPicker
          id="brandkit-assistant-model"
          surface="ASSISTANT_BRANDKIT"
          value={model}
          onChange={pickModel}
          label="Brand kit assistant model"
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
              Hand in brand guidelines, past posts, or your logo (PDF, DOCX, TXT, MD, PNG, JPG —
              max 10MB each). They ground this chat only — never the post generator.
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
              Add references above (brand guidelines, past posts, your logo) — or upload
              images in the Artifacts section marked <span className="font-medium text-fg">feed to AI</span> —
              then ask me to extract the brand voice and style. I&apos;ll propose a voice,
              palette, and font guesses you can review and apply.
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
                </li>
              ))}
            </ol>
          )}
          {pending && (
            <div className="mt-3 flex items-center gap-2 text-ui-sm text-fg-muted">
              <Loader2 {...ICON} className="animate-spin" aria-hidden />
              Studying the references — this can take up to a minute…
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Suggestion review + apply. It scrolls inside its own box, so it is
            a focusable, labelled region (the T7 rule). The proposed palette is
            kit data: its swatches show the sampled colours as they are. */}
        {hasSuggestion && (
          <div
            tabIndex={0}
            role="region"
            aria-label="Proposed brand"
            className={`max-h-[22rem] flex-shrink-0 space-y-3 overflow-y-auto border-t border-line-subtle bg-surface px-5 py-4 ${SCROLL_FOCUS}`}
          >
            <div className="flex items-center gap-2">
              <Sparkles {...ICON} aria-hidden className="flex-shrink-0 text-accent" />
              <p className={EYEBROW}>
                Proposed brand — review &amp; edit, then apply
              </p>
            </div>

            <div>
              {/* A field label: sentence case, the shared FieldLabel (021 FR-07). */}
              <FieldLabel htmlFor={voiceId}>Brand voice</FieldLabel>
              <textarea
                id={voiceId}
                value={voice}
                onChange={e => setVoice(e.target.value)}
                rows={4}
                className={`${COMPACT_TEXTAREA} mt-1.5 w-full resize-y leading-relaxed`}
              />
            </div>

            <div>
              <p className={EYEBROW}>
                Color palette (sampled — replaces the current palette)
              </p>
              <div className="mt-1.5">
                <ColorEditor colors={colors} onChange={setColors} />
              </div>
            </div>

            {fontRows.length > 0 && (
              <div>
                <p className={EYEBROW}>Fonts (checked ones are applied)</p>
                <ul className="mt-1.5 space-y-1.5">
                  {fontRows.map(r => {
                    const id = `${voiceId}-font-${r.key}`
                    return (
                      <li key={r.key} className="flex items-start gap-2">
                        <input
                          id={id}
                          type="checkbox"
                          checked={r.checked && r.problem === null}
                          disabled={r.problem !== null}
                          onChange={e =>
                            setFontRows(rows => rows.map(x => (x.key === r.key ? { ...x, checked: e.target.checked } : x)))
                          }
                          className={`mt-0.5 h-4 w-4 accent-accent disabled:cursor-not-allowed ${FOCUS}`}
                        />
                        <label htmlFor={id} className="min-w-0 break-words text-ui-sm text-fg">
                          <span className="font-medium">{r.label}: </span>
                          {r.problem === 'not-listed' ? (
                            <span className="text-fg-muted">
                              {`${r.proposed} is not in the font list and won't be applied`}
                            </span>
                          ) : r.problem === 'no-sinhala' ? (
                            <span className="text-fg-muted">
                              {`${r.proposed} does not support Sinhala and won't be applied`}
                            </span>
                          ) : (
                            <span>
                              Current: {r.current} → Proposed: {r.proposed}
                            </span>
                          )}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {style && (
              <p className="break-words text-ui-xs text-fg-muted">
                <span className="font-semibold text-fg">Style:</span> {style}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={apply} disabled={applying || fontsLoading || !canApply}>
                {applying ? <Loader2 {...ICON} className="animate-spin" /> : <Check {...ICON} />}
                Apply to brand kit
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setHasSuggestion(false)} disabled={applying}>
                Dismiss
              </Button>
            </div>
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
              placeholder="e.g. Extract the brand voice and style from these references"
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
