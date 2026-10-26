// Change 028 T3 — the look fixtures against real Chromium (MOCK_PUPPETEER off;
// see vitest.render.config.ts). AC-07. Every current contract has a pass, a
// busy and a contrast image; the pixel check must call each correctly.
//
// 025 Amendment A1 (T13): a contract with a composite region has more kinds
// (screen, pass-offset, text-overlap, small), and its screen is judged by the
// screen detector, not by evaluateRegions. Each row is judged in two ways: the
// pieces (text regions through evaluateRegions, the screen window through the
// real grid sampler and detectScreenRect, so the region and the rule are
// named) and the shipped check as a whole (runHeroCheck).
import { describe, expect, it } from 'vitest'
import { MOCK_PUPPETEER } from '@/lib/testHooks'
import { ASPECT_DIMENSIONS } from '@/lib/aspectRatio'
import { sampleLuminanceGrid, sampleRegionLuminance } from '@/lib/renderer/puppeteer'
import { runHeroCheck } from '@/lib/renderer/heroCheck'
import {
  compositeRegionOf,
  contractAt,
  contractVersionOf,
  detectScreenRect,
  detectionWindow,
  evaluateRegions,
  planComposition,
  type HeroPlan,
} from '@/lib/designData'
import { CANDIDATE_FIXTURES, LOOK_FIXTURES, SUPERSEDED_FIXTURES } from './lookFixtureTable'
import { lookFixture } from './lookFixtures'

describe('the look fixtures run in real Chromium', () => {
  it('runs with MOCK_PUPPETEER off', () => {
    expect(MOCK_PUPPETEER).toBe(false)
  })
})

describe.each([...LOOK_FIXTURES, ...CANDIDATE_FIXTURES, ...SUPERSEDED_FIXTURES])('look fixture $id $kind', (spec) => {
  it('gets the verdict the check should give', async () => {
    const sizeContract = contractAt(spec.key, spec.version, spec.size)!
    const tone = contractVersionOf(spec.key, spec.version)!.textTone
    const canvas = ASPECT_DIMENSIONS[spec.size]
    const url = await lookFixture(spec)
    const composite = compositeRegionOf(sizeContract)
    // A composite region is judged by the detector, never by evaluateRegions.
    const judged = sizeContract.regions.filter((r) => r.purpose !== 'composite')
    const texts = judged.filter((r) => r.purpose === 'text')

    const samples = await sampleRegionLuminance(url, judged, canvas)
    const verdict = evaluateRegions(samples, judged, tone)
    const detection = composite
      ? detectScreenRect(
          (await sampleLuminanceGrid(url, detectionWindow(composite, canvas), canvas))!,
          composite,
          texts,
          canvas,
        )
      : null

    // The shipped check as a whole, on the same image.
    const plan = planComposition(
      { imageStyle: spec.key, aspectRatio: spec.size, hasCompositeSource: true },
      undefined,
      {
        version: spec.version, // 031: a candidate row is planned at its own version, as the probe does
      },
    )
    expect(plan.kind).toBe('hero')
    expect((plan as HeroPlan).contractVersion).toBe(spec.version)
    const shipped = await runHeroCheck(url, plan as HeroPlan)

    if (spec.kind === 'pass') {
      expect(verdict).toEqual({ ok: true })
      if (composite) {
        expect(detection).toMatchObject({ ok: true })
        // The screen is the region padded by 1 point: the rect is within 2 points of the region.
        const rect = (detection as { rect: { x: number; y: number; w: number; h: number } }).rect
        expect(Math.abs(rect.x - composite.rect.x)).toBeLessThan(2)
        expect(Math.abs(rect.y - composite.rect.y)).toBeLessThan(2)
        expect(shipped).toEqual({ ok: true, composites: [{ region: 0, rect }] })
      } else {
        expect(shipped).toEqual({ ok: true })
      }
    } else if (spec.kind === 'busy') {
      const lastText = judged.filter((r) => r.purpose === 'text').pop()
      expect(verdict).toMatchObject({ ok: false, reason: 'busy', region: lastText })
      expect(shipped).toEqual({ ok: false, reason: 'busy' })
    } else if (spec.kind === 'contrast') {
      expect(verdict).toMatchObject({ ok: false, reason: 'contrast', region: judged[0] })
      expect(shipped).toEqual({ ok: false, reason: 'contrast' })
    } else {
      // The screen kinds: the text bands pass, and the detector names the rule on the composite region.
      expect(verdict).toEqual({ ok: true })
      expect(composite).not.toBeNull()
      expect(shipped).toEqual(
        spec.kind === 'pass-offset'
          ? { ok: true, composites: [{ region: 0, rect: (detection as { rect: unknown }).rect }] }
          : { ok: false, reason: 'composite-not-blank' },
      )
      if (spec.kind === 'pass-offset') {
        expect(detection).toMatchObject({ ok: true })
        const rect = (detection as { rect: { x: number; y: number } }).rect
        // Offset by (3, 2) and padded by 1, so a net shift of about (2, 1): clearly off the region.
        expect(rect.x - composite!.rect.x).toBeGreaterThan(1.5)
        expect(rect.y - composite!.rect.y).toBeGreaterThan(0.5)
      } else {
        const detail = {
          screen: 'seed-not-blank',
          'text-overlap': 'text-overlap',
          small: 'too-small',
        }[spec.kind]
        expect(detection).toEqual({ ok: false, detail })
      }
    }
  })
})
