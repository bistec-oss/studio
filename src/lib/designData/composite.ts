// The pure verdict for a rendered composite element (025 FR-14). The renderer
// (src/lib/renderer/puppeteer.ts) collects the facts in the page; everything
// that decides is here, so the page carries no copy of the rules. Pure.
//
// 025 Amendment A1 adds the screen detector: code finds the blank screen the
// image model drew, and the screenshot goes where the screen is.
import { BLANK_STDDEV_MAX } from './evaluate'
import type { Rect, Region } from './composition'

// How far the element's box may sit from the contract rect, per edge, in CSS px.
export const COMPOSITE_TOLERANCE_PX = 2

export interface CompositeRectPx {
  left: number
  top: number
  width: number
  height: number
}

// What the page reports about the composite element. `hits` has five entries:
// the centre and four points inset 10% from the corners; each is true when
// elementFromPoint there is the element or one of its children.
export interface CompositeFacts {
  found: boolean
  complete: boolean
  naturalWidth: number
  box: CompositeRectPx
  hits: readonly boolean[]
}

export type CompositeVerdict = { ok: true } | { ok: false; detail: string }

export function evaluateCompositeFacts(
  facts: CompositeFacts,
  rectPx: CompositeRectPx,
  tolerance: number = COMPOSITE_TOLERANCE_PX,
): CompositeVerdict {
  if (!facts.found) return { ok: false, detail: 'the composite element is not in the page' }
  if (!facts.complete) return { ok: false, detail: 'the screenshot image did not finish loading' }
  if (!(facts.naturalWidth > 0)) return { ok: false, detail: 'the screenshot image has no pixels' }
  const edge = (r: CompositeRectPx) => ({
    left: r.left,
    top: r.top,
    right: r.left + r.width,
    bottom: r.top + r.height,
  })
  const got = edge(facts.box)
  const want = edge(rectPx)
  for (const e of ['left', 'top', 'right', 'bottom'] as const) {
    if (!(Math.abs(got[e] - want[e]) <= tolerance)) {
      return { ok: false, detail: `the composite ${e} edge is at ${got[e]} px, expected ${want[e]} px` }
    }
  }
  if (facts.hits.length !== 5) return { ok: false, detail: 'the topmost check needs five points' }
  const missed = facts.hits.findIndex((h) => h !== true)
  if (missed !== -1) return { ok: false, detail: `something covers the composite element at point ${missed}` }
  return { ok: true }
}

// ── Screen detection (025 Amendment A1) ──────────────────────────────────────
// The image model draws a blank screen near the contract rect but never exactly
// on it, so code finds the screen in the image and the screenshot goes where the
// screen is. Everything below is pure: the sampler hands over a luminance grid,
// and the verdict is made here.

// How far the search window extends past the region, per side, in percent of
// the canvas dimension.
export const DETECT_MARGIN_PCT = 12
// A sample is "not screen" when its L*/100 is further than this from the screen level.
export const SCREEN_EDGE_DELTA = 0.1
// The detected screen must cover at least this share of the region's area.
export const MIN_SCREEN_AREA_RATIO = 0.6
// Every screen rect is 16:10 in canvas pixels, within 5%.
export const SCREEN_ASPECT = 1.6
export const SCREEN_ASPECT_TOLERANCE = 0.05
// The seed patch (centre of the region), in percent of the canvas per axis.
export const SEED_PATCH_PCT = 5
// The five scan lines per axis, as fractions of the region's size from the centre.
export const SCAN_OFFSETS: readonly number[] = [-0.3, -0.15, 0, 0.15, 0.3]
// The interior check is inset by this share of the detected size, per side.
export const INTERIOR_INSET = 0.03
// The grid's step in canvas px (the sampler takes one point per 2 canvas px).
export const GRID_STEP_PX = 2

export interface CanvasPx {
  width: number
  height: number
}

// Values are CIE L*/100, row-major. Sample (col, row) is the canvas point
// (x0 + col * step, y0 + row * step), in canvas px: x0 and y0 are the position
// of the first sample point itself.
export interface LuminanceGrid {
  cols: number
  rows: number
  x0: number
  y0: number
  step: number
  values: ArrayLike<number>
}

export type DetectDetail =
  | 'seed-not-blank'
  | 'edge-at-window'
  | 'aspect'
  | 'too-small'
  | 'text-overlap'
  | 'interior-not-blank'
export type ScreenDetection = { ok: true; rect: Rect } | { ok: false; detail: DetectDetail }

const clampPct = (v: number) => Math.min(100, Math.max(0, v))

// The search window in canvas percent: the region widened by DETECT_MARGIN_PCT
// on each side, clipped to the canvas.
export function detectionWindow(region: Region, _canvas?: CanvasPx): Rect {
  const x0 = clampPct(region.rect.x - DETECT_MARGIN_PCT)
  const y0 = clampPct(region.rect.y - DETECT_MARGIN_PCT)
  const x1 = clampPct(region.rect.x + region.rect.w + DETECT_MARGIN_PCT)
  const y1 = clampPct(region.rect.y + region.rect.h + DETECT_MARGIN_PCT)
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

// Population standard deviation; NaN when there is nothing to measure.
function stdDevOf(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length)
}
function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
// Fails closed: NaN is not blank.
const isBlank = (values: readonly number[]) => values.length > 0 && stdDevOf(values) <= BLANK_STDDEV_MAX

// Whether a canvas-percent rect's aspect, in canvas px, is 16:10 within the tolerance.
export function isScreenAspect(rect: Rect, canvas: CanvasPx): boolean {
  const w = (rect.w * canvas.width) / 100
  const h = (rect.h * canvas.height) / 100
  if (!(w > 0) || !(h > 0)) return false
  return Math.abs(w / h / SCREEN_ASPECT - 1) <= SCREEN_ASPECT_TOLERANCE
}

// Strict overlap (touching edges do not intersect); both rects in the same units.
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

// Whether a canvas-percent rect lies inside the canvas.
export function rectInsideCanvas(r: Rect): boolean {
  return (
    [r.x, r.y, r.w, r.h].every(Number.isFinite) &&
    r.w > 0 &&
    r.h > 0 &&
    r.x >= 0 &&
    r.y >= 0 &&
    r.x + r.w <= 100 + 1e-9 &&
    r.y + r.h <= 100 + 1e-9
  )
}

const round2 = (v: number) => Math.round(v * 100) / 100

// Finds the blank screen the image model drew around `region` (025 A1).
// `grid` covers the search window (detectionWindow); `textRegions` are the
// contract's text regions at this size. Returns the screen in canvas percent
// (two decimals), measured to the last screen sample on each side, so the rect
// never includes bezel. A failure names the rule in `detail`; the caller's
// reason is always composite-not-blank.
export function detectScreenRect(
  grid: LuminanceGrid,
  region: Region,
  textRegions: ReadonlyArray<Region>,
  canvas: CanvasPx,
): ScreenDetection {
  const W = canvas.width
  const H = canvas.height
  const { cols, rows, x0, y0, step, values } = grid
  const fail = (detail: DetectDetail): ScreenDetection => ({ ok: false, detail })
  if (!(cols > 0) || !(rows > 0) || !(step > 0) || values.length < cols * rows) return fail('seed-not-blank')

  const colAt = (px: number) => Math.round((px - x0) / step)
  const rowAt = (py: number) => Math.round((py - y0) / step)
  const posX = (c: number) => x0 + c * step
  const posY = (r: number) => y0 + r * step
  const valueAt = (c: number, r: number) => values[r * cols + c]

  const rw = (region.rect.w * W) / 100
  const rh = (region.rect.h * H) / 100
  const cx = (region.rect.x * W) / 100 + rw / 2
  const cy = (region.rect.y * H) / 100 + rh / 2

  // Seed: the centre patch must be blank; its median is the screen level.
  const halfX = (SEED_PATCH_PCT * W) / 200
  const halfY = (SEED_PATCH_PCT * H) / 200
  const seed: number[] = []
  for (let r = Math.max(0, rowAt(cy - halfY)); r <= Math.min(rows - 1, rowAt(cy + halfY)); r++) {
    for (let c = Math.max(0, colAt(cx - halfX)); c <= Math.min(cols - 1, colAt(cx + halfX)); c++) {
      const v = valueAt(c, r)
      if (!Number.isFinite(v)) return fail('seed-not-blank')
      seed.push(v)
    }
  }
  if (seed.length < 4 || !isBlank(seed)) return fail('seed-not-blank')
  const level = median(seed)
  // NaN is never screen: the comparison is false.
  const isScreen = (v: number) => Math.abs(v - level) <= SCREEN_EDGE_DELTA

  // Edges: five scans per axis, outward from the centre. A scan's edge is its
  // last screen sample; a scan that starts off the screen has its edge at its
  // start; a scan that reaches the window edge fails (null).
  const scan = (c0: number, r0: number, dc: number, dr: number): number | null => {
    let c = c0
    let r = r0
    if (c < 0 || c >= cols || r < 0 || r >= rows) return null
    if (isScreen(valueAt(c, r))) {
      for (;;) {
        const nc = c + dc
        const nr = r + dr
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) return null
        if (!isScreen(valueAt(nc, nr))) break
        c = nc
        r = nr
      }
    }
    return dc !== 0 ? c : r
  }
  const cC = colAt(cx)
  const rC = rowAt(cy)
  const lefts: number[] = []
  const rights: number[] = []
  const tops: number[] = []
  const bottoms: number[] = []
  for (const f of SCAN_OFFSETS) {
    const row = rowAt(cy + f * rh)
    const col = colAt(cx + f * rw)
    const l = scan(cC, row, -1, 0)
    const r = scan(cC, row, 1, 0)
    const t = scan(col, rC, 0, -1)
    const b = scan(col, rC, 0, 1)
    if (l === null || r === null || t === null || b === null) return fail('edge-at-window')
    lefts.push(posX(l))
    rights.push(posX(r))
    tops.push(posY(t))
    bottoms.push(posY(b))
  }
  const left = median(lefts)
  const right = median(rights)
  const top = median(tops)
  const bottom = median(bottoms)
  const w = right - left
  const h = bottom - top
  // Rounded first: the stamp stores and validates this exact two-decimal rect.
  const rectPct: Rect = {
    x: round2((left / W) * 100),
    y: round2((top / H) * 100),
    w: round2((w / W) * 100),
    h: round2((h / H) * 100),
  }

  if (!(w > 0) || !(h > 0) || !isScreenAspect(rectPct, canvas)) return fail('aspect')
  if (w * h < MIN_SCREEN_AREA_RATIO * rw * rh) return fail('too-small')
  for (const t of textRegions) {
    if (rectsIntersect(rectPct, t.rect)) return fail('text-overlap')
  }

  // Interior: the rect inset by 3% per side must be blank, every sample of it.
  const insetX = w * INTERIOR_INSET
  const insetY = h * INTERIOR_INSET
  const interior: number[] = []
  for (let r = 0; r < rows; r++) {
    const py = posY(r)
    if (py < top + insetY || py > bottom - insetY) continue
    for (let c = 0; c < cols; c++) {
      const px = posX(c)
      if (px < left + insetX || px > right - insetX) continue
      interior.push(valueAt(c, r))
    }
  }
  if (interior.length < 4 || interior.some((v) => !Number.isFinite(v)) || !isBlank(interior)) {
    return fail('interior-not-blank')
  }

  return {
    ok: true,
    rect: rectPct,
  }
}
