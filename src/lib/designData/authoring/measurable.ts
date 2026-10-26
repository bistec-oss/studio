// "Measurable" is defined here, once (007 FR-02). A rule is measurable when it
// states a quantity with a unit, or a quantity with a reference object ("one or
// two wordmark letters"). This is a TEXT check: it does not verify that any
// render obeys the number. Pure and client-safe.

const NUM = String.raw`\d+(?:\.\d+)?`
const WORD_NUM = 'one|two|three|four|five|six|seven|eight|nine|ten'
// A single number, a range (hyphen, en dash or "to"), or number words.
const QUANTITY =
  `(?:${NUM}(?:\\s*[-–]\\s*${NUM}|\\s+to\\s+${NUM})?` +
  `|(?:${WORD_NUM})(?:\\s+(?:or|to)\\s+(?:${WORD_NUM}))?)`
const UNIT = String.raw`(?:\s*(?:%|×|(?:px|pt|rem|em|vw|vh|x)(?![\p{L}\p{N}]))|:\d+(?:\.\d+)?)`
const REF = String.raw`(?:wordmark[\s-]+(?:letters?|capitals?)|cap[\s-]height|canvas[\s-](?:width|height)|logo[\s-](?:height|width))(?![\p{L}])`

// The quantity must not be the tail of a longer number, word or hex colour.
const SPAN = new RegExp(
  String.raw`(?<![\p{L}\p{N}.#_])(?:${QUANTITY}${UNIT}|${QUANTITY}(?:\s+[\p{L}'-]+){0,3}?\s+${REF})`,
  'giu',
)

export interface MeasurableSpan {
  /** The span in its original spelling. */
  text: string
  /** Lower case, no spaces, no `~`, en dash and "to" as a hyphen. */
  token: string
  start: number
  end: number
}

function normaliseSpan(span: string): string {
  return span
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/~/g, '')
    .replace(/[–—]/g, '-')
    .replace(/(\d)to(\d)/g, '$1-$2')
}

export function measurableSpans(text: string): MeasurableSpan[] {
  const spans: MeasurableSpan[] = []
  for (const m of text.matchAll(SPAN)) {
    const start = m.index ?? 0
    spans.push({ text: m[0], token: normaliseSpan(m[0]), start, end: start + m[0].length })
  }
  return spans
}

export function isMeasurable(text: string): boolean {
  return measurableSpans(text).length > 0
}

export function measurableTokens(text: string): string[] {
  return measurableSpans(text).map((s) => s.token)
}

/**
 * The measurable rules in `before` that no longer appear in `after`, returned
 * in their original spelling (007 FR-15). Reformatting (`45 - 60 %`, `~45-60%`)
 * is not a loss, because both sides are compared as normalised tokens.
 */
export function lostMeasurableRules(before: string, after: string): string[] {
  const kept = new Set(measurableTokens(after))
  const lost: string[] = []
  const seen = new Set<string>()
  for (const s of measurableSpans(before)) {
    if (kept.has(s.token) || seen.has(s.token)) continue
    seen.add(s.token)
    lost.push(s.text)
  }
  return lost
}

const WORD_VALUES: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
}

export interface SpanFacts {
  numbers: number[]
  /** '%', 'px', 'pt', 'em', 'rem', 'vw', 'vh', 'x', 'ratio', 'letters', or 'ref:<name>'. */
  unit: string
}

/** The numbers in one measurable span and the unit they are stated in. */
export function spanFacts(span: string): SpanFacts {
  const lower = span.toLowerCase()
  const numbers: number[] = []
  for (const m of lower.matchAll(new RegExp(`${NUM}|\\b(?:${WORD_NUM})\\b`, 'g'))) {
    numbers.push(WORD_VALUES[m[0]] ?? Number(m[0]))
  }
  let unit = 'ratio'
  if (/wordmark[\s-]+(?:letters?|capitals?)/.test(lower)) unit = 'letters'
  else if (/cap[\s-]height/.test(lower)) unit = 'ref:cap-height'
  else if (/canvas[\s-](?:width|height)/.test(lower)) unit = 'ref:canvas'
  else if (/logo[\s-](?:height|width)/.test(lower)) unit = 'ref:logo'
  else if (lower.includes('%')) unit = '%'
  else if (/\d\s*(px|pt|rem|em|vw|vh)\b/.test(lower))
    unit = lower.match(/\d\s*(px|pt|rem|em|vw|vh)\b/)![1]
  else if (/\d\s*[x×]/.test(lower)) unit = 'x'
  // A ratio "3:2" keeps both numbers; 'ratio' is the default above.
  return { numbers, unit }
}
