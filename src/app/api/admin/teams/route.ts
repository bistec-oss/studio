import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withSuperAdmin, parseBody } from '@/lib/api/handler'
import type { AdminTeamSummary } from '@/lib/api-types'

// Super-admin platform-wide team management (distinct from /api/team/* which
// is team-admin-scoped to the caller's own active team). Mirrors
// /api/admin/users: super-admin-only, soft-delete instead of hard delete.

export const GET = withSuperAdmin(async () => {
  const teams = await prisma.team.findMany({
    where: { isDeleted: false },
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: { select: { memberships: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  const result: AdminTeamSummary[] = teams.map((t) => ({
    id: t.id,
    name: t.name,
    memberCount: t._count.memberships,
    createdAt: t.createdAt.toISOString(),
  }))
  return NextResponse.json(result)
})

const createSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(100),
})

export const POST = withSuperAdmin(async (req: NextRequest) => {
  const body = await parseBody(req, createSchema)
  if (body.response) return body.response
  const { name } = body.data

  const existing = await prisma.team.findUnique({ where: { name } })
  if (existing) {
    return NextResponse.json({ error: 'A team with this name already exists' }, { status: 409 })
  }

  const team = await prisma.team.create({
    data: { name },
    select: { id: true, name: true, createdAt: true },
  })

  return NextResponse.json(
    { id: team.id, name: team.name, memberCount: 0, createdAt: team.createdAt.toISOString() } satisfies AdminTeamSummary,
    { status: 201 },
  )
})
