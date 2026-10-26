'use client'

import React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Notice } from '@/components/ui/Notice'
import { QueryError } from '@/components/ui/QueryError'
import { SectionHead } from '@/components/ui/SectionHead'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'
import { apiFetch } from '@/lib/apiFetch'
import { CAPTION_ROUTE_QUERY_KEY, useCaptionRoute } from '@/lib/hooks/useCaptionRoute'
import type { CaptionRouteState } from '@/lib/api-types'

// /team → Caption route (024 FR-09): which credential this team's captions run
// on. The decision and its messages live on the server (loadCaptionRoute); this
// card renders GET /api/team/caption-route and never re-derives it. A refused
// or failed save shows the server's message inline.

type Setting = NonNullable<CaptionRouteState['setting']>

const OPTIONS: Array<{ value: Setting; label: string }> = [
  { value: 'CLI', label: 'Claude CLI (OAuth)' },
  { value: 'API_KEY', label: 'Anthropic API key' },
]

const EFFECTIVE_LABELS: Record<NonNullable<CaptionRouteState['effective']>, string> = {
  CLI: 'the Claude CLI (OAuth)',
  API_KEY: 'the team’s Anthropic API key',
  SERVER_KEY: 'the server’s Anthropic key',
  OTHER: 'a registered caption provider',
}

export function CaptionRouteCard() {
  const queryClient = useQueryClient()
  const routeQuery = useCaptionRoute()
  const headingId = React.useId()

  const saveMutation = useMutation({
    mutationFn: (route: Setting | null) =>
      apiFetch<CaptionRouteState>('/api/team/caption-route', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ route }),
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(CAPTION_ROUTE_QUERY_KEY, next)
      toast.success('Caption route saved')
    },
  })

  const data = routeQuery.data

  return (
    <section aria-labelledby={headingId} className="surface-bezel min-w-0 p-5">
      <SectionHead title="Caption route" id={headingId} className="mb-3" />
      <p className="text-ui-sm text-fg-muted">
        Which credential this team&apos;s captions run on. Post design, scheduled posts and MCP/ACP runs use the
        Claude account, not this route; scheduled runs need a team Claude token.
      </p>

      <div className="mt-4 space-y-4">
        {routeQuery.isError ? (
          <QueryError error={routeQuery.error} onRetry={() => routeQuery.refetch()} />
        ) : !data ? (
          <p className="text-ui-sm text-fg-muted">Loading…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <SegmentedToggle
                options={OPTIONS}
                value={data.setting ?? ''}
                onChange={(v) => {
                  if (!saveMutation.isPending && v !== data.setting) saveMutation.mutate(v as Setting)
                }}
                label="Caption route"
              />
              {data.setting !== null && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={saveMutation.isPending}
                  onClick={() => saveMutation.mutate(null)}
                >
                  Use the default
                </Button>
              )}
            </div>

            {data.state === 'not-ready' ? (
              <Notice
                tone="warning"
                role="status"
                data-testid="caption-route-state"
                data-state={data.state}
              >
                <p>{data.message}</p>
                <p className="mt-1 text-ui-xs">New captions fail until this is fixed.</p>
              </Notice>
            ) : (
              <p
                data-testid="caption-route-state"
                data-state={data.state}
                className="text-ui-sm text-fg"
              >
                {data.state === 'ready'
                  ? `Captions run on ${data.effective ? EFFECTIVE_LABELS[data.effective] : 'the chosen route'}.`
                  : `No route chosen — captions use the server default${
                      data.effective ? `: ${EFFECTIVE_LABELS[data.effective]}` : ''
                    }.`}
              </p>
            )}

            {saveMutation.isError && (
              <Notice tone="error" role="alert" data-testid="caption-route-error">
                {saveMutation.error.message}
              </Notice>
            )}
          </>
        )}
      </div>
    </section>
  )
}
