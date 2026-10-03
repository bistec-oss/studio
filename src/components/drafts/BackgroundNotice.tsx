'use client'

import Link from 'next/link'
import { ImageOff } from 'lucide-react'
import type { BackgroundSkipped } from '@/lib/drafts/backgroundNotice'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'

export interface BackgroundNoticeProps {
  skipped: BackgroundSkipped
}

// 005 FR-07: the current design has no AI background, and that was not the
// model's choice. Amber and `role="status"`: a heads-up about a working post,
// never a blocker — the draft is complete and publishable as it is. The
// message is the poll's fixed per-reason sentence (drafts/backgroundNotice.ts).
//
// The fix-it link follows who can fix it: a team admin (or super admin) can
// add or repair the team's image provider at /team; anyone else can add a
// personal OpenAI key at /settings. A DECISION_ERROR is a failed model call,
// not a setup problem, so it gets no link.
export function BackgroundNotice({ skipped }: BackgroundNoticeProps) {
  const { isTeamAdmin } = useCurrentUser()
  const link =
    skipped.reason === 'DECISION_ERROR'
      ? null
      : isTeamAdmin
        ? { href: '/team', label: 'Open Team settings' }
        : { href: '/settings', label: 'Open Settings' }

  return (
    <div
      role="status"
      data-testid="background-notice"
      data-reason={skipped.reason}
      className="mt-3 rounded-xl border border-amber-300 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/20 p-3"
    >
      <div className="flex items-start gap-2">
        <ImageOff size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">No AI background</p>
          <p className="text-xs text-amber-700 dark:text-amber-400/90 mt-1">{skipped.message}</p>
          {link && (
            <Link
              href={link.href}
              className="inline-block mt-1.5 text-xs font-medium text-amber-800 dark:text-amber-300 underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-200"
            >
              {link.label}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
