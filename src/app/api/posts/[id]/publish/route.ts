import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import * as instagramPublisher from '@/lib/social/instagram'
import * as linkedinPublisher from '@/lib/social/linkedin'
import { PublishError } from '@/lib/social/types'
import { resolveExportUrl } from '@/lib/storage/minio'

const publishers = {
  INSTAGRAM: instagramPublisher,
  LINKEDIN: linkedinPublisher,
}

export async function POST(
  _: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

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
  // Sign the stored export key for the publisher's one-off image fetch.
  const signedExportUrl = await resolveExportUrl(draft.exportUrl)
  if (!signedExportUrl) {
    return NextResponse.json({ error: 'Draft has no export' }, { status: 422 })
  }

  try {
    const { platformId } = await publishers[post.channel].publish(
      signedExportUrl,
      draft.copyText ?? '',
    )
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
}
