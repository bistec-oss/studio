import React from 'react'
import { cn } from '@/lib/utils'
import { NOTICE } from './atoms'

export type NoticeTone = 'warning' | 'error' | 'info' | 'neutral'

// Each tone is its text colour on a 0.12 fill of the same colour (§3.2, the
// pair §3.3 checks, 021 A2). Neutral is the --surface-1 fill and --fg text,
// with a --line-subtle hairline ring, since it has no tint to carry it.
// Tailwind can't build class names from template strings, so each tone spells
// its utilities out.
const TONE: Record<NoticeTone, string> = {
  warning: 'bg-status-scheduled/12 text-status-scheduled',
  error: 'bg-status-failed/12 text-status-failed',
  info: 'bg-accent/12 text-accent',
  neutral: 'bg-surface text-fg ring-1 ring-inset ring-line-subtle',
}

interface NoticeProps extends React.HTMLAttributes<HTMLDivElement> {
  tone: NoticeTone
  icon?: React.ReactNode
  className?: string
  children: React.ReactNode
}

// A notice in a status colour (DESIGN_SYSTEM.md §3.2). It renders no role of
// its own: the caller passes role="status" or role="alert" where it wants one,
// and role, aria-* and data-* attributes pass through. With an icon, the icon
// and a flexible body sit in a row. No outer margin: the caller adds it.
export function Notice({ tone, icon, className, children, ...props }: NoticeProps) {
  return (
    <div
      className={cn(
        NOTICE,
        TONE[tone],
        icon ? 'flex items-start gap-2' : undefined,
        className,
      )}
      {...props}
    >
      {icon ? (
        <>
          {icon}
          <div className="min-w-0 flex-1">{children}</div>
        </>
      ) : (
        children
      )}
    </div>
  )
}
