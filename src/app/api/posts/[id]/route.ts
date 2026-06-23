import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { resolveExportUrl } from '@/lib/storage/minio'

export async function GET(
  _: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const post = await prisma.post.findUnique({
    where: { id: params.id },
    include: {
      draft: { select: { id: true, copyText: true, exportUrl: true } },
    },
  })

  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (user.role !== 'admin' && post.userId !== user.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // draft.exportUrl is stored as an EXPORTS object key — sign for the browser.
  return NextResponse.json({
    ...post,
    draft: { ...post.draft, exportUrl: await resolveExportUrl(post.draft.exportUrl) },
  })
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

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
}
