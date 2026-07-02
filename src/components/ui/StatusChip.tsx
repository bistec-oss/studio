import React from 'react'
import { cn } from '@/lib/utils'

type PostStatus = 'draft' | 'exported' | 'scheduled' | 'published' | 'failed'

interface StatusChipProps {
  status: PostStatus
  className?: string
}

// Colors come from the status-* tokens in tailwind.config.ts (single source of
// truth): DEFAULT drives the light theme, the `dark` shade drives dark mode.
// Tailwind can't build class names from template strings, so each status spells
// its utilities out.
const statusConfig: Record<PostStatus, { label: string; classes: string }> = {
  draft: {
    label: 'Draft',
    classes: [
      'bg-status-draft/10 dark:bg-status-draft-dark/15',
      'text-status-draft dark:text-status-draft-dark',
      'border border-status-draft/25 dark:border-status-draft-dark/30',
    ].join(' '),
  },
  exported: {
    label: 'Exported',
    classes: [
      'bg-status-exported/10 dark:bg-status-exported-dark/15',
      'text-status-exported dark:text-status-exported-dark',
      'border border-status-exported/25 dark:border-status-exported-dark/30',
    ].join(' '),
  },
  scheduled: {
    label: 'Scheduled',
    classes: [
      'bg-status-scheduled/10 dark:bg-status-scheduled-dark/15',
      'text-status-scheduled dark:text-status-scheduled-dark',
      'border border-status-scheduled/25 dark:border-status-scheduled-dark/30',
    ].join(' '),
  },
  published: {
    label: 'Published',
    classes: [
      'bg-status-published/10 dark:bg-status-published-dark/15',
      'text-status-published dark:text-status-published-dark',
      'border border-status-published/25 dark:border-status-published-dark/30',
    ].join(' '),
  },
  failed: {
    label: 'Failed',
    classes: [
      'bg-status-failed/10 dark:bg-status-failed-dark/15',
      'text-status-failed dark:text-status-failed-dark',
      'border border-status-failed/25 dark:border-status-failed-dark/30',
    ].join(' '),
  },
}

export function StatusChip({ status, className }: StatusChipProps) {
  const config = statusConfig[status]

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5',
        'rounded-full text-xs font-mono font-medium',
        config.classes,
        className,
      )}
    >
      {config.label}
    </span>
  )
}
