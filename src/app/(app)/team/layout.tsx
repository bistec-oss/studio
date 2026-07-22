import { redirect } from 'next/navigation'
import { resolveTeamForServerComponent } from '@/lib/authz/serverTeam'

// Server-side gate for /team, mirroring admin/layout.tsx's defense-in-depth
// pattern but checking TEAM admin (not the app-wide admin role) — the
// sidebar already hides this entry for non-team-admins; this enforces it for
// direct navigation. API routes underneath (`/api/team/*`, `/api/admin/providers*`)
// carry their own team-admin checks regardless.
export const dynamic = 'force-dynamic'

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const resolution = await resolveTeamForServerComponent()

  // Consistent with the dashboard's handling of an unresolved active team.
  if (resolution?.team.kind === 'choice-required') {
    redirect('/choose-team')
  }

  const isTeamAdmin =
    resolution?.team.kind === 'ok' &&
    (resolution.team.teamRole === 'ADMIN' || resolution.isSuperAdmin)

  if (!isTeamAdmin) {
    redirect('/')
  }

  return <>{children}</>
}
