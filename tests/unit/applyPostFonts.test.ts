// 031 AC-19 (FR-22): the font injection on strings (the URL builder is a stub), and the kit plan.
import { describe, it, expect } from 'vitest'
import {
  applyPostFonts,
  extendFontStacks,
  familiesFromFontsHref,
  postFontFamiliesFromHtml,
  type PostFontPlan,
} from '@/lib/fonts/inject'
import { postFontPlan, postFontsUrl } from '@/lib/fonts/plan'

const url = (families: string[]) =>
  `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f.replace(/ /g, '+')}`).join('&')}&display=swap`
const SINHALA: PostFontPlan = { families: ['Poppins'], scriptFamilies: ['Noto Sans Sinhala'] }
const LINK =
  '<link rel="stylesheet" data-post-fonts href="https://fonts.googleapis.com/css2?family=Poppins&amp;family=Noto+Sans+Sinhala&amp;display=swap">'

const doc = (head: string, body = '<p>x</p>') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`

describe('applyPostFonts: the marked link (FR-22 step 1)', () => {
  it('inserts one marked link at the start of <head>, for families then script families', () => {
    const out = applyPostFonts(doc('<meta charset="utf-8">'), SINHALA, url)
    expect(out).toBe(doc(`${LINK}<meta charset="utf-8">`))
  })

  it('replaces an earlier marked link wherever it is', () => {
    const old = '<link rel="stylesheet" data-post-fonts href="https://old.example/css">'
    const out = applyPostFonts(doc(`<title>t</title>${old}<style>p{color:red}</style>`), SINHALA, url)
    expect(out).toBe(doc(`${LINK}<title>t</title><style>p{color:red}</style>`))
    expect(out.match(/data-post-fonts/g)).toHaveLength(1)
  })

  it('leaves an unmarked font link alone', () => {
    const own = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">'
    expect(applyPostFonts(doc(own), SINHALA, url)).toBe(doc(`${LINK}${own}`))
  })

  it('creates <head> after <html> when the document has none', () => {
    const out = applyPostFonts('<!doctype html><html lang="en"><body><p>x</p></body></html>', SINHALA, url)
    expect(out).toBe(`<!doctype html><html lang="en"><head>${LINK}</head><body><p>x</p></body></html>`)
  })

  it('creates <head> after the doctype, or at the start, when there is no <html> either', () => {
    expect(applyPostFonts('<!DOCTYPE html><p>x</p>', SINHALA, url)).toBe(`<!DOCTYPE html><head>${LINK}</head><p>x</p>`)
    expect(applyPostFonts('<p>x</p>', SINHALA, url)).toBe(`<head>${LINK}</head><p>x</p>`)
  })

  it('an empty plan returns the document unchanged (no link, nothing rewritten)', () => {
    const html = doc('<style>p{font-family:Poppins,sans-serif}</style>')
    expect(applyPostFonts(html, { families: [], scriptFamilies: [] }, url)).toBe(html)
  })

  it('a plan with kit fonts only adds the link and touches no stack', () => {
    const html = doc('<style>p{font-family:Poppins,sans-serif}</style>')
    const out = applyPostFonts(html, { families: ['Poppins'], scriptFamilies: [] }, url)
    expect(out).toContain('<style>p{font-family:Poppins,sans-serif}</style>')
    expect(out).toContain('data-post-fonts href="https://fonts.googleapis.com/css2?family=Poppins&amp;display=swap"')
  })

  it('ignores a <head> inside a comment or a script', () => {
    const html = `<!-- <head> --><script>var s = "<head>"</script><html><head></head><body></body></html>`
    const out = applyPostFonts(html, SINHALA, url)
    expect(out).toBe(`<!-- <head> --><script>var s = "<head>"</script><html><head>${LINK}</head><body></body></html>`)
  })
})

describe('applyPostFonts: the script family in the stacks (FR-22 step 2)', () => {
  it('goes before a trailing generic keyword in a <style> rule', () => {
    const out = applyPostFonts(doc('<style>h1 { font-family: "Poppins", sans-serif; }</style>'), SINHALA, url)
    expect(out).toContain(`<style>h1 { font-family: "Poppins", 'Noto Sans Sinhala', sans-serif; }</style>`)
  })

  it('is appended when there is no generic keyword', () => {
    const out = applyPostFonts(doc('<style>h1{font-family:Poppins}</style>'), SINHALA, url)
    expect(out).toContain(`<style>h1{font-family:Poppins, 'Noto Sans Sinhala'}</style>`)
  })

  it('extends an inline style attribute, quoting with the other quote', () => {
    const out = applyPostFonts(doc('', `<h1 style="font-family: Poppins, serif; color: red">x</h1>`), SINHALA, url)
    expect(out).toContain(`<h1 style="font-family: Poppins, 'Noto Sans Sinhala', serif; color: red">x</h1>`)
    const single = applyPostFonts(doc('', `<h1 style='font-family: Poppins'>x</h1>`), SINHALA, url)
    expect(single).toContain(`<h1 style='font-family: Poppins, "Noto Sans Sinhala"'>x</h1>`)
  })

  it('extends a custom property whose name contains "font", and leaves var() only values', () => {
    const css = ':root{--font-heading: Poppins, sans-serif; --brand-font: "Inter"} h1{font-family: var(--font-heading)}'
    const out = applyPostFonts(doc(`<style>${css}</style>`), SINHALA, url)
    expect(out).toContain(
      `:root{--font-heading: Poppins, 'Noto Sans Sinhala', sans-serif; --brand-font: "Inter", 'Noto Sans Sinhala'} h1{font-family: var(--font-heading)}`,
    )
  })

  it('extends --font-display and --font-headline, and leaves --font-line-height and --font-size', () => {
    const css =
      ':root{--font-display: "Playfair Display"; --font-headline: Poppins, serif; --font-line-height: 1.2; --font-size: large}'
    const out = applyPostFonts(doc(`<style>${css}</style>`), SINHALA, url)
    expect(out).toContain(
      `:root{--font-display: "Playfair Display", 'Noto Sans Sinhala'; --font-headline: Poppins, 'Noto Sans Sinhala', serif; --font-line-height: 1.2; --font-size: large}`,
    )
  })

  it('leaves a declaration that already has the family (quotes and case ignored)', () => {
    const css = `p{font-family: "noto sans  sinhala", serif} h1{font-family:'Noto Sans Sinhala'}`
    const html = doc(`<style>${css}</style>`)
    expect(applyPostFonts(html, SINHALA, url)).toContain(`<style>${css}</style>`)
  })

  it('is idempotent: a second run returns the same document', () => {
    const html = doc(
      '<meta charset="utf-8"><style>:root{--font-body:Poppins,sans-serif} h1{font-family:Poppins}</style>',
      `<p style="font-family: Inter, sans-serif">x</p><p style="font-family: &quot;Inter&quot;">y</p>`,
    )
    const once = applyPostFonts(html, SINHALA, url)
    expect(once).not.toBe(html)
    expect(applyPostFonts(once, SINHALA, url)).toBe(once)
    const noHead = applyPostFonts('<html><body><p style="font-family:serif">x</p></body></html>', SINHALA, url)
    expect(applyPostFonts(noHead, SINHALA, url)).toBe(noHead)
  })

  it('adds several script families in order, once each', () => {
    const plan = { families: [], scriptFamilies: ['Noto Sans Sinhala', 'Abhaya Libre', 'Noto Sans Sinhala'] }
    const out = applyPostFonts(doc('<style>p{font-family:Inter, sans-serif}</style>'), plan, url)
    expect(out).toContain(`p{font-family:Inter, 'Noto Sans Sinhala', 'Abhaya Libre', sans-serif}`)
  })

  it('never touches @font-face descriptors, selectors with colons, or other properties', () => {
    const css =
      "@font-face{font-family:'Brand';src:url(data:font/woff2;base64,AAAA)} a:hover{font-family:Poppins} @media (min-width:600px){.x{font-family:Inter;font-size:12px}}"
    const out = applyPostFonts(doc(`<style>${css}</style>`), SINHALA, url)
    expect(out).toContain("@font-face{font-family:'Brand';src:url(data:font/woff2;base64,AAAA)}")
    expect(out).toContain(`a:hover{font-family:Poppins, 'Noto Sans Sinhala'}`)
    expect(out).toContain(`.x{font-family:Inter, 'Noto Sans Sinhala';font-size:12px}`)
  })

  it('keeps !important at the end', () => {
    const out = applyPostFonts(doc('<style>p{font-family:Inter, sans-serif !important}</style>'), SINHALA, url)
    expect(out).toContain(`p{font-family:Inter, 'Noto Sans Sinhala', sans-serif !important}`)
  })

  it('does not treat a quoted "serif" as the generic keyword', () => {
    const out = applyPostFonts(doc(`<style>p{font-family:'serif'}</style>`), SINHALA, url)
    expect(out).toContain(`p{font-family:'serif', 'Noto Sans Sinhala'}`)
  })

  it('leaves a <style> inside a comment or a script alone', () => {
    const body = `<!-- <style>p{font-family:Inter}</style> --><script>const s = "<style>p{font-family:Inter}</style>"</script>`
    const out = applyPostFonts(doc('', body), SINHALA, url)
    expect(out).toContain(body)
  })

  it('leaves the rest of the document byte for byte', () => {
    const html = doc(
      '<style>\n  .a { color: #fff; }\n  .b { font-family: Inter, sans-serif; }\n</style>',
      '<div class="a">__INLINE_ASSET_0__</div><img src="data:image/png;base64,iVBORw0KGgo=">',
    )
    const out = applyPostFonts(html, SINHALA, url)
    expect(out.replace(LINK, '').replace(`'Noto Sans Sinhala', `, '')).toBe(html)
  })
})

describe('applyPostFonts: values it cannot follow are left as they are', () => {
  it('custom properties that are not font families', () => {
    const css = ':root{--font-size:16px;--font-weight-bold:700;--font-bold:bold;--fontScale:1.2;--font-shorthand:700 16px Inter}'
    expect(extendFontStacks(css, ['Noto Sans Sinhala'])).toBe(css)
  })

  it('CSS-wide keywords, a value with a comment, a function other than var()', () => {
    for (const css of [
      'p{font-family:inherit}',
      'p{font-family:Inter /* brand */, sans-serif}',
      'p{font-family:attr(data-font)}',
      'p{font-family:}',
    ]) {
      expect(extendFontStacks(css, ['Noto Sans Sinhala']), css).toBe(css)
    }
  })

  it('an unclosed comment or string leaves the whole style text unchanged', () => {
    for (const css of ['p{font-family:Inter} /* never closed', 'p{content:"never closed} h1{font-family:Inter}']) {
      expect(extendFontStacks(css, ['Noto Sans Sinhala']), css).toBe(css)
    }
  })

  it('declarations outside any rule in a style sheet are not touched', () => {
    expect(extendFontStacks('font-family: Inter;', ['Noto Sans Sinhala'])).toBe('font-family: Inter;')
  })

  it('an unclosed tag stops the scan: the document keeps its text and still gets the link', () => {
    const html = `<html><head></head><body><p style="font-family: Inter`
    const out = applyPostFonts(html, SINHALA, url)
    expect(out).toBe(`<html><head>${LINK}</head><body><p style="font-family: Inter`)
  })

  it('an unquoted style attribute is left alone', () => {
    const out = applyPostFonts(doc('', '<p style=font-family:Inter>x</p>'), SINHALA, url)
    expect(out).toContain('<p style=font-family:Inter>x</p>')
  })
})

describe('applyPostFonts: entity-encoded attribute values', () => {
  it('decodes &quot; in a double-quoted style, extends it, and encodes only the delimiter back', () => {
    const out = applyPostFonts(doc('', `<p style="font-family: &quot;Poppins&quot;, sans-serif">x</p>`), SINHALA, url)
    expect(out).toContain(`<p style="font-family: &quot;Poppins&quot;, 'Noto Sans Sinhala', sans-serif">x</p>`)
  })

  it('handles &#39; in a single-quoted style', () => {
    const out = applyPostFonts(doc('', `<p style='font-family: &#39;Poppins&#39;'>x</p>`), SINHALA, url)
    expect(out).toContain(`<p style='font-family: &#39;Poppins&#39;, "Noto Sans Sinhala"'>x</p>`)
  })

  it('leaves a value with any other entity untouched', () => {
    const p = `<p style="font-family: Inter; content: &lt;b&gt;">x</p>`
    expect(applyPostFonts(doc('', p), SINHALA, url)).toContain(p)
  })
})

describe('reading the marked link back', () => {
  it('postFontFamiliesFromHtml reads the families of the marked link only, axis stripped', () => {
    const html = applyPostFonts(doc(''), SINHALA, (f) => `https://fonts.googleapis.com/css2?${f.map((x) => `family=${x.replace(/ /g, '+')}:wght@400;700`).join('&')}&display=swap`)
    expect(postFontFamiliesFromHtml(html)).toEqual(['Poppins', 'Noto Sans Sinhala'])
    expect(postFontFamiliesFromHtml(doc('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">'))).toEqual([])
  })

  it('familiesFromFontsHref is [] for anything unparsable', () => {
    expect(familiesFromFontsHref('not a url')).toEqual([])
    expect(familiesFromFontsHref('https://fonts.googleapis.com/css2?family=A+B:ital,wght@0,400&family=C')).toEqual(['A B', 'C'])
  })
})

describe('postFontPlan (design 5.4)', () => {
  it('families are the catalogue names of kit.fonts in order; an unknown name (a FONT artifact) stays out', () => {
    const plan = postFontPlan({
      fonts: [
        { name: 'Poppins', url: 'x' },
        { name: 'Brand Upload', url: 'http://minio/brand.woff2' },
        { name: 'Inter', url: 'y' },
        { name: 'Poppins', url: 'x' },
      ],
      scriptFonts: null,
    })
    expect(plan).toEqual({ families: ['Poppins', 'Inter'], scriptFamilies: [] })
  })

  it('scriptFamilies are offered scripts mapped to a catalogue family that has the script', () => {
    expect(postFontPlan({ fonts: [], scriptFonts: { sinhala: 'Noto Sans Sinhala' } }).scriptFamilies).toEqual(['Noto Sans Sinhala'])
    for (const scriptFonts of [{ tamil: 'Noto Sans Tamil' }, { sinhala: 'Inter' }, { sinhala: 'Nope' }, { sinhala: 3 }, ['x'], 'x']) {
      expect(postFontPlan({ fonts: [], scriptFonts }).scriptFamilies).toEqual([])
    }
  })

  it('a missing or malformed kit plans nothing', () => {
    expect(postFontPlan(null)).toEqual({ families: [], scriptFamilies: [] })
    expect(postFontPlan({ fonts: 'nope', scriptFonts: null })).toEqual({ families: [], scriptFamilies: [] })
  })

  it('postFontsUrl is the catalogue-aware request (axes from the catalogue)', () => {
    const u = postFontsUrl(['Noto Sans Sinhala'])
    expect(u).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?family=Noto\+Sans\+Sinhala/)
    expect(u.endsWith('&display=swap')).toBe(true)
  })
})
