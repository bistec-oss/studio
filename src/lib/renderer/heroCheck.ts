// The hero-image pixel check, in one place (009 FR-09/FR-10, 025 Amendment A1).
//
// `runBackgroundStep` calls it on a fresh hero image, and the OP-025 recheck
// (scripts/look-check/recheck.ts) calls it on a saved render, so what is judged
// offline is the shipped code. It FAILS CLOSED: a sampler error, a timeout, a
// seam error or any other throw is `check-error`, and only an explicit pass
// keeps the look. It never throws.
//
// Order: the contract's text regions first (busy, then contrast, as before),
// then, for a look with a composite region, the screen detector, which also
// returns the screen rect the screenshot will be placed on.
import { dimensionsFor } from '@/lib/aspectRatio'
import {
  compositeRegionOf,
  detectScreenRect,
  detectionWindow,
  evaluateRegions,
  type HeroCheckResult,
  type HeroPlan,
  type LuminanceGrid,
  type Rect,
  type Region,
  type RegionSample,
  type TextTone,
} from '@/lib/designData'
import { sampleLuminanceGrid, sampleRegionLuminance } from '@/lib/renderer/puppeteer'

// Test seams (MOCK_AI): synthetic data fed to the REAL evaluator and detector.
// A seam that returns null falls through to the real sampler.
export interface HeroCheckSeams {
  regionSamples?: (regions: readonly Region[], tone: TextTone) => RegionSample[] | null
  screenGrid?: (window: Rect, region: Region, canvas: { width: number; height: number }) => LuminanceGrid | null
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

export async function runHeroCheck(
  dataUrl: string,
  hero: HeroPlan,
  opts: { seams?: HeroCheckSeams; log?: (message: string) => void } = {},
): Promise<HeroCheckResult> {
  const log = opts.log ?? (() => undefined)
  try {
    const canvas = dimensionsFor(hero.size)
    const tone = hero.contract.textTone
    const composite = compositeRegionOf(hero.sizeContract)
    // A composite region is judged by the detector, never by evaluateRegions.
    const judged = hero.sizeContract.regions.filter((r) => r.purpose !== 'composite')

    if (judged.length > 0) {
      const samples =
        opts.seams?.regionSamples?.(judged, tone) ?? (await sampleRegionLuminance(dataUrl, judged, canvas))
      const verdict = evaluateRegions(samples, judged, tone)
      if (verdict.ok !== true) {
        log(`hero check failed (${verdict.reason}) for ${hero.requestedArchetype}`)
        return { ok: false, reason: verdict.reason }
      }
    }
    if (!composite) return { ok: true }

    const window = detectionWindow(composite, canvas)
    const grid =
      opts.seams?.screenGrid?.(window, composite, canvas) ??
      (await sampleLuminanceGrid(dataUrl, window, canvas, { seamRegion: composite }))
    if (!grid) {
      log(`hero check failed (region-invalid) for ${hero.requestedArchetype}: the screen window could not be sampled`)
      return { ok: false, reason: 'region-invalid' }
    }
    const found = detectScreenRect(grid, composite, judged.filter((r) => r.purpose === 'text'), canvas)
    if (found.ok !== true) {
      log(`hero check failed (composite-not-blank: ${found.detail}) for ${hero.requestedArchetype}`)
      return { ok: false, reason: 'composite-not-blank' }
    }
    return { ok: true, composites: [{ region: 0, rect: found.rect }] }
  } catch (err) {
    log(`hero check could not run (${errorText(err)})`)
    return { ok: false, reason: 'check-error' }
  }
}
