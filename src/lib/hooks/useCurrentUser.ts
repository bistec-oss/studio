'use client'

import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/apiFetch'
import type { MeResponse } from '@/lib/api-types'

// Single source of truth for "who am I / am I an admin" on the client.
// Replaces four divergent implementations (a raw fetch of the wrong
// better-auth route, and three slightly different /api/me + role-casing
// checks) with one cached query — role is normalised server-side by
// /api/me, but we still lower-case defensively here.
export function useCurrentUser() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch<MeResponse>('/api/me'),
    retry: false,
  })

  const role = data?.role?.toLowerCase()
  const isSuperAdmin = role === 'super_admin'
  const teamRole = data?.teamRole ?? null

  return {
    user: data ?? null,
    // super_admin passes every admin gate (mirrors hasRole on the server)
    isAdmin: role === 'admin' || isSuperAdmin,
    isSuperAdmin,
    // Personal-Claude-token surface (see MeResponse): whether the server runs
    // CLI mode and the user's (masked) token connection state.
    cliMode: data?.cliMode ?? false,
    claudeToken: data?.claudeToken ?? null,
    // Team membership + active-team resolution (see MeResponse).
    teams: data?.teams ?? [],
    activeTeamId: data?.activeTeamId ?? null,
    teamRole,
    isTeamAdmin: teamRole === 'ADMIN' || isSuperAdmin,
    // True when the user belongs to teams but hasn't (yet) resolved one as
    // active (see resolveActiveTeam) — the shell bounces to /choose-team.
    teamChoiceRequired: data?.teamChoiceRequired ?? false,
    isLoading,
    isError,
  }
}
