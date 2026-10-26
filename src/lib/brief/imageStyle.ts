import { isActiveKey } from '@/lib/designData'

// 009 FR-03: the brief's image style, validated at the API. Pure and
// client-safe. Absent is `classic`; a key that is not an ACTIVE archetype
// (unknown or retired) is refused at creation, because a new brief must not
// name a style that no longer exists (an existing brief whose style is later
// retired is handled at call time, as `unknown-archetype`). A non-classic
// style needs the freeform path (the template path never has a hero image).
// The size is resolved at call time: a look that does not declare the size
// records `unsupported-size`.

export const CLASSIC_STYLE = 'classic'

export type ImageStyleResult = { ok: true; value: string } | { ok: false; error: string }

export function validateImageStyle(raw: unknown, designMode: string | undefined): ImageStyleResult {
  if (raw === undefined || raw === null) return { ok: true, value: CLASSIC_STYLE }
  if (typeof raw !== 'string') return { ok: false, error: 'imageStyle must be a string' }
  if (raw === CLASSIC_STYLE) return { ok: true, value: CLASSIC_STYLE }
  if (!isActiveKey(raw)) return { ok: false, error: 'imageStyle is not an available image style' }
  if (designMode === 'TEMPLATE') {
    return { ok: false, error: 'imageStyle other than classic needs the freeform (GENERATE) design mode' }
  }
  return { ok: true, value: raw }
}

// A stored value (an autosaved brief) back to a usable choice: anything that is
// not classic or an active key resumes as classic.
export function resumeImageStyle(stored: unknown): string {
  return typeof stored === 'string' && stored !== CLASSIC_STYLE && isActiveKey(stored) ? stored : CLASSIC_STYLE
}
