import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, withTeamAdmin, parseBody } from '@/lib/api/handler'

export const GET = withTeamAuth(async (_req, _ctx, user) => {
  const projects = await prisma.project.findMany({
    where: { isDeleted: false, teamId: user.teamId },
    include: {
      defaultBrandKit: { select: { id: true, name: true } },
      _count: { select: { campaigns: true } },
    },
    orderBy: { createdAt: 'desc' },
    // Bounded; full pagination deferred (response is a bare array today).
    take: 200,
  })

  return NextResponse.json(projects)
})

const createSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  defaultBrandKitId: z.string().nullish(),
  defaultTone: z.string().nullish(),
})

export const POST = withTeamAdmin(async (req: NextRequest, _ctx, user) => {
  const body = await parseBody(req, createSchema)
  if (body.response) return body.response
  const { name, defaultBrandKitId, defaultTone } = body.data

  const project = await prisma.project.create({
    data: {
      teamId: user.teamId,
      name,
      defaultBrandKitId: defaultBrandKitId ?? null,
      defaultTone: defaultTone ?? null,
    },
    include: { defaultBrandKit: { select: { id: true, name: true } } },
  })

  return NextResponse.json(project, { status: 201 })
})
