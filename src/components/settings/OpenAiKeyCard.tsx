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
import type { OpenAiKeyInfo } from '@/lib/api-types'

// Self-service "OpenAI key" card — clone of ClaudeTokenCard against
// /api/me/openai-key. Used ahead of the team's configured IMAGE provider for
// image generation (see resolveImageProvider). Unlike the Claude token there
// is no live validation ping at save time (no free OpenAI endpoint to check
// against) — the key is accepted by shape only and only flips to INVALID
// after an observed generation failure, so a fresh INVALID row here just
// means "reconnect", not "this key was rejected on save."

const QUERY_KEY = ['me', 'openai-key'] as const

function statusPill(info: OpenAiKeyInfo) {
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

export function OpenAiKeyCard() {
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const [key, setKey] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<OpenAiKeyInfo>('/api/me/openai-key'),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })

  const saveMutation = useMutation({
    mutationFn: (k: string) =>
      apiFetch<OpenAiKeyInfo>('/api/me/openai-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: k }),
      }),
    onSuccess: () => {
      setKey('')
      invalidate()
      toast.success('OpenAI key connected')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const disconnectMutation = useMutation({
    mutationFn: () => apiFetch<OpenAiKeyInfo>('/api/me/openai-key', { method: 'DELETE' }),
    onSuccess: () => {
      invalidate()
      toast.success('OpenAI key disconnected')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleDisconnect = async () => {
    const ok = await confirm({
      title: 'Disconnect your OpenAI key?',
      description: 'Image generation will fall back to the team\'s configured provider until you reconnect.',
      confirmLabel: 'Disconnect',
    })
    if (ok) disconnectMutation.mutate()
  }

  const info = data ?? ({ connected: false } as OpenAiKeyInfo)

  return (
    <GlassPanel className="p-6 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 dark:bg-primary-light/10 text-primary dark:text-primary-light">
            <KeyRound size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">OpenAI key</h2>
            <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
              Connect your personal OpenAI key for image generation.
            </p>
          </div>
        </div>
        {!isLoading && statusPill(info)}
      </div>

      {info.connected && info.status === 'INVALID' && (
        <div className="rounded-xl border border-status-scheduled/30 dark:border-status-scheduled-dark/30 bg-status-scheduled/10 dark:bg-status-scheduled-dark/10 px-4 py-3 text-sm text-light-text dark:text-dark-text">
          Your OpenAI key was rejected on a recent generation — reconnect below. Until then image
          generation uses the team&apos;s configured provider.
        </div>
      )}

      {info.connected && (
        <div className="flex items-center gap-4 text-sm text-light-text-muted dark:text-dark-text-muted">
          <span className="font-mono">key {info.keyPrefix}</span>
        </div>
      )}

      <form
        className="flex flex-col sm:flex-row gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (key.trim()) saveMutation.mutate(key.trim())
        }}
      >
        <div className="flex-1">
          <GlassInput
            type="password"
            autoComplete="off"
            placeholder="sk-…"
            aria-label="OpenAI API key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={!key.trim() || saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : info.connected ? 'Replace' : 'Connect'}
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
