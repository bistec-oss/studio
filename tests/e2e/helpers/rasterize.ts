/**
 * Rasterizing test harness (FR-23).
 *
 * The mock E2E suite is structurally blind to anything between the model and the
 * pixels: "MOCK_AI returns clean HTML and MOCK_PUPPETEER never rasterizes, so
 * nothing between the model and the pixels is exercised" (CLAUDE.md). This module
 * closes that hole — it drives the REAL `renderHtmlToPng` through real Chromium
 * and measures the actual PNG bytes that come back.
 *
 * Two hard constraints shape the implementation:
 *
 *   1. MOCK_PUPPETEER is a module-scope const captured at import time
 *      (src/lib/testHooks.ts). `npm run test:e2e:mock` sets it in the Playwright
 *      process itself, so a plain top-level `import` of the renderer would get
 *      the 1×1 stub and every assertion here would be vacuously true. The env is
 *      therefore rewritten, the renderer pulled in via a lazy dynamic import,
 *      and the env put back (loadRealRenderer below) — the ONLY safe order, and
 *      the restore matters because the whole suite shares one worker process.
 *
 *   2. No new npm dependencies (spec: "No new npm dependencies expected for
 *      Phases 1 and 2"), so the PNG decoder is hand-rolled on node:zlib. That is
 *      enough for Chromium screenshots, which are always 8-bit non-interlaced.
 *
 * Nothing here is glyph-specific. `★` appears in no code path — callers pass the
 * codepoint they care about, which is what makes this reusable for proposal 007
 * and any future font/render question.
 */

import { existsSync } from 'node:fs'
import Module from 'node:module'
import path from 'node:path'
import { inflateSync } from 'node:zlib'
import { chromium } from '@playwright/test'

// ---------------------------------------------------------------------------
// Real-renderer loading (constraint 1 above)
// ---------------------------------------------------------------------------

type RenderHtmlToPng = (html: string, width: number, height: number) => Promise<Buffer>

let rendererPromise: Promise<RenderHtmlToPng> | null = null

/** Where the Chromium binary handed to the renderer came from. */
export type ChromiumSource = 'env' | 'playwright' | 'autodetect'

export interface ChromiumResolution {
  /** Absolute path, or null when we leave the renderer to autodetect. */
  path: string | null
  source: ChromiumSource
}

/**
 * Decide which browser binary the renderer should use, WITHOUT duplicating the
 * renderer's own autodetection.
 *
 *   - `PUPPETEER_EXECUTABLE_PATH` already set and real → honour it. This is the
 *     case inside the Docker runner image (Dockerfile sets /usr/bin/chromium),
 *     which is the only environment where AC-01 actually means anything.
 *   - otherwise → Playwright's own Chromium. CI installs browsers under
 *     ~/.cache/ms-playwright, NOT /usr/bin/chromium, so the renderer's Linux
 *     autodetect would fail there; borrowing Playwright's resolved path makes
 *     one harness work on Windows dev, in CI, and in the image.
 *   - otherwise → leave the var alone and let the renderer autodetect (finds
 *     Chrome, or Edge on Windows). If that fails too it throws, and
 *     isChromiumMissingError() lets the caller skip rather than pass silently.
 */
export function resolveChromiumExecutable(): ChromiumResolution {
  const configured = process.env.PUPPETEER_EXECUTABLE_PATH
  if (configured && existsSync(configured)) return { path: configured, source: 'env' }

  try {
    const fromPlaywright = chromium.executablePath()
    if (fromPlaywright && existsSync(fromPlaywright)) {
      return { path: fromPlaywright, source: 'playwright' }
    }
  } catch {
    // Playwright browsers not installed — fall through to the renderer's own
    // autodetection rather than failing here.
  }
  return { path: null, source: 'autodetect' }
}

/** True for the renderer's "no browser anywhere" error, which must SKIP, not fail. */
export function isChromiumMissingError(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith('Chromium not found')
}

/**
 * Make the `@/*` tsconfig alias resolvable from inside `src/` modules.
 *
 * Playwright maps tsconfig `paths` for imports written in the TEST file, but the
 * CJS `Module._resolveFilename` hook that would map them for a required module's
 * OWN imports is installed only on its out-of-process-loader path
 * (installCJSHooks, guarded by `if (loaderChannel)`). On Node ≥ 22.15 Playwright
 * uses `module.registerHooks` instead and that branch is skipped — so
 * `src/lib/renderer/puppeteer.ts`'s `import … from "@/lib/testHooks"` fails with
 * "Cannot find module '@/lib/testHooks'". Verified on Node 24.16 / Playwright 1.61.
 *
 * The shim is the same mechanism Playwright itself uses, scoped to the one
 * prefix and installed once. Extension probing is left to Node, which already
 * knows about `.ts` because Playwright registered it in `Module._extensions`.
 */
let aliasShimInstalled = false
function installSrcAliasShim(): void {
  if (aliasShimInstalled) return
  aliasShimInstalled = true
  const srcRoot = path.resolve(__dirname, '..', '..', '..', 'src')
  const moduleInternals = Module as unknown as {
    _resolveFilename: (request: string, ...rest: unknown[]) => string
  }
  const original = moduleInternals._resolveFilename
  moduleInternals._resolveFilename = function (request: string, ...rest: unknown[]) {
    if (request.startsWith('@/')) {
      return original.call(this, path.join(srcRoot, request.slice(2)), ...rest)
    }
    return original.call(this, request, ...rest)
  }
}

/**
 * Import the REAL renderer with the mock seam forced off.
 *
 * The env writes must happen before the dynamic import, because both
 * testHooks.ts (MOCK_PUPPETEER) and env.ts (PUPPETEER_EXECUTABLE_PATH) freeze
 * their values at module load. Cached so repeated calls reuse the one Chromium
 * process the renderer keeps alive.
 */
export async function loadRealRenderer(): Promise<RenderHtmlToPng> {
  if (rendererPromise) return rendererPromise
  rendererPromise = (async () => {
    // Saved and restored around the import: Playwright runs the whole suite in
    // ONE worker process (workers: 1), and other e2e files read MOCK_AI /
    // MOCK_PUPPETEER off process.env to decide whether to skip. Leaving them
    // flipped would silently disable those suites. The renderer and env.ts
    // freeze their copies at module load, so restoring afterwards is safe.
    const saved = {
      MOCK_PUPPETEER: process.env.MOCK_PUPPETEER,
      MOCK_AI: process.env.MOCK_AI,
      PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH,
    }
    try {
      process.env.MOCK_PUPPETEER = 'false'
      // MOCK_AI is unrelated to rasterization, but env.ts refuses to load when
      // it is truthy alongside DESIGN_PROVIDER=cli — and test:e2e:mock sets it.
      process.env.MOCK_AI = 'false'
      const resolved = resolveChromiumExecutable()
      if (resolved.path) process.env.PUPPETEER_EXECUTABLE_PATH = resolved.path

      installSrcAliasShim()
      const mod = await import('@/lib/renderer/puppeteer')
      return mod.renderHtmlToPng
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })().catch((err) => {
    rendererPromise = null
    throw err
  })
  return rendererPromise
}

// ---------------------------------------------------------------------------
// Dependency-free PNG decode (constraint 2 above)
// ---------------------------------------------------------------------------

export interface DecodedPng {
  width: number
  height: number
  /** Row-major RGBA, 4 bytes per pixel. */
  pixels: Buffer
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// colorType → samples per pixel. Type 3 (palette) is deliberately unsupported:
// Chromium screenshots never use it, and guessing would hide a real surprise.
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 }

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

/** Decode an 8-bit, non-interlaced PNG to RGBA. Throws on anything else. */
export function decodePng(buffer: Buffer): DecodedPng {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('decodePng: not a PNG (bad signature)')
  }

  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  const idat: Buffer[] = []

  let offset = 8
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + length // length + type + data + CRC
  }

  if (bitDepth !== 8) throw new Error(`decodePng: unsupported bit depth ${bitDepth} (expected 8)`)
  if (interlace !== 0) throw new Error('decodePng: interlaced PNGs are not supported')
  const channels = CHANNELS[colorType]
  if (!channels) throw new Error(`decodePng: unsupported color type ${colorType}`)
  if (idat.length === 0) throw new Error('decodePng: no IDAT data')

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const surface = Buffer.alloc(height * stride)

  let pos = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++]
    const line = raw.subarray(pos, pos + stride)
    pos += stride
    const rowStart = y * stride
    const prevStart = rowStart - stride
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? surface[rowStart + x - channels] : 0
      const b = y > 0 ? surface[prevStart + x] : 0
      const c = y > 0 && x >= channels ? surface[prevStart + x - channels] : 0
      let value = line[x]
      switch (filter) {
        case 0:
          break
        case 1:
          value = (value + a) & 0xff
          break
        case 2:
          value = (value + b) & 0xff
          break
        case 3:
          value = (value + ((a + b) >> 1)) & 0xff
          break
        case 4:
          value = (value + paeth(a, b, c)) & 0xff
          break
        default:
          throw new Error(`decodePng: unknown filter type ${filter} on row ${y}`)
      }
      surface[rowStart + x] = value
    }
  }

  // Normalize every supported color type to RGBA.
  const pixels = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const s = i * channels
    const d = i * 4
    let r: number
    let g: number
    let b: number
    let alpha = 255
    if (channels === 1) {
      r = g = b = surface[s]
    } else if (channels === 2) {
      r = g = b = surface[s]
      alpha = surface[s + 1]
    } else if (channels === 3) {
      r = surface[s]
      g = surface[s + 1]
      b = surface[s + 2]
    } else {
      r = surface[s]
      g = surface[s + 1]
      b = surface[s + 2]
      alpha = surface[s + 3]
    }
    pixels[d] = r
    pixels[d + 1] = g
    pixels[d + 2] = b
    pixels[d + 3] = alpha
  }

  return { width, height, pixels }
}

// ---------------------------------------------------------------------------
// Glyph rasterization
// ---------------------------------------------------------------------------

export interface GlyphRenderOptions {
  /** CSS px of the square canvas handed to renderHtmlToPng. */
  box?: number
  /** CSS font-size of the glyph. */
  fontSize?: number
  /**
   * CSS font-family stack. The default is a generic family on purpose: we want
   * the platform's own fontconfig/DirectWrite fallback chain to decide, which is
   * exactly the mechanism a font package installed in the runner image plugs
   * into (Dockerfile: "Chromium's fontconfig fallback picks it up ... no
   * CSS/@import required in the generated HTML").
   */
  fontFamily?: string
}

const DEFAULT_OPTIONS: Required<GlyphRenderOptions> = {
  box: 240,
  fontSize: 160,
  fontFamily: 'sans-serif',
}

/** The document a single glyph is rasterized in. Exported for debugging. */
export function buildGlyphHtml(char: string, opts: Required<GlyphRenderOptions>): string {
  // The glyph is emitted as a numeric character reference so the codepoint
  // survives the trip regardless of file/stream encoding.
  const entity = [...char].map((c) => `&#x${c.codePointAt(0)!.toString(16)};`).join('')
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; }
  body {
    width: ${opts.box}px; height: ${opts.box}px; background: #ffffff;
    display: flex; align-items: center; justify-content: center;
  }
  .glyph {
    font-family: ${opts.fontFamily}; font-size: ${opts.fontSize}px; line-height: 1;
    color: #000000; white-space: pre;
  }
</style></head>
<body><span class="glyph">${entity}</span></body></html>`
}

/**
 * Rasterize one character through the REAL render path.
 *
 * Note the returned PNG is 2× the CSS box: renderHtmlToPng screenshots at
 * deviceScaleFactor 2, the same as a production export. That doubling is itself
 * a usable proof that the mock (a fixed 1×1 PNG) did not answer.
 */
export async function renderGlyphPng(char: string, options: GlyphRenderOptions = {}): Promise<Buffer> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const render = await loadRealRenderer()
  return render(buildGlyphHtml(char, opts), opts.box, opts.box)
}

// ---------------------------------------------------------------------------
// Glyph measurement + tofu detection
// ---------------------------------------------------------------------------

export interface GlyphMetrics {
  char: string
  width: number
  height: number
  /** Count of pixels dark enough to be considered ink. */
  inkPixels: number
  /** Tight ink bounding box, or null when the glyph produced no ink at all. */
  bbox: { x0: number; y0: number; x1: number; y1: number; width: number; height: number } | null
  /** ink / bbox area. */
  fillRatio: number
  /**
   * For each side of the ink bbox, the fraction of that edge line which is ink.
   * A rectangle outline traces its own bounding box completely, so all four are
   * ≈ 1. Real glyphs touch each edge only where the outline happens to reach it.
   */
  edgeCompleteness: { top: number; right: number; bottom: number; left: number }
  /** The weakest of the four — the discriminator. */
  minEdgeCompleteness: number
}

/** Ink test: composite over white, then threshold on luminance. */
function isInk(pixels: Buffer, index: number): boolean {
  const d = index * 4
  const alpha = pixels[d + 3] / 255
  const lum = 0.299 * pixels[d] + 0.587 * pixels[d + 1] + 0.114 * pixels[d + 2]
  return lum * alpha + 255 * (1 - alpha) < 128
}

export function measureGlyph(char: string, png: DecodedPng): GlyphMetrics {
  const { width, height, pixels } = png
  let inkPixels = 0
  let x0 = width
  let y0 = height
  let x1 = -1
  let y1 = -1
  const mask = new Uint8Array(width * height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (!isInk(pixels, i)) continue
      mask[i] = 1
      inkPixels++
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }

  if (inkPixels === 0) {
    return {
      char,
      width,
      height,
      inkPixels: 0,
      bbox: null,
      fillRatio: 0,
      edgeCompleteness: { top: 0, right: 0, bottom: 0, left: 0 },
      minEdgeCompleteness: 0,
    }
  }

  const bw = x1 - x0 + 1
  const bh = y1 - y0 + 1

  const rowInk = (y: number) => {
    let n = 0
    for (let x = x0; x <= x1; x++) if (mask[y * width + x]) n++
    return n / bw
  }
  const colInk = (x: number) => {
    let n = 0
    for (let y = y0; y <= y1; y++) if (mask[y * width + x]) n++
    return n / bh
  }

  const edgeCompleteness = {
    top: rowInk(y0),
    bottom: rowInk(y1),
    left: colInk(x0),
    right: colInk(x1),
  }

  return {
    char,
    width,
    height,
    inkPixels,
    bbox: { x0, y0, x1, y1, width: bw, height: bh },
    fillRatio: inkPixels / (bw * bh),
    edgeCompleteness,
    minEdgeCompleteness: Math.min(
      edgeCompleteness.top,
      edgeCompleteness.bottom,
      edgeCompleteness.left,
      edgeCompleteness.right,
    ),
  }
}

/** Convenience: rasterize + measure in one call. */
export async function measureGlyphRender(
  char: string,
  options: GlyphRenderOptions = {},
): Promise<{ png: DecodedPng; metrics: GlyphMetrics }> {
  const decoded = decodePng(await renderGlyphPng(char, options))
  return { png: decoded, metrics: measureGlyph(char, decoded) }
}

/**
 * Tofu thresholds.
 *
 * WHAT THIS ACTUALLY DETECTS: "the ink traces its own bounding-box rectangle
 * almost completely". A missing-glyph box (the .notdef box, or Chromium's
 * hex-digit fallback box) draws a full rectangle outline, so all four edges of
 * its bbox are ~100% ink. A real glyph reaches each bbox edge only where its
 * outline happens to be tangent to it, so at least one edge is far from full —
 * even for the worst case among plain letters, 'H', whose two full-height stems
 * make left/right 100% but whose top/bottom are only the stem widths.
 *
 * The numbers below were MEASURED, not guessed. At the defaults (box 240,
 * font-size 160, sans-serif) on a Windows host through real Chromium:
 *
 *   covered    H 0.328 | A 0.004 | O 0.110 | n 0.024 | W 0.004 | ★ 0.005
 *   uncovered  U+0378 0.994 | U+E000 0.994 | U+F0000 0.994   (all identical —
 *              the same empty box, 3662 ink px, fill ratio 0.114)
 *
 * So the real separation is 0.328 → 0.994. The floor at 0.85 sits inside that
 * gap with ~0.5 of headroom on the covered side and ~0.14 on the box side, and
 * the 0.30 control margin is comfortably cleared (0.994 − 0.328 = 0.666).
 *
 * KNOWN FALSE-POSITIVE: a legitimate glyph that IS a rectangle outline scores
 * like tofu, because pixel-wise it IS the same shape — U+25A1 WHITE SQUARE
 * measures 0.986 here, indistinguishable from a replacement box. That is
 * inherent, and it is why the verdict is always reported relative to a control
 * rendered at the same size in the same font stack rather than matched against
 * an absolute template: the control keeps the comparison honest about whatever
 * font stack the host has, but it cannot disambiguate a character whose design
 * is a box. Do not point this harness at box-shaped characters.
 */
export const TOFU_EDGE_FLOOR = 0.85
export const TOFU_CONTROL_MARGIN = 0.3

/**
 * Default control glyph. 'H' is deliberately the hardest real letter for the
 * edge-completeness discriminator (two full-height stems ⇒ left and right edges
 * are already 100% ink), so a candidate that still separates from it separates
 * from any ordinary glyph.
 */
export const DEFAULT_CONTROL_CHAR = 'H'

export interface CoverageVerdict {
  char: string
  /** False ⇒ the host's font stack has no glyph for this codepoint. */
  covered: boolean
  /** Plain-language explanation, safe to put straight into an assertion message. */
  reason: string
  candidate: GlyphMetrics
  control: GlyphMetrics
}

/**
 * Glyph-agnostic coverage check — the harness's first assertion (FR-23).
 *
 * Rasterizes the candidate and a known-covered control at the SAME size through
 * the same real render path, then compares their rectangle signatures.
 */
export async function checkGlyphCoverage(
  char: string,
  options: GlyphRenderOptions & { controlChar?: string } = {},
): Promise<CoverageVerdict> {
  const { controlChar = DEFAULT_CONTROL_CHAR, ...renderOptions } = options
  const candidate = (await measureGlyphRender(char, renderOptions)).metrics
  const control = (await measureGlyphRender(controlChar, renderOptions)).metrics

  if (control.inkPixels === 0) {
    throw new Error(
      `checkGlyphCoverage: control glyph "${controlChar}" rendered no ink — the render path ` +
        'is broken, so no verdict about the candidate is meaningful.',
    )
  }

  if (candidate.inkPixels === 0) {
    return {
      char,
      covered: false,
      reason: `"${char}" rasterized to nothing — no ink at all (control "${controlChar}" produced ${control.inkPixels} ink px).`,
      candidate,
      control,
    }
  }

  const isBox =
    candidate.minEdgeCompleteness >= TOFU_EDGE_FLOOR &&
    candidate.minEdgeCompleteness - control.minEdgeCompleteness >= TOFU_CONTROL_MARGIN

  return {
    char,
    covered: !isBox,
    reason: isBox
      ? `"${char}" rasterized as a replacement box: its ink traces its own bounding box on all four ` +
        `edges (min edge completeness ${candidate.minEdgeCompleteness.toFixed(3)}), far above the ` +
        `control "${controlChar}" (${control.minEdgeCompleteness.toFixed(3)}).`
      : `"${char}" rasterized as a real glyph (min edge completeness ${candidate.minEdgeCompleteness.toFixed(3)} ` +
        `vs control "${controlChar}" ${control.minEdgeCompleteness.toFixed(3)}, ${candidate.inkPixels} ink px).`,
    candidate,
    control,
  }
}

/** Compact one-line dump of a measurement, for failure messages and diagnostics. */
export function formatMetrics(m: GlyphMetrics): string {
  const e = m.edgeCompleteness
  return (
    `${JSON.stringify(m.char)} png=${m.width}x${m.height} ink=${m.inkPixels} ` +
    `bbox=${m.bbox ? `${m.bbox.width}x${m.bbox.height}` : 'none'} ` +
    `fill=${m.fillRatio.toFixed(3)} ` +
    `edges[t=${e.top.toFixed(3)} r=${e.right.toFixed(3)} b=${e.bottom.toFixed(3)} l=${e.left.toFixed(3)}] ` +
    `minEdge=${m.minEdgeCompleteness.toFixed(3)}`
  )
}
