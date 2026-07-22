'use client'

import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { KeySquare, Plus, Copy, Trash2 } from 'lucide-react'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { GlassInput } from '@/components/ui/GlassInput'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { QueryError } from '@/components/ui/QueryError'
import { apiFetch } from '@/lib/apiFetch'
import type { TeamApiKeySummary, TeamApiKeyCreated } from '@/lib/api-types'

// Team-admin management of the team's MCP/ACP machine credentials
// (src/mcp/auth.ts resolveApiKey). The plaintext key is only ever returned
// once, right after creation (mirrors the "Add user" initial-password flow)
// — every later GET returns only the masked prefix, so the reveal modal here
// is the one and only chance to copy it.

const QUERY_KEY = ['team', 'api-keys'] as const

export function ApiKeysCard() {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [createOpen, setCreateOpen] = useState(false)
  const [justCreated, setJustCreated] = useState<TeamApiKeyCreated | null>(null)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<{ keys: TeamApiKeySummary[] }>('/api/team/api-keys'),
  })
  const keys = data?.keys ?? []

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: QUERY_KEY })
  }

  async function revoke(key: TeamApiKeySummary) {
    const ok = await confirm({
      title: `Revoke "${key.label}"?`,
      description: 'Any integration using this key will stop authenticating immediately. This cannot be undone.',
      confirmLabel: 'Revoke',
    })
    if (!ok) return
    try {
      await apiFetch(`/api/team/api-keys/${key.id}`, { method: 'DELETE' })
      toast.success('API key revoked')
      await invalidate()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to revoke key')
    }
  }

  return (
    <GlassPanel className="p-6 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 dark:bg-primary-light/10 text-primary dark:text-primary-light">
            <KeySquare size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">API keys</h2>
            <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
              Machine credentials for MCP/ACP integrations calling on this team&apos;s behalf.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={14} /> Create key
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-light-text-muted dark:text-dark-text-muted">Loading…</p>
      ) : isError ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : keys.length === 0 ? (
        <p className="text-sm text-light-text-muted dark:text-dark-text-muted italic">No API keys yet</p>
      ) : (
        <div className="flex flex-col gap-2">
          {keys.map((k) => (
            <div key={k.id} className="glass-input rounded-xl p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-light-text dark:text-dark-text truncate">{k.label}</span>
                  {k.revokedAt && (
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-status-failed/10 dark:bg-status-failed-dark/15 text-status-failed dark:text-status-failed-dark">
                      Revoked
                    </span>
                  )}
                </div>
                <p className="font-mono text-xs text-light-text-muted dark:text-dark-text-muted mt-0.5">
                  {k.keyPrefix}•••• · created {new Date(k.createdAt).toLocaleDateString()}
                </p>
              </div>
              {!k.revokedAt && (
                <Button variant="ghost" size="sm" onClick={() => revoke(k)}>
                  <Trash2 size={13} /> Revoke
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <CreateKeyModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(created) => {
          setCreateOpen(false)
          setJustCreated(created)
          invalidate()
        }}
      />
      <RevealKeyModal created={justCreated} onClose={() => setJustCreated(null)} />
    </GlassPanel>
  )
}

function CreateKeyModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (created: TeamApiKeyCreated) => void
}) {
  const [label, setLabel] = useState('')

  const createMutation = useMutation({
    mutationFn: (l: string) =>
      apiFetch<TeamApiKeyCreated>('/api/team/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: l }),
      }),
    onSuccess: (created) => {
      setLabel('')
      onCreated(created)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Modal open={open} onClose={onClose} title="Create API key" size="sm">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (label.trim()) createMutation.mutate(label.trim())
        }}
      >
        <GlassInput
          label="Label"
          placeholder="e.g. Zapier integration"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
        />
        <div className="flex gap-2 justify-end pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!label.trim() || createMutation.isPending}>
            {createMutation.isPending ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function RevealKeyModal({
  created,
  onClose,
}: {
  created: TeamApiKeyCreated | null
  onClose: () => void
}) {
  async function copy() {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.plaintext)
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Could not copy — select and copy manually')
    }
  }

  return (
    <Modal open={created !== null} onClose={onClose} title={`Key created — ${created?.label ?? ''}`} size="md">
      <div className="space-y-3">
        <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
          This is the only time the full key is shown. Copy it now — it can&apos;t be retrieved again later.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 font-mono text-xs px-3 py-2.5 rounded-xl glass-input text-light-text dark:text-dark-text break-all">
            {created?.plaintext}
          </code>
          <Button type="button" variant="secondary" size="sm" onClick={copy}>
            <Copy size={14} /> Copy
          </Button>
        </div>
        <div className="flex justify-end pt-1">
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  )
}
