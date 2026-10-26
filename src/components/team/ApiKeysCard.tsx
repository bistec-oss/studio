'use client'

import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Copy, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { SectionHead } from '@/components/ui/SectionHead'
import { StatusChip } from '@/components/ui/StatusChip'
import { ICON_SM, ROW } from '@/components/ui/atoms'
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
    // A bezel card (021 design.md §8), its head the study's .card-hd; the keys
    // are ruled rows on --line-subtle.
    <section className="surface-bezel min-w-0 p-5">
      <SectionHead title="API keys" className="mb-3">
        <Button size="sm" variant="secondary" onClick={() => setCreateOpen(true)}>
          <Plus {...ICON_SM} /> Create key
        </Button>
      </SectionHead>

      <div>
        <p className="text-ui-sm text-fg-muted">
          Machine credentials for MCP/ACP integrations calling on this team&apos;s behalf.
        </p>

        <div className="mt-4">
          {isLoading ? (
            <p className="text-ui-sm text-fg-muted">Loading…</p>
          ) : isError ? (
            <QueryError error={error} onRetry={() => refetch()} />
          ) : keys.length === 0 ? (
            <p className="text-ui-sm text-fg-muted">No API keys yet</p>
          ) : (
            <ul className="border-t border-line-subtle">
              {keys.map((k) => (
                <li key={k.id} className={`${ROW} flex items-center justify-between gap-3 last:border-b-0 last:pb-0`}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 break-words text-ui-base font-medium text-fg">{k.label}</span>
                      {k.revokedAt && <StatusChip tone="failed">Revoked</StatusChip>}
                    </div>
                    <p className="mt-0.5 text-ui-xs text-fg-muted">
                      <span className="font-mono">{k.keyPrefix}••••</span> · created {new Date(k.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {!k.revokedAt && (
                    <Button variant="ghost" size="sm" onClick={() => revoke(k)}>
                      <Trash2 {...ICON_SM} /> Revoke
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

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
    </section>
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
        <Input
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
        <p className="text-ui-sm text-fg-muted">
          This is the only time the full key is shown. Copy it now — it can&apos;t be retrieved again later.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-ui-md bg-canvas px-3 py-2.5 font-mono text-ui-xs text-fg ring-1 ring-inset ring-line-subtle">
            {created?.plaintext}
          </code>
          <Button type="button" variant="secondary" size="sm" onClick={copy}>
            <Copy {...ICON_SM} /> Copy
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
