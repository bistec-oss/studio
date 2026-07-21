import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/handler'
import { hasRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isCliMode } from '@/lib/agent/config'
import { resolveActiveTeam, ACTIVE_TEAM_COOKIE } from '@/lib/authz/teamContext'

// Returns the current user's id + normalised role for client-side gating.
// Replaces ad-hoc /api/auth/session probing (which 404s — the better-auth
// route is /api/auth/get-session) and centralises role casing.
// Also carries the Claude-token connection state (masked) + whether the
// server runs CLI mode, so the app shell can prompt un-connected users
// without an extra request.
// Team fields (teams/activeTeamId/teamRole/teamChoiceRequired) let the client
// decide whether to show a team switcher or force /choose-team, without a
// second round trip — this route works pre-choice (plain withAuth).
export const GET = withAuth(async (req, _ctx, user) => {
  const token = await prisma.userClaudeToken.findUnique({
    where: { userId: user.userId },
    select: { status: true, keyPrefix: true, createdAt: true },
  })

  const isSuperAdmin = hasRole(user.role, 'super_admin')
  const teams = isSuperAdmin
    ? (
        await prisma.team.findMany({ where: { isDeleted: false }, select: { id: true, name: true } })
      ).map((t) => ({ ...t, role: 'ADMIN' as const }))
    : (
        await prisma.teamMembership.findMany({
          where: { userId: user.userId, team: { isDeleted: false } },
          select: { role: true, team: { select: { id: true, name: true } } },
        })
      ).map((m) => ({ id: m.team.id, name: m.team.name, role: m.role }))
  const cookieTeamId = req.cookies.get(ACTIVE_TEAM_COOKIE)?.value ?? null
  const resolved = await resolveActiveTeam(user.userId, cookieTeamId, isSuperAdmin)

  return NextResponse.json({
    ...user,
    cliMode: isCliMode(),
    claudeToken: token
      ? { status: token.status, keyPrefix: token.keyPrefix, connectedAt: token.createdAt.toISOString() }
      : null,
    teams,
    activeTeamId: resolved.kind === 'ok' ? resolved.teamId : null,
    teamRole: resolved.kind === 'ok' ? resolved.teamRole : null,
    teamChoiceRequired: resolved.kind === 'choice-required',
  })
})
