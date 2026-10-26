// 031 FR-18 / NFR-09: the catalogue is read by server code only; the browser uses GET /api/fonts.
// An allow-list: only the files named below may import src/lib/fonts/catalogue (or its JSON), by
// alias or by a relative path. Any other importer fails, client or not.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, dirname, normalize, sep, posix } from 'node:path'

const ROOT = process.cwd()
const files = readdirSync(join(ROOT, 'src'), { recursive: true, withFileTypes: true })
  .filter((d) => d.isFile() && /\.(ts|tsx)$/.test(d.name))
  .map((d) => relative(ROOT, join(d.parentPath, d.name)).split(sep).join('/'))

const CATALOGUE = 'src/lib/fonts/catalogue'

// The only server files that import the catalogue.
const ALLOWED = [
  'src/app/api/admin/brandkits/[id]/assistant/apply/route.ts', // the assistant Apply validation (T12)
  'src/app/api/admin/brandkits/[id]/route.ts', // save validation, the snapshot date
  'src/app/api/admin/brandkits/route.ts', // create validation
  'src/app/api/fonts/route.ts', // the picker's search
  'src/lib/brandkit/systemContext.ts', // the font request URL
  'src/lib/fonts/plan.ts', // the post font plan
  'src/mcp/tools/brandkit.ts', // MCP create_brand_kit validation
]

/** Repo-relative path (no extension) of every module a file imports. */
function importTargets(file: string, src: string): string[] {
  const out: string[] = []
  const re = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const spec = m[1]
    if (spec.startsWith('@/')) out.push('src/' + spec.slice(2))
    else if (spec.startsWith('.')) out.push(normalize(posix.join(dirname(file), spec)).split(sep).join('/'))
  }
  return out.map((t) => t.replace(/\.(json|ts|tsx)$/, ''))
}

describe('font catalogue boundary', () => {
  it('only the named server files import the catalogue module or its JSON', () => {
    const importers = files.filter((f) => {
      if (f === CATALOGUE + '.ts') return false
      return importTargets(f, readFileSync(join(ROOT, f), 'utf8')).includes(CATALOGUE)
    })
    expect(importers.sort()).toEqual([...ALLOWED].sort())
  })
  it('no allowed file is a client file', () => {
    const client = ALLOWED.filter((f) => /^\s*['"]use client['"]/m.test(readFileSync(join(ROOT, f), 'utf8')))
    expect(client).toEqual([])
  })
  it('the client-safe index does not re-export the catalogue', () => {
    const idx = readFileSync(join(ROOT, 'src/lib/fonts/index.ts'), 'utf8')
    expect(idx.replace(/\/\/[^\n]*/g, '')).not.toMatch(/catalogue/)
  })
})
