'use client'

import Link from 'next/link'
import { ImageOff } from 'lucide-react'
import type { BackgroundSkipped } from '@/lib/drafts/backgroundNotice'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { Notice } from '@/components/ui/Notice'
import { FOCUS, ICON } from '@/components/ui/atoms'

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
// personal image generation key at /settings. A DECISION_ERROR is a failed model call,
// not a setup problem, so it gets no link.
export function BackgroundNotice({ skipped }: BackgroundNoticeProps) {
  const { isTeamAdmin } = useCurrentUser()
  const link =
    skipped.reason === 'DECISION_ERROR'
      ? null
      : isTeamAdmin
        ? { href: '/team', label: 'Open Team settings' }
        : { href: '/settings', label: 'Open Settings' }

  // Amber stays amber: the warning colour is --status-scheduled (§3.2), as a
  // notice on its own 0.12 tint (021 A2, the pair contrast.test.ts checks).
  return (
    <Notice
      tone="warning"
      role="status"
      data-testid="background-notice"
      data-reason={skipped.reason}
      icon={<ImageOff {...ICON} className="mt-0.5 flex-shrink-0" aria-hidden="true" />}
      className="mt-4"
    >
      <p className="font-semibold">No AI background</p>
      <p className="mt-1 text-ui-xs text-fg">{skipped.message}</p>
      {link && (
        <Link
          href={link.href}
          className={`mt-1.5 inline-block text-ui-xs font-semibold underline decoration-current underline-offset-4 ${FOCUS}`}
        >
          {link.label}
        </Link>
      )}
    </Notice>
  )
}
