'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { StatusChip } from '@/components/ui/StatusChip'
import type { DraftStatus } from '@prisma/client'
import { channelLabel as sharedChannelLabel } from '@/lib/channels'

// ─── Recent Drafts card (dashboard) ─────────────────────────────────────────
// Collapsed it shows the first COLLAPSED_COUNT rows (the pre-existing look);
// Expand grows the same card in place and scrolls the full server-provided
// list internally — no overlay, no extra fetch, design unchanged.

const COLLAPSED_COUNT = 8

const DRAFT_CHIP: Record<DraftStatus, 'draft' | 'exported' | 'published' | 'failed'> = {
  IN_PROGRESS: 'draft',
  EXPORTED: 'exported',
  PUBLISHED: 'published',
  FAILED: 'failed',
}

function channelLabel(channels: string[]): string {
  if (!channels?.length) return '—'
  return channels.map(sharedChannelLabel).join(', ')
}

export interface RecentDraftRow {
  id: string
  status: DraftStatus
  // Pre-formatted on the server (relativeTime uses Date.now(), which would
  // hydration-mismatch in a client component).
  createdAtLabel: string
  brief: {
    topic: string | null
    designMode: string | null
    channels: string[]
    campaign: { name: string } | null
  } | null
}

export function RecentDraftsCard({
  drafts,
  className,
}: {
  drafts: RecentDraftRow[]
  className?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const rows = expanded ? drafts : drafts.slice(0, COLLAPSED_COUNT)
  const hasMore = drafts.length > COLLAPSED_COUNT

  return (
    <GlassPanel className={className}>
      <div className="mb-4 flex items-center gap-2">
        <Sparkles size={16} className="text-primary dark:text-primary-light" />
        <h2 className="text-sm font-semibold text-light-text dark:text-dark-text">Recent Drafts</h2>
        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="ml-auto flex items-center gap-1 text-xs font-medium text-light-text-muted transition-colors hover:text-primary dark:text-dark-text-muted dark:hover:text-primary-light"
          >
            {expanded ? (
              <>
                Collapse <ChevronUp size={14} />
              </>
            ) : (
              <>
                Expand <ChevronDown size={14} />
              </>
            )}
          </button>
        )}
      </div>

      {drafts.length === 0 ? (
        <p className="py-8 text-center text-sm text-light-text-muted dark:text-dark-text-muted">
          No drafts yet.{' '}
          <Link href="/brief" className="text-primary hover:underline dark:text-primary-light">
            Create your first brief
          </Link>
          .
        </p>
      ) : (
        <div className={expanded ? 'max-h-96 overflow-y-auto overflow-x-auto' : 'overflow-x-auto'}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-xs text-light-text-muted dark:border-white/10 dark:text-dark-text-muted">
                <th className="pb-2 pr-3 font-medium">Topic</th>
                <th className="pb-2 pr-3 font-medium">Campaign</th>
                <th className="pb-2 pr-3 font-medium">Platform</th>
                <th className="pb-2 pr-3 font-medium">Path</th>
                <th className="pb-2 pr-3 font-medium">Status</th>
                <th className="pb-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(d => (
                <tr
                  key={d.id}
                  className="group border-b border-black/5 last:border-0 dark:border-white/5"
                >
                  <td className="py-2.5 pr-3">
                    <Link
                      href={`/drafts/${d.id}`}
                      className="font-medium text-light-text hover:text-primary dark:text-dark-text dark:hover:text-primary-light"
                    >
                      {d.brief?.topic ?? 'Untitled'}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-3 text-light-text-muted dark:text-dark-text-muted">
                    {d.brief?.campaign?.name ?? '—'}
                  </td>
                  <td className="py-2.5 pr-3 text-light-text-muted dark:text-dark-text-muted">
                    {channelLabel(d.brief?.channels ?? [])}
                  </td>
                  <td className="py-2.5 pr-3 text-light-text-muted dark:text-dark-text-muted">
                    {d.brief?.designMode === 'TEMPLATE' ? 'A' : 'B'}
                  </td>
                  <td className="py-2.5 pr-3">
                    <StatusChip status={DRAFT_CHIP[d.status]} />
                  </td>
                  <td className="py-2.5 text-light-text-muted dark:text-dark-text-muted">
                    {d.createdAtLabel}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassPanel>
  )
}
