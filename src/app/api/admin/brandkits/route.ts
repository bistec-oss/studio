import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withAdmin, parseBody } from '@/lib/api/handler'

export const GET = withAdmin(async () => {
  const kits = await prisma.brandKit.findMany({
    where: { isDeleted: false },
    include: {
      prompts: { where: { isActive: true }, take: 1, select: { content: true, version: true } },
      _count: { select: { templates: true, artifacts: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(kits)
})

const createSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  colors: z.array(z.string()).nullish(),
  fonts: z.array(z.object({ name: z.string(), url: z.string() })).nullish(),
  logoUrl: z.string().regex(/^https?:\/\//, 'logoUrl must be an http(s) URL').nullish(),
  isDefault: z.boolean().nullish(),
})

export const POST = withAdmin(async (req: NextRequest) => {
  const body = await parseBody(req, createSchema)
  if (body.response) return body.response
  const { name, colors, fonts, logoUrl, isDefault } = body.data

  // Only one kit can be the system default — clear + create atomically.
  const kit = await prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.brandKit.updateMany({ where: { isDefault: true }, data: { isDefault: false } })
    }
    return tx.brandKit.create({
      data: {
        name,
        colors: colors ?? [],
        fonts: fonts ?? [],
        logoUrl: logoUrl ?? null,
        isDefault: isDefault ?? false,
      },
    })
  })

  return NextResponse.json(kit, { status: 201 })
})
