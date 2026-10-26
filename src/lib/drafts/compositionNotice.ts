import { FALLBACK_STYLE_LABEL, styleLabel, type CompositionStamp, type FallbackReason } from '@/lib/designData'

// 009 FR-15: the draft page's composition notice. A pure function of the
// stamp, so the wording is unit-testable and the route and the page share it.
// Client-safe (designData imports nothing server-side).

export type CompositionNoticeReason = FallbackReason | 'layout-violation'

export interface CompositionNotice {
  reason: CompositionNoticeReason
  message: string
}

const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// The stamp's requested style by its label (a retired key still has one); an
// unknown key reads "that image style".
export function compositionNoticeFor(stamp: CompositionStamp | null): CompositionNotice | null {
  if (!stamp) return null
  const label = styleLabel(stamp.requestedArchetype)
  const unknown = label === FALLBACK_STYLE_LABEL
  const subject = upperFirst(label)
  const classic = 'so the classic style was used.'

  switch (stamp.fallbackReason) {
    case 'busy':
      return { reason: 'busy', message: `${subject} could not be used for this post (the image was too busy where the text goes), ${classic}` }
    case 'contrast':
      return {
        reason: 'contrast',
        message: `${subject} could not be used for this post (the image was not clear enough behind the text to keep it readable), ${classic}`,
      }
    case 'region-invalid':
      return { reason: 'region-invalid', message: `${subject} could not be used for this post (the text area could not be checked), ${classic}` }
    case 'check-error':
      return { reason: 'check-error', message: `${subject} could not be used for this post (the image check could not run), ${classic}` }
    case 'no-image':
      return { reason: 'no-image', message: `${subject} needs an image and none was made, ${classic}` }
    case 'unknown-archetype':
      return { reason: 'unknown-archetype', message: 'That image style is no longer available, so the classic style was used.' }
    case 'unsupported-size':
      return { reason: 'unsupported-size', message: `${subject} is not available for the 9:16 size, ${classic}` }
    case 'refine-replaced-image':
      return {
        reason: 'refine-replaced-image',
        message: `The new background replaced the ${unknown ? '' : `${label} `}image, so the classic style now applies.`,
      }
    case 'composite-not-blank':
      return {
        reason: 'composite-not-blank',
        message: `${subject} could not be used for this post (no clear blank screen was found in the image, so your screenshot could not be placed on it), ${classic}`,
      }
    case 'composite-not-rendered':
      return {
        reason: 'composite-not-rendered',
        message: `${subject} could not be used for this post (your product screenshot could not be placed on the screen), so the post uses the classic style without the hero image.`,
      }
    case 'composite-source-missing':
      return {
        reason: 'composite-source-missing',
        message: `${subject} could not be used for this post (your product screenshot was not available), so the post uses the classic style without the hero image.`,
      }
    default:
      break
  }
  if (stamp.observations?.includes('layout-violation')) {
    return {
      reason: 'layout-violation',
      message: `Some text or the logo sits outside the area ${label} reserves for it. The post is unchanged; check it before publishing.`,
    }
  }
  return null
}
