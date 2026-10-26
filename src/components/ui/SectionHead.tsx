import React from 'react'
import { cn } from '@/lib/utils'
import { SECTION_HEAD, SUB_HEAD } from './atoms'

interface SectionHeadProps {
  title: React.ReactNode
  level?: 2 | 3
  /**
   * The card-head style (16 px / 600) whatever the level: an h3 that heads its
   * own bezel card (the brand kit's sections, under the kit's h2) keeps its
   * level and takes the card head's size.
   */
  card?: boolean
  id?: string
  className?: string
  children?: React.ReactNode
}

// A section head (DESIGN_SYSTEM.md §8.14, the study's .card-hd): the heading
// (an h2 in the card-head style, or with level={3} an h3 in the sub-head style,
// unless `card` asks for the card-head style), and on the right the tail (a
// status, a count, small buttons). `id` goes on the heading, for
// aria-labelledby. The row wraps at 375 px; the tail keeps right. No outer
// margin: the caller passes it (usually mb-3).
export function SectionHead({
  title,
  level = 2,
  card = false,
  id,
  className,
  children,
}: SectionHeadProps) {
  const Heading = level === 3 ? 'h3' : 'h2'
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-x-3 gap-y-2', className)}>
      <Heading id={id} className={level === 3 && !card ? SUB_HEAD : SECTION_HEAD}>
        {title}
      </Heading>
      {children && (
        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3.5 gap-y-1 text-ui-xs">
          {children}
        </div>
      )}
    </div>
  )
}
