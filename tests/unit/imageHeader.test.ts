import { describe, it, expect } from 'vitest'
import {
  checkScreenshot,
  readImageHeader,
  MAX_SCREENSHOT_BYTES,
  MAX_SCREENSHOT_PIXELS,
  MAX_SCREENSHOT_SIDE,
  MIN_SCREENSHOT_HEIGHT,
  MIN_SCREENSHOT_WIDTH,
} from '@/lib/composite/imageHeader'
import { GIF_BYTES, SVG_AS_PNG, makeJpegHeader, makePng, makeWebpHeader } from '../helpers/images'

describe('readImageHeader (025 FR-10, AC-09)', () => {
  it('reads PNG dimensions from IHDR', () => {
    expect(readImageHeader(makePng(800, 500))).toEqual({ ok: true, type: 'png', width: 800, height: 500 })
  })

  it('reads JPEG dimensions from a SOF marker, baseline and progressive', () => {
    expect(readImageHeader(makeJpegHeader(1200, 750))).toEqual({ ok: true, type: 'jpeg', width: 1200, height: 750 })
    expect(readImageHeader(makeJpegHeader(1200, 750, 0xc2))).toEqual({ ok: true, type: 'jpeg', width: 1200, height: 750 })
  })

  it('reads WebP dimensions for VP8, VP8L and VP8X', () => {
    for (const kind of ['VP8 ', 'VP8L', 'VP8X'] as const) {
      expect(readImageHeader(makeWebpHeader(kind, 1024, 640))).toEqual({ ok: true, type: 'webp', width: 1024, height: 640 })
    }
  })

  it('refuses a renamed SVG, a GIF, plain text and an empty file', () => {
    for (const bytes of [SVG_AS_PNG, GIF_BYTES, Buffer.from('hello'), Buffer.alloc(0)]) {
      expect(readImageHeader(bytes).ok).toBe(false)
    }
  })

  it('refuses a truncated PNG, JPEG and WebP', () => {
    const png = makePng(800, 500)
    expect(readImageHeader(png.subarray(0, 20)).ok).toBe(false)
    expect(readImageHeader(png.subarray(0, png.length - 5)).ok).toBe(false) // IEND cut
    expect(readImageHeader(makeJpegHeader(800, 500).subarray(0, 12)).ok).toBe(false) // before the SOF
    const webp = makeWebpHeader('VP8 ', 800, 500)
    expect(readImageHeader(webp.subarray(0, 24)).ok).toBe(false)
    expect(readImageHeader(webp.subarray(0, webp.length - 4)).ok).toBe(false) // RIFF size > bytes
  })

  it('refuses a RIFF file that is not WebP, and an unknown WebP chunk', () => {
    const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.from([40, 0, 0, 0]), Buffer.from('WAVEfmt '), Buffer.alloc(40)])
    expect(readImageHeader(wav).ok).toBe(false)
    const odd = makeWebpHeader('VP8 ', 800, 500)
    odd.write('ALPH', 12, 'ascii')
    expect(readImageHeader(odd).ok).toBe(false)
  })
})

describe('checkScreenshot limits (025 FR-10)', () => {
  it('accepts the minimum size and the maximum side', () => {
    const min = checkScreenshot(makeJpegHeader(MIN_SCREENSHOT_WIDTH, MIN_SCREENSHOT_HEIGHT))
    expect(min).toMatchObject({ ok: true, ext: 'jpg', mime: 'image/jpeg' })
    // 8000 x 3125 = 25,000,000 px: both the side and the pixel limits at their edge.
    expect(checkScreenshot(makeJpegHeader(MAX_SCREENSHOT_SIDE, MAX_SCREENSHOT_PIXELS / MAX_SCREENSHOT_SIDE)).ok).toBe(true)
  })

  it('refuses a screenshot below 640 x 400 on either side', () => {
    expect(checkScreenshot(makeJpegHeader(639, 400)).ok).toBe(false)
    expect(checkScreenshot(makeJpegHeader(640, 399)).ok).toBe(false)
    expect(checkScreenshot(makeWebpHeader('VP8L', 600, 400)).ok).toBe(false)
  })

  it('refuses a side above 8000 and a total above 25 million pixels', () => {
    expect(checkScreenshot(makeWebpHeader('VP8X', MAX_SCREENSHOT_SIDE + 1, 700)).ok).toBe(false)
    expect(checkScreenshot(makeJpegHeader(MAX_SCREENSHOT_SIDE, 3126)).ok).toBe(false) // 25,008,000 px
    expect(checkScreenshot(makeJpegHeader(5001, 5000)).ok).toBe(false)
  })

  it('refuses more than 10 MB before reading the header', () => {
    const big = Buffer.concat([makeJpegHeader(800, 500), Buffer.alloc(MAX_SCREENSHOT_BYTES)])
    const r = checkScreenshot(big)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/10 MB/)
  })

  it('returns the type, extension and size of a good PNG', () => {
    expect(checkScreenshot(makePng(1280, 800))).toEqual({
      ok: true,
      type: 'png',
      mime: 'image/png',
      ext: 'png',
      width: 1280,
      height: 800,
    })
  })
})
