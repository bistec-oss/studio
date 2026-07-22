import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAdmin, parseBody } from '@/lib/api/handler'

type Params = { id: string }

export const GET = withTeamAdmin<Params>(async (_req, { params }, user) => {
  const kit = await prisma.brandKit.findFirst({
    where: { id: params.id, isDeleted: false },
    select: { id: true, teamId: true },
  })
  if (!kit || kit.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const templates = await prisma.brandKitTemplate.findMany({
    where: { brandKitId: params.id },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(templates)
})

const createSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  htmlTemplate: z.string().trim().min(1, 'htmlTemplate is required'),
  aspectRatio: z
    .enum(['SQUARE', 'PORTRAIT', 'STORY'], {
      errorMap: () => ({ message: 'aspectRatio must be SQUARE, PORTRAIT, or STORY' }),
    })
    .nullish(),
})

export const POST = withTeamAdmin<Params>(async (req, { params }, user) => {
  const kit = await prisma.brandKit.findFirst({
    where: { id: params.id, isDeleted: false },
    select: { id: true, teamId: true },
  })
  if (!kit || kit.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await parseBody(req, createSchema)
  if (body.response) return body.response
  const { name, htmlTemplate, aspectRatio } = body.data

  const template = await prisma.brandKitTemplate.create({
    data: {
      brandKitId: params.id,
      name,
      htmlTemplate,
      aspectRatio: aspectRatio ?? 'SQUARE',
    },
  })

  return NextResponse.json(template, { status: 201 })
})
