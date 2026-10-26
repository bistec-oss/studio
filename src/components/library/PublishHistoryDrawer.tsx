'use client'

import React, { useState } from 'react'
import { ExternalLink, RotateCcw } from 'lucide-react'
import { Drawer } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { StatusChip } from '@/components/ui/StatusChip'
import { channelLabel } from '@/lib/channels'
import { formatDateTime } from '@/lib/format'
import { FOCUS, ICON_SM, TEXT_LINK } from '@/components/ui/atoms'

interface PostHistory {
  id: string
  channel: string
  status: string
  scheduledAt: string | null
  publishedAt: string | null
  platformId: string | null
  errorReason: string | null
}

interface PublishHistoryDrawerProps {
  draftId: string | null
  posts: PostHistory[]
  isTeamAdmin: boolean
  onClose: () => void
  onRetry: (postId: string) => Promise<void>
}

type ChipStatus = 'draft' | 'exported' | 'scheduled' | 'published' | 'failed'

function toChipStatus(status: string): ChipStatus {
  const s = status.toLowerCase()
  if (s === 'published') return 'published'
  if (s === 'scheduled' || s === 'pending') return 'scheduled'
  if (s === 'failed') return 'failed'
  if (s === 'exported') return 'exported'
  return 'draft'
}

const PLATFORM_URLS: Record<string, (id: string) => string> = {
  INSTAGRAM: (id) => `https://www.instagram.com/p/${id}/`,
  LINKEDIN: (id) => `https://www.linkedin.com/feed/update/${id}/`,
}

export function PublishHistoryDrawer({
  draftId,
  posts,
  isTeamAdmin,
  onClose,
  onRetry,
}: PublishHistoryDrawerProps) {
  const [retrying, setRetrying] = useState<string | null>(null)

  if (draftId === null) return null

  async function handleRetry(postId: string) {
    setRetrying(postId)
    try {
      await onRetry(postId)
    } finally {
      setRetrying(null)
    }
  }

  return (
    <Drawer open onClose={onClose} title="Publish History">
        {/* Body: ruled rows on --line-subtle, not boxes (DESIGN_SYSTEM.md §6),
            inside the Drawer's overlay surface */}
        <div className="px-5 py-2 divide-y divide-line-subtle">
          {posts.length === 0 ? (
            <p className="text-ui-sm text-fg-muted text-center py-8">
              No publish history yet.
            </p>
          ) : (
            posts.map((post) => {
              const chipStatus = toChipStatus(post.status)
              const isFailed = post.status.toUpperCase() === 'FAILED'
              const displayDate = post.publishedAt ?? post.scheduledAt
              const normalizedChannel = post.channel.toUpperCase()
              const platformUrl =
                post.platformId && PLATFORM_URLS[normalizedChannel]
                  ? PLATFORM_URLS[normalizedChannel](post.platformId)
                  : null

              return (
                <div key={post.id} className="py-4 flex flex-col gap-2">
                  {/* Top row: channel + status */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ui-sm font-semibold text-fg">
                      {channelLabel(post.channel)}
                    </span>
                    <StatusChip status={chipStatus} />
                  </div>

                  {/* Date */}
                  <p className="text-ui-xs tabular-nums text-fg-muted">
                    {formatDateTime(displayDate)}
                  </p>

                  {/* Platform link */}
                  {platformUrl && (
                    <a
                      href={platformUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`self-start inline-flex items-center gap-1 rounded-ui-sm text-ui-xs ${TEXT_LINK} ${FOCUS}`}
                    >
                      View on {channelLabel(post.channel)}
                      <ExternalLink {...ICON_SM} aria-hidden />
                    </a>
                  )}

                  {/* Error reason, on the failed tint the chips use (0.12, 021 A2) */}
                  {isFailed && post.errorReason && (
                    <p className="text-ui-xs text-status-failed bg-status-failed/12 rounded-ui-sm px-2.5 py-1.5">
                      {post.errorReason}
                    </p>
                  )}

                  {/* Retry button — admin only, FAILED rows */}
                  {isTeamAdmin && isFailed && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleRetry(post.id)}
                      disabled={retrying === post.id}
                      className="self-start"
                    >
                      <RotateCcw {...ICON_SM} aria-hidden />
                      {retrying === post.id ? 'Retrying…' : 'Retry'}
                    </Button>
                  )}
                </div>
              )
            })
          )}
        </div>
    </Drawer>
  )
}
