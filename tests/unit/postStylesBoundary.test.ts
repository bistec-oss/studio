// 027 NFR-02 / NFR-10 / AC-18 (T1 half): purity, the one-way edge and the
// column shape, and (T2) the one-resolver key-literal guard.
import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { Prisma } from '@prisma/client'

const ROOT = process.cwd()

function walk(path: string): string[] {
  const abs = join(ROOT, path)
  if (!existsSync(abs)) return []
  if (statSync(abs).isFile()) return [path]
  return readdirSync(abs, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && /\.(ts|tsx)$/.test(d.name))
    .map((d) => relative(ROOT, join(d.parentPath, d.name)).split(sep).join('/'))
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function specifiers(source: string): string[] {
  const src = stripComments(source)
  const out: string[] = []
  for (const m of src.matchAll(
    /(?:^|[;\n])\s*(?:import|export)\s+(?:type\s+)?[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
  ))
    out.push(m[1])
  for (const m of src.matchAll(/(?:^|[;\n])\s*import\s*['"]([^'"]+)['"]/g)) out.push(m[1])
  for (const m of src.matchAll(/\b(?:import|require)\s*\(\s*(['"`])([^'"`]+)\1/g)) out.push(m[2])
  return out
}

// A type-only import is erased, so it is not a runtime dependency.
function runtimeSpecifiers(source: string): string[] {
  const typeOnly = new Set<string>()
  for (const m of stripComments(source).matchAll(
    /(?:^|[;\n])\s*import\s+type\s+[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
  ))
    typeOnly.add(m[1])
  const all = specifiers(source)
  return all.filter((s) => !typeOnly.has(s) || all.filter((x) => x === s).length > 1)
}

function purityViolations(source: string): string[] {
  const banned =
    /^(@\/lib\/(prisma|env|minio|storage)|(node:)?fs|puppeteer|minio|pg)(\/|$)|\/renderer\//
  const found: string[] = []
  for (const spec of runtimeSpecifiers(source)) {
    if (banned.test(spec)) found.push(`banned module ${spec}`)
    else if (/^@prisma\/client(\/|$)/.test(spec)) found.push(`@prisma/client ${spec}`)
  }
  return found
}

describe('NFR-10: purity of src/lib/postStyles', () => {
  const files = walk('src/lib/postStyles')

  it('finds the module files', () => {
    expect(files.map((f) => f.split('/').pop()).sort()).toEqual(
      expect.arrayContaining(['index.ts', 'styles.ts', 'types.ts']),
    )
  })

  it('imports no prisma, env, fs, minio, puppeteer or runtime @prisma/client', () => {
    for (const f of files)
      expect(purityViolations(readFileSync(join(ROOT, f), 'utf8')), f).toEqual([])
  })

  it('the matcher flags what it must and allows a type-only import', () => {
    for (const src of [
      `import { prisma } from '@/lib/prisma'`,
      `import fs from 'node:fs'`,
      `import { PrismaClient } from '@prisma/client'`,
      `const m = await import('@/lib/minio')`,
    ])
      expect(purityViolations(src), src).not.toEqual([])
    expect(purityViolations(`import type { AspectRatio } from '@prisma/client'`)).toEqual([])
  })
})

describe('AC-18: the import edges', () => {
  it('designData never imports postStyles', () => {
    for (const f of walk('src/lib/designData'))
      for (const spec of specifiers(readFileSync(join(ROOT, f), 'utf8')))
        expect(spec, f).not.toMatch(/postStyles/)
  })

  it('postStyles never imports designData/authoring', () => {
    for (const f of walk('src/lib/postStyles'))
      for (const spec of specifiers(readFileSync(join(ROOT, f), 'utf8')))
        expect(spec, f).not.toMatch(/designData\/authoring|(^|\/)authoring(\/|$)/)
  })

  it('no file outside src/lib/postStyles imports postStyles/styles', () => {
    const outside = walk('src').filter((f) => !f.startsWith('src/lib/postStyles/'))
    expect(outside.length).toBeGreaterThan(100)
    for (const f of outside)
      for (const spec of specifiers(readFileSync(join(ROOT, f), 'utf8')))
        expect(spec, f).not.toMatch(/postStyles\/styles(\.ts)?$/)
  })

  it('the matcher catches the import forms it must', () => {
    for (const src of [
      `import { styles } from '@/lib/postStyles/styles'`,
      `export { styles } from '../postStyles/styles'`,
      `const m = await import('@/lib/postStyles/styles')`,
    ])
      expect(
        specifiers(src).some((s) => /postStyles\/styles(\.ts)?$/.test(s)),
        src,
      ).toBe(true)
  })
})

describe('AC-01: the seven columns are optional with no default', () => {
  const COLUMNS: Array<[string, string]> = [
    ['Brief', 'postStyle'],
    ['ScheduledGeneration', 'postStyle'],
    ['ScheduledGeneration', 'heldReason'],
    ['Campaign', 'defaultPostStyle'],
    ['Draft', 'postStyle'],
    ['Draft', 'factsCheck'],
    ['DraftRevision', 'postStyle'],
  ]

  it('each is in the generated datamodel as nullable with no default', () => {
    for (const [model, field] of COLUMNS) {
      const m = Prisma.dmmf.datamodel.models.find((x) => x.name === model)
      const f = m?.fields.find((x) => x.name === field)
      expect(f, `${model}.${field}`).toBeDefined()
      expect(f!.isRequired, `${model}.${field}`).toBe(false)
      expect(f!.hasDefaultValue, `${model}.${field}`).toBe(false)
    }
  })

  it('the key columns are String and the stamp and check columns are Json', () => {
    const type = (model: string, field: string) =>
      Prisma.dmmf.datamodel.models
        .find((x) => x.name === model)!
        .fields.find((x) => x.name === field)!.type
    expect(type('Brief', 'postStyle')).toBe('String')
    expect(type('ScheduledGeneration', 'postStyle')).toBe('String')
    expect(type('ScheduledGeneration', 'heldReason')).toBe('String')
    expect(type('Campaign', 'defaultPostStyle')).toBe('String')
    expect(type('Draft', 'postStyle')).toBe('Json')
    expect(type('Draft', 'factsCheck')).toBe('Json')
    expect(type('DraftRevision', 'postStyle')).toBe('Json')
  })

  it('a create input that omits the columns still type-checks (the previous image does)', () => {
    // Compile-time: these literals omit every new column. If one became required,
    // `npx tsc --noEmit` fails here.
    const brief = null as unknown as Omit<
      Prisma.BriefUncheckedCreateInput,
      'postStyle'
    > satisfies Prisma.BriefUncheckedCreateInput
    const entry = null as unknown as Omit<
      Prisma.ScheduledGenerationUncheckedCreateInput,
      'postStyle' | 'heldReason'
    > satisfies Prisma.ScheduledGenerationUncheckedCreateInput
    const campaign = null as unknown as Omit<
      Prisma.CampaignUncheckedCreateInput,
      'defaultPostStyle'
    > satisfies Prisma.CampaignUncheckedCreateInput
    const draft = null as unknown as Omit<
      Prisma.DraftUncheckedCreateInput,
      'postStyle' | 'factsCheck'
    > satisfies Prisma.DraftUncheckedCreateInput
    const revision = null as unknown as Omit<
      Prisma.DraftRevisionUncheckedCreateInput,
      'postStyle'
    > satisfies Prisma.DraftRevisionUncheckedCreateInput
    expect([brief, entry, campaign, draft, revision]).toHaveLength(5)
  })
})

// 027 NFR-02 / AC-18 (T2): no style key literal outside src/lib/postStyles as an
// object key or a case label. The mapping lives in the resolver and the dataset.
const KEYS = [
  'general',
  'launch',
  'promotion',
  'event',
  'hiring',
  'announcement',
  'tip',
  'milestone',
]
function keyLiteralViolations(source: string): string[] {
  const src = stripComments(source)
  const alt = KEYS.join('|')
  const found: string[] = []
  // case 'launch':
  for (const m of src.matchAll(new RegExp(`\\bcase\\s*(['"\`])(${alt})\\1\\s*:`, 'g')))
    found.push(`case label ${m[2]}`)
  // { 'launch': ..., "tip": ... }  (a quoted key)
  for (const m of src.matchAll(new RegExp(`(^|[{,\\s])(['"])(${alt})\\2\\s*:`, 'g')))
    found.push(`quoted key ${m[3]}`)
  // { launch: ..., hiring: ... } (a bare key written as a property in a literal that
  // also lists another style key: a lookup table keyed by styles)
  const bare = KEYS.filter((k) => new RegExp(`(^|[{,\\n])\\s*${k}\\s*:\\s*\\S`, 'm').test(src))
  if (bare.length >= 2) found.push(`bare keys ${bare.join(',')}`)
  return found
}

describe('AC-18: the one-resolver guard (no style key literals outside postStyles)', () => {
  it('no file under src outside src/lib/postStyles names a style key as a key or case label', () => {
    const outside = walk('src').filter((f) => !f.startsWith('src/lib/postStyles/'))
    expect(outside.length).toBeGreaterThan(100)
    for (const f of outside)
      expect(keyLiteralViolations(readFileSync(join(ROOT, f), 'utf8')), f).toEqual([])
  })

  it('the matcher flags a planted lookup table and a case label, and passes plain prose', () => {
    expect(keyLiteralViolations(`switch (x) { case 'launch': return 1 }`)).not.toEqual([])
    expect(keyLiteralViolations(`const t = { 'tip': 1 }`)).not.toEqual([])
    expect(keyLiteralViolations(`const t = { hiring: 'a', launch: 'b' }`)).not.toEqual([])
    expect(keyLiteralViolations(`const style = 'general'; const e = { event: 1 }`)).toEqual([])
  })

  it('the import guard flags a planted import of postStyles/styles', () => {
    const planted = `import { styles } from '@/lib/postStyles/styles'`
    expect(specifiers(planted).some((x) => /postStyles\/styles(\.ts)?$/.test(x))).toBe(true)
  })
})

// 027 T3 (AC-18): the facts check never reaches the authoring dataset, and its
// index stays pure by not re-exporting the two database files. The purity walk
// itself lives once, in designDataBoundary.test.ts.
describe('AC-18: the factsCheck edges', () => {
  it('factsCheck never imports designData/authoring', () => {
    const files = walk('src/lib/factsCheck')
    expect(files.length).toBeGreaterThanOrEqual(7)
    for (const f of files)
      for (const spec of specifiers(readFileSync(join(ROOT, f), 'utf8')))
        expect(spec, f).not.toMatch(/designData\/authoring|(^|\/)authoring(\/|$)/)
  })

  it('the index does not re-export sources or refresh', () => {
    for (const spec of specifiers(readFileSync(join(ROOT, 'src/lib/factsCheck/index.ts'), 'utf8')))
      expect(spec).not.toMatch(/(^|\/)(sources|refresh)$/)
  })
})
