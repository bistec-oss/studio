'use client'

import React from 'react'
import { Select } from '@/components/ui/Select'
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
}

export function ContentStep({ topic, setTopic, prompt, setPrompt, goal, setGoal, tone, setTone }: ContentStepProps) {
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
      <textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="e.g. Announce our Q3 product launch with excitement. Highlight that it saves the marketing team hours on post creation. Include a CTA to try it."
        rows={6}
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
  )
}
