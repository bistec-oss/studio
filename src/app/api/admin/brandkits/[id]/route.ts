import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAdmin, parseBody } from '@/lib/api/handler'

type Params = { id: string }

export const GET = withTeamAdmin<Params>(async (_req, { params }, user) => {
  const kit = await prisma.brandKit.findUnique({
    where: { id: params.id },
    include: {
      prompts: { orderBy: { version: 'desc' } },
      templates: { orderBy: { createdAt: 'asc' } },
      artifacts: { orderBy: { createdAt: 'desc' } },
    },
  })

  if (!kit || kit.isDeleted || kit.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(kit)
})

const patchSchema = z.object({
  name: z.string().trim().optional(),
  colors: z.array(z.string()).optional(),
  fonts: z.array(z.object({ name: z.string(), url: z.string() })).optional(),
  logoUrl: z.string().regex(/^https?:\/\//, 'logoUrl must be an http(s) URL').nullable().optional(),
  isDefault: z.boolean().optional(),
})

export const PATCH = withTeamAdmin<Params>(async (req, { params }, user) => {
  const kit = await prisma.brandKit.findUnique({ where: { id: params.id } })
  if (!kit || kit.isDeleted || kit.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await parseBody(req, patchSchema)
  if (body.response) return body.response
  const { name, colors, fonts, logoUrl, isDefault } = body.data

  // Clearing the prior default + updating this row must be atomic so a
  // failure can't leave the slot with zero (or two) defaults.
  const updated = await prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.brandKit.updateMany({
        where: { isDefault: true, id: { not: params.id }, teamId: user.teamId },
        data: { isDefault: false },
      })
    }
    return tx.brandKit.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(colors !== undefined && { colors }),
        ...(fonts !== undefined && { fonts }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(isDefault !== undefined && { isDefault }),
      },
    })
  })

  return NextResponse.json(updated)
})

export const DELETE = withTeamAdmin<Params>(async (_req, { params }, user) => {
  const kit = await prisma.brandKit.findUnique({ where: { id: params.id } })
  if (!kit || kit.isDeleted || kit.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (kit.isDefault) {
    return NextResponse.json({ error: 'Assign another default brand kit first' }, { status: 409 })
  }

  await prisma.brandKit.update({
    where: { id: params.id },
    data: { isDeleted: true, deletedAt: new Date() },
  })

  return new NextResponse(null, { status: 204 })
})
