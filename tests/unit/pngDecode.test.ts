import { describe, expect, it } from 'vitest'
import { deflateSync } from 'node:zlib'
import { decodePng } from '../../scripts/glyph-check/glyphCoverage.mjs'

// The render harness and the in-image glyph check both judge pixels through
// this hand-rolled decoder (no PNG dependency exists in the runner image), so
// every PNG row filter must reconstruct exactly.

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]) // CRC unchecked
}

function paeth(a: number, b: number, c: number): number {
  const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

// Encode rows with filter type (row % 5), so all five filters appear.
function encodePng(width: number, height: number, channels: 1 | 3 | 4, pixels: Uint8Array, bitDepth = 8): Buffer {
  const stride = width * channels
  const rows: number[] = []
  for (let y = 0; y < height; y++) {
    const f = y % 5
    rows.push(f)
    for (let x = 0; x < stride; x++) {
      const v = pixels[y * stride + x]
      const a = x >= channels ? pixels[y * stride + x - channels] : 0
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0
      const c = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0
      const pred = [0, a, b, (a + b) >> 1, paeth(a, b, c)][f]
      rows.push((v - pred) & 0xff)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = bitDepth
  ihdr[9] = { 1: 0, 3: 2, 4: 6 }[channels]
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const pattern = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 37 + (i >> 3) * 11) & 0xff)

describe('decodePng', () => {
  it('reconstructs RGBA through all five row filters', () => {
    const src = pattern(7 * 10 * 4)
    const img = decodePng(encodePng(7, 10, 4, src))
    expect([img.width, img.height]).toEqual([7, 10])
    expect(Array.from(img.data)).toEqual(Array.from(src))
  })

  it('expands RGB to opaque RGBA', () => {
    const src = pattern(5 * 6 * 3)
    const img = decodePng(encodePng(5, 6, 3, src))
    for (let i = 0; i < 30; i++) {
      expect(Array.from(img.data.subarray(i * 4, i * 4 + 4))).toEqual([src[i * 3], src[i * 3 + 1], src[i * 3 + 2], 255])
    }
  })

  it('expands greyscale to opaque RGBA', () => {
    const src = pattern(4 * 5)
    const img = decodePng(encodePng(4, 5, 1, src))
    expect(Array.from(img.data.subarray(8, 12))).toEqual([src[2], src[2], src[2], 255])
  })

  it('rejects non-PNG input and unsupported formats instead of guessing', () => {
    expect(() => decodePng(Buffer.from('not a png at all'))).toThrow(/signature/)
    expect(() => decodePng(encodePng(2, 2, 4, pattern(16), 16))).toThrow(/unsupported/)
  })
})
