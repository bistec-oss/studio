import { prisma } from '@/lib/prisma'
import type { TeamRole } from '@prisma/client'

export const ACTIVE_TEAM_COOKIE = 'bistec-active-team'

export type TeamResolution =
  | { kind: 'ok'; teamId: string; teamRole: TeamRole }
  | { kind: 'choice-required' }
  | { kind: 'no-team' }

// The active team is a server-validated choice, never a client claim: the
// cookie only wins when a live membership (or, for super admins, a live team)
// backs it. Multi-team users with no valid cookie must choose explicitly (D8).
export async function resolveActiveTeam(
  userId: string,
  cookieTeamId: string | null,
  isSuperAdmin: boolean,
): Promise<TeamResolution> {
  if (isSuperAdmin) {
    if (cookieTeamId) {
      const team = await prisma.team.findFirst({
        where: { id: cookieTeamId, isDeleted: false },
        select: { id: true },
      })
      if (team) return { kind: 'ok', teamId: team.id, teamRole: 'ADMIN' }
    }
    const teams = await prisma.team.findMany({
      where: { isDeleted: false },
      select: { id: true },
      take: 2,
    })
    if (teams.length === 1) return { kind: 'ok', teamId: teams[0].id, teamRole: 'ADMIN' }
    return teams.length === 0 ? { kind: 'no-team' } : { kind: 'choice-required' }
  }

  const memberships = await prisma.teamMembership.findMany({
    where: { userId, team: { isDeleted: false } },
    select: { teamId: true, role: true },
  })
  if (memberships.length === 0) return { kind: 'no-team' }
  if (cookieTeamId) {
    const hit = memberships.find((m) => m.teamId === cookieTeamId)
    if (hit) return { kind: 'ok', teamId: hit.teamId, teamRole: hit.role }
  }
  if (memberships.length === 1) {
    return { kind: 'ok', teamId: memberships[0].teamId, teamRole: memberships[0].role }
  }
  return { kind: 'choice-required' }
}
