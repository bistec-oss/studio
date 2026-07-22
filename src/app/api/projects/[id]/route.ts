import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, withTeamAdmin, parseBody } from '@/lib/api/handler'

type Params = { id: string }

// Team tenancy fix: this GET ran under plain withAuth with no teamId check at
// all — any authenticated user of ANY team could fetch another team's full
// project (default brand kit, linked campaigns) by id. PATCH/DELETE below
// were already correctly team-scoped; this GET was missed by the same sweep.
export const GET = withTeamAuth<Params>(async (_req, { params }, user) => {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      defaultBrandKit: { select: { id: true, name: true } },
      campaigns: {
        include: { campaign: { select: { id: true, name: true, isDeleted: true } } },
      },
    },
  })

  if (!project || project.isDeleted || project.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(project)
})

const patchSchema = z.object({
  name: z.string().trim().min(1, 'name is required').optional(),
  defaultBrandKitId: z.string().nullable().optional(),
  defaultTone: z.string().nullable().optional(),
})

export const PATCH = withTeamAdmin<Params>(async (req, { params }, user) => {
  const project = await prisma.project.findUnique({ where: { id: params.id } })
  if (!project || project.isDeleted || project.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await parseBody(req, patchSchema)
  if (body.response) return body.response
  const { name, defaultBrandKitId, defaultTone } = body.data

  // I3 (final review): same missing/foreign-team validation as POST above —
  // PATCH accepts defaultBrandKitId too and was equally unguarded.
  if (defaultBrandKitId) {
    const kit = await prisma.brandKit.findFirst({
      where: { id: defaultBrandKitId, teamId: project.teamId, isDeleted: false },
    })
    if (!kit) return NextResponse.json({ error: 'Brand kit not found' }, { status: 400 })
  }

  const updated = await prisma.project.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(defaultBrandKitId !== undefined && { defaultBrandKitId }),
      ...(defaultTone !== undefined && { defaultTone }),
    },
    include: { defaultBrandKit: { select: { id: true, name: true } } },
  })

  return NextResponse.json(updated)
})

export const DELETE = withTeamAdmin<Params>(async (_req, { params }, user) => {
  const project = await prisma.project.findUnique({ where: { id: params.id } })
  if (!project || project.isDeleted || project.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.project.update({
    where: { id: params.id },
    data: { isDeleted: true, deletedAt: new Date() },
  })

  return new NextResponse(null, { status: 204 })
})
