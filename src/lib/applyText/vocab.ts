// The closed lists every side of Apply to image shares: the route, the badge,
// the events and the in-render check. One definition, imported everywhere.
// Pure and client-safe.
//
// THE KEY RULE (031 FR-36): these lists are append-only. A value is never
// renamed and never reused for a different meaning; a new one is appended; a
// retired one stays readable. A coverage test fails if a value has no event
// field that can carry it.

// The fields Apply can write (the keys of the 030 `renderedText` stamp).
export const APPLY_FIELDS = ['headline'] as const
export type ApplyField = (typeof APPLY_FIELDS)[number]

// How the text reaches the image.
export const APPLY_METHODS = ['splice'] as const
export type ApplyMethod = (typeof APPLY_METHODS)[number]

// Why an Apply was refused or rolled back.
export const APPLY_FAILURES = [
  'not-stale',
  'not-found',
  'ambiguous',
  'unsafe-element',
  'unsafe-text',
  'new-text-present',
  'splice-mismatch',
  'not-painted',
  'old-still-painted',
  'render-failed',
  'conflict',
] as const
export type ApplyFailure = (typeof APPLY_FAILURES)[number]

// FR-35: below an 80% rate of exactly one safe candidate, Apply is labelled
// "Beta". Set from .specclaw/changes/031-v2-final-polish/measure/results.md
// (the 35-draft sample is non-representative; see that file).
export const APPLY_TEXT_BETA = false
