import { describe, expect, it } from 'vitest'
import { findTextCandidates, precheckApply } from '../../src/lib/applyText/candidates'
import { APPLY_FAILURES } from '../../src/lib/applyText/vocab'
import { applyFailureNotice } from '../../src/lib/applyText/noticeText'

const page = (body: string, head = '') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`

describe('findTextCandidates', () => {
  it('finds a plain h1', () => {
    const html = page('<div><h1>Big Launch</h1><p>x</p></div>')
    const c = findTextCandidates(html, 'big launch')
    expect(c).toHaveLength(1)
    expect(c[0].tagName).toBe('h1')
    expect(html.slice(c[0].startTagEnd, c[0].endTagStart)).toBe('Big Launch')
    expect(c[0].hasChildElements).toBe(false)
  })

  it('finds the innermost element for a headline split by a span and a br', () => {
    const html = page('<section><h1>Big <span class="a">Launch</span><br>Today</h1></section>')
    const c = findTextCandidates(html, 'Big Launch Today')
    expect(c).toHaveLength(1)
    expect(c[0].tagName).toBe('h1')
    expect(c[0].hasChildElements).toBe(true)
    expect(c[0].descendantCount).toBe(2)
  })

  it('reads entities', () => {
    const html = page('<h1>Fish &amp; Chips &lt;now&gt;</h1>')
    expect(findTextCandidates(html, 'Fish & Chips <now>')).toHaveLength(1)
  })

  it('ignores title, script, style, svg, noscript and template copies', () => {
    const html = page(
      '<h1>Hello</h1><script>var a = "<p>Hello</p>"</script><svg><text>Hello</text></svg><style>x{}</style><noscript><p>Hello</p></noscript><template><p>Hello</p></template>',
      '<title>Hello</title>',
    )
    const c = findTextCandidates(html, 'Hello')
    expect(c).toHaveLength(1)
    expect(c[0].tagName).toBe('h1')
  })

  it('returns two for a headline shown twice', () => {
    expect(findTextCandidates(page('<h1>Hello</h1><div><p>Hello</p></div>'), 'Hello')).toHaveLength(2)
  })

  it('returns none for a blank query or a missing headline', () => {
    expect(findTextCandidates(page('<h1>a</h1>'), '  ')).toEqual([])
    expect(findTextCandidates(page('<h1>a</h1>'), 'b')).toEqual([])
  })

  it('skips an element with no end tag', () => {
    expect(findTextCandidates(page('<p>Hello'), 'Hello')).toEqual([])
  })
})

describe('precheckApply', () => {
  const ok = page('<h1>Old title</h1><p>other</p>')

  it('accepts one safe candidate', () => {
    expect(precheckApply(ok, 'Old title', 'New title').ok).toBe(true)
  })

  it('not-found', () => {
    expect(precheckApply(ok, 'Missing', 'New')).toEqual({ ok: false, failure: 'not-found' })
  })

  it('ambiguous', () => {
    const html = page('<h1>Old title</h1><p>Old title</p>')
    expect(precheckApply(html, 'Old title', 'New')).toEqual({ ok: false, failure: 'ambiguous' })
  })

  it('unsafe-element for each reserved marker in the range', () => {
    const inners = ['<img src="a.png">', '<svg></svg>', '<i data-composite="0"></i>', '<IMG SRC="a.png">', '<SVG></SVG>']
    for (const inner of inners) {
      const html = page('<h1>Old title' + inner + '</h1>')
      expect(precheckApply(html, 'Old title', 'New')).toEqual({ ok: false, failure: 'unsafe-element' })
    }
    expect(precheckApply(page('<h1>Old __COMPOSITE_0__</h1>'), 'Old __COMPOSITE_0__', 'New')).toEqual({
      ok: false,
      failure: 'unsafe-element',
    })
    expect(precheckApply(page('<h1>Old __INLINE_ASSET_1__</h1>'), 'Old __INLINE_ASSET_1__', 'New')).toEqual({
      ok: false,
      failure: 'unsafe-element',
    })
  })

  it('unsafe-text', () => {
    expect(precheckApply(ok, 'Old title', 'x __COMPOSITE_0__')).toEqual({ ok: false, failure: 'unsafe-text' })
    expect(precheckApply(ok, 'Old title', '__INLINE_ASSET_2__')).toEqual({ ok: false, failure: 'unsafe-text' })
  })

  it('new-text-present', () => {
    const html = page('<h1>Old title</h1><p>New title</p>')
    expect(precheckApply(html, 'Old title', 'new  title')).toEqual({ ok: false, failure: 'new-text-present' })
  })
})

describe('vocabulary', () => {
  it('has a notice for every failure', () => {
    for (const f of APPLY_FAILURES) expect(applyFailureNotice(f).length).toBeGreaterThan(10)
  })
})
