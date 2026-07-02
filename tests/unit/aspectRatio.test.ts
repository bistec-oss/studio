import { describe, it, expect } from 'vitest'
import {
  dimensionsFor,
  dimensionsLabel,
  aspectClassFor,
  isAspectRatio,
  ASPECT_VALUES,
} from '@/lib/aspectRatio'

describe('dimensionsFor', () => {
  it('SQUARE is 1080×1080', () => {
    expect(dimensionsFor('SQUARE')).toEqual({ width: 1080, height: 1080 })
  })

  it('PORTRAIT is 1080×1350', () => {
    expect(dimensionsFor('PORTRAIT')).toEqual({ width: 1080, height: 1350 })
  })

  it('null/undefined fall back to SQUARE (legacy rows)', () => {
    expect(dimensionsFor(undefined)).toEqual({ width: 1080, height: 1080 })
    expect(dimensionsFor(null)).toEqual({ width: 1080, height: 1080 })
  })
})

describe('isAspectRatio', () => {
  it('accepts the two enum values', () => {
    expect(isAspectRatio('SQUARE')).toBe(true)
    expect(isAspectRatio('PORTRAIT')).toBe(true)
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
    expect(dimensionsLabel(undefined)).toBe('1080×1080')
  })

  it('aspectClassFor maps to the Tailwind utility', () => {
    expect(aspectClassFor('PORTRAIT')).toBe('aspect-[3/4]')
    expect(aspectClassFor('SQUARE')).toBe('aspect-square')
    expect(aspectClassFor(null)).toBe('aspect-square')
  })
})
