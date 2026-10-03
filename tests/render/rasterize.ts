// Real-render test harness (change 004, FR-23 / AC-02 / AC-03).
//
// Drives the production renderer — src/lib/renderer/puppeteer.ts
// renderHtmlToPng, the exact function every generated post goes through — with
// MOCK_PUPPETEER off, and hands back decoded pixels. Reusable by any test that
// needs to assert on what Chromium actually painted: fonts and glyph coverage
// (this change, proposal 007), layout and imagery (009), app surfaces (011).
//
// Runs under its own vitest config (vitest.render.config.ts, `npm run
// test:render`), not the unit suite (which is browser-free by design) and not
// the Playwright suite (which runs with MOCK_PUPPETEER=true globally and never
// imports src/).
//
// Decoding and tofu judgement live in scripts/glyph-check/glyphCoverage.mjs,
// shared verbatim with the in-image check (check-glyphs.mjs) that proves the
// Docker runner image's fonts. A host run proves the harness; only the
// in-image run proves the image — on Windows, Segoe UI Symbol covers ★ whether
// or not the Dockerfile installs a symbol font.

import { renderHtmlToPng } from "@/lib/renderer/puppeteer"
import { MOCK_PNG_BUFFER, MOCK_PUPPETEER } from "@/lib/testHooks"
import {
  assessGlyphProbe,
  buildGlyphProbe,
  decodePng,
  formatGlyphResult,
  judgeGlyph,
  measureInk,
} from "../../scripts/glyph-check/glyphCoverage.mjs"

export { codepointLabel, judgeGlyph, measureInk, TOFU_RULES } from "../../scripts/glyph-check/glyphCoverage.mjs"

/** Decoded RGBA raster at device resolution (renderHtmlToPng renders at 2×). */
export interface RasterImage {
  width: number
  height: number
  data: Uint8Array
  /** Device pixels per CSS pixel. */
  scale: number
}

export type GlyphProbeOptions = NonNullable<Parameters<typeof buildGlyphProbe>[1]>
export type GlyphReport = ReturnType<typeof assessGlyphProbe>
export type GlyphResult = GlyphReport["results"][number]

/**
 * Render arbitrary HTML through the real renderer and decode the PNG. Throws —
 * never skips — if the mock seam is active, so a mis-configured run fails loud
 * instead of asserting on the fixed mock PNG.
 */
export async function rasterize(html: string, width: number, height: number): Promise<RasterImage> {
  if (MOCK_PUPPETEER) {
    throw new Error("rasterize: MOCK_PUPPETEER is on — the render harness must run the real renderer")
  }
  const png = await renderHtmlToPng(html, width, height)
  if (png.equals(MOCK_PNG_BUFFER)) throw new Error("rasterize: renderHtmlToPng returned the mock PNG")
  const image = decodePng(png)
  return { ...image, scale: image.width / width }
}

/** RGBA of one pixel, addressed in CSS pixels (sampled at the device-pixel centre). */
export function pixelAt(image: RasterImage, cssX: number, cssY: number): [number, number, number, number] {
  const x = Math.floor((cssX + 0.5) * image.scale)
  const y = Math.floor((cssY + 0.5) * image.scale)
  const d = (y * image.width + x) * 4
  return [image.data[d], image.data[d + 1], image.data[d + 2], image.data[d + 3]]
}

/**
 * Render each glyph beside a known-covered control glyph at the same size and
 * judge it: covered, or tofu ("blank" / "rectangle"). Glyph-agnostic — works
 * for any codepoint, not a fixed list.
 */
export async function checkGlyphCoverage(glyphs: string[], opts?: GlyphProbeOptions): Promise<GlyphReport> {
  const probe = buildGlyphProbe(glyphs, opts)
  const image = await rasterize(probe.html, probe.width, probe.height)
  return assessGlyphProbe(image, probe)
}

/** Throws a readable, per-glyph message if any glyph renders as tofu. */
export async function assertNoTofu(glyphs: string[], opts?: GlyphProbeOptions): Promise<void> {
  const report = await checkGlyphCoverage(glyphs, opts)
  const bad = report.results.filter((r) => !r.covered)
  if (bad.length) {
    throw new Error(`tofu detected:\n${bad.map(formatGlyphResult).join("\n")}`)
  }
}

/**
 * Tofu check for a region of an already-rasterized page, judged against a
 * control region at the same font size — for tests that render their own HTML
 * rather than the glyph probe. Rects are CSS pixels.
 */
export function judgeRegion(
  image: RasterImage,
  candidate: { x: number; y: number; width: number; height: number },
  control: { x: number; y: number; width: number; height: number }
) {
  const toDevice = (r: typeof candidate) => ({
    x: r.x * image.scale,
    y: r.y * image.scale,
    width: r.width * image.scale,
    height: r.height * image.scale,
  })
  return judgeGlyph(measureInk(image, toDevice(candidate)), measureInk(image, toDevice(control)))
}

export { formatGlyphResult }
