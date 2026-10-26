// Change 009 T3 — the region sampler against real Chromium (MOCK_PUPPETEER off;
// see vitest.render.config.ts). AC-11 (the sampler on real pixels, the mapping,
// A3 point sampling) and the real half of AC-12 (fail closed).
//
// The fixtures are synthetic (heroFixtures.ts). The margins asserted here are
// the tuning record for the T2 constants; they are not a claim about real model
// images.

import { describe, expect, it } from "vitest"
import { MOCK_PUPPETEER } from "@/lib/testHooks"
import {
  HERO_CHECK_TIMEOUT_MS,
  HeroCheckError,
  evaluateInRenderedPage,
  sampleRegionLuminance,
} from "@/lib/renderer/puppeteer"
import {
  BUSY_STDDEV_MAX,
  CONTRAST_PASS_FRACTION,
  MIN_SAMPLES,
  SAMPLE_GRID_MAX,
  LIGHT_TEXT_MAX_BACKDROP_LUMINANCE,
  contrastRatio,
  evaluateRegions,
  lightness,
  type Region,
} from "@/lib/designData"
import {
  CANVAS,
  IMAGE_PX,
  busyStripes,
  calmDark,
  checkerboard,
  cropRowsBusy,
  encodePng,
  midGrey,
  toDataUrl,
  type Shape,
} from "./heroFixtures"

const textRegion = (x: number, y: number, w: number, h: number): Region => ({
  rect: { x, y, w, h },
  purpose: "text",
  minAreaPct: 20,
})
// The version-1 SQUARE and PORTRAIT text regions of product-showcase.
const REGION: Record<Shape, Region> = { SQUARE: textRegion(0, 0, 45, 100), PORTRAIT: textRegion(0, 0, 100, 38) }

const stddev = (xs: readonly number[]) => {
  const m = xs.reduce((s, v) => s + v, 0) / xs.length
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length)
}
const lStddev = (lum: readonly number[]) => stddev(lum.map(lightness))
const passFraction = (lum: readonly number[], toneL: number) =>
  lum.filter((l) => contrastRatio(l, toneL) >= 4.5).length / lum.length

describe("the sampler runs in real Chromium", () => {
  it("runs with MOCK_PUPPETEER off", () => {
    expect(MOCK_PUPPETEER).toBe(false)
  })
})

describe.each(["SQUARE", "PORTRAIT"] as const)("AC-11 verdicts on real pixels, %s", (shape) => {
  const canvas = CANVAS[shape]
  const regions = [REGION[shape]]

  it("a calm dark image passes, with a wide margin on both rules", async () => {
    const [s] = await sampleRegionLuminance(await calmDark(shape), regions, canvas)
    expect(s!.luminance.length).toBeGreaterThanOrEqual(MIN_SAMPLES)
    expect(s!.luminance.length).toBeLessThanOrEqual(SAMPLE_GRID_MAX)
    expect(evaluateRegions([s], regions, "light")).toEqual({ ok: true })
    expect(lStddev(s!.luminance)).toBeLessThan(BUSY_STDDEV_MAX / 4)
    expect(passFraction(s!.luminance, 1)).toBe(1)
    expect(Math.max(...s!.luminance)).toBeLessThan(LIGHT_TEXT_MAX_BACKDROP_LUMINANCE / 4)
  })

  it("a busy stripe image fails busy", async () => {
    const [s] = await sampleRegionLuminance(await busyStripes(shape), regions, canvas)
    expect(evaluateRegions([s], regions, "light")).toMatchObject({ ok: false, reason: "busy" })
    expect(lStddev(s!.luminance)).toBeGreaterThan(BUSY_STDDEV_MAX * 3)
  })

  it("a mid-grey image is calm but fails contrast for light text", async () => {
    const [s] = await sampleRegionLuminance(await midGrey(shape), regions, canvas)
    expect(lStddev(s!.luminance)).toBeLessThan(BUSY_STDDEV_MAX / 10)
    expect(evaluateRegions([s], regions, "light")).toMatchObject({ ok: false, reason: "contrast" })
    expect(passFraction(s!.luminance, 1)).toBe(0)
    // It passes for dark text (L about 0.216 clears the 0.200 floor): the rule
    // is about the tone, not about greys.
    expect(evaluateRegions([s], regions, "dark")).toEqual({ ok: true })
  })

  it("the sampled area and the grid match the region", async () => {
    const [calm] = await sampleRegionLuminance(await calmDark(shape), regions, canvas)
    expect(calm!.areaPct).toBeCloseTo((REGION[shape].rect.w * REGION[shape].rect.h) / 100, 6)
    expect(calm!.luminance.length).toBeGreaterThan(SAMPLE_GRID_MAX * 0.9)
  })
})

describe("AC-11 the cover-fit mapping on a 1024x1536 image (canvas 1080x1350)", () => {
  const canvas = CANVAS.PORTRAIT
  // The left 45%, full height: canvas 0..486 x 0..1350 = image x 0..460.8,
  // y 128..1408; image rows 0..127 and 1408..1535 are cropped off the canvas.
  const regions = [textRegion(0, 0, 45, 100)]

  it("the fixture really is 1024x1536", () => {
    expect(IMAGE_PX.PORTRAIT).toEqual({ w: 1024, h: 1536 })
  })

  it("busy content only inside the cropped rows does not fail the check", async () => {
    const [s] = await sampleRegionLuminance(await cropRowsBusy("cropped"), regions, canvas)
    expect(evaluateRegions([s], regions, "light")).toEqual({ ok: true })
    expect(lStddev(s!.luminance)).toBeLessThan(BUSY_STDDEV_MAX / 4)
  })

  it("the same content inside the visible rows fails busy", async () => {
    const [s] = await sampleRegionLuminance(await cropRowsBusy("visible"), regions, canvas)
    expect(evaluateRegions([s], regions, "light")).toMatchObject({ ok: false, reason: "busy" })
  })
})

describe("A3: point sampling, smoothing off", () => {
  const N = 256 // a one-pixel checkerboard, 256 x 256
  const canvas = { width: N, height: N } // the cover fit is the identity
  const whole = [textRegion(0, 0, 100, 100)]

  it("every sample is exactly a black or a white pixel, never a blend", async () => {
    const [s] = await sampleRegionLuminance(checkerboard(N), whole, canvas)
    expect(s!.luminance.length).toBeLessThan(N * N) // it downsampled (about 63 x 63)
    expect([...new Set(s!.luminance)].sort()).toEqual([0, 1])
    // Both colours are present in a sensible proportion: it is a checkerboard.
    const white = s!.luminance.filter((l) => l === 1).length / s!.luminance.length
    expect(white).toBeGreaterThan(0.35)
    expect(white).toBeLessThan(0.65)
    // A textured region reads as textured.
    expect(lStddev(s!.luminance)).toBeGreaterThan(BUSY_STDDEV_MAX * 3)
  })

  it("control: the same downscale with smoothing ON does produce blended greys", async () => {
    // Proves the fixture can tell the two apart, so the assertion above has teeth.
    const url = checkerboard(N)
    const grey = await evaluateInRenderedPage("<!doctype html><html><body></body></html>", 100, 100, (page) =>
      page.evaluate(
        async (u: string, size: number) => {
          const img = new Image()
          img.src = u
          await img.decode()
          const c = document.createElement("canvas")
          c.width = 63
          c.height = 63
          const ctx = c.getContext("2d", { willReadFrequently: true })!
          ctx.imageSmoothingEnabled = true
          ctx.drawImage(img, 0, 0, size, size, 0, 0, 63, 63)
          const d = ctx.getImageData(0, 0, 63, 63).data
          let n = 0
          for (let i = 0; i < d.length; i += 4) if (d[i] > 0 && d[i] < 255) n++
          return n
        },
        url,
        N
      ),
      null
    )
    expect(grey).toBeGreaterThan(100)
  })

  it("drops points with alpha under 128 (a transparent half is not sampled)", async () => {
    const [s] = await sampleRegionLuminance(checkerboard(N, { transparentLeft: true }), whole, canvas)
    const [full] = await sampleRegionLuminance(checkerboard(N), whole, canvas)
    expect(s!.luminance.length).toBeLessThan(full!.luminance.length * 0.6)
    expect(s!.luminance.length).toBeGreaterThan(full!.luminance.length * 0.4)
    // The areaPct is the region's, not the opaque part's.
    expect(s!.areaPct).toBeCloseTo(100, 6)
  })

  it("a fully transparent image leaves too few usable samples: region-invalid", async () => {
    const url = toDataUrl(encodePng(64, 64, new Uint8Array(64 * 64 * 4)))
    const [s] = await sampleRegionLuminance(url, whole, { width: 64, height: 64 })
    expect(s!.luminance).toHaveLength(0)
    expect(evaluateRegions([s], whole, "light")).toMatchObject({ ok: false, reason: "region-invalid" })
  })
})

describe("AC-12 fail closed on the real path", () => {
  const canvas = CANVAS.SQUARE
  const regions = [textRegion(0, 0, 45, 100)]

  it("a non-data: URL is a HeroCheckError", async () => {
    for (const url of ["http://169.254.169.254/x.png", "https://example.com/x.png", "file:///etc/passwd"]) {
      await expect(sampleRegionLuminance(url, regions, canvas)).rejects.toBeInstanceOf(HeroCheckError)
    }
  })

  it("an undecodable image is a HeroCheckError", async () => {
    await expect(sampleRegionLuminance("data:image/png;base64,AAAAAAAA", regions, canvas)).rejects.toBeInstanceOf(
      HeroCheckError
    )
    await expect(sampleRegionLuminance("data:text/plain;base64,aGVsbG8=", regions, canvas)).rejects.toBeInstanceOf(
      HeroCheckError
    )
  })

  it("a run past the timeout is a HeroCheckError, and the sampler still works after it", async () => {
    expect(HERO_CHECK_TIMEOUT_MS).toBe(20_000)
    const url = await calmDark("SQUARE")
    await expect(sampleRegionLuminance(url, regions, canvas, 1)).rejects.toThrow(/timed out/)
    const [s] = await sampleRegionLuminance(url, regions, canvas)
    expect(evaluateRegions([s], regions, "light")).toEqual({ ok: true })
  })

  it("a region the mapping rejects comes back null, and evaluateRegions fails it closed", async () => {
    const degenerate = [textRegion(0, 0, 0, 0)]
    const out = await sampleRegionLuminance(await calmDark("SQUARE"), degenerate, canvas)
    expect(out).toEqual([null])
    expect(evaluateRegions(out, degenerate, "light")).toMatchObject({ ok: false, reason: "region-invalid" })
  })

  it("the pass fraction the contrast fixtures were tuned against is unchanged", () => {
    expect(CONTRAST_PASS_FRACTION).toBe(0.95)
  })
})
