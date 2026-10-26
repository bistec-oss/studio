'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ApiError, apiFetch } from '@/lib/apiFetch'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { canSubmitBrief } from '@/lib/brief/copyProvider'
import { useCaptionRoute } from '@/lib/hooks/useCaptionRoute'
import { sendWizardStep } from '@/lib/analytics/client'
import { CLASSIC_STYLE, resumeImageStyle } from '@/lib/brief/imageStyle'
import { designPickForPath, refusedModelField, type BriefModelField } from '@/lib/brief/modelPicks'
import { MODEL_NOT_ALLOWED } from '@/lib/models/requests'
import type { ModelKey } from '@/lib/models/catalogue'
import type { AspectRatio } from '@prisma/client'
import type {
  Campaign,
  ProjectRef,
  TemplateSummary,
  BrandKitSummary,
  ProviderInfo,
  ResolvedBrandKitResponse,
} from '@/lib/api-types'
import {
  campaignStyleKey,
  knownStyleKey,
  resolveWizardStyle,
  resumeWizardStyle,
  styleAfterInputChange,
  styleRequestFields,
  DEFAULT_POST_STYLE,
} from '@/lib/brief/wizardStyleState'
import { getArchetype } from '@/lib/designData'
import { parseCompositeSource, type CompositeSource } from '@/lib/brief/compositeSource'
import { DEFAULT_CHANNELS } from './constants'
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
  /** Also resets an image style the new size can't run (009 FR-03). */
  setAspectRatio: (ratio: AspectRatio) => void
  brandKitId: string
  setBrandKitId: React.Dispatch<React.SetStateAction<string>>
  brandKitOptions: { value: string; label: string }[]
  /** 027 FR-07: the post style key. Pre-fills the tone and the image style. */
  postStyle: string
  setPostStyle: (key: string) => void
  /** 009 FR-03: the image style shown ('classic' or an archetype). Path B only. */
  imageStyle: string
  /** The user's own pick: marks the image style touched, so a style change never moves it. */
  setImageStyle: (key: string) => void
  /** True when the image style shown comes from the post style, not the user. */
  imageStyleFromStyle: boolean
  designMode: DesignMode
  /** Also resets a design model the new path can't run (008 FR-19). */
  setDesignMode: (mode: DesignMode) => void
  /** 025 FR-17: the uploaded product screenshot (Path B), or null. */
  compositeSource: CompositeSource | null
  screenshotUploading: boolean
  /** The server's refusal of the last upload, shown on the field. */
  screenshotError: string | null
  screenshotInputRef: React.RefObject<HTMLInputElement | null>
  onScreenshotPicked: (files: FileList | null) => Promise<void>
  removeScreenshot: () => void
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
  /** The goal the post style stands for (read-only: sent to the enhance call, never chosen). */
  goal: string
  /** The tone shown: the user's pick, else the style's (or the campaign's). */
  tone: string
  /** The user's own pick: marks the tone touched. */
  setTone: (value: string) => void
  toneFromStyle: boolean

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
  /** True when POST /api/briefs would accept this submission (see canSubmitBrief). */
  copyProviderReady: boolean
  /** The server's message when the team's chosen caption route cannot run (024 FR-10), else null. */
  captionRouteMessage: string | null

  // Step 4 — model picks (008 FR-19). undefined = the picker is untouched (A5).
  captionModel: ModelKey | undefined
  setCaptionModel: (model: ModelKey | undefined) => void
  designModel: ModelKey | undefined
  setDesignModel: (model: ModelKey | undefined) => void
  /** Why a path change reset the design pick ("Opus 5.5 isn't available for template fill"). */
  designModelNote: string | null
  /** A refused pick's 400 MODEL_NOT_ALLOWED message, on the picker it belongs to. */
  modelErrors: Partial<Record<BriefModelField, string>>
}

export function useBriefWizard(): UseBriefWizardResult {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 0 — Campaign
  const [campaignId, setCampaignId] = useState('')

  // The campaigns list is read here (not further down) because the style
  // resolution and the autosave both need the selected campaign's defaults.
  const { data: campaigns = [] } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => apiFetch<Campaign[]>('/api/campaigns'),
  })

  // Step 1 — Size & Design
  const [aspectRatio, setAspectRatioState] = useState<AspectRatio>('SQUARE')
  // 027 FR-07: the post style, and the tone and image style the user picked
  // themselves. An untouched field follows the style (through the resolver); a
  // touched one is never overwritten.
  const [postStyle, setPostStyleState] = useState<string>(DEFAULT_POST_STYLE)
  const [toneValue, setToneValue] = useState('professional')
  const [toneTouched, setToneTouched] = useState(false)
  // 009 FR-03: Path B only; reset to classic when the size or path can't run it.
  const [imageStyleValue, setImageStyleValue] = useState<string>(CLASSIC_STYLE)
  const [imageStyleTouched, setImageStyleTouched] = useState(false)
  const [brandKitId, setBrandKitId] = useState('')
  const [designMode, setDesignModeState] = useState<DesignMode>('TEMPLATE')
  const [templateId, setTemplateId] = useState('')
  const [referenceTemplateId, setReferenceTemplateId] = useState('')
  // 025 FR-17: the per-post product screenshot a `requires` look composites in.
  const [compositeSource, setCompositeSource] = useState<CompositeSource | null>(null)
  const [screenshotUploading, setScreenshotUploading] = useState(false)
  const [screenshotError, setScreenshotError] = useState<string | null>(null)
  const screenshotInputRef = useRef<HTMLInputElement>(null)
  const hasCompositeSource = compositeSource !== null

  // Step 4 — model picks (008 FR-19). undefined = untouched: the field is left
  // out of the POST and the autosave, and the server resolves the default (A5).
  const [captionModel, setCaptionModelState] = useState<ModelKey | undefined>(undefined)
  const [designModel, setDesignModelState] = useState<ModelKey | undefined>(undefined)
  const [designModelNote, setDesignModelNote] = useState<string | null>(null)
  const [modelErrors, setModelErrors] = useState<Partial<Record<BriefModelField, string>>>({})

  // A new pick (or the picker's own stale-pick reset) clears that picker's
  // refusal and the path-change note: they described the previous value.
  const setCaptionModel = useCallback((model: ModelKey | undefined) => {
    setCaptionModelState(model)
    setModelErrors(({ captionModel: _refused, ...rest }) => rest)
  }, [])
  const setDesignModel = useCallback((model: ModelKey | undefined) => {
    setDesignModelState(model)
    setDesignModelNote(null)
    setModelErrors(({ designModel: _refused, ...rest }) => rest)
  }, [])

  // 009 FR-03: a size the picked look does not support resets the style (the
  // pick is dropped, so the field follows the style again). Every shipped look
  // declares every size, so on today's dataset this never resets.
  function setAspectRatio(ratio: AspectRatio) {
    setAspectRatioState(ratio)
    if (styleAfterInputChange(imageStyleValue, ratio, undefined, { hasCompositeSource }).reset) resetImageStyle()
  }

  // 025 FR-17: the upload goes to the private store and answers a key, never a
  // URL. A refusal (type, size, dimensions) is the server's own message.
  async function onScreenshotPicked(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setScreenshotUploading(true)
    setScreenshotError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const up = await apiFetch<{ key: string; width: number; height: number }>('/api/briefs/screenshots', {
        method: 'POST',
        body: fd,
      })
      setCompositeSource({ kind: 'brief-upload', key: up.key, width: up.width, height: up.height })
    } catch (e) {
      setScreenshotError(e instanceof Error ? e.message : 'Screenshot upload failed')
    } finally {
      setScreenshotUploading(false)
      if (screenshotInputRef.current) screenshotInputRef.current.value = ''
    }
  }

  // Removing the screenshot while a look that needs it is picked drops the pick,
  // so the field follows the post style again.
  function removeScreenshot() {
    setCompositeSource(null)
    setScreenshotError(null)
    if (styleAfterInputChange(imageStyleValue, aspectRatio, undefined, { hasCompositeSource: false }).reset) {
      resetImageStyle()
    }
  }

  function resetImageStyle() {
    setImageStyleValue(CLASSIC_STYLE)
    setImageStyleTouched(false)
  }

  function setImageStyle(key: string) {
    setImageStyleValue(key)
    setImageStyleTouched(true)
  }

  function setTone(value: string) {
    setToneValue(value)
    setToneTouched(true)
  }

  function setPostStyle(key: string) {
    setPostStyleState(knownStyleKey(key))
  }

  // FR-19: a design pick the new path can't run (Opus → template fill) resets,
  // with the reason shown under the Review step's picker.
  function setDesignMode(mode: DesignMode) {
    if (mode === designMode) return
    setDesignModeState(mode)
    if (mode === 'TEMPLATE') {
      resetImageStyle()
      setCompositeSource(null)
      setScreenshotError(null)
    }
    const next = designPickForPath(designModel, mode)
    setDesignModel(next.pick) // clears the previous path's note and refusal
    if (next.note) setDesignModelNote(next.note)
  }

  // Step 2 — Content
  // topic = the short post title (Brief.topic — names the post in the library);
  // prompt = the full brief text (Brief.description — Claude's prompt context).
  const [topic, setTopic] = useState('')
  const [prompt, setPrompt] = useState('')

  // Step 3 — Images
  const [images, setImages] = useState<UploadedImage[]>([])
  const [uploading, setUploading] = useState(false)

  // 027 FR-07: what the tone and the image style actually are right now.
  const selectedCampaign = campaigns.find(c => c.id === campaignId) ?? null
  const styleInput = {
    postStyle,
    campaign: selectedCampaign,
    designMode,
    aspectRatio,
    tone: toneValue,
    toneTouched,
    imageStyle: imageStyleValue,
    imageStyleTouched,
    hasCompositeSource,
  }
  const styleView = resolveWizardStyle(styleInput)
  const tone = styleView.tone
  const imageStyle = styleView.imageStyle
  const goal = styleView.goal

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
  // 006 FR-08: the furthest step reported so far, so each step is reported once
  // per visit however often the user goes back and forward. High until the
  // mount effect below knows whether this is a fresh wizard or a resume.
  const maxStepReportedRef = useRef(99)
  const resumedRef = useRef(false)

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
      postStyle,
      tone,
      images: images.map(({ id, url, filename, intent }) => ({ id, url, filename, intent })),
      // An untouched pick is undefined, which JSON.stringify leaves out.
      captionModel,
      designModel,
      // Classic is the default: left out, like an untouched model pick.
      imageStyle: imageStyle === CLASSIC_STYLE ? undefined : imageStyle,
      // 025 FR-17: the screenshot, only on Path B (a Path A brief never carries one).
      compositeSource: designMode === 'GENERATE' && compositeSource ? compositeSource : undefined,
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
    postStyle,
    tone,
    images,
    captionModel,
    designModel,
    imageStyle,
    compositeSource,
  ])

  // Resume: /brief?resume=<id> rehydrates the saved row and continues saving
  // into it. Read from window.location (mount-only) rather than
  // useSearchParams — no Suspense boundary needed. A missing/foreign/expired
  // id just opens a fresh wizard; dangling template/kit/campaign ids are
  // cleared by the existing consistency effect once data loads (FR-6/AC-8).
  useEffect(() => {
    const resumeId = new URLSearchParams(window.location.search).get('resume')
    if (!resumeId) {
      // Strict Mode runs this twice in dev; the ref keeps it to one report.
      if (maxStepReportedRef.current === 99) {
        maxStepReportedRef.current = 0
        sendWizardStep(0, null)
      }
      return
    }
    let cancelled = false
    apiFetch<{ id: string; payload: unknown }>(`/api/brief-drafts/${resumeId}`)
      .then((row) => {
        if (cancelled) return
        const parsed = briefDraftPayloadSchema.safeParse(row.payload)
        if (!parsed.success) {
          // An unreadable row opens a fresh wizard: report its start.
          maxStepReportedRef.current = 0
          sendWizardStep(0, null)
          return
        }
        const p = parsed.data
        draftIdRef.current = row.id
        resumedRef.current = true
        // A resume restores a position; only moving past it is a step reached.
        maxStepReportedRef.current = p.step
        setStep(p.step)
        setCampaignId(p.campaignId)
        setAspectRatioState(p.aspectRatio)
        setBrandKitId(p.brandKitId)
        setDesignModeState(p.designMode)
        setTemplateId(p.templateId)
        setReferenceTemplateId(p.referenceTemplateId)
        setTopic(p.topic)
        setPrompt(p.prompt)
        setImages(p.images.map((img) => ({ ...img })))
        setCaptionModelState(p.captionModel)
        setDesignModelState(p.designModel)
        // An unknown or retired stored value resumes as classic; so does a style
        // the stored size or path can't run.
        const resumedImageStyle = resumeImageStyle(p.imageStyle)
        // 025: the screenshot comes back with a Path B draft, and a look that needs
        // one is kept only if it did.
        const storedSource = p.designMode === 'GENERATE' ? parseCompositeSource(p.compositeSource) : null
        setCompositeSource(storedSource)
        const storedImageStyle =
          p.designMode === 'TEMPLATE' ||
          styleAfterInputChange(resumedImageStyle, p.aspectRatio, undefined, {
            hasCompositeSource: storedSource !== null,
          }).reset
            ? CLASSIC_STYLE
            : resumedImageStyle
        // 027 FR-07: an unknown stored style opens as General; a stored tone or
        // image style is the user's own only if it differs from what the style
        // would give (so an untouched field keeps following the style).
        const restored = resumeWizardStyle(
          { postStyle: p.postStyle, tone: p.tone, imageStyle: storedImageStyle },
          { campaign: null, designMode: p.designMode, aspectRatio: p.aspectRatio },
        )
        setPostStyleState(restored.postStyle)
        setToneValue(p.tone)
        setToneTouched(restored.toneTouched)
        setImageStyleValue(restored.imageStyle)
        setImageStyleTouched(restored.imageStyleTouched)
      })
      .catch(() => {
        /* deleted/expired/foreign id → fresh wizard */
        if (cancelled || maxStepReportedRef.current !== 99) return
        maxStepReportedRef.current = 0
        sendWizardStep(0, null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 006 FR-08: one wizard.step per forward step reached (fire-and-forget).
  useEffect(() => {
    if (step > maxStepReportedRef.current) {
      maxStepReportedRef.current = step
      sendWizardStep(step, draftIdRef.current)
    }
  }, [step])

  // ── Initial loads ──────────────────────────────────────────────────────
  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: () => apiFetch<TemplateSummary[]>('/api/templates'),
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
  // In CLI mode copy needs no registered provider — it runs `claude -p` on the
  // OAuth chain (personal token → team token). The gate is the route's own
  // decision function, so the button can't disagree with what POST /api/briefs
  // will accept. cliMode must be LOADED before gating, or the warning flashes on
  // first paint (/api/me defaults it to false while in flight).
  const { cliMode, isLoading: meLoading } = useCurrentUser()
  // 024 FR-10: once the team has chosen a caption route the route decides the
  // credential, so the wizard sends no key and gates on the route's own state
  // (the server's answer, not a client rule). A never-chosen team is unchanged.
  const { data: captionRoute, isSuccess: captionRouteLoaded } = useCaptionRoute()
  const routeChosen = captionRoute?.state === 'ready' || captionRoute?.state === 'not-ready'
  const captionRouteMessage = captionRoute?.state === 'not-ready' ? captionRoute.message : null
  const copyProviderReady =
    captionRoute?.state === 'not-ready'
      ? false
      : canSubmitBrief(copyProviderKey || undefined, cliMode, routeChosen)
  const providersLoaded =
    copyProvidersLoaded && imageProvidersLoaded && captionRouteLoaded && !meLoading

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
    // 027 FR-07: the style comes from the campaign's default (General when it
    // has none); the tone follows through the resolver while untouched.
    setPostStyleState(campaignStyleKey(campaigns.find(x => x.id === id)))
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
    setModelErrors({})
    if (!copyProviderReady) {
      setError(
        captionRouteMessage ??
          'No caption provider is set up. Ask a team admin to add one under Team settings > AI providers.'
      )
      return
    }
    setSubmitting(true)
    try {
      const embedImages = images.filter(i => i.intent === 'embed')
      const styleRequest = styleRequestFields(styleInput)
      const briefBody = {
        // Short title → Brief.topic (names the post in the library);
        // full prompt → Brief.description (Claude uses both).
        topic: topic.trim(),
        description: prompt.trim(),
        // 027 FR-07: the style always; tone and imageStyle only when the user
        // picked them, so the server resolves the rest and cannot disagree.
        ...styleRequest,
        channels: DEFAULT_CHANNELS,
        aspectRatio,
        designMode,
        campaignId: campaignId || undefined,
        brandKitId: brandKitId || undefined,
        // Omitted (not '') when no provider is registered, so the route takes its
        // CLI default instead of existence-checking an empty key.
        // A chosen route ignores the brief's key (024 FR-05), so none is sent.
        copyProviderKey: routeChosen ? undefined : copyProviderKey || undefined,
        imageProviderKey: imageProviderKey || undefined,
        briefImages: images.length > 0 ? images.map(({ url, intent, filename }) => ({ url, intent, filename })) : undefined,
        // Path A embeds a single image; pass the first embed image through.
        additionalImageUrl: designMode === 'TEMPLATE' ? embedImages[0]?.url : undefined,
        // Path B uses referenceTemplateId for style inspiration.
        referenceTemplateId: designMode === 'GENERATE' ? referenceTemplateId || undefined : undefined,
        // 008 FR-19: sent only when the user picked a model (A5); an undefined
        // pick is left out by JSON.stringify, so the server resolves the default.
        captionModel,
        designModel,
        // 006 FR-08: whether the brief came from a resumed brief draft (read by
        // the route for brief.submitted only; not stored).
        resumed: resumedRef.current || undefined,
        // 025 FR-17: with a look that `requires` it, and only then: the server
        // refuses a screenshot sent with any other look.
        compositeSource:
          designMode === 'GENERATE' &&
          compositeSource &&
          styleRequest.imageStyle &&
          getArchetype(styleRequest.imageStyle)?.requires
            ? compositeSource
            : undefined,
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
      // A refused model pick (400 MODEL_NOT_ALLOWED) shows on its picker;
      // anything else, or a refusal that can't be placed, on the step.
      const field =
        e instanceof ApiError && e.code === MODEL_NOT_ALLOWED
          ? refusedModelField(e.field)
          : null
      const message = e instanceof Error ? e.message : 'Generation failed'
      if (field) setModelErrors({ [field]: message })
      else setError(message)
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
    postStyle: styleView.postStyle,
    setPostStyle,
    imageStyle,
    setImageStyle,
    imageStyleFromStyle: styleView.imageStyleFromStyle,
    brandKitId,
    setBrandKitId,
    brandKitOptions,
    designMode,
    setDesignMode,
    compositeSource,
    screenshotUploading,
    screenshotError,
    screenshotInputRef,
    onScreenshotPicked,
    removeScreenshot,
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
    tone,
    setTone,
    toneFromStyle: styleView.toneFromStyle,
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
    copyProviderReady,
    captionRouteMessage,
    captionModel,
    setCaptionModel,
    designModel,
    setDesignModel,
    designModelNote,
    modelErrors,
  }
}
