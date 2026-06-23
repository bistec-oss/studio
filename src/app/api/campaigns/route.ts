import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const campaigns = await prisma.campaign.findMany({
    where: { isDeleted: false },
    include: {
      brandKit: { select: { id: true, name: true } },
      _count: { select: { briefs: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(campaigns)
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, brandKitId, defaultTone, projectId } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const campaign = await prisma.campaign.create({
    data: {
      name: name.trim(),
      brandKitId: brandKitId ?? null,
      defaultTone: defaultTone ?? null,
      ...(projectId && {
        projects: { create: { projectId } },
      }),
    },
    include: {
      brandKit: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json(campaign, { status: 201 })
}
