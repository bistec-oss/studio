import { prisma } from '@/lib/prisma'
import { loadCaptionForPublish } from '@/lib/captions/store'
import { unavailableReason } from '@/lib/captions/resolve'
import * as instagramPublisher from '@/lib/social/instagram'
import * as linkedinPublisher from '@/lib/social/linkedin'
import { PublishError } from '@/lib/social/types'
import { resolveExportUrl } from '@/lib/storage/minio'
import type { AnalyticsSource, Channel, Post } from '@prisma/client'
import { trackPublish } from '@/lib/publish/trackPublish'
import { headlineState } from '@/lib/renderedText/state'
import { parseRenderedText } from '@/lib/renderedText/stamp'

// The one channel → publisher map. Every publish surface (immediate API path,
// FAILED-retry, scheduler tick, ACP tool) goes through this module so a new
// channel or telemetry change is a single edit.
// A channel with no entry (WhatsApp: 010 was dropped on 2026-10-23) fails closed and terminally,
// with the resolver's rule-1 reason.
export const publishers: Partial<
  Record<Channel, { publish(url: string, caption: string, teamId: string): Promise<{ platformId: string }> }>
> = {
  INSTAGRAM: instagramPublisher,
  LINKEDIN: linkedinPublisher,
}

// Statuses that count as "live" for duplicate detection: a second publish of the
// same (draft, channel) while one of these exists would double-post. FAILED and
// CANCELLED rows don't block — re-publishing those is legitimate.
const LIVE_POST_STATUSES = ['PENDING', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED'] as const

export async function findLivePost(draftId: string, channel: Channel): Promise<Post | null> {
  return prisma.post.findFirst({
    where: { draftId, channel, status: { in: [...LIVE_POST_STATUSES] } },
  })
}

// Resolves this channel's caption (012 FR-14), then signs the stored EXPORTS
// object key and pushes the image + caption to the channel. The caption is
// decided first, so a refused publish never signs the export: a refusal throws
// a terminal PublishError with the resolver's reason, which retrying can't fix.
// Throws a retryable PublishError('draft export missing') when the draft lost
// its export between scheduling and publish — callers surface it as errorReason.
export async function publishToChannel(
  channel: Channel,
  exportKey: string | null | undefined,
  draftId: string,
  teamId: string
): Promise<{ platformId: string }> {
  const publisher = publishers[channel]
  if (!publisher) {
    throw new PublishError(channel, unavailableReason(channel), { terminal: true })
  }
  const caption = await loadCaptionForPublish(draftId, channel)
  if (!caption.ok) {
    throw new PublishError(channel, caption.reason, { terminal: true })
  }
  const signedExportUrl = await resolveExportUrl(exportKey)
  if (!signedExportUrl) {
    throw new PublishError(channel, 'draft export missing')
  }
  return publisher.publish(signedExportUrl, caption.text, teamId)
}

// Immediate-publish state machine shared by the API POST /api/posts path and
// the ACP publish tool: create PENDING → publish → drive to PUBLISHED/FAILED.
// The external publish call can't be inside a DB transaction, so every exit
// (success, PublishError, or unexpected throw) must leave the row terminal —
// a PENDING row must never survive this function.
export async function createAndPublishPost(opts: {
  draftId: string
  channel: Channel
  userId: string
  scheduledAt?: Date | null
  // 006: where the publish was started; every caller states it.
  source: AnalyticsSource
}): Promise<{ post: Post; error?: PublishError }> {
  const startedAt = Date.now()
  // Loaded once, before the PENDING row, so the Post can be stamped with the
  // draft's team at creation (draft.teamId is the source of truth here).
  const draft = await prisma.draft.findUniqueOrThrow({
    where: { id: opts.draftId },
    select: { exportUrl: true, teamId: true, headline: true, renderedText: true },
  })

  const post = await prisma.post.create({
    data: {
      teamId: draft.teamId,
      draftId: opts.draftId,
      userId: opts.userId,
      channel: opts.channel,
      status: 'PENDING',
      scheduledAt: opts.scheduledAt ?? null,
    },
  })

  const base = {
    source: opts.source,
    teamId: draft.teamId,
    userId: opts.userId,
    draftId: opts.draftId,
    channel: opts.channel,
    retryCount: 0,
    startedAt,
    // 030 FR-16: what the image shows of the headline at this attempt.
    headlineState: headlineState(parseRenderedText(draft.renderedText), draft.headline),
  }
  let published: Post
  try {
    // draft.teamId is NOT NULL as of Task 15 (Migration B) — no more
    // pre-tenancy null rows to coerce.
    const { platformId } = await publishToChannel(opts.channel, draft.exportUrl, opts.draftId, draft.teamId)
    published = await prisma.post.update({
      where: { id: post.id },
      data: { status: 'PUBLISHED', publishedAt: new Date(), platformId },
    })
  } catch (err) {
    const reason = err instanceof PublishError ? err.reason : 'Unexpected publish error'
    const updated = await prisma.post.update({
      where: { id: post.id },
      data: { status: 'FAILED', errorReason: reason },
    })
    // The event follows the FAILED write and sits outside the success path's
    // try, so it can never change what this function returns (006 NFR-01).
    await trackPublish({
      ...base,
      outcome: 'failed',
      terminal: err instanceof PublishError ? err.terminal : true,
      errorReason: reason,
    })
    // Known publish failures are an expected outcome (FAILED row returned);
    // anything else is a real fault — rethrow after the row is safely terminal.
    if (err instanceof PublishError) {
      return { post: updated, error: err }
    }
    throw err
  }
  await trackPublish({ ...base, outcome: 'published', terminal: true })
  return { post: published }
}
