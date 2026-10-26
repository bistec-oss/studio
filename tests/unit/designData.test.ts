import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ASPECT_DIMENSIONS } from '@/lib/aspectRatio'
import {
  designData,
  archetypes,
  contractAt,
  getArchetype,
  isActiveKey,
  styleLabel,
  IMAGE_STYLES,
  imageStyleOptions,
  PRECEDENCE_LINE,
  describeRegion,
  describeRegionPx,
  imageContractText,
  designContractText,
  refineContractText,
} from '@/lib/designData'

const ASPECTS = Object.keys(ASPECT_DIMENSIONS) as Array<keyof typeof ASPECT_DIMENSIONS>

describe('designData: dataset invariants (AC-02)', () => {
  it('exposes the composition section with the five looks', () => {
    expect(Object.keys(designData.composition.archetypes).sort()).toEqual([
      'device-screen',
      'editorial-split',
      'full-bleed-scene',
      'product-showcase',
      'spotlight',
    ])
    expect(PRECEDENCE_LINE).toContain('outranks')
  })

  it('every region meets its minAreaPct and lies inside 0..100', () => {
    for (const a of Object.values(archetypes)) {
      for (const contract of Object.values(a.versions)) {
        for (const size of Object.values(contract.sizes)) {
          for (const { rect, minAreaPct } of size!.regions) {
            expect(rect.x).toBeGreaterThanOrEqual(0)
            expect(rect.y).toBeGreaterThanOrEqual(0)
            expect(rect.w).toBeGreaterThan(0)
            expect(rect.h).toBeGreaterThan(0)
            expect(rect.x + rect.w).toBeLessThanOrEqual(100)
            expect(rect.y + rect.h).toBeLessThanOrEqual(100)
            expect((rect.w * rect.h) / 100).toBeGreaterThanOrEqual(minAreaPct)
          }
        }
      }
    }
  })

  it('every text region has the contract tone (tone is a contract field, regions carry no tone of their own)', () => {
    for (const a of Object.values(archetypes)) {
      for (const contract of Object.values(a.versions)) {
        expect(['light', 'dark']).toContain(contract.textTone)
        for (const size of Object.values(contract.sizes)) {
          for (const region of size!.regions) {
            expect(Object.keys(region).filter((k) => k !== 'use').sort()).toEqual(['minAreaPct', 'purpose', 'rect'])
            if ('use' in region) expect(typeof (region as { use?: unknown }).use).toBe('string')
          }
        }
      }
    }
  })

  it('every active archetype gives each aspect ratio a contract or declares it unsupported', () => {
    // Every current contract declares all three sizes (028 FR-02).
    const declaredUnsupported: Record<string, string[]> = {}
    for (const a of Object.values(archetypes).filter((x) => x.status === 'active')) {
      for (const ratio of ASPECTS) {
        const has = contractAt(a.key, a.current, ratio) !== null
        const unsupported = (declaredUnsupported[a.key] ?? []).includes(ratio)
        expect(has !== unsupported, `${a.key} at ${ratio} is neither supported nor declared unsupported`).toBe(true)
      }
    }
  })

  it('current names an existing version and the keys match', () => {
    for (const [key, a] of Object.entries(archetypes)) {
      expect(a.key).toBe(key)
      expect(a.versions[a.current]).toBeDefined()
    }
  })

  it('the dataset is deep-frozen: a mutation attempt throws', () => {
    const a = archetypes['product-showcase']
    expect(Object.isFrozen(a)).toBe(true)
    expect(Object.isFrozen(a.versions)).toBe(true)
    expect(Object.isFrozen(a.versions[1])).toBe(true)
    expect(Object.isFrozen(a.versions[1].sizes.SQUARE)).toBe(true)
    expect(Object.isFrozen(a.versions[1].sizes.SQUARE!.regions[0].rect)).toBe(true)
    expect(() => {
      ;(a.versions[1].sizes.SQUARE!.regions[0].rect as { w: number }).w = 10
    }).toThrow()
    expect(() => {
      ;(a as { status: string }).status = 'retired'
    }).toThrow()
  })

  it('pins version 1 of both archetypes: an edit fails (a change adds a version)', () => {
    const hash = (k: string) => createHash('sha256').update(JSON.stringify(archetypes[k].versions[1])).digest('hex')
    expect(hash('product-showcase')).toBe('ce6a918e9ed33e60787779591c2834651bc85dae8749283d7ba9c39be036c4cc')
    expect(hash('editorial-split')).toBe('440d41092cd4ef97baba2d2e02971f389cee0ecd340b4517e9b32e38d411ecc6')
  })

  it('the version-1 table matches design.md section 2', () => {
    const rect = (k: string, s: 'SQUARE' | 'PORTRAIT') => archetypes[k].versions[1].sizes[s]!.regions[0].rect
    expect(rect('product-showcase', 'SQUARE')).toEqual({ x: 0, y: 0, w: 45, h: 100 })
    expect(rect('product-showcase', 'PORTRAIT')).toEqual({ x: 0, y: 0, w: 100, h: 38 })
    expect(rect('editorial-split', 'SQUARE')).toEqual({ x: 0, y: 0, w: 50, h: 100 })
    expect(rect('editorial-split', 'PORTRAIT')).toEqual({ x: 0, y: 0, w: 100, h: 50 })
    for (const k of ['product-showcase', 'editorial-split']) {
      expect(archetypes[k].versions[1].textTone).toBe('light')
      expect(archetypes[k].versions[1].sizes.STORY).toBeUndefined()
    }
  })
})

describe('designData: lookups and picker', () => {
  it('getArchetype ignores classic, unknown and prototype names', () => {
    expect(getArchetype('product-showcase')?.label).toBe('Product showcase')
    expect(getArchetype('classic')).toBeNull()
    expect(getArchetype('nope')).toBeNull()
    expect(getArchetype('constructor')).toBeNull()
    expect(getArchetype('__proto__')).toBeNull()
  })

  it('contractAt resolves the exact version and size, null otherwise', () => {
    expect(contractAt('editorial-split', 1, 'PORTRAIT')?.regions[0].rect.h).toBe(50)
    expect(contractAt('editorial-split', 2, 'PORTRAIT')?.regions[0].rect.h).toBe(50)
    expect(contractAt('editorial-split', 3, 'PORTRAIT')).toBeNull()
    expect(contractAt('editorial-split', 1, 'STORY')).toBeNull()
    expect(contractAt('editorial-split', 2, 'STORY')?.regions[0].rect.h).toBe(48)
    expect(contractAt('classic', 1, 'SQUARE')).toBeNull()
  })

  it('isActiveKey and styleLabel', () => {
    expect(isActiveKey('product-showcase')).toBe(true)
    expect(isActiveKey('classic')).toBe(false)
    expect(styleLabel('editorial-split')).toBe('Editorial split')
    expect(styleLabel('gone')).toBe('that image style')
  })

  it('the picker lists classic first and the active looks; every card is supported at every size', () => {
    expect(IMAGE_STYLES.map((s) => s.key)).toEqual([
      'classic',
      'product-showcase',
      'editorial-split',
      'full-bleed-scene',
      'spotlight',
      // 025: active, so it is listed; imageStyleOptions marks it unsupported
      // without a screenshot in T2.
      'device-screen',
    ])
    expect(Object.isFrozen(IMAGE_STYLES)).toBe(true)
    expect(IMAGE_STYLES.every((s) => Object.isFrozen(s))).toBe(true)
    // device-screen is size-supported at every size but needs a screenshot (025 T2),
    // so it is supported only when the caller says a source exists.
    for (const size of ['SQUARE', 'STORY', 'PORTRAIT'] as const) {
      expect(imageStyleOptions(size, undefined, { hasCompositeSource: true }).every((o) => o.supported)).toBe(true)
      expect(imageStyleOptions(size).filter((o) => !o.supported).map((o) => o.key)).toEqual(['device-screen'])
    }
  })
})

// Returns one message per violation. Comments are stripped first so prose that
// names a banned module does not trip it.
function purityViolations(source: string): string[] {
  const src = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const banned = /^(@\/lib\/(prisma|env|minio|storage)|(node:)?fs|puppeteer|minio|pg)(\/|$)|\/renderer\//
  const found: string[] = []
  const check = (spec: string, typeOnly: boolean, how: string) => {
    if (banned.test(spec)) found.push(`${how} of banned module ${spec}`)
    else if (spec.startsWith('../')) found.push(`${how} of a parent-relative path ${spec}`)
    else if (/^@prisma\/client(\/|$)/.test(spec) && !typeOnly) found.push(`runtime ${how} of ${spec}`)
  }
  for (const m of src.matchAll(/(?:^|[;\n])\s*(?:import|export)\s+(type\s+)?[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g)) {
    check(m[2], Boolean(m[1]), 'import')
  }
  for (const m of src.matchAll(/(?:^|[;\n])\s*import\s*['"]([^'"]+)['"]/g)) check(m[1], false, 'side-effect import')
  for (const m of src.matchAll(/\bimport\s*\(\s*(['"`])([^'"`]+)\1/g)) check(m[2], false, 'dynamic import')
  for (const m of src.matchAll(/\brequire\s*\(\s*(['"`])([^'"`]+)\1/g)) check(m[2], false, 'require')
  if (/\b(import|require)\s*\(\s*[^'"`\s)]/.test(src)) found.push('a dynamic import or require with a non-literal specifier')
  return found
}

describe('designData: purity guard (AC-02)', () => {
  const dir = join(process.cwd(), 'src', 'lib', 'designData')
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'))

  it('finds the ten module files', () => {
    expect(files.sort()).toEqual(
      ['composite', 'composition', 'evaluate', 'index', 'layout', 'plan', 'promptText', 'regions', 'stamp', 'validate'].map((n) => `${n}.ts`)
    )
  })

  it('imports no server module and no runtime @prisma/client value', () => {
    for (const f of files) {
      expect(purityViolations(readFileSync(join(dir, f), 'utf8')), f).toEqual([])
    }
  })

  it('the matcher fires on every kind of violation (negative test)', () => {
    const bad = [
      `import { prisma } from '@/lib/prisma'`,
      `import { env } from '@/lib/env/index'`,
      `import fs from 'node:fs'`,
      `import 'puppeteer'`,
      `const m = await import('minio')`,
      `const p = require('@/lib/prisma')`,
      `import { x } from '../prisma'`,
      `import { r } from '@/lib/renderer/puppeteer'`,
      `import { PrismaClient } from '@prisma/client'`,
      `import '@prisma/client'`,
      `const m = await import(name)`,
      `export { y } from '../../lib/env'`,
    ]
    for (const src of bad) expect(purityViolations(src), src).not.toEqual([])
  })

  it('the matcher allows siblings, type-only prisma imports and prose in comments', () => {
    const ok = [
      `import type { AspectRatio } from '@prisma/client'`,
      `import { z } from 'zod'`,
      `import { a } from './composition'`,
      `export * from './stamp'`,
      `// no prisma, minio, env, fs or puppeteer import: require('x') and import('y') in prose\nconst a = 1`,
      `/* import fs from 'fs' */ const b = 2`,
    ]
    for (const src of ok) expect(purityViolations(src), src).toEqual([])
  })
})

describe('promptText: describeRegion', () => {
  it('names the left, right, top and bottom bands and the whole frame', () => {
    expect(describeRegion({ x: 0, y: 0, w: 45, h: 100 })).toBe('the left 45% of the frame, full height')
    expect(describeRegion({ x: 60, y: 0, w: 40, h: 100 })).toBe('the right 40% of the frame, full height')
    expect(describeRegion({ x: 0, y: 0, w: 100, h: 38 })).toBe('the top 38% of the frame, full width')
    expect(describeRegion({ x: 0, y: 60, w: 100, h: 40 })).toBe('the bottom 40% of the frame, full width')
    expect(describeRegion({ x: 0, y: 0, w: 100, h: 100 })).toBe('the whole frame')
  })
  it('falls back to the generic form and trims decimals', () => {
    expect(describeRegion({ x: 10, y: 20, w: 30.5, h: 40 })).toBe(
      'the area from 10% to 40.5% across and 20% to 60% down'
    )
  })
})

describe('describeRegionPx', () => {
  it('converts percent to canvas pixels', () => {
    expect(describeRegionPx({ x: 0, y: 0, w: 45, h: 100 }, { width: 1080, height: 1350 })).toBe('x 0 to 486, y 0 to 1350')
  })
})

describe('contract text, generated from the dataset', () => {
  const ps = archetypes['product-showcase'].versions[1]
  const es = archetypes['editorial-split'].versions[1]

  it('imageContractText states the subject and each region measurement', () => {
    expect(imageContractText(ps, ps.sizes.SQUARE!)).toBe(
      'Subject: a device or object as the hero subject in the right 55%, lit with depth.\n' +
        'The left 45% of the frame, full height must be an empty, calm, dark area with no detail.'
    )
    expect(imageContractText(ps, ps.sizes.PORTRAIT!)).toBe(
      'Subject: the same subject in the lower 62%.\n' +
        'The top 38% of the frame, full width must be an empty, calm, dark area with no detail.'
    )
    expect(imageContractText(es, es.sizes.SQUARE!)).toBe(
      'Subject: a photographic scene confined to the right 40%, fading softly into the flat area across the 50 to 60% strip.\n' +
        'The left 50% of the frame, full height must be an empty, calm, dark area with no detail.'
    )
    expect(imageContractText(es, es.sizes.PORTRAIT!)).toBe(
      'Subject: a photographic scene confined to the bottom 40%, fading across the 50 to 60% strip.\n' +
        'The top 50% of the frame, full width must be an empty, calm, dark area with no detail.'
    )
  })

  it('imageContractText describes a clear region and a dark-text tone', () => {
    const contract = { ...ps, textTone: 'dark' as const }
    const size = {
      subject: 'x',
      regions: [
        { rect: { x: 0, y: 0, w: 50, h: 100 }, purpose: 'text' as const, minAreaPct: 20 },
        { rect: { x: 60, y: 0, w: 40, h: 100 }, purpose: 'clear' as const, minAreaPct: 20 },
      ],
    }
    const out = imageContractText(contract, size)
    expect(out).toContain('an empty, calm, light area')
    expect(out).toContain('The right 40% of the frame, full height must be kept clear of the subject and of detail.')
  })

  it('designContractText gives percent and pixel regions, the tone and the no-scrim rule', () => {
    const out = designContractText(ps, ps.sizes.PORTRAIT!, { width: 1080, height: 1350 }, 'https://x/y.png')
    expect(out).toContain('Background image: https://x/y.png')
    expect(out).toContain('background-size: cover; background-position: center')
    expect(out).toContain('- the top 38% of the frame, full width (x 0 to 1080, y 0 to 513)')
    expect(out).toContain('Text colour: white.')
    expect(out).toContain('No scrim or overlay')
    expect(designContractText({ ...ps, textTone: 'dark' }, ps.sizes.SQUARE!, { width: 1080, height: 1080 }, 'u')).toContain(
      'near-black #111111'
    )
  })

  it('designContractText for every archetype and size names the text region in percent and pixels', () => {
    const cases: Array<[typeof ps, 'SQUARE' | 'PORTRAIT', number, string]> = [
      [ps, 'SQUARE', 1080, '- the left 45% of the frame, full height (x 0 to 486, y 0 to 1080)'],
      [ps, 'PORTRAIT', 1350, '- the top 38% of the frame, full width (x 0 to 1080, y 0 to 513)'],
      [es, 'SQUARE', 1080, '- the left 50% of the frame, full height (x 0 to 540, y 0 to 1080)'],
      [es, 'PORTRAIT', 1350, '- the top 50% of the frame, full width (x 0 to 1080, y 0 to 675)'],
    ]
    for (const [c, size, h, line] of cases) {
      const out = designContractText(c, c.sizes[size]!, { width: 1080, height: h }, 'u')
      expect(out).toContain(line)
      expect(out).toContain('Text colour: white.')
    }
  })

  it('refineContractText names the label, version and regions; clear regions only when present', () => {
    expect(refineContractText({ label: 'Product showcase', version: 1, size: ps.sizes.SQUARE! })).toBe(
      'This post uses the Product showcase layout (contract v1). Keep headline, body text and the logo inside: the left 45% of the frame, full height.'
    )
    const withClear = {
      subject: 'x',
      regions: [
        ...ps.sizes.SQUARE!.regions,
        { rect: { x: 60, y: 0, w: 40, h: 100 }, purpose: 'clear' as const, minAreaPct: 20 },
      ],
    }
    expect(refineContractText({ label: 'X', version: 2, size: withClear })).toContain(
      'Keep these regions of the background clear: the right 40% of the frame, full height.'
    )
  })

  it('the precedence line is one constant naming what still applies', () => {
    expect(PRECEDENCE_LINE).toContain('outranks any layout instruction')
    expect(PRECEDENCE_LINE).toContain('colours, fonts, logo and wording rules still apply')
  })
})
