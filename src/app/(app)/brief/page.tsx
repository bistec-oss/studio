'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Sparkles, Layers, Instagram, Linkedin, ChevronDown, ChevronUp, ImagePlus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { GlassInput } from '@/components/ui/GlassInput'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'
import { Select } from '@/components/ui/Select'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Campaign {
  id: string
  name: string
  defaultTone: string | null
  brandKit: { id: string; name: string } | null
}

interface BrandKitTemplate {
  id: string
  name: string
}

interface ResolvedBrandKit {
  id: string
  name: string
  source: string
  templates?: BrandKitTemplate[]
}

interface Provider {
  id: string
  providerKey: string
  label: string
  isDefault: boolean
}

type DesignMode = 'TEMPLATE' | 'GENERATE'
type Channel = 'instagram' | 'linkedin'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts)
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText)
  return res.status === 204 ? (null as T) : res.json()
}

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

const DESIGN_MODE_OPTIONS = [
  { value: 'TEMPLATE', label: 'Preset Template' },
  { value: 'GENERATE', label: 'AI Generated' },
]

const STEP_LABELS = ['Content', 'Brand & Design', 'Channels & Providers']

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1
        const isComplete = step < current
        const isActive = step === current
        return (
          <React.Fragment key={step}>
            <div className={[
              'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-200',
              isActive
                ? 'bg-primary/15 dark:bg-primary-light/20 text-primary dark:text-primary-light border border-primary/30 dark:border-primary-light/30'
                : isComplete
                  ? 'bg-primary/8 dark:bg-primary-light/10 text-primary dark:text-primary-light border border-primary/20 dark:border-primary-light/20'
                  : 'bg-white/30 dark:bg-white/5 text-light-text-muted dark:text-dark-text-muted border border-white/40 dark:border-white/10',
            ].join(' ')}>
              {step}
            </div>
            {i < total - 1 && (
              <div className={[
                'flex-1 h-px transition-all duration-200',
                isComplete
                  ? 'bg-primary/30 dark:bg-primary-light/30'
                  : 'bg-white/30 dark:bg-white/10',
              ].join(' ')} />
            )}
          </React.Fragment>
        )
      })}
      <span className="ml-2 text-xs text-light-text-muted dark:text-dark-text-muted font-medium">
        {STEP_LABELS[current - 1]}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Channel toggle button
// ---------------------------------------------------------------------------

function ChannelButton({
  channel,
  label,
  icon: Icon,
  selected,
  onToggle,
}: {
  channel: Channel
  label: string
  icon: React.ElementType
  selected: boolean
  onToggle: (c: Channel) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(channel)}
      className={[
        'flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150',
        'border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:focus-visible:ring-primary-light/50',
        selected
          ? 'bg-primary/10 dark:bg-primary-light/15 text-primary dark:text-primary-light border-primary/30 dark:border-primary-light/30 shadow-sm'
          : 'glass-input text-light-text-muted dark:text-dark-text-muted hover:text-light-text dark:hover:text-dark-text hover:border-primary/20 dark:hover:border-primary-light/20',
      ].join(' ')}
    >
      <Icon size={16} />
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function BriefPage() {
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1 — Content
  const [topic, setTopic] = useState('')
  const [description, setDescription] = useState('')
  const [goal, setGoal] = useState('awareness')
  const [tone, setTone] = useState('professional')

  // Step 2 — Brand & Design
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignId, setCampaignId] = useState('')
  const [resolvedKit, setResolvedKit] = useState<ResolvedBrandKit | null>(null)
  const [kitLoading, setKitLoading] = useState(false)
  const [designMode, setDesignMode] = useState<DesignMode>('TEMPLATE')
  const [templates, setTemplates] = useState<BrandKitTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  // Step 3 — Channels & Providers
  const [channels, setChannels] = useState<Channel[]>(['instagram'])
  const [copyProviders, setCopyProviders] = useState<Provider[]>([])
  const [imageProviders, setImageProviders] = useState<Provider[]>([])
  const [copyProviderKey, setCopyProviderKey] = useState('')
  const [imageProviderKey, setImageProviderKey] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Load campaigns on mount
  useEffect(() => {
    apiFetch<Campaign[]>('/api/campaigns').then(setCampaigns).catch(console.error)
  }, [])

  // Load copy + image providers on mount
  useEffect(() => {
    apiFetch<Provider[]>('/api/providers/available?slot=COPY')
      .then(data => {
        setCopyProviders(data)
        const def = data.find(p => p.isDefault)
        if (def) setCopyProviderKey(def.providerKey)
        else if (data.length > 0) setCopyProviderKey(data[0].providerKey)
      })
      .catch(console.error)

    apiFetch<Provider[]>('/api/providers/available?slot=IMAGE')
      .then(data => {
        setImageProviders(data)
        const def = data.find(p => p.isDefault)
        if (def) setImageProviderKey(def.providerKey)
        else if (data.length > 0) setImageProviderKey(data[0].providerKey)
      })
      .catch(console.error)
  }, [])

  // Resolve brand kit when campaign changes
  const resolveCampaignKit = useCallback(async (id: string) => {
    if (!id) {
      setResolvedKit(null)
      setTemplates([])
      setSelectedTemplateId('')
      return
    }
    setKitLoading(true)
    try {
      const { kit, source } = await apiFetch<{ kit: ResolvedBrandKit | null; source: string | null }>(
        `/api/campaigns/${id}/brandkit`
      )
      if (kit) {
        // Fetch templates for this brand kit
        const allKits = await apiFetch<Array<{ id: string; templates: BrandKitTemplate[] }>>(
          '/api/admin/brandkits'
        ).catch(() => [])
        const match = allKits.find((k: { id: string }) => k.id === kit.id)
        const kitTemplates: BrandKitTemplate[] = match?.templates ?? []
        setResolvedKit({ ...kit, source: source ?? 'system' })
        setTemplates(kitTemplates)
        setSelectedTemplateId(kitTemplates[0]?.id ?? '')
      } else {
        setResolvedKit(null)
        setTemplates([])
        setSelectedTemplateId('')
      }
    } catch (e) {
      console.error(e)
      setResolvedKit(null)
    } finally {
      setKitLoading(false)
    }
  }, [])

  // Pre-fill tone from campaign default
  function handleCampaignChange(id: string) {
    setCampaignId(id)
    const campaign = campaigns.find(c => c.id === id)
    if (campaign?.defaultTone) setTone(campaign.defaultTone)
    resolveCampaignKit(id)
  }

  // Channel toggle
  function toggleChannel(c: Channel) {
    setChannels(prev =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
    )
  }

  // Validation per step
  function stepValid(s: number): boolean {
    if (s === 1) return topic.trim().length > 0
    if (s === 2) return true // all optional
    if (s === 3) return channels.length > 0 && copyProviderKey.length > 0
    return true
  }

  async function handleSubmit() {
    setError(null)
    setSubmitting(true)
    try {
      const body = {
        topic: topic.trim(),
        description: description.trim() || undefined,
        goal,
        tone,
        channels,
        designMode,
        campaignId: campaignId || undefined,
        copyProviderKey,
        imageProviderKey: imageProviderKey || undefined,
        // referenceTemplateId: used for GENERATE (style ref) and TEMPLATE (template to fill)
        referenceTemplateId: selectedTemplateId || undefined,
      }

      const brief = await apiFetch<{ id: string }>('/api/briefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      // Draft page (T21) not yet built — redirect to home for now
      window.location.href = `/`
      void brief
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed')
      setSubmitting(false)
    }
  }

  // Campaign options for Select
  const campaignOptions = [
    { value: '', label: 'No campaign' },
    ...campaigns.map(c => ({ value: c.id, label: c.name })),
  ]

  const templateOptions = [
    { value: '', label: 'None' },
    ...templates.map(t => ({ value: t.id, label: t.name })),
  ]

  const copyProviderOptions = copyProviders.map(p => ({ value: p.providerKey, label: p.label }))
  const imageProviderOptions = imageProviders.map(p => ({ value: p.providerKey, label: p.label }))

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">New Brief</h1>
        <p className="text-sm text-light-text-muted dark:text-dark-text-muted mt-0.5">
          Describe what you want to create and we will generate on-brand social posts.
        </p>
      </div>

      <GlassPanel className="p-6">
        <StepIndicator current={step} total={3} />

        {/* ----------------------------------------------------------------
            Step 1 — Content
        ---------------------------------------------------------------- */}
        {step === 1 && (
          <div className="flex flex-col gap-5">
            <GlassInput
              label="Topic *"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g. Announcing our new product line"
              autoFocus
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-light-text dark:text-dark-text">
                Description
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Additional context or key points to include (optional)"
                rows={3}
                className={[
                  'glass-input',
                  'w-full rounded-xl px-3 py-2 text-sm resize-none',
                  'text-light-text dark:text-dark-text',
                  'placeholder:text-light-text-muted dark:placeholder:text-dark-text-muted',
                  'focus:outline-none',
                ].join(' ')}
              />
            </div>

            <Select
              label="Goal"
              options={GOAL_OPTIONS}
              value={goal}
              onChange={e => setGoal(e.target.value)}
            />

            <Select
              label="Tone"
              options={TONE_OPTIONS}
              value={tone}
              onChange={e => setTone(e.target.value)}
            />
          </div>
        )}

        {/* ----------------------------------------------------------------
            Step 2 — Brand & Design
        ---------------------------------------------------------------- */}
        {step === 2 && (
          <div className="flex flex-col gap-5">
            {/* Campaign selector */}
            <div className="flex flex-col gap-1.5">
              <Select
                label="Campaign"
                options={campaignOptions}
                value={campaignId}
                onChange={e => handleCampaignChange(e.target.value)}
              />
              {kitLoading && (
                <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
                  Resolving brand kit…
                </p>
              )}
              {!kitLoading && resolvedKit && (
                <div className="inline-flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/8 dark:bg-primary-light/8 text-primary dark:text-primary-light border border-primary/15 dark:border-primary-light/15">
                    Brand kit: {resolvedKit.name}
                  </span>
                  <span className="text-xs text-light-text-muted dark:text-dark-text-muted capitalize">
                    ({resolvedKit.source})
                  </span>
                </div>
              )}
            </div>

            {/* Design mode */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-light-text dark:text-dark-text">
                Design mode
              </label>
              <SegmentedToggle
                options={DESIGN_MODE_OPTIONS}
                value={designMode}
                onChange={v => setDesignMode(v as DesignMode)}
              />
              <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
                {designMode === 'TEMPLATE'
                  ? 'Fill a preset brand template with AI-generated copy.'
                  : 'Let the AI design the layout and visuals from scratch.'}
              </p>
            </div>

            {/* Template picker (both modes, different label) */}
            {designMode === 'TEMPLATE' && (
              <div className="flex flex-col gap-1.5">
                {templates.length > 0 ? (
                  <Select
                    label="Brand template"
                    options={templateOptions}
                    value={selectedTemplateId}
                    onChange={e => setSelectedTemplateId(e.target.value)}
                  />
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-light-text dark:text-dark-text">
                      Brand template
                    </label>
                    <div className="glass-input rounded-xl px-3 py-2 text-sm text-light-text-muted dark:text-dark-text-muted">
                      {campaignId
                        ? 'No templates in the resolved brand kit.'
                        : 'Select a campaign to load brand kit templates.'}
                    </div>
                  </div>
                )}
              </div>
            )}

            {designMode === 'GENERATE' && (
              <div className="flex flex-col gap-4">
                {/* Style inspiration template (optional) */}
                {templates.length > 0 && (
                  <Select
                    label="Style inspiration (optional)"
                    options={templateOptions}
                    value={selectedTemplateId}
                    onChange={e => setSelectedTemplateId(e.target.value)}
                  />
                )}

                {/* Multi-image upload placeholder */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-light-text dark:text-dark-text">
                    Reference images (optional)
                  </label>
                  <div className={[
                    'glass-input rounded-xl p-4',
                    'flex flex-col items-center justify-center gap-2',
                    'border-dashed text-center',
                  ].join(' ')}>
                    <ImagePlus size={20} className="text-light-text-muted dark:text-dark-text-muted" />
                    <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
                      Image upload will be available in a future update.
                    </p>
                    <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
                      Up to 5 images — embed in design or use as style reference.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Additional image (Path A optional) */}
            {designMode === 'TEMPLATE' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-light-text dark:text-dark-text">
                  Additional image (optional)
                </label>
                <div className={[
                  'glass-input rounded-xl p-4',
                  'flex flex-col items-center justify-center gap-2',
                  'border-dashed text-center',
                ].join(' ')}>
                  <ImagePlus size={20} className="text-light-text-muted dark:text-dark-text-muted" />
                  <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
                    Image upload will be available in a future update.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ----------------------------------------------------------------
            Step 3 — Channels & Providers
        ---------------------------------------------------------------- */}
        {step === 3 && (
          <div className="flex flex-col gap-5">
            {/* Channels */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-light-text dark:text-dark-text">
                Channels *
              </label>
              <div className="flex gap-3 flex-wrap">
                <ChannelButton
                  channel="instagram"
                  label="Instagram"
                  icon={Instagram}
                  selected={channels.includes('instagram')}
                  onToggle={toggleChannel}
                />
                <ChannelButton
                  channel="linkedin"
                  label="LinkedIn"
                  icon={Linkedin}
                  selected={channels.includes('linkedin')}
                  onToggle={toggleChannel}
                />
              </div>
              {channels.length === 0 && (
                <p className="text-xs text-red-500 dark:text-red-400">Select at least one channel.</p>
              )}
            </div>

            {/* Copy provider */}
            {copyProviderOptions.length > 0 ? (
              <Select
                label="Copy provider"
                options={copyProviderOptions}
                value={copyProviderKey}
                onChange={e => setCopyProviderKey(e.target.value)}
              />
            ) : (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-light-text dark:text-dark-text">
                  Copy provider
                </label>
                <div className="glass-input rounded-xl px-3 py-2 text-sm text-light-text-muted dark:text-dark-text-muted">
                  No copy providers configured. Ask an admin to add one.
                </div>
              </div>
            )}

            {/* Advanced — image provider */}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowAdvanced(v => !v)}
                className="flex items-center gap-1.5 text-xs text-light-text-muted dark:text-dark-text-muted hover:text-light-text dark:hover:text-dark-text transition-colors self-start"
              >
                {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                Advanced options
              </button>

              {showAdvanced && (
                <div className="flex flex-col gap-4 pl-1 border-l border-white/20 dark:border-white/8 ml-1">
                  {imageProviderOptions.length > 0 ? (
                    <Select
                      label="Image provider (optional)"
                      options={[{ value: '', label: 'None' }, ...imageProviderOptions]}
                      value={imageProviderKey}
                      onChange={e => setImageProviderKey(e.target.value)}
                    />
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-light-text dark:text-dark-text">
                        Image provider (optional)
                      </label>
                      <div className="glass-input rounded-xl px-3 py-2 text-sm text-light-text-muted dark:text-dark-text-muted">
                        No image providers configured.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-xl px-4 py-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40">
                {error}
              </div>
            )}
          </div>
        )}

        {/* ----------------------------------------------------------------
            Navigation
        ---------------------------------------------------------------- */}
        <div className="flex items-center justify-between mt-8 pt-5 border-t border-white/20 dark:border-white/8">
          <Button
            variant="ghost"
            onClick={() => setStep(s => s - 1)}
            disabled={step === 1}
            className="gap-1.5"
          >
            <ChevronLeft size={15} /> Previous
          </Button>

          {step < 3 ? (
            <Button
              onClick={() => setStep(s => s + 1)}
              disabled={!stepValid(step)}
              className="gap-1.5"
            >
              Next <ChevronRight size={15} />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={submitting || !stepValid(3)}
              className="gap-1.5"
            >
              {submitting ? (
                'Creating…'
              ) : (
                <>
                  <Sparkles size={15} />
                  Create Brief
                </>
              )}
            </Button>
          )}
        </div>
      </GlassPanel>

      {/* Summary panel shown on step 3 for quick review */}
      {step === 3 && (
        <GlassPanel className="p-4 mt-4">
          <p className="text-xs font-medium text-light-text-muted dark:text-dark-text-muted mb-3 uppercase tracking-wide">
            Summary
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-light-text-muted dark:text-dark-text-muted">Topic</span>
              <p className="text-light-text dark:text-dark-text font-medium truncate">{topic || '—'}</p>
            </div>
            <div>
              <span className="text-light-text-muted dark:text-dark-text-muted">Goal</span>
              <p className="text-light-text dark:text-dark-text font-medium capitalize">{goal}</p>
            </div>
            <div>
              <span className="text-light-text-muted dark:text-dark-text-muted">Tone</span>
              <p className="text-light-text dark:text-dark-text font-medium capitalize">{tone}</p>
            </div>
            <div>
              <span className="text-light-text-muted dark:text-dark-text-muted">Design mode</span>
              <p className="text-light-text dark:text-dark-text font-medium flex items-center gap-1.5">
                {designMode === 'TEMPLATE'
                  ? <><Layers size={13} /> Preset template</>
                  : <><Sparkles size={13} /> AI generated</>
                }
              </p>
            </div>
            {resolvedKit && (
              <div>
                <span className="text-light-text-muted dark:text-dark-text-muted">Brand kit</span>
                <p className="text-light-text dark:text-dark-text font-medium">{resolvedKit.name}</p>
              </div>
            )}
          </div>
        </GlassPanel>
      )}
    </div>
  )
}
