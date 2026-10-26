// The one publish-time decision for a caption (012 FR-14): may this channel's
// caption be published, and if so, with what text? Every publish path —
// POST /api/posts' up-front check, immediate publish, retry and the scheduler —
// goes through it, so no caller can send the wrong text or a bad one.
//
// Pure and client-safe: imports the registry and the `Channel` type only, and
// takes a structural row so it never needs a Prisma value import.

import type { Channel } from '@prisma/client'
import { captionLength, captionSpec, channelLabel, isPublishableChannel } from '@/lib/channels'

export interface CaptionRowLike {
  status: 'PENDING' | 'READY' | 'FAILED'
  text: string
  failureReason: string | null
}

export type CaptionResolution = { ok: true; text: string } | { ok: false; reason: string }

const count = (n: number) => n.toLocaleString('en-US')

// Rule 1's reason: the channel is not publishable, or has no publisher (WhatsApp:
// 010 was dropped on 2026-10-23). Shared
// with publishToChannel's publisher-map miss so both refusals read the same.
export function unavailableReason(channel: Channel): string {
  return `${channelLabel(channel)} publishing isn't available.`
}

// The first matching rule wins. A ready caption returns its stored text
// unchanged; it is already validated model output or the user's own text.
export function resolveCaptionForPublish(
  channel: Channel,
  row: CaptionRowLike | null | undefined,
): CaptionResolution {
  const label = channelLabel(channel)

  if (!isPublishableChannel(channel)) return { ok: false, reason: unavailableReason(channel) }
  if (!row) return { ok: false, reason: `This draft has no ${label} caption.` }
  if (row.status === 'PENDING') {
    return {
      ok: false,
      reason: `The ${label} caption is being generated. Publish again when it finishes.`,
    }
  }
  if (row.status === 'FAILED') {
    const why = row.failureReason ? ` (${row.failureReason})` : ''
    return {
      ok: false,
      reason: `The ${label} caption failed to generate${why}. Regenerate or edit it, then publish again.`,
    }
  }
  if (!row.text.trim()) {
    return {
      ok: false,
      reason: `The ${label} caption is empty. Write or regenerate it, then publish again.`,
    }
  }
  const limit = captionSpec(channel).hardLimit
  const length = captionLength(row.text)
  if (limit !== null && length > limit) {
    return {
      ok: false,
      reason: `The ${label} caption is ${count(length)} characters; ${label} allows ${count(limit)}.`,
    }
  }
  return { ok: true, text: row.text }
}
