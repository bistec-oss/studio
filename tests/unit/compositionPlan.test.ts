import { describe, it, expect } from 'vitest'
import {
  archetypes,
  contractAt,
  planComposition,
  settleComposition,
  type ArchetypeMap,
  type CompositionPlan,
  type HeroPlan,
} from '@/lib/designData'

// A fixture dataset whose looks declare SQUARE only (the unsupported-size cases).
const squareOnly: ArchetypeMap = Object.fromEntries(
  Object.entries(archetypes).map(([k, a]) => [
    k,
    { ...a, versions: { [a.current]: { ...a.versions[a.current], sizes: { SQUARE: a.versions[a.current].sizes.SQUARE } } } },
  ])
)

const heroPlan = (key = 'product-showcase', size: 'SQUARE' | 'PORTRAIT' = 'SQUARE'): HeroPlan => {
  const plan = planComposition({ imageStyle: key, aspectRatio: size })
  if (plan.kind !== 'hero') throw new Error('expected a hero plan')
  return plan
}

describe('planComposition (AC-03)', () => {
  it('a known active key at a supported size is a hero plan at the current version', () => {
    const plan = planComposition({ imageStyle: 'editorial-split', aspectRatio: 'PORTRAIT' })
    expect(plan.kind).toBe('hero')
    const hero = plan as HeroPlan
    expect(hero.requestedArchetype).toBe('editorial-split')
    expect(hero.contractVersion).toBe(archetypes['editorial-split'].current)
    expect(hero.sizeContract).toBe(archetypes['editorial-split'].versions[hero.contractVersion].sizes.PORTRAIT)
    expect(hero.contractVersion).toBe(2)
    expect(hero.label).toBe('Editorial split')
  })

  it('classic, absent and blank are classic with no reason', () => {
    for (const imageStyle of ['classic', undefined, null, '']) {
      expect(planComposition({ imageStyle, aspectRatio: 'SQUARE' })).toEqual({
        kind: 'classic',
        requestedArchetype: 'classic',
      })
    }
  })

  it('an unknown key is unknown-archetype and keeps the requested value', () => {
    expect(planComposition({ imageStyle: 'hero-centre', aspectRatio: 'SQUARE' })).toEqual({
      kind: 'classic',
      requestedArchetype: 'hero-centre',
      fallbackReason: 'unknown-archetype',
    })
    expect(planComposition({ imageStyle: 'constructor', aspectRatio: 'SQUARE' })).toMatchObject({
      fallbackReason: 'unknown-archetype',
    })
  })

  it('a retired key is unknown-archetype', () => {
    const source: ArchetypeMap = {
      'product-showcase': { ...archetypes['product-showcase'], status: 'retired' },
    }
    expect(planComposition({ imageStyle: 'product-showcase', aspectRatio: 'SQUARE' }, source)).toMatchObject({
      kind: 'classic',
      fallbackReason: 'unknown-archetype',
    })
  })

  it('a size the current contract does not declare is unsupported-size (fixture dataset)', () => {
    for (const imageStyle of ['product-showcase', 'editorial-split']) {
      expect(planComposition({ imageStyle, aspectRatio: 'STORY' }, squareOnly)).toEqual({
        kind: 'classic',
        requestedArchetype: imageStyle,
        fallbackReason: 'unsupported-size',
      })
    }
  })

  it('a kept plan version is read from archetypes[key].current, and STORY is a hero plan', () => {
    for (const key of Object.keys(archetypes)) {
      const plan = planComposition({ imageStyle: key, aspectRatio: 'STORY', hasCompositeSource: true }) as HeroPlan
      expect(plan.kind).toBe('hero')
      expect(plan.contractVersion).toBe(archetypes[key].current)
    }
  })

  it('a stamped (key, version, size) resolves to the exact contract after current moves on, and when retired', () => {
    const v1 = archetypes['product-showcase'].versions[1]
    const v2 = { ...v1, sizes: { SQUARE: { subject: v1.sizes.SQUARE!.subject, regions: [{ ...v1.sizes.SQUARE!.regions[0], rect: { x: 0, y: 0, w: 40, h: 100 } }] } } }
    const source: ArchetypeMap = {
      'product-showcase': { ...archetypes['product-showcase'], current: 2, versions: { 1: v1, 2: v2 } },
    }
    expect((planComposition({ imageStyle: 'product-showcase', aspectRatio: 'SQUARE' }, source) as HeroPlan).contractVersion).toBe(2)
    expect(contractAt('product-showcase', 1, 'SQUARE', source)).toBe(v1.sizes.SQUARE)
    const retired: ArchetypeMap = { 'product-showcase': { ...source['product-showcase'], status: 'retired' } }
    expect(contractAt('product-showcase', 1, 'SQUARE', retired)).toBe(v1.sizes.SQUARE)
  })
})

describe('settleComposition: every row of the fallback table (AC-06, AC-12)', () => {
  it('row 1: hero plan, URL, check ok -> kept at the plan version, no reason', () => {
    expect(settleComposition(heroPlan(), { url: 'u', check: { ok: true } })).toEqual({
      requestedArchetype: 'product-showcase',
      appliedArchetype: 'product-showcase',
      contractVersion: archetypes['product-showcase'].current,
      imageQuality: 'default',
    })
  })

  it.each(['busy', 'contrast', 'region-invalid', 'check-error'] as const)(
    'row 2: hero plan, URL, check fails %s -> classic with that reason, version null',
    (reason) => {
      expect(settleComposition(heroPlan('editorial-split', 'PORTRAIT'), { url: 'u', check: { ok: false, reason } })).toEqual({
        requestedArchetype: 'editorial-split',
        appliedArchetype: 'classic',
        contractVersion: null,
        fallbackReason: reason,
        imageQuality: 'default',
      })
    }
  )

  it('row 3: hero plan, URL, no check (or a null check) fails closed as check-error', () => {
    for (const background of [{ url: 'u' }, { url: 'u', check: null }]) {
      expect(settleComposition(heroPlan(), background)).toMatchObject({
        appliedArchetype: 'classic',
        contractVersion: null,
        fallbackReason: 'check-error',
      })
    }
  })

  it('row 4: hero plan, no URL (skip, error, empty) -> classic, no-image', () => {
    for (const background of [null, undefined, {}, { url: null }, { url: '' }]) {
      expect(settleComposition(heroPlan(), background)).toMatchObject({
        appliedArchetype: 'classic',
        fallbackReason: 'no-image',
      })
    }
  })

  it('a check ok with no URL is still no-image (never kept without an image)', () => {
    expect(settleComposition(heroPlan(), { check: { ok: true } })).toMatchObject({ fallbackReason: 'no-image' })
  })

  it('row 5: classic plan from an unknown key -> classic, unknown-archetype', () => {
    const plan = planComposition({ imageStyle: 'gone', aspectRatio: 'SQUARE' })
    expect(settleComposition(plan, { url: 'u' })).toEqual({
      requestedArchetype: 'gone',
      appliedArchetype: 'classic',
      contractVersion: null,
      fallbackReason: 'unknown-archetype',
      imageQuality: 'default',
    })
  })

  it('row 6: classic plan from an unsupported size -> classic, unsupported-size', () => {
    const plan = planComposition({ imageStyle: 'product-showcase', aspectRatio: 'STORY' }, squareOnly)
    expect(settleComposition(plan, null)).toMatchObject({
      requestedArchetype: 'product-showcase',
      appliedArchetype: 'classic',
      fallbackReason: 'unsupported-size',
    })
  })

  it('row 7: classic plan, imageStyle classic -> today, no reason', () => {
    const plan = planComposition({ imageStyle: 'classic', aspectRatio: 'SQUARE' })
    const stamp = settleComposition(plan, { url: 'u' })
    expect(stamp).toEqual({
      requestedArchetype: 'classic',
      appliedArchetype: 'classic',
      contractVersion: null,
      imageQuality: 'default',
    })
    expect('fallbackReason' in stamp).toBe(false)
  })

  it('imageQuality is the tier the provider reported, else default', () => {
    expect(settleComposition(heroPlan(), { url: 'u', quality: 'high', check: { ok: true } }).imageQuality).toBe('high')
    expect(settleComposition(heroPlan(), { url: 'u', quality: 'standard', check: { ok: false, reason: 'busy' } }).imageQuality).toBe('standard')
    expect(settleComposition(heroPlan(), { url: 'u', check: { ok: true } }).imageQuality).toBe('default')
  })

  it('no code path keeps the archetype without an explicit ok:true', () => {
    const plan: CompositionPlan = heroPlan()
    const backgrounds = [
      null,
      {},
      { url: 'u' },
      { url: 'u', check: null },
      { url: 'u', check: { ok: false, reason: 'busy' } },
      { url: 'u', check: { ok: false, reason: 'check-error' } },
      { url: 'u', check: { ok: 'yes' } },
    ] as Parameters<typeof settleComposition>[1][]
    for (const b of backgrounds) expect(settleComposition(plan, b).appliedArchetype).toBe('classic')
  })
})

describe('device-screen availability and the composite argument (025 FR-08, design section 4)', () => {
  const key = 'screenshots/team-1/user-1/1700000000-abc.png'
  const source = { kind: 'brief-upload' as const, key }
  const screenPlan = (size: 'SQUARE' | 'PORTRAIT' | 'STORY' = 'SQUARE'): HeroPlan => {
    const plan = planComposition({ imageStyle: 'device-screen', aspectRatio: size, hasCompositeSource: true })
    if (plan.kind !== 'hero') throw new Error('expected a hero plan')
    return plan
  }

  it('a requires look with no source is classic with composite-source-missing', () => {
    for (const size of ['SQUARE', 'PORTRAIT', 'STORY'] as const) {
      expect(planComposition({ imageStyle: 'device-screen', aspectRatio: size })).toEqual({
        kind: 'classic',
        requestedArchetype: 'device-screen',
        fallbackReason: 'composite-source-missing',
      })
      expect(planComposition({ imageStyle: 'device-screen', aspectRatio: size, hasCompositeSource: false })).toMatchObject({
        kind: 'classic',
        fallbackReason: 'composite-source-missing',
      })
    }
  })

  it('the flag changes nothing for the four looks that need no input', () => {
    for (const key of ['product-showcase', 'editorial-split', 'full-bleed-scene', 'spotlight']) {
      expect(planComposition({ imageStyle: key, aspectRatio: 'SQUARE', hasCompositeSource: true })).toEqual(
        planComposition({ imageStyle: key, aspectRatio: 'SQUARE' }),
      )
    }
  })

  // The detected screen (025 A1): the check carries the rect, the third argument carries the source.
  const rect = { x: 17, y: 44, w: 72, h: 45 }
  const keptCheck = { ok: true as const, composites: [{ region: 0, rect }] }

  it('the third argument: ok adds composites (the source from the argument, the rect from the check) to a kept stamp', () => {
    expect(settleComposition(screenPlan(), { url: 'u', check: keptCheck }, { ok: true, source })).toEqual({
      requestedArchetype: 'device-screen',
      appliedArchetype: 'device-screen',
      contractVersion: 1,
      imageQuality: 'default',
      composites: [{ region: 0, source, rect }],
    })
  })

  it('a kept requires look whose check carries no rect fails closed to check-error', () => {
    expect(settleComposition(screenPlan(), { url: 'u', check: { ok: true } }, { ok: true, source })).toEqual({
      requestedArchetype: 'device-screen',
      appliedArchetype: 'classic',
      contractVersion: null,
      fallbackReason: 'check-error',
      imageQuality: 'default',
    })
  })

  it.each(['composite-not-rendered', 'composite-source-missing'] as const)(
    'the third argument: not ok (%s) turns a kept plan into classic with that reason and no composites',
    (reason) => {
      expect(settleComposition(screenPlan('STORY'), { url: 'u', check: { ok: true } }, { ok: false, reason })).toEqual({
        requestedArchetype: 'device-screen',
        appliedArchetype: 'classic',
        contractVersion: null,
        fallbackReason: reason,
        imageQuality: 'default',
      })
    },
  )

  it('composite-not-blank from the check settles to classic with no composites, and the third argument is ignored', () => {
    for (const composite of [undefined, { ok: true as const, source }]) {
      const stamp = settleComposition(screenPlan(), { url: 'u', check: { ok: false, reason: 'composite-not-blank' } }, composite)
      expect(stamp).toEqual({
        requestedArchetype: 'device-screen',
        appliedArchetype: 'classic',
        contractVersion: null,
        fallbackReason: 'composite-not-blank',
        imageQuality: 'default',
      })
    }
  })

  it('a kept requires look with no composite outcome fails closed to composite-source-missing', () => {
    expect(settleComposition(screenPlan(), { url: 'u', check: { ok: true } })).toMatchObject({
      appliedArchetype: 'classic',
      fallbackReason: 'composite-source-missing',
    })
  })

  it('an existing look keeps its stamp when no third argument is given', () => {
    expect(settleComposition(heroPlan(), { url: 'u', check: { ok: true } })).not.toHaveProperty('composites')
  })

  it('a missing image is still no-image, whatever the third argument says', () => {
    expect(settleComposition(screenPlan(), { url: null }, { ok: true, source })).toMatchObject({
      appliedArchetype: 'classic',
      fallbackReason: 'no-image',
    })
  })
})

describe('planComposition: a look that requires a screenshot (025)', () => {
  it('without the flag it is classic with composite-source-missing', () => {
    for (const size of ['SQUARE', 'PORTRAIT', 'STORY'] as const) {
      expect(planComposition({ imageStyle: 'device-screen', aspectRatio: size })).toEqual({
        kind: 'classic',
        requestedArchetype: 'device-screen',
        fallbackReason: 'composite-source-missing',
      })
    }
  })

  it('with the flag it is a hero plan', () => {
    expect(planComposition({ imageStyle: 'device-screen', aspectRatio: 'SQUARE', hasCompositeSource: true }).kind).toBe('hero')
  })
})
