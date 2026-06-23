import puppeteer from "puppeteer-core"
import { existsSync } from "fs"

const COMMON_LINUX_PATHS = [
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
]

function resolveExecutablePath(): string {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH
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

export async function renderHtmlToPng(
  html: string,
  width: number,
  height: number
): Promise<Buffer> {
  const executablePath = resolveExecutablePath()

  const browser = await puppeteer.launch({
    executablePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width, height, deviceScaleFactor: 2 })
    await page.setContent(html, { waitUntil: "networkidle0" })
    const screenshot = await page.screenshot({ type: "png" })
    return Buffer.from(screenshot)
  } finally {
    await browser.close()
  }
}
