'use client'

import React from 'react'
import Link from 'next/link'
import { ImageIcon } from 'lucide-react'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Button } from '@/components/ui/Button'
import { StatusChip } from '@/components/ui/StatusChip'
import type { AspectRatio } from '@prisma/client'
import { aspectClassFor } from '@/lib/aspectRatio'

interface PostSummary {
  id: string
  channel: string
  status: string
  scheduledAt: string | null
  publishedAt: string | null
}

interface PostCardDraft {
  id: string
  exportUrl: string | null
  copyText: string
  status: string
  createdAt: string
  brief: { topic: string; channels: string[]; aspectRatio?: AspectRatio }
  posts: PostSummary[]
  brandKitName: string | null
}

interface PostCardProps {
  draft: PostCardDraft
  isAdmin: boolean
  onPublish: (draftId: string, exportUrl: string) => void
  onViewHistory: (draftId: string, posts: PostSummary[]) => void
}

type ChipStatus = 'draft' | 'exported' | 'scheduled' | 'published' | 'failed'

function deriveStatus(draft: PostCardDraft): ChipStatus {
  if (draft.posts.length === 0) {
    return draft.status === 'EXPORTED' ? 'exported' : 'draft'
  }
  // Most recent post is first (ordered desc)
  const latest = draft.posts[0]
  const s = latest.status.toLowerCase()
  if (s === 'published') return 'published'
  if (s === 'scheduled' || s === 'pending') return 'scheduled'
  if (s === 'failed') return 'failed'
  return 'draft'
}

const CHANNEL_LABELS: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  LINKEDIN: 'LinkedIn',
}

export function PostCard({ draft, isAdmin, onPublish, onViewHistory }: PostCardProps) {
  const chipStatus = deriveStatus(draft)

  return (
    <GlassPanel className="flex flex-col overflow-hidden">
      {/* Image area — matches the post's aspect ratio */}
      <Link
        href={`/drafts/${draft.id}`}
        className={`relative ${aspectClassFor(draft.brief.aspectRatio)} w-full bg-light-border/30 dark:bg-dark-border/30 overflow-hidden block group`}
      >
        {draft.exportUrl ? (
          <img
            src={draft.exportUrl}
            alt={draft.brief.topic}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon
              size={36}
              className="text-light-text-muted dark:text-dark-text-muted opacity-40"
            />
          </div>
        )}
      </Link>

      {/* Content */}
      <div className="flex flex-col gap-2 p-3">
        {/* Topic */}
        <p
          className="text-sm font-semibold text-light-text dark:text-dark-text line-clamp-2 leading-snug"
          title={draft.brief.topic}
        >
          {draft.brief.topic}
        </p>

        {/* Channel pills */}
        <div className="flex flex-wrap gap-1">
          {draft.brief.channels.map((ch) => (
            <span
              key={ch}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                bg-primary/10 dark:bg-primary-light/10
                text-primary dark:text-primary-light
                border border-primary/20 dark:border-primary-light/20"
            >
              {CHANNEL_LABELS[ch] ?? ch}
            </span>
          ))}
        </div>

        {/* Brand kit + status row */}
        <div className="flex items-center justify-between gap-2">
          {draft.brandKitName ? (
            <span className="text-xs font-mono text-light-text-muted dark:text-dark-text-muted truncate max-w-[120px]">
              {draft.brandKitName}
            </span>
          ) : (
            <span />
          )}
          <StatusChip status={chipStatus} />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {isAdmin && (
            <Button
              variant="primary"
              size="sm"
              className="flex-1"
              onClick={() => onPublish(draft.id, draft.exportUrl ?? '')}
              disabled={!draft.exportUrl}
            >
              Publish
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            className={isAdmin ? '' : 'flex-1'}
            onClick={() => onViewHistory(draft.id, draft.posts)}
          >
            History
          </Button>
        </div>
      </div>
    </GlassPanel>
  )
}
