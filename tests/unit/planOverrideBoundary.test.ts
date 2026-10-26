// 031 FR-48 / AC-43: only the super-admin look probe may plan a contract version other than the
// look's `current`. A call to planComposition in src/ whose arguments name `version` is allowed
// only in src/app/api/admin/look-probe/route.ts.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()
const ALLOWED = 'src/app/api/admin/look-probe/route.ts'
const DEFINITION = 'src/lib/designData/plan.ts'

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

// The text of every `planComposition(...)` call's argument list (balanced parentheses).
function callArguments(source: string): string[] {
  const out: string[] = []
  const src = stripComments(source)
  for (const m of src.matchAll(/\bplanComposition\s*\(/g)) {
    let depth = 1
    let i = (m.index ?? 0) + m[0].length
    const start = i
    while (i < src.length && depth > 0) {
      if (src[i] === '(') depth++
      else if (src[i] === ')') depth--
      i++
    }
    out.push(src.slice(start, i - 1))
  }
  return out
}

const files = readdirSync(join(ROOT, 'src'), { recursive: true, withFileTypes: true })
  .filter((d) => d.isFile() && /\.(ts|tsx)$/.test(d.name))
  .map((d) => relative(ROOT, join(d.parentPath, d.name)).split(sep).join('/'))

describe('planComposition version override boundary (031 FR-48)', () => {
  it('the scanner finds the known callers (so a silent zero cannot pass)', () => {
    const callers = files.filter((f) => f !== DEFINITION && callArguments(readFileSync(join(ROOT, f), 'utf8')).length > 0)
    expect(callers).toContain(ALLOWED)
    expect(callers).toContain('src/lib/agent/pathB.ts')
  })

  it('no file in src/ passes a version to planComposition except the look probe route', () => {
    const offenders = files.filter(
      (f) =>
        f !== DEFINITION &&
        f !== ALLOWED &&
        callArguments(readFileSync(join(ROOT, f), 'utf8')).some((a) => /\bversion\b/.test(a)),
    )
    expect(offenders).toEqual([])
  })

  it('the probe route does pass one, and no caller passes a third argument', () => {
    const route = callArguments(readFileSync(join(ROOT, ALLOWED), 'utf8'))
    expect(route.some((a) => /\bversion\b/.test(a))).toBe(true)
    for (const f of files) {
      if (f === DEFINITION || f === ALLOWED) continue
      for (const a of callArguments(readFileSync(join(ROOT, f), 'utf8'))) {
        expect(a.replace(/\{[^{}]*\}/g, '{}').split(',').length, f).toBeLessThanOrEqual(1)
      }
    }
  })
})
