'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Unplug } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { apiFetch } from '@/lib/apiFetch'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { SectionHead } from '@/components/ui/SectionHead'
import { Notice } from '@/components/ui/Notice'
import { StatusChip } from '@/components/ui/StatusChip'
import { ICON, SUB_HEAD } from '@/components/ui/atoms'
import { ClaudeConnectGuide } from './ClaudeConnectGuide'
import type { ClaudeTokenInfo } from '@/lib/api-types'

// Self-service "Claude account" card: connect / replace / disconnect the user's
// personal Claude OAuth token (from `claude setup-token`). In CLI mode every
// generation the user triggers then bills their own Claude subscription; without
// one, generation falls back to the team's token, and fails if the team has none.

const QUERY_KEY = ['me', 'claude-token'] as const

function statusPill(info: ClaudeTokenInfo) {
  if (!info.connected) return <StatusChip tone="draft">Not connected</StatusChip>
  if (info.status === 'INVALID') return <StatusChip tone="scheduled">Invalid — reconnect</StatusChip>
  return <StatusChip tone="published">Connected</StatusChip>
}

export function ClaudeTokenCard() {
  const { cliMode } = useCurrentUser()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const [token, setToken] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<ClaudeTokenInfo>('/api/me/claude-token'),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    // /api/me carries the (masked) token state for the app-shell prompt.
    queryClient.invalidateQueries({ queryKey: ['me'] })
  }

  const saveMutation = useMutation({
    mutationFn: (t: string) =>
      apiFetch<ClaudeTokenInfo>('/api/me/claude-token', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: t }),
      }),
    onSuccess: () => {
      setToken('')
      invalidate()
      toast.success('Claude account connected')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const disconnectMutation = useMutation({
    mutationFn: () => apiFetch<ClaudeTokenInfo>('/api/me/claude-token', { method: 'DELETE' }),
    onSuccess: () => {
      invalidate()
      toast.success('Claude account disconnected')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleDisconnect = async () => {
    const ok = await confirm({
      title: 'Disconnect your Claude account?',
      description: 'Until you reconnect, your generations use the team’s Claude account if one is set, otherwise they can’t run.',
      confirmLabel: 'Disconnect',
    })
    if (ok) disconnectMutation.mutate()
  }

  const info = data ?? ({ connected: false } as ClaudeTokenInfo)

  return (
    // A bezel card (021 design.md §8), its head the study's .card-hd.
    <section className="surface-bezel min-w-0 p-5">
      <SectionHead title="Claude account" className="mb-3">
        {!isLoading && statusPill(info)}
      </SectionHead>

      <div className="flex flex-col gap-5">
        <p className="text-ui-sm text-fg-muted">
          Connect your personal Claude subscription for post generation.
        </p>

        {info.connected && info.status === 'INVALID' && (
          <Notice tone="warning">
            <span className="text-fg">
              Your Claude token has expired or was revoked — reconnect below. Until then your
              generations use the team&apos;s Claude account if one is set, otherwise they can&apos;t run.
            </span>
          </Notice>
        )}

        {!cliMode && (
          <Notice tone="neutral">
            <span className="text-fg-muted">
              This server currently runs in API mode — a saved token is kept but only used when
              CLI-mode generation is active.
            </span>
          </Notice>
        )}

        {info.connected && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ui-sm text-fg-muted">
            <span className="font-mono">token {info.keyPrefix}</span>
            <span>
              connected {new Date(info.connectedAt).toLocaleDateString()}
            </span>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <h3 className={SUB_HEAD}>
            {info.connected ? 'Replace your token' : 'Connect your Claude account'}
          </h3>
          <ClaudeConnectGuide variant="personal" />
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
              aria-label="Claude OAuth token"
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
