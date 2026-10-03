// In-image glyph-coverage check (change 004, AC-01 / FR-21).
//
// Proves the fonts inside the BUILT runner image cover the symbols the design
// agent uses. A host run cannot prove this — on Windows, Segoe UI Symbol covers
// ★ whether or not the Dockerfile installs anything — so CI and local
// verification run this script inside the image:
//
//   docker build -t bistec-studio:check .
//   docker run --rm -v "$PWD/scripts/glyph-check:/app/glyph-check:ro" \
//     --entrypoint node bistec-studio:check /app/glyph-check/check-glyphs.mjs
//
// Mounted under /app so the bare `puppeteer-core` import resolves against the
// image's own /app/node_modules. The image carries no TypeScript and no tests,
// so this cannot call renderHtmlToPng itself; it launches the same Chromium
// binary with the same launch args and viewport scale as
// src/lib/renderer/puppeteer.ts (keep them in sync), and judges the PNG with
// the exact module the vitest harness uses (glyphCoverage.mjs).
//
// Usage: node check-glyphs.mjs [glyph ...]   (default: the FR-21 symbol set)
// Set GLYPH_CHECK_PNG=<path> to also save the rendered probe for inspection.
// Exit 0 only when every required glyph is covered AND a codepoint no font
// covers is detected as tofu — the second condition proves the detector is live
// in this environment, so a PASS cannot come from a check that sees nothing.

import puppeteer from "puppeteer-core"
import { existsSync, writeFileSync } from "node:fs"
import { assessGlyphProbe, buildGlyphProbe, decodePng, formatGlyphResult } from "./glyphCoverage.mjs"

const REQUIRED = process.argv.length > 2 ? process.argv.slice(2) : ["★", "✓", "✦", "→", "•"]
// Supplementary Private Use Area-B: no shipped font assigns a glyph here.
const MUST_BE_TOFU = ["\u{10FFFD}"]

// Same as src/lib/renderer/puppeteer.ts launchBrowser() / renderOnce().
const LAUNCH_ARGS = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
const DEVICE_SCALE_FACTOR = 2

const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium"
if (!existsSync(executablePath)) {
  console.error(`check-glyphs: no browser at ${executablePath}`)
  process.exit(2)
}

const probe = buildGlyphProbe([...REQUIRED, ...MUST_BE_TOFU])
const browser = await puppeteer.launch({ executablePath, args: LAUNCH_ARGS })
let png
let version
try {
  version = await browser.version()
  const page = await browser.newPage()
  await page.setViewport({ width: probe.width, height: probe.height, deviceScaleFactor: DEVICE_SCALE_FACTOR })
  await page.setContent(probe.html, { waitUntil: "networkidle0", timeout: 60_000 })
  png = await page.screenshot({ type: "png" })
} finally {
  await browser.close()
}

if (process.env.GLYPH_CHECK_PNG) writeFileSync(process.env.GLYPH_CHECK_PNG, png)

const report = assessGlyphProbe(decodePng(png), probe)
console.log(`check-glyphs: ${executablePath} (${version})`)
console.log(`control ${report.control.glyph}: ${report.control.metrics.bbox.width}x${report.control.metrics.bbox.height}px`)

let failed = 0
for (const r of report.results) {
  const expectTofu = MUST_BE_TOFU.includes(r.glyph)
  const ok = expectTofu ? !r.covered : r.covered
  if (!ok) failed++
  const tag = expectTofu ? (ok ? "  (detector self-check: tofu detected as expected)" : "  (detector self-check FAILED: an uncovered codepoint was not detected)") : ""
  console.log(`${formatGlyphResult(r)}${tag}`)
}

if (failed) {
  console.error(`check-glyphs: ${failed} check(s) failed`)
  process.exit(1)
}
console.log(`check-glyphs: all ${REQUIRED.length} required glyphs covered`)
