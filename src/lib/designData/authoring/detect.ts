// The live detector (007 FR-03): finds vague design phrases in a text and
// names the dataset entry that gives each one a number. Pure, no model.
//
// Matching is by regex over the ORIGINAL string, never indexOf on a lower-cased
// copy: lower-casing can change a string's length (Turkish dotted I), which
// would shift every position after it (2026-08-03 lesson).
import { entries, fillTemplate, getEntry, type Category } from './entries'
import { isMeasurable } from './measurable'

export const MAX_SCAN_CHARS = 20_000
export const MAX_CANDIDATES = 12

export interface Candidate {
  /** `<entryKey>:<start>` */
  id: string
  entryKey: string
  category: Category
  start: number
  end: number
  quote: string
}

export interface DetectResult {
  candidates: Candidate[]
  /** The text was longer than MAX_SCAN_CHARS and only the start was scanned. */
  truncated: boolean
  /** More candidates existed than MAX_CANDIDATES. */
  more: boolean
}

const SENTENCE = /[^\n]+?(?:[.!?](?=\s|$)|$)/gm

function sentenceRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  for (const m of text.matchAll(SENTENCE)) ranges.push([m.index ?? 0, (m.index ?? 0) + m[0].length])
  return ranges
}

export function detectVagueDesign(text: string): DetectResult {
  const truncated = text.length > MAX_SCAN_CHARS
  const scan = truncated ? text.slice(0, MAX_SCAN_CHARS) : text
  const sentences = sentenceRanges(scan)
  // Whether the sentence holding a position already states a measurable rule.
  const measured = new Map<number, boolean>()
  const sentenceIsMeasured = (pos: number): boolean => {
    const i = sentences.findIndex(([s, e]) => pos >= s && pos < e)
    if (i < 0) return false
    if (!measured.has(i))
      measured.set(i, isMeasurable(scan.slice(sentences[i][0], sentences[i][1])))
    return measured.get(i)!
  }

  const found: Candidate[] = []
  for (const entry of entries) {
    for (const source of entry.triggers) {
      for (const m of scan.matchAll(new RegExp(source, 'giu'))) {
        const start = m.index ?? 0
        if (m[0].length === 0 || sentenceIsMeasured(start)) continue
        found.push({
          id: `${entry.key}:${start}`,
          entryKey: entry.key,
          category: entry.category,
          start,
          end: start + m[0].length,
          quote: m[0],
        })
      }
    }
  }

  // No overlaps: the earlier start wins, then the longer match.
  found.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))
  const kept: Candidate[] = []
  let lastEnd = -1
  for (const c of found) {
    if (c.start < lastEnd) continue
    kept.push(c)
    lastEnd = c.end
  }

  return {
    candidates: kept.slice(0, MAX_CANDIDATES),
    truncated,
    more: kept.length > MAX_CANDIDATES,
  }
}

export interface Suggestion {
  label: string
  /** The entry's template filled with its defaults: shown with no model call. */
  text: string
  rationale: string
  form: 'replace' | 'insert'
}

export function suggestionFor(candidate: Pick<Candidate, 'entryKey'>): Suggestion | null {
  const entry = getEntry(candidate.entryKey)
  if (!entry) return null
  return {
    label: entry.label,
    text: fillTemplate(entry.template, entry.defaults),
    rationale: entry.rationale,
    form: entry.form,
  }
}
