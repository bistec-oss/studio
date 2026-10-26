import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

// 031 FR-06: the words guard (DESIGN_SYSTEM.md §12). It scans the string
// literals and JSX text of src/app/(app)/** and src/components/** for terms the
// glossary retires. Comments are removed first. A line opts out only with
// `wording-exception: <reason>` (in a `//` comment, or in the JSX form
// `{/* wording-exception: <reason> */}`), and the reason names the code value
// that is shown verbatim.

const ROOT = process.cwd()
const SCOPES = [resolve(ROOT, 'src/app/(app)'), resolve(ROOT, 'src/components')]

// One list, so a later task adds a pattern in one place (T5 added `OpenAI key`).
export const WORDING_PATTERNS: Array<[string, RegExp]> = [
  ['Path A', /\bPath A\b/],
  ['Path B', /\bPath B\b/],
  ['Brand Kit', /\bBrand Kits?\b/],
  ['Brandkits', /\bBrandkits\b/],
  ['Brand-kit', /\bBrand-kit\b/],
  ['copy provider', /\bcopy provider\b/i],
  ['COPY provider', /\bCOPY provider\b/],
  ['colour', /\bcolours?\b/],
  ['Organise', /\bOrganise\b/],
  ['New Brief', /\bNew Brief\b/],
  ['OpenAI key', /\bOpenAI key\b/],
]

const EXCEPTION = 'wording-exception:'
const BACKSLASH = String.fromCharCode(92)

// Removes comments from one file's text, keeping line structure. `//` counts
// only outside a string literal; `/* ... */` may span lines. A comment that
// carries the exception marker leaves a short marker behind, so its line opts
// out.
export function stripComments(text: string): string {
  let out = ''
  let i = 0
  let quote: string | null = null
  while (i < text.length) {
    const c = text[i]
    const n = text[i + 1]
    if (quote) {
      out += c
      if (c === BACKSLASH) {
        out += n ?? ''
        i += 2
        continue
      }
      if (c === quote || (quote !== '`' && c === '\n')) quote = null
      i++
      continue
    }
    if (c === '/' && n === '/') {
      const end = text.indexOf('\n', i)
      const stop = end === -1 ? text.length : end
      if (text.slice(i, stop).includes(EXCEPTION)) out += ` /*${EXCEPTION}*/`
      i = stop
      continue
    }
    if (c === '/' && n === '*') {
      const end = text.indexOf('*/', i + 2)
      const stop = end === -1 ? text.length : end + 2
      const body = text.slice(i, stop)
      if (body.includes(EXCEPTION)) out += ` /*${EXCEPTION}*/`
      out += body.replace(/[^\n]/g, '')
      i = stop
      continue
    }
    if (c === '"' || c === "'" || c === '`') quote = c
    out += c
    i++
  }
  return out
}

const STRING_RE = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\$]|\\.|\$(?!\{))*`/g
const JSX_TEXT_RE = />([^<>{}\n]+)</g
// JSX text that wraps over several lines: a whole line with no code
// punctuation is read as text.
const BARE_TEXT_RE = /^[^<>{}=;()]*[A-Za-z][^<>{}=;()]*$/

function candidates(line: string): string[] {
  const bare = line.trim()
  return [
    ...(line.match(STRING_RE) ?? []),
    ...Array.from(line.matchAll(JSX_TEXT_RE), (m) => m[1]),
    ...(BARE_TEXT_RE.test(bare) ? [bare] : []),
  ]
}

export function findWordingViolations(file: string, text: string): string[] {
  const hits: string[] = []
  stripComments(text)
    .split(/\r?\n/)
    .forEach((line, i) => {
      if (line.includes(EXCEPTION)) return
      for (const piece of candidates(line)) {
        for (const [label, re] of WORDING_PATTERNS) {
          const m = piece.match(re)
          if (m) hits.push(`${file}:${i + 1}: ${m[0]} (${label})`)
        }
      }
    })
  return hits
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : []
  })
}

describe('UI wording guard (031 FR-06)', () => {
  const files = SCOPES.flatMap(sourceFiles)

  it('scans the UI source tree', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('finds no retired term in UI strings or JSX text', () => {
    const hits = files.flatMap((f) =>
      findWordingViolations(relative(ROOT, f).split(BACKSLASH).join('/'), readFileSync(f, 'utf8'))
    )
    expect(hits, hits.join('\n')).toEqual([])
  })

  it('flags each pattern in a string or in JSX text', () => {
    const samples: Record<string, string> = {
      'Path A': "const a = 'Path A - Template'",
      'Path B': '<span>Path B</span>',
      'Brand Kit': 'const a = "Brand Kit"',
      Brandkits: "const a = 'Brandkits'",
      'Brand-kit': 'const a = `Brand-kit assistant`',
      'copy provider': "const a = 'No Copy Provider here'",
      'COPY provider': "const a = 'add a COPY provider'",
      colour: '<label>Text colour</label>',
      Organise: "const a = 'Organise your work'",
      'New Brief': '<h1>New Brief</h1>',
      'OpenAI key': '<p>Connect your OpenAI key</p>',
    }
    for (const [label] of WORDING_PATTERNS) {
      const hits = findWordingViolations('x.tsx', samples[label])
      expect(hits.some((h) => h.includes(`(${label})`)), label).toBe(true)
    }
  })

  it('ignores comments of every form', () => {
    const text = [
      '// Path A and Path B in a line comment',
      '/* Brand Kit in a block comment */',
      '/*',
      ' * colour over two lines',
      ' */',
      '{/* Organise in a JSX comment */}',
      'const ok = 1 // New Brief trailing',
    ].join('\n')
    expect(findWordingViolations('x.tsx', text)).toEqual([])
  })

  it('does not treat a URL in a string as a comment', () => {
    expect(findWordingViolations('x.tsx', "const a = 'http://x.test/Path A'")).toHaveLength(1)
  })

  it('honours wording-exception in both comment forms', () => {
    const text = [
      "const a = 'Path A' // wording-exception: shows the stored designMode value",
      '<p>Brand Kit{/* wording-exception: verbatim */}</p>',
    ].join('\n')
    expect(findWordingViolations('x.tsx', text)).toEqual([])
  })

  it('flags text on a wrapped JSX line', () => {
    const text = ['<p>', '  Add one under Admin, or switch to Path B.', '</p>'].join('\n')
    expect(findWordingViolations('x.tsx', text)).toHaveLength(1)
  })

  it('reports the line number', () => {
    const hits = findWordingViolations('x.tsx', "const a = 1\nconst b = 'colour'")
    expect(hits[0]).toMatch(/^x\.tsx:2: colour/)
  })
})
