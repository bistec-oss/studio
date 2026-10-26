// Validation and provenance for the model's wording (007 FR-06 to FR-08).
//
// The model only returns `{ candidateId, replacement }`. Every other field of
// an Edit (quote, kind, entry key, rationale, provenance) is built here from the
// detector's candidate and the dataset, never from the reply. Pure, no model.
import type { Candidate } from './detect'
import { getEntry } from './entries'
import { isMeasurable, measurableSpans, spanFacts } from './measurable'
import { containsForbidden, type RoleKit } from './roles'

/** `dataset`: the numbers lie inside the entry's ranges. `unverified`: anything else. */
export type Provenance = 'dataset' | 'unverified'

export interface Edit {
  /** The candidate id. */
  id: string
  kind: 'replace' | 'insert'
  /** The exact text in the base: replace removes it; insert goes after its sentence. */
  quote: string
  replacement: string
  entryKey: string
  provenance: Provenance
  rationale: string
}

export type RejectionReason =
  | 'unknown-candidate'
  | 'duplicate'
  | 'too-long'
  | 'too-short'
  | 'not-measurable'
  | 'multi-sentence'
  | 'forbidden-content'
  | 'stale-quote'

export interface Rejection {
  candidateId: string
  reason: RejectionReason
}

/** What the model returns for one candidate. Anything else in its reply is ignored. */
export interface Proposal {
  candidateId: string
  replacement: string
}

export const MIN_REPLACEMENT = 8
export const MAX_REPLACEMENT = 400
export const MAX_SENTENCES = 2

export function countSentences(text: string): number {
  return text.split(/(?<=[.!?])\s+/u).filter((s) => s.trim()).length
}

/** How many times `quote` occurs in `text`, counting overlapping occurrences. */
export function occurrences(text: string, quote: string): number {
  if (!quote) return 0
  let n = 0
  for (let i = text.indexOf(quote); i !== -1; i = text.indexOf(quote, i + 1)) n++
  return n
}

/** Set by code only. `dataset` needs a real entry and every number inside its allowed range. */
export function setProvenance(entryKey: string, replacement: string): Provenance {
  const entry = getEntry(entryKey)
  if (!entry) return 'unverified'
  const spans = measurableSpans(replacement)
  if (spans.length === 0) return 'unverified'
  for (const span of spans) {
    const { numbers, unit } = spanFacts(span.text)
    const norm = (u: string) => (u === '×' ? 'x' : u)
    const ranges = Object.values(entry.ranges).filter((r) => norm(r.unit) === norm(unit))
    if (ranges.length === 0) return 'unverified'
    if (!numbers.every((n) => ranges.some((r) => n >= r.min && n <= r.max))) return 'unverified'
  }
  return 'dataset'
}

export function validateProposals(
  candidates: readonly Candidate[],
  proposals: readonly Proposal[],
  kit: RoleKit,
  text: string,
): { edits: Edit[]; rejected: Rejection[] } {
  const byId = new Map(candidates.map((c) => [c.id, c]))
  const seen = new Set<string>()
  const edits: Edit[] = []
  const rejected: Rejection[] = []

  for (const proposal of proposals) {
    const candidateId = proposal.candidateId
    const reject = (reason: RejectionReason) => rejected.push({ candidateId, reason })
    const candidate = byId.get(candidateId)
    if (!candidate) {
      reject('unknown-candidate')
      continue
    }
    // One edit per candidate: the first proposal for it is the only one considered.
    if (seen.has(candidateId)) {
      reject('duplicate')
      continue
    }
    seen.add(candidateId)

    const replacement = proposal.replacement.trim()
    if (replacement.length > MAX_REPLACEMENT) reject('too-long')
    else if (replacement.length < MIN_REPLACEMENT) reject('too-short')
    else if (countSentences(replacement) > MAX_SENTENCES) reject('multi-sentence')
    else if (containsForbidden(replacement, kit)) reject('forbidden-content')
    else if (!isMeasurable(replacement)) reject('not-measurable')
    else if (occurrences(text, candidate.quote) !== 1) reject('stale-quote')
    else {
      const entry = getEntry(candidate.entryKey)
      if (!entry) {
        reject('unknown-candidate')
        continue
      }
      edits.push({
        id: candidate.id,
        kind: entry.form,
        quote: candidate.quote,
        replacement,
        entryKey: candidate.entryKey,
        provenance: setProvenance(candidate.entryKey, replacement),
        rationale: entry.rationale,
      })
    }
  }
  return { edits, rejected }
}
