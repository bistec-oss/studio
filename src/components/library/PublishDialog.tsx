'use client'

import React, { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { GlassInput } from '@/components/ui/GlassInput'
import { Button } from '@/components/ui/Button'
import { apiFetch } from '@/lib/apiFetch'
import { CHANNEL_VALUES, channelLabel } from '@/lib/channels'
import type { Channel } from '@prisma/client'

// Shared publish dialog: pick one or more channels and an optional schedule, then
// fire a POST /api/posts per channel. Used from both the Library grid and the
// draft review page so the publish UX (and validation) stays identical.

const CHANNELS = CHANNEL_VALUES

export interface PublishDialogProps {
  draftId: string
  onClose: () => void
  onSuccess: () => void
}

// Per-channel outcome of the last Confirm — channels that succeeded are locked
// so re-confirming after a partial failure can't double-post them.
type ChannelOutcome = { ok: true } | { ok: false; message: string }

export function PublishDialog({ draftId, onClose, onSuccess }: PublishDialogProps) {
  const [checkedChannels, setCheckedChannels] = useState<Channel[]>([])
  const [scheduledAt, setScheduledAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcomes, setOutcomes] = useState<Partial<Record<Channel, ChannelOutcome>>>({})

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
        `${failed.map((ch) => channelLabel(ch)).join(', ')} failed — fix the issue and Confirm to retry ` +
          `(already-published channels won't be re-sent).`
      )
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Publish Post"
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
            {submitting ? 'Publishing…' : 'Confirm'}
          </Button>
        </>
      }
    >
        {/* Channel checkboxes */}
        <p className="text-sm font-medium text-light-text dark:text-dark-text mb-2">
          Channels
        </p>
        <div className="flex gap-3 mb-4">
          {CHANNELS.map((ch) => {
            const outcome = outcomes[ch]
            return (
              <label
                key={ch}
                className="flex items-center gap-2 cursor-pointer text-sm text-light-text dark:text-dark-text"
              >
                <input
                  type="checkbox"
                  checked={checkedChannels.includes(ch)}
                  onChange={() => toggleChannel(ch)}
                  disabled={outcome?.ok === true}
                  className="accent-primary dark:accent-primary-light"
                />
                {channelLabel(ch)}
                {outcome?.ok === true && (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">✓ published</span>
                )}
                {outcome && !outcome.ok && (
                  <span className="text-xs text-red-600 dark:text-red-400" title={outcome.message}>
                    ✕ failed
                  </span>
                )}
              </label>
            )
          })}
        </div>

        {/* Scheduled at */}
        <div>
          <GlassInput
            label="Schedule for (optional)"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
          <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1">
            Leave blank to publish immediately.
          </p>
        </div>

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 mt-3">{error}</p>
        )}
    </Modal>
  )
}
