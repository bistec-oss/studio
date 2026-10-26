// Code injects the post fonts (031 FR-22, design 5.4). Pure: no I/O, no catalogue import (the
// URL builder is an argument), so it is unit-tested on strings and safe anywhere.
//
// applyPostFonts does two things to a stored design document:
//   1. one `<link rel="stylesheet" data-post-fonts href="…">` at the start of `<head>` (a `<head>`
//      is created when missing), replacing every earlier marked link;
//   2. each script family is added to every `font-family` declaration, and to every custom
//      property whose name contains `font` (for example `--font-heading`), in `<style>` blocks and
//      quoted `style` attributes: before a trailing generic keyword, or at the end.
//
// It is a small scanner, not a regex over the document. Anything it cannot follow (an unclosed
// comment, string or tag, a value with a comment in it, a value that is not a list of family
// names) is left exactly as it was: the rule is that it never corrupts a document. It is
// idempotent: a second run returns the same string.

export interface PostFontPlan {
  /** Catalogue families of the kit's fonts, in kit order (the request only). */
  families: string[]
  /** The kit's script fonts (031 FR-21), added to the stacks and to the request. */
  scriptFamilies: string[]
}

export const POST_FONTS_MARKER = 'data-post-fonts'

interface Edit {
  start: number
  end: number
  text: string
}

// The generic family keywords a family is inserted before (CSS Fonts 4).
const GENERIC = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong',
])
// CSS-wide keywords: a value that is one of them cannot take a list.
const CSS_WIDE = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer'])
// A custom property named like a font property but holding something else (`--font-size`,
// `--font-weight-bold`) is never extended. `display` and `line` are not on the list: `--font-display`,
// `--font-headline` and `--font-inline` name heading families (031 T7 review); `--font-line-height`
// still matches `height`.
const CUSTOM_NOT_FAMILY =
  /size|weight|style|stretch|variant|height|spacing|feature|kerning|synthesis|optical|palette|smooth|scale|colou?r|width|letter|transform|decoration|shadow|lh|leading|tracking/
// A single keyword that is a font value but not a family (`--font-bold: bold`).
const NOT_FAMILY_VALUE = new Set(['normal', 'bold', 'bolder', 'lighter', 'italic', 'oblique', 'small-caps', 'none', 'auto'])
// Elements whose content is not markup: their text is never scanned for tags.
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'noscript', 'noembed', 'noframes', 'iframe', 'plaintext'])

const IDENT_WORD = /^-?[A-Za-z_\u0080-￿][\w\u0080-￿-]*$/
const QUOTED = /^(?:"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*')$/
const VAR_ONLY = /^var\(\s*--[\w-]+\s*(?:,[^()]*)?\)$/

// ── The CSS half ──────────────────────────────────────────────────────────────

// The index just past the string that starts at `i` (a quote), or -1 when it never closes.
function skipString(css: string, i: number): number {
  const q = css[i]
  for (let j = i + 1; j < css.length; j++) {
    const c = css[j]
    if (c === '\\') {
      j++
      continue
    }
    if (c === q) return j + 1
    if (c === '\n') return -1 // an unescaped newline ends a CSS string as bad-string
  }
  return -1
}

// From `start`, to the first `;`, `}` or `{` at paren depth 0, skipping comments and strings.
// null: a comment or string that never closes.
function scanValue(css: string, start: number): { end: number; term: ';' | '}' | '{' | null } | null {
  let depth = 0
  let i = start
  while (i < css.length) {
    const c = css[i]
    if (c === '/' && css[i + 1] === '*') {
      const e = css.indexOf('*/', i + 2)
      if (e < 0) return null
      i = e + 2
      continue
    }
    if (c === '"' || c === "'") {
      const e = skipString(css, i)
      if (e < 0) return null
      i = e
      continue
    }
    if (c === '(') depth++
    else if (c === ')') depth = Math.max(0, depth - 1)
    else if (depth === 0 && (c === ';' || c === '}' || c === '{')) return { end: i, term: c }
    i++
  }
  return { end: css.length, term: null }
}

// The top-level comma items of a value, with their offsets in it.
function splitItems(value: string): Array<{ start: number; end: number }> | null {
  const items: Array<{ start: number; end: number }> = []
  let depth = 0
  let from = 0
  let i = 0
  while (i < value.length) {
    const c = value[i]
    if (c === '"' || c === "'") {
      const e = skipString(value, i)
      if (e < 0) return null
      i = e
      continue
    }
    if (c === '(') depth++
    else if (c === ')') depth = Math.max(0, depth - 1)
    else if (c === ',' && depth === 0) {
      items.push({ start: from, end: i })
      from = i + 1
    }
    i++
  }
  items.push({ start: from, end: value.length })
  return items
}

function unquote(s: string): string {
  return QUOTED.test(s) ? s.slice(1, -1).replace(/\\([\s\S])/g, '$1') : s
}

// The comparison form of a family name: quotes stripped, whitespace collapsed, lower case.
function normFamily(s: string): string {
  return unquote(s.trim()).replace(/\s+/g, ' ').trim().toLowerCase()
}

function isFamilyItem(item: string): boolean {
  if (QUOTED.test(item)) return true
  if (VAR_ONLY.test(item)) return true
  const words = item.split(/\s+/)
  return words.length > 0 && words.every((w) => IDENT_WORD.test(w))
}

function formatFamily(name: string, quote: string): string {
  const lower = name.toLowerCase()
  if (/^[A-Za-z][A-Za-z-]*$/.test(name) && !GENERIC.has(lower) && !CSS_WIDE.has(lower) && lower !== 'default') {
    return name
  }
  return `${quote}${name.replace(/\\/g, '\\\\').split(quote).join(`\\${quote}`)}${quote}`
}

function isTargetProperty(name: string): 'font-family' | 'custom' | null {
  const lower = name.toLowerCase()
  if (lower === 'font-family') return 'font-family'
  if (/^--[\w-]*font[\w-]*$/i.test(name) && !CUSTOM_NOT_FAMILY.test(lower)) return 'custom'
  return null
}

// The edit that extends one declaration value (css[vs..ve]), or null for no change.
function extendValue(css: string, vs: number, ve: number, families: string[], quote: string, kind: 'font-family' | 'custom'): Edit | null {
  const raw = css.slice(vs, ve)
  if (raw.includes('/*')) return null
  const important = /!\s*important\s*$/i.exec(raw)
  const body = important ? raw.slice(0, important.index) : raw
  if (!body.trim()) return null
  const items = splitItems(body)
  if (!items) return null
  const texts = items.map((it) => body.slice(it.start, it.end).trim())
  if (texts.some((t) => !t || !isFamilyItem(t))) return null
  if (texts.length === 1 && VAR_ONLY.test(texts[0])) return null
  const norms = texts.map(normFamily)
  if (norms.some((n) => CSS_WIDE.has(n))) return null
  if (kind === 'custom' && texts.length === 1 && NOT_FAMILY_VALUE.has(norms[0])) return null

  const have = new Set(norms)
  const add: string[] = []
  for (const f of families) {
    const n = normFamily(f)
    if (!n || have.has(n)) continue
    have.add(n)
    add.push(formatFamily(f, quote))
  }
  if (add.length === 0) return null

  const last = items[items.length - 1]
  const lastText = texts[texts.length - 1]
  const lastLead = body.slice(last.start, last.end).search(/\S/)
  if (!QUOTED.test(lastText) && GENERIC.has(norms[norms.length - 1])) {
    const at = vs + last.start + lastLead
    return { start: at, end: at, text: `${add.join(', ')}, ` }
  }
  const at = vs + last.start + lastLead + lastText.length
  return { start: at, end: at, text: `, ${add.join(', ')}` }
}

function applyEdits(s: string, edits: Edit[]): string {
  if (edits.length === 0) return s
  // By position; at one position an insertion goes before a replacement. An edit that overlaps
  // an earlier one is dropped (defensive: the callers never produce one).
  const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - a.start - (b.end - b.start))
  let out = ''
  let at = 0
  for (const e of sorted) {
    if (e.start < at) continue
    out += s.slice(at, e.start) + e.text
    at = e.end
  }
  return out + s.slice(at)
}

/**
 * Adds `families` to the font stacks of a CSS text. `inline` is a `style` attribute's
 * declaration list; otherwise a style sheet, where only declarations inside a rule count and
 * `@font-face` descriptors are never touched. Returns the CSS unchanged when it cannot follow it.
 */
export function extendFontStacks(css: string, families: string[], opts: { inline?: boolean; quote?: "'" | '"' } = {}): string {
  if (families.length === 0) return css
  const inline = !!opts.inline
  const quote = opts.quote ?? "'"
  const edits: Edit[] = []
  // One entry per open block: true when it is an @font-face block.
  const blocks: boolean[] = []
  let declStart = 0
  let depth = 0
  let i = 0
  const n = css.length
  const prelude = (end: number) => css.slice(declStart, end).replace(/\/\*[\s\S]*?\*\//g, '').trim()
  while (i < n) {
    const c = css[i]
    if (c === '/' && css[i + 1] === '*') {
      const e = css.indexOf('*/', i + 2)
      if (e < 0) return css
      i = e + 2
      continue
    }
    if (c === '"' || c === "'") {
      const e = skipString(css, i)
      if (e < 0) return css
      i = e
      continue
    }
    if (c === '(') {
      depth++
      i++
      continue
    }
    if (c === ')') {
      depth = Math.max(0, depth - 1)
      i++
      continue
    }
    if (depth > 0) {
      i++
      continue
    }
    if (c === '{') {
      blocks.push(/^@font-face\b/i.test(prelude(i)))
      declStart = i + 1
      i++
      continue
    }
    if (c === '}') {
      blocks.pop()
      declStart = i + 1
      i++
      continue
    }
    if (c === ';') {
      declStart = i + 1
      i++
      continue
    }
    if (c === ':') {
      const name = prelude(i)
      const v = scanValue(css, i + 1)
      if (!v) return css
      if (v.term === '{') {
        // A selector or an at-rule prelude with a colon in it (`a:hover {`).
        blocks.push(/^@font-face\b/i.test(prelude(v.end)))
        declStart = v.end + 1
        i = v.end + 1
        continue
      }
      const inRule = inline || (blocks.length > 0 && !blocks.some(Boolean))
      const kind = inRule ? isTargetProperty(name) : null
      if (kind) {
        const edit = extendValue(css, i + 1, v.end, families, quote, kind)
        if (edit) edits.push(edit)
      }
      i = v.end
      if (v.term === null) break
      continue
    }
    i++
  }
  return applyEdits(css, edits)
}

// ── The HTML half ─────────────────────────────────────────────────────────────

interface StartTag {
  name: string
  start: number
  end: number
  attrs: Array<{ name: string; valueStart: number; valueEnd: number; quote: '"' | "'" | null }>
}

interface HtmlScan {
  tags: StartTag[]
  /** [start, end) of each `<style>` body. */
  styleBodies: Array<[number, number]>
  doctypeEnd: number | null
}

// Parses one start tag at `lt`; null when it never closes (the rest is left alone).
function parseStartTag(html: string, lt: number): StartTag | null {
  const n = html.length
  let j = lt + 1
  while (j < n && !/[\s/>]/.test(html[j])) j++
  const name = html.slice(lt + 1, j).toLowerCase()
  const attrs: StartTag['attrs'] = []
  while (j < n) {
    while (j < n && /[\s/]/.test(html[j])) j++
    if (j >= n) return null
    if (html[j] === '>') return { name, start: lt, end: j + 1, attrs }
    const ns = j
    // An attribute name may start with `=`; it runs to whitespace, `/`, `>` or `=`.
    j++
    while (j < n && !/[\s/>=]/.test(html[j])) j++
    const attrName = html.slice(ns, j).toLowerCase()
    let k = j
    while (k < n && /\s/.test(html[k])) k++
    if (html[k] !== '=') {
      attrs.push({ name: attrName, valueStart: j, valueEnd: j, quote: null })
      continue
    }
    k++
    while (k < n && /\s/.test(html[k])) k++
    if (k >= n) return null
    const q = html[k]
    if (q === '"' || q === "'") {
      const close = html.indexOf(q, k + 1)
      if (close < 0) return null
      attrs.push({ name: attrName, valueStart: k + 1, valueEnd: close, quote: q })
      j = close + 1
    } else {
      let e = k
      while (e < n && !/[\s>]/.test(html[e])) e++
      attrs.push({ name: attrName, valueStart: k, valueEnd: e, quote: null })
      j = e
    }
  }
  return null
}

function scanHtml(html: string): HtmlScan {
  const tags: StartTag[] = []
  const styleBodies: Array<[number, number]> = []
  let doctypeEnd: number | null = null
  const n = html.length
  let i = 0
  while (i < n) {
    const lt = html.indexOf('<', i)
    if (lt < 0) break
    if (html.startsWith('<!--', lt)) {
      const e = html.indexOf('-->', lt + 4)
      if (e < 0) break
      i = e + 3
      continue
    }
    const next = html[lt + 1] ?? ''
    if (next === '!' || next === '?' || next === '/') {
      const e = html.indexOf('>', lt)
      if (e < 0) break
      if (doctypeEnd === null && /^<!doctype/i.test(html.slice(lt, lt + 9))) doctypeEnd = e + 1
      i = e + 1
      continue
    }
    if (!/[A-Za-z]/.test(next)) {
      i = lt + 1
      continue
    }
    const tag = parseStartTag(html, lt)
    if (!tag) break
    tags.push(tag)
    i = tag.end
    if (RAW_TEXT.has(tag.name)) {
      const re = new RegExp(`</${tag.name}[\\s/>]`, 'gi')
      re.lastIndex = tag.end
      const m = re.exec(html)
      const close = m ? m.index : n
      if (tag.name === 'style') styleBodies.push([tag.end, close])
      i = close
    }
  }
  return { tags, styleBodies, doctypeEnd }
}

// The quote entities an attribute value may carry. A value with any other `&` is left alone.
const QUOTE_ENTITIES: Array<[RegExp, string]> = [
  [/&quot;|&#0*34;|&#x0*22;/gi, '"'],
  [/&apos;|&#0*39;|&#x0*27;/gi, "'"],
]

function rewriteStyleAttribute(value: string, delim: '"' | "'", families: string[]): string {
  let decoded = value
  for (const [re, ch] of QUOTE_ENTITIES) decoded = decoded.replace(re, ch)
  if (decoded.includes('&')) return value
  const quote = delim === '"' ? "'" : '"'
  const out = extendFontStacks(decoded, families, { inline: true, quote })
  if (out === decoded) return value
  // Only the delimiter needs an entity inside the attribute.
  return out.split(delim).join(delim === '"' ? '&quot;' : '&#39;')
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function decodeAttr(s: string): string {
  return s
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
}

function uniq(list: string[]): string[] {
  return [...new Set(list.filter((f) => typeof f === 'string' && f.trim()))]
}

/**
 * The marked link plus the script families in every font stack (031 FR-22). `url` builds the
 * request for the families (googleFontsUrl with the catalogue lookup). An empty plan returns the
 * document unchanged.
 */
export function applyPostFonts(html: string, plan: PostFontPlan, url: (families: string[]) => string): string {
  const scriptFamilies = uniq(plan.scriptFamilies)
  const requested = uniq([...plan.families, ...scriptFamilies])
  if (requested.length === 0) return html

  const scan = scanHtml(html)
  const edits: Edit[] = []
  const marked = scan.tags.filter((t) => t.name === 'link' && t.attrs.some((a) => a.name === POST_FONTS_MARKER))

  if (scriptFamilies.length > 0) {
    for (const [start, end] of scan.styleBodies) {
      const body = html.slice(start, end)
      const out = extendFontStacks(body, scriptFamilies)
      if (out !== body) edits.push({ start, end, text: out })
    }
    for (const tag of scan.tags) {
      if (marked.includes(tag)) continue
      for (const a of tag.attrs) {
        if (a.name !== 'style' || !a.quote) continue
        const value = html.slice(a.valueStart, a.valueEnd)
        const out = rewriteStyleAttribute(value, a.quote, scriptFamilies)
        if (out !== value) edits.push({ start: a.valueStart, end: a.valueEnd, text: out })
      }
    }
  }

  // Every earlier marked link goes; one new link opens <head>.
  for (const tag of marked) edits.push({ start: tag.start, end: tag.end, text: '' })
  const link = `<link rel="stylesheet" ${POST_FONTS_MARKER} href="${escapeAttr(url(requested))}">`
  const head = scan.tags.find((t) => t.name === 'head')
  const htmlTag = scan.tags.find((t) => t.name === 'html')
  if (head) edits.push({ start: head.end, end: head.end, text: link })
  else if (htmlTag) edits.push({ start: htmlTag.end, end: htmlTag.end, text: `<head>${link}</head>` })
  else if (scan.doctypeEnd !== null) edits.push({ start: scan.doctypeEnd, end: scan.doctypeEnd, text: `<head>${link}</head>` })
  else edits.push({ start: 0, end: 0, text: `<head>${link}</head>` })

  return applyEdits(html, edits)
}

/** The families named by the marked link's request (031 FR-24): `family` params, axis stripped. */
export function postFontFamiliesFromHtml(html: string): string[] {
  const tag = scanHtml(html).tags.find((t) => t.name === 'link' && t.attrs.some((a) => a.name === POST_FONTS_MARKER))
  const href = tag?.attrs.find((a) => a.name === 'href')
  if (!tag || !href) return []
  return familiesFromFontsHref(decodeAttr(html.slice(href.valueStart, href.valueEnd)))
}

/** `family` params of a css2 URL, with the `:axis@…` part stripped; [] on anything unparsable. */
export function familiesFromFontsHref(href: string): string[] {
  try {
    const fams = new URL(href).searchParams.getAll('family').map((f) => f.split(':')[0].trim())
    return uniq(fams)
  } catch {
    return []
  }
}
