import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

// 008 FR-15 / AC-11: src/lib/models/catalogue.ts is the ONLY file under src/
// that may name a model. Every other .ts/.tsx file reaches a model through a
// ResolvedModel (NFR-03), so a literal anywhere else is a call site that went
// around the resolver — the bug class 008 closes.
//
// Two patterns, both case-insensitive:
//   1. a model ID: `claude-` + a family name + any ID tail
//      (`claude-sonnet-4-6`, `claude-haiku-4-5-20251001`, `us.anthropic.claude-opus-5-5:1`).
//      Requiring a family name right after `claude-` is what keeps
//      `claude-token`, `claude-html`, `claude-cli` and `claude-guide` clean.
//   2. a bare family alias as a whole quoted string (`'haiku'`, `"Opus"`,
//      `` `Sonnet` ``) — the CLI aliases the old string path passed. ALL-CAPS
//      is exempt: `'HAIKU'` / `'SONNET'` / `'OPUS'` are catalogue KEYS (the
//      ModelKey union and the Prisma enum), which are the sanctioned way to
//      name a choice outside the catalogue; they never reach a boundary.
//
// Comment lines (`//`, `/*`, `*`) are skipped, so prose may still say which
// model a step used to run. A trailing comment on a code line is scanned with
// the code — move the literal or the comment, not the guard.

const ROOT = process.cwd()
const SRC = resolve(ROOT, 'src')
const ALLOWED = new Set(['src/lib/models/catalogue.ts'])

const FAMILIES = 'haiku|sonnet|opus|fable|mythos'
const MODEL_ID = new RegExp(`claude-(?:${FAMILIES})[\\w.-]*`, 'i')
const BARE_ALIAS = new RegExp(`(['"\`])(${FAMILIES})\\1`, 'gi')

interface Hit {
  line: number
  match: string
  text: string
}

export function findModelLiterals(source: string): Hit[] {
  const hits: Hit[] = []
  source.split(/\r?\n/).forEach((text, i) => {
    const t = text.trimStart()
    if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) return
    const id = MODEL_ID.exec(text)
    if (id) hits.push({ line: i + 1, match: id[0], text: text.trim() })
    for (const m of text.matchAll(BARE_ALIAS)) {
      if (m[2] === m[2].toUpperCase()) continue // a catalogue key, not an alias
      hits.push({ line: i + 1, match: m[0], text: text.trim() })
    }
  })
  return hits
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return sourceFiles(p)
    return /\.(ts|tsx)$/.test(e.name) ? [p] : []
  })
}

describe('AC-11: no model literal outside src/lib/models/catalogue.ts', () => {
  it('src/ is clean', () => {
    const files = sourceFiles(SRC)
    expect(files.length).toBeGreaterThan(100)
    const violations = files.flatMap((file) => {
      const rel = relative(ROOT, file).replace(/\\/g, '/')
      if (ALLOWED.has(rel)) return []
      return findModelLiterals(readFileSync(file, 'utf8')).map((h) => `${rel}:${h.line}: ${h.match} — ${h.text}`)
    })
    expect(violations).toEqual([])
  })

  it('the catalogue itself holds the literals (so the allow-list is not vacuous)', () => {
    const catalogue = readFileSync(resolve(ROOT, 'src/lib/models/catalogue.ts'), 'utf8')
    expect(findModelLiterals(catalogue).length).toBeGreaterThan(0)
  })
})

describe('AC-11: the guard itself (fixture self-test)', () => {
  it('flags a planted model ID and each quoted alias form', () => {
    const fixture = [
      `const a = 'claude-sonnet-4-6'`,
      `const b = "opus"`,
      'const c = `Haiku`',
      `const d = { model: 'claude-haiku-4-5-20251001' }`,
      `const e = "us.anthropic.claude-opus-5-5:1"`,
      `const f = 'fable'`,
      `const g = run({ model: 'sonnet' }) // a trailing comment does not hide it`,
    ].join('\n')
    expect(findModelLiterals(fixture).map((h) => [h.line, h.match])).toEqual([
      [1, 'claude-sonnet-4-6'],
      [2, '"opus"'],
      [3, '`Haiku`'],
      [4, 'claude-haiku-4-5-20251001'],
      [5, 'claude-opus-5-5'],
      [6, "'fable'"],
      [7, "'sonnet'"],
    ])
  })

  it('does not flag the non-model claude- strings, catalogue keys, prose words or comment lines', () => {
    const fixture = [
      `const a = 'claude-token'`,
      `const b = "claude-html"`,
      `const c = 'claude-cli'`,
      `const d = 'claude-guide-tab'`,
      `const e: ModelKey = 'HAIKU'`,
      `const f = ['SONNET', "OPUS"]`,
      `const g = 'Opus requires a personal token'`,
      `const h = haikuCount + sonnetCount`,
      `// the verifier used to run 'claude-haiku-4-5-20251001' and 'haiku'`,
      `/* "sonnet" */`,
      ` * claude-opus-5-5 in a JSDoc line`,
    ].join('\n')
    expect(findModelLiterals(fixture)).toEqual([])
  })
})
