'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronRight,
  Instagram,
  Linkedin,
  Sparkles,
  Wand2,
  LayoutTemplate,
  Check,
  X,
  ChevronLeft,
  Zap,
  Upload,
} from 'lucide-react'
import Header from '@/components/Header'
import {
  campaigns,
  providers,
  toneOptions,
  canvaTemplates,
  getBrandKit,
  getCampaign,
  type Channel,
  type DesignMode,
} from '@/data/mock'

const stepLabels = ['Brief', 'Design', 'Review']

const defaultCopyProvider = providers.find(p => p.slot === 'COPY' && p.isDefault) ?? providers.find(p => p.slot === 'COPY')!
const defaultImageProvider = providers.find(p => p.slot === 'IMAGE' && p.isDefault) ?? providers.find(p => p.slot === 'IMAGE')!

const templateGradients = [
  'from-cyan-500/30 to-blue-600/30',
  'from-violet-500/30 to-purple-600/30',
  'from-emerald-500/30 to-teal-600/30',
]

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {stepLabels.map((label, i) => {
        const step = i + 1
        const isActive = step === current
        const isDone = step < current
        return (
          <div key={step} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-[0.75rem] font-bold border-2 transition-all ${
                  isDone
                    ? 'bg-cyan-400 border-cyan-400 text-slate-900'
                    : isActive
                    ? 'border-cyan-400 text-cyan-400 bg-cyan-400/10'
                    : 'border-white/[0.12] text-slate-600 bg-white/[0.03]'
                }`}
              >
                {isDone ? <Check size={13} /> : step}
              </div>
              <span
                className={`text-[0.68rem] font-medium ${
                  isActive ? 'text-cyan-400' : isDone ? 'text-slate-400' : 'text-slate-600'
                }`}
              >
                {label}
              </span>
            </div>
            {i < stepLabels.length - 1 && (
              <div
                className={`w-16 md:w-24 h-px mx-2 mb-5 transition-all ${
                  step < current ? 'bg-cyan-400/60' : 'bg-white/[0.08]'
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function BriefPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)

  const [campaignId, setCampaignId] = useState('')
  const [topic, setTopic] = useState('')
  const [description, setDescription] = useState('')
  const [goal, setGoal] = useState('')
  const [tone, setTone] = useState(toneOptions[0])

  const [channels, setChannels] = useState<Channel[]>(['INSTAGRAM'])
  const [designMode, setDesignMode] = useState<DesignMode>('TEMPLATE')
  const [selectedTemplate, setSelectedTemplate] = useState(canvaTemplates[0].id)
  const [copyProviderId, setCopyProviderId] = useState(defaultCopyProvider.id)
  const [imageProviderId, setImageProviderId] = useState(defaultImageProvider.id)
  const [speakerImage, setSpeakerImage] = useState<{ name: string; preview: string } | null>(null)
  const [referenceImages, setReferenceImages] = useState<{ name: string; preview: string }[]>([])

  const [generating, setGenerating] = useState(false)

  const selectedCampaign = campaignId ? getCampaign(campaignId) : undefined
  const brandKit = selectedCampaign ? getBrandKit(selectedCampaign.brandKitId) : undefined

  const enabledCopyProviders = providers.filter(p => p.slot === 'COPY' && p.isEnabled)
  const enabledImageProviders = providers.filter(p => p.slot === 'IMAGE' && p.isEnabled)

  const activeCopyProvider = providers.find(p => p.id === copyProviderId)
  const activeImageProvider = providers.find(p => p.id === imageProviderId)
  const activeTemplate = canvaTemplates.find(t => t.id === selectedTemplate)

  function handleCampaignChange(id: string) {
    setCampaignId(id)
    const c = getCampaign(id)
    if (c?.defaultTone) setTone(c.defaultTone)
  }

  function toggleChannel(ch: Channel) {
    setChannels(prev => {
      if (prev.includes(ch)) {
        if (prev.length === 1) return prev
        return prev.filter(c => c !== ch)
      }
      return [...prev, ch]
    })
  }

  async function handleGenerate() {
    setGenerating(true)
    await new Promise(r => setTimeout(r, 2000))
    router.push(`/draft/draft-001?designMode=${designMode}`)
  }

  const visibleTones = toneOptions.slice(0, 6)

  return (
    <>
      <Header
        breadcrumbs={[
          { label: 'New Post', href: '/brief' },
          { label: stepLabels[currentStep - 1] },
        ]}
      />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-2xl mx-auto">
          <StepIndicator current={currentStep} />

          {currentStep === 1 && (
            <div className="glass rounded-2xl border border-white/[0.08] p-5 md:p-6 space-y-5">
              <div>
                <h2 className="text-[1rem] font-semibold text-slate-200 mb-0.5">Tell us what to create</h2>
                <p className="text-[0.78rem] text-slate-500">Fill in the brief and we'll handle the rest.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[0.75rem] font-medium text-slate-400 uppercase tracking-wide">
                  Campaign <span className="text-slate-600 normal-case tracking-normal font-normal">(optional)</span>
                </label>
                <select
                  value={campaignId}
                  onChange={e => handleCampaignChange(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2.5 text-[0.85rem] text-slate-200 outline-none focus:border-cyan-400/50 focus:bg-cyan-400/[0.03] transition-all appearance-none cursor-pointer"
                >
                  <option value="" className="bg-[#111827] text-slate-400">No campaign</option>
                  {campaigns.filter(c => !c.isDeleted).map(c => (
                    <option key={c.id} value={c.id} className="bg-[#111827] text-slate-200">{c.name}</option>
                  ))}
                </select>
                {brandKit && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-[0.65rem] text-slate-600">Brand kit:</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-400/10 border border-cyan-400/20 text-[0.65rem] text-cyan-400 font-medium">
                      <Sparkles size={9} />
                      {brandKit.name}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[0.75rem] font-medium text-slate-400 uppercase tracking-wide">Topic</label>
                <input
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="e.g. Announcing our new AI product launch"
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2.5 text-[0.85rem] text-slate-200 outline-none focus:border-cyan-400/50 focus:bg-cyan-400/[0.03] transition-all placeholder:text-slate-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[0.75rem] font-medium text-slate-400 uppercase tracking-wide">
                  Description
                  <span className="ml-2 normal-case tracking-normal font-normal text-slate-600">— context fed to the AI when generating</span>
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={4}
                  placeholder="e.g. This week's speaker is Ashan Perera, a senior architect at WSO2 with 12 years in distributed systems. He'll be discussing event-driven architecture and its real-world trade-offs. Key message: reliability over speed."
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2.5 text-[0.85rem] text-slate-200 outline-none focus:border-cyan-400/50 focus:bg-cyan-400/[0.03] transition-all placeholder:text-slate-600 resize-none leading-relaxed"
                />
                <p className="text-[0.68rem] text-slate-600">Speaker bios, event details, key messages, and context you want the AI to use when writing copy and generating the image prompt.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[0.75rem] font-medium text-slate-400 uppercase tracking-wide">Goal / CTA</label>
                <input
                  value={goal}
                  onChange={e => setGoal(e.target.value)}
                  placeholder="e.g. Drive sign-ups to the beta waitlist"
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2.5 text-[0.85rem] text-slate-200 outline-none focus:border-cyan-400/50 focus:bg-cyan-400/[0.03] transition-all placeholder:text-slate-600"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[0.75rem] font-medium text-slate-400 uppercase tracking-wide">Tone</label>
                <div className="grid grid-cols-3 gap-2">
                  {visibleTones.map(t => (
                    <button
                      key={t}
                      onClick={() => setTone(t)}
                      className={`px-2.5 py-2 rounded-lg text-[0.72rem] text-left leading-snug transition-all border ${
                        tone === t
                          ? 'bg-cyan-400/10 border-cyan-400/40 text-cyan-400'
                          : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:border-white/[0.12] hover:text-slate-300'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-1">
                <button
                  onClick={() => setCurrentStep(2)}
                  disabled={!topic.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-400/10 border border-cyan-400/30 text-cyan-400 text-[0.85rem] font-medium hover:bg-cyan-400/20 hover:border-cyan-400/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="glass rounded-2xl border border-white/[0.08] p-5 md:p-6 space-y-6">
              <div>
                <h2 className="text-[1rem] font-semibold text-slate-200 mb-0.5">Design & Delivery</h2>
                <p className="text-[0.78rem] text-slate-500">Choose your channels, design approach, and AI models.</p>
              </div>

              <div className="space-y-2">
                <label className="text-[0.75rem] font-medium text-slate-400 uppercase tracking-wide">Channels</label>
                <div className="flex gap-3">
                  {([
                    { ch: 'INSTAGRAM' as Channel, label: 'Instagram', Icon: Instagram },
                    { ch: 'LINKEDIN' as Channel, label: 'LinkedIn', Icon: Linkedin },
                  ]).map(({ ch, label, Icon }) => {
                    const selected = channels.includes(ch)
                    return (
                      <button
                        key={ch}
                        onClick={() => toggleChannel(ch)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-[0.82rem] font-medium transition-all ${
                          selected
                            ? 'bg-cyan-400/10 border-cyan-400/40 text-cyan-400'
                            : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:border-white/[0.12] hover:text-slate-300'
                        }`}
                      >
                        <Icon size={15} />
                        {label}
                        {selected && <Check size={12} className="ml-0.5" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[0.75rem] font-medium text-slate-400 uppercase tracking-wide">Design Mode</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setDesignMode('TEMPLATE')}
                    className={`flex flex-col items-start gap-1.5 p-4 rounded-xl border text-left transition-all ${
                      designMode === 'TEMPLATE'
                        ? 'bg-cyan-400/10 border-cyan-400/40'
                        : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <LayoutTemplate size={15} className={designMode === 'TEMPLATE' ? 'text-cyan-400' : 'text-slate-500'} />
                      <span className={`text-[0.82rem] font-semibold ${designMode === 'TEMPLATE' ? 'text-cyan-400' : 'text-slate-300'}`}>
                        Use a Template
                      </span>
                    </div>
                    <p className="text-[0.7rem] text-slate-500 leading-snug">
                      Pick from your Canva brand templates
                    </p>
                  </button>
                  <button
                    onClick={() => setDesignMode('GENERATE')}
                    className={`flex flex-col items-start gap-1.5 p-4 rounded-xl border text-left transition-all ${
                      designMode === 'GENERATE'
                        ? 'bg-cyan-400/10 border-cyan-400/40'
                        : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Wand2 size={15} className={designMode === 'GENERATE' ? 'text-cyan-400' : 'text-slate-500'} />
                      <span className={`text-[0.82rem] font-semibold ${designMode === 'GENERATE' ? 'text-cyan-400' : 'text-slate-300'}`}>
                        Generate New Design
                      </span>
                    </div>
                    <p className="text-[0.7rem] text-slate-500 leading-snug">
                      AI creates a unique design from scratch
                    </p>
                  </button>
                </div>

                {designMode === 'TEMPLATE' && (
                  <div className="grid grid-cols-3 gap-3 mt-1">
                    {canvaTemplates.map((tmpl, i) => {
                      const isSelected = selectedTemplate === tmpl.id
                      return (
                        <button
                          key={tmpl.id}
                          onClick={() => setSelectedTemplate(tmpl.id)}
                          className={`relative rounded-xl border overflow-hidden transition-all ${
                            isSelected
                              ? 'border-cyan-400/60 ring-1 ring-cyan-400/30'
                              : 'border-white/[0.06] hover:border-white/[0.15]'
                          }`}
                        >
                          <div className={`w-full aspect-square bg-gradient-to-br ${templateGradients[i % templateGradients.length]}`} />
                          {isSelected && (
                            <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-cyan-400 flex items-center justify-center">
                              <Check size={11} className="text-slate-900" />
                            </div>
                          )}
                          <div className="px-2 py-1.5 bg-white/[0.03]">
                            <p className="text-[0.62rem] text-slate-400 truncate">{tmpl.name}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}

                {designMode === 'TEMPLATE' && (
                  <div className="space-y-2 mt-1">
                    <label className="text-[0.75rem] font-medium text-slate-400 uppercase tracking-wide flex items-center gap-2">
                      <Upload size={13} className="text-slate-500" />
                      Additional Image
                      <span className="normal-case tracking-normal font-normal text-slate-600">(optional)</span>
                    </label>
                    {speakerImage ? (
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-cyan-400/20">
                        <img src={speakerImage.preview} alt="Additional" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[0.8rem] text-slate-200 truncate">{speakerImage.name}</div>
                          <div className="text-[0.68rem] text-slate-500 mt-0.5">Will be placed into the template image slot</div>
                        </div>
                        <button onClick={() => setSpeakerImage(null)} className="text-slate-500 hover:text-slate-300 transition-colors">
                          <X size={15} />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center gap-2 p-5 rounded-xl border border-dashed border-white/[0.12] hover:border-cyan-400/30 hover:bg-cyan-400/[0.02] transition-all cursor-pointer group">
                        <Upload size={18} className="text-slate-600 group-hover:text-cyan-400 transition-colors" />
                        <div className="text-center">
                          <div className="text-[0.8rem] text-slate-400 group-hover:text-slate-300 transition-colors">Click to upload an image</div>
                          <div className="text-[0.68rem] text-slate-600 mt-0.5">PNG, JPG up to 10MB — placed into the template image slot</div>
                        </div>
                        <input type="file" accept="image/*" className="hidden" onChange={e => {
                          const file = e.target.files?.[0]
                          if (file) setSpeakerImage({ name: file.name, preview: URL.createObjectURL(file) })
                        }} />
                      </label>
                    )}
                  </div>
                )}

                {designMode === 'GENERATE' && (
                  <div className="space-y-3 mt-1">
                    <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-violet-400/[0.06] border border-violet-400/20">
                      <Zap size={14} className="text-violet-400 flex-shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-[0.75rem] text-slate-400 leading-relaxed">
                          OpenAI GPT orchestrates the full design — it calls Canva MCP tools to assemble every element using your brand kit.
                        </p>
                        <p className="text-[0.72rem] text-slate-500 leading-relaxed">
                          The orchestrator decides whether to generate a background image (via gpt-image-2) or use an existing brand asset — no image model selection needed.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[0.75rem] font-medium text-slate-400 uppercase tracking-wide flex items-center gap-2">
                        <Upload size={13} className="text-slate-500" />
                        Reference Images
                        <span className="normal-case tracking-normal font-normal text-slate-600">(optional)</span>
                      </label>
                      <p className="text-[0.68rem] text-slate-600">Speaker photos, product shots, event graphics — the AI decides how to use them in the design.</p>
                      {referenceImages.length > 0 && (
                        <div className="space-y-2">
                          {referenceImages.map((img, i) => (
                            <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] border border-violet-400/20">
                              <img src={img.preview} alt={img.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="text-[0.78rem] text-slate-200 truncate">{img.name}</div>
                              </div>
                              <button onClick={() => setReferenceImages(prev => prev.filter((_, j) => j !== i))} className="text-slate-600 hover:text-slate-400 transition-colors">
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <label className="flex items-center gap-2.5 p-3 rounded-xl border border-dashed border-white/[0.10] hover:border-violet-400/30 hover:bg-violet-400/[0.02] transition-all cursor-pointer group">
                        <Upload size={15} className="text-slate-600 group-hover:text-violet-400 transition-colors flex-shrink-0" />
                        <span className="text-[0.78rem] text-slate-500 group-hover:text-slate-400 transition-colors">
                          {referenceImages.length > 0 ? 'Add another image' : 'Click to upload reference images'}
                        </span>
                        <input type="file" accept="image/*" multiple className="hidden" onChange={e => {
                          const files = Array.from(e.target.files ?? [])
                          setReferenceImages(prev => [...prev, ...files.map(f => ({ name: f.name, preview: URL.createObjectURL(f) }))])
                          e.target.value = ''
                        }} />
                      </label>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[0.75rem] font-medium text-slate-400 uppercase tracking-wide">Copy model</label>
                  <select
                    value={copyProviderId}
                    onChange={e => setCopyProviderId(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2.5 text-[0.82rem] text-slate-200 outline-none focus:border-cyan-400/50 focus:bg-cyan-400/[0.03] transition-all appearance-none cursor-pointer"
                  >
                    {enabledCopyProviders.map(p => (
                      <option key={p.id} value={p.id} className="bg-[#111827]">
                        {p.label}{p.isDefault ? ' (default)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                {designMode === 'TEMPLATE' ? (
                  <div className="space-y-1.5">
                    <label className="text-[0.75rem] font-medium text-slate-400 uppercase tracking-wide">Image model</label>
                    <select
                      value={imageProviderId}
                      onChange={e => setImageProviderId(e.target.value)}
                      className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2.5 text-[0.82rem] text-slate-200 outline-none focus:border-cyan-400/50 focus:bg-cyan-400/[0.03] transition-all appearance-none cursor-pointer"
                    >
                      {enabledImageProviders.map(p => (
                        <option key={p.id} value={p.id} className="bg-[#111827]">
                          {p.label}{p.isDefault ? ' (default)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-[0.75rem] font-medium text-slate-400 uppercase tracking-wide">Image model</label>
                    <div className="w-full bg-white/[0.02] border border-white/[0.04] rounded-xl px-3 py-2.5 text-[0.82rem] text-slate-600 flex items-center gap-2 cursor-not-allowed">
                      <Zap size={13} className="text-violet-400/60 flex-shrink-0" />
                      GPT orchestrator decides
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-slate-400 text-[0.82rem] font-medium hover:bg-white/[0.06] hover:text-slate-300 transition-all"
                >
                  <ChevronLeft size={14} />
                  Back
                </button>
                <button
                  onClick={() => setCurrentStep(3)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-400/10 border border-cyan-400/30 text-cyan-400 text-[0.85rem] font-medium hover:bg-cyan-400/20 hover:border-cyan-400/50 transition-all"
                >
                  Next
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="glass rounded-2xl border border-white/[0.08] p-5 md:p-6 space-y-5">
              <div>
                <h2 className="text-[1rem] font-semibold text-slate-200 mb-0.5">Review your brief</h2>
                <p className="text-[0.78rem] text-slate-500">Everything looks good? Hit generate to create your post.</p>
              </div>

              <div className="space-y-0">
                {[
                  {
                    label: 'Campaign',
                    value: selectedCampaign?.name ?? 'No campaign',
                    muted: !selectedCampaign,
                  },
                  { label: 'Topic', value: topic || '—', muted: !topic },
                  { label: 'Description', value: description || '—', muted: !description },
                  { label: 'Goal / CTA', value: goal || '—', muted: !goal },
                  { label: 'Tone', value: tone, muted: false },
                ].map(row => (
                  <div key={row.label} className="flex gap-3 py-2.5 border-b border-white/[0.05]">
                    <span className="w-28 flex-shrink-0 text-[0.72rem] text-slate-600 font-medium uppercase tracking-wide pt-px">
                      {row.label}
                    </span>
                    <span className={`text-[0.82rem] leading-snug ${row.muted ? 'text-slate-600 italic' : 'text-slate-200'}`}>
                      {row.value}
                    </span>
                  </div>
                ))}

                <div className="flex gap-3 py-2.5 border-b border-white/[0.05]">
                  <span className="w-28 flex-shrink-0 text-[0.72rem] text-slate-600 font-medium uppercase tracking-wide pt-px">
                    Channels
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {channels.map(ch => (
                      <span key={ch} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-400/10 border border-cyan-400/20 text-[0.72rem] text-cyan-400 font-medium">
                        {ch === 'INSTAGRAM' ? <Instagram size={11} /> : <Linkedin size={11} />}
                        {ch === 'INSTAGRAM' ? 'Instagram' : 'LinkedIn'}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 py-2.5 border-b border-white/[0.05]">
                  <span className="w-28 flex-shrink-0 text-[0.72rem] text-slate-600 font-medium uppercase tracking-wide pt-px">
                    Design
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[0.82rem] text-slate-200">
                      {designMode === 'TEMPLATE' ? 'Template' : 'AI Generated'}
                    </span>
                    {designMode === 'TEMPLATE' && activeTemplate && (
                      <span className="text-[0.72rem] text-slate-500">{activeTemplate.name}</span>
                    )}
                  </div>
                </div>

                {designMode === 'TEMPLATE' && (
                  <div className="flex gap-3 py-2.5 border-b border-white/[0.05]">
                    <span className="w-28 flex-shrink-0 text-[0.72rem] text-slate-600 font-medium uppercase tracking-wide pt-px">
                      Add. Image
                    </span>
                    {speakerImage ? (
                      <div className="flex items-center gap-2">
                        <img src={speakerImage.preview} alt="Additional" className="w-7 h-7 rounded object-cover" />
                        <span className="text-[0.82rem] text-slate-200 truncate max-w-[180px]">{speakerImage.name}</span>
                      </div>
                    ) : (
                      <span className="text-[0.82rem] text-slate-600 italic">None — template slot left empty</span>
                    )}
                  </div>
                )}
                {designMode === 'GENERATE' && (
                  <div className="flex gap-3 py-2.5 border-b border-white/[0.05]">
                    <span className="w-28 flex-shrink-0 text-[0.72rem] text-slate-600 font-medium uppercase tracking-wide pt-px">
                      Ref. Images
                    </span>
                    {referenceImages.length > 0 ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {referenceImages.map((img, i) => (
                          <img key={i} src={img.preview} alt={img.name} className="w-7 h-7 rounded object-cover" title={img.name} />
                        ))}
                        <span className="text-[0.72rem] text-slate-500 ml-1">{referenceImages.length} image{referenceImages.length > 1 ? 's' : ''} — AI decides how to use them</span>
                      </div>
                    ) : (
                      <span className="text-[0.82rem] text-slate-600 italic">None — AI works from brief only</span>
                    )}
                  </div>
                )}

                <div className="flex gap-3 py-2.5 border-b border-white/[0.05]">
                  <span className="w-28 flex-shrink-0 text-[0.72rem] text-slate-600 font-medium uppercase tracking-wide pt-px">
                    Copy AI
                  </span>
                  <span className="text-[0.82rem] text-slate-200">{activeCopyProvider?.label ?? '—'}</span>
                </div>

                <div className="flex gap-3 py-2.5">
                  <span className="w-28 flex-shrink-0 text-[0.72rem] text-slate-600 font-medium uppercase tracking-wide pt-px">
                    Image AI
                  </span>
                  {designMode === 'TEMPLATE' ? (
                    <span className="text-[0.82rem] text-slate-200">{activeImageProvider?.label ?? '—'}</span>
                  ) : (
                    <span className="text-[0.82rem] text-slate-500 italic">GPT orchestrator decides (gpt-image-2 or brand asset)</span>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setCurrentStep(2)}
                  disabled={generating}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-slate-400 text-[0.82rem] font-medium hover:bg-white/[0.06] hover:text-slate-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={14} />
                  Back
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-400 text-slate-900 text-[0.85rem] font-semibold hover:from-cyan-400 hover:to-cyan-300 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20"
                >
                  {generating ? (
                    <>
                      <Sparkles size={15} className="animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles size={15} />
                      Generate Post
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  )
}

