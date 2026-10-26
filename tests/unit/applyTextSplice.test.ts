import { describe, expect, it } from 'vitest'
import { findTextCandidates, precheckApply } from '../../src/lib/applyText/candidates'
import { spliceText } from '../../src/lib/applyText/splice'

const page = (body: string) => `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`

function candidate(html: string, text: string) {
  const r = precheckApply(html, text, 'zzz unlikely')
  if (!r.ok) throw new Error(r.failure)
  return r.candidate
}

describe('spliceText', () => {
  it('replaces only the bytes inside the element, byte for byte elsewhere', () => {
    const html = page('<div class="a"><h1 style="color:red">Old</h1><p>keep é \u{1F600}</p></div>')
    const c = candidate(html, 'Old')
    const r = spliceText(html, c, 'Brand new')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.html.slice(0, c.startTagEnd)).toBe(html.slice(0, c.startTagEnd))
    expect(r.html.endsWith(html.slice(c.endTagStart))).toBe(true)
    expect(r.html).toBe(html.replace('>Old<', '>Brand new<'))
  })

  it('escapes <, & and >', () => {
    const html = page('<h1>Old</h1>')
    const r = spliceText(html, candidate(html, 'Old'), 'a <b> & c')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.html).toContain('a &lt;b&gt; &amp; c')
    expect(r.html).not.toContain('<b>')
  })

  it('flattens styled children', () => {
    const html = page('<h1>Big <span class="x">Launch</span><br>Day</h1>')
    const c = candidate(html, 'Big Launch Day')
    expect(c.hasChildElements).toBe(true)
    const r = spliceText(html, c, 'Small')
    expect(r.ok && r.html).toBe(page('<h1>Small</h1>'))
  })

  it('returns splice-mismatch for a forced bad offset and does not alter the input', () => {
    const html = page('<div><h1>Old</h1><p>other</p></div>')
    const original = String(html)
    const c = candidate(html, 'Old')
    const bad = { ok: false, failure: 'splice-mismatch' }
    expect(spliceText(html, { ...c, startTagEnd: c.startTagEnd + 3 }, 'New')).toEqual(bad)
    expect(spliceText(html, { ...c, endTagStart: html.length + 5 }, 'New')).toEqual(bad)
    expect(spliceText(html, { ...c, tagName: 'h2' }, 'New')).toEqual(bad)
    expect(html).toBe(original)
  })

  it('leaves exactly one element showing the new text and none showing the old', () => {
    const html = page('<h1>Old</h1>')
    const r = spliceText(html, candidate(html, 'Old'), 'Fresh')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(findTextCandidates(r.html, 'Fresh')).toHaveLength(1)
    expect(findTextCandidates(r.html, 'Old')).toHaveLength(0)
  })
})
