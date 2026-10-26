import { describe, it, expect } from 'vitest'
import {
  compositionStampSchema,
  parseCompositionStamp,
  classicStamp,
  refineReplacedStamp,
  FALLBACK_REASONS,
  OBSERVATIONS,
  IMAGE_QUALITIES,
  type CompositionStamp,
} from '@/lib/designData'

const kept: CompositionStamp = {
  requestedArchetype: 'product-showcase',
  appliedArchetype: 'product-showcase',
  contractVersion: 1,
  imageQuality: 'high',
}

describe('vocabularies', () => {
  it('are the documented lists', () => {
    expect([...FALLBACK_REASONS]).toEqual([
      'busy',
      'contrast',
      'region-invalid',
      'check-error',
      'no-image',
      'unknown-archetype',
      'unsupported-size',
      'refine-replaced-image',
      'composite-not-blank',
      'composite-not-rendered',
      'composite-source-missing',
    ])
    expect([...OBSERVATIONS]).toEqual(['layout-violation'])
    expect([...IMAGE_QUALITIES]).toEqual(['default', 'standard', 'high'])
  })
})

describe('compositionStampSchema accepts every documented shape (AC-15)', () => {
  it('kept, kept with an observation, classic, and every fallback', () => {
    expect(compositionStampSchema.parse(kept)).toEqual(kept)
    const observed = { ...kept, observations: ['layout-violation' as const] }
    expect(compositionStampSchema.parse(observed)).toEqual(observed)
    expect(compositionStampSchema.safeParse(classicStamp()).success).toBe(true)
    for (const fallbackReason of FALLBACK_REASONS) {
      const s = {
        requestedArchetype: 'editorial-split',
        appliedArchetype: 'classic',
        contractVersion: null,
        fallbackReason,
        imageQuality: 'default',
      }
      expect(compositionStampSchema.safeParse(s).success, fallbackReason).toBe(true)
    }
  })
})

describe('compositionStampSchema rejects invariant violations', () => {
  const bad = (s: unknown) => expect(compositionStampSchema.safeParse(s).success).toBe(false)

  it('non-classic applied: needs a contractVersion', () => bad({ ...kept, contractVersion: null }))
  it('non-classic applied: no fallbackReason', () => bad({ ...kept, fallbackReason: 'busy' }))
  it('non-classic applied: requested must equal applied', () => bad({ ...kept, requestedArchetype: 'editorial-split' }))
  it('classic applied: contractVersion must be null', () =>
    bad({ requestedArchetype: 'classic', appliedArchetype: 'classic', contractVersion: 1, imageQuality: 'default' }))
  it('classic applied: no observations', () =>
    bad({ ...classicStamp(), observations: ['layout-violation'] }))
  it('classic request and classic applied: no fallbackReason', () =>
    bad({ ...classicStamp(), fallbackReason: 'busy' }))
  it('an unknown reason, observation or quality', () => {
    bad({ ...classicStamp(), requestedArchetype: 'x', fallbackReason: 'nope' })
    bad({ ...kept, observations: ['elsewhere'] })
    bad({ ...kept, imageQuality: 'ultra' })
  })
  it('a missing or non-integer contractVersion, an empty key, a non-object', () => {
    bad({ ...kept, contractVersion: undefined })
    bad({ ...kept, contractVersion: 1.5 })
    bad({ ...kept, contractVersion: 0 })
    bad({ ...kept, requestedArchetype: '', appliedArchetype: '' })
    bad('x')
    bad(null)
  })
  it('an empty observations array is allowed on a classic stamp', () => {
    expect(compositionStampSchema.safeParse({ ...classicStamp(), observations: [] }).success).toBe(true)
  })
})

describe('parseCompositionStamp (tolerant read)', () => {
  it('returns the stamp for a valid value', () => {
    expect(parseCompositionStamp(kept)).toEqual(kept)
  })
  it('returns null, never throws, for any invalid stored value', () => {
    for (const raw of [null, undefined, 5, 'x', [], {}, { ...kept, contractVersion: null }, { requestedArchetype: 'a' }]) {
      expect(parseCompositionStamp(raw)).toBeNull()
    }
  })
})

describe('helpers', () => {
  it('classicStamp is classic/classic with a null version and the default quality', () => {
    expect(classicStamp()).toEqual({
      requestedArchetype: 'classic',
      appliedArchetype: 'classic',
      contractVersion: null,
      imageQuality: 'default',
    })
    expect(classicStamp('standard').imageQuality).toBe('standard')
  })

  it('refineReplacedStamp turns a kept draft classic, keeping requested and quality, dropping observations', () => {
    const out = refineReplacedStamp({ ...kept, observations: ['layout-violation'] })
    expect(out).toEqual({
      requestedArchetype: 'product-showcase',
      appliedArchetype: 'classic',
      contractVersion: null,
      fallbackReason: 'refine-replaced-image',
      imageQuality: 'high',
    })
    expect(compositionStampSchema.safeParse(out).success).toBe(true)
  })

  it('refineReplacedStamp keeps an already-classic stamp unchanged', () => {
    const fallen: CompositionStamp = {
      requestedArchetype: 'product-showcase',
      appliedArchetype: 'classic',
      contractVersion: null,
      fallbackReason: 'busy',
      imageQuality: 'default',
    }
    expect(refineReplacedStamp(fallen)).toBe(fallen)
    const c = classicStamp()
    expect(refineReplacedStamp(c)).toBe(c)
  })
})

describe('the composites field (025 FR-06)', () => {
  const key = 'screenshots/team-1/user-1/1700000000-abc.png'
  // The screen the detector found (025 A1): 16:10 in SQUARE pixels, clear of the text band.
  const rect = { x: 17, y: 44, w: 72, h: 45 }
  const entry = { region: 0, source: { kind: 'brief-upload', key }, rect }
  const screenKept = {
    requestedArchetype: 'device-screen',
    appliedArchetype: 'device-screen',
    contractVersion: 1,
    imageQuality: 'default',
    composites: [entry],
  }
  const classicFallback = {
    requestedArchetype: 'device-screen',
    appliedArchetype: 'classic',
    contractVersion: null,
    fallbackReason: 'composite-not-rendered',
    imageQuality: 'default',
  }
  const bad = (s: unknown) => expect(compositionStampSchema.safeParse(s).success).toBe(false)

  it('a kept device-screen stamp with one composite parses', () => {
    expect(compositionStampSchema.parse(screenKept)).toEqual(screenKept)
  })

  it('each invariant fails alone', () => {
    // a kept look that requires a source must have composites
    const { composites: _c, ...noComposites } = screenKept
    void _c
    bad(noComposites)
    // composites on a classic fallback fails
    bad({ ...classicFallback, composites: [entry] })
    // composites on a look without requires fails
    bad({ ...kept, composites: [entry] })
    // length exactly 1
    bad({ ...screenKept, composites: [] })
    bad({ ...screenKept, composites: [entry, entry] })
    // region is 0
    bad({ ...screenKept, composites: [{ ...entry, region: 1 }] })
    // a key that is not screenshots/<team>/<user>/<file>
    for (const badKey of [
      'screenshots/team-1/file.png',
      'screenshots/team-1/user-1/a/b.png',
      'exports/team-1/user-1/a.png',
      'screenshots//user-1/a.png',
      'https://host/screenshots/team-1/user-1/a.png',
    ]) {
      bad({ ...screenKept, composites: [{ region: 0, source: { kind: 'brief-upload', key: badKey } }] })
    }
    // an unknown source kind, an extra field
    bad({ ...screenKept, composites: [{ region: 0, source: { kind: 'url', key } }] })
    bad({ ...screenKept, composites: [{ ...entry, extra: 1 }] })
  })

  // 025 A1: the rect invariants, each failing alone with its own message.
  const messages = (s: unknown) => {
    const r = compositionStampSchema.safeParse(s)
    return r.success ? [] : r.error.issues.map((i) => i.message)
  }
  const withRect = (r: unknown) => ({ ...screenKept, composites: [{ ...entry, rect: r }] })

  it('the rect is required', () => {
    const { rect: _r, ...noRect } = entry
    void _r
    bad({ ...screenKept, composites: [noRect] })
  })

  it('the rect must be a number box: a missing or non-finite field fails', () => {
    bad(withRect({ x: 17, y: 44, w: 72 }))
    bad(withRect({ x: Number.NaN, y: 44, w: 72, h: 45 }))
    bad(withRect({ x: 17, y: 44, w: 72, h: 45, extra: 1 }))
  })

  it('the rect must lie inside the canvas', () => {
    expect(messages(withRect({ x: 50, y: 50, w: 72, h: 45 }))).toEqual(['the composite rect must lie inside the canvas'])
    expect(messages(withRect({ x: 17, y: 44, w: 0, h: 45 }))).toEqual(['the composite rect must lie inside the canvas'])
  })

  it('the rect must be 16:10 within 5% at a size the stamped contract declares', () => {
    // 50 by 50 percent is 1:1, 4:5-ish and 9:16-ish in pixels: no declared size reads it as 16:10.
    expect(messages(withRect({ x: 10, y: 45, w: 50, h: 50 }))).toEqual(['the composite rect must be 16:10 within 5%'])
    // 16:10 at SQUARE (777.6 by 486 px) passes; just past the 5% bound (1.68) fails.
    expect(compositionStampSchema.safeParse(withRect({ x: 17, y: 44, w: 72, h: 45 })).success).toBe(true)
    expect(messages(withRect({ x: 5, y: 44, w: 80, h: 45 }))).toEqual(['the composite rect must be 16:10 within 5%'])
  })

  it('the rect must not intersect a text region of the stamped contract', () => {
    // 16:10 at SQUARE, but y 20 to 65 runs into the 0 to 34 text band; the other sizes read it as not 16:10.
    expect(messages(withRect({ x: 14, y: 20, w: 72, h: 45 }))).toEqual(['the composite rect must not intersect a text region'])
    // touching the band's edge is not an intersection
    expect(compositionStampSchema.safeParse(withRect({ x: 14, y: 34, w: 72, h: 45 })).success).toBe(true)
  })

  it('the classic fallback without composites parses, and refineReplacedStamp drops composites', () => {
    expect(compositionStampSchema.safeParse(classicFallback).success).toBe(true)
    const replaced = refineReplacedStamp(compositionStampSchema.parse(screenKept))
    expect(replaced).not.toHaveProperty('composites')
    expect(replaced.fallbackReason).toBe('refine-replaced-image')
  })
})
