// Value extraction for the facts check (027 FR-10, design section 6). Pure.
//
// `extractValues` finds the numbers, dates, times, prices, percentages and phone
// numbers in a text. The patterns run in a fixed order and each match is
// consumed (blanked to spaces of equal length) so a later pattern cannot match
// it again: `$50` is never also a number, `15 March 2027` is never also three
// numbers. Word boundaries are unicode-aware (`u` flag): a number attached to
// letters (`Q3`, `COVID19`) is never extracted.
import {
  MULTIPLIER_SOURCE,
  NUMBER_SOURCE,
  amountOf,
  minutesOf,
  monthNumber,
  parseNumber,
  toAsciiDigits,
} from './normalize'
import { MAX_VALUE_CHARS, type ExtractedValue } from './types'

// Not preceded / not followed by a letter or a digit (any script).
const L = String.raw`(?<![\p{L}\p{N}])`
const R = String.raw`(?![\p{L}\p{N}])`
const AMOUNT = `(?:${NUMBER_SOURCE})(?:${MULTIPLIER_SOURCE})?`
const MONTH =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|' +
  'sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'
const YEAR = String.raw`((?:19|20)\d{2})`
const CURRENCY_CODES = 'usd|eur|gbp|lkr|inr|aud|cad|sgd|rs'

interface Built {
  kind: ExtractedValue['kind']
  key: string
  amount?: string
  month?: number
  day?: number
  year?: string
}

interface Pattern {
  regex: RegExp
  build(m: RegExpMatchArray): Built | null
}

const validDay = (d: number) => d >= 1 && d <= 31
const digitsOf = (s: string) => s.replace(/\D/g, '')

function namedDate(month: string, dayText: string, year?: string): Built | null {
  const m = monthNumber(month)
  const d = Number(dayText)
  if (m === null || !validDay(d)) return null
  return {
    kind: 'date',
    key: `date:${m}-${d}${year ? `-${year}` : ''}`,
    month: m,
    day: d,
    year: year ?? '',
  }
}

const PATTERNS: Pattern[] = [
  // 2a. date: day then month name ("15 March 2027", "15th of March").
  {
    regex: new RegExp(
      `${L}(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+(${MONTH})\\.?${R}(?:,?\\s+${YEAR}${R})?`,
      'giu',
    ),
    build: (m) => namedDate(m[2], m[1], m[3]),
  },
  // 2b. date: month name then day ("March 15, 2027"). "May" needs an adjacent day.
  {
    regex: new RegExp(
      `${L}(${MONTH})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?${R}(?:,?\\s+${YEAR}${R})?`,
      'giu',
    ),
    build: (m) => namedDate(m[1], m[2], m[3]),
  },
  // 2c. date: numeric, ISO order (2027-03-15). Keyed on the digits as written.
  {
    regex: new RegExp(`(?<![\\p{L}\\p{N}./-])(\\d{4})-(\\d{1,2})-(\\d{1,2})${R}`, 'gu'),
    build(m) {
      const [y, a, b] = [m[1], Number(m[2]), Number(m[3])]
      if (a < 1 || a > 12 || !validDay(b)) return null
      return { kind: 'date', key: `date:n:${y}-${a}-${b}` }
    },
  },
  // 2d. date: numeric with / or . (15/03/2027, 15.3.27). Never reinterpreted
  // between day-first and month-first.
  {
    regex: new RegExp(
      `(?<![\\p{L}\\p{N}./-])(\\d{1,2})([/.])(\\d{1,2})\\2(\\d{4}|\\d{2})${R}`,
      'gu',
    ),
    build(m) {
      const [a, b] = [Number(m[1]), Number(m[3])]
      if (!validDay(a) || !validDay(b) || (a > 12 && b > 12)) return null
      return { kind: 'date', key: `date:n:${a}-${b}-${m[4]}` }
    },
  },
  // 3. tel: 7 to 15 digits with optional + and separators. Runs after the dates
  // (design: the candidate must not be a date already consumed, so 2027-03-15
  // is a date, not a phone number).
  {
    regex: new RegExp(
      String.raw`(?<![\p{L}\p{N}$€£¥₹])(?<![\p{N}][.,])(?:\+\d[\d\s().-]{5,20}\d|\(?\d{2,4}\)?(?:[\s.-]\(?\d{2,4}\)?){1,4}|\d{7,15})${R}`,
      'gu',
    ),
    build(m) {
      const digits = digitsOf(m[0])
      if (digits.length < 7 || digits.length > 15) return null
      // Two four-digit groups are a year range, not a phone number.
      if (/^\d{4}[\s.-]\d{4}$/.test(m[0])) return null
      return { kind: 'tel', key: `tel:${digits}` }
    },
  },
  // 3a. time: 10:30, 10:30am, 17:00.
  {
    regex: new RegExp(
      `(?<![\\p{L}\\p{N}:.])(\\d{1,2}):([0-5]\\d)(?::[0-5]\\d)?(?:\\s?(am|pm))?${R}`,
      'giu',
    ),
    build(m) {
      const mins = minutesOf(Number(m[1]), Number(m[2]), m[3])
      return mins === null ? null : { kind: 'time', key: `time:${mins}` }
    },
  },
  // 3b. time: 5 pm.
  {
    regex: new RegExp(`(?<![\\p{L}\\p{N}:.])(\\d{1,2})\\s?(am|pm)${R}`, 'giu'),
    build(m) {
      const mins = minutesOf(Number(m[1]), 0, m[2])
      return mins === null ? null : { kind: 'time', key: `time:${mins}` }
    },
  },
  // 4a. currency: a symbol or code before the number ($50, Rs. 5,000, LKR 2,500).
  {
    regex: new RegExp(`(?:[$€£¥₹]|us\\$|${L}(?:${CURRENCY_CODES})\\.?)\\s?(${AMOUNT})${R}`, 'giu'),
    build(m) {
      const amount = amountOf(m[1])
      return amount === null ? null : { kind: 'cur', key: `cur:${amount}`, amount }
    },
  },
  // 4b. currency: a code or word after the number (50 USD, 50 dollars).
  {
    regex: new RegExp(
      `${L}(${AMOUNT})\\s?(?:${CURRENCY_CODES}|dollars?|euros?|pounds?|rupees?)${R}`,
      'giu',
    ),
    build(m) {
      const amount = amountOf(m[1])
      return amount === null ? null : { kind: 'cur', key: `cur:${amount}`, amount }
    },
  },
  // 5. pct: 35%, 35 percent, 35 per cent.
  {
    regex: new RegExp(`${L}(${NUMBER_SOURCE})\\s?(?:%|percent${R}|per\\s?cent${R})`, 'giu'),
    build(m) {
      const amount = parseNumber(m[1])
      return amount === null ? null : { kind: 'pct', key: `pct:${amount}`, amount }
    },
  },
  // 6. num: any other number (an ordinal suffix is allowed: 100th).
  {
    regex: new RegExp(`${L}(${AMOUNT})(?:st|nd|rd|th)?${R}`, 'giu'),
    build(m) {
      const amount = amountOf(m[1])
      return amount === null ? null : { kind: 'num', key: `num:${amount}`, amount }
    },
  },
]

// Ranges come from matchAll, so they are ascending and do not overlap; one pass,
// not one string copy per match.
function blankRanges(s: string, ranges: Array<[number, number]>): string {
  if (ranges.length === 0) return s
  let out = ''
  let pos = 0
  for (const [start, end] of ranges) {
    out += s.slice(pos, start) + ' '.repeat(end - start)
    pos = end
  }
  return out + s.slice(pos)
}

function blankAll(s: string, regex: RegExp): string {
  return s.replace(regex, (m) => ' '.repeat(m.length))
}

// URLs, email addresses, @handles and #hashtags carry numbers that are not
// claims (limit L1). Length-preserving.
const STRIP: RegExp[] = [
  /(?:https?:\/\/|www\.)\S+/gi,
  /(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
  /(?<![\w@])@[\w.]+/g,
  /#[\p{L}\p{N}_]+/gu,
]

export function stripNoise(text: string): string {
  return STRIP.reduce(blankAll, text)
}

// Tokens that carry a number but are not a claim (FR-10 "Exemptions"). Blanked,
// not parsed, in checked texts only. Length-preserving. The bare 0 to 10
// exemption is applied at comparison time (compare.ts).
const EXEMPT: RegExp[] = [
  // a list marker at the start of a line: "1.", "2)", "(3)"
  /^[ \t]*(?:\(\d{1,2}\)|\d{1,2}[.)])(?=[ \t])/gm,
  // 24/7, 24x7, 24/365
  new RegExp(`${L}24\\s?[/x]\\s?(?:7|365)${R}`, 'giu'),
  // aspect-ratio tokens and <n>x<n> size tokens
  new RegExp(`${L}(?:1:1|4:5|3:4|9:16|16:9)${R}`, 'gu'),
  new RegExp(`${L}\\d{1,4}\\s?[x×]\\s?\\d{1,4}${R}`, 'giu'),
  // the number in "Step n", "Tip n", "Part n"
  new RegExp(`${L}(?:step|tip|part)[ \\t]+\\d+${R}`, 'giu'),
  // a year (or year range) in a copyright line
  /(?:©|\(c\)|copyright)[ \t]*\d{4}(?:[ \t]?[-–][ \t]?\d{4})?/giu,
]

export function blankExempt(text: string): string {
  return EXEMPT.reduce(blankAll, text)
}

export interface ExtractOptions {
  /** Strip URLs, emails, handles and hashtags first (checked texts only). */
  strip?: boolean
  /** Blank the exempt tokens first (checked texts only). */
  exempt?: boolean
  /** Skip building the matched span (sources only need keys). */
  keysOnly?: boolean
}

// Never throws on a string: every regex is linear on its input (bounded
// repeats, anchored lookbehinds).
export function extractValues(text: string, options: ExtractOptions = {}): ExtractedValue[] {
  let s = toAsciiDigits(text)
  if (options.strip) s = stripNoise(s)
  if (options.exempt) s = blankExempt(s)

  const out: ExtractedValue[] = []
  for (const pattern of PATTERNS) {
    const consumed: Array<[number, number]> = []
    for (const m of s.matchAll(pattern.regex)) {
      const built = pattern.build(m)
      if (!built) continue
      const index = m.index ?? 0
      out.push({
        ...built,
        value: options.keysOnly
          ? ''
          : text
              .slice(index, index + m[0].length)
              .trim()
              .slice(0, MAX_VALUE_CHARS),
        index,
      })
      consumed.push([index, index + m[0].length])
    }
    s = blankRanges(s, consumed)
  }
  return out.sort((a, b) => a.index - b.index)
}
