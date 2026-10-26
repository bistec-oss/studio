import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withSuperAdmin, parseBody } from '@/lib/api/handler'

type Params = { id: string }

const patchSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(100),
})

export const PATCH = withSuperAdmin<Params>(async (req, { params }) => {
  const body = await parseBody(req, patchSchema)
  if (body.response) return body.response
  const { name } = body.data

  const existing = await prisma.team.findUnique({ where: { id: params.id } })
  if (!existing || existing.isDeleted) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }

  // Uniqueness is scoped to LIVE teams (partial unique index
  // Team_name_active_key WHERE isDeleted = false), so only a different
  // non-deleted team holding this name is a conflict.
  const conflict = await prisma.team.findFirst({
    where: { name, isDeleted: false, id: { not: params.id } },
  })
  if (conflict) {
    return NextResponse.json({ error: 'A team with this name already exists' }, { status: 409 })
  }

  try {
    const updated = await prisma.team.update({
      where: { id: params.id },
      data: { name },
      select: { id: true, name: true, createdAt: true },
    })

    return NextResponse.json(updated)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: 'A team with this name already exists' }, { status: 409 })
    }
    throw err
  }
})

// Soft-delete only — memberships/content stay intact for audit purposes;
// the team simply drops out of every isDeleted:false listing (team switcher,
// resolveActiveTeam, this admin table). Mirrors Project/Campaign/BrandKit.
export const DELETE = withSuperAdmin<Params>(async (_req, { params }) => {
  const existing = await prisma.team.findUnique({ where: { id: params.id } })
  if (!existing || existing.isDeleted) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }

  // 006 FR-12: a deleted team's analytics events go with it (the content stays
  // for audit; the events are a separate store with no foreign key, so the
  // delete is explicit and in the same transaction).
  await prisma.$transaction([
    prisma.team.update({
      where: { id: params.id },
      data: { isDeleted: true, deletedAt: new Date() },
    }),
    prisma.analyticsEvent.deleteMany({ where: { teamId: params.id } }),
  ])

  return new NextResponse(null, { status: 204 })
})
