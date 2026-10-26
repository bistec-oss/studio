'use client'

import { ShieldAlert } from 'lucide-react'
import { factsNoticeFor, FLAGGED_ADVICE } from '@/lib/drafts/factsCheckNotice'
import type { FactsCheck } from '@/lib/factsCheck/types'
import { Notice } from '@/components/ui/Notice'
import { ICON } from '@/components/ui/atoms'

export interface FactsCheckNoticeProps {
  check: FactsCheck | null | undefined
}

// 027 FR-13: values the post states that its brief and campaign do not. Amber
// and `role="status"`, like CompositionNotice: a heads-up about a working
// post, never a blocker (Publish stays enabled). Renders nothing for a clear
// check or one that was never run.
export function FactsCheckNotice({ check }: FactsCheckNoticeProps) {
  const notice = factsNoticeFor(check)
  if (!notice) return null
  return (
    <Notice
      tone="warning"
      role="status"
      data-testid="facts-check-notice"
      data-status={notice.status}
      icon={<ShieldAlert {...ICON} className="mt-0.5 flex-shrink-0" aria-hidden="true" />}
      className="mt-4"
    >
      <p className="font-semibold">Facts check</p>
      {notice.status === 'flagged' ? (
        <p className="mt-1 text-ui-xs text-fg">
          {notice.items.map((item, i) => (
            <span key={`${item.value}-${item.where}-${i}`}>
              {i > 0 && ', '}
              <code className="font-mono break-all">{item.value}</code> ({item.where})
            </span>
          ))}
          . {FLAGGED_ADVICE}
        </p>
      ) : (
        <p className="mt-1 text-ui-xs text-fg">{notice.message}</p>
      )}
    </Notice>
  )
}
