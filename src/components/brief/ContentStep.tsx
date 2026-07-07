'use client'

import React, { useState } from 'react'
import { toast } from 'sonner'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { apiFetch } from '@/lib/apiFetch'
import { FieldLabel } from './FieldLabel'
import { GOAL_OPTIONS, TONE_OPTIONS } from './constants'

// ─── Step 2 — Content ────────────────────────────────────────────────────────

interface ContentStepProps {
  topic: string
  setTopic: (v: string) => void
  prompt: string
  setPrompt: (v: string) => void
  goal: string
  setGoal: (v: string) => void
  tone: string
  setTone: (v: string) => void
  // Context for the AI enhance call — matches generation-time grounding.
  campaignId: string
  brandKitId: string
}

export function ContentStep({ topic, setTopic, prompt, setPrompt, goal, setGoal, tone, setTone, campaignId, brandKitId }: ContentStepProps) {
  const [enhancing, setEnhancing] = useState(false)
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
      <h2 className="text-base font-bold text-light-text dark:text-dark-text mb-1">Brief &amp; Copy Direction</h2>
      <p className="text-sm text-light-text-muted dark:text-dark-text-muted mb-6">
        Give the post a short topic, tell Claude what it&apos;s about, then pick a goal and tone.
      </p>

      <FieldLabel>Topic</FieldLabel>
      <input
        type="text"
        value={topic}
        onChange={e => setTopic(e.target.value)}
        placeholder="e.g. Q3 product launch"
        maxLength={120}
        autoFocus
        className="glass-input w-full rounded-xl px-4 py-3 text-sm text-light-text dark:text-dark-text placeholder:text-light-text-muted dark:placeholder:text-dark-text-muted focus:outline-none"
      />
      <div className="mt-1.5 mb-4 text-xs text-light-text-muted dark:text-dark-text-muted">
        A short title — it names this post in the library.
      </div>

      <FieldLabel>Brief</FieldLabel>
      {enhanceResult ? (
        <div className="space-y-3 mb-5">
          {enhanceResult.original.trim() && (
            <div>
              <p className="text-xs font-medium text-light-text-muted dark:text-dark-text-muted mb-1">Before</p>
              <div className="glass-input rounded-xl p-3 text-sm text-light-text-muted dark:text-dark-text-muted whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                {enhanceResult.original}
              </div>
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-primary dark:text-primary-light mb-1">AI suggestion</p>
            <div className="glass-input rounded-xl p-3 text-sm text-light-text dark:text-dark-text whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
              {enhanceResult.draft}
            </div>
          </div>
          <div className="flex gap-2">
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
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="e.g. Announce our Q3 product launch with excitement. Highlight that it saves the marketing team hours on post creation. Include a CTA to try it."
            rows={6}
            className="glass-input w-full rounded-xl px-4 py-3 text-sm text-light-text dark:text-dark-text placeholder:text-light-text-muted dark:placeholder:text-dark-text-muted resize-none focus:outline-none"
          />
          <div className="mt-1.5 flex items-start justify-between gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={enhance}
              disabled={enhancing || (!topic.trim() && !prompt.trim())}
            >
              <Sparkles size={13} /> {enhancing ? 'Enhancing…' : 'Enhance with AI'}
            </Button>
            <div className="text-right text-xs text-light-text-muted dark:text-dark-text-muted pt-1">
              {prompt.length} chars{prompt.trim().length > 0 && prompt.trim().length <= 10 ? ' — add a little more detail' : ''}
            </div>
          </div>
          <div className="mt-1.5 mb-5 text-xs text-light-text-muted dark:text-dark-text-muted">
            {enhancing
              ? 'Rewriting with the brand voice and campaign context — this can take up to a minute.'
              : 'Rewrites the brief with AI, grounded in the brand voice and campaign briefing. Works from just the topic too.'}
          </div>
        </>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select label="Goal" options={GOAL_OPTIONS} value={goal} onChange={e => setGoal(e.target.value)} />
        <Select label="Tone" options={TONE_OPTIONS} value={tone} onChange={e => setTone(e.target.value)} />
      </div>
    </div>
  )
}
