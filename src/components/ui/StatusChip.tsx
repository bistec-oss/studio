import React from 'react'
import { cn } from '@/lib/utils'

type PostStatus =
  | 'draft'
  | 'exported'
  | 'scheduled'
  | 'published'
  | 'failed'
  // Scheduled-generation queue states (reuse the existing status-* tokens):
  | 'queued'
  | 'generating'
  | 'generated'
  | 'cancelled'

// The tones a free-text chip can take, for states with no `status` entry
// (Connected, Invalid, Active, Deactivated, Revoked): each reuses a status's
// colours.
type StatusChipTone = 'published' | 'draft' | 'scheduled' | 'failed' | 'exported'

// Either a known `status` (its label comes from statusConfig), or a `tone` with
// the label as children. The label is always visible text either way.
type StatusChipStatusProps = {
  status: PostStatus
  tone?: never
  children?: never
  className?: string
}
type StatusChipToneProps = {
  tone: StatusChipTone
  children: React.ReactNode
  status?: never
  className?: string
}
type StatusChipProps = StatusChipStatusProps | StatusChipToneProps

// The status chip (DESIGN_SYSTEM.md §8.5, the study's .chip): a sentence-case
// pill with a 6 px dot in currentColor, the text in the status colour on a
// fill of the same colour at 0.12 (in both themes — the --status-* vars
// switch, and tests/unit/contrast.test.ts measures the text at 0.12, 021 A2).
// The label is always present: status is never colour alone.
// Tailwind can't build class names from template strings, so each status
// spells its utilities out.
const statusConfig: Record<PostStatus, { label: string; classes: string }> = {
  draft: { label: 'Draft', classes: 'bg-status-draft/12 text-status-draft' },
  exported: { label: 'Exported', classes: 'bg-status-exported/12 text-status-exported' },
  scheduled: { label: 'Scheduled', classes: 'bg-status-scheduled/12 text-status-scheduled' },
  published: { label: 'Published', classes: 'bg-status-published/12 text-status-published' },
  failed: { label: 'Failed', classes: 'bg-status-failed/12 text-status-failed' },
  queued: { label: 'Queued', classes: 'bg-status-scheduled/12 text-status-scheduled' },
  generating: { label: 'Generating', classes: 'bg-status-exported/12 text-status-exported' },
  generated: { label: 'Generated', classes: 'bg-status-published/12 text-status-published' },
  cancelled: { label: 'Cancelled', classes: 'bg-status-draft/12 text-status-draft' },
}

// Two overloads rather than one union parameter, with the `status` one last:
// React.ComponentProps reads the last signature, so
// ComponentProps<typeof StatusChip>['status'] stays PostStatus (not
// PostStatus | undefined) for callers that type a status map with it.
export function StatusChip(props: StatusChipToneProps): React.JSX.Element
export function StatusChip(props: StatusChipStatusProps): React.JSX.Element
export function StatusChip(props: StatusChipProps) {
  const config = props.status !== undefined ? statusConfig[props.status] : statusConfig[props.tone]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 h-6 pl-2 pr-2.5 rounded-ui-pill text-ui-xs font-semibold whitespace-nowrap flex-shrink-0',
        // The dot, decorative: a ::before in currentColor.
        "before:content-[''] before:h-1.5 before:w-1.5 before:flex-shrink-0 before:rounded-full before:bg-current",
        config.classes,
        props.className,
      )}
    >
      {props.status !== undefined ? config.label : props.children}
    </span>
  )
}
