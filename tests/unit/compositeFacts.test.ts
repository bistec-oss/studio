// 025 T1: the pure composite verdict (FR-14) and the blank check (FR-04).
import { describe, it, expect } from 'vitest'
import {
  BLANK_STDDEV_MAX,
  COMPOSITE_TOLERANCE_PX,
  evaluateCompositeFacts,
  evaluateRegions,
  lightness,
  type CompositeFacts,
  type Region,
} from '@/lib/designData'

const rect = { left: 151.2, top: 453.6, width: 777.6, height: 486 }
const good: CompositeFacts = {
  found: true,
  complete: true,
  naturalWidth: 1280,
  box: { ...rect },
  hits: [true, true, true, true, true],
}

describe('COMPOSITE_TOLERANCE_PX', () => {
  it('is 2', () => expect(COMPOSITE_TOLERANCE_PX).toBe(2))
})

describe('evaluateCompositeFacts', () => {
  it('a found, complete, placed, uncovered element passes', () => {
    expect(evaluateCompositeFacts(good, rect, COMPOSITE_TOLERANCE_PX)).toEqual({ ok: true })
  })

  it('the tolerance defaults to COMPOSITE_TOLERANCE_PX', () => {
    expect(evaluateCompositeFacts({ ...good, box: { ...rect, left: rect.left + 2 } }, rect)).toEqual({ ok: true })
    expect(evaluateCompositeFacts({ ...good, box: { ...rect, left: rect.left + 2.5 } }, rect)).toMatchObject({ ok: false })
  })

  it('not found, not complete and a zero naturalWidth each fail with their own detail', () => {
    const notFound = evaluateCompositeFacts({ ...good, found: false }, rect, 2)
    const incomplete = evaluateCompositeFacts({ ...good, complete: false }, rect, 2)
    const empty = evaluateCompositeFacts({ ...good, naturalWidth: 0 }, rect, 2)
    for (const v of [notFound, incomplete, empty]) expect(v.ok).toBe(false)
    const details = [notFound, incomplete, empty].map((v) => (v.ok ? '' : v.detail))
    expect(new Set(details).size).toBe(3)
    expect(evaluateCompositeFacts({ ...good, naturalWidth: -1 }, rect, 2).ok).toBe(false)
    expect(evaluateCompositeFacts({ ...good, naturalWidth: Number.NaN }, rect, 2).ok).toBe(false)
  })

  describe('the box tolerance on each edge', () => {
    // A move of one edge: left and top shift the origin, right and bottom shift
    // the far edge (width and height change with the origin held).
    const moved = (edge: 'left' | 'top' | 'right' | 'bottom', by: number): CompositeFacts => {
      const box = { ...rect }
      if (edge === 'left') {
        box.left += by
        box.width -= by
      } else if (edge === 'top') {
        box.top += by
        box.height -= by
      } else if (edge === 'right') box.width += by
      else box.height += by
      return { ...good, box }
    }
    for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
      it(`${edge}: exactly 2 px either way passes, just over fails`, () => {
        for (const by of [2, -2]) expect(evaluateCompositeFacts(moved(edge, by), rect, 2), `${edge} ${by}`).toEqual({ ok: true })
        for (const by of [2.01, -2.01]) {
          const v = evaluateCompositeFacts(moved(edge, by), rect, 2)
          expect(v.ok, `${edge} ${by}`).toBe(false)
          if (!v.ok) expect(v.detail).toContain(edge)
        }
      })
    }
    it('a NaN box fails', () => {
      expect(evaluateCompositeFacts({ ...good, box: { ...rect, top: Number.NaN } }, rect, 2).ok).toBe(false)
    })
  })

  describe('the five hit points', () => {
    for (let i = 0; i < 5; i++) {
      it(`point ${i} covered fails, and the others alone do not`, () => {
        const hits = [true, true, true, true, true]
        hits[i] = false
        const v = evaluateCompositeFacts({ ...good, hits }, rect, 2)
        expect(v.ok).toBe(false)
        if (!v.ok) expect(v.detail).toContain(`point ${i}`)
      })
    }
    it('fewer or more than five points fails (a probe that did not run is not a pass)', () => {
      expect(evaluateCompositeFacts({ ...good, hits: [] }, rect, 2).ok).toBe(false)
      expect(evaluateCompositeFacts({ ...good, hits: [true, true, true, true] }, rect, 2).ok).toBe(false)
      expect(evaluateCompositeFacts({ ...good, hits: [true, true, true, true, true, true] }, rect, 2).ok).toBe(false)
    })
  })
})

// ── the blank check, boundary ───────────────────────────────────────────────

// 256 samples alternating L*/100 = 0.5 + s and 0.5 - s: the population standard
// deviation of L*/100 is exactly s. Converted back to relative luminance.
const toLuminance = (L: number) => ((L + 0.16) / 1.16) ** 3
const withStdDev = (s: number): number[] =>
  Array.from({ length: 256 }, (_, i) => toLuminance(i % 2 === 0 ? 0.5 + s : 0.5 - s))

const screen: Region = { rect: { x: 14, y: 42, w: 72, h: 45 }, purpose: 'composite', minAreaPct: 20 }
const text: Region = { rect: { x: 0, y: 0, w: 100, h: 34 }, purpose: 'text', minAreaPct: 20 }
const sample = (lum: number[], r: Region) => ({ luminance: lum, areaPct: (r.rect.w * r.rect.h) / 100 })

// Amendment A1: the blank rule moved from evaluateRegions to the screen detector (composite.ts,
// tests/unit/screenDetect.test.ts, which holds the 0.039 / 0.041 boundary on the seed and the
// interior). evaluateRegions keeps the invalid rule for a composite region and nothing else.
describe('the blank check (025 FR-04, AC-03)', () => {
  it('BLANK_STDDEV_MAX is 0.04 and the helper hits the L* standard deviations it claims', () => {
    expect(BLANK_STDDEV_MAX).toBe(0.04)
    const ls = withStdDev(0.039).map(lightness)
    const mean = ls.reduce((a, b) => a + b, 0) / ls.length
    expect(Math.sqrt(ls.reduce((a, b) => a + (b - mean) ** 2, 0) / ls.length)).toBeCloseTo(0.039, 9)
  })

  it('evaluateRegions leaves a composite region to the detector: std dev 0.039, 0.041 and a bright flat screen all pass it', () => {
    expect(evaluateRegions([sample(withStdDev(0.039), screen)], [screen], 'light')).toEqual({ ok: true })
    expect(evaluateRegions([sample(withStdDev(0.041), screen)], [screen], 'light')).toEqual({ ok: true })
    const bright = Array.from({ length: 256 }, () => 0.7)
    expect(evaluateRegions([sample(bright, screen)], [screen], 'light')).toEqual({ ok: true })
  })

  it('invalid comes first: a too-small share is region-invalid, not blank or busy', () => {
    expect(evaluateRegions([{ luminance: withStdDev(0.3), areaPct: 5 }], [screen], 'light')).toEqual({
      ok: false,
      reason: 'region-invalid',
      region: screen,
    })
    expect(evaluateRegions([null], [screen], 'light')).toMatchObject({ reason: 'region-invalid' })
    expect(evaluateRegions([{ luminance: [0.5, 0.5], areaPct: 45 }], [screen], 'light')).toMatchObject({ reason: 'region-invalid' })
  })

  it('a text region keeps its old behaviour: busy above 0.12, contrast below 4.5', () => {
    expect(evaluateRegions([sample(withStdDev(0.13), text)], [text], 'light')).toMatchObject({ reason: 'busy' })
    expect(evaluateRegions([sample(withStdDev(0.05), text)], [text], 'light')).toMatchObject({ reason: 'contrast' })
    // 0.05 on a text region is not busy (it was blank-failing only on a composite).
    const calm = Array.from({ length: 256 }, () => 0.02)
    expect(evaluateRegions([sample(calm, text)], [text], 'light')).toEqual({ ok: true })
  })

  it('both regions in dataset order: a busy composite region does not fail the evaluation, a busy text region does', () => {
    const busyScreen = sample(withStdDev(0.3), screen)
    const calmText = sample(Array.from({ length: 256 }, () => 0.02), text)
    expect(evaluateRegions([calmText, busyScreen], [text, screen], 'light')).toEqual({ ok: true })
    const busyText = sample(withStdDev(0.3), text)
    expect(evaluateRegions([busyText, busyScreen], [text, screen], 'light')).toMatchObject({ reason: 'busy', region: text })
  })
})
