import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withAuth, parseBody } from '@/lib/api/handler'

export const GET = withAuth(async () => {
  const campaigns = await prisma.campaign.findMany({
    where: { isDeleted: false },
    include: {
      brandKit: { select: { id: true, name: true } },
      // Project membership lets the brief wizard group campaigns by project.
      projects: { select: { project: { select: { id: true, name: true } } } },
      _count: { select: { briefs: true } },
    },
    orderBy: { createdAt: 'desc' },
    // Bound the result set. Full page/pageSize pagination is deferred (would
    // change the response shape consumed by the wizard + list pages).
    take: 200,
  })

  return NextResponse.json(campaigns)
})

const createSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  brandKitId: z.string().nullish(),
  defaultTone: z.string().nullish(),
  projectId: z.string().nullish(),
})

export const POST = withAuth(async (req: NextRequest) => {
  const body = await parseBody(req, createSchema)
  if (body.response) return body.response
  const { name, brandKitId, defaultTone, projectId } = body.data

  // Verify referenced records so a bogus id is a 400, not a P2003 500.
  if (brandKitId) {
    const kit = await prisma.brandKit.findFirst({ where: { id: brandKitId, isDeleted: false } })
    if (!kit) return NextResponse.json({ error: 'Brand kit not found' }, { status: 400 })
  }
  if (projectId) {
    const project = await prisma.project.findFirst({ where: { id: projectId, isDeleted: false } })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 400 })
  }

  const campaign = await prisma.campaign.create({
    data: {
      name,
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
})
