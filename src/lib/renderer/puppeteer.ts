import puppeteer, { type Browser } from "puppeteer-core"
import { existsSync } from "fs"
import pLimit from "p-limit"
import { MOCK_PUPPETEER, MOCK_PNG_BUFFER } from "@/lib/testHooks"
import { env } from "@/lib/env"

const COMMON_LINUX_PATHS = [
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
]

function resolveExecutablePath(): string {
  if (env.PUPPETEER_EXECUTABLE_PATH) {
    return env.PUPPETEER_EXECUTABLE_PATH
  }
  for (const p of COMMON_LINUX_PATHS) {
    if (existsSync(p)) return p
  }
  throw new Error(
    "Chromium not found. Set PUPPETEER_EXECUTABLE_PATH " +
      "(e.g. C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe on Windows, " +
      "or /usr/bin/chromium-browser on Linux)"
  )
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

function isAllowedRenderRequest(url: string): boolean {
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
const SET_CONTENT_TIMEOUT_MS = 60_000

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

async function renderOnce(
  html: string,
  width: number,
  height: number
): Promise<Buffer> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
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
    await page.setContent(html, { waitUntil: "networkidle0", timeout: SET_CONTENT_TIMEOUT_MS })
    const screenshot = await page.screenshot({ type: "png" })
    return Buffer.from(screenshot)
  } finally {
    // Close only the page; the browser is shared and stays alive.
    await page.close().catch(() => {})
  }
}

export async function renderHtmlToPng(
  html: string,
  width: number,
  height: number
): Promise<Buffer> {
  // Test seam: skip Chromium entirely and return a fixed PNG.
  if (MOCK_PUPPETEER) return MOCK_PNG_BUFFER
  return limit(() => renderOnce(html, width, height))
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
