import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: { id: string; aid: string } }) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  const artifact = await prisma.brandKitArtifact.findFirst({
    where: { id: params.aid, brandKitId: params.id },
  })
  if (!artifact) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()

  const updated = await prisma.brandKitArtifact.update({
    where: { id: params.aid },
    data: {
      ...(body.feedToAI !== undefined && { feedToAI: Boolean(body.feedToAI) }),
      ...(body.name !== undefined && { name: body.name }),
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string; aid: string } }) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  const artifact = await prisma.brandKitArtifact.findFirst({
    where: { id: params.aid, brandKitId: params.id },
  })
  if (!artifact) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.brandKitArtifact.delete({ where: { id: params.aid } })

  return new NextResponse(null, { status: 204 })
}
