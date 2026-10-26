// 009 FR-03 / AC-04: the brief's image-style validator (pure) and the resume
// read-back.

import { describe, it, expect } from 'vitest'
import { validateImageStyle, resumeImageStyle } from '@/lib/brief/imageStyle'

describe('validateImageStyle', () => {
  it('absent (undefined or null) is classic', () => {
    expect(validateImageStyle(undefined, 'GENERATE')).toEqual({ ok: true, value: 'classic' })
    expect(validateImageStyle(null, 'GENERATE')).toEqual({ ok: true, value: 'classic' })
    expect(validateImageStyle(undefined, 'TEMPLATE')).toEqual({ ok: true, value: 'classic' })
  })

  it('classic is valid on both paths', () => {
    expect(validateImageStyle('classic', 'GENERATE')).toEqual({ ok: true, value: 'classic' })
    expect(validateImageStyle('classic', 'TEMPLATE')).toEqual({ ok: true, value: 'classic' })
  })

  it.each(['product-showcase', 'editorial-split'])('%s is stored as given on the freeform path', (key) => {
    expect(validateImageStyle(key, 'GENERATE')).toEqual({ ok: true, value: key })
  })

  it('a non-classic style on the template path is refused', () => {
    expect(validateImageStyle('product-showcase', 'TEMPLATE').ok).toBe(false)
  })

  it.each([42, true, {}, [], ['classic']])('a non-string (%j) is refused', (raw) => {
    expect(validateImageStyle(raw, 'GENERATE')).toEqual({ ok: false, error: 'imageStyle must be a string' })
  })

  it.each(['', 'Classic', 'hero', 'toString', '__proto__', 'constructor', ' product-showcase'])(
    'an unknown key (%j) is refused',
    (key) => {
      expect(validateImageStyle(key, 'GENERATE').ok).toBe(false)
    },
  )

  it('takes no size: a look is accepted here at any size, and the pipeline records unsupported-size for a size it does not declare', () => {
    expect(validateImageStyle.length).toBe(2)
    expect(validateImageStyle('editorial-split', 'GENERATE').ok).toBe(true)
  })
})

describe('resumeImageStyle', () => {
  it('a known active key resumes as itself', () => {
    expect(resumeImageStyle('editorial-split')).toBe('editorial-split')
  })

  it('classic, absent, unknown and non-string values resume as classic', () => {
    for (const stored of ['classic', undefined, null, '', 'retired-style', 'toString', 7, {}]) {
      expect(resumeImageStyle(stored)).toBe('classic')
    }
  })
})
