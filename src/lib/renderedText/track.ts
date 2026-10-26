// The one emitter of `draft.headline_edited` (030 FR-15, design 5.1). It lives
// outside the pure files (it imports prisma and track), so index.ts does not
// re-export it. Called after a headline write by the headline PATCH and by the
// regenerate-copy settle. It never throws; no payload field holds text (NFR-05).
import { prisma } from '@/lib/prisma'
import { track } from '@/lib/analytics/track'
import { parseRenderedText } from './stamp'
import { headlineState } from './state'

export interface HeadlineEditedInput {
  draftId: string
  teamId: string
  userId: string | null
  via: 'edit' | 'regenerate' | 'apply'
  /** The headline before the write. */
  before: string | null
}

export async function trackHeadlineEdited(input: HeadlineEditedInput): Promise<void> {
  try {
    const draft = await prisma.draft.findUnique({
      where: { id: input.draftId },
      select: {
        headline: true,
        renderedText: true,
        _count: { select: { posts: { where: { status: 'SCHEDULED' } } } },
      },
    })
    if (!draft) return
    // No change, no event.
    if (input.before === draft.headline) return
    await track('draft.headline_edited', {
      source: 'web',
      teamId: input.teamId,
      userId: input.userId,
      draftId: input.draftId,
      payload: {
        via: input.via,
        state: headlineState(parseRenderedText(draft.renderedText), draft.headline),
        scheduledPending: draft._count.posts > 0,
      },
    })
  } catch (err) {
    console.error(`[headline] draft ${input.draftId}: the headline_edited event failed:`, err)
  }
}
