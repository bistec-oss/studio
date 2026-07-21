import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withAuth, parseBody } from '@/lib/api/handler'

export const GET = withAuth(async () => {
  const projects = await prisma.project.findMany({
    where: { isDeleted: false },
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

export const POST = withAuth(async (req: NextRequest) => {
  const body = await parseBody(req, createSchema)
  if (body.response) return body.response
  const { name, defaultBrandKitId, defaultTone } = body.data

  // No wrapper-supplied team yet (Task 7/8 flips withAuth → withTeamAuth and
  // will pass the real value here).
  const teamId: string | null = null

  const project = await prisma.project.create({
    data: { teamId, name, defaultBrandKitId: defaultBrandKitId ?? null, defaultTone: defaultTone ?? null },
    include: { defaultBrandKit: { select: { id: true, name: true } } },
  })

  return NextResponse.json(project, { status: 201 })
})
