'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Unplug } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { SectionHead } from '@/components/ui/SectionHead'
import { StatusChip } from '@/components/ui/StatusChip'
import { ICON, SUB_HEAD } from '@/components/ui/atoms'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { apiFetch } from '@/lib/apiFetch'
import type { TeamClaudeTokenInfo } from '@/lib/api-types'
import { ClaudeConnectGuide } from '@/components/settings/ClaudeConnectGuide'

// Team-admin management of the TEAM's shared Claude OAuth token — the
// fallback tier below each member's personal token (src/lib/agent/userToken.ts
// resolveClaudeAuth). Mirrors ClaudeTokenCard's contract but has no
// status/lastValidatedAt columns: a rejected team token is simply cleared
// server-side, not flagged INVALID like the personal tier.

const QUERY_KEY = ['team', 'claude-token'] as const

function statusPill(info: TeamClaudeTokenInfo) {
  if (!info.connected) return <StatusChip tone="draft">Not connected</StatusChip>
  return <StatusChip tone="published">Connected</StatusChip>
}

export function TeamClaudeTokenCard() {
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const [token, setToken] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<TeamClaudeTokenInfo>('/api/team/claude-token'),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })

  const saveMutation = useMutation({
    mutationFn: (t: string) =>
      apiFetch<TeamClaudeTokenInfo>('/api/team/claude-token', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: t }),
      }),
    onSuccess: () => {
      setToken('')
      invalidate()
      toast.success('Team Claude account connected')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const disconnectMutation = useMutation({
    mutationFn: () => apiFetch<TeamClaudeTokenInfo>('/api/team/claude-token', { method: 'DELETE' }),
    onSuccess: () => {
      invalidate()
      toast.success('Team Claude account disconnected')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleDisconnect = async () => {
    const ok = await confirm({
      title: 'Disconnect the team Claude account?',
      description: 'Members without a personal Claude token will have no Claude account to generate with until this is reconnected, and scheduled posts, MCP and ACP runs will fail.',
      confirmLabel: 'Disconnect',
    })
    if (ok) disconnectMutation.mutate()
  }

  const info = data ?? ({ connected: false } as TeamClaudeTokenInfo)

  return (
    // A bezel card (021 design.md §8), its head the study's .card-hd.
    <section className="surface-bezel min-w-0 p-5">
      <SectionHead title="Team Claude account" className="mb-3">
        {!isLoading && statusPill(info)}
      </SectionHead>

      <div className="flex flex-col gap-5">
        <p className="text-ui-sm text-fg-muted">
          Shared fallback used by members who haven&apos;t connected their own Claude account. It is also the only credential scheduled posts, MCP and ACP runs can use.
        </p>

        {info.connected && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ui-sm text-fg-muted">
            <span className="font-mono">token {info.keyPrefix}</span>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <h3 className={SUB_HEAD}>
            {info.connected ? 'Replace the team token' : 'Connect a team Claude account'}
          </h3>
          <ClaudeConnectGuide variant="team" />
        </div>

        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
          onSubmit={(e) => {
            e.preventDefault()
            if (token.trim()) saveMutation.mutate(token.trim())
          }}
        >
          <div className="min-w-0 flex-1">
            <Input
              type="password"
              autoComplete="off"
              placeholder="sk-ant-oat01-…"
              aria-label="Team Claude OAuth token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="ink" disabled={!token.trim() || saveMutation.isPending}>
              {saveMutation.isPending ? 'Validating…' : info.connected ? 'Replace' : 'Connect'}
            </Button>
            {info.connected && (
              <Button
                type="button"
                variant="secondary"
                onClick={handleDisconnect}
                disabled={disconnectMutation.isPending}
              >
                <Unplug {...ICON} />
                Disconnect
              </Button>
            )}
          </div>
        </form>
      </div>
    </section>
  )
}
