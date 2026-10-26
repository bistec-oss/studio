// Pure rules for caption actions (012 FR-11, FR-19, design §5): which panels a
// draft's in-flight caption work covers, and what a finished or failed write
// leaves in a row. The store issues the queries; this module decides.
//
// Client-safe: imports the registry and types only.

import type { Channel } from '@prisma/client'
import type { CaptionTarget } from '@/lib/channels'
import type { FieldResult } from '@/lib/captions/extract'

export type CaptionRowStatus = 'PENDING' | 'READY' | 'FAILED'

export interface CaptionActionDraft {
  status: string
  pendingAction: string | null
  headline: string | null
  captions: ReadonlyArray<{ channel: Channel; status: CaptionRowStatus }>
}

// The panels a draft is busy writing, for the skeletons. Caption actions share
// the draft-level REGENERATE_COPY claim (A2) and mark the rows they write
// PENDING, so the rows say which channels are busy. A headline-only action
// marks no row: REGENERATE_COPY with nothing PENDING is the headline. A
// generation (IN_PROGRESS) writes the PENDING rows and, while it has none yet,
// the headline.
export function captionActionTargets(draft: CaptionActionDraft): CaptionTarget[] {
  const pending = draft.captions.filter((c) => c.status === 'PENDING').map((c) => c.channel)
  if (draft.pendingAction === 'REGENERATE_COPY') {
    return pending.length > 0 ? pending : ['HEADLINE']
  }
  if (draft.status === 'IN_PROGRESS') {
    return draft.headline === null && pending.length > 0 ? ['HEADLINE', ...pending] : pending
  }
  return []
}

export interface CaptionRowSettle {
  status: 'READY' | 'FAILED'
  text: string
  failureReason: string | null
  /**
   * 008 FR-08: the model that wrote the new text — set only by a successful
   * write given its stamp. A failed write leaves the row's stamp as it was.
   */
  model?: string
  modelSubstitutedFrom?: string | null
  /** 024 FR-04: the credential route that wrote the new text, beside `model`. */
  route?: string | null
}

// The model that wrote a caption reply (008 FR-08): the arg that crossed the
// boundary (or a non-Claude provider's own ID), and the refused value the
// resolver substituted away from, or null. writeCaptions produces it.
//
// 024 FR-04: `route` is the credential route that ran it (CLI | API_KEY |
// SERVER_KEY | OTHER), null when unknown; written beside `model`, same rules.
export interface CaptionStamp {
  model: string
  substitutedFrom: string | null
  route: string | null
}

// What a caption write leaves in a row (design §5's table). A failure never
// destroys good text (A7): a row that still has text stays READY with the
// reason noted, and only a row with no usable text becomes FAILED, with no text
// (the CHECK `FAILED ⇒ text = ''`). Failed model output is never stored.
//
// 008 FR-08: a successful write given the reply's stamp records it as the
// row's model. A failure writes no stamp field at all, so the row keeps the
// stamp of the text it keeps (A7) — and the stale sweep and an unstarted run's
// settle, which pass no stamp, never touch one.
export function settleCaptionRow(
  row: { text: string },
  field: FieldResult,
  stamp?: CaptionStamp | null,
): CaptionRowSettle {
  if (field.ok) {
    return {
      status: 'READY',
      text: field.text,
      failureReason: null,
      ...(stamp
        ? { model: stamp.model, modelSubstitutedFrom: stamp.substitutedFrom, route: stamp.route }
        : {}),
    }
  }
  if (row.text.trim() !== '') {
    return { status: 'READY', text: row.text, failureReason: `Regenerate failed: ${field.reason}` }
  }
  return { status: 'FAILED', text: '', failureReason: field.reason }
}

// Every target failed with one reason: a thrown provider error, or an
// interrupted run swept stale.
export function failedCaptionFields(
  targets: readonly CaptionTarget[],
  reason: string,
): Partial<Record<CaptionTarget, FieldResult>> {
  return Object.fromEntries(targets.map((t) => [t, { ok: false, reason }]))
}
