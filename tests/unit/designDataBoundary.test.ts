// 007 AC-16 / FR-16 / NFR-07: the authoring/generation boundary and purity.
//  - no generation-side file imports designData/authoring;
//  - designData/index.ts does not re-export it;
//  - the pure files import no server module;
//  - no template, default or mock replacement carries a placement word or an
//    archetype key (009 owns composition).
import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { entries } from '@/lib/designData/authoring/entries'
import { archetypes } from '@/lib/designData'

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

// Every import / export-from / dynamic import specifier in a source file.
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

function purityViolations(source: string): string[] {
  const banned =
    /^(@\/lib\/(prisma|env|minio|storage)|(node:)?fs|puppeteer|minio|pg)(\/|$)|\/renderer\//
  const found: string[] = []
  for (const spec of specifiers(source)) {
    if (banned.test(spec)) found.push(`banned module ${spec}`)
    else if (spec.startsWith('../')) found.push(`parent-relative path ${spec}`)
    else if (/^@prisma\/client(\/|$)/.test(spec)) found.push(`@prisma/client ${spec}`)
  }
  return found
}

const GENERATION_SIDE = [
  'src/lib/agent',
  'src/lib/brandkit/systemContext.ts',
  'src/lib/captions',
  'src/lib/drafts',
  'src/scheduler',
  'src/app/api/briefs',
  'src/app/api/drafts',
  'src/app/api/generate',
  'src/app/api/acp',
  'src/mcp',
]

describe('AC-16: no generation-side file imports the authoring dataset', () => {
  // The 009 generation modules live beside authoring/ in designData/ itself.
  const files = [
    ...GENERATION_SIDE.flatMap(walk),
    ...walk('src/lib/designData').filter((f) => !f.startsWith('src/lib/designData/authoring/')),
  ]

  it('scans a real set of files', () => {
    expect(files.length).toBeGreaterThan(40)
    expect(files).toContain('src/lib/brandkit/systemContext.ts')
    expect(files).toContain('src/lib/agent/fencedBlock.ts')
    expect(files).toContain('src/lib/designData/composition.ts')
  })

  it('none imports designData/authoring (absolute or relative)', () => {
    for (const f of files) {
      for (const spec of specifiers(readFileSync(join(ROOT, f), 'utf8'))) {
        expect(spec, f).not.toMatch(/designData\/authoring|(^|\/)authoring(\/|$)/)
      }
    }
  })

  it('designData/index.ts does not mention authoring', () => {
    expect(readFileSync(join(ROOT, 'src/lib/designData/index.ts'), 'utf8')).not.toMatch(/authoring/)
  })

  it('the matcher catches the forms it must', () => {
    const bad = [
      `import { x } from '@/lib/designData/authoring'`,
      `import { x } from '../designData/authoring/entries'`,
      `export * from './authoring'`,
      `const m = await import('@/lib/designData/authoring/detect')`,
    ]
    for (const src of bad) {
      expect(
        specifiers(src).some((s) => /designData\/authoring|(^|\/)authoring(\/|$)/.test(s)),
        src,
      ).toBe(true)
    }
  })
})

describe('AC-16 / NFR-07: the pure files import no server module', () => {
  const pure = [
    ...walk('src/lib/designData/authoring'),
    'src/lib/kitUpgrade/review.ts',
    'src/lib/agent/fencedBlock.ts',
  ]

  it('finds the authoring files', () => {
    expect(
      pure
        .filter((f) => f.includes('designData/authoring'))
        .map((f) => f.split('/').pop()!.replace('.ts', ''))
        .sort(),
    ).toEqual(['detect', 'entries', 'index', 'measurable', 'roles', 'typography', 'validate'])
  })

  it('imports no prisma, minio, env, fs, puppeteer or runtime @prisma/client', () => {
    for (const f of pure)
      expect(purityViolations(readFileSync(join(ROOT, f), 'utf8')), f).toEqual([])
  })

  it('the matcher flags what it must', () => {
    for (const src of [
      `import { prisma } from '@/lib/prisma'`,
      `import fs from 'node:fs'`,
      `import { r } from '@/lib/renderer/puppeteer'`,
      `import { x } from '../prisma'`,
      `import { PrismaClient } from '@prisma/client'`,
    ]) {
      expect(purityViolations(src), src).not.toEqual([])
    }
  })

  it('review.ts and the textUpgrade components import nothing kit-specific', () => {
    const banned = /^(@\/lib\/brandkit|@\/components\/admin|@\/lib\/prisma)(\/|$)/
    for (const f of [
      ...walk('src/lib/kitUpgrade/review.ts'),
      ...walk('src/components/textUpgrade'),
    ]) {
      for (const spec of specifiers(readFileSync(join(ROOT, f), 'utf8')))
        expect(spec, f).not.toMatch(banned)
    }
  })
})

describe('AC-16: no composition in the dataset', () => {
  const PLACEMENT = /\b(left|right|top|bottom|band|region|column)s?\b/i
  const archetypeKeys = Object.keys(archetypes)

  it('knows the archetype keys it guards', () => {
    expect(archetypeKeys.sort()).toEqual(['device-screen', 'editorial-split', 'full-bleed-scene', 'product-showcase', 'spotlight'])
  })

  it('no template, default or mockReplacement has a placement word or an archetype key', () => {
    for (const e of entries) {
      for (const text of [
        e.template,
        e.mockReplacement,
        ...Object.keys(e.defaults),
        ...Object.values(e.defaults).map(String),
      ]) {
        expect(text, `${e.key}: ${text}`).not.toMatch(PLACEMENT)
        for (const k of archetypeKeys) expect(text, `${e.key}: ${text}`).not.toContain(k)
      }
    }
  })
})

// 027 NFR-10: the sibling modules are pure too. A type-only `@prisma/client`
// import is erased and allowed (as in aspectRatio.ts); sources.ts and refresh.ts
// are the two prisma files of factsCheck (added by a later task).
describe('027 NFR-10: postStyles and factsCheck stay pure', () => {
  const PRISMA_FILES = new Set(['src/lib/factsCheck/sources.ts', 'src/lib/factsCheck/refresh.ts'])
  const files = [...walk('src/lib/postStyles'), ...walk('src/lib/factsCheck')].filter(
    (f) => !PRISMA_FILES.has(f),
  )

  function runtimeViolations(source: string): string[] {
    const src = stripComments(source)
    const typeOnly = new Set<string>()
    for (const m of src.matchAll(
      /(?:^|[;\n])\s*import\s+type\s+[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
    ))
      typeOnly.add(m[1])
    return purityViolations(source).filter((v) => {
      const spec = v.split(' ').pop()!
      return !(typeOnly.has(spec) && specifiers(source).filter((s) => s === spec).length === 1)
    })
  }

  it('scans the postStyles files', () => {
    expect(files.filter((f) => f.startsWith('src/lib/postStyles/')).length).toBeGreaterThanOrEqual(
      3,
    )
  })

  it('imports no server module at runtime', () => {
    for (const f of files)
      expect(runtimeViolations(readFileSync(join(ROOT, f), 'utf8')), f).toEqual([])
  })

  it('the filter allows a type-only prisma import and flags a runtime one', () => {
    expect(runtimeViolations(`import type { AspectRatio } from '@prisma/client'`)).toEqual([])
    expect(runtimeViolations(`import { PrismaClient } from '@prisma/client'`)).not.toEqual([])
    expect(runtimeViolations(`import { prisma } from '@/lib/prisma'`)).not.toEqual([])
  })

  it('designData never imports postStyles (the edge is one-way)', () => {
    for (const f of walk('src/lib/designData'))
      for (const spec of specifiers(readFileSync(join(ROOT, f), 'utf8')))
        expect(spec, f).not.toMatch(/postStyles/)
  })
})
