import { describe, it, expect } from 'vitest'
import { extractInlineAssets, restoreInlineAssets, missingTokens, reconcileInlineAssets } from '@/lib/agent/inlineAssets'

// A few fake base64 payloads, long enough that extraction visibly shrinks the HTML.
const PNG_A = `data:image/png;base64,${'A'.repeat(5000)}`
const PNG_B = `data:image/png;base64,${'B'.repeat(4000)}==`
const SVG_C = `data:image/svg+xml;base64,${'C'.repeat(3000)}`

const HTML_WITH_ASSETS = `<!DOCTYPE html>
<html>
<head><style>
.hero { background-image: url('${PNG_A}'); }
.badge { background: url(${SVG_C}) no-repeat; }
</style></head>
<body>
  <img src="${PNG_B}" alt="logo" />
  <div class="hero">Hello</div>
</body>
</html>`

describe('extractInlineAssets / restoreInlineAssets', () => {
  it('round-trips byte-lossless across img src, CSS url(), and mixed quotes', () => {
    const { html, assets } = extractInlineAssets(HTML_WITH_ASSETS)
    expect(Object.keys(assets)).toHaveLength(3)
    // No data: URI survives extraction
    expect(html).not.toContain('data:')
    // Tokens sit in the exact positions of the original values
    expect(html).toMatch(/url\('__INLINE_ASSET_\d+__'\)/)
    expect(html).toMatch(/url\(__INLINE_ASSET_\d+__\)/)
    expect(html).toMatch(/src="__INLINE_ASSET_\d+__"/)

    const restored = restoreInlineAssets(html, assets)
    expect(restored).toBe(HTML_WITH_ASSETS)
  })

  it('shrinks the payload the model sees', () => {
    const { html } = extractInlineAssets(HTML_WITH_ASSETS)
    expect(html.length).toBeLessThan(HTML_WITH_ASSETS.length / 10)
  })

  it('passes HTML with no data: URIs through unchanged', () => {
    const plain = '<html><body><img src="https://example.com/x.png"><p>hi</p></body></html>'
    const { html, assets } = extractInlineAssets(plain)
    expect(html).toBe(plain)
    expect(assets).toEqual({})
    expect(restoreInlineAssets(plain, assets)).toBe(plain)
  })

  it('restore is a no-op when assets is undefined', () => {
    const html = '<div>__INLINE_ASSET_0__</div>'
    expect(restoreInlineAssets(html, undefined)).toBe(html)
  })

  it('restore replaces every occurrence of a repeated token', () => {
    const { html, assets } = extractInlineAssets(`<img src="${PNG_A}">`)
    const token = Object.keys(assets)[0]
    const doubled = `${html}<div style="background:url(${token})"></div>`
    const restored = restoreInlineAssets(doubled, assets)
    expect(restored).not.toContain(token)
    expect(restored.split(PNG_A)).toHaveLength(3) // 2 occurrences
  })
})

describe('missingTokens', () => {
  it('detects placeholders the model dropped', () => {
    const { html, assets } = extractInlineAssets(HTML_WITH_ASSETS)
    const tokens = Object.keys(assets)
    // Model output that lost the first token
    const modelHtml = html.split(tokens[0]).join('')
    expect(missingTokens(modelHtml, assets)).toEqual([tokens[0]])
  })

  it('returns empty when all tokens survive', () => {
    const { html, assets } = extractInlineAssets(HTML_WITH_ASSETS)
    expect(missingTokens(html, assets)).toEqual([])
  })
})

describe('reconcileInlineAssets', () => {
  // AC-05: same N tokens back → clean
  it('reconciles clean when the reply returns the same tokens (AC-05)', () => {
    const { html, assets } = extractInlineAssets(HTML_WITH_ASSETS)
    const tokens = Object.keys(assets)
    expect(reconcileInlineAssets(tokens, html)).toEqual({ kind: 'clean' })
  })

  // zero tokens sent & zero back → clean
  it('reconciles clean when nothing was sent and nothing comes back', () => {
    expect(reconcileInlineAssets([], '<div>no placeholders here</div>')).toEqual({ kind: 'clean' })
  })

  // AC-06: a placeholder absent restores it
  it('restores a cleanly absent token (AC-06)', () => {
    const { html, assets } = extractInlineAssets(HTML_WITH_ASSETS)
    const tokens = Object.keys(assets)
    const replyHtml = html.split(tokens[0]).join('') // model dropped the first token
    const result = reconcileInlineAssets(tokens, replyHtml)
    expect(result).toEqual({ kind: 'restored', missing: [tokens[0]] })
  })

  // AC-07: renamed — an unrecognized token appears where a sent one is missing
  it('treats a renamed token as a mismatch (AC-07)', () => {
    const { html, assets } = extractInlineAssets(HTML_WITH_ASSETS)
    const tokens = Object.keys(assets)
    const replyHtml = html.split(tokens[0]).join('__INLINE_ASSET_RENAMED__')
    const result = reconcileInlineAssets(tokens, replyHtml)
    expect(result.kind).toBe('mismatch')
  })

  // AC-07: duplicated — a sent token appears twice in the reply
  it('treats a duplicated token as a mismatch (AC-07)', () => {
    const { html, assets } = extractInlineAssets(HTML_WITH_ASSETS)
    const tokens = Object.keys(assets)
    const replyHtml = `${html}<div style="background:url(${tokens[0]})"></div>`
    const result = reconcileInlineAssets(tokens, replyHtml)
    expect(result.kind).toBe('mismatch')
  })

  // AC-07: reindexed — a token in the sent shape but an index that was never sent
  it('treats a reindexed token as a mismatch (AC-07)', () => {
    const { html, assets } = extractInlineAssets(HTML_WITH_ASSETS)
    const tokens = Object.keys(assets)
    const replyHtml = html.split(tokens[0]).join('__INLINE_ASSET_99__')
    const result = reconcileInlineAssets(tokens, replyHtml)
    expect(result.kind).toBe('mismatch')
  })

  // A token-like string inside an attribute is still counted (the regex decides)
  it('counts a token found inside an unrelated attribute, not only in src/url() position', () => {
    const { assets } = extractInlineAssets(`<img src="${PNG_A}">`)
    const token = Object.keys(assets)[0]
    const replyHtml = `<img src="${token}" alt="${token}">` // same token twice: src + alt
    const result = reconcileInlineAssets([token], replyHtml)
    expect(result.kind).toBe('mismatch') // counted twice → duplicated, not clean
  })
})
