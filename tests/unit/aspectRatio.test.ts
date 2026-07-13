import { describe, it, expect } from 'vitest'
import {
  dimensionsFor,
  dimensionsLabel,
  aspectClassFor,
  isAspectRatio,
  ASPECT_VALUES,
  ASPECT_LABELS,
  nearestAspectRatio,
} from '@/lib/aspectRatio'

describe('dimensionsFor', () => {
  it('SQUARE is 1080×1080', () => {
    expect(dimensionsFor('SQUARE')).toEqual({ width: 1080, height: 1080 })
  })

  it('PORTRAIT is 1080×1350', () => {
    expect(dimensionsFor('PORTRAIT')).toEqual({ width: 1080, height: 1350 })
  })

  it('STORY is 1080×1920 (9:16)', () => {
    expect(dimensionsFor('STORY')).toEqual({ width: 1080, height: 1920 })
  })

  it('null/undefined fall back to SQUARE (legacy rows)', () => {
    expect(dimensionsFor(undefined)).toEqual({ width: 1080, height: 1080 })
    expect(dimensionsFor(null)).toEqual({ width: 1080, height: 1080 })
  })
})

describe('isAspectRatio', () => {
  it('accepts the enum values', () => {
    expect(isAspectRatio('SQUARE')).toBe(true)
    expect(isAspectRatio('PORTRAIT')).toBe(true)
    expect(isAspectRatio('STORY')).toBe(true)
    expect(ASPECT_VALUES.every(isAspectRatio)).toBe(true)
  })

  it('rejects other values', () => {
    expect(isAspectRatio('square')).toBe(false)
    expect(isAspectRatio('LANDSCAPE')).toBe(false)
    expect(isAspectRatio('')).toBe(false)
    expect(isAspectRatio(null)).toBe(false)
    expect(isAspectRatio(undefined)).toBe(false)
    expect(isAspectRatio(1080)).toBe(false)
  })
})

describe('labels', () => {
  it('dimensionsLabel renders the pixel size used in prompts', () => {
    expect(dimensionsLabel('SQUARE')).toBe('1080×1080')
    expect(dimensionsLabel('PORTRAIT')).toBe('1080×1350')
    expect(dimensionsLabel('STORY')).toBe('1080×1920')
    expect(dimensionsLabel(undefined)).toBe('1080×1080')
  })

  it('aspectClassFor maps to the Tailwind utility', () => {
    expect(aspectClassFor('PORTRAIT')).toBe('aspect-[4/5]')
    expect(aspectClassFor('STORY')).toBe('aspect-[9/16]')
    expect(aspectClassFor('SQUARE')).toBe('aspect-square')
    expect(aspectClassFor(null)).toBe('aspect-square')
  })

  it('ASPECT_LABELS reflect the corrected 4:5 / 9:16 naming', () => {
    expect(ASPECT_LABELS.PORTRAIT).toBe('4:5 Portrait')
    expect(ASPECT_LABELS.STORY).toBe('9:16 Story')
  })
})

describe('nearestAspectRatio (F6)', () => {
  it('snaps an uploaded image to the closest supported size', () => {
    expect(nearestAspectRatio(1000, 1000)).toBe('SQUARE')
    expect(nearestAspectRatio(1200, 1200)).toBe('SQUARE')
    expect(nearestAspectRatio(1080, 1350)).toBe('PORTRAIT') // exact 4:5
    expect(nearestAspectRatio(800, 1000)).toBe('PORTRAIT') // 4:5
    expect(nearestAspectRatio(1080, 1920)).toBe('STORY') // exact 9:16
    expect(nearestAspectRatio(600, 1100)).toBe('STORY') // tall → story
    // Landscape has no exact match; nearest is the least-tall option (square).
    expect(nearestAspectRatio(1920, 1080)).toBe('SQUARE')
  })

  it('falls back to SQUARE for degenerate dimensions', () => {
    expect(nearestAspectRatio(0, 0)).toBe('SQUARE')
    expect(nearestAspectRatio(100, 0)).toBe('SQUARE')
  })
})
