'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, XCircle, RotateCcw, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { StatusChip } from '@/components/ui/StatusChip'
import { Notice } from '@/components/ui/Notice'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { apiFetch } from '@/lib/apiFetch'
import { ASPECT_LABELS } from '@/lib/aspectRatio'
import { channelLabel } from '@/lib/channels'
import { relativeTime } from '@/lib/format'
import { QueueEntryModal } from './QueueEntryModal'
import { SectionHead } from '@/components/ui/SectionHead'
import { FOCUS, ICON, ICON_SM, ICON_BUTTON, SCROLL_FOCUS, TABLE_HEAD_ROW, TEXT_LINK } from '@/components/ui/atoms'
import type { ScheduledGeneration, GenerationStatus, SchedulerStatus } from '@/lib/api-types'

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

// The line the offline banner shows for one down loop (023 FR-05): what stops,
// and when the loop was last seen. A loop that never reported says so.
function offlineLine(loop: SchedulerStatus['loops'][number]): string {
  const publishing = loop.loop === 'scheduler'
  const name = publishing ? 'publishing' : 'generation'
  if (loop.state === 'never' || !loop.lastSeenAt) {
    return `The ${name} loop has not reported in. It is not running, or it has only just restarted.`
  }
  const seen = relativeTime(new Date(loop.lastSeenAt))
  return publishing
    ? `The publishing loop was last seen ${seen}. Scheduled posts will not publish until it is running.`
    : `The generation loop was last seen ${seen}. Planned posts will not generate until it is running.`
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
  isTeamAdmin: boolean
}

export function ScheduledQueueSection({ campaignId, resolvedKitId, isTeamAdmin }: ScheduledQueueSectionProps) {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [modal, setModal] = useState<{ open: boolean; entry?: ScheduledGeneration }>({ open: false })

  const { data: entries = [] } = useQuery({
    queryKey: ['campaigns', campaignId, 'queue'],
    queryFn: () => apiFetch<ScheduledGeneration[]>(`/api/campaigns/${campaignId}/queue`),
    // RUNNING → COMPLETED transitions happen in the worker; poll to reflect them.
    refetchInterval: 30_000,
  })

  // While loading, or if the status route fails, there is no banner: an
  // unreachable route must not read as "scheduler offline".
  const { data: schedulerStatus } = useQuery({
    queryKey: ['scheduler', 'status'],
    queryFn: () => apiFetch<SchedulerStatus>('/api/scheduler/status'),
    refetchInterval: 60_000,
  })
  const downLoops = schedulerStatus?.offline
    ? schedulerStatus.loops.filter(l => l.state !== 'online')
    : []

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
      toast.error(e instanceof Error ? e.message : 'Failed to cancel planned post')
    }
  }

  async function rerunEntry(entry: ScheduledGeneration) {
    try {
      await apiFetch(`/api/campaigns/${campaignId}/queue/${entry.id}/rerun`, { method: 'POST' })
      toast.success('Planned post re-armed — it will generate on the next scheduler tick.')
      await invalidate()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to re-run planned post')
    }
  }

  return (
    // A bezel card (021 design.md §8), its head the study's .card-hd.
    <section className="surface-bezel min-w-0 p-5">
      <SectionHead title={`Planned Posts (${entries.length})`} className="mb-3">
        {/* Outline, not primary: the briefing's Save is the view's one primary. */}
        <Button variant="secondary" size="sm" onClick={() => setModal({ open: true })}>
          <Plus {...ICON} /> Plan a post
        </Button>
      </SectionHead>

      {downLoops.length > 0 && (
        <Notice
          tone="warning"
          role="status"
          data-testid="scheduler-offline-banner"
          icon={<AlertTriangle {...ICON_SM} aria-hidden />}
          className="mb-3"
        >
          <p className="font-semibold">Scheduler offline</p>
          {downLoops.map(l => (
            <p key={l.loop}>{offlineLine(l)}</p>
          ))}
        </Notice>
      )}

      {entries.length === 0 ? (
        <p className="text-ui-sm text-fg-muted">
          No planned posts. Plan one and the scheduler will generate it automatically at its time
          — using the campaign briefing plus the post&apos;s specifics.
        </p>
      ) : (
        // A ruled data table (§8.15, the study's .ct): sentence-case muted
        // headers and --line-subtle rows. It scrolls inside its own container
        // at narrow widths, so the container is a focusable, labelled region
        // (WCAG 2.1.1) with an inset focus ring that the overflow can't clip.
        // `relative` makes it the containing block of the sr-only Actions
        // header, which would otherwise widen the page at 375 px.
        <div
          tabIndex={0}
          role="region"
          aria-label="Planned posts"
          className={`relative overflow-x-auto ${SCROLL_FOCUS}`}
        >
          <table className="w-full min-w-[720px] text-ui-sm">
            <thead>
              <tr className={TABLE_HEAD_ROW}>
                <th scope="col" className="py-2 pr-3 font-semibold">Topic</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Generate at</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Channels</th>
                <th scope="col" className="py-2 pr-3 font-semibold">After generation</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Status</th>
                <th scope="col" className="py-2 font-semibold sr-only">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.id} className="border-b border-line-subtle align-top last:border-b-0">
                  <td className="py-2.5 pr-3">
                    <p className="break-words font-medium text-fg">{entry.topic}</p>
                    <p className="text-ui-xs text-fg-muted">
                      {entry.designMode === 'TEMPLATE'
                        ? `Template: ${entry.template?.name ?? '—'}`
                        : 'Freeform'}
                      {' · '}
                      {ASPECT_LABELS[entry.aspectRatio].split(' ')[0]}
                    </p>
                    {entry.errorReason && (entry.status === 'FAILED' || (entry.status === 'PENDING' && entry.retryCount > 0)) && (
                      <p
                        className={`mt-0.5 text-ui-xs ${entry.status === 'FAILED' ? 'text-status-failed' : 'text-status-scheduled'}`}
                        title={entry.errorReason}>
                        {entry.errorReason.length > 80 ? `${entry.errorReason.slice(0, 80)}…` : entry.errorReason}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-ui-xs text-fg">
                    {formatDateTime(entry.generateAt)}
                  </td>
                  <td className="py-2.5 pr-3 text-ui-xs text-fg">
                    {entry.channels.map(channelLabel).join(', ')}
                  </td>
                  <td className="py-2.5 pr-3 text-ui-xs text-fg">
                    {ACTION_LABEL[entry.postAction]}
                    {entry.postAction === 'SCHEDULE_PUBLISH' && (
                      <span className="block whitespace-nowrap text-fg-muted">
                        {formatDateTime(entry.publishAt)}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <StatusChip status={CHIP[entry.status]} />
                    {/* 027 FR-12: an auto-publish the facts check held back. The
                        values are in the sentence and in the title. */}
                    {entry.heldReason && (
                      <p
                        className="mt-1 max-w-[16rem] break-words text-ui-xs text-status-scheduled"
                        title={entry.heldReason}
                        data-testid="queue-held-reason"
                      >
                        {entry.heldReason}
                      </p>
                    )}
                    {entry.retryCount > 0 && entry.status === 'PENDING' && (
                      <span className="mt-0.5 block text-ui-xs text-fg-muted">
                        retry {entry.retryCount}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-1.5">
                    <div className="flex items-center justify-end gap-1">
                      {entry.status === 'COMPLETED' && entry.draftId && (
                        <Link
                          href={`/drafts/${entry.draftId}`}
                          className={`rounded-ui-sm text-ui-xs font-semibold ${TEXT_LINK} ${FOCUS}`}
                        >
                          Open draft
                        </Link>
                      )}
                      {entry.status === 'PENDING' && (
                        <>
                          <button
                            type="button"
                            onClick={() => setModal({ open: true, entry })}
                            aria-label="Edit"
                            title="Edit"
                            className={`${ICON_BUTTON} hover:text-fg ${FOCUS}`}
                          >
                            <Pencil {...ICON} />
                          </button>
                          <button
                            type="button"
                            onClick={() => cancelEntry(entry)}
                            aria-label="Cancel"
                            title="Cancel"
                            className={`${ICON_BUTTON} hover:text-status-failed ${FOCUS}`}
                          >
                            <XCircle {...ICON} />
                          </button>
                        </>
                      )}
                      {(entry.status === 'FAILED' || entry.status === 'CANCELLED') && (
                        <Button variant="ghost" size="sm" onClick={() => rerunEntry(entry)} aria-label="Re-run">
                          <RotateCcw {...ICON} /> Re-run
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
          isTeamAdmin={isTeamAdmin}
          entry={modal.entry}
          onClose={() => setModal({ open: false })}
          onSaved={async () => {
            setModal({ open: false })
            await invalidate()
          }}
        />
      )}
    </section>
  )
}
