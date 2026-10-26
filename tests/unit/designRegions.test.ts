import { describe, it, expect } from 'vitest'
import { coverFit, mapRegionToImage } from '@/lib/designData'

const sq = { w: 1080, h: 1080 }
const pt = { w: 1080, h: 1350 }
const left45 = { x: 0, y: 0, w: 45, h: 100 }

describe('coverFit', () => {
  it('square image on the square canvas: scale 1080/1024, no offset', () => {
    const f = coverFit(sq, { w: 1024, h: 1024 })
    expect(f.scale).toBeCloseTo(1.0546875, 6)
    expect(f.offset).toEqual({ x: 0, y: 0 })
  })

  it('1024x1536 on 1080x1350: scaled 1080x1620, offset.y -135', () => {
    const f = coverFit(pt, { w: 1024, h: 1536 })
    expect(f.scale).toBeCloseTo(1.0546875, 6)
    expect(f.scaled.w).toBeCloseTo(1080, 6)
    expect(f.scaled.h).toBeCloseTo(1620, 6)
    expect(f.offset.y).toBeCloseTo(-135, 6)
    expect(f.offset.x).toBeCloseTo(0, 6)
  })
})

describe('mapRegionToImage (AC-09)', () => {
  it('square image, square canvas: the left 45% maps with no crop', () => {
    const m = mapRegionToImage(left45, sq, { w: 1024, h: 1024 })!
    expect(m.px.x).toBeCloseTo(0, 6)
    expect(m.px.y).toBeCloseTo(0, 6)
    expect(m.px.w).toBeCloseTo(460.8, 4)
    expect(m.px.h).toBeCloseTo(1024, 4)
    expect(m.areaPct).toBeCloseTo(45, 6)
  })

  it('1024x1536 on 1080x1350: left 45% is image x 0..460.8, y 128..1408; the cropped rows are not sampled', () => {
    const m = mapRegionToImage(left45, pt, { w: 1024, h: 1536 })!
    expect(m.px.x).toBeCloseTo(0, 4)
    expect(m.px.w).toBeCloseTo(460.8, 4)
    expect(m.px.y).toBeCloseTo(128, 4)
    expect(m.px.y + m.px.h).toBeCloseTo(1408, 4)
    expect(m.areaPct).toBeCloseTo(45, 6)
  })

  it('a Gemini-shaped 1024x1280 image on 1080x1350 maps with no crop (same 4:5 ratio)', () => {
    const m = mapRegionToImage({ x: 0, y: 0, w: 100, h: 38 }, pt, { w: 1024, h: 1280 })!
    expect(m.px.y).toBeCloseTo(0, 4)
    expect(m.px.h).toBeCloseTo(0.38 * 1280, 3)
    expect(m.px.w).toBeCloseTo(1024, 4)
    expect(m.areaPct).toBeCloseTo(38, 6)
  })

  it('clips a region that overhangs the covered part and reports the clipped area', () => {
    // A wide image on the square canvas: cover scales by height, so the image is wider than the canvas.
    // The region below is the whole canvas, covered fully; an image shorter than the canvas cannot happen under cover,
    // so exercise clipping with a rect larger than the canvas.
    const m = mapRegionToImage({ x: -10, y: 0, w: 120, h: 100 }, sq, { w: 1024, h: 1024 })!
    expect(m.px.x).toBeCloseTo(0, 6)
    expect(m.px.w).toBeCloseTo(1024, 4)
    expect(m.areaPct).toBeCloseTo(100, 6)
  })

  it('null for a zero, negative or NaN dimension, a degenerate rect, or a region off the image', () => {
    expect(mapRegionToImage(left45, sq, { w: 0, h: 1024 })).toBeNull()
    expect(mapRegionToImage(left45, sq, { w: 1024, h: -1 })).toBeNull()
    expect(mapRegionToImage(left45, sq, { w: NaN, h: 1024 })).toBeNull()
    expect(mapRegionToImage(left45, { w: 0, h: 1080 }, { w: 1024, h: 1024 })).toBeNull()
    expect(mapRegionToImage({ x: 0, y: 0, w: 0, h: 100 }, sq, { w: 1024, h: 1024 })).toBeNull()
    expect(mapRegionToImage({ x: NaN, y: 0, w: 10, h: 10 }, sq, { w: 1024, h: 1024 })).toBeNull()
    expect(mapRegionToImage({ x: 120, y: 0, w: 10, h: 100 }, sq, { w: 1024, h: 1024 })).toBeNull()
  })
})

describe('STORY worked case (028 design section 3)', () => {
  const story = { w: 1080, h: 1920 }
  it('1024x1536 on 1080x1920: scale 1.25, scaled 1280x1920, offset x -100', () => {
    const f = coverFit(story, { w: 1024, h: 1536 })
    expect(f.scale).toBeCloseTo(1.25, 9)
    expect(f.scaled.w).toBeCloseTo(1280, 6)
    expect(f.scaled.h).toBeCloseTo(1920, 6)
    expect(f.offset.x).toBeCloseTo(-100, 6)
    expect(f.offset.y).toBeCloseTo(0, 6)
  })

  it('the full-width band {0, 65, 100, 35} maps to image x 80..944, y 998.4..1536', () => {
    const m = mapRegionToImage({ x: 0, y: 65, w: 100, h: 35 }, story, { w: 1024, h: 1536 })!
    expect(m.px.x).toBeCloseTo(80, 4)
    expect(m.px.w).toBeCloseTo(864, 4)
    expect(m.px.y).toBeCloseTo(998.4, 4)
    expect(m.px.h).toBeCloseTo(537.6, 4)
  })
})
