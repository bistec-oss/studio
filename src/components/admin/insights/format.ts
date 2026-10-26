// Display helpers for the insights page (006 FR-10). Pure, no React.

/** A 0..1 ratio as a percentage with one decimal, or an en dash when undefined. */
export function pct(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return '–'
  return `${Math.round(rate * 1000) / 10}%`
}

/** Milliseconds as "850 ms" or "12.4 s". */
export function ms(value: number | null | undefined): string {
  if (value === null || value === undefined) return '–'
  return value < 1000 ? `${Math.round(value)} ms` : `${Math.round(value / 100) / 10} s`
}

export function num(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return '–'
  return digits > 0 ? value.toFixed(digits) : String(value)
}

/** A stable label for a nullable dimension value (a model, a route, a version). */
export function dim(value: string | null | undefined): string {
  return value ? value : 'not recorded'
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '–'
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export const RANGE_OPTIONS = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
]
