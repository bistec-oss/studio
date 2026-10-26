// 025 FR-13 and FR-14: what the renderer needs to place the author's
// screenshot, and the one error a failed placement throws. Pure and free of
// I/O so the renderer, the agents and the tests can all import it.
import type { CompositeRectPx } from '@/lib/designData/composite'

export type { CompositeRectPx }

// The token is the only reference to the screenshot that is ever stored.
export const COMPOSITE_TOKEN = '__COMPOSITE_0__'

export interface CompositeRender {
  // The placeholder in the stored HTML.
  token: string
  // The screenshot's bytes as a data: URI, built once for this render call.
  dataUri: string
  // Where the screen is, in canvas px (the stamped or detected rect, never the
  // contract region: Amendment A1).
  rectPx: CompositeRectPx
}

export type CompositeRenderReason = 'composite-not-rendered' | 'composite-source-missing'

export class CompositeRenderError extends Error {
  readonly reason: CompositeRenderReason
  // Every export that earlier, passing renders of the same run uploaded, so the
  // caller that falls back can delete them all (set by the API design loop).
  uploadedKeys?: string[]
  constructor(reason: CompositeRenderReason, detail?: string) {
    super(detail ? `${reason}: ${detail}` : reason)
    this.name = 'CompositeRenderError'
    this.reason = reason
  }
}

// 025 FR-16: the one error text a refine, override, inline edit, restore or
// export shows when the screenshot could not be placed. Nothing was written.
export const COMPOSITE_PLACEMENT_ERROR = 'The product screenshot could not be placed; nothing was changed'

export class CompositePlacementError extends Error {
  // The render failure that caused it (a CompositeRenderError).
  readonly detail: string
  constructor(cause?: unknown) {
    super(COMPOSITE_PLACEMENT_ERROR)
    this.name = 'CompositePlacementError'
    this.detail = cause instanceof Error ? cause.message : cause ? String(cause) : ''
  }
}
