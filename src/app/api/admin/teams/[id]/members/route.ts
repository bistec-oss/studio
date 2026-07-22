import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withSuperAdmin, parseBody } from '@/lib/api/handler'
import type { AdminTeamMember } from '@/lib/api-types'

type Params = { id: string }

async function requireTeam(id: string) {
  const team = await prisma.team.findUnique({ where: { id }, select: { id: true, isDeleted: true } })
  return team && !team.isDeleted ? team : null
}

export const GET = withSuperAdmin<Params>(async (_req, { params }) => {
  const team = await requireTeam(params.id)
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const memberships = await prisma.teamMembership.findMany({
    where: { teamId: params.id },
    select: {
      userId: true,
      role: true,
      user: { select: { id: true, name: true, username: true, displayUsername: true, email: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  const members: AdminTeamMember[] = memberships.map((m) => ({
    userId: m.userId,
    name: m.user.name,
    loginLabel: m.user.displayUsername ?? m.user.username ?? m.user.email,
    role: m.role,
  }))

  return NextResponse.json(members)
})

const addSchema = z.object({
  userId: z.string().trim().min(1, 'userId is required'),
  role: z.enum(['ADMIN', 'EDITOR'], { errorMap: () => ({ message: 'role must be ADMIN or EDITOR' }) }),
})

// Upsert — adding an already-member re-sets their role rather than erroring,
// matching the @@unique([teamId, userId]) constraint on TeamMembership.
export const POST = withSuperAdmin<Params>(async (req: NextRequest, { params }) => {
  const team = await requireTeam(params.id)
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const body = await parseBody(req, addSchema)
  if (body.response) return body.response
  const { userId, role } = body.data

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, username: true, displayUsername: true, email: true } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  await prisma.teamMembership.upsert({
    where: { teamId_userId: { teamId: params.id, userId } },
    create: { teamId: params.id, userId, role },
    update: { role },
  })

  return NextResponse.json(
    { userId: user.id, name: user.name, loginLabel: user.displayUsername ?? user.username ?? user.email, role } satisfies AdminTeamMember,
    { status: 201 },
  )
})
