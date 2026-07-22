'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronsUpDown, Users } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/apiFetch'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { cn } from '@/lib/utils'

// Sits above the nav sections in the sidebar. Most users belong to exactly
// one team — a static label costs nothing and avoids a pointless dropdown.
// Multi-team users (currently only super admins, who see every team) get a
// Radix dropdown to switch the active-team cookie without leaving the page.
export function TeamSwitcher() {
  const { teams, activeTeamId } = useCurrentUser()
  const queryClient = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const [switching, setSwitching] = useState(false)

  if (teams.length === 0) return null

  // activeTeamId is null while a choice is still required (parked on
  // /choose-team) — don't imply teams[0] is active in that state, show a
  // neutral label instead.
  const activeTeam = teams.find(t => t.id === activeTeamId) ?? null
  const label = activeTeam?.name ?? 'Choose a team'

  async function selectTeam(teamId: string) {
    if (teamId === activeTeamId || switching) return
    setSwitching(true)
    try {
      await apiFetch('/api/me/active-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId }),
      })
      // No key = invalidate everything: every team-scoped query in the app
      // needs to refetch under the newly active team. Awaited so the
      // ['me'] cache (and its teamChoiceRequired) is fresh before we
      // navigate — otherwise AppShell's redirect effect can read the
      // pre-switch value for a tick and bounce right back to /choose-team.
      await queryClient.invalidateQueries()
      // Switching from the chooser doesn't otherwise navigate anywhere —
      // land on the dashboard instead of leaving the user parked there.
      if (pathname === '/choose-team') {
        router.push('/')
      } else {
        router.refresh()
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to switch team')
    } finally {
      setSwitching(false)
    }
  }

  if (teams.length === 1) {
    return (
      <div className="flex items-center gap-3 px-3 py-2.5 mb-3 rounded-xl text-sm font-medium text-light-text dark:text-dark-text border border-light-text/10 dark:border-white/10">
        <Users size={18} className="flex-shrink-0 text-light-text-muted dark:text-dark-text-muted" />
        <span className="truncate">{label}</span>
      </div>
    )
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          disabled={switching}
          aria-label="Switch team"
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 mb-3 rounded-xl text-sm font-medium w-full',
            'transition-all duration-150 text-light-text dark:text-dark-text',
            'border border-light-text/10 dark:border-white/10',
            'hover:bg-primary/5 dark:hover:bg-primary-light/5',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          <Users size={18} className="flex-shrink-0 text-light-text-muted dark:text-dark-text-muted" />
          <span className="truncate flex-1 text-left">{label}</span>
          <ChevronsUpDown size={14} className="flex-shrink-0 text-light-text-muted dark:text-dark-text-muted" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className={cn(
            'z-50 min-w-56 max-w-72',
            'glass-popover rounded-xl p-1.5',
            'data-[state=open]:animate-fade-in',
          )}
        >
          {teams.map(team => (
            <DropdownMenu.Item
              key={team.id}
              onSelect={() => selectTeam(team.id)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer outline-none',
                'text-light-text dark:text-dark-text',
                'hover:bg-primary/10 dark:hover:bg-primary-light/10',
                'focus:bg-primary/10 dark:focus:bg-primary-light/10',
              )}
            >
              <Check
                size={14}
                className={cn(
                  'flex-shrink-0',
                  team.id === activeTeamId
                    ? 'opacity-100 text-primary dark:text-primary-light'
                    : 'opacity-0',
                )}
              />
              <span className="truncate">{team.name}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
