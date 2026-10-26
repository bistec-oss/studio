import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// 030 AC-03: the writer guard. Every Prisma write on Draft or DraftRevision whose
// data holds the design HTML (htmlContent, htmlSnapshot) must carry the render
// stamp, so a later writer cannot forget the rendered-text stamp. The behavioural
// half (AC-04, one case per FR-04 row) lives next to each writer's fakes:
//   generation, sync and async, and regenerate design  -> renderStamps.test.ts
//   commit (refine-like, inline-edit-like), null headline, rejected render,
//   adopt, restore                                      -> draftRevisions.test.ts
//   the export route (renders, stamps nothing)          -> compositeRerender.test.ts

const SRC = join(__dirname, '..', '..', 'src')

// The only files allowed to write the HTML of a draft or a revision.
const ALLOWED = [
  'src/lib/agent/generateDraft.ts',
  'src/app/api/drafts/[id]/regenerate-design/route.ts',
  'src/lib/drafts/revisions.ts',
]

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

// The text of a call's balanced parentheses, starting at the "(" index.
function callArgs(text: string, open: number): string {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')' && --depth === 0) return text.slice(open, i + 1)
  }
  return text.slice(open)
}

// The index of the "{" that encloses `at`, or -1 at top level.
function enclosingBrace(text: string, at: number): number {
  let depth = 0
  for (let i = at; i >= 0; i--) {
    if (text[i] === '}') depth++
    else if (text[i] === '{' && depth-- === 0) return i
  }
  return -1
}

// The index of the "}" that closes the "{" at `open`.
function matchingBrace(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}' && --depth === 0) return i
  }
  return text.length - 1
}

interface Write {
  file: string
  model: string
  args: string
}

function htmlWrites(): Write[] {
  const writes: Write[] = []
  const call = /\b(draft|draftRevision)\.(create|update|updateMany|upsert)\(/g
  for (const abs of walk(SRC)) {
    const text = readFileSync(abs, 'utf8')
    const file = relative(join(SRC, '..'), abs).split(sep).join('/')
    for (const m of text.matchAll(call)) {
      const args = callArgs(text, m.index! + m[0].length - 1)
      // htmlContent / htmlSnapshot as a key (`htmlContent:`) or shorthand (`htmlContent,`).
      if (/\b(htmlContent|htmlSnapshot)\b\s*[:,}\n]/.test(args)) writes.push({ file, model: m[1], args })
    }
  }
  return writes
}

describe('030 AC-03: every HTML writer carries the render stamp', () => {
  const writes = htmlWrites()

  it('finds the known writers (the scan is not vacuous)', () => {
    expect(new Set(writes.map((w) => w.file))).toEqual(new Set(ALLOWED))
  })

  it('no file outside the list writes the HTML of a draft or a revision', () => {
    const outside = writes.filter((w) => !ALLOWED.includes(w.file)).map((w) => w.file)
    expect([...new Set(outside)], 'a new HTML writer must stamp renderedText: add it to ALLOWED and spread the stamp fields').toEqual([])
  })

  it('every such write spreads draftStampFields( or revisionStampFields(', () => {
    for (const w of writes.filter((x) => ALLOWED.includes(x.file))) {
      const want = w.model === 'draft' ? 'draftStampFields(' : 'revisionStampFields('
      // restoreDraftToRevision and the commit's `data` object spread the helper
      // outside the call parentheses; accept the helper anywhere in the file when
      // the call's data is a variable, but a literal data object must spread it.
      const literal = /\bdata\s*:\s*\{/.test(w.args)
      if (literal) expect(w.args, `${w.file}: ${w.model} write`).toContain(want)
    }
  })

  // T3 review WARN: the call scan above cannot see a write whose data is built
  // in a variable (the commit's `const data = {…}`). So, in the allowed files,
  // every object literal with an htmlContent / htmlSnapshot key must spread a
  // stamp helper inside that same literal. The one other literal shape is the
  // ProducedDesign value, which carries `stamp: currentRenderStamp(…)` that its
  // writer spreads. Type declarations and parameters are skipped.
  it('every object literal holding the HTML in an allowed file spreads a stamp helper', () => {
    const key = /\b(htmlContent|htmlSnapshot)\s*:\s*(?!string\b)/g
    let checked = 0
    for (const file of ALLOWED) {
      const text = readFileSync(join(SRC, '..', file), 'utf8')
      for (const m of text.matchAll(key)) {
        const open = enclosingBrace(text, m.index!)
        if (open < 0) continue
        if (/\b(interface\s+\w+(<[^>]*>)?(\s+extends\s+[\w.<>, ]+)?|type\s+\w+\s*=)\s*$/.test(text.slice(Math.max(0, open - 120), open))) continue
        const literal = text.slice(open, matchingBrace(text, open) + 1)
        checked++
        const line = text.slice(0, m.index!).split('\n').length
        expect(
          /\.\.\.(draftStampFields|revisionStampFields)\(/.test(literal) || /\bstamp:\s*currentRenderStamp\(/.test(literal),
          `${file}:${line}: an object holding ${m[1]} spreads no stamp helper`,
        ).toBe(true)
      }
    }
    expect(checked).toBeGreaterThanOrEqual(8)
  })

  it('each allowed file spreads the stamp fields for both models it writes', () => {
    for (const file of ALLOWED) {
      const text = readFileSync(join(SRC, '..', file), 'utf8')
      expect(text, file).toMatch(/draftStampFields\(|revisionStampFields\(/)
    }
    const revisions = readFileSync(join(SRC, 'lib/drafts/revisions.ts'), 'utf8')
    expect(revisions).toContain('...draftStampFields(')
    expect(revisions).toContain('...revisionStampFields(')
  })
})
