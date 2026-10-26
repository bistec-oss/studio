// 025 FR-12 (amended by A1): code, not the model, puts the screenshot into the
// design. `insertComposite` writes one canonical element at the given rect (the
// screen the detector found, in canvas percent) and `stripComposite` removes
// it. The stored HTML carries only the token. Pure and string-level.
import type { Rect, SizeContract } from '@/lib/designData/composition'
import type { CompositionStamp } from '@/lib/designData/stamp'
import { COMPOSITE_TOKEN, type CompositeRectPx } from './render'

export { COMPOSITE_TOKEN }

const round1 = (v: number) => Math.round(v * 10) / 10

// A canvas-percent rect in canvas px, rounded to 0.1 px.
export function compositeRectPx(rect: Rect, canvas: { width: number; height: number }): CompositeRectPx {
  return {
    left: round1((rect.x * canvas.width) / 100),
    top: round1((rect.y * canvas.height) / 100),
    width: round1((rect.w * canvas.width) / 100),
    height: round1((rect.h * canvas.height) / 100),
  }
}

// The one canonical element. The pure check and the tests compare against
// exactly this string.
export function compositeElement(r: CompositeRectPx): string {
  return (
    `<div data-composite="0" style="position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;` +
    `z-index:2147483647;background:#0b0b0b;overflow:hidden;margin:0;padding:0;border:0">` +
    `<img data-composite-img="0" src="${COMPOSITE_TOKEN}" alt="" style="display:block;width:100%;height:100%;object-fit:contain">` +
    `</div>`
  )
}

// `data-composite` as an attribute name, never `data-composite-img` or a longer name.
const ATTR = /(?<![\w-])data-composite(?![\w-])/
const OPEN_TAG = /<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g
const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
])

// The index just past the close tag that matches the open tag ending at `from`
// (nesting-aware for the same tag name); the end of the text when never closed.
function endOfElement(html: string, name: string, from: number): number {
  const re = new RegExp(`<(/?)${name}(?![\\w-])(?:[^>"']|"[^"]*"|'[^']*')*>`, 'gi')
  re.lastIndex = from
  let depth = 1
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[0].endsWith('/>') && m[1] === '') continue
    depth += m[1] === '/' ? -1 : 1
    if (depth === 0) return m.index + m[0].length
  }
  return html.length
}

// Removes every element that carries a data-composite attribute: the canonical
// one and any a model wrote.
export function stripComposite(html: string): string {
  let out = html
  for (;;) {
    OPEN_TAG.lastIndex = 0
    let start = -1
    let end = -1
    for (let m = OPEN_TAG.exec(out); m; m = OPEN_TAG.exec(out)) {
      if (!ATTR.test(m[2])) continue
      start = m.index
      const name = m[1].toLowerCase()
      end =
        VOID.has(name) || m[0].endsWith('/>')
          ? m.index + m[0].length
          : endOfElement(out, name, m.index + m[0].length)
      break
    }
    if (start === -1) return out
    out = out.slice(0, start) + out.slice(end)
  }
}

// Idempotent: strips first, then writes the one canonical element as the last
// child of <body> (appended when there is no </body>).
export function insertComposite(html: string, rect: Rect, canvas: { width: number; height: number }): string {
  const clean = stripComposite(html)
  const el = compositeElement(compositeRectPx(rect, canvas))
  const at = clean.search(/<\/body\s*>(?![\s\S]*<\/body\s*>)/i)
  return at === -1 ? clean + el : clean.slice(0, at) + el + clean.slice(at)
}

const countOf = (html: string, needle: string) => html.split(needle).length - 1

// Empty when the HTML holds exactly one data-composite element, the canonical
// one at this rect, and exactly one token. The renderer runs it before every
// render of a composite draft, and the mock renderer relies on it alone.
export function compositeHtmlProblems(html: string, rectPx: CompositeRectPx): string[] {
  const problems: string[] = []
  const attrs = html.match(new RegExp(ATTR.source, 'g'))?.length ?? 0
  if (attrs !== 1) problems.push(`expected one data-composite element, found ${attrs}`)
  if (countOf(html, compositeElement(rectPx)) !== 1) problems.push('the canonical composite element is not at the rect')
  const tokens = countOf(html, COMPOSITE_TOKEN)
  if (tokens !== 1) problems.push(`expected one ${COMPOSITE_TOKEN} token, found ${tokens}`)
  return problems
}

// The contract's size with its composite region moved to the screen the check
// found (A1), so a prompt names the rect the screenshot fills.
export function withDetectedScreen(size: SizeContract, rect: Rect): SizeContract {
  return { ...size, regions: size.regions.map((r) => (r.purpose === 'composite' ? { ...r, rect } : r)) }
}

// NFR-05: a stored document never holds a URL to a screenshot, only the token.
// Matches the app's preview route and any http(s) URL with a screenshots/ path.
const SCREENSHOT_URL_RE = /\/api\/briefs\/screenshots|https?:\/\/[^\s"'<>]*\/screenshots\//i

export function hasScreenshotUrl(html: string): boolean {
  return SCREENSHOT_URL_RE.test(html)
}

// The document a writer stores for a draft with this stamp (FR-16): the one
// canonical composite element at the stamped rect for a composite stamp, no
// composite element at all otherwise. Idempotent; nothing re-detects. Throws
// when the result would carry a screenshot URL (a writer bug, never user input
// that can be silently dropped).
export function canonicalCompositeHtml(
  html: string,
  stamp: CompositionStamp | null | undefined,
  canvas: { width: number; height: number },
): string {
  const rect = stamp?.composites?.[0]?.rect
  const out = rect ? insertComposite(html, rect, canvas) : stripComposite(html)
  if (hasScreenshotUrl(out)) throw new Error('refusing to store a document that holds a screenshot URL (NFR-05)')
  return out
}
