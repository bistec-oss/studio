'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronsUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/apiFetch'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { cn } from '@/lib/utils'
import { FOCUS, ICON, ICON_SM } from '@/components/ui/atoms'

// Sits above the nav sections in the sidebar. Most users belong to exactly
// one team — a static label costs nothing and avoids a pointless dropdown.
// Multi-team users (currently only super admins, who see every team) get a
// Radix dropdown to switch the active-team cookie without leaving the page.
export function TeamSwitcher() {
  const { teams, activeTeamId, teamRole, isSuperAdmin } = useCurrentUser()
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


  // The study's .team (021 design.md §5): a --surface-2 card with a hairline
  // ring, an initials avatar on the canvas (decorative: the name follows it),
  // the team name at 13 px / 600 over the viewer's role. The static label
  // (one team) has no chevron; the switcher shows an up-down one.
  const roleLabel = !activeTeam
    ? null
    : isSuperAdmin
      ? 'Super admin'
      : teamRole === 'ADMIN'
        ? 'Team admin'
        : teamRole === 'EDITOR'
          ? 'Editor'
          : null
  const card =
    'flex w-full items-center gap-2.5 p-2 rounded-ui-md bg-surface-raised text-left text-fg ring-1 ring-inset ring-line-subtle'
  const name = (
    <>
      <TeamAvatar name={activeTeam?.name ?? ''} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ui-sm font-semibold leading-tight">{label}</span>
        {roleLabel && <span className="block text-ui-2xs text-fg-muted">{roleLabel}</span>}
      </span>
    </>
  )

  if (teams.length === 1) {
    return <div className={card}>{name}</div>
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={switching}
          aria-label="Switch team"
          className={cn(
            card,
            'transition-shadow duration-fast ease-standard hover:ring-line',
            FOCUS,
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          {name}
          <ChevronsUpDown {...ICON} aria-hidden="true" className="flex-shrink-0 text-fg-muted" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        {/* .surface-raised: the opaque menu (011 FR-08, the study's .menu),
            popping from its top-left anchor; under reduced motion globals.css
            swaps the pop for a 150 ms fade. */}
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="surface-raised z-50 min-w-56 max-w-72 origin-top-left p-1.5 animate-pop"
        >
          {teams.map(team => (
            <DropdownMenu.Item
              key={team.id}
              onSelect={() => selectTeam(team.id)}
              className={cn(
                'flex items-center gap-2.5 px-2.5 py-2 rounded-ui-sm cursor-pointer outline-none',
                'text-ui-sm text-fg',
                'data-[highlighted]:bg-canvas',
              )}
            >
              <Check
                {...ICON_SM}
                aria-hidden="true"
                className={cn('flex-shrink-0 text-accent', team.id === activeTeamId ? 'opacity-100' : 'opacity-0')}
              />
              <span className="truncate">{team.name}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

// The team's initials avatar (the study's .team-av): a 32 px canvas tile with
// up to two letters, the first letters of the first two words ("Hearts
// Academy" → "HA") or the first two of a one-word name. Decorative: the team
// name always follows it. Shared with /choose-team.
export function TeamAvatar({ name }: { name: string }) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '').slice(0, 2)
  return (
    <span
      aria-hidden="true"
      className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-[10px] bg-canvas text-[13px] font-bold"
    >
      {letters.toUpperCase()}
    </span>
  )
}
