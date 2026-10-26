import { describe, it, expect } from 'vitest'
import {
  parseHtmlDocument,
  resolveElementPath,
  elementTextContent,
  elementChildren,
  normalizeFingerprintText,
  decodeHtmlEntities,
  escapeHtmlText,
  replaceElementText,
  setStyleDeclaration,
  type HtmlElement,
} from '@/lib/drafts/htmlLocator'

// T22 (change 004 Phase 3, Ruling W5-A) — the pure server-side node locator.
// Every "malformed / ambiguous" case must FAIL CLOSED (ok:false), never guess.

const doc = (body: string, head = '') =>
  `<!doctype html><html><head>${head}</head><body>${body}</body></html>`

function body(html: string): HtmlElement {
  const r = parseHtmlDocument(html)
  if (!r.ok) throw new Error(`expected a parse, got: ${r.reason}`)
  return r.body
}

function at(html: string, path: number[]): HtmlElement {
  const el = resolveElementPath(body(html), path)
  if (!el) throw new Error(`no element at ${JSON.stringify(path)}`)
  return el
}

function src(html: string, el: HtmlElement): string {
  return html.slice(el.start, el.end)
}

describe('parseHtmlDocument + resolveElementPath — well-formed documents', () => {
  it('resolves element-child indices from <body> and returns exact source offsets', () => {
    const html = doc('<div><h1>Hello</h1><p class="x">World</p></div>', '<style>.a{}</style>')
    const p = at(html, [0, 1])
    expect(p.tag).toBe('p')
    expect(src(html, p)).toBe('<p class="x">World</p>')
    expect(html.slice(p.openEnd, p.closeStart!)).toBe('World')
    expect(at(html, [0]).tag).toBe('div')
  })

  it('the empty path is <body> itself', () => {
    const html = doc('<p>x</p>')
    expect(at(html, []).tag).toBe('body')
  })

  it('counts void elements (and <br>, <br/>) as childless elements', () => {
    const html = doc('<div><img src="a.png" alt="a"><br><br/><span>X</span><hr></div>')
    expect(at(html, [0, 0]).tag).toBe('img')
    expect(at(html, [0, 0]).closeStart).toBeNull()
    expect(at(html, [0, 1]).tag).toBe('br')
    expect(at(html, [0, 2]).tag).toBe('br')
    expect(at(html, [0, 3]).tag).toBe('span')
    expect(at(html, [0, 4]).tag).toBe('hr')
    expect(resolveElementPath(body(html), [0, 0, 0])).toBeNull()
  })

  it('ignores comments — including ones that contain markup or --!>', () => {
    const html = doc('<!-- <div>fake</div> --><!--x--!><!--><!---><p>A</p>')
    expect(at(html, [0]).tag).toBe('p')
    expect(elementChildren(body(html))).toHaveLength(1)
  })

  it('treats <script> and <style> content as raw text (markup inside is not elements)', () => {
    const html = doc(
      '<script>var s = "<div></div>"; if (a < b) {}</script><style>a>b{color:red}</style><p>A</p>',
    )
    expect(at(html, [0]).tag).toBe('script')
    expect(at(html, [1]).tag).toBe('style')
    expect(at(html, [2]).tag).toBe('p')
    expect(elementChildren(at(html, [0]))).toHaveLength(0)
  })

  it('raw-text end tags are matched case-insensitively and need a terminator', () => {
    const html = doc('<script>x = "</scriptx>"</SCRIPT ><p>A</p>')
    expect(at(html, [1]).tag).toBe('p')
  })

  it('handles attributes containing > in quoted values, and unquoted/boolean attributes', () => {
    const html = doc(`<div data-x="a>b" title='c>d' hidden class=big><span>T</span></div>`)
    const span = at(html, [0, 0])
    expect(span.tag).toBe('span')
    expect(src(html, span)).toBe('<span>T</span>')
    const div = at(html, [0])
    expect(div.attrs.map((a) => a.name)).toEqual(['data-x', 'title', 'hidden', 'class'])
  })

  it('nested same-tag elements match their own close tags', () => {
    const html = doc('<div><div><div>in</div></div><div>second</div></div><div>third</div>')
    expect(src(html, at(html, [0, 0, 0]))).toBe('<div>in</div>')
    expect(src(html, at(html, [0, 1]))).toBe('<div>second</div>')
    expect(src(html, at(html, [0, 0]))).toBe('<div><div>in</div></div>')
    expect(src(html, at(html, [1]))).toBe('<div>third</div>')
  })

  it('lowercases tag names (case-insensitive HTML)', () => {
    const html = doc('<DIV><P>x</P></DIV>')
    expect(at(html, [0, 0]).tag).toBe('p')
  })

  it('a < that does not open a tag is text', () => {
    const html = doc('<p>1 < 2 and 3 <= 4 and </ ok></p>')
    expect(elementTextContent(at(html, [0]))).toContain('1 < 2 and 3 <= 4')
  })

  it('a path that runs out of range or through a leaf resolves to null', () => {
    const html = doc('<div><p>a</p></div>')
    expect(resolveElementPath(body(html), [1])).toBeNull()
    expect(resolveElementPath(body(html), [0, 1])).toBeNull()
    expect(resolveElementPath(body(html), [0, 0, 0])).toBeNull()
  })

  it('works on a document without <html>/<head> tags', () => {
    const html = '<!doctype html><body><p>x</p></body>'
    expect(at(html, [0]).tag).toBe('p')
  })

  it('accepts whitespace and comments around the document skeleton', () => {
    const html = '<!doctype html>\n<!-- c -->\n<html>\n<head>\n<meta charset="utf-8">\n</head>\n<body>\n<p>x</p>\n</body>\n<!-- trailing -->\n</html>\n'
    expect(at(html, [0]).tag).toBe('p')
  })

  it('parses SVG as foreign content: self-closing honoured, <style> not raw text', () => {
    const html = doc(
      '<svg viewBox="0 0 10 10"><rect/><style>.a{}</style><text x="1">Hi</text><foreignObject><div>in</div></foreignObject></svg><p>After</p>',
    )
    expect(at(html, [0]).tag).toBe('svg')
    expect(at(html, [0, 0]).tag).toBe('rect')
    expect(at(html, [0, 2]).tag).toBe('text')
    expect(elementTextContent(at(html, [0, 2]))).toBe('Hi')
    expect(at(html, [0, 3, 0]).tag).toBe('div')
    expect(at(html, [1]).tag).toBe('p')
  })

  it('handles a valid nested list (li inside ul inside li)', () => {
    const html = doc('<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>')
    expect(elementTextContent(at(html, [0, 0, 0, 0]))).toBe('b')
    expect(elementTextContent(at(html, [0, 1]))).toBe('c')
  })

  it('is linear on a multi-megabyte inline data: URI (Hearts Talk-sized templates)', () => {
    const big = 'data:image/png;base64,' + 'A'.repeat(2_000_000)
    const html = doc(`<div><img src="${big}"><h1>Title</h1></div>`)
    const t0 = Date.now()
    expect(at(html, [0, 1]).tag).toBe('h1')
    expect(Date.now() - t0).toBeLessThan(1000)
  })

  it('handles a well-formed table with explicit tbody', () => {
    const html = doc('<table><tbody><tr><td>1</td><td>2</td></tr></tbody></table>')
    expect(elementTextContent(at(html, [0, 0, 0, 1]))).toBe('2')
  })
})

describe('parseHtmlDocument — malformed or ambiguous markup fails closed', () => {
  const bad: Array<[string, string]> = [
    ['unclosed element', doc('<div><p>x</p>')],
    ['mismatched end tag', doc('<div><span>x</div></span>')],
    ['stray end tag', doc('<p>x</p></p>')],
    ['end tag for a void element', doc('<p>x<br></br></p>')],
    ['EOF inside a start tag', '<!doctype html><html><body><div class="x'],
    ['EOF inside a comment', doc('<p>x</p>') + '<!-- never closed'],
    ['EOF inside raw text', '<!doctype html><html><body><script>var x'],
    ['non-void self-closing (browser ignores the slash)', doc('<div/><p>x</p>')],
    ['block element inside <p> (implicit close)', doc('<p><div>x</div></p>')],
    ['li directly inside li (implicit close)', doc('<ul><li>a<li>b</li></li></ul>')],
    ['a inside a', doc('<a href="#"><span><a href="#">x</a></span></a>')],
    ['heading inside heading', doc('<h1><h2>x</h2></h1>')],
    ['tr directly in table (implied tbody)', doc('<table><tr><td>1</td></tr></table>')],
    ['div inside table (foster parenting)', doc('<table><div>x</div></table>')],
    ['text directly inside table', doc('<table>oops<tbody></tbody></table>')],
    ['td outside a table', doc('<div><td>x</td></div>')],
    ['noscript (parse depends on scripting)', doc('<noscript><p>x</p></noscript>')],
    ['select', doc('<select><option>a</option></select>')],
    ['math', doc('<math><mi>x</mi></math>')],
    ['HTML breakout tag inside svg', doc('<svg><div>x</div></svg>')],
    ['no <body>', '<!doctype html><html><head></head></html>'],
    ['element after </body>', '<!doctype html><html><body><p>x</p></body><div>y</div></html>'],
    ['text after </body>', '<!doctype html><html><body><p>x</p></body>tail</html>'],
    ['element before <body>', '<!doctype html><html><div>x</div><body><p>y</p></body></html>'],
    ['text before <html>', 'Here is your HTML: <!doctype html><html><body><p>y</p></body></html>'],
    ['non-head element inside head', '<!doctype html><html><head><div>x</div></head><body></body></html>'],
    ['nested <body>', doc('<body><p>x</p></body>')],
    ['duplicate <body>', '<!doctype html><html><body></body><body></body></html>'],
    ['<!-- inside script (script-data escape states)', doc('<script><!-- <script></script> --></script>')],
  ]
  for (const [name, html] of bad) {
    it(name, () => {
      const r = parseHtmlDocument(html)
      expect(r.ok).toBe(false)
    })
  }
})

describe('elementTextContent + normalizeFingerprintText', () => {
  it('decodes entities (named, numeric, hex) in the fingerprint text', () => {
    const html = doc('<p>Fish &amp; Chips&nbsp;&#169; &#x2014; &lt;b&gt; &quot;q&quot; &hellip;</p>')
    expect(elementTextContent(at(html, [0]))).toBe('Fish & Chips\u00a0© — <b> "q" …')
  })

  it('concatenates descendant text and ignores comments', () => {
    const html = doc('<div>Some <b>bold</b><!-- hidden --> text</div>')
    expect(elementTextContent(at(html, [0]))).toBe('Some bold text')
  })

  it('excludes <template> content (it is not in the DOM tree)', () => {
    const html = doc('<div>a<template><p>hidden</p></template>b</div>')
    expect(elementTextContent(at(html, [0]))).toBe('ab')
  })

  it('keeps a bare & that is not an entity literal (AT&T)', () => {
    const html = doc('<p>AT&T &amp co & more</p>')
    expect(elementTextContent(at(html, [0]))).toBe('AT&T & co & more')
  })

  it('decodes a legacy no-semicolon entity in text (&copy2026)', () => {
    const html = doc('<p>&copy2026</p>')
    expect(elementTextContent(at(html, [0]))).toBe('©2026')
  })

  it('returns null (unverifiable) for an unknown named entity or a remapped numeric', () => {
    expect(elementTextContent(at(doc('<p>&alpha;</p>'), [0]))).toBeNull()
    expect(elementTextContent(at(doc('<p>&#150;</p>'), [0]))).toBeNull()
    expect(elementTextContent(at(doc('<p>&#0;</p>'), [0]))).toBeNull()
  })

  it('normalizes whitespace runs (incl. nbsp and newlines) to one space and trims', () => {
    expect(normalizeFingerprintText('  Fish\n\t &\u00a0 Chips  ')).toBe('Fish & Chips')
  })
})

describe('decodeHtmlEntities — attribute context', () => {
  it('decodes &quot; and numerics', () => {
    expect(decodeHtmlEntities('font-family:&quot;Poppins&quot;;x:&#65;', 'attribute')).toBe(
      'font-family:"Poppins";x:A',
    )
  })
  it('does not decode a legacy no-semicolon entity followed by an alphanumeric or = in an attribute', () => {
    expect(decodeHtmlEntities('?a=1&copy=2', 'attribute')).toBe('?a=1&copy=2')
  })
})

describe('escapeHtmlText', () => {
  it('escapes &, < and >', () => {
    expect(escapeHtmlText('<script>alert(1)</script> & co')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt; &amp; co',
    )
  })
})

describe('replaceElementText', () => {
  it('writes escaped text into exactly that element; every other byte is unchanged', () => {
    const html = doc('<div><h1 class="t">Old</h1><p>Keep</p></div>')
    const h1 = at(html, [0, 0])
    const out = replaceElementText(html, h1, '<script>alert(1)</script>')
    expect(out).toBe(
      html.slice(0, h1.openEnd) + '&lt;script&gt;alert(1)&lt;/script&gt;' + html.slice(h1.closeStart!),
    )
    const after = at(out, [0, 0])
    expect(elementChildren(after)).toHaveLength(0)
    expect(elementTextContent(after)).toBe('<script>alert(1)</script>')
  })

  it('refuses an element with no content range (void)', () => {
    const html = doc('<img src="a.png">')
    expect(() => replaceElementText(html, at(html, [0]), 'x')).toThrow()
  })
})

describe('setStyleDeclaration', () => {
  it('inserts a style attribute right after the tag name when there is none', () => {
    const html = doc('<h1 class="t">Hi</h1>')
    const r = setStyleDeclaration(html, at(html, [0]), 'color', '#ff0000')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.html).toBe(html.replace('<h1 class="t">', '<h1 style="color: #ff0000" class="t">'))
  })

  it('works on a self-closing svg element', () => {
    const html = doc('<svg><rect/></svg>')
    const r = setStyleDeclaration(html, at(html, [0, 0]), 'color', '#00ff00')
    expect(r.ok && r.html).toBe(html.replace('<rect/>', '<rect style="color: #00ff00"/>'))
  })

  it('replaces an existing declaration of the same property (incl. !important) and keeps the rest', () => {
    const html = doc('<p style="color:red !important; font-size: 12px">x</p>')
    const r = setStyleDeclaration(html, at(html, [0]), 'color', '#aabbcc')
    expect(r.ok && r.html).toBe(doc('<p style="font-size: 12px; color: #aabbcc">x</p>'))
  })

  it('keeps entity-encoded quotes in other declarations intact (re-encoded)', () => {
    const html = doc('<p style="font-family:&quot;Poppins&quot;, sans-serif;color:blue">x</p>')
    const r = setStyleDeclaration(html, at(html, [0]), 'font-size', '24px')
    expect(r.ok && r.html).toBe(
      doc('<p style="font-family:&quot;Poppins&quot;, sans-serif;color:blue; font-size: 24px">x</p>'),
    )
  })

  it('does not split on a ; inside a string or url()', () => {
    const html = doc(`<p style='background-image:url("a;b.png"); content: "x;y"'>x</p>`)
    const r = setStyleDeclaration(html, at(html, [0]), 'background-color', '#000000')
    expect(r.ok && r.html).toBe(
      doc(
        '<p style="background-image:url(&quot;a;b.png&quot;); content: &quot;x;y&quot;; background-color: #000000">x</p>',
      ),
    )
  })

  it('handles unquoted and valueless style attributes', () => {
    const a = doc('<p style=color:red>x</p>')
    expect(setStyleDeclaration(a, at(a, [0]), 'color', '#111111')).toEqual({
      ok: true,
      html: doc('<p style="color: #111111">x</p>'),
    })
    const b = doc('<p style>x</p>')
    expect(setStyleDeclaration(b, at(b, [0]), 'color', '#111111')).toEqual({
      ok: true,
      html: doc('<p style="color: #111111">x</p>'),
    })
  })

  it('only the style attribute changes — bytes outside it are identical', () => {
    const html = doc('<div><p id="a" style="margin:0" data-k="v">x</p><p style="color:red">y</p></div>')
    const p = at(html, [0, 0])
    const r = setStyleDeclaration(html, p, 'font-size', '2em')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const styleAttr = p.attrs.find((a) => a.name === 'style')!
    expect(r.html.slice(0, styleAttr.start)).toBe(html.slice(0, styleAttr.start))
    expect(r.html.slice(r.html.length - (html.length - styleAttr.end))).toBe(html.slice(styleAttr.end))
  })

  it('fails closed on duplicate style attributes, an unterminated string, or an undecodable entity', () => {
    const dup = doc('<p style="color:red" style="color:blue">x</p>')
    expect(setStyleDeclaration(dup, at(dup, [0]), 'color', '#000000').ok).toBe(false)
    const unterminated = doc(`<p style='content:"abc'>x</p>`)
    expect(setStyleDeclaration(unterminated, at(unterminated, [0]), 'color', '#000000').ok).toBe(false)
    const ent = doc('<p style="content:&alpha;">x</p>')
    expect(setStyleDeclaration(ent, at(ent, [0]), 'color', '#000000').ok).toBe(false)
  })

  it('throws (programming error) on a value that is not already grammar-serialized', () => {
    const html = doc('<p>x</p>')
    const p = at(html, [0])
    expect(() => setStyleDeclaration(html, p, 'color', 'red; background: url(x)')).toThrow()
    expect(() => setStyleDeclaration(html, p, 'color', 'url(x)')).toThrow()
    // @ts-expect-error — property outside the closed set
    expect(() => setStyleDeclaration(html, p, 'background', '#000000')).toThrow()
  })
})

// ── Fix round 1 (review wave5-O, Minors 1–4) ────────────────────────────────

describe('setStyleDeclaration — the splitter tracks every bracket kind and refuses what CSS would read differently (Minor 1)', () => {
  const refuse = (style: string) => {
    const html = doc(`<p style="${style}">x</p>`)
    return setStyleDeclaration(html, at(html, [0]), 'color', '#aabbcc')
  }

  it('an unbalanced { (review repro 1) is refused — the new declaration would land inside the open block', () => {
    expect(refuse('color: red; foo: {').ok).toBe(false)
  })

  it('unbalanced or mismatched [ ] { } ( ) are refused', () => {
    for (const s of ['a: [x', 'a: x]', 'a: x}', 'a: (x]', 'a: [x)', 'a: {x]']) {
      expect(refuse(s).ok, s).toBe(false)
    }
  })

  it('a ; inside a balanced {} or [] block does not split (matches CSS)', () => {
    const html = doc('<p style="--x: {a;b}; --y: [c;d]; color: red">x</p>')
    const r = setStyleDeclaration(html, at(html, [0]), 'color', '#aabbcc')
    expect(r.ok && r.html).toBe(doc('<p style="--x: {a;b}; --y: [c;d]; color: #aabbcc">x</p>'))
  })

  it('a trailing backslash (review repro 2) is refused — it would escape the ; we append', () => {
    expect(refuse('font-weight: bold\\').ok).toBe(false)
  })

  it('a raw newline inside a string (review repro 3) is refused — CSS ends a bad-string there', () => {
    expect(refuse("content: 'a\nb'; color: red").ok).toBe(false)
    expect(refuse('content: &quot;a&#10;b&quot;').ok).toBe(false)
    expect(refuse("content: 'a\rb'").ok).toBe(false)
  })

  it('an ESCAPED newline in a string is a valid continuation and is kept', () => {
    const html = doc("<p style=\"content: 'a\\\nb'\">x</p>")
    const r = setStyleDeclaration(html, at(html, [0]), 'color', '#aabbcc')
    expect(r.ok && r.html).toBe(doc("<p style=\"content: 'a\\\nb'; color: #aabbcc\">x</p>"))
  })

  it('trimming never strips an escaped trailing ; or space (the kept escape stays an escape)', () => {
    const a = doc('<p style="font-weight: bold\\;">x</p>')
    expect(setStyleDeclaration(a, at(a, [0]), 'color', '#aabbcc')).toEqual({
      ok: true,
      html: doc('<p style="font-weight: bold\\;; color: #aabbcc">x</p>'),
    })
    const b = doc('<p style="font-weight: bold\\ ">x</p>')
    expect(setStyleDeclaration(b, at(b, [0]), 'color', '#aabbcc')).toEqual({
      ok: true,
      html: doc('<p style="font-weight: bold\\ ; color: #aabbcc">x</p>'),
    })
  })

  it('trims CSS whitespace only — a trailing no-break space is an ident character and is kept', () => {
    const html = doc('<p style="font-family: x\u00a0">x</p>')
    const r = setStyleDeclaration(html, at(html, [0]), 'color', '#aabbcc')
    expect(r.ok && r.html).toBe(doc('<p style="font-family: x\u00a0; color: #aabbcc">x</p>'))
  })

  it('an escaped property name (c\\olor is color to CSS) is refused rather than silently kept', () => {
    expect(refuse('c\\olor: red !important').ok).toBe(false)
  })
})

describe('parseHtmlDocument — nesting depth cap (Minor 2)', () => {
  const nested = (depth: number) => doc('<div>'.repeat(depth) + 'x' + '</div>'.repeat(depth))

  it('rejects nesting deeper than the 512-element parser cap — 600 deep', () => {
    const r = parseHtmlDocument(nested(600))
    expect(r.ok).toBe(false)
  })

  it('rejects 20 000-deep input quickly and without a RangeError', () => {
    const html = nested(20_000)
    const t0 = Date.now()
    const r = parseHtmlDocument(html)
    expect(r.ok).toBe(false)
    expect(Date.now() - t0).toBeLessThan(500)
  })

  it('still parses (and walks) a document just under the cap', () => {
    const html = nested(500)
    const b = body(html)
    expect(elementTextContent(b)).toBe('x')
    let el = b
    for (let d = 0; d < 500; d++) el = elementChildren(el)[0]
    expect(el.tag).toBe('div')
  })

  it('is linear in the number of tags (no per-tag rescans of the open stack)', () => {
    // 450 deep × many siblings at the bottom: every <p> sits under a deep stack.
    const html = doc('<div>'.repeat(450) + '<p>a</p>'.repeat(40_000) + '</div>'.repeat(450))
    const t0 = Date.now()
    expect(parseHtmlDocument(html).ok).toBe(true)
    expect(Date.now() - t0).toBeLessThan(1500)
  })
})

describe('resolveElementPath — never descends into <template> content (Minor 3)', () => {
  it('a path that steps into a template resolves to null (stale)', () => {
    const html = doc('<template><p>x</p></template><p>y</p>')
    expect(resolveElementPath(body(html), [0, 0])).toBeNull()
    // The template element itself, and its siblings, still resolve.
    expect(at(html, [0]).tag).toBe('template')
    expect(at(html, [1]).tag).toBe('p')
  })

  it('also below the template', () => {
    const html = doc('<div><template><div><span>x</span></div></template></div>')
    expect(resolveElementPath(body(html), [0, 0, 0, 0])).toBeNull()
  })
})

describe('tag and attribute names are ASCII-lowercased, as the HTML tokenizer does (Minor 4)', () => {
  it('<tracK> (U+212A KELVIN SIGN) is NOT the void element track', () => {
    const html = doc('<div><trac\u212A>x</trac\u212A></div>')
    const el = at(html, [0, 0])
    expect(el.tag).toBe('trac\u212A')
    expect(el.closeStart).not.toBeNull()
    expect(elementTextContent(el)).toBe('x')
  })

  it('ASCII upper case still lowercases (tags and attributes)', () => {
    const html = doc('<DIV STYLE="color:red" Data-X="1"><P>x</P></DIV>')
    expect(at(html, [0]).attrs.map((a) => a.name)).toEqual(['style', 'data-x'])
    expect(at(html, [0, 0]).tag).toBe('p')
  })

  it('a Kelvin-sign attribute name is not folded onto an ASCII one (see below for url)', () => {
    const html = doc('<p data-\u212A="1">x</p>')
    expect(at(html, [0]).attrs.map((a) => a.name)).toEqual(['data-\u212A'])
  })
})

// ── Fix round 2 (review of 88b6b35b, Minor 2) ────────────────────────────────
// An UNQUOTED url( is one url token to CSS; a quote, "(" or non-escape
// backslash inside it makes a bad-url that ends at the first ")". The splitter
// would read those as a string / block instead, so the edit is refused.

describe('setStyleDeclaration: an unquoted url( body the splitter would misread is refused', () => {
  const style = (s: string) => {
    const html = doc(`<p style='${s}'>x</p>`)
    return setStyleDeclaration(html, at(html, [0]), 'color', '#aabbcc')
  }

  it('review repro A: a quote inside an unquoted url( (Chrome: color blue applies)', () => {
    expect(style('background: url(a"b); color: blue; x: ")').ok).toBe(false)
  })

  it('review repro B: a "(" inside an unquoted url( hides an !important', () => {
    expect(style('background: url(a(b); color: blue !important; y: )').ok).toBe(false)
  })

  it("an apostrophe, and a backslash-newline (not a valid escape), are refused too", () => {
    const html = doc('<p style="background: url(a\'b); color: blue">x</p>')
    expect(setStyleDeclaration(html, at(html, [0]), 'color', '#aabbcc').ok).toBe(false)
    const bs = doc('<p style="background: url(a\\\nb); color: blue">x</p>')
    expect(setStyleDeclaration(bs, at(bs, [0]), 'color', '#aabbcc').ok).toBe(false)
  })

  it('an unclosed unquoted url( is refused', () => {
    const html = doc('<p style="background: url(a.png">x</p>')
    expect(setStyleDeclaration(html, at(html, [0]), 'color', '#aabbcc').ok).toBe(false)
  })

  it('URL( is matched case-insensitively', () => {
    expect(style('background: URL(a"b); color: blue; x: ")').ok).toBe(false)
  })

  it('a function whose name holds an escape (u\\72 l( IS url() is refused', () => {
    const html = doc('<p style="background: u\\72 l(a); color: blue">x</p>')
    expect(setStyleDeclaration(html, at(html, [0]), 'color', '#aabbcc').ok).toBe(false)
  })

  it('a plain unquoted url(, one with ; inside, and an escaped quote are kept', () => {
    const a = doc('<p style="background: url(a.png); color: red">x</p>')
    expect(setStyleDeclaration(a, at(a, [0]), 'color', '#aabbcc')).toEqual({
      ok: true,
      html: doc('<p style="background: url(a.png); color: #aabbcc">x</p>'),
    })
    const b = doc('<p style="background: url(a;b.png)">x</p>')
    expect(setStyleDeclaration(b, at(b, [0]), 'color', '#aabbcc')).toEqual({
      ok: true,
      html: doc('<p style="background: url(a;b.png); color: #aabbcc">x</p>'),
    })
    const c = doc(`<p style='background: url(a\\"b.png)'>x</p>`)
    expect(setStyleDeclaration(c, at(c, [0]), 'color', '#aabbcc').ok).toBe(true)
  })

  it('a QUOTED url("...") stays accepted, whatever it holds', () => {
    const html = doc(`<p style='background: url( "a(b;c.png" ); color: red'>x</p>`)
    const r = setStyleDeclaration(html, at(html, [0]), 'color', '#aabbcc')
    expect(r.ok && r.html).toBe(
      doc('<p style="background: url( &quot;a(b;c.png&quot; ); color: #aabbcc">x</p>'),
    )
  })

  it('a function that merely ends in "url" (myurl() is an ordinary function', () => {
    const html = doc('<p style="--x: myurl(a(b)); color: red">x</p>')
    expect(setStyleDeclaration(html, at(html, [0]), 'color', '#aabbcc').ok).toBe(true)
  })
})

// ── Fix round 3 (review of 43dc354d) ─────────────────────────────────────────

describe('setStyleDeclaration: #url( / @url( and block characters in an unquoted url( body (round 3, item 1)', () => {
  const refuse = (s: string) => {
    const html = doc(`<p style='${s}'>x</p>`)
    return setStyleDeclaration(html, at(html, [0]), 'color', '#aabbcc').ok
  }

  // The reviewer's Chrome-confirmed repros: to CSS "#url" is a hash token and
  // "@url" an at-keyword, so the "(" opens a BLOCK where { [ /* nest.
  it('x: #url(a{b); color: red', () => {
    expect(refuse('x: #url(a{b); color: red')).toBe(false)
  })
  it('x: @url(a{b)', () => {
    expect(refuse('x: @url(a{b)')).toBe(false)
  })
  it('#url(a[b)', () => {
    expect(refuse('#url(a[b)')).toBe(false)
  })
  it('x: #url(a/*b); y: 1 */', () => {
    expect(refuse('x: #url(a/*b); y: 1 */')).toBe(false)
  })

  it('{ } [ ] and /* are refused in ANY unquoted url( body, so both readings end at the same )', () => {
    for (const s of ['background: url(a{b)', 'background: url(a}b)', 'background: url(a[b)', 'background: url(a]b)', 'background: url(a/*b)']) {
      expect(refuse(s), s).toBe(false)
    }
  })

  it('a balanced #url(...) block is still an ordinary block and is kept', () => {
    const html = doc('<p style="x: #url(a); color: red">x</p>')
    const r = setStyleDeclaration(html, at(html, [0]), 'color', '#aabbcc')
    expect(r.ok && r.html).toBe(doc('<p style="x: #url(a); color: #aabbcc">x</p>'))
  })
})

describe('setStyleDeclaration: carriage returns are refused (round 3, item 2)', () => {
  it('reviewer repro: u\\72 + CRLF + l( IS url( (CSS folds CRLF to one LF, which the hex escape consumes)', () => {
    const html = doc('<p style="background: u\\72&#13;&#10;l(a(b); color: blue !important; y: )">x</p>')
    expect(setStyleDeclaration(html, at(html, [0]), 'color', '#aabbcc').ok).toBe(false)
  })

  it('any CR after decoding is refused — as a reference or as a raw byte', () => {
    const ref = doc('<p style="color: red;&#13;font-size: 12px">x</p>')
    expect(setStyleDeclaration(ref, at(ref, [0]), 'color', '#aabbcc').ok).toBe(false)
    const raw = doc('<p style="color: red;\rfont-size: 12px">x</p>')
    expect(setStyleDeclaration(raw, at(raw, [0]), 'color', '#aabbcc').ok).toBe(false)
  })

  it('a lone form feed is modelled (one whitespace, which a hex escape consumes) — u\\72 + FF + l( is refused as url(', () => {
    const html = doc('<p style="background: u\\72&#12;l(a(b); color: blue !important; y: )">x</p>')
    expect(setStyleDeclaration(html, at(html, [0]), 'color', '#aabbcc').ok).toBe(false)
  })

  it('an LF alone is still fine between declarations', () => {
    const html = doc('<p style="color: red;&#10;font-size: 12px">x</p>')
    const r = setStyleDeclaration(html, at(html, [0]), 'color', '#aabbcc')
    expect(r.ok).toBe(true)
  })
})
