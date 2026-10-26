// Digit and number normalisation for the facts check (027 FR-10). Pure.

// First code point of each supported zero-to-nine block: Arabic-Indic
// (U+0660), extended Arabic-Indic (U+06F0), Devanagari (U+0966), Tamil
// (U+0BE6), Sinhala Lith (U+0DE6) and fullwidth (U+FF10). Other digit sets are
// left as they are (limit L2). Every mapped code point is one UTF-16 unit, so
// the mapping preserves string length and offsets.
const DIGIT_BLOCK_STARTS = [0x0660, 0x06f0, 0x0966, 0x0be6, 0x0de6, 0xff10]

const DIGIT_MAP: ReadonlyMap<number, string> = new Map(
  DIGIT_BLOCK_STARTS.flatMap((start) =>
    Array.from({ length: 10 }, (_, i) => [start + i, String(i)] as [number, string]),
  ),
)

export function toAsciiDigits(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    out += (code >= 0x0660 && DIGIT_MAP.get(code)) || text[i]
  }
  return out
}

const MULTIPLIERS: Record<string, number> = {
  k: 1e3,
  m: 1e6,
  bn: 1e9,
  thousand: 1e3,
  million: 1e6,
  billion: 1e9,
}

/**
 * The canonical text of a number: thousands commas removed, `.` the decimal
 * point, an optional multiplier applied. `5,000`, `5000.0` and `5k` are all
 * `5000`. Returns null when the text is not a number.
 */
export function parseNumber(raw: string, multiplier?: string): string | null {
  const cleaned = raw.replace(/,/g, '')
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return null
  const factor = multiplier ? (MULTIPLIERS[multiplier.toLowerCase()] ?? 1) : 1
  const value = Number(cleaned) * factor
  if (!Number.isFinite(value)) return null
  // Floating multiplication can leave noise (1.2 * 1e6); round to a clean value.
  return String(Number(value.toPrecision(15)))
}

// The shared number grammar, as a source fragment (no capture groups): a
// thousands-grouped or plain integer, an optional decimal part.
export const NUMBER_SOURCE = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`

// The multiplier that may follow a number: `k` or `m` attached, or `bn`,
// `thousand`, `million`, `billion` (a space may precede these).
export const MULTIPLIER_SOURCE = String.raw`(?:\s?(?:bn|thousand|million|billion)|[km])`

const AMOUNT_RE = new RegExp(
  `^(${NUMBER_SOURCE})(?:\\s?(bn|thousand|million|billion)|([km]))?`,
  'i',
)

/** Reads the first number (with its multiplier) at the start of `text`. */
export function amountOf(text: string): string | null {
  const m = AMOUNT_RE.exec(text.trim())
  if (!m) return null
  return parseNumber(m[1], m[2] ?? m[3])
}

/** True for a whole number from 0 to 10 (the bare-number exemption). */
export function isSmallInteger(amount: string): boolean {
  return /^\d+$/.test(amount) && Number(amount) <= 10
}

// Minutes since midnight for a clock time; null when out of range.
export function minutesOf(hour: number, minute: number, meridiem?: string): number | null {
  let h = hour
  if (meridiem) {
    const pm = meridiem.toLowerCase() === 'pm'
    if (h < 1 || h > 12) return null
    h = (h % 12) + (pm ? 12 : 0)
  }
  if (h < 0 || h > 23 || minute < 0 || minute > 59) return null
  return h * 60 + minute
}

export const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

export function monthNumber(name: string): number | null {
  return MONTHS[name.slice(0, 3).toLowerCase()] ?? null
}
