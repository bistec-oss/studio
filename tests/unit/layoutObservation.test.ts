import { describe, it, expect } from 'vitest'
import { evaluateLayout, LAYOUT_TOLERANCE_PCT, type Region } from '@/lib/designData'

// The left 45%, full height (the product-showcase SQUARE text region).
const regions: Region[] = [{ rect: { x: 0, y: 0, w: 45, h: 100 }, purpose: 'text', minAreaPct: 20 }]

describe('evaluateLayout (AC-14, pure half)', () => {
  it('the tolerance is 2%', () => {
    expect(LAYOUT_TOLERANCE_PCT).toBe(2)
  })

  it('no boxes is ok', () => {
    expect(evaluateLayout([], regions)).toEqual({ ok: true })
  })

  it('a box inside a text region is ok', () => {
    expect(evaluateLayout([{ x: 5, y: 10, w: 30, h: 20 }], regions)).toEqual({ ok: true })
  })

  it('a box inside the 2% tolerance is ok', () => {
    expect(evaluateLayout([{ x: 5, y: 10, w: 41.9, h: 20 }], regions)).toEqual({ ok: true }) // right edge 46.9
    expect(evaluateLayout([{ x: 5, y: 10, w: 42, h: 20 }], regions)).toEqual({ ok: true }) // right edge 47 exactly
  })

  it('a box just outside the tolerance is a violation', () => {
    expect(evaluateLayout([{ x: 5, y: 10, w: 42.1, h: 20 }], regions)).toEqual({ ok: false, outside: 1 })
  })

  it('a box partly outside is a violation', () => {
    expect(evaluateLayout([{ x: 30, y: 10, w: 40, h: 20 }], regions)).toEqual({ ok: false, outside: 1 })
  })

  it('counts every box that is outside', () => {
    const boxes = [
      { x: 5, y: 10, w: 30, h: 20 },
      { x: 60, y: 10, w: 20, h: 20 },
      { x: 70, y: 50, w: 10, h: 10 },
    ]
    expect(evaluateLayout(boxes, regions)).toEqual({ ok: false, outside: 2 })
  })

  it('a box inside any one text region is ok; clear regions never count', () => {
    const two: Region[] = [
      ...regions,
      { rect: { x: 60, y: 0, w: 40, h: 20 }, purpose: 'text', minAreaPct: 5 },
      { rect: { x: 50, y: 50, w: 50, h: 50 }, purpose: 'clear', minAreaPct: 5 },
    ]
    expect(evaluateLayout([{ x: 62, y: 2, w: 20, h: 10 }], two)).toEqual({ ok: true })
    expect(evaluateLayout([{ x: 60, y: 60, w: 20, h: 10 }], two)).toEqual({ ok: false, outside: 1 })
  })

  it('the tolerance is a parameter', () => {
    const box = [{ x: 5, y: 10, w: 42.5, h: 20 }] // right edge 47.5
    expect(evaluateLayout(box, regions)).toEqual({ ok: false, outside: 1 })
    expect(evaluateLayout(box, regions, 3)).toEqual({ ok: true })
  })

  it('a box at the canvas edge is ok (tolerance expands past 0)', () => {
    expect(evaluateLayout([{ x: -0.5, y: -0.5, w: 20, h: 20 }], regions)).toEqual({ ok: true })
  })

  it('no text regions: any box is outside', () => {
    expect(evaluateLayout([{ x: 1, y: 1, w: 1, h: 1 }], [])).toEqual({ ok: false, outside: 1 })
  })
})
