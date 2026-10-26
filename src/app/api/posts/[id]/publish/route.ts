import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAdmin } from '@/lib/api/handler'
import { PublishError } from '@/lib/social/types'
import { resolveExportUrl } from '@/lib/storage/minio'
import { publishToChannel } from '@/lib/publish/publishDraft'
import { trackPublish } from '@/lib/publish/trackPublish'
import { headlineState } from '@/lib/renderedText/state'
import { parseRenderedText } from '@/lib/renderedText/stamp'

export const POST = withTeamAdmin<{ id: string }>(async (_req, { params }, user) => {
  const post = await prisma.post.findUnique({
    where: { id: params.id },
    include: {
      draft: { select: { exportUrl: true, headline: true, renderedText: true } },
    },
  })

  if (!post || post.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (post.status !== 'FAILED') {
    return NextResponse.json({ error: 'Post is not in FAILED state' }, { status: 409 })
  }

  const { draft } = post
  // Pre-check so a missing export stays a clear 422 (publishToChannel would
  // otherwise surface it as a FAILED row, changing this route's contract).
  const signedExportUrl = await resolveExportUrl(draft.exportUrl)
  if (!signedExportUrl) {
    return NextResponse.json({ error: 'Draft has no export' }, { status: 422 })
  }

  const startedAt = Date.now()
  const trackFields = {
    source: 'web' as const,
    teamId: user.teamId,
    userId: user.userId,
    draftId: post.draftId,
    channel: post.channel,
    startedAt,
    // 030 FR-16: what the image shows of the headline at this attempt.
    headlineState: headlineState(parseRenderedText(draft.renderedText), draft.headline),
  }
  try {
    // A refused caption (012 FR-14) is a terminal PublishError: the post
    // stays FAILED with the new reason, as below.
    const { platformId } = await publishToChannel(post.channel, draft.exportUrl, post.draftId, user.teamId)
    const updated = await prisma.post.update({
      where: { id: post.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        platformId,
        errorReason: null,
        retryCount: 0,
        nextRetryAt: null,
      },
    })
    await trackPublish({ ...trackFields, outcome: 'published', terminal: true, retryCount: 0 })
    return NextResponse.json({ postId: updated.id, status: updated.status })
  } catch (err) {
    if (err instanceof PublishError) {
      const updated = await prisma.post.update({
        where: { id: post.id },
        data: { status: 'FAILED', errorReason: err.reason, nextRetryAt: null },
      })
      await trackPublish({
        ...trackFields,
        outcome: 'failed',
        terminal: err.terminal,
        retryCount: post.retryCount,
        errorReason: err.reason,
      })
      // A retry that fails again is an error, in the immediate path's shape
      // (017 FR-02). The row stays FAILED with the new reason.
      return NextResponse.json(
        { error: err.reason, code: 'PUBLISH_FAILED', postId: updated.id, status: updated.status },
        { status: 502 }
      )
    }
    throw err
  }
})
