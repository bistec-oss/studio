import { describe, it, expect } from 'vitest'
import {
  sanitizeInlineHtml,
  stripEditingChrome,
  inlineEditBlockReason,
} from '@/lib/drafts/inlineEdit'

describe('sanitizeInlineHtml', () => {
  it('strips <script> elements but keeps surrounding markup and text', () => {
    const out = sanitizeInlineHtml('<div>Hello<script>alert(1)</script><p>World</p></div>')
    expect(out).not.toMatch(/<script/i)
    expect(out).not.toContain('alert(1)')
    expect(out).toContain('Hello')
    expect(out).toContain('<p>World</p>')
  })

  it('strips on* event-handler attributes but keeps other attributes', () => {
    const out = sanitizeInlineHtml(
      '<img src="https://cdn.example.com/a.png" onerror="steal()" alt="x">',
    )
    expect(out).not.toMatch(/onerror/i)
    expect(out).not.toContain('steal()')
    expect(out).toContain('src="https://cdn.example.com/a.png"')
    expect(out).toContain('alt="x"')
  })

  it('leaves clean HTML unchanged in substance', () => {
    const clean = '<section><h1>Title</h1><p>Body</p></section>'
    expect(sanitizeInlineHtml(clean)).toContain('<h1>Title</h1>')
  })
})

describe('stripEditingChrome', () => {
  // F2: the paste-wired marker used to be a DOM attribute on <body> and leaked
  // into the saved HTML, which then suppressed the paste/dirty listeners on
  // every later open of that document.
  it('strips only the exact attribute names, never a longer name or plain text', () => {
    expect(stripEditingChrome('<body data-inline-edit-paste-wired-extra="2">x</body>')).toBe(
      '<body data-inline-edit-paste-wired-extra="2">x</body>',
    )
    expect(stripEditingChrome('<p contenteditable-hint="a">x</p>')).toBe('<p contenteditable-hint="a">x</p>')
    expect(stripEditingChrome('<p>see data-inline-edit-paste-wiredness</p>')).toBe(
      '<p>see data-inline-edit-paste-wiredness</p>',
    )
    expect(stripEditingChrome('<p contenteditable/>')).toBe('<p/>')
  })

  it('removes the paste-wired marker from <body>', () => {
    const out = stripEditingChrome('<body data-inline-edit-paste-wired="1" style="margin:0"><p>Hi</p></body>')
    expect(out).not.toContain('data-inline-edit-paste-wired')
    expect(out).toContain('<body style="margin:0">')
    expect(stripEditingChrome("<body data-inline-edit-paste-wired='1'>x</body>")).toBe('<body>x</body>')
    expect(stripEditingChrome('<body data-inline-edit-paste-wired>x</body>')).toBe('<body>x</body>')
  })

  it('removes contenteditable attributes', () => {
    const out = stripEditingChrome('<p contenteditable="true">Hi</p>')
    expect(out).not.toContain('contenteditable')
    expect(out).toContain('Hi')
  })

  it('removes the injected editor style block and banner', () => {
    const html =
      '<style id="inline-edit-style">.x{}</style>' +
      '<div data-inline-edit-chrome="banner">Click any text…</div>' +
      '<h1>Real content</h1>'
    const out = stripEditingChrome(html)
    expect(out).not.toContain('inline-edit-style')
    expect(out).not.toContain('data-inline-edit-chrome')
    expect(out).not.toContain('Click any text')
    expect(out).toContain('<h1>Real content</h1>')
  })

  it('unwraps replace-photo wrappers, keeping the img', () => {
    const html =
      '<span data-inline-edit-chrome="img-wrap"><img src="https://cdn.example.com/a.png"></span>'
    const out = stripEditingChrome(html)
    expect(out).not.toContain('data-inline-edit-chrome')
    expect(out).toContain('<img src="https://cdn.example.com/a.png">')
  })

  it('removes the replace-photo button and unwraps the img (real injected structure)', () => {
    const html =
      '<span data-inline-edit-chrome="img-wrap">' +
      '<img src="https://cdn.example.com/a.png">' +
      '<button data-inline-edit-chrome="img-btn" class="inline-replace-btn">Replace photo</button>' +
      '</span>'
    const out = stripEditingChrome(html)
    expect(out).toContain('<img src="https://cdn.example.com/a.png">')
    expect(out).not.toContain('Replace photo')
    expect(out).not.toContain('<button')
    expect(out).not.toContain('data-inline-edit-chrome')
  })
})

describe('inlineEditBlockReason', () => {
  it('allows an EXPORTED draft with no pending action', () => {
    expect(inlineEditBlockReason('EXPORTED', null)).toBeNull()
  })

  it('allows a PUBLISHED draft', () => {
    expect(inlineEditBlockReason('PUBLISHED', null)).toBeNull()
  })

  it('blocks when an action is pending', () => {
    expect(inlineEditBlockReason('EXPORTED', 'REFINE')).toMatch(/already running/i)
  })

  it('blocks a non-exported draft', () => {
    expect(inlineEditBlockReason('IN_PROGRESS', null)).toMatch(/exported/i)
  })
})
