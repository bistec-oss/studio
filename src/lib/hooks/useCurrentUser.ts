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

  return {
    user: data ?? null,
    isAdmin: data?.role?.toLowerCase() === 'admin',
    isLoading,
    isError,
  }
}
