// 031 T7: the post fonts against real Chromium (MOCK_PUPPETEER off; see vitest.render.config.ts).
//
// AC-21: a Sinhala string in an element whose stack applyPostFonts extended paints with the
// script font, and without the extension falls back. AC-23: renderPost reports a family that
// cannot load in `fontsMissing`, and a check that throws gives [].
//
// No network: the script font is a synthetic TrueType face (syntheticFont.ts) served as a
// `data:` URI in an @font-face, and the marked link points at an off-allowlist host, so the
// renderer's egress filter aborts it (the families are still read from its href).
import { describe, expect, it, vi } from "vitest"
import type { Page } from "puppeteer-core"
import { MOCK_PUPPETEER } from "@/lib/testHooks"
import { evaluateInRenderedPage, renderPost, runFontCheck } from "@/lib/renderer/puppeteer"
import { applyPostFonts } from "@/lib/fonts/inject"
import { syntheticFontDataUri } from "./syntheticFont"

const SINHALA_RANGE: Array<[number, number]> = [[0x0d80, 0x0dff]]
const SINHALA_FACE = "Test Sinhala"
const SINHALA_TEXT = "සිංහල අකුරු"
const W = 600
const H = 300

// An off-allowlist host: the request is aborted, so no stylesheet (and no face) arrives from it.
const blockedUrl = (families: string[]) =>
  `https://fonts.blocked.invalid/css2?${families.map((f) => `family=${f.replace(/ /g, "+")}`).join("&")}&display=swap`

const fontFace = (family: string, src: string) => `@font-face{font-family:'${family}';src:url(${src}) format('truetype')}`

const page = (css: string, body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:${W}px;height:${H}px;background:#fff}${css}</style></head><body>${body}</body></html>`

const BASE = page(
  `${fontFace(SINHALA_FACE, syntheticFontDataUri(SINHALA_FACE, SINHALA_RANGE))}
   .t{font-family:'Brand Latin Absent', sans-serif;font-size:48px}`,
  `<p class="t" id="t">${SINHALA_TEXT}</p>`,
)

interface Painted {
  status: string | null
  platformFonts: Array<{ familyName: string; isCustomFont: boolean; glyphCount: number }>
  stack: string
}

// Which faces painted #t: the face's status in document.fonts (a web font loads only when text
// needs it) and the platform fonts Chromium used for the node's glyphs (DevTools protocol).
async function paintedFaces(html: string): Promise<Painted> {
  return evaluateInRenderedPage(
    html,
    W,
    H,
    async (p: Page) => {
      const { status, stack } = await p.evaluate(async (family: string) => {
        await document.fonts.ready
        let found: string | null = null
        document.fonts.forEach((f) => {
          if (f.family.replace(/^["']|["']$/g, "") === family) found = f.status
        })
        return { status: found as string | null, stack: getComputedStyle(document.getElementById("t")!).fontFamily }
      }, SINHALA_FACE)
      const cdp = await p.createCDPSession()
      await cdp.send("DOM.enable")
      await cdp.send("CSS.enable")
      const { root } = await cdp.send("DOM.getDocument")
      const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: "#t" })
      const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId })
      await cdp.detach()
      return { status, platformFonts: fonts, stack }
    },
    null,
  )
}

describe("031 AC-21: the script font in the stack paints the Sinhala text", () => {
  it("the suite runs on real Chromium", () => {
    expect(MOCK_PUPPETEER).toBe(false)
  })

  it("with the stack extended by applyPostFonts, the Sinhala glyphs come from the script font", async () => {
    const extended = applyPostFonts(BASE, { families: [], scriptFamilies: [SINHALA_FACE] }, blockedUrl)
    expect(extended).toContain(`.t{font-family:'Brand Latin Absent', '${SINHALA_FACE}', sans-serif`)
    const got = await paintedFaces(extended)
    expect(got.stack).toContain(SINHALA_FACE)
    expect(got.status).toBe("loaded")
    const custom = got.platformFonts.find((f) => f.isCustomFont)
    expect(custom, JSON.stringify(got.platformFonts)).toBeDefined()
    expect(custom!.familyName).toBe(SINHALA_FACE)
    // Every Sinhala glyph (the space aside) came from it.
    expect(custom!.glyphCount).toBeGreaterThanOrEqual(Array.from(SINHALA_TEXT.replace(/ /g, "")).length - 2)
  })

  it("without the extension, the same text falls back and the script font is never used", async () => {
    const got = await paintedFaces(BASE)
    expect(got.stack).not.toContain(SINHALA_FACE)
    expect(got.status).toBe("unloaded")
    expect(got.platformFonts.some((f) => f.familyName === SINHALA_FACE)).toBe(false)
  })
})

describe("031 AC-23: renderPost reports the post fonts that did not load", () => {
  const BROKEN = "data:font/ttf;base64,AAAAAAAAAAAAAAAA"

  it("a family with no face (its stylesheet blocked) and one whose face failed are missing; used and unused faces are not", async () => {
    const css = [
      fontFace(SINHALA_FACE, syntheticFontDataUri(SINHALA_FACE, SINHALA_RANGE)),
      fontFace("Broken Face", BROKEN),
      fontFace("Unused Face", syntheticFontDataUri("Unused Face", SINHALA_RANGE)),
      `.s{font-family:'${SINHALA_FACE}', sans-serif;font-size:40px}`,
      `.b{font-family:'Broken Face', sans-serif;font-size:40px}`,
    ].join("\n")
    const html = applyPostFonts(
      page(css, `<p class="s">${SINHALA_TEXT}</p><p class="b">Broken</p>`),
      { families: ["Ghost Font", "Broken Face", "Unused Face"], scriptFamilies: [SINHALA_FACE] },
      blockedUrl,
    )
    const out = await renderPost(html, W, H, null, null)
    expect(out.png.length).toBeGreaterThan(0)
    expect(out.fontsMissing).toEqual(["Ghost Font", "Broken Face"])
  })

  it("a render with no marked link reports nothing", async () => {
    const out = await renderPost(BASE, W, H, null, { headline: "x" })
    expect(out.fontsMissing).toEqual([])
  })

  it("a check that throws gives [] and never fails the render", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const throwing = { evaluate: async () => { throw new Error("evaluate failed") } }
    expect(await runFontCheck(throwing as never)).toEqual([])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[renderer] font check: evaluate failed"))
    warn.mockRestore()
  })
})
