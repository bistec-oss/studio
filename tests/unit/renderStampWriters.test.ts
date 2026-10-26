import { describe, it, expect, vi } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { Prisma } from '@prisma/client'

// 031 FR-24 / AC-23 (the writer-guard half): the render note travels through RenderStamp exactly
// as 030's renderedText does. 030's own guard (renderedTextWriters.test.ts) keeps checking that
// every HTML writer spreads draftStampFields( / revisionStampFields(; this file checks that those
// helpers and every stamp builder carry renderNotes, so no writer can drop it. The behavioural
// half (one case per writer) is in renderStamps.test.ts (generation, regenerate design) and
// draftRevisions.test.ts (commit, rejected render, adopt, restore).

vi.mock('@/lib/renderer/fontSet', () => ({ getFontSetId: () => 'fonts-test' }))

import {
  currentRenderStamp,
  draftStampFields,
  renderNotesColumn,
  restoredRenderStamp,
  revisionStampFields,
} from '@/lib/drafts/revisions'

const ROOT = join(__dirname, '..', '..')
const SRC = join(ROOT, 'src')
const REVISIONS = readFileSync(join(SRC, 'lib/drafts/revisions.ts'), 'utf8')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

// The top-level comma-separated arguments of the call whose "(" is at `open`.
function topLevelArgs(text: string, open: number): string[] {
  const args: string[] = []
  let depth = 0
  let from = open + 1
  for (let i = open; i < text.length; i++) {
    const c = text[i]
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') {
      depth--
      if (depth === 0) {
        args.push(text.slice(from, i))
        break
      }
    } else if (c === ',' && depth === 1) {
      args.push(text.slice(from, i))
      from = i + 1
    }
  }
  return args.map((a) => a.replace(/\/\/[^\n]*/g, '').trim()).filter((a) => a !== '')
}

interface Call {
  file: string
  line: number
  args: string[]
}

function stampCalls(): Call[] {
  const calls: Call[] = []
  for (const abs of walk(SRC)) {
    const text = readFileSync(abs, 'utf8')
    const file = relative(ROOT, abs).split(sep).join('/')
    for (const m of text.matchAll(/\bcurrentRenderStamp\(/g)) {
      const before = text.slice(Math.max(0, m.index! - 20), m.index!)
      if (/function\s+$/.test(before)) continue
      const open = m.index! + m[0].length - 1
      calls.push({ file, line: text.slice(0, m.index!).split('\n').length, args: topLevelArgs(text, open) })
    }
  }
  return calls
}

describe('031: the render note in the stamp', () => {
  const calls = stampCalls()

  it('finds the known currentRenderStamp callers (the scan is not vacuous)', () => {
    expect(new Set(calls.map((c) => c.file))).toEqual(
      new Set([
        'src/lib/drafts/revisions.ts',
        'src/lib/agent/generateDraft.ts',
        'src/app/api/drafts/[id]/regenerate-design/route.ts',
      ]),
    )
    expect(calls.length).toBeGreaterThanOrEqual(6)
  })

  it('every currentRenderStamp call passes the fifth argument, renderNotes', () => {
    for (const c of calls) expect(c.args, `${c.file}:${c.line}`).toHaveLength(5)
  })

  it('a call that stamps a render’s headline check also stamps the same render’s font check', () => {
    for (const c of calls) {
      if (!/\.headlineCheck\b/.test(c.args[3])) continue
      expect(c.args[4], `${c.file}:${c.line}`).toMatch(/^renderNotesFrom\(\w+\.fontsMissing\)$/)
    }
  })

  it('currentRenderStamp requires the argument (five parameters, no default)', () => {
    expect(currentRenderStamp.length).toBe(5)
    expect(REVISIONS).toMatch(/renderedText: RenderedText \| null,\s+renderNotes: RenderNotes \| null,\s+\): RenderStamp/)
  })

  it('RenderStamp declares the field, and every stamp builder in revisions.ts carries it', () => {
    expect(REVISIONS).toMatch(/renderedText: RenderedText \| null\s+renderNotes: RenderNotes \| null\s+\}/)
    // restoredRenderStamp and rejectedRenderStamp read the row's own value, as for renderedText.
    const readers = (REVISIONS.match(/renderedText: parseRenderedText\(/g) ?? []).length
    expect(readers).toBeGreaterThanOrEqual(2)
    expect((REVISIONS.match(/renderNotes: parseRenderNotes\(/g) ?? []).length).toBe(readers)
    // The adopt read selects the column.
    expect(REVISIONS).toMatch(/renderedText: true,\s+renderNotes: true,/)
  })

  it('revisionStampFields and draftStampFields write renderNotes as a validated column', () => {
    const notes = { fontsMissing: ['Noto Sans Sinhala'] }
    const stamp = currentRenderStamp(null, null, null, null, notes)
    expect(revisionStampFields(stamp).renderNotes).toEqual(notes)
    expect(draftStampFields(stamp).renderNotes).toEqual(notes)
    const none = currentRenderStamp(null, null, null, null, null)
    expect(revisionStampFields(none).renderNotes).toBe(Prisma.DbNull)
    expect(draftStampFields(none).renderNotes).toBe(Prisma.DbNull)
  })

  it('the column writer refuses a malformed note (a bad stamp fails loudly, never in a row)', () => {
    expect(() => renderNotesColumn({ fontsMissing: [] })).toThrow()
    expect(() => renderNotesColumn({ fontsMissing: [''] })).toThrow()
    expect(() => renderNotesColumn({ fontsMissing: ['A'], extra: 1 } as never)).toThrow()
  })

  it('restoredRenderStamp carries the row’s own note', () => {
    const notes = { fontsMissing: ['Abhaya Libre'] }
    expect(restoredRenderStamp({ renderNotes: notes }, false, null).renderNotes).toEqual(notes)
    expect(restoredRenderStamp({ renderNotes: 'junk' }, false, null).renderNotes).toBeNull()
  })
})
