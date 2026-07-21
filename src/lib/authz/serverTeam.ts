import { cookies } from 'next/headers'
import { getCurrentUser, hasRole } from '@/lib/auth'
import { resolveActiveTeam, ACTIVE_TEAM_COOKIE, type TeamResolution } from '@/lib/authz/teamContext'

// RSC twin of withTeamAuth: server components can't read a NextRequest, so
// this resolves the active team from the session + cookie store directly.
// Callers (dashboard, other team-scoped RSCs) handle 'choice-required' /
// 'no-team' themselves — this never throws or redirects on their behalf.
export async function resolveTeamForServerComponent(): Promise<{
  userId: string
  isSuperAdmin: boolean
  team: TeamResolution
} | null> {
  const user = await getCurrentUser()
  if (!user) return null
  const isSuperAdmin = hasRole(user.role, 'super_admin')
  const cookieTeamId = (await cookies()).get(ACTIVE_TEAM_COOKIE)?.value ?? null
  return {
    userId: user.userId,
    isSuperAdmin,
    team: await resolveActiveTeam(user.userId, cookieTeamId, isSuperAdmin),
  }
}
