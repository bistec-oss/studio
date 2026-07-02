import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAdmin } from '@/lib/api/handler'
import { PublishError } from '@/lib/social/types'
import { resolveExportUrl } from '@/lib/storage/minio'
import { publishToChannel } from '@/lib/publish/publishDraft'

export const POST = withAdmin<{ id: string }>(async (_req, { params }) => {
  const post = await prisma.post.findUnique({
    where: { id: params.id },
    include: {
      draft: { select: { exportUrl: true, copyText: true } },
    },
  })

  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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

  try {
    const { platformId } = await publishToChannel(post.channel, draft.exportUrl, draft.copyText ?? '')
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
    return NextResponse.json({ postId: updated.id, status: updated.status })
  } catch (err) {
    if (err instanceof PublishError) {
      const updated = await prisma.post.update({
        where: { id: post.id },
        data: { status: 'FAILED', errorReason: err.reason, nextRetryAt: null },
      })
      return NextResponse.json({ postId: updated.id, status: updated.status })
    }
    throw err
  }
})
