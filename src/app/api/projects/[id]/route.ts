import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      defaultBrandKit: { select: { id: true, name: true } },
      campaigns: {
        include: { campaign: { select: { id: true, name: true, isDeleted: true } } },
      },
    },
  })

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(project)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const project = await prisma.project.findUnique({ where: { id: params.id } })
  if (!project || project.isDeleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { name, defaultBrandKitId, defaultTone } = body

  const updated = await prisma.project.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(defaultBrandKitId !== undefined && { defaultBrandKitId }),
      ...(defaultTone !== undefined && { defaultTone }),
    },
    include: { defaultBrandKit: { select: { id: true, name: true } } },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  // Soft-delete: any authenticated user can delete
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const project = await prisma.project.findUnique({ where: { id: params.id } })
  if (!project || project.isDeleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.project.update({
    where: { id: params.id },
    data: { isDeleted: true, deletedAt: new Date() },
  })

  return new NextResponse(null, { status: 204 })
}
