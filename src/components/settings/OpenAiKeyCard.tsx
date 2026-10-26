'use client'

import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Unplug } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { SectionHead } from '@/components/ui/SectionHead'
import { Notice } from '@/components/ui/Notice'
import { StatusChip } from '@/components/ui/StatusChip'
import { ICON } from '@/components/ui/atoms'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { apiFetch } from '@/lib/apiFetch'
import type { OpenAiKeyInfo } from '@/lib/api-types'

// Self-service "Image generation key" card (031 FR-15), a clone of
// ClaudeTokenCard against /api/me/openai-key (the route keeps its name). The
// key is an OpenAI or a Gemini key; the server detects which from its prefix
// and refuses anything else. It is used ahead of the team's configured IMAGE
// provider for image generation (see resolveImageProvider). There is no live
// validation ping at save time: the key is accepted by shape only and only
// flips to INVALID after an observed generation failure, so a fresh INVALID
// row here just means "reconnect", not "this key was rejected on save."

const QUERY_KEY = ['me', 'openai-key'] as const

function statusPill(info: OpenAiKeyInfo) {
  if (!info.connected) return <StatusChip tone="draft">Not connected</StatusChip>
  if (info.status === 'INVALID') return <StatusChip tone="scheduled">Invalid — reconnect</StatusChip>
  return <StatusChip tone="published">Connected</StatusChip>
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
      toast.success('Image generation key connected')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const disconnectMutation = useMutation({
    mutationFn: () => apiFetch<OpenAiKeyInfo>('/api/me/openai-key', { method: 'DELETE' }),
    onSuccess: () => {
      invalidate()
      toast.success('Image generation key disconnected')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleDisconnect = async () => {
    const ok = await confirm({
      title: 'Disconnect your image generation key?',
      description: 'Image generation will fall back to the team\'s configured provider until you reconnect.',
      confirmLabel: 'Disconnect',
    })
    if (ok) disconnectMutation.mutate()
  }

  const info = data ?? ({ connected: false } as OpenAiKeyInfo)

  return (
    // A bezel card (021 design.md §8), its head the study's .card-hd.
    <section className="surface-bezel min-w-0 p-5">
      <SectionHead title="Image generation key" className="mb-3">
        {!isLoading && statusPill(info)}
      </SectionHead>

      <div className="flex flex-col gap-5">
        <p className="text-ui-sm text-fg-muted">
          Your own OpenAI or Gemini key. When connected, it makes every image you generate, before the
          team&apos;s provider.
        </p>

        {info.connected && info.status === 'INVALID' && (
          <Notice tone="warning">
            <span className="text-fg">
              Your image generation key was rejected on a recent generation — reconnect below. Until then image
              generation uses the team&apos;s configured provider.
            </span>
          </Notice>
        )}

        {info.connected && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ui-sm text-fg-muted">
            <span className="font-mono" data-testid="image-key-summary">
              {info.provider === 'gemini' ? 'Gemini' : 'OpenAI'} {info.keyPrefix}
            </span>
          </div>
        )}

        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
          onSubmit={(e) => {
            e.preventDefault()
            if (key.trim()) saveMutation.mutate(key.trim())
          }}
        >
          <div className="min-w-0 flex-1">
            <Input
              type="password"
              autoComplete="off"
              placeholder="sk-… or AIza…"
              aria-label="Image generation API key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="ink" disabled={!key.trim() || saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : info.connected ? 'Replace' : 'Connect'}
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
