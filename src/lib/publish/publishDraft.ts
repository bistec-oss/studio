import { prisma } from '@/lib/prisma'
import * as instagramPublisher from '@/lib/social/instagram'
import * as linkedinPublisher from '@/lib/social/linkedin'
import { PublishError } from '@/lib/social/types'
import { resolveExportUrl } from '@/lib/storage/minio'
import type { Channel, Post } from '@prisma/client'

// The one channel → publisher map. Every publish surface (immediate API path,
// FAILED-retry, scheduler tick, ACP tool) goes through this module so a new
// channel or telemetry change is a single edit.
export const publishers = {
  INSTAGRAM: instagramPublisher,
  LINKEDIN: linkedinPublisher,
} as const satisfies Record<Channel, { publish(url: string, caption: string): Promise<{ platformId: string }> }>

// Statuses that count as "live" for duplicate detection: a second publish of the
// same (draft, channel) while one of these exists would double-post. FAILED and
// CANCELLED rows don't block — re-publishing those is legitimate.
const LIVE_POST_STATUSES = ['PENDING', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED'] as const

export async function findLivePost(draftId: string, channel: Channel): Promise<Post | null> {
  return prisma.post.findFirst({
    where: { draftId, channel, status: { in: [...LIVE_POST_STATUSES] } },
  })
}

// Signs the stored EXPORTS object key and pushes the image + caption to the
// channel. Throws PublishError('draft export missing') when the draft lost its
// export between scheduling and publish — callers surface it as errorReason.
export async function publishToChannel(
  channel: Channel,
  exportKey: string | null | undefined,
  copyText: string
): Promise<{ platformId: string }> {
  const signedExportUrl = await resolveExportUrl(exportKey)
  if (!signedExportUrl) {
    throw new PublishError(channel, 'draft export missing')
  }
  return publishers[channel].publish(signedExportUrl, copyText)
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
}): Promise<{ post: Post; error?: PublishError }> {
  const post = await prisma.post.create({
    data: {
      draftId: opts.draftId,
      userId: opts.userId,
      channel: opts.channel,
      status: 'PENDING',
      scheduledAt: opts.scheduledAt ?? null,
    },
  })

  try {
    const draft = await prisma.draft.findUniqueOrThrow({
      where: { id: opts.draftId },
      select: { exportUrl: true, copyText: true },
    })
    const { platformId } = await publishToChannel(opts.channel, draft.exportUrl, draft.copyText ?? '')
    const updated = await prisma.post.update({
      where: { id: post.id },
      data: { status: 'PUBLISHED', publishedAt: new Date(), platformId },
    })
    return { post: updated }
  } catch (err) {
    const reason = err instanceof PublishError ? err.reason : 'Unexpected publish error'
    const updated = await prisma.post.update({
      where: { id: post.id },
      data: { status: 'FAILED', errorReason: reason },
    })
    // Known publish failures are an expected outcome (FAILED row returned);
    // anything else is a real fault — rethrow after the row is safely terminal.
    if (err instanceof PublishError) {
      return { post: updated, error: err }
    }
    throw err
  }
}
