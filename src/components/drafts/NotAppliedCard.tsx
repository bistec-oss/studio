'use client'

import { AlertTriangle, Loader2, ImageDown } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { DraftNotApplied } from '@/lib/api-types'
import { formatDateTime } from '@/lib/format'
import { Notice } from '@/components/ui/Notice'
import { ICON } from '@/components/ui/atoms'

export interface NotAppliedCardProps {
  notApplied: DraftNotApplied
  /** T19 "Use anyway" — omitted (no button rendered) when the rejected
   *  render has no preview/export to adopt (Ruling D: nothing to adopt). */
  onAdopt?: () => void
  /** True while an adopt POST is in flight — shows the spinner icon. */
  adopting?: boolean
  /** Fix round 1, Minor 3: the panel's own `busy` (adopting folded in, plus
   *  any other in-flight action) — disables the button whenever the server
   *  would 409 the click anyway, not just during this action's own POST. */
  disabled?: boolean
}

// FR-14/AC-18 hard failure: a refine that failed its fidelity check on both
// attempts. Deliberately red/`role="alert"`, never a dismissible toast and
// never attached to a revision row — no revision was committed for
// `notApplied.instruction` (FR-12), so there is nothing to attach a warning
// to. Reads differently on purpose from the amber brand-kit conflict card
// (a choice to make) and from the `pendingActionError` crash message ("the
// run crashed" vs. this — "it ran, but did not do what you asked").
//
// The image, when present, is the RETAINED REJECTED render — what the model
// actually produced, kept for diagnosis only; it was never rendered onto the
// draft. Extracted out of RefinementPanel so that panel doesn't keep growing.
//
// T19: "Use anyway" adopts this rejected render as a real, committed
// revision via `POST /api/drafts/[id]/rejected/[revisionId]/adopt` — shown
// only when there is a preview to adopt (a truncated reply left no export,
// FR-14a "nothing enters the chain without that explicit action" still
// holds — there is simply nothing offered to adopt in that case).
export function NotAppliedCard({ notApplied, onAdopt, adopting, disabled }: NotAppliedCardProps) {
  return (
    <Notice
      tone="error"
      role="alert"
      icon={<AlertTriangle {...ICON} className="mt-0.5 flex-shrink-0" aria-hidden />}
      className="mb-4 animate-fade-in"
    >
      <p className="break-words font-semibold">
        Couldn&rsquo;t apply &ldquo;{notApplied.instruction}&rdquo;
      </p>
      <p className="mt-1 text-ui-xs text-fg">{notApplied.reason}</p>

      {/* The rejected render is a post: shown as rendered, framed only by
          a hairline 3 px out, like a contact-sheet frame (§8.12). */}
      {notApplied.previewUrl && (
        <div className="mt-3 max-w-[180px] outline outline-1 outline-offset-[3px] outline-line-subtle">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={notApplied.previewUrl}
            alt="What the model produced — not applied to your design"
            className="block h-auto w-full"
          />
        </div>
      )}

      <p className="mt-2 text-ui-xs">
        Rejected {formatDateTime(notApplied.rejectedAt)} — your design was left unchanged.
      </p>

      {notApplied.previewUrl && onAdopt && (
        <div className="mt-2">
          <Button size="sm" variant="secondary" onClick={onAdopt} disabled={disabled}>
            {adopting ? <Loader2 {...ICON} className="animate-spin" /> : <ImageDown {...ICON} />}
            Use anyway
          </Button>
        </div>
      )}
    </Notice>
  )
}
