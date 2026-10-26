// The one emitter of `publish.settled` (006 FR-04). Every publish outcome, from
// the immediate path, the retry route, the MCP/ACP tool and the scheduler tick,
// calls this once per decided outcome, after the Post row is written. It never
// throws in production (track's contract); the callers place it outside their
// own try blocks so it cannot change a publish's result.
import type { AnalyticsSource, Channel } from '@prisma/client'
import { track } from '@/lib/analytics/track'
import type { HeadlineState } from '@/lib/renderedText/vocab'

export interface PublishOutcome {
  source: AnalyticsSource
  teamId: string
  userId?: string | null
  draftId: string
  channel: Channel
  outcome: 'published' | 'failed' | 'retry-scheduled'
  /** True when the post will not be tried again (published, or failed for good). */
  terminal: boolean
  retryCount?: number
  errorReason?: string
  /** Epoch ms when this attempt began. */
  startedAt: number
  /** 030 FR-16: what the image showed of the headline at the attempt. */
  headlineState?: HeadlineState
}

export async function trackPublish(o: PublishOutcome): Promise<void> {
  await track('publish.settled', {
    source: o.source,
    teamId: o.teamId,
    userId: o.userId ?? null,
    draftId: o.draftId,
    durationMs: Date.now() - o.startedAt,
    outcome: o.outcome,
    payload: {
      channel: o.channel,
      terminal: o.terminal,
      ...(o.retryCount !== undefined ? { retryCount: o.retryCount } : {}),
      ...(o.errorReason !== undefined ? { errorReason: o.errorReason } : {}),
      ...(o.headlineState !== undefined ? { headlineState: o.headlineState } : {}),
    },
  })
}
