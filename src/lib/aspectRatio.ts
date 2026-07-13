// Single source of truth for output canvas dimensions.
//
// A post's shape is chosen at brief time (Brief.aspectRatio) and a brand template
// declares the shape it was designed for (BrandKitTemplate.aspectRatio). Everything
// that renders a draft — the design agent prompts, Puppeteer render calls, and the
// preview tiles — derives its pixel size and CSS box from here so the canvas, the
// model instruction, and the on-screen preview never drift.
import type { AspectRatio } from '@prisma/client'

export interface Dimensions {
  width: number
  height: number
}

// 1:1 square (Instagram feed default), 4:5 portrait (standard IG portrait, 1080×1350),
// and 9:16 story/reel (1080×1920, published to the same feed channels for now).
export const ASPECT_DIMENSIONS: Record<AspectRatio, Dimensions> = {
  SQUARE: { width: 1080, height: 1080 },
  PORTRAIT: { width: 1080, height: 1350 },
  STORY: { width: 1080, height: 1920 },
}

// Short human label used in the wizard, review step, and admin template list.
// PORTRAIT's pixels (1080×1350) are mathematically 4:5, so it's labelled "4:5".
export const ASPECT_LABELS: Record<AspectRatio, string> = {
  SQUARE: '1:1 Square',
  PORTRAIT: '4:5 Portrait',
  STORY: '9:16 Story',
}

// The valid enum values, for runtime validation of request bodies.
export const ASPECT_VALUES: AspectRatio[] = ['SQUARE', 'PORTRAIT', 'STORY']

export function isAspectRatio(v: unknown): v is AspectRatio {
  return v === 'SQUARE' || v === 'PORTRAIT' || v === 'STORY'
}

// Pixel dimensions for a ratio. Null/undefined falls back to SQUARE so legacy
// rows and unset values keep the original 1080×1080 behaviour.
export function dimensionsFor(ratio: AspectRatio | null | undefined): Dimensions {
  return ASPECT_DIMENSIONS[ratio ?? 'SQUARE']
}

// Tailwind aspect-ratio utility class for preview tiles.
export function aspectClassFor(ratio: AspectRatio | null | undefined): string {
  switch (ratio) {
    case 'PORTRAIT':
      return 'aspect-[4/5]'
    case 'STORY':
      return 'aspect-[9/16]'
    default:
      return 'aspect-square'
  }
}

// "1080×1350" — used inside agent prompts.
export function dimensionsLabel(ratio: AspectRatio | null | undefined): string {
  const { width, height } = dimensionsFor(ratio)
  return `${width}×${height}`
}
