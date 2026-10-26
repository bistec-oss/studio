// Client-safe types for the post-font catalogue (031 FR-16). No server imports here.

export type FontCategory =
  | 'sans-serif'
  | 'serif'
  | 'display'
  | 'handwriting'
  | 'monospace'
  | (string & {})

export interface FontFamily {
  family: string
  category: FontCategory
  weights: number[]
  italics: boolean
  /** Google's subset ids: `latin`, `sinhala`, ... */
  scripts: string[]
  /** Set by a refresh when Google no longer lists the family; the family is never removed. */
  delisted?: true
}

export interface FontCatalogue {
  snapshotDate: string
  source: string
  families: FontFamily[]
}

/** The only scripts a kit may map to a font (FR-21). */
export const OFFERED_SCRIPTS = ['sinhala'] as const
export type OfferedScript = (typeof OFFERED_SCRIPTS)[number]

export function isOfferedScript(s: string): s is OfferedScript {
  return (OFFERED_SCRIPTS as readonly string[]).includes(s)
}
