'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { StatusChip } from '@/components/ui/StatusChip'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { Button } from '@/components/ui/Button'
import { Panel } from '@/components/ui/Panel'
import { SectionHead } from '@/components/ui/SectionHead'
import {
  FOCUS,
  ICON_SM,
  PILL_BADGE,
  SCROLL_FOCUS,
  TABLE_HEAD_ROW,
  TEXT_LINK,
} from '@/components/ui/atoms'
import { apiFetch } from '@/lib/apiFetch'
import type { DraftStatus } from '@prisma/client'
import { channelLabel as sharedChannelLabel } from '@/lib/channels'

// ─── Recent Drafts card (dashboard) ─────────────────────────────────────────
// Collapsed it shows the first COLLAPSED_COUNT rows; Expand grows the same
// block in place and scrolls the full server-provided list internally — no
// overlay, no extra fetch. A bezel card holding a ruled table (021 design.md
// §8, the study's .ct).

const COLLAPSED_COUNT = 8

// The visible focus (DESIGN_SYSTEM.md §9), on a rounded-ui-sm box: the links
// and buttons in this card draw their outline with the corner.
const FOCUS_ROUNDED = `${FOCUS} rounded-ui-sm`
// A row's title link: --fg, underlined on hover (--accent is ink in Graphite,
// so a colour change would not show).
const TOPIC_LINK =
  'font-medium text-fg decoration-line underline-offset-4 hover:underline'
// A header cell; the sentence-case style is on the row (TABLE_HEAD_ROW).
const HEAD_CELL = 'py-2'

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

// An unfinished (autosaved) brief-wizard session — rendered as a leading row
// with Resume/Discard instead of a draft link.
export interface UnfinishedBriefRow {
  id: string
  topic: string
  updatedAtLabel: string
}

export function RecentDraftsCard({
  drafts,
  unfinished = [],
  className,
}: {
  drafts: RecentDraftRow[]
  unfinished?: UnfinishedBriefRow[]
  className?: string
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const [expanded, setExpanded] = useState(false)
  const [discarding, setDiscarding] = useState<string | null>(null)

  // Unfinished rows lead (most recent working state first) and share the
  // collapsed-row budget with generated drafts.
  const draftBudget = expanded ? drafts.length : Math.max(0, COLLAPSED_COUNT - unfinished.length)
  const unfinishedRows = expanded ? unfinished : unfinished.slice(0, COLLAPSED_COUNT)
  const rows = drafts.slice(0, draftBudget)
  const hasMore = drafts.length + unfinished.length > COLLAPSED_COUNT

  async function discardUnfinished(row: UnfinishedBriefRow) {
    const ok = await confirm({
      title: 'Discard this unfinished post?',
      description: `"${row.topic || 'Untitled post'}" and its uploaded images will be deleted.`,
      confirmLabel: 'Discard',
    })
    if (!ok) return
    setDiscarding(row.id)
    try {
      await apiFetch(`/api/brief-drafts/${row.id}`, { method: 'DELETE' })
      router.refresh()
    } catch {
      /* already gone — refresh reflects reality either way */
      router.refresh()
    } finally {
      setDiscarding(null)
    }
  }

  return (
    <Panel bezel className={`p-5 ${className ?? ''}`}>
      {/* The card head (the study's .card-hd), with Expand in its tail */}
      <SectionHead title="Recent Drafts" className="mb-3">
        {hasMore && (
          <Button variant="ghost" size="sm" onClick={() => setExpanded(v => !v)}>
            {expanded ? (
              <>
                Collapse <ChevronUp {...ICON_SM} aria-hidden />
              </>
            ) : (
              <>
                Expand <ChevronDown {...ICON_SM} aria-hidden />
              </>
            )}
          </Button>
        )}
      </SectionHead>

      {drafts.length === 0 && unfinished.length === 0 ? (
        <p className="py-8 text-center text-ui-sm text-fg-muted">
          No drafts yet.{' '}
          <Link href="/brief" className={`${TEXT_LINK} ${FOCUS_ROUNDED}`}>
            Create your first post
          </Link>
          .
        </p>
      ) : (
        // A wide table scrolls inside its own container; the page never does.
        // The container is a focusable, labelled region so keyboard users can
        // scroll it (WCAG 2.1.1); its focus ring is inset so overflow can't clip it.
        <div
          tabIndex={0}
          role="region"
          aria-label="Recent drafts"
          className={`rounded-ui-sm ${SCROLL_FOCUS} ${expanded ? 'max-h-96 overflow-y-auto overflow-x-auto' : 'overflow-x-auto'}`}
        >
          {/* A data table (§8.15, the study's .ct): ruled rows, a sentence-case header row */}
          <table className="w-full min-w-[600px] text-ui-sm">
            <thead>
              <tr className={TABLE_HEAD_ROW}>
                <th scope="col" className={`${HEAD_CELL} pr-3`}>Topic</th>
                <th scope="col" className={`${HEAD_CELL} pr-3`}>Campaign</th>
                <th scope="col" className={`${HEAD_CELL} pr-3`}>Channels</th>
                <th scope="col" className={`${HEAD_CELL} pr-3`}>Design mode</th>
                <th scope="col" className={`${HEAD_CELL} pr-3`}>Status</th>
                <th scope="col" className={HEAD_CELL}>Created</th>
              </tr>
            </thead>
            <tbody>
              {unfinishedRows.map(u => (
                <tr key={`unfinished-${u.id}`} className="group border-b border-line-subtle last:border-b-0">
                  <td className="py-2.5 pr-3">
                    <Link href={`/brief?resume=${u.id}`} className={`${TOPIC_LINK} ${FOCUS_ROUNDED}`}>
                      {u.topic || 'Untitled post'}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-3 text-fg-muted">—</td>
                  <td className="py-2.5 pr-3 text-fg-muted">—</td>
                  <td className="py-2.5 pr-3 text-fg-muted">—</td>
                  <td className="py-2.5 pr-3">
                    <span className={PILL_BADGE}>Unfinished</span>
                  </td>
                  <td className="whitespace-nowrap py-2.5 text-ui-xs text-fg-muted">
                    <span className="inline-flex items-center gap-3">
                      {u.updatedAtLabel}
                      <Link href={`/brief?resume=${u.id}`} className={`text-ui-xs font-semibold ${TEXT_LINK} ${FOCUS_ROUNDED}`}>
                        Resume
                      </Link>
                      <button
                        type="button"
                        aria-label="Discard unfinished post"
                        disabled={discarding === u.id}
                        onClick={() => void discardUnfinished(u)}
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-ui-pill text-fg-muted transition-colors duration-fast ease-standard hover:bg-surface-raised hover:text-status-failed disabled:opacity-50 ${FOCUS}`}
                      >
                        <Trash2 {...ICON_SM} aria-hidden />
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
              {rows.map(d => (
                <tr key={d.id} className="group border-b border-line-subtle last:border-b-0">
                  <td className="py-2.5 pr-3">
                    <Link href={`/drafts/${d.id}`} className={`${TOPIC_LINK} ${FOCUS_ROUNDED}`}>
                      {d.brief?.topic ?? 'Untitled'}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-3 text-fg-muted">{d.brief?.campaign?.name ?? '—'}</td>
                  <td className="py-2.5 pr-3 text-fg-muted">{channelLabel(d.brief?.channels ?? [])}</td>
                  <td className="py-2.5 pr-3 text-fg-muted">
                    {d.brief?.designMode === 'TEMPLATE' ? 'Template' : 'Freeform'}
                  </td>
                  <td className="py-2.5 pr-3">
                    <StatusChip status={DRAFT_CHIP[d.status]} />
                  </td>
                  <td className="whitespace-nowrap py-2.5 text-ui-xs text-fg-muted">{d.createdAtLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}
