// 031 T14: Apply's in-render check against real Chromium (AC-37). The fixtures
// go through spliceText (T13) and renderPost with `absent` set to the old text.
import { describe, expect, it } from "vitest"
import { MOCK_PUPPETEER } from "@/lib/testHooks"
import { renderPost } from "@/lib/renderer/puppeteer"
import { precheckApply } from "@/lib/applyText/candidates"
import { spliceText } from "@/lib/applyText/splice"

const OLD = "Spring Launch Sale"
const NEW = "Summer Clearance Event"

const page = (body: string, css = "") =>
  `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:1080px;height:1080px;background:#10243f;color:#fff;font-family:sans-serif}${css}</style></head><body>${body}</body></html>`

function splice(html: string): string {
  const pre = precheckApply(html, OLD, NEW)
  if (!pre.ok) throw new Error(pre.failure)
  const out = spliceText(html, pre.candidate, NEW)
  if (!out.ok) throw new Error(out.failure)
  return out.html
}

async function check(html: string) {
  return renderPost(html, 1080, 1080, null, { headline: NEW, absent: [OLD] })
}

describe("Apply's in-render check on a real page (AC-37)", () => {
  it("the real renderer is on", () => {
    expect(MOCK_PUPPETEER).toBe(false)
  })

  it("after a splice the new text is painted once and the old text is gone", async () => {
    const html = splice(page(`<h1 style="margin:100px 60px">${OLD}</h1><p>footer</p>`))
    const out = await check(html)
    expect(out.headlineCheck).toBe("painted")
    expect(out.absentPainted).toBe(0)
  })

  it("the old headline also painted elsewhere (a CSS ::after copy) is not counted as gone", async () => {
    // The ::after copy is generated content, not a DOM text node, so the DOM
    // collector cannot see it: a second element holding the old text stands in.
    // The copy is added after the splice, as a model's second occurrence would
    // be; the pre-check would refuse it before the render.
    const html = splice(page(`<h1 style="margin:100px 60px">${OLD}</h1>`)).replace(
      "</body>",
      `<div style="margin:20px 60px">${OLD}</div></body>`,
    )
    const out = await check(html)
    expect(out.headlineCheck).toBe("painted")
    expect(out.absentPainted).toBe(1)
  })

  it("an old copy in a pseudo-element is invisible to the collector (stated limit)", async () => {
    const html = splice(page(`<h1 class="t" style="margin:100px 60px">${OLD}</h1>`, `.t::after{content:"${OLD}"}`))
    const out = await check(html)
    expect(out.absentPainted).toBe(0)
  })

  it("the target hidden is not painted", async () => {
    const html = splice(page(`<h1 style="margin:100px 60px;opacity:0">${OLD}</h1>`))
    const out = await check(html)
    expect(out.headlineCheck).toBe("not-visible")
    expect(out.absentPainted).toBe(0)
  })
})
