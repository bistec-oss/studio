import { NextResponse } from 'next/server'
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

  const conflict = await prisma.team.findUnique({ where: { name } })
  if (conflict && conflict.id !== params.id) {
    return NextResponse.json({ error: 'A team with this name already exists' }, { status: 409 })
  }

  const updated = await prisma.team.update({
    where: { id: params.id },
    data: { name },
    select: { id: true, name: true, createdAt: true },
  })

  return NextResponse.json(updated)
})

// Soft-delete only — memberships/content stay intact for audit purposes;
// the team simply drops out of every isDeleted:false listing (team switcher,
// resolveActiveTeam, this admin table). Mirrors Project/Campaign/BrandKit.
export const DELETE = withSuperAdmin<Params>(async (_req, { params }) => {
  const existing = await prisma.team.findUnique({ where: { id: params.id } })
  if (!existing || existing.isDeleted) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }

  await prisma.team.update({
    where: { id: params.id },
    data: { isDeleted: true, deletedAt: new Date() },
  })

  return new NextResponse(null, { status: 204 })
})
