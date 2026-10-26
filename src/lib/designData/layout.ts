// The pure half of the layout observation (009 design.md section 6): is every
// measured box (text node, kit logo) inside a `text` region? Recorded, never a
// fallback. The in-page measurement lives in the renderer (T3).
import type { Rect, Region } from './composition'

export const LAYOUT_TOLERANCE_PCT = 2
const EPS = 1e-9

// `boxes` are canvas-percent rects. A box is inside when it lies fully within
// at least one `text` region expanded by the tolerance on every side. No
// boxes is ok. `outside` counts the boxes that are not inside.
export function evaluateLayout(
  boxes: ReadonlyArray<Rect>,
  regions: ReadonlyArray<Region>,
  tolerancePct: number = LAYOUT_TOLERANCE_PCT
): { ok: true } | { ok: false; outside: number } {
  const text = regions.filter((r) => r.purpose === 'text').map((r) => r.rect)
  const inside = (b: Rect) =>
    text.some(
      (t) =>
        b.x >= t.x - tolerancePct - EPS &&
        b.y >= t.y - tolerancePct - EPS &&
        b.x + b.w <= t.x + t.w + tolerancePct + EPS &&
        b.y + b.h <= t.y + t.h + tolerancePct + EPS
    )
  const outside = boxes.filter((b) => !inside(b)).length
  return outside === 0 ? { ok: true } : { ok: false, outside }
}
