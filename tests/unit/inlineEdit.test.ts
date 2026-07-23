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
