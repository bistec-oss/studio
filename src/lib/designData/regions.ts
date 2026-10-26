// Region math: canvas percent to image pixels (009 design.md section 3).
//
// The design prompt tells the model to paint the image as
// `background-size: cover; background-position: center` over the W x H canvas,
// and the check assumes the same, so the mapping is the CSS cover fit. It takes
// the natural dimensions the page reports, never a size the provider "should"
// have returned.
import type { Rect } from './composition'

export interface Size {
  w: number
  h: number
}

export interface CoverFit {
  scale: number
  scaled: Size
  // Where the scaled image's top-left sits on the canvas (<= 0 on each axis).
  offset: { x: number; y: number }
}

export function coverFit(canvas: Size, img: Size): CoverFit {
  const scale = Math.max(canvas.w / img.w, canvas.h / img.h)
  const scaled = { w: img.w * scale, h: img.h * scale }
  return { scale, scaled, offset: { x: (canvas.w - scaled.w) / 2, y: (canvas.h - scaled.h) / 2 } }
}

export interface MappedRegion {
  // The region in image pixels, clipped to the part of the canvas the image covers.
  px: Rect
  // The clipped area as a percent of the canvas.
  areaPct: number
}

// Null when the dimensions or the rect are degenerate (zero, negative, NaN),
// or the region lies wholly outside the image.
export function mapRegionToImage(rect: Rect, canvas: Size, img: Size): MappedRegion | null {
  const nums = [rect.x, rect.y, rect.w, rect.h, canvas.w, canvas.h, img.w, img.h]
  if (!nums.every(Number.isFinite) || canvas.w <= 0 || canvas.h <= 0 || img.w <= 0 || img.h <= 0) return null
  const { scale, scaled, offset } = coverFit(canvas, img)
  // The rect in canvas px (rect% * canvas / 100).
  const cx = (rect.x * canvas.w) / 100
  const cy = (rect.y * canvas.h) / 100
  const cw = (rect.w * canvas.w) / 100
  const ch = (rect.h * canvas.h) / 100
  // Intersect with the part of the canvas the image covers.
  const x0 = Math.max(cx, offset.x)
  const y0 = Math.max(cy, offset.y)
  const x1 = Math.min(cx + cw, offset.x + scaled.w)
  const y1 = Math.min(cy + ch, offset.y + scaled.h)
  const vw = x1 - x0
  const vh = y1 - y0
  if (!(vw > 0) || !(vh > 0)) return null
  return {
    px: { x: (x0 - offset.x) / scale, y: (y0 - offset.y) / scale, w: vw / scale, h: vh / scale },
    areaPct: ((vw * vh) / (canvas.w * canvas.h)) * 100,
  }
}
