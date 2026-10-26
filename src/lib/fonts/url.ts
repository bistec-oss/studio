import type { FontFamily } from './types'

// The Google Fonts css2 request (031 FR-19), pure: the lookup is an argument so this file is
// client-safe and testable. Families are de-duplicated and keep their order.

const PREFERRED_WEIGHTS = [400, 500, 600, 700]
const warned = new Set<string>()

function axisFor(f: FontFamily): string {
  const inRange = f.weights.filter((w) => PREFERRED_WEIGHTS.includes(w))
  const weights = [...new Set(inRange.length > 0 ? inRange : f.weights)].sort((a, b) => a - b)
  if (weights.length <= 1 && !f.italics) return ''
  if (weights.length === 0) return ''
  if (!f.italics) return `:wght@${weights.join(';')}`
  const upright = weights.map((w) => `0,${w}`)
  const italic = weights.map((w) => `1,${w}`)
  return `:ital,wght@${[...upright, ...italic].join(';')}`
}

export function googleFontsUrl(
  families: string[],
  lookup: (name: string) => FontFamily | null,
): string {
  const seen = new Set<string>()
  const parts: string[] = []
  for (const name of families) {
    if (seen.has(name)) continue
    seen.add(name)
    const found = lookup(name)
    const encoded = encodeURIComponent(name).replace(/%20/g, '+')
    if (!found) {
      if (!warned.has(name)) {
        warned.add(name)
        console.warn(`[fonts] unknown family ${name}`)
      }
      parts.push(`family=${encoded}`)
    } else {
      parts.push(`family=${encoded}${axisFor(found)}`)
    }
  }
  return `https://fonts.googleapis.com/css2?${parts.join('&')}&display=swap`
}
