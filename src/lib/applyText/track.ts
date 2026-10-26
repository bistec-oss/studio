// The one emitter of `draft.text_applied` (031 FR-43). It lives outside the pure
// files (it imports track), so index.ts does not re-export it. One event per
// Apply request that reached a verdict, including the synchronous refusals. It
// never throws, and no payload field holds text (NFR-05).
import { track } from '@/lib/analytics/track'
import type { ApplyField, ApplyFailure, ApplyMethod } from './vocab'

export interface TextAppliedInput {
  draftId: string
  teamId: string
  userId: string | null
  field: ApplyField
  method: ApplyMethod
  /** Set when the Apply failed; absent means it succeeded. */
  failure?: ApplyFailure
}

export async function trackTextApplied(input: TextAppliedInput): Promise<void> {
  try {
    await track('draft.text_applied', {
      source: 'web',
      teamId: input.teamId,
      userId: input.userId,
      draftId: input.draftId,
      outcome: input.failure ? 'failed' : 'ok',
      payload: {
        field: input.field,
        method: input.method,
        ...(input.failure ? { failure: input.failure } : {}),
      },
    })
  } catch (err) {
    console.error(`[apply-text] draft ${input.draftId}: the text_applied event failed:`, err)
  }
}
