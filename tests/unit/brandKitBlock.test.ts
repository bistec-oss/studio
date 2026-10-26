// 031 T12 (AC-31, FR-33): the ```brandkit block parses the new and the old `fonts` shapes.
import { describe, it, expect } from 'vitest'
import { extractBrandKitBlock } from '@/lib/brandkit/assistant'

const block = (o: unknown) => '```brandkit\n' + JSON.stringify(o) + '\n```'

describe('brandkit block fonts (FR-33)', () => {
  it('parses the new { heading, body } object', () => {
    const b = extractBrandKitBlock(block({ voice: 'v', fonts: { heading: 'Poppins', body: 'Inter' } }))
    expect(b!.fonts).toEqual({ heading: 'Poppins', body: 'Inter' })
  })
  it('parses a partial object', () => {
    expect(extractBrandKitBlock(block({ voice: 'v', fonts: { body: 'Inter' } }))!.fonts).toEqual({ body: 'Inter' })
  })
  it('maps the old string[] to heading and body (first two entries)', () => {
    const b = extractBrandKitBlock(block({ voice: 'v', fonts: ['Poppins', 'Inter', 'Lora'] }))
    expect(b!.fonts).toEqual({ heading: 'Poppins', body: 'Inter' })
    expect(extractBrandKitBlock(block({ voice: 'v', fonts: ['Poppins'] }))!.fonts).toEqual({ heading: 'Poppins' })
  })
  it('defaults to {} when fonts is absent or an empty array', () => {
    expect(extractBrandKitBlock(block({ voice: 'v' }))!.fonts).toEqual({})
    expect(extractBrandKitBlock(block({ voice: 'v', fonts: [] }))!.fonts).toEqual({})
  })
  it('parses an optional scriptFonts map and leaves it undefined otherwise', () => {
    expect(
      extractBrandKitBlock(block({ voice: 'v', scriptFonts: { sinhala: 'Noto Sans Sinhala' } }))!.scriptFonts,
    ).toEqual({ sinhala: 'Noto Sans Sinhala' })
    expect(extractBrandKitBlock(block({ voice: 'v' }))!.scriptFonts).toBeUndefined()
  })
  it('rejects a block whose fonts is neither shape', () => {
    expect(extractBrandKitBlock(block({ voice: 'v', fonts: 'Inter' }))).toBeNull()
    expect(extractBrandKitBlock(block({ voice: 'v', fonts: [1] }))).toBeNull()
  })
})
