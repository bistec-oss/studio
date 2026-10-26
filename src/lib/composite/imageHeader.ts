// 025 FR-10: the type and size of an uploaded screenshot, read from its magic
// bytes. Pure: no I/O, no client MIME type. A renamed SVG, a GIF, a truncated
// file and anything else that is not a PNG, JPEG or WebP is refused.

export const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024
export const MIN_SCREENSHOT_WIDTH = 640
export const MIN_SCREENSHOT_HEIGHT = 400
export const MAX_SCREENSHOT_PIXELS = 25_000_000
export const MAX_SCREENSHOT_SIDE = 8_000

export type ScreenshotType = 'png' | 'jpeg' | 'webp'

export const SCREENSHOT_MIME: Record<ScreenshotType, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}
export const SCREENSHOT_EXT: Record<ScreenshotType, string> = { png: 'png', jpeg: 'jpg', webp: 'webp' }

export type ImageHeader =
  | { ok: true; type: ScreenshotType; width: number; height: number }
  | { ok: false; error: string }

const NOT_SUPPORTED = 'The file is not a PNG, JPEG or WebP image'
const TRUNCATED = 'The image file is incomplete'

const fail = (error: string): ImageHeader => ({ ok: false, error })
const ascii = (b: Uint8Array, at: number, s: string) => {
  if (at + s.length > b.length) return false
  for (let i = 0; i < s.length; i++) if (b[at + i] !== s.charCodeAt(i)) return false
  return true
}
const u16be = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1]
const u32be = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
const u32le = (b: Uint8Array, at: number) => ((b[at + 3] << 24) | (b[at + 2] << 16) | (b[at + 1] << 8) | b[at]) >>> 0

function readPng(b: Uint8Array): ImageHeader {
  // signature (8) + IHDR chunk (length 4, type 4, data 13, crc 4) = 33 bytes
  if (b.length < 33 || !ascii(b, 12, 'IHDR')) return fail(TRUNCATED)
  // A complete PNG ends with an empty IEND chunk (length 0, "IEND", crc).
  const end = b.length - 12
  if (!(u32be(b, end) === 0 && ascii(b, end + 4, 'IEND'))) return fail(TRUNCATED)
  return { ok: true, type: 'png', width: u32be(b, 16), height: u32be(b, 20) }
}

function readJpeg(b: Uint8Array): ImageHeader {
  let i = 2
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return fail(TRUNCATED)
    let marker = b[i + 1]
    // Fill bytes: any number of 0xFF may precede a marker.
    while (marker === 0xff && i + 2 < b.length) {
      i++
      marker = b[i + 1]
    }
    // Standalone markers (no length): TEM, RSTn, SOI.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += 2
      continue
    }
    if (marker === 0xd9 || marker === 0xda) return fail(TRUNCATED) // EOI / SOS before any SOF
    const len = u16be(b, i + 2)
    if (len < 2) return fail(TRUNCATED)
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isSof) {
      if (i + 9 > b.length) return fail(TRUNCATED)
      return { ok: true, type: 'jpeg', width: u16be(b, i + 7), height: u16be(b, i + 5) }
    }
    i += 2 + len
  }
  return fail(TRUNCATED)
}

function readWebp(b: Uint8Array): ImageHeader {
  if (b.length < 30) return fail(TRUNCATED)
  // RIFF size counts everything after the first 8 bytes; a shorter file was cut.
  if (u32le(b, 4) + 8 > b.length) return fail(TRUNCATED)
  const d = 20 // first chunk's data
  if (ascii(b, 12, 'VP8 ')) {
    if (!(b[d + 3] === 0x9d && b[d + 4] === 0x01 && b[d + 5] === 0x2a)) return fail(NOT_SUPPORTED)
    return { ok: true, type: 'webp', width: (b[d + 6] | (b[d + 7] << 8)) & 0x3fff, height: (b[d + 8] | (b[d + 9] << 8)) & 0x3fff }
  }
  if (ascii(b, 12, 'VP8L')) {
    if (b[d] !== 0x2f) return fail(NOT_SUPPORTED)
    const bits = u32le(b, d + 1)
    return { ok: true, type: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
  }
  if (ascii(b, 12, 'VP8X')) {
    const w = (b[d + 4] | (b[d + 5] << 8) | (b[d + 6] << 16)) + 1
    const h = (b[d + 7] | (b[d + 8] << 8) | (b[d + 9] << 16)) + 1
    return { ok: true, type: 'webp', width: w, height: h }
  }
  return fail(NOT_SUPPORTED)
}

// The type and pixel size of an image, from its bytes alone.
export function readImageHeader(bytes: Uint8Array): ImageHeader {
  const b = bytes
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 'PNG') && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    return readPng(b)
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return readJpeg(b)
  if (b.length >= 12 && ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP')) return readWebp(b)
  return fail(NOT_SUPPORTED)
}

export type ScreenshotCheck =
  | { ok: true; type: ScreenshotType; mime: string; ext: string; width: number; height: number }
  | { ok: false; error: string }

// The FR-10 gate: size in bytes, then the header, then the dimension limits.
export function checkScreenshot(bytes: Uint8Array): ScreenshotCheck {
  if (bytes.length > MAX_SCREENSHOT_BYTES) {
    return { ok: false, error: `The screenshot is larger than ${MAX_SCREENSHOT_BYTES / 1024 / 1024} MB` }
  }
  const h = readImageHeader(bytes)
  if (!h.ok) return h
  const { width, height } = h
  if (width < 1 || height < 1) return { ok: false, error: TRUNCATED }
  if (width < MIN_SCREENSHOT_WIDTH || height < MIN_SCREENSHOT_HEIGHT) {
    return { ok: false, error: `The screenshot must be at least ${MIN_SCREENSHOT_WIDTH} by ${MIN_SCREENSHOT_HEIGHT} pixels (this one is ${width} by ${height})` }
  }
  if (width > MAX_SCREENSHOT_SIDE || height > MAX_SCREENSHOT_SIDE) {
    return { ok: false, error: `Each side of the screenshot must be at most ${MAX_SCREENSHOT_SIDE} pixels (this one is ${width} by ${height})` }
  }
  if (width * height > MAX_SCREENSHOT_PIXELS) {
    return { ok: false, error: `The screenshot must be at most ${MAX_SCREENSHOT_PIXELS / 1_000_000} million pixels (this one is ${width} by ${height})` }
  }
  return { ok: true, type: h.type, mime: SCREENSHOT_MIME[h.type], ext: SCREENSHOT_EXT[h.type], width, height }
}
