'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, XCircle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { StatusChip } from '@/components/ui/StatusChip'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { apiFetch } from '@/lib/apiFetch'
import { ASPECT_LABELS } from '@/lib/aspectRatio'
import { channelLabel } from '@/lib/channels'
import { QueueEntryModal } from './QueueEntryModal'
import type { ScheduledGeneration, GenerationStatus } from '@/lib/api-types'

// Planned-posts queue under a campaign: table of scheduled generations with
// status chips and per-row actions (edit/cancel while PENDING, re-run after
// FAILED/CANCELLED, open the draft once COMPLETED).

const CHIP: Record<GenerationStatus, React.ComponentProps<typeof StatusChip>['status']> = {
  PENDING: 'queued',
  RUNNING: 'generating',
  COMPLETED: 'generated',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
}

const ACTION_LABEL: Record<string, string> = {
  HOLD: 'Hold for review',
  SCHEDULE_PUBLISH: 'Schedule publish',
  PUBLISH_NOW: 'Publish now',
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

interface ScheduledQueueSectionProps {
  campaignId: string
  resolvedKitId: string | null
  isAdmin: boolean
}

export function ScheduledQueueSection({ campaignId, resolvedKitId, isAdmin }: ScheduledQueueSectionProps) {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [modal, setModal] = useState<{ open: boolean; entry?: ScheduledGeneration }>({ open: false })

  const { data: entries = [] } = useQuery({
    queryKey: ['campaigns', campaignId, 'queue'],
    queryFn: () => apiFetch<ScheduledGeneration[]>(`/api/campaigns/${campaignId}/queue`),
    // RUNNING → COMPLETED transitions happen in the worker; poll to reflect them.
    refetchInterval: 30_000,
  })

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'queue'] })
  }

  async function cancelEntry(entry: ScheduledGeneration) {
    const ok = await confirm({
      title: 'Cancel planned post?',
      description: `"${entry.topic}" will not be generated. You can re-arm it later with Re-run.`,
      confirmLabel: 'Cancel post',
    })
    if (!ok) return
    try {
      await apiFetch(`/api/campaigns/${campaignId}/queue/${entry.id}`, { method: 'DELETE' })
      await invalidate()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to cancel entry')
    }
  }

  async function rerunEntry(entry: ScheduledGeneration) {
    try {
      await apiFetch(`/api/campaigns/${campaignId}/queue/${entry.id}/rerun`, { method: 'POST' })
      toast.success('Entry re-armed — it will generate on the next scheduler tick.')
      await invalidate()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to re-run entry')
    }
  }

  return (
    <GlassPanel className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-light-text-muted dark:text-dark-text-muted">
          Planned Posts ({entries.length})
        </h3>
        <Button size="sm" onClick={() => setModal({ open: true })}>
          <Plus size={13} /> Plan a post
        </Button>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
          No planned posts. Plan one and the scheduler will generate it automatically at its time
          — using the campaign briefing plus the post&apos;s specifics.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-light-text-muted dark:text-dark-text-muted">
                <th className="py-2 pr-3 font-medium">Topic</th>
                <th className="py-2 pr-3 font-medium">Generate at</th>
                <th className="py-2 pr-3 font-medium">Channels</th>
                <th className="py-2 pr-3 font-medium">After generation</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 font-medium sr-only">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.id} className="border-t border-light-border/50 dark:border-dark-border/50 align-top">
                  <td className="py-2.5 pr-3">
                    <p className="font-medium text-light-text dark:text-dark-text">{entry.topic}</p>
                    <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
                      {entry.designMode === 'TEMPLATE'
                        ? `Template: ${entry.template?.name ?? '—'}`
                        : 'Freeform'}
                      {' · '}
                      {ASPECT_LABELS[entry.aspectRatio].split(' ')[0]}
                    </p>
                    {entry.status === 'FAILED' && entry.errorReason && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-0.5" title={entry.errorReason}>
                        {entry.errorReason.length > 80 ? `${entry.errorReason.slice(0, 80)}…` : entry.errorReason}
                      </p>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-light-text dark:text-dark-text whitespace-nowrap">
                    {formatDateTime(entry.generateAt)}
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-light-text dark:text-dark-text">
                    {entry.channels.map(channelLabel).join(', ')}
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-light-text dark:text-dark-text">
                    {ACTION_LABEL[entry.postAction]}
                    {entry.postAction === 'SCHEDULE_PUBLISH' && (
                      <span className="block font-mono text-light-text-muted dark:text-dark-text-muted">
                        {formatDateTime(entry.publishAt)}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <StatusChip status={CHIP[entry.status]} />
                    {entry.retryCount > 0 && entry.status === 'PENDING' && (
                      <span className="block text-xs text-light-text-muted dark:text-dark-text-muted mt-0.5">
                        retry {entry.retryCount}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 whitespace-nowrap">
                    <div className="flex gap-1 justify-end">
                      {entry.status === 'COMPLETED' && entry.draftId && (
                        <Link
                          href={`/drafts/${entry.draftId}`}
                          className="text-xs text-primary dark:text-primary-light hover:underline self-center"
                        >
                          Open draft
                        </Link>
                      )}
                      {entry.status === 'PENDING' && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => setModal({ open: true, entry })} aria-label="Edit">
                            <Pencil size={13} />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => cancelEntry(entry)} aria-label="Cancel">
                            <XCircle size={13} />
                          </Button>
                        </>
                      )}
                      {(entry.status === 'FAILED' || entry.status === 'CANCELLED') && (
                        <Button variant="ghost" size="sm" onClick={() => rerunEntry(entry)} aria-label="Re-run">
                          <RotateCcw size={13} /> Re-run
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal.open && (
        <QueueEntryModal
          campaignId={campaignId}
          resolvedKitId={resolvedKitId}
          isAdmin={isAdmin}
          entry={modal.entry}
          onClose={() => setModal({ open: false })}
          onSaved={async () => {
            setModal({ open: false })
            await invalidate()
          }}
        />
      )}
    </GlassPanel>
  )
}
