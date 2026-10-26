// One sentence per failure, for the person who clicked Apply. Client-safe: no
// Prisma, no server imports.
import type { ApplyFailure } from './vocab'

const FAILURE_SENTENCES: Record<ApplyFailure, string> = {
  'not-stale': 'The image already shows this headline.',
  'not-found': 'The headline text could not be found in the image, so it was not changed.',
  ambiguous:
    'The old headline appears more than once in the design, so it was not changed. Use Regenerate design instead.',
  'unsafe-element':
    'The headline sits in an element that holds an image or a placed screenshot, so it was not changed.',
  'unsafe-text': 'That headline contains text the design reserves, so it was not changed.',
  'new-text-present': 'The new headline already appears elsewhere in the design, so it was not changed.',
  'splice-mismatch': 'The design changed in an unexpected way, so nothing was saved.',
  'not-painted': 'The new headline did not show in the rendered image, so nothing was saved.',
  'old-still-painted': 'The old headline still shows in the rendered image, so nothing was saved.',
  'render-failed': 'The image could not be rendered, so nothing was saved.',
  conflict: 'The post changed while Apply ran, so nothing was saved. Try again.',
}

export function applyFailureNotice(failure: ApplyFailure): string {
  return FAILURE_SENTENCES[failure]
}
