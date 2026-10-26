// Single source of truth for social channels: one per-channel registry
// (CAPTION_CHANNELS) from which labels, caption limits and the publishable set
// are all derived — never written separately. Channel values are UPPERCASE enum
// members (see prisma/schema.prisma `enum Channel`). Older rows/inputs may still
// carry lowercase values (e.g. a draft's stored `brief.channels` predating the
// enum normalization) — the lookup helpers here tolerate any casing by
// normalizing to uppercase before lookup. Imports `Channel` as a type only, so
// this module stays client-safe.
import type { Channel } from '@prisma/client'

export type CaptionKey = 'instagram' | 'linkedin'
export type CaptionTarget = Channel | 'HEADLINE'

export interface CaptionChannelSpec {
  channel: Channel
  label: string
  jsonKey: CaptionKey
  hardLimit: number | null
  brief: string
  normalise: (text: string) => string
}

// Neither feed renders Markdown, so model output loses every `**`. Each pass
// shortens the string, so both loops terminate.
const stripDoubleAsterisks = (text: string): string => {
  let t = text
  while (t.includes('**')) t = t.replaceAll('**', '')
  return t
}

export const CAPTION_CHANNELS: readonly CaptionChannelSpec[] = [
  {
    channel: 'INSTAGRAM',
    label: 'Instagram',
    jsonKey: 'instagram',
    hardLimit: 2200,
    brief: 'Hook in the first line. Hashtags only at the end. Plain text, no Markdown.',
    normalise: stripDoubleAsterisks,
  },
  {
    channel: 'LINKEDIN',
    label: 'LinkedIn',
    jsonKey: 'linkedin',
    hardLimit: 3000,
    brief: 'Professional and longer-form. At most 3 hashtags, or none. Plain text, no Markdown.',
    normalise: stripDoubleAsterisks,
  },
]

// Short human label used in the wizard, review step, cards, and history drawer.
// WHATSAPP is not a caption channel (010 was dropped on 2026-10-23), but old
// Post rows still render through channelLabel, so its label stays.
export const CHANNEL_LABELS = {
  ...(Object.fromEntries(CAPTION_CHANNELS.map((s) => [s.channel, s.label])) as Record<
    Exclude<Channel, 'WHATSAPP'>,
    string
  >),
  WHATSAPP: 'WhatsApp',
} as Record<Channel, string>

// Per-channel hard caption character limit.
export const CHANNEL_CAPTION_LIMITS: Partial<Record<Channel, number>> = Object.fromEntries(
  CAPTION_CHANNELS.flatMap((s) => (s.hardLimit === null ? [] : [[s.channel, s.hardLimit]]))
)

// Channels that have a publisher: every caption channel. Inputs (briefs, queue,
// posts, team channels, MCP/ACP) accept only these.
export const PUBLISHABLE_CHANNELS: Channel[] = CAPTION_CHANNELS.map((s) => s.channel)

// Kept name: every channel picker and default reads this, so pickers stay at
// the publishable channels.
export const CHANNEL_VALUES = PUBLISHABLE_CHANNELS

export function captionSpec(channel: Channel): CaptionChannelSpec {
  const spec = CAPTION_CHANNELS.find((s) => s.channel === channel)
  if (!spec) throw new Error(`No caption registry entry for channel ${channel}`)
  return spec
}

// Exact (uppercase) match only, so the type guard never lies: callers that
// tolerate legacy casing uppercase first.
export function isPublishableChannel(v: unknown): v is Channel {
  return typeof v === 'string' && PUBLISHABLE_CHANNELS.includes(v as Channel)
}

// UTF-16 code units — the one count the counter, extractor and resolver share.
export const captionLength = (t: string) => t.length

// Normalizes any-case input before lookup; falls back to the raw string for
// unrecognized values so unexpected data still renders instead of throwing.
export function channelLabel(value: string): string {
  const normalized = value.toUpperCase() as Channel
  return CHANNEL_LABELS[normalized] ?? value
}
