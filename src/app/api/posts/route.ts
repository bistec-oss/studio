import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, requireRole } from '@/lib/auth'
import * as instagramPublisher from '@/lib/social/instagram'
import * as linkedinPublisher from '@/lib/social/linkedin'
import { PublishError } from '@/lib/social/types'
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
  const publishNow = !scheduledAtDate || scheduledAtDate <= new Date()

  const post = await prisma.post.create({
    data: {
      draftId,
      userId: auth.userId,
      channel: channel as Channel,
      status: 'PENDING',
      scheduledAt: scheduledAtDate,
    },
  })

  if (publishNow) {
    try {
      const { platformId } = await publishers[channel as keyof typeof publishers].publish(
        draft.exportUrl,
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
      if (err instanceof PublishError) {
        const updated = await prisma.post.update({
          where: { id: post.id },
          data: { status: 'FAILED', errorReason: err.reason },
        })
        return NextResponse.json({ postId: updated.id, status: updated.status }, { status: 201 })
      }
      throw err
    }
  } else {
    const updated = await prisma.post.update({
      where: { id: post.id },
      data: { status: 'SCHEDULED' },
    })
    return NextResponse.json({ postId: updated.id, status: updated.status }, { status: 201 })
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

  return NextResponse.json({ posts, total, page, pageSize })
}
