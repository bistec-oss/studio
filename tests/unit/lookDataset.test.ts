// 028 T1: the look dataset (FR-01 to FR-04, NFR-04). Validation rules each fail
// on their own fixture, every (key, version) is pinned by a hash, the key list
// is committed, and v2 of the two original looks equals v1.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  archetypes,
  lookDatasetProblems,
  imageStyleOptions,
  IMAGE_STYLES,
  imageStylesOf,
  contractAt,
  styleLabel,
  supportsSize,
  type Archetype,
  compositeRegionOf,
  type ArchetypeMap,
  type Contract,
} from '@/lib/designData'
import { ASPECT_DIMENSIONS } from '@/lib/aspectRatio'

// Every look key ever shipped. A deletion or a rename fails the test below.
const COMMITTED_KEYS = ['product-showcase', 'editorial-split', 'full-bleed-scene', 'spotlight', 'device-screen']

const hash = (c: unknown) => createHash('sha256').update(JSON.stringify(c)).digest('hex')

// Computed once from the finished rows. A released version is never edited.
const HASHES: Record<string, string> = {
  'product-showcase@1': 'ce6a918e9ed33e60787779591c2834651bc85dae8749283d7ba9c39be036c4cc',
  'product-showcase@2': '5c94fd476f30bb45e84e886b1e318ff959277d9d722b2652a24af1e80dfd0c5f',
  'editorial-split@1': '440d41092cd4ef97baba2d2e02971f389cee0ecd340b4517e9b32e38d411ecc6',
  'editorial-split@2': '1e403779e9a3f44d1002c67bfa75a94455a3a9e40b224060924157c62adb6733',
  'full-bleed-scene@1': '37f092ceaf25161f099c37736e3101669f404fd9e7006d1abca5dab4609a0b8e',
  'spotlight@1': '856a579c1ac7fb5fdc9a2918671b774691b6db803b6d56d39c8a53a8c0c2634f',
  // 031 T16: the Spotlight SQUARE candidate. Not served (`current` stays 1) until OP-031 passes.
  'spotlight@2': 'f6b6750686f65375e9280cebfc871f97492ba4e137c7bb51864365068ef67172',
  // 025 T1: computed from the finished rows. OP-025 passed at every size, so T6
  // removed none and this is the released hash.
  'device-screen@1': 'b53138ccfa78c6ca4ef0e07f555f0f19b079707e021c49583e55c2d3522f2529',
}

describe('the shipped dataset (AC-01, AC-02)', () => {
  it('has five active looks at current 2, 2, 1, 2, 1', () => {
    expect(Object.values(archetypes).map((a) => [a.key, a.status, a.current])).toEqual([
      ['product-showcase', 'active', 2],
      ['editorial-split', 'active', 2],
      ['full-bleed-scene', 'active', 1],
      ['spotlight', 'active', 2],
      ['device-screen', 'active', 1],
    ])
  })

  it('lookDatasetProblems is empty', () => {
    expect(lookDatasetProblems(archetypes)).toEqual([])
  })

  it('every (key, version) matches its committed hash and none is missing', () => {
    const seen: string[] = []
    for (const a of Object.values(archetypes)) {
      for (const v of Object.keys(a.versions)) {
        const id = `${a.key}@${v}`
        seen.push(id)
        expect(hash(a.versions[Number(v)]), id).toBe(HASHES[id])
      }
    }
    expect(seen.sort()).toEqual(Object.keys(HASHES).sort())
  })

  it('the committed key list is a subset of the dataset keys', () => {
    for (const k of COMMITTED_KEYS) expect(Object.keys(archetypes), k).toContain(k)
  })

  it('v2 SQUARE and PORTRAIT of the two original looks deep-equal v1; v2 adds STORY', () => {
    for (const k of ['product-showcase', 'editorial-split']) {
      const { 1: v1, 2: v2 } = archetypes[k].versions
      expect(v2.sizes.SQUARE).toEqual(v1.sizes.SQUARE)
      expect(v2.sizes.PORTRAIT).toEqual(v1.sizes.PORTRAIT)
      expect(v1.sizes.STORY).toBeUndefined()
      expect(v2.sizes.STORY).toBeDefined()
      expect(v2.textTone).toBe('light')
    }
  })

  it('spotlight v2 is current (031 T18, OP-031 passed): PORTRAIT and STORY deep-equal v1, SQUARE differs (031 FR-47)', () => {
    const a = archetypes.spotlight
    expect(a.current).toBe(2)
    expect(a.versions[2].sizes.PORTRAIT).toEqual(a.versions[1].sizes.PORTRAIT)
    expect(a.versions[2].sizes.STORY).toEqual(a.versions[1].sizes.STORY)
    expect(a.versions[2].sizes.SQUARE).not.toEqual(a.versions[1].sizes.SQUARE)
    expect(a.versions[2].sizes.SQUARE?.regions.map((r) => r.rect)).toEqual([
      { x: 0, y: 0, w: 100, h: 20 },
      { x: 0, y: 80, w: 100, h: 20 },
    ])
    expect(a.versions[2].sizes.SQUARE?.subject).toContain('the top 22% and bottom 22% are a flat, plain, dark backdrop')
    expect(lookDatasetProblems(archetypes)).toEqual([])
  })

  it('no shipped contract has variantOf', () => {
    for (const a of Object.values(archetypes)) {
      for (const c of Object.values(a.versions)) expect(c.variantOf).toBeUndefined()
    }
  })

  it('the four released looks keep their released hashes (025 NFR-04)', () => {
    for (const id of [
      'product-showcase@1',
      'product-showcase@2',
      'editorial-split@1',
      'editorial-split@2',
      'full-bleed-scene@1',
      'spotlight@1',
    ]) {
      const [key, v] = id.split('@')
      expect(hash(archetypes[key].versions[Number(v)]), id).toBe(HASHES[id])
    }
  })

  it('device-screen v1 rows equal the 025 FR-02 table and each screen is 16:10 in canvas px', () => {
    const a = archetypes['device-screen']
    expect([a.label, a.summary, a.status, a.current, a.requires]).toEqual([
      'Product screen',
      'A laptop showing your own product screenshot, with the text above it.',
      'active',
      1,
      'composite-source',
    ])
    const c = a.versions[1]
    expect(c.textTone).toBe('light')
    const subject =
      'a modern laptop seen straight on, centred, its screen exactly filling the screen area, on a plain dark surface with soft light'
    const table = {
      SQUARE: { text: [0, 0, 100, 34], screen: [14, 42, 72, 45], px: [777.6, 486] },
      PORTRAIT: { text: [0, 0, 100, 36], screen: [10, 45, 80, 40], px: [864, 540] },
      STORY: { text: [0, 0, 100, 34], screen: [8, 44, 84, 29.5], px: [907.2, 567] },
    } as const
    for (const size of ['SQUARE', 'PORTRAIT', 'STORY'] as const) {
      const sc = c.sizes[size]!
      const t = table[size]
      expect(sc.subject).toBe(subject)
      expect(sc.regions).toEqual([
        { rect: { x: t.text[0], y: t.text[1], w: t.text[2], h: t.text[3] }, purpose: 'text', minAreaPct: 20 },
        { rect: { x: t.screen[0], y: t.screen[1], w: t.screen[2], h: t.screen[3] }, purpose: 'composite', minAreaPct: 20 },
      ])
      const { width, height } = ASPECT_DIMENSIONS[size]
      const r = sc.regions[1].rect
      const w = (r.w * width) / 100
      const h = (r.h * height) / 100
      // The spec's px column is 16:10 of the width; the percent rows give 566.4
      // for STORY (29.5% of 1920), 0.6 px under the column, inside the 0.5% rule.
      expect(w).toBeCloseTo(t.px[0], 6)
      expect(Math.abs(h - t.px[1])).toBeLessThan(1)
      expect(Math.abs(w / h - 16 / 10) / (16 / 10), size).toBeLessThan(0.005)
      expect(compositeRegionOf(sc)).toBe(sc.regions[1])
    }
    expect(compositeRegionOf(archetypes.spotlight.versions[1].sizes.SQUARE!)).toBeNull()
  })

  it('the picker lists the five looks after classic and every one supports every size', () => {
    expect(IMAGE_STYLES.map((s) => s.key)).toEqual(['classic', ...COMMITTED_KEYS])
    for (const size of ['SQUARE', 'PORTRAIT', 'STORY'] as const) {
      expect(imageStyleOptions(size, undefined, { hasCompositeSource: true }).every((o) => o.supported)).toBe(true)
      const bare = imageStyleOptions(size)
      expect(bare.filter((o) => !o.supported).map((o) => o.key)).toEqual(['device-screen'])
      expect(bare.find((o) => o.key === 'device-screen')?.reason).toBe('Needs a product screenshot')
      expect(bare.filter((o) => o.key !== 'device-screen').every((o) => o.reason === undefined)).toBe(true)
      for (const k of COMMITTED_KEYS) expect(supportsSize(k, size)).toBe(true)
    }
    expect(supportsSize('classic', 'STORY')).toBe(true)
    expect(supportsSize('nope', 'SQUARE')).toBe(false)
  })

  it('labels and Spotlight bands match FR-02', () => {
    expect(styleLabel('full-bleed-scene')).toBe('Full-bleed scene')
    expect(styleLabel('spotlight')).toBe('Spotlight')
    const bands = contractAt('spotlight', 1, 'STORY')!.regions
    expect(bands.map((r) => [r.rect, r.use])).toEqual([
      [{ x: 0, y: 0, w: 100, h: 22 }, 'the headline'],
      [{ x: 0, y: 78, w: 100, h: 22 }, 'the call to action and the logo'],
    ])
  })

  it('the composition.ts header holds the key rule', () => {
    const src = readFileSync('src/lib/designData/composition.ts', 'utf8')
    expect(src).toContain('THE LOOK KEY RULE')
    expect(src).toContain('THE VERSION RULE')
  })
})

// ── Fixture datasets: each FR-03 rule fails with its own message ─────────────

const region = (
  x: number,
  y: number,
  w: number,
  h: number,
  purpose: 'text' | 'clear' | 'composite' = 'text',
  minAreaPct = 20,
) => ({
  rect: { x, y, w, h },
  purpose,
  minAreaPct,
})
const contract = (over: Partial<Contract> = {}): Contract => ({
  role: 'hero',
  textTone: 'light',
  sizes: { SQUARE: { subject: 's', regions: [region(0, 0, 50, 100)] } },
  ...over,
})
const look = (key: string, over: Partial<Archetype> = {}): Archetype => ({
  key: key as Archetype['key'],
  label: key,
  summary: 's',
  status: 'active',
  current: 1,
  versions: { 1: contract() },
  ...over,
})
const dataset = (...looks: Archetype[]): ArchetypeMap => Object.fromEntries(looks.map((a) => [a.key, a]))

describe('lookDatasetProblems (AC-02)', () => {
  it('a valid dataset passes', () => {
    expect(lookDatasetProblems(dataset(look('alpha')))).toEqual([])
  })

  it('a valid -light variant with regions equal to its base passes', () => {
    const variant = look('alpha-light', { versions: { 1: contract({ variantOf: { key: 'alpha', version: 1 } }) } })
    expect(lookDatasetProblems(dataset(look('alpha'), variant))).toEqual([])
  })

  it('a bad key', () => {
    expect(lookDatasetProblems(dataset(look('Bad_Key')))).toEqual(
      expect.arrayContaining([expect.stringContaining('Bad_Key: key does not match')]),
    )
  })

  it('a record key that differs from archetype.key', () => {
    const map = { one: look('two') } as unknown as ArchetypeMap
    expect(lookDatasetProblems(map).join('\n')).toContain('one: record key differs')
  })

  it('a missing current', () => {
    expect(lookDatasetProblems(dataset(look('alpha', { current: 3 }))).join('\n')).toContain('alpha: current 3 names no version')
  })

  it('a bad status', () => {
    const bad = look('alpha', { status: 'paused' as never })
    expect(lookDatasetProblems(dataset(bad)).join('\n')).toContain('alpha: status "paused"')
  })

  it('a contract with no text region (no empty check)', () => {
    const c = contract({ sizes: { SQUARE: { subject: 's', regions: [region(0, 0, 50, 100, 'clear')] } } })
    expect(lookDatasetProblems(dataset(look('alpha', { versions: { 1: c } })))).toEqual(['alpha@1:SQUARE: no text region'])
    const empty = contract({ sizes: { SQUARE: { subject: 's', regions: [] } } })
    expect(lookDatasetProblems(dataset(look('alpha', { versions: { 1: empty } })))).toEqual(['alpha@1:SQUARE: no text region'])
  })

  it('a region out of range', () => {
    const c = contract({ sizes: { STORY: { subject: 's', regions: [region(0, 60, 100, 50)] } } })
    expect(lookDatasetProblems(dataset(look('alpha', { versions: { 1: c } }))).join('\n')).toContain('alpha@1:STORY: region')
    const zero = contract({ sizes: { STORY: { subject: 's', regions: [region(0, 0, 0, 50)] } } })
    expect(lookDatasetProblems(dataset(look('alpha', { versions: { 1: zero } }))).join('\n')).toContain('no size')
  })

  it('a region under its minimum area', () => {
    const c = contract({ sizes: { SQUARE: { subject: 's', regions: [region(0, 0, 10, 10)] } } })
    expect(lookDatasetProblems(dataset(look('alpha', { versions: { 1: c } }))).join('\n')).toContain('below its minimum 20%')
  })

  it('variantOf: the base must exist', () => {
    const v = look('alpha-light', { versions: { 1: contract({ variantOf: { key: 'alpha', version: 1 } }) } })
    expect(lookDatasetProblems(dataset(v)).join('\n')).toContain('base "alpha" does not exist')
  })

  it('variantOf: the base must not itself be a variant', () => {
    const light = look('alpha-light', { versions: { 1: contract({ variantOf: { key: 'alpha', version: 1 } }) } })
    const nested = look('alpha-light-light', { versions: { 1: contract({ variantOf: { key: 'alpha-light', version: 1 } }) } })
    expect(lookDatasetProblems(dataset(look('alpha'), light, nested)).join('\n')).toContain('is itself a variant')
  })

  it('variantOf: the base version must exist', () => {
    const v = look('alpha-light', { versions: { 1: contract({ variantOf: { key: 'alpha', version: 9 } }) } })
    expect(lookDatasetProblems(dataset(look('alpha'), v)).join('\n')).toContain('base version alpha@9 does not exist')
  })

  it('variantOf: the key must be <base>-<suffix> with a suffix in the closed list', () => {
    const wrongSuffix = look('alpha-dark', { versions: { 1: contract({ variantOf: { key: 'alpha', version: 1 } }) } })
    expect(lookDatasetProblems(dataset(look('alpha'), wrongSuffix)).join('\n')).toContain('variant key must be "alpha-<suffix>"')
    const unrelated = look('beta', { versions: { 1: contract({ variantOf: { key: 'alpha', version: 1 } }) } })
    expect(lookDatasetProblems(dataset(look('alpha'), unrelated)).join('\n')).toContain('variant key must be "alpha-<suffix>"')
  })

  it('variantOf: every size must exist in the base with deep-equal regions', () => {
    const moved = contract({
      variantOf: { key: 'alpha', version: 1 },
      sizes: { SQUARE: { subject: 'x', regions: [region(0, 0, 60, 100)] } },
    })
    expect(lookDatasetProblems(dataset(look('alpha'), look('alpha-light', { versions: { 1: moved } }))).join('\n')).toContain(
      'alpha-light@1:SQUARE: regions differ from base alpha@1',
    )
    const extra = contract({
      variantOf: { key: 'alpha', version: 1 },
      sizes: { STORY: { subject: 'x', regions: [region(0, 0, 50, 100)] } },
    })
    expect(lookDatasetProblems(dataset(look('alpha'), look('alpha-light', { versions: { 1: extra } }))).join('\n')).toContain(
      'base alpha@1 has no STORY',
    )
  })

  it('variantOf: every version of a variant names the same base key', () => {
    const light = look('alpha-light', {
      current: 2,
      versions: {
        1: contract({ variantOf: { key: 'alpha', version: 1 } }),
        2: contract({ variantOf: { key: 'beta', version: 1 } }),
      },
    })
    const problems = lookDatasetProblems(dataset(look('alpha'), look('beta'), light)).join('\n')
    expect(problems).toContain('alpha-light: every version of a variant must name the same base key')
  })

  it('the prefix rule: a key that extends another key must be its variant', () => {
    const problems = lookDatasetProblems(dataset(look('alpha'), look('alpha-extra'))).join('\n')
    expect(problems).toContain('alpha-extra: starts with "alpha-"')
  })
})

describe('the composite rules (025 FR-03): each fails on its own fixture', () => {
  const sized = (regions: ReturnType<typeof region>[]) =>
    contract({ sizes: { SQUARE: { subject: 's', regions } } })
  const text = region(0, 0, 100, 30)
  const screenRegion = region(10, 40, 80, 45, 'composite')

  it('a requires look with exactly one composite region and no overlap is valid', () => {
    const ok = look('alpha', { requires: 'composite-source', versions: { 1: sized([text, screenRegion]) } })
    expect(lookDatasetProblems(dataset(ok))).toEqual([])
  })

  it('more than one composite region', () => {
    const two = look('alpha', {
      requires: 'composite-source',
      versions: { 1: sized([text, screenRegion, region(10, 86, 80, 14, 'composite', 10)]) },
    })
    expect(lookDatasetProblems(dataset(two))).toEqual(
      expect.arrayContaining(['alpha@1:SQUARE: more than one composite region']),
    )
  })

  it('a requires look with no composite region', () => {
    const none = look('alpha', { requires: 'composite-source', versions: { 1: sized([text]) } })
    expect(lookDatasetProblems(dataset(none))).toEqual([
      'alpha@1:SQUARE: requires composite-source but has 0 composite regions',
    ])
  })

  it('a look without requires has no composite region', () => {
    const stray = look('alpha', { versions: { 1: sized([text, screenRegion]) } })
    expect(lookDatasetProblems(dataset(stray))).toEqual([
      'alpha@1:SQUARE: has a composite region but no requires',
    ])
  })

  it('a composite region does not overlap a text region', () => {
    const overlap = look('alpha', {
      requires: 'composite-source',
      versions: { 1: sized([region(0, 0, 100, 50), screenRegion]) },
    })
    expect(lookDatasetProblems(dataset(overlap))).toEqual([
      'alpha@1:SQUARE: composite region overlaps a text region',
    ])
  })

  it('touching edges do not overlap', () => {
    const touching = look('alpha', {
      requires: 'composite-source',
      versions: { 1: sized([region(0, 0, 100, 40), screenRegion]) },
    })
    expect(lookDatasetProblems(dataset(touching))).toEqual([])
  })
})

describe('load-time assertion (AC-02)', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/designData/composition')
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  const loadWithBadDataset = async () => {
    vi.resetModules()
    vi.doMock('@/lib/designData/composition', async (orig) => {
      const real = await orig<typeof import('@/lib/designData/composition')>()
      // A record key that differs from archetype.key breaks FR-03 rule 1.
      return { ...real, archetypes: { 'bad-key': { ...real.archetypes.spotlight, key: 'other' } } }
    })
    return import('@/lib/designData')
  }

  it('importing designData with a bad dataset throws outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    await expect(loadWithBadDataset()).rejects.toThrow(/design data/)
  })

  it('does not throw at import in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    await expect(loadWithBadDataset()).resolves.toBeDefined()
  })
})

describe('the picker derives from the dataset it is given (AC-03)', () => {
  const retiredSpotlight = (): ArchetypeMap => {
    const m = structuredClone(archetypes) as Record<string, Archetype>
    m.spotlight = { ...m.spotlight, status: 'retired' }
    return m
  }

  it('imageStylesOf(archetypes) equals IMAGE_STYLES', () => {
    expect(imageStylesOf(archetypes)).toEqual(IMAGE_STYLES)
  })

  it('a retired look is omitted from the list and the options, but still resolves', () => {
    const fixture = retiredSpotlight()
    expect(imageStylesOf(fixture).map((s) => s.key)).not.toContain('spotlight')
    expect(imageStyleOptions('SQUARE', fixture).map((o) => o.key)).not.toContain('spotlight')
    expect(supportsSize('spotlight', 'SQUARE', fixture)).toBe(false)
    expect(styleLabel('spotlight', fixture)).toBe('Spotlight')
    expect(contractAt('spotlight', 1, 'SQUARE', fixture)).not.toBeNull()
  })

  it('a look that exists only in the fixture is listed', () => {
    const m = structuredClone(archetypes) as Record<string, Archetype>
    m['only-here'] = { ...m.spotlight, key: 'only-here' as Archetype['key'], label: 'Only here' }
    expect(imageStyleOptions('SQUARE', m).find((o) => o.key === 'only-here')?.supported).toBe(true)
  })
})
