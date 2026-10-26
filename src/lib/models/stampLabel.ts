// A model stamp as a person reads it (008 FR-18, FR-20): the picker's
// substitution hint and the draft page's "Generated with" lines.
//
// Pure and client-safe: the catalogue only.

import { entryFor, entryForStamp, isModelKey } from './catalogue'

/**
 * A stamp's display name: the current entry's name ('claude-sonnet-5-5' →
 * 'Sonnet 5.5'), or the raw ID for a retired or foreign one
 * ('claude-sonnet-4-6', 'gpt-4o'), which no current entry describes.
 */
export function stampName(stamp: string): string {
  const match = entryForStamp(stamp)
  return match && !match.previous ? match.entry.displayName : stamp
}

/** A `…SubstitutedFrom` value, which is a refused key ('OPUS') or a refused stamp. */
function refusedName(value: string): string {
  if (isModelKey(value)) return entryFor(value)?.displayName ?? value
  return stampName(value)
}

export interface GeneratedWithLine {
  /** "Generated with Sonnet 5.5". */
  text: string
  /** The stamp's display name alone, for a cell too narrow for the sentence. */
  name: string
  /** "Substituted for Opus 5.5" when the resolver replaced a refused value, else null. */
  substitutedTitle: string | null
}

/**
 * FR-20's "Generated with" line for a stamp and its `…SubstitutedFrom`
 * sibling. Null when there is no stamp (written before 008, or no model
 * output), so nothing is shown.
 */
export function generatedWith(
  stamp: string | null | undefined,
  substitutedFrom?: string | null,
): GeneratedWithLine | null {
  if (!stamp) return null
  const name = stampName(stamp)
  return {
    text: `Generated with ${name}`,
    name,
    substitutedTitle: substitutedFrom ? `Substituted for ${refusedName(substitutedFrom)}` : null,
  }
}
