'use client'

import React from 'react'
import { Loader2 } from 'lucide-react'
import type { AspectRatio } from '@prisma/client'
import { ASPECT_LABELS, dimensionsLabel } from '@/lib/aspectRatio'
import type { Campaign, TemplateSummary, BrandKitSummary } from '@/lib/api-types'
import type { ModelKey } from '@/lib/models/catalogue'
import { useModels } from '@/lib/hooks/useModels'
import {
  designPath,
  designSurface,
  reviewModelName,
  type BriefModelField,
} from '@/lib/brief/modelPicks'
import { styleLabel } from '@/lib/designData'
import type { CompositeSource } from '@/lib/brief/compositeSource'
import { getStyle } from '@/lib/postStyles'
import type { DesignMode, UploadedImage } from './types'
import { ReviewRow, type ReviewRowProps } from './ReviewRow'
import { Notice } from '@/components/ui/Notice'
import { ModelPicker } from '@/components/ui/ModelPicker'
import { StepHead } from './StepHead'
import { ICON } from '@/components/ui/atoms'

// ─── Step 4 — Review ─────────────────────────────────────────────────────────

interface ReviewStepProps {
  selectedCampaign: Campaign | null
  selectedBrandKit: BrandKitSummary | null
  aspectRatio: AspectRatio
  postStyle: string
  /** True when the image style is the post style's own default (027 FR-07). */
  imageStyleFromStyle?: boolean
  imageStyle: string
  /** 025 FR-17: the product screenshot, when one is attached (Path B). */
  compositeSource?: CompositeSource | null
  designMode: DesignMode
  selectedTemplate: TemplateSummary | null
  selectedRefTemplate: TemplateSummary | null
  tone: string
  images: UploadedImage[]
  topic: string
  prompt: string
  providersLoaded: boolean
  copyProviderReady: boolean
  /** The server's message for a chosen caption route that cannot run (024 FR-10). */
  captionRouteMessage?: string | null
  error: string | null
  submitting: boolean
  // 008 FR-19: the model picks (undefined = untouched, A5)
  captionModel: ModelKey | undefined
  onCaptionModelChange: (model: ModelKey | undefined) => void
  designModel: ModelKey | undefined
  onDesignModelChange: (model: ModelKey | undefined) => void
  designModelNote: string | null
  modelErrors: Partial<Record<BriefModelField, string>>
}

export function ReviewStep({
  selectedCampaign,
  selectedBrandKit,
  aspectRatio,
  postStyle,
  imageStyleFromStyle,
  imageStyle,
  compositeSource,
  designMode,
  selectedTemplate,
  selectedRefTemplate,
  tone,
  images,
  topic,
  prompt,
  providersLoaded,
  copyProviderReady,
  captionRouteMessage,
  error,
  submitting,
  captionModel,
  onCaptionModelChange,
  designModel,
  onDesignModelChange,
  designModelNote,
  modelErrors,
}: ReviewStepProps) {
  const { data: models } = useModels()
  const designContext = { designPath: designPath(designMode) }
  // The models each run will use: the pick, else the server's pre-selection.
  // No row while the models load, or when the picker is hidden.
  const captionModelName = models ? reviewModelName('CAPTION', models, {}, captionModel) : null
  const designModelName = models
    ? reviewModelName(designSurface(designMode), models, designContext, designModel)
    : null

  // The summary is a plain list of rows: a new field (008's model selection,
  // for one) is one more entry, in the order it should read.
  const rows: ReviewRowProps[] = [
    { label: 'Topic', value: topic || '—' },
    { label: 'Campaign', value: selectedCampaign?.name ?? 'Uncategorized' },
    { label: 'Brand kit', value: selectedBrandKit?.name ?? '—' },
    { label: 'Size', value: `${ASPECT_LABELS[aspectRatio]} · ${dimensionsLabel(aspectRatio)} px` },
    { label: 'Design mode', value: designMode === 'TEMPLATE' ? 'Template fill' : 'Freeform design' },
    // Always shown (027 FR-07): Path A, and a size the look does not support, read Classic, whatever the style says.
    {
      label: 'Image style',
      value:
        (imageStyle === 'classic' ? 'Classic' : styleLabel(imageStyle)) +
        (imageStyleFromStyle ? ' (from the post style)' : ''),
    },
    ...(designMode === 'GENERATE' && compositeSource
      ? [{ label: 'Product screenshot', value: `${compositeSource.width}×${compositeSource.height}` }]
      : []),
    {
      label: 'Template',
      value:
        designMode === 'TEMPLATE'
          ? selectedTemplate?.name ?? 'None'
          : selectedRefTemplate
            ? `Style reference: ${selectedRefTemplate.name}`
            : 'None',
    },
    ...(captionModelName ? [{ label: 'Caption model', value: captionModelName }] : []),
    ...(designModelName ? [{ label: 'Design model', value: designModelName }] : []),
    { label: 'Post style', value: getStyle(postStyle)?.label ?? 'General' },
    { label: 'Tone', value: tone, capitalize: true },
    {
      label: 'Images',
      value:
        images.length > 0
          ? `${images.length} image${images.length > 1 ? 's' : ''} (${images.filter(i => i.intent === 'embed').length} embed, ${images.filter(i => i.intent === 'reference').length} reference)`
          : 'None',
    },
    { label: 'Description', value: prompt || '—' },
  ]

  return (
    <div>
      <StepHead title={<>Review &amp; Generate</>}>
        Check your post before generating it.
      </StepHead>

      {/* Ruled rows on --line-subtle (DESIGN_SYSTEM.md §8.15) */}
      <dl className="border-t border-line-subtle">
        {rows.map(row => (
          <ReviewRow key={row.label} {...row} />
        ))}
      </dl>

      {/* 008 FR-19: the caption and design models, pre-selected to what the
          server would run; a pick is sent only when it differs (A5). */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <ModelPicker
          id="brief-caption-model"
          surface="CAPTION"
          label="Caption model"
          value={captionModel}
          onChange={onCaptionModelChange}
          error={modelErrors.captionModel}
          disabled={submitting}
        />
        <ModelPicker
          id="brief-design-model"
          surface={designSurface(designMode)}
          context={designContext}
          label="Design model"
          value={designModel}
          onChange={onDesignModelChange}
          note={designModelNote ?? undefined}
          error={modelErrors.designModel}
          disabled={submitting}
        />
      </div>

      {providersLoaded && !copyProviderReady && (
        <Notice tone="warning" className="mt-6" data-testid="caption-route-warning">
          {captionRouteMessage ??
            'No caption provider is set up. Ask a team admin to add one under Team settings > AI providers.'}
        </Notice>
      )}

      {error && (
        <Notice tone="error" className="mt-6">
          {error}
        </Notice>
      )}

      {submitting && (
        <Notice tone="info" className="mt-6 flex items-center gap-2">
          <Loader2 {...ICON} aria-hidden className="animate-spin" /> Generating your post — this can take up to a minute…
        </Notice>
      )}
    </div>
  )
}
