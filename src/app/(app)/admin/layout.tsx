import { resolveTeamForServerComponent } from '@/lib/authz/serverTeam'
import { GateNotice } from '@/components/ui/GateNotice'

// Server-side gate for every /admin page. The sidebar already hides the Admin
// entries for non-admins; this enforces it for direct navigation.
//
// This gate is TEAM-admin (per-team role ADMIN, super admins pass every gate),
// NOT global-admin — matching the sidebar (`adminOnly` → isTeamAdmin) and the
// brand-kit API (`withTeamAdmin`). Gating on the global role blocked a team
// admin (whose global Role is EDITOR) from /admin/brandkits even though the API
// would serve them. The super-admin-only pages under /admin (users, teams) keep
// their own in-page "Requires super admin" gate, so loosening this to team-admin
// does not widen their access.
export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await resolveTeamForServerComponent()
  const isTeamAdmin =
    ctx != null &&
    (ctx.isSuperAdmin || (ctx.team.kind === 'ok' && ctx.team.teamRole === 'ADMIN'))

  if (!isTeamAdmin) {
    return (
      <GateNotice title="Requires team admin" backLink>
        This area is limited to team admins. Ask a team admin if you need access.
      </GateNotice>
    )
  }

  return <>{children}</>
}
