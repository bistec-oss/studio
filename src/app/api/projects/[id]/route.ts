import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withAuth, withAdmin, parseBody } from '@/lib/api/handler'

type Params = { id: string }

export const GET = withAuth<Params>(async (_req, { params }) => {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      defaultBrandKit: { select: { id: true, name: true } },
      campaigns: {
        include: { campaign: { select: { id: true, name: true, isDeleted: true } } },
      },
    },
  })

  if (!project || project.isDeleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(project)
})

const patchSchema = z.object({
  name: z.string().trim().min(1, 'name is required').optional(),
  defaultBrandKitId: z.string().nullable().optional(),
  defaultTone: z.string().nullable().optional(),
})

export const PATCH = withAdmin<Params>(async (req, { params }) => {
  const project = await prisma.project.findUnique({ where: { id: params.id } })
  if (!project || project.isDeleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await parseBody(req, patchSchema)
  if (body.response) return body.response
  const { name, defaultBrandKitId, defaultTone } = body.data

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

export const DELETE = withAdmin<Params>(async (_req, { params }) => {
  const project = await prisma.project.findUnique({ where: { id: params.id } })
  if (!project || project.isDeleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.project.update({
    where: { id: params.id },
    data: { isDeleted: true, deletedAt: new Date() },
  })

  return new NextResponse(null, { status: 204 })
})
