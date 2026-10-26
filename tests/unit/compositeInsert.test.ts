// 025 T8 (FR-12 amended by A1, AC-11): code inserts the screenshot element at
// the detected rect. Pure string tests: idempotent, impostors removed, the px
// box equals the rect at every size, strip then insert round-trips, and the
// pure check that the renderer runs.
import { describe, it, expect } from 'vitest'
import {
  COMPOSITE_TOKEN,
  compositeElement,
  compositeHtmlProblems,
  compositeRectPx,
  insertComposite,
  stripComposite,
} from '@/lib/composite/insert'
import { ASPECT_DIMENSIONS } from '@/lib/aspectRatio'
import { archetypes, compositeRegionOf, type Rect } from '@/lib/designData'

const PAGE = '<!doctype html><html><head><style>body{margin:0}</style></head><body><h1>Big news</h1></body></html>'

// A detected screen that differs from the contract region at every size (AC-11 amended).
const OFFSET: Record<'SQUARE' | 'PORTRAIT' | 'STORY', Rect> = {
  SQUARE: { x: 17, y: 44, w: 72, h: 45 },
  PORTRAIT: { x: 12, y: 47, w: 80, h: 40 },
  STORY: { x: 10, y: 46, w: 84, h: 29.5 },
}

describe('insertComposite', () => {
  it('writes exactly one canonical element and the token, last in the body', () => {
    const out = insertComposite(PAGE, OFFSET.SQUARE, ASPECT_DIMENSIONS.SQUARE)
    expect(out.match(/data-composite="0"/g)).toHaveLength(1)
    expect(out.split(COMPOSITE_TOKEN).length - 1).toBe(1)
    expect(out.endsWith('</body></html>')).toBe(true)
    expect(out.indexOf('data-composite="0"')).toBeGreaterThan(out.indexOf('<h1>'))
    expect(out).toContain('z-index:2147483647')
    expect(out).toContain('background:#0b0b0b')
    expect(out).toContain('overflow:hidden')
    expect(out).toContain('object-fit:contain')
  })

  it('is idempotent: twice equals once', () => {
    for (const size of ['SQUARE', 'PORTRAIT', 'STORY'] as const) {
      const once = insertComposite(PAGE, OFFSET[size], ASPECT_DIMENSIONS[size])
      expect(insertComposite(once, OFFSET[size], ASPECT_DIMENSIONS[size])).toBe(once)
    }
  })

  it('moving the rect replaces the element rather than adding a second', () => {
    const a = insertComposite(PAGE, OFFSET.SQUARE, ASPECT_DIMENSIONS.SQUARE)
    const b = insertComposite(a, { x: 14, y: 42, w: 72, h: 45 }, ASPECT_DIMENSIONS.SQUARE)
    expect(b.match(/data-composite="0"/g)).toHaveLength(1)
    expect(b).not.toBe(a)
  })

  it('removes a model-written data-composite element, nested or not, and keeps the rest', () => {
    const dirty =
      '<html><body><div data-composite="9" style="position:fixed"><div><span>fake</span></div></div>' +
      '<p>keep me</p><img data-composite src="x.png"><section data-composite="2"><div>inner</div></section></body></html>'
    const out = insertComposite(dirty, OFFSET.SQUARE, ASPECT_DIMENSIONS.SQUARE)
    expect(out).not.toContain('fake')
    expect(out).not.toContain('x.png')
    expect(out).not.toContain('inner')
    expect(out).toContain('<p>keep me</p>')
    expect(out.match(/data-composite(?![\w-])/g)).toHaveLength(1)
  })

  it('does not treat data-composite-img or a longer attribute as an impostor on its own', () => {
    const html = '<html><body><div data-composite-other="1">x</div></body></html>'
    expect(stripComposite(html)).toBe(html)
  })

  it("the element's px box equals the rect at each size, and differs from the contract region", () => {
    for (const size of ['SQUARE', 'PORTRAIT', 'STORY'] as const) {
      const canvas = ASPECT_DIMENSIONS[size]
      const rect = OFFSET[size]
      const region = compositeRegionOf(archetypes['device-screen'].versions[1].sizes[size]!)!
      expect(rect).not.toEqual(region.rect)
      const px = compositeRectPx(rect, canvas)
      expect(px.left).toBeCloseTo((rect.x * canvas.width) / 100, 1)
      expect(px.top).toBeCloseTo((rect.y * canvas.height) / 100, 1)
      expect(px.width).toBeCloseTo((rect.w * canvas.width) / 100, 1)
      expect(px.height).toBeCloseTo((rect.h * canvas.height) / 100, 1)
      const out = insertComposite(PAGE, rect, canvas)
      expect(out).toContain(`left:${px.left}px;top:${px.top}px;width:${px.width}px;height:${px.height}px`)
      expect(out).toContain(compositeElement(px))
    }
  })

  it('with no </body> the element is appended', () => {
    const out = insertComposite('<div>bare</div>', OFFSET.SQUARE, ASPECT_DIMENSIONS.SQUARE)
    expect(out.startsWith('<div>bare</div><div data-composite="0"')).toBe(true)
  })
})

describe('stripComposite', () => {
  it('strip then insert round-trips, and insert then strip restores the page byte for byte', () => {
    for (const size of ['SQUARE', 'PORTRAIT', 'STORY'] as const) {
      const inserted = insertComposite(PAGE, OFFSET[size], ASPECT_DIMENSIONS[size])
      expect(stripComposite(inserted)).toBe(PAGE)
      expect(insertComposite(stripComposite(inserted), OFFSET[size], ASPECT_DIMENSIONS[size])).toBe(inserted)
    }
  })

  it('a page with no composite is returned unchanged', () => {
    expect(stripComposite(PAGE)).toBe(PAGE)
  })
})

describe('compositeHtmlProblems (the pure render check)', () => {
  const canvas = ASPECT_DIMENSIONS.SQUARE
  const px = compositeRectPx(OFFSET.SQUARE, canvas)
  const good = insertComposite(PAGE, OFFSET.SQUARE, canvas)

  it('is empty for the canonical element at the rect', () => {
    expect(compositeHtmlProblems(good, px)).toEqual([])
  })
  it('reports no element, a second element, a moved element and a stray token', () => {
    expect(compositeHtmlProblems(PAGE, px).length).toBeGreaterThan(0)
    expect(compositeHtmlProblems(good + '<div data-composite="1"></div>', px).length).toBeGreaterThan(0)
    expect(compositeHtmlProblems(insertComposite(PAGE, { ...OFFSET.SQUARE, x: 20 }, canvas), px).length).toBeGreaterThan(0)
    expect(compositeHtmlProblems(good + `<img src="${COMPOSITE_TOKEN}">`, px).length).toBeGreaterThan(0)
  })
})
