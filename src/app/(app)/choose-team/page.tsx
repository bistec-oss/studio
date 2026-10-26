'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/apiFetch'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { cn } from '@/lib/utils'
import { PageTitle } from '@/components/ui/PageHead'
import { Panel } from '@/components/ui/Panel'
import { FOCUS, ICON } from '@/components/ui/atoms'
import { TeamAvatar } from '@/components/layout/TeamSwitcher'

// Reached when /api/me reports teamChoiceRequired (AppShell redirects here).
// Deliberately fires no team-scoped query itself — useCurrentUser()'s /api/me
// call is plain withAuth and works pre-choice; every other route 409s with
// team-choice-required until a team is picked here.
export default function ChooseTeamPage() {
  const { teams } = useCurrentUser()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [pickingId, setPickingId] = useState<string | null>(null)

  async function pick(teamId: string) {
    if (pickingId) return
    setPickingId(teamId)
    try {
      await apiFetch('/api/me/active-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId }),
      })
      // Must land before the push: AppShell persists across this client nav
      // and its useCurrentUser() cache still holds the stale
      // teamChoiceRequired:true from before the pick — without this await,
      // the redirect effect sees that stale state on arrival at "/" and
      // bounces straight back here. Invalidating (and letting the refetch
      // resolve) first means the effect reads fresh data post-navigation.
      await queryClient.invalidateQueries()
      router.push('/')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to switch team')
    } finally {
      setPickingId(null)
    }
  }

  // A page title and a muted line, then a bezel card listing the teams as
  // the sidebar's .team cards (021 design.md §5): an initials avatar, the
  // name over the viewer's role in it, and an arrow. The avatar and the role
  // line are aria-hidden, so each button is still named by its team (plus
  // "Switching…" while it is picked).
  return (
    <div className="mx-auto w-full max-w-md py-6 md:py-12 text-fg">
      <PageTitle>Choose a team</PageTitle>
      <p className="mt-3 text-ui-sm text-fg-muted">
        Pick which team you want to work in. You can switch again later from the sidebar.
      </p>

      <Panel bezel className="mt-6 p-3">
        {teams.length === 0 ? (
          <p className="px-2 py-3 text-ui-sm text-fg-muted">
            You aren&apos;t a member of any team yet — ask a super admin to add you to one.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {teams.map(team => (
              <li key={team.id}>
                <button
                  type="button"
                  onClick={() => pick(team.id)}
                  disabled={pickingId !== null}
                  className={cn(
                    'group flex w-full items-center gap-2.5 p-2 rounded-ui-md text-left',
                    'bg-surface-raised ring-1 ring-inset ring-line-subtle',
                    'transition-shadow duration-fast ease-standard hover:shadow-panel hover:ring-line',
                    FOCUS,
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  <TeamAvatar name={team.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ui-sm font-semibold leading-tight">{team.name}</span>
                    <span aria-hidden="true" className="block text-ui-2xs text-fg-muted">
                      {team.role === 'ADMIN' ? 'Team admin' : 'Editor'}
                    </span>
                  </span>
                  {pickingId === team.id ? (
                    <span className="text-ui-xs text-fg-muted">Switching…</span>
                  ) : (
                    <ArrowRight
                      {...ICON}
                      aria-hidden="true"
                      className="flex-shrink-0 text-fg-muted group-hover:text-fg"
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
