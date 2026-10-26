import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAdmin, parseBody } from '@/lib/api/handler'
import { CATALOGUE_DATE, findFamily } from '@/lib/fonts/catalogue'
import { checkKitTypography } from '@/lib/designData/authoring/typography'
import { validateKitFonts, validateScriptFonts } from '@/lib/fonts/validateKitFonts'

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
  // 031 FR-25: the date of the font list the picker searches.
  // 031 FR-27: non-blocking typography findings, computed here so the lookup stays on the server.
  const kitFonts = Array.isArray(kit.fonts) ? (kit.fonts as Array<{ name: string }>) : []
  const scriptFonts =
    kit.scriptFonts && typeof kit.scriptFonts === 'object' && !Array.isArray(kit.scriptFonts)
      ? (kit.scriptFonts as Record<string, string>)
      : null
  const typographyFindings = checkKitTypography({ fonts: kitFonts, scriptFonts }, findFamily)
  return NextResponse.json({ ...kit, fontCatalogueDate: CATALOGUE_DATE, typographyFindings })
})

const patchSchema = z.object({
  name: z.string().trim().optional(),
  colors: z.array(z.string()).optional(),
  fonts: z.array(z.object({ name: z.string(), url: z.string() })).optional(),
  // 031 FR-21: { [script]: family }; null or {} clears it.
  scriptFonts: z.record(z.string()).nullable().optional(),
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
  const { name, colors, fonts, scriptFonts, logoUrl, isDefault } = body.data

  // 031 FR-20: an entry identical to a stored one is kept as is; any other must be a catalogue
  // family (its url is computed); at most 6. Nothing is written on a refusal.
  let nextFonts = fonts
  if (fonts !== undefined) {
    const stored = Array.isArray(kit.fonts) ? (kit.fonts as Array<{ name: string; url: string }>) : []
    const checked = validateKitFonts(fonts, stored, findFamily)
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })
    nextFonts = checked.fonts
  }

  // 031 FR-21: an offered script key, a catalogue family that has that script. null or {} clears
  // it (stored as SQL NULL). Nothing is written on a refusal.
  let nextScriptFonts: Prisma.InputJsonValue | typeof Prisma.DbNull | undefined
  if (scriptFonts !== undefined) {
    const checked = validateScriptFonts(scriptFonts, findFamily)
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })
    nextScriptFonts = checked.scriptFonts ?? Prisma.DbNull
  }

  // Setting the primary logo must reference an existing LOGO artifact of this
  // kit (clearing with null is always allowed). The gallery's "Set as primary"
  // PATCHes an artifact URL that necessarily exists; this rejects a stray URL.
  if (logoUrl) {
    const match = await prisma.brandKitArtifact.findFirst({
      where: { brandKitId: params.id, type: 'LOGO', url: logoUrl },
      select: { id: true },
    })
    if (!match) {
      return NextResponse.json(
        { error: 'logoUrl must match a LOGO artifact of this kit' },
        { status: 400 },
      )
    }
  }

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
        ...(nextFonts !== undefined && { fonts: nextFonts }),
        ...(nextScriptFonts !== undefined && { scriptFonts: nextScriptFonts }),
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
