'use client'

import React, { useState } from 'react'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { GlassInput } from '@/components/ui/GlassInput'
import { Button } from '@/components/ui/Button'

// Shared publish dialog: pick one or more channels and an optional schedule, then
// fire a POST /api/posts per channel. Used from both the Library grid and the
// draft review page so the publish UX (and validation) stays identical.

const CHANNELS = ['INSTAGRAM', 'LINKEDIN'] as const
type Channel = (typeof CHANNELS)[number]

export interface PublishDialogProps {
  draftId: string
  onClose: () => void
  onSuccess: () => void
}

export function PublishDialog({ draftId, onClose, onSuccess }: PublishDialogProps) {
  const [checkedChannels, setCheckedChannels] = useState<Channel[]>([])
  const [scheduledAt, setScheduledAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleChannel(ch: Channel) {
    setCheckedChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    )
  }

  async function handleConfirm() {
    if (checkedChannels.length === 0) {
      setError('Select at least one channel.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await Promise.all(
        checkedChannels.map((channel) =>
          fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              draftId,
              channel,
              scheduledAt: scheduledAt || undefined,
            }),
          }).then(async (res) => {
            if (!res.ok) {
              const body = await res.json().catch(() => ({}))
              throw new Error(body.error ?? res.statusText)
            }
          })
        )
      )
      onSuccess()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Publish failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <GlassPanel className="p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-light-text dark:text-dark-text mb-4">
          Publish Post
        </h2>

        {/* Channel checkboxes */}
        <p className="text-sm font-medium text-light-text dark:text-dark-text mb-2">
          Channels
        </p>
        <div className="flex gap-3 mb-4">
          {CHANNELS.map((ch) => (
            <label
              key={ch}
              className="flex items-center gap-2 cursor-pointer text-sm text-light-text dark:text-dark-text"
            >
              <input
                type="checkbox"
                checked={checkedChannels.includes(ch)}
                onChange={() => toggleChannel(ch)}
                className="accent-primary dark:accent-primary-light"
              />
              {ch === 'INSTAGRAM' ? 'Instagram' : 'LinkedIn'}
            </label>
          ))}
        </div>

        {/* Scheduled at */}
        <div className="mb-5">
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
          <p className="text-xs text-red-600 dark:text-red-400 mb-3">{error}</p>
        )}

        <div className="flex gap-2 justify-end">
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
        </div>
      </GlassPanel>
    </div>
  )
}
