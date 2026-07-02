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
