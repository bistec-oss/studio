// T14 — the DomFacts extractor's pure parts: inline-asset token tagging and
// mapping (so facts name images the way the refine model saw them), and the
// deterministic MOCK_PUPPETEER fallback. The real-Chromium path is covered by
// tests/render/dom-facts.test.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ mockPuppeteer: true, evaluate: vi.fn() }))

vi.mock('@/lib/testHooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/testHooks')>()
  return {
    ...actual,
    get MOCK_PUPPETEER() {
      return h.mockPuppeteer
    },
  }
})
vi.mock('@/lib/renderer/puppeteer', () => ({ evaluateInRenderedPage: h.evaluate }))

const { extractDomFacts, tagInlineAssets, modelFacingSource, staticDomFacts } = await import('@/lib/renderer/domFacts')
const { checkPostConditions } = await import('@/lib/agent/instructionClasses')

const PNG_A = 'data:image/png;base64,AAAA'
const PNG_B = 'data:image/png;base64,BBBB'

beforeEach(() => {
  h.mockPuppeteer = true
  h.evaluate.mockReset()
})

describe('inline-asset tokens', () => {
  it('restores each token as its data URI tagged with a #token fragment', () => {
    const html = `<img src="__INLINE_ASSET_0__"><div style="background:url(__INLINE_ASSET_1__)"></div>`
    expect(tagInlineAssets(html, { __INLINE_ASSET_0__: PNG_A, __INLINE_ASSET_1__: PNG_B })).toBe(
      `<img src="${PNG_A}#__INLINE_ASSET_0__"><div style="background:url(${PNG_B}#__INLINE_ASSET_1__)"></div>`,
    )
  })

  it('keeps two tokens for the same bytes distinct', () => {
    const html = `<img src="__INLINE_ASSET_0__"><img src="__INLINE_ASSET_1__">`
    const tagged = tagInlineAssets(html, { __INLINE_ASSET_0__: PNG_A, __INLINE_ASSET_1__: PNG_A })
    expect(tagged).toContain(`${PNG_A}#__INLINE_ASSET_0__`)
    expect(tagged).toContain(`${PNG_A}#__INLINE_ASSET_1__`)
  })

  it('does not let __INLINE_ASSET_1__ clobber __INLINE_ASSET_10__', () => {
    const assets: Record<string, string> = {}
    for (let i = 0; i <= 10; i++) assets[`__INLINE_ASSET_${i}__`] = `data:image/png;base64,X${i}`
    const tagged = tagInlineAssets(`<img src="__INLINE_ASSET_10__">`, assets)
    expect(tagged).toBe(`<img src="data:image/png;base64,X10#__INLINE_ASSET_10__">`)
  })

  it('maps a tagged source back to its token and leaves everything else alone', () => {
    const assets = { __INLINE_ASSET_0__: PNG_A }
    expect(modelFacingSource(`${PNG_A}#__INLINE_ASSET_0__`, assets)).toBe('__INLINE_ASSET_0__')
    expect(modelFacingSource('https://x.example/a.png', assets)).toBe('https://x.example/a.png')
    expect(modelFacingSource(PNG_B, assets)).toBe(PNG_B) // a data URI the model wrote itself
    expect(modelFacingSource(`${PNG_B}#__INLINE_ASSET_7__`, assets)).toBe(`${PNG_B}#__INLINE_ASSET_7__`) // unknown token
  })
})

describe('extractDomFacts', () => {
  it('under MOCK_PUPPETEER never touches the renderer and is deterministic', async () => {
    const html = '<!DOCTYPE html><html><body><h1>Hello</h1></body></html>'
    const a = await extractDomFacts(html)
    const b = await extractDomFacts(html)
    expect(a).toEqual(b)
    expect(h.evaluate).not.toHaveBeenCalled()
  })

  it('renders the token-tagged document and reports sources by token', async () => {
    h.mockPuppeteer = false
    h.evaluate.mockImplementation(async (html: string, w: number, hgt: number, fn: (page: unknown) => unknown) => {
      expect(html).toContain(`${PNG_A}#__INLINE_ASSET_0__`)
      expect([w, hgt]).toEqual([1080, 1350])
      expect(typeof fn).toBe('function')
      return {
        text: 'Hi',
        imageSources: [`${PNG_A}#__INLINE_ASSET_0__`, 'https://x.example/a.png'],
        elementCount: 2,
        elements: [
          { tag: 'div', id: null, classes: ['bg'], text: '', imageSources: [`${PNG_A}#__INLINE_ASSET_0__`], fontSizePx: 16, box: null, style: null },
        ],
      }
    })
    const f = await extractDomFacts(`<div class="bg" style="background:url(__INLINE_ASSET_0__)"></div>`, {
      width: 1080,
      height: 1350,
      inlineAssets: { __INLINE_ASSET_0__: PNG_A },
    })
    expect(f.imageSources).toEqual(['__INLINE_ASSET_0__', 'https://x.example/a.png'])
    expect(f.elements[0].imageSources).toEqual(['__INLINE_ASSET_0__'])
  })
})

describe('staticDomFacts (the MOCK_PUPPETEER fallback)', () => {
  const html = `<!DOCTYPE html><html><head>
<style>@import url('https://fonts.googleapis.com/css2?family=Inter'); @font-face { font-family: X; src: url(x.woff2) }
.bg { background-image: url('__INLINE_ASSET_0__'); }</style></head>
<body><div class="bg"></div><h1 id="headline">Summer &amp; Sale</h1><!-- a comment -->
<p>Limited seats</p><img src="https://minio.example.com/a.png"><script>var x = "<b>no</b>"</script></body></html>`

  it('reads text, image sources in document order and counts body elements', () => {
    const f = staticDomFacts(html)
    expect(f.text).toBe('Summer & Sale Limited seats')
    expect(f.imageSources).toEqual(['__INLINE_ASSET_0__', 'https://minio.example.com/a.png'])
    expect(f.elementCount).toBe(4)
    expect(f.elements).toHaveLength(1)
    expect(f.elements[0]).toMatchObject({ tag: 'body', text: f.text, imageSources: f.imageSources, fontSizePx: null, box: null, style: null })
  })

  it('keeps replace-by-URL and remove-by-phrase meaningful in mock flows', () => {
    const before = staticDomFacts(html)
    const swapped = staticDomFacts(html.replace('__INLINE_ASSET_0__', 'https://minio.example.com/new.png'))
    const r1 = checkPostConditions({ before, after: swapped, supersedes: ['__INLINE_ASSET_0__'], constrains: [], classes: ['replace'] })
    expect(r1[0].result).toEqual({ ok: true })
    const r2 = checkPostConditions({ before, after: before, supersedes: ['__INLINE_ASSET_0__'], constrains: [], classes: ['replace'] })
    expect(r2[0].result.ok).toBe(false)
  })

  it('returns empty facts for an empty document', () => {
    expect(staticDomFacts('')).toEqual({ text: '', imageSources: [], elementCount: 0, elements: [] })
  })
})
