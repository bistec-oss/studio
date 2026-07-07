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
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import type { ClaudeTokenInfo } from '@/lib/api-types'

// Self-service "Claude account" card: connect / replace / disconnect the user's
// personal Claude OAuth token (from `claude setup-token`). In CLI mode every
// generation the user triggers then bills their own Claude subscription; without
// a token (or outside CLI mode) the server's shared credential is used.

const QUERY_KEY = ['me', 'claude-token'] as const

function statusPill(info: ClaudeTokenInfo) {
  const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-medium border'
  if (!info.connected) {
    return (
      <span className={`${base} bg-status-draft/10 dark:bg-status-draft-dark/15 text-status-draft dark:text-status-draft-dark border-status-draft/25 dark:border-status-draft-dark/30`}>
        Not connected
      </span>
    )
  }
  if (info.status === 'INVALID') {
    return (
      <span className={`${base} bg-status-scheduled/10 dark:bg-status-scheduled-dark/15 text-status-scheduled dark:text-status-scheduled-dark border-status-scheduled/25 dark:border-status-scheduled-dark/30`}>
        Invalid — reconnect
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
      description: 'Your generations will use the shared server credential until you reconnect.',
      confirmLabel: 'Disconnect',
    })
    if (ok) disconnectMutation.mutate()
  }

  const info = data ?? ({ connected: false } as ClaudeTokenInfo)

  return (
    <GlassPanel className="p-6 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 dark:bg-primary-light/10 text-primary dark:text-primary-light">
            <KeyRound size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">Claude account</h2>
            <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
              Connect your personal Claude subscription for post generation.
            </p>
          </div>
        </div>
        {!isLoading && statusPill(info)}
      </div>

      {info.connected && info.status === 'INVALID' && (
        <div className="rounded-xl border border-status-scheduled/30 dark:border-status-scheduled-dark/30 bg-status-scheduled/10 dark:bg-status-scheduled-dark/10 px-4 py-3 text-sm text-light-text dark:text-dark-text">
          Your Claude token has expired or was revoked — reconnect below. Until then your
          generations use the shared server credential.
        </div>
      )}

      {!cliMode && (
        <div className="rounded-xl border border-light-border dark:border-dark-border bg-light-surface/50 dark:bg-dark-surface/50 px-4 py-3 text-sm text-light-text-muted dark:text-dark-text-muted">
          This server currently runs in API mode — a saved token is kept but only used when
          CLI-mode generation is active.
        </div>
      )}

      {info.connected && (
        <div className="flex items-center gap-4 text-sm text-light-text-muted dark:text-dark-text-muted">
          <span className="font-mono">token {info.keyPrefix}</span>
          <span className="font-mono">
            connected {new Date(info.connectedAt).toLocaleDateString()}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-light-text dark:text-dark-text">
          {info.connected ? 'Replace your token' : 'Connect your Claude account'}
        </h3>
        <ol className="list-decimal list-inside flex flex-col gap-1.5 text-sm text-light-text-muted dark:text-dark-text-muted">
          <li>
            Install Claude Code on your own computer: <Code>npm install -g @anthropic-ai/claude-code</Code>
          </li>
          <li>
            In your terminal, run <Code>claude setup-token</Code> and finish the sign-in it opens
            in your browser.
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
            aria-label="Claude OAuth token"
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
