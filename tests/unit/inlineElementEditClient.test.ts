import { describe, it, expect, vi } from 'vitest'
import {
  canEditElementText,
  canEditElementStyle,
  snapshotElementLocator,
  buildElementEditBody,
  interpretElementEditResponse,
  postElementEdit,
  cssColorToHex,
  resolveEditorPath,
  relativeElementPath,
  seedColorValue,
  type SelectableElement,
} from '@/components/drafts/inlineElementEdit'
import { applyElementEdit, parseColor } from '@/lib/drafts/inlineEdit'

// Structural stand-ins for iframe DOM elements (vitest runs in `node`, no DOM).
// Same shape as the fakes in inlineEditElement.test.ts.
type Fake = SelectableElement & { children: Fake[]; childNodes: Fake[]; parentElement: Fake | null }

const SVG_NS = 'http://www.w3.org/2000/svg'
const HTML_NS = 'http://www.w3.org/1999/xhtml'

function E(
  tagName: string,
  attrs: Record<string, string>,
  kids: Array<Fake | string>,
  ns: string = HTML_NS,
): Fake {
  const node: Fake = {
    nodeType: 1,
    // HTML elements report an upper-case tagName, SVG elements keep the source case.
    tagName: ns === SVG_NS ? tagName : tagName.toUpperCase(),
    namespaceURI: ns,
    textContent: null,
    parentElement: null,
    children: [],
    childNodes: [],
    getAttribute: (n: string) => (n in attrs ? attrs[n] : null),
  }
  for (const k of kids) {
    const child: Fake =
      typeof k === 'string'
        ? {
            nodeType: 3,
            tagName: '',
            namespaceURI: null,
            textContent: k,
            parentElement: node,
            children: [],
            childNodes: [],
            getAttribute: () => null,
          }
        : k
    child.parentElement = node
    node.childNodes.push(child)
    if (child.nodeType === 1) node.children.push(child)
  }
  // textContent the way the DOM computes it (text descendants, in order).
  node.textContent = collectText(node)
  return node
}

function collectText(n: Fake): string {
  if (n.nodeType === 3) return n.textContent ?? ''
  return n.childNodes.map(collectText).join('')
}

describe('canEditElementText — mirrors the server leaf rule', () => {
  it('a text leaf can have its text edited', () => {
    expect(canEditElementText(E('h1', {}, ['Hello']))).toBe(true)
    expect(canEditElementText(E('p', {}, []))).toBe(true)
  })

  it('an element with child elements cannot (use the inner text or the whole-document editor)', () => {
    expect(canEditElementText(E('p', {}, ['Some ', E('b', {}, ['bold']), ' text']))).toBe(false)
  })

  it('void, raw-text and RCDATA elements cannot', () => {
    for (const tag of ['img', 'br', 'hr', 'input', 'script', 'style', 'template', 'textarea', 'title', 'iframe', 'xmp']) {
      expect(canEditElementText(E(tag, {}, [])), tag).toBe(false)
    }
  })

  it('an SVG element needs visible text (a self-closed <rect/> has no content range)', () => {
    expect(canEditElementText(E('rect', {}, [], SVG_NS))).toBe(false)
    expect(canEditElementText(E('text', {}, ['42%'], SVG_NS))).toBe(true)
  })

  it('an element holding editor chrome is not a leaf', () => {
    const wrap = E('span', { 'data-inline-edit-chrome': 'img-wrap' }, [E('img', {}, [])])
    expect(canEditElementText(E('div', {}, [wrap]))).toBe(false)
  })
})

describe('canEditElementStyle', () => {
  it('allows ordinary elements, body and composites', () => {
    expect(canEditElementStyle(E('div', {}, [E('h1', {}, ['x'])]))).toBe(true)
    expect(canEditElementStyle(E('body', {}, []))).toBe(true)
    expect(canEditElementStyle(E('img', {}, []))).toBe(true)
  })
  it('refuses code / CSS / non-rendered elements', () => {
    for (const tag of ['script', 'style', 'template', 'title']) {
      expect(canEditElementStyle(E(tag, {}, [])), tag).toBe(false)
    }
  })
})

// Anti-drift: the client mirror must agree with what applyElementEdit accepts.
// For each stored document the equivalent iframe DOM is built by hand; the
// client says "text field" exactly when the server would not refuse a text edit
// with element-not-text-leaf / element-not-editable.
describe('the client mirror agrees with applyElementEdit (contract)', () => {
  const cases: Array<{ name: string; stored: string; dom: () => { body: Fake; target: Fake } }> = [
    {
      name: 'h1 leaf',
      stored: '<!doctype html><html><head></head><body><h1>Hello</h1></body></html>',
      dom: () => {
        const target = E('h1', {}, ['Hello'])
        return { body: E('body', {}, [target]), target }
      },
    },
    {
      name: 'mixed-content p',
      stored: '<!doctype html><html><head></head><body><p>Some <b>bold</b> text</p></body></html>',
      dom: () => {
        const target = E('p', {}, ['Some ', E('b', {}, ['bold']), ' text'])
        return { body: E('body', {}, [target]), target }
      },
    },
    {
      name: 'img (void)',
      stored: '<!doctype html><html><head></head><body><img src="a.png"></body></html>',
      dom: () => {
        const target = E('img', { src: 'a.png' }, [])
        return { body: E('body', {}, [target]), target }
      },
    },
    {
      name: 'script in body',
      stored: '<!doctype html><html><head></head><body><div>x</div><script>var a</script></body></html>',
      dom: () => {
        const target = E('script', {}, ['var a'])
        return { body: E('body', {}, [E('div', {}, ['x']), target]), target }
      },
    },
    {
      name: 'empty div',
      stored: '<!doctype html><html><head></head><body><div class="shape"></div></body></html>',
      dom: () => {
        const target = E('div', { class: 'shape' }, [])
        return { body: E('body', {}, [target]), target }
      },
    },
    {
      name: 'svg text',
      stored:
        '<!doctype html><html><head></head><body><svg viewBox="0 0 10 10"><text x="1" y="5">42%</text></svg></body></html>',
      dom: () => {
        const target = E('text', { x: '1', y: '5' }, ['42%'], SVG_NS)
        return { body: E('body', {}, [E('svg', { viewBox: '0 0 10 10' }, [target], SVG_NS)]), target }
      },
    },
    {
      name: 'svg self-closed rect',
      stored:
        '<!doctype html><html><head></head><body><svg viewBox="0 0 10 10"><rect width="4" height="4"/></svg></body></html>',
      dom: () => {
        const target = E('rect', { width: '4', height: '4' }, [], SVG_NS)
        return { body: E('body', {}, [E('svg', { viewBox: '0 0 10 10' }, [target], SVG_NS)]), target }
      },
    },
  ]

  for (const c of cases) {
    it(c.name, () => {
      const { body, target } = c.dom()
      const locator = snapshotElementLocator(target, body, 1)
      expect(locator).not.toBeNull()
      const r = applyElementEdit(c.stored, buildElementEditBody(locator!, 'text', 'New'))
      const serverRefusesKind =
        !r.ok && (r.code === 'element-not-text-leaf' || r.code === 'element-not-editable')
      // The locator itself must resolve (no stale / unsupported).
      if (!r.ok) expect(['element-not-text-leaf', 'element-not-editable']).toContain(r.code)
      expect(canEditElementText(target)).toBe(!serverRefusesKind)
    })
  }
})

describe('snapshotElementLocator', () => {
  const h1 = E('h1', {}, ['  Launch   day '])
  const btn = E('button', { 'data-inline-edit-chrome': 'img-btn' }, ['Replace photo'])
  const wrap = E('span', { 'data-inline-edit-chrome': 'img-wrap' }, [E('img', {}, []), btn])
  const body = E('body', {}, [E('section', {}, [wrap, h1])])

  it('carries path, tag, fingerprint text and the base revision the HTML was loaded at', () => {
    expect(snapshotElementLocator(h1, body, 7)).toEqual({
      path: [0, 1],
      tag: 'H1',
      text: '  Launch   day ',
      baseRevisionNumber: 7,
    })
  })

  it('keeps a null base (legacy draft with no pointer)', () => {
    expect(snapshotElementLocator(h1, body, null)?.baseRevisionNumber).toBeNull()
  })

  it('editor chrome is never selectable', () => {
    expect(snapshotElementLocator(btn, body, 1)).toBeNull()
    expect(snapshotElementLocator(wrap, body, 1)).toBeNull()
  })

  it('is a snapshot: later DOM changes do not alter it', () => {
    const p = E('p', {}, ['Before'])
    const b = E('body', {}, [p])
    const snap = snapshotElementLocator(p, b, 1)!
    p.textContent = 'After typing'
    expect(snap.text).toBe('Before')
  })
})

describe('buildElementEditBody', () => {
  it('is exactly the Ruling W5-B payload — no selector, no extra keys', () => {
    const locator = { path: [0], tag: 'H1', text: 'Old', baseRevisionNumber: 2 }
    expect(buildElementEditBody(locator, 'fontSize', '48px')).toEqual({
      mode: 'element',
      locator: { path: [0], tag: 'H1', text: 'Old', baseRevisionNumber: 2 },
      edit: { kind: 'fontSize', value: '48px' },
    })
  })
})

describe('interpretElementEditResponse — every server code maps to one UI outcome', () => {
  it('200 → saved with the new revision number', () => {
    expect(
      interpretElementEditResponse(200, { reply: 'Design updated', revisionId: 'r1', revisionNumber: 4, exportUrl: 'x' }),
    ).toEqual({ kind: 'saved', revisionId: 'r1', revisionNumber: 4 })
  })

  it('409 element-stale → stale (reload + re-select)', () => {
    const o = interpretElementEditResponse(409, { code: 'element-stale', error: 'server says stale' })
    expect(o.kind).toBe('stale')
  })

  it('409 draft-busy → busy, with the server message', () => {
    expect(
      interpretElementEditResponse(409, { code: 'draft-busy', error: 'Another action is already running on this draft' }),
    ).toEqual({ kind: 'busy', message: 'Another action is already running on this draft' })
  })

  it('409 element-unsupported → unsupported (point to the whole-document editor)', () => {
    const o = interpretElementEditResponse(409, { code: 'element-unsupported', error: 'nope' })
    expect(o).toEqual({ kind: 'unsupported', message: 'nope' })
  })

  it('every 400 shows the server message inline', () => {
    for (const code of [
      'invalid-color',
      'invalid-size',
      'invalid-text',
      'element-not-text-leaf',
      'element-not-editable',
      'invalid-element-edit',
    ]) {
      expect(interpretElementEditResponse(400, { code, error: `msg for ${code}` })).toEqual({
        kind: 'invalid',
        code,
        message: `msg for ${code}`,
      })
    }
  })

  it('404 → not-found', () => {
    expect(interpretElementEditResponse(404, { error: 'Draft not found' }).kind).toBe('not-found')
  })

  it('an unknown failure is a generic error carrying the server message when there is one', () => {
    expect(interpretElementEditResponse(500, {})).toEqual({ kind: 'error', message: 'Save failed (500)' })
    expect(interpretElementEditResponse(409, { error: 'odd' })).toEqual({ kind: 'error', message: 'odd' })
    expect(interpretElementEditResponse(409, { code: 'team-choice-required', error: 'pick' })).toEqual({
      kind: 'team-choice-required',
    })
  })
})

describe('postElementEdit', () => {
  const body = buildElementEditBody({ path: [], tag: 'BODY', text: '', baseRevisionNumber: 1 }, 'color', '#fff')

  it('POSTs JSON to the inline-edit route and interprets the reply', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ reply: 'Design updated', revisionId: 'r', revisionNumber: 2, exportUrl: 'u' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const out = await postElementEdit('d1', body, fetchImpl as unknown as typeof fetch)
    expect(out).toEqual({ kind: 'saved', revisionId: 'r', revisionNumber: 2 })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/drafts/d1/inline-edit')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(body)
  })

  it('a non-JSON error body still maps by status', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>oops</html>', { status: 502 }))
    expect(await postElementEdit('d1', body, fetchImpl as unknown as typeof fetch)).toEqual({
      kind: 'error',
      message: 'Save failed (502)',
    })
  })

  it('a network failure is an error, never a throw', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await postElementEdit('d1', body, fetchImpl as unknown as typeof fetch)).toEqual({
      kind: 'error',
      message: 'Failed to fetch',
    })
  })
})

describe('cssColorToHex — seeds the hex picker from a computed colour', () => {
  it('converts rgb()/rgba() and short hex', () => {
    expect(cssColorToHex('rgb(2, 132, 199)')).toBe('#0284c7')
    expect(cssColorToHex('rgba(255, 255, 255, 0.5)')).toBe('#ffffff')
    expect(cssColorToHex('#ABC')).toBe('#aabbcc')
    expect(cssColorToHex('#0284C7')).toBe('#0284c7')
  })
  it('a fully transparent or unparseable colour has no hex', () => {
    expect(cssColorToHex('rgba(0, 0, 0, 0)')).toBeNull()
    expect(cssColorToHex('transparent')).toBeNull()
    expect(cssColorToHex('color(srgb 1 0 0)')).toBeNull()
    expect(cssColorToHex('')).toBeNull()
  })
})

describe('resolveEditorPath — re-selects the same element in a reloaded document', () => {
  const img = E('img', {}, [])
  const btn = E('button', { 'data-inline-edit-chrome': 'img-btn' }, ['Replace photo'])
  const wrap = E('span', { 'data-inline-edit-chrome': 'img-wrap' }, [img, btn])
  const h1 = E('h1', {}, ['Hi'])
  const card = E('div', {}, [wrap, h1])
  const p = E('p', {}, ['World'])
  const body = E('body', {}, [E('div', { 'data-inline-edit-chrome': 'banner' }, ['x']), card, p])

  it('is the inverse of snapshotElementLocator (chrome transparent)', () => {
    for (const el of [body, card, img, h1, p]) {
      const loc = snapshotElementLocator(el, body, 1)!
      expect(resolveEditorPath(body, loc.path)).toBe(el)
    }
  })

  it('a path that no longer resolves is null', () => {
    expect(resolveEditorPath(body, [5])).toBeNull()
    expect(resolveEditorPath(body, [1, 0])).toBeNull()
  })
})

// Fix round 1 (review of 783c3d56): keyboard navigation and alpha-preserving seeds.

describe('relativeElementPath — keyboard navigation over the stored-HTML tree', () => {
  const img = E('img', {}, [])
  const btn = E('button', { 'data-inline-edit-chrome': 'img-btn' }, ['Replace photo'])
  const wrap = E('span', { 'data-inline-edit-chrome': 'img-wrap' }, [img, btn])
  const h1 = E('h1', {}, ['Hi'])
  const card = E('div', {}, [wrap, h1])
  const p = E('p', {}, ['World'])
  const banner = E('div', { 'data-inline-edit-chrome': 'banner' }, ['x'])
  const body = E('body', {}, [banner, card, p])
  const at = (el: Fake) => snapshotElementLocator(el, body, 1)!.path
  const go = (el: Fake, dir: Parameters<typeof relativeElementPath>[2]) => {
    const next = relativeElementPath(body, at(el), dir)
    return next === null ? null : resolveEditorPath(body, next)
  }

  it('parent, first child, previous and next follow the stored-HTML tree', () => {
    expect(go(body, 'firstChild')).toBe(card)
    expect(go(card, 'next')).toBe(p)
    expect(go(p, 'previous')).toBe(card)
    expect(go(card, 'firstChild')).toBe(img)
    expect(go(img, 'next')).toBe(h1)
    expect(go(img, 'parent')).toBe(card)
    expect(go(card, 'parent')).toBe(body)
  })

  it('never reaches editor chrome: img-wrap is transparent, the button and banner are skipped', () => {
    for (const el of [body, card, img, h1, p]) {
      for (const dir of ['parent', 'firstChild', 'previous', 'next'] as const) {
        const hit = go(el, dir)
        if (hit) expect(hit.getAttribute('data-inline-edit-chrome')).toBeNull()
      }
    }
    expect(go(h1, 'next')).toBeNull() // the Replace-photo button is not a sibling
    expect(go(body, 'firstChild')).not.toBe(banner)
  })

  it('is null at the edges', () => {
    expect(relativeElementPath(body, [], 'parent')).toBeNull()
    expect(relativeElementPath(body, [], 'next')).toBeNull()
    expect(relativeElementPath(body, [], 'previous')).toBeNull()
    expect(go(card, 'previous')).toBeNull()
    expect(go(p, 'next')).toBeNull()
    expect(go(h1, 'firstChild')).toBeNull()
  })
})

describe('seedColorValue — the field and swatch seeds for a computed colour', () => {
  it('an opaque colour seeds hex', () => {
    expect(seedColorValue('rgb(2, 132, 199)')).toEqual({ text: '#0284c7', swatch: '#0284c7' })
  })

  it('a translucent colour keeps its alpha, so an unchanged Apply does not make it opaque', () => {
    const seed = seedColorValue('rgba(255, 0, 0, 0.5)')
    expect(seed).toEqual({ text: 'rgba(255, 0, 0, 0.5)', swatch: '#ff0000' })
    expect(parseColor(seed.text)).toBe('rgba(255, 0, 0, 0.5)')
  })

  it('a long computed alpha is rounded into the server grammar (at most 4 decimals)', () => {
    const seed = seedColorValue('rgba(10, 20, 30, 0.498039)')
    expect(seed.text).toBe('rgba(10, 20, 30, 0.498)')
    expect(parseColor(seed.text)).not.toBeNull()
  })

  it('a transparent or unreadable colour seeds nothing (no fake black swatch)', () => {
    expect(seedColorValue('rgba(0, 0, 0, 0)')).toEqual({ text: '', swatch: null })
    expect(seedColorValue('transparent')).toEqual({ text: '', swatch: null })
    expect(seedColorValue('color(srgb 1 0 0)')).toEqual({ text: '', swatch: null })
  })
})
