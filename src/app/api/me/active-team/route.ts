import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withAuth, parseBody } from '@/lib/api/handler'
import { hasRole } from '@/lib/auth'
import { ACTIVE_TEAM_COOKIE } from '@/lib/authz/teamContext'

const schema = z.object({ teamId: z.string().min(1) })

// Sets the active-team cookie after validating the choice server-side — the
// cookie is never trusted on its own (see resolveActiveTeam). Plain withAuth
// (not withTeamAuth): this must work before a team is chosen at all.
export const POST = withAuth(async (req: NextRequest, _ctx, user) => {
  const body = await parseBody(req, schema)
  if (body.response) return body.response
  const { teamId } = body.data

  const allowed = hasRole(user.role, 'super_admin')
    ? await prisma.team.findFirst({ where: { id: teamId, isDeleted: false }, select: { id: true } })
    : await prisma.teamMembership.findFirst({
        where: { userId: user.userId, teamId, team: { isDeleted: false } },
        select: { id: true },
      })
  if (!allowed) return NextResponse.json({ error: 'Not a member of that team' }, { status: 403 })

  const res = NextResponse.json({ ok: true })
  res.cookies.set(ACTIVE_TEAM_COOKIE, teamId, { httpOnly: true, sameSite: 'lax', path: '/' })
  return res
})
