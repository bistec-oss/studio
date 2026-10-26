// 030 T2: the headline check against real Chromium (AC-06, AC-07, NFR-04).
//
// Each fixture goes through renderPost, the production render, with
// MOCK_PUPPETEER off. The text stand-in (mockHeadlineCheck) is compared with
// Chromium for the four fixtures it can see (AC-07).
import { describe, expect, it } from "vitest"
import { MOCK_PUPPETEER } from "@/lib/testHooks"
import { evaluateInRenderedPage, renderPost, runHeadlineCheck } from "@/lib/renderer/puppeteer"
import { mockHeadlineCheck, type HeadlineCheck } from "@/lib/renderedText"
import { compositeRectPx, insertComposite } from "@/lib/composite/insert"
import { COMPOSITE_TOKEN, type CompositeRender } from "@/lib/composite/render"
import { encodePng, toDataUrl } from "./heroFixtures"

const HEADLINE = "Spring Launch Sale"

const page = (body: string, css = "", head = "", w = 1080, h = 1080) =>
  `<!doctype html><html><head><meta charset="utf-8">${head}<style>html,body{margin:0;width:${w}px;height:${h}px;background:#10243f;color:#fff;font-family:sans-serif}${css}</style></head><body>${body}</body></html>`

interface Fixture {
  name: string
  html: string
  want: HeadlineCheck
  headline?: string
  mockSame?: boolean
  size?: { width: number; height: number }
  composites?: CompositeRender
}

const timings: Array<{ name: string; checkMs: number }> = []

async function run(f: Fixture) {
  const size = f.size ?? { width: 1080, height: 1080 }
  const out = await renderPost(f.html, size.width, size.height, f.composites ?? null, {
    headline: f.headline ?? HEADLINE,
  })
  // The check's own cost (NFR-04): the same collector and verdict on a loaded
  // page, timed inside it, so the settle wait is not counted.
  const checkMs = await evaluateInRenderedPage(
    f.html,
    size.width,
    size.height,
    async (p) => {
      const t0 = performance.now()
      await runHeadlineCheck(p, f.headline ?? HEADLINE, size)
      return Math.round((performance.now() - t0) * 10) / 10
    },
    f.composites ?? null,
  )
  timings.push({ name: f.name, checkMs })
  return out
}

const fixtures: Fixture[] = [
  { name: "plain h1", html: page(`<h1 style="margin:100px 60px">${HEADLINE}</h1>`), want: "painted", mockSame: true },
  {
    name: "split by a span and a br",
    html: page(`<h1 style="margin:100px 60px">Spring <span style="color:#f90">Launch</span><br>Sale</h1>`),
    want: "painted",
    mockSame: true,
  },
  {
    name: "text-transform uppercase over a lower-case source",
    html: page(`<h1 style="margin:100px 60px;text-transform:uppercase">spring launch sale</h1>`),
    want: "painted",
    headline: "spring launch sale",
  },
  {
    name: "only in the title",
    html: page(`<p>Something else entirely</p>`, "", `<title>${HEADLINE}</title>`),
    want: "not-found",
    mockSame: true,
  },
  {
    name: "display none",
    html: page(`<h1 style="display:none">${HEADLINE}</h1><p>other</p>`),
    want: "not-visible",
  },
  { name: "opacity 0", html: page(`<h1 style="opacity:0;margin:100px 60px">${HEADLINE}</h1>`), want: "not-visible" },
  {
    name: "clipped by overflow hidden on a parent",
    html: page(
      // Partly clipped: the line's centre stays inside the 50 px box, so the
      // topmost sample passes and only the clip-box step can refuse it.
      `<div style="position:absolute;left:60px;top:100px;width:960px;height:50px;overflow:hidden"><h1 style="margin:0;white-space:nowrap;font-size:60px;line-height:72px">${HEADLINE}</h1></div>`,
    ),
    want: "not-visible",
  },
  {
    name: "covered by a later positioned element",
    html: page(
      `<h1 style="margin:100px 60px">${HEADLINE}</h1><div style="position:absolute;left:0;top:0;width:1080px;height:1080px;background:#10243f;z-index:5"></div>`,
    ),
    want: "not-visible",
  },
  {
    name: "outside the canvas",
    html: page(`<h1 style="position:absolute;left:2000px;top:100px;margin:0">${HEADLINE}</h1>`),
    want: "not-visible",
  },
  {
    name: "shown twice",
    html: page(`<h1 style="margin:60px">${HEADLINE}</h1><h2 style="margin:60px">${HEADLINE}</h2>`),
    want: "ambiguous",
    mockSame: true,
  },
  {
    name: "STORY 1080x1920",
    html: page(`<h1 style="margin:300px 60px">${HEADLINE}</h1>`, "", "", 1080, 1920),
    want: "painted",
    size: { width: 1080, height: 1920 },
  },
]

describe("the headline check on a real page (AC-06, AC-07)", () => {
  it("the real renderer is on", () => {
    expect(MOCK_PUPPETEER).toBe(false)
  })

  for (const f of fixtures) {
    it(`${f.name}: ${f.want}`, async () => {
      const out = await run(f)
      expect(out.headlineCheck).toBe(f.want)
      expect(out.png.subarray(1, 4).toString()).toBe("PNG")
      if (f.mockSame) expect(mockHeadlineCheck(f.html, f.headline ?? HEADLINE)).toBe(f.want)
    })
  }

  it("a 025 composite with a visible headline is painted", async () => {
    const canvas = { width: 1080, height: 1080 }
    const rect = { x: 17, y: 44, w: 72, h: 45 }
    const rgba = new Uint8Array(16 * 10 * 4).fill(200)
    const composites: CompositeRender = {
      token: COMPOSITE_TOKEN,
      dataUri: toDataUrl(encodePng(16, 10, rgba)),
      rectPx: compositeRectPx(rect, canvas),
    }
    const html = insertComposite(page(`<h1 style="margin:60px">${HEADLINE}</h1>`), rect, canvas)
    const out = await run({ name: "composite + headline", html, want: "painted", composites })
    expect(out.headlineCheck).toBe("painted")
  })

  it("no check asked: no verdict", async () => {
    const out = await renderPost(fixtures[0].html, 1080, 1080, null, null)
    expect(out.headlineCheck).toBeNull()
  })

  it("logs the time of the check per fixture (NFR-04)", () => {
    process.stderr.write(`headline check timings (ms): ${JSON.stringify(timings)}
`)
    expect(timings.length).toBeGreaterThan(0)
  })
})
