'use client'

import React, { useState } from 'react'
import { toast } from 'sonner'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { apiFetch } from '@/lib/apiFetch'
import { fieldClasses, fieldEdge, inputClasses } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { EYEBROW, ICON, SCROLL_FOCUS, SMALL_CAPS } from '@/components/ui/atoms'
import { StepHead } from './StepHead'
import { TONE_OPTIONS } from './constants'

// ─── Step 2 — Content ────────────────────────────────────────────────────────

interface ContentStepProps {
  topic: string
  setTopic: (v: string) => void
  prompt: string
  setPrompt: (v: string) => void
  // The goal the post style stands for; sent to the enhance call, never chosen here.
  goal: string
  tone: string
  setTone: (v: string) => void
  // 027 FR-07: true while the tone is the style's (or the campaign's), not the user's.
  toneFromStyle?: boolean
  // Context for the AI enhance call — matches generation-time grounding.
  campaignId: string
  brandKitId: string
}

export function ContentStep({ topic, setTopic, prompt, setPrompt, goal, tone, setTone, toneFromStyle, campaignId, brandKitId }: ContentStepProps) {
  const [enhancing, setEnhancing] = useState(false)
  // The Topic and Brief labels name their fields (014 FR-12 rows 4, 5).
  const topicId = React.useId()
  const briefId = React.useId()
  // Before/after review: the AI rewrite only reaches the brief on Accept.
  const [enhanceResult, setEnhanceResult] = useState<{ original: string; draft: string } | null>(null)

  async function enhance() {
    setEnhancing(true)
    try {
      const { draft } = await apiFetch<{ draft: string }>('/api/briefs/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          content: prompt,
          goal,
          tone,
          campaignId: campaignId || undefined,
          brandKitId: brandKitId || undefined,
        }),
      })
      setEnhanceResult({ original: prompt, draft })
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Enhance failed')
    } finally {
      setEnhancing(false)
    }
  }

  return (
    <div>
      <StepHead title={<>Description &amp; caption direction</>}>
        Give the post a short topic, describe what it&apos;s about, then check the tone.
      </StepHead>

      <FieldLabel htmlFor={topicId} className="mb-2.5">Topic</FieldLabel>
      <input
        id={topicId}
        type="text"
        value={topic}
        onChange={e => setTopic(e.target.value)}
        placeholder="e.g. Q3 product launch"
        maxLength={120}
        autoFocus
        className={cn(inputClasses, fieldEdge())}
      />
      <div className="mt-2 mb-6 text-ui-xs text-fg-muted">
        A short title — it names this post in the library.
      </div>

      {/* While the AI suggestion is up there is no textarea, so nothing to point at. */}
      <FieldLabel htmlFor={enhanceResult ? undefined : briefId} className="mb-2.5">Description</FieldLabel>
      {enhanceResult ? (
        <div className="space-y-4 mb-6">
          {/* "Before" and "AI suggestion" stay micro-labels: panel captions (021 FR-07). */}
          {enhanceResult.original.trim() && (
            <div>
              <p className={`${EYEBROW} mb-1.5`}>Before</p>
              {/* A scroll container: focusable and labelled so the keyboard can scroll it. */}
              <div
                tabIndex={0}
                role="region"
                aria-label="Before"
                className={`rounded-ui-md bg-canvas px-4 py-3 ring-1 ring-inset ring-line-subtle text-ui-sm text-fg-muted whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto ${SCROLL_FOCUS}`}
              >
                {enhanceResult.original}
              </div>
            </div>
          )}
          <div>
            <p className={`${SMALL_CAPS} text-accent mb-1.5`}>AI suggestion</p>
            <div
              tabIndex={0}
              role="region"
              aria-label="AI suggestion"
              className={`rounded-ui-md bg-surface-raised px-4 py-3 shadow-panel ring-[1.5px] ring-inset ring-fg text-ui-sm text-fg whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto ${SCROLL_FOCUS}`}
            >
              {enhanceResult.draft}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => { setPrompt(enhanceResult.draft); setEnhanceResult(null) }}>
              Accept suggestion
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEnhanceResult(null)}>
              Discard
            </Button>
          </div>
        </div>
      ) : (
        <>
          <textarea
            id={briefId}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="e.g. Announce our Q3 product launch with excitement. Highlight that it saves the marketing team hours on post creation. Include a CTA to try it."
            rows={6}
            className={cn(fieldClasses, fieldEdge(), 'resize-none leading-relaxed')}
          />
          <div className="mt-2 flex items-start justify-between gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={enhance}
              disabled={enhancing || (!topic.trim() && !prompt.trim())}
            >
              <Sparkles {...ICON} aria-hidden /> {enhancing ? 'Enhancing…' : 'Enhance with AI'}
            </Button>
            <div className="text-right font-mono text-ui-2xs text-fg-muted pt-2">
              {prompt.length} chars{prompt.trim().length > 0 && prompt.trim().length <= 10 ? ' — add a little more detail' : ''}
            </div>
          </div>
          <div className="mt-2 mb-6 text-ui-xs text-fg-muted">
            {enhancing
              ? 'Rewriting with the brand voice and campaign documents — this can take up to a minute.'
              : 'Rewrites the brief with AI, grounded in the brand voice and campaign briefing. Works from just the topic too.'}
          </div>
        </>
      )}

      <div className="pt-5 border-t border-line-subtle sm:max-w-xs">
        <Select label="Tone" options={TONE_OPTIONS} value={tone} onChange={e => setTone(e.target.value)} />
        {toneFromStyle && (
          <p className="mt-2 text-ui-xs text-fg-muted" data-testid="tone-from-style">
            From the post style. Change it if you want a different tone.
          </p>
        )}
      </div>
    </div>
  )
}
