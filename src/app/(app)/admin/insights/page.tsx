'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/apiFetch'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import type { Insights } from '@/lib/analytics/queries'
import { GateNotice } from '@/components/ui/GateNotice'
import { PageHead } from '@/components/ui/PageHead'
import { QueryError } from '@/components/ui/QueryError'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'
import { RANGE_OPTIONS } from '@/components/admin/insights/format'
import {
  DurationsSection,
  FailuresSection,
  FunnelSection,
  HealthSection,
  PostStylesSection,
  RefineSection,
  StylesSection,
  TeamsSection,
} from '@/components/admin/insights/sections'

// Product insights (006 FR-10): one page, super admin only, global across teams.
// Every number comes from GET /api/admin/insights (queries.ts); the page never
// writes or deletes.
export default function AdminInsightsPage() {
  const { isSuperAdmin, isLoading } = useCurrentUser()
  const [range, setRange] = useState('30d')

  const query = useQuery({
    queryKey: ['admin', 'insights', range],
    queryFn: () => apiFetch<Insights>(`/api/admin/insights?range=${range}`),
    enabled: isSuperAdmin,
  })

  if (isLoading) return null

  if (!isSuperAdmin) {
    return (
      <GateNotice title="Requires super admin">
        Product insights are limited to super administrators.
      </GateNotice>
    )
  }

  const data = query.data

  return (
    <div className="max-w-5xl">
      <PageHead
        eyebrow="Admin"
        title="Insights"
        lead="What happens to drafts across every team: refine, failures, image styles and model choices."
        className="mb-6"
        actions={<SegmentedToggle label="Date range" options={RANGE_OPTIONS} value={range} onChange={setRange} />}
      />

      {query.isError && <QueryError error={query.error} onRetry={() => query.refetch()} />}
      {query.isPending && !query.isError && (
        <p role="status" className="text-ui-sm text-fg-muted">Loading insights…</p>
      )}

      {data && (
        <div className="flex flex-col gap-6" data-testid="insights-body">
          <RefineSection data={data.refine} />
          <FailuresSection data={data.failures} />
          <StylesSection data={data.styles} />
          <PostStylesSection data={data.postStyles} />
          <DurationsSection data={data.durations} />
          <FunnelSection data={data.funnel} />
          <TeamsSection data={data.teams} />
          <HealthSection lost={data.lost} retention={data.retention} />
        </div>
      )}
    </div>
  )
}
