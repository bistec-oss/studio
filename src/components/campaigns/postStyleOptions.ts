import { activeStyles, getStyle } from '@/lib/postStyles'

// 027 FR-08: the options of a "Default post style" select. The first option is
// "none" (the wizard then falls to General). A retired style that is already
// the stored value stays in the list, so the select never shows a blank.
export function postStyleOptions(noneLabel: string, current?: string | null): { value: string; label: string }[] {
  const options = activeStyles().map(s => ({ value: s.key, label: s.label }))
  const stored = current ? getStyle(current) : undefined
  if (stored && !options.some(o => o.value === stored.key)) {
    options.push({ value: stored.key, label: `${stored.label} (retired)` })
  }
  return [{ value: '', label: noneLabel }, ...options]
}

/** The label for a stored key, else null (unknown or absent). */
export function postStyleLabel(key: string | null | undefined): string | null {
  return key ? (getStyle(key)?.label ?? null) : null
}
