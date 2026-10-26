// 025 T13 (Amendment A1): the screen detector, on synthetic grids (pure, no browser).
// AC-03 as amended: an offset screen is found exactly (within one grid step), and the
// detector fails on a textured seed, a screen that touches the window edge, a 4:3 screen,
// a screen under 60% of the region, a screen that intersects the text band and a busy
// interior. The 0.039 / 0.041 blank boundary holds on the seed and on the interior.
import { describe, expect, it } from 'vitest'
import { ASPECT_DIMENSIONS } from '@/lib/aspectRatio'
import {
  BLANK_STDDEV_MAX,
  DETECT_MARGIN_PCT,
  GRID_STEP_PX,
  MIN_SCREEN_AREA_RATIO,
  SCREEN_EDGE_DELTA,
  archetypes,
  detectScreenRect,
  detectionWindow,
  type LuminanceGrid,
  type Rect,
  type Region,
} from '@/lib/designData'

const SIZES = ['SQUARE', 'PORTRAIT', 'STORY'] as const
type Size = (typeof SIZES)[number]

const contractFor = (size: Size) => archetypes['device-screen'].versions[1].sizes[size]!
const compositeOf = (size: Size) => contractFor(size).regions.find((r) => r.purpose === 'composite')!
const textsOf = (size: Size) => contractFor(size).regions.filter((r) => r.purpose === 'text')

const SCREEN_L = 0.86
const DARK_L = 0.1

// A rect in canvas percent to canvas px.
const px = (r: Rect, size: Size) => {
  const { width: W, height: H } = ASPECT_DIMENSIONS[size]
  return { l: (r.x * W) / 100, t: (r.y * H) / 100, r: ((r.x + r.w) * W) / 100, b: ((r.y + r.h) * H) / 100 }
}

// A grid over the detection window of `size`: one point per GRID_STEP_PX canvas px, the first point
// at the centre of the first step (the sampler's shape), with the value from `fn(px, py)`.
function gridOf(size: Size, fn: (x: number, y: number) => number): LuminanceGrid {
  const { width: W, height: H } = ASPECT_DIMENSIONS[size]
  const win = detectionWindow(compositeOf(size), { width: W, height: H })
  const wx = (win.x * W) / 100
  const wy = (win.y * H) / 100
  const cols = Math.floor((win.w * W) / 100 / GRID_STEP_PX)
  const rows = Math.floor((win.h * H) / 100 / GRID_STEP_PX)
  const x0 = wx + GRID_STEP_PX / 2
  const y0 = wy + GRID_STEP_PX / 2
  const values = new Float64Array(cols * rows)
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) values[r * cols + c] = fn(x0 + c * GRID_STEP_PX, y0 + r * GRID_STEP_PX)
  return { cols, rows, x0, y0, step: GRID_STEP_PX, values }
}

// A flat screen over a dark surround; `ring` adds a bezel of that width in px.
const flatScreen = (screen: Rect, size: Size, ring = 0) => {
  const s = px(screen, size)
  return (x: number, y: number) => {
    if (x >= s.l && x <= s.r && y >= s.t && y <= s.b) return SCREEN_L
    if (ring > 0 && x >= s.l - ring && x <= s.r + ring && y >= s.t - ring && y <= s.b + ring) return 0.3
    return DARK_L
  }
}

const detect = (size: Size, fn: (x: number, y: number) => number) =>
  detectScreenRect(gridOf(size, fn), compositeOf(size), textsOf(size), ASPECT_DIMENSIONS[size])

// The screen shifted by (dx, dy) percent of the canvas, keeping the region's size.
const shifted = (size: Size, dx: number, dy: number): Rect => {
  const r = compositeOf(size).rect
  return { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h }
}

describe('the detector constants and the search window', () => {
  it('has the amended values', () => {
    expect(DETECT_MARGIN_PCT).toBe(12)
    expect(SCREEN_EDGE_DELTA).toBe(0.1)
    expect(MIN_SCREEN_AREA_RATIO).toBe(0.6)
    expect(BLANK_STDDEV_MAX).toBe(0.04)
    expect(GRID_STEP_PX).toBe(2)
  })

  it('widens the region by 12 points per side and clips to the canvas', () => {
    const c = { width: 1080, height: 1080 }
    expect(detectionWindow(compositeOf('SQUARE'), c)).toEqual({ x: 2, y: 30, w: 96, h: 69 })
    // STORY: x 8 to 92 widens past both canvas edges, so the window is the full width.
    expect(detectionWindow(compositeOf('STORY'), { width: 1080, height: 1920 })).toEqual({ x: 0, y: 32, w: 100, h: 53.5 })
  })
})

describe('an offset screen is found exactly', () => {
  for (const size of SIZES) {
    for (const [dx, dy] of [
      [0, 0],
      [3, 2],
      [-3, 4],
    ] as const) {
      it(`${size}: a screen offset by (${dx}, ${dy}) is found within one grid step on every edge`, () => {
        const truth = shifted(size, dx, dy)
        const found = detect(size, flatScreen(truth, size))
        expect(found.ok).toBe(true)
        if (!found.ok) return
        const want = px(truth, size)
        const got = px(found.rect, size)
        expect(Math.abs(got.l - want.l)).toBeLessThanOrEqual(GRID_STEP_PX)
        expect(Math.abs(got.t - want.t)).toBeLessThanOrEqual(GRID_STEP_PX)
        expect(Math.abs(got.r - want.r)).toBeLessThanOrEqual(GRID_STEP_PX)
        expect(Math.abs(got.b - want.b)).toBeLessThanOrEqual(GRID_STEP_PX)
        // The edge is the inside boundary: never outside the true screen.
        expect(got.l).toBeGreaterThanOrEqual(want.l - 1e-6)
        expect(got.r).toBeLessThanOrEqual(want.r + 1e-6)
        expect(got.t).toBeGreaterThanOrEqual(want.t - 1e-6)
        expect(got.b).toBeLessThanOrEqual(want.b + 1e-6)
        // Canvas percent, two decimals.
        for (const v of [found.rect.x, found.rect.y, found.rect.w, found.rect.h]) expect(Math.round(v * 100) / 100).toBe(v)
      })
    }
  }

  it('a detected rect differs from the contract region when the screen is offset', () => {
    const found = detect('SQUARE', flatScreen(shifted('SQUARE', 3, 2), 'SQUARE'))
    expect(found.ok && found.rect.x).toBeGreaterThan(compositeOf('SQUARE').rect.x + 2)
  })

  it('never includes bezel: a grey ring around the screen stays outside the rect', () => {
    for (const size of SIZES) {
      const truth = shifted(size, 2, 1)
      const found = detect(size, flatScreen(truth, size, 20))
      expect(found.ok, size).toBe(true)
      if (!found.ok) continue
      const want = px(truth, size)
      const got = px(found.rect, size)
      expect(got.l, size).toBeGreaterThanOrEqual(want.l - 1e-6)
      expect(got.r, size).toBeLessThanOrEqual(want.r + 1e-6)
      expect(got.t, size).toBeGreaterThanOrEqual(want.t - 1e-6)
      expect(got.b, size).toBeLessThanOrEqual(want.b + 1e-6)
    }
  })
})

describe('the detector fails, naming the rule', () => {
  it('a textured seed is seed-not-blank', () => {
    for (const size of SIZES) {
      const base = flatScreen(compositeOf(size).rect, size)
      const c = px(compositeOf(size).rect, size)
      const cx = (c.l + c.r) / 2
      const cy = (c.t + c.b) / 2
      const { width: W, height: H } = ASPECT_DIMENSIONS[size]
      const textured = (x: number, y: number) =>
        Math.abs(x - cx) <= (2.5 * W) / 100 && Math.abs(y - cy) <= (2.5 * H) / 100 ? (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 0.5 : SCREEN_L : base(x, y)
      expect(detect(size, textured), size).toEqual({ ok: false, detail: 'seed-not-blank' })
    }
  })

  it('a grid with an unreadable seed (NaN) or a bad shape fails closed', () => {
    const size = 'SQUARE'
    const flat = gridOf(size, flatScreen(compositeOf(size).rect, size))
    const nan = { ...flat, values: Float64Array.from(flat.values, () => Number.NaN) }
    expect(detectScreenRect(nan, compositeOf(size), textsOf(size), ASPECT_DIMENSIONS[size])).toMatchObject({ ok: false })
    const short = { ...flat, values: Array.from(flat.values).slice(0, 10) }
    expect(detectScreenRect(short, compositeOf(size), textsOf(size), ASPECT_DIMENSIONS[size])).toMatchObject({ ok: false })
    const empty = { ...flat, cols: 0 }
    expect(detectScreenRect(empty, compositeOf(size), textsOf(size), ASPECT_DIMENSIONS[size])).toMatchObject({ ok: false })
  })

  it('a screen that fills the window (touches the window edge) is edge-at-window', () => {
    for (const size of SIZES) {
      expect(detect(size, () => SCREEN_L), size).toEqual({ ok: false, detail: 'edge-at-window' })
    }
  })

  it('a 4:3 screen is aspect', () => {
    for (const size of SIZES) {
      const region = compositeOf(size).rect
      const { width: W, height: H } = ASPECT_DIMENSIONS[size]
      // Same width, 4:3 height, centred on the region.
      const w = (region.w * W) / 100
      const h = (w * 3) / 4
      const hPct = (h / H) * 100
      const cy = region.y + region.h / 2
      const rect = { x: region.x, y: cy - hPct / 2, w: region.w, h: hPct }
      expect(detect(size, flatScreen(rect, size)), size).toEqual({ ok: false, detail: 'aspect' })
    }
  })

  it('a screen under 60% of the region is too-small', () => {
    for (const size of SIZES) {
      const region = compositeOf(size).rect
      // 0.7 by 0.7 of the region's size: 16:10 still, area 49%.
      const w = region.w * 0.7
      const h = region.h * 0.7
      const rect = { x: region.x + (region.w - w) / 2, y: region.y + (region.h - h) / 2, w, h }
      expect(detect(size, flatScreen(rect, size)), size).toEqual({ ok: false, detail: 'too-small' })
    }
  })

  it('a screen at 0.8 of the region (64% of the area) is still accepted', () => {
    for (const size of SIZES) {
      const region = compositeOf(size).rect
      const w = region.w * 0.8
      const h = region.h * 0.8
      const rect = { x: region.x + (region.w - w) / 2, y: region.y + (region.h - h) / 2, w, h }
      expect(detect(size, flatScreen(rect, size)).ok, size).toBe(true)
    }
  })

  it('a screen that intersects the text band is text-overlap', () => {
    for (const size of SIZES) {
      const region = compositeOf(size).rect
      const textBottom = Math.max(...textsOf(size).map((t) => t.rect.y + t.rect.h))
      // Move the screen up until its top is one point inside the text band (still inside the window).
      const rect = { ...region, y: textBottom - 1 }
      expect(detect(size, flatScreen(rect, size)), size).toEqual({ ok: false, detail: 'text-overlap' })
    }
  })

  it('a busy interior is interior-not-blank', () => {
    for (const size of SIZES) {
      const truth = compositeOf(size).rect
      const s = px(truth, size)
      const w = s.r - s.l
      const h = s.b - s.t
      // A 15% by 15% patch in the top-left corner, clear of the seed and of every scan line.
      const patch = (x: number, y: number) =>
        x >= s.l + 0.035 * w && x <= s.l + 0.185 * w && y >= s.t + 0.035 * h && y <= s.t + 0.185 * h
      const base = flatScreen(truth, size)
      expect(detect(size, (x, y) => (patch(x, y) ? 0.45 : base(x, y))), size).toEqual({ ok: false, detail: 'interior-not-blank' })
    }
  })
})

describe('the blank boundary: 0.039 passes and 0.041 fails (std dev of L*/100)', () => {
  // A checkerboard of SCREEN_L plus and minus `a`: the population std dev is about `a`.
  const checker = (x: number, y: number, a: number) =>
    (Math.floor(x / GRID_STEP_PX) + Math.floor(y / GRID_STEP_PX)) % 2 === 0 ? SCREEN_L + a : SCREEN_L - a

  it('on the seed: 0.039 passes, 0.041 is seed-not-blank', () => {
    for (const size of SIZES) {
      const base = flatScreen(compositeOf(size).rect, size)
      const s = px(compositeOf(size).rect, size)
      const inside = (x: number, y: number) => x >= s.l && x <= s.r && y >= s.t && y <= s.b
      const withAmp = (a: number) => (x: number, y: number) => (inside(x, y) ? checker(x, y, a) : base(x, y))
      expect(detect(size, withAmp(0.039)).ok, size).toBe(true)
      expect(detect(size, withAmp(0.041)), size).toEqual({ ok: false, detail: 'seed-not-blank' })
    }
  })

  it('on the interior (flat seed): a std dev of 0.039 passes and 0.041 is interior-not-blank', () => {
    for (const size of SIZES) {
      const truth = compositeOf(size).rect
      const s = px(truth, size)
      const w = s.r - s.l
      const h = s.b - s.t
      const { width: W, height: H } = ASPECT_DIMENSIONS[size]
      const cx = (s.l + s.r) / 2
      const cy = (s.t + s.b) / 2
      const inSeed = (x: number, y: number) => Math.abs(x - cx) <= (2.5 * W) / 100 && Math.abs(y - cy) <= (2.5 * H) / 100
      const base = flatScreen(truth, size)
      const inside = (x: number, y: number) => x >= s.l && x <= s.r && y >= s.t && y <= s.b
      // The share of the interior (inset 3%) that is checkerboard: everything but the seed.
      let n = 0
      let nSeed = 0
      const grid = gridOf(size, () => 0)
      for (let r = 0; r < grid.rows; r++) {
        for (let c = 0; c < grid.cols; c++) {
          const x = grid.x0 + c * grid.step
          const y = grid.y0 + r * grid.step
          if (x < s.l + 0.03 * w || x > s.r - 0.03 * w || y < s.t + 0.03 * h || y > s.b - 0.03 * h) continue
          n++
          if (inSeed(x, y)) nSeed++
        }
      }
      // std of the interior is a * sqrt((n - nSeed) / n); solve for a at the target std.
      const amp = (target: number) => target / Math.sqrt((n - nSeed) / n)
      const withAmp = (a: number) => (x: number, y: number) => (inside(x, y) && !inSeed(x, y) ? checker(x, y, a) : base(x, y))
      expect(detect(size, withAmp(amp(0.039))).ok, size).toBe(true)
      expect(detect(size, withAmp(amp(0.041))), size).toEqual({ ok: false, detail: 'interior-not-blank' })
    }
  })
})

describe('the region type', () => {
  it('a composite region is what the detector takes as its seed', () => {
    const r: Region = compositeOf('SQUARE')
    expect(r.purpose).toBe('composite')
  })
})
