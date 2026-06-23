import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { resolveBrandKit } from '@/lib/brandkit/resolve'

async function loadDraft(id: string) {
  const draft = await prisma.draft.findUnique({
    where: { id },
    include: {
      brief: true,
      posts: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          channel: true,
          status: true,
          scheduledAt: true,
          publishedAt: true,
        },
      },
      _count: { select: { revisions: true } },
    },
  })
  if (!draft) return null

  const kit = await resolveBrandKit(draft.brief.campaignId ?? undefined)

  return {
    id: draft.id,
    briefId: draft.briefId,
    copyText: draft.copyText,
    imageUrl: draft.imageUrl,
    htmlContent: draft.htmlContent,
    exportUrl: draft.exportUrl,
    status: draft.status,
    createdAt: draft.createdAt,
    revisionCount: draft._count.revisions,
    brandKitName: kit?.name ?? null,
    brief: {
      id: draft.brief.id,
      topic: draft.brief.topic,
      goal: draft.brief.goal,
      tone: draft.brief.tone,
      channels: draft.brief.channels,
      designMode: draft.brief.designMode,
    },
    posts: draft.posts,
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const draft = await loadDraft(params.id)
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

  return NextResponse.json(draft)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { copyText } = await req.json()
  if (typeof copyText !== 'string') {
    return NextResponse.json({ error: 'copyText is required' }, { status: 400 })
  }

  const existing = await prisma.draft.findUnique({ where: { id: params.id }, select: { status: true } })
  if (!existing) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

  await prisma.draft.update({
    where: { id: params.id },
    data: {
      copyText,
      // A copy edit invalidates a prior export.
      ...(existing.status === 'EXPORTED' ? { status: 'IN_PROGRESS' } : {}),
    },
  })

  const draft = await loadDraft(params.id)
  return NextResponse.json(draft)
}
