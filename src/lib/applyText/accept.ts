// The in-render verdict for Apply to image (031 FR-40, design 8.2). Pure: it
// reads what the render found and names the failure, or accepts. It fails
// closed: a check that did not run (absentPainted null) never accepts.
import type { HeadlineCheck } from '@/lib/renderedText/vocab'
import type { ApplyFailure } from './vocab'

export interface ApplyRenderFacts {
  headlineCheck: HeadlineCheck | null
  /** Painted candidates across the old texts; null when the check threw or timed out. */
  absentPainted: number | null
}

export function acceptApplyRender(r: ApplyRenderFacts): ApplyFailure | null {
  if (r.headlineCheck !== 'painted') return 'not-painted'
  if (r.absentPainted === null) return 'render-failed'
  if (r.absentPainted > 0) return 'old-still-painted'
  return null
}
