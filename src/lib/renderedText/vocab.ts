// The closed lists every side of 030 shares: the stamp, the API, the badge and
// the events. One definition, imported everywhere (never copied). Pure.

// What the draft page and the library know about the image's headline.
export const HEADLINE_STATES = ['fresh', 'stale', 'unconfirmed', 'unknown'] as const
export type HeadlineState = (typeof HEADLINE_STATES)[number]

// Why a render's headline could not be confirmed as painted.
export const UNVERIFIED_REASONS = ['not-found', 'ambiguous', 'not-visible', 'not-checked'] as const
export type UnverifiedReason = (typeof UNVERIFIED_REASONS)[number]

// The outcome of one check of one render.
export const HEADLINE_CHECKS = ['painted', ...UNVERIFIED_REASONS] as const
export type HeadlineCheck = (typeof HEADLINE_CHECKS)[number]

// The most a check may add to a render; a throw or a timeout is `not-checked`.
export const HEADLINE_CHECK_TIMEOUT_MS = 5000
