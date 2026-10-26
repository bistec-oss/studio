'use client'

import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/apiFetch'
import type { ModelsView } from '@/lib/api-types'

// GET /api/models (008 FR-18): the catalogue, the team's policy and this
// user's credential tier, the one view every model picker reads. /team →
// Models (ModelsCard) invalidates this same key on save, so every open picker
// re-resolves its pre-selection against the new policy.
export const MODELS_QUERY_KEY = ['models'] as const

export function useModels() {
  return useQuery({
    queryKey: MODELS_QUERY_KEY,
    queryFn: () => apiFetch<ModelsView>('/api/models'),
    staleTime: 60_000,
  })
}
