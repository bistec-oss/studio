'use client'

import { LayoutTemplate } from 'lucide-react'
import type { CompositionNotice as CompositionNoticeData } from '@/lib/drafts/compositionNotice'
import { Notice } from '@/components/ui/Notice'
import { ICON } from '@/components/ui/atoms'

export interface CompositionNoticeProps {
  notice: CompositionNoticeData
}

// 009 FR-15: the image style asked for was not (fully) applied. Amber and
// `role="status"`, like BackgroundNotice: a heads-up about a working post,
// never a blocker. The message is the pure function's fixed per-reason line.
export function CompositionNotice({ notice }: CompositionNoticeProps) {
  return (
    <Notice
      tone="warning"
      role="status"
      data-testid="composition-notice"
      data-reason={notice.reason}
      icon={<LayoutTemplate {...ICON} className="mt-0.5 flex-shrink-0" aria-hidden="true" />}
      className="mt-4"
    >
      <p className="font-semibold">Image style</p>
      <p className="mt-1 text-ui-xs text-fg">{notice.message}</p>
    </Notice>
  )
}
