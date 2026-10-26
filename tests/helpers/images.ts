import { deflateSync } from 'node:zlib'

// Minimal synthetic images for the screenshot tests (025). They carry real
// headers and, for PNG, a valid IDAT and checksums; the pixel content is flat.

function crc32(buf: Uint8Array): number {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}
const u32 = (n: number) => Buffer.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])
function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  return Buffer.concat([u32(data.length), body, u32(crc32(body))])
}

// A flat grey 8-bit PNG of the given size.
export function makePng(width: number, height: number): Buffer {
  const ihdr = Buffer.concat([u32(width), u32(height), Buffer.from([8, 0, 0, 0, 0])])
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width, 0x80)])
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// A JPEG shell: SOI, an APP0 segment, a SOF0 frame header with the size, EOI.
// Enough for a header parser; not a decodable picture.
export function makeJpegHeader(width: number, height: number, marker = 0xc0): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0])
  const sof = Buffer.from([0xff, marker, 0x00, 0x0b, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x01, 0x01, 0x11, 0x00])
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])])
}

const le32 = (n: number) => Buffer.from([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255])
function riff(chunkType: string, data: Buffer): Buffer {
  const padded = data.length % 2 ? Buffer.concat([data, Buffer.from([0])]) : data
  const body = Buffer.concat([Buffer.from('WEBP', 'ascii'), Buffer.from(chunkType, 'ascii'), le32(data.length), padded])
  return Buffer.concat([Buffer.from('RIFF', 'ascii'), le32(body.length), body])
}

export type WebpKind = 'VP8 ' | 'VP8L' | 'VP8X'

// A WebP shell with the given chunk kind and size (header only, not decodable).
export function makeWebpHeader(kind: WebpKind, width: number, height: number): Buffer {
  if (kind === 'VP8 ') {
    const d = Buffer.alloc(20)
    d.set([0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a], 0)
    d.writeUInt16LE(width & 0x3fff, 6)
    d.writeUInt16LE(height & 0x3fff, 8)
    return riff(kind, d)
  }
  if (kind === 'VP8L') {
    const d = Buffer.alloc(20)
    d[0] = 0x2f
    d.writeUInt32LE(((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14), 1)
    return riff(kind, d)
  }
  const d = Buffer.alloc(20)
  d.writeUIntLE(width - 1, 4, 3)
  d.writeUIntLE(height - 1, 7, 3)
  return riff(kind, d)
}

export const SVG_AS_PNG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500"/></svg>')
export const GIF_BYTES = Buffer.from('GIF89a', 'ascii')
