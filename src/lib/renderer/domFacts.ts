// DomFacts extractor for refine verification (change 004 Phase 2, T14).
//
// Produces the DomFacts contract defined in src/lib/agent/instructionClasses.ts
// by evaluating the RENDERED document in Chromium — computed styles, laid-out
// boxes, innerText (which honours display/visibility/text-transform) — never by
// reading the HTML source. It goes through the production renderer
// (puppeteer.ts evaluateInRenderedPage): the same browser singleton, the same
// concurrency cap, the same egress allowlist and the same settle condition as
// the PNG export, so the facts describe the layout the user is shown.
//
// ── Image identifiers: the model's vocabulary ────────────────────────────────
// The refine model sees inline `data:` assets as __INLINE_ASSET_n__ tokens
// (inlineAssets.ts) and names them that way in `supersedes`. So the extractor
// takes the MODEL-FACING HTML (tokens intact) plus the token→data-URI map, and
// restores each token as `<data URI>#<token>` before rendering. A fragment is
// stripped from a data: URL before it is decoded (URL/fetch spec), so the image
// still loads and lays out exactly as in the export; but img.currentSrc and the
// computed background-image keep the fragment, so each source maps back to the
// exact token the model saw — even when two tokens carry identical bytes, which
// a value→token reverse lookup could not tell apart. A data URI the model wrote
// itself, or a token absent from the map, is reported verbatim.
//
// ── What counts ──────────────────────────────────────────────────────────────
// Elements: <html> (only when it carries an image), <body>, and every body
// descendant not inside a display:none subtree. elementCount counts the body
// descendants only. An element is listed when it has visible text or an image
// source. Image sources per element: <img> currentSrc (else its src attribute —
// a blocked or broken image is still reported by URL), SVG <image> href, url()s
// in the computed background-image, and the background-image / content url()s
// of its rendered ::before/::after. Not read: mask-image, border-image,
// list-style-image, <video poster>. Text: innerText (SVG: textContent). Opacity
// 0 and off-canvas content still count as present.
//
// Style facts (`style`) go beyond the T12 contract, for the add verifier only:
// the table routes colour / weight / style / spacing clauses to `add`, and the
// model verifier needs the computed values to judge them (T14 ruling 4). The
// structural post-conditions ignore them.
//
// ── MOCK_PUPPETEER ───────────────────────────────────────────────────────────
// No Chromium: staticDomFacts() parses the HTML string instead. Deterministic,
// and good enough that replace-by-URL and remove-by-phrase still behave in the
// mock E2E suite. It returns: text = body with <script>/<style>/comments
// dropped, tags removed, entities decoded, whitespace collapsed; imageSources =
// every src="…" and url(…) in the document in source order (tokens stay tokens
// — the input is model-facing), minus @import and @font-face; elementCount =
// opening tags in the body; elements = one synthetic `body` element carrying all
// of that, with fontSizePx/box/style null. So `#id`/`.class` fragments and
// constrain targets never resolve under the mock (they miss — fail closed);
// T20 adds a verification seam for deterministic outcomes.

import type { Page } from 'puppeteer-core'
import { decodeHtmlEntities, type DomElementFact, type DomFacts } from '@/lib/agent/instructionClasses'
import { evaluateInRenderedPage } from '@/lib/renderer/puppeteer'
import { MOCK_PUPPETEER } from '@/lib/testHooks'

export interface ElementStyleFacts {
  color: string
  backgroundColor: string
  fontFamily: string
  fontWeight: string
  fontStyle: string
  letterSpacing: string
}

export interface StyledDomElementFact extends DomElementFact {
  style: ElementStyleFacts | null // null under the MOCK_PUPPETEER fallback
}

export interface StyledDomFacts extends DomFacts {
  elements: StyledDomElementFact[]
}

export interface ExtractDomFactsOptions {
  width?: number // viewport = the post canvas; default 1080×1080
  height?: number
  // token → data URI, as returned by extractInlineAssets for the document the
  // model was shown. Omit when the HTML carries no tokens.
  inlineAssets?: Record<string, string>
}

const TOKEN_SHAPE = /__INLINE_ASSET_\d+__/g

// Restore each known token as `<data URI>#<token>`. One regex pass over
// token-shaped strings, so __INLINE_ASSET_1__ can never match inside
// __INLINE_ASSET_10__ and a restored URI is never rescanned.
export function tagInlineAssets(html: string, assets: Record<string, string> | undefined): string {
  if (!assets || Object.keys(assets).length === 0) return html
  return html.replace(TOKEN_SHAPE, (token) => (token in assets ? `${assets[token]}#${token}` : token))
}

// The name the model knew a rendered source by.
export function modelFacingSource(source: string, assets: Record<string, string> | undefined): string {
  if (!assets) return source
  const at = source.lastIndexOf('#__INLINE_ASSET_')
  if (at === -1) return source
  const token = source.slice(at + 1)
  return token in assets ? token : source
}

export async function extractDomFacts(html: string, opts: ExtractDomFactsOptions = {}): Promise<StyledDomFacts> {
  if (MOCK_PUPPETEER) return staticDomFacts(html)
  const { width = 1080, height = 1080, inlineAssets } = opts
  const raw = await evaluateInRenderedPage(tagInlineAssets(html, inlineAssets), width, height, collectFacts)
  const name = (s: string) => modelFacingSource(s, inlineAssets)
  return {
    ...raw,
    imageSources: raw.imageSources.map(name),
    elements: raw.elements.map((e) => ({ ...e, imageSources: e.imageSources.map(name) })),
  }
}

// Runs inside the page. page.evaluate serializes the function body, so it must
// be self-contained: no imports, no outer-scope references, arrow consts only.
function collectFacts(page: Page): Promise<StyledDomFacts> {
  return page.evaluate(() => {
    const collapse = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
    const urls = (value: string): string[] => {
      const out: string[] = []
      if (!value || value === 'none') return out
      const re = /url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)"']*?))\s*\)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(value))) {
        const u = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\\(.)/g, '$1')
        if (u) out.push(u)
      }
      return out
    }

    const root = document.documentElement
    const body = document.body
    const list: Element[] = body ? [root, body, ...Array.from(body.querySelectorAll('*'))] : [root]
    const hidden = new Set<Element>()
    const elements: Array<{
      tag: string
      id: string | null
      classes: string[]
      text: string
      imageSources: string[]
      fontSizePx: number | null
      box: { width: number; height: number } | null
      style: {
        color: string
        backgroundColor: string
        fontFamily: string
        fontWeight: string
        fontStyle: string
        letterSpacing: string
      }
    }> = []
    const allSources: string[] = []
    let elementCount = 0

    for (const el of list) {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || (el.parentElement !== null && hidden.has(el.parentElement))) {
        hidden.add(el)
        continue
      }
      if (el !== root && el !== body) elementCount++

      const tag = el.tagName.toLowerCase()
      const sources: string[] = []
      if (tag === 'img') {
        const img = el as HTMLImageElement
        const src = img.currentSrc || img.getAttribute('src') || ''
        if (src) sources.push(src)
      } else if (tag === 'image') {
        const href = el.getAttribute('href') ?? el.getAttribute('xlink:href')
        if (href) sources.push(href)
      }
      sources.push(...urls(cs.backgroundImage))
      for (const pseudo of ['::before', '::after']) {
        const ps = getComputedStyle(el, pseudo)
        if (ps.content && ps.content !== 'none' && ps.content !== 'normal') {
          sources.push(...urls(ps.backgroundImage), ...urls(ps.content))
        }
      }
      allSources.push(...sources)

      const text = collapse(el instanceof HTMLElement ? el.innerText : el.textContent)
      if (el === root ? sources.length === 0 : !text && sources.length === 0) continue

      const hasBox = el.getClientRects().length > 0
      const rect = el.getBoundingClientRect()
      const fontSize = parseFloat(cs.fontSize)
      elements.push({
        tag,
        id: el.id || null,
        classes: Array.from(el.classList),
        text,
        imageSources: sources,
        fontSizePx: Number.isFinite(fontSize) ? Math.round(fontSize) : null,
        box: hasBox ? { width: Math.round(rect.width), height: Math.round(rect.height) } : null,
        style: {
          color: cs.color,
          backgroundColor: cs.backgroundColor,
          fontFamily: cs.fontFamily,
          fontWeight: cs.fontWeight,
          fontStyle: cs.fontStyle,
          letterSpacing: cs.letterSpacing,
        },
      })
    }

    return { text: collapse(body ? body.innerText : ''), imageSources: allSources, elementCount, elements }
  })
}

// ── MOCK_PUPPETEER fallback (see the module header) ──────────────────────────

export function staticDomFacts(html: string): StyledDomFacts {
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/@import[^;]*;?/gi, ' ')
    .replace(/@font-face\s*\{[^}]*\}/gi, ' ')
  const bodyMatch = /<body\b[^>]*>([\s\S]*?)(?:<\/body>|$)/i.exec(cleaned)
  const body = (bodyMatch ? bodyMatch[1] : cleaned).replace(/<style\b[\s\S]*?<\/style>/gi, ' ')

  const text = decodeHtmlEntities(body.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
  const elementCount = (body.match(/<[a-zA-Z][^>]*>/g) ?? []).length

  const imageSources: string[] = []
  const re = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')|url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'\s]*))\s*\)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(cleaned))) {
    const src = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? '').trim()
    if (src) imageSources.push(src)
  }

  const elements: StyledDomElementFact[] =
    text || imageSources.length
      ? [{ tag: 'body', id: null, classes: [], text, imageSources: [...imageSources], fontSizePx: null, box: null, style: null }]
      : []
  return { text, imageSources, elementCount, elements }
}
