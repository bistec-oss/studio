import { describe, it, expect } from 'vitest'
import { ModelKey as PrismaModelKey, ModelSurface as PrismaModelSurface } from '@prisma/client'
import {
  CATALOGUE,
  INTERNAL_SURFACES,
  MODEL_KEYS,
  SYSTEM_DEFAULTS,
  USER_SURFACES,
  catalogueProblems,
  entryForStamp,
  isEligible,
  modelTier,
  tableDefault,
  type CatalogueEntry,
  type Surface,
} from '@/lib/models/catalogue'

// 008 FR-01, FR-02, FR-04 / AC-01. The catalogue is spec FR-01's table and the
// timeouts are design §5's; every invariant is shown failing on a planted
// catalogue, so a bad future entry is caught at the unit gate.

const byKey = (key: string) => CATALOGUE.find((e) => e.key === key)!

// A deep-enough copy to plant one fault without touching the real catalogue.
type Planted = Omit<CatalogueEntry, 'previousApiIds'> & { previousApiIds: string[] }
const planted = (edit: (c: Planted[]) => void): Planted[] => {
  const copy = CATALOGUE.map((e) => ({
    ...e,
    previousApiIds: [...e.previousApiIds],
    surfaces: { ...e.surfaces },
  }))
  edit(copy)
  return copy
}

describe('the catalogue — spec FR-01 table', () => {
  it('has exactly the three keys, cheapest first', () => {
    expect(CATALOGUE.map((e) => e.key)).toEqual(['HAIKU', 'SONNET', 'OPUS'])
    expect([...MODEL_KEYS]).toEqual(['HAIKU', 'SONNET', 'OPUS'])
  })

  it('carries the current IDs, cliArg = apiId, and the retired IDs (A10)', () => {
    expect(
      CATALOGUE.map((e) => [e.key, e.displayName, e.apiId, e.cliArg, e.previousApiIds]),
    ).toEqual([
      ['HAIKU', 'Haiku 4.5', 'claude-haiku-4-5', 'claude-haiku-4-5', ['claude-haiku-4-5-20251001']],
      ['SONNET', 'Sonnet 5.5', 'claude-sonnet-5-5', 'claude-sonnet-5-5', ['claude-sonnet-4-6']],
      ['OPUS', 'Opus 5.5', 'claude-opus-5-5', 'claude-opus-5-5', []],
    ])
  })

  it('carries the prices, speed, gating, floor and defaultAllowed', () => {
    expect(
      CATALOGUE.map((e) => [
        e.key,
        e.priceInputPerMTok,
        e.priceOutputPerMTok,
        e.speed,
        e.personalTokenGated,
        e.apiMaxTokensFloor,
        e.defaultAllowed,
      ]),
    ).toEqual([
      ['HAIKU', 1, 5, 'fast', false, null, true],
      ['SONNET', 2, 10, 'medium', false, 16000, true],
      ['OPUS', 4, 20, 'slow', true, 16000, true],
    ])
  })

  it('AC-01(d): every priceSource is the dated source note', () => {
    for (const e of CATALOGUE) {
      expect(e.priceSource).toBe(
        'Anthropic first-party API rates, claude-api skill model table (cached 2026-09-25), read 2026-10-12',
      )
      expect(e.priceSource).toMatch(/\d{4}-\d{2}-\d{2}/)
    }
  })

  it('the per-model, per-surface timeouts are design §5’s table (seconds; — = not eligible)', () => {
    const table: Record<Surface, [number | null, number | null, number | null]> = {
      CAPTION: [120, 180, 240],
      DESIGN_TEMPLATE: [300, 360, null],
      DESIGN_FREEFORM: [300, 360, 600],
      REFINE: [300, 360, 540],
      ASSISTANT_BRIEFING: [180, 180, 300],
      ASSISTANT_BRANDKIT: [180, 180, 300],
      INTERNAL_BACKGROUND: [90, null, null],
      INTERNAL_VERIFIER: [60, null, null],
      INTERNAL_TOKEN_PING: [60, null, null],
    }
    for (const surface of [...USER_SURFACES, ...INTERNAL_SURFACES]) {
      const actual = CATALOGUE.map((e) => {
        const ms = e.surfaces[surface]?.timeoutMs
        return ms === undefined ? null : ms / 1000
      })
      expect([surface, ...actual]).toEqual([surface, ...table[surface]])
    }
  })

  it('AC-01(c): DESIGN_TEMPLATE is eligible for exactly Haiku and Sonnet', () => {
    expect(CATALOGUE.filter((e) => isEligible(e, 'DESIGN_TEMPLATE')).map((e) => e.key)).toEqual([
      'HAIKU',
      'SONNET',
    ])
  })

  it('internal surfaces are Haiku only (A14)', () => {
    for (const surface of INTERNAL_SURFACES) {
      expect(CATALOGUE.filter((e) => isEligible(e, surface)).map((e) => e.key)).toEqual(['HAIKU'])
    }
  })
})

describe('catalogueProblems — AC-01(a): each invariant holds and fails on a planted catalogue', () => {
  it('the real catalogue has no problems', () => {
    expect(catalogueProblems(CATALOGUE)).toEqual([])
  })

  it('a duplicated key', () => {
    const c = planted((c) => (c[2].key = 'SONNET'))
    expect(catalogueProblems(c)).toContain('duplicate key SONNET')
  })

  it('an ID twice across apiId and previousApiIds (same entry or two entries)', () => {
    const across = planted((c) => c[1].previousApiIds.push('claude-haiku-4-5'))
    expect(catalogueProblems(across)).toContain(
      'model ID claude-haiku-4-5 appears twice (HAIKU, SONNET)',
    )
    const within = planted((c) => c[2].previousApiIds.push('claude-opus-5-5'))
    expect(catalogueProblems(within)).toContain(
      'model ID claude-opus-5-5 appears twice (OPUS, OPUS)',
    )
  })

  it('a cliArg alias that is another family’s ID', () => {
    const c = planted((c) => (c[1].cliArg = 'claude-haiku-4-5'))
    expect(catalogueProblems(c)).toContain("SONNET cliArg claude-haiku-4-5 is HAIKU's ID")
  })

  it('a missing price', () => {
    expect(catalogueProblems(planted((c) => (c[0].priceInputPerMTok = 0)))).toContain(
      'HAIKU lacks priceInputPerMTok',
    )
    expect(catalogueProblems(planted((c) => (c[1].priceOutputPerMTok = Number.NaN)))).toContain(
      'SONNET lacks priceOutputPerMTok',
    )
  })

  it('a missing or undated priceSource', () => {
    expect(catalogueProblems(planted((c) => (c[2].priceSource = ' ')))).toContain(
      'OPUS lacks a priceSource',
    )
    expect(catalogueProblems(planted((c) => (c[2].priceSource = 'the website')))).toContain(
      'OPUS priceSource has no date',
    )
  })

  it('a user surface with no eligible entry', () => {
    const c = planted((c) => c.forEach((e) => delete e.surfaces.REFINE))
    expect(catalogueProblems(c)).toContain('user surface REFINE has no eligible model')
  })

  it('DESIGN_TEMPLATE listing OPUS', () => {
    const c = planted((c) => (c[2].surfaces.DESIGN_TEMPLATE = { timeoutMs: 300_000 }))
    expect(catalogueProblems(c)).toContain('DESIGN_TEMPLATE lists OPUS')
  })

  it('an internal surface not on Haiku alone', () => {
    const c = planted((c) => (c[1].surfaces.INTERNAL_VERIFIER = { timeoutMs: 60_000 }))
    expect(catalogueProblems(c)).toContain(
      'internal surface INTERNAL_VERIFIER must be Haiku only (got HAIKU, SONNET)',
    )
  })

  it('an invalid timeout', () => {
    const c = planted((c) => (c[0].surfaces.CAPTION = { timeoutMs: 0 }))
    expect(catalogueProblems(c)).toContain('HAIKU CAPTION has no valid timeout')
  })

  it('a catalogue not ordered cheapest first', () => {
    const c = planted((c) => c.reverse())
    expect(catalogueProblems(c)).toContain(
      'catalogue is not cheapest first (OPUS is listed before the cheaper SONNET)',
    )
  })
})

describe('modelTier — AC-01(b)', () => {
  it('returns $, $$, $$$ for the real prices', () => {
    expect(CATALOGUE.map((e) => modelTier(e))).toEqual(['$', '$$', '$$$'])
  })

  it('a planted Sonnet at $8/$40 is $$$', () => {
    const c = planted((c) => {
      c[1].priceInputPerMTok = 8
      c[1].priceOutputPerMTok = 40
    })
    expect(modelTier(c[1], c)).toBe('$$$')
  })

  it('caps at $$$ and is relative to the cheapest entry', () => {
    const c = planted((c) => {
      c[2].priceInputPerMTok = 100
      c[2].priceOutputPerMTok = 500
    })
    expect(modelTier(c[2], c)).toBe('$$$')
    expect(modelTier(c[0], c)).toBe('$')
  })
})

describe('entryForStamp', () => {
  it('maps a current apiId / cliArg to its entry, not as a previous ID', () => {
    expect(entryForStamp('claude-sonnet-5-5')).toEqual({ entry: byKey('SONNET'), previous: false })
    expect(entryForStamp('claude-opus-5-5')).toEqual({ entry: byKey('OPUS'), previous: false })
  })

  it('maps a cliArg alias when one differs from the apiId (T2 fallback)', () => {
    const c = planted((c) => (c[0].cliArg = 'haiku-alias'))
    expect(entryForStamp('haiku-alias', c)).toEqual({ entry: c[0], previous: false })
  })

  it('maps a retired ID to its family, flagged previous', () => {
    expect(entryForStamp('claude-sonnet-4-6')).toEqual({ entry: byKey('SONNET'), previous: true })
    expect(entryForStamp('claude-haiku-4-5-20251001')).toEqual({
      entry: byKey('HAIKU'),
      previous: true,
    })
  })

  it('returns null for anything else (exact match only)', () => {
    expect(entryForStamp('gpt-4o')).toBeNull()
    expect(entryForStamp('CLAUDE-SONNET-5-5')).toBeNull()
    expect(entryForStamp('')).toBeNull()
  })
})

describe('system defaults — FR-04 table', () => {
  it('is today’s split on current keys', () => {
    expect(SYSTEM_DEFAULTS).toEqual({
      CAPTION: 'HAIKU',
      DESIGN_TEMPLATE: 'HAIKU',
      DESIGN_FREEFORM: 'SONNET',
      REFINE: 'SONNET',
      ASSISTANT_BRIEFING: 'SONNET',
      ASSISTANT_BRANDKIT: 'SONNET',
    })
  })

  it('REFINE follows the design path (A8); no path reads as Path B', () => {
    expect(tableDefault('REFINE', 'A')).toBe('HAIKU')
    expect(tableDefault('REFINE', 'B')).toBe('SONNET')
    expect(tableDefault('REFINE')).toBe('SONNET')
    expect(tableDefault('CAPTION', 'B')).toBe('HAIKU')
  })

  it('every system default is eligible for its surface', () => {
    for (const surface of USER_SURFACES) {
      for (const path of ['A', 'B'] as const) {
        expect(isEligible(byKey(tableDefault(surface, path)), surface)).toBe(true)
      }
    }
  })
})

describe('the Prisma enums carry the catalogue values (T3)', () => {
  // The catalogue's unions are client-safe TypeScript with no Prisma import;
  // the persisted vocabulary is schema.prisma's ModelKey / ModelSurface. A key
  // or surface added on one side only fails here, before a write could store a
  // value the other side can't read.
  it('ModelKey equals MODEL_KEYS', () => {
    expect(Object.values(PrismaModelKey)).toEqual([...MODEL_KEYS])
  })

  it('ModelSurface equals USER_SURFACES (internal surfaces are never persisted)', () => {
    expect(Object.values(PrismaModelSurface)).toEqual([...USER_SURFACES])
    for (const surface of INTERNAL_SURFACES) {
      expect(Object.values(PrismaModelSurface)).not.toContain(surface)
    }
  })
})
