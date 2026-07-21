'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/apiFetch'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { cn } from '@/lib/utils'

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

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <GlassPanel className="w-full max-w-md p-8 space-y-6">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 dark:bg-primary-light/10 flex items-center justify-center">
            <Users size={22} className="text-primary dark:text-primary-light" />
          </div>
          <h1 className="text-lg font-semibold text-light-text dark:text-dark-text">Choose a team</h1>
          <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
            Pick which team you want to work in. You can switch again later from the sidebar.
          </p>
        </div>

        {teams.length === 0 ? (
          <p className="text-sm text-light-text-muted dark:text-dark-text-muted text-center py-4">
            You aren&apos;t a member of any team yet — ask a super admin to add you to one.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {teams.map(team => (
              <button
                key={team.id}
                onClick={() => pick(team.id)}
                disabled={pickingId !== null}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-left',
                  'border border-light-text/10 dark:border-white/10',
                  'text-light-text dark:text-dark-text',
                  'hover:bg-primary/5 dark:hover:bg-primary-light/5 transition-all duration-150',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                <Users size={18} className="flex-shrink-0 text-light-text-muted dark:text-dark-text-muted" />
                <span className="truncate flex-1">{team.name}</span>
                {pickingId === team.id && (
                  <span className="text-xs text-light-text-muted dark:text-dark-text-muted">Switching…</span>
                )}
              </button>
            ))}
          </div>
        )}
      </GlassPanel>
    </div>
  )
}
