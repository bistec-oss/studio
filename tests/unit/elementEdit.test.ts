// T15 — the element-scoped write path: server-side addressing, the property
// allow-list, and where the escaped text lands.
//
// Split for the same reason refineWiring.test.ts is: everything that decides
// WHAT gets written is pure and exercised for real here, while the parts that
// need a database (the single commitDraftRevision call, the absence of a second
// writer of Draft.htmlContent) live in a route module that cannot be imported
// under vitest, and are asserted against the route's source.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  applyElementEdit,
  findElementMatches,
  setStyleDeclaration,
  ELEMENT_EDITABLE_TAGS,
  ELEMENT_EDIT_KINDS,
  type ElementEditRequest,
  type ElementEditOutcome,
} from '@/lib/drafts/inlineEdit'

// Narrow without casts, so a rejection can never be read as an applied edit by
// the tests either — the same discipline T14's tests use on ParsedCssValue.
function applied(outcome: ElementEditOutcome): { html: string; instruction: string } {
  expect(outcome.ok).toBe(true)
  if (!outcome.ok) throw new Error(`expected an applied edit, rejected: ${outcome.reason}`)
  return { html: outcome.html, instruction: outcome.instruction }
}

function refused(outcome: ElementEditOutcome): { reason: string; status: number } {
  expect(outcome.ok).toBe(false)
  if (outcome.ok) throw new Error(`expected a refusal, applied: ${outcome.html}`)
  return { reason: outcome.reason, status: outcome.status }
}

const req = (over: Partial<ElementEditRequest>): ElementEditRequest => ({
  tag: 'h1',
  text: 'Old headline',
  kind: 'text',
  value: 'New headline',
  ...over,
})

const DOC = '<body><h1 class="hero">Old headline</h1><p>Body copy</p></body>'

// ── Server-side resolution (FR-17, AC-26) ──────────────────────────────────

describe('findElementMatches', () => {
  it('resolves a text-leaf element by the content the user saw', () => {
    const matches = findElementMatches(DOC, 'h1', 'Old headline')
    expect(matches).toHaveLength(1)
    expect(DOC.slice(matches[0].innerStart, matches[0].innerEnd)).toBe('Old headline')
    expect(matches[0].attrs).toBe(' class="hero"')
  })

  it('collapses whitespace on both sides, so pretty-printed source still matches', () => {
    const html = '<p>\n   Hello   there\n</p>'
    expect(findElementMatches(html, 'p', 'Hello there')).toHaveLength(1)
  })

  it('decodes entities in the source so it matches the DOM textContent the client saw', () => {
    const html = '<p>Tom &amp; Jerry &#38; co &nbsp; end</p>'
    expect(findElementMatches(html, 'p', 'Tom & Jerry & co end')).toHaveLength(1)
  })

  it('does not double-decode: &amp;lt; stays the literal text "&lt;"', () => {
    const html = '<p>&amp;lt;</p>'
    expect(findElementMatches(html, 'p', '&lt;')).toHaveLength(1)
    expect(findElementMatches(html, 'p', '<')).toHaveLength(0)
  })

  it('never matches an element that contains a child element (leaf-only)', () => {
    const html = '<div><span>Inner</span></div>'
    // The div holds markup, so it is not addressable at all — only the span is.
    expect(findElementMatches(html, 'div', 'Inner')).toHaveLength(0)
    expect(findElementMatches(html, 'span', 'Inner')).toHaveLength(1)
  })

  it('is case-insensitive about the tag as it appears in the source', () => {
    expect(findElementMatches('<H1>Title</H1>', 'h1', 'Title')).toHaveLength(1)
  })

  it('reports every candidate when the same text appears twice', () => {
    expect(findElementMatches('<p>Same</p><p>Same</p>', 'p', 'Same')).toHaveLength(2)
  })

  it('is not fooled by a longer tag name that starts the same way', () => {
    expect(findElementMatches('<param>x</param>', 'p', 'x')).toHaveLength(0)
  })
})

describe('applyElementEdit — addressing fails closed (AC-25)', () => {
  it('refuses with 409 when the address no longer resolves', () => {
    const r = refused(applyElementEdit(DOC, req({ text: 'A headline that was refined away' })))
    expect(r.status).toBe(409)
    expect(r.reason).toMatch(/no longer in the design/i)
  })

  it('refuses with 409 when two nodes carry the same text, rather than picking one', () => {
    const html = '<p>Same</p><p>Same</p>'
    const r = refused(applyElementEdit(html, req({ tag: 'p', text: 'Same', value: 'Changed' })))
    expect(r.status).toBe(409)
    expect(r.reason).toMatch(/uniquely/i)
  })

  it('a refine that rewrote the markup between sessions cannot land the edit on the wrong node', () => {
    // Session 1 addressed the h1 by its text. A refine then rewrote the design
    // and moved that copy elsewhere. Session 2's save must not write anything.
    const afterRefine = '<body><h1>A completely new headline</h1><p>Old headline</p></body>'
    const r = refused(applyElementEdit(afterRefine, req({ text: 'Old headline' })))
    expect(r.status).toBe(409)
    expect(afterRefine).toBe('<body><h1>A completely new headline</h1><p>Old headline</p></body>')
  })
})

describe('applyElementEdit — no selector is ever the write target (AC-26)', () => {
  it('ignores a selector smuggled into the payload and resolves by content', () => {
    const html = '<body><h1 id="a">Old headline</h1><p id="b">Body copy</p></body>'
    // The extra keys name the <p>. The write must still land on the <h1>, which
    // is the node the CONTENT address resolves to.
    const hostile = {
      ...req({}),
      selector: '#b',
      xpath: '/body/p',
      nodeIndex: 1,
    } as unknown as ElementEditRequest
    const out = applied(applyElementEdit(html, hostile))
    expect(out.html).toBe('<body><h1 id="a">New headline</h1><p id="b">Body copy</p></body>')
  })
})

// ── Text edits land as a text node (FR-15 / AC-21) ─────────────────────────

describe('applyElementEdit — text', () => {
  it('replaces only the clicked node and leaves every other byte alone', () => {
    const out = applied(applyElementEdit(DOC, req({})))
    expect(out.html).toBe('<body><h1 class="hero">New headline</h1><p>Body copy</p></body>')
  })

  it('escapes markup so a <script> payload becomes literal visible text', () => {
    const out = applied(applyElementEdit(DOC, req({ value: '<script>alert(1)</script>' })))
    expect(out.html).not.toMatch(/<script/i)
    expect(out.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('places the escaped run between the opening tag’s > and the closing <', () => {
    const out = applied(applyElementEdit(DOC, req({ value: 'A & B' })))
    // The only safe placement escapeElementText documents. Asserted structurally
    // rather than by eyeballing the string.
    expect(out.html).toContain('<h1 class="hero">A &amp; B</h1>')
  })

  it('does not touch the element’s attributes', () => {
    const out = applied(applyElementEdit(DOC, req({ value: 'x' })))
    expect(out.html).toContain('<h1 class="hero">')
  })

  it('rejects empty text', () => {
    expect(refused(applyElementEdit(DOC, req({ value: '   ' }))).status).toBe(400)
  })

  it('caps the replacement text', () => {
    const r = refused(applyElementEdit(DOC, req({ value: 'x'.repeat(2001) })))
    expect(r.status).toBe(400)
    expect(r.reason).toMatch(/too long/i)
  })
})

// ── The property allow-list (FR-16 / AC-22 / AC-23) ────────────────────────

describe('applyElementEdit — property allow-list', () => {
  it('maps colour through the colour parser and re-serializes it', () => {
    const out = applied(applyElementEdit(DOC, req({ kind: 'color', value: '#ABC' })))
    expect(out.html).toContain('<h1 class="hero" style="color: #aabbcc">')
    expect(out.html).toContain('>Old headline</h1>')
  })

  it('maps fontSize through the size parser and onto font-size', () => {
    const out = applied(applyElementEdit(DOC, req({ kind: 'fontSize', value: '24 PX' })))
    expect(out.html).toContain('style="font-size: 24px"')
  })

  it('rejects a colour that tries to break out of the declaration (AC-22)', () => {
    const r = refused(
      applyElementEdit(
        DOC,
        req({ kind: 'color', value: 'red; background: url(http://evil.test/x)' }),
      ),
    )
    expect(r.status).toBe(400)
  })

  it('writes nothing at all when the colour is rejected', () => {
    const outcome = applyElementEdit(DOC, req({ kind: 'color', value: 'red; background: url(x)' }))
    expect(outcome.ok).toBe(false)
    expect(DOC).toBe('<body><h1 class="hero">Old headline</h1><p>Body copy</p></body>')
  })

  it('rejects a size with a disallowed unit or no unit (AC-23)', () => {
    expect(refused(applyElementEdit(DOC, req({ kind: 'fontSize', value: '10vw' }))).status).toBe(
      400,
    )
    expect(refused(applyElementEdit(DOC, req({ kind: 'fontSize', value: '24' }))).status).toBe(400)
    expect(refused(applyElementEdit(DOC, req({ kind: 'fontSize', value: 'big' }))).status).toBe(400)
  })

  it('rejects any property outside the allow-list — there is no free-form declaration', () => {
    for (const kind of ['background', 'background-image', 'content', 'position', '']) {
      expect(refused(applyElementEdit(DOC, req({ kind, value: '#000000' }))).status).toBe(400)
    }
  })

  it('exposes exactly the three advertised kinds, and every one of them works', () => {
    // T16 builds its picker from this list, so a kind that is advertised but not
    // wired (or wired but not advertised) is caught here rather than in the UI.
    expect([...ELEMENT_EDIT_KINDS]).toEqual(['text', 'color', 'fontSize'])
    const values: Record<string, string> = { text: 'x', color: '#000000', fontSize: '12px' }
    for (const kind of ELEMENT_EDIT_KINDS) {
      applied(applyElementEdit(DOC, req({ kind, value: values[kind] })))
    }
  })

  it('rejects a prototype key as a property name', () => {
    // The lookup is a plain object, so this asserts the guard, not the shape:
    // `constructor` / `__proto__` must not resolve to a rule.
    for (const kind of ['constructor', '__proto__', 'toString']) {
      expect(refused(applyElementEdit(DOC, req({ kind, value: '#000000' }))).status).toBe(400)
    }
  })
})

// ── The tag allow-list ─────────────────────────────────────────────────────

describe('applyElementEdit — tag allow-list', () => {
  it('refuses raw-text elements, where escaping would be meaningless rather than safe', () => {
    for (const tag of ['script', 'style', 'title', 'textarea', 'pre']) {
      expect((ELEMENT_EDITABLE_TAGS as readonly string[]).includes(tag)).toBe(false)
      const html = `<${tag}>secret</${tag}>`
      expect(refused(applyElementEdit(html, req({ tag, text: 'secret', value: 'x' }))).status).toBe(
        400,
      )
    }
  })

  it('refuses an unknown tag rather than building a regex from it', () => {
    expect(refused(applyElementEdit(DOC, req({ tag: 'h1|.*', text: 'Old headline' }))).status).toBe(
      400,
    )
  })

  it('accepts an allow-listed tag in any case', () => {
    applied(applyElementEdit('<P>Hi</P>', req({ tag: 'P', text: 'Hi', value: 'Bye' })))
  })
})

// ── Style-attribute merge ──────────────────────────────────────────────────

describe('setStyleDeclaration', () => {
  it('appends a style attribute when the element has none', () => {
    const r = setStyleDeclaration(' class="hero"', 'color', '#000000')
    expect(r).toEqual({ ok: true, attrs: ' class="hero" style="color: #000000"' })
  })

  it('keeps existing unrelated declarations', () => {
    const r = setStyleDeclaration(' style="font-weight: 700; margin: 0"', 'color', '#000000')
    expect(r).toEqual({ ok: true, attrs: ' style="font-weight: 700; margin: 0; color: #000000"' })
  })

  it('replaces an existing declaration of the same property instead of stacking one', () => {
    const r = setStyleDeclaration(' style="COLOR : red ; margin: 0"', 'color', '#000000')
    expect(r).toEqual({ ok: true, attrs: ' style="margin: 0; color: #000000"' })
  })

  it('preserves a single-quoted attribute’s quote character', () => {
    const r = setStyleDeclaration(` style='font-family: "Inter"'`, 'color', '#000000')
    expect(r).toEqual({ ok: true, attrs: ` style='font-family: "Inter"; color: #000000'` })
  })

  it('keeps other attributes on both sides of the style attribute', () => {
    const r = setStyleDeclaration(' id="a" style="margin: 0" data-x="1"', 'color', '#000000')
    expect(r).toEqual({ ok: true, attrs: ' id="a" style="margin: 0; color: #000000" data-x="1"' })
  })

  it('refuses an unquoted style attribute rather than adding a second one', () => {
    const r = setStyleDeclaration(' style=color:red', 'color', '#000000')
    expect(r.ok).toBe(false)
  })

  it('surfaces that refusal as a 409 through applyElementEdit', () => {
    const html = '<p style=color:red>Hi</p>'
    const r = refused(
      applyElementEdit(html, req({ tag: 'p', text: 'Hi', kind: 'color', value: 'blue' })),
    )
    expect(r.status).toBe(409)
  })
})

// ── No address is persisted (FR-18) ────────────────────────────────────────

describe('the instruction carries no address', () => {
  it('names only the kind of edit, never the clicked text or the typed value', () => {
    const text = applied(applyElementEdit(DOC, req({ value: 'SECRET-VALUE' })))
    expect(text.instruction).toBe('Manual element edit (text)')
    const colour = applied(applyElementEdit(DOC, req({ kind: 'color', value: '#abcdef' })))
    expect(colour.instruction).toBe('Manual element edit (colour)')
    const size = applied(applyElementEdit(DOC, req({ kind: 'fontSize', value: '24px' })))
    expect(size.instruction).toBe('Manual element edit (size)')
    for (const out of [text, colour, size]) {
      expect(out.instruction).not.toMatch(/Old headline|SECRET-VALUE|abcdef|24px/)
    }
  })
})

// ── Route wiring: one writer, one revision (FR-19 / AC-24) ─────────────────

describe('inline-edit route source (AC-24 / AC-26)', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/app/api/drafts/[id]/inline-edit/route.ts'),
    'utf8',
  )

  it('commits through commitDraftRevision exactly once, for both modes', () => {
    expect(source.match(/commitDraftRevision\(/g) ?? []).toHaveLength(1)
  })

  it('has no second writer of Draft.htmlContent', () => {
    expect(source).not.toMatch(/htmlContent\s*:/)
    expect(source).not.toMatch(/draft\.update|draft\.updateMany|\$executeRaw/)
  })

  it('reads only html + element off the body, and no selector-shaped field anywhere', () => {
    expect(source).toMatch(/const \{ html, element \} = body\.data/)
    // A property ACCESS, so the AC-26 note in the route's own comment (which
    // names the word) does not make this assertion vacuous.
    expect(source).not.toMatch(/\.\s*(selector|xpath|nodeIndex|nodePath|querySelector)\b/i)
  })

  it('bases the element edit on the stored html, not on the request', () => {
    expect(source).toContain('applyElementEdit(draft.htmlContent, elementEdit)')
  })

  it('keeps the whole-document mode on sanitizeInlineHtml and its own instruction', () => {
    expect(source).toContain("instruction = 'Manual inline edit'")
    expect(source).toMatch(/sanitizeInlineHtml\(wholeDocument\)/)
  })

  it('still refuses to run while another action holds the draft', () => {
    expect(source).toContain('inlineEditBlockReason(draft.status, draft.pendingAction)')
  })
})
