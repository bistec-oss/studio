'use client'

import React from 'react'
import { Loader2 } from 'lucide-react'
import type { AspectRatio } from '@prisma/client'
import { ASPECT_LABELS, dimensionsLabel } from '@/lib/aspectRatio'
import type { Campaign, TemplateSummary, BrandKitSummary } from '@/lib/api-types'
import type { DesignMode, UploadedImage } from './types'
import { ReviewRow } from './ReviewRow'

// ─── Step 4 — Review ─────────────────────────────────────────────────────────

interface ReviewStepProps {
  selectedCampaign: Campaign | null
  selectedBrandKit: BrandKitSummary | null
  aspectRatio: AspectRatio
  designMode: DesignMode
  selectedTemplate: TemplateSummary | null
  selectedRefTemplate: TemplateSummary | null
  goal: string
  tone: string
  images: UploadedImage[]
  topic: string
  prompt: string
  providersLoaded: boolean
  copyProviderKey: string
  error: string | null
  submitting: boolean
}

export function ReviewStep({
  selectedCampaign,
  selectedBrandKit,
  aspectRatio,
  designMode,
  selectedTemplate,
  selectedRefTemplate,
  goal,
  tone,
  images,
  topic,
  prompt,
  providersLoaded,
  copyProviderKey,
  error,
  submitting,
}: ReviewStepProps) {
  return (
    <div>
      <h2 className="text-base font-bold text-light-text dark:text-dark-text mb-1">Review &amp; Generate</h2>
      <p className="text-sm text-light-text-muted dark:text-dark-text-muted mb-5">
        Check your brief before sending it to Claude.
      </p>

      <div className="space-y-0">
        <ReviewRow label="Topic" value={topic || '—'} />
        <ReviewRow label="Campaign" value={selectedCampaign?.name ?? 'Uncategorized'} />
        <ReviewRow label="Brand kit" value={selectedBrandKit?.name ?? '—'} />
        <ReviewRow label="Size" value={`${ASPECT_LABELS[aspectRatio]} · ${dimensionsLabel(aspectRatio)} px`} />
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
        <ReviewRow label="Goal" value={goal} capitalize />
        <ReviewRow label="Tone" value={tone} capitalize />
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
  )
}
