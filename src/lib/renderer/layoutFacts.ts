// The in-page half of the hero layout observation (change 009, design.md
// section 6, FR-11).
//
// Measures the tight boxes of the visible text and of the kit's logo <img>
// elements in the final rendered document, converts them to canvas percent in
// Node and compares them with the stamped `text` regions (evaluateLayout, the
// pure half). An observation, never a gate: it NEVER throws. A measurement
// error returns null and is logged, and the caller records nothing.
//
// Measured:
//   - every text node with non-blank text whose parent chain is visible
//     (display, visibility, opacity, non-zero size), by the node's own Range:
//     the tight box of the glyphs, not the block's width;
//   - every <img> whose src is in the kit's logo URL set.
// Not measured: the background image (any URL in `excludeUrls`), anything whose
// box covers over 60% of the canvas (a full-bleed decoration), brief images,
// other decoration, shadows, inline-SVG logos, and hidden elements.
//
// MOCK_PUPPETEER: the measurement is not run (returns null); the caller uses
// the mockLayoutBoxes seam and feeds the real evaluateLayout (section 11).
import type { Page } from "puppeteer-core"
import { evaluateLayout, type Rect, type Region } from "@/lib/designData"
import { evaluateInRenderedPage } from "@/lib/renderer/puppeteer"
import type { CompositeRender } from "@/lib/composite/render"
import { MOCK_PUPPETEER } from "@/lib/testHooks"

// A box covering more than this share of the canvas is a full-bleed element,
// not text or a logo.
export const FULL_BLEED_AREA_PCT = 60

// The observation is bounded (T4, carry-over of the T3 review): measureLayoutBoxes
// waits for networkidle0, which can take up to SET_CONTENT_TIMEOUT_MS (60 s), and
// an observation must not stretch the generation's liveness segment (the action
// budget, models/budget.ts, sizes its step to this value). On expiry it records
// nothing. A real measurement is about 1 to 2 s.
export const LAYOUT_OBSERVE_TIMEOUT_MS = 15_000

export type LayoutObservation = { ok: true } | { ok: false; outside: number }

export interface MeasureOptions {
  width: number
  height: number
  // The kit's logo URLs (kit.logoUrl plus its LOGO artifacts).
  logoUrls: readonly string[]
  // URLs never measured even if they appear as an <img> (the background image).
  excludeUrls?: readonly string[]
  // 025: the composite argument for a draft whose HTML carries the screenshot
  // token (generation passes it; a stamp-driven caller builds it with
  // compositeRenderFor). The placed element itself is never measured.
  composites?: CompositeRender | null
}

interface PxBox {
  x: number
  y: number
  w: number
  h: number
}

// Canvas-percent boxes of the visible text and the kit logos. Throws on a
// browser error; observeLayout is the never-throwing wrapper.
export async function measureLayoutBoxes(html: string, opts: MeasureOptions): Promise<Rect[]> {
  const { width, height } = opts
  const pxBoxes = await evaluateInRenderedPage(html, width, height, (page: Page) =>
    page.evaluate(
      (logos: string[], exclude: string[]) => {
        const logoSet = new Set(logos)
        const excludeSet = new Set(exclude)
        const out: { x: number; y: number; w: number; h: number }[] = []
        const sx = window.scrollX
        const sy = window.scrollY

        const visible = (el: Element | null): boolean => {
          for (let e = el; e; e = e.parentElement) {
            const cs = getComputedStyle(e)
            if (cs.display === "none" || cs.visibility === "hidden" || cs.visibility === "collapse") return false
            if (parseFloat(cs.opacity) === 0) return false
          }
          return true
        }
        const push = (r: DOMRect) => {
          if (r.width > 0 && r.height > 0) out.push({ x: r.left + sx, y: r.top + sy, w: r.width, h: r.height })
        }

        const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD", "TITLE"])
        const walker = document.createTreeWalker(document.body ?? document.documentElement, NodeFilter.SHOW_TEXT)
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const parent = n.parentElement
          if (!parent || SKIP.has(parent.tagName) || !(n.textContent ?? "").trim()) continue
          if (parent.closest("[data-composite]")) continue // 025: the placed screenshot is not measured
          if (!visible(parent)) continue
          const range = document.createRange()
          range.selectNodeContents(n)
          push(range.getBoundingClientRect())
        }
        for (const img of Array.from(document.images)) {
          const attr = img.getAttribute("src") ?? ""
          const isLogo = logoSet.has(attr) || logoSet.has(img.src)
          if (!isLogo || excludeSet.has(attr) || excludeSet.has(img.src)) continue
          if (img.closest("[data-composite]")) continue // 025: the placed screenshot is not measured
          if (!visible(img)) continue
          push(img.getBoundingClientRect())
        }
        return out
      },
      [...opts.logoUrls],
      [...(opts.excludeUrls ?? [])]
    ),
    opts.composites ?? null
  )
  const boxes: Rect[] = []
  for (const b of pxBoxes as PxBox[]) {
    const r: Rect = {
      x: (b.x / width) * 100,
      y: (b.y / height) * 100,
      w: (b.w / width) * 100,
      h: (b.h / height) * 100,
    }
    if ((r.w * r.h) / 100 > FULL_BLEED_AREA_PCT) continue // over 60% of the canvas
    boxes.push(r)
  }
  return boxes
}

// Null when the measurement did not run, errored or timed out (logged); never
// throws. `timeoutMs` exists so a test can prove the timeout path.
export async function observeLayout(
  html: string,
  textRegions: ReadonlyArray<Region>,
  opts: MeasureOptions,
  timeoutMs: number = LAYOUT_OBSERVE_TIMEOUT_MS
): Promise<LayoutObservation | null> {
  if (MOCK_PUPPETEER) return null
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const work = measureLayoutBoxes(html, opts)
    work.catch(() => {}) // the race below owns the outcome; never an unhandled rejection
    const boxes = await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs)
      }),
    ])
    return evaluateLayout(boxes, textRegions)
  } catch (err) {
    console.warn(`[layout] observation failed, recording nothing: ${err instanceof Error ? err.message : String(err)}`)
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}
