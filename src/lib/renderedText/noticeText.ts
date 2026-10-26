// The sentences of the headline badge and the publish dialog (030 FR-13, FR-14),
// in one place so the page, the dialog and the tests share them. Pure and
// client-safe; structured lines, not JSX.
import type { HeadlineImage } from './state'
import type { HeadlineState, UnverifiedReason } from './vocab'

export interface HeadlineNotice {
  // The first sentence, by state.
  headline: string
  // The per-reason sentence, for `unconfirmed` only.
  reasonLine: string | null
  // The scheduled-posts sentence, when the image has scheduled posts.
  scheduledLine: string | null
}

const REASON_LINE: Record<UnverifiedReason, string> = {
  'not-found': 'The design does not contain it as one piece of text.',
  ambiguous: 'The design shows it more than once.',
  'not-visible': 'It is in the design but hidden, clipped or covered.',
  'not-checked': 'The check could not run.',
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "27 Oct 2026", in UTC. Fixed and locale-free, so the server, the browser and
// the tests print the same text. An unparsable value is returned as given.
export function formatScheduledDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

// Null for `fresh` and `unknown`: the badge renders only for `stale` and `unconfirmed`.
export function headlineNoticeText(image: HeadlineImage): HeadlineNotice | null {
  if (image.state !== 'stale' && image.state !== 'unconfirmed') return null
  const headline =
    image.state === 'stale'
      ? `The image still shows the previous headline “${image.renderedHeadline ?? ''}”.`
      : "We couldn't confirm that the image shows the current headline."
  const reasonLine =
    image.state === 'unconfirmed' && image.reason ? REASON_LINE[image.reason] : null
  const s = image.scheduledPosts
  const scheduledLine = s
    ? `${s.count} scheduled ${s.count === 1 ? 'post' : 'posts'} will publish this image, the next on ${formatScheduledDate(s.nextAt)}.`
    : null
  return { headline, reasonLine, scheduledLine }
}

// The one non-blocking line in the publish dialog; null for `fresh` and `unknown`.
export function publishLineFor(state: HeadlineState): string | null {
  if (state === 'stale') return 'The image shows an older headline.'
  if (state === 'unconfirmed') return "We couldn't confirm the image shows the current headline."
  return null
}
