import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAdmin, parseBody } from '@/lib/api/handler'
import { findFamily } from '@/lib/fonts/catalogue'
import { validateKitFonts } from '@/lib/fonts/validateKitFonts'

export const GET = withTeamAdmin(async (_req, _ctx, user) => {
  const kits = await prisma.brandKit.findMany({
    where: { isDeleted: false, teamId: user.teamId },
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

export const POST = withTeamAdmin(async (req: NextRequest, _ctx, user) => {
  const body = await parseBody(req, createSchema)
  if (body.response) return body.response
  const { name, colors, fonts, logoUrl, isDefault } = body.data

  const teamId = user.teamId

  // 031 FR-20: every font is a catalogue family (its url is computed), at most 6.
  let kitFonts: Array<{ name: string; url: string }> = []
  if (fonts) {
    const checked = validateKitFonts(fonts, [], findFamily)
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })
    kitFonts = checked.fonts
  }

  // Only one kit can be the system default — clear + create atomically.
  const kit = await prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.brandKit.updateMany({ where: { isDefault: true, teamId }, data: { isDefault: false } })
    }
    return tx.brandKit.create({
      data: {
        teamId,
        name,
        colors: colors ?? [],
        fonts: kitFonts,
        logoUrl: logoUrl ?? null,
        isDefault: isDefault ?? false,
      },
    })
  })

  return NextResponse.json(kit, { status: 201 })
})
