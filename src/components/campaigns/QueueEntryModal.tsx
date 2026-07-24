'use client'

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { GlassInput } from '@/components/ui/GlassInput'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'
import { apiFetch } from '@/lib/apiFetch'
import { CHANNEL_VALUES, channelLabel } from '@/lib/channels'
import type { AspectRatio, Channel } from '@prisma/client'
import type { ScheduledGeneration, PostGenerationAction } from '@/lib/api-types'

// Create/edit modal for a scheduled-generation queue entry. The per-post
// specifics (topic, prompt, size, path) mirror the brief wizard; the campaign
// briefing carries the shared 80%. Auto-publish actions are admin-only —
// non-admins see the radios disabled at HOLD.

interface TemplateOption {
  id: string
  name: string
  brandKitId: string
  aspectRatio: string
}

export interface QueueEntryModalProps {
  campaignId: string
  resolvedKitId: string | null
  isTeamAdmin: boolean
  // Present when editing an existing (PENDING) entry.
  entry?: ScheduledGeneration
  onClose: () => void
  onSaved: () => void
}

// datetime-local wants a local wall-clock string (no timezone suffix).
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const ACTION_OPTIONS: Array<{ value: PostGenerationAction; label: string; hint: string }> = [
  { value: 'HOLD', label: 'Hold for review', hint: 'Generates a draft; a human publishes it from the library.' },
  { value: 'SCHEDULE_PUBLISH', label: 'Schedule publish', hint: 'Auto-schedules the post for the publish time below.' },
  { value: 'PUBLISH_NOW', label: 'Publish immediately', hint: 'Publishes right after generation completes.' },
]

export function QueueEntryModal({ campaignId, resolvedKitId, isTeamAdmin, entry, onClose, onSaved }: QueueEntryModalProps) {
  const [topic, setTopic] = useState(entry?.topic ?? '')
  const [description, setDescription] = useState(entry?.description ?? '')
  const [goal, setGoal] = useState(entry?.goal ?? '')
  const [tone, setTone] = useState(entry?.tone ?? 'professional')
  const [channels, setChannels] = useState<Channel[]>(entry?.channels ?? [...CHANNEL_VALUES])
  const [aspectRatio, setAspectRatio] = useState(entry?.aspectRatio ?? 'SQUARE')
  const [designMode, setDesignMode] = useState(entry?.designMode ?? 'GENERATE')
  const [templateId, setTemplateId] = useState(entry?.templateId ?? '')
  const [generateAt, setGenerateAt] = useState(toLocalInput(entry?.generateAt) )
  const [postAction, setPostAction] = useState<PostGenerationAction>(entry?.postAction ?? 'HOLD')
  const [publishAt, setPublishAt] = useState(toLocalInput(entry?.publishAt))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Templates filtered to the campaign's resolved kit; the size filter is
  // applied client-side so switching sizes updates the picker immediately.
  const { data: templates = [] } = useQuery({
    queryKey: ['templates', resolvedKitId],
    queryFn: () => apiFetch<TemplateOption[]>(`/api/templates${resolvedKitId ? `?brandKitId=${resolvedKitId}` : ''}`),
    enabled: designMode === 'TEMPLATE',
  })
  const sizeTemplates = templates.filter(t => t.aspectRatio === aspectRatio)

  function toggleChannel(ch: Channel) {
    setChannels(prev => (prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]))
  }

  async function handleSave() {
    setError(null)
    setSubmitting(true)
    try {
      const body = {
        topic,
        description: description || undefined,
        goal,
        tone,
        channels,
        aspectRatio,
        designMode,
        templateId: designMode === 'TEMPLATE' ? templateId || undefined : undefined,
        generateAt: generateAt ? new Date(generateAt).toISOString() : undefined,
        postAction,
        publishAt: postAction === 'SCHEDULE_PUBLISH' && publishAt ? new Date(publishAt).toISOString() : undefined,
      }
      if (entry) {
        await apiFetch(`/api/campaigns/${campaignId}/queue/${entry.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } else {
        await apiFetch(`/api/campaigns/${campaignId}/queue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }
      onSaved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save entry')
    } finally {
      setSubmitting(false)
    }
  }

  const valid =
    topic.trim() &&
    goal.trim() &&
    tone.trim() &&
    channels.length > 0 &&
    generateAt &&
    (designMode !== 'TEMPLATE' || templateId) &&
    (postAction !== 'SCHEDULE_PUBLISH' || publishAt)

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={entry ? 'Edit planned post' : 'Plan a post'}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={submitting || !valid}>
            {submitting ? 'Saving…' : entry ? 'Save changes' : 'Add to queue'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <GlassInput
          label="Topic"
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="Short post title (names the post in the library)"
        />

        <div>
          <label className="text-sm font-medium text-light-text dark:text-dark-text block mb-1">
            Post specifics
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            placeholder="What this specific post should say — the campaign briefing carries the rest."
            className="glass-input rounded-xl px-3 py-2.5 text-sm w-full text-light-text dark:text-dark-text resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <GlassInput label="Goal" value={goal} onChange={e => setGoal(e.target.value)} placeholder="e.g. Awareness" />
          <GlassInput label="Tone" value={tone} onChange={e => setTone(e.target.value)} placeholder="e.g. professional" />
        </div>

        <div>
          <p className="text-sm font-medium text-light-text dark:text-dark-text mb-2">Channels</p>
          <div className="flex gap-3">
            {CHANNEL_VALUES.map(ch => (
              <label key={ch} className="flex items-center gap-2 cursor-pointer text-sm text-light-text dark:text-dark-text">
                <input
                  type="checkbox"
                  checked={channels.includes(ch)}
                  onChange={() => toggleChannel(ch)}
                  className="accent-primary dark:accent-primary-light"
                />
                {channelLabel(ch)}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-sm font-medium text-light-text dark:text-dark-text mb-2">Size</p>
            <SegmentedToggle
              options={[
                { value: 'SQUARE', label: '1:1' },
                { value: 'PORTRAIT', label: '4:5' },
                { value: 'STORY', label: '9:16' },
              ]}
              value={aspectRatio}
              onChange={v => setAspectRatio(v as AspectRatio)}
            />
          </div>
          <div>
            <p className="text-sm font-medium text-light-text dark:text-dark-text mb-2">Design</p>
            <SegmentedToggle
              options={[
                { value: 'GENERATE', label: 'Freeform' },
                { value: 'TEMPLATE', label: 'Template' },
              ]}
              value={designMode}
              onChange={v => setDesignMode(v as 'GENERATE' | 'TEMPLATE')}
            />
          </div>
        </div>

        {designMode === 'TEMPLATE' && (
          <div>
            <label className="text-sm font-medium text-light-text dark:text-dark-text block mb-1">Template</label>
            <Select
              options={[
                { value: '', label: sizeTemplates.length ? 'Select a template…' : 'No templates for this size' },
                ...sizeTemplates.map(t => ({ value: t.id, label: t.name })),
              ]}
              value={templateId}
              onChange={e => setTemplateId(e.target.value)}
            />
          </div>
        )}

        <GlassInput
          label="Generate at"
          type="datetime-local"
          value={generateAt}
          onChange={e => setGenerateAt(e.target.value)}
        />

        <div>
          <p className="text-sm font-medium text-light-text dark:text-dark-text mb-2">After generation</p>
          <div className="space-y-2">
            {ACTION_OPTIONS.map(opt => {
              const disabled = !isTeamAdmin && opt.value !== 'HOLD'
              return (
                <label
                  key={opt.value}
                  className={`flex items-start gap-2 text-sm ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} text-light-text dark:text-dark-text`}
                >
                  <input
                    type="radio"
                    name="postAction"
                    checked={postAction === opt.value}
                    onChange={() => setPostAction(opt.value)}
                    disabled={disabled}
                    className="mt-0.5 accent-primary dark:accent-primary-light"
                  />
                  <span>
                    {opt.label}
                    <span className="block text-xs text-light-text-muted dark:text-dark-text-muted">{opt.hint}</span>
                  </span>
                </label>
              )
            })}
          </div>
          {!isTeamAdmin && (
            <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1">
              Auto-publish requires admin.
            </p>
          )}
        </div>

        {postAction === 'SCHEDULE_PUBLISH' && (
          <GlassInput
            label="Publish at"
            type="datetime-local"
            value={publishAt}
            onChange={e => setPublishAt(e.target.value)}
          />
        )}

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </Modal>
  )
}
