'use client'

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { Input, fieldClasses, fieldEdge, fieldErrorClasses } from '@/components/ui/Input'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'
import { apiFetch } from '@/lib/apiFetch'
import { cn } from '@/lib/utils'
import { CHANNEL_VALUES, channelLabel } from '@/lib/channels'
import type { AspectRatio, Channel } from '@prisma/client'
import type { ScheduledGeneration, PostGenerationAction } from '@/lib/api-types'
import { postStyleOptions } from './postStyleOptions'

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
  // 027 FR-06: the post style ('' = the campaign's default, else General). The
  // goal is no longer typed: the style sets it. A new entry leaves the tone
  // blank so the style (or the campaign) sets it; an edit shows the stored one.
  const [postStyle, setPostStyle] = useState(entry?.postStyle ?? '')
  const [tone, setTone] = useState(entry?.tone ?? '')
  const [channels, setChannels] = useState<Channel[]>(entry?.channels ?? [...CHANNEL_VALUES])
  const [aspectRatio, setAspectRatio] = useState(entry?.aspectRatio ?? 'SQUARE')
  const [designMode, setDesignMode] = useState(entry?.designMode ?? 'GENERATE')
  const [templateId, setTemplateId] = useState(entry?.templateId ?? '')
  const [generateAt, setGenerateAt] = useState(toLocalInput(entry?.generateAt) )
  const [postAction, setPostAction] = useState<PostGenerationAction>(entry?.postAction ?? 'HOLD')
  const [publishAt, setPublishAt] = useState(toLocalInput(entry?.publishAt))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const specificsId = React.useId()
  const channelsId = React.useId()
  const actionId = React.useId()

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
        // Blank = not sent: the server resolves it (an edit keeps the stored one).
        postStyle: postStyle || undefined,
        tone: tone.trim() || undefined,
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
      setError(e instanceof Error ? e.message : 'Failed to save planned post')
    } finally {
      setSubmitting(false)
    }
  }

  const valid =
    topic.trim() &&
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
      <div className="space-y-5">
        <Input
          label="Topic"
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="Short post title (names the post in the library)"
        />

        <div>
          <FieldLabel htmlFor={specificsId} className="mb-1.5">
            Post specifics
          </FieldLabel>
          <textarea
            id={specificsId}
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            placeholder="What this specific post should say — the campaign briefing carries the rest."
            className={cn(fieldClasses, fieldEdge(), 'resize-none leading-relaxed')}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label="Post style"
            data-testid="queue-post-style"
            options={postStyleOptions(entry ? 'Not set' : 'Campaign default', entry?.postStyle)}
            value={postStyle}
            onChange={e => setPostStyle(e.target.value)}
          />
          <Input
            label="Tone"
            value={tone}
            onChange={e => setTone(e.target.value)}
            placeholder="From the post style"
          />
        </div>

        <div>
          <FieldLabel as="span" id={channelsId} className="mb-2">Channels</FieldLabel>
          <div role="group" aria-labelledby={channelsId} className="flex flex-wrap gap-x-5 gap-y-2">
            {CHANNEL_VALUES.map(ch => (
              <label key={ch} className="flex cursor-pointer items-center gap-2 text-ui-sm text-fg">
                <input
                  type="checkbox"
                  checked={channels.includes(ch)}
                  onChange={() => toggleChannel(ch)}
                  className="accent-accent"
                />
                {channelLabel(ch)}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel as="span" className="mb-2">Size</FieldLabel>
            <SegmentedToggle
              options={[
                { value: 'SQUARE', label: '1:1' },
                { value: 'PORTRAIT', label: '4:5' },
                { value: 'STORY', label: '9:16' },
              ]}
              value={aspectRatio}
              onChange={v => setAspectRatio(v as AspectRatio)}
              label="Size"
            />
          </div>
          <div>
            <FieldLabel as="span" className="mb-2">Design</FieldLabel>
            <SegmentedToggle
              options={[
                { value: 'GENERATE', label: 'Freeform' },
                { value: 'TEMPLATE', label: 'Template' },
              ]}
              value={designMode}
              onChange={v => setDesignMode(v as 'GENERATE' | 'TEMPLATE')}
              label="Design"
            />
          </div>
        </div>

        {designMode === 'TEMPLATE' && (
          <Select
            label="Template"
            options={[
              { value: '', label: sizeTemplates.length ? 'Select a template…' : 'No templates for this size' },
              ...sizeTemplates.map(t => ({ value: t.id, label: t.name })),
            ]}
            value={templateId}
            onChange={e => setTemplateId(e.target.value)}
          />
        )}

        <Input
          label="Generate at"
          type="datetime-local"
          value={generateAt}
          onChange={e => setGenerateAt(e.target.value)}
        />

        <div>
          <FieldLabel as="span" id={actionId} className="mb-2">After generation</FieldLabel>
          <div role="radiogroup" aria-labelledby={actionId} className="space-y-2.5">
            {ACTION_OPTIONS.map(opt => {
              const disabled = !isTeamAdmin && opt.value !== 'HOLD'
              return (
                <label
                  key={opt.value}
                  className={`flex items-start gap-2 text-ui-sm text-fg ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                >
                  <input
                    type="radio"
                    name="postAction"
                    checked={postAction === opt.value}
                    onChange={() => setPostAction(opt.value)}
                    disabled={disabled}
                    className="mt-1 accent-accent"
                  />
                  <span>
                    {opt.label}
                    <span className="block text-ui-xs text-fg-muted">{opt.hint}</span>
                  </span>
                </label>
              )
            })}
          </div>
          {!isTeamAdmin && (
            <p className="mt-1.5 text-ui-xs text-fg-muted">
              Auto-publish requires a team admin.
            </p>
          )}
        </div>

        {postAction === 'SCHEDULE_PUBLISH' && (
          <Input
            label="Publish at"
            type="datetime-local"
            value={publishAt}
            onChange={e => setPublishAt(e.target.value)}
          />
        )}

        {error && <p className={fieldErrorClasses}>{error}</p>}
      </div>
    </Modal>
  )
}
