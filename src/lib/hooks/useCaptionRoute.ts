'use client'

import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/apiFetch'
import type { CaptionRouteState } from '@/lib/api-types'

// GET /api/team/caption-route (024 FR-08, any team member): the one answer the
// /team card, the COPY row chips and the brief wizard all render. The card
// writes the PUT response into this key (setQueryData) when it saves.
export const CAPTION_ROUTE_QUERY_KEY = ['team', 'caption-route'] as const

export function useCaptionRoute() {
  return useQuery({
    queryKey: CAPTION_ROUTE_QUERY_KEY,
    queryFn: () => apiFetch<CaptionRouteState>('/api/team/caption-route'),
  })
}
