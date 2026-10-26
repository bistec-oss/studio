import React from 'react'
import { cn } from '@/lib/utils'
import { EYEBROW, PAGE_LEAD, PAGE_TITLE } from './atoms'

interface PageHeadProps {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  lead?: React.ReactNode
  actions?: React.ReactNode
  // Extra classes for the actions slot. The library passes `min-w-0` so its
  // fixed-width search can shrink at md widths; a plain button must not, or
  // it overflows its column (014 T3/T8 reviews).
  actionsClassName?: string
  className?: string
}

// A page head (DESIGN_SYSTEM.md §6, the study's .page-head): an eyebrow (021
// A7), the title (always the page's h1), a lead, and actions on the right that
// drop below the title at 375 px. No outer margin: the caller passes it in className (mb-8, or mb-10
// on /brief).
export function PageHead({
  eyebrow,
  title,
  lead,
  actions,
  actionsClassName,
  className,
}: PageHeadProps) {
  return (
    <div
      className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}
    >
      <div className="min-w-0">
        {eyebrow && <div className={EYEBROW}>{eyebrow}</div>}
        <h1 className={eyebrow ? `mt-2 ${PAGE_TITLE}` : PAGE_TITLE}>{title}</h1>
        {lead && <p className={PAGE_LEAD}>{lead}</p>}
      </div>
      {actions && (
        <div className={cn('flex flex-wrap items-center gap-2', actionsClassName)}>{actions}</div>
      )}
    </div>
  )
}

interface PageTitleProps {
  children: React.ReactNode
  className?: string
}

// The page-title h1 alone, for detail pages whose head is a breadcrumb plus a
// title (campaigns/[id], projects/[id], drafts/[id], choose-team).
export function PageTitle({ children, className }: PageTitleProps) {
  return <h1 className={cn(PAGE_TITLE, className)}>{children}</h1>
}
