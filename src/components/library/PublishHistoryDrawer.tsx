'use client'

import React, { useState } from 'react'
import { X, ExternalLink, RotateCcw } from 'lucide-react'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Button } from '@/components/ui/Button'
import { StatusChip } from '@/components/ui/StatusChip'
import { channelLabel } from '@/lib/channels'

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
  isAdmin: boolean
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

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

const PLATFORM_URLS: Record<string, (id: string) => string> = {
  INSTAGRAM: (id) => `https://www.instagram.com/p/${id}/`,
  LINKEDIN: (id) => `https://www.linkedin.com/feed/update/${id}/`,
}

export function PublishHistoryDrawer({
  draftId,
  posts,
  isAdmin,
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
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div className="relative ml-auto h-full w-full max-w-md flex flex-col glass-panel rounded-none border-l">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-light-border dark:border-dark-border">
          <h2 className="text-base font-semibold text-light-text dark:text-dark-text">
            Publish History
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X size={16} />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {posts.length === 0 ? (
            <p className="text-sm text-light-text-muted dark:text-dark-text-muted text-center py-8">
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
                <GlassPanel key={post.id} className="p-3 flex flex-col gap-2">
                  {/* Top row: channel + status */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-light-text dark:text-dark-text">
                      {channelLabel(post.channel)}
                    </span>
                    <StatusChip status={chipStatus} />
                  </div>

                  {/* Date */}
                  <p className="text-xs font-mono text-light-text-muted dark:text-dark-text-muted">
                    {displayDate ? formatDate(displayDate) : '—'}
                  </p>

                  {/* Platform link */}
                  {platformUrl && (
                    <a
                      href={platformUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary dark:text-primary-light hover:underline"
                    >
                      View on {channelLabel(post.channel)}
                      <ExternalLink size={11} />
                    </a>
                  )}

                  {/* Error reason */}
                  {isFailed && post.errorReason && (
                    <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-2 py-1">
                      {post.errorReason}
                    </p>
                  )}

                  {/* Retry button — admin only, FAILED rows */}
                  {isAdmin && isFailed && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleRetry(post.id)}
                      disabled={retrying === post.id}
                      className="self-start"
                    >
                      <RotateCcw size={12} />
                      {retrying === post.id ? 'Retrying…' : 'Retry'}
                    </Button>
                  )}
                </GlassPanel>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
