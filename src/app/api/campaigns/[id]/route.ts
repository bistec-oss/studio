import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withAuth, withTeamAdmin, parseBody } from '@/lib/api/handler'

type Params = { id: string }

export const GET = withAuth<Params>(async (_req, { params }) => {
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
})

const patchSchema = z.object({
  name: z.string().trim().min(1, 'name is required').optional(),
  brandKitId: z.string().nullable().optional(),
  defaultTone: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
})

export const PATCH = withTeamAdmin<Params>(async (req, { params }, user) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: params.id } })
  if (!campaign || campaign.isDeleted || campaign.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await parseBody(req, patchSchema)
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

  const updated = await prisma.campaign.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name }),
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
})

export const DELETE = withTeamAdmin<Params>(async (_req, { params }, user) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: params.id } })
  if (!campaign || campaign.isDeleted || campaign.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.campaign.update({
    where: { id: params.id },
    data: { isDeleted: true, deletedAt: new Date() },
  })

  return new NextResponse(null, { status: 204 })
})
