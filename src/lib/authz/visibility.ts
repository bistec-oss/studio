import type { TeamAuthedUser } from '@/lib/api/handler'

// Spec D6: the person is the boundary; the campaign is the sharing container.
// "Team-shared" is precisely: the item's brief has a non-null campaignId.
const isTeamWide = (u: TeamAuthedUser) => u.teamRole === 'ADMIN' || u.isSuperAdmin

export function briefVisibilityWhere(u: TeamAuthedUser) {
  if (isTeamWide(u)) return { teamId: u.teamId }
  return { teamId: u.teamId, OR: [{ userId: u.userId }, { campaignId: { not: null } }] }
}

export function draftVisibilityWhere(u: TeamAuthedUser) {
  if (isTeamWide(u)) return { teamId: u.teamId }
  return {
    teamId: u.teamId,
    OR: [{ brief: { userId: u.userId } }, { brief: { campaignId: { not: null } } }],
  }
}

export function postVisibilityWhere(u: TeamAuthedUser) {
  if (isTeamWide(u)) return { teamId: u.teamId }
  return {
    teamId: u.teamId,
    OR: [{ userId: u.userId }, { draft: { brief: { campaignId: { not: null } } } }],
  }
}

export function canAccessContent(
  u: TeamAuthedUser,
  item: { teamId: string | null; ownerId: string | null; campaignId: string | null },
): boolean {
  if (item.teamId !== u.teamId) return false
  if (isTeamWide(u)) return true
  return item.ownerId === u.userId || item.campaignId !== null
}
