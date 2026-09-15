import { test, expect } from '@playwright/test'
import {
  DEFAULT_CONTROL_CHAR,
  TOFU_EDGE_FLOOR,
  checkGlyphCoverage,
  decodePng,
  formatMetrics,
  isChromiumMissingError,
  measureGlyphRender,
  renderGlyphPng,
  resolveChromiumExecutable,
} from './helpers/rasterize'

/**
 * §T — Render fidelity (FR-23, AC-01/02/03).
 *
 * Covers the gap CLAUDE.md names: "the mock E2E suite is structurally blind to
 * this class of bug — MOCK_AI returns clean HTML and MOCK_PUPPETEER never
 * rasterizes, so nothing between the model and the pixels is exercised." These
 * cases run the REAL renderHtmlToPng through real Chromium and assert on the
 * actual PNG bytes.
 *
 * Environment: needs NO database, NO app server and NO seed data — unlike every
 * other suite here. It needs only a Chromium binary, which it takes from
 * PUPPETEER_EXECUTABLE_PATH, else Playwright's own browser, else the renderer's
 * autodetect. With none of those it SKIPS with a message; it never passes
 * silently. So it can be run on its own:
 *
 *   npx playwright test tests/e2e/render-fidelity.test.ts --reporter=list
 *
 * It is also safe under `npm run test:e2e:mock`, which sets MOCK_PUPPETEER=true
 * in the Playwright process: the harness forces the seam off before importing
 * the renderer (see helpers/rasterize.ts), and TC-RENDER-01 asserts that it did.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ⚠️ WHAT A GREEN RUN ON A DEV MACHINE DOES *NOT* PROVE.
 *
 * AC-01 ("★ U+2605 renders as a visible star, not a replacement box") is about
 * the FONTS INSTALLED IN THE DOCKER RUNNER IMAGE. Every host this suite is
 * likely to run on interactively already covers ★ from its own system fonts —
 * Windows via Segoe UI Symbol, most Linux desktops via DejaVu. The Alpine runner
 * image does not, which is the entire reason font-noto-symbols was added to the
 * Dockerfile. TC-RENDER-04 passing here therefore says nothing whatsoever about
 * whether that font package works.
 *
 * AC-01 is proven ONLY by running this assertion with the runner image's font
 * set — `docker build` the image and execute it inside the container, or via a
 * CI job that does. Do not read a local green as evidence the font fix landed.
 * ────────────────────────────────────────────────────────────────────────────
 */

// A codepoint no font covers. U+0378 is PERMANENTLY UNASSIGNED in Unicode (a
// reserved hole in the Greek and Coptic block), so unlike a Private Use Area
// codepoint it cannot be claimed by an icon font on some particular host —
// Windows' Segoe MDL2 Assets, for instance, does map parts of the BMP PUA.
// Measured identically to U+E000 and U+F0000 on this machine (see the threshold
// note in helpers/rasterize.ts), i.e. all three produce the same empty box.
const UNCOVERED_CHAR = '͸'

// The glyph AC-01 is about. Named here and nowhere in the harness: the harness
// is deliberately glyph-agnostic so proposal 007 and any later font question can
// reuse it unchanged.
const STAR = '★'

// Captured before the harness touches anything. The whole suite shares ONE
// Playwright worker and other files gate their skips on these vars, so the
// harness must hand them back exactly as it found them (asserted below).
const MOCK_ENV_AT_LOAD = {
  MOCK_PUPPETEER: process.env.MOCK_PUPPETEER,
  MOCK_AI: process.env.MOCK_AI,
}

let chromiumSkipReason: string | null = null

test.beforeAll(async () => {
  const resolution = resolveChromiumExecutable()
  console.log(`[render-fidelity] chromium: ${resolution.source} ${resolution.path ?? '(renderer autodetect)'}`)
  try {
    // Warm-up render: launches the shared browser once and, more importantly,
    // turns "no browser on this host" into a SKIP rather than N confusing
    // failures. Any other error is a real failure and is rethrown.
    await renderGlyphPng(DEFAULT_CONTROL_CHAR, { box: 32, fontSize: 24 })
  } catch (err) {
    if (!isChromiumMissingError(err)) throw err
    chromiumSkipReason = (err as Error).message
  }
})

test('TC-RENDER-01 the harness runs the real renderHtmlToPng, not the MOCK_PUPPETEER stub', async () => {
  test.skip(chromiumSkipReason !== null, `no Chromium available: ${chromiumSkipReason}`)
  test.setTimeout(120_000)

  const box = 240
  const png = await renderGlyphPng(DEFAULT_CONTROL_CHAR, { box })
  const decoded = decodePng(png)

  // MOCK_PNG_BUFFER is a fixed 1×1 transparent PNG of 70 bytes. A real render
  // screenshots the viewport at deviceScaleFactor 2, so these three assertions
  // are each individually impossible for the mock to satisfy.
  expect(decoded.width).toBe(box * 2)
  expect(decoded.height).toBe(box * 2)
  expect(png.byteLength).toBeGreaterThan(1000)

  // And the pixels are a real rasterization: the control glyph left ink.
  const { metrics } = await measureGlyphRender(DEFAULT_CONTROL_CHAR, { box })
  console.log(`[render-fidelity] ${formatMetrics(metrics)}`)
  expect(metrics.inkPixels).toBeGreaterThan(0)
  expect(metrics.bbox).not.toBeNull()

  // Forcing the seam off must not leak into the rest of the suite.
  expect(process.env.MOCK_PUPPETEER).toBe(MOCK_ENV_AT_LOAD.MOCK_PUPPETEER)
  expect(process.env.MOCK_AI).toBe(MOCK_ENV_AT_LOAD.MOCK_AI)
})

test('TC-RENDER-02 the tofu assertion FAILS a codepoint with no font coverage', async () => {
  test.skip(chromiumSkipReason !== null, `no Chromium available: ${chromiumSkipReason}`)
  test.setTimeout(120_000)

  const verdict = await checkGlyphCoverage(UNCOVERED_CHAR)
  console.log(`[render-fidelity] uncovered candidate: ${formatMetrics(verdict.candidate)}`)
  console.log(`[render-fidelity] uncovered verdict  : ${verdict.reason}`)

  expect(verdict.covered, verdict.reason).toBe(false)
  // The replacement box traces its own bounding box on every side — that, not a
  // match against any particular character's shape, is what was detected.
  expect(verdict.candidate.minEdgeCompleteness).toBeGreaterThanOrEqual(TOFU_EDGE_FLOOR)
})

test('TC-RENDER-03 the tofu assertion PASSES glyphs that do have coverage', async () => {
  test.skip(chromiumSkipReason !== null, `no Chromium available: ${chromiumSkipReason}`)
  test.setTimeout(120_000)

  // Several shapes, not one: a letter with an enclosed counter (O), one with
  // two full-height stems (H — the worst case for the edge-completeness
  // discriminator), and a diagonal one (W). If the heuristic were really just
  // "is it boxy", H would trip it.
  for (const char of ['O', 'H', 'W']) {
    const verdict = await checkGlyphCoverage(char)
    console.log(`[render-fidelity] covered "${char}": ${formatMetrics(verdict.candidate)}`)
    expect(verdict.covered, verdict.reason).toBe(true)
    expect(verdict.candidate.minEdgeCompleteness).toBeLessThan(TOFU_EDGE_FLOOR)
  }
})

test('TC-RENDER-04 ★ U+2605 renders as a star, not a replacement box (AC-01)', async () => {
  test.skip(chromiumSkipReason !== null, `no Chromium available: ${chromiumSkipReason}`)
  test.setTimeout(120_000)

  const verdict = await checkGlyphCoverage(STAR)
  console.log(`[render-fidelity] star: ${formatMetrics(verdict.candidate)}`)

  // ⚠️ READ THIS BEFORE TRUSTING A GREEN TICK.
  //
  // Passing on a developer machine proves NOTHING about the runner image. The
  // host almost certainly covers ★ from its own system fonts regardless of what
  // the Dockerfile installs, so this assertion is trivially satisfiable outside
  // the container. The defect it exists to catch — Alpine's Latin-only default
  // font set rasterizing ★ as tofu — can only be observed with the image's font
  // set present. AC-01 is met when, and only when, this case is green while
  // running inside the built runner image (or in a CI job that builds it).
  expect(verdict.covered, verdict.reason).toBe(true)
})
