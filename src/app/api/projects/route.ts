import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const projects = await prisma.project.findMany({
    where: { isDeleted: false },
    include: {
      defaultBrandKit: { select: { id: true, name: true } },
      _count: { select: { campaigns: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(projects)
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, defaultBrandKitId, defaultTone } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const project = await prisma.project.create({
    data: { name: name.trim(), defaultBrandKitId: defaultBrandKitId ?? null, defaultTone: defaultTone ?? null },
    include: { defaultBrandKit: { select: { id: true, name: true } } },
  })

  return NextResponse.json(project, { status: 201 })
}
