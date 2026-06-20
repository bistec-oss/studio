'use client'

import { useState, useRef } from 'react'
import { Send, RotateCcw, Upload, Download, ChevronLeft, ChevronRight, Instagram, Linkedin, Sparkles } from 'lucide-react'
import Header from '@/components/Header'
import { Badge } from '@/components/Badge'
import { statusConfig } from '@/lib/utils'
import type { Draft, DraftRevision } from '@/data/mock'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const suggestions = [
  'Make the heading larger and more impactful',
  'Add more whitespace around the main text',
  'Change the background to a deeper colour',
  'Make the CTA button stand out more',
]

function PostPreview({ draft, revisionIndex }: { draft: Draft; revisionIndex: number }) {
  const platform = draft.platform
  const isGenerating = draft.status === 'generating'
  const isReady = draft.status === 'ready' || draft.status === 'published'

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={`relative overflow-hidden rounded-2xl shadow-xl shadow-black/10 ${
        platform === 'instagram' ? 'w-[260px] h-[260px]' : 'w-[300px] h-[157px]'
      } bg-gradient-to-br from-slate-100 to-slate-200`}>
        {isGenerating ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="flex gap-1.5">
              <span className="typing-dot bg-blue-500" />
              <span className="typing-dot bg-blue-500" />
              <span className="typing-dot bg-blue-500" />
            </div>
            <p className="text-[0.72rem] text-slate-400">Claude is designing…</p>
          </div>
        ) : isReady ? (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-blue-600 via-blue-700 to-violet-700"
          >
            <div className="w-full h-full flex flex-col items-center justify-center p-5 text-white">
              <div className="text-[0.55rem] tracking-[0.25em] uppercase font-bold opacity-70 mb-2">BISTEC</div>
              <div className="text-[0.95rem] font-extrabold font-display leading-tight text-center">{draft.briefSummary}</div>
              <div className="mt-3 text-[0.6rem] opacity-60 font-medium uppercase tracking-widest">Rev {revisionIndex + 1} of {draft.revisions.length}</div>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-[0.72rem] text-slate-400">No preview</p>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 text-[0.68rem] text-slate-400">
        {platform === 'instagram' ? <Instagram size={11} /> : <Linkedin size={11} />}
        <span className="capitalize">{platform}</span>
        <span>·</span>
        <span>Path {draft.pathType}</span>
      </div>
    </div>
  )
}

function RevisionHistory({ revisions, activeIndex, onSelect }: {
  revisions: DraftRevision[]
  activeIndex: number
  onSelect: (i: number) => void
}) {
  return (
    <div className="space-y-1.5">
      {[...revisions].reverse().map((rev, ri) => {
        const realIndex = revisions.length - 1 - ri
        return (
          <button
            key={rev.id}
            onClick={() => onSelect(realIndex)}
            className={`w-full flex items-start gap-2.5 p-2.5 rounded-lg text-left transition-all ${
              realIndex === activeIndex ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'
            }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[0.58rem] font-bold flex-shrink-0 mt-0.5 ${
              realIndex === activeIndex ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'
            }`}>{rev.revisionNumber}</span>
            <div>
              <div className="text-[0.75rem] text-slate-700 font-medium">{rev.instruction}</div>
              <div className="text-[0.62rem] text-slate-400">{rev.createdAt.slice(11, 16)}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

export default function DraftClient({ draft }: { draft: Draft }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'sys', role: 'assistant', content: `I've generated your post. Review it and tell me what to change — I'll update the design and re-render it.` }
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [activeRevision, setActiveRevision] = useState(Math.max(0, draft.revisions.length - 1))
  const inputRef = useRef<HTMLInputElement>(null)

  async function sendMessage(text?: string) {
    const msg = text ?? input.trim()
    if (!msg || sending) return
    setInput('')
    setSending(true)
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: msg }
    setMessages(m => [...m, userMsg])
    await new Promise(r => setTimeout(r, 1400))
    const aiMsg: ChatMessage = {
      id: `a-${Date.now()}`,
      role: 'assistant',
      content: `Got it — updating the design: "${msg}". The new version will appear in a moment.`,
    }
    setMessages(m => [...m, aiMsg])
    setSending(false)
  }

  const canPublish = draft.status === 'ready'

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <Header
        breadcrumbs={[
          { label: 'Library', href: '/library' },
          { label: draft.campaignName ?? 'Uncategorized', href: '/library' },
          { label: draft.briefSummary },
        ]}
      />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: Preview + Revision history */}
        <div className="hidden lg:flex flex-col w-72 xl:w-80 border-r border-slate-200 bg-surface-1 overflow-y-auto flex-shrink-0">
          <div className="p-5 border-b border-slate-100">
            <PostPreview draft={draft} revisionIndex={activeRevision} />
          </div>

          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[0.72rem] font-bold tracking-widest uppercase text-slate-400">Revisions</h3>
              <div className="flex items-center gap-1">
                <button
                  disabled={activeRevision === 0}
                  onClick={() => setActiveRevision(a => a - 1)}
                  className="p-1 rounded text-slate-400 hover:text-slate-600 disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft size={13} />
                </button>
                <span className="text-[0.68rem] text-slate-400">{activeRevision + 1}/{draft.revisions.length}</span>
                <button
                  disabled={activeRevision >= draft.revisions.length - 1}
                  onClick={() => setActiveRevision(a => a + 1)}
                  className="p-1 rounded text-slate-400 hover:text-slate-600 disabled:opacity-30 transition-colors"
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
            {draft.revisions.length > 0 ? (
              <RevisionHistory revisions={draft.revisions} activeIndex={activeRevision} onSelect={setActiveRevision} />
            ) : (
              <p className="text-[0.72rem] text-slate-400 py-3">No revisions yet.</p>
            )}
          </div>
        </div>

        {/* Center: AGUI chat */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
          {/* Post meta bar */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-white flex-shrink-0 flex-wrap gap-y-2">
            <Badge status={draft.status} config={statusConfig} />
            <span className="text-[0.75rem] text-slate-400">·</span>
            <span className="text-[0.75rem] text-slate-500 capitalize">{draft.platform}</span>
            <span className="text-[0.75rem] text-slate-400">·</span>
            <span className="text-[0.72rem] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-600 ring-1 ring-blue-200/60">Path {draft.pathType}</span>
            <span className="text-[0.75rem] text-slate-500">{draft.campaignName}</span>
            <div className="ml-auto flex items-center gap-2">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 text-[0.75rem] font-medium transition-colors">
                <Download size={13} /> Export
              </button>
              <button
                disabled={!canPublish}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[0.75rem] font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Upload size={13} /> Publish
              </button>
            </div>
          </div>

          {/* Mobile preview */}
          <div className="lg:hidden flex justify-center py-4 border-b border-slate-100 bg-white">
            <PostPreview draft={draft} revisionIndex={activeRevision} />
          </div>

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-surface-2">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                    <Sparkles size={11} className="text-white" />
                  </div>
                )}
                <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-[0.82rem] leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-white border border-slate-200 text-slate-700 rounded-bl-sm shadow-sm'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                  <Sparkles size={11} className="text-white" />
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                  <div className="flex gap-1">
                    <span className="typing-dot bg-blue-400" /><span className="typing-dot bg-blue-400" /><span className="typing-dot bg-blue-400" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Suggestions */}
          {draft.status !== 'generating' && (
            <div className="flex gap-2 overflow-x-auto px-4 py-2 border-t border-slate-100 bg-white flex-shrink-0">
              {suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="flex-shrink-0 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 text-[0.72rem] font-medium border border-slate-200 hover:border-blue-200 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-200 bg-white flex-shrink-0">
            <button className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors flex-shrink-0">
              <RotateCcw size={15} />
            </button>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              placeholder={draft.status === 'generating' ? 'Generating…' : 'Describe a change to make…'}
              disabled={draft.status === 'generating' || sending}
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[0.82rem] text-slate-700 placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:opacity-50 transition-all"
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || sending || draft.status === 'generating'}
              className="p-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
