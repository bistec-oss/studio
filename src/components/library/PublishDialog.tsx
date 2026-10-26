'use client'

import React, { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input, fieldErrorClasses } from '@/components/ui/Input'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { Button } from '@/components/ui/Button'
import { apiFetch } from '@/lib/apiFetch'
import { CHANNEL_VALUES, channelLabel } from '@/lib/channels'
import type { Channel } from '@prisma/client'
import { publishLineFor } from '@/lib/renderedText/noticeText'
import type { HeadlineState } from '@/lib/renderedText/vocab'

// Shared publish dialog: pick one or more channels and an optional schedule, then
// fire a POST /api/posts per channel. Used from both the Library grid and the
// draft review page so the publish UX (and validation) stays identical. It sits
// on Modal's overlay surface (021 design.md §4.3); its props stay stable (010).

const CHANNELS = CHANNEL_VALUES

export interface PublishDialogProps {
  draftId: string
  // 030 FR-14: a non-blocking line when the image may show an older headline.
  headlineState?: HeadlineState
  onClose: () => void
  onSuccess: () => void
}

// Per-channel outcome of the last Confirm — channels that succeeded are locked
// so re-confirming after a partial failure can't double-post them. A channel
// whose request rejects — a 502 PUBLISH_FAILED from the platform (017 FR-03),
// or a 409 duplicate / 422 caption refusal — shows "✕ failed" with its reason,
// stays unlocked, and keeps the dialog open: onSuccess (which closes it) fires
// only when every checked channel worked.
type ChannelOutcome = { ok: true } | { ok: false; message: string }

export function PublishDialog({ draftId, headlineState, onClose, onSuccess }: PublishDialogProps) {
  const headlineLine = headlineState ? publishLineFor(headlineState) : null
  const [checkedChannels, setCheckedChannels] = useState<Channel[]>([])
  const [scheduledAt, setScheduledAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcomes, setOutcomes] = useState<Partial<Record<Channel, ChannelOutcome>>>({})
  const channelsId = React.useId()

  function toggleChannel(ch: Channel) {
    setCheckedChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    )
  }

  async function handleConfirm() {
    // Skip channels that already succeeded in a previous partial attempt.
    const toPublish = checkedChannels.filter((ch) => outcomes[ch]?.ok !== true)
    if (toPublish.length === 0 && checkedChannels.length === 0) {
      setError('Select at least one channel.')
      return
    }
    setSubmitting(true)
    setError(null)
    const settled = await Promise.allSettled(
      toPublish.map((channel) =>
        apiFetch('/api/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draftId,
            channel,
            scheduledAt: scheduledAt || undefined,
          }),
        })
      )
    )
    setSubmitting(false)

    const next: Partial<Record<Channel, ChannelOutcome>> = { ...outcomes }
    settled.forEach((result, i) => {
      const channel = toPublish[i]
      next[channel] =
        result.status === 'fulfilled'
          ? { ok: true }
          : { ok: false, message: result.reason instanceof Error ? result.reason.message : 'Publish failed.' }
    })
    setOutcomes(next)

    const failed = checkedChannels.filter((ch) => next[ch] && !next[ch]!.ok)
    if (failed.length === 0) {
      onSuccess()
    } else {
      setError(
        `${failed.map((ch) => channelLabel(ch)).join(', ')} failed — fix the issue and Publish to retry ` +
          `(already-published channels won't be re-sent).`
      )
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Publish post"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleConfirm}
            disabled={submitting || checkedChannels.length === 0}
          >
            {submitting ? 'Publishing…' : 'Publish'}
          </Button>
        </>
      }
    >
        {headlineLine && (
          <p data-testid="publish-headline-line" className="mb-4 text-ui-xs text-fg-muted">
            {headlineLine}
          </p>
        )}

        {/* Channel checkboxes */}
        <FieldLabel as="span" id={channelsId} className="mb-2">Channels</FieldLabel>
        <div role="group" aria-labelledby={channelsId} className="flex flex-wrap gap-x-6 gap-y-2 pb-5 mb-5 border-b border-line-subtle">
          {CHANNELS.map((ch) => {
            const outcome = outcomes[ch]
            const failure = outcome && !outcome.ok ? outcome.message : null
            const reasonId = `${channelsId}-${ch}-reason`
            return (
              <div key={ch} className="flex flex-col gap-1">
                <label className="flex items-center gap-2 cursor-pointer text-ui-sm font-medium text-fg">
                  <input
                    type="checkbox"
                    checked={checkedChannels.includes(ch)}
                    onChange={() => toggleChannel(ch)}
                    disabled={outcome?.ok === true}
                    aria-describedby={failure ? reasonId : undefined}
                    className="h-4 w-4 accent-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  />
                  {channelLabel(ch)}
                  {outcome?.ok === true && (
                    <span className="text-ui-xs font-semibold text-status-published">✓ published</span>
                  )}
                  {failure && (
                    <span className="text-ui-xs font-semibold text-status-failed">✕ failed</span>
                  )}
                </label>
                {/* The reason is shown, not tucked into a tooltip (017 FR-03). */}
                {failure && (
                  <p id={reasonId} className="text-ui-xs text-status-failed">
                    {failure}
                  </p>
                )}
              </div>
            )
          })}
        </div>

        {/* Scheduled at */}
        <div>
          <Input
            label="Schedule for (optional)"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
          <p className="text-ui-xs text-fg-muted mt-1.5">
            Leave blank to publish immediately.
          </p>
        </div>

        {error && (
          <p className={`${fieldErrorClasses} mt-3`}>{error}</p>
        )}
    </Modal>
  )
}
