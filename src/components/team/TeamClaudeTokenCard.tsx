'use client'

import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { KeyRound, Unplug } from 'lucide-react'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { GlassInput } from '@/components/ui/GlassInput'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { apiFetch } from '@/lib/apiFetch'
import type { TeamClaudeTokenInfo } from '@/lib/api-types'

// Team-admin management of the TEAM's shared Claude OAuth token — the
// fallback tier below each member's personal token (src/lib/agent/userToken.ts
// resolveClaudeAuth). Mirrors ClaudeTokenCard's contract but has no
// status/lastValidatedAt columns: a rejected team token is simply cleared
// server-side, not flagged INVALID like the personal tier.

const QUERY_KEY = ['team', 'claude-token'] as const

function statusPill(info: TeamClaudeTokenInfo) {
  const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-medium border'
  if (!info.connected) {
    return (
      <span className={`${base} bg-status-draft/10 dark:bg-status-draft-dark/15 text-status-draft dark:text-status-draft-dark border-status-draft/25 dark:border-status-draft-dark/30`}>
        Not connected
      </span>
    )
  }
  return (
    <span className={`${base} bg-status-published/10 dark:bg-status-published-dark/15 text-status-published dark:text-status-published-dark border-status-published/25 dark:border-status-published-dark/30`}>
      Connected
    </span>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-xs px-1.5 py-0.5 rounded-md bg-primary/10 dark:bg-primary-light/10 text-primary dark:text-primary-light">
      {children}
    </code>
  )
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
      description: 'Members without a personal Claude token will fall back to the shared server credential until this is reconnected.',
      confirmLabel: 'Disconnect',
    })
    if (ok) disconnectMutation.mutate()
  }

  const info = data ?? ({ connected: false } as TeamClaudeTokenInfo)

  return (
    <GlassPanel className="p-6 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 dark:bg-primary-light/10 text-primary dark:text-primary-light">
            <KeyRound size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">Team Claude account</h2>
            <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
              Shared fallback used by members who haven&apos;t connected their own Claude account.
            </p>
          </div>
        </div>
        {!isLoading && statusPill(info)}
      </div>

      {info.connected && (
        <div className="flex items-center gap-4 text-sm text-light-text-muted dark:text-dark-text-muted">
          <span className="font-mono">token {info.keyPrefix}</span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-light-text dark:text-dark-text">
          {info.connected ? 'Replace the team token' : 'Connect a team Claude account'}
        </h3>
        <ol className="list-decimal list-inside flex flex-col gap-1.5 text-sm text-light-text-muted dark:text-dark-text-muted">
          <li>
            Install Claude Code: <Code>npm install -g @anthropic-ai/claude-code</Code>
          </li>
          <li>
            Run <Code>claude setup-token</Code> and finish the sign-in it opens in your browser.
          </li>
          <li>
            Copy the printed token — it starts with <Code>sk-ant-oat01-</Code> and lasts about a
            year.
          </li>
          <li>Paste it below.</li>
        </ol>
      </div>

      <form
        className="flex flex-col sm:flex-row gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (token.trim()) saveMutation.mutate(token.trim())
        }}
      >
        <div className="flex-1">
          <GlassInput
            type="password"
            autoComplete="off"
            placeholder="sk-ant-oat01-…"
            aria-label="Team Claude OAuth token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={!token.trim() || saveMutation.isPending}>
            {saveMutation.isPending ? 'Validating…' : info.connected ? 'Replace' : 'Connect'}
          </Button>
          {info.connected && (
            <Button
              type="button"
              variant="secondary"
              onClick={handleDisconnect}
              disabled={disconnectMutation.isPending}
            >
              <Unplug size={16} />
              Disconnect
            </Button>
          )}
        </div>
      </form>
    </GlassPanel>
  )
}
