// The pure verdict for the headline in a rendered page (030 FR-07, FR-08). The
// renderer (src/lib/renderer/puppeteer.ts) collects the facts in the page;
// everything that decides is here, so the page carries no copy of the rules and
// the verdict is unit-tested without Chromium. Pure.
import type { HeadlineCheck } from './vocab'

// How far a text box may stick out of the canvas or a clipping box, in CSS px.
export const HEADLINE_TOLERANCE_PX = 1

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

// What the page reports about one innermost element whose visible text equals
// the headline.
export interface CandidateFacts {
  // checkVisibility({ opacityProperty: true, visibilityProperty: true })
  visible: boolean
  // Range.getClientRects() over the element's contents, empty rects dropped
  rects: Rect[]
  // the box of the element and of each ancestor whose overflow-x or -y is not visible
  clipBoxes: Rect[]
  // per rect centre: elementFromPoint is the element or a descendant
  topmost: boolean[]
}

export interface HeadlineFacts {
  candidates: CandidateFacts[]
}

const inside = (r: Rect, box: Rect, tol: number): boolean =>
  r.left >= box.left - tol &&
  r.top >= box.top - tol &&
  r.left + r.width <= box.left + box.width + tol &&
  r.top + r.height <= box.top + box.height + tol

function isPainted(c: CandidateFacts, canvas: Rect, tol: number): boolean {
  if (!c.visible) return false
  if (c.rects.length === 0) return false
  // The union lies inside the canvas exactly when every rect does.
  if (!c.rects.every((r) => inside(r, canvas, tol))) return false
  if (!c.clipBoxes.every((box) => c.rects.every((r) => inside(r, box, tol)))) return false
  return c.topmost.every((t) => t === true)
}

// 031 FR-40: how many candidates are painted (the same rule, so Apply's
// "the old text is still on the image" count and the headline verdict agree).
export function countPaintedCandidates(
  facts: HeadlineFacts,
  canvasSize: { width: number; height: number },
  tolerance: number = HEADLINE_TOLERANCE_PX,
): number {
  const canvas: Rect = { left: 0, top: 0, width: canvasSize.width, height: canvasSize.height }
  return facts.candidates.filter((c) => isPainted(c, canvas, tolerance)).length
}

export function evaluateHeadlineFacts(
  facts: HeadlineFacts,
  canvasSize: { width: number; height: number },
  tolerance: number = HEADLINE_TOLERANCE_PX,
): HeadlineCheck {
  if (facts.candidates.length === 0) return 'not-found'
  const canvas: Rect = { left: 0, top: 0, width: canvasSize.width, height: canvasSize.height }
  const painted = facts.candidates.filter((c) => isPainted(c, canvas, tolerance)).length
  if (painted === 1) return 'painted'
  if (painted > 1) return 'ambiguous'
  return 'not-visible'
}
