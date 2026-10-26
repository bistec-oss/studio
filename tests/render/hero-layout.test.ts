// Change 009 T3 — the layout observation's in-page extraction against real
// Chromium (AC-14, the real half). Boxes are canvas percent.

import { describe, expect, it, vi } from "vitest"
import { MOCK_PUPPETEER } from "@/lib/testHooks"
import { measureLayoutBoxes, observeLayout } from "@/lib/renderer/layoutFacts"
import type { Region } from "@/lib/designData"
import { BACKGROUND, BRIEF_IMAGE, KIT_LOGO, layoutPage } from "./heroFixtures"

const W = 1080
const H = 1080
const opts = { width: W, height: H, logoUrls: [KIT_LOGO], excludeUrls: [BACKGROUND] }
const left: Region = { rect: { x: 0, y: 0, w: 50, h: 100 }, purpose: "text", minAreaPct: 20 }
const pct = (px: number, total: number) => (px / total) * 100
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol

describe("the layout extraction in real Chromium", () => {
  it("runs with MOCK_PUPPETEER off", () => {
    expect(MOCK_PUPPETEER).toBe(false)
  })

  it("reports the tight text box, not the block's width", async () => {
    const boxes = await measureLayoutBoxes(layoutPage(), opts)
    const text = boxes.find((b) => near(b.x, pct(60, W), 0.2) && near(b.y, pct(80, H), 3))
    expect(text).toBeDefined()
    // The block is 440 css px (40.7%) wide; "Hi" at 56px is far narrower.
    expect(text!.w).toBeLessThan(pct(440, W) / 3)
    expect(text!.w).toBeGreaterThan(0)
  })

  it("reports the kit logo <img> at its box", async () => {
    const boxes = await measureLayoutBoxes(layoutPage(), opts)
    const logo = boxes.find((b) => near(b.w, pct(120, W), 0.05) && near(b.h, pct(60, H), 0.05))
    expect(logo).toBeDefined()
    expect(near(logo!.x, pct(60, W), 0.05)).toBe(true)
    expect(near(logo!.y, pct(900, H), 0.05)).toBe(true)
  })

  it("ignores the background image, the full-bleed decoration, the brief image and hidden text", async () => {
    const boxes = await measureLayoutBoxes(layoutPage(), opts)
    // Exactly two: the "Hi" text node and the logo. Nothing sits where the
    // brief image (x 700..1000) or the hidden text (x 700) is.
    expect(boxes).toHaveLength(2)
    expect(boxes.some((b) => b.x > pct(600, W))).toBe(false)
  })

  it("a kit logo that covers over 60% of the canvas is a full-bleed element, not measured", async () => {
    const boxes = await measureLayoutBoxes(layoutPage(`<img class="fullbleed" src="${KIT_LOGO}">`), opts)
    expect(boxes).toHaveLength(2)
  })

  it("an excluded URL is not measured even if it is also a logo URL", async () => {
    const html = layoutPage(
      `<img style="position:absolute;left:600px;top:100px;width:100px;height:100px" src="${KIT_LOGO}">`
    )
    expect(await measureLayoutBoxes(html, opts)).toHaveLength(3) // text, logo, the extra logo copy
    expect(await measureLayoutBoxes(html, { ...opts, excludeUrls: [BACKGROUND, KIT_LOGO] })).toHaveLength(1)
  })

  it("brief images are not measured: with no logo URLs only the text is", async () => {
    const boxes = await measureLayoutBoxes(layoutPage(), { ...opts, logoUrls: [] })
    expect(boxes).toHaveLength(1)
    expect(BRIEF_IMAGE).not.toBe(KIT_LOGO)
  })
})

describe("observeLayout settles a verdict, and never throws", () => {
  it("everything inside the text region is ok (within the 2% tolerance)", async () => {
    expect(await observeLayout(layoutPage(), [left], opts)).toEqual({ ok: true })
  })

  it("text placed in the image area is a violation", async () => {
    const stray = `<p style="position:absolute;left:760px;top:500px;margin:0;font-size:40px">Stray</p>`
    expect(await observeLayout(layoutPage(stray), [left], opts)).toEqual({ ok: false, outside: 1 })
  })

  it("a logo placed outside the region is counted too", async () => {
    const stray = `<img style="position:absolute;left:800px;top:900px;width:120px;height:60px" src="${KIT_LOGO}">`
    expect(await observeLayout(layoutPage(stray), [left], opts)).toEqual({ ok: false, outside: 1 })
  })

  it("a measurement error returns null and logs", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      expect(await observeLayout(layoutPage(), [left], { ...opts, width: -5 })).toBeNull()
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})
