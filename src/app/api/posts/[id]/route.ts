import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth, withAdmin } from '@/lib/api/handler'
import { hasRole } from '@/lib/auth'
import { resolveExportUrl } from '@/lib/storage/minio'

type Params = { id: string }

export const GET = withAuth<Params>(async (_req, { params }, user) => {
  const post = await prisma.post.findUnique({
    where: { id: params.id },
    include: {
      draft: { select: { id: true, copyText: true, exportUrl: true } },
    },
  })

  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!hasRole(user.role, 'admin') && post.userId !== user.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // draft.exportUrl is stored as an EXPORTS object key — sign for the browser.
  return NextResponse.json({
    ...post,
    draft: { ...post.draft, exportUrl: await resolveExportUrl(post.draft.exportUrl) },
  })
})

export const DELETE = withAdmin<Params>(async (_req, { params }) => {
  const post = await prisma.post.findUnique({ where: { id: params.id } })
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (post.status !== 'SCHEDULED') {
    return NextResponse.json({ error: 'Post is not scheduled' }, { status: 409 })
  }

  const updated = await prisma.post.update({
    where: { id: params.id },
    data: { status: 'CANCELLED' },
  })

  return NextResponse.json({ postId: updated.id, status: updated.status })
})
