import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, requireRole } from '@/lib/auth'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    include: {
      brandKit: { select: { id: true, name: true } },
      projects: { include: { project: { select: { id: true, name: true } } } },
      _count: { select: { briefs: true } },
    },
  })

  if (!campaign || campaign.isDeleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(campaign)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  const campaign = await prisma.campaign.findUnique({ where: { id: params.id } })
  if (!campaign || campaign.isDeleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { name, brandKitId, defaultTone, projectId } = body

  const updated = await prisma.campaign.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(brandKitId !== undefined && { brandKitId }),
      ...(defaultTone !== undefined && { defaultTone }),
      ...(projectId !== undefined && {
        projects: {
          deleteMany: {},
          create: projectId ? [{ projectId }] : [],
        },
      }),
    },
    include: { brandKit: { select: { id: true, name: true } } },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  const campaign = await prisma.campaign.findUnique({ where: { id: params.id } })
  if (!campaign || campaign.isDeleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.campaign.update({
    where: { id: params.id },
    data: { isDeleted: true, deletedAt: new Date() },
  })

  return new NextResponse(null, { status: 204 })
}
