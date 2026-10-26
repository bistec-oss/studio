// A tiny TrueType font, built in code for the render suite (031 AC-21, AC-23). No font file is
// committed and nothing is downloaded: the suite needs a face that covers Sinhala code points,
// and no small Sinhala font with a licence that allows committing it was available offline.
//
// The font has two glyphs: .notdef (empty) and one solid box, mapped from every code point of
// `ranges` (cmap format 4, through the glyph id array). It is a real, valid sfnt that Chromium's
// font sanitiser (OTS) accepts, so `document.fonts` loads it as any web font. Its glyphs are
// boxes, which is all the suite needs: it asserts which face painted the text, not how it looks.

interface Table {
  tag: string
  data: Buffer
}

function u16(n: number): Buffer {
  const b = Buffer.alloc(2)
  b.writeUInt16BE(n & 0xffff)
  return b
}
function i16(n: number): Buffer {
  const b = Buffer.alloc(2)
  b.writeInt16BE(n)
  return b
}
function u32(n: number): Buffer {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n >>> 0)
  return b
}
const cat = (parts: Buffer[]) => Buffer.concat(parts)

function checksum(buf: Buffer): number {
  const padded = Buffer.concat([buf, Buffer.alloc((4 - (buf.length % 4)) % 4)])
  let sum = 0
  for (let i = 0; i < padded.length; i += 4) sum = (sum + padded.readUInt32BE(i)) >>> 0
  return sum
}

function cmapTable(ranges: Array<[number, number]>): Buffer {
  const segs = [...ranges, [0xffff, 0xffff] as [number, number]]
  const segCount = segs.length
  const glyphIds: number[] = []
  const idRangeOffset: number[] = []
  segs.forEach(([start, end], i) => {
    if (start === 0xffff) {
      idRangeOffset.push(0)
      return
    }
    // Words from idRangeOffset[i] to this segment's first entry in glyphIdArray.
    idRangeOffset.push((segCount - i + glyphIds.length) * 2)
    for (let c = start; c <= end; c++) glyphIds.push(1)
  })
  const entrySelector = Math.floor(Math.log2(segCount))
  const searchRange = 2 * 2 ** entrySelector
  const body = cat([
    u16(segCount * 2),
    u16(searchRange),
    u16(entrySelector),
    u16(segCount * 2 - searchRange),
    ...segs.map(([, e]) => u16(e)),
    u16(0),
    ...segs.map(([s]) => u16(s)),
    ...segs.map(([s]) => i16(s === 0xffff ? 1 : 0)),
    ...idRangeOffset.map(u16),
    ...glyphIds.map(u16),
  ])
  const sub = cat([u16(4), u16(body.length + 6), u16(0), body])
  return cat([u16(0), u16(1), u16(3), u16(1), u32(12), sub])
}

function nameTable(family: string): Buffer {
  const records: Array<[number, string]> = [
    [1, family],
    [2, 'Regular'],
    [4, `${family} Regular`],
    [6, family.replace(/[^A-Za-z0-9]/g, '') + '-Regular'],
  ]
  const strings = records.map(([, s]) => Buffer.from(s, 'utf16le').swap16())
  let offset = 0
  const recs = records.map(([id], i) => {
    const r = cat([u16(3), u16(1), u16(0x409), u16(id), u16(strings[i].length), u16(offset)])
    offset += strings[i].length
    return r
  })
  return cat([u16(0), u16(records.length), u16(6 + records.length * 12), ...recs, ...strings])
}

/** A TrueType font named `family`, one box glyph for every code point in `ranges`. */
export function syntheticFont(family: string, ranges: Array<[number, number]>): Buffer {
  const upm = 1000
  // Glyph 1: one contour, a box 100..600 x 0..700, on-curve points, 16-bit deltas.
  const box = cat([
    i16(1), i16(100), i16(0), i16(600), i16(700),
    u16(3), u16(0),
    Buffer.from([0x01, 0x01, 0x01, 0x01]),
    i16(100), i16(500), i16(0), i16(-500),
    i16(0), i16(0), i16(700), i16(0),
  ])
  const glyf = cat([box, Buffer.alloc(box.length % 2)])
  const loca = cat([u16(0), u16(0), u16(glyf.length / 2)])
  const first = Math.min(...ranges.map(([s]) => s))
  const last = Math.max(...ranges.map(([, e]) => e))
  const head = cat([
    u32(0x00010000), u32(0x00010000), u32(0), u32(0x5f0f3cf5),
    u16(0x000b), u16(upm),
    Buffer.alloc(8), Buffer.alloc(8),
    i16(100), i16(0), i16(600), i16(700),
    u16(0), u16(8), i16(2), i16(0), i16(0),
  ])
  const hhea = cat([
    u32(0x00010000), i16(800), i16(-200), i16(0), u16(700),
    i16(0), i16(100), i16(600),
    i16(1), i16(0), i16(0),
    i16(0), i16(0), i16(0), i16(0),
    i16(0), u16(2),
  ])
  const hmtx = cat([u16(700), i16(0), u16(700), i16(100)])
  const maxp = cat([
    u32(0x00010000), u16(2), u16(4), u16(1), u16(0), u16(0), u16(2),
    u16(0), u16(0), u16(0), u16(0), u16(0), u16(0), u16(0), u16(0),
  ])
  const os2 = cat([
    u16(4), i16(700), u16(400), u16(5), u16(0),
    i16(650), i16(600), i16(0), i16(75), i16(650), i16(600), i16(0), i16(350),
    i16(50), i16(250), i16(0),
    Buffer.alloc(10),
    u32(0), u32(0), u32(0), u32(0),
    Buffer.from('NONE', 'ascii'),
    u16(0x0040), u16(first), u16(Math.min(last, 0xffff)),
    i16(800), i16(-200), i16(0), u16(800), u16(200),
    u32(1), u32(0),
    i16(500), i16(700), u16(0), u16(0x20), u16(1),
  ])
  const post = cat([u32(0x00030000), u32(0), i16(-100), i16(50), u32(0), u32(0), u32(0), u32(0), u32(0)])

  const tables: Table[] = [
    { tag: 'OS/2', data: os2 },
    { tag: 'cmap', data: cmapTable(ranges) },
    { tag: 'glyf', data: glyf },
    { tag: 'head', data: head },
    { tag: 'hhea', data: hhea },
    { tag: 'hmtx', data: hmtx },
    { tag: 'loca', data: loca },
    { tag: 'maxp', data: maxp },
    { tag: 'name', data: nameTable(family) },
    { tag: 'post', data: post },
  ]
  const numTables = tables.length
  const entrySelector = Math.floor(Math.log2(numTables))
  const searchRange = 16 * 2 ** entrySelector
  const header = cat([u32(0x00010000), u16(numTables), u16(searchRange), u16(entrySelector), u16(numTables * 16 - searchRange)])
  let offset = header.length + numTables * 16
  const dir: Buffer[] = []
  const bodies: Buffer[] = []
  for (const t of tables) {
    dir.push(cat([Buffer.from(t.tag, 'ascii'), u32(checksum(t.data)), u32(offset), u32(t.data.length)]))
    const padded = cat([t.data, Buffer.alloc((4 - (t.data.length % 4)) % 4)])
    bodies.push(padded)
    offset += padded.length
  }
  const font = cat([header, ...dir, ...bodies])
  // head.checkSumAdjustment: 0xB1B0AFBA minus the checksum of the whole font.
  const headOffset = font.readUInt32BE(header.length + tables.findIndex((t) => t.tag === 'head') * 16 + 8)
  font.writeUInt32BE((0xb1b0afba - checksum(font)) >>> 0, headOffset + 8)
  return font
}

/** The font as a `data:` URI for an @font-face src. */
export function syntheticFontDataUri(family: string, ranges: Array<[number, number]>): string {
  return `data:font/ttf;base64,${syntheticFont(family, ranges).toString('base64')}`
}
