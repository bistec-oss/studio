'use client'

import React from 'react'
import { Sparkles, Check } from 'lucide-react'
import { Select } from '@/components/ui/Select'
import type { AspectRatio } from '@prisma/client'
import { ASPECT_LABELS } from '@/lib/aspectRatio'
import type { Campaign, TemplateSummary } from '@/lib/api-types'
import { ASPECT_OPTIONS, SOURCE_LABEL } from './constants'
import type { DesignMode, ResolvedKit } from './types'
import { cardCls } from './cardCls'
import { FieldLabel } from './FieldLabel'
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
  designMode: DesignMode
  setDesignMode: (m: DesignMode) => void
  templateId: string
  setTemplateId: (id: string) => void
  referenceTemplateId: string
  setReferenceTemplateId: (id: string) => void
  visibleTemplates: TemplateSummary[]
}

export function SizeDesignStep({
  aspectRatio,
  setAspectRatio,
  campaignId,
  resolvedKit,
  selectedCampaign,
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
}: SizeDesignStepProps) {
  return (
    <div>
      <h2 className="text-base font-bold text-light-text dark:text-dark-text mb-1">
        Size &amp; Design
      </h2>
      <p className="text-sm text-light-text-muted dark:text-dark-text-muted mb-6">
        Choose the post size, which brand kit to use, and how the design is generated.
        You&apos;ll pick where to publish (Instagram / LinkedIn) at publish time.
      </p>

      {/* Post size */}
      <div className="mb-6">
        <FieldLabel>Post Size</FieldLabel>
        <div className="grid grid-cols-3 gap-3">
          {ASPECT_OPTIONS.map(({ value, icon: Icon, sub }) => {
            const selected = aspectRatio === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => setAspectRatio(value)}
                className={cardCls(selected, 'flex items-center gap-3 p-4')}
              >
                <Icon size={20} className={selected ? 'text-primary dark:text-primary-light' : 'text-light-text-muted dark:text-dark-text-muted'} />
                <span className="min-w-0">
                  <span className={['block font-semibold text-sm', selected ? 'text-primary dark:text-primary-light' : 'text-light-text dark:text-dark-text'].join(' ')}>
                    {ASPECT_LABELS[value]}
                  </span>
                  <span className="block text-xs text-light-text-muted dark:text-dark-text-muted">{sub} px</span>
                </span>
                {selected && <Check size={15} className="ml-auto text-primary dark:text-primary-light flex-shrink-0" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Brand kit */}
      <div className="mb-6">
        <FieldLabel>Brand Kit</FieldLabel>
        <Select
          options={brandKitOptions}
          value={brandKitId}
          onChange={e => setBrandKitId(e.target.value)}
        />
        <p className="mt-1.5 text-xs text-light-text-muted dark:text-dark-text-muted">
          {campaignId && resolvedKit && brandKitId === resolvedKit.id
            ? `Defaulted from “${selectedCampaign?.name ?? 'campaign'}” (${SOURCE_LABEL[resolvedKit.source] ?? resolvedKit.source}). Override here if needed.`
            : 'Templates below are filtered to the selected brand kit.'}
        </p>
        {brandKitId === '' && (
          <p className="text-xs text-red-500 dark:text-red-400 mt-1">Select a brand kit to continue.</p>
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
          {!brandKitId ? (
            <div className="glass-input rounded-xl px-3 py-3 text-sm text-light-text-muted dark:text-dark-text-muted">
              Select a brand kit above to see its templates.
            </div>
          ) : visibleTemplates.length === 0 ? (
            <div className="glass-input rounded-xl px-3 py-3 text-sm text-light-text-muted dark:text-dark-text-muted">
              This brand kit has no {ASPECT_LABELS[aspectRatio]} templates. Add one under Admin → Brand Kits, change the size or kit, or switch to Path B.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
