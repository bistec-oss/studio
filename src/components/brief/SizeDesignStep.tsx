'use client'

import React from 'react'
import { Sparkles, Check, Upload, Loader2 } from 'lucide-react'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Notice } from '@/components/ui/Notice'
import type { AspectRatio } from '@prisma/client'
import { ASPECT_LABELS } from '@/lib/aspectRatio'
import { imageStyleOptions, getArchetype } from '@/lib/designData'
import type { CompositeSource } from '@/lib/brief/compositeSource'
import { screenshotWillLetterbox } from '@/lib/brief/wizardStyleState'
import type { Campaign, TemplateSummary } from '@/lib/api-types'
import { ASPECT_OPTIONS, SOURCE_LABEL } from './constants'
import type { DesignMode, ResolvedKit } from './types'
import { cardCls } from './cardCls'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { ICON } from '@/components/ui/atoms'
import { StepHead } from './StepHead'
import { PostStylePicker } from './PostStylePicker'
import { TemplateCard } from './TemplateCard'

// ─── Step 1 — Size & Design ──────────────────────────────────────────────────

interface SizeDesignStepProps {
  aspectRatio: AspectRatio
  setAspectRatio: (v: AspectRatio) => void
  campaignId: string
  resolvedKit: ResolvedKit | null
  selectedCampaign: Campaign | null
  brandKitId: string
  setBrandKitId: (id: string) => void
  brandKitOptions: { value: string; label: string }[]
  postStyle: string
  setPostStyle: (key: string) => void
  imageStyle: string
  setImageStyle: (key: string) => void
  /** True when the image style shown is the post style's own default. */
  imageStyleFromStyle?: boolean
  designMode: DesignMode
  setDesignMode: (m: DesignMode) => void
  templateId: string
  setTemplateId: (id: string) => void
  referenceTemplateId: string
  setReferenceTemplateId: (id: string) => void
  visibleTemplates: TemplateSummary[]
  /** 025 FR-17: the per-post product screenshot (Path B). */
  compositeSource: CompositeSource | null
  screenshotUploading: boolean
  screenshotError: string | null
  screenshotInputRef: React.RefObject<HTMLInputElement | null>
  onScreenshotPicked: (files: FileList | null) => Promise<void>
  removeScreenshot: () => void
}

// One field group per section, ruled apart on --line-subtle (DESIGN_SYSTEM.md §6).
const SECTION = 'py-5 border-t border-line-subtle last:pb-0'
// An empty state inside the step's card: a recessed canvas well with a hairline.
const EMPTY = 'rounded-ui-md bg-canvas px-4 py-3 ring-1 ring-inset ring-line-subtle text-ui-sm text-fg-muted'

export function SizeDesignStep({
  aspectRatio,
  setAspectRatio,
  campaignId,
  resolvedKit,
  selectedCampaign,
  brandKitId,
  setBrandKitId,
  brandKitOptions,
  postStyle,
  setPostStyle,
  imageStyle,
  setImageStyle,
  imageStyleFromStyle,
  designMode,
  setDesignMode,
  templateId,
  setTemplateId,
  referenceTemplateId,
  setReferenceTemplateId,
  visibleTemplates,
  compositeSource,
  screenshotUploading,
  screenshotError,
  screenshotInputRef,
  onScreenshotPicked,
  removeScreenshot,
}: SizeDesignStepProps) {
  // 025 FR-17: a look that needs a screenshot, picked with none held, makes the
  // field required. The advisory is never a refusal.
  const needsScreenshot = !!getArchetype(imageStyle)?.requires && !compositeSource
  const letterbox = compositeSource ? screenshotWillLetterbox(aspectRatio, compositeSource) : false
  return (
    <div>
      <StepHead title={<>Size &amp; Design</>}>
        Choose the post size, which brand kit to use, and how the design is generated.
        You&apos;ll pick where to publish (Instagram / LinkedIn) at publish time.
      </StepHead>

      {/* Post style (027 FR-07): above the size and design choices, so the image
          style lower on this step is pre-filled from it. */}
      <div className="pb-5">
        <PostStylePicker value={postStyle} onChange={setPostStyle} />
      </div>

      {/* Post size */}
      <div className={SECTION}>
        <FieldLabel className="mb-2.5">Post size</FieldLabel>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {ASPECT_OPTIONS.map(({ value, icon: Icon, sub }) => {
            const selected = aspectRatio === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => setAspectRatio(value)}
                aria-pressed={selected}
                className={cardCls(selected, 'flex items-center gap-3 p-4')}
              >
                <Icon size={20} strokeWidth={1.6} aria-hidden className={selected ? 'text-fg' : 'text-fg-muted'} />
                <span className="min-w-0">
                  <span className="block text-ui-base font-semibold leading-tight text-fg">
                    {ASPECT_LABELS[value]}
                  </span>
                  <span className="block text-ui-xs text-fg-muted">{sub} px</span>
                </span>
                {selected && <Check {...ICON} aria-hidden className="ml-auto text-accent flex-shrink-0" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Brand kit */}
      <div className={SECTION}>
        <Select
          label="Brand kit"
          options={brandKitOptions}
          value={brandKitId}
          onChange={e => setBrandKitId(e.target.value)}
        />
        <p className="mt-2 text-ui-xs text-fg-muted">
          {campaignId && resolvedKit && brandKitId === resolvedKit.id
            ? `Defaulted from “${selectedCampaign?.name ?? 'campaign'}” (${SOURCE_LABEL[resolvedKit.source] ?? resolvedKit.source}). Override here if needed.`
            : 'Templates below are filtered to the selected brand kit.'}
        </p>
        {brandKitId === '' && (
          <p className="text-ui-xs text-status-failed mt-1">Select a brand kit to continue.</p>
        )}
      </div>

      {/* Path */}
      <div className={SECTION}>
        <FieldLabel className="mb-2.5">Design mode</FieldLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              setDesignMode('TEMPLATE')
              setReferenceTemplateId('')
            }}
            aria-pressed={designMode === 'TEMPLATE'}
            className={cardCls(designMode === 'TEMPLATE', 'p-4')}
          >
            <div className="text-ui-base font-semibold leading-tight text-fg mb-1.5">
              Template
            </div>
            <div className="text-ui-xs text-fg-muted">
              Fills a pre-built HTML/CSS brand template. Consistent, on-brand output.
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              setDesignMode('GENERATE')
              setTemplateId('')
            }}
            aria-pressed={designMode === 'GENERATE'}
            className={cardCls(designMode === 'GENERATE', 'p-4')}
          >
            <div className="text-ui-base font-semibold leading-tight text-fg mb-1.5">
              Freeform
            </div>
            <div className="text-ui-xs text-fg-muted">
              Designs a new HTML/CSS layout from scratch. Maximum creative flexibility.
            </div>
          </button>
        </div>
      </div>

      {/* Image style — Path B only (009 FR-03). A style an archetype can't draw
          at the chosen size is disabled with its reason, never hidden. */}
      {designMode === 'GENERATE' && (
        <div className={SECTION} data-testid="image-style-section">
          <FieldLabel className="mb-2.5">Image style</FieldLabel>
          <p className="text-ui-xs text-fg-muted mb-3">
            A hero style asks for an image made for the layout. If it can&apos;t be used, the classic style is used and
            the post says why.
          </p>
          {imageStyleFromStyle && (
            <p className="mb-3 text-ui-xs text-fg-muted" data-testid="image-style-from-style">
              Pre-selected from the post style. Pick another to keep your choice.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {imageStyleOptions(aspectRatio, undefined, { hasCompositeSource: compositeSource !== null }).map(opt => {
              const selected = imageStyle === opt.key
              return (
                <button
                  key={opt.key}
                  type="button"
                  disabled={!opt.supported}
                  onClick={() => setImageStyle(opt.key)}
                  aria-pressed={selected}
                  data-testid={`image-style-${opt.key}`}
                  className={cardCls(selected, 'p-4 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none')}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-ui-base font-semibold leading-tight text-fg">{opt.label}</span>
                    {selected && <Check {...ICON} aria-hidden className="ml-auto text-accent flex-shrink-0" />}
                  </div>
                  <div className="mt-1.5 text-ui-xs text-fg-muted">{opt.summary}</div>
                  {!opt.supported && (
                    <div className="mt-1.5 text-ui-xs text-fg-muted">
                      {opt.reason ?? `Not available for the ${ASPECT_LABELS[aspectRatio]} size`}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Product screenshot — Path B (025 FR-17). Outside the image-style section so
          the look cards stay the only pressed buttons there. */}
      {designMode === 'GENERATE' && (
        <div className={SECTION} data-testid="screenshot-section">
          <FieldLabel as="span" id="screenshot-label" className="mb-1">
            Product screenshot{' '}
            <span className="font-normal text-fg-muted">{needsScreenshot ? '(required)' : '(optional)'}</span>
          </FieldLabel>
          <p id="screenshot-help" className="text-ui-xs text-fg-muted mb-3">
            Needed for the Product screen image style, which shows it on a laptop. PNG, JPEG or WebP, up to 10 MB, at
            least 640×400 px. It is private to you and your team.
          </p>
          <input
            ref={screenshotInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            aria-label="Product screenshot file"
            data-testid="screenshot-input"
            tabIndex={-1}
            onChange={e => onScreenshotPicked(e.target.files)}
          />
          {compositeSource ? (
            <div className="flex items-center gap-3" data-testid="screenshot-preview">
              <span className="h-16 w-24 flex-shrink-0 overflow-hidden rounded-ui-sm border border-line-subtle bg-surface flex items-center justify-center">
                {/* The user's own screenshot, shown as uploaded: never token-styled. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/briefs/screenshots?key=${encodeURIComponent(compositeSource.key)}`}
                  alt="Product screenshot preview"
                  className="h-full w-full object-contain"
                />
              </span>
              <span className="min-w-0 flex-1 font-mono text-ui-xs text-fg-muted">
                {compositeSource.width}×{compositeSource.height} px
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={removeScreenshot}
                aria-label="Remove product screenshot"
                data-testid="screenshot-remove"
              >
                Remove
              </Button>
            </div>
          ) : (
            <Button
              variant="secondary"
              onClick={() => screenshotInputRef.current?.click()}
              disabled={screenshotUploading}
              aria-describedby="screenshot-help"
              data-testid="screenshot-add"
            >
              {screenshotUploading ? (
                <><Loader2 {...ICON} aria-hidden className="animate-spin" /> Uploading…</>
              ) : (
                <><Upload {...ICON} aria-hidden /> Add screenshot</>
              )}
            </Button>
          )}
          {/* One persistent live region, so the advisory and the required state are announced. */}
          <div role="status" className="mt-2 space-y-2" data-testid="screenshot-status">
            {letterbox && (
              <p className="text-ui-xs text-fg-muted" data-testid="screenshot-advisory">
                Will be letterboxed: this screenshot&apos;s shape differs from the laptop screen, so it is fitted inside
                it with bars at the sides or the top and bottom.
              </p>
            )}
            {needsScreenshot && !screenshotUploading && (
              <p className="text-ui-xs text-status-failed" data-testid="screenshot-required">
                Add a product screenshot to use the Product screen style.
              </p>
            )}
          </div>
          {screenshotError && (
            <Notice tone="error" role="alert" className="mt-2" data-testid="screenshot-error">
              {screenshotError}
            </Notice>
          )}
        </div>
      )}

      {/* Template picker — Path A */}
      {designMode === 'TEMPLATE' && (
        <div className={SECTION}>
          <FieldLabel className="mb-2.5">Template</FieldLabel>
          {!brandKitId ? (
            <div className={EMPTY}>
              Select a brand kit above to see its templates.
            </div>
          ) : visibleTemplates.length === 0 ? (
            <div className={EMPTY}>
              This brand kit has no {ASPECT_LABELS[aspectRatio]} templates. Add one under Brand kits, change the size or kit, or switch to Freeform.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {visibleTemplates.map(t => (
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
        <div className={SECTION}>
          <FieldLabel className="mb-2.5">
            Style reference <span className="font-normal text-fg-muted">(optional)</span>
          </FieldLabel>
          <p className="text-ui-xs text-fg-muted mb-3">
            Used for visual inspiration only — it won&apos;t copy the layout exactly.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setReferenceTemplateId('')}
              aria-pressed={referenceTemplateId === ''}
              className={cardCls(referenceTemplateId === '', 'flex items-center gap-3 p-3')}
            >
              <span className="w-8 h-8 rounded-ui-sm bg-canvas ring-1 ring-inset ring-line-subtle flex items-center justify-center flex-shrink-0">
                <Sparkles {...ICON} aria-hidden className="text-fg-muted" />
              </span>
              <span className="text-ui-sm font-semibold text-fg">No reference</span>
            </button>
            {visibleTemplates.map(t => (
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
  )
}
