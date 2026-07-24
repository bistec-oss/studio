import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAdmin, parseBody } from '@/lib/api/handler'
import { pickNextPrimaryUrl } from '@/lib/brandkit/logos'

type Params = { id: string; aid: string }

const patchSchema = z.object({
  feedToAI: z.boolean().optional(),
  name: z.string().optional(),
})

export const PATCH = withTeamAdmin<Params>(async (req, { params }, user) => {
  const kit = await prisma.brandKit.findFirst({
    where: { id: params.id, isDeleted: false },
    select: { id: true, teamId: true },
  })
  if (!kit || kit.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const artifact = await prisma.brandKitArtifact.findFirst({
    where: { id: params.aid, brandKitId: params.id },
  })
  if (!artifact) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await parseBody(req, patchSchema)
  if (body.response) return body.response
  const { feedToAI, name } = body.data

  const updated = await prisma.brandKitArtifact.update({
    where: { id: params.aid },
    data: {
      ...(feedToAI !== undefined && { feedToAI }),
      ...(name !== undefined && { name }),
    },
  })

  return NextResponse.json(updated)
})

export const DELETE = withTeamAdmin<Params>(async (_req, { params }, user) => {
  const kit = await prisma.brandKit.findFirst({
    where: { id: params.id, isDeleted: false },
    select: { id: true, teamId: true },
  })
  if (!kit || kit.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const artifact = await prisma.brandKitArtifact.findFirst({
    where: { id: params.aid, brandKitId: params.id },
  })
  if (!artifact) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Delete + denormalised-field sync are atomic so deleted assets don't dangle
  // and concurrent artifact changes can't clobber the fonts array.
  await prisma.$transaction(async (tx) => {
    await tx.brandKitArtifact.delete({ where: { id: params.aid } })

    if (artifact.type === 'LOGO' || artifact.type === 'FONT') {
      const kit = await tx.brandKit.findUnique({ where: { id: params.id } })
      if (kit) {
        if (artifact.type === 'LOGO' && kit.logoUrl === artifact.url) {
          // The primary was deleted — reassign to a remaining LOGO (or null).
          const remaining = await tx.brandKitArtifact.findMany({
            where: { brandKitId: params.id, type: 'LOGO' },
            orderBy: { createdAt: 'asc' },
            select: { url: true },
          })
          const next = pickNextPrimaryUrl(remaining.map((r) => r.url))
          await tx.brandKit.update({ where: { id: params.id }, data: { logoUrl: next } })
        }
        if (artifact.type === 'FONT' && Array.isArray(kit.fonts)) {
          const fonts = (kit.fonts as Array<{ name: string; url: string }>).filter(
            (f) => f.url !== artifact.url,
          )
          await tx.brandKit.update({ where: { id: params.id }, data: { fonts } })
        }
      }
    }
  })

  return new NextResponse(null, { status: 204 })
})
