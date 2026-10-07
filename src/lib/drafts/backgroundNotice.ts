// The skipped-AI-background outcome (005 FR-06/FR-07), as data: what the
// background step returns, what each draft writer stores, and the fixed
// notice text the draft poll sends. Pure — no I/O, safe to import anywhere.
//
// The skip is stored on two nullable Draft columns, backgroundSkipReason and
// backgroundSkipDetail. Plain TEXT, not an enum: the allowed values are
// enforced here. NOT_NEEDED is never stored, because a model choosing a
// CSS/SVG design is a design decision, not a failure (design Key decision 4).

export const BACKGROUND_SKIP_REASONS = ['NO_PROVIDER', 'PROVIDER_ERROR', 'DECISION_ERROR', 'NOT_NEEDED'] as const
export type BackgroundSkipReason = (typeof BACKGROUND_SKIP_REASONS)[number]

// What background.ts returns. The step never throws: every way it can end
// is one of these.
export type BackgroundResult =
  | { url: string }
  | { url: null; skip: BackgroundSkipReason; detail?: string }

// The reasons that show a notice.
export type BackgroundNoticeReason = Exclude<BackgroundSkipReason, 'NOT_NEEDED'>

// GET /api/drafts/[id] → backgroundSkipped.
export interface BackgroundSkipped {
  reason: BackgroundNoticeReason
  message: string
}

export const SKIP_DETAIL_MAX = 300

export function clipSkipDetail(detail: string): string {
  return detail.length > SKIP_DETAIL_MAX ? detail.slice(0, SKIP_DETAIL_MAX) : detail
}

// Provider error text is shown to EVERY viewer of the draft, not just the
// person who configured the key, so anything that identifies a credential or
// an internal endpoint is removed before it is clipped or stored. Order
// matters: whole URLs go first (a key in a query string goes with them), then
// bare keys, then key=… pairs outside a URL, then host:port pairs.
const REDACTIONS: Array<[RegExp, string]> = [
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s'"<>()]+/gi, '<url>'],
  [/\bsk-[\w*.-]+/g, '<redacted>'],
  [/\bAIza[\w-]+/g, '<redacted>'],
  // No leading \b: "api_key=" and "apikey=" must match too.
  [/(key=)[^&\s]+/gi, '$1<redacted>'],
  [/\b(?:\d{1,3}(?:\.\d{1,3}){3}|[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*):\d{2,5}\b/gi, '<host>'],
]

export function redactSkipDetail(detail: string): string {
  return REDACTIONS.reduce((text, [re, replacement]) => text.replace(re, replacement), detail)
}

// Redact, then clip: what every writer stores and every reader shows.
export function cleanSkipDetail(detail: string): string {
  return clipSkipDetail(redactSkipDetail(detail))
}

// The draft columns, as a write fragment.
export interface BackgroundSkipFields {
  backgroundSkipReason: BackgroundNoticeReason | null
  backgroundSkipDetail: string | null
}

export const BACKGROUND_SKIP_CLEARED: BackgroundSkipFields = {
  backgroundSkipReason: null,
  backgroundSkipDetail: null,
}

function storedSkip(reason: BackgroundNoticeReason, detail?: string): BackgroundSkipFields {
  return { backgroundSkipReason: reason, backgroundSkipDetail: detail ? cleanSkipDetail(detail) : null }
}

// Generation, regenerate-design and Path A: the design was made from scratch,
// so the fields always describe THIS render. A produced or NOT_NEEDED
// background clears them; null (Path A, which has no background step) too.
export function generationSkipFields(result: BackgroundResult | null): BackgroundSkipFields {
  if (!result || result.url !== null || result.skip === 'NOT_NEEDED') return BACKGROUND_SKIP_CLEARED
  return storedSkip(result.skip, result.detail)
}

// Refine: its decision is instruction-gated, so it only speaks to the
// background when the instruction asked for one. Produced → clear. Wanted one
// and the provider failed (PROVIDER_ERROR) → set. Everything else → undefined,
// meaning leave the fields as they are, the same way refine treats imageUrl:
//   - NO_PROVIDER: refine resolves the provider FIRST and, with none, never
//     runs its decision, so it cannot know whether one was wanted;
//   - NOT_NEEDED: the instruction didn't ask for a background;
//   - DECISION_ERROR: the decision produced no answer, so nothing was asked
//     for (the step only reports PROVIDER_ERROR once the decision has parsed).
export function refineSkipFields(result: BackgroundResult): BackgroundSkipFields | undefined {
  if (result.url !== null) return BACKGROUND_SKIP_CLEARED
  if (result.skip === 'PROVIDER_ERROR') return storedSkip(result.skip, result.detail)
  return undefined
}

// Provider safety/moderation refusals (OpenAI "moderation_blocked" / "safety
// system", Gemini SAFETY blocks). The notice says the request was refused
// rather than echoing the provider's wording, which reads like a key problem.
// Word-anchored so a transport error never reads as a refusal: ECONNREFUSED
// and "Your account is blocked" must stay the provider's own text.
export const MODERATION_RE =
  /\bmoderation\b|moderation_blocked|\bsafety\b|content[ _-]?policy|\brequest (?:was )?refused\b/i

// Each message leads with the cause: the notice's title already says
// "No AI background", so no body repeats it.
function providerErrorMessage(detail: string | null): string {
  const cleaned = detail?.trim() ? cleanSkipDetail(detail.trim()) : null
  if (cleaned && MODERATION_RE.test(cleaned)) {
    return 'The image request was refused by the provider, so the post was designed without one.'
  }
  return cleaned
    ? `The image provider returned an error (${cleaned}), so the post was designed without one.`
    : 'The image provider returned an error, so the post was designed without one.'
}

const FIXED_MESSAGES: Record<Exclude<BackgroundNoticeReason, 'PROVIDER_ERROR'>, string> = {
  NO_PROVIDER:
    'No image provider is set up. Add an OpenAI key in Settings, or ask a team admin to add an image provider in Team settings.',
  DECISION_ERROR: 'The step that plans the background failed, so the post was designed without one.',
}

// The stored columns → the poll payload. Provider text appears at most as the
// redacted, clipped detail inside the PROVIDER_ERROR sentence; every other message is
// fixed. An unknown stored value (or NOT_NEEDED) shows nothing.
export function backgroundSkippedFor(reason: string | null, detail: string | null): BackgroundSkipped | null {
  switch (reason) {
    case 'NO_PROVIDER':
    case 'DECISION_ERROR':
      return { reason, message: FIXED_MESSAGES[reason] }
    case 'PROVIDER_ERROR':
      return { reason, message: providerErrorMessage(detail) }
    default:
      return null
  }
}
