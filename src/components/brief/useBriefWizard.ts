'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/apiFetch'
import type { AspectRatio } from '@prisma/client'
import type {
  Campaign,
  ProjectRef,
  TemplateSummary,
  BrandKitSummary,
  ProviderInfo,
  ResolvedBrandKitResponse,
} from '@/lib/api-types'
import { DEFAULT_CHANNELS, TONE_OPTIONS } from './constants'
import type { DesignMode, ResolvedKit, UploadedImage } from './types'
import {
  briefDraftPayloadSchema,
  isTrivialBriefDraft,
  type BriefDraftPayload,
} from '@/lib/brief/briefDraftPayload'
import type { SaveBriefDraftResponse } from '@/lib/api-types'

// ─── Brief wizard state + submit flow ────────────────────────────────────────
// Owns every piece of wizard state (step index, selections, content, images),
// the data loads the state depends on, per-step validation, and the final
// create-brief → generate → open-draft submit. The page composes the step
// components around this.

export interface ProjectCampaignGroup {
  project: ProjectRef
  campaigns: Campaign[]
}

export interface UseBriefWizardResult {
  // Step navigation
  step: number
  setStep: React.Dispatch<React.SetStateAction<number>>
  stepValid: (s: number) => boolean

  // Submit
  submitting: boolean
  error: string | null
  handleGenerate: () => Promise<void>

  // Step 0 — Campaign
  campaignId: string
  selectCampaign: (id: string) => void
  clearCampaign: () => void
  kitLoading: boolean
  resolvedKit: ResolvedKit | null
  projectsWithCampaigns: ProjectCampaignGroup[]
  standaloneCampaigns: Campaign[]

  // Step 1 — Size & Design
  aspectRatio: AspectRatio
  setAspectRatio: React.Dispatch<React.SetStateAction<AspectRatio>>
  brandKitId: string
  setBrandKitId: React.Dispatch<React.SetStateAction<string>>
  brandKitOptions: { value: string; label: string }[]
  designMode: DesignMode
  setDesignMode: React.Dispatch<React.SetStateAction<DesignMode>>
  templateId: string
  setTemplateId: React.Dispatch<React.SetStateAction<string>>
  referenceTemplateId: string
  setReferenceTemplateId: React.Dispatch<React.SetStateAction<string>>
  visibleTemplates: TemplateSummary[]

  // Step 2 — Content
  topic: string
  setTopic: React.Dispatch<React.SetStateAction<string>>
  prompt: string
  setPrompt: React.Dispatch<React.SetStateAction<string>>
  goal: string
  setGoal: React.Dispatch<React.SetStateAction<string>>
  tone: string
  setTone: React.Dispatch<React.SetStateAction<string>>

  // Step 3 — Images
  images: UploadedImage[]
  uploading: boolean
  // React 19: useRef<T>(null) types as RefObject<T | null>
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onFilesPicked: (files: FileList | null) => Promise<void>
  removeImage: (id: string) => void
  toggleIntent: (id: string) => void

  // Step 4 — Review
  selectedCampaign: Campaign | null
  selectedTemplate: TemplateSummary | null
  selectedRefTemplate: TemplateSummary | null
  selectedBrandKit: BrandKitSummary | null
  providersLoaded: boolean
  copyProviderKey: string
}

export function useBriefWizard(): UseBriefWizardResult {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 0 — Campaign
  const [campaignId, setCampaignId] = useState('')

  // Step 1 — Size & Design
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('SQUARE')
  const [brandKitId, setBrandKitId] = useState('')
  const [designMode, setDesignMode] = useState<DesignMode>('TEMPLATE')
  const [templateId, setTemplateId] = useState('')
  const [referenceTemplateId, setReferenceTemplateId] = useState('')

  // Step 2 — Content
  // topic = the short post title (Brief.topic — names the post in the library);
  // prompt = the full brief text (Brief.description — Claude's prompt context).
  const [topic, setTopic] = useState('')
  const [prompt, setPrompt] = useState('')
  const [goal, setGoal] = useState('awareness')
  const [tone, setTone] = useState('professional')

  // Step 3 — Images
  const [images, setImages] = useState<UploadedImage[]>([])
  const [uploading, setUploading] = useState(false)

  // ── Unfinished-brief autosave + resume ─────────────────────────────────
  // The recoverable state is debounce-PUT to /api/brief-drafts once it's
  // non-trivial; ?resume=<id> rehydrates a saved row. All fire-and-forget —
  // autosave must never block or error the wizard (NFR-1).
  const draftIdRef = useRef<string | null>(null)
  // Set when Generate succeeds (or the server 404s the row): no further saves.
  const autosaveStoppedRef = useRef(false)
  const saveInFlightRef = useRef(false)
  const saveQueuedRef = useRef(false)
  // Latest payload, refreshed by the debounce effect below, so the trailing
  // save after an in-flight PUT never writes a stale closure's state.
  const latestPayloadRef = useRef<BriefDraftPayload | null>(null)

  async function persistBriefDraft() {
    if (autosaveStoppedRef.current) return
    if (saveInFlightRef.current) {
      saveQueuedRef.current = true
      return
    }
    const payload = latestPayloadRef.current
    if (!payload || isTrivialBriefDraft(payload)) return
    saveInFlightRef.current = true
    try {
      const res = await apiFetch<SaveBriefDraftResponse>('/api/brief-drafts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draftIdRef.current ?? undefined, payload }),
      })
      draftIdRef.current = res.id
    } catch (e) {
      // The row was deleted elsewhere (Generate in another tab / discard):
      // stop — recreating it would resurrect a finished brief. Any other
      // failure is transient; the next debounce retries. Silent by design.
      if (e instanceof Error && e.message === 'Draft no longer exists') {
        autosaveStoppedRef.current = true
      }
      console.warn('[briefDraft] autosave failed:', e instanceof Error ? e.message : e)
    } finally {
      saveInFlightRef.current = false
      if (saveQueuedRef.current) {
        saveQueuedRef.current = false
        void persistBriefDraft()
      }
    }
  }

  // Debounced autosave watching every recoverable field.
  useEffect(() => {
    latestPayloadRef.current = {
      step,
      campaignId,
      aspectRatio,
      brandKitId,
      designMode,
      templateId,
      referenceTemplateId,
      topic,
      prompt,
      goal,
      tone,
      images: images.map(({ id, url, filename, intent }) => ({ id, url, filename, intent })),
    }
    if (autosaveStoppedRef.current) return
    if (isTrivialBriefDraft(latestPayloadRef.current)) return
    const timer = setTimeout(() => void persistBriefDraft(), 1500)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    step,
    campaignId,
    aspectRatio,
    brandKitId,
    designMode,
    templateId,
    referenceTemplateId,
    topic,
    prompt,
    goal,
    tone,
    images,
  ])

  // Resume: /brief?resume=<id> rehydrates the saved row and continues saving
  // into it. Read from window.location (mount-only) rather than
  // useSearchParams — no Suspense boundary needed. A missing/foreign/expired
  // id just opens a fresh wizard; dangling template/kit/campaign ids are
  // cleared by the existing consistency effect once data loads (FR-6/AC-8).
  useEffect(() => {
    const resumeId = new URLSearchParams(window.location.search).get('resume')
    if (!resumeId) return
    let cancelled = false
    apiFetch<{ id: string; payload: unknown }>(`/api/brief-drafts/${resumeId}`)
      .then((row) => {
        if (cancelled) return
        const parsed = briefDraftPayloadSchema.safeParse(row.payload)
        if (!parsed.success) return
        const p = parsed.data
        draftIdRef.current = row.id
        setStep(p.step)
        setCampaignId(p.campaignId)
        setAspectRatio(p.aspectRatio)
        setBrandKitId(p.brandKitId)
        setDesignMode(p.designMode)
        setTemplateId(p.templateId)
        setReferenceTemplateId(p.referenceTemplateId)
        setTopic(p.topic)
        setPrompt(p.prompt)
        setGoal(p.goal)
        setTone(p.tone)
        setImages(p.images.map((img) => ({ ...img })))
      })
      .catch(() => {
        /* deleted/expired/foreign id → fresh wizard */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // ── Initial loads ──────────────────────────────────────────────────────
  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: () => apiFetch<TemplateSummary[]>('/api/templates'),
  })
  const { data: campaigns = [] } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => apiFetch<Campaign[]>('/api/campaigns'),
  })
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiFetch<ProjectRef[]>('/api/projects'),
  })
  const { data: brandKits = [] } = useQuery({
    queryKey: ['brandkits'],
    queryFn: () => apiFetch<BrandKitSummary[]>('/api/brandkits'),
  })

  // Providers (auto-resolved behind the scenes — no wizard step in the proto)
  const { data: copyProviders, isSuccess: copyProvidersLoaded } = useQuery({
    queryKey: ['providers', 'COPY'],
    queryFn: () => apiFetch<ProviderInfo[]>('/api/providers/available?slot=COPY'),
  })
  const { data: imageProviders, isSuccess: imageProvidersLoaded } = useQuery({
    queryKey: ['providers', 'IMAGE'],
    queryFn: () => apiFetch<ProviderInfo[]>('/api/providers/available?slot=IMAGE'),
  })
  const pickDefault = (list: ProviderInfo[] | undefined) =>
    list?.find(p => p.isDefault)?.providerKey ?? list?.[0]?.providerKey ?? ''
  const copyProviderKey = pickDefault(copyProviders)
  const imageProviderKey = pickDefault(imageProviders)
  const providersLoaded = copyProvidersLoaded && imageProvidersLoaded

  // Keep template selections consistent with the chosen brand kit AND size: any
  // template that doesn't belong to the selected kit, or doesn't match the chosen
  // aspect ratio, is cleared (the picker only offers matching templates).
  useEffect(() => {
    const matches = (id: string) => {
      const t = templates.find(t => t.id === id)
      return !!t && (!brandKitId || t.brandKitId === brandKitId) && t.aspectRatio === aspectRatio
    }
    setTemplateId(prev => (prev && !matches(prev) ? '' : prev))
    setReferenceTemplateId(prev => (prev && !matches(prev) ? '' : prev))
  }, [brandKitId, aspectRatio, templates])

  // ── Brand kit resolution on campaign change ────────────────────────────
  const { data: resolvedKitResponse, isFetching: kitLoading } = useQuery({
    queryKey: ['campaigns', campaignId, 'brandkit'],
    queryFn: () => apiFetch<ResolvedBrandKitResponse>(`/api/campaigns/${campaignId}/brandkit`),
    enabled: !!campaignId,
  })
  const resolvedKit: ResolvedKit | null =
    campaignId && resolvedKitResponse?.kit
      ? { ...resolvedKitResponse.kit, source: resolvedKitResponse.source ?? 'system' }
      : null

  // Default the brief's brand kit from the campaign/project assignment only.
  // A bare system-default (or no kit) leaves the selection empty so the user
  // explicitly chooses one on the next step.
  useEffect(() => {
    const kit = resolvedKitResponse?.kit
    const source = resolvedKitResponse?.source
    if (campaignId && kit && (source === 'campaign' || source === 'project')) {
      setBrandKitId(kit.id)
    }
     
  }, [resolvedKitResponse, campaignId])

  function selectCampaign(id: string) {
    setCampaignId(id)
    const c = campaigns.find(x => x.id === id)
    // Pre-fill tone from the campaign default when it matches a known option.
    if (c?.defaultTone) {
      const match = TONE_OPTIONS.find(t => c.defaultTone!.toLowerCase().includes(t.value))
      if (match) setTone(match.value)
    }
  }

  function clearCampaign() {
    setCampaignId('')
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

  // ── Derived ────────────────────────────────────────────────────────────
  // Templates filter to the selected brand kit AND the chosen size — so Path A
  // never fills a mismatched template (no stretching) and Path B's style reference
  // matches the target shape. Applies to both pickers.
  const visibleTemplates = templates.filter(
    t => (!brandKitId || t.brandKitId === brandKitId) && t.aspectRatio === aspectRatio,
  )

  const brandKitOptions = [
    { value: '', label: 'Select a brand kit…' },
    ...brandKits.map(k => ({ value: k.id, label: k.name })),
  ]

  // ── Per-step validation ────────────────────────────────────────────────
  function stepValid(s: number): boolean {
    if (s === 0) return true // campaign is optional (Uncategorized is valid)
    if (s === 1)
      return brandKitId !== '' && (designMode === 'GENERATE' || templateId !== '')
    if (s === 2) return topic.trim().length > 0 && prompt.trim().length > 10
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
        // Short title → Brief.topic (names the post in the library);
        // full prompt → Brief.description (Claude uses both).
        topic: topic.trim(),
        description: prompt.trim(),
        goal,
        tone,
        channels: DEFAULT_CHANNELS,
        aspectRatio,
        designMode,
        campaignId: campaignId || undefined,
        brandKitId: brandKitId || undefined,
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

      // Brief created — the unfinished-brief row is obsolete. Stop autosave
      // FIRST (a queued debounce must not resurrect the row), then delete it
      // keeping its images (Brief.briefImages references them). Fire-and-forget.
      autosaveStoppedRef.current = true
      if (draftIdRef.current) {
        void apiFetch(`/api/brief-drafts/${draftIdRef.current}?keepImages=true`, {
          method: 'DELETE',
        }).catch(() => {
          /* already gone / transient — the TTL sweep will collect it */
        })
      }

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
  const selectedBrandKit = brandKits.find(k => k.id === brandKitId) ?? null

  return {
    step,
    setStep,
    stepValid,
    submitting,
    error,
    handleGenerate,
    campaignId,
    selectCampaign,
    clearCampaign,
    kitLoading,
    resolvedKit,
    projectsWithCampaigns,
    standaloneCampaigns,
    aspectRatio,
    setAspectRatio,
    brandKitId,
    setBrandKitId,
    brandKitOptions,
    designMode,
    setDesignMode,
    templateId,
    setTemplateId,
    referenceTemplateId,
    setReferenceTemplateId,
    visibleTemplates,
    topic,
    setTopic,
    prompt,
    setPrompt,
    goal,
    setGoal,
    tone,
    setTone,
    images,
    uploading,
    fileInputRef,
    onFilesPicked,
    removeImage,
    toggleIntent,
    selectedCampaign,
    selectedTemplate,
    selectedRefTemplate,
    selectedBrandKit,
    providersLoaded,
    copyProviderKey,
  }
}
