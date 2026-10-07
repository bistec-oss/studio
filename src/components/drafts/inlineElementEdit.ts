// Client half of element-targeted inline editing (change 004 Phase 3, T24).
// Pure and DOM-free, so it can be unit tested. InlineEditModal wires it to the
// editor iframe.
//
// The server is the authority on everything here. See inlineEdit.ts
// (applyElementEdit and the closed grammar) and the element mode of
// /api/drafts/[id]/inline-edit. This module only:
//   - builds the Ruling W5-B locator with the SHARED helpers
//     (editorElementPath / editorFingerprintText), so the client and the server
//     can't disagree on path or fingerprint;
//   - mirrors the leaf rule so the editor offers a text field only where the
//     server would accept one (a mismatch is still refused server-side, with
//     400 element-not-text-leaf / element-not-editable);
//   - maps every response code to one UI outcome.
// Colour and size values are NOT pre-validated here: the server's 400 message
// is what the user sees, so there is one grammar, not two.

import {
  editorElementPath,
  editorFingerprintText,
  TEXT_FORBIDDEN,
  STYLE_FORBIDDEN,
  type EditorDomElement,
  type ElementEditKind,
  type ElementEditRequest,
} from '@/lib/drafts/inlineEdit'
import { VOID_ELEMENTS, asciiLower } from '@/lib/drafts/htmlLocator'

// A DOM element as the editor sees it. A real iframe Element satisfies this.
export type SelectableElement = EditorDomElement & { namespaceURI?: string | null }

export type ElementLocator = ElementEditRequest['locator']

const SVG_NS = 'http://www.w3.org/2000/svg'
const CHROME_ATTR = 'data-inline-edit-chrome'

// TEXT_FORBIDDEN / STYLE_FORBIDDEN are the server's own sets (inlineEdit.ts). The
// contract test in tests/unit/inlineElementEditClient.test.ts also checks the
// rest of the leaf rule against applyElementEdit.

function tagOf(el: SelectableElement): string {
  return asciiLower(el.tagName)
}

// Child elements as the stored HTML has them. Pure chrome (the Replace-photo
// button, the banner) is not content; an img-wrap holds a real <img>, so it
// counts.
function hasContentChildElements(el: SelectableElement): boolean {
  for (let i = 0; i < el.children.length; i++) {
    const chrome = el.children[i].getAttribute(CHROME_ATTR)
    if (chrome === null || chrome === 'img-wrap') return true
  }
  return false
}

function hasDirectText(el: SelectableElement): boolean {
  for (let i = 0; i < el.childNodes.length; i++) {
    const n = el.childNodes[i]
    if (n.nodeType === 3 && (n.textContent ?? '') !== '') return true
  }
  return false
}

// The leaf rule: text can be replaced only on an element with no child
// elements, that has a content range (not void), and whose content is ordinary
// text (not raw text / RCDATA / template).
export function canEditElementText(el: SelectableElement): boolean {
  const tag = tagOf(el)
  if (VOID_ELEMENTS.has(tag) || TEXT_FORBIDDEN.has(tag)) return false
  if (hasContentChildElements(el)) return false
  // A self-closed SVG element (<rect/>) has no content range, and the DOM
  // can't tell it apart from an empty <rect></rect>. Offer text only when the
  // SVG element visibly holds some. An empty explicitly-closed one loses the
  // field, which is harmless.
  if (el.namespaceURI === SVG_NS && !hasDirectText(el)) return false
  return true
}

export function canEditElementStyle(el: SelectableElement): boolean {
  return !STYLE_FORBIDDEN.has(tagOf(el))
}

// The locator for `el`, snapshotted NOW. The fingerprint text describes the
// document as it was loaded, so it must be taken at selection time.
// `baseRevisionNumber` must come from the same GET response whose htmlContent
// is loaded in the iframe. Returns null for editor chrome or a node outside
// <body>; those are never selectable.
export function snapshotElementLocator(
  el: SelectableElement,
  body: SelectableElement,
  baseRevisionNumber: number | null,
): ElementLocator | null {
  const path = editorElementPath(el, body)
  if (path === null) return null
  return { path, tag: el.tagName, text: editorFingerprintText(el), baseRevisionNumber }
}

// Element children as the stored HTML has them (the same rule as
// editorElementPath): an img-wrap is transparent, other chrome is skipped.
function logicalChildren(el: SelectableElement): SelectableElement[] {
  const out: SelectableElement[] = []
  for (let i = 0; i < el.children.length; i++) {
    const c = el.children[i]
    const chrome = c.getAttribute(CHROME_ATTR)
    if (chrome === 'img-wrap') out.push(...logicalChildren(c))
    else if (chrome === null) out.push(c)
  }
  return out
}

// The element at `path` in the editor DOM; null when the path no longer
// resolves. It is the inverse of snapshotElementLocator's path. It is used only
// to re-select the same element in a freshly reloaded document after a save.
// The new locator is then snapshotted from that document, so the address is
// always fresh.
export function resolveEditorPath(body: SelectableElement, path: number[]): SelectableElement | null {
  let cur: SelectableElement = body
  for (const idx of path) {
    const next: SelectableElement | undefined = logicalChildren(cur)[idx]
    if (!next) return null
    cur = next
  }
  return cur
}

export type ElementNavDirection = 'parent' | 'firstChild' | 'previous' | 'next'

// Keyboard navigation (fix round 1). The path of the element one step from
// `path` in direction `dir`, or null when there is none. It walks the same
// chrome-transparent tree as the locator (resolveEditorPath), so it can never
// land on editor chrome, and the element it names is then selected like any
// click: its locator is snapshotted fresh.
export function relativeElementPath(
  body: SelectableElement,
  path: number[],
  dir: ElementNavDirection,
): number[] | null {
  let next: number[]
  if (dir === 'firstChild') {
    next = [...path, 0]
  } else {
    if (path.length === 0) return null // <body> has no parent or siblings
    const last = path[path.length - 1]
    if (dir === 'parent') return path.slice(0, -1)
    if (dir === 'previous' && last === 0) return null
    next = [...path.slice(0, -1), dir === 'previous' ? last - 1 : last + 1]
  }
  return resolveEditorPath(body, next) ? next : null
}

// Exactly the Ruling W5-B body. No selector or target is ever sent; the
// server would strip one anyway (AC-26).
export function buildElementEditBody(
  locator: ElementLocator,
  kind: ElementEditKind,
  value: string,
): ElementEditRequest {
  return {
    mode: 'element',
    locator: {
      path: [...locator.path],
      tag: locator.tag,
      text: locator.text,
      baseRevisionNumber: locator.baseRevisionNumber,
    },
    edit: { kind, value },
  }
}

export type ElementEditOutcome =
  | { kind: 'saved'; revisionId: string; revisionNumber: number | null }
  // 409 element-stale: the design changed. Reload the draft and re-select.
  | { kind: 'stale' }
  // 409 draft-busy: an action is running, or the draft isn't exported.
  | { kind: 'busy'; message: string }
  // 409 element-unsupported: this draft/element can't be edited element by element.
  | { kind: 'unsupported'; message: string }
  // 400 (grammar, leaf rule, schema): show the server's message inline.
  | { kind: 'invalid'; code: string; message: string }
  | { kind: 'not-found' }
  | { kind: 'team-choice-required' }
  | { kind: 'error'; message: string }

const INVALID_CODES = new Set([
  'invalid-color',
  'invalid-size',
  'invalid-text',
  'element-not-text-leaf',
  'element-not-editable',
  'invalid-element-edit',
])

export function interpretElementEditResponse(status: number, body: unknown): ElementEditOutcome {
  const b = (body && typeof body === 'object' ? body : {}) as {
    code?: unknown
    error?: unknown
    revisionId?: unknown
    revisionNumber?: unknown
  }
  const code = typeof b.code === 'string' ? b.code : null
  const message = typeof b.error === 'string' && b.error ? b.error : null

  if (status >= 200 && status < 300 && typeof b.revisionId === 'string') {
    return {
      kind: 'saved',
      revisionId: b.revisionId,
      revisionNumber: typeof b.revisionNumber === 'number' ? b.revisionNumber : null,
    }
  }
  if (status === 404) return { kind: 'not-found' }
  if (status === 409) {
    if (code === 'team-choice-required') return { kind: 'team-choice-required' }
    if (code === 'element-stale') return { kind: 'stale' }
    if (code === 'draft-busy') {
      return { kind: 'busy', message: message ?? 'Another action is already running on this draft' }
    }
    if (code === 'element-unsupported') {
      return {
        kind: 'unsupported',
        message: message ?? "This part of the design can't be edited element-by-element.",
      }
    }
  }
  if (status === 400 && code !== null && INVALID_CODES.has(code)) {
    return { kind: 'invalid', code, message: message ?? 'That value was rejected' }
  }
  return { kind: 'error', message: message ?? `Save failed (${status})` }
}

export async function postElementEdit(
  draftId: string,
  body: ElementEditRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<ElementEditOutcome> {
  try {
    const res = await fetchImpl(`/api/drafts/${draftId}/inline-edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json: unknown = await res.json().catch(() => null)
    return interpretElementEditResponse(res.status, json)
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : 'Save failed' }
  }
}

// A computed CSS colour as #rrggbb, to seed <input type="color">. Returns null
// for a fully transparent colour, or a form the picker can't show (named,
// color(), hsl()).
export function cssColorToHex(value: string): string | null {
  const v = value.trim().toLowerCase()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v)
  if (hex) {
    const h = hex[1]
    return h.length === 3 ? `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : `#${h}`
  }
  const m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(v)
  if (!m) return null
  if (m[4] !== undefined && Number(m[4]) === 0) return null
  const channels = [m[1], m[2], m[3]].map(Number)
  if (channels.some((c) => c > 255)) return null
  return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

// The seeds for a colour field (fix round 1).
// - `text` is what the text field starts with.
// - `swatch` is what the picker shows. It is null when there is no colour to
//   show, and the panel then draws a "none" state rather than a fake black.
// A translucent computed colour keeps its alpha as `rgba(...)`, which the server
// grammar accepts, so applying the field unchanged never makes it opaque.
// Alpha is rounded to the grammar's 4 decimals.
export function seedColorValue(css: string): { text: string; swatch: string | null } {
  const swatch = cssColorToHex(css)
  if (swatch === null) return { text: '', swatch: null }
  const m = /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([\d.]+)\s*\)$/.exec(css.trim().toLowerCase())
  if (m) {
    const a = Number(Number(m[4]).toFixed(4))
    if (a > 0 && a < 1) return { text: `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${String(a)})`, swatch }
  }
  return { text: swatch, swatch }
}
