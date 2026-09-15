import { describe, it, expect } from 'vitest'
import {
  sanitizeInlineHtml,
  stripEditingChrome,
  inlineEditBlockReason,
  escapeElementText,
  parseElementColor,
  parseElementSize,
  ELEMENT_SIZE_UNITS,
  type ParsedCssValue,
} from '@/lib/drafts/inlineEdit'

// Helpers that assert on the discriminated union without `as` casts, so a
// rejection can never be read as an accepted value by the tests either.
function accepted(result: ParsedCssValue): string {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(`expected acceptance, rejected: ${result.reason}`)
  return result.value
}

function rejected(result: ParsedCssValue): string {
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error(`expected rejection, accepted: ${result.value}`)
  return result.reason
}

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

describe('escapeElementText (FR-15)', () => {
  it('AC-21: a <script> payload becomes literal visible text, not an element', () => {
    const out = escapeElementText('<script>alert(1)</script>')
    // No tag-opening character survives, so the browser cannot start an element.
    expect(out).not.toContain('<')
    expect(out).not.toContain('>')
    expect(out).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
    // And it is still READABLE: the user sees what they typed.
    expect(out).toContain('script')
    expect(out).toContain('alert(1)')
  })

  it('escapes & first, so a literal < is not double-escaped', () => {
    // The ordering trap: replacing < before & would yield "&amp;lt;", which
    // renders as the string "&lt;" instead of "<".
    expect(escapeElementText('<')).toBe('&lt;')
    expect(escapeElementText('a & b')).toBe('a &amp; b')
    expect(escapeElementText('&lt;')).toBe('&amp;lt;')
    expect(escapeElementText('&amp;')).toBe('&amp;amp;')
  })

  it('escapes both quote characters so the output is safe in a quoted attribute', () => {
    expect(escapeElementText('say "hi"')).toBe('say &quot;hi&quot;')
    expect(escapeElementText("it's")).toBe('it&#39;s')
    const out = escapeElementText('" onerror="alert(1)')
    expect(out).not.toContain('"')
    expect(out).toContain('onerror') // present as text, inert as an attribute
  })

  it('cannot close an attribute or a tag from inside an injected value', () => {
    const out = escapeElementText('"><img src=x onerror=alert(1)>')
    expect(out).not.toMatch(/[<>"]/)
  })

  it('leaves plain text and non-Latin text untouched', () => {
    expect(escapeElementText('Industry Readiness Programme')).toBe(
      'Industry Readiness Programme',
    )
    expect(escapeElementText('සිංහල')).toBe('සිංහල')
    expect(escapeElementText('emoji ★ ok')).toBe('emoji ★ ok')
  })

  it('does not decode unicode or HTML escapes in the input — they stay literal', () => {
    // A \u003c in the user's typing is six characters, not a "<". Nothing here
    // unescapes anything, so no escape form can become markup.
    expect(escapeElementText('\\u003cscript\\u003e')).toBe('\\u003cscript\\u003e')
    expect(escapeElementText('&#60;script&#62;')).toBe('&amp;#60;script&amp;#62;')
    expect(escapeElementText('&#x3c;script&#x3e;')).toBe('&amp;#x3c;script&amp;#x3e;')
  })

  it('is total — empty input and whitespace round-trip unchanged', () => {
    expect(escapeElementText('')).toBe('')
    expect(escapeElementText('  \n  ')).toBe('  \n  ')
  })
})

describe('parseElementColor (FR-16)', () => {
  it('AC-22: rejects the exact reported break-out string, writing no declaration', () => {
    const result = parseElementColor('red; background: url(http://evil.test/x)')
    const reason = rejected(result)
    // The rejection reason must not reflect the payload back into the UI/logs.
    expect(reason).not.toContain('evil.test')
    expect(reason).not.toContain('url(')
  })

  it('AC-22 (dissected): rejected on BOTH gates independently', () => {
    // 1. Not a colour token at all — the grammar alone refuses it.
    rejected(parseElementColor('red; background: teal'))
    // 2. Contains url( — the independent deny-gate alone refuses it.
    rejected(parseElementColor('url(http://evil.test/x)'))
  })

  it('refuses url( in every casing and spacing variant', () => {
    for (const v of [
      'url(http://evil.test/x)',
      'URL(http://evil.test/x)',
      'Url(http://evil.test/x)',
      'url (http://evil.test/x)',
      'url\t(http://evil.test/x)',
      'url\n(http://evil.test/x)',
      '#ff0000 url(http://evil.test/x)',
      'rgb(0,0,0) url(x)',
    ]) {
      rejected(parseElementColor(v))
    }
  })

  it('refuses CSS-escaped url( — not by decoding it, but because it fails the grammar', () => {
    // Nothing here unescapes CSS. A backslash has no position in any accepted
    // value, so an escaped payload is refused as a whole rather than decoded.
    rejected(parseElementColor('\\75 rl(http://evil.test/x)'))
    rejected(parseElementColor('\\000075rl(http://evil.test/x)'))
    rejected(parseElementColor('#ff0000\\'))
  })

  it('refuses comment, semicolon, brace, newline and at-rule tricks', () => {
    for (const v of [
      '#ff0000/*}*/;color:blue',
      '/*x*/#ff0000',
      '#ff0000;',
      '#ff0000; }',
      '}body{background:black',
      '#ff0000\n;background:blue',
      '#ff0000\r\ncolor:blue',
      'red !important',
      'expression(alert(1))',
      'var(--brand)',
      'calc(1)',
      'image-set(x)',
      '@import "x"',
    ]) {
      rejected(parseElementColor(v))
    }
  })

  it('anchors the whole string — no trailing newline slips past $', () => {
    // JS `$` (without /m) does not match before a trailing newline, unlike some
    // other regex flavours. Trimming covers the ends; this pins the behaviour.
    expect(accepted(parseElementColor('#ff0000\n'))).toBe('#ff0000')
    expect(accepted(parseElementColor('  #ff0000  '))).toBe('#ff0000')
    rejected(parseElementColor('#ff0000\nx'))
  })

  it('accepts hex and re-serializes it to lowercase #rrggbb', () => {
    expect(accepted(parseElementColor('#ff0000'))).toBe('#ff0000')
    expect(accepted(parseElementColor('#FF0000'))).toBe('#ff0000')
    expect(accepted(parseElementColor('#ABC'))).toBe('#aabbcc')
    expect(accepted(parseElementColor('#1a2b3c'))).toBe('#1a2b3c')
  })

  it('rejects alpha hex and every other hex length', () => {
    for (const v of ['#ff0000ff', '#abcd', '#ff', '#ff00', '#ff00000', '#', '#ggg', 'ff0000']) {
      rejected(parseElementColor(v))
    }
  })

  it('accepts rgb()/rgba() and re-serializes with normalized channels', () => {
    expect(accepted(parseElementColor('rgb(255,0,0)'))).toBe('rgb(255, 0, 0)')
    expect(accepted(parseElementColor('RGB( 255 , 0 , 0 )'))).toBe('rgb(255, 0, 0)')
    expect(accepted(parseElementColor('rgb(007,0,0)'))).toBe('rgb(7, 0, 0)')
    // alpha of exactly 1 collapses to the rgb() form
    expect(accepted(parseElementColor('rgba(0,0,0,1)'))).toBe('rgb(0, 0, 0)')
    expect(accepted(parseElementColor('rgba(0,0,0,0.5)'))).toBe('rgba(0, 0, 0, 0.5)')
    expect(accepted(parseElementColor('rgba(0,0,0,.5)'))).toBe('rgba(0, 0, 0, 0.5)')
    expect(accepted(parseElementColor('rgba(0,0,0,0)'))).toBe('rgba(0, 0, 0, 0)')
  })

  it('rejects out-of-range rgb components and opacity', () => {
    expect(rejected(parseElementColor('rgb(256,0,0)'))).toMatch(/0 and 255/)
    expect(rejected(parseElementColor('rgb(0,999,0)'))).toMatch(/0 and 255/)
    expect(rejected(parseElementColor('rgba(0,0,0,1.5)'))).toMatch(/0 and 1/)
    rejected(parseElementColor('rgb(-1,0,0)'))
    rejected(parseElementColor('rgb(1000,0,0)'))
  })

  it('rejects rgb syntax variants outside the closed grammar', () => {
    for (const v of [
      'rgb(100%, 0%, 0%)', // percentage channels
      'rgb(255 0 0)', // modern space-separated
      'rgb(255 0 0 / 50%)', // modern with slash alpha
      'rgb(255,0)', // too few
      'rgb(255,0,0,0,0)', // too many
      'rgb(255,0,0', // unterminated
      'rgb 255,0,0)',
      'hsl(0, 100%, 50%)',
      'color(display-p3 1 0 0)',
    ]) {
      rejected(parseElementColor(v))
    }
  })

  it('accepts the named allow-list and resolves each name to hex, never echoing it', () => {
    expect(accepted(parseElementColor('red'))).toBe('#ff0000')
    expect(accepted(parseElementColor('RED'))).toBe('#ff0000')
    expect(accepted(parseElementColor(' Navy '))).toBe('#000080')
    expect(accepted(parseElementColor('white'))).toBe('#ffffff')
  })

  it('rejects names outside the allow-list, including prototype keys', () => {
    // A plain-object lookup would make these truthy; the Map removes the class.
    for (const v of [
      'constructor',
      'toString',
      '__proto__',
      'hasOwnProperty',
      'valueOf',
      'rebeccapurple',
      'transparent',
      'currentColor',
      'inherit',
      'initial',
      'unset',
      'chartreuse',
    ]) {
      rejected(parseElementColor(v))
    }
  })

  it('rejects empty, whitespace-only and oversized input', () => {
    expect(rejected(parseElementColor(''))).toMatch(/enter a colour/i)
    rejected(parseElementColor('   '))
    expect(rejected(parseElementColor('#' + 'a'.repeat(200)))).toMatch(/too long/i)
  })
})

describe('parseElementSize (FR-16, AC-23)', () => {
  it('AC-23: rejects a disallowed unit', () => {
    for (const v of ['12pt', '12vh', '12vw', '12ch', '12ex', '12cm', '12in', '12mm', '12q', '12deg']) {
      expect(rejected(parseElementSize(v))).toMatch(/number and a unit/i)
    }
  })

  it('AC-23: rejects non-numeric values', () => {
    for (const v of ['auto', 'inherit', 'big', 'NaNpx', 'Infinitypx', 'Infinity', 'NaN', 'e', '--px']) {
      rejected(parseElementSize(v))
    }
  })

  it('rejects a missing unit, including bare 0 which CSS would allow', () => {
    expect(rejected(parseElementSize('0'))).toMatch(/number and a unit/i)
    rejected(parseElementSize('24'))
    rejected(parseElementSize('1.5'))
  })

  it('accepts each allowed unit and re-serializes the number', () => {
    expect(accepted(parseElementSize('24px'))).toBe('24px')
    expect(accepted(parseElementSize('1.5rem'))).toBe('1.5rem')
    expect(accepted(parseElementSize('2em'))).toBe('2em')
    expect(accepted(parseElementSize('50%'))).toBe('50%')
    expect(accepted(parseElementSize('0px'))).toBe('0px')
    // Canonicalized, not echoed.
    expect(accepted(parseElementSize('.50rem'))).toBe('0.5rem')
    expect(accepted(parseElementSize('007px'))).toBe('7px')
    expect(accepted(parseElementSize('24.0px'))).toBe('24px')
    expect(accepted(parseElementSize('24PX'))).toBe('24px')
    expect(accepted(parseElementSize(' 24 px '))).toBe('24px')
  })

  it('exposes the same unit set the parser enforces', () => {
    expect([...ELEMENT_SIZE_UNITS]).toEqual(['px', 'rem', 'em', '%'])
    for (const unit of ELEMENT_SIZE_UNITS) {
      expect(accepted(parseElementSize(`12${unit}`))).toBe(`12${unit}`)
    }
  })

  it('rejects negatives and signed numbers', () => {
    for (const v of ['-4px', '- 4px', '+4px', '-0.5rem', '-50%']) {
      rejected(parseElementSize(v))
    }
  })

  it('rejects exponent notation and absurd magnitudes', () => {
    rejected(parseElementSize('1e3px'))
    rejected(parseElementSize('1E3px'))
    expect(rejected(parseElementSize('999999px'))).toMatch(/at most/i)
    expect(accepted(parseElementSize('10000px'))).toBe('10000px')
    rejected(parseElementSize('10001px'))
  })

  it('rejects declaration break-out, url( and trailing garbage', () => {
    for (const v of [
      '24px; background: url(http://evil.test/x)',
      '24px;color:red',
      '24px !important',
      '24px/*}*/',
      '24px}body{x:y',
      'url(http://evil.test/x)',
      'calc(100% - 4px)',
      'var(--size)',
      '24px 24px',
      '24px\ncolor:red',
    ]) {
      rejected(parseElementSize(v))
    }
  })

  it('rejects empty, whitespace-only and oversized input', () => {
    expect(rejected(parseElementSize(''))).toMatch(/enter a size/i)
    rejected(parseElementSize('  '))
    expect(rejected(parseElementSize('1'.repeat(100) + 'px'))).toMatch(/too long/i)
  })

  it('anchors the whole string — a trailing newline is trimmed, not tolerated mid-value', () => {
    expect(accepted(parseElementSize('24px\n'))).toBe('24px')
    rejected(parseElementSize('24px\nx'))
  })
})
