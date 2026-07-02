// Single source of truth for social channel values, labels, and per-channel copy
// limits. Channel values are UPPERCASE enum members (see prisma/schema.prisma
// `enum Channel`). Older rows/inputs may still carry lowercase values (e.g. a
// draft's stored `brief.channels` predating the enum normalization) — helpers here
// tolerate any casing by normalizing to uppercase before lookup.
import type { Channel } from '@prisma/client'

// The two valid enum values, for defaults and runtime validation.
export const CHANNEL_VALUES: Channel[] = ['INSTAGRAM', 'LINKEDIN']

// Short human label used in the wizard, review step, cards, and history drawer.
export const CHANNEL_LABELS: Record<Channel, string> = {
  INSTAGRAM: 'Instagram',
  LINKEDIN: 'LinkedIn',
}

// Per-channel copy character limit (used to warn/clamp generated copy length).
export const CHANNEL_COPY_LIMITS: Record<Channel, number> = {
  INSTAGRAM: 2200,
  LINKEDIN: 3000,
}

export function isChannel(v: unknown): v is Channel {
  return typeof v === 'string' && CHANNEL_VALUES.includes(v.toUpperCase() as Channel)
}

// Normalizes any-case input before lookup; falls back to the raw string for
// unrecognized values so unexpected data still renders instead of throwing.
export function channelLabel(value: string): string {
  const normalized = value.toUpperCase() as Channel
  return CHANNEL_LABELS[normalized] ?? value
}

export function channelCopyLimit(value: string): number | undefined {
  const normalized = value.toUpperCase() as Channel
  return CHANNEL_COPY_LIMITS[normalized]
}
