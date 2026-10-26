// Post styles (027): the types of the dataset. Pure and client-safe: no prisma,
// env, fs, minio or puppeteer import (a guard test enforces it).
import type { ArchetypeKey } from '@/lib/designData'

export const POST_STYLE_KEYS = [
  'general',
  'launch',
  'promotion',
  'event',
  'hiring',
  'announcement',
  'tip',
  'milestone',
] as const
export type PostStyleKey = (typeof POST_STYLE_KEYS)[number]

// The wizard's tone values. The wizard's label list is built from these.
export const TONE_KEYS = ['professional', 'casual', 'bold', 'empathetic'] as const
export type ToneKey = (typeof TONE_KEYS)[number]

export type RuleScope = 'caption' | 'image'

export interface Rule {
  id: string
  scope: RuleScope
  text: string
  // Marks a rule the facts check enforces in code (nothing else reads it yet).
  check?: 'facts-check'
}

export interface StyleVersion {
  goal: string
  defaultTone: ToneKey
  defaultImageStyle: 'classic' | ArchetypeKey
  checklist: readonly Rule[]
}

export interface PostStyle {
  key: PostStyleKey
  label: string
  summary: string
  status: 'active' | 'retired'
  current: number
  // Immutable: deep-frozen at module load. A change adds versions[n+1] and
  // moves `current`; a released version is never edited.
  versions: Readonly<Record<number, StyleVersion>>
}

// The wizard's rule for reading a campaign's free-text default tone: the first
// tone whose value is a substring of the lowercased text. Null on empty text or
// no match. (Moved from the wizard unchanged in behaviour, 027 FR-04.)
export function matchToneOption(text: string | null | undefined): ToneKey | null {
  if (!text) return null
  const lower = text.toLowerCase()
  return TONE_KEYS.find((t) => lower.includes(t)) ?? null
}
