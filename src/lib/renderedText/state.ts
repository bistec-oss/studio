// The staleness rule and the read model (030 FR-11, FR-12). One rule, called by
// every reader: the draft GET, the library list and both events. Pure, no parse
// of HTML and no render.
import { normaliseHeadline } from './normalise'
import type { RenderedText } from './stamp'
import type { HeadlineState, UnverifiedReason } from './vocab'

// A null stamp, a stamp with no headline key or a null headline is `unknown`
// (D3: a draft from before 030 shows nothing, permanently). An unverified stamp
// is never read as fresh (D2). The comparison ignores case and whitespace,
// because designs often set the case in CSS.
export function headlineState(stamp: RenderedText | null, headline: string | null): HeadlineState {
  const h = stamp?.headline
  if (!h || headline === null) return 'unknown'
  if (!h.verified) return 'unconfirmed'
  return normaliseHeadline(h.text) === normaliseHeadline(headline) ? 'fresh' : 'stale'
}

export interface ScheduledPosts {
  count: number
  nextAt: string
}

export interface HeadlineImage {
  state: HeadlineState
  renderedHeadline: string | null
  reason: UnverifiedReason | null
  scheduledPosts: ScheduledPosts | null
}

// Each field is filled only for the states the spec names. `scheduled` is passed
// in by the caller, which reads it only when the state calls for it.
export function headlineImageFor(
  stamp: RenderedText | null,
  headline: string | null,
  scheduled: ScheduledPosts | null,
): HeadlineImage {
  const state = headlineState(stamp, headline)
  const h = stamp?.headline
  return {
    state,
    renderedHeadline: state === 'stale' && h ? h.text : null,
    reason: state === 'unconfirmed' && h && !h.verified ? h.reason : null,
    scheduledPosts: (state === 'stale' || state === 'unconfirmed') && scheduled ? scheduled : null,
  }
}
