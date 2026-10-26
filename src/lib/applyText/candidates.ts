// Finds the elements whose text is a given headline, from source positions
// alone (parse5 has no layout; the render is the only judge of visibility).
// Pure; imports parse5, so it is server-side only.
import { parse } from 'parse5'
import type { DefaultTreeAdapterMap } from 'parse5'
import { normaliseHeadline } from '../renderedText/normalise'
import type { ApplyFailure } from './vocab'

type Node = DefaultTreeAdapterMap['node']
type Element = DefaultTreeAdapterMap['element']

export interface TextCandidate {
  tagName: string
  start: number
  startTagEnd: number
  endTagStart: number
  end: number
  hasChildElements: boolean
  descendantCount: number
}

const SKIPPED = new Set(['head', 'title', 'script', 'style', 'template', 'noscript', 'svg'])

function isElement(n: Node): n is Element {
  return 'tagName' in n && Array.isArray((n as Element).childNodes)
}

function textOf(el: Element): string {
  let out = ''
  for (const c of el.childNodes) {
    if (c.nodeName === '#text') out += (c as DefaultTreeAdapterMap['textNode']).value
    else if (isElement(c)) {
      if (SKIPPED.has(c.tagName)) continue
      out += c.tagName === 'br' ? ' ' : textOf(c)
    }
  }
  return out
}

function countDescendants(el: Element): number {
  let n = 0
  for (const c of el.childNodes) {
    if (isElement(c)) n += 1 + countDescendants(c)
  }
  return n
}

function bodyOf(doc: Node): Element | null {
  const stack: Node[] = [doc]
  while (stack.length) {
    const n = stack.pop()!
    if (isElement(n) && n.tagName === 'body') return n
    if ('childNodes' in n) stack.push(...(n as unknown as { childNodes: Node[] }).childNodes)
  }
  return null
}

export function findTextCandidates(html: string, text: string): TextCandidate[] {
  const want = normaliseHeadline(text)
  if (!want) return []
  const doc = parse(html, { sourceCodeLocationInfo: true })
  const body = bodyOf(doc as unknown as Node)
  if (!body) return []
  const out: TextCandidate[] = []

  // Returns true when this subtree holds a match (so the parent is not innermost).
  const visit = (el: Element): boolean => {
    if (SKIPPED.has(el.tagName)) return false
    let childMatched = false
    for (const c of el.childNodes) {
      if (isElement(c) && visit(c)) childMatched = true
    }
    if (childMatched) return true
    if (normaliseHeadline(textOf(el)) !== want) return false
    const loc = el.sourceCodeLocation
    // An element with no end tag (an implied close) has no safe range.
    if (loc?.startTag && loc.endTag) {
      out.push({
        tagName: el.tagName,
        start: loc.startOffset,
        startTagEnd: loc.startTag.endOffset,
        endTagStart: loc.endTag.startOffset,
        end: loc.endOffset,
        hasChildElements: el.childNodes.some(isElement),
        descendantCount: countDescendants(el),
      })
    }
    return true
  }
  for (const c of body.childNodes) if (isElement(c)) visit(c)
  return out
}

const RESERVED_RANGE = ['<img', '<svg', 'data-composite', '__COMPOSITE_', '__INLINE_ASSET_']
const RESERVED_TEXT = ['__COMPOSITE_', '__INLINE_ASSET_']

// FR-38 in order, except `not-stale`: the route checks the 030 state, because
// only it knows the stamp.
export function precheckApply(
  html: string,
  oldText: string,
  newText: string,
): { ok: true; candidate: TextCandidate } | { ok: false; failure: ApplyFailure } {
  const found = findTextCandidates(html, oldText)
  if (found.length === 0) return { ok: false, failure: 'not-found' }
  if (found.length > 1) return { ok: false, failure: 'ambiguous' }
  const candidate = found[0]
  const range = html.slice(candidate.start, candidate.end)
  // Case-insensitive: `<IMG` and `<SVG` are the same elements (031 T13 review).
  const lowerRange = range.toLowerCase()
  if (RESERVED_RANGE.some((m) => lowerRange.includes(m.toLowerCase()))) return { ok: false, failure: 'unsafe-element' }
  if (RESERVED_TEXT.some((m) => newText.includes(m))) return { ok: false, failure: 'unsafe-text' }
  if (findTextCandidates(html, newText).length > 0) return { ok: false, failure: 'new-text-present' }
  return { ok: true, candidate }
}
