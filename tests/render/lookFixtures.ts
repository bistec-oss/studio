// Look fixture images (change 028 T3, spec FR-08). Rasterized through the
// production renderer like 009's (heroFixtures.ts), so the pixels the sampler
// reads are real Chromium output. SYNTHETIC: these prove the check
// discriminates, not that a look works on real model images.
import { ASPECT_DIMENSIONS } from '@/lib/aspectRatio'
import { archetypes, contractAt, mapRegionToImage, type ArchetypeMap, type Rect } from '@/lib/designData'
import { CALM, IMAGE_PX, STRIPES, raster } from './heroFixtures'
import { INTENDED_BACKDROP, type FixtureSpec } from './lookFixtureTable'

const clamp = (v: number) => Math.min(100, Math.max(0, v))
// Grow (or, with a negative amount, shrink) a canvas-percent rect by `by`
// points on each side. One point is 1% of the canvas on that axis.
function pad(r: Rect, by: number): Rect {
  const x0 = clamp(r.x - by)
  const y0 = clamp(r.y - by)
  const x1 = clamp(r.x + r.w + by)
  const y1 = clamp(r.y + r.h + by)
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

const BACKDROP_CSS: Record<'dark' | 'light', string> = {
  dark: CALM,
  light: 'background:#f2f2f2',
}
// The wrong flat grey for each backdrop's text tone: mid grey for light text,
// dark grey for dark text.
const CONTRAST_CSS: Record<'dark' | 'light', string> = {
  dark: 'background:#808080',
  light: 'background:#333333',
}

// A data: URL of the fixture image.
export async function lookFixture(spec: FixtureSpec, source: ArchetypeMap = archetypes): Promise<string> {
  const contract = contractAt(spec.key, spec.version, spec.size, source)
  if (!contract) throw new Error(`no contract for ${spec.id}`)
  const canvas = ASPECT_DIMENSIONS[spec.size]
  const img = IMAGE_PX[spec.size]
  const backdrop = INTENDED_BACKDROP[spec.key] ?? 'dark'
  const texts = contract.regions.filter((r) => r.purpose === 'text')

  // A positioned div in css px (the page is the image at half size).
  const box = (rect: Rect, css: string): string => {
    const m = mapRegionToImage(rect, { w: canvas.width, h: canvas.height }, img)
    if (!m) return ''
    const { x, y, w, h } = m.px
    return `<div style="position:absolute;left:${x / 2}px;top:${y / 2}px;width:${w / 2}px;height:${h / 2}px;${css}"></div>`
  }

  const composite = contract.regions.find((r) => r.purpose === 'composite')
  const BLANK_SCREEN = 'background:#dcdcdc'
  let inner = ''
  // The screen kinds that change where the blank screen is (025 A1). All are 16:10 like the region.
  const SHIFT = { dx: 3, dy: 2 } // inside the 12 point search margin
  let screenRect: Rect | null = composite ? pad(composite.rect, 1) : null
  if (composite && spec.kind === 'pass-offset') {
    screenRect = pad({ ...composite.rect, x: composite.rect.x + SHIFT.dx, y: composite.rect.y + SHIFT.dy }, 1)
  } else if (composite && spec.kind === 'small') {
    // 0.7 of the region each way (49% of the area), centred, unpadded so it stays 16:10.
    const w = composite.rect.w * 0.7
    const h = composite.rect.h * 0.7
    screenRect = { x: composite.rect.x + (composite.rect.w - w) / 2, y: composite.rect.y + (composite.rect.h - h) / 2, w, h }
  }
  // An evenly lit blank screen; the screen kind overpaints it. The text-overlap kind paints its
  // screen after the text bands, so the screen's top edge stays inside the band.
  if (screenRect && spec.kind !== 'text-overlap') inner += box(screenRect, BLANK_SCREEN)
  for (const r of texts) inner += box(pad(r.rect, 1), BACKDROP_CSS[backdrop])
  if (spec.kind === 'busy') {
    inner += box(pad(texts[texts.length - 1].rect, -1), `background:${STRIPES}`)
  } else if (spec.kind === 'contrast') {
    inner += box(pad(texts[0].rect, 1), CONTRAST_CSS[backdrop])
  } else if (spec.kind === 'screen') {
    if (!composite) throw new Error(`screen fixture on a contract with no composite region: ${spec.id}`)
    inner += box(pad(composite.rect, -1), `background:${STRIPES}`)
  } else if (spec.kind === 'text-overlap') {
    if (!composite) throw new Error(`text-overlap fixture on a contract with no composite region: ${spec.id}`)
    // The region moved up so its top is half a point inside the text band: small enough that the
    // text band still passes its own check, large enough that the detected screen intersects it.
    const bandBottom = Math.max(...texts.map((t) => t.rect.y + t.rect.h))
    inner += box({ ...composite.rect, y: bandBottom - 0.5 }, BLANK_SCREEN)
  }
  return raster(spec.size, `background:${STRIPES}`, inner)
}
