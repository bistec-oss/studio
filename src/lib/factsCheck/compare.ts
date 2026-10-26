// The facts check (027 FR-10): which values in a headline and the captions are
// not stated in the brief's sources. Pure; never throws (one try/catch returns
// status 'error').
//
// The support rule: a checked value is supported when its key is in the source
// set, with these widenings (design section 6):
//  - a `num` value is also supported by a `cur`, `pct` or `num` source of the
//    same numeric value;
//  - a named date with a year needs the source's year to match when the source
//    carries one; a source date with no year supports any year, and a checked
//    date with no year is supported by the same month and day in any year;
//  - the year of a source date also supports the same bare number, so "Join us in 2027" is supported by "15 March 2027".
// `tel`, `time`, `cur`, `pct` and numeric dates are kind-strict. Bare integers
// 0 to 10 are exempt.
import { redactText } from '@/lib/text/redact'
import { extractValues } from './extract'
import { isSmallInteger } from './normalize'
import {
  FACT_WHERE,
  MAX_FLAGS,
  MAX_REASON_CHARS,
  MAX_SOURCES_CHARS,
  MAX_TEXT_CHARS,
  type CheckInput,
  type ExtractedValue,
  type FactWhere,
  type FactsCheck,
  type Flag,
} from './types'

interface SourceSet {
  keys: Set<string>
  amounts: Set<string>
  /** `month-day` to the years a source states for it ('' = stated with no year). */
  dateYears: Map<string, Set<string>>
}

function buildSourceSet(sources: string[]): SourceSet {
  const set: SourceSet = { keys: new Set(), amounts: new Set(), dateYears: new Map() }
  let budget = MAX_SOURCES_CHARS
  for (const source of sources) {
    if (budget <= 0) break
    const text = typeof source === 'string' ? source.slice(0, budget) : ''
    budget -= text.length
    for (const v of extractValues(text, { keysOnly: true })) {
      set.keys.add(v.key)
      if (v.amount !== undefined) set.amounts.add(v.amount)
      if (v.kind === 'date' && v.month !== undefined && v.day !== undefined) {
        const md = `${v.month}-${v.day}`
        const years = set.dateYears.get(md) ?? new Set<string>()
        years.add(v.year ?? '')
        set.dateYears.set(md, years)
        // The year of a stated date also supports the bare number (not the day).
        if (v.year) set.amounts.add(v.year)
      }
    }
  }
  return set
}

function isSupported(v: ExtractedValue, sources: SourceSet): boolean {
  switch (v.kind) {
    case 'num':
      return (
        (v.amount !== undefined && isSmallInteger(v.amount)) ||
        sources.keys.has(v.key) ||
        (v.amount !== undefined && sources.amounts.has(v.amount))
      )
    case 'date': {
      if (v.month === undefined || v.day === undefined) return sources.keys.has(v.key)
      const years = sources.dateYears.get(`${v.month}-${v.day}`)
      if (!years) return false
      if (!v.year) return true
      return years.has(v.year) || years.has('')
    }
    default:
      return sources.keys.has(v.key)
  }
}

const WHERE_ORDER = new Map<FactWhere, number>(FACT_WHERE.map((w, i) => [w, i]))

export interface CheckKey {
  where: FactWhere
  key: string
}

export interface CheckOutcome {
  check: FactsCheck
  /** The (where, key) of each flag, in flag order; for the corpus and the tests. */
  keys: CheckKey[]
}

function errorOutcome(err: unknown, now: Date): CheckOutcome {
  const message = err instanceof Error ? err.message : String(err)
  return {
    check: {
      v: 1,
      status: 'error',
      checkedAt: now.toISOString(),
      flagged: [],
      reason: redactText(message).slice(0, MAX_REASON_CHARS) || 'The check could not run',
    },
    keys: [],
  }
}

export function checkFactsWithKeys(input: CheckInput): CheckOutcome {
  const now = input.now ?? new Date()
  try {
    const sources = buildSourceSet(input.sources)
    const found: Array<{ flag: Flag; key: string; order: number; index: number }> = []
    const seen = new Set<string>()
    input.texts.forEach((t, order) => {
      const text = (typeof t.text === 'string' ? t.text : '').slice(0, MAX_TEXT_CHARS)
      for (const v of extractValues(text, { strip: true, exempt: true })) {
        if (isSupported(v, sources)) continue
        const dedupe = `${t.where}|${v.key}`
        if (seen.has(dedupe)) continue
        seen.add(dedupe)
        found.push({
          flag: { kind: v.kind, value: v.value, where: t.where },
          key: v.key,
          order,
          index: v.index,
        })
      }
    })
    // The first by where, then by position.
    found.sort(
      (a, b) =>
        (WHERE_ORDER.get(a.flag.where) ?? 99) - (WHERE_ORDER.get(b.flag.where) ?? 99) ||
        a.order - b.order ||
        a.index - b.index,
    )
    const kept = found.slice(0, MAX_FLAGS)
    return {
      check: {
        v: 1,
        status: kept.length > 0 ? 'flagged' : 'clear',
        checkedAt: now.toISOString(),
        flagged: kept.map((f) => f.flag),
      },
      keys: kept.map((f) => ({ where: f.flag.where, key: f.key })),
    }
  } catch (err) {
    return errorOutcome(err, now)
  }
}

export function checkFacts(input: CheckInput): FactsCheck {
  return checkFactsWithKeys(input).check
}

/** The result for a check that could not run (sources failed to load, or a seam). */
export function factsCheckError(reason: string, now: Date = new Date()): FactsCheck {
  return {
    v: 1,
    status: 'error',
    checkedAt: now.toISOString(),
    flagged: [],
    reason: redactText(reason).slice(0, MAX_REASON_CHARS) || 'The check could not run',
  }
}
