import puppeteer, { type Browser, type Page } from "puppeteer-core"
import { existsSync } from "fs"
import pLimit from "p-limit"
import { MOCK_PUPPETEER, MOCK_PNG_BUFFER, syntheticScreenGrid, shouldMockCompositeFail } from "@/lib/testHooks"
import { env } from "@/lib/env"
import { compositeHtmlProblems } from "@/lib/composite/insert"
import { CompositeRenderError, type CompositeRender } from "@/lib/composite/render"
import {
  evaluateCompositeFacts,
  type CompositeFacts,
  GRID_STEP_PX,
  SAMPLE_GRID_MAX,
  coverFit,
  lightness,
  mapRegionToImage,
  relativeLuminance,
  type LuminanceGrid,
  type Rect,
  type Region,
  type RegionSample,
} from "@/lib/designData"
// Narrow imports, not the index: the stamp and notice modules are not needed here.
import { HEADLINE_CHECK_TIMEOUT_MS, type HeadlineCheck } from "@/lib/renderedText/vocab"
import { FONT_CHECK_TIMEOUT_MS, mockFontsMissing } from "@/lib/fonts/renderNotes"
import { NORMALISE_HEADLINE_SOURCE } from "@/lib/renderedText/normalise"
import { countPaintedCandidates, evaluateHeadlineFacts, type HeadlineFacts } from "@/lib/renderedText/facts"
import { MOCK_APPLY_RENDER_FAIL, mockAbsentPainted, mockHeadlineCheck } from "@/lib/renderedText/mockCheck"

const COMMON_LINUX_PATHS = [
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
]

// Windows Chrome/Edge install locations. Edge is Chromium-based and present on
// every Windows host, so it's the reliable last-resort autodetect target.
function windowsCandidatePaths(): string[] {
  const pf = process.env.PROGRAMFILES ?? "C:\\Program Files"
  const pf86 = process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)"
  const local = process.env.LOCALAPPDATA
  return [
    `${pf}\\Google\\Chrome\\Application\\chrome.exe`,
    `${pf86}\\Google\\Chrome\\Application\\chrome.exe`,
    ...(local ? [`${local}\\Google\\Chrome\\Application\\chrome.exe`] : []),
    `${pf86}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${pf}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ]
}

// All autodetect candidates, platform-native first (harmless on the other OS —
// existsSync just returns false for a Windows path on Linux and vice versa).
function candidatePaths(): string[] {
  return process.platform === "win32"
    ? [...windowsCandidatePaths(), ...COMMON_LINUX_PATHS]
    : [...COMMON_LINUX_PATHS, ...windowsCandidatePaths()]
}

// Pure resolver (deps injected for testing). A configured path is used only if
// it actually exists — a set-but-missing PUPPETEER_EXECUTABLE_PATH (prod blocker
// B3, 2026-07-23) must NOT be handed to puppeteer verbatim; fall back to
// autodetection instead of failing with "Browser was not found".
export function pickExecutablePath(
  configured: string | undefined,
  exists: (p: string) => boolean,
  candidates: string[]
): string {
  if (configured && exists(configured)) return configured
  if (configured) {
    console.warn(
      `[renderer] PUPPETEER_EXECUTABLE_PATH="${configured}" does not exist — ` +
        "falling back to Chrome/Chromium/Edge autodetection"
    )
  }
  for (const p of candidates) {
    if (exists(p)) return p
  }
  throw new Error(
    "Chromium not found. Install Google Chrome / Chromium (or Edge on Windows), " +
      "or set PUPPETEER_EXECUTABLE_PATH to an existing browser binary " +
      "(e.g. C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe on Windows, " +
      "or /usr/bin/chromium-browser on Linux)"
  )
}

function resolveExecutablePath(): string {
  return pickExecutablePath(env.PUPPETEER_EXECUTABLE_PATH, existsSync, candidatePaths())
}

// Egress allowlist for rendered documents. The HTML we render is model-generated
// (and refine output is user-instruction-influenced), and it executes with the
// server's network position — without interception, a prompt-injected
// <img src="http://169.254.169.254/..."> or <script>fetch('http://minio:9000/...')
// runs server-side (SSRF/exfil vector). Only our own MinIO endpoints (embedded
// assets) and Google Fonts (brand @import fonts) are reachable; everything else
// is aborted (the render still completes — the resource just fails to load).
const ALLOWED_RENDER_HOSTS = new Set<string>(["fonts.googleapis.com", "fonts.gstatic.com"])
for (const e of [env.MINIO_ENDPOINT, env.MINIO_PUBLIC_ENDPOINT]) {
  if (!e) continue
  try {
    ALLOWED_RENDER_HOSTS.add(new URL(e).host)
  } catch {
    // Malformed endpoint config — env.ts validation reports it elsewhere.
  }
}

export function isAllowedRenderRequest(url: string): boolean {
  // data:/blob: are in-document; about:blank is the setContent navigation itself.
  if (url.startsWith("data:") || url.startsWith("blob:") || url === "about:blank") return true
  try {
    const u = new URL(url)
    if (u.protocol !== "http:" && u.protocol !== "https:") return false
    return ALLOWED_RENDER_HOSTS.has(u.host)
  } catch {
    return false
  }
}

// Bound a hung render (e.g. a resource that never settles): explicit, generous
// budget instead of relying on Puppeteer's silent 30s navigation default.
export const SET_CONTENT_TIMEOUT_MS = 60_000

// Cap concurrent renders. Each render rasterizes at 2× DPI (here 1080→2160px),
// which is memory-heavy, and the design agent can fire renderHtml repeatedly
// while several generations run in parallel. Without a cap, unbounded pages
// (previously: unbounded *browsers*) exhaust memory under load.
const MAX_CONCURRENCY = Math.max(
  1,
  parseInt(env.PUPPETEER_MAX_CONCURRENCY ?? "2", 10) || 2
)
const limit = pLimit(MAX_CONCURRENCY)

// One Chromium process for the lifetime of the server, reused across renders.
// puppeteer.launch installs its own SIGINT/SIGTERM/exit handlers to close the
// browser, so no manual process-cleanup is needed here.
let browserPromise: Promise<Browser> | null = null

async function launchBrowser(): Promise<Browser> {
  const executablePath = resolveExecutablePath()
  const browser = await puppeteer.launch({
    executablePath,
    // Keep in sync with scripts/glyph-check/check-glyphs.mjs (launch args and
    // deviceScaleFactor are duplicated there).
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  })
  // If Chromium crashes or is killed, drop the cached handle so the next render
  // relaunches a fresh process instead of reusing a dead one.
  browser.on("disconnected", () => {
    browserPromise = null
  })
  return browser
}

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const browser = await browserPromise
      if (browser.connected) return browser
    } catch {
      // Prior launch failed — fall through and relaunch.
    }
    browserPromise = null
  }
  browserPromise = launchBrowser().catch((err) => {
    browserPromise = null
    throw err
  })
  return browserPromise
}

// Loads a document exactly as a post render does — shared browser, same
// viewport and device scale, same egress allowlist, same settle condition —
// and hands the page to `fn`. The export (screenshot) and the refine verifier's
// fact extraction (evaluate) both go through here, so the facts describe the
// very layout the PNG shows.
async function withRenderedPage<T>(
  html: string,
  width: number,
  height: number,
  fn: (page: Page) => Promise<T>,
  composites: CompositeRender | null,
  // 030: runs after the composite check and before `fn`, on the same page, so
  // what it measures is the layout the PNG shows. Existing callers pass nothing.
  beforeShot?: (page: Page) => Promise<void>
): Promise<T> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    // Keep in sync with scripts/glyph-check/check-glyphs.mjs (launch args and
    // deviceScaleFactor are duplicated there).
    await page.setViewport({ width, height, deviceScaleFactor: 2 })
    await page.setRequestInterception(true)
    page.on("request", (req) => {
      if (isAllowedRenderRequest(req.url())) {
        req.continue().catch(() => {})
      } else {
        console.warn(`[renderer] blocked off-allowlist request: ${req.url().slice(0, 200)}`)
        req.abort().catch(() => {})
      }
    })
    // 025 FR-13: the stored string keeps the token; only this render's copy
    // carries the screenshot's bytes.
    const resolved = composites ? html.split(composites.token).join(composites.dataUri) : html
    await page.setContent(resolved, { waitUntil: "networkidle0", timeout: SET_CONTENT_TIMEOUT_MS })
    if (composites) await verifyComposite(page, composites)
    if (beforeShot) await beforeShot(page)
    return await fn(page)
  } finally {
    // Close only the page; the browser is shared and stays alive.
    await page.close().catch(() => {})
  }
}

// The pure half of the composite check (025 FR-14): exactly one canonical
// element at the rect and exactly one token. It runs before any page is
// opened, in the mock renderer too.
function assertCompositeHtml(html: string, composites: CompositeRender): void {
  const problems = compositeHtmlProblems(html, composites.rectPx)
  if (problems.length > 0) throw new CompositeRenderError("composite-not-rendered", problems.join("; "))
}

// The in-page half (025 FR-14, amended by A1): measured before the screenshot,
// against the stamped rect. The verdict is the pure evaluateCompositeFacts.
async function verifyComposite(page: Page, composites: CompositeRender): Promise<void> {
  const facts: CompositeFacts = await page.evaluate(async (rect) => {
    const el = document.querySelector('[data-composite="0"]')
    if (!el) {
      return { found: false, complete: false, naturalWidth: 0, box: { left: 0, top: 0, width: 0, height: 0 }, hits: [] }
    }
    const img = el.querySelector("img")
    if (img) {
      try {
        await img.decode()
      } catch {
        // an undecodable image reads as not complete below
      }
    }
    const b = el.getBoundingClientRect()
    const points: Array<[number, number]> = [[0.5, 0.5], [0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]
    const hits = points.map(([fx, fy]) => {
      const top = document.elementFromPoint(rect.left + rect.width * fx, rect.top + rect.height * fy)
      return !!top && el.contains(top)
    })
    return {
      found: true,
      complete: !!img && img.complete,
      naturalWidth: img ? img.naturalWidth : 0,
      box: { left: b.left, top: b.top, width: b.width, height: b.height },
      hits,
    }
  }, composites.rectPx)
  const verdict = evaluateCompositeFacts(facts, composites.rectPx)
  if (verdict.ok !== true) throw new CompositeRenderError("composite-not-rendered", verdict.detail)
}

// 030 FR-07: the in-page collector. It rebuilds the one normaliser from its
// source (so the page and Node compare the same text), finds the innermost
// elements whose visible text is the headline, and reports facts only; the
// verdict is the pure evaluateHeadlineFacts. Nothing here decides.
async function collectHeadlineFacts(page: Pick<Page, "evaluate">, headline: string): Promise<HeadlineFacts> {
  return page.evaluate(
    (text: string, normaliseSource: string) => {
      const norm = new Function("return " + normaliseSource)() as (s: string) => string
      const want = norm(text)
      const kept: HTMLElement[] = []
      if (want) {
        document.body.querySelectorAll("*").forEach((node) => {
          const el = node as HTMLElement
          if (el.closest("script, style, template, noscript")) return
          if (typeof el.innerText !== "string") return
          if (norm(el.innerText) === want) kept.push(el)
        })
      }
      const innermost = kept.filter((el) => !kept.some((other) => other !== el && el.contains(other)))
      const box = (r: DOMRect) => ({ left: r.left, top: r.top, width: r.width, height: r.height })
      return {
        candidates: innermost.map((el) => {
          const range = document.createRange()
          range.selectNodeContents(el)
          const rects = Array.from(range.getClientRects())
            .filter((r) => r.width > 0 && r.height > 0)
            .map(box)
          const clipBoxes: Array<{ left: number; top: number; width: number; height: number }> = []
          for (let a: HTMLElement | null = el; a; a = a.parentElement) {
            const cs = getComputedStyle(a)
            if (cs.overflowX !== "visible" || cs.overflowY !== "visible") clipBoxes.push(box(a.getBoundingClientRect()))
            if (a === document.body) break
          }
          const topmost = rects.map((r) => {
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
            return !!hit && el.contains(hit)
          })
          return {
            visible: el.checkVisibility({ opacityProperty: true, visibilityProperty: true }),
            rects,
            clipBoxes,
            topmost,
          }
        }),
      }
    },
    headline,
    NORMALISE_HEADLINE_SOURCE
  )
}

// 030 FR-06, NFR-03: bounded and never throwing. A throw or a timeout reads as
// `not-checked`, is logged once, and the render goes on. `page` is only what
// the collector needs, so a unit test can hand in a stub that throws or hangs.
export async function runHeadlineCheck(
  page: Pick<Page, "evaluate">,
  headline: string,
  canvas: { width: number; height: number },
  timeoutMs: number = HEADLINE_CHECK_TIMEOUT_MS
): Promise<HeadlineCheck> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const facts = await Promise.race([
      collectHeadlineFacts(page, headline),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs)
      }),
    ])
    return evaluateHeadlineFacts(facts, canvas)
  } catch (err) {
    console.warn(`[renderer] headline check: ${err instanceof Error ? err.message : String(err)}`)
    return "not-checked"
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// 031 FR-40: the painted candidates across the texts that must be gone from the
// image (Apply's old headline). The same collector and rule as the headline
// check; bounded and never throwing. A throw or timeout is null (logged), never 0:
// Apply must not read an unchecked image as "old text gone" (031 T14 review).
export async function runAbsentCheck(
  page: Pick<Page, "evaluate">,
  absent: string[],
  canvas: { width: number; height: number },
  timeoutMs: number = HEADLINE_CHECK_TIMEOUT_MS
): Promise<number | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const run = async () => {
      let n = 0
      for (const text of absent) n += countPaintedCandidates(await collectHeadlineFacts(page, text), canvas)
      return n
    }
    return await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs)
      }),
    ])
  } catch (err) {
    console.warn(`[renderer] absent check: ${err instanceof Error ? err.message : String(err)}`)
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// 031 FR-24 (design 5.6): the in-page font collector. The families are the `family` params of
// the marked link (`link[data-post-fonts]`), axis stripped, so the render needs no kit argument.
// After `document.fonts.ready`, a family is missing when the page holds no face for it (its
// stylesheet was refused, blocked or never loaded) or every face it holds failed to load.
// Deviation from the design's `document.fonts.check`: check() is false for a face that is
// declared but never needed by the post's text (faces load lazily, per unicode-range subset), so
// it would report a Sinhala font missing on every English post. A face that is merely unused
// ("unloaded") is not missing.
async function collectFontFacts(page: Pick<Page, "evaluate">): Promise<string[]> {
  return page.evaluate(async () => {
    const link = document.querySelector("link[data-post-fonts]") as HTMLLinkElement | null
    if (!link) return []
    let families: string[] = []
    try {
      families = new URL(link.href).searchParams.getAll("family").map((f) => f.split(":")[0].trim())
    } catch {
      return []
    }
    families = Array.from(new Set(families.filter(Boolean)))
    if (families.length === 0) return []
    await document.fonts.ready
    const norm = (s: string) => s.replace(/^["']|["']$/g, "").replace(/\s+/g, " ").trim().toLowerCase()
    const faces: FontFace[] = []
    document.fonts.forEach((f) => faces.push(f))
    return families.filter((family) => {
      const mine = faces.filter((f) => norm(f.family) === norm(family))
      return mine.length === 0 || mine.every((f) => f.status === "error")
    })
  })
}

// 031 FR-24, NFR-06: bounded and never throwing. A throw or a timeout gives [] and a log line,
// and the render goes on. `page` is only what the collector needs, so a test can hand in a stub.
export async function runFontCheck(
  page: Pick<Page, "evaluate">,
  timeoutMs: number = FONT_CHECK_TIMEOUT_MS
): Promise<string[]> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      collectFontFacts(page),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs)
      }),
    ])
  } catch (err) {
    console.warn(`[renderer] font check: ${err instanceof Error ? err.message : String(err)}`)
    return []
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export interface RenderPostResult {
  png: Buffer
  headlineCheck: HeadlineCheck | null
  // 031 FR-24: the marked link's families that did not load ([] = none, or no check).
  fontsMissing: string[]
  // 031 FR-40: painted candidates across `check.absent` (0 when none was asked;
  // null when the check threw or timed out).
  absentPainted: number | null
}

// 030: one render, and with `check` the verdict on the headline as painted in
// that same render. `renderHtmlToPng` is this with no check. 031: every render
// also runs the font check, after the composite and headline checks.
export async function renderPost(
  html: string,
  width: number,
  height: number,
  composites: CompositeRender | null,
  check: { headline: string; absent?: string[] } | null
): Promise<RenderPostResult> {
  if (composites) assertCompositeHtml(html, composites)
  // Test seam: skip Chromium entirely and return a fixed PNG. The in-page
  // check is skipped; the sentinel makes the composite check fail on demand.
  if (MOCK_PUPPETEER) {
    if (composites && shouldMockCompositeFail(html)) {
      throw new CompositeRenderError("composite-not-rendered", "mock composite failure")
    }
    if (html.includes(MOCK_APPLY_RENDER_FAIL)) throw new Error("mock render failure")
    return {
      png: MOCK_PNG_BUFFER,
      headlineCheck: check ? mockHeadlineCheck(html, check.headline) : null,
      fontsMissing: mockFontsMissing(html),
      absentPainted: check?.absent?.length ? mockAbsentPainted(html, check.absent) : 0,
    }
  }
  return limit(() => {
    let headlineCheck: HeadlineCheck | null = null
    let fontsMissing: string[] = []
    let absentPainted: number | null = 0
    return withRenderedPage(
      html,
      width,
      height,
      async (page) => ({ png: Buffer.from(await page.screenshot({ type: "png" })), headlineCheck, fontsMissing, absentPainted }),
      composites,
      async (page) => {
        if (check) headlineCheck = await runHeadlineCheck(page, check.headline, { width, height })
        if (check?.absent?.length) absentPainted = await runAbsentCheck(page, check.absent, { width, height })
        fontsMissing = await runFontCheck(page)
      }
    )
  })
}

// `composites` is required (025 FR-13): a caller with no composite passes null,
// so a missed caller is a type error rather than a broken image.
export async function renderHtmlToPng(
  html: string,
  width: number,
  height: number,
  composites: CompositeRender | null
): Promise<Buffer> {
  return (await renderPost(html, width, height, composites, null)).png
}

// Runs `fn` against the document loaded as a post render loads it (see
// withRenderedPage), under the same concurrency cap. No MOCK_PUPPETEER seam
// here: callers own their mock (domFacts.ts returns static facts).
export async function evaluateInRenderedPage<T>(
  html: string,
  width: number,
  height: number,
  fn: (page: Page) => Promise<T>,
  composites: CompositeRender | null
): Promise<T> {
  if (composites) assertCompositeHtml(html, composites)
  return limit(() => withRenderedPage(html, width, height, fn, composites))
}

// Sample the dominant colors of an image (F5 brand-kit extraction). The image
// bytes are embedded as a data: URL so the canvas is same-origin (no CORS taint)
// and the page makes no network request. We downscale to a small grid, coarsely
// quantize, and return the most frequent colors as hex — a reliable palette
// starting point the admin confirms, rather than a vision model's approximation.
async function sampleOnce(dataUrl: string, count: number): Promise<string[]> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    // Block every network request — the image rides in the data: URL.
    await page.setRequestInterception(true)
    page.on("request", (req) => {
      const u = req.url()
      if (u.startsWith("data:") || u === "about:blank") req.continue().catch(() => {})
      else req.abort().catch(() => {})
    })
    await page.setContent("<!doctype html><html><body></body></html>", {
      waitUntil: "domcontentloaded",
      timeout: SET_CONTENT_TIMEOUT_MS,
    })
    const colors = await page.evaluate(
      async (url: string, want: number) => {
        const img = new Image()
        img.src = url
        await img.decode()
        const S = 48
        const canvas = document.createElement("canvas")
        canvas.width = S
        canvas.height = S
        const ctx = canvas.getContext("2d")!
        ctx.drawImage(img, 0, 0, S, S)
        const { data } = ctx.getImageData(0, 0, S, S)
        // Coarse-quantize each channel to 32-value buckets and count frequency.
        const counts = new Map<string, { n: number; r: number; g: number; b: number }>()
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3]
          if (a < 128) continue // skip mostly-transparent pixels
          const r = data[i], g = data[i + 1], b = data[i + 2]
          const key = `${r >> 5}-${g >> 5}-${b >> 5}`
          const c = counts.get(key)
          if (c) { c.n++; c.r += r; c.g += g; c.b += b }
          else counts.set(key, { n: 1, r, g, b })
        }
        const toHex = (v: number) => Math.round(v).toString(16).padStart(2, "0")
        return [...counts.values()]
          .sort((a, b) => b.n - a.n)
          .slice(0, want)
          .map((c) => `#${toHex(c.r / c.n)}${toHex(c.g / c.n)}${toHex(c.b / c.n)}`)
      },
      dataUrl,
      count
    )
    return colors
  } finally {
    await page.close().catch(() => {})
  }
}

export async function sampleImageColors(dataUrl: string, count = 5): Promise<string[]> {
  // Test seam: a deterministic palette so E2E needs no real Chromium.
  if (MOCK_PUPPETEER) return ["#0284c7", "#0f172a", "#f8fafc", "#38bdf8", "#1e293b"].slice(0, count)
  return limit(() => sampleOnce(dataUrl, count))
}

// Natural pixel dimensions of an image (F6: infer a template's aspect ratio from
// an uploaded image). Loaded from a data: URL so no network request is made.
async function dimensionsOnce(dataUrl: string): Promise<{ width: number; height: number }> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setRequestInterception(true)
    page.on("request", (req) => {
      const u = req.url()
      if (u.startsWith("data:") || u === "about:blank") req.continue().catch(() => {})
      else req.abort().catch(() => {})
    })
    await page.setContent("<!doctype html><html><body></body></html>", {
      waitUntil: "domcontentloaded",
      timeout: SET_CONTENT_TIMEOUT_MS,
    })
    return await page.evaluate(async (url: string) => {
      const img = new Image()
      img.src = url
      await img.decode()
      return { width: img.naturalWidth, height: img.naturalHeight }
    }, dataUrl)
  } finally {
    await page.close().catch(() => {})
  }
}

export async function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  // Test seam: a deterministic square so E2E needs no real Chromium.
  if (MOCK_PUPPETEER) return { width: 1080, height: 1080 }
  return limit(() => dimensionsOnce(dataUrl))
}

// ── Hero-image region sampler (change 009, design.md section 5) ──────────────
// Point samples of relative luminance for the regions of a generated image, on
// a network-blocked page. Every failure of this path is a HeroCheckError, which
// the caller settles to the classic design (fail closed, FR-09).
export const HERO_CHECK_TIMEOUT_MS = 20_000

export class HeroCheckError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "HeroCheckError"
  }
}

interface PxRect {
  sx: number
  sy: number
  sw: number
  sh: number
  gw: number
  gh: number
}

// Grid for one region: at most SAMPLE_GRID_MAX points, in the rect's aspect,
// never more points than the rect has pixels on either axis.
function gridFor(w: number, h: number): { gw: number; gh: number } {
  const gw0 = Math.max(1, Math.round(Math.sqrt((SAMPLE_GRID_MAX * w) / h)))
  const gw = Math.min(gw0, Math.max(1, Math.floor(w)))
  const gh = Math.min(Math.max(1, Math.round(SAMPLE_GRID_MAX / gw0)), Math.max(1, Math.floor(h)))
  return { gw, gh }
}

async function heroSampleOnce(
  dataUrl: string,
  regions: ReadonlyArray<Region>,
  canvas: { width: number; height: number },
  holder: { page: Page | null; closed: boolean }
): Promise<Array<RegionSample | null>> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  holder.page = page
  try {
    if (holder.closed) throw new HeroCheckError("hero check timed out")
    await page.setRequestInterception(true)
    page.on("request", (req) => {
      const u = req.url()
      if (u.startsWith("data:") || u === "about:blank") req.continue().catch(() => {})
      else req.abort().catch(() => {})
    })
    await page.setContent("<!doctype html><html><body></body></html>", {
      waitUntil: "domcontentloaded",
      timeout: SET_CONTENT_TIMEOUT_MS,
    })
    // 1. Natural dimensions, as the page decodes them.
    const natural = await page.evaluate(async (url: string) => {
      const img = new Image()
      img.src = url
      await img.decode()
      return { w: img.naturalWidth, h: img.naturalHeight }
    }, dataUrl)
    // 2. The mapping, in Node (the pure function, tested without a browser).
    const mapped = regions.map((r) => mapRegionToImage(r.rect, { w: canvas.width, h: canvas.height }, natural))
    const rects: PxRect[] = []
    for (const m of mapped) {
      if (!m) continue
      const sx = Math.min(Math.max(0, m.px.x), natural.w)
      const sy = Math.min(Math.max(0, m.px.y), natural.h)
      const sw = Math.min(m.px.w, natural.w - sx)
      const sh = Math.min(m.px.h, natural.h - sy)
      rects.push({ sx, sy, sw, sh, ...gridFor(sw, sh) })
    }
    // 3. Point samples, smoothing off (A3): a textured region reads as textured.
    const raw = rects.length
      ? await page.evaluate(
          async (url: string, rs: PxRect[]) => {
            const img = new Image()
            img.src = url
            await img.decode()
            return rs.map((r) => {
              const c = document.createElement("canvas")
              c.width = r.gw
              c.height = r.gh
              const ctx = c.getContext("2d", { willReadFrequently: true })!
              ctx.imageSmoothingEnabled = false
              ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, r.gw, r.gh)
              return Array.from(ctx.getImageData(0, 0, r.gw, r.gh).data)
            })
          },
          dataUrl,
          rects
        )
      : []
    // 4. Luminance in Node: alpha under 128 dropped, one formula (evaluate.ts).
    let k = 0
    return mapped.map((m) => {
      if (!m) return null
      const data = raw[k++]
      const luminance: number[] = []
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue
        luminance.push(relativeLuminance(data[i], data[i + 1], data[i + 2]))
      }
      return { luminance, areaPct: m.areaPct }
    })
  } finally {
    holder.closed = true
    await page.close().catch(() => {})
  }
}

// `null` for a region the mapping rejects. Throws HeroCheckError for anything
// else: a non-data: URL, an undecodable image, a browser error, the timeout.
// `timeoutMs` exists so a test can prove the timeout path; production callers
// take the default.
export async function sampleRegionLuminance(
  dataUrl: string,
  regions: ReadonlyArray<Region>,
  canvas: { width: number; height: number },
  timeoutMs: number = HERO_CHECK_TIMEOUT_MS
): Promise<Array<RegionSample | null>> {
  // Test seam: calm, dark, near-uniform samples (a calm result passes tone
  // `light`). The busy, contrast and error cases are produced upstream.
  if (MOCK_PUPPETEER) {
    return regions.map((r) => ({
      luminance: Array.from({ length: 256 }, (_, i) => 0.02 + (i % 2 === 0 ? 0.001 : -0.001)),
      areaPct: (r.rect.w * r.rect.h) / 100,
    }))
  }
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    throw new HeroCheckError("hero check accepts data: URLs only")
  }
  return runHeroSample(timeoutMs, (holder) => heroSampleOnce(dataUrl, regions, canvas, holder))
}

// One sampler job under the concurrency cap, the timeout and the HeroCheckError
// rule: every failure of a sampler is a HeroCheckError, never anything else.
function runHeroSample<T>(
  timeoutMs: number,
  job: (holder: { page: Page | null; closed: boolean }) => Promise<T>
): Promise<T> {
  return limit(async () => {
    const holder: { page: Page | null; closed: boolean } = { page: null, closed: false }
    let timer: ReturnType<typeof setTimeout> | undefined
    const work = job(holder)
    work.catch(() => {}) // the race below owns the outcome; never an unhandled rejection
    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            holder.closed = true
            holder.page?.close().catch(() => {})
            reject(new HeroCheckError(`hero check timed out after ${timeoutMs} ms`))
          }, timeoutMs)
        }),
      ])
    } catch (err) {
      if (err instanceof HeroCheckError) throw err
      throw new HeroCheckError(`hero check failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err })
    } finally {
      if (timer) clearTimeout(timer)
    }
  })
}

// ── Screen-detection grid (025 Amendment A1, design.md section 21) ───────────
// L*/100 at one point per GRID_STEP_PX canvas px over `window` (canvas percent),
// mapped through the same cover fit as the region sampler, smoothing off (a
// textured screen reads as textured). Same network-blocked page, timeout and
// HeroCheckError rules. Null when the window does not map onto the image.
// `seamRegion` is the contract's composite region, read only by the
// MOCK_PUPPETEER synthetic grid (a flat screen exactly on it, a dark surround).
async function heroGridOnce(
  dataUrl: string,
  window: Rect,
  canvas: { width: number; height: number },
  holder: { page: Page | null; closed: boolean }
): Promise<LuminanceGrid | null> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  holder.page = page
  try {
    if (holder.closed) throw new HeroCheckError("hero check timed out")
    await page.setRequestInterception(true)
    page.on("request", (req) => {
      const u = req.url()
      if (u.startsWith("data:") || u === "about:blank") req.continue().catch(() => {})
      else req.abort().catch(() => {})
    })
    await page.setContent("<!doctype html><html><body></body></html>", {
      waitUntil: "domcontentloaded",
      timeout: SET_CONTENT_TIMEOUT_MS,
    })
    const natural = await page.evaluate(async (url: string) => {
      const img = new Image()
      img.src = url
      await img.decode()
      return { w: img.naturalWidth, h: img.naturalHeight }
    }, dataUrl)
    const canvasSize = { w: canvas.width, h: canvas.height }
    const m = mapRegionToImage(window, canvasSize, natural)
    if (!m) return null
    const fit = coverFit(canvasSize, natural)
    // The mapped window in canvas px (clipped to what the image covers).
    const cx0 = m.px.x * fit.scale + fit.offset.x
    const cy0 = m.px.y * fit.scale + fit.offset.y
    const cols = Math.floor((m.px.w * fit.scale) / GRID_STEP_PX)
    const rows = Math.floor((m.px.h * fit.scale) / GRID_STEP_PX)
    if (cols < 1 || rows < 1) return null
    // Each destination pixel is one step; the source rect is a whole number of steps.
    const src = {
      sx: m.px.x,
      sy: m.px.y,
      sw: (cols * GRID_STEP_PX) / fit.scale,
      sh: (rows * GRID_STEP_PX) / fit.scale,
    }
    // RGBA comes back as one base64 string: a window can be 270k points.
    const b64 = await page.evaluate(
      async (url: string, r: { sx: number; sy: number; sw: number; sh: number }, gw: number, gh: number) => {
        const img = new Image()
        img.src = url
        await img.decode()
        const c = document.createElement("canvas")
        c.width = gw
        c.height = gh
        const ctx = c.getContext("2d", { willReadFrequently: true })!
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, gw, gh)
        const data = ctx.getImageData(0, 0, gw, gh).data
        let s = ""
        for (let i = 0; i < data.length; i += 0x8000) {
          s += String.fromCharCode.apply(null, Array.from(data.subarray(i, i + 0x8000)))
        }
        return btoa(s)
      },
      dataUrl,
      src,
      cols,
      rows
    )
    const bytes = Buffer.from(b64, "base64")
    const values = new Float64Array(cols * rows)
    for (let i = 0; i < values.length; i++) {
      // A transparent pixel is NaN, which the detector never treats as screen or as blank.
      values[i] =
        bytes[i * 4 + 3] < 128
          ? Number.NaN
          : lightness(relativeLuminance(bytes[i * 4], bytes[i * 4 + 1], bytes[i * 4 + 2]))
    }
    // The first sample point is the centre of the first step.
    return { cols, rows, x0: cx0 + GRID_STEP_PX / 2, y0: cy0 + GRID_STEP_PX / 2, step: GRID_STEP_PX, values }
  } finally {
    holder.closed = true
    await page.close().catch(() => {})
  }
}

export async function sampleLuminanceGrid(
  dataUrl: string,
  window: Rect,
  canvas: { width: number; height: number },
  opts: { timeoutMs?: number; seamRegion?: Region } = {}
): Promise<LuminanceGrid | null> {
  // Test seam: a flat screen exactly on the region, a dark surround.
  if (MOCK_PUPPETEER) {
    return opts.seamRegion ? syntheticScreenGrid(window, opts.seamRegion, canvas) : null
  }
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    throw new HeroCheckError("hero check accepts data: URLs only")
  }
  return runHeroSample(opts.timeoutMs ?? HERO_CHECK_TIMEOUT_MS, (holder) => heroGridOnce(dataUrl, window, canvas, holder))
}
