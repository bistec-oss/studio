'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Instagram,
  Linkedin,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Upload,
  X,
  Image as ImageIcon,
  Link as LinkIcon,
  Layers,
  Loader2,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Select } from '@/components/ui/Select'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Channel = 'instagram' | 'linkedin'
type DesignMode = 'TEMPLATE' | 'GENERATE'
type ImageIntent = 'embed' | 'reference'

interface ProjectRef {
  id: string
  name: string
}

interface Campaign {
  id: string
  name: string
  defaultTone: string | null
  brandKit: { id: string; name: string } | null
  projects: { project: ProjectRef }[]
  _count?: { briefs: number }
}

interface Project {
  id: string
  name: string
}

interface Template {
  id: string
  name: string
  brandKitId: string
  brandKitName: string | null
  previewColor: string
}

interface ResolvedKit {
  id: string
  name: string
  source: string // 'campaign' | 'project' | 'system'
}

interface Provider {
  providerKey: string
  label: string
  isDefault: boolean
}

interface UploadedImage {
  id: string
  url: string
  filename: string
  intent: ImageIntent
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = ['Platform & Path', 'Campaign', 'Content', 'Images', 'Review']

const GOAL_OPTIONS = [
  { value: 'awareness', label: 'Awareness' },
  { value: 'engagement', label: 'Engagement' },
  { value: 'conversion', label: 'Conversion' },
  { value: 'hiring', label: 'Hiring' },
  { value: 'announcement', label: 'Announcement' },
]

const TONE_OPTIONS = [
  { value: 'professional', label: 'Professional' },
  { value: 'casual', label: 'Casual' },
  { value: 'bold', label: 'Bold' },
  { value: 'empathetic', label: 'Empathetic' },
]

const SOURCE_LABEL: Record<string, string> = {
  campaign: 'Campaign override',
  project: 'Inherited from project',
  system: 'System default',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? body.error ?? res.statusText)
  }
  return res.status === 204 ? (null as T) : res.json()
}

// Shared card-button styling (selected vs idle), used across the picker steps.
function cardCls(selected: boolean, extra = '') {
  return [
    'rounded-xl border text-left transition-all duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:focus-visible:ring-primary-light/50',
    selected
      ? 'bg-primary/10 dark:bg-primary-light/15 border-primary/40 dark:border-primary-light/40 shadow-sm'
      : 'glass-input border-transparent hover:border-primary/20 dark:hover:border-primary-light/20',
    extra,
  ].join(' ')
}

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

function Stepper({ step, onJump }: { step: number; onJump: (i: number) => void }) {
  return (
    <div className="flex items-center gap-1 mb-8">
      {STEPS.map((label, i) => {
        const done = i < step
        const active = i === step
        return (
          <React.Fragment key={label}>
            <button
              type="button"
              onClick={() => done && onJump(i)}
              className={[
                'flex items-center gap-1.5 text-xs font-semibold transition-colors',
                active
                  ? 'text-primary dark:text-primary-light'
                  : done
                    ? 'text-primary/70 dark:text-primary-light/70 cursor-pointer'
                    : 'text-light-text-muted dark:text-dark-text-muted',
              ].join(' ')}
            >
              <span
                className={[
                  'w-5 h-5 rounded-full flex items-center justify-center text-[0.6rem] flex-shrink-0 border',
                  active || done
                    ? 'bg-primary/15 dark:bg-primary-light/20 text-primary dark:text-primary-light border-primary/30 dark:border-primary-light/30'
                    : 'bg-white/30 dark:bg-white/5 text-light-text-muted dark:text-dark-text-muted border-white/40 dark:border-white/10',
                ].join(' ')}
              >
                {done ? <Check size={11} /> : i + 1}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div
                className={[
                  'flex-1 h-px mx-1',
                  done ? 'bg-primary/30 dark:bg-primary-light/30' : 'bg-white/30 dark:bg-white/10',
                ].join(' ')}
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs font-bold tracking-widest uppercase text-light-text-muted dark:text-dark-text-muted mb-2 block">
      {children}
    </label>
  )
}

function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: Template
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button type="button" onClick={onSelect} className={cardCls(selected, 'flex items-center gap-3 p-3')}>
      <span
        className="w-8 h-8 rounded-lg flex-shrink-0 border border-black/5 dark:border-white/10"
        style={{ background: template.previewColor }}
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-light-text dark:text-dark-text truncate">
          {template.name}
        </span>
        <span className="block text-xs text-light-text-muted dark:text-dark-text-muted truncate">
          {template.brandKitName}
        </span>
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewBriefPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 0 — Platform & Path
  const [channels, setChannels] = useState<Channel[]>(['instagram'])
  const [designMode, setDesignMode] = useState<DesignMode>('TEMPLATE')
  const [templateId, setTemplateId] = useState('')
  const [referenceTemplateId, setReferenceTemplateId] = useState('')
  const [templates, setTemplates] = useState<Template[]>([])

  // Step 1 — Campaign
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [campaignId, setCampaignId] = useState('')
  const [resolvedKit, setResolvedKit] = useState<ResolvedKit | null>(null)
  const [kitLoading, setKitLoading] = useState(false)

  // Step 2 — Content
  const [prompt, setPrompt] = useState('')
  const [goal, setGoal] = useState('awareness')
  const [tone, setTone] = useState('professional')

  // Step 3 — Images
  const [images, setImages] = useState<UploadedImage[]>([])
  const [uploading, setUploading] = useState(false)

  // Providers (auto-resolved behind the scenes — no wizard step in the proto)
  const [copyProviderKey, setCopyProviderKey] = useState('')
  const [imageProviderKey, setImageProviderKey] = useState('')
  const [providersLoaded, setProvidersLoaded] = useState(false)

  // ── Initial loads ──────────────────────────────────────────────────────
  useEffect(() => {
    apiFetch<Template[]>('/api/templates').then(setTemplates).catch(console.error)
    apiFetch<Campaign[]>('/api/campaigns').then(setCampaigns).catch(console.error)
    apiFetch<Project[]>('/api/projects').then(setProjects).catch(console.error)

    Promise.all([
      apiFetch<Provider[]>('/api/providers/available?slot=COPY').catch(() => [] as Provider[]),
      apiFetch<Provider[]>('/api/providers/available?slot=IMAGE').catch(() => [] as Provider[]),
    ]).then(([copy, image]) => {
      const pickDefault = (list: Provider[]) =>
        list.find(p => p.isDefault)?.providerKey ?? list[0]?.providerKey ?? ''
      setCopyProviderKey(pickDefault(copy))
      setImageProviderKey(pickDefault(image))
      setProvidersLoaded(true)
    })
  }, [])

  // ── Brand kit resolution on campaign change ────────────────────────────
  const resolveKit = useCallback(async (id: string) => {
    if (!id) {
      setResolvedKit(null)
      return
    }
    setKitLoading(true)
    try {
      const { kit, source } = await apiFetch<{ kit: ResolvedKit | null; source: string | null }>(
        `/api/campaigns/${id}/brandkit`,
      )
      setResolvedKit(kit ? { ...kit, source: source ?? 'system' } : null)
    } catch (e) {
      console.error(e)
      setResolvedKit(null)
    } finally {
      setKitLoading(false)
    }
  }, [])

  function selectCampaign(id: string) {
    setCampaignId(id)
    const c = campaigns.find(x => x.id === id)
    // Pre-fill tone from the campaign default when it matches a known option.
    if (c?.defaultTone) {
      const match = TONE_OPTIONS.find(t => c.defaultTone!.toLowerCase().includes(t.value))
      if (match) setTone(match.value)
    }
    resolveKit(id)
  }

  function toggleChannel(c: Channel) {
    setChannels(prev => (prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]))
  }

  // ── Image upload ───────────────────────────────────────────────────────
  async function onFilesPicked(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setError(null)
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append('file', file)
        const { url, filename } = await apiFetch<{ url: string; filename: string }>(
          '/api/briefs/images',
          { method: 'POST', body: fd },
        )
        setImages(prev => [
          ...prev,
          { id: `${Date.now()}-${filename}`, url, filename, intent: 'embed' },
        ])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Image upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function removeImage(id: string) {
    setImages(prev => prev.filter(img => img.id !== id))
  }

  function toggleIntent(id: string) {
    setImages(prev =>
      prev.map(img =>
        img.id === id ? { ...img, intent: img.intent === 'embed' ? 'reference' : 'embed' } : img,
      ),
    )
  }

  // ── Per-step validation ────────────────────────────────────────────────
  function stepValid(s: number): boolean {
    if (s === 0) return channels.length > 0 && (designMode === 'GENERATE' || templateId !== '')
    if (s === 1) return true // Uncategorized is valid
    if (s === 2) return prompt.trim().length > 10
    if (s === 3) return !uploading
    return true
  }

  // ── Submit: create brief → generate → open draft ───────────────────────
  async function handleGenerate() {
    setError(null)
    if (!copyProviderKey) {
      setError('No copy provider is configured. Ask an admin to add one in AI Providers.')
      return
    }
    setSubmitting(true)
    try {
      const embedImages = images.filter(i => i.intent === 'embed')
      const briefBody = {
        topic: prompt.trim(),
        goal,
        tone,
        channels,
        designMode,
        campaignId: campaignId || undefined,
        copyProviderKey,
        imageProviderKey: imageProviderKey || undefined,
        briefImages: images.length > 0 ? images.map(({ url, intent, filename }) => ({ url, intent, filename })) : undefined,
        // Path A embeds a single image; pass the first embed image through.
        additionalImageUrl: designMode === 'TEMPLATE' ? embedImages[0]?.url : undefined,
        // Path B uses referenceTemplateId for style inspiration.
        referenceTemplateId: designMode === 'GENERATE' ? referenceTemplateId || undefined : undefined,
      }

      const brief = await apiFetch<{ id: string }>('/api/briefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(briefBody),
      })

      const gen =
        designMode === 'TEMPLATE'
          ? await apiFetch<{ draftId: string }>('/api/generate/assemble-a', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ briefId: brief.id, templateId }),
            })
          : await apiFetch<{ draftId: string }>('/api/generate/assemble-b', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ briefId: brief.id }),
            })

      router.push(`/drafts/${gen.draftId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed')
      setSubmitting(false)
    }
  }

  // ── Derived: campaign grouping ─────────────────────────────────────────
  const projectsWithCampaigns = projects
    .map(p => ({
      project: p,
      campaigns: campaigns.filter(c => c.projects.some(pc => pc.project.id === p.id)),
    }))
    .filter(g => g.campaigns.length > 0)

  const standaloneCampaigns = campaigns.filter(c => c.projects.length === 0)

  const selectedCampaign = campaigns.find(c => c.id === campaignId) ?? null
  const selectedTemplate = templates.find(t => t.id === templateId) ?? null
  const selectedRefTemplate = templates.find(t => t.id === referenceTemplateId) ?? null

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">New Brief</h1>
        <p className="text-sm text-light-text-muted dark:text-dark-text-muted mt-0.5">
          Describe what you want to create and we&apos;ll generate an on-brand social post.
        </p>
      </div>

      <GlassPanel className="p-6">
        <Stepper step={step} onJump={setStep} />

        {/* ============================ Step 0 — Platform & Path ============= */}
        {step === 0 && (
          <div>
            <h2 className="text-base font-bold text-light-text dark:text-dark-text mb-1">
              Platform &amp; Generation Path
            </h2>
            <p className="text-sm text-light-text-muted dark:text-dark-text-muted mb-6">
              Choose where this post will be published and how the design is generated.
            </p>

            {/* Channels (multi-select) */}
            <div className="mb-6">
              <FieldLabel>Platforms</FieldLabel>
              <div className="grid grid-cols-2 gap-3">
                {([
                  ['instagram', 'Instagram', Instagram],
                  ['linkedin', 'LinkedIn', Linkedin],
                ] as [Channel, string, React.ElementType][]).map(([c, label, Icon]) => {
                  const selected = channels.includes(c)
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleChannel(c)}
                      className={cardCls(selected, 'flex items-center gap-3 p-4')}
                    >
                      <Icon size={20} className={selected ? 'text-primary dark:text-primary-light' : 'text-light-text-muted dark:text-dark-text-muted'} />
                      <span className={['font-semibold text-sm', selected ? 'text-primary dark:text-primary-light' : 'text-light-text dark:text-dark-text'].join(' ')}>
                        {label}
                      </span>
                      {selected && <Check size={15} className="ml-auto text-primary dark:text-primary-light" />}
                    </button>
                  )
                })}
              </div>
              {channels.length === 0 && (
                <p className="text-xs text-red-500 dark:text-red-400 mt-2">Select at least one platform.</p>
              )}
            </div>

            {/* Path */}
            <div>
              <FieldLabel>Generation Path</FieldLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setDesignMode('TEMPLATE')
                    setReferenceTemplateId('')
                  }}
                  className={cardCls(designMode === 'TEMPLATE', 'p-4')}
                >
                  <div className={['text-sm font-bold mb-1', designMode === 'TEMPLATE' ? 'text-primary dark:text-primary-light' : 'text-light-text dark:text-dark-text'].join(' ')}>
                    Path A — Template
                  </div>
                  <div className="text-xs text-light-text-muted dark:text-dark-text-muted">
                    Claude fills a pre-built HTML/CSS brand template. Consistent, on-brand output.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDesignMode('GENERATE')
                    setTemplateId('')
                  }}
                  className={cardCls(designMode === 'GENERATE', 'p-4')}
                >
                  <div className={['text-sm font-bold mb-1', designMode === 'GENERATE' ? 'text-primary dark:text-primary-light' : 'text-light-text dark:text-dark-text'].join(' ')}>
                    Path B — Freeform
                  </div>
                  <div className="text-xs text-light-text-muted dark:text-dark-text-muted">
                    Claude designs a new HTML/CSS layout from scratch. Maximum creative flexibility.
                  </div>
                </button>
              </div>
            </div>

            {/* Template picker — Path A */}
            {designMode === 'TEMPLATE' && (
              <div className="mt-5">
                <FieldLabel>Template</FieldLabel>
                {templates.length === 0 ? (
                  <div className="glass-input rounded-xl px-3 py-3 text-sm text-light-text-muted dark:text-dark-text-muted">
                    No templates available. Add one under Admin → Brand Kits, or switch to Path B.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {templates.map(t => (
                      <TemplateCard
                        key={t.id}
                        template={t}
                        selected={templateId === t.id}
                        onSelect={() => setTemplateId(t.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Reference template — Path B (optional) */}
            {designMode === 'GENERATE' && (
              <div className="mt-5">
                <FieldLabel>
                  Style Reference Template <span className="normal-case font-normal text-light-text-muted dark:text-dark-text-muted">(optional)</span>
                </FieldLabel>
                <p className="text-xs text-light-text-muted dark:text-dark-text-muted mb-2">
                  Claude uses this for visual inspiration only — it won&apos;t copy the layout exactly.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReferenceTemplateId('')}
                    className={cardCls(referenceTemplateId === '', 'flex items-center gap-3 p-3')}
                  >
                    <span className="w-8 h-8 rounded-lg bg-white/40 dark:bg-white/10 flex items-center justify-center flex-shrink-0">
                      <Sparkles size={14} className="text-light-text-muted dark:text-dark-text-muted" />
                    </span>
                    <span className="text-sm font-semibold text-light-text dark:text-dark-text">No reference</span>
                  </button>
                  {templates.map(t => (
                    <TemplateCard
                      key={t.id}
                      template={t}
                      selected={referenceTemplateId === t.id}
                      onSelect={() => setReferenceTemplateId(t.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================ Step 1 — Campaign =================== */}
        {step === 1 && (
          <div>
            <h2 className="text-base font-bold text-light-text dark:text-dark-text mb-1">Select Campaign</h2>
            <p className="text-sm text-light-text-muted dark:text-dark-text-muted mb-5">
              Group this post under a campaign. Brand kit and tone are auto-populated from the campaign or its parent project.
            </p>

            {/* Resolved brand-kit banner */}
            {campaignId && (
              <div className="flex items-center gap-2.5 mb-4 p-3 rounded-xl bg-primary/8 dark:bg-primary-light/10 border border-primary/20 dark:border-primary-light/20">
                {kitLoading ? (
                  <span className="text-sm text-light-text-muted dark:text-dark-text-muted flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" /> Resolving brand kit…
                  </span>
                ) : resolvedKit ? (
                  <>
                    <span className="text-sm font-semibold text-primary dark:text-primary-light">{resolvedKit.name}</span>
                    <span className="px-1.5 py-0.5 rounded text-[0.62rem] font-semibold bg-white/50 dark:bg-white/10 text-light-text-muted dark:text-dark-text-muted">
                      {SOURCE_LABEL[resolvedKit.source] ?? resolvedKit.source}
                    </span>
                    <span className="text-xs text-light-text-muted dark:text-dark-text-muted ml-auto">Auto-populated</span>
                  </>
                ) : (
                  <span className="text-sm text-light-text-muted dark:text-dark-text-muted">No brand kit resolved.</span>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              {/* Uncategorized */}
              <button
                type="button"
                onClick={() => {
                  setCampaignId('')
                  setResolvedKit(null)
                }}
                className={cardCls(campaignId === '', 'w-full flex items-center gap-3 p-3.5')}
              >
                <span className="w-3 h-3 rounded border-2 border-dashed border-light-text-muted dark:border-dark-text-muted flex-shrink-0" />
                <span className="flex-1">
                  <span className={['block text-sm font-semibold', campaignId === '' ? 'text-primary dark:text-primary-light' : 'text-light-text dark:text-dark-text'].join(' ')}>
                    No campaign (Uncategorized)
                  </span>
                  <span className="block text-xs text-light-text-muted dark:text-dark-text-muted">
                    Uses the system default brand kit. Can be assigned later.
                  </span>
                </span>
                {campaignId === '' && <Check size={15} className="text-primary dark:text-primary-light flex-shrink-0" />}
              </button>

              {/* Grouped by project */}
              {projectsWithCampaigns.map(({ project, campaigns: pcs }) => (
                <div key={project.id}>
                  <div className="px-1 pt-3 pb-1 text-[0.62rem] font-bold uppercase tracking-widest text-light-text-muted dark:text-dark-text-muted">
                    {project.name}
                  </div>
                  {pcs.map(c => (
                    <CampaignRow
                      key={c.id}
                      campaign={c}
                      selected={campaignId === c.id}
                      onSelect={() => selectCampaign(c.id)}
                    />
                  ))}
                </div>
              ))}

              {/* Standalone */}
              {standaloneCampaigns.length > 0 && (
                <div>
                  <div className="px-1 pt-3 pb-1 text-[0.62rem] font-bold uppercase tracking-widest text-light-text-muted dark:text-dark-text-muted">
                    Standalone
                  </div>
                  {standaloneCampaigns.map(c => (
                    <CampaignRow
                      key={c.id}
                      campaign={c}
                      selected={campaignId === c.id}
                      onSelect={() => selectCampaign(c.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================ Step 2 — Content =================== */}
        {step === 2 && (
          <div>
            <h2 className="text-base font-bold text-light-text dark:text-dark-text mb-1">Brief &amp; Copy Direction</h2>
            <p className="text-sm text-light-text-muted dark:text-dark-text-muted mb-6">
              Tell Claude what this post is about, then pick a goal and tone.
            </p>

            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="e.g. Announce our Q3 product launch with excitement. Highlight that it saves the marketing team hours on post creation. Include a CTA to try it."
              rows={6}
              autoFocus
              className="glass-input w-full rounded-xl px-4 py-3 text-sm text-light-text dark:text-dark-text placeholder:text-light-text-muted dark:placeholder:text-dark-text-muted resize-none focus:outline-none"
            />
            <div className="mt-1.5 mb-5 text-right text-xs text-light-text-muted dark:text-dark-text-muted">
              {prompt.length} chars{prompt.trim().length > 0 && prompt.trim().length <= 10 ? ' — add a little more detail' : ''}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select label="Goal" options={GOAL_OPTIONS} value={goal} onChange={e => setGoal(e.target.value)} />
              <Select label="Tone" options={TONE_OPTIONS} value={tone} onChange={e => setTone(e.target.value)} />
            </div>
          </div>
        )}

        {/* ============================ Step 3 — Images =================== */}
        {step === 3 && (
          <div>
            <h2 className="text-base font-bold text-light-text dark:text-dark-text mb-1">
              Images <span className="font-normal text-light-text-muted dark:text-dark-text-muted text-sm">(optional)</span>
            </h2>
            <p className="text-sm text-light-text-muted dark:text-dark-text-muted mb-6">
              Attach images for Claude to use. Choose how each one is used: embed it directly in the design, or use it as style inspiration only.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => onFilesPicked(e.target.files)}
            />

            <div className="space-y-2 mb-4">
              {images.map(img => (
                <div key={img.id} className="flex items-center gap-3 p-3 rounded-lg glass-input">
                  <span className="w-9 h-9 rounded-lg bg-white/40 dark:bg-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.filename} className="w-full h-full object-cover" />
                  </span>
                  <span className="text-sm text-light-text dark:text-dark-text flex-1 truncate">{img.filename}</span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleIntent(img.id)}
                      className={[
                        'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border',
                        img.intent === 'embed'
                          ? 'bg-primary/10 dark:bg-primary-light/15 text-primary dark:text-primary-light border-primary/20 dark:border-primary-light/20'
                          : 'bg-violet-500/10 text-violet-600 dark:text-violet-300 border-violet-500/20',
                      ].join(' ')}
                    >
                      {img.intent === 'embed' ? <><ImageIcon size={11} /> Embed</> : <><LinkIcon size={11} /> Style ref</>}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeImage(img.id)}
                      className="p-1 text-light-text-muted dark:text-dark-text-muted hover:text-red-500 transition-colors ml-1"
                      aria-label="Remove image"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-white/40 dark:border-white/15 text-light-text-muted dark:text-dark-text-muted hover:border-primary/40 hover:text-primary dark:hover:text-primary-light transition-all w-full justify-center text-sm font-medium disabled:opacity-50"
            >
              {uploading ? <><Loader2 size={15} className="animate-spin" /> Uploading…</> : <><Upload size={15} /> Add image</>}
            </button>

            {images.length > 0 && (
              <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  <strong>Embed</strong> — Claude places this image directly in the design.<br />
                  <strong>Style reference</strong> — Claude uses it for visual inspiration only, won&apos;t embed it.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ============================ Step 4 — Review =================== */}
        {step === 4 && (
          <div>
            <h2 className="text-base font-bold text-light-text dark:text-dark-text mb-1">Review &amp; Generate</h2>
            <p className="text-sm text-light-text-muted dark:text-dark-text-muted mb-5">
              Check your brief before sending it to Claude.
            </p>

            <div className="space-y-0">
              <ReviewRow label="Platforms" value={channels.map(c => (c === 'instagram' ? 'Instagram' : 'LinkedIn')).join(', ') || '—'} />
              <ReviewRow label="Path" value={`Path ${designMode === 'TEMPLATE' ? 'A — Template fill' : 'B — Freeform design'}`} />
              <ReviewRow
                label="Template"
                value={
                  designMode === 'TEMPLATE'
                    ? selectedTemplate?.name ?? 'None'
                    : selectedRefTemplate
                      ? `Style ref: ${selectedRefTemplate.name}`
                      : 'None'
                }
              />
              <ReviewRow label="Campaign" value={selectedCampaign?.name ?? 'Uncategorized'} />
              {resolvedKit && <ReviewRow label="Brand kit" value={`${resolvedKit.name} (${SOURCE_LABEL[resolvedKit.source] ?? resolvedKit.source})`} />}
              <ReviewRow label="Goal" value={goal} />
              <ReviewRow label="Tone" value={tone} />
              <ReviewRow
                label="Images"
                value={
                  images.length > 0
                    ? `${images.length} image${images.length > 1 ? 's' : ''} (${images.filter(i => i.intent === 'embed').length} embed, ${images.filter(i => i.intent === 'reference').length} reference)`
                    : 'None'
                }
              />
              <div className="flex items-start gap-4 py-2.5">
                <span className="text-xs font-bold tracking-wider uppercase text-light-text-muted dark:text-dark-text-muted w-24 flex-shrink-0 pt-0.5">Prompt</span>
                <span className="text-sm text-light-text dark:text-dark-text leading-relaxed">{prompt || '—'}</span>
              </div>
            </div>

            {providersLoaded && !copyProviderKey && (
              <div className="mt-4 rounded-xl px-4 py-3 text-sm text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20">
                No copy provider is configured. An admin must add one in AI Providers before generating.
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-xl px-4 py-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40">
                {error}
              </div>
            )}

            {submitting && (
              <div className="mt-4 rounded-xl px-4 py-3 text-sm text-primary dark:text-primary-light bg-primary/8 dark:bg-primary-light/10 border border-primary/20 dark:border-primary-light/20 flex items-center gap-2">
                <Loader2 size={15} className="animate-spin" /> Generating your post — this can take up to a minute…
              </div>
            )}
          </div>
        )}

        {/* ============================ Navigation ======================== */}
        <div className="flex items-center justify-between mt-8 pt-5 border-t border-white/20 dark:border-white/8">
          <Button variant="ghost" onClick={() => setStep(s => s - 1)} disabled={step === 0 || submitting} className="gap-1.5">
            <ChevronLeft size={15} /> Back
          </Button>

          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(s => s + 1)} disabled={!stepValid(step)} className="gap-1.5">
              Continue <ChevronRight size={15} />
            </Button>
          ) : (
            <Button onClick={handleGenerate} disabled={submitting || !copyProviderKey} className="gap-1.5">
              {submitting ? <><Loader2 size={15} className="animate-spin" /> Generating…</> : <><Sparkles size={15} /> Generate Post</>}
            </Button>
          )}
        </div>
      </GlassPanel>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Small sub-components
// ---------------------------------------------------------------------------

function CampaignRow({
  campaign,
  selected,
  onSelect,
}: {
  campaign: Campaign
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button type="button" onClick={onSelect} className={cardCls(selected, 'w-full flex items-center gap-3 p-3.5 mb-1.5')}>
      <span className="w-2 h-2 rounded-full flex-shrink-0 bg-primary/50 dark:bg-primary-light/50" />
      <span className="flex-1 min-w-0">
        <span className={['block text-sm font-semibold truncate', selected ? 'text-primary dark:text-primary-light' : 'text-light-text dark:text-dark-text'].join(' ')}>
          {campaign.name}
        </span>
        <span className="block text-xs text-light-text-muted dark:text-dark-text-muted">
          {campaign._count?.briefs ?? 0} brief{(campaign._count?.briefs ?? 0) === 1 ? '' : 's'}
          {campaign.brandKit ? ` · ${campaign.brandKit.name}` : ''}
        </span>
      </span>
      {selected && <Check size={15} className="text-primary dark:text-primary-light flex-shrink-0" />}
    </button>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-4 py-2.5 border-b border-white/15 dark:border-white/8">
      <span className="text-xs font-bold tracking-wider uppercase text-light-text-muted dark:text-dark-text-muted w-24 flex-shrink-0 pt-0.5">
        {label}
      </span>
      <span className="text-sm text-light-text dark:text-dark-text capitalize">{value}</span>
    </div>
  )
}
