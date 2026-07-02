import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, requireRole } from '@/lib/auth'
import * as instagramPublisher from '@/lib/social/instagram'
import * as linkedinPublisher from '@/lib/social/linkedin'
import { PublishError } from '@/lib/social/types'
import { resolveExportUrl } from '@/lib/storage/minio'
import { Channel } from '@prisma/client'

const publishers = {
  INSTAGRAM: instagramPublisher,
  LINKEDIN: linkedinPublisher,
}

export async function POST(req: NextRequest) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const { draftId, channel, scheduledAt } = body as {
    draftId?: string
    channel?: string
    scheduledAt?: string
  }

  if (!draftId?.trim()) {
    return NextResponse.json({ error: 'draftId is required' }, { status: 400 })
  }
  if (!channel || !['INSTAGRAM', 'LINKEDIN'].includes(channel)) {
    return NextResponse.json({ error: 'channel must be INSTAGRAM or LINKEDIN' }, { status: 400 })
  }

  const draft = await prisma.draft.findUnique({ where: { id: draftId } })
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

  if (!draft.exportUrl) {
    return NextResponse.json({ error: 'Draft has no export URL' }, { status: 422 })
  }

  const scheduledAtDate = scheduledAt ? new Date(scheduledAt) : null
  if (scheduledAtDate && Number.isNaN(scheduledAtDate.getTime())) {
    return NextResponse.json({ error: 'scheduledAt must be a valid date' }, { status: 400 })
  }
  const publishNow = !scheduledAtDate || scheduledAtDate <= new Date()

  // Scheduled path: persist a SCHEDULED row directly — no transient PENDING that
  // could be orphaned if the request dies before the follow-up update.
  if (!publishNow) {
    const post = await prisma.post.create({
      data: {
        draftId,
        userId: auth.userId,
        channel: channel as Channel,
        status: 'SCHEDULED',
        scheduledAt: scheduledAtDate,
      },
    })
    return NextResponse.json({ postId: post.id, status: post.status }, { status: 201 })
  }

  // Sign the stored export key for the publisher's one-off image fetch. Resolved
  // before the post row is created so a resolution failure can't strand a PENDING row.
  const signedExportUrl = await resolveExportUrl(draft.exportUrl)
  if (!signedExportUrl) {
    return NextResponse.json({ error: 'Draft has no export' }, { status: 422 })
  }

  // Immediate path: the external publish call can't be inside a DB transaction,
  // so every exit (success, PublishError, or unexpected throw) must drive the
  // row to a terminal status — a PENDING row must never survive this handler.
  const post = await prisma.post.create({
    data: {
      draftId,
      userId: auth.userId,
      channel: channel as Channel,
      status: 'PENDING',
      scheduledAt: scheduledAtDate,
    },
  })

  try {
    const { platformId } = await publishers[channel as keyof typeof publishers].publish(
      signedExportUrl,
      draft.copyText ?? '',
    )
    const updated = await prisma.post.update({
      where: { id: post.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        platformId,
      },
    })
    return NextResponse.json({ postId: updated.id, status: updated.status }, { status: 201 })
  } catch (err) {
    const reason = err instanceof PublishError ? err.reason : 'Unexpected publish error'
    const updated = await prisma.post.update({
      where: { id: post.id },
      data: { status: 'FAILED', errorReason: reason },
    })
    // Known publish failures are an expected outcome (201, FAILED row); anything
    // else is a real fault — surface it after the row is safely terminal.
    if (err instanceof PublishError) {
      return NextResponse.json({ postId: updated.id, status: updated.status }, { status: 201 })
    }
    throw err
  }
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') ?? '20', 10)))

  const where = user.role === 'admin' ? {} : { userId: user.userId }

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where,
      include: {
        draft: { select: { id: true, copyText: true, exportUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.post.count({ where }),
  ])

  // draft.exportUrl is stored as an EXPORTS object key — sign for the browser.
  const signedPosts = await Promise.all(
    posts.map(async (p) => ({
      ...p,
      draft: { ...p.draft, exportUrl: await resolveExportUrl(p.draft.exportUrl) },
    }))
  )

  return NextResponse.json({ posts: signedPosts, total, page, pageSize })
}
