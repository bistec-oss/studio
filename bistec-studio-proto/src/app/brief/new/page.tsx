'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Instagram, Linkedin, Upload, X, Image as ImageIcon, Link as LinkIcon, ChevronRight, ChevronLeft, Sparkles, FileText } from 'lucide-react'
import Header from '@/components/Header'
import { brandKits, brandKitTemplates, campaigns, projects, getCampaignBrandKit, getBrandKitSource } from '@/data/mock'
import type { Platform, PathType, ImageIntent } from '@/data/mock'

type UploadedImage = {
  id: string
  filename: string
  intent: ImageIntent
}

type WizardState = {
  platform: Platform
  pathType: PathType
  campaignId: string
  copyPrompt: string
  templateId: string
  referenceTemplateId: string
  images: UploadedImage[]
}

const steps = ['Platform & Path', 'Campaign', 'Content', 'Images', 'Review']

export default function NewBriefPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [state, setState] = useState<WizardState>({
    platform: 'instagram',
    pathType: 'A',
    campaignId: '',
    copyPrompt: '',
    templateId: '',
    referenceTemplateId: '',
    images: [],
  })
  const [submitting, setSubmitting] = useState(false)

  const update = (patch: Partial<WizardState>) => setState(s => ({ ...s, ...patch }))

  const kitForPlatform = brandKitTemplates.filter(t => t.platform === state.platform)

  function addImage() {
    const id = `img-${Date.now()}`
    update({ images: [...state.images, { id, filename: `image-${state.images.length + 1}.jpg`, intent: 'embed' }] })
  }

  function removeImage(id: string) {
    update({ images: state.images.filter(img => img.id !== id) })
  }

  function toggleIntent(id: string) {
    update({
      images: state.images.map(img =>
        img.id === id ? { ...img, intent: img.intent === 'embed' ? 'reference' : 'embed' } : img
      )
    })
  }

  async function handleSubmit() {
    setSubmitting(true)
    await new Promise(r => setTimeout(r, 1200))
    router.push('/library')
  }

  const canNext = [
    true,
    true, // campaignId '' = Uncategorized is valid
    state.copyPrompt.trim().length > 10,
    true,
    true,
  ]

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <Header breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'New Brief' }]} />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-2xl mx-auto">
          {/* Stepper */}
          <div className="flex items-center gap-1 mb-8">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center gap-1 flex-1">
                <button
                  onClick={() => i < step && setStep(i)}
                  className={`flex items-center gap-1.5 text-[0.72rem] font-semibold transition-colors ${
                    i === step ? 'text-blue-700' : i < step ? 'text-blue-500 cursor-pointer' : 'text-slate-400'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[0.6rem] flex-shrink-0 ${
                    i < step ? 'bg-blue-600 text-white' : i === step ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'
                  }`}>{i < step ? '✓' : i + 1}</span>
                  <span className="hidden sm:inline">{s}</span>
                </button>
                {i < steps.length - 1 && <div className={`flex-1 h-px mx-1 ${i < step ? 'bg-blue-400' : 'bg-slate-200'}`} />}
              </div>
            ))}
          </div>

          <div className="glass rounded-xl p-6">
            {/* Step 0: Platform & Path */}
            {step === 0 && (
              <div>
                <h2 className="text-[1rem] font-bold text-slate-800 mb-1">Platform & Generation Path</h2>
                <p className="text-[0.78rem] text-slate-500 mb-6">Choose where this post will be published and how Claude generates it.</p>

                <div className="mb-6">
                  <label className="text-[0.72rem] font-bold tracking-widest uppercase text-slate-500 mb-2 block">Platform</label>
                  <div className="grid grid-cols-2 gap-3">
                    {(['instagram', 'linkedin'] as Platform[]).map(p => {
                      const Icon = p === 'instagram' ? Instagram : Linkedin
                      return (
                        <button
                          key={p}
                          onClick={() => update({ platform: p, templateId: '', referenceTemplateId: '' })}
                          className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                            state.platform === p
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <Icon size={20} />
                          <span className="font-semibold capitalize text-[0.88rem]">{p}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-[0.72rem] font-bold tracking-widest uppercase text-slate-500 mb-2 block">Generation Path</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={() => update({ pathType: 'A', referenceTemplateId: '' })}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        state.pathType === 'A'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`text-[0.82rem] font-bold mb-1 ${state.pathType === 'A' ? 'text-blue-700' : 'text-slate-700'}`}>Path A — Template</div>
                      <div className="text-[0.72rem] text-slate-500">Claude fills a pre-built HTML/CSS brand template. Consistent, on-brand output.</div>
                    </button>
                    <button
                      onClick={() => update({ pathType: 'B', templateId: '' })}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        state.pathType === 'B'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`text-[0.82rem] font-bold mb-1 ${state.pathType === 'B' ? 'text-blue-700' : 'text-slate-700'}`}>Path B — Freeform</div>
                      <div className="text-[0.72rem] text-slate-500">Claude designs a new HTML/CSS layout from scratch. Maximum creative flexibility.</div>
                    </button>
                  </div>
                </div>

                {/* Template picker for Path A */}
                {state.pathType === 'A' && (
                  <div className="mt-5">
                    <label className="text-[0.72rem] font-bold tracking-widest uppercase text-slate-500 mb-2 block">Template</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {kitForPlatform.map(t => {
                        const kit = brandKits.find(k => k.id === t.brandKitId)
                        return (
                          <button
                            key={t.id}
                            onClick={() => update({ templateId: t.id })}
                            className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                              state.templateId === t.id
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <div className="w-8 h-8 rounded-lg flex-shrink-0" style={{ background: t.previewColor }} />
                            <div>
                              <div className="text-[0.78rem] font-semibold text-slate-700">{t.name}</div>
                              <div className="text-[0.65rem] text-slate-400">{kit?.name}</div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Reference template picker for Path B */}
                {state.pathType === 'B' && (
                  <div className="mt-5">
                    <label className="text-[0.72rem] font-bold tracking-widest uppercase text-slate-500 mb-1 block">Style Reference Template <span className="normal-case font-normal text-slate-400">(optional)</span></label>
                    <p className="text-[0.7rem] text-slate-400 mb-2">Claude uses this for visual inspiration only — it won&apos;t copy the layout exactly.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        onClick={() => update({ referenceTemplateId: '' })}
                        className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                          state.referenceTemplateId === ''
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                          <Sparkles size={14} className="text-slate-400" />
                        </div>
                        <div className="text-[0.78rem] font-semibold text-slate-600">No reference</div>
                      </button>
                      {kitForPlatform.map(t => {
                        const kit = brandKits.find(k => k.id === t.brandKitId)
                        return (
                          <button
                            key={t.id}
                            onClick={() => update({ referenceTemplateId: t.id })}
                            className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                              state.referenceTemplateId === t.id
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <div className="w-8 h-8 rounded-lg flex-shrink-0" style={{ background: t.previewColor }} />
                            <div>
                              <div className="text-[0.78rem] font-semibold text-slate-700">{t.name}</div>
                              <div className="text-[0.65rem] text-slate-400">{kit?.name}</div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 1: Campaign */}
            {step === 1 && (
              <div>
                <h2 className="text-[1rem] font-bold text-slate-800 mb-1">Select Campaign</h2>
                <p className="text-[0.78rem] text-slate-500 mb-5">
                  Group this post under a campaign. Brand kit and tone are auto-populated from the campaign or its parent project.
                </p>

                {/* Selected campaign — brand kit preview */}
                {state.campaignId && (() => {
                  const selectedCampaign = campaigns.find(c => c.id === state.campaignId)
                  if (!selectedCampaign) return null
                  const kit = getCampaignBrandKit(selectedCampaign)
                  const kitSource = getBrandKitSource(selectedCampaign)
                  const srcLabel = { campaign: 'Campaign override', project: 'Inherited from project', default: 'System default' }
                  const srcColor = { campaign: 'text-blue-600 bg-blue-50 ring-1 ring-blue-200/60', project: 'text-violet-600 bg-violet-50 ring-1 ring-violet-200/60', default: 'text-slate-500 bg-slate-50 ring-1 ring-slate-200/60' }
                  return (
                    <div className="flex items-center gap-2.5 mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                      <div className="flex gap-1">
                        {[kit.primaryColor, kit.secondaryColor, kit.accentColor].map((color, i) => (
                          <span key={i} className="w-4 h-4 rounded-full border border-white shadow-sm" style={{ background: color }} />
                        ))}
                      </div>
                      <span className="text-[0.78rem] font-semibold text-emerald-800">{kit.name}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[0.62rem] font-semibold ${srcColor[kitSource]}`}>
                        {srcLabel[kitSource]}
                      </span>
                      <span className="text-[0.72rem] text-emerald-600 ml-auto">Auto-populated</span>
                    </div>
                  )
                })()}

                <div className="space-y-1.5">
                  {/* Uncategorized option */}
                  <button
                    onClick={() => update({ campaignId: '' })}
                    className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all ${
                      state.campaignId === ''
                        ? 'border-amber-400 bg-amber-50'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className="w-3 h-3 rounded border-2 border-dashed border-slate-400 flex-shrink-0" />
                    <div className="flex-1">
                      <div className={`text-[0.85rem] font-semibold ${state.campaignId === '' ? 'text-amber-700' : 'text-slate-600'}`}>No campaign (Uncategorized)</div>
                      <div className="text-[0.7rem] text-slate-400">Post will use the system default brand kit. Can be assigned later.</div>
                    </div>
                    {state.campaignId === '' && <span className="text-amber-600 text-[0.72rem] font-bold">Selected</span>}
                  </button>

                  {/* Campaigns grouped by project */}
                  {projects.map(project => {
                    const projectCampaigns = campaigns.filter(c => c.projectIds.includes(project.id))
                    if (projectCampaigns.length === 0) return null
                    return (
                      <div key={project.id}>
                        <div className="px-1 pt-3 pb-1 text-[0.62rem] font-bold uppercase tracking-widest text-slate-400">{project.name}</div>
                        {projectCampaigns.map(c => (
                          <button
                            key={c.id}
                            onClick={() => update({ campaignId: c.id })}
                            className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all mb-1.5 ${
                              state.campaignId === c.id
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              c.status === 'active' ? 'bg-emerald-500' : c.status === 'draft' ? 'bg-amber-500' : 'bg-slate-400'
                            }`} />
                            <div className="flex-1 min-w-0">
                              <div className={`text-[0.85rem] font-semibold truncate ${state.campaignId === c.id ? 'text-blue-700' : 'text-slate-700'}`}>{c.name}</div>
                              <div className="text-[0.7rem] text-slate-400">{c.postCount} posts · {c.status}</div>
                            </div>
                            {state.campaignId === c.id && <span className="text-blue-600 text-[0.72rem] font-bold flex-shrink-0">Selected</span>}
                          </button>
                        ))}
                      </div>
                    )
                  })}

                  {/* Standalone campaigns */}
                  {campaigns.filter(c => c.projectIds.length === 0).length > 0 && (
                    <div>
                      <div className="px-1 pt-3 pb-1 text-[0.62rem] font-bold uppercase tracking-widest text-slate-400">Standalone</div>
                      {campaigns.filter(c => c.projectIds.length === 0).map(c => (
                        <button
                          key={c.id}
                          onClick={() => update({ campaignId: c.id })}
                          className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all mb-1.5 ${
                            state.campaignId === c.id
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className="w-2 h-2 rounded-full flex-shrink-0 bg-slate-400" />
                          <div className="flex-1 min-w-0">
                            <div className={`text-[0.85rem] font-semibold truncate ${state.campaignId === c.id ? 'text-blue-700' : 'text-slate-700'}`}>{c.name}</div>
                            <div className="text-[0.7rem] text-slate-400">{c.postCount} posts · {c.status}</div>
                          </div>
                          {state.campaignId === c.id && <span className="text-blue-600 text-[0.72rem] font-bold flex-shrink-0">Selected</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 2: Content */}
            {step === 2 && (
              <div>
                <h2 className="text-[1rem] font-bold text-slate-800 mb-1">Brief & Copy Direction</h2>
                <p className="text-[0.78rem] text-slate-500 mb-6">Tell Claude what this post is about and the tone you want.</p>
                <textarea
                  value={state.copyPrompt}
                  onChange={e => update({ copyPrompt: e.target.value })}
                  placeholder="e.g. Announce our Q3 product launch — bistec-studio — with excitement. Highlight that it saves the marketing team hours on post creation. Professional but energetic tone. Include a CTA to try it."
                  rows={6}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[0.85rem] text-slate-700 placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none transition-all"
                />
                <div className="mt-2 text-right text-[0.65rem] text-slate-400">{state.copyPrompt.length} chars</div>
              </div>
            )}

            {/* Step 3: Images */}
            {step === 3 && (
              <div>
                <h2 className="text-[1rem] font-bold text-slate-800 mb-1">Images <span className="font-normal text-slate-400 text-[0.85rem]">(optional)</span></h2>
                <p className="text-[0.78rem] text-slate-500 mb-6">
                  Attach images for Claude to use. Choose how each one is used: embed it directly in the design, or use it as style inspiration only.
                </p>

                <div className="space-y-2 mb-4">
                  {state.images.map(img => (
                    <div key={img.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50">
                      <div className="w-9 h-9 rounded-lg bg-slate-200 flex items-center justify-center flex-shrink-0">
                        <ImageIcon size={15} className="text-slate-400" />
                      </div>
                      <span className="text-[0.8rem] text-slate-600 flex-1 truncate">{img.filename}</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => toggleIntent(img.id)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[0.68rem] font-semibold transition-all ${
                            img.intent === 'embed'
                              ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-200'
                              : 'bg-violet-100 text-violet-700 ring-1 ring-violet-200'
                          }`}
                        >
                          {img.intent === 'embed' ? <><ImageIcon size={10} /> Embed</> : <><LinkIcon size={10} /> Style ref</>}
                        </button>
                        <button onClick={() => removeImage(img.id)} className="p-1 text-slate-400 hover:text-red-500 transition-colors ml-1">
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={addImage}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all w-full justify-center text-[0.82rem] font-medium"
                >
                  <Upload size={15} />
                  Add image
                </button>

                {state.images.length > 0 && (
                  <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <p className="text-[0.72rem] text-amber-700">
                      <strong>Embed</strong> — Claude places this image directly in the design.<br />
                      <strong>Style reference</strong> — Claude uses it for visual inspiration only, won&apos;t embed it.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Review */}
            {step === 4 && (
              <div>
                <h2 className="text-[1rem] font-bold text-slate-800 mb-1">Review & Generate</h2>
                <p className="text-[0.78rem] text-slate-500 mb-5">Check your brief before sending to Claude.</p>

                <div className="space-y-3">
                  {[
                    { label: 'Platform', value: state.platform },
                    { label: 'Path', value: `Path ${state.pathType} — ${state.pathType === 'A' ? 'Template fill' : 'Freeform design'}` },
                    { label: 'Campaign', value: state.campaignId ? campaigns.find(c => c.id === state.campaignId)?.name ?? '—' : 'Uncategorized' },
                    { label: 'Template', value: state.templateId ? brandKitTemplates.find(t => t.id === state.templateId)?.name : state.referenceTemplateId ? `Style ref: ${brandKitTemplates.find(t => t.id === state.referenceTemplateId)?.name}` : 'None' },
                    { label: 'Images', value: state.images.length > 0 ? `${state.images.length} image${state.images.length > 1 ? 's' : ''} (${state.images.filter(i => i.intent === 'embed').length} embed, ${state.images.filter(i => i.intent === 'reference').length} reference)` : 'None' },
                  ].map(row => (
                    <div key={row.label} className="flex items-start gap-4 py-2 border-b border-slate-100">
                      <span className="text-[0.72rem] font-bold tracking-wider uppercase text-slate-400 w-24 flex-shrink-0 pt-0.5">{row.label}</span>
                      <span className="text-[0.82rem] text-slate-700 capitalize">{row.value}</span>
                    </div>
                  ))}
                  <div className="flex items-start gap-4 py-2">
                    <span className="text-[0.72rem] font-bold tracking-wider uppercase text-slate-400 w-24 flex-shrink-0 pt-0.5">Prompt</span>
                    <span className="text-[0.82rem] text-slate-600 leading-relaxed">{state.copyPrompt || '—'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-8 pt-5 border-t border-slate-100">
              <button
                onClick={() => setStep(s => s - 1)}
                disabled={step === 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[0.82rem] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft size={15} /> Back
              </button>
              {step < steps.length - 1 ? (
                <button
                  onClick={() => setStep(s => s + 1)}
                  disabled={!canNext[step]}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[0.82rem] font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Continue <ChevronRight size={15} />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[0.82rem] font-semibold disabled:opacity-60 transition-all"
                >
                  {submitting ? (
                    <><span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" /></>
                  ) : (
                    <><Sparkles size={14} /> Generate Post</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
