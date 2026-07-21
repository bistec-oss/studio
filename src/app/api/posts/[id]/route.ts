import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, withTeamAdmin } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { resolveExportUrl } from '@/lib/storage/minio'

type Params = { id: string }

export const GET = withTeamAuth<Params>(async (_req, { params }, user) => {
  const post = await prisma.post.findUnique({
    where: { id: params.id },
    include: {
      draft: { select: { id: true, copyText: true, exportUrl: true, brief: { select: { campaignId: true } } } },
    },
  })

  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (
    !canAccessContent(user, { teamId: post.teamId, ownerId: post.userId, campaignId: post.draft.brief.campaignId })
  ) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // draft.exportUrl is stored as an EXPORTS object key — sign for the browser.
  // brief is only fetched here for the campaign visibility check — never returned.
  const { brief: _brief, ...draftRest } = post.draft
  return NextResponse.json({
    ...post,
    draft: { ...draftRest, exportUrl: await resolveExportUrl(post.draft.exportUrl) },
  })
})

export const DELETE = withTeamAdmin<Params>(async (_req, { params }, user) => {
  const post = await prisma.post.findUnique({ where: { id: params.id } })
  if (!post || post.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (post.status !== 'SCHEDULED') {
    return NextResponse.json({ error: 'Post is not scheduled' }, { status: 409 })
  }

  const updated = await prisma.post.update({
    where: { id: params.id },
    data: { status: 'CANCELLED' },
  })

  return NextResponse.json({ postId: updated.id, status: updated.status })
})
