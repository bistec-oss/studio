// The pure pixel check (009 design.md section 4).
//
// The sampler (src/lib/renderer/puppeteer.ts) hands back point samples of
// relative luminance per region; everything that decides is here, so the page
// carries no formula copy that could drift.
import type { Region, TextTone } from './composition'

export interface RegionSample {
  // WCAG relative luminance, 0..1.
  luminance: readonly number[]
  // The sampled area as a percent of the canvas.
  areaPct: number
}
export type HeroVerdict =
  | { ok: true }
  | { ok: false; reason: 'busy' | 'contrast' | 'region-invalid'; region: Region }

// Busy when the std. deviation of CIE L*/100 is above this. Correction 1 of
// the spec: on linear luminance a dark region cannot exceed about 0.09, so the
// proposal's 0.12 would never fire. A starting value, tuned in T3.
export const BUSY_STDDEV_MAX = 0.12
// A composite region (the laptop screen) is blank when the std. deviation of
// CIE L*/100 is at most this: a third of the busy bar (025 FR-04). A starting
// value, tuned on fixtures before OP-025.
export const BLANK_STDDEV_MAX = 0.04
// The WCAG ratio a sample must reach (text regions only).
export const CONTRAST_MIN = 4.5
// The share of samples that must reach it.
export const CONTRAST_PASS_FRACTION = 0.95
// Fewer usable samples is region-invalid.
export const MIN_SAMPLES = 64
// Points per region (the sampler's grid cap).
export const SAMPLE_GRID_MAX = 4000
// The text colour's relative luminance: white, and near-black #111111.
export const TEXT_TONE_LUMINANCE: Record<TextTone, number> = { light: 1, dark: 0.0056 }

// The backdrop luminance limits the contrast rule works out to.
// Light text: (1 + 0.05) / (L + 0.05) >= 4.5  =>  L <= 0.183.
export const LIGHT_TEXT_MAX_BACKDROP_LUMINANCE = (TEXT_TONE_LUMINANCE.light + 0.05) / CONTRAST_MIN - 0.05
// Dark text: (L + 0.05) / (0.0056 + 0.05) >= 4.5  =>  L >= 0.200.
export const DARK_TEXT_MIN_BACKDROP_LUMINANCE = CONTRAST_MIN * (TEXT_TONE_LUMINANCE.dark + 0.05) - 0.05

const srgbToLinear = (c: number) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

// WCAG relative luminance of an sRGB colour, channels 0..255.
export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

// CIE lightness L*/100 from relative luminance (0..1).
export function lightness(l: number): number {
  return l <= 0.008856 ? 9.033 * l : 1.16 * Math.cbrt(l) - 0.16
}

// WCAG contrast ratio of two relative luminances (order does not matter).
export function contrastRatio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

function lightnessStdDev(luminance: readonly number[]): number {
  const ls = luminance.map(lightness)
  const mean = ls.reduce((s, v) => s + v, 0) / ls.length
  return Math.sqrt(ls.reduce((s, v) => s + (v - mean) ** 2, 0) / ls.length)
}

// `sampled` is index-aligned with `regions`; null (or a missing entry) means
// unresolved. Per region, in dataset order: invalid first, then busy, then (a
// `text` region only) contrast. A `composite` region gets the invalid rule only:
// the screen detector (composite.ts, 025 A1) judges it, and the hero check
// (src/lib/renderer/heroCheck.ts) never hands one to this function. The first
// failure returns.
export function evaluateRegions(
  sampled: ReadonlyArray<RegionSample | null>,
  regions: ReadonlyArray<Region>,
  textTone: TextTone
): HeroVerdict {
  const toneL = TEXT_TONE_LUMINANCE[textTone]
  for (let i = 0; i < regions.length; i++) {
    const region = regions[i]
    const s = sampled[i] ?? null
    const lum = s ? s.luminance.filter(Number.isFinite).map((v) => Math.min(1, Math.max(0, v))) : []
    if (!s || !Number.isFinite(s.areaPct) || s.areaPct < region.minAreaPct || lum.length < MIN_SAMPLES) {
      return { ok: false, reason: 'region-invalid', region }
    }
    if (region.purpose === 'composite') continue
    if (lightnessStdDev(lum) > BUSY_STDDEV_MAX) return { ok: false, reason: 'busy', region }
    if (region.purpose === 'text') {
      const passing = lum.filter((l) => contrastRatio(l, toneL) >= CONTRAST_MIN).length
      if (passing / lum.length < CONTRAST_PASS_FRACTION) return { ok: false, reason: 'contrast', region }
    }
  }
  return { ok: true }
}
