// Render-fidelity suite (change 004, FR-23). Real Chromium via the production
// renderHtmlToPng — see tests/render/rasterize.ts. Run: `npm run test:render`.
//
// ⚠️ What a host run proves: the harness (AC-02, AC-03). It does NOT prove the
// Docker runner image carries symbol fonts (AC-01) — a Windows host covers ★
// with Segoe UI Symbol regardless. AC-01 is proven by
// scripts/glyph-check/check-glyphs.mjs run inside the built image (CI build job).

import { describe, expect, it } from "vitest"
import { MOCK_PUPPETEER } from "@/lib/testHooks"
import { assertNoTofu, checkGlyphCoverage, judgeRegion, pixelAt, rasterize } from "./rasterize"

// Codepoints no shipped font covers: Supplementary PUA-B, and an unassigned
// plane-1 codepoint. They must read as tofu in every environment.
const UNCOVERED = ["\u{10FFFD}", "\u{1FFFD}"]

describe("render harness drives the real renderer (AC-03)", () => {
  it("runs with MOCK_PUPPETEER off", () => {
    expect(MOCK_PUPPETEER).toBe(false)
  })

  it("rasterizes arbitrary HTML to decoded pixels at 2x", async () => {
    const html =
      `<!doctype html><html><body style="margin:0;background:#fff">` +
      `<div style="position:absolute;left:20px;top:10px;width:100px;height:50px;background:#ff0000"></div>` +
      `<div style="position:absolute;left:140px;top:10px;width:40px;height:40px;background:#0000ff"></div>` +
      `</body></html>`
    const image = await rasterize(html, 200, 80)
    expect(image.scale).toBe(2)
    expect([image.width, image.height]).toEqual([400, 160])
    expect(pixelAt(image, 60, 30)).toEqual([255, 0, 0, 255])
    expect(pixelAt(image, 160, 30)).toEqual([0, 0, 255, 255])
    expect(pixelAt(image, 5, 70)).toEqual([255, 255, 255, 255])
  })
})

describe("glyph-agnostic tofu detection against a control glyph (AC-02)", () => {
  it("★ U+2605 is covered on this host (host coverage only — AC-01 is the in-image check)", async () => {
    const { results } = await checkGlyphCoverage(["★"])
    expect(results[0]).toMatchObject({ glyph: "★", codepoints: "U+2605", covered: true, reason: "ok" })
  })

  it("passes covered glyphs of very different shapes", async () => {
    await assertNoTofu(["A", "g", "O", "★", "✓", "→", "•"])
  })

  it("fails codepoints no font covers", async () => {
    const { results } = await checkGlyphCoverage(UNCOVERED)
    for (const r of results) {
      expect(r.covered, `${r.codepoints} should be tofu`).toBe(false)
      expect(["blank", "rectangle"]).toContain(r.reason)
    }
  })

  it("does not flag thin rectangular glyphs — size is judged relative to the control", async () => {
    await assertNoTofu(["—", "|", "_"])
  })

  it("judges each glyph independently within one probe", async () => {
    const { results } = await checkGlyphCoverage(["★", UNCOVERED[0], "A", UNCOVERED[1]])
    expect(results.map((r) => r.covered)).toEqual([true, false, true, false])
  })

  it("assertNoTofu names every offending codepoint", async () => {
    await expect(assertNoTofu(["A", ...UNCOVERED])).rejects.toThrow(/U\+10FFFD[\s\S]*U\+1FFFD/)
  })

  it("judges regions of caller-rendered HTML (reuse by other tests)", async () => {
    const cell = (x: number, ref: string) =>
      `<div style="position:absolute;left:${x}px;top:0;width:240px;height:240px;display:flex;` +
      `align-items:center;justify-content:center;font:120px/1 sans-serif">${ref}</div>`
    const html =
      `<!doctype html><html><body style="margin:0;background:#fff">` +
      cell(0, "H") + cell(240, "&#x2605;") + cell(480, "&#x10fffd;") +
      `</body></html>`
    const image = await rasterize(html, 720, 240)
    const control = { x: 0, y: 0, width: 240, height: 240 }
    expect(judgeRegion(image, { x: 240, y: 0, width: 240, height: 240 }, control).covered).toBe(true)
    expect(judgeRegion(image, { x: 480, y: 0, width: 240, height: 240 }, control).covered).toBe(false)
  })
})
