// 025 T8: the composite against real Chromium (AC-12, FR-13, FR-14, A1).
//
// A 16:10 test pattern (four coloured quadrants and a 1 px grid) is placed at a
// STAMPED rect that differs from the contract region, at every size. The PNG's
// colour at each quadrant centre must match the source within DeltaE 3, and the
// element's box must sit within 2 px of the rect. A missing object, a covering
// element and a moved element each throw CompositeRenderError with the right
// reason. The 10 MB setContent timing is logged (see reports/T8.md).
import { describe, expect, it, vi } from "vitest"
import type { Page } from "puppeteer-core"
import { MOCK_PUPPETEER } from "@/lib/testHooks"
import { evaluateInRenderedPage, renderHtmlToPng } from "@/lib/renderer/puppeteer"
import { compositeRectPx, insertComposite } from "@/lib/composite/insert"
import { COMPOSITE_TOKEN, CompositeRenderError, type CompositeRender } from "@/lib/composite/render"
import { ASPECT_DIMENSIONS } from "@/lib/aspectRatio"
import { archetypes, compositeRegionOf, type Rect } from "@/lib/designData"
import { measureLayoutBoxes } from "@/lib/renderer/layoutFacts"
import { extractDomFacts } from "@/lib/renderer/domFacts"
import { encodePng, toDataUrl } from "./heroFixtures"
import { decodePng } from "../../scripts/glyph-check/glyphCoverage.mjs"

// The object store is not part of a render test: a key maps to a fixture, and
// anything else is missing (the real getObjectBytes throws on a missing key).
const store = vi.hoisted(() => ({ objects: new Map<string, Buffer>() }))
vi.mock("@/lib/storage/minio", () => ({
  BUCKET_DOCS: "docs",
  getObjectBytes: async (_bucket: string, key: string) => {
    const bytes = store.objects.get(key)
    if (!bytes) throw new Error(`NoSuchKey: ${key}`)
    return bytes
  },
}))
import { compositeRenderForSource } from "@/lib/composite/assets"

type Size = "SQUARE" | "PORTRAIT" | "STORY"
// A detected screen per size: 16:10 in canvas pixels, inside the canvas, clear of
// the text band, and NOT the contract region.
const DETECTED: Record<Size, Rect> = {
  SQUARE: { x: 17, y: 44, w: 72, h: 45 },
  PORTRAIT: { x: 12, y: 47, w: 80, h: 40 },
  STORY: { x: 10, y: 46, w: 84, h: 29.5 },
}

const SRC_W = 1600
const SRC_H = 1000
const QUADRANTS = [
  { fx: 0.25, fy: 0.25, rgb: [221, 51, 51] },
  { fx: 0.75, fy: 0.25, rgb: [51, 170, 51] },
  { fx: 0.25, fy: 0.75, rgb: [51, 51, 221] },
  { fx: 0.75, fy: 0.75, rgb: [221, 221, 51] },
] as const

// 1600 x 1000 (16:10): four flat quadrants and a 1 px grid every 160 px (no
// quadrant centre sits on a line).
function testPattern(): Buffer {
  const rgba = new Uint8Array(SRC_W * SRC_H * 4)
  for (let y = 0; y < SRC_H; y++) {
    for (let x = 0; x < SRC_W; x++) {
      const q = QUADRANTS[(y < SRC_H / 2 ? 0 : 2) + (x < SRC_W / 2 ? 0 : 1)]
      const grid = x % 160 === 0 || y % 160 === 0
      const o = (y * SRC_W + x) * 4
      rgba[o] = grid ? 40 : q.rgb[0]
      rgba[o + 1] = grid ? 40 : q.rgb[1]
      rgba[o + 2] = grid ? 40 : q.rgb[2]
      rgba[o + 3] = 255
    }
  }
  return encodePng(SRC_W, SRC_H, rgba)
}

// CIE76 colour difference between two sRGB colours.
function lab(rgb: ArrayLike<number>): [number, number, number] {
  const [r, g, b] = [rgb[0], rgb[1], rgb[2]]
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const [R, G, B] = [lin(r), lin(g), lin(b)]
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]
}
const deltaE = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  const [l1, a1, b1] = lab(a)
  const [l2, a2, b2] = lab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

const PAGE = (w: number, h: number) =>
  `<!doctype html><html><head><style>html,body{margin:0;width:${w}px;height:${h}px;background:#10243f}</style></head><body><h1 style="color:#fff">Headline</h1></body></html>`

function renderArg(png: Buffer, rect: Rect, size: Size): CompositeRender {
  return { token: COMPOSITE_TOKEN, dataUri: toDataUrl(png), rectPx: compositeRectPx(rect, ASPECT_DIMENSIONS[size]) }
}

const boxOf = (page: Page) =>
  page.evaluate(() => {
    const b = document.querySelector('[data-composite="0"]')!.getBoundingClientRect()
    return { left: b.left, top: b.top, width: b.width, height: b.height }
  })

describe("the composite on a real page (AC-12, amended by A1)", () => {
  it("the real renderer is on (the harness refuses the mock)", () => {
    expect(MOCK_PUPPETEER).toBe(false)
  })

  for (const size of ["SQUARE", "PORTRAIT", "STORY"] as const) {
    it(`${size}: the quadrant colours match within DeltaE 3 and the box is within 2 px of the stamped rect`, async () => {
      const canvas = ASPECT_DIMENSIONS[size]
      const rect = DETECTED[size]
      // The test proves the STAMPED rect is used: it is not the contract region.
      expect(rect).not.toEqual(compositeRegionOf(archetypes["device-screen"].versions[1].sizes[size]!)!.rect)
      const composites = renderArg(testPattern(), rect, size)
      const html = insertComposite(PAGE(canvas.width, canvas.height), rect, canvas)

      const box = await evaluateInRenderedPage(html, canvas.width, canvas.height, boxOf, composites)
      for (const [edge, got, want] of [
        ["left", box.left, composites.rectPx.left],
        ["top", box.top, composites.rectPx.top],
        ["right", box.left + box.width, composites.rectPx.left + composites.rectPx.width],
        ["bottom", box.top + box.height, composites.rectPx.top + composites.rectPx.height],
      ] as const) {
        expect(Math.abs(got - want), `${size} ${edge}`).toBeLessThanOrEqual(2)
      }

      const png = decodePng(await renderHtmlToPng(html, canvas.width, canvas.height, composites))
      const scale = png.width / canvas.width
      expect(png.height / canvas.height).toBe(scale)
      for (const q of QUADRANTS) {
        const cssX = composites.rectPx.left + composites.rectPx.width * q.fx
        const cssY = composites.rectPx.top + composites.rectPx.height * q.fy
        const o = (Math.round(cssY * scale) * png.width + Math.round(cssX * scale)) * 4
        const got = [png.data[o], png.data[o + 1], png.data[o + 2]]
        expect(deltaE(got, q.rgb), `${size} quadrant at ${q.fx},${q.fy}: ${got} vs ${q.rgb}`).toBeLessThanOrEqual(3)
      }
    })
  }
})

describe("a placement that cannot be checked throws CompositeRenderError (FR-14)", () => {
  const size: Size = "SQUARE"
  const canvas = ASPECT_DIMENSIONS[size]
  const rect = DETECTED[size]
  const make = () => ({
    composites: renderArg(testPattern(), rect, size),
    html: insertComposite(PAGE(canvas.width, canvas.height), rect, canvas),
  })
  const reasonOf = async (html: string, composites: CompositeRender) => {
    try {
      await renderHtmlToPng(html, canvas.width, canvas.height, composites)
    } catch (err) {
      expect(err).toBeInstanceOf(CompositeRenderError)
      lastDetail = (err as CompositeRenderError).message
      return (err as CompositeRenderError).reason
    }
    return "rendered"
  }
  let lastDetail = ""

  it("a missing object is composite-source-missing", async () => {
    store.objects.clear()
    const err = await compositeRenderForSource("screenshots/team-1/user-1/gone.png", rect, "team-1", canvas).catch((e) => e)
    expect(err).toBeInstanceOf(CompositeRenderError)
    expect(err.reason).toBe("composite-source-missing")
  })

  it("a covering element is composite-not-rendered", async () => {
    const { html, composites } = make()
    const covered = html.replace(
      "</body>",
      '<div style="position:fixed;left:0;top:0;width:100%;height:100%;z-index:2147483647"></div></body>',
    )
    expect(await reasonOf(covered, composites)).toBe("composite-not-rendered")
    expect(lastDetail).toContain("covers the composite element")
  })

  it("a moved element is composite-not-rendered", async () => {
    const { html, composites } = make()
    const moved = html.replace("</head>", "<style>div[style*=\"2147483647\"]{left:0px !important;top:0px !important}</style></head>")
    expect(await reasonOf(moved, composites)).toBe("composite-not-rendered")
    expect(lastDetail).toMatch(/edge is at/)
  })

  it("a resized element is composite-not-rendered", async () => {
    const { html, composites } = make()
    const resized = html.replace("</head>", "<style>div[style*=\"2147483647\"]{width:300px !important}</style></head>")
    expect(await reasonOf(resized, composites)).toBe("composite-not-rendered")
    expect(lastDetail).toMatch(/edge is at/)
  })

  it("an undecodable image is composite-not-rendered", async () => {
    const { html, composites } = make()
    const broken = { ...composites, dataUri: "data:image/png;base64,AAAA" }
    expect(await reasonOf(html, broken)).toBe("composite-not-rendered")
  })

  it("a page with no element, or a second element, never reaches the browser's screenshot", async () => {
    const { html, composites } = make()
    expect(await reasonOf(PAGE(canvas.width, canvas.height), composites)).toBe("composite-not-rendered")
    expect(await reasonOf(html.replace("</body>", '<div data-composite="1"></div></body>'), composites)).toBe(
      "composite-not-rendered",
    )
  })

  it("the stored string keeps the token: only the render's copy carries the bytes", async () => {
    const { html, composites } = make()
    await renderHtmlToPng(html, canvas.width, canvas.height, composites)
    expect(html).toContain(COMPOSITE_TOKEN)
    expect(html).not.toContain("data:image/png")
  })
})

describe("the cost of a 10 MB screenshot (NFR-07)", () => {
  it("renders, and logs the setContent time", async () => {
    // Incompressible noise: the PNG comes out at about 10 MB (the upload cap).
    const w = 2300
    const h = 1450
    const noise = new Uint8Array(w * h * 4)
    let s = 12345
    for (let i = 0; i < noise.length; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0
      noise[i] = i % 4 === 3 ? 255 : (s >>> 16) & 255
    }
    const png = encodePng(w, h, noise)
    const size: Size = "SQUARE"
    const canvas = ASPECT_DIMENSIONS[size]
    const rect = DETECTED[size]
    const composites = renderArg(png, rect, size)
    const html = insertComposite(PAGE(canvas.width, canvas.height), rect, canvas)
    // Warm the browser so the timing excludes the launch.
    await renderHtmlToPng(PAGE(canvas.width, canvas.height), canvas.width, canvas.height, null)

    const t0 = performance.now()
    await evaluateInRenderedPage(html, canvas.width, canvas.height, async () => undefined, composites)
    const loadMs = performance.now() - t0
    const t1 = performance.now()
    await renderHtmlToPng(html, canvas.width, canvas.height, composites)
    const renderMs = performance.now() - t1
    console.log(
      `[composite 10MB] png=${(png.length / 1024 / 1024).toFixed(2)} MiB dataUri=${(composites.dataUri.length / 1024 / 1024).toFixed(2)} MiB ` +
        `setContent+check=${loadMs.toFixed(0)} ms, full render=${renderMs.toFixed(0)} ms`,
    )
    expect(png.length).toBeGreaterThan(9.5 * 1024 * 1024)
    expect(loadMs).toBeLessThan(30_000)
  })
})

describe("the placed screenshot is not measured (FR-16)", () => {
  const size: Size = "SQUARE"
  const canvas = ASPECT_DIMENSIONS[size]
  const rect = DETECTED[size]
  const page = () =>
    insertComposite(
      `<!doctype html><html><body style="margin:0;width:${canvas.width}px;height:${canvas.height}px"><p style="margin:0;font:40px sans-serif">Headline</p></body></html>`,
      rect,
      canvas,
    )

  it("layout observation measures the text but not the composite element, even if its source is named a logo", async () => {
    const composites = renderArg(testPattern(), rect, size)
    const boxes = await measureLayoutBoxes(page(), {
      width: canvas.width,
      height: canvas.height,
      // The render copy's img src is this data URI: without the exclusion it would be a measured logo.
      logoUrls: [composites.dataUri],
      composites,
    })
    expect(boxes).toHaveLength(1) // the headline only
    expect(boxes[0].y).toBeLessThan(10)
  })

  it("DOM facts leave the element and its data: URI out", async () => {
    const composites = renderArg(testPattern(), rect, size)
    const facts = await extractDomFacts(page(), { width: canvas.width, height: canvas.height, composites })
    expect(facts.imageSources).toEqual([])
    expect(facts.elements.some((e) => e.imageSources.length > 0)).toBe(false)
  })
})
