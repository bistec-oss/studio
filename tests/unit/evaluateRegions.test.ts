import { describe, it, expect } from 'vitest'
import {
  evaluateRegions,
  relativeLuminance,
  lightness,
  contrastRatio,
  BUSY_STDDEV_MAX,
  CONTRAST_MIN,
  CONTRAST_PASS_FRACTION,
  MIN_SAMPLES,
  SAMPLE_GRID_MAX,
  TEXT_TONE_LUMINANCE,
  LIGHT_TEXT_MAX_BACKDROP_LUMINANCE,
  DARK_TEXT_MIN_BACKDROP_LUMINANCE,
  type Region,
  type RegionSample,
} from '@/lib/designData'

const text: Region = { rect: { x: 0, y: 0, w: 45, h: 100 }, purpose: 'text', minAreaPct: 20 }
const clear: Region = { rect: { x: 60, y: 0, w: 40, h: 100 }, purpose: 'clear', minAreaPct: 20 }
const flat = (l: number, n = 100, areaPct = 45): RegionSample => ({ luminance: Array(n).fill(l), areaPct })

describe('constants', () => {
  it('are the documented values', () => {
    expect(BUSY_STDDEV_MAX).toBe(0.12)
    expect(CONTRAST_MIN).toBe(4.5)
    expect(CONTRAST_PASS_FRACTION).toBe(0.95)
    expect(MIN_SAMPLES).toBe(64)
    expect(SAMPLE_GRID_MAX).toBe(4000)
    expect(TEXT_TONE_LUMINANCE).toEqual({ light: 1, dark: 0.0056 })
  })

  it('derive the two contrast luminances: 0.183 for light text and 0.200 for dark text', () => {
    expect(LIGHT_TEXT_MAX_BACKDROP_LUMINANCE).toBeCloseTo(0.183, 3)
    expect(DARK_TEXT_MIN_BACKDROP_LUMINANCE).toBeCloseTo(0.2, 3)
    // and they are exactly where the ratio crosses 4.5
    expect(contrastRatio(LIGHT_TEXT_MAX_BACKDROP_LUMINANCE, 1)).toBeCloseTo(4.5, 9)
    expect(contrastRatio(DARK_TEXT_MIN_BACKDROP_LUMINANCE, 0.0056)).toBeCloseTo(4.5, 9)
  })
})

describe('colour maths', () => {
  it('relativeLuminance: black 0, white 1, mid-grey about 0.216', () => {
    expect(relativeLuminance(0, 0, 0)).toBe(0)
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 9)
    expect(relativeLuminance(128, 128, 128)).toBeCloseTo(0.2159, 3)
  })
  it('lightness: 0 -> 0, 1 -> 1, and the linear branch below 0.008856', () => {
    expect(lightness(0)).toBe(0)
    expect(lightness(1)).toBeCloseTo(1, 9)
    expect(lightness(0.008)).toBeCloseTo(9.033 * 0.008, 9)
  })
  it('contrastRatio is order-independent: white on black is 21', () => {
    expect(contrastRatio(1, 0)).toBeCloseTo(21, 9)
    expect(contrastRatio(0, 1)).toBeCloseTo(21, 9)
  })
})

describe('evaluateRegions (AC-10)', () => {
  it('a calm dark region passes for light text', () => {
    expect(evaluateRegions([flat(0.02)], [text], 'light')).toEqual({ ok: true })
  })

  it('busy: just under the threshold passes, just over fails', () => {
    // Two-level samples: half at lightness a, half at lightness b => stddev = |a-b|/2.
    const luminanceFor = (l: number) => Math.pow((l + 0.16) / 1.16, 3) // inverse of lightness above 0.08
    const spread = (sd: number): RegionSample => {
      const mid = 0.3
      const lo = luminanceFor(mid - sd)
      const hi = luminanceFor(mid + sd)
      return { luminance: [...Array(50).fill(lo), ...Array(50).fill(hi)], areaPct: 45 }
    }
    // A clear region is busy-tested but not contrast-tested, so busy is isolated here.
    expect(evaluateRegions([spread(BUSY_STDDEV_MAX - 0.01)], [clear], 'light')).toEqual({ ok: true })
    const over = evaluateRegions([spread(BUSY_STDDEV_MAX + 0.01)], [clear], 'light')
    expect(over).toMatchObject({ ok: false, reason: 'busy' })
  })

  it('a busy region reports the region and wins over contrast', () => {
    const lum = [...Array(50).fill(0), ...Array(50).fill(1)]
    expect(evaluateRegions([{ luminance: lum, areaPct: 45 }], [text], 'light')).toEqual({
      ok: false,
      reason: 'busy',
      region: text,
    })
  })

  it('contrast, light text: a calm region at the 0.183 limit passes, just above fails', () => {
    expect(evaluateRegions([flat(LIGHT_TEXT_MAX_BACKDROP_LUMINANCE - 0.001)], [text], 'light').ok).toBe(true)
    expect(evaluateRegions([flat(LIGHT_TEXT_MAX_BACKDROP_LUMINANCE + 0.01)], [text], 'light')).toMatchObject({
      ok: false,
      reason: 'contrast',
    })
  })

  it('contrast, dark text: a calm region at the 0.200 limit passes, just below fails', () => {
    expect(evaluateRegions([flat(DARK_TEXT_MIN_BACKDROP_LUMINANCE + 0.005)], [text], 'dark').ok).toBe(true)
    expect(evaluateRegions([flat(DARK_TEXT_MIN_BACKDROP_LUMINANCE - 0.02)], [text], 'dark')).toMatchObject({
      ok: false,
      reason: 'contrast',
    })
  })

  // 100 samples: k pass (L = 0.02), the rest fail (L = 0.3, still calm enough that busy does not fire first).
  const mixed = (passing: number): RegionSample => ({
    luminance: [...Array(passing).fill(0.02), ...Array(100 - passing).fill(0.3)],
    areaPct: 45,
  })

  it('contrast passes at exactly 95% of samples and fails at 94% (light tone)', () => {
    expect(evaluateRegions([mixed(95)], [text], 'light').ok).toBe(true)
    expect(evaluateRegions([mixed(94)], [text], 'light')).toMatchObject({ ok: false, reason: 'contrast' })
  })

  it('contrast passes at exactly 95% of samples and fails at 94% (dark tone)', () => {
    const darkMixed = (passing: number): RegionSample => ({
      luminance: [...Array(passing).fill(0.5), ...Array(100 - passing).fill(0.05)],
      areaPct: 45,
    })
    expect(evaluateRegions([darkMixed(95)], [text], 'dark').ok).toBe(true)
    expect(evaluateRegions([darkMixed(94)], [text], 'dark')).toMatchObject({ ok: false, reason: 'contrast' })
  })

  it('a clear region is not contrast-tested', () => {
    expect(evaluateRegions([flat(0.5)], [clear], 'light')).toEqual({ ok: true })
  })

  it('region-invalid: unresolved (null or missing), area under the minimum, fewer than 64 samples', () => {
    expect(evaluateRegions([null], [text], 'light')).toMatchObject({ reason: 'region-invalid' })
    expect(evaluateRegions([], [text], 'light')).toMatchObject({ reason: 'region-invalid' })
    expect(evaluateRegions([flat(0.02, 100, 19.9)], [text], 'light')).toMatchObject({ reason: 'region-invalid' })
    expect(evaluateRegions([flat(0.02, 100, 20)], [text], 'light').ok).toBe(true)
    expect(evaluateRegions([flat(0.02, MIN_SAMPLES - 1)], [text], 'light')).toMatchObject({ reason: 'region-invalid' })
    expect(evaluateRegions([flat(0.02, MIN_SAMPLES)], [text], 'light').ok).toBe(true)
    expect(evaluateRegions([flat(0.02, 100, NaN)], [text], 'light')).toMatchObject({ reason: 'region-invalid' })
  })

  it('non-finite samples are not counted', () => {
    const lum = [...Array(MIN_SAMPLES - 1).fill(0.02), NaN, Infinity]
    expect(evaluateRegions([{ luminance: lum, areaPct: 45 }], [text], 'light')).toMatchObject({
      reason: 'region-invalid',
    })
  })

  it('returns the first failing region in dataset order', () => {
    const busy = { luminance: [...Array(50).fill(0), ...Array(50).fill(1)], areaPct: 45 }
    const verdict = evaluateRegions([flat(0.5), busy], [text, clear], 'light')
    expect(verdict).toMatchObject({ reason: 'contrast', region: text })
    const second = evaluateRegions([flat(0.02), busy], [text, clear], 'light')
    expect(second).toMatchObject({ reason: 'busy', region: clear })
  })

  it('an empty region list is ok', () => {
    expect(evaluateRegions([], [], 'light')).toEqual({ ok: true })
  })
})
