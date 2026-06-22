import React from 'react'
import { cn } from '@/lib/utils'

type PostStatus = 'draft' | 'exported' | 'scheduled' | 'published' | 'failed'

interface StatusChipProps {
  status: PostStatus
  className?: string
}

const statusConfig: Record<PostStatus, { label: string; classes: string }> = {
  draft: {
    label: 'Draft',
    classes: [
      'bg-slate-100 dark:bg-slate-800/60',
      'text-slate-500 dark:text-slate-400',
      'border border-slate-200 dark:border-slate-700',
    ].join(' '),
  },
  exported: {
    label: 'Exported',
    classes: [
      'bg-violet-50 dark:bg-violet-900/20',
      'text-violet-600 dark:text-violet-400',
      'border border-violet-200 dark:border-violet-700/40',
    ].join(' '),
  },
  scheduled: {
    label: 'Scheduled',
    classes: [
      'bg-sky-50 dark:bg-sky-900/20',
      'text-sky-600 dark:text-sky-400',
      'border border-sky-200 dark:border-sky-700/40',
    ].join(' '),
  },
  published: {
    label: 'Published',
    classes: [
      'bg-emerald-50 dark:bg-emerald-900/20',
      'text-emerald-700 dark:text-emerald-400',
      'border border-emerald-200 dark:border-emerald-700/40',
    ].join(' '),
  },
  failed: {
    label: 'Failed',
    classes: [
      'bg-red-50 dark:bg-red-900/20',
      'text-red-600 dark:text-red-400',
      'border border-red-200 dark:border-red-700/40',
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
