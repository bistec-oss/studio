// Pure, node-safe helpers shared by the inline-edit route (sanitize + guard) and
// the InlineEditModal client (chrome-strip). Regex-based on purpose: no DOM
// parser is available server-side, and this is defense-in-depth — the renderer
// egress is already allowlisted and edited HTML is never served back as HTML.
//
// Two write modes share this module and the one revision writer
// (commitDraftRevision):
//   1. WHOLE-DOCUMENT (sanitizeInlineHtml / stripEditingChrome below): the
//      client sends the entire edited document; regex-sanitized, with the
//      documented limits. Unchanged by change 004.
//   2. ELEMENT (change 004 Phase 3, T22/T23 — the second half of this file): the
//      client names ONE element by structural locator and sends ONE closed-
//      grammar value. It is strictly NARROWER than mode 1 — it never widens the
//      surface above, it does not harden it either. Its invariants:
//        - text is written as a text node (escaped), never parsed as markup
//          (FR-15);
//        - colour and size are parsed into a closed grammar and RE-SERIALIZED;
//          anything else is rejected, never passed through; no free-form
//          declaration; nothing containing `url(` (FR-16);
//        - the write target is resolved server-side from the CURRENT stored
//          HTML (htmlLocator.ts), never from a client selector, and only that
//          element's content / style attribute bytes change (FR-17/18);
//        - the edit applies only to the revision the editor loaded (Ruling
//          W5-B as amended in fix round 1): the locator carries
//          baseRevisionNumber, the route refuses it when the draft's pointer
//          has moved (checkElementBaseRevision), and commitDraftRevision
//          re-checks it inside its transaction (expectedRevisionNumber — a
//          compare-and-swap), so neither a stale address nor a concurrent
//          commit can land an edit on the wrong document. The tag + text
//          fingerprint stays as defence in depth: on its own it cannot tell
//          identical siblings (or two empty same-tag elements) apart.
//      The renderer egress allowlist (src/lib/renderer/puppeteer.ts,
//      isAllowedRenderRequest — MinIO + Google Fonts only) already blocks
//      off-host fetches, so the `url(` refusal is NOT the SSRF control: it
//      guards CSS declaration break-out and is defence in depth.

import { z } from 'zod'
import {
  parseHtmlDocument,
  resolveElementPath,
  elementChildren,
  elementTextContent,
  normalizeFingerprintText,
  replaceElementText,
  setStyleDeclaration,
  escapeHtmlText,
  asciiLower,
  VOID_ELEMENTS,
  type HtmlElement,
  type StyleProperty,
} from './htmlLocator'

// Remove <script>…</script> elements and on*="…" event-handler attributes.
// Regex-based defense-in-depth with known limits (e.g. an unclosed <script>,
// or a handler attribute not preceded by whitespace, can slip past). The real
// safety net is structural: the iframe never sets allow-scripts, the renderer's
// egress is allowlisted (MinIO + Google Fonts only), and this HTML is never
// re-served to a browser as a live document — only rendered to a PNG.
export function sanitizeInlineHtml(html: string): string {
  return (
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
      .replace(/<script\b[^>]*\/>/gi, '')
      // on<event>="…" | on<event>='…' | on<event>=unquoted
      .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
      .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
      .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
  )
}

// Remove editor-injected chrome so the saved HTML is structurally a normal
// snapshot: contenteditable attrs, the injected style block, the banner, and
// the replace-photo wrappers (unwrapped to leave the <img> in place).
export function stripEditingChrome(html: string): string {
  return html
    // The (?=[\s=/>]) boundary keeps a longer attribute name (or plain text
    // that merely starts with these words) intact.
    .replace(/\scontenteditable(?=[\s=/>])(\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/gi, '')
    // A leftover from the editor's earlier paste-wiring guard (now a parent-side
    // WeakSet). Documents saved by that version carry it on <body>.
    .replace(/\sdata-inline-edit-paste-wired(?=[\s=/>])(\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/gi, '')
    .replace(/<style\b[^>]*id\s*=\s*["']inline-edit-style["'][^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(
      /<div\b[^>]*data-inline-edit-chrome\s*=\s*["']banner["'][^>]*>[\s\S]*?<\/div\s*>/gi,
      '',
    )
    .replace(/<button\b[^>]*data-inline-edit-chrome\s*=\s*["']img-btn["'][^>]*>[\s\S]*?<\/button\s*>/gi, '')
    .replace(
      /<span\b[^>]*data-inline-edit-chrome\s*=\s*["']img-wrap["'][^>]*>([\s\S]*?)<\/span\s*>/gi,
      '$1',
    )
}

export function inlineEditBlockReason(status: string, pendingAction: string | null): string | null {
  if (pendingAction !== null) return 'Another action is already running on this draft'
  if (status !== 'EXPORTED' && status !== 'PUBLISHED') {
    return 'Only exported drafts can be edited inline'
  }
  return null
}

// ═══ Element mode (change 004 Phase 3, T22) ═════════════════════════════════

// ── The closed grammar (FR-16, Ruling W5-C) ──────────────────────────────────
// Each parser either returns the value RE-SERIALIZED in one canonical form or
// null. The output is built from parsed numbers only — never a substring of the
// input — so nothing the user typed beyond those numbers can reach the CSS.

// Characters that can end a declaration or open a new construct. The anchored
// patterns below already exclude them; the explicit check documents the intent
// and survives any future loosening of a pattern.
const CSS_BREAKOUT = /[;{}\\"'<>]|url\(|\/\*/i

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
const RGB_COLOR =
  /^(rgba?)\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(0|1|0?\.\d{1,4}|1\.0{1,4})\s*)?\)$/i

// Colour: #rgb / #rrggbb → lowercase #rrggbb; rgb(r, g, b) / rgba(r, g, b, a)
// with integer 0–255 channels and alpha 0–1 → canonical `rgb(r, g, b)` /
// `rgba(r, g, b, a)`. No named colours, no other functions, no url(.
export function parseColor(input: string): string | null {
  const v = input.trim()
  if (!v || v.length > 64 || CSS_BREAKOUT.test(v)) return null
  const hex = HEX_COLOR.exec(v)
  if (hex) {
    const h = hex[1].toLowerCase()
    return h.length === 3 ? `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : `#${h}`
  }
  const m = RGB_COLOR.exec(v)
  if (!m) return null
  const fn = m[1].toLowerCase()
  const channels = [m[2], m[3], m[4]].map((c) => Number(c))
  if (channels.some((c) => !Number.isInteger(c) || c < 0 || c > 255)) return null
  const alpha = m[5]
  if (fn === 'rgb') return alpha === undefined ? `rgb(${channels.join(', ')})` : null
  if (alpha === undefined) return null
  const a = Number(alpha)
  if (!Number.isFinite(a) || a < 0 || a > 1) return null
  return `rgba(${channels.join(', ')}, ${String(a)})`
}

// Size: a plain decimal number + a unit from {px, pt, em, rem, %}, bounded to
// the equivalent of 1–1000 px at a 16px root (pt at 0.75pt/px; em/rem and %
// relative to 16px). Re-serialized as the shortest decimal + lowercase unit.
const SIZE = /^(\d{1,4}(?:\.\d{1,4})?|\.\d{1,4})(px|pt|em|rem|%)$/i
const SIZE_BOUNDS: Record<string, [number, number]> = {
  px: [1, 1000],
  pt: [0.75, 750],
  em: [0.0625, 62.5],
  rem: [0.0625, 62.5],
  '%': [6.25, 6250],
}

export function parseSize(input: string): string | null {
  const v = input.trim()
  if (!v || v.length > 64 || CSS_BREAKOUT.test(v)) return null
  const m = SIZE.exec(v)
  if (!m) return null
  const n = Number(m[1])
  const unit = m[2].toLowerCase()
  const [min, max] = SIZE_BOUNDS[unit]
  if (!Number.isFinite(n) || n < min || n > max) return null
  return `${String(n)}${unit}`
}

// Text (FR-15): written as a text node. Re-exported so the grammar's text half
// sits next to its colour/size halves; the locator owns the implementation
// because its writer applies it.
export { escapeHtmlText }

// C0 controls other than tab / LF / CR (NUL included), and DEL, are refused.
const TEXT_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/

// ── The request (Ruling W5-B, amended in fix round 1) ───────────────────────
// Selected on the route by `mode: 'element'`. z.object strips unknown keys, so
// a client-supplied `selector` / `target` (at any level) never survives
// parsing — the write target is always the element the SERVER resolves from
// `locator` against the current stored HTML (AC-26).
//
//   { mode: 'element',
//     locator: { path: number[], tag: string, text: string,
//                baseRevisionNumber: number | null },
//     edit: { kind: 'text' | 'color' | 'backgroundColor' | 'fontSize', value: string } }
//
// baseRevisionNumber (required) is the draft's currentRevisionNumber when the
// editor loaded the HTML `path` was computed against — null only for a legacy
// draft with no revision pointer. A successful edit answers with the new
// `revisionNumber`, which the client sends as the next edit's base.

export const ELEMENT_EDIT_KINDS = ['text', 'color', 'backgroundColor', 'fontSize'] as const
export type ElementEditKind = (typeof ELEMENT_EDIT_KINDS)[number]

export const MAX_ELEMENT_TEXT = 5_000
export const MAX_FINGERPRINT_TEXT = 100_000

export const elementEditRequestSchema = z.object({
  mode: z.literal('element'),
  locator: z.object({
    // Element-child indices from <body>, editor chrome excluded (see
    // editorElementPath). [] addresses <body> itself.
    path: z.array(z.number().int().min(0).max(100_000)).max(256),
    // The element's tag name (any case).
    tag: z.string().min(1).max(64),
    // The element's textContent when it was selected — the staleness
    // fingerprint. Compared whitespace-normalized (normalizeFingerprintText).
    text: z.string().max(MAX_FINGERPRINT_TEXT),
    // The revision the path was computed against (see above). Required —
    // nullable, not optional, so a client can't skip the check by omission.
    baseRevisionNumber: z.number().int().min(0).nullable(),
  }),
  edit: z.object({
    kind: z.enum(ELEMENT_EDIT_KINDS),
    value: z.string().max(MAX_ELEMENT_TEXT),
  }),
})
export type ElementEditRequest = z.infer<typeof elementEditRequestSchema>

// ── Error contract (T23 maps these to HTTP; T24 relies on the codes) ─────────
export type ElementEditErrorCode =
  | 'invalid-color' // 400 — colour outside the closed grammar
  | 'invalid-size' // 400 — size outside the closed grammar
  | 'invalid-text' // 400 — text holds a control character, or starts a <pre>/<listing> with a line break
  | 'element-not-text-leaf' // 400 — text edit on an element that has child elements
  | 'element-not-editable' // 400 — this element kind can't take this edit (script/style/void…)
  | 'element-stale' // 409 — the draft moved past baseRevisionNumber (route check or the
  //                            commit's CAS), a path miss, or a tag / text fingerprint mismatch
  | 'element-unsupported' // 409 — the stored HTML / element can't be edited reliably in element mode
  | 'draft-busy' // 409 — an action is running (the route's own guard, or claimed during the commit)

export type ElementEditResult =
  | { ok: true; html: string; instruction: string }
  | { ok: false; status: 400 | 409; code: ElementEditErrorCode; error: string }

const fail = (
  status: 400 | 409,
  code: ElementEditErrorCode,
  error: string,
): Extract<ElementEditResult, { ok: false }> => ({ ok: false, status, code, error })

const STALE_MESSAGE =
  'This element changed since it was selected. Reopen the editor and select it again.'
const UNSUPPORTED_MESSAGE =
  "This part of the design can't be edited element-by-element. Use the whole-document editor instead."

// The revision half of the staleness check (amended Ruling W5-B — review
// wave5-O Critical 1). The route runs it after the busy check and BEFORE
// applyElementEdit: an edit is only ever applied to the revision the editor
// loaded. This is what the fingerprint alone cannot guarantee — a refine that
// removes an element can leave a same-tag, same-text sibling (two empty
// <div>s, repeated "•" spans) at the old path, and the fingerprint matches it.
// null = the draft still points at the base; otherwise the 409 to answer.
// (commitDraftRevision's expectedRevisionNumber re-checks the same fact inside
// its transaction, for a commit that lands between this check and the write.)
export function checkElementBaseRevision(
  baseRevisionNumber: number | null,
  currentRevisionNumber: number | null,
): Extract<ElementEditResult, { ok: false }> | null {
  return baseRevisionNumber === currentRevisionNumber ? null : fail(409, 'element-stale', STALE_MESSAGE)
}

// The 409 for a commit-time refusal (commitDraftRevision's guarded final
// write missed — RevisionConflictError; fix round 2). `pendingAction` is the
// action that claimed the draft while this edit rendered, or null when the
// pointer moved instead. A claimed action reuses inlineEditBlockReason's
// message verbatim, so both busy paths read the same.
export function elementCommitConflict(pendingAction: string | null): Extract<ElementEditResult, { ok: false }> {
  if (pendingAction !== null) {
    return fail(409, 'draft-busy', inlineEditBlockReason('EXPORTED', pendingAction)!)
  }
  return fail(409, 'element-stale', STALE_MESSAGE)
}

// Text edits (the leaf rule): only an element with no child ELEMENTS, whose
// content is ordinary text. The whole content range [openEnd, closeStart) is
// replaced, so any comment children the leaf held are deleted with the old
// text — deliberately: a comment is invisible, never part of the fingerprint,
// and keeping it would mean splicing around it. Raw-text / RCDATA elements are
// refused — text written into <style> would be CSS, and into <script> would be
// code. Void elements have no content.
// Exported so the editor mirrors the rule from this one definition
// (src/components/drafts/inlineElementEdit.ts).
export const TEXT_FORBIDDEN: ReadonlySet<string> = new Set([
  'script', 'style', 'template', 'textarea', 'title', 'iframe', 'noembed', 'noframes', 'xmp',
])
// Style edits: any element except those that hold code/CSS or aren't rendered.
export const STYLE_FORBIDDEN: ReadonlySet<string> = new Set(['script', 'style', 'template', 'title'])

// The browser drops ONE line feed that immediately follows a <pre> / <listing>
// start tag (HTML "in body": "if the next token is a LF, ignore it"; CR and
// CRLF are LF by then). Text starting with a line break would therefore render
// without it while our own re-parse (the post-write check) kept it — a silent
// difference. Refused rather than modelled (review wave5-O Minor 5): modelling
// means an extra serializer-style leading LF on write AND dropping that LF in
// elementTextContent everywhere, a second tree-building rule to keep exact for
// a whitespace-only edge case. The fingerprint is unaffected either way — it
// is compared trimmed.
const LEADING_LF_DROPPED = new Set(['pre', 'listing'])

const STYLE_PROPERTY: Record<Exclude<ElementEditKind, 'text'>, StyleProperty> = {
  color: 'color',
  backgroundColor: 'background-color',
  fontSize: 'font-size',
}

function countElements(el: HtmlElement): number {
  return 1 + elementChildren(el).reduce((n, c) => n + countElements(c), 0)
}

function containsEditorChrome(el: HtmlElement): boolean {
  return (
    el.attrs.some((a) => asciiLower(a.name) === 'data-inline-edit-chrome') ||
    elementChildren(el).some(containsEditorChrome)
  )
}

// The pure core of an element edit: grammar → resolve against `html` (the
// CURRENT stored document) → fingerprint → eligibility → node-scoped write →
// post-write verification. Every failure is a refusal; nothing is passed
// through. On success the html differs from the input only inside the resolved
// element's content range (text) or its style attribute (colour/size). Note:
// the result is NOT run through sanitizeInlineHtml — that would rewrite bytes
// outside the element, and element mode adds nothing it could remove.
export function applyElementEdit(html: string, req: ElementEditRequest): ElementEditResult {
  const { locator, edit } = req

  // 1. Grammar first — a bad value is a 400 whatever the document holds.
  let styleValue: string | null = null
  if (edit.kind === 'text') {
    if (TEXT_CONTROL.test(edit.value)) {
      return fail(400, 'invalid-text', 'Text cannot contain control characters')
    }
  } else if (edit.kind === 'fontSize') {
    styleValue = parseSize(edit.value)
    if (!styleValue) {
      return fail(
        400,
        'invalid-size',
        'Size must be a number with a px, pt, em, rem or % unit (for example 24px)',
      )
    }
  } else {
    styleValue = parseColor(edit.value)
    if (!styleValue) {
      return fail(400, 'invalid-color', 'Colour must be a hex value (#rgb or #rrggbb) or rgb()/rgba()')
    }
  }

  // 2. Resolve server-side against the current HTML (FR-17/18).
  const parsed = parseHtmlDocument(html)
  if (!parsed.ok) return fail(409, 'element-unsupported', UNSUPPORTED_MESSAGE)
  // Stored HTML that still carries editor chrome (a whole-document save that
  // never stripped it): the client counts element paths with chrome skipped and
  // the server counts every element, so the two would disagree. Refuse.
  if (containsEditorChrome(parsed.body)) return fail(409, 'element-unsupported', UNSUPPORTED_MESSAGE)
  const el = resolveElementPath(parsed.body, locator.path)
  if (!el) return fail(409, 'element-stale', STALE_MESSAGE)

  // 3. Fingerprint: same tag, same normalized text — else the address is stale.
  // (Defence in depth since fix round 1: the route has already matched
  // locator.baseRevisionNumber against the draft — checkElementBaseRevision.)
  // The tag is ASCII-folded like the tokenizer's, never toLowerCase().
  if (el.tag !== asciiLower(locator.tag)) return fail(409, 'element-stale', STALE_MESSAGE)
  const current = elementTextContent(el)
  if (current === null) return fail(409, 'element-unsupported', UNSUPPORTED_MESSAGE)
  if (normalizeFingerprintText(current) !== normalizeFingerprintText(locator.text)) {
    return fail(409, 'element-stale', STALE_MESSAGE)
  }

  // 4. Eligibility, then 5. the node-scoped write.
  let next: string
  if (edit.kind === 'text') {
    if (el.closeStart === null || VOID_ELEMENTS.has(el.tag) || TEXT_FORBIDDEN.has(el.tag)) {
      return fail(400, 'element-not-editable', `The text of <${el.tag}> can't be edited`)
    }
    if (elementChildren(el).length > 0) {
      return fail(
        400,
        'element-not-text-leaf',
        'Only an element that holds text alone can have its text replaced. Select the innermost text, or use the whole-document editor.',
      )
    }
    if (el.ns === 'html' && LEADING_LF_DROPPED.has(el.tag) && /^[\n\r]/.test(edit.value)) {
      return fail(
        400,
        'invalid-text',
        `Text in <${el.tag}> can't start with a line break (the browser would drop it). Remove the leading line break.`,
      )
    }
    next = replaceElementText(html, el, edit.value)
  } else {
    if (STYLE_FORBIDDEN.has(el.tag)) {
      return fail(400, 'element-not-editable', `The style of <${el.tag}> can't be edited`)
    }
    const written = setStyleDeclaration(html, el, STYLE_PROPERTY[edit.kind], styleValue!)
    if (!written.ok) return fail(409, 'element-unsupported', UNSUPPORTED_MESSAGE)
    next = written.html
  }

  // 6. Verify before anything can be committed (fail closed): every byte
  // outside the element is identical, the document still parses to the same
  // number of elements, and the same path still lands on the same tag — with
  // exactly the new text, for a text edit.
  const suffix = html.length - el.end
  if (
    next.slice(0, el.start) !== html.slice(0, el.start) ||
    next.slice(next.length - suffix) !== html.slice(el.end)
  ) {
    return fail(409, 'element-unsupported', UNSUPPORTED_MESSAGE)
  }
  const reparsed = parseHtmlDocument(next)
  if (!reparsed.ok || countElements(reparsed.body) !== countElements(parsed.body)) {
    return fail(409, 'element-unsupported', UNSUPPORTED_MESSAGE)
  }
  const after = resolveElementPath(reparsed.body, locator.path)
  if (!after || after.tag !== el.tag) return fail(409, 'element-unsupported', UNSUPPORTED_MESSAGE)
  if (edit.kind === 'text' && elementTextContent(after) !== edit.value) {
    return fail(409, 'element-unsupported', UNSUPPORTED_MESSAGE)
  }

  return { ok: true, html: next, instruction: `Element edit: ${edit.kind}` }
}

// ── Client-side contract helpers (for the editor iframe — T24) ───────────────
// The editor's DOM is the browser's parse of the stored HTML plus the chrome
// InlineEditModal injects (marked data-inline-edit-chrome). These helpers
// define the locator the SERVER expects, so the client and applyElementEdit
// can't drift: chrome is invisible to both the path and the fingerprint.
// Structural types, so a real DOM Element satisfies them and unit tests can
// use plain objects.

export interface EditorDomNode {
  nodeType: number
  textContent: string | null
  childNodes: ArrayLike<EditorDomNode>
  getAttribute?(name: string): string | null
}

export interface EditorDomElement extends EditorDomNode {
  tagName: string
  parentElement: EditorDomElement | null
  children: ArrayLike<EditorDomElement>
  getAttribute(name: string): string | null
}

const CHROME_ATTR = 'data-inline-edit-chrome'
const IMG_WRAP = 'img-wrap'

// Element children as the stored HTML has them: an img-wrap is replaced by its
// own non-chrome children, every other chrome element is skipped.
function logicalChildren(el: EditorDomElement): EditorDomElement[] {
  const out: EditorDomElement[] = []
  for (let i = 0; i < el.children.length; i++) {
    const c = el.children[i]
    const chrome = c.getAttribute(CHROME_ATTR)
    if (chrome === IMG_WRAP) out.push(...logicalChildren(c))
    else if (chrome === null) out.push(c)
  }
  return out
}

// The locator path for `el` relative to `body`; null for chrome itself or a
// node outside `body`.
export function editorElementPath(el: EditorDomElement, body: EditorDomElement): number[] | null {
  if (el !== body && el.getAttribute(CHROME_ATTR) !== null) return null
  const path: number[] = []
  let cur = el
  while (cur !== body) {
    let parent = cur.parentElement
    while (parent && parent !== body && parent.getAttribute(CHROME_ATTR) === IMG_WRAP) {
      parent = parent.parentElement
    }
    if (!parent) return null
    const idx = logicalChildren(parent).indexOf(cur)
    if (idx === -1) return null
    path.unshift(idx)
    cur = parent
  }
  return path
}

// The fingerprint text for `node`: its textContent with chrome subtrees (the
// "Replace photo" button, the banner) left out. Read it BEFORE the user edits
// the element — it must describe the stored HTML, not the edited DOM.
export function editorFingerprintText(node: EditorDomNode): string {
  if (node.nodeType === 3) return node.textContent ?? ''
  if (node.nodeType !== 1) return ''
  const chrome = node.getAttribute?.(CHROME_ATTR) ?? null
  if (chrome !== null && chrome !== IMG_WRAP) return ''
  let out = ''
  for (let i = 0; i < node.childNodes.length; i++) out += editorFingerprintText(node.childNodes[i])
  return out
}
