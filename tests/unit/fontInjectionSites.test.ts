// 031 AC-20 (FR-22): the three places model output becomes stored design HTML call
// applyPostFonts before the write, and nothing else does. The 030 writer-guard pattern: a source
// scan, so removing a call (or adding a caller without listing it here) fails this test. The
// behaviour of the call is unit-tested in applyPostFonts.test.ts and through the real renderer in
// tests/render/postFonts.test.ts.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = join(__dirname, '..', '..')
const SRC = join(ROOT, 'src')

// Path A (the filled template), Path B (the agent's HTML; it also serves regenerate design) and
// refine (the refined document, before commitDraftRevision).
const SITES = ['src/lib/agent/pathA.ts', 'src/lib/agent/pathB.ts', 'src/app/api/drafts/[id]/refine/route.ts']

// Inline edit, restore and export keep the stored CSS (FR-22); they must never inject.
const NEVER = [
  'src/app/api/drafts/[id]/revisions/[rev]/restore/route.ts',
  'src/app/api/generate/export/route.ts',
  'src/lib/drafts/revisions.ts',
  'src/lib/drafts/inlineEdit.ts',
]

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

const read = (file: string) => readFileSync(join(ROOT, file), 'utf8')
const calls = (text: string) => (text.match(/\bapplyPostFonts\(/g) ?? []).length

describe('031 AC-20: the font injection call sites', () => {
  it.each(SITES)('%s calls applyPostFonts( with the kit plan', (file) => {
    const text = read(file)
    expect(calls(text), `${file} lost its applyPostFonts( call`).toBeGreaterThanOrEqual(1)
    expect(text).toContain('postFontPlan(')
    expect(text).toContain('postFontsUrl')
  })

  it('Path A and Path B inject through the design runner post-process, before every render and upload', () => {
    const a = read('src/lib/agent/pathA.ts')
    expect(a).toMatch(/const postProcess = \(html: string\) => applyPostFonts\(html, fontPlan, postFontsUrl\)/)
    expect((a.match(/\bpostProcess,/g) ?? []).length).toBe(2) // the CLI and the API runner
    const b = read('src/lib/agent/pathB.ts')
    expect(b).toMatch(/const withFonts = \(h: string\) => applyPostFonts\(h, fontPlan, postFontsUrl\)/)
    expect(b).toContain('withFonts(insertComposite(')
    expect(b).toContain('{ postProcess: withFonts }')
  })

  it('refine injects into the committed document, the rejected render and the withheld conflict HTML', () => {
    const r = read('src/app/api/drafts/[id]/refine/route.ts')
    expect(r).toContain('html: applyPostFonts(html, fontPlan, postFontsUrl)')
    expect(r).toMatch(/applyPostFonts\(notApplied\.html, fontPlan, postFontsUrl\)/)
    expect(r).toMatch(/pendingHtml: applyPostFonts\(\s*restoreInlineAssets\(/)
    // Before the commit: the injected html is what commitDraftRevision receives.
    const commit = r.indexOf('await commitDraftRevision({')
    expect(r.slice(commit, commit + 200)).toContain('applyPostFonts(')
  })

  it('no other file under src calls applyPostFonts (inline edit, Apply, restore and export keep the stored CSS)', () => {
    const callers = walk(SRC)
      .map((abs) => relative(ROOT, abs).split(sep).join('/'))
      .filter((file) => file !== 'src/lib/fonts/inject.ts' && calls(read(file)) > 0)
    expect(callers.sort()).toEqual([...SITES].sort())
    for (const file of NEVER) {
      try {
        expect(calls(read(file)), file).toBe(0)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      }
    }
  })
})
