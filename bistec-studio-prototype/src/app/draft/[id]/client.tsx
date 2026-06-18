'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import { drafts, canvaTemplates, posts, type Draft, type DesignMode } from '@/data/mock'
import { RefreshCw, Send, Calendar, Check, AlertCircle, Instagram, Linkedin, ImagePlus, Edit3, ExternalLink, Clock, CheckCircle2, X } from 'lucide-react'

const channelIcon: Record<string, React.ElementType> = { INSTAGRAM: Instagram, LINKEDIN: Linkedin }
const channelColor: Record<string, string> = { INSTAGRAM: 'text-pink-400', LINKEDIN: 'text-blue-400' }

const statusMap: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  IN_PROGRESS: { label: 'In Progress', cls: 'bg-amber-400/10 text-amber-400', icon: Clock },
  EXPORTED: { label: 'Exported', cls: 'bg-cyan-400/10 text-cyan-400', icon: Check },
  PUBLISHED: { label: 'Published', cls: 'bg-emerald-400/10 text-emerald-400', icon: CheckCircle2 },
  FAILED: { label: 'Failed', cls: 'bg-red-400/10 text-red-400', icon: AlertCircle },
}

export default function DraftClient({ id }: { id: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const paramDesignMode = searchParams.get('designMode') as DesignMode | null
  const original = drafts.find(d => d.id === id)

  const [draft, setDraft] = useState<Draft | null>(
    original && paramDesignMode ? { ...original, designMode: paramDesignMode } : original ?? null
  )
  const [copyText, setCopyText] = useState(original?.copyText ?? '')
  const [selectedTemplate, setSelectedTemplate] = useState(original?.templateName ?? canvaTemplates[0].name)
  const [regeneratingCopy, setRegeneratingCopy] = useState(false)
  const [regeneratingImage, setRegeneratingImage] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportStep, setExportStep] = useState<string | null>(null)
  const [showPublishPanel, setShowPublishPanel] = useState(false)
  const [showSchedulePanel, setShowSchedulePanel] = useState(false)
  const [publishedChannels, setPublishedChannels] = useState<string[]>([])
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('09:00')
  const [publishing, setPublishing] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  if (!draft) {
    return (
      <>
        <Header breadcrumbs={[{ label: 'Library', href: '/library' }, { label: 'Draft not found' }]} />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-slate-500 text-[0.82rem]">Draft not found</div>
        </main>
      </>
    )
  }

  const draftPosts = posts.filter(p => p.draftId === id)
  const st = statusMap[draft.status]
  const StIcon = st.icon

  const handleRegenerateCopy = () => {
    setRegeneratingCopy(true)
    setTimeout(() => {
      setCopyText("🚀 Big news from Bistec!\n\nWe've just launched something that changes how marketing teams work. Say goodbye to the brand-knowledge bottleneck — Bistec Studio lets any team member produce a polished, on-brand post in minutes.\n\nAI handles the copy. Canva handles the design. You just write the brief.\n\n#BistecStudio #AITools #MarketingOps #ContentCreation")
      setRegeneratingCopy(false)
      showToast('Copy regenerated with GPT-4o')
    }, 1800)
  }

  const handleRegenerateImage = () => {
    setRegeneratingImage(true)
    setTimeout(() => {
      setDraft(d => d ? { ...d, imageUrl: 'https://images.unsplash.com/photo-1545665277-5937489579f2?w=800&q=80' } : d)
      setRegeneratingImage(false)
      showToast('Image regenerated with gpt-image-1')
    }, 2200)
  }

  const handleExport = async () => {
    setExporting(true)
    if (draft?.designMode === 'TEMPLATE') {
      const steps = [
        'Fetching design element tree from Canva…',
        'Claude resolving element targets…',
        'Applying edits via Canva MCP transaction…',
        'Exporting design…',
      ]
      for (const step of steps) {
        setExportStep(step)
        await new Promise(r => setTimeout(r, 900))
      }
    } else {
      await new Promise(r => setTimeout(r, 2000))
    }
    setDraft(d => d ? { ...d, status: 'EXPORTED', exportUrl: d.imageUrl } : d)
    setExporting(false)
    setExportStep(null)
    showToast(
      draft?.designMode === 'TEMPLATE'
        ? 'Claude resolved elements — edits applied and design exported'
        : 'Design exported from Canva — ready to publish'
    )
  }

  const handlePublish = () => {
    if (publishedChannels.length === 0) return
    setPublishing(true)
    setTimeout(() => {
      setDraft(d => d ? { ...d, status: 'PUBLISHED' } : d)
      setPublishing(false)
      setShowPublishPanel(false)
      showToast(`Published to ${publishedChannels.join(' + ')}`)
    }, 2000)
  }

  const handleSchedule = () => {
    if (!scheduleDate || publishedChannels.length === 0) return
    setScheduling(true)
    setTimeout(() => {
      setScheduling(false)
      setShowSchedulePanel(false)
      showToast(`Scheduled for ${scheduleDate} at ${scheduleTime}`)
    }, 1500)
  }

  const toggleChannel = (ch: string) => {
    setPublishedChannels(prev => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch])
  }

  return (
    <>
      <Header breadcrumbs={[
        { label: 'Library', href: '/library' },
        { label: draft.topic.length > 40 ? draft.topic.slice(0, 40) + '…' : draft.topic },
      ]} />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">

        {/* Status + meta row */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[0.72rem] font-medium ${st.cls}`}>
            <StIcon size={11} /> {st.label}
          </span>
          {draft.campaignName && (
            <span className="text-[0.72rem] text-slate-500">{draft.campaignName}</span>
          )}
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            {draft.status === 'EXPORTED' && (
              <>
                <button onClick={() => { setPublishedChannels(draft.channels); setShowPublishPanel(true) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-400/10 text-emerald-400 text-[0.78rem] hover:bg-emerald-400/20 border border-emerald-400/20 transition-colors">
                  <Send size={13} /> Publish Now
                </button>
                <button onClick={() => { setPublishedChannels(draft.channels); setShowSchedulePanel(true) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-400/10 text-blue-400 text-[0.78rem] hover:bg-blue-400/20 border border-blue-400/20 transition-colors">
                  <Calendar size={13} /> Schedule
                </button>
              </>
            )}
            {(draft.status === 'IN_PROGRESS') && (
              <button onClick={handleExport} disabled={exporting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-400/10 text-cyan-400 text-[0.78rem] hover:bg-cyan-400/20 border border-cyan-400/20 transition-colors disabled:opacity-50 max-w-xs truncate">
                {exporting ? <RefreshCw size={13} className="animate-spin flex-shrink-0" /> : <ExternalLink size={13} className="flex-shrink-0" />}
                <span className="truncate">{exportStep ?? (exporting ? 'Exporting…' : 'Export from Canva')}</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5">

          {/* Left — Copy + Image */}
          <div className="space-y-4">

            {/* Copy editor */}
            <div className="glass rounded-xl">
              <div className="px-4 py-3.5 border-b border-white/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Edit3 size={14} className="text-slate-400" />
                  <span className="text-[0.8rem] font-semibold">Copy</span>
                  <span className="text-[0.62rem] text-slate-600 ml-1">via {draft.copyProviderLabel}</span>
                </div>
                <button onClick={handleRegenerateCopy} disabled={regeneratingCopy}
                  className="flex items-center gap-1.5 text-[0.72rem] text-cyan-400 hover:text-cyan-300 transition-colors disabled:opacity-50">
                  <RefreshCw size={12} className={regeneratingCopy ? 'animate-spin' : ''} />
                  {regeneratingCopy ? 'Regenerating…' : 'Regenerate'}
                </button>
              </div>
              <div className="p-4">
                {draft.copyText || copyText ? (
                  <textarea
                    value={copyText}
                    onChange={e => setCopyText(e.target.value)}
                    rows={8}
                    className="w-full bg-transparent text-[0.82rem] text-slate-300 leading-relaxed resize-none outline-none placeholder:text-slate-600"
                  />
                ) : (
                  <div className="flex items-center gap-2 text-[0.78rem] text-slate-600 py-4">
                    <Clock size={14} /> Copy not yet generated — complete the brief first
                  </div>
                )}
              </div>
            </div>

            {/* Channels */}
            <div className="glass rounded-xl p-4">
              <div className="text-[0.72rem] font-semibold text-slate-400 uppercase tracking-[0.08em] mb-3">Channels</div>
              <div className="flex flex-wrap gap-2">
                {draft.channels.map(ch => {
                  const ChIcon = channelIcon[ch]
                  return (
                    <div key={ch} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] ${channelColor[ch]} text-[0.78rem]`}>
                      <ChIcon size={13} /> {ch.charAt(0) + ch.slice(1).toLowerCase()}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Design mode */}
            <div className="glass rounded-xl p-4">
              <div className="text-[0.72rem] font-semibold text-slate-400 uppercase tracking-[0.08em] mb-3">Design Mode</div>
              <div className="flex items-center gap-2 text-[0.82rem] text-slate-300">
                {draft.designMode === 'TEMPLATE' ? '🎨 Preset Brand Template (Path A)' : '✨ AI-Generated New Design (Path B)'}
              </div>
              {draft.designMode === 'TEMPLATE' && (
                <div className="mt-3">
                  <div className="text-[0.65rem] text-slate-600 mb-2">Select template:</div>
                  <div className="flex flex-wrap gap-2">
                    {canvaTemplates.map(t => (
                      <button key={t.id} onClick={() => setSelectedTemplate(t.name)}
                        className={`px-3 py-1.5 rounded-lg text-[0.72rem] border transition-colors ${selectedTemplate === t.name ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-400' : 'border-white/[0.06] text-slate-500 hover:text-slate-300'}`}>
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Publish history if any */}
            {draftPosts.length > 0 && (
              <div className="glass rounded-xl">
                <div className="px-4 py-3.5 border-b border-white/[0.06] text-[0.8rem] font-semibold">Publish History</div>
                <div className="divide-y divide-white/[0.04]">
                  {draftPosts.map(post => {
                    const ChIcon = channelIcon[post.channel]
                    const pst = statusMap[post.status]
                    const PstIcon = pst?.icon ?? Check
                    return (
                      <div key={post.id} className="px-4 py-3 flex items-center gap-3">
                        <ChIcon size={14} className={channelColor[post.channel]} />
                        <div className="flex-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.62rem] ${pst?.cls}`}>
                            <PstIcon size={9} /> {pst?.label}
                          </span>
                          {post.errorReason && <div className="text-[0.65rem] text-red-400 mt-0.5">{post.errorReason}</div>}
                        </div>
                        <div className="text-[0.62rem] text-slate-600">
                          {post.publishedAt ? new Date(post.publishedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : post.scheduledAt ? `Scheduled ${new Date(post.scheduledAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right — Image preview + design preview */}
          <div className="space-y-4">
            <div className="glass rounded-xl">
              <div className="px-4 py-3.5 border-b border-white/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <ImagePlus size={14} className="text-slate-400 flex-shrink-0" />
                  <span className="text-[0.8rem] font-semibold">
                    {draft.designMode === 'TEMPLATE' ? 'Generated Image' : 'AI Image'}
                  </span>
                  <span className="text-[0.62rem] text-slate-600 ml-1 truncate">
                    {draft.designMode === 'TEMPLATE'
                      ? `via ${draft.imageProviderLabel}`
                      : 'GPT orchestrator (gpt-image-1 or brand asset)'}
                  </span>
                </div>
                {draft.designMode === 'TEMPLATE' && (
                  <button onClick={handleRegenerateImage} disabled={regeneratingImage}
                    className="flex items-center gap-1.5 text-[0.72rem] text-cyan-400 hover:text-cyan-300 disabled:opacity-50 transition-colors flex-shrink-0 ml-2">
                    <RefreshCw size={12} className={regeneratingImage ? 'animate-spin' : ''} />
                    {regeneratingImage ? 'Generating…' : 'Regenerate'}
                  </button>
                )}
              </div>
              <div className="p-4">
                {draft.imageUrl ? (
                  <div className="relative rounded-lg overflow-hidden">
                    <img src={draft.imageUrl} alt="Generated post image" className="w-full aspect-square object-cover rounded-lg" />
                    {regeneratingImage && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-lg">
                        <RefreshCw size={24} className="text-cyan-400 animate-spin" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="aspect-square rounded-lg bg-white/[0.02] border border-white/[0.04] flex flex-col items-center justify-center text-slate-600 text-[0.78rem] gap-2">
                    <ImagePlus size={24} className="opacity-40" />
                    <span>Image not yet generated</span>
                  </div>
                )}
              </div>
            </div>

            {/* Design preview (Canva) */}
            {draft.canvaDesignId && (
              <div className="glass rounded-xl p-4">
                <div className="text-[0.72rem] font-semibold text-slate-400 uppercase tracking-[0.08em] mb-3">Canva Design</div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500/30 to-pink-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-lg">🎨</span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[0.78rem] text-slate-300 font-medium truncate">{selectedTemplate || draft.canvaDesignId}</div>
                    <div className="text-[0.62rem] text-slate-600 font-mono mt-0.5">{draft.canvaDesignId}</div>
                  </div>
                  <ExternalLink size={13} className="text-slate-600 flex-shrink-0 ml-auto" />
                </div>
                <div className="text-[0.62rem] text-slate-700 mt-2">No pixel editing — changes applied via Canva MCP editing transactions only</div>
              </div>
            )}

            {/* Brief summary */}
            <div className="glass rounded-xl p-4">
              <div className="text-[0.72rem] font-semibold text-slate-400 uppercase tracking-[0.08em] mb-3">Brief</div>
              <div className="space-y-2">
                {[
                  { label: 'Topic', value: draft.topic },
                  { label: 'Goal', value: draft.goal },
                  { label: 'Tone', value: draft.tone },
                ].map(row => (
                  <div key={row.label} className="flex gap-3">
                    <div className="text-[0.65rem] text-slate-600 w-12 flex-shrink-0 pt-0.5">{row.label}</div>
                    <div className="text-[0.72rem] text-slate-400 leading-relaxed">{row.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Publish panel */}
      {showPublishPanel && (
        <>
          <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm" onClick={() => setShowPublishPanel(false)} />
          <div className="fixed inset-0 z-[201] flex items-center justify-center p-4">
            <div className="glass rounded-2xl p-6 w-full max-w-sm animate-scale-in">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[0.92rem] font-semibold">Publish Now</h2>
                <button onClick={() => setShowPublishPanel(false)} className="text-slate-500 hover:text-slate-300"><X size={16} /></button>
              </div>
              <div className="text-[0.72rem] text-slate-500 mb-3">Select channels to publish to:</div>
              <div className="space-y-2 mb-5">
                {draft.channels.map(ch => {
                  const ChIcon = channelIcon[ch]
                  return (
                    <label key={ch} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${publishedChannels.includes(ch) ? 'border-cyan-400/30 bg-cyan-400/[0.06]' : 'border-white/[0.06] hover:bg-white/[0.02]'}`}>
                      <input type="checkbox" checked={publishedChannels.includes(ch)} onChange={() => toggleChannel(ch)} className="accent-cyan-400" />
                      <ChIcon size={15} className={channelColor[ch]} />
                      <span className="text-[0.82rem] text-slate-300 capitalize">{ch.toLowerCase()}</span>
                    </label>
                  )
                })}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowPublishPanel(false)} className="flex-1 py-2 rounded-lg border border-white/[0.06] text-[0.82rem] text-slate-400 hover:text-slate-200">Cancel</button>
                <button onClick={handlePublish} disabled={publishedChannels.length === 0 || publishing}
                  className="flex-1 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-[0.82rem] font-medium text-white disabled:opacity-40 flex items-center justify-center gap-2">
                  {publishing ? <><RefreshCw size={13} className="animate-spin" /> Publishing…</> : <><Send size={13} /> Publish</>}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Schedule panel */}
      {showSchedulePanel && (
        <>
          <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm" onClick={() => setShowSchedulePanel(false)} />
          <div className="fixed inset-0 z-[201] flex items-center justify-center p-4">
            <div className="glass rounded-2xl p-6 w-full max-w-sm animate-scale-in">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[0.92rem] font-semibold">Schedule Post</h2>
                <button onClick={() => setShowSchedulePanel(false)} className="text-slate-500 hover:text-slate-300"><X size={16} /></button>
              </div>
              <div className="space-y-4 mb-5">
                <div className="space-y-2">
                  {draft.channels.map(ch => {
                    const ChIcon = channelIcon[ch]
                    return (
                      <label key={ch} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${publishedChannels.includes(ch) ? 'border-blue-400/30 bg-blue-400/[0.06]' : 'border-white/[0.06]'}`}>
                        <input type="checkbox" checked={publishedChannels.includes(ch)} onChange={() => toggleChannel(ch)} className="accent-blue-400" />
                        <ChIcon size={15} className={channelColor[ch]} />
                        <span className="text-[0.82rem] text-slate-300 capitalize">{ch.toLowerCase()}</span>
                      </label>
                    )
                  })}
                </div>
                <div>
                  <label className="text-[0.72rem] font-medium text-slate-400 block mb-1.5">Date</label>
                  <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[0.82rem] text-slate-200 outline-none focus:border-blue-400/40" />
                </div>
                <div>
                  <label className="text-[0.72rem] font-medium text-slate-400 block mb-1.5">Time</label>
                  <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[0.82rem] text-slate-200 outline-none focus:border-blue-400/40" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowSchedulePanel(false)} className="flex-1 py-2 rounded-lg border border-white/[0.06] text-[0.82rem] text-slate-400 hover:text-slate-200">Cancel</button>
                <button onClick={handleSchedule} disabled={!scheduleDate || publishedChannels.length === 0 || scheduling}
                  className="flex-1 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 text-[0.82rem] font-medium text-white disabled:opacity-40 flex items-center justify-center gap-2">
                  {scheduling ? <><RefreshCw size={13} className="animate-spin" /> Scheduling…</> : <><Calendar size={13} /> Schedule</>}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[9999] glass rounded-xl px-4 py-3 text-[0.78rem] text-slate-200 shadow-2xl animate-slide-in flex items-center gap-2 max-w-sm">
          <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />
          {toast}
        </div>
      )}
    </>
  )
}
