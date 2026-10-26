// 025 T9 (FR-16, NFR-05): the canonical document for a stamp, the editor's
// display-only rewrite of the token, the screen the refine prompt names, and the
// guard that no writer stores a URL to the screenshot.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  canonicalCompositeHtml,
  hasScreenshotUrl,
  insertComposite,
  stripComposite,
  withDetectedScreen,
} from '@/lib/composite/insert'
import { COMPOSITE_EDITOR_LABEL, compositePreviewUrl, editorSrcDoc } from '@/lib/composite/editor'
import { COMPOSITE_TOKEN } from '@/lib/composite/render'
import { classicStamp, compositionStampSchema, contractAt } from '@/lib/designData'

const RECT = { x: 17, y: 44, w: 72, h: 45 }
const CANVAS = { width: 1080, height: 1080 }
const KEY = 'screenshots/team1/u1/a.png'
const STAMP = compositionStampSchema.parse({
  requestedArchetype: 'device-screen',
  appliedArchetype: 'device-screen',
  contractVersion: 1,
  imageQuality: 'default',
  composites: [{ region: 0, rect: RECT, source: { kind: 'brief-upload', key: KEY } }],
})
const BASE = '<!doctype html><html><body><p>Hello</p></body></html>'

describe('canonicalCompositeHtml', () => {
  it('a composite stamp gives exactly one canonical element at the stamped rect, with the token', () => {
    const out = canonicalCompositeHtml(BASE, STAMP, CANVAS)
    expect(out).toBe(insertComposite(BASE, RECT, CANVAS))
    expect(out.match(/data-composite="0"/g)).toHaveLength(1)
    expect(out.split(COMPOSITE_TOKEN)).toHaveLength(2)
  })

  it('restores a deleted element, moves a moved one back, and is idempotent', () => {
    const want = insertComposite(BASE, RECT, CANVAS)
    expect(canonicalCompositeHtml(BASE, STAMP, CANVAS)).toBe(want)
    const moved = insertComposite(BASE, { x: 2, y: 2, w: 20, h: 12.5 }, CANVAS)
    expect(canonicalCompositeHtml(moved, STAMP, CANVAS)).toBe(want)
    expect(canonicalCompositeHtml(want, STAMP, CANVAS)).toBe(want)
  })

  it('a classic stamp, a null stamp and a stamp without composites strip any element (and change nothing else)', () => {
    const stray = insertComposite(BASE, RECT, CANVAS)
    for (const stamp of [classicStamp(), null, undefined]) {
      expect(canonicalCompositeHtml(stray, stamp, CANVAS)).toBe(BASE)
      expect(canonicalCompositeHtml(BASE, stamp, CANVAS)).toBe(BASE)
    }
  })

  it('refuses a document that holds a screenshot URL (NFR-05)', () => {
    const preview = `<html><body><img src="${compositePreviewUrl('d1', KEY)}"></body></html>`
    const abs = '<html><body><img src="https://files.example.com/docs/screenshots/team1/u1/a.png"></body></html>'
    expect(() => canonicalCompositeHtml(preview, null, CANVAS)).toThrow(/screenshot URL/)
    expect(() => canonicalCompositeHtml(abs, null, CANVAS)).toThrow(/screenshot URL/)
  })

  it('the editor URL inside the composite element is dropped with the element, not stored', () => {
    const edited = editorSrcDoc(insertComposite(BASE, RECT, CANVAS), 'd1', KEY)
    expect(hasScreenshotUrl(edited)).toBe(true)
    const out = canonicalCompositeHtml(edited, STAMP, CANVAS)
    expect(hasScreenshotUrl(out)).toBe(false)
    expect(out).toBe(insertComposite(BASE, RECT, CANVAS))
  })
})

describe('hasScreenshotUrl', () => {
  it('matches the preview route and an http URL with a screenshots path, and nothing else', () => {
    expect(hasScreenshotUrl('<img src="/api/briefs/screenshots?key=k">')).toBe(true)
    expect(hasScreenshotUrl('<img src="http://minio:9000/docs/screenshots/t/u/a.png">')).toBe(true)
    expect(hasScreenshotUrl(insertComposite(BASE, RECT, CANVAS))).toBe(false)
    expect(hasScreenshotUrl('<p>See our screenshots/ page</p>')).toBe(false)
    expect(hasScreenshotUrl(`<img src="${COMPOSITE_TOKEN}">`)).toBe(false)
  })
})

describe('the editor display', () => {
  it('shows the preview URL for the token, only when the stamp has a key', () => {
    const html = insertComposite(BASE, RECT, CANVAS)
    const shown = editorSrcDoc(html, 'd 1', KEY)
    expect(shown).not.toContain(COMPOSITE_TOKEN)
    expect(shown).toContain(`/api/briefs/screenshots?key=${encodeURIComponent(KEY)}&draftId=d%201`)
    expect(editorSrcDoc(html, 'd1', null)).toBe(html)
    expect(editorSrcDoc(BASE, 'd1', KEY)).toBe(BASE)
  })

  it('the label text is the spec text', () => {
    expect(COMPOSITE_EDITOR_LABEL).toBe('Product screenshot (placed automatically)')
  })
})

describe('what the refine model sees', () => {
  it('stripComposite leaves no element, token or URL', () => {
    const out = stripComposite(insertComposite(BASE, RECT, CANVAS))
    expect(out).toBe(BASE)
  })
})

describe('withDetectedScreen', () => {
  it('moves only the composite region to the stamped rect', () => {
    const size = contractAt('device-screen', 1, 'SQUARE')!
    const moved = withDetectedScreen(size, RECT)
    const screen = moved.regions.find((r) => r.purpose === 'composite')!
    expect(screen.rect).toEqual(RECT)
    expect(moved.regions.filter((r) => r.purpose !== 'composite')).toEqual(
      size.regions.filter((r) => r.purpose !== 'composite'),
    )
    // The dataset itself is untouched.
    expect(size.regions.find((r) => r.purpose === 'composite')!.rect).not.toEqual(RECT)
  })
})

// NFR-05: every place that writes a document into htmlContent or htmlSnapshot is
// known. A new writer must be added here on purpose, with the reason it stores
// only the token.
describe('no writer stores a URL to the screenshot (NFR-05)', () => {
  const WRITERS: Record<string, string> = {
    // Canonicalized by canonicalCompositeHtml, which refuses a screenshot URL.
    'src/lib/drafts/revisions.ts': 'commit, rejected render and restore (a copy of a stored snapshot)',
    // Generation: the design agents return the document the composite engine inserted (token only).
    'src/lib/agent/generateDraft.ts': 'generation writes the design result (token only)',
    // Regenerate design: the same pipeline result.
    'src/app/api/drafts/[id]/regenerate-design/route.ts': 'regenerate writes the design result (token only)',
  }

  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p, out)
      else if (/\.tsx?$/.test(name)) out.push(p)
    }
    return out
  }

  it('the set of files that write a stored document is the known set', () => {
    const root = join(__dirname, '..', '..')
    const writers = walk(join(root, 'src'))
      .filter((f) => /\b(htmlContent|htmlSnapshot)\s*:\s*[A-Za-z_]/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(root, f).split('\\').join('/'))
      // Reads and types, not writers.
      .filter((f) => !/(api-types|\/types|acp\/agent|mcp\/tools|designAgent|api\/drafts\/\[id\]\/route|adopt\/route)/.test(f))
      .filter((f) => !f.includes('refine/route'))
    expect(writers.sort()).toEqual(Object.keys(WRITERS).sort())
  })

  it('every writer that takes a document from a caller goes through the canonical function', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'src/lib/drafts/revisions.ts'), 'utf8')
    expect(src).toContain('canonicalCompositeHtml(args.html, stamp.composition, { width, height })')
  })
})
